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

export function classifyMove({ before, after, second, color, isBest, book, tactics = {} }) {
  const wpBefore = moverWinPercent(before, color);
  const wpAfter = moverWinPercent(after, color);
  const loss = Math.max(0, wpBefore - wpAfter);
  const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  const scores = { loss, accuracy, wpAfter };
  const move = { before, after, second, color, isBest, tactics, wpBefore, wpAfter, loss };

  if (book) return { ...scores, cls: 'textbook', opening: book };
  if (isBest || loss < 1) {
    const reason = gloriousReason(move);
    return reason ? { ...scores, cls: 'glorious', reason } : { ...scores, cls: 'best' };
  }
  return { ...scores, cls: isOverlook(move) ? 'overlook' : severity(loss) };
}

export function aggregateAccuracy(values) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const harmonicMean = values.length / values.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return (mean + harmonicMean) / 2;
}
