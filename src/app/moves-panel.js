import { CLASSES, formatEval } from '../analysis.js';
import { sanLine } from '../chess-utils.js';
import { classificationAt, evalsAround } from './classification.js';
import { $, escapeHtml, setHidden } from './dom.js';
import { currentLine, cursorPly, deleteVariation, game, goTo, moveCursorBack, playLine } from './game.js';

const EMPTY_LIST_HTML = '<div class="moves-empty">Play a move on the board, or open one of your games.</div>';
const NO_ALTERNATIVE_SHOWN = ['glorious', 'textbook', 'best'];

const movesList = $('moves');
let renderedHtml = null;

movesList.addEventListener('click', (event) => {
  if (event.target.closest('.vclose')) {
    deleteVariation();
    return;
  }
  const move = event.target.closest('[data-i]');
  if (move) goTo(move.dataset.v === '1', Number(move.dataset.i));
});

function firstPly() {
  const [, turn, , , , fullMove] = game.startFen.split(' ');
  return (Number(fullMove) - 1) * 2 + (turn === 'b' ? 1 : 0);
}

function badgeHtml(line, index) {
  const result = classificationAt(line, index);
  if (!result) return '';
  const { color, label, symbol } = CLASSES[result.cls];
  return `<span class="badge cls-${result.cls}" style="background:${color}" title="${label}">${symbol}</span>`;
}

function mainlineRows() {
  const rows = [];
  game.mainline.forEach((_, index) => {
    const ply = firstPly() + index;
    const isWhite = ply % 2 === 0;
    if (isWhite || !rows.length) rows.push({ number: Math.floor(ply / 2) + 1, white: null, black: null });
    rows.at(-1)[isWhite ? 'white' : 'black'] = index;
  });
  return rows;
}

function mainlineCell(index) {
  if (index === null) return '<span class="mv empty"></span>';
  const { san } = game.mainline[index];
  return `<span class="mv" data-v="0" data-i="${index + 1}">${san}${badgeHtml(game.mainline, index)}</span>`;
}

function variationHtml() {
  const { branchPly, moves } = game.variation;
  const line = [...game.mainline.slice(0, branchPly), ...moves];
  const items = moves.map((move, offset) => {
    const ply = firstPly() + branchPly + offset;
    const number = Math.floor(ply / 2) + 1;
    const prefix = ply % 2 === 0 ? `${number}. ` : offset === 0 ? `${number}... ` : '';
    return `${prefix}<span class="vmv" data-v="1" data-i="${offset + 1}">${move.san}${badgeHtml(line, branchPly + offset)}</span> `;
  });
  return `<div class="variation">(${items.join('')})<button class="vclose" title="Delete variation">✕</button></div>`;
}

function movesHtml() {
  const { mainline, variation } = game;
  if (!mainline.length && !variation) return EMPTY_LIST_HTML;
  let html = '';
  for (const { number, white, black } of mainlineRows()) {
    const whiteCell = white === null ? '<span class="mv empty">…</span>' : mainlineCell(white);
    html += `<div class="mrow"><span class="num">${number}.</span>${whiteCell}${mainlineCell(black)}</div>`;
    if (variation && (white === variation.branchPly || black === variation.branchPly)) html += variationHtml();
  }
  if (variation && variation.branchPly >= mainline.length) html += variationHtml();
  return html;
}

// scrollIntoView would also scroll the page, so only the list's own scroll position moves.
function keepInView(move) {
  const list = movesList.getBoundingClientRect();
  const { top, bottom } = move.getBoundingClientRect();
  if (top < list.top) movesList.scrollTop += top - list.top;
  else if (bottom > list.bottom) movesList.scrollTop += bottom - list.bottom;
}

export function renderMoves() {
  const html = movesHtml();
  if (html !== renderedHtml) {
    renderedHtml = html;
    movesList.innerHTML = html;
  }
  const { inVariation, index } = game.cursor;
  movesList.querySelector('.active')?.classList.remove('active');
  const active = movesList.querySelector(`[data-v="${inVariation ? 1 : 0}"][data-i="${index}"]`);
  if (!active) return;
  active.classList.add('active');
  keepInView(active);
}

function verdictHtml(result) {
  const gold = '<b class="gold">Glorious</b>';
  const [eco, name] = result.opening ?? ['', 'opening theory'];
  return {
    glorious: result.reason === 'sacrifice' ? `${gold}: a sacrifice that works.` : `${gold}: the only move that solves the problem.`,
    textbook: `<b>TextBook</b>: ${escapeHtml(name)} <span class="muted">${eco}</span>`,
    best: 'the best move.',
    decent: 'a decent move.',
    inaccuracy: 'an inaccuracy.',
    overlook: 'an overlook.',
    error: 'an error.',
    blunder: 'a blunder.',
  }[result.cls];
}

function betterMoveHtml(move, result, bestUci, before) {
  if (!bestUci || bestUci === move.uci || NO_ALTERNATIVE_SHOWN.includes(result.cls)) return '';
  const bestSan = sanLine(move.before, [bestUci], 1)[0]?.san;
  if (!bestSan) return '';
  return `<div class="better">The best move was <a href="#" id="show-best">${bestSan}</a> <span class="muted">(${formatEval(before)})</span></div>`;
}

export function renderMoveComment() {
  const comment = $('move-comment');
  const line = currentLine();
  const index = cursorPly() - 1;
  const result = index >= 0 ? classificationAt(line, index) : null;
  setHidden(comment, !result);
  if (!result) return;

  const move = line[index];
  const { color, symbol } = CLASSES[result.cls];
  const { before, after, best } = evalsAround(line, index);
  const evalHtml = after && result.cls !== 'textbook' ? ` <span class="muted">(${formatEval(after)})</span>` : '';
  comment.innerHTML =
    `<div class="verdict"><span class="badge cls-${result.cls}" style="background:${color}">${symbol}</span> <b>${move.san}</b> is ${verdictHtml(result)}${evalHtml}</div>` +
    (result.note ? `<div class="explain">${escapeHtml(result.note)}</div>` : '') +
    betterMoveHtml(move, result, best, before);

  const betterMoveLink = $('show-best');
  if (betterMoveLink) {
    betterMoveLink.onclick = (event) => {
      event.preventDefault();
      moveCursorBack();
      playLine([best]);
    };
  }
}
