# 📋 Отчёт о готовности бэкенда (Дни 2-3)

## ✅ Выполненные задачи

### Code Review (День 1)
- [x] Проведён анализ текущей реализации
- [x] Выявлены проблемы с API Яндекс (отсутствие playlist scope в 2026)
- [x] Обновлена конфигурация ESLint v9+
- [x] Исправлены предупреждения линтинга

### Реализация День 2
- [x] **yandexMusicService.js** — сервис для работы с API Яндекс Музыки
  - `searchTracks()` — поиск треков
  - `getTrackById()` — получение метаданных трека
  - `saveTrackToCache()` — кэширование в БД
  - `saveTrackToUserPlaylist()` — сохранение в плейлист пользователя
  - `getUserSavedTracks()` — получение сохранённых треков
- [x] **tracksController.js** — контроллер для треков
- [x] Обновлён **routes/tracks.js** с новыми endpoints
- [x] Обновлена схема БД (добавлена `user_saved_tracks`, `cover_uri`)

### Реализация День 3
- [x] **roomsController.js** — полный CRUD для комнат
  - `createRoomHandler()` — создание комнаты
  - `joinRoomHandler()` — присоединение по коду
  - `getRoomQueueHandler()` — получение очереди с сортировкой
  - `addTrackToRoomHandler()` — добавление трека в очередь
  - `removeTrackFromRoomHandler()` — удаление трека
  - `voteTrackHandler()` — голосование (+1/-1)
  - `nextTrackHandler()` — переход к следующему треку (Host)
  - `endRoomHandler()` — завершение комнаты (Host)
- [x] Обновлён **routes/rooms.js**
- [x] Обновлён **index.js** с WebSocket событиями
  - `join_room` / `leave_room`
  - `get_queue` — запрос очереди
  - `vote_track` — голосование через WebSocket
  - `player_state` — синхронизация плеера
- [x] Сортировка очереди: playing → score DESC → added_at ASC

## 📁 Структура проекта

```
back-end/
├── docker-compose.yml          # PostgreSQL + pgAdmin
├── README.md                   # Документация API
└── server/
    ├── .env                    # Переменные окружения
    ├── .prettierrc             # Настройки форматирования
    ├── eslint.config.js        # ESLint v9 конфигурация
    ├── package.json
    ├── test-db.js
    ├── db/init/
    │   └── 001_init.sql        # Миграции БД
    └── src/
        ├── index.js            # Точка входа + Socket.io
        ├── .env.example
        ├── config/
        │   └── database.js     # PostgreSQL подключение
        ├── controllers/
        │   ├── authController.js    # Авторизация Яндекс
        │   ├── roomsController.js   # Комнаты + очередь + голоса
        │   └── tracksController.js  # Поиск + плейлист
        ├── middleware/
        │   └── auth.js         # JWT авторизация
        ├── routes/
        │   ├── auth.js
        │   ├── rooms.js
        │   └── tracks.js
        └── services/
            ├── yandexAuthService.js  # OAuth Яндекс
            └── yandexMusicService.js # API Яндекс Музыки
```

## 🗄️ Схема базы данных

| Таблица | Описание |
|---------|----------|
| `users` | Пользователи (yandex_id, nickname, avatar_url, tokens) |
| `rooms` | Комнаты (6-значный код, host_id, is_active) |
| `tracks` | Кэш метаданных (yandex_track_id, title, artist, cover_url) |
| `room_tracks` | Очередь в комнате (room_id, track_id, score, status) |
| `votes` | Голоса (room_track_id, user_id, value ±1) |
| `user_saved_tracks` | Сохранённые треки пользователей |

## 🔌 API Endpoints

### Авторизация
- `GET /auth/yandex` — редирект на OAuth Яндекс
- `GET /auth/callback` — обработка колбэка
- `GET /auth/me` — данные пользователя
- `POST /auth/logout` — выход

### Треки
- `GET /tracks/search?q=...` — поиск через API Яндекс
- `GET /tracks/:id` — получение трека
- `POST /tracks/:id/save` — добавить в плейлист
- `GET /tracks/saved` — список сохранённых
- `DELETE /tracks/saved/:trackId` — удалить из сохранённых

### Комнаты
- `POST /rooms` — создать комнату
- `POST /rooms/:code/join` — войти по коду
- `GET /rooms/:id/queue` — получить очередь
- `POST /rooms/:roomId/tracks` — добавить трек
- `DELETE /rooms/:roomId/tracks/:roomTrackId` — удалить трек
- `POST /rooms/:roomId/tracks/:roomTrackId/vote` — голосовать
- `POST /rooms/:roomId/next` — следующий трек (Host)
- `POST /rooms/:roomId/end` — завершить комнату (Host)

## 🚀 Статус запуска

| Компонент | Статус |
|-----------|--------|
| PostgreSQL | ✅ Запущен (порт 5432) |
| Сервер | ✅ Запущен (порт 5000) |
| Health check | ✅ Работает |
| ESLint | ✅ 0 ошибок, 6 предупреждений |
| БД таблицы | ✅ 6 таблиц создано |

## ⚠️ Важные замечания по API Яндекс (2026)

1. **OAuth scope**: `playlist:read` и `playlist:write` **НЕдоступны** в публичном OAuth Яндекса
2. **API**: `api.music.yandex.net` — неофициальное, может работать нестабильно
3. **Воспроизведение**: требуется iframe виджет Яндекса (прямые ссылки недоступны)
4. **Решение**: сохранение в плейлист реализовано через локальную БД

## 📝 Чеклист для тестирования

### 1. Авторизация
- [ ] Получить Client ID/Secret на https://oauth.yandex.ru/client/new
- [ ] Настроить Redirect URI: `http://localhost:3000/auth/callback`
- [ ] Протестировать вход через Яндекс
- [ ] Проверить сохранение токенов в БД

### 2. Поиск треков
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:5000/tracks/search?q=Queen"
```

### 3. Комнаты
```bash
# Создание
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/rooms

# Вход по коду
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/rooms/123456/join
```

### 4. WebSocket
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

socket.emit('join_room', 'roomId');
socket.emit('vote_track', { roomId, roomTrackId, value: 1 }, callback);
```

### 5. Голосование и сортировка
- [ ] Добавить 3+ трека в очередь
- [ ] Проголосовать за треки (+1/-1)
- [ ] Проверить пересортировку очереди
- [ ] Проверить запрет голосования за playing трек

### 6. Сохранение треков
```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/tracks/12345/save
```

## 🎯 Следующие шаги

1. **Frontend**: React приложение для интеграции с бэкендом
2. **Виджет Яндекса**: iframe для воспроизведения
3. **Refresh токенов**: автоматическое обновление access_token
4. **Шифрование**: криптография для токенов в БД
5. **Rate limiting**: защита API Яндекс от частых запросов

---

**Дата**: 24 марта 2026  
**Статус**: ✅ Готово к интеграции с фронтендом
