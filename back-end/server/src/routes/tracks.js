import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Поиск треков (заглушка)
 * @route GET /api/tracks/search?q=...
 */
router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  
  // TODO: Реализовать запрос к Яндекс Music API
  // Пока возвращаем мок-данные
  const mockTracks = [
    {
      id: 'mock_1',
      yandex_track_id: '12345',
      title: `Найдено: ${q || 'запрос'}`,
      artist: 'Mock Artist',
      cover_url: 'https://via.placeholder.com/200',
      duration_ms: 180000,
    }
  ];
  
  res.json({ tracks: mockTracks, total: mockTracks.length });
});

/**
 * Добавление трека в личный плейлист (заглушка)
 * @route POST /api/tracks/:id/save
 */
router.post('/:id/save', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  
  // TODO: Реализовать добавление через Яндекс API
  console.log(`User ${userId} wants to save track ${id}`);
  
  res.json({ success: true, message: 'Track saved (mock)' });
});

export default router;
