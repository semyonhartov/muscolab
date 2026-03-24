import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.js';
import tracksRoutes from './routes/tracks.js';
import roomsRoutes from './routes/rooms.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/tracks', tracksRoutes);
app.use('/rooms', roomsRoutes);

// 404 handler - должен быть ПОСЛЕ всех остальных роутов
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket.io middleware для авторизации
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    console.error('Socket auth error:', error.message);
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  // Присоединение к комнате
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    
    // Отправляем подтверждение
    socket.emit('joined_room', { roomId, userId: socket.user.userId });
  });

  // Выход из комнаты
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    
    // Уведомляем других участников
    socket.to(roomId).emit('user_left', {
      roomId,
      userId: socket.user.userId,
    });
  });

  // Запрос на обновление очереди (клиент может запросить актуальное состояние)
  socket.on('get_queue', async (roomId, callback) => {
    try {
      const pool = (await import('./config/database.js')).default;
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
      
      callback({ success: true, queue, currentTrack });
    } catch (error) {
      callback({ success: false, error: 'Failed to get queue' });
    }
  });

  // Быстрое голосование через WebSocket (альтернатива REST API)
  socket.on('vote_track', async (data, callback) => {
    try {
      const { roomId, roomTrackId, value } = data;
      
      if (!roomId || !roomTrackId || (value !== 1 && value !== -1)) {
        return callback({ success: false, error: 'Invalid vote data' });
      }

      const pool = (await import('./config/database.js')).default;

      // Проверяем существование room_track
      const roomTrackCheck = await pool.query(
        'SELECT id, status FROM room_tracks WHERE id = $1 AND room_id = $2',
        [roomTrackId, roomId]
      );

      if (roomTrackCheck.rows.length === 0) {
        return callback({ success: false, error: 'Track not found' });
      }

      if (roomTrackCheck.rows[0].status === 'playing') {
        return callback({ success: false, error: 'Cannot vote for playing track' });
      }

      const userId = socket.user.userId;

      // Проверяем existing vote
      const existingVote = await pool.query(
        'SELECT id, value FROM votes WHERE room_track_id = $1 AND user_id = $2',
        [roomTrackId, userId]
      );

      if (existingVote.rows.length > 0) {
        if (existingVote.rows[0].value === value) {
          await pool.query('DELETE FROM votes WHERE room_track_id = $1 AND user_id = $2', [
            roomTrackId,
            userId,
          ]);
        } else {
          await pool.query('UPDATE votes SET value = $1 WHERE room_track_id = $2 AND user_id = $3', [
            value,
            roomTrackId,
            userId,
          ]);
        }
      } else {
        await pool.query(
          'INSERT INTO votes (room_track_id, user_id, value) VALUES ($1, $2, $3)',
          [roomTrackId, userId, value]
        );
      }

      // Пересчитываем score
      const scoreResult = await pool.query(
        'SELECT COALESCE(SUM(value), 0) as total_score FROM votes WHERE room_track_id = $1',
        [roomTrackId]
      );
      const newScore = parseInt(scoreResult.rows[0].total_score);

      await pool.query('UPDATE room_tracks SET score = $1 WHERE id = $2', [newScore, roomTrackId]);

      // Получаем обновленную очередь
      const queueQuery = `
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
      
      const result = await pool.query(queueQuery, [roomId]);
      const currentTrack = result.rows.find((row) => row.status === 'playing') || null;
      const queue = result.rows.filter((row) => row.status !== 'playing');

      // Рассылаем обновление всем в комнате
      io.to(roomId).emit('queue_update', {
        queue,
        currentTrack,
        total: result.rows.length,
      });

      callback({ success: true, score: newScore });
    } catch (error) {
      callback({ success: false, error: 'Vote failed' });
    }
  });

  // Player state update от Host (Play/Pause)
  socket.on('player_state', (data) => {
    const { roomId, state } = data; // state: { playing: boolean, currentTime: number }
    
    // Проверяем, что отправитель - host комнаты
    // (в продакшене нужна проверка через БД)
    
    // Рассылаем состояние всем в комнате
    socket.to(roomId).emit('player_state', {
      roomId,
      state,
      updatedBy: socket.user.userId,
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    // Cleanup on disconnect
  });
});

// Экспорт io для использования в контроллерах
export { io };

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.io ready for connections`);
});
