import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'collab_db',
  user: 'collab_user',
  password: 'collab_pass',
});

try {
  const res = await pool.query('SELECT NOW()');
  console.log('✅ DB connected:', res.rows[0]);
} catch (err) {
  console.error('❌ DB error:', err.message);
} finally {
  await pool.end();
}
