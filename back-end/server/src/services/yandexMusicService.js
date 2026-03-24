import axios from 'axios';
import pool from '../config/database.js';

const YANDEX_API_BASE = 'https://api.music.yandex.net';

/**
 * Поиск треков через API Яндекс Музыки
 * @param {string} query - Поисковый запрос
 * @returns {Promise<Array>} - Массив треков (максимум 10)
 */
export const searchTracks = async (query) => {
  try {
    const response = await axios.get(`${YANDEX_API_BASE}/search`, {
      params: {
        text: query,
        type: 'track',
        nocorrect: 'true',
        page: 0,
      },
    });

    // Проверяем наличие ошибки
    if (response.data.error) {
      console.error('Yandex Music API error:', response.data.error);
      return [];
    }

    // Получаем треки из правильной структуры: result.tracks.results
    let tracks = [];
    
    if (response.data.result?.tracks?.results) {
      tracks = response.data.result.tracks.results;
    } else if (response.data.result?.blocks) {
      // Альтернативная структура с блоками
      for (const block of response.data.result.blocks) {
        if (block.type === 'track' || block.type === 'track_cover' || block.list) {
          tracks = block.list || [];
          break;
        }
      }
    }

    // Ограничиваем до 10 треков
    tracks = tracks.slice(0, 10);

    return tracks.map((track) => {
      const artist = track.artists?.[0]?.name || 'Unknown Artist';
      const coverUri = track.cover_uri || track.coverUrl || '';
      
      // Конвертируем cover_uri в полный URL для обложки
      const coverUrl = coverUri
        ? coverUri.replace('%%', '400x400')
        : 'https://via.placeholder.com/400?text=No+Cover';

      return {
        yandex_track_id: String(track.id),
        title: track.title || 'Unknown Title',
        artist,
        artists: track.artists?.map((a) => a.name) || [artist],
        cover_url: coverUrl,
        cover_uri: coverUri,
        duration_ms: track.duration_ms || 0,
        available: track.available !== false,
      };
    });
  } catch (error) {
    console.error('Yandex Music search error:', error.message);
    if (error.response?.data) {
      console.error('API response:', JSON.stringify(error.response.data));
    }
    return [];
  }
};

/**
 * Получение метаданных трека по ID
 * @param {string|number} trackId - Yandex трек ID
 * @returns {Promise<Object|null>} - Данные трека или null
 */
export const getTrackById = async (trackId) => {
  try {
    const response = await axios.get(`${YANDEX_API_BASE}/tracks/${trackId}`);
    const track = response.data.result?.[0];

    if (!track) return null;

    const artist = track.artists?.[0]?.name || 'Unknown Artist';
    const coverUri = track.cover_uri || '';
    const coverUrl = coverUri
      ? coverUri.replace('%%', '400x400')
      : 'https://via.placeholder.com/400?text=No+Cover';

    return {
      yandex_track_id: String(track.id),
      title: track.title || 'Unknown Title',
      artist,
      artists: track.artists?.map((a) => a.name) || [artist],
      cover_url: coverUrl,
      cover_uri: coverUri,
      duration_ms: track.duration_ms || 0,
      available: track.available !== false,
    };
  } catch (error) {
    console.error('Get track by ID error:', error.message);
    return null;
  }
};

/**
 * Сохранение/обновление трека в локальной БД (кэш метаданных)
 * @param {Object} trackData - Данные трека
 * @returns {Promise<Object>} - Сохраненный трек с ID из БД
 */
export const saveTrackToCache = async (trackData) => {
  const { yandex_track_id, title, artist, cover_url, cover_uri, duration_ms } = trackData;

  const query = `
    INSERT INTO tracks (yandex_track_id, title, artist, cover_url, cover_uri, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (yandex_track_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      artist = EXCLUDED.artist,
      cover_url = EXCLUDED.cover_url,
      cover_uri = EXCLUDED.cover_uri,
      duration_ms = EXCLUDED.duration_ms
    RETURNING id, yandex_track_id, title, artist, cover_url, duration_ms
  `;

  const values = [yandex_track_id, title, artist, cover_url, cover_uri || null, duration_ms];
  const result = await pool.query(query, values);

  return result.rows[0];
};

/**
 * Получение трека из кэша по yandex_track_id
 * @param {string} yandexTrackId - Yandex трек ID
 * @returns {Promise<Object|null>} - Данные трека или null
 */
export const getTrackFromCache = async (yandexTrackId) => {
  const query = 'SELECT id, yandex_track_id, title, artist, cover_url, duration_ms FROM tracks WHERE yandex_track_id = $1';
  const result = await pool.query(query, [yandexTrackId]);
  return result.rows[0] || null;
};

/**
 * Добавление трека в личный плейлист пользователя (эмуляция)
 * Так как официальное API Яндекс Музыки для плейлистов недоступно (2026),
 * сохраняем трек в таблицу user_saved_tracks
 * @param {number} userId - ID пользователя в БД
 * @param {number} trackId - ID трека в БД
 * @returns {Promise<Object>} - Результат операции
 */
export const saveTrackToUserPlaylist = async (userId, trackId) => {
  // Проверяем, не сохранен ли уже трек
  const checkQuery = `
    SELECT id FROM user_saved_tracks
    WHERE user_id = $1 AND track_id = $2
  `;
  const checkResult = await pool.query(checkQuery, [userId, trackId]);

  if (checkResult.rows.length > 0) {
    return { success: false, message: 'Track already saved' };
  }

  // Сохраняем трек
  const insertQuery = `
    INSERT INTO user_saved_tracks (user_id, track_id, saved_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    RETURNING id, user_id, track_id, saved_at
  `;
  const result = await pool.query(insertQuery, [userId, trackId]);

  return { success: true, message: 'Track saved successfully', data: result.rows[0] };
};

/**
 * Получение сохраненных треков пользователя
 * @param {number} userId - ID пользователя в БД
 * @returns {Promise<Array>} - Массив сохраненных треков
 */
export const getUserSavedTracks = async (userId) => {
  const query = `
    SELECT ust.id, ust.saved_at, t.yandex_track_id, t.title, t.artist, t.cover_url, t.duration_ms
    FROM user_saved_tracks ust
    JOIN tracks t ON ust.track_id = t.id
    WHERE ust.user_id = $1
    ORDER BY ust.saved_at DESC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows;
};
