// One-sentence explanations for reviewed moves. Detectors read facts off the board and the
// engine's moves (the better move, and the opponent's best reply to the move played); each fact
// has several phrasings, and a game cycles through them so the same sentence doesn't repeat.
import { Chess } from 'chess.js';
import { winPercent } from './analysis.js';
import { uciToMove } from './chess-utils.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' };
const BAD = ['inaccuracy', 'overlook', 'error', 'blunder'];
const GOOD = ['best', 'glorious'];

const opponent = (color) => (color === 'w' ? 'b' : 'w');
const moverWin = (ev, color) => (color === 'w' ? winPercent(ev) : 100 - winPercent(ev));
const mateFor = (ev, color) => (ev?.mate && Math.sign(ev.mate) === (color === 'w' ? 1 : -1) ? Math.abs(ev.mate) : null);
const moves = (n) => (n === 1 ? '1 move' : `${n} moves`);

function play(fen, uci) {
  if (!uci) return null;
  const chess = new Chess(fen);
  try {
    return { chess, move: chess.move(uciToMove(uci)) };
  } catch {
    return null;
  }
}

// A piece is en prise when it can be taken for free, or by something worth less.
function isEnPrise(chess, square) {
  const piece = chess.get(square);
  if (!piece) return false;
  const defenders = chess.attackers(square, piece.color);
  const attackers = chess
    .attackers(square, opponent(piece.color))
    .map((s) => chess.get(s).type)
    .filter((type) => type !== 'k' || !defenders.length);
  if (!attackers.length) return false;
  return !defenders.length || Math.min(...attackers.map((t) => VALUE[t])) < VALUE[piece.type];
}

// ---- What happened on the board -------------------------------------------------------------

function badMoveFact({ move, before, after, bestUci, replyUci, previous }) {
  const color = move.color;
  const best = play(move.before, bestUci);
  const played = play(move.before, move.uci);
  if (!played) return null;
  const bestSan = best?.move.san;

  const mateAgainst = mateFor(after, opponent(color));
  if (mateAgainst && !mateFor(before, opponent(color))) {
    const replySan = play(played.chess.fen(), replyUci)?.move.san;
    if (mateAgainst === 1 && replySan) return { key: 'allowsMateInOne', replySan };
    return { key: 'allowsMate', n: mateAgainst };
  }

  const mateWas = mateFor(before, color);
  if (mateWas && !mateFor(after, color) && bestSan) return { key: mateWas === 1 ? 'missedMateInOne' : 'missedMate', n: mateWas, bestSan };

  // The engine's reply to the move played: if it simply takes something, that is the problem.
  const reply = play(played.chess.fen(), replyUci);
  if (reply?.move.captured && reply.move.captured !== 'k' && isEnPrise(played.chess, reply.move.to)) {
    const square = reply.move.to;
    const piece = NAME[reply.move.captured];
    if (square === move.to) return { key: 'hangsMovedPiece', piece, square, replySan: reply.move.san };
    const threatened = new Chess(move.before);
    if (isEnPrise(threatened, square) && best?.move.from === square) return { key: 'missedSave', piece, square, bestSan };
    return { key: 'hangsPiece', piece, square, replySan: reply.move.san };
  }

  if (best?.move.captured && previous?.captured && previous.to === best.move.to && move.to !== best.move.to) {
    return { key: 'missedRecapture', square: best.move.to, bestSan };
  }

  if (best?.move.captured && isEnPrise(new Chess(move.before), best.move.to)) {
    return { key: 'missedFreePiece', piece: NAME[best.move.captured], square: best.move.to, bestSan };
  }

  if (best && best.move.from !== move.from && best.move.piece !== 'k' && VALUE[best.move.piece] >= 3 && isEnPrise(new Chess(move.before), best.move.from)) {
    return { key: 'missedSave', piece: NAME[best.move.piece], square: best.move.from, bestSan };
  }

  const wasWin = moverWin(before, color);
  const nowWin = moverWin(after, color);
  if (wasWin >= 80 && nowWin < 65) return { key: 'throwsWin' };
  if (wasWin >= 60 && nowWin < 55) return { key: 'losesEdge' };
  if (wasWin >= 35 && nowWin < 35) return { key: 'givesEdge' };
  if (wasWin < 35) return { key: 'deepensTrouble' };
  return { key: 'drifts', bestSan };
}

