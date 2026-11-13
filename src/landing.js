import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import '@fontsource-variable/inter/index.css';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import './style.css';
import './landing.css';
import { moveLabel } from './chess-utils.js';
import { SITES, playerExists } from './importers.js';
import { USERNAME_RE, forgetPlayers, rememberPlayer, rememberedPlayers } from './player.js';
import { loadPrefs, applyTheme } from './themes.js';

const $ = (id) => document.getElementById(id);
applyTheme(loadPrefs());

// "Type your username, get your last game reviewed." The name is kept in this browser, and from then on
// opening the site goes straight to the newest game (see the redirect script in index.html).
const form = { site: 'chesscom' };

function selectSite(site) {
  form.site = site;
  document.querySelectorAll('#latest-form .site-pill').forEach((pill) => {
    const on = pill.dataset.site === site;
    pill.classList.toggle('active', on);
    pill.setAttribute('aria-pressed', String(on));
  });
  $('latest-user').value = rememberedPlayers()[site] ?? '';
  $('latest-error').textContent = '';
}

function renderRemembered() {
  const players = rememberedPlayers();
  const names = Object.entries(players).map(([site, name]) => `${name} (${SITES[site].name})`);
  $('latest-remembered').classList.toggle('hidden', !names.length);
  $('latest-name').textContent = names.join(', ');
}

async function submitLatest(event) {
  event.preventDefault();
  const username = $('latest-user').value.trim();
  const error = $('latest-error');
  error.textContent = '';
  if (!USERNAME_RE.test(username)) {
    error.textContent = username ? 'Usernames use only letters, numbers, - and _.' : `Enter your ${SITES[form.site].name} username.`;
    return;
  }
  const button = $('latest-submit');
  button.disabled = true;
  try {
    if (!(await playerExists(form.site, username))) {
      error.textContent = `We couldn’t find “${username}” on ${SITES[form.site].name}.`;
      return;
    }
    rememberPlayer(form.site, username);
    location.href = 'analyze.html#latest';
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('#latest-form .site-pill').forEach((pill) => (pill.onclick = () => selectSite(pill.dataset.site)));
$('latest-form').onsubmit = submitLatest;
$('latest-forget').onclick = () => {
  forgetPlayers();
  selectSite(form.site);
  renderRemembered();
  $('latest-user').focus();
};
const remembered = rememberedPlayers();
selectSite(!remembered.chesscom && remembered.lichess ? 'lichess' : 'chesscom');
renderRemembered();

let greatGames = [];

fetch(`${import.meta.env.BASE_URL}great-games.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((list) => {
    greatGames = list;
    startDemo();
  })
  .catch(() => document.querySelector('.landing-demo').classList.add('hidden'));

const CROWN = '👑';
const ANIMATION_MS = 400;
const STEP_MS = 1200;
const KEY_MS = 3400;
const END_MS = 3200;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const demo = { game: null, moves: [], keyIndex: 0, orientation: 'white', timer: null, index: -1, paused: false };
let cg = null;

function after(ms, fn) {
  clearTimeout(demo.timer);
  demo.timer = setTimeout(fn, ms);
}

function positionConfig(fen) {
  const position = new Chess(fen);
  const turn = position.turn() === 'w' ? 'white' : 'black';
  return { fen, turnColor: turn, check: position.inCheck() ? turn : false };
}

function loadDemo(game) {
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const history = chess.history({ verbose: true });
  const { from, to, key } = game.highlight;
  demo.game = game;
  demo.moves = history.slice(from, to);
  demo.keyIndex = key - from;
  demo.orientation = history[key].color === 'w' ? 'white' : 'black';

  const title = $('demo-title');
  title.textContent = `${game.title}, ${game.year}`;
  title.title = `${game.white} vs. ${game.black}`;
  title.href = `analyze.html#great=${encodeURIComponent(game.id)}`;
  $('demo-caption').textContent = '';
  setBadge(null);

  const config = { ...positionConfig(demo.moves[0].before), orientation: demo.orientation, lastMove: undefined };
  if (!cg) {
    cg = Chessground($('demo-board'), {
      ...config,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: true, duration: ANIMATION_MS },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false, visible: false },
    });
  } else {
    cg.set({ animation: { enabled: false } });
    cg.set(config);
    cg.set({ animation: { enabled: true, duration: ANIMATION_MS } });
  }
}

function setBadge(square) {
  const layer = $('demo-badge');
  layer.replaceChildren();
  if (!square) return;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const white = demo.orientation === 'white';
  const el = document.createElement('div');
  el.className = 'board-badge cls-glorious';
  el.style.left = `${(white ? file : 7 - file) * 12.5}%`;
  el.style.top = `${(white ? 7 - rank : rank) * 12.5}%`;
  el.textContent = CROWN;
  layer.append(el);
}

function showMove(i) {
  const m = demo.moves[i];
  const isKey = i === demo.keyIndex;
  cg.set({ ...positionConfig(m.after), lastMove: [m.from, m.to] });
  setBadge(isKey ? m.to : null);
  $('demo-caption').textContent = isKey ? `${moveLabel(m)} ${CROWN}` : moveLabel(m);
}

function play(i) {
  demo.index = i;
  showMove(i);
  if (i === demo.moves.length - 1) after(END_MS, startDemo);
  else after(i === demo.keyIndex ? KEY_MS : STEP_MS, () => play(i + 1));
}

function startDemo() {
  clearTimeout(demo.timer);
  if (!greatGames.length) return;
  const others = greatGames.filter((g) => g !== demo.game);
  const options = others.length ? others : greatGames;
  loadDemo(options[Math.floor(Math.random() * options.length)]);
  demo.index = -1;
  if (reducedMotion) showMove(demo.keyIndex);
  else after(STEP_MS, () => play(0));
}

const PAUSE_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 3 1.5z" fill="currentColor"/></svg>';

function renderPauseButton() {
  const button = $('demo-pause');
  const label = demo.paused ? 'Resume replay' : 'Pause replay';
  button.innerHTML = demo.paused ? PLAY_ICON : PAUSE_ICON;
  button.classList.toggle('paused', demo.paused);
  button.setAttribute('aria-label', label);
  button.title = label;
}

function togglePause() {
  demo.paused = !demo.paused;
  if (demo.paused) clearTimeout(demo.timer);
  else if (demo.index >= demo.moves.length - 1) startDemo();
  else play(demo.index + 1);
  renderPauseButton();
}

if (reducedMotion) $('demo-pause').classList.add('hidden');
renderPauseButton();
$('demo-pause').addEventListener('click', togglePause);
