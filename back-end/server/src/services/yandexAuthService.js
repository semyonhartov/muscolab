import axios from 'axios';
import pool from '../config/database.js';

const YANDEX_AUTH_BASE = 'https://oauth.yandex.ru';
const YANDEX_API_BASE = 'https://api.music.yandex.net';
const YANDEX_ID_API_BASE = 'https://login.yandex.ru/info';

/**
 * Получение ссылки для авторизации
 * Доступные scope: login:info, login:avatar, login:email
 * Примечание: playlist:read/write недоступны в публичном OAuth (2026)
 */
export const getAuthUrl = () => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.YANDEX_CLIENT_ID,
    redirect_uri: process.env.YANDEX_REDIRECT_URI,
    scope: 'login:info login:avatar',
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
 * Используем Яндекс ID API (Passport) для получения данных профиля
 * Документация: https://yandex.ru/dev/id/doc/ru/user-information
 */
export const fetchYandexProfile = async (accessToken) => {
  try {
    // Запрашиваем расширенную информацию о пользователе
    const response = await axios.get(`${YANDEX_ID_API_BASE}?format=json`, {
      headers: { Authorization: `OAuth ${accessToken}` }
    });
    
    console.log('Yandex ID API response:', JSON.stringify(response.data, null, 2));
    
    if (!response.data || !response.data.id) {
      throw new Error('Invalid response from Yandex ID API: id is missing');
    }
    
    const profile = response.data;
    
    // Формируем URL аватара
    let avatarUrl = null;
    if (profile.default_avatar_id) {
      avatarUrl = `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`;
    }
    
    // Форматируем данные профиля
    return {
      id: String(profile.id),
      login: profile.login || `user_${profile.id}`,
      avatar: avatarUrl,
      name: profile.display_name || profile.real_name || null,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
      email: profile.default_email || null,
    };
  } catch (error) {
    console.error('Fetch Yandex profile error:', error.message);
    if (error.response) {
      console.error('Yandex ID API error response:', error.response.status, error.response.data);
    }
    throw error;
  }
};

/**
 * Сохранение/обновление пользователя в БД
 */
export const saveUserToDb = async (yandexProfile, tokens) => {
  const { 
    id: yandex_id, 
    login: nickname, 
    avatar,
    name,
    second_name,
    first_name
  } = yandexProfile;
  
  if (!yandex_id) {
    throw new Error('Yandex profile is missing required field: id');
  }
  
  const { accessToken, refreshToken, expiresIn } = tokens;

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

  const values = [
    yandex_id, 
    nickname, 
    avatar || null, 
    accessToken, 
    refreshToken, 
    expiresAt
  ];
  
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Save user to DB error:', error.message);
    console.error('Values:', { yandex_id, nickname, avatar });
    throw error;
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
