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
  try {
    const { code, error, error_description } = req.query;

    console.log('OAuth callback received:', { code: code ? 'present' : 'missing', error, error_description });

    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=No authorization code`);
    }

    // 1. Обмен кода на токены
    console.log('Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    console.log('Tokens received:', { 
      accessToken: tokens.accessToken ? 'present' : 'missing',
      refreshToken: tokens.refreshToken ? 'present' : 'missing',
      expiresIn: tokens.expiresIn 
    });

    // 2. Получение профиля пользователя
    console.log('Fetching Yandex profile...');
    const profile = await fetchYandexProfile(tokens.accessToken);
    console.log('Profile received:', profile);

    // 3. Сохранение пользователя в БД
    console.log('Saving user to database...');
    const user = await saveUserToDb(profile, tokens);
    console.log('User saved:', user);

    // 4. Генерация JWT сессии для нашего приложения
    const sessionToken = generateSessionToken(user.id, user.yandex_id);
    console.log('Session token generated');

    // 5. Редирект на фронтенд с токеном
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${sessionToken}&user=${encodeURIComponent(JSON.stringify(user))}`);

  } catch (error) {
    console.error('Auth callback error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error.message)}`);
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
