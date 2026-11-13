import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';

// Accounts live in Turso (hosted, SQLite-compatible) when TURSO_DATABASE_URL is set,
// and in a local SQLite file otherwise. The queries are the same for both.
function connect() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  // Render's disk is wiped on every restart, so a local file there would lose every account.
  if (process.env.RENDER) console.warn('TURSO_DATABASE_URL is not set: accounts are stored on a disk that Render erases on restart.');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const path = process.env.DATABASE_PATH || join(root, 'data', 'zwishly.db');
  mkdirSync(dirname(path), { recursive: true });
  return createClient({ url: pathToFileURL(path).href });
}

export const db = connect();

export const run = (sql, ...args) => db.execute({ sql, args });
export const getRow = async (sql, ...args) => (await run(sql, ...args)).rows[0] ?? null;

await db.batch(
  [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,            -- null for accounts that only use a sign-in provider
      chesscom_username TEXT,
      lichess_username TEXT,
      created_at INTEGER NOT NULL,
      prefs TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)',
  ],
  'write',
);

// Columns added after the first release; existing databases pick them up here.
const columns = (await db.execute('PRAGMA table_info(users)')).rows.map((column) => column.name);
if (!columns.includes('prefs')) await db.execute('ALTER TABLE users ADD COLUMN prefs TEXT');
