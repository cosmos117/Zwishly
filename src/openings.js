import { START_FEN, positionKey } from './chess-utils.js';

const START_KEY = positionKey(START_FEN);
let book = null;
let loading = null;

export function loadOpenings() {
  loading ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
    .then((data) => (book = data));
  return loading;
}

export function openingAt(fen) {
  return book?.[positionKey(fen)] ?? null;
}

export function continuationsAt(fen) {
  if (!book) return [];
  const key = positionKey(fen);
  return (key === START_KEY ? book.start : book[key])?.[2] ?? [];
}
