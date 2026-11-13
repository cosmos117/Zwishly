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
