import { Chess } from 'chess.js';

export const START_FEN = new Chess().fen();

export const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
export const uciToMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
export const moveToUci = (move) => move.from + move.to + (move.promotion || '');
export const colorName = (color) => (color === 'w' ? 'white' : 'black');

export function moveLabel(move) {
  const number = move.before.split(' ')[5];
  return `${number}${move.color === 'w' ? '.' : '...'} ${move.san}`;
}

export function terminalEval(chess) {
  if (chess.isCheckmate()) return { mate: 0, cp: chess.turn() === 'w' ? -1 : 1 };
  if (chess.isDraw()) return { cp: 0, mate: null };
  return null;
}

export function sanLine(fen, ucis, limit) {
  const chess = new Chess(fen);
  const line = [];
  for (const uci of ucis.slice(0, limit)) {
    const turn = chess.turn();
    const moveNumber = chess.moveNumber();
    let move;
    try {
      move = chess.move(uciToMove(uci));
    } catch {
      break;
    }
    const number = turn === 'w' ? `${moveNumber}.` : line.length === 0 ? `${moveNumber}...` : '';
    line.push({ san: move.san, number });
  }
  return line;
}
