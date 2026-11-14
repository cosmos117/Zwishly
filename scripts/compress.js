// Runs after the build. Writes a Brotli and a gzip copy next to every text file in dist/,
// so the server can send them as they are instead of compressing on every request.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

// Cloudflare Pages compresses on its own, and the copies would only be uploaded as extra files.
if (process.env.CF_PAGES) {
  console.log('Cloudflare Pages build: skipping precompressed copies');
  process.exit(0);
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.md']);
const MIN_BYTES = 1024;

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let before = 0;
let after = 0;

for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !COMPRESSIBLE.has(extname(entry.name))) continue;
  const path = join(entry.parentPath, entry.name);
  const data = readFileSync(path);
  if (data.length < MIN_BYTES) continue;
  const brotli = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  });
  writeFileSync(`${path}.br`, brotli);
  writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }));
  before += data.length;
  after += brotli.length;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
console.log(`Compressed dist: ${mb(before)} of text is ${mb(after)} with Brotli`);
