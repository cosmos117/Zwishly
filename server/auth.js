import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);

// OWASP-recommended scrypt profile (N=2^15, r=8, p=3).
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

export const SESSION_COOKIE = 'zw_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(key, expected);
}

// Verified when the email is unknown, so a missing account takes as long as a wrong password.
const dummyHash = await hashPassword(randomBytes(16).toString('hex'));

export const isValidEmail = (email) => typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
export const isValidPassword = (pw) => typeof pw === 'string' && pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD;
export const isValidUsername = (name) => typeof name === 'string' && USERNAME_RE.test(name);
export const normalizeEmail = (email) => email.trim().toLowerCase();

const publicUser = (row) => ({
  email: row.email,
  chesscom: row.chesscom_username,
  lichess: row.lichess_username,
  prefs: row.prefs ? JSON.parse(row.prefs) : null,
});

const insertUser = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)');
const userByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const userById = db.prepare('SELECT * FROM users WHERE id = ?');

export async function createUser(email, password) {
  const hash = await hashPassword(password);
  try {
    const { lastInsertRowid } = insertUser.run(email, hash, Date.now());
    return { id: Number(lastInsertRowid), user: publicUser(userById.get(lastInsertRowid)) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return null;
    throw e;
  }
}

export async function authenticate(email, password) {
  const row = userByEmail.get(email);
  // password_hash is null for accounts that only sign in through a provider such as Google.
  const ok = await verifyPassword(password, row?.password_hash ?? dummyHash);
  return row?.password_hash && ok ? { id: row.id, user: publicUser(row) } : null;
}

const updateLinks = db.prepare('UPDATE users SET chesscom_username = ?, lichess_username = ? WHERE id = ?');

export function setLinkedAccounts(userId, chesscom, lichess) {
  updateLinks.run(chesscom, lichess, userId);
  return publicUser(userById.get(userId));
}

const THEME_ID_RE = /^[A-Za-z0-9-]{1,32}$/;
const THEME_KEYS = ['site', 'board', 'pieces', 'soundPack'];
const TOGGLE_KEYS = ['coords', 'arrows', 'badges', 'sound'];

export function cleanPrefs(input) {
  if (!input || typeof input !== 'object') return null;
  const prefs = {};
  for (const key of THEME_KEYS) {
    if (typeof input[key] !== 'string' || !THEME_ID_RE.test(input[key])) return null;
    prefs[key] = input[key];
  }
  for (const key of TOGGLE_KEYS) {
    if (typeof input[key] !== 'boolean') return null;
    prefs[key] = input[key];
  }
  return prefs;
}

const updatePrefs = db.prepare('UPDATE users SET prefs = ? WHERE id = ?');

export function setPrefs(userId, prefs) {
  updatePrefs.run(JSON.stringify(prefs), userId);
  return publicUser(userById.get(userId));
}

// The cookie holds a random token; only its hash is stored, so a leaked database
// can't be replayed as live sessions.
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
const sessionUser = db.prepare(
  'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  insertSession.run(hashToken(token), userId, Date.now() + SESSION_MS);
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  const row = sessionUser.get(hashToken(token), Date.now());
  return row ? { id: row.id, user: publicUser(row) } : null;
}

export function destroySession(token) {
  if (token) deleteSession.run(hashToken(token));
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 100_000;
const buckets = new Map();

function dropExpiredBuckets(now) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export function allowAttempt(key, limit) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // A flood from many addresses can't grow the table without bound; it is refused instead.
    if (buckets.size >= MAX_BUCKETS) dropExpiredBuckets(now);
    if (buckets.size >= MAX_BUCKETS) return false;
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= limit;
}

setInterval(() => dropExpiredBuckets(Date.now()), WINDOW_MS).unref();
setInterval(() => deleteExpired.run(Date.now()), 60 * 60 * 1000).unref();
