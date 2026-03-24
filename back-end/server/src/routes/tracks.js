import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  searchTracksHandler,
  getTrackHandler,
  saveTrackHandler,
  getSavedTracksHandler,
  removeSavedTrackHandler
} from '../controllers/tracksController.js';

const router = Router();

/**
 * @route GET /api/tracks/search?q=...
 * @desc Поиск треков через API Яндекс Музыки
 * @access Private
 */
router.get('/search', requireAuth, searchTracksHandler);

/**
 * @route GET /api/tracks/:id
 * @desc Получение трека по ID
 * @access Private
 */
router.get('/:id', requireAuth, getTrackHandler);

/**
 * @route POST /api/tracks/:id/save
 * @desc Добавление трека в личный плейлист пользователя
 * @access Private
 */
router.post('/:id/save', requireAuth, saveTrackHandler);

/**
 * @route GET /api/tracks/saved
 * @desc Получение сохраненных треков пользователя
 * @access Private
 */
router.get('/saved', requireAuth, getSavedTracksHandler);

/**
 * @route DELETE /api/tracks/saved/:trackId
 * @desc Удаление трека из сохраненных
 * @access Private
 */
router.delete('/saved/:trackId', requireAuth, removeSavedTrackHandler);

export default router;
