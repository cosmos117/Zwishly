// Serves the site. Everything else (analysis, game lookups, saved usernames and settings) happens in the
// visitor's browser, so there is no API or database here.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { contentSecurityPolicy, staticFiles } from './static.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || (isDev ? 5173 : 3000);

const app = express();
app.disable('x-powered-by');

const dist = join(root, 'dist');
// Vite's dev server injects its own inline scripts, so the policy applies to the built site only.
const csp = isDev ? null : contentSecurityPolicy(dist);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (csp) res.setHeader('Content-Security-Policy', csp);
  if (!isDev) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Point a free uptime monitor here to keep a sleeping host awake.
app.get('/healthz', (req, res) => res.type('text').set('Cache-Control', 'no-store').send('ok'));

if (isDev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true } });
  app.use(vite.middlewares);
} else {
  app.use(staticFiles(dist));
}

const notFoundPage = join(dist, '404.html');
app.use((req, res) => {
  if (!isDev && req.accepts('html')) return res.status(404).sendFile(notFoundPage, () => res.end());
  res.status(404).type('text').send('Not found.');
});
// Without this, Express answers a failed request with a stack trace.
app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).type('text').send(status === 500 ? 'Something went wrong on our side.' : 'Bad request.');
});

const server = app.listen(port, () => console.log(`Zwishly running at http://localhost:${port}`));

// Let requests in flight finish when the host stops or redeploys the app.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
