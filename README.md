# 🎵 Music Sync Room - Музыкальный плейлист-коллаборатор

Веб-приложение для совместного прослушивания музыки в реальном времени с интеграцией **Яндекс Музыки**.

## ✨ Возможности

- 🔐 **Авторизация через Яндекс OAuth** - вход через аккаунт Яндекс Музыки
- 🏠 **Комнаты** - создание комнат с уникальным 6-значным кодом, приглашение друзей
- 🔍 **Поиск треков** - поиск через Яндекс Музыка API
- 📋 **Очередь воспроизведения** - добавление треков в общую очередь
- 👍 **Голосование** - лайки/дизлайки влияют на порядок треков в очереди
- 🎧 **Синхронный плеер** - ведущий управляет воспроизведением для всех участников
- 💾 **Сохранение треков** - добавление понравившихся треков в личный плейлист Яндекс

## 🛠 Технологический стек

- **Frontend:** HTML, CSS, Vanilla JavaScript, Socket.io Client
- **Backend:** Node.js, Express, Socket.io
- **Database:** PostgreSQL
- **API:** Яндекс Музыка API, Яндекс OAuth 2.0

## 📋 Требования

- Node.js >= 18.0.0
- PostgreSQL >= 15
- Docker & Docker Compose (опционально, для быстрого старта БД)

## 🚀 Быстрый старт

### 1. Настройка базы данных

**Вариант A: Docker (рекомендуется)**

```bash
cd back-end
docker-compose up -d
```

База данных будет доступна на `localhost:5432`, pgAdmin на `localhost:5050`.

**Вариант B: Локальная установка PostgreSQL**

Создайте базу данных и пользователя:
```sql
CREATE DATABASE collab_db;
CREATE USER collab_user WITH PASSWORD 'collab_pass';
GRANT ALL PRIVILEGES ON DATABASE collab_db TO collab_user;
```

Запустите скрипт инициализации:
```bash
psql -U collab_user -d collab_db -f db/init/001_init.sql
```

### 2. Настройка бэкенда

```bash
cd back-end/server
npm install
```

Создайте файл `.env` (скопируйте из `.env.example` если есть):

```bash
# === Server ===
PORT=5000
NODE_ENV=development

# === Database ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=collab_db
DB_USER=collab_user
DB_PASSWORD=collab_pass

# === JWT ===
JWT_SECRET=change_this_in_production_secret_key_12345
JWT_EXPIRES_IN=7d

# === Yandex OAuth ===
YANDEX_CLIENT_ID=ваш_client_id
YANDEX_CLIENT_SECRET=ваш_client_secret
YANDEX_REDIRECT_URI=http://localhost:3000/auth/callback

# === Frontend ===
FRONTEND_URL=http://localhost:3000
```

### 3. Настройка Яндекс OAuth

