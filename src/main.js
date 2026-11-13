import { Chess } from 'chess.js';
import '@fontsource-variable/inter/index.css';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import './style.css';
import { START_FEN } from './chess-utils.js';
import { initGames, showGames } from './games.js';
import { SITES, fetchLatestGame, importGame, playerExists } from './importers.js';
import { loadOpenings } from './openings.js';
import { USERNAME_RE, forgetPlayer, rememberPlayer, rememberedPlayers } from './player.js';
import { play as playSound, soundFor } from './sound.js';
import { renderBoardBadge, setBoardOrientation, syncBoard } from './app/board.js';
import { initCustomize, setDrawerOpen, toggleMute } from './app/customize.js';
import { $, setHidden, toast } from './app/dom.js';
import { engine, updateEngine } from './app/engine-panel.js';
import {
  currentFen,
  currentMove,
  game,
  gameToPgn,
  goToEnd,
  goToStart,
  notifyGameChange,
  onGameChange,
  parsePgn,
  replaceGame,
  stepBack,
  stepForward,
} from './app/game.js';
import { renderMoveComment, renderMoves } from './app/moves-panel.js';
import { renderOpening } from './app/openings-panel.js';
import { renderPlayers } from './app/players-panel.js';
import { renderGraphCursor, renderReview, toggleReview } from './app/review.js';

const TABS = ['analyze', 'openings', 'games', 'load'];
const TABS_WITH_SIDE_TOGGLE = ['analyze', 'openings'];
const shown = { move: null, fen: null };

function playStepSound() {
  const move = currentMove();
  const fen = currentFen();
  if (move && move !== shown.move && move.before === shown.fen) playSound(soundFor(move.san));
  else if (shown.move?.before === fen && move !== shown.move) playSound('soft');
  shown.move = move;
  shown.fen = fen;
}

function renderGame() {
  const chess = new Chess(currentFen());
  syncBoard(chess);
  playStepSound();
  renderMoves();
  renderPlayers();
  renderMoveComment();
  renderBoardBadge();
  renderOpening();
  renderGraphCursor();
  updateEngine(chess);
}

function setOrientation(color) {
  game.orientation = color;
  setBoardOrientation(color);
  $('evalbar').classList.toggle('flipped', color === 'black');
  renderPlayers();
  renderBoardBadge();
  renderOpening();
}

const flipBoard = () => setOrientation(game.orientation === 'white' ? 'black' : 'white');

function openGame(startFen, mainline, headers = {}, orientation) {
  engine.stop();
  replaceGame(startFen, mainline, headers);
  shown.move = null;
  shown.fen = null;
  if (orientation) setOrientation(orientation);
  engine.newGame();
  renderReview();
  notifyGameChange();
}

function openPgn(pgn, orientation) {
  const parsed = parsePgn(pgn);
  if (parsed) openGame(parsed.startFen, parsed.mainline, parsed.headers, orientation);
  else toast('We couldn’t read that game. Check that it’s valid PGN.');
  return Boolean(parsed);
}

