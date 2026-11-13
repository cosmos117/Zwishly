import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import express from 'express';

const DAY = 24 * 60 * 60;
const ENCODINGS = [
  { name: 'br', extension: '.br' },
  { name: 'gzip', extension: '.gz' },
];

function cacheControl(file) {
  // Vite puts a content hash in these names, so a new build never reuses an old address.
  if (file.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (file.endsWith('.html')) return 'no-cache';
  if (file.startsWith('/engine/') || file.startsWith('/pieces/')) return `public, max-age=${7 * DAY}`;
  return `public, max-age=${DAY}`;
}

const accepts = (header, name) => new RegExp(`(^|[\\s,])${name}\\s*(,|;(?!\\s*q=0(\\.0*)?\\s*(,|$))|$)`).test(header);

// Serves the built site. Files are listed once at startup, so a request for a path that
// doesn't exist never touches the disk, and the copies made by scripts/compress.js are
// sent when the browser accepts them.
export function staticFiles(dir) {
  const files = new Set(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `/${relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/')}`),
  );
  const isCopy = (file) => ENCODINGS.some(({ extension }) => file.endsWith(extension) && files.has(file.slice(0, -extension.length)));
  const resolve = (path) => [path, `${path}.html`, `${path}index.html`].find((file) => files.has(file) && !isCopy(file));
  const send = express.static(dir, { index: false, redirect: false, dotfiles: 'ignore' });

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let file;
    try {
      file = resolve(decodeURIComponent(req.path));
    } catch {
      return next();
    }
    if (!file) return next();

    const accepted = String(req.headers['accept-encoding'] ?? '');
    const available = ENCODINGS.filter(({ extension }) => files.has(file + extension));
    const encoding = available.find(({ name }) => accepts(accepted, name));
    res.setHeader('Cache-Control', cacheControl(file));
    res.type(extname(file));
    if (available.length) res.setHeader('Vary', 'Accept-Encoding');
    if (encoding) res.setHeader('Content-Encoding', encoding.name);
    req.url = file + (encoding?.extension ?? '');
    send(req, res, next);
  };
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

// The pages carry two small inline scripts (theme and loader). Allowing them by hash keeps
// every other inline script, including an injected one, blocked.
export function contentSecurityPolicy(dir) {
  const hashes = new Set();
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.html'))) {
    for (const [, script] of readFileSync(join(dir, name), 'utf8').matchAll(INLINE_SCRIPT)) {
      // Browsers turn Windows line endings into plain newlines before hashing, so do the same here.
      const text = script.replace(/\r\n?/g, '\n');
      hashes.add(`'sha256-${createHash('sha256').update(text).digest('base64')}'`);
    }
  }
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the Stockfish worker compile its WebAssembly, and nothing else.
    `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.chess.com https://lichess.org",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
