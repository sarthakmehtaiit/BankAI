import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

// Postgres BIGINT comes back as a string by default. Our paise amounts fit safely
// in a JS number (up to 9 * 10^15), so we convert them to numbers.
pg.types.setTypeParser(20, (value) => Number(value));
// Keep DATE columns as plain 'YYYY-MM-DD' text, so time zones never shift a birthday.
pg.types.setTypeParser(1082, (value) => value);

let pool;

// The pool is created on first use, so tests can choose the database first.
export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
    pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

// Runs fn inside one database transaction: everything inside either all
// happens (COMMIT) or none of it happens (ROLLBACK).
export async function transaction(fn) {
  const client = await getPool().connect();
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

export async function applySchema() {
  const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await query(sql);
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
