import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  searchTracks,
  addTrackToRoom,
  voteTrack,
  saveTrackToPlaylist,
  getRoomQueueHandler,
  getTrackStreamUrlHandler
} from '../controllers/tracksController.js';

const router = Router();

/**
 * Поиск треков в Яндекс Музыке
 * @route GET /tracks/search?q=...
 */
router.get('/search', requireAuth, searchTracks);

/**
 * Добавление трека в очередь комнаты
 * @route POST /tracks/:yandexId/add-to-room/:roomId
 */
router.post('/:yandexId/add-to-room/:roomId', requireAuth, addTrackToRoom);

/**
 * Голосование за трек
 * @route POST /tracks/vote
 */
router.post('/vote', requireAuth, voteTrack);

/**
 * Добавление трека в личный плейлист пользователя
 * @route POST /tracks/:yandexId/save
 */
router.post('/:yandexId/save', requireAuth, saveTrackToPlaylist);

/**
 * Получение прямой ссылки на аудиофайл трека
 * @route GET /tracks/:yandexId/stream-url
 */
router.get('/:yandexId/stream-url', requireAuth, getTrackStreamUrlHandler);

/**
 * Получение очереди комнаты
 * @route GET /rooms/:roomId/queue
 */
router.get('/rooms/:roomId/queue', requireAuth, getRoomQueueHandler);

export default router;
