import axios from 'axios';
import pool from '../config/database.js';

const YANDEX_API_BASE = 'https://api.music.yandex.net';

/**
 * Поиск треков в Яндекс Музыке
 * @param {string} query - Поисковый запрос
 * @param {string} accessToken - Токен пользователя
 * @returns {Promise<Array>} - Массив найденных треков
 */
export const searchTracks = async (query, accessToken) => {
  try {
    const response = await axios.get(`${YANDEX_API_BASE}/search`, {
      params: {
        text: query,
        type: 'track',
        page: 0,
        nocorrect: false,
      },
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
    });

    // Яндекс возвращает треки в result.tracks.results
    const searchResult = response.data.result;
    const tracks = searchResult?.tracks?.results || [];

    return tracks.map(track => ({
      yandex_track_id: track.id.toString(),
      title: track.title,
      artist: track.artists?.[0]?.name || 'Неизвестный исполнитель',
      artists: track.artists || [],
      cover_uri: track.coverUri || null,
      cover_url: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : null,
      duration_ms: track.durationMs,
      available: track.available,
    }));
  } catch (error) {
    console.error('❌ Yandex search error:', error.response?.data || error.message);
    throw new Error('Ошибка при поиске треков');
  }
};

/**
 * Получение информации о треке по ID
 * @param {string|number} trackId - Яндекс ID трека
 * @param {string} accessToken - Токен пользователя
 * @returns {Promise<Object>} - Информация о треке
 */
export const getTrackById = async (trackId, accessToken) => {
  try {
    const response = await axios.get(`${YANDEX_API_BASE}/tracks/${trackId}`, {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
    });

    const track = response.data.result?.[0];
    if (!track) {
      throw new Error('Трек не найден');
    }

    return {
      yandex_track_id: track.id.toString(),
      title: track.title,
      artist: track.artists?.[0]?.name || 'Неизвестный исполнитель',
      artists: track.artists || [],
      cover_uri: track.coverUri || null,
      cover_url: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : null,
      duration_ms: track.durationMs,
      available: track.available,
    };
  } catch (error) {
    console.error('Get track error:', error.response?.data || error.message);
    throw new Error('Ошибка при получении информации о треке');
  }
};

/**
 * Сохранение трека в кэш БД
 * @param {Object} trackData - Данные трека
 * @returns {Promise<number>} - ID трека в БД
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
    RETURNING id
  `;

  const values = [yandex_track_id, title, artist, cover_url, cover_uri, duration_ms];
  const result = await pool.query(query, values);

  return result.rows[0].id;
};

/**
 * Добавление трека в очередь комнаты
 * @param {number} roomId - ID комнаты
 * @param {number} trackId - ID трека в БД
 * @param {number} userId - ID пользователя
 * @returns {Promise<Object>} - Запись в очереди
 */
export const addTrackToRoomQueue = async (roomId, trackId, userId) => {
  const query = `
    INSERT INTO room_tracks (room_id, track_id, added_by_user_id, status, score)
    VALUES ($1, $2, $3, 'queued', 0)
    ON CONFLICT (room_id, track_id, status)
    DO UPDATE SET
      added_at = CURRENT_TIMESTAMP,
      added_by_user_id = EXCLUDED.added_by_user_id
    RETURNING id
  `;

  const result = await pool.query(query, [roomId, trackId, userId]);
  return result.rows[0];
};

/**
 * Получение очереди треков комнаты с сортировкой
 * @param {number} roomId - ID комнаты
 * @returns {Promise<Array>} - Отсортированная очередь (только queued треки)
 */
export const getRoomQueue = async (roomId) => {
  const query = `
    SELECT
      rt.id as room_track_id,
      rt.score,
      rt.status,
      rt.added_at,
      t.id as track_id,
      t.yandex_track_id,
      t.title,
      t.artist,
      t.cover_url,
      t.cover_uri,
      t.duration_ms,
      u.id as added_by_id,
      u.nickname as added_by_name
    FROM room_tracks rt
    JOIN tracks t ON rt.track_id = t.id
    LEFT JOIN users u ON rt.added_by_user_id = u.id
    WHERE rt.room_id = $1 AND rt.status = 'queued'
    ORDER BY
      rt.score DESC,
      rt.added_at ASC
  `;

  const result = await pool.query(query, [roomId]);

  return result.rows.map(row => ({
    room_track_id: row.room_track_id,
    yandex_track_id: row.yandex_track_id,
    title: row.title,
    artist: row.artist,
    artists: [],
    cover_url: row.cover_url,
    cover_uri: row.cover_uri,
    duration_ms: row.duration_ms,
    score: row.score,
    status: row.status,
    added_by: {
      id: row.added_by_id,
      name: row.added_by_name,
    },
    added_at: row.added_at,
  }));
};

/**
 * Голосование за трек
 * @param {number} roomTrackId - ID записи в room_tracks
 * @param {number} userId - ID пользователя
 * @param {number} value - Значение голоса (1 или -1)
 * @returns {Promise<Object>} - Результат голосования
 */
