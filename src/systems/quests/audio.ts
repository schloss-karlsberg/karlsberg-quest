/**
 * Procedural quest sounds (Web Audio, no files, PRD D-007): accepting a task (paper + a low pluck),
 * an objective tick, an objective done (two-note chime), ready to turn in (a rising brass triad),
 * the turn-in stamp with a warm chord, the journal's page turn. No-ops while audio is locked.
 */
import type { AudioManager } from '../../audio/audio';
import { noiseBurst } from '../../audio/synth';

function tone(am: AudioManager, dest: AudioNode, o: { f: number; f2?: number; t?: number; dur: number; gain: number; type?: OscillatorType; attack?: number }): void {
  const ctx = am.ctx!;
  const t = ctx.currentTime + (o.t ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

const sfx = (am: AudioManager) => (am.ctx ? am.bus('sfx') : null);

/** Paper rustle and a low plucked string: a task is taken. */
export function acceptSound(am: AudioManager): void {
  const d = sfx(am);
  if (!d) return;
  noiseBurst(am, d, { duration: 0.22, freq: 2400, q: 0.8, gain: 0.08, type: 'bandpass' });
  tone(am, d, { f: 196, t: 0.08, dur: 0.9, gain: 0.16, type: 'triangle' });
  tone(am, d, { f: 293.7, t: 0.16, dur: 0.8, gain: 0.08, type: 'triangle' });
}

/** A dry quill tick: one more counted. */
export function tickSound(am: AudioManager): void {
  const d = sfx(am);
  if (!d) return;
  noiseBurst(am, d, { duration: 0.035, freq: 4200, q: 3, gain: 0.12 });
  tone(am, d, { f: 880, t: 0.01, dur: 0.18, gain: 0.04 });
}

/** Two notes up: an objective is done. */
export function objectiveSound(am: AudioManager): void {
  const d = sfx(am);
  if (!d) return;
  tone(am, d, { f: 523.3, dur: 0.6, gain: 0.08, type: 'triangle' });
  tone(am, d, { f: 784, t: 0.11, dur: 0.9, gain: 0.07, type: 'triangle' });
}

/** A rising brass triad: everything done, go back. */
export function readySound(am: AudioManager): void {
  const d = sfx(am);
  if (!d) return;
  [392, 493.9, 587.3, 784].forEach((f, i) => tone(am, d, { f, t: i * 0.09, dur: 1.2 - i * 0.12, gain: 0.07, type: 'sawtooth', attack: 0.02 }));
  noiseBurst(am, d, { duration: 0.6, freq: 6000, q: 1, gain: 0.015, type: 'highpass', attack: 0.2 });
}

/** The turn-in: a heavy stamp, then a warm, slow chord (quiet quests: only the paper). */
export function turninSound(am: AudioManager, quiet = false): void {
  const d = sfx(am);
  if (!d) return;
  noiseBurst(am, d, { duration: 0.25, freq: 1800, q: 0.8, gain: 0.06, type: 'bandpass' });
  if (quiet) return;
  tone(am, d, { f: 92, f2: 44, t: 0.05, dur: 0.24, gain: 0.45, attack: 0.002 });
  noiseBurst(am, d, { duration: 0.08, freq: 520, q: 0.7, gain: 0.3, type: 'lowpass', when: 0.05 });
  [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(am, d, { f, t: 0.22 + i * 0.05, dur: 2.2, gain: 0.05, type: 'triangle', attack: 0.08 }));
}

/** Page turn in the journal. */
export function pageSound(am: AudioManager): void {
  const d = sfx(am);
  if (!d) return;
  noiseBurst(am, d, { duration: 0.18, freq: 3000, q: 0.6, gain: 0.05, type: 'bandpass', attack: 0.04 });
}
