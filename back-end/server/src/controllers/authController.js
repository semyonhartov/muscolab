import { 
  getAuthUrl, 
  exchangeCodeForTokens, 
  fetchYandexProfile, 
  saveUserToDb,
  getUserById
} from '../services/yandexAuthService.js';
import { generateSessionToken } from '../middleware/auth.js';

/**
 * Редирект на Яндекс авторизацию
 */
export const redirectToYandexAuth = (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
};

/**
 * Обработка колбэка от Яндекса
 */
export const handleYandexCallback = async (req, res) => {
  console.log('📥 Auth callback received:', req.query.code ? 'code present' : 'no code', req.query.error ? `error: ${req.query.error}` : '');
  
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error('❌ OAuth error:', error, error_description);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      console.error('❌ No authorization code in callback');
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=No authorization code`);
    }

    // 1. Обмен кода на токены
    let tokens;
    try {
      console.log('🔄 Exchanging code for tokens...');
      tokens = await exchangeCodeForTokens(code);
      console.log('✅ Tokens received successfully');
    } catch (tokenError) {
      console.error('❌ Token exchange error:', tokenError.response?.data || tokenError.message);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=Failed to exchange authorization code`);
    }

    // 2. Получение профиля пользователя
    let profile;
    try {
      console.log('🔄 Fetching Yandex profile...');
      profile = await fetchYandexProfile(tokens.accessToken);
      console.log('✅ Profile received:', { id: profile.id, login: profile.login });
    } catch (profileError) {
      console.error('❌ Profile fetch error:', profileError.message);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=Failed to fetch user profile`);
    }

    // 3. Сохранение пользователя в БД
    console.log('💾 Saving user to database...');
    const user = await saveUserToDb(profile, tokens);
    console.log('✅ User saved:', { id: user.id, yandex_id: user.yandex_id, nickname: user.nickname });

    // 4. Генерация JWT сессии для нашего приложения
    const sessionToken = generateSessionToken(user.id, user.yandex_id);
    console.log('🔑 Session token generated');

    // 5. Редирект на фронтенд с токеном
    // Используем /callback вместо /auth/callback чтобы не конфликтовать с роутом бэкенда
    console.log('↩️ Redirecting to frontend...');
    res.redirect(`${process.env.FRONTEND_URL}/callback?token=${sessionToken}&user=${encodeURIComponent(JSON.stringify(user))}`);

  } catch (error) {
    console.error('❌ Auth callback error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=Authentication failed`);
  }
};

/**
 * Получение данных текущего пользователя
 */
export const getCurrentUser = async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Выход из системы
 */
export const logout = (req, res) => {
  // При использовании JWT на клиенте — просто удаляем токен на фронтенде
  // Здесь можно добавить логику инвалидации, если используется blacklist
  res.json({ message: 'Logged out successfully' });
};