function goodMoveFact({ move, after, previous, previousResult, result }) {
  const color = move.color;
  if (move.san.endsWith('#')) return { key: 'mates' };
  if (result.cls === 'glorious') return null; // the verdict already says why
  const mating = mateFor(after, color);
  if (mating) return { key: 'keepsMate', n: mating };
  if (move.tactics?.forced) return { key: 'onlyLegal' };

  const beforeBoard = new Chess(move.before);
  if (move.captured && previous?.captured && previous.to === move.to) return { key: 'recaptures', square: move.to };
  if (move.captured && isEnPrise(beforeBoard, move.to)) return { key: 'takesFree', piece: NAME[move.captured], square: move.to };
  if (['error', 'blunder', 'overlook'].includes(previousResult?.cls)) return { key: 'punishes' };
  const moved = beforeBoard.get(move.uci.slice(0, 2));
  if (moved && moved.type !== 'k' && VALUE[moved.type] >= 3 && isEnPrise(beforeBoard, move.uci.slice(0, 2))) return { key: 'savesPiece', piece: NAME[moved.type] };

  const win = moverWin(after, color);
  if (win >= 85) return { key: 'keepsWinning' };
  if (win <= 15) return { key: 'bestDefence' };
  if (win >= 60) return { key: 'buildsEdge' };
  if (win <= 40) return { key: 'holdsOn' };
  return { key: 'keepsBalance' };
}

function decentMoveFact({ move, before, bestUci }) {
  const bestSan = play(move.before, bestUci)?.move.san;
  const mateWas = mateFor(before, move.color);
  if (mateWas && bestSan) return { key: 'slowerMate', n: mateWas, bestSan };
  return bestSan ? { key: 'decent', bestSan } : null;
}

// ---- How to say it --------------------------------------------------------------------------