1. Перейдите на [https://oauth.yandex.ru/client/new](https://oauth.yandex.ru/client/new)
2. Создайте новое приложение
3. Укажите **Redirect URI**: `http://localhost:3000/auth/callback`
4. Выберите права доступа (scopes):
   - `login:info` - получение имени и аватара
   - `login:avatar` - получение аватара пользователя
   - `playlist:read` - чтение плейлистов (опционально)
   - `playlist:write` - добавление треков в плейлист
5. Сохраните **Client ID** и **Client Secret** в файл `.env`

### 4. Запуск бэкенда

```bash
cd back-end/server
npm run dev
```

Сервер запустится на `http://localhost:5000`

### 5. Настройка фронтенда

Фронтенд можно запустить через любой статический сервер. Например:

**Вариант A: Простой HTTP сервер**

```bash
cd front-end/public
npx http-server -p 3000
```

**Вариант B: Live Server (для разработки)**

Откройте `front-end/public/index.html` через расширение Live Server в VS Code.

**Вариант C: Vite/React (для продакшена)**

Настройте сборку проекта на React/Vite при необходимости.

Фронтенд будет доступен на `http://localhost:3000`

## 🎮 Как использовать

1. **Авторизация**: Нажмите "Войти через Яндекс" и предоставьте доступ к вашему аккаунту
2. **Создание комнаты**: Введите имя и нажмите "Создать комнату" - вы получите 6-значный код
3. **Приглашение друзей**: Отправьте код комнаты друзьям
4. **Поиск треков**: Введите название трека или исполнителя в поле поиска
5. **Добавление в очередь**: Нажмите "+ В очередь" у найденного трека
6. **Голосование**: Используйте 👍 и 👎 для влияния на порядок треков
7. **Воспроизведение**: Ведущий может управлять плеером (Play/Pause/Next)
8. **Сохранение**: Нажмите "💾 Сохранить в плейлист" для добавления трека в вашу Яндекс Музыку

## 📁 Структура проекта

```
muscolab/
├── back-end/
│   ├── docker-compose.yml      # Конфигурация Docker для БД
│   └── server/
│       ├── .env                # Переменные окружения
│       ├── package.json
│       ├── db/
│       │   └── init/
│       │       └── 001_init.sql  # Схема БД
│       └── src/
│           ├── index.js          # Точка входа сервера
│           ├── config/
│           │   └── database.js   # Подключение к PostgreSQL
│           ├── controllers/
│           │   ├── authController.js
│           │   ├── tracksController.js
│           │   └── roomsController.js
│           ├── services/
│           │   ├── yandexAuthService.js   # Яндекс OAuth
│           │   └── yandexMusicService.js  # Яндекс Музыка API
│           ├── middleware/
│           │   └── auth.js       # JWT авторизация
│           └── routes/
│               ├── auth.js
│               ├── tracks.js
│               └── rooms.js
└── front-end/
    └── public/
        ├── index.html
        ├── script.js
        ├── style.css
        └── app.js
```

## 🔌 API Endpoints

### Авторизация
- `GET /auth/yandex` - Редирект на Яндекс OAuth
- `GET /auth/callback` - Обработка колбэка от Яндекса
- `GET /auth/me` - Данные текущего пользователя (требуется токен)
- `POST /auth/logout` - Выход из системы

### Треки
- `GET /tracks/search?q=...` - Поиск треков
- `POST /tracks/:yandexId/add-to-room/:roomId` - Добавить трек в очередь комнаты
- `POST /tracks/vote` - Голосование за трек
- `POST /tracks/:yandexId/save` - Добавить трек в личный плейлист
- `GET /tracks/rooms/:roomId/queue` - Получить очередь комнаты

### Комнаты
- `POST /rooms` - Создать комнату
- `POST /rooms/:code/join` - Присоединиться к комнате
- `POST /rooms/:id/leave` - Выйти из комнаты
- `GET /rooms/:id/state` - Получить состояние комнаты
- `DELETE /rooms/:roomId/tracks/:roomTrackId` - Удалить трек из очереди (хост)
- `POST /rooms/:roomId/next-track` - Следующий трек (хост)

## 🔌 WebSocket Events

- `join_room` - Присоединение к комнате
- `leave_room` - Выход из комнаты
- `vote_track` - Голосование за трек
- `player_state` - Изменение состояния плеера
- `next_track` - Переход к следующему треку
- `queue_update` - Обновление очереди (сервер → клиент)
- `track_changed` - Смена трека (сервер → клиент)
- `user_joined` - Новый участник (сервер → клиент)

## 🐛 Решение проблем

### Ошибка подключения к базе данных
- Убедитесь, что PostgreSQL запущен
- Проверьте параметры подключения в `.env`
- Для Docker: `docker-compose ps`

### Ошибка авторизации Яндекс
- Проверьте `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`
- Убедитесь, что Redirect URI совпадает с настройками в Яндекс OAuth
- Проверьте, что токены не истекли

### Socket.io не подключается
- Проверьте, что бэкенд запущен на порту 5000
- Убедитесь, что CORS настроен правильно
- Проверьте JWT токен в localStorage

## 📝 Лицензия

MIT

## 👥 Авторы

Проект создан в рамках обучения/хакатона.
