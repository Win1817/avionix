// shared/db/connection.js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'avionix',
  user: process.env.DB_USER || 'avionix',
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const query = (text, params) => pool.query(text, params);

export const queryOne = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
};

export const queryAll = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows;
};

export const transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const healthCheck = async () => {
  const result = await query('SELECT NOW() as time, version() as pg_version');
  return result.rows[0];
};

export default pool;
