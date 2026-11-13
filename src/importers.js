import { Chess } from 'chess.js';

export const TIME_CLASSES = [
  { id: 'bullet', label: 'Bullet' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
];

export const SITES = {
  chesscom: { name: 'Chess.com' },
  lichess: { name: 'Lichess' },
};

export async function playerExists(site, username) {
  const name = encodeURIComponent(username);
  const url = site === 'lichess' ? `https://lichess.org/api/user/${name}` : `https://api.chess.com/pub/player/${name.toLowerCase()}`;
  try {
    return (await fetch(url)).status !== 404;
  } catch {
    return true;
  }
}

const GAMES_PER_CLASS = 30;
const CHESSCOM_MONTHS = 6;

export function fetchGames(site, username) {
  return site === 'lichess' ? fetchLichess(username) : fetchChessCom(username);
}

async function fetchChessCom(username) {
  const user = username.toLowerCase();
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  if (res.status === 404) throw new Error(`We couldn’t find “${username}” on Chess.com.`);
  if (!res.ok) throw new Error('Chess.com isn’t responding right now. Try again in a moment.');
  const { archives = [] } = await res.json();

  const groups = { bullet: [], blitz: [], rapid: [] };
  const months = archives.slice(-CHESSCOM_MONTHS).reverse();
  let loadedMonths = 0;
  for (const url of months) {
    if (Object.values(groups).every((list) => list.length >= GAMES_PER_CLASS)) break;
    // A single month can fail on its own (the current one sometimes does), so skip it.
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const { games = [] } = await r.json();
      loadedMonths++;
      for (const g of [...games].reverse()) {
        if (g.rules === 'chess' && g.pgn && groups[g.time_class]) groups[g.time_class].push(chessComGame(g, user));
      }
    } catch {
      // try the next month
    }
  }
  if (months.length && !loadedMonths) throw new Error('Chess.com isn’t responding right now. Try again in a moment.');
  for (const key of Object.keys(groups)) groups[key] = groups[key].slice(0, GAMES_PER_CLASS);
  return groups;
}

function chessComGame(g, user) {
  return {
    white: g.white.username,
    whiteElo: g.white.rating,
    black: g.black.username,
    blackElo: g.black.rating,
    result: g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '½-½',
    playedAt: (g.end_time ?? 0) * 1000,
    pgn: g.pgn,
    userColor: g.black.username?.toLowerCase() === user ? 'black' : 'white',
  };
}

// Lichess asks clients to send one request at a time, so these run in sequence.
const LICHESS_PERFS = { bullet: 'ultraBullet,bullet', blitz: 'blitz', rapid: 'rapid' };

async function fetchLichess(username) {
  const user = username.toLowerCase();
  const groups = {};
  for (const [id, perfType] of Object.entries(LICHESS_PERFS)) {
    const params = new URLSearchParams({ max: GAMES_PER_CLASS, perfType, pgnInJson: 'true', clocks: 'false', evals: 'false', opening: 'true' });
    const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
      headers: { Accept: 'application/x-ndjson' },
    });
    if (res.status === 404) throw new Error(`We couldn’t find “${username}” on Lichess.`);
    if (res.status === 429) throw new Error('Lichess is limiting requests. Try again in a minute.');
    if (!res.ok) throw new Error('Lichess isn’t responding right now. Try again in a moment.');
    groups[id] = (await res.text())
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((g) => g.pgn && (g.variant === 'standard' || g.variant === 'fromPosition') && g.status !== 'aborted' && g.status !== 'noStart')
      .map((g) => lichessGame(g, user));
  }
  return groups;
}

