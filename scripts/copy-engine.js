import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'stockfish', 'bin');
const destination = join(root, 'public', 'engine');

mkdirSync(destination, { recursive: true });
for (const file of ENGINE_FILES) copyFileSync(join(source, file), join(destination, file));
console.log('Stockfish engine copied to public/engine');
