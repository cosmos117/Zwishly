import { applyTheme, loadPrefs, savePrefs } from '../themes.js';
import { queuePrefsSave } from '../session.js';
import { setSoundPack } from '../sound.js';

export const prefs = loadPrefs();

applyTheme(prefs);
setSoundPack(prefs.soundPack);

export function persistPrefs() {
  savePrefs(prefs);
  queuePrefsSave(prefs);
}
