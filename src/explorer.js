import { Chess } from 'chess.js';
import { moveLabel, moveToUci } from './chess-utils.js';
import { continuationsAt, openingAt } from './openings.js';
import { noteFor } from './opening-notes.js';

const LINES_PER_SIDE = 3;
const LINE_PLIES = 4;

function linesFor(fen, side) {
  const base = new Chess(fen);
  const lead = [];
  if (base.turn() !== side) {
    const reply = continuationsAt(fen)[0];
    if (!reply) return [];
    lead.push(base.move(reply[0]));
  }
  const branchFen = base.fen();
  return continuationsAt(branchFen)
    .slice(0, LINES_PER_SIDE)
    .map(([san]) => {
      const chess = new Chess(branchFen);
      const moves = [...lead, chess.move(san)];
      while (moves.length < LINE_PLIES) {
        const next = continuationsAt(chess.fen())[0];
        if (!next) break;
        moves.push(chess.move(next[0]));
      }
      return { moves, opening: openingAt(chess.fen()) };
    });
}

function lineText(moves) {
  return moves.map((move, index) => (move.color === 'w' || index === 0 ? moveLabel(move) : move.san)).join(' ');
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function sideSection(title, lines, onPlay) {
  const section = element('section', 'ex-side');
  const heading = element('h3', 'ex-side-title');
  heading.append(element('span', `dot ${title.toLowerCase()}`), ` ${title}`);
  section.append(heading);
  if (!lines.length) {
    section.append(element('p', 'ex-empty', 'No further theory for this side here.'));
    return section;
  }
  for (const line of lines) {
    const button = element('button', 'ex-line');
    button.append(element('span', 'ex-moves', lineText(line.moves)));
    if (line.opening) button.append(element('span', 'ex-line-name', line.opening[1]));
    button.title = 'Play this line on the board';
    button.onclick = () => onPlay(line.moves.map(moveToUci));
    section.append(button);
  }
  return section;
}

export function renderExplorer(container, { fen, opening, isStart, side, leftAfter, onPlay }) {
  const inBook = continuationsAt(fen).length > 0;
  const head = element('div', 'card');
  const title = element('h3', 'ex-title');
  if (opening) title.append(element('span', 'eco', opening[0]), opening[1]);
  else title.textContent = isStart ? 'Starting position' : 'Unknown opening';
  head.append(title);

  const note = opening ? noteFor(opening[1]) : null;
  if (isStart) head.append(element('p', 'ex-note', 'Every game starts here. Choose a first move to see where theory goes next.'));
  else if (opening) head.append(element('p', 'ex-note', note ?? 'A rarer choice, so there’s no guide written for it yet.'));

  const parts = [head];
  if (inBook) {
    const body = element('div', 'card');
    body.append(sideSection(side === 'w' ? 'White' : 'Black', linesFor(fen, side), onPlay));
    parts.push(body);
  } else if (!isStart) {
    parts.push(element('p', 'ex-out', leftAfter ? `This game left known opening theory after ${leftAfter}.` : 'This position has left known opening theory.'));
  }
  container.replaceChildren(...parts);
}
