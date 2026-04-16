import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import tracksRoutes from './routes/tracks.js';
import roomsRoutes from './routes/rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Определяем путь к фронтенду
const FRONTEND_PATH = path.resolve(__dirname, '../../../front-end/public');

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Раздача статики фронтенда
app.use(express.static(FRONTEND_PATH));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/tracks', tracksRoutes);
app.use('/rooms', roomsRoutes);

// Обработка всех остальных запросов - возврат index.html для SPA
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
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
  console.log(`🔌 Client connected: ${socket.id}, User: ${socket.user?.userId}`);

  // Присоединение к комнате
  socket.on('join_room', async ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    
    // Уведомляем других участников о новом пользователе
    socket.to(roomId).emit('user_joined', {
      userId,
      socketId: socket.id,
    });
  });

  // Выход из комнаты
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room ${roomId}`);
  });

  // Голосование за трек
  socket.on('vote_track', async ({ roomId, roomTrackId, value, userId }) => {
    try {
      const { voteForTrack, getRoomQueue } = await import('./services/yandexMusicService.js');
      
      await voteForTrack(roomTrackId, userId, value);
      
      // Получаем обновленную очередь
      const queue = await getRoomQueue(roomId);
      
      // Рассылаем обновленную очередь всем в комнате
      io.to(roomId).emit('queue_update', { queue });
    } catch (error) {
      console.error('Vote error:', error.message);
      socket.emit('error_msg', { message: 'Ошибка при голосовании' });
    }
  });

  // Обновление состояния плеера (от хоста)
  socket.on('player_state', ({ roomId, status, currentTrack, timestamp }) => {
    // Рассылаем состояние всем в комнате (кроме отправителя)
    socket.to(roomId).emit('player_state', {
      status,
      currentTrack,
      timestamp,
    });
  });

  // Синхронное воспроизведение — хост запускает
  socket.on('sync_play', ({ roomId, currentTrack, progressMs, timestamp }) => {
    // Рассылаем всем в комнате команду начать воспроизведение
    io.to(roomId).emit('sync_play', {
      currentTrack,
      progressMs,
      timestamp: Date.now(), // Серверный timestamp для точной синхронизации
    });
  });

  // Синхронная пауза — хост ставит на паузу
  socket.on('sync_pause', ({ roomId, progressMs }) => {
    io.to(roomId).emit('sync_pause', {
      progressMs,
    });
  });

  // Синхронный seek — хост перематывает
  socket.on('sync_seek', ({ roomId, progressMs }) => {
    io.to(roomId).emit('sync_seek', {
      progressMs,
    });
  });

  // Периодическая синхронизация прогресса (heartbeat от хоста)
  socket.on('sync_heartbeat', ({ roomId, progressMs, isPlaying }) => {
    io.to(roomId).emit('sync_heartbeat', {
      progressMs,
      isPlaying,
    });
  });

  // Переход к следующему треку
  socket.on('next_track', async ({ roomId }) => {
    try {
      const { getNextTrackInQueue, setTrackAsPlaying, getCurrentTrackInRoom, getRoomQueue } = 
        await import('./services/yandexMusicService.js');
      
      const nextTrack = await getNextTrackInQueue(roomId);
      
      if (nextTrack) {
        await setTrackAsPlaying(roomId, nextTrack.room_track_id);
        const currentTrack = await getCurrentTrackInRoom(roomId);
        const queue = await getRoomQueue(roomId);
        
        io.to(roomId).emit('track_changed', {
          currentTrack,
          queue,
          status: 'playing',
        });
      } else {
        io.to(roomId).emit('track_changed', {
          currentTrack: null,
          queue: [],
          status: 'idle',
        });
      }
    } catch (error) {
      console.error('Next track error:', error.message);
      socket.emit('error_msg', { message: 'Ошибка при переключении трека' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Экспорт io для использования в контроллерах
export { io };

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});
