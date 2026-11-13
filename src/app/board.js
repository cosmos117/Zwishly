import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import { CLASSES } from '../analysis.js';
import { colorName } from '../chess-utils.js';
import { pieceUrl } from '../themes.js';
import { classificationAt } from './classification.js';
import { $, setHidden } from './dom.js';
import { currentFen, currentLine, currentMove, cursorPly, game, notifyGameChange, playMove } from './game.js';
import { prefs } from './prefs.js';

const ANIMATION_MS = 260;
const PROMOTIONS = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

let animatingUntil = 0;
let shownBadge = null;

const board = Chessground($('board'), {
  orientation: game.orientation,
  coordinates: prefs.coords,
  movable: { free: false, showDests: true, events: { after: onBoardMove } },
  premovable: { enabled: false },
  highlight: { lastMove: true, check: true },
  animation: { enabled: true, duration: ANIMATION_MS },
  drawable: { enabled: true },
});

function onBoardMove(from, to) {
  const piece = new Chess(currentFen()).get(from);
  const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
  if (promotes) showPromotionPicker(piece.color, from, to);
  else playMove(from, to);
}

function promotionButton(color, from, to, piece, picker) {
  const button = document.createElement('button');
  const image = document.createElement('img');
  image.src = pieceUrl(prefs.pieces, color, piece.toUpperCase());
  image.alt = piece;
  button.append(image);
  button.title = PROMOTIONS[piece];
  button.onclick = (event) => {
    event.stopPropagation();
    setHidden(picker, true);
    playMove(from, to, piece);
  };
  return button;
}

function showPromotionPicker(color, from, to) {
  const picker = $('promo');
  picker.replaceChildren(...Object.keys(PROMOTIONS).map((piece) => promotionButton(color, from, to, piece, picker)));
  picker.onclick = () => {
    setHidden(picker, true);
    notifyGameChange();
  };
  setHidden(picker, false);
}

function legalDestinations(chess) {
  const destinations = new Map();
  for (const { from, to } of chess.moves({ verbose: true })) {
    if (!destinations.has(from)) destinations.set(from, []);
    destinations.get(from).push(to);
  }
  return destinations;
}

export function syncBoard(chess) {
  const turn = colorName(chess.turn());
  const last = currentMove();
  board.set({
    fen: currentFen(),
    turnColor: turn,
    lastMove: last ? [last.from, last.to] : undefined,
    check: chess.inCheck() ? turn : false,
    movable: { color: turn, dests: legalDestinations(chess) },
  });
  board.setAutoShapes([]);
  animatingUntil = performance.now() + ANIMATION_MS;
}

export const animationTimeLeft = () => animatingUntil - performance.now();

export function setBoardOrientation(color) {
  board.set({ orientation: color });
}

export function setBoardCoordinates(visible) {
  board.set({ coordinates: visible });
  board.redrawAll();
}

export function setEngineArrows(lines) {
  const arrows = lines
    .filter((line) => line.pv[0])
    .map((line, rank) => ({
      orig: line.pv[0].slice(0, 2),
      dest: line.pv[0].slice(2, 4),
      brush: rank === 0 ? 'paleGreen' : 'paleBlue',
      modifiers: { lineWidth: rank === 0 ? 14 : 8 },
    }));
  board.setAutoShapes(prefs.arrows ? arrows : []);
}

export function clearEngineArrows() {
  board.setAutoShapes([]);
}

function squarePosition(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const white = game.orientation === 'white';
  return { left: `${(white ? file : 7 - file) * 12.5}%`, top: `${(white ? 7 - rank : rank) * 12.5}%` };
}

function createBadge(node, cls) {
  const { color, symbol, label } = CLASSES[cls];
  const badge = document.createElement('div');
  badge.className = `board-badge cls-${cls}`;
  Object.assign(badge.style, squarePosition(node.to), { background: color });
  badge.textContent = symbol;
  badge.title = label;
  return badge;
}

export function renderBoardBadge() {
  const line = currentLine();
  const index = cursorPly() - 1;
  const node = line[index];
  const result = node ? classificationAt(line, index) : null;
  const badge = result ? `${node.fen}|${node.uci}|${result.cls}|${game.orientation}` : null;
  if (badge === shownBadge) return false;

  shownBadge = badge;
  $('badge-layer').replaceChildren(...(result ? [createBadge(node, result.cls)] : []));
  return true;
}
