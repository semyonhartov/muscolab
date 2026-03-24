import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'collab_db',
  user: process.env.DB_USER || 'collab_user',
  password: process.env.DB_PASSWORD || 'collab_pass',
  max: 20, // максимальное количество подключений в пуле
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Проверка подключения
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Ошибка подключения к БД:', err.message);
  } else {
    release();
  }
});

export default pool;