const PHRASES = {
  allowsMate: [
    (f) => `This walks into a forced mate in ${moves(f.n)}.`,
    (f) => `${f.opp} now has mate in ${moves(f.n)}.`,
    (f) => `A fatal slip: the king can no longer escape mate in ${moves(f.n)}.`,
    (f) => `The king's cover is gone, and ${f.opp} mates in ${moves(f.n)}.`,
  ],
  allowsMateInOne: [
    (f) => `This allows ${f.replySan}, checkmate.`,
    (f) => `${f.opp} mates at once with ${f.replySan}.`,
    (f) => `The king is left defenceless against ${f.replySan}.`,
  ],
  missedMateInOne: [
    (f) => `${f.bestSan} was checkmate.`,
    (f) => `Mate in one was on the board: ${f.bestSan}.`,
    (f) => `${f.side} missed ${f.bestSan}, ending the game on the spot.`,
  ],
  missedMate: [
    (f) => `${f.bestSan} led to mate in ${moves(f.n)}.`,
    (f) => `There was a forced mate in ${moves(f.n)}, starting with ${f.bestSan}.`,
    (f) => `${f.side} let a mating attack slip away: ${f.bestSan} wins by force.`,
    (f) => `Checkmate was on the board. ${f.bestSan} finishes in ${moves(f.n)}.`,
  ],
  hangsMovedPiece: [
    (f) => `The ${f.piece} on ${f.square} can simply be taken with ${f.replySan}.`,
    (f) => `This puts the ${f.piece} on an unsafe square, and ${f.replySan} wins it.`,
    (f) => `${f.square} isn't safe: ${f.replySan} picks up the ${f.piece}.`,
    (f) => `The ${f.piece} lands where it can be captured. ${f.replySan} takes it.`,
  ],
  hangsPiece: [
    (f) => `This leaves the ${f.piece} on ${f.square} undefended, and ${f.replySan} takes it.`,
    (f) => `${f.opp} can now win the ${f.piece} on ${f.square} with ${f.replySan}.`,
    (f) => `The ${f.piece} on ${f.square} is left hanging.`,
    (f) => `Nothing guards the ${f.piece} on ${f.square} anymore, so ${f.replySan} wins material.`,
  ],
  missedSave: [
    (f) => `The ${f.piece} on ${f.square} was under attack. ${f.bestSan} moves it to safety.`,
    (f) => `This ignores the threat to the ${f.piece} on ${f.square}.`,
    (f) => `The ${f.piece} on ${f.square} needed rescuing, and ${f.bestSan} does that.`,
    (f) => `${f.side} left the attacked ${f.piece} on ${f.square} where it was.`,
  ],
  missedRecapture: [
    (f) => `${f.bestSan} wins the material back on ${f.square}.`,
    (f) => `The natural recapture ${f.bestSan} was missing here.`,
    (f) => `Taking back on ${f.square} with ${f.bestSan} restores the material balance.`,
  ],
  missedFreePiece: [
    (f) => `The ${f.piece} on ${f.square} was there for the taking with ${f.bestSan}.`,
    (f) => `${f.side} missed a free ${f.piece}: ${f.bestSan}.`,
    (f) => `${f.bestSan} wins the ${f.piece} on ${f.square}, which wasn't properly defended.`,
    (f) => `An unprotected ${f.piece} on ${f.square} went unnoticed.`,
  ],
  throwsWin: [
    () => 'A winning position slips away here.',
    (f) => `${f.side} was close to winning, but this lets ${f.opp} back into the game.`,
    () => 'Most of the advantage disappears with this move.',
  ],
  losesEdge: [
    () => 'The advantage starts to fade after this.',
    (f) => `${f.side} gives back the edge that had been built up.`,
    () => 'This lets the pressure off and evens things out.',
  ],
  givesEdge: [
    (f) => `This hands ${f.opp} the better game.`,
    (f) => `After this, ${f.opp} is clearly more comfortable.`,
    (f) => `The balance tips in ${f.opp}'s favour.`,
  ],
  deepensTrouble: [
    () => 'An already difficult position gets worse.',
    (f) => `${f.side} was under pressure, and this adds to the problems.`,
    () => 'The position needed more resistance than this.',
  ],
  drifts: [
    (f) => `${f.bestSan} was more to the point.`,
    () => 'There was a more purposeful move here.',
    (f) => `A stronger plan started with ${f.bestSan}.`,
  ],
  slowerMate: [
    (f) => `Still winning, but ${f.bestSan} mates in ${moves(f.n)}.`,
    (f) => `There was a faster finish: mate in ${moves(f.n)} with ${f.bestSan}.`,
  ],
  decent: [
    (f) => `A reasonable choice, though ${f.bestSan} was a little more precise.`,
    (f) => `Fine, but ${f.bestSan} was slightly stronger.`,
    () => 'A solid move that keeps the position intact.',
    (f) => `Playable. ${f.bestSan} would have squeezed out a bit more.`,
  ],
  mates: [() => 'Checkmate.', () => 'Checkmate. The game is over.', () => 'And that is mate.'],
  keepsMate: [
    (f) => `Mate follows in ${moves(f.n)}.`,
    (f) => `The mating net closes: mate in ${moves(f.n)}.`,
    (f) => `${f.side} keeps the forced mate going, ${moves(f.n)} left.`,
  ],
  onlyLegal: [() => 'The only legal move.', () => 'There was no choice here.', () => 'Forced: nothing else was legal.'],
  recaptures: [
    (f) => `Recaptures on ${f.square} and restores the material.`,
    (f) => `Takes back on ${f.square}, the right recapture.`,
    () => 'Winning the material back straight away.',
  ],
  takesFree: [
    (f) => `Grabs the unprotected ${f.piece} on ${f.square}.`,
    (f) => `The ${f.piece} on ${f.square} was hanging, and this takes it.`,
    (f) => `A free ${f.piece}, collected.`,
  ],
  punishes: [
    (f) => `Punishes ${f.opp}'s mistake straight away.`,
    () => 'Exactly the reply the previous move deserved.',
    (f) => `${f.side} spots the error and takes advantage.`,
    () => 'Makes the opponent pay for the last move.',
  ],
  savesPiece: [
    (f) => `Gets the attacked ${f.piece} out of danger.`,
    (f) => `The ${f.piece} was under fire, and this moves it to safety.`,
    (f) => `Rescues the ${f.piece} from the attack.`,
  ],
  keepsWinning: [
    () => 'Keeps a firm grip on a winning position.',
    () => 'No chances given. The win stays on track.',
    (f) => `${f.side} stays in full control.`,
    () => 'Clean and accurate, the advantage remains decisive.',
  ],
  bestDefence: [
    () => 'The most stubborn defence available.',
    () => 'In a tough spot, this puts up the most resistance.',
    (f) => `${f.side} makes it as hard as possible for the opponent.`,
  ],
  buildsEdge: [
    () => 'Keeps the pressure on and the advantage intact.',
    (f) => `${f.side} keeps the upper hand.`,
    () => 'Strengthens a position that was already better.',
    () => 'Accurate, and the edge is maintained.',
  ],
  holdsOn: [
    () => 'Holds things together in a difficult position.',
    (f) => `${f.side} limits the damage and stays in the game.`,
    () => 'The right way to fight back from a worse position.',
  ],
  keepsBalance: [
    () => 'Keeps the position balanced.',
    () => 'A precise move that maintains the equilibrium.',
    () => 'Exactly what the position asked for.',
    () => 'Solid and correct. Neither side has gained anything.',
  ],
};

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Each phrasing of a fact is used once before any repeats, starting from a point that depends on
// the game, so two games don't read the same way either.
function phraser(gameSeed) {
  const used = new Map();
  return (fact, color) => {
    const variants = PHRASES[fact.key];
    const count = used.get(fact.key) ?? 0;
    used.set(fact.key, count + 1);
    const pick = variants[(hash(gameSeed + fact.key) + count) % variants.length];
    return pick({ ...fact, side: SIDE[color], opp: SIDE[opponent(color)] });
  };
}

// moves: the reviewed mainline; review: { evals, best, results }. Returns one sentence (or null) per move.
export function explainGame(moves, { evals, best, results }) {
  const say = phraser(`${moves[0]?.before ?? ''}${moves.length}`);
  return moves.map((move, index) => {
    const context = {
      move,
      result: results[index],
      before: evals[index],
      after: evals[index + 1],
      bestUci: best[index],
      replyUci: best[index + 1],
      previous: moves[index - 1],
      previousResult: results[index - 1],
    };
    const { cls } = results[index];
    let fact = null;
    try {
      if (BAD.includes(cls)) fact = badMoveFact(context);
      else if (GOOD.includes(cls)) fact = goodMoveFact(context);
      else if (cls === 'decent') fact = decentMoveFact(context);
    } catch {
      fact = null;
    }
    return fact ? say(fact, move.color) : null;
  });
}
