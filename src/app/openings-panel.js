import { START_FEN, moveLabel } from '../chess-utils.js';
import { renderExplorer } from '../explorer.js';
import { openingAt } from '../openings.js';
import { $, escapeHtml, setHidden } from './dom.js';
import { currentFen, currentLine, cursorPly, game, playLine } from './game.js';

function lastBookMove() {
  const playedMoves = currentLine().slice(0, cursorPly());
  return playedMoves.findLast((move) => openingAt(move.fen)) ?? null;
}

export function renderOpening() {
  const bookMove = lastBookMove();
  const opening = bookMove && openingAt(bookMove.fen);

  if (!$('tab-openings').classList.contains('hidden')) {
    renderExplorer($('explorer'), {
      fen: currentFen(),
      opening,
      isStart: currentFen() === START_FEN,
      side: game.orientation === 'white' ? 'w' : 'b',
      leftAfter: bookMove && moveLabel(bookMove),
      onPlay: playLine,
    });
  }

  const bar = $('opening');
  setHidden(bar, !opening);
  if (opening) bar.innerHTML = `<span class="eco">${opening[0]}</span> ${escapeHtml(opening[1])}`;
}
