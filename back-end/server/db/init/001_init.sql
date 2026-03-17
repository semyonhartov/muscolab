-- 001_init.sql
-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    yandex_id VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица комнат
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    host_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_host ON rooms(host_id);

-- Таблица треков (кэш метаданных Яндекс)
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    yandex_track_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    cover_url TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tracks_yandex_id ON tracks(yandex_track_id);

-- Таблица очереди (треки в комнате)
CREATE TABLE IF NOT EXISTS room_tracks (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    score INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'playing', 'played')),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, track_id, status)
);
CREATE INDEX idx_room_tracks_room ON room_tracks(room_id, status);
CREATE INDEX idx_room_tracks_score ON room_tracks(score DESC);

-- Таблица голосов
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    room_track_id INTEGER REFERENCES room_tracks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value INTEGER CHECK (value IN (1, -1)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_track_id, user_id)
);
CREATE INDEX idx_votes_room_track ON votes(room_track_id);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
