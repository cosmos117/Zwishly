// Runs after the build. Writes dist/_headers, which static hosts such as Cloudflare Pages and
// Netlify read to send the same security and caching headers as server/index.js.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../server/static.js';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const WEEK = 7 * 24 * 60 * 60;

const rules = {
  '/*': {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=15552000',
    'Content-Security-Policy': contentSecurityPolicy(dist),
  },
  // Vite puts a content hash in these names, so a new build never reuses an old address.
  '/assets/*': { 'Cache-Control': 'public, max-age=31536000, immutable' },
  '/engine/*': { 'Cache-Control': `public, max-age=${WEEK}` },
  '/pieces/*': { 'Cache-Control': `public, max-age=${WEEK}` },
};

const text = Object.entries(rules)
  .map(([path, headers]) => [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n'))
  .join('\n\n');
writeFileSync(join(dist, '_headers'), `${text}\n`);
console.log('Wrote dist/_headers');
