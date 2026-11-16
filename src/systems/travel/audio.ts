/**
 * Procedural one-shots of the travel system (Web Audio, no samples; no-ops while audio is locked):
 * the brass chime of a tripod being eingemessen, the hum of a journey, a chest lid, a warm stone.
 */
import type { AudioManager } from '../../audio/audio';

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
}

function bell(am: AudioManager, freqs: number[], gap: number, level: number, decay = 1.6): void {
  const ctx = am.ctx;
  const out = am.bus('sfx');
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + 0.02;
  freqs.forEach((f, i) => {
    const t = t0 + i * gap;
    for (const [mul, lv] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      env(g, t, 0.12 * level * lv, 0.004, decay / mul);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  });
}

/** A tripod is eingemessen: three rising brass notes. */
export function chimeActivate(am: AudioManager): void {
  bell(am, [523.25, 659.25, 987.77], 0.11, 1, 2.2);
}

/** A journey: a low swell with a rising whistle. */
export function travelSwell(am: AudioManager): void {
  const ctx = am.ctx;
  const out = am.bus('sfx');
  const noise = am.noise();
  if (!ctx || !out || !noise) return;
  const t = ctx.currentTime + 0.02;
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
  bp.frequency.exponentialRampToValueAtTime(500, t + 1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 1.9);
  n.connect(bp).connect(g).connect(out);
  n.start(t, Math.random() * 2, 2);
  bell(am, [392, 587.33], 0.5, 0.6, 1.8);
}

/** A chest lid flies open (thunk + bright sparkle). */
export function cacheOpen(am: AudioManager): void {
  const ctx = am.ctx;
  const out = am.bus('sfx');
  if (!ctx || !out) return;
  const t = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
  const g = ctx.createGain();
  env(g, t, 0.35, 0.003, 0.22);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
  bell(am, [1046.5, 1318.5, 1568, 2093], 0.06, 0.55, 0.9);
}

/** A Wegstein heals: a soft, low chord. */
export function shrineHum(am: AudioManager): void {
  bell(am, [261.63, 329.63, 392], 0.04, 0.7, 2.6);
}

/** A Fundstück picked up: paper and one note. */
export function paper(am: AudioManager): void {
  const ctx = am.ctx;
  const out = am.bus('sfx');
  const noise = am.noise();
  if (!ctx || !out || !noise) return;
  const t = ctx.currentTime + 0.01;
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  env(g, t, 0.18, 0.01, 0.25);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random() * 2, 0.4);
  bell(am, [880], 0, 0.5, 1.2);
}