function openFen(fen) {
  let chess;
  try {
    chess = new Chess(fen.trim());
  } catch {
    toast('That position isn’t valid. Check the FEN and try again.');
    return false;
  }
  openGame(chess.fen(), [], {}, chess.turn() === 'b' ? 'black' : 'white');
  return true;
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  for (const tab of TABS) setHidden($(`tab-${tab}`), tab !== name);
  setHidden($('side-toggle'), !TABS_WITH_SIDE_TOGGLE.includes(name));
  if (name === 'games') showGames();
  if (name === 'openings') renderOpening();
}

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied.`);
  } catch {
    prompt(`Copy ${label}:`, text);
  }
}

const hashParam = (name) => new URLSearchParams(location.hash.slice(1)).get(name);

async function openGreatGameFromHash() {
  const id = hashParam('great');
  if (!id) return;
  try {
    const games = await (await fetch(`${import.meta.env.BASE_URL}great-games.json`)).json();
    const greatGame = games.find((g) => g.id === id);
    if (greatGame) openPgn(greatGame.pgn, 'white');
    else toast('We couldn’t find that game.');
  } catch {
    toast('We couldn’t open that game.');
  }
}

// hints come from the browser extension: board side, and for Chess.com the moves themselves.
async function openLink(link, hints) {
  try {
    const { pgn, orientation } = await importGame(link, hints);
    return openPgn(pgn, orientation) && (switchTab('analyze'), true);
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function openImportFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const link = params.get('import');
  if (link) openLink(link, Object.fromEntries(params));
}

// A review in progress has to wind down before the next one can start.
async function stopReview() {
  if (!game.reviewing) return;
  toggleReview();
  for (let i = 0; i < 100 && game.reviewing; i++) await new Promise((resolve) => setTimeout(resolve, 30));
}

// Opens the newest finished game among these [site, username] pairs and starts reviewing it.
async function openLatestGame(players) {
  toast('Finding your latest game…');
  const results = await Promise.allSettled(players.map(([site, username]) => fetchLatestGame(site, username)));
  const found = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  const latest = found.reduce((best, g) => ((g.playedAt ?? 0) > (best?.playedAt ?? -1) ? g : best), null);
  if (!latest) {
    const failure = results.find((r) => r.status === 'rejected');
    toast(failure ? failure.reason.message : 'No finished games yet. Play one and come back.');
    return;
  }
  await stopReview();
  if (!openPgn(latest.pgn, latest.userColor)) return;
  switchTab('analyze');
  toggleReview();
}

// analyze#latest (where the home page sends returning players): every remembered username, newest game wins.
function openLatestFromHash() {
  if (!new URLSearchParams(location.hash.slice(1)).has('latest')) return;
  const players = Object.entries(rememberedPlayers());
  if (players.length) openLatestGame(players);
  else $('latest-user').focus();
}

// The username box in the top bar. The name is remembered in this browser, so later visits open
// the latest game by themselves. Submitting an empty box forgets that site's name.
function showRememberedName() {
  $('latest-user').value = rememberedPlayers()[$('latest-site').value] ?? '';
}

async function submitLatest(event) {
  event.preventDefault();
  const site = $('latest-site').value;
  const siteName = SITES[site].name;
  const username = $('latest-user').value.trim();
  if (!username) {
    if (rememberedPlayers()[site]) {
      forgetPlayer(site);
      toast(`Forgot your ${siteName} username.`);
    } else {
      toast(`Enter your ${siteName} username.`);
    }
    return;
  }
  if (!USERNAME_RE.test(username)) {
    toast('Usernames use only letters, numbers, - and _.');
    return;
  }
  const button = $('latest-submit');
  button.disabled = true;
  try {
    if (!(await playerExists(site, username))) {
      toast(`We couldn’t find “${username}” on ${siteName}.`);
      return;
    }
    rememberPlayer(site, username);
    await openLatestGame([[site, username]]);
  } finally {
    button.disabled = false;
  }
}

function initLatestForm() {
  const players = rememberedPlayers();
  $('latest-site').value = !players.chesscom && players.lichess ? 'lichess' : 'chesscom';
  showRememberedName();
  $('latest-site').onchange = showRememberedName;
  $('latest-form').onsubmit = submitLatest;
}

function openFromHash() {
  openGreatGameFromHash();
  openImportFromHash();
  openLatestFromHash();
}

const KEY_ACTIONS = {
  ArrowLeft: stepBack,
  ArrowRight: stepForward,
  Home: goToStart,
  End: goToEnd,
  ArrowUp: goToStart,
  ArrowDown: goToEnd,
  f: flipBoard,
  m: toggleMute,
};

function onKeyDown(event) {
  if (event.key === 'Escape') {
    setDrawerOpen(false);
    return;
  }
  const typing = event.target.matches('input:not([type=checkbox]), textarea, select');
  if (typing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  const action = KEY_ACTIONS[event.key];
  if (!action) return;
  event.preventDefault();
  action();
}

function onBoardWheel(event) {
  event.preventDefault();
  if (event.deltaY > 0) stepForward();
  else if (event.deltaY < 0) stepBack();
}

function bindControls() {
  $('btn-start').onclick = goToStart;
  $('btn-prev').onclick = stepBack;
  $('btn-next').onclick = stepForward;
  $('btn-end').onclick = goToEnd;
  $('btn-flip').onclick = flipBoard;
  $('btn-reset').onclick = () => openGame(START_FEN, []);
  $('btn-review').onclick = toggleReview;
  $('btn-copy-fen').onclick = () => copyToClipboard(currentFen(), 'FEN');
  $('btn-copy-pgn').onclick = () => copyToClipboard(gameToPgn(), 'PGN');
  $('opening').onclick = () => switchTab('openings');
  for (const id of ['engine-on', 'engine-lines', 'engine-depth']) $(id).onchange = notifyGameChange;
  $('btn-load-pgn').onclick = () => openPgn($('pgn-input').value) && switchTab('analyze');
  $('btn-load-fen').onclick = () => openFen($('fen-input').value) && switchTab('analyze');
  document.querySelectorAll('.tab').forEach((tab) => (tab.onclick = () => switchTab(tab.dataset.tab)));
  document.querySelectorAll('.side-pill').forEach((pill) => (pill.onclick = () => setOrientation(pill.dataset.side)));
  document.addEventListener('keydown', onKeyDown);
  $('board').addEventListener('wheel', onBoardWheel, { passive: false });
  addEventListener('hashchange', openFromHash);
}

onGameChange(renderGame);
initCustomize();
bindControls();

loadOpenings().then(notifyGameChange);
initGames({ onOpenGame: (played) => openPgn(played.pgn, played.userColor) && switchTab('analyze') });
initLatestForm();

const sharedFen = hashParam('fen');
if (!(sharedFen && openFen(sharedFen))) notifyGameChange();
openFromHash();
