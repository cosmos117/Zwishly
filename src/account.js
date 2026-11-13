import { SITES, TIME_CLASSES, fetchGames, playerExists } from './importers.js';
import { api, fetchUser, flushPrefs, openAuth, queuePrefsSave, session, setPrefsErrorHandler } from './session.js';

const $ = (id) => document.getElementById(id);

const games = {
  site: 'chesscom',
  username: '',
  groups: null,
  active: 'blitz',
  request: 0,
  cache: new Map(), // "site:username" -> groups, for this page visit
};
let openGame = () => {};
let notify = () => {};
let signedIn = () => {};
let adoptPrefs = () => {};
let currentPrefs = () => ({});

function syncPrefs() {
  if (session.user?.prefs) adoptPrefs(session.user.prefs);
  else queuePrefsSave(currentPrefs());
}

function authDone(user, isNew) {
  setUser(user);
  syncPrefs();
  useLinkedSite();
  notify(isNew ? 'Your account is ready.' : 'Signed in.');
  signedIn();
}

async function signOut() {
  await flushPrefs();
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (err) {
    notify(err.message);
    return;
  }
  setUser(null);
  games.username = '';
  games.groups = null;
  notify('Signed out.');
}

function setUser(user) {
  session.user = user;
  $('guest-actions').classList.toggle('hidden', !!user);
  $('account-menu').classList.toggle('hidden', !user);
  $('account-email').textContent = user?.email ?? '';
  applyLinkedUsername();
  renderGames();
}

const linkedName = (site) => session.user?.[site] ?? '';

function applyLinkedUsername() {
  games.username = linkedName(games.site);
  $('games-user').value = games.username;
}

function selectSite(site) {
  games.site = site;
  games.groups = null;
  applyLinkedUsername();
  renderGames();
  if (games.username) loadGames();
}

async function saveLink(site, username) {
  if (!session.user || session.user[site] === (username || null)) return;
  const links = { chesscom: session.user.chesscom, lichess: session.user.lichess, [site]: username };
  const { user } = await api('/me/accounts', { method: 'PUT', body: links });
  session.user = user;
}

async function loadGames({ refresh = false } = {}) {
  const username = $('games-user').value.trim();
  const site = games.site;
  if (!username) {
    setStatus(`Enter your ${SITES[site].name} username.`);
    return;
  }
  games.username = username;
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
    games.groups = groups;
    games.active = newestClass(groups);
    setStatus('');
    renderGames();
    await saveLink(site, username);
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
  document.querySelectorAll('.site-pill').forEach((b) => {
    const on = b.dataset.site === games.site;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const linked = linkedName(games.site);
  $('games-linked').classList.toggle('hidden', !linked);
  $('games-linked-name').textContent = linked;
  $('games-guest').classList.toggle('hidden', !!session.user);
  $('games-submit').textContent = session.user && !linked ? 'Link & show games' : 'Show games';

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

async function unlink() {
  const site = games.site;
  try {
    await saveLink(site, '');
  } catch (err) {
    notify(err.message);
    return;
  }
  applyLinkedUsername();
  games.groups = null;
  setStatus('');
  renderGames();
}

function openProfile() {
  const { user } = session;
  $('profile-email').textContent = user.email;
  $('profile-chesscom').value = user.chesscom ?? '';
  $('profile-lichess').value = user.lichess ?? '';
  $('profile-error').textContent = '';
  $('profile-dialog').showModal();
}

async function submitProfile(e) {
  e.preventDefault();
  const button = $('profile-submit');
  button.disabled = true;
  $('profile-error').textContent = '';
  const names = { chesscom: $('profile-chesscom').value.trim(), lichess: $('profile-lichess').value.trim() };
  try {
    for (const [site, name] of Object.entries(names)) {
      const unchanged = name.toLowerCase() === (session.user[site] ?? '').toLowerCase();
      if (name && !unchanged && !(await playerExists(site, name))) {
        throw new Error(`We couldn’t find “${name}” on ${SITES[site].name}.`);
      }
    }
    const { user } = await api('/me/accounts', { method: 'PUT', body: { chesscom: names.chesscom || null, lichess: names.lichess || null } });
    session.user = user;
    $('profile-dialog').close();
    games.groups = null;
    setStatus('');
    useLinkedSite();
    applyLinkedUsername();
    renderGames();
    notify('Profile saved.');
    showGames();
  } catch (err) {
    $('profile-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

function useLinkedSite() {
  if (linkedName(games.site)) return;
  if (linkedName('chesscom')) games.site = 'chesscom';
  else if (linkedName('lichess')) games.site = 'lichess';
  applyLinkedUsername();
  renderGames();
}

export function showGames() {
  if ($('tab-games').classList.contains('hidden')) return;
  if (!games.groups && linkedName(games.site)) {
    applyLinkedUsername();
    loadGames();
  }
}

export async function initAccount({ onOpenGame, onNotify, onSignedIn, onAdoptPrefs, getPrefs }) {
  openGame = onOpenGame;
  notify = onNotify;
  signedIn = onSignedIn;
  adoptPrefs = onAdoptPrefs;
  currentPrefs = getPrefs;
  setPrefsErrorHandler(() => notify('We couldn’t save that to your account.'));

  $('btn-signin').onclick = () => openAuth('login', authDone);
  $('btn-signup').onclick = () => openAuth('register', authDone);
  $('games-signin').onclick = () => openAuth('register', authDone);
  $('btn-signout').onclick = signOut;
  $('btn-profile').onclick = openProfile;
  $('profile-close').onclick = () => $('profile-dialog').close();
  $('profile-form').onsubmit = submitProfile;
  $('games-form').onsubmit = (e) => {
    e.preventDefault();
    loadGames();
  };
  $('games-refresh').onclick = () => loadGames({ refresh: true });
  $('games-unlink').onclick = unlink;
  document.querySelectorAll('.site-pill').forEach((b) => (b.onclick = () => selectSite(b.dataset.site)));

  renderGames();
  try {
    setUser(await fetchUser());
    syncPrefs();
    useLinkedSite();
  } catch {
    // No account server (a static copy of the site): everything else still works.
    $('guest-actions').classList.add('hidden');
    $('games-guest').classList.add('hidden');
  }
}
