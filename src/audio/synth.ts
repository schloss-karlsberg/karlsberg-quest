/**
 * Procedural sound helpers (no audio files). All take an AudioManager-provided context and a
 * destination node (a bus or a Source3D.input) and return small controllers.
 */
import type { AudioManager } from './audio';

export interface Loop {
  /** 0..1 */
  setIntensity(v: number, rampSec?: number): void;
  stop(fadeSec?: number): void;
}

const noopLoop: Loop = { setIntensity() {}, stop() {} };

/** Wind: looping noise through a swept band-pass, with slow gusts. */
export function windLoop(am: AudioManager, dest: AudioNode | null, base = 0.5): Loop {
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !buf || !dest) return noopLoop;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 380;
  bp.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  // gust LFOs
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(bp.frequency);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.13;
  const lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 0.12;
  const amp = ctx.createGain();
  amp.gain.value = 0.25;
  lfo2.connect(lfo2Gain).connect(amp.gain);
  src.connect(lp).connect(bp).connect(amp).connect(gain).connect(dest);
  src.start();
  lfo.start();
  lfo2.start();
  const ctl: Loop = {
    setIntensity(v, ramp = 1.5) {
      gain.gain.setTargetAtTime(Math.max(0, v) * 0.9, ctx.currentTime, ramp / 3);
      lp.frequency.setTargetAtTime(300 + v * 900, ctx.currentTime, ramp / 3);
    },
    stop(fade = 1) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      const end = ctx.currentTime + fade + 0.1;
      src.stop(end);
      lfo.stop(end);
      lfo2.stop(end);
    },
  };
  ctl.setIntensity(base, 3);
  return ctl;
}

/** A short filtered noise burst (footsteps, twigs, splashes, debris). */
export function noiseBurst(
  am: AudioManager,
  dest: AudioNode | null,
  o: { duration?: number; freq?: number; q?: number; gain?: number; type?: BiquadFilterType; attack?: number; when?: number } = {},
): void {
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !buf || !dest) return;
  const t = ctx.currentTime + (o.when ?? 0);
  const dur = o.duration ?? 0.12;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.value = o.freq ?? 900;
  f.Q.value = o.q ?? 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.4, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 3);
  src.stop(t + dur + 0.05);
}

/** Footstep by surface name. */
export function footstep(am: AudioManager, dest: AudioNode | null, surface: string, running: boolean): void {
  const r = 0.85 + Math.random() * 0.3;
  const loud = running ? 1.4 : 1;
  switch (surface) {
    case 'gravel':
    case 'cobbles':
    case 'sand':
      noiseBurst(am, dest, { freq: 2600 * r, q: 0.8, duration: 0.16, gain: 0.16 * loud });
      noiseBurst(am, dest, { freq: 900 * r, q: 1.5, duration: 0.09, gain: 0.12 * loud, when: 0.02 });
      break;
    case 'water':
      noiseBurst(am, dest, { freq: 700 * r, q: 0.6, duration: 0.35, gain: 0.25 * loud, type: 'lowpass', attack: 0.03 });
      break;
    case 'forest':
      noiseBurst(am, dest, { freq: 1400 * r, q: 0.7, duration: 0.2, gain: 0.13 * loud });
      if (Math.random() < 0.12) noiseBurst(am, dest, { freq: 3200, q: 4, duration: 0.03, gain: 0.25, when: 0.05 }); // twig
      break;
    default:
      noiseBurst(am, dest, { freq: 520 * r, q: 0.9, duration: 0.13, gain: 0.15 * loud, type: 'lowpass' });
  }
}

/**
 * Hunting horn (Parforcehorn-like natural horn): brass tone from a sawtooth through a resonant
 * low-pass with a lip "blat" at the attack. `notes` are natural-horn partials (2..12) of `fundamental`.
 */
export function hornCall(
  am: AudioManager,
  dest: AudioNode | null,
  o: { notes?: number[]; durations?: number[]; fundamental?: number; gain?: number; when?: number } = {},
): number {
  const ctx = am.ctx;
  if (!ctx || !dest) return 0;
  const notes = o.notes ?? [4, 5, 6, 8, 6, 8];
  const durs = o.durations ?? notes.map((_, i) => (i === notes.length - 1 ? 1.2 : 0.32));
  const f0 = o.fundamental ?? 58.3; // D horn
  let t = ctx.currentTime + (o.when ?? 0);
  const out = ctx.createGain();
  out.gain.value = o.gain ?? 0.35;
  // a little hall: feedback delay
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.23;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1800;
  out.connect(dest);
  out.connect(delay).connect(damp).connect(fb).connect(delay);
  damp.connect(dest);
  const start = t;
  notes.forEach((partial, i) => {
    const d = durs[i] ?? 0.3;
    const f = f0 * partial;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = ctx.createGain();
    vibG.gain.value = f * 0.004;
    vib.connect(vibG).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * 4.5, t + 0.06);
    lp.frequency.linearRampToValueAtTime(f * 3.2, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
    g.gain.setValueAtTime(0.75, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + d + 0.1);
    vib.stop(t + d + 0.1);
    t += d;
  });
  return t - start;
}

/** A small bird chirp (sine sweep). */
export function chirp(am: AudioManager, dest: AudioNode | null, o: { base?: number; count?: number; when?: number; gain?: number } = {}): void {
  const ctx = am.ctx;
  if (!ctx || !dest) return;
  let t = ctx.currentTime + (o.when ?? 0);
  const base = o.base ?? 3200;
  for (let i = 0; i < (o.count ?? 3); i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = base * (0.9 + Math.random() * 0.25);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.4), t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.12);
    t += 0.11 + Math.random() * 0.08;
  }
}

/** A low drone (dread bed): detuned oscillators through a slowly moving filter. */
export function drone(am: AudioManager, dest: AudioNode | null, freq = 55): Loop {
  const ctx = am.ctx;
  if (!ctx || !dest) return noopLoop;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const oscs = [1, 1.005, 1.498, 0.5].map((m) => {
    const o = ctx.createOscillator();
    o.type = m === 0.5 ? 'sine' : 'sawtooth';
    o.frequency.value = freq * m;
    o.connect(lp);
    o.start();
    return o;
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lg = ctx.createGain();
  lg.gain.value = 120;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start();
  lp.connect(gain).connect(dest);
  return {
    setIntensity(v, ramp = 2) {
      gain.gain.setTargetAtTime(v * 0.12, ctx.currentTime, ramp / 3);
    },
    stop(fade = 2) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      const end = ctx.currentTime + fade + 0.1;
      for (const o of oscs) o.stop(end);
      lfo.stop(end);
    },
  };
}
