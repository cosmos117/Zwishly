import { Chess } from 'chess.js';
import { CLASSES, aggregateAccuracy, classifyMove, winPercent } from '../analysis.js';
import { terminalEval } from '../chess-utils.js';
import { loadOpenings, openingAt } from '../openings.js';
import { tacticsOf } from './classification.js';
import { $, escapeHtml, setHidden, toast } from './dom.js';
import { engine, showReviewStarted } from './engine-panel.js';
import { currentReview, game, goTo, mainlinePly, notifyGameChange } from './game.js';
import { playerName, renderPlayers } from './players-panel.js';

const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 120;
const MARKED_ON_GRAPH = ['glorious', 'inaccuracy', 'overlook', 'error', 'blunder'];

let cancelRequested = false;

async function evaluatePosition(fen, depth) {
  const final = terminalEval(new Chess(fen));
  if (final) return { ev: final, best: null, second: undefined };

  const result = await engine.analyze(fen, { depth, multipv: 2 });
  if (result.stopped) return null;
  const [top, second] = result.lines;
  return {
    ev: top ? { cp: top.cp, mate: top.mate } : { cp: 0, mate: null },
    best: result.bestmove,
    second: second ? { cp: second.cp, mate: second.mate } : null,
  };
}

function setReviewRunning(running) {
  game.reviewing = running;
  $('btn-review-label').textContent = running ? 'Cancel review' : 'Review game';
  $('btn-review').classList.toggle('running', running);
  $('review-depth').disabled = running;
  setHidden($('review-progress'), !running);
}

function buildReview(moves, positions, version) {
  const evals = positions.map((p) => p.ev);
  const best = positions.map((p) => p.best);
  const results = moves.map((move, index) =>
    classifyMove({
      before: evals[index],
      after: evals[index + 1],
      second: positions[index].second,
      color: move.color,
      isBest: best[index] === move.uci,
      book: openingAt(move.fen),
      tactics: tacticsOf(move, moves[index - 1]),
    }),
  );
  const accuracyFor = (color) => aggregateAccuracy(results.filter((_, i) => moves[i].color === color).map((r) => r.accuracy));
  return { version, evals, best, results, accuracy: { w: accuracyFor('w'), b: accuracyFor('b') } };
}

export async function toggleReview() {
  if (game.reviewing) {
    cancelRequested = true;
    engine.stop();
    return;
  }
  if (!game.mainline.length) {
    toast('There’s nothing to review yet. Open a game or play a few moves first.');
    return;
  }

  const { version } = game;
  const moves = game.mainline.slice();
  const fens = [game.startFen, ...moves.map((move) => move.fen)];
  const depth = Number($('review-depth').value);
  await loadOpenings();

  cancelRequested = false;
  setReviewRunning(true);
  showReviewStarted();
  engine.newGame();

  const positions = [];
  for (const fen of fens) {
    if (cancelRequested || game.version !== version) break;
    const position = await evaluatePosition(fen, depth);
    if (!position) break;
    positions.push(position);
    $('review-progress-bar').style.width = `${(positions.length / fens.length) * 100}%`;
    drawGraph(positions.map((p) => p.ev), null, fens.length - 1);
  }

  const completed = positions.length === fens.length && game.version === version;
  setReviewRunning(false);
  game.review = completed ? buildReview(moves, positions, version) : null;
  renderReview();
  notifyGameChange();
}

function countByClass(results) {
  const counts = { w: {}, b: {} };
  results.forEach(({ cls }, index) => {
    const { color } = game.mainline[index];
    counts[color][cls] = (counts[color][cls] ?? 0) + 1;
  });
  return counts;
}

function playerCardHtml(color, accuracy) {
  const value = accuracy === null ? '–' : accuracy.toFixed(1);
  const unit = accuracy === null ? '' : '<small>%</small>';
  const width = accuracy === null ? 0 : Math.max(0, Math.min(100, accuracy));
  return `<div class="rs-player">
      <div class="rs-name"><span class="dot ${color === 'w' ? 'white' : 'black'}"></span><span title="${escapeHtml(playerName(color))}">${escapeHtml(playerName(color))}</span></div>
      <div class="rs-acc">${value}${unit}</div>
      <div class="rs-acc-label">Accuracy</div>
      <div class="rs-bar"><span style="width:${width}%"></span></div>
    </div>`;
}

