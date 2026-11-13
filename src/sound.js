let ctx = null;
let master = null;
let enabled = localStorage.getItem('sound') !== 'off';
let packId = 'wood';

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function knock(c, t, { freq = 2000, q = 1.1, dur = 0.045, gain = 0.28, body = 170 } = {}) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(master);
  src.start(t);

  if (!body) return;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(body, t);
  o.frequency.exponentialRampToValueAtTime(body * 0.6, t + 0.08);
  const og = c.createGain();
  og.gain.setValueAtTime(gain * 0.8, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.1);
}

function tone(c, t, freq, { gain = 0.05, dur = 0.25, type = 'triangle' } = {}) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function soundFor(san) {
  if (san.includes('#')) return 'mate';
  if (san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}

const FELT = { freq: 650, q: 0.7, dur: 0.07, gain: 0.24, body: 105 };
const MARBLE = { freq: 3600, q: 3, dur: 0.03, gain: 0.26, body: 380 };
const TICK = { freq: 4200, q: 1.2, dur: 0.012, gain: 0.22, body: null };

function marble(c, t, extra) {
  knock(c, t, { ...MARBLE, ...extra });
  tone(c, t, 2200, { gain: 0.012, dur: 0.09, type: 'sine' });
}
const blip = (c, t, freq, dur = 0.06) => tone(c, t, freq, { gain: 0.035, dur, type: 'square' });

const PACKS = {
  wood: {
    move: (c, t) => knock(c, t),
    capture: (c, t) => {
      knock(c, t, { freq: 1500, gain: 0.36, body: 125 });
      knock(c, t + 0.03, { freq: 2600, gain: 0.14, dur: 0.03 });
    },
    castle: (c, t) => {
      knock(c, t);
      knock(c, t + 0.09, { gain: 0.2, freq: 2200 });
    },
    check: (c, t) => {
      knock(c, t);
      tone(c, t + 0.02, 880, { gain: 0.035, dur: 0.22 });
    },
    mate: (c, t) => {
      knock(c, t, { gain: 0.34 });
      tone(c, t + 0.03, 660, { gain: 0.04, dur: 0.35 });
      tone(c, t + 0.15, 990, { gain: 0.035, dur: 0.45 });
    },
    soft: (c, t) => knock(c, t, { gain: 0.14, freq: 1800 }),
  },
  felt: {
    move: (c, t) => knock(c, t, FELT),
    capture: (c, t) => {
      knock(c, t, { ...FELT, gain: 0.32, body: 85 });
      knock(c, t + 0.04, { ...FELT, gain: 0.12 });
    },
    castle: (c, t) => {
      knock(c, t, FELT);
      knock(c, t + 0.1, { ...FELT, gain: 0.16 });
    },
    check: (c, t) => {
      knock(c, t, FELT);
      tone(c, t + 0.02, 520, { gain: 0.03, dur: 0.2, type: 'sine' });
    },
    mate: (c, t) => {
      knock(c, t, { ...FELT, gain: 0.3 });
      tone(c, t + 0.03, 392, { gain: 0.035, dur: 0.35, type: 'sine' });
      tone(c, t + 0.15, 587, { gain: 0.03, dur: 0.45, type: 'sine' });
    },
    soft: (c, t) => knock(c, t, { ...FELT, gain: 0.1 }),
  },
  marble: {
    move: (c, t) => marble(c, t),
    capture: (c, t) => {
      marble(c, t, { gain: 0.32, body: 300 });
      marble(c, t + 0.035, { gain: 0.14 });
    },
    castle: (c, t) => {
      marble(c, t);
      marble(c, t + 0.09, { gain: 0.18 });
    },
    check: (c, t) => {
      marble(c, t);
      tone(c, t + 0.02, 1320, { gain: 0.025, dur: 0.25, type: 'sine' });
    },
    mate: (c, t) => {
      marble(c, t, { gain: 0.32 });
      tone(c, t + 0.03, 1047, { gain: 0.03, dur: 0.35, type: 'sine' });
      tone(c, t + 0.15, 1568, { gain: 0.025, dur: 0.5, type: 'sine' });
    },
    soft: (c, t) => knock(c, t, { ...MARBLE, gain: 0.12, body: null }),
  },
  click: {
    move: (c, t) => knock(c, t, TICK),
    capture: (c, t) => {
      knock(c, t, TICK);
      knock(c, t + 0.03, TICK);
    },
    castle: (c, t) => {
      knock(c, t, TICK);
      knock(c, t + 0.07, { ...TICK, gain: 0.16 });
    },
    check: (c, t) => knock(c, t, { ...TICK, freq: 6500, gain: 0.26 }),
    mate: (c, t) => {
      knock(c, t, TICK);
      knock(c, t + 0.05, TICK);
      knock(c, t + 0.1, { ...TICK, freq: 6500, gain: 0.26 });
    },
    soft: (c, t) => knock(c, t, { ...TICK, gain: 0.1 }),
  },
  retro: {
    move: (c, t) => blip(c, t, 520),
    capture: (c, t) => {
      blip(c, t, 330);
      blip(c, t + 0.06, 220, 0.09);
    },
    castle: (c, t) => {
      blip(c, t, 440);
      blip(c, t + 0.07, 660);
    },
    check: (c, t) => {
      blip(c, t, 784);
      blip(c, t + 0.07, 1047);
    },
    mate: (c, t) => {
      [523, 659, 784, 1047].forEach((freq, i) => blip(c, t + i * 0.09, freq, i === 3 ? 0.25 : 0.08));
    },
    soft: (c, t) => tone(c, t, 300, { gain: 0.018, dur: 0.05, type: 'square' }),
  },
};

export function setSoundPack(id) {
  packId = PACKS[id] ? id : 'wood';
}

export function play(type = 'move') {
  if (!enabled) return;
  try {
    const c = audio();
    const pack = PACKS[packId];
    (pack[type] ?? pack.move)(c, c.currentTime + 0.005);
  } catch {
    // audio unavailable
  }
}

export const isSoundOn = () => enabled;
export function toggleSound() {
  enabled = !enabled;
  localStorage.setItem('sound', enabled ? 'on' : 'off');
  return enabled;
}
