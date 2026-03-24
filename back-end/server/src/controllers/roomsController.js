import pool from '../config/database.js';
import { getTrackById, saveTrackToCache } from '../services/yandexMusicService.js';
import { io } from '../index.js';

/**
 * Создание комнаты
 * POST /api/rooms
 */
export const createRoomHandler = async (req, res) => {
  try {
    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

    let code;
    let exists = true;

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
};

/**
 * Присоединение к комнате
 * POST /api/rooms/:code/join
 */
export const joinRoomHandler = async (req, res) => {
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
};

/**
 * Получение очереди треков в комнате с сортировкой
 * GET /api/rooms/:id/queue
 */
export const getRoomQueueHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем очередь с сортировкой: playing first, then by score DESC, then by added_at ASC
    const query = `
      SELECT 
        rt.id as room_track_id,
        rt.status,
        rt.score,
        rt.added_at,
        rt.added_by_user_id,
        u.nickname as added_by_name,
        u.avatar_url as added_by_avatar,
        t.id as track_id,
        t.yandex_track_id,
        t.title,
        t.artist,
        t.cover_url,
        t.duration_ms
      FROM room_tracks rt
      JOIN tracks t ON rt.track_id = t.id
      JOIN users u ON rt.added_by_user_id = u.id
      WHERE rt.room_id = $1 AND rt.status != 'played'
      ORDER BY 
        CASE WHEN rt.status = 'playing' THEN 0 ELSE 1 END,
        rt.score DESC,
        rt.added_at ASC
    `;

    const result = await pool.query(query, [id]);

    // Получаем текущий трек (если есть playing)
    const currentTrack = result.rows.find((row) => row.status === 'playing') || null;
    const queue = result.rows.filter((row) => row.status !== 'playing');

    res.json({
      queue,
      currentTrack,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get room queue error:', error.message);
    res.status(500).json({ error: 'Failed to get room queue' });
  }
};

/**
 * Добавление трека в очередь комнаты
 * POST /api/rooms/:roomId/tracks
 */
export const addTrackToRoomHandler = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { yandexTrackId } = req.body;
    const userId = req.user.userId;

    if (!yandexTrackId) {
      return res.status(400).json({ error: 'yandexTrackId is required' });
    }

    // Проверяем, существует ли комната
    const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1 AND is_active = TRUE', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found or inactive' });
    }

    // Проверяем, не добавлен ли уже трек в очередь со статусом queued/playing
    const duplicateCheck = await pool.query(
      `SELECT rt.id FROM room_tracks rt
       JOIN tracks t ON rt.track_id = t.id
       WHERE rt.room_id = $1 AND t.yandex_track_id = $2 AND rt.status IN ('queued', 'playing')`,
      [roomId, yandexTrackId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Track already in queue' });
    }

    // Получаем или сохраняем трек в кэше
    let track = await getTrackById(yandexTrackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found in Yandex Music' });
    }

    const cachedTrack = await saveTrackToCache(track);

    // Добавляем трек в очередь
    const query = `
      INSERT INTO room_tracks (room_id, track_id, added_by_user_id, status, score)
      VALUES ($1, $2, $3, 'queued', 0)
      RETURNING id
    `;
    const result = await pool.query(query, [roomId, cachedTrack.id, userId]);

    // Отправляем WebSocket событие об обновлении очереди
    const updatedQueue = await getRoomQueueData(roomId);
    io.to(roomId).emit('queue_update', updatedQueue);

    res.status(201).json({
      success: true,
      roomTrackId: result.rows[0].id,
      track: cachedTrack,
      queue: updatedQueue,
    });
  } catch (error) {
    console.error('Add track to room error:', error.message);
    res.status(500).json({ error: 'Failed to add track to room' });
  }
};

/**
 * Удаление трека из очереди комнаты
 * DELETE /api/rooms/:roomId/tracks/:roomTrackId
 */
