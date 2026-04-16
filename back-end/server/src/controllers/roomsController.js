import pool from '../config/database.js';
import { getRoomQueue, getCurrentTrackInRoom } from '../services/yandexMusicService.js';

/**
 * Создание комнаты
 * POST /api/rooms
 */
export const createRoom = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.userId;
    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

    let code;
    let exists = true;

    // Генерация уникального кода
    while (exists) {
      code = generateCode();
      const result = await client.query('SELECT id FROM rooms WHERE code = $1', [code]);
      exists = result.rows.length > 0;
    }

    // Создаем комнату
    const roomResult = await client.query(
      `INSERT INTO rooms (code, host_id, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id, code, host_id, created_at, is_active`,
      [code, userId]
    );

    const room = roomResult.rows[0];

    // Получаем данные пользователя
    const userResult = await client.query(
      'SELECT id, nickname, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Создаем список участников с создателем
    const users = [{
      id: user.id,
      name: user.nickname,
      avatar_url: user.avatar_url,
      isHost: true,
    }];

    // Пустая очередь
    const queue = [];
    const currentTrack = null;

    res.status(201).json({ 
      room: {
        ...room,
        users,
        queue,
        currentTrack,
        status: 'idle',
      } 
    });
  } catch (error) {
    console.error('Create room error:', error.message);
    res.status(500).json({ error: 'Failed to create room' });
  } finally {
    client.release();
  }
};

/**
 * Присоединение к комнате
 * POST /api/rooms/:code/join
 */
export const joinRoom = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { code } = req.params;
    const userId = req.user.userId;

    // Находим комнату
    const roomResult = await client.query(
      `SELECT r.id, r.code, r.host_id, r.is_active, r.status
       FROM rooms r
       WHERE r.code = $1 AND r.is_active = TRUE`,
      [code]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена или неактивна' });
    }

    const room = roomResult.rows[0];

    // Получаем данные пользователя
    const userResult = await client.query(
      'SELECT id, nickname, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Проверяем, не состоит ли уже пользователь в комнате
    const existingMember = await client.query(
      'SELECT id FROM room_members WHERE room_id = $1 AND user_id = $2',
      [room.id, userId]
    );

    if (existingMember.rows.length === 0) {
      // Добавляем пользователя в комнату
      await client.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)',
        [room.id, userId]
      );
    }

    // Получаем всех участников комнаты
    const membersResult = await client.query(
      `SELECT u.id, u.nickname, u.avatar_url, 
              CASE WHEN u.id = $1 THEN TRUE ELSE FALSE END as isHost
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $2
       ORDER BY rm.joined_at ASC`,
      [room.host_id, room.id]
    );

    const users = membersResult.rows.map(row => ({
      id: row.id,
      name: row.nickname,
      avatar_url: row.avatar_url,
      isHost: row.id === room.host_id,
    }));

    // Получаем очередь треков
    const queue = await getRoomQueue(room.id);

    // Получаем текущий трек
    const currentTrack = await getCurrentTrackInRoom(room.id);

    res.json({ 
      room: {
        id: room.id,
        code: room.code,
        host_id: room.host_id,
        status: room.status || 'idle',
        users,
        queue,
        currentTrack,
      } 
    });
  } catch (error) {
    console.error('Join room error:', error.message);
    res.status(500).json({ error: 'Failed to join room' });
  } finally {
    client.release();
  }
};

/**
 * Выход из комнаты
 * POST /api/rooms/:id/leave
 */
export const leaveRoom = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Удаляем пользователя из участников
    await client.query(
      'DELETE FROM room_members WHERE room_id = $1 AND user_id = $2',
      [id, userId]
    );

    // Проверяем, был ли пользователь хостом
    const roomResult = await client.query(
      'SELECT host_id FROM rooms WHERE id = $1',
      [id]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    const roomId = roomResult.rows[0].id;
    const hostId = roomResult.rows[0].host_id;
    let newHostId = null;

    // Если ушел хост - передаем права
    if (userId === hostId) {
      // Находим старейшего участника
      const membersResult = await client.query(
        `SELECT user_id FROM room_members 
         WHERE room_id = $1 
         ORDER BY joined_at ASC 
         LIMIT 1`,
        [id]
      );

      if (membersResult.rows.length > 0) {
        newHostId = membersResult.rows[0].user_id;
        await client.query(
          'UPDATE rooms SET host_id = $1 WHERE id = $2',
          [newHostId, id]
        );
      } else {
        // Если участников нет - удаляем комнату
        await client.query(
          'UPDATE rooms SET is_active = FALSE WHERE id = $1',
          [id]
        );
      }
    }

    res.json({ 
      success: true, 
      newHostId,
      message: newHostId ? 'Права ведущего переданы' : 'Комната закрыта'
    });
  } catch (error) {
    console.error('Leave room error:', error.message);
    res.status(500).json({ error: 'Failed to leave room' });
  } finally {
    client.release();
  }
};

