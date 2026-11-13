import { Chess } from 'chess.js';
import { uciToMove } from './chess-utils.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MIN_SACRIFICE = 2;

// One-ply estimate: an undefended victim is won outright, a defended one nets victim minus attacker.
function bestCaptureGain(chess) {
  let bestGain = 0;
  for (const capture of chess.moves({ verbose: true })) {
    if (!capture.captured) continue;
    chess.move(capture);
    const defended = chess.moves({ verbose: true }).some((reply) => reply.to === capture.to);
    chess.undo();
    const gain = defended ? VALUE[capture.captured] - VALUE[capture.piece] : VALUE[capture.captured];
    bestGain = Math.max(bestGain, gain);
  }
  return bestGain;
}

function threatGainForOpponent(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return bestCaptureGain(new Chess(parts.join(' ')));
  } catch {
    return 0;
  }
}

export function moveTactics(beforeFen, uci, previousMove) {
  const chess = new Chess(beforeFen);
  const forced = chess.moves().length <= 1;
  let move;
  try {
    move = chess.move(uciToMove(uci));
  } catch {
    return { forced, recapture: false, sacrifice: false };
  }
  const recapture = Boolean(previousMove?.captured && move.captured && previousMove.to === move.to);
  const materialWon = move.captured ? VALUE[move.captured] : 0;
  const offeredAfter = bestCaptureGain(chess);
  const offeredBefore = threatGainForOpponent(beforeFen);
  const sacrifice = offeredAfter - materialWon >= MIN_SACRIFICE && offeredAfter > offeredBefore;
  return { forced, recapture, sacrifice };
}
