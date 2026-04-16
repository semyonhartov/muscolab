import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomState,
  removeTrackFromRoomQueue,
  nextTrack
} from '../controllers/roomsController.js';

const router = Router();

/**
 * Создание комнаты
 * @route POST /rooms
 */
router.post('/', requireAuth, createRoom);

/**
 * Присоединение к комнате по коду
 * @route POST /rooms/:code/join
 */
router.post('/:code/join', requireAuth, joinRoom);

/**
 * Выход из комнаты
 * @route POST /rooms/:id/leave
 */
router.post('/:id/leave', requireAuth, leaveRoom);

/**
 * Получение состояния комнаты
 * @route GET /rooms/:id/state
 */
router.get('/:id/state', requireAuth, getRoomState);

/**
 * Удаление трека из очереди (только хост)
 * @route DELETE /rooms/:roomId/tracks/:roomTrackId
 */
router.delete('/:roomId/tracks/:roomTrackId', requireAuth, removeTrackFromRoomQueue);

/**
 * Переход к следующему треку (только хост)
 * @route POST /rooms/:roomId/next-track
 */
router.post('/:roomId/next-track', requireAuth, nextTrack);

export default router;
