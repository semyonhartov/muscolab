import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createRoomHandler,
  joinRoomHandler,
  getRoomQueueHandler,
  addTrackToRoomHandler,
  removeTrackFromRoomHandler,
  voteTrackHandler,
  nextTrackHandler,
  endRoomHandler
} from '../controllers/roomsController.js';

const router = Router();

/**
 * @route POST /api/rooms
 * @desc Создание новой комнаты
 * @access Private
 */
router.post('/', requireAuth, createRoomHandler);

/**
 * @route POST /api/rooms/:code/join
 * @desc Присоединение к комнате по коду
 * @access Private
 */
router.post('/:code/join', requireAuth, joinRoomHandler);

/**
 * @route GET /api/rooms/:id/queue
 * @desc Получение очереди треков в комнате
 * @access Private
 */
router.get('/:id/queue', requireAuth, getRoomQueueHandler);

/**
 * @route POST /api/rooms/:roomId/tracks
 * @desc Добавление трека в очередь комнаты
 * @access Private
 */
router.post('/:roomId/tracks', requireAuth, addTrackToRoomHandler);

/**
 * @route DELETE /api/rooms/:roomId/tracks/:roomTrackId
 * @desc Удаление трека из очереди
 * @access Private
 */
router.delete('/:roomId/tracks/:roomTrackId', requireAuth, removeTrackFromRoomHandler);

/**
 * @route POST /api/rooms/:roomId/tracks/:roomTrackId/vote
 * @desc Голосование за трек (+1/-1)
 * @access Private
 */
router.post('/:roomId/tracks/:roomTrackId/vote', requireAuth, voteTrackHandler);

/**
 * @route POST /api/rooms/:roomId/next
 * @desc Переход к следующему треку (только Host)
 * @access Private
 */
router.post('/:roomId/next', requireAuth, nextTrackHandler);

/**
 * @route POST /api/rooms/:roomId/end
 * @desc Завершение комнаты (только Host)
 * @access Private
 */
router.post('/:roomId/end', requireAuth, endRoomHandler);

export default router;
