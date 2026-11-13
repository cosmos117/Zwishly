// The player's Chess.com and Lichess usernames, kept in this browser so the site can open their
// newest game without an account. index.html reads the same key to send returning players
// straight to that game.
const KEY = 'zwishly-players';
const SITES = ['chesscom', 'lichess'];
export const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/;

// { chesscom?: string, lichess?: string }, with anything malformed dropped.
export function rememberedPlayers() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {};
  } catch {}
  const players = {};
  for (const site of SITES) if (USERNAME_RE.test(stored[site] ?? '')) players[site] = stored[site];
  return players;
}

export function rememberPlayer(site, username) {
  if (!SITES.includes(site) || !USERNAME_RE.test(username)) return;
  localStorage.setItem(KEY, JSON.stringify({ ...rememberedPlayers(), [site]: username }));
}

export function forgetPlayer(site) {
  const { [site]: _, ...rest } = rememberedPlayers();
  if (Object.keys(rest).length) localStorage.setItem(KEY, JSON.stringify(rest));
  else localStorage.removeItem(KEY);
}

export function forgetPlayers() {
  localStorage.removeItem(KEY);
}
