import { SITES, TIME_CLASSES, fetchGames } from './importers.js';
import { rememberPlayer, rememberedPlayers } from './player.js';

const $ = (id) => document.getElementById(id);

const games = {
  site: 'chesscom',
  groups: null,
  active: 'blitz',
  request: 0,
  cache: new Map(), // "site:username" -> groups, for this page visit
};
let openGame = () => {};

const rememberedName = (site) => rememberedPlayers()[site] ?? '';

function selectSite(site) {
  games.site = site;
  games.groups = null;
  $('games-user').value = rememberedName(site);
  setStatus('');
  renderGames();
  if ($('games-user').value) loadGames();
}

async function loadGames({ refresh = false } = {}) {
  const username = $('games-user').value.trim();
  const site = games.site;
  if (!username) {
    setStatus(`Enter your ${SITES[site].name} username.`);
    return;
  }
  const request = ++games.request;
  const key = `${site}:${username.toLowerCase()}`;
  if (refresh) games.cache.delete(key);
  games.groups = null;
  renderGames();
  setStatus(`Loading ${username}’s games…`);
  try {
    let groups = games.cache.get(key);
    if (!groups) {
      groups = await fetchGames(site, username);
      games.cache.set(key, groups);
    }
    if (request !== games.request) return;
    rememberPlayer(site, username);
    games.groups = groups;
    games.active = newestClass(groups);
    setStatus('');
    renderGames();
  } catch (err) {
    if (request !== games.request) return;
    setStatus(err.message);
  }
}

function newestClass(groups) {
  let best = TIME_CLASSES[0].id;
  let newest = -1;
  for (const { id } of TIME_CLASSES) {
    const playedAt = groups[id]?.[0]?.playedAt ?? -1;
    if (playedAt > newest) {
      newest = playedAt;
      best = id;
    }
  }
  return best;
}

function setStatus(text) {
  $('games-status').textContent = text;
}

function renderGames() {
  document.querySelectorAll('#tab-games .site-pill').forEach((b) => {
    const on = b.dataset.site === games.site;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const { groups, active } = games;
  $('games-results').classList.toggle('hidden', !groups);
  if (!groups) return;

  const tabs = $('time-tabs');
  tabs.replaceChildren(
    ...TIME_CLASSES.map(({ id, label }) => {
      const b = document.createElement('button');
      b.className = `time-tab ${id === active ? 'active' : ''}`;
      b.setAttribute('aria-pressed', String(id === active));
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = groups[id].length;
      b.append(label, count);
      b.onclick = () => {
        games.active = id;
        renderGames();
      };
      return b;
    }),
  );

  const list = $('games-list');
  const current = groups[active];
  if (!current.length) {
    const label = TIME_CLASSES.find((t) => t.id === active).label.toLowerCase();
    const li = document.createElement('li');
    li.className = 'games-empty';
    li.textContent = `No recent ${label} games on this account.`;
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...current.map(gameRow));
}

function playerLine(color, name, elo) {
  const line = document.createElement('span');
  line.className = 'player-line';
  const dot = document.createElement('span');
  dot.className = `dot ${color}`;
  const small = document.createElement('small');
  small.textContent = elo ?? '';
  line.append(dot, `${name} `, small);
  return line;
}

function gameRow(g) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.className = 'game-row';

  const won = (g.result === '1-0' && g.userColor === 'white') || (g.result === '0-1' && g.userColor === 'black');
  const outcome = g.result === '½-½' ? 'draw' : won ? 'win' : 'loss';
  const res = document.createElement('span');
  res.className = `res ${outcome}`;
  res.textContent = { win: 'Won', loss: 'Lost', draw: 'Draw' }[outcome];

  const who = document.createElement('span');
  who.className = 'who';
  who.append(playerLine('white', g.white, g.whiteElo), playerLine('black', g.black, g.blackElo));

  const date = document.createElement('span');
  date.className = 'meta';
  date.textContent = g.playedAt ? new Date(g.playedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

  button.append(res, who, date);
  button.onclick = () => openGame(g);
  li.append(button);
  return li;
}

// Called when the Games tab opens: a remembered player's games load without any typing.
export function showGames() {
  if ($('tab-games').classList.contains('hidden') || games.groups) return;
  if (!$('games-user').value) $('games-user').value = rememberedName(games.site);
  if ($('games-user').value) loadGames();
}

export function initGames({ onOpenGame }) {
  openGame = onOpenGame;
  const players = rememberedPlayers();
  if (!players.chesscom && players.lichess) games.site = 'lichess';
  $('games-user').value = players[games.site] ?? '';

  $('games-form').onsubmit = (e) => {
    e.preventDefault();
    loadGames();
  };
  $('games-refresh').onclick = () => loadGames({ refresh: true });
  document.querySelectorAll('#tab-games .site-pill').forEach((b) => (b.onclick = () => selectSite(b.dataset.site)));
  renderGames();
}
