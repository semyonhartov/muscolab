import {
  searchTracks,
  getTrackById,
  saveTrackToCache,
  getTrackFromCache,
  saveTrackToUserPlaylist,
  getUserSavedTracks
} from '../services/yandexMusicService.js';
import pool from '../config/database.js';

/**
 * Поиск треков через API Яндекс Музыки
 * GET /api/tracks/search?q=...
 */
export const searchTracksHandler = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Поиск через API Яндекс
    const tracks = await searchTracks(q.trim(), 20);

    res.json({
      tracks,
      total: tracks.length,
      query: q,
    });
  } catch (error) {
    console.error('Search tracks error:', error.message);
    res.status(500).json({ error: 'Failed to search tracks' });
  }
};

/**
 * Получение трека по ID
 * GET /api/tracks/:id
 */
export const getTrackHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Сначала пробуем получить из кэша
    let track = await getTrackFromCache(id);

    // Если нет в кэше, запрашиваем API
    if (!track) {
      track = await getTrackById(id);
      if (track) {
        await saveTrackToCache(track);
      }
    }

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    res.json({ track });
  } catch (error) {
    console.error('Get track error:', error.message);
    res.status(500).json({ error: 'Failed to get track' });
  }
};

/**
 * Добавление трека в личный плейлист пользователя
 * POST /api/tracks/:id/save
 */
export const saveTrackHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Проверяем, существует ли трек в кэше
    let track = await getTrackFromCache(id);

    if (!track) {
      // Пробуем получить из API
      const trackData = await getTrackById(id);
      if (!trackData) {
        return res.status(404).json({ error: 'Track not found' });
      }
      track = await saveTrackToCache(trackData);
    }

    // Сохраняем в плейлист пользователя
    const result = await saveTrackToUserPlaylist(userId, track.id);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      message: result.message,
      track: {
        id: track.id,
        yandex_track_id: track.yandex_track_id,
        title: track.title,
        artist: track.artist,
        cover_url: track.cover_url,
      },
    });
  } catch (error) {
    console.error('Save track error:', error.message);
    res.status(500).json({ error: 'Failed to save track' });
  }
};

/**
 * Получение сохраненных треков пользователя
 * GET /api/tracks/saved
 */
export const getSavedTracksHandler = async (req, res) => {
  try {
    const userId = req.user.userId;

    const tracks = await getUserSavedTracks(userId);

    res.json({
      tracks,
      total: tracks.length,
    });
  } catch (error) {
    console.error('Get saved tracks error:', error.message);
    res.status(500).json({ error: 'Failed to get saved tracks' });
  }
};

/**
 * Удаление трека из сохраненных
 * DELETE /api/tracks/saved/:trackId
 */
export const removeSavedTrackHandler = async (req, res) => {
  try {
    const { trackId } = req.params;
    const userId = req.user.userId;

    const query = 'DELETE FROM user_saved_tracks WHERE user_id = $1 AND track_id = $2';
    const result = await pool.query(query, [userId, trackId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Saved track not found' });
    }

    res.json({ success: true, message: 'Track removed from saved' });
  } catch (error) {
    console.error('Remove saved track error:', error.message);
    res.status(500).json({ error: 'Failed to remove saved track' });
  }
};