function lichessGame(g, user) {
  const { white: w, black: b } = g.players;
  const name = (p) => p.user?.name || (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
  return {
    white: name(w),
    whiteElo: w.rating,
    black: name(b),
    blackElo: b.rating,
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
    playedAt: g.lastMoveAt ?? g.createdAt,
    pgn: g.pgn,
    userColor: b.user?.name?.toLowerCase() === user ? 'black' : 'white',
  };
}

// Opening a single game from its link. Lichess serves any game to any site. Chess.com only serves a
// single game to its own pages, so the browser extension reads the moves there and passes them along.
const LICHESS_LINK = /^https?:\/\/(?:www\.)?lichess\.org\/(?:embed\/)?(?:game\/)?([a-z0-9]{8})(?:[a-z0-9]{4})?(?:\/(white|black))?(?:[/?#]|$)/i;
const CHESSCOM_LINK = /^https?:\/\/(?:www\.)?chess\.com\//i;
const sideOf = (value) => (value === 'black' ? 'black' : 'white');

export async function importGame(link, hints = {}) {
  const url = link.trim();
  const lichess = url.match(LICHESS_LINK);
  if (lichess) return importLichessGame(lichess[1], hints.orientation ?? lichess[2]);
  if (CHESSCOM_LINK.test(url)) {
    if (hints.tcn) return { pgn: chessComPgn(url, hints), orientation: sideOf(hints.orientation) };
    throw new Error('Chess.com links open through the Zwishly extension. You can also find the game in the Games tab.');
  }
  throw new Error('That doesn’t look like a Lichess or Chess.com game link.');
}

async function importLichessGame(id, orientation) {
  let res;
  try {
    res = await fetch(`https://lichess.org/game/export/${id}?pgnInJson=true&clocks=false&evals=false`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Lichess isn’t responding right now. Try again in a moment.');
  }
  if (res.status === 404) throw new Error('We couldn’t find that game on Lichess.');
  if (res.status === 429) throw new Error('Lichess is limiting requests. Try again in a minute.');
  if (!res.ok) throw new Error('Lichess isn’t responding right now. Try again in a moment.');
  const g = await res.json();
  // Reviewing a game that is still being played would be engine assistance.
  if (g.status === 'created' || g.status === 'started') throw new Error('That game is still being played. Review it once it’s over.');
  if (!g.pgn || (g.variant !== 'standard' && g.variant !== 'fromPosition')) throw new Error('Zwishly reviews standard chess only.');
  return { pgn: g.pgn, orientation: sideOf(orientation) };
}

// Chess.com's compact move format: two characters per move, each an index into this alphabet.
// The first 64 are the squares a1 to h8, the next 12 are promotions (piece and direction).
const TCN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$';
const square = (index) => 'abcdefgh'[index % 8] + (Math.floor(index / 8) + 1);

function decodeTcn(tcn) {
  const moves = [];
  for (let i = 0; i + 1 < tcn.length; i += 2) {
    const from = TCN.indexOf(tcn[i]);
    let to = TCN.indexOf(tcn[i + 1]);
    if (from < 0 || from > 63 || to < 0) throw new Error('Unreadable move.');
    const move = { from: square(from) };
    if (to > 63) {
      move.promotion = 'qnrb'[Math.floor((to - 64) / 3)];
      to = from + (from < 16 ? -8 : 8) + ((to - 64) % 3) - 1;
    }
    moves.push({ ...move, to: square(to) });
  }
  return moves;
}

// Daily games write castling as the king capturing its own rook.
function castlingMove(chess, move) {
  const king = chess.get(move.from);
  const rook = chess.get(move.to);
  if (king?.type !== 'k' || rook?.type !== 'r' || rook.color !== king.color) return move;
  return { ...move, to: (move.to[0] > move.from[0] ? 'g' : 'c') + move.to[1] };
}

const RESULTS = ['1-0', '0-1', '1/2-1/2'];

function chessComPgn(link, { tcn, fen, white, black, whiteElo, blackElo, result, date }) {
  try {
    const chess = fen ? new Chess(fen) : new Chess();
    for (const move of decodeTcn(tcn)) chess.move(castlingMove(chess, move));
    const headers = { Site: 'Chess.com', Date: date, White: white, Black: black, WhiteElo: whiteElo, BlackElo: blackElo, Link: link };
    for (const [key, value] of Object.entries(headers)) if (value) chess.setHeader(key, String(value).slice(0, 100));
    chess.setHeader('Result', RESULTS.includes(result) ? result : '*');
    return chess.pgn();
  } catch {
    throw new Error('We couldn’t read that Chess.com game.');
  }
}
