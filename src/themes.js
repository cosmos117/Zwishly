const BASE = import.meta.env.BASE_URL;

export const BOARDS = [
  { id: 'brown', name: 'Classic', light: '#f0d9b5', dark: '#b58863' },
  { id: 'green', name: 'Tournament', light: '#eeeed2', dark: '#769656' },
  { id: 'blue', name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'ice', name: 'Ice', light: '#e9eef8', dark: '#9fb0d0' },
  { id: 'purple', name: 'Lavender', light: '#ebe3f2', dark: '#9a7fb8' },
  { id: 'teal', name: 'Lagoon', light: '#d9ece9', dark: '#5f9d97' },
  { id: 'coral', name: 'Coral', light: '#f6e2d3', dark: '#d88c6c' },
  { id: 'rose', name: 'Rose', light: '#f4dede', dark: '#bf7b84' },
  { id: 'sand', name: 'Sand', light: '#f4e7c5', dark: '#c6a668' },
  { id: 'grey', name: 'Stone', light: '#e6e5e0', dark: '#94938d' },
  { id: 'night', name: 'Midnight', light: '#8f9db4', dark: '#4b5a74' },
  { id: 'contrast', name: 'High contrast', light: '#ffffff', dark: '#5a6b7c' },
  { id: 'maple', name: 'Maple', light: '#efd8ae', dark: '#c2925a', wood: true },
  { id: 'walnut', name: 'Walnut', light: '#d9b78a', dark: '#7e5434', wood: true },
];

export const PIECE_SETS = [
  { id: 'cburnett', name: 'Classic' },
  { id: 'merida', name: 'Merida' },
  { id: 'chessnut', name: 'Chessnut' },
  { id: 'mpchess', name: 'MPChess' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'spatial', name: 'Spatial' },
  { id: 'celtic', name: 'Celtic' },
  { id: 'papercut', name: 'Papercut' },
  { id: 'shapes', name: 'Shapes' },
  { id: 'rhosgfx', name: 'Pixel' },
];

export const SITE_THEMES = [
  { id: 'dark', name: 'Graphite', swatch: ['#18181a', '#313135', '#f0efe9'] },
  { id: 'light', name: 'White', swatch: ['#ffffff', '#e4e4e0', '#18181a'] },
  { id: 'black', name: 'Black', swatch: ['#000000', '#262626', '#f5f5f5'] },
  { id: 'paper', name: 'Paper', swatch: ['#f4f2ec', '#dcd9cf', '#1c1b18'] },
];

export const SOUND_PACKS = [
  { id: 'wood', name: 'Wood' },
  { id: 'felt', name: 'Felt' },
  { id: 'marble', name: 'Marble' },
  { id: 'click', name: 'Click' },
  { id: 'retro', name: 'Retro' },
];

export const pieceUrl = (set, color, role) => `${BASE}pieces/${set}/${color}${role}.svg`;

const DEFAULTS = { board: 'grey', pieces: 'cburnett', site: 'dark', coords: true, arrows: true, badges: true, sound: true, soundPack: 'wood' };
const KEY = 'chess-analysis-prefs';

function normalizePrefs(raw) {
  const prefs = { ...DEFAULTS, ...raw };
  if (!SITE_THEMES.some((t) => t.id === prefs.site)) prefs.site = DEFAULTS.site;
  if (!SOUND_PACKS.some((p) => p.id === prefs.soundPack)) prefs.soundPack = DEFAULTS.soundPack;
  return prefs;
}

export function loadPrefs() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {}
  return normalizePrefs({ sound: localStorage.getItem('sound') !== 'off', ...stored });
}
export function savePrefs(prefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  localStorage.setItem('sound', prefs.sound ? 'on' : 'off');
}

export function boardSvg(b) {
  let squares = '';
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) if ((r + f) % 2 === 1) squares += `<rect x="${f}" y="${r}" width="1" height="1"/>`;
  const grain = b.wood
    ? `<filter id="g" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.04 0.9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0 0.05  0 0 0 0.9 -0.25"/></filter><rect width="8" height="8" filter="url(#g)" opacity="0.5"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${b.light}"/><g fill="${b.dark}">${squares}</g>${grain}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ROLES = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

export function applyTheme(prefs) {
  document.documentElement.dataset.theme = prefs.site;
  document.body.classList.toggle('no-badges', !prefs.badges);

  const board = BOARDS.find((b) => b.id === prefs.board) || BOARDS[0];
  const set = PIECE_SETS.find((p) => p.id === prefs.pieces) ? prefs.pieces : 'cburnett';
  let css = `.board-wrap { --sq-light: ${board.light}; --sq-dark: ${board.dark}; }
.board-wrap cg-board { background-color: ${board.light}; background-image: ${boardSvg(board)}; }\n`;
  for (const [role, letter] of Object.entries(ROLES)) {
    for (const [color, c] of [['white', 'w'], ['black', 'b']]) {
      css += `.cg-wrap piece.${role}.${color} { background-image: url("${pieceUrl(set, c, letter)}"); }\n`;
    }
  }
  let el = document.getElementById('theme-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'theme-style';
    document.head.append(el);
  }
  el.textContent = css;
}