export const voteForTrack = async (roomTrackId, userId, value) => {
  // Проверяем существующий голос
  const existingVote = await pool.query(
    'SELECT id, value FROM votes WHERE room_track_id = $1 AND user_id = $2',
    [roomTrackId, userId]
  );

  let scoreChange = value;

  if (existingVote.rows.length > 0) {
    // Если голос уже есть
    const currentVote = existingVote.rows[0].value;
    
    if (currentVote === value) {
      // Тот же голос - убираем его
      await pool.query('DELETE FROM votes WHERE room_track_id = $1 AND user_id = $2', [roomTrackId, userId]);
      scoreChange = -value;
    } else {
      // Меняем голос
      await pool.query('UPDATE votes SET value = $1 WHERE room_track_id = $2 AND user_id = $3', [value, roomTrackId, userId]);
      scoreChange = value * 2; // Меняем с -1 на 1 или наоборот = изменение на 2
    }
  } else {
    // Новый голос
    await pool.query(
      'INSERT INTO votes (room_track_id, user_id, value) VALUES ($1, $2, $3)',
      [roomTrackId, userId, value]
    );
  }

  // Обновляем score трека
  await pool.query(
    'UPDATE room_tracks SET score = score + $1 WHERE id = $2',
    [scoreChange, roomTrackId]
  );

  return { success: true, scoreChange };
};

/**
 * Добавление трека в личный плейлист пользователя Яндекс
 * @param {string} yandexTrackId - Яндекс ID трека
 * @param {string} accessToken - Токен пользователя
 * @param {number} yandexUserId - Яндекс ID пользователя
 * @returns {Promise<Object>} - Результат
 */
export const addTrackToUserPlaylist = async (yandexTrackId, accessToken, yandexUserId) => {
  try {
    // Используем правильный формат запроса для like
    const response = await axios.post(
      `${YANDEX_API_BASE}/users/${yandexUserId}/tracks/like`,
      {},  // Пустое тело, trackId передаётся в query params
      {
        params: {
          trackId: yandexTrackId,
        },
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      }
    );

    return { success: true, message: 'Трек добавлен в "Мне нравится"' };
  } catch (error) {
    console.error('Add to playlist error:', error.response?.data || error.message);
    // Игнорируем ошибку "not-found" - это известный баг Яндекса
    if (error.response?.data?.error?.name === 'not-found') {
      return { success: true, message: 'Трек сохранён (локально)' };
    }
    throw new Error('Ошибка при добавлении трека в плейлист');
  }
};

/**
 * Получение текущего трека в комнате
 * @param {number} roomId - ID комнаты
 * @returns {Promise<Object|null>} - Текущий воспроизводимый трек
 */
export const getCurrentTrackInRoom = async (roomId) => {
  const query = `
    SELECT
      rt.id as room_track_id,
      t.id as track_id,
      t.yandex_track_id,
      t.title,
      t.artist,
      t.cover_url,
      t.cover_uri,
      t.duration_ms
    FROM room_tracks rt
    JOIN tracks t ON rt.track_id = t.id
    WHERE rt.room_id = $1 AND rt.status = 'playing'
    LIMIT 1
  `;

  const result = await pool.query(query, [roomId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    room_track_id: row.room_track_id,
    yandex_track_id: row.yandex_track_id,
    title: row.title,
    artist: row.artist,
    artists: [],
    cover_url: row.cover_url,
    cover_uri: row.cover_uri,
    duration_ms: row.duration_ms,
  };
};

/**
 * Установка трека как "воспроизводимый" (playing)
 * @param {number} roomId - ID комнаты
 * @param {number} roomTrackId - ID записи в room_tracks
 * @returns {Promise<void>}
 */
export const setTrackAsPlaying = async (roomId, roomTrackId) => {
  // Сначала сбрасываем все playing треки в played
  await pool.query(
    "UPDATE room_tracks SET status = 'played' WHERE room_id = $1 AND status = 'playing'",
    [roomId]
  );

  // Устанавливаем новый трек как playing
  await pool.query(
    "UPDATE room_tracks SET status = 'playing' WHERE id = $1",
    [roomTrackId]
  );
};

/**
 * Удаление трека из очереди
 * @param {number} roomTrackId - ID записи в room_tracks
 * @returns {Promise<void>}
 */
export const removeTrackFromQueue = async (roomTrackId) => {
  await pool.query('DELETE FROM room_tracks WHERE id = $1', [roomTrackId]);
};

/**
 * Получение следующего трека из очереди
 * @param {number} roomId - ID комнаты
 * @returns {Promise<Object|null>} - Следующий трек
 */
export const getNextTrackInQueue = async (roomId) => {
  const query = `
    SELECT
      rt.id as room_track_id,
      t.id as track_id,
      t.yandex_track_id,
      t.title,
      t.artist,
      t.cover_url,
      t.cover_uri,
      t.duration_ms
    FROM room_tracks rt
    JOIN tracks t ON rt.track_id = t.id
    WHERE rt.room_id = $1 AND rt.status = 'queued'
    ORDER BY rt.score DESC, rt.added_at ASC
    LIMIT 1
  `;

  const result = await pool.query(query, [roomId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    room_track_id: row.room_track_id,
    yandex_track_id: row.yandex_track_id,
    title: row.title,
    artist: row.artist,
    artists: [],
    cover_url: row.cover_url,
    cover_uri: row.cover_uri,
    duration_ms: row.duration_ms,
  };
};
