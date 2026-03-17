import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../config/database.js';

const router = Router();

/**
 * Создание комнаты
 * @route POST /api/rooms
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    // Генерация уникального 6-значного кода
    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
    
    let code;
    let exists = true;
    
    // Проверка на уникальность
    while (exists) {
      code = generateCode();
      const result = await pool.query('SELECT id FROM rooms WHERE code = $1', [code]);
      exists = result.rows.length > 0;
    }
    
    const query = `
      INSERT INTO rooms (code, host_id) 
      VALUES ($1, $2) 
      RETURNING id, code, host_id, created_at
    `;
    const result = await pool.query(query, [code, req.user.userId]);
    
    res.status(201).json({ room: result.rows[0] });
  } catch (error) {
    console.error('Create room error:', error.message);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * Присоединение к комнате
 * @route POST /api/rooms/:code/join
 */
router.post('/:code/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(
      `SELECT r.id, r.code, r.host_id, r.is_active, u.nickname as host_name
       FROM rooms r
       JOIN users u ON r.host_id = u.id
       WHERE r.code = $1 AND r.is_active = TRUE`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found or inactive' });
    }
    
    res.json({ room: result.rows[0] });
  } catch (error) {
    console.error('Join room error:', error.message);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

/**
 * Получение очереди треков в комнате (заглушка)
 * @route GET /api/rooms/:id/queue
 */
router.get('/:id/queue', requireAuth, async (req, res) => {
  // TODO: Реализовать получение очереди из БД с сортировкой
  res.json({ queue: [], currentTrack: null });
});

export default router;
