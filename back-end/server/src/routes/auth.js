import { Router } from 'express';
import { 
  redirectToYandexAuth, 
  handleYandexCallback, 
  getCurrentUser, 
  logout 
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Публичные роуты
router.get('/yandex', redirectToYandexAuth);
router.get('/callback', handleYandexCallback);

// Защищённые роуты
router.get('/me', requireAuth, getCurrentUser);
router.post('/logout', requireAuth, logout);

export default router;
