import { Chess } from 'chess.js';
import { START_FEN, moveToUci, uciToMove } from '../chess-utils.js';

export const game = {
  startFen: START_FEN,
  headers: {},
  mainline: [],
  variation: null, // { branchPly, moves }
  cursor: { inVariation: false, index: 0 },
  orientation: 'white',
  version: 0,
  review: null, // { version, evals, best, results, accuracy }; results may cover only part of the mainline
  reviewing: false,
};

let changeListener = () => {};

export function onGameChange(listener) {
  changeListener = listener;
}

export function notifyGameChange() {
  changeListener();
}

export function currentLine() {
  const { cursor, mainline, variation } = game;
  return cursor.inVariation ? [...mainline.slice(0, variation.branchPly), ...variation.moves] : mainline;
}

export function cursorPly() {
  const { cursor, variation } = game;
  return cursor.inVariation ? variation.branchPly + cursor.index : cursor.index;
}

export function mainlinePly() {
  return game.cursor.inVariation ? game.variation.branchPly : game.cursor.index;
}

const activeMoves = () => (game.cursor.inVariation ? game.variation.moves : game.mainline);

export const currentMove = () => activeMoves()[game.cursor.index - 1];
export const currentFen = () => currentMove()?.fen ?? game.startFen;

export function currentReview() {
  return game.review?.version === game.version ? game.review : null;
}

export function moveTo(inVariation, index) {
  game.cursor = { inVariation, index };
}

export function goTo(inVariation, index) {
  moveTo(inVariation, index);
  notifyGameChange();
}

export function stepForward() {
  if (game.cursor.index < activeMoves().length) goTo(game.cursor.inVariation, game.cursor.index + 1);
}

export function moveCursorBack() {
  const { inVariation, index } = game.cursor;
  if (inVariation && index > 1) moveTo(true, index - 1);
  else if (inVariation) moveTo(false, game.variation.branchPly);
  else if (index > 0) moveTo(false, index - 1);
  else return false;
  return true;
}

export function stepBack() {
  if (moveCursorBack()) notifyGameChange();
}

export const goToStart = () => goTo(false, 0);
export const goToEnd = () => goTo(game.cursor.inVariation, activeMoves().length);

export function toMoveNode(move) {
  return {
    san: move.san,
    uci: moveToUci(move),
    from: move.from,
    to: move.to,
    fen: move.after,
    before: move.before,
    color: move.color,
    captured: move.captured,
  };
}

function addToMainline(node) {
  const { cursor, mainline } = game;
  if (mainline[cursor.index]?.uci === node.uci) {
    cursor.index++;
  } else if (cursor.index === mainline.length) {
    mainline.push(node);
    cursor.index++;
  } else {
    game.variation = { branchPly: cursor.index, moves: [node] };
    game.cursor = { inVariation: true, index: 1 };
  }
}

function addToVariation(node) {
  const { cursor, variation } = game;
  if (variation.moves[cursor.index]?.uci !== node.uci) {
    variation.moves.length = cursor.index;
    variation.moves.push(node);
  }
  cursor.index++;
}

function applyMove(moveRequest) {
  let move;
  try {
    move = new Chess(currentFen()).move(moveRequest);
  } catch {
    return false;
  }
  const node = toMoveNode(move);
  if (game.cursor.inVariation) addToVariation(node);
  else addToMainline(node);
  return true;
}

export function playMove(from, to, promotion) {
  applyMove({ from, to, promotion });
  notifyGameChange();
}

export function playLine(ucis) {
  ucis.every((uci) => applyMove(uciToMove(uci)));
  notifyGameChange();
}

export function deleteVariation() {
  const { branchPly } = game.variation;
  game.variation = null;
  if (game.cursor.inVariation) game.cursor = { inVariation: false, index: branchPly };
  notifyGameChange();
}

export function replaceGame(startFen, mainline, headers) {
  Object.assign(game, {
    startFen,
    mainline,
    headers,
    variation: null,
    cursor: { inVariation: false, index: 0 },
    version: game.version + 1,
    review: null,
    reviewing: false,
  });
}

export function parsePgn(pgn) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch {
    return null;
  }
  const history = chess.history({ verbose: true });
  return {
    startFen: history.length ? history[0].before : chess.fen(),
    mainline: history.map(toMoveNode),
    headers: chess.getHeaders(),
  };
}

export function gameToPgn() {
  const chess = new Chess(game.startFen);
  for (const [key, value] of Object.entries(game.headers)) if (value) chess.setHeader(key, value);
  if (game.startFen !== START_FEN) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', game.startFen);
  }
  for (const move of game.mainline) chess.move(move.san);
  return chess.pgn();
}
