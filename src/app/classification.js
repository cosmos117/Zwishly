import { moveTactics } from '../tactics.js';
import { currentReview, game } from './game.js';

// Move types (best, blunder, ...) come only from a finished game review. While the user is
// analysing on their own, moves stay unlabelled even when the live engine has evaluated them.

export function tacticsOf(node, previous) {
  node.tactics ??= moveTactics(node.before, node.uci, previous);
  return node.tactics;
}

function isReviewed(line, index) {
  const review = currentReview();
  return review && index < review.results.length && line[index] === game.mainline[index];
}

export function classificationAt(line, index) {
  return isReviewed(line, index) ? currentReview().results[index] : null;
}

export function evalsAround(line, index) {
  if (!isReviewed(line, index)) return {};
  const { evals, best } = currentReview();
  return { before: evals[index], after: evals[index + 1], best: best[index] };
}
