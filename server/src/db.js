import pg from 'pg';
import { config } from './config.js';

// BIGINT(int8) → Number（避免前端到处遇到字符串数字；计数场景远小于 2^53 安全）
pg.types.setTypeParser(20, Number);

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

/** 执行单条 SQL，返回 rows */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** 执行单条 SQL，返回完整 result（用于 INSERT RETURNING 等） */
export async function queryResult(text, params = []) {
  return pool.query(text, params);
}

/** 事务执行：fn(client) 内用 client.query */
export async function withTransaction(fn) {
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
}

export default pool;
