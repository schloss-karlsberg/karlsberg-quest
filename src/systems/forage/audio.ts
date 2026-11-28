/**
 * Forage sounds (Web Audio, procedural, no samples; a no-op while audio is locked). `pan` −1 left
 * … 1 right, `level` 0..1 (distance).
 */
import type { AudioManager } from '../../audio/audio';

interface Burst {
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  gain: number;
  when?: number;
  attack?: number;
  type?: BiquadFilterType;
}

function out(am: AudioManager, pan: number): { ctx: AudioContext; dest: AudioNode } | null {
  const ctx = am.ctx;
  const bus = am.bus('sfx');
  if (!ctx || !bus) return null;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(bus);
  return { ctx, dest: p };
}

function noise(am: AudioManager, ctx: AudioContext, dest: AudioNode, o: Burst): void {
  const buf = am.noise();
  if (!buf) return;
  const t = ctx.currentTime + 0.01 + (o.when ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0005, t + o.dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.03);
}

function knock(ctx: AudioContext, dest: AudioNode, freq: number, gain: number, dur: number, when = 0): void {
  const t = ctx.currentTime + 0.01 + when;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** The arm goes through: a short rising whoosh. */
export function throwSound(am: AudioManager): void {
  const o = out(am, 0.15);
  if (o) noise(am, o.ctx, o.dest, { f0: 500, f1: 2100, q: 1.2, dur: 0.16, gain: 0.16, attack: 0.05 });
}

/** A chestnut lands: a small hard knock; on leaf litter a rustle with it, on wood a hollow tock. */
export function landSound(am: AudioManager, on: 'ground' | 'wood' | 'body' | 'wall', pan: number, level: number, second = false): void {
  const o = out(am, pan);
  if (!o) return;
  const k = level * (second ? 0.45 : 1);
  if (on === 'wood' || on === 'wall') {
    knock(o.ctx, o.dest, on === 'wood' ? 620 : 900, 0.3 * k, 0.09);
    noise(am, o.ctx, o.dest, { f0: 2600, q: 2, dur: 0.03, gain: 0.2 * k });
    return;
  }
  knock(o.ctx, o.dest, on === 'body' ? 240 : 330, 0.26 * k, 0.07);
  noise(am, o.ctx, o.dest, { f0: 3400, f1: 1400, q: 0.8, dur: on === 'body' ? 0.05 : 0.14, gain: 0.12 * k, attack: 0.01 });
}

export function splashSound(am: AudioManager, pan: number, level: number): void {
  const o = out(am, pan);
  if (!o) return;
  knock(o.ctx, o.dest, 180, 0.2 * level, 0.12);
  noise(am, o.ctx, o.dest, { f0: 900, f1: 3000, q: 0.7, dur: 0.22, gain: 0.16 * level, attack: 0.02 });
}

/** The staff goes through stems and fronds: a dry snap, then leaves settling. `n` plants (1..4). */
export function cutSound(am: AudioManager, n: number, heavy: boolean): void {
  const o = out(am, 0);
  if (!o) return;
  const k = Math.min(1, 0.55 + 0.15 * n);
  for (let i = 0; i < Math.min(3, n); i++) noise(am, o.ctx, o.dest, { f0: 3800 + i * 500, q: 3, dur: 0.035, gain: 0.2 * k, when: i * 0.028 });
  noise(am, o.ctx, o.dest, { f0: 5200, f1: 1800, q: 0.6, dur: heavy ? 0.5 : 0.34, gain: 0.12 * k, attack: 0.03, when: 0.03, type: 'highpass' });
}

/** Only grass in the way: a soft swish. */
export function swishSound(am: AudioManager): void {
  const o = out(am, 0);
  if (o) noise(am, o.ctx, o.dest, { f0: 4600, f1: 2400, q: 0.7, dur: 0.2, gain: 0.07, attack: 0.03, type: 'highpass' });
}

/** A chestnut rolls out from under the leaves: two small wooden taps. */
export function findSound(am: AudioManager): void {
  const o = out(am, 0);
  if (!o) return;
  knock(o.ctx, o.dest, 520, 0.16, 0.06, 0.12);
  knock(o.ctx, o.dest, 660, 0.1, 0.05, 0.23);
}
