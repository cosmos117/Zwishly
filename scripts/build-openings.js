// Run once with: npm run build-openings   (the output is committed to the repo)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';

const keyOf = (fen) => fen.split(' ').slice(0, 4).join(' ');
const rows = [];
for (const file of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
  rows.push(...(await res.text()).split('\n').slice(1).filter(Boolean).map((l) => l.split('\t')));
}

const familyOf = (name) => name.split(':')[0].split(',')[0];
const lines = rows.map(([eco, name, pgn]) => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return { eco, name, moves: chess.history(), key: keyOf(chess.fen()) };
});

// Transposed positions take the name from the larger opening family, not the dataset's file order.
const familySize = new Map();
for (const { name } of lines) familySize.set(familyOf(name), (familySize.get(familyOf(name)) ?? 0) + 1);
const preferred = (a, b) => familySize.get(familyOf(b.name)) - familySize.get(familyOf(a.name)) || a.name.length - b.name.length;

const map = {};
for (const line of [...lines].sort(preferred)) if (!map[line.key]) map[line.key] = [line.eco, line.name];
const named = new Set(Object.keys(map));

const continuations = new Map();
const START_KEY = keyOf(new Chess().fen());
for (const { eco, name, moves } of [...lines].sort((a, b) => a.moves.length - b.moves.length)) {
  const chess = new Chess();
  let label = null;
  const pending = [];
  for (const san of moves) {
    const fromKey = keyOf(chess.fen());
    if (!continuations.has(fromKey)) continuations.set(fromKey, new Map());
    const counts = continuations.get(fromKey);
    counts.set(san, (counts.get(san) ?? 0) + 1);

    chess.move(san);
    const key = keyOf(chess.fen());
    if (named.has(key)) {
      label = map[key];
      for (const k of pending) if (!map[k]) map[k] = label;
      pending.length = 0;
    } else if (label) {
      if (!map[key]) map[key] = label;
    } else {
      pending.push(key);
    }
  }
  for (const k of pending) if (!map[k]) map[k] = [eco, name];
}

const ranked = (key) => [...(continuations.get(key) ?? new Map())].sort((a, b) => b[1] - a[1]);
const out = {};
for (const [key, [eco, name]] of Object.entries(map)) {
  const next = ranked(key);
  out[key] = next.length ? [eco, name, next] : [eco, name];
}
out.start = ['', '', ranked(START_KEY)];

writeFileSync(join(root, 'public', 'openings.json'), JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} opening positions to public/openings.json`);
