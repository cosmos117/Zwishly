import { $ } from './dom.js';
import { currentReview, game } from './game.js';

export function playerName(color) {
  const name = color === 'w' ? game.headers.White : game.headers.Black;
  if (name && name !== '?') return name;
  return color === 'w' ? 'White' : 'Black';
}

function playerLabel(color) {
  const rating = color === 'w' ? game.headers.WhiteElo : game.headers.BlackElo;
  return rating && rating !== '?' ? `${playerName(color)} (${rating})` : playerName(color);
}

function accuracyText(color) {
  const accuracy = currentReview()?.accuracy[color];
  return typeof accuracy === 'number' ? `${accuracy.toFixed(1)}%` : '';
}

function renderPlayer(position, color) {
  $(`name-${position}`).textContent = playerLabel(color);
  $(`acc-${position}`).textContent = accuracyText(color);
  document.querySelector(`.player-${position} .dot`).className = `dot ${color === 'w' ? 'white' : 'black'}`;
}

export function renderPlayers() {
  const flipped = game.orientation === 'black';
  renderPlayer('top', flipped ? 'w' : 'b');
  renderPlayer('bottom', flipped ? 'b' : 'w');
  document.querySelectorAll('.side-pill').forEach((pill) => {
    const active = pill.dataset.side === game.orientation;
    pill.classList.toggle('active', active);
    pill.setAttribute('aria-pressed', String(active));
  });
}