export const removeTrackFromRoomHandler = async (req, res) => {
  try {
    const { roomId, roomTrackId } = req.params;
    const userId = req.user.userId;

    // Проверяем права: только host может удалять любые треки
    const roomCheck = await pool.query('SELECT host_id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const isHost = roomCheck.rows[0].host_id === userId;

    // Если не host, проверяем, что пользователь добавил этот трек
    if (!isHost) {
      const trackCheck = await pool.query(
        'SELECT added_by_user_id FROM room_tracks WHERE id = $1 AND room_id = $2',
        [roomTrackId, roomId]
      );
      if (trackCheck.rows.length === 0 || trackCheck.rows[0].added_by_user_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to remove this track' });
      }
    }

    // Удаляем трек (или помечаем как played)
    const query = `
      UPDATE room_tracks
      SET status = 'played'
      WHERE id = $1 AND room_id = $2
      RETURNING id
    `;
    await pool.query(query, [roomTrackId, roomId]);

    // Отправляем WebSocket событие об обновлении очереди
    const updatedQueue = await getRoomQueueData(roomId);
    io.to(roomId).emit('queue_update', updatedQueue);

    res.json({ success: true, queue: updatedQueue });
  } catch (error) {
    console.error('Remove track from room error:', error.message);
    res.status(500).json({ error: 'Failed to remove track from room' });
  }
};

/**
 * Голосование за трек
 * POST /api/rooms/:roomId/tracks/:roomTrackId/vote
 */
export const voteTrackHandler = async (req, res) => {
  try {
    const { roomId, roomTrackId } = req.params;
    const { value } = req.body; // +1 или -1
    const userId = req.user.userId;

    if (!value || (value !== 1 && value !== -1)) {
      return res.status(400).json({ error: 'Vote value must be 1 or -1' });
    }

    // Проверяем существование room_track
    const roomTrackCheck = await pool.query(
      'SELECT id, status FROM room_tracks WHERE id = $1 AND room_id = $2',
      [roomTrackId, roomId]
    );

    if (roomTrackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found in room queue' });
    }

    // Нельзя голосовать за текущий играющий трек
    if (roomTrackCheck.rows[0].status === 'playing') {
      return res.status(400).json({ error: 'Cannot vote for currently playing track' });
    }

    // Проверяем, есть ли уже голос этого пользователя
    const existingVote = await pool.query(
      'SELECT id, value FROM votes WHERE room_track_id = $1 AND user_id = $2',
      [roomTrackId, userId]
    );

    if (existingVote.rows.length > 0) {
      // Если голос уже есть, обновляем его (или удаляем, если тот же самый)
      if (existingVote.rows[0].value === value) {
        // Удаляем голос (отмена)
        await pool.query('DELETE FROM votes WHERE room_track_id = $1 AND user_id = $2', [
          roomTrackId,
          userId,
        ]);
      } else {
        // Меняем голос
        await pool.query('UPDATE votes SET value = $1 WHERE room_track_id = $2 AND user_id = $3', [
          value,
          roomTrackId,
          userId,
        ]);
      }
    } else {
      // Добавляем новый голос
      await pool.query(
        'INSERT INTO votes (room_track_id, user_id, value) VALUES ($1, $2, $3)',
        [roomTrackId, userId, value]
      );
    }

    // Пересчитываем score для трека
    const scoreResult = await pool.query(
      'SELECT COALESCE(SUM(value), 0) as total_score FROM votes WHERE room_track_id = $1',
      [roomTrackId]
    );
    const newScore = parseInt(scoreResult.rows[0].total_score);

    await pool.query('UPDATE room_tracks SET score = $1 WHERE id = $2', [newScore, roomTrackId]);

    // Отправляем WebSocket событие об обновлении очереди
    const updatedQueue = await getRoomQueueData(roomId);
    io.to(roomId).emit('queue_update', updatedQueue);

    res.json({
      success: true,
      score: newScore,
      queue: updatedQueue,
    });
  } catch (error) {
    console.error('Vote track error:', error.message);
    res.status(500).json({ error: 'Failed to vote for track' });
  }
};

/**
 * Переход к следующему треку (для Host)
 * POST /api/rooms/:roomId/next
 */
export const nextTrackHandler = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;

    // Проверяем, что пользователь - host
    const roomCheck = await pool.query('SELECT host_id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (roomCheck.rows[0].host_id !== userId) {
      return res.status(403).json({ error: 'Only host can skip track' });
    }

    // Помечаем текущий трек как played
    await pool.query(
      "UPDATE room_tracks SET status = 'played' WHERE room_id = $1 AND status = 'playing'",
      [roomId]
    );

    // Находим следующий трек (с наивысшим score и oldest)
    const nextTrackQuery = `
      SELECT id FROM room_tracks
      WHERE room_id = $1 AND status = 'queued'
      ORDER BY score DESC, added_at ASC
      LIMIT 1
    `;
    const nextTrackResult = await pool.query(nextTrackQuery, [roomId]);

    let currentTrack = null;

    if (nextTrackResult.rows.length > 0) {
      // Помечаем следующий трек как playing
      await pool.query(
        "UPDATE room_tracks SET status = 'playing' WHERE id = $1",
        [nextTrackResult.rows[0].id]
      );

      // Получаем данные о текущем треке
      const currentTrackQuery = `
        SELECT 
          rt.id as room_track_id,
          t.yandex_track_id,
          t.title,
          t.artist,
          t.cover_url,
          t.duration_ms
        FROM room_tracks rt
        JOIN tracks t ON rt.track_id = t.id
        WHERE rt.id = $1
      `;
      const currentTrackResult = await pool.query(currentTrackQuery, [
        nextTrackResult.rows[0].id,
      ]);
      currentTrack = currentTrackResult.rows[0];
    }

    // Отправляем WebSocket событие о смене трека
    const updatedQueue = await getRoomQueueData(roomId);
    io.to(roomId).emit('track_changed', {
      currentTrack,
      queue: updatedQueue.queue,
    });

    res.json({
      success: true,
      currentTrack,
      queue: updatedQueue,
    });
  } catch (error) {
    console.error('Next track error:', error.message);
    res.status(500).json({ error: 'Failed to skip to next track' });
  }
};

