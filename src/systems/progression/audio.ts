import type { AudioManager } from '../../audio/audio';

/**
 * Procedural progression sounds (Web Audio, no assets; D-007). All on the sfx bus, all no-ops
 * until audio is unlocked:
 * - pickup: a small glassy "pling" with a soft paper rustle (lore / quest items ring lower and longer),
 * - level-up: a rubber stamp + a rising three-note brass chime (no flash goes with it),
 * - use: a cork pop + swallow (balm, salts), a glug (oil), a dry puff (lime),
 * - xp tick: a very quiet wooden tick when the bar fills.
 */
function env(ctx: AudioContext, g: GainNode, t0: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  void ctx;
}

function tone(am: AudioManager, freq: number, t0: number, peak: number, dur: number, type: OscillatorType = 'sine', glideTo?: number): void {
  const ctx = am.ctx;
  const dest = am.bus('sfx');
  if (!ctx || !dest) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur * 0.8);
  const g = ctx.createGain();
  env(ctx, g, t0, peak, 0.008, dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(am: AudioManager, t0: number, peak: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q = 0.8): void {
  const ctx = am.ctx;
  const dest = am.bus('sfx');
  const buf = am.noise();
  if (!ctx || !dest || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = ctx.createGain();
  env(ctx, g, t0, peak, 0.005, dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

export function pickupSound(am: AudioManager, kind: string): void {
  const ctx = am.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  const precious = kind === 'quest' || kind === 'lore' || kind === 'weapon' || kind === 'charm' || kind === 'key';
  const base = precious ? 784 : 1175;
  tone(am, base, t0, 0.12, precious ? 1.4 : 0.6);
  tone(am, base * 1.5, t0 + 0.07, 0.07, precious ? 1.2 : 0.5);
  if (precious) tone(am, base * 2, t0 + 0.15, 0.05, 1.3);
  noise(am, t0, 0.12, 0.18, 'bandpass', 3800, 1800, 1.2);
}

export function levelSound(am: AudioManager, level: number): void {
  const ctx = am.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  // stamp
  noise(am, t0, 0.5, 0.16, 'lowpass', 900, 120);
  tone(am, 90, t0, 0.25, 0.18, 'sine', 55);
  // rising brass: a major triad that climbs a little with the level
  const root = 392 * Math.pow(2, ((Math.max(1, level) - 2) * 1) / 12);
  [1, 1.26, 1.5, 2].forEach((m, i) => {
    tone(am, root * m, t0 + 0.12 + i * 0.11, 0.09, 1.8 - i * 0.2, 'triangle');
    tone(am, root * m * 2.01, t0 + 0.12 + i * 0.11, 0.025, 1.2 - i * 0.15);
  });
}

export function useSound(am: AudioManager, item: string): void {
  const ctx = am.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  if (item === 'item.lampenoel') {
    for (let i = 0; i < 3; i++) tone(am, 180 + i * 30, t0 + i * 0.12, 0.12, 0.12, 'sine', 120);
    return;
  }
  if (item === 'item.kalkstaub') {
    noise(am, t0, 0.35, 0.5, 'highpass', 2500, 600);
    return;
  }
  // cork pop + swallow
  tone(am, 900, t0, 0.18, 0.06, 'square', 420);
  noise(am, t0 + 0.18, 0.18, 0.22, 'lowpass', 600, 200);
  tone(am, 220, t0 + 0.2, 0.08, 0.2, 'sine', 150);
}

export function xpTick(am: AudioManager): void {
  const ctx = am.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  tone(am, 1568, t0, 0.025, 0.12, 'triangle');
}

export function collectionSound(am: AudioManager): void {
  const ctx = am.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(am, f, t0 + i * 0.09, 0.07, 1.4, 'triangle'));
}
