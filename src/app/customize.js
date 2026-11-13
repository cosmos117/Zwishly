import { BOARDS, PIECE_SETS, SITE_THEMES, SOUND_PACKS, applyTheme, boardSvg, pieceUrl } from '../themes.js';
import { isSoundOn, play as playSound, setSoundPack, toggleSound } from '../sound.js';
import { clearEngineArrows, setBoardCoordinates } from './board.js';
import { $, setHidden, toast } from './dom.js';
import { updateEngine } from './engine-panel.js';
import { notifyGameChange } from './game.js';
import { persistPrefs, prefs } from './prefs.js';

const SPEAKER_ON = '<path d="M11.5 5.5a3.5 3.5 0 0 1 0 5"/>';
const SPEAKER_MUTED = '<path d="M11.5 6.5l3 3m0-3l-3 3"/>';

export function setDrawerOpen(open) {
  $('drawer').classList.toggle('open', open);
  $('drawer').setAttribute('aria-hidden', String(!open));
  setHidden($('drawer-backdrop'), !open);
}

function renderSoundButton(on) {
  $('btn-sound').innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6v4h3l4 3V3L5 6z" fill="currentColor"/>${on ? SPEAKER_ON : SPEAKER_MUTED}</svg>`;
}

export function toggleMute() {
  const on = toggleSound();
  prefs.sound = on;
  persistPrefs();
  renderSoundButton(on);
  $('opt-sound').checked = on;
  toast(on ? 'Sound on' : 'Sound off');
}

function setPref(key, value) {
  prefs[key] = value;
  persistPrefs();
  applyTheme(prefs);
  renderCustomizer();
}

function choiceButton(key, id, name, swatchHtml) {
  const button = document.createElement('button');
  button.className = `choice ${prefs[key] === id ? 'selected' : ''}`;
  button.title = name;
  button.innerHTML = `${swatchHtml}<span class="choice-name">${name}</span>`;
  button.onclick = () => setPref(key, id);
  return button;
}

function siteThemeChoice({ id, name, swatch }) {
  const colors = swatch.map((color) => `<i style="background:${color}"></i>`).join('');
  return choiceButton('site', id, name, `<span class="site-swatch">${colors}</span>`);
}

function boardChoice(board) {
  const image = boardSvg(board).replace(/"/g, "'");
  return choiceButton('board', board.id, board.name, `<span class="board-swatch" style="background-image:${image}"></span>`);
}

function pieceChoice({ id, name }, board) {
  return choiceButton(
    'pieces',
    id,
    name,
    `<span class="piece-swatch" style="background:linear-gradient(90deg, ${board.light} 50%, ${board.dark} 50%)">
       <img src="${pieceUrl(id, 'w', 'N')}" alt="" /><img src="${pieceUrl(id, 'b', 'Q')}" alt="" />
     </span>`,
  );
}

function renderCustomizer() {
  const board = BOARDS.find((b) => b.id === prefs.board) ?? BOARDS[0];
  $('site-themes').replaceChildren(...SITE_THEMES.map(siteThemeChoice));
  $('board-themes').replaceChildren(...BOARDS.map(boardChoice));
  $('piece-sets').replaceChildren(...PIECE_SETS.map((set) => pieceChoice(set, board)));

  $('opt-coords').checked = prefs.coords;
  $('opt-arrows').checked = prefs.arrows;
  $('opt-badges').checked = prefs.badges;
  $('opt-sound').checked = isSoundOn();
  const soundPacks = $('opt-sound-pack');
  if (!soundPacks.options.length) soundPacks.append(...SOUND_PACKS.map(({ name, id }) => new Option(name, id)));
  soundPacks.value = prefs.soundPack;
}

export function initCustomize() {
  $('btn-customize').onclick = () => setDrawerOpen(true);
  $('drawer-close').onclick = () => setDrawerOpen(false);
  $('drawer-backdrop').onclick = () => setDrawerOpen(false);
  $('btn-sound').onclick = toggleMute;
  $('opt-sound').onchange = toggleMute;
  $('opt-badges').onchange = (event) => setPref('badges', event.target.checked);
  $('opt-coords').onchange = (event) => {
    setPref('coords', event.target.checked);
    setBoardCoordinates(prefs.coords);
    notifyGameChange();
  };
  $('opt-arrows').onchange = (event) => {
    setPref('arrows', event.target.checked);
    if (prefs.arrows) updateEngine();
    else clearEngineArrows();
  };
  $('opt-sound-pack').onchange = (event) => {
    setPref('soundPack', event.target.value);
    setSoundPack(event.target.value);
    playSound('capture');
  };
  renderSoundButton(isSoundOn());
  renderCustomizer();
}