/**
 * Завершение комнаты (только для Host)
 * POST /api/rooms/:roomId/end
 */
export const endRoomHandler = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId;

    // Проверяем, что пользователь - host
    const roomCheck = await pool.query('SELECT host_id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (roomCheck.rows[0].host_id !== userId) {
      return res.status(403).json({ error: 'Only host can end the room' });
    }

    // Помечаем комнату как неактивную
    await pool.query('UPDATE rooms SET is_active = FALSE WHERE id = $1', [roomId]);

    // Отправляем WebSocket событие о завершении комнаты
    io.to(roomId).emit('room_ended', { roomId });

    res.json({ success: true, message: 'Room ended' });
  } catch (error) {
    console.error('End room error:', error.message);
    res.status(500).json({ error: 'Failed to end room' });
  }
};

/**
 * Вспомогательная функция для получения данных очереди
 */
const getRoomQueueData = async (roomId) => {
  const query = `
    SELECT 
      rt.id as room_track_id,
      rt.status,
      rt.score,
      rt.added_at,
      rt.added_by_user_id,
      u.nickname as added_by_name,
      u.avatar_url as added_by_avatar,
      t.id as track_id,
      t.yandex_track_id,
      t.title,
      t.artist,
      t.cover_url,
      t.duration_ms
    FROM room_tracks rt
    JOIN tracks t ON rt.track_id = t.id
    JOIN users u ON rt.added_by_user_id = u.id
    WHERE rt.room_id = $1 AND rt.status != 'played'
    ORDER BY 
      CASE WHEN rt.status = 'playing' THEN 0 ELSE 1 END,
      rt.score DESC,
      rt.added_at ASC
  `;

  const result = await pool.query(query, [roomId]);
  const currentTrack = result.rows.find((row) => row.status === 'playing') || null;
  const queue = result.rows.filter((row) => row.status !== 'playing');

  return {
    queue,
    currentTrack,
    total: result.rows.length,
  };
};
