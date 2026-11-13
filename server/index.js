import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  MIN_PASSWORD,
  SESSION_COOKIE,
  SESSION_MS,
  allowAttempt,
  authenticate,
  cleanPrefs,
  createSession,
  createUser,
  destroySession,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeEmail,
  setLinkedAccounts,
  setPrefs,
  userFromToken,
} from './auth.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || (isDev ? 5173 : 3000);
// Secure cookies need HTTPS. Set COOKIE_SECURE=false only for a plain-HTTP private deployment.
const secureCookie = !isDev && process.env.COOKIE_SECURE !== 'false';

const app = express();
app.disable('x-powered-by');
// Number of reverse proxies in front of the app, so rate limits see the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const api = express.Router();
api.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

api.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const { origin } = req.headers;
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'Request blocked.' });
  }
  next();
});
api.use(express.json({ limit: '10kb' }));

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' };

function startSession(res, userId) {
  res.cookie(SESSION_COOKIE, createSession(userId), { ...cookieOptions, maxAge: SESSION_MS });
}

function credentials(req) {
  const { email, password } = req.body ?? {};
  return { email: typeof email === 'string' ? normalizeEmail(email) : '', password };
}

function rateLimited(req, res, email) {
  // Each attempt counts against both limits, so test both rather than short-circuiting.
  const byIp = allowAttempt(`ip:${req.ip}`, 30);
  const byAccount = allowAttempt(`account:${req.ip}:${email}`, 8);
  if (byIp && byAccount) return false;
  res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
  return true;
}

api.post('/auth/register', async (req, res) => {
  const { email, password } = credentials(req);
  if (rateLimited(req, res, email)) return;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: `Use a password of at least ${MIN_PASSWORD} characters.` });
  }
  const created = await createUser(email, password);
  if (!created) return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });
  startSession(res, created.id);
  res.status(201).json({ user: created.user });
});

api.post('/auth/login', async (req, res) => {
  const { email, password } = credentials(req);
  if (rateLimited(req, res, email)) return;
  const account = isValidEmail(email) && isValidPassword(password) ? await authenticate(email, password) : null;
  if (!account) return res.status(401).json({ error: 'That email and password don’t match.' });
  startSession(res, account.id);
  res.json({ user: account.user });
});

api.post('/auth/logout', (req, res) => {
  destroySession(readCookie(req, SESSION_COOKIE));
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ ok: true });
});

function currentUser(req) {
  return userFromToken(readCookie(req, SESSION_COOKIE));
}

api.get('/me', (req, res) => {
  res.json({ user: currentUser(req)?.user ?? null });
});

api.put('/me/accounts', (req, res) => {
  const account = currentUser(req);
  if (!account) return res.status(401).json({ error: 'Please sign in again.' });
  const clean = (name) => (typeof name === 'string' && name.trim() ? name.trim() : null);
  const chesscom = clean(req.body?.chesscom);
  const lichess = clean(req.body?.lichess);
  for (const name of [chesscom, lichess]) {
    if (name !== null && !isValidUsername(name)) return res.status(400).json({ error: 'That doesn’t look like a valid username.' });
  }
  res.json({ user: setLinkedAccounts(account.id, chesscom, lichess) });
});

api.put('/me/prefs', (req, res) => {
  const account = currentUser(req);
  if (!account) return res.status(401).json({ error: 'Please sign in again.' });
  const prefs = cleanPrefs(req.body);
  if (!prefs) return res.status(400).json({ error: 'Invalid request.' });
  res.json({ user: setPrefs(account.id, prefs) });
});

api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
api.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.use('/api', api);

if (isDev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true } });
  app.use(vite.middlewares);
} else {
  app.use(express.static(join(root, 'dist'), { extensions: ['html'] }));
}

app.listen(port, () => console.log(`Zwishly running at http://localhost:${port}`));
