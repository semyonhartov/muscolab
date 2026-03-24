# Music Collab Backend (Yandex Music Edition)

Бэкенд для приложения совместного управления музыкальным плейлистом с интеграцией Яндекс Музыки.

## 🚀 Быстрый старт

### Требования
- Node.js >= 18.0.0
- Docker & Docker Compose
- Яндекс OAuth приложение (получить на https://oauth.yandex.ru/client/new)

### Установка

1. **Клонирование репозитория**
```bash
cd back-end/server
npm install
```

2. **Настройка переменных окружения**
```bash
cp src/.env.example .env
```

Заполните `.env` своими значениями:
```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=collab_db
DB_USER=collab_user
DB_PASSWORD=collab_pass

# JWT
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d

# Yandex OAuth
YANDEX_CLIENT_ID=your_client_id
YANDEX_CLIENT_SECRET=your_client_secret
YANDEX_REDIRECT_URI=http://localhost:3000/auth/callback

# Frontend
FRONTEND_URL=http://localhost:3000
```

3. **Запуск базы данных**
```bash
docker-compose up -d
```

4. **Запуск сервера**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

Сервер запустится на `http://localhost:5000`

## 📡 API Endpoints

### Авторизация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/auth/yandex` | Редирект на авторизацию Яндекс |
| GET | `/auth/callback` | Колбэк от Яндекс OAuth |
| GET | `/auth/me` | Данные текущего пользователя |
| POST | `/auth/logout` | Выход из системы |

### Треки

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/tracks/search?q=...` | Поиск треков через API Яндекс |
| GET | `/tracks/:id` | Получение трека по ID |
| POST | `/tracks/:id/save` | Добавить трек в личный плейлист |
| GET | `/tracks/saved` | Получение сохраненных треков |
| DELETE | `/tracks/saved/:trackId` | Удалить трек из сохраненных |

### Комнаты

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/rooms` | Создать комнату |
| POST | `/rooms/:code/join` | Войти в комнату по коду |
| GET | `/rooms/:id/queue` | Получить очередь треков |
| POST | `/rooms/:roomId/tracks` | Добавить трек в очередь |
| DELETE | `/rooms/:roomId/tracks/:roomTrackId` | Удалить трек из очереди |
| POST | `/rooms/:roomId/tracks/:roomTrackId/vote` | Голосовать за трек (+1/-1) |
| POST | `/rooms/:roomId/next` | Следующий трек (только Host) |
| POST | `/rooms/:roomId/end` | Завершить комнату (только Host) |

## 🔌 WebSocket Events

### Подключение
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'your-jwt-token' }
});
```

### События клиента → сервер

| Событие | Данные | Описание |
|---------|--------|----------|
| `join_room` | `roomId` | Присоединиться к комнате |
| `leave_room` | `roomId` | Выйти из комнаты |
| `get_queue` | `roomId, callback` | Запросить очередь |
| `vote_track` | `{ roomId, roomTrackId, value }` | Голосовать за трек |
| `player_state` | `{ roomId, state }` | Обновить состояние плеера |

### События сервер → клиент

| Событие | Данные | Описание |
|---------|--------|----------|
| `joined_room` | `{ roomId, userId }` | Подтверждение входа |
| `user_left` | `{ roomId, userId }` | Пользователь вышел |
| `queue_update` | `{ queue, currentTrack, total }` | Обновление очереди |
| `track_changed` | `{ currentTrack, queue }` | Сменился текущий трек |
| `room_ended` | `{ roomId }` | Комната завершена |

## 🗄️ Схема базы данных

### Таблицы

- **users** - Пользователи (данные из Яндекс профиля)
- **rooms** - Комнаты (6-значный код, host_id)
- **tracks** - Кэш метаданных треков из Яндекс
- **room_tracks** - Очередь треков в комнате
- **votes** - Голоса пользователей за треки
- **user_saved_tracks** - Сохраненные треки пользователей

## 🔐 Авторизация

Приложение использует OAuth 2.0 Яндекс для аутентификации.

**Настройка в Яндекс OAuth:**
1. Перейдите на https://oauth.yandex.ru/client/new
2. Создайте новое приложение
3. Укажите Redirect URI: `http://localhost:3000/auth/callback`
4. Выберите разрешения: `login:info`, `login:avatar`
5. Скопируйте Client ID и Client Secret в `.env`

**Важно:** В 2026 году Яндекс не предоставляет публичные scope `playlist:read/write` через OAuth. Сохранение в плейлист реализовано через локальную БД приложения.

## 🧪 Тестирование

### Проверка здоровья
```bash
curl http://localhost:5000/health
```

### Пример запроса с авторизацией
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:5000/tracks/search?q=Queen
```

## 🛠️ Разработка

### Линтинг
```bash
npm run lint
```

### Форматирование
```bash
npm run format
```

### Остановка базы данных
```bash
docker-compose down
```

### Сброс базы данных
```bash
docker-compose down -v
docker-compose up -d
```

## 📝 Примеры использования

### Создание комнаты
```javascript
const response = await fetch('http://localhost:5000/rooms', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});
const { room } = await response.json();
console.log(`Room code: ${room.code}`);
```

### Поиск и добавление трека
```javascript
// Поиск
const search = await fetch('http://localhost:5000/tracks/search?q=Bohemian%20Rhapsody', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
const { tracks } = await search.json();

// Добавление в очередь
await fetch(`http://localhost:5000/rooms/${roomId}/tracks`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ yandexTrackId: tracks[0].yandex_track_id })
});
```

### Голосование через WebSocket
```javascript
socket.emit('vote_track', {
  roomId: '1',
  roomTrackId: '5',
  value: 1 // +1 like или -1 dislike
}, (response) => {
  console.log(response);
});
```

## ⚠️ Ограничения API Яндекс Музыки (2026)

1. **Неофициальное API** - `api.music.yandex.net` не является официальным публичным API
2. **Нет прямого доступа к аудио** - для воспроизведения используйте iframe виджет Яндекса
3. **Нет playlist scope** - сохранение треков реализовано через локальную БД

## 📄 Лицензия

MIT