function countCell(count, color) {
  return count ? `<td class="rs-count" style="color:${color}">${count}</td>` : '<td class="rs-count zero">0</td>';
}

function summaryHtml({ accuracy, results }) {
  const counts = countByClass(results);
  const rows = Object.entries(CLASSES).map(
    ([key, { color, symbol, label }]) =>
      `<tr class="row-${key}">${countCell(counts.w[key] ?? 0, color)}<td class="rs-cls"><span class="badge cls-${key}" style="background:${color}">${symbol}</span><span>${label}</span></td>${countCell(counts.b[key] ?? 0, color)}</tr>`,
  );
  return `<div class="rs-players">${playerCardHtml('w', accuracy.w)}${playerCardHtml('b', accuracy.b)}</div>
    <table class="rs-table"><tbody>${rows.join('')}</tbody></table>`;
}

export function renderReview() {
  const review = currentReview();
  const summary = $('review-summary');
  setHidden(summary, !review);
  // A reviewed game has nothing left to start, so the button and depth choice go away until another game opens.
  setHidden(document.querySelector('.review-head'), Boolean(review));
  if (review) {
    summary.innerHTML = summaryHtml(review);
    drawGraph(review.evals, review.results, review.evals.length - 1);
  } else if (!game.reviewing) {
    setHidden($('eval-graph'), true);
  }
  renderPlayers();
}

function graphMarkers(evals, results, x, y) {
  return results
    .map(({ cls }, index) => {
      if (!MARKED_ON_GRAPH.includes(cls)) return '';
      const glorious = cls === 'glorious';
      const outline = glorious ? ' stroke="#fff" stroke-width="1.5"' : '';
      return `<circle cx="${x(index + 1)}" cy="${y(evals[index + 1])}" r="${glorious ? 5.5 : 4}" fill="${CLASSES[cls].color}"${outline} />`;
    })
    .join('');
}

function drawGraph(evals, results, totalPlies) {
  const x = (ply) => (totalPlies ? (ply / totalPlies) * GRAPH_WIDTH : 0);
  const y = (ev) => GRAPH_HEIGHT - (winPercent(ev) / 100) * GRAPH_HEIGHT;
  const curve = evals.map((ev, ply) => `L${x(ply).toFixed(1)},${y(ev).toFixed(1)}`).join(' ');
  const close = evals.length ? `L${x(evals.length - 1).toFixed(1)},${GRAPH_HEIGHT} Z` : '';

  const graph = $('eval-graph');
  setHidden(graph, false);
  graph.innerHTML = `
    <rect width="${GRAPH_WIDTH}" height="${GRAPH_HEIGHT}" class="g-bg" />
    <path d="M0,${GRAPH_HEIGHT} ${curve} ${close}" class="g-area" />
    <line x1="0" x2="${GRAPH_WIDTH}" y1="${GRAPH_HEIGHT / 2}" y2="${GRAPH_HEIGHT / 2}" class="g-mid" />
    <line id="g-cursor" x1="0" x2="0" y1="0" y2="${GRAPH_HEIGHT}" class="g-cursor" />
    ${results ? graphMarkers(evals, results, x, y) : ''}`;
  renderGraphCursor();
}

function graphedPlies() {
  const review = currentReview();
  return review ? review.evals.length - 1 : game.mainline.length;
}

export function renderGraphCursor() {
  const cursor = $('g-cursor');
  if (!cursor) return;
  const total = graphedPlies();
  const x = total ? (Math.min(mainlinePly(), total) / total) * GRAPH_WIDTH : 0;
  cursor.setAttribute('x1', x);
  cursor.setAttribute('x2', x);
}

$('eval-graph').addEventListener('click', (event) => {
  const total = graphedPlies();
  if (!total) return;
  const { left, width } = event.currentTarget.getBoundingClientRect();
  const ply = Math.round(((event.clientX - left) / width) * total);
  goTo(false, Math.max(0, Math.min(total, ply)));
});