/**
 * Получение состояния комнаты
 * GET /api/rooms/:id/state
 */
export const getRoomState = async (req, res) => {
  try {
    const { id } = req.params;

    const roomResult = await pool.query(
      `SELECT r.id, r.code, r.host_id, r.is_active, r.status
       FROM rooms r
       WHERE r.id = $1 AND r.is_active = TRUE`,
      [id]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    const room = roomResult.rows[0];

    // Получаем участников
    const membersResult = await pool.query(
      `SELECT u.id, u.nickname, u.avatar_url
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $1
       ORDER BY rm.joined_at ASC`,
      [id]
    );

    const users = membersResult.rows.map(row => ({
      id: row.id,
      name: row.nickname,
      avatar_url: row.avatar_url,
      isHost: row.id === room.host_id,
    }));

    // Получаем очередь
    const queue = await getRoomQueue(id);

    // Получаем текущий трек
    const currentTrack = await getCurrentTrackInRoom(id);

    res.json({
      room: {
        id: room.id,
        code: room.code,
        host_id: room.host_id,
        status: room.status || 'idle',
        users,
        queue,
        currentTrack,
      }
    });
  } catch (error) {
    console.error('Get room state error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при получении состояния комнаты' });
  }
};

/**
 * Удаление трека из очереди (только для хоста)
 * DELETE /api/rooms/:roomId/tracks/:roomTrackId
 */
export const removeTrackFromRoomQueue = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { roomId, roomTrackId } = req.params;
    const userId = req.user.userId;

    // Проверяем, является ли пользователь хостом
    const roomResult = await client.query(
      'SELECT host_id FROM rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    if (roomResult.rows[0].host_id !== userId) {
      return res.status(403).json({ error: 'Только ведущий может удалять треки' });
    }

    // Импортируем функцию удаления
    const { removeTrackFromQueue } = await import('../services/yandexMusicService.js');
    await removeTrackFromQueue(roomTrackId);

    // Получаем обновленную очередь
    const queue = await getRoomQueue(roomId);

    res.json({ success: true, queue });
  } catch (error) {
    console.error('Remove track error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при удалении трека' });
  } finally {
    client.release();
  }
};

/**
 * Переход к следующему треку (только для хоста)
 * POST /api/rooms/:roomId/next-track
 */
export const nextTrack = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;

    // Проверяем, является ли пользователь хостом
    const roomResult = await client.query(
      'SELECT host_id FROM rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    if (roomResult.rows[0].host_id !== userId) {
      return res.status(403).json({ error: 'Только ведущий может переключать треки' });
    }

    // Импортируем функции
    const { getNextTrackInQueue, setTrackAsPlaying, getCurrentTrackInRoom } = 
      await import('../services/yandexMusicService.js');

    // Получаем следующий трек
    const nextTrack = await getNextTrackInQueue(roomId);

    if (!nextTrack) {
      // Очередь пуста - сбрасываем текущий трек
      await client.query(
        "UPDATE room_tracks SET status = 'played' WHERE room_id = $1 AND status = 'playing'",
        [roomId]
      );

      return res.json({ 
        success: true, 
        currentTrack: null,
        message: 'Очередь пуста'
      });
    }

    // Устанавливаем следующий трек как текущий
    await setTrackAsPlaying(roomId, nextTrack.room_track_id);

    // Получаем обновленный текущий трек
    const currentTrack = await getCurrentTrackInRoom(roomId);

    // Получаем обновленную очередь
    const queue = await getRoomQueue(roomId);

    res.json({ 
      success: true, 
      currentTrack,
      queue
    });
  } catch (error) {
    console.error('Next track error:', error.message);
    res.status(500).json({ error: error.message || 'Ошибка при переключении трека' });
  } finally {
    client.release();
  }
};
