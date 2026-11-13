import { Chess } from 'chess.js';
import '@fontsource-variable/inter/index.css';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import './style.css';
import { initAccount, showGames } from './account.js';
import { START_FEN } from './chess-utils.js';
import { loadOpenings } from './openings.js';
import { play as playSound, soundFor } from './sound.js';
import { renderBoardBadge, setBoardOrientation, syncBoard } from './app/board.js';
import { adoptAccountPrefs, initCustomize, setDrawerOpen, toggleMute } from './app/customize.js';
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
import { prefs } from './app/prefs.js';
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

function openGamesTabAfterSignIn() {
  if (location.hash !== '#games') return;
  history.replaceState(null, '', location.pathname);
  switchTab('games');
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
  addEventListener('hashchange', openGreatGameFromHash);
}

onGameChange(renderGame);
initCustomize();
bindControls();

loadOpenings().then(notifyGameChange);
initAccount({
  onNotify: toast,
  onSignedIn: () => switchTab('games'),
  onAdoptPrefs: adoptAccountPrefs,
  getPrefs: () => prefs,
  onOpenGame: (played) => openPgn(played.pgn, played.userColor) && switchTab('analyze'),
}).then(openGamesTabAfterSignIn);

const sharedFen = hashParam('fen');
if (!(sharedFen && openFen(sharedFen))) notifyGameChange();
openGreatGameFromHash();
