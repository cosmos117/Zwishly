// Win percentage and accuracy follow the formulas Lichess publishes.

const hasMate = (ev) => ev.mate !== null && ev.mate !== undefined;

export function winPercent(ev) {
  if (!ev) return 50;
  if (hasMate(ev)) {
    if (ev.mate === 0) return ev.cp >= 0 ? 100 : 0;
    return ev.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, ev.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatEval(ev) {
  if (!ev) return '…';
  if (hasMate(ev)) {
    if (ev.mate === 0) return ev.cp >= 0 ? '1-0' : '0-1';
    return `${ev.mate > 0 ? '' : '-'}M${Math.abs(ev.mate)}`;
  }
  const pawns = (ev.cp ?? 0) / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export const CLASSES = {
  glorious: { label: 'Glorious', symbol: '👑', color: '#f5b301' },
  textbook: { label: 'TextBook', symbol: '📖', color: '#a88865' },
  best: { label: 'Best', symbol: '★', color: '#5fb85f' },
  decent: { label: 'Decent', symbol: '✓', color: '#9bb67a' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f0c03a' },
  overlook: { label: 'Overlook', symbol: '✕', color: '#e0587a' },
  error: { label: 'Error', symbol: '?', color: '#e88b2a' },
  blunder: { label: 'Blunder', symbol: '??', color: '#d9443a' },
};

const moverWinPercent = (ev, color) => (color === 'w' ? winPercent(ev) : 100 - winPercent(ev));
const isMateFor = (ev, color) => Boolean(ev?.mate) && Math.sign(ev.mate) === (color === 'w' ? 1 : -1);

function gloriousReason({ tactics, isBest, second, after, color, wpBefore, wpAfter, loss }) {
  if (tactics.forced || tactics.recapture) return null;
  const alreadyWinning = wpBefore >= 97;
  if (tactics.sacrifice && loss < 2 && wpAfter >= 50 && (!alreadyWinning || isMateFor(after, color))) return 'sacrifice';
  if (alreadyWinning || !isBest || !second || wpAfter < 40) return null;
  const wpSecond = moverWinPercent(second, color);
  return wpBefore - wpSecond >= 20 && wpSecond < 80 ? 'only' : null;
}

function isOverlook({ before, after, color, wpBefore, wpAfter, loss }) {
  if (wpAfter < 35) return false;
  const missedShortMate = isMateFor(before, color) && Math.abs(before.mate) <= 5 && !isMateFor(after, color);
  const lostClearAdvantage = wpBefore >= 65 && wpAfter <= 60 && loss >= 10;
  return missedShortMate || lostClearAdvantage;
}

function severity(loss) {
  if (loss < 5) return 'decent';
  if (loss < 10) return 'inaccuracy';
  return loss < 20 ? 'error' : 'blunder';
}

// Lichess's per-move accuracy curve, including its +1 bonus for the engine's own imperfection.
export function moveAccuracy(loss) {
  if (loss <= 0) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

// The eval of the position after a move comes from a separate search, so at a fixed depth it can
// disagree with the search that judged the move. When the played move is one of the engine's
// lines, that line's score is used instead; when it is not, it cannot be better than the
// weakest line the engine preferred over it.
export function playedMoveEval({ after, lines = [], uci, color }) {
  if (!lines.length || !uci) return after;
  const line = lines.find((l) => l.uci === uci);
  if (line) return line.ev;
  const worstShown = lines[lines.length - 1].ev;
  return moverWinPercent(after, color) > moverWinPercent(worstShown, color) ? worstShown : after;
}

export function classifyMove({ before, after, second, color, isBest, book, tactics = {}, lines, uci }) {
  const judged = playedMoveEval({ after, lines, uci, color });
  const wpBefore = moverWinPercent(before, color);
  const wpAfter = isBest ? wpBefore : moverWinPercent(judged, color);
  const loss = Math.max(0, wpBefore - wpAfter);
  const accuracy = moveAccuracy(loss);
  const scores = { loss, accuracy, wpAfter };
  const move = { before, after, second, color, isBest, tactics, wpBefore, wpAfter, loss };

  if (book) return { ...scores, cls: 'textbook', opening: book };
  if (isBest || loss < 1) {
    const reason = gloriousReason(move);
    return reason ? { ...scores, cls: 'glorious', reason } : { ...scores, cls: 'best' };
  }
  return { ...scores, cls: isOverlook(move) ? 'overlook' : severity(loss) };
}

function standardDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

// Lichess weights each move by how volatile the game was around it (the standard deviation of
// win% over a sliding window), so a slip in a sharp position counts more than one in a dead
// equal or long-decided one. Returns one weight per move for evals of length moves + 1.
export function volatilityWeights(evals) {
  const wins = evals.map(winPercent);
  const moves = wins.length - 1;
  if (moves < 1) return [];
  const size = Math.min(wins.length, Math.max(2, Math.min(8, Math.floor(wins.length / 10))));
  const first = wins.slice(0, size);
  const windows = Array.from({ length: Math.max(0, size - 2) }, () => first);
  for (let i = 0; i + size <= wins.length; i++) windows.push(wins.slice(i, i + size));
  return windows.slice(0, moves).map((w) => Math.max(0.5, Math.min(12, standardDeviation(w))));
}

// Average of the volatility-weighted mean and the harmonic mean, as Lichess computes it. The
// harmonic mean keeps a single blunder from being hidden by many easy moves.
export function aggregateAccuracy(values, weights = values.map(() => 1)) {
  if (!values.length) return null;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedMean = values.reduce((a, v, i) => a + v * weights[i], 0) / totalWeight;
  const harmonicMean = values.length / values.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return (weightedMean + harmonicMean) / 2;
}
