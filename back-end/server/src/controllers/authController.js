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
    
    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error_description)}`);
    }
    
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=No authorization code`);
    }
    
    // 1. Обмен кода на токены
    const tokens = await exchangeCodeForTokens(code);
    
    // 2. Получение профиля пользователя
    const profile = await fetchYandexProfile(tokens.accessToken);
    
    // 3. Сохранение пользователя в БД
    const user = await saveUserToDb(profile, tokens);
    
    // 4. Генерация JWT сессии для нашего приложения
    const sessionToken = generateSessionToken(user.id, user.yandex_id);
    
    // 5. Редирект на фронтенд с токеном
    // (в продакшене лучше использовать httpOnly cookie)
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${sessionToken}&user=${encodeURIComponent(JSON.stringify(user))}`);
    
  } catch (error) {
    console.error('Auth callback error:', error.message);
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
