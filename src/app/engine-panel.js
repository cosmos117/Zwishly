import { Chess } from 'chess.js';
import { formatEval, winPercent } from '../analysis.js';
import { sanLine, terminalEval } from '../chess-utils.js';
import { Engine } from '../engine.js';
import { animationTimeLeft, clearEngineArrows, setEngineArrows } from './board.js';
import { $ } from './dom.js';
import { currentFen, currentReview, game, playLine } from './game.js';

const RELEASE_WHEN_UNUSED_MS = 2000;
const RELEASE_WHEN_IDLE_MS = 60000;
const RELEASE_WHEN_HIDDEN_MS = 30000;
const LINES_REDRAW_MS = 150;
const PV_MOVES_SHOWN = 14;

export const engine = new Engine();

let searchId = 0;
let releaseTimer = null;
let searchCutShort = false;
let pendingLines = null;
let linesTimer = null;

const isEngineOn = () => $('engine-on').checked;

function cancelRelease() {
  clearTimeout(releaseTimer);
  releaseTimer = null;
}

function releaseAfter(delay) {
  cancelRelease();
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (!game.reviewing && engine.release()) searchCutShort = true;
  }, delay);
}

function releaseOnceIdle() {
  if (document.hidden && releaseTimer !== null) return;
  releaseAfter(document.hidden ? RELEASE_WHEN_HIDDEN_MS : RELEASE_WHEN_IDLE_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAfter(RELEASE_WHEN_HIDDEN_MS);
    return;
  }
  cancelRelease();
  if (searchCutShort) {
    searchCutShort = false;
    updateEngine();
  } else if (!engine.busy) {
    releaseAfter(RELEASE_WHEN_IDLE_MS);
  }
});

function setEngineStatus(status) {
  $('engine-meta').textContent = status;
}

function setEngineLines(html) {
  $('pv-lines').innerHTML = html;
}

function showGameOver(chess, finalEval) {
  const winner = chess.turn() === 'w' ? 'Black' : 'White';
  const result = chess.isCheckmate() ? `Checkmate. ${winner} wins.` : chess.isStalemate() ? 'Stalemate. The game is drawn.' : 'The game is drawn.';
  setEvalDisplay(finalEval);
  setEngineStatus('Game over');
  setEngineLines(`<div class="pv-empty">${result}</div>`);
}

function showEnginePaused() {
  setEngineStatus('Engine paused');
  $('engine-eval').textContent = '–';
  setEngineLines('');
  const reviewedEval = !game.cursor.inVariation && currentReview()?.evals[game.cursor.index];
  if (reviewedEval) setEvalDisplay(reviewedEval);
}

function stopAndRelease() {
  engine.stop();
  releaseAfter(RELEASE_WHEN_UNUSED_MS);
}

function startSearch(fen, id) {
  setEngineStatus(engine.ready ? 'Thinking…' : 'Starting the engine…');
  setEngineLines('');
  const options = {
    depth: Number($('engine-depth').value),
    multipv: Number($('engine-lines').value),
    onInfo: (lines, depth) => {
      if (id === searchId) queueLines(fen, lines, depth);
    },
  };
  engine.analyze(fen, options).then((result) => {
    if (id !== searchId || result.stopped) return;
    flushLines();
    releaseOnceIdle();
    setEngineStatus(`Depth ${result.depth} · done`);
  });
}

export function updateEngine(chess = new Chess(currentFen())) {
  const id = ++searchId;
  pendingLines = null;
  if (game.reviewing) return;
  cancelRelease();

  const finalEval = terminalEval(chess);
  if (finalEval) {
    stopAndRelease();
    showGameOver(chess, finalEval);
  } else if (!isEngineOn()) {
    stopAndRelease();
    showEnginePaused();
  } else {
    startSearch(chess.fen(), id);
  }
}

export function showReviewStarted() {
  searchId++;
  pendingLines = null;
  setEngineStatus('Reviewing your game…');
  setEngineLines('');
  clearEngineArrows();
}

// Rebuilding the panel on every engine message makes pieces stutter mid-move.
function queueLines(fen, lines, depth) {
  pendingLines = { fen, lines, depth };
  linesTimer ??= setTimeout(flushLines, LINES_REDRAW_MS);
}

function flushLines() {
  clearTimeout(linesTimer);
  linesTimer = null;
  if (!pendingLines) return;
  const wait = animationTimeLeft();
  if (wait > 0) {
    linesTimer = setTimeout(flushLines, wait);
    return;
  }
  const { fen, lines, depth } = pendingLines;
  pendingLines = null;
  renderLines(fen, lines, depth);
}

const scoreOf = ({ cp, mate }) => ({ cp, mate });

function createPvMove(san, line, index) {
  const move = document.createElement('span');
  move.className = 'pv-move';
  move.textContent = san;
  move.title = 'Play up to this move';
  move.onclick = () => playLine(line.pv.slice(0, index + 1));
  return move;
}

function createPvLine(fen, line) {
  const score = scoreOf(line);
  const scoreBadge = document.createElement('span');
  scoreBadge.className = `pv-eval ${winPercent(score) >= 50 ? 'w' : 'b'}`;
  scoreBadge.textContent = formatEval(score);

  const moves = document.createElement('span');
  moves.className = 'pv-moves';
  sanLine(fen, line.pv, PV_MOVES_SHOWN).forEach(({ san, number }, index) => {
    if (number) moves.append(`${number} `);
    moves.append(createPvMove(san, line, index), ' ');
  });

  const row = document.createElement('div');
  row.className = 'pv-line';
  row.append(scoreBadge, moves);
  return row;
}

function renderLines(fen, lines, depth) {
  const [top] = lines;
  if (!top) return;
  setEvalDisplay(top);
  const speed = Math.round((top.nps || 0) / 1000);
  setEngineStatus(`Depth ${depth}${speed ? ` · ${speed} kN/s` : ''}`);
  $('pv-lines').replaceChildren(...lines.map((line) => createPvLine(fen, line)));
  setEngineArrows(lines);
}

function evalBarText(ev, text) {
  if (ev.mate === 0) return text;
  if (ev.mate) return text.replace(/(\.\d)\d$/, '$1');
  const unsigned = text.replace(/^\+/, '');
  return Math.abs(ev.cp ?? 0) >= 1000 ? unsigned.split('.')[0] : unsigned.replace(/(\.\d)\d$/, '$1');
}

function setEvalDisplay(ev) {
  const whitePercent = winPercent(ev);
  const text = formatEval(ev);
  $('evalbar-white').style.transform = `scaleY(${whitePercent / 100})`;
  const barText = $('evalbar-text');
  barText.textContent = evalBarText(ev, text);
  barText.className = `evalbar-text ${whitePercent >= 50 ? 'on-white' : 'on-black'}`;
  $('engine-eval').textContent = text;
}
