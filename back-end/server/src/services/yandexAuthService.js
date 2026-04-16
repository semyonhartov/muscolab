import axios from 'axios';
import pool from '../config/database.js';

const YANDEX_AUTH_BASE = 'https://oauth.yandex.ru';
const YANDEX_LOGIN_BASE = 'https://login.yandex.ru';
const YANDEX_API_BASE = 'https://api.music.yandex.net';

/**
 * Получение ссылки для авторизацию
 */
export const getAuthUrl = () => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.YANDEX_CLIENT_ID,
    redirect_uri: process.env.YANDEX_REDIRECT_URI,
    scope: 'login:info login:avatar login:email',
  });
  return `${YANDEX_AUTH_BASE}/authorize?${params}`;
};

/**
 * Обмен кода на токены
 */
export const exchangeCodeForTokens = async (code) => {
  const response = await axios.post(`${YANDEX_AUTH_BASE}/token`, {
    grant_type: 'authorization_code',
    code,
    client_id: process.env.YANDEX_CLIENT_ID,
    client_secret: process.env.YANDEX_CLIENT_SECRET,
    redirect_uri: process.env.YANDEX_REDIRECT_URI,
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
    tokenType: response.data.token_type,
  };
};

/**
 * Обновление access токена
 */
export const refreshAccessToken = async (refreshToken) => {
  const response = await axios.post(`${YANDEX_AUTH_BASE}/token`, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.YANDEX_CLIENT_ID,
    client_secret: process.env.YANDEX_CLIENT_SECRET,
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in,
  };
};

/**
 * Получение профиля пользователя Яндекс
 * Использует login.yandex.ru/info для получения данных пользователя
 */
export const fetchYandexProfile = async (accessToken) => {
  try {
    const response = await axios.get(`${YANDEX_LOGIN_BASE}/info`, {
      headers: { Authorization: `OAuth ${accessToken}` },
      params: { format: 'json' }
    });
    
    if (!response.data || !response.data.id) {
      throw new Error('Invalid profile data received from Yandex');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch Yandex profile:', error.response?.data || error.message);
    throw new Error('Failed to fetch user profile from Yandex');
  }
};

/**
 * Сохранение/обновление пользователя в БД
 */
export const saveUserToDb = async (yandexProfile, tokens) => {
  const { id: yandex_id, login: nickname, default_avatar_id, is_avatar_empty } = yandexProfile;
  const { accessToken, refreshToken, expiresIn } = tokens;

  if (!yandex_id) {
    throw new Error('Yandex user ID is missing from profile data');
  }

  // Формирование URL аватара из default_avatar_id
  // Формат: https://avatars.yandex.net/get-yapic/{default_avatar_id}/islands-200
  let avatarUrl = null;
  if (default_avatar_id && is_avatar_empty === false) {
    avatarUrl = `https://avatars.yandex.net/get-yapic/${default_avatar_id}/islands-200`;
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const query = `
    INSERT INTO users (yandex_id, nickname, avatar_url, access_token, refresh_token, token_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (yandex_id)
    DO UPDATE SET
      nickname = EXCLUDED.nickname,
      avatar_url = EXCLUDED.avatar_url,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, yandex_id, nickname, avatar_url
  `;

  const values = [yandex_id, nickname || `user_${yandex_id}`, avatarUrl, accessToken, refreshToken, expiresAt];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Database error in saveUserToDb:', error.message);
    throw new Error('Failed to save user to database');
  }
};

/**
 * Получение пользователя из БД по ID
 */
export const getUserById = async (userId) => {
  const query = 'SELECT id, yandex_id, nickname, avatar_url FROM users WHERE id = $1';
  const result = await pool.query(query, [userId]);
  return result.rows[0];
};

/**
 * Получение и проверка токена пользователя
 */
export const getUserValidToken = async (userId) => {
  const query = `
    SELECT access_token, refresh_token, token_expires_at 
    FROM users WHERE id = $1
  `;
  const result = await pool.query(query, [userId]);
  const user = result.rows[0];
  
  if (!user) return null;
  
  // Если токен истекает через менее 5 минут — обновляем
  const needsRefresh = new Date(user.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000);
  
  if (needsRefresh && user.refresh_token) {
    try {
      const { accessToken, expiresIn } = await refreshAccessToken(user.refresh_token);
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
      
      // Обновляем в БД
      await pool.query(
        'UPDATE users SET access_token = $1, token_expires_at = $2 WHERE id = $3',
        [accessToken, newExpiresAt, userId]
      );
      
      return accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error.message);
      return null;
    }
  }
  
  return user.access_token;
};
