import {
  searchTracks as yandexSearchTracks,
  saveTrackToCache,
  addTrackToRoomQueue,
  getRoomQueue,
  voteForTrack,
  addTrackToUserPlaylist,
  getTrackStreamUrl
} from '../services/yandexMusicService.js';
import { getUserValidToken as getUserToken } from '../services/yandexAuthService.js';
import pool from '../config/database.js';

/**
 * Поиск треков в Яндекс Музыке
 * GET /api/tracks/search?q=...
 */
export const searchTracks = async (req, res) => {
  console.log('🔍 Search request received:', req.query);
  
  try {
    const { q } = req.query;
    const userId = req.user.userId;

    console.log('📝 Search query:', q, '| User:', userId);

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Поисковый запрос должен содержать минимум 2 символа' });
    }

    // Получаем токен пользователя для доступа к API Яндекса
    const accessToken = await getUserToken(userId);
    console.log('🔑 Access token:', accessToken ? 'received' : 'NULL');
    
    if (!accessToken) {
      return res.status(401).json({ error: 'Требуется повторная авторизация' });
    }

    // Поиск через Яндекс API
    console.log('🔎 Searching Yandex for:', q);
    const tracks = await yandexSearchTracks(q, accessToken);
    console.log('✅ Found tracks:', tracks.length);

    res.json({ tracks, total: tracks.length });
  } catch (error) {
    console.error('❌ Search tracks error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при поиске треков' });
  }
};

/**
 * Добавление трека в очередь комнаты
 * POST /api/tracks/:yandexId/add-to-room/:roomId
 */
export const addTrackToRoom = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { yandexId } = req.params;
    const { roomId } = req.params;
    const userId = req.user.userId;

    // Проверка: пользователь состоит в комнате
    const roomCheck = await client.query(
      'SELECT id FROM rooms WHERE id = $1 AND is_active = TRUE',
      [roomId]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена или неактивна' });
    }

    // Получаем информацию о треке из Яндекс API
    const accessToken = await getUserToken(userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Требуется повторная авторизация' });
    }

    // Импортируем функцию динамически, чтобы избежать циклической зависимости
    const { getTrackById } = await import('../services/yandexMusicService.js');
    const trackInfo = await getTrackById(yandexId, accessToken);

    // Сохраняем трек в кэш БД
    const trackDbId = await saveTrackToCache(trackInfo);

    // Проверяем, есть ли уже этот трек в очереди
    const existingTrack = await client.query(
      'SELECT id FROM room_tracks WHERE room_id = $1 AND track_id = $2 AND status IN (\'queued\', \'playing\')',
      [roomId, trackDbId]
    );

    if (existingTrack.rows.length > 0) {
      return res.status(400).json({ error: 'Этот трек уже есть в очереди' });
    }

    // Добавляем трек в очередь
    const result = await addTrackToRoomQueue(roomId, trackDbId, userId);

    // Получаем обновленную очередь
    const queue = await getRoomQueue(roomId);

    res.json({ 
      success: true, 
      message: 'Трек добавлен в очередь',
      queue 
    });
  } catch (error) {
    console.error('Add track to room error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при добавлении трека' });
  } finally {
    client.release();
  }
};

/**
 * Голосование за трек
 * POST /api/tracks/vote
 */
export const voteTrack = async (req, res) => {
  try {
    const { roomTrackId, value } = req.body;
    const userId = req.user.userId;

    if (!roomTrackId || !value) {
      return res.status(400).json({ error: 'Необходимо указать roomTrackId и value' });
    }

    if (value !== 1 && value !== -1) {
      return res.status(400).json({ error: 'Значение голоса должно быть 1 или -1' });
    }

    // Получаем room_track для определения комнаты
    const roomTrack = await pool.query(
      'SELECT room_id FROM room_tracks WHERE id = $1',
      [roomTrackId]
    );

    if (roomTrack.rows.length === 0) {
      return res.status(404).json({ error: 'Запись трека не найдена' });
    }

    const roomId = roomTrack.rows[0].room_id;

    // Голосуем
    await voteForTrack(roomTrackId, userId, value);

    // Получаем обновленную очередь
    const queue = await getRoomQueue(roomId);

    res.json({ success: true, queue });
  } catch (error) {
    console.error('Vote track error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при голосовании' });
  }
};

/**
 * Добавление трека в личный плейлист пользователя
 * POST /api/tracks/:yandexId/save
 */
export const saveTrackToPlaylist = async (req, res) => {
  try {
    const { yandexId } = req.params;
    const userId = req.user.userId;

    // Получаем пользователя с токеном
    const userResult = await pool.query(
      'SELECT yandex_id, access_token, refresh_token, token_expires_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];
    
    // Импортируем функцию для получения валидного токена
    const accessToken = await getUserToken(userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Требуется повторная авторизация' });
    }

    // Добавляем трек в плейлист
    const result = await addTrackToUserPlaylist(yandexId, accessToken, user.yandex_id);

    res.json(result);
  } catch (error) {
    console.error('Save track error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при сохранении трека' });
  }
};

/**
 * Получение очереди комнаты
 * GET /api/rooms/:roomId/queue
 */
export const getRoomQueueHandler = async (req, res) => {
  try {
    const { roomId } = req.params;

    const queue = await getRoomQueue(roomId);

    res.json({ queue });
  } catch (error) {
    console.error('Get room queue error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при получении очереди' });
  }
};

/**
 * Получение прямой ссылки на аудиофайл трека
 * GET /api/tracks/:yandexId/stream-url
 */
export const getTrackStreamUrlHandler = async (req, res) => {
  try {
    const { yandexId } = req.params;
    const userId = req.user.userId;
    const { quality } = req.query;

    // Получаем токен пользователя
    const accessToken = await getUserToken(userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Требуется повторная авторизация' });
    }

    // Получаем stream URL
    const streamInfo = await getTrackStreamUrl(yandexId, accessToken, quality || '192');

    res.json({
      url: streamInfo.url,
      bitrate: streamInfo.bitrate,
      codec: streamInfo.codec,
      expires: streamInfo.expires,
    });
  } catch (error) {
    console.error('Get stream URL error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при получении ссылки на трек' });
  }
};
