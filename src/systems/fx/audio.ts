/**
 * Procedural sound for the fx system (Web Audio synthesis, no files): era-shift sweep with the
 * compass tone, scan ping, fire roar + crackle, collapse rumble, coughing, Steinfraß grains.
 */
import type { AudioManager } from '../../audio/audio';
import { type Loop, noiseBurst } from '../../audio/synth';

const noop: Loop = { setIntensity() {}, stop() {} };

function env(g: GainNode, t: number, a: number, peak: number, hold: number, rel: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}

/**
 * The era shift: the world's sound drops away, a high sine from the brass compass stays
 * (bible W1), a reversed whoosh swells to the midpoint, a brass chord blooms as the era lands
 * and glassy ticks rise while the world reassembles.
 */
export function shiftSweep(am: AudioManager, dest: AudioNode | null, dur: number, mid: number): void {
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !dest || !buf) return;
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(dest);
  // compass tone: E7 with a slow, uneasy vibrato
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = 2637;
  const vib = ctx.createOscillator();
  vib.frequency.value = 4.3;
  const vibG = ctx.createGain();
  vibG.gain.value = 9;
  vib.connect(vibG).connect(tone.frequency);
  const tg = ctx.createGain();
  env(tg, t0, 0.35, 0.035, dur - 0.9, 0.5);
  tone.connect(tg).connect(out);
  tone.start(t0);
  vib.start(t0);
  tone.stop(t0 + dur + 0.1);
  vib.stop(t0 + dur + 0.1);
  // reversed whoosh up to the midpoint
  const ns = ctx.createBufferSource();
  ns.buffer = buf;
  ns.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(180, t0);
  bp.frequency.exponentialRampToValueAtTime(3800, t0 + mid);
  bp.frequency.exponentialRampToValueAtTime(240, t0 + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.28, t0 + mid - 0.05);
  ng.gain.exponentialRampToValueAtTime(0.03, t0 + mid + 0.25);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ns.connect(bp).connect(ng).connect(out);
  ns.start(t0, Math.random() * 2);
  ns.stop(t0 + dur + 0.1);
  // falling sub tone into the void
  const sub = ctx.createOscillator();
  sub.type = 'sawtooth';
  sub.frequency.setValueAtTime(98, t0);
  sub.frequency.exponentialRampToValueAtTime(36, t0 + mid);
  const slp = ctx.createBiquadFilter();
  slp.type = 'lowpass';
  slp.frequency.value = 160;
  const sg = ctx.createGain();
  env(sg, t0 + 0.2, 0.8, 0.22, mid - 1.1, 0.2);
  sub.connect(slp).connect(sg).connect(out);
  sub.start(t0);
  sub.stop(t0 + mid + 0.5);
  // the landing: inharmonic bell + brass chord
  const tm = t0 + mid;
  for (const [ratio, gain, decay] of [
    [1, 0.18, 2.6],
    [2.76, 0.07, 1.6],
    [5.4, 0.035, 0.9],
    [0.5, 0.12, 2.2],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 293.66 * ratio;
    const g = ctx.createGain();
    env(g, tm, 0.005, gain, 0, decay);
    o.connect(g).connect(out);
    o.start(tm);
    o.stop(tm + decay + 0.1);
  }
  for (const f of [146.83, 220, 293.66, 369.99]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.2, tm);
    lp.frequency.linearRampToValueAtTime(f * 4, tm + 0.5);
    lp.frequency.linearRampToValueAtTime(f * 1.5, tm + 1.7);
    const g = ctx.createGain();
    env(g, tm, 0.25, 0.045, 0.6, 1.0);
    o.connect(lp).connect(g).connect(out);
    o.start(tm);
    o.stop(tm + 2.0);
  }
  // reassembly: glassy rising ticks, like points snapping into place
  for (let i = 0; i < 14; i++) {
    const t = tm + 0.3 + i * 0.09 + Math.random() * 0.03;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 1400 + i * 140 + Math.random() * 80;
    const g = ctx.createGain();
    env(g, t, 0.002, 0.018, 0, 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }
  setTimeout(() => out.disconnect(), (dur + 3) * 1000);
}

/** Sonar-like ping for the relief scan pulse (with a soft echo). */
export function scanPing(am: AudioManager, dest: AudioNode | null): void {
  const ctx = am.ctx;
  if (!ctx || !dest) return;
  const t = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.value = 1;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.32;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  out.connect(dest);
  out.connect(delay).connect(fb).connect(delay);
  fb.connect(dest);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1320, t);
  o.frequency.exponentialRampToValueAtTime(980, t + 0.6);
  const g = ctx.createGain();
  env(g, t, 0.004, 0.05, 0.02, 0.7);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.8);
  setTimeout(() => {
    out.disconnect();
    fb.disconnect();
  }, 3000);
}

/** Fire roar: low rumbling noise with a breathing amplitude; intensity 0..1. */
export function fireRoar(am: AudioManager, dest: AudioNode | null): Loop {
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !buf || !dest) return noop;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const bp = ctx.createBiquadFilter();
  bp.type = 'peaking';
  bp.frequency.value = 120;
  bp.gain.value = 8;
  const amp = ctx.createGain();
  amp.gain.value = 0.7;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.37;
  const lg = ctx.createGain();
  lg.gain.value = 0.3;
  lfo.connect(lg).connect(amp.gain);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(lp).connect(bp).connect(amp).connect(gain).connect(dest);
  src.start(0, Math.random() * 3);
  lfo.start();
  return {
    setIntensity(v, ramp = 0.6) {
      gain.gain.setTargetAtTime(Math.max(0, v) * 0.9, ctx.currentTime, ramp / 3);
      lp.frequency.setTargetAtTime(260 + 700 * v, ctx.currentTime, ramp / 3);
    },
    stop(fade = 1) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      const end = ctx.currentTime + fade + 0.2;
      src.stop(end);
      lfo.stop(end);
      setTimeout(() => gain.disconnect(), (fade + 0.5) * 1000);
    },
  };
}

/** A handful of crackles and pops (call a few times per second while burning). */
export function crackle(am: AudioManager, dest: AudioNode | null, amount: number): void {
  const n = 1 + Math.floor(Math.random() * 3 * amount);
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.15;
    noiseBurst(am, dest, {
      freq: big ? 900 + Math.random() * 600 : 2500 + Math.random() * 3500,
      q: big ? 2 : 6,
      duration: big ? 0.09 : 0.02 + Math.random() * 0.03,
      gain: (big ? 0.5 : 0.28) * (0.4 + amount * 0.6),
      type: big ? 'bandpass' : 'highpass',
      when: Math.random() * 0.3,
    });
  }
}

/** A roof coming down: deep rumble, sub thump, debris. */
export function rumble(am: AudioManager, dest: AudioNode | null, gain = 1): void {
  const ctx = am.ctx;
  if (!ctx || !dest) return;
  const t = ctx.currentTime + 0.02;
  noiseBurst(am, dest, { freq: 90, q: 0.7, duration: 3.2, gain: 0.9 * gain, type: 'lowpass', attack: 0.06 });
  noiseBurst(am, dest, { freq: 260, q: 0.9, duration: 1.6, gain: 0.5 * gain, type: 'lowpass', attack: 0.02, when: 0.08 });
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(58, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
  const g = ctx.createGain();
  env(g, t, 0.03, 0.5 * gain, 0.2, 1.8);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 2.2);
  for (let i = 0; i < 9; i++) {
    noiseBurst(am, dest, { freq: 600 + Math.random() * 2400, q: 3, duration: 0.05 + Math.random() * 0.1, gain: 0.25 * gain, when: 0.3 + Math.random() * 1.4 });
  }
}

/** A cough (two or three bursts of band-passed noise with a voiced edge). */
export function cough(am: AudioManager, dest: AudioNode | null): void {
  const ctx = am.ctx;
  if (!ctx || !dest) return;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const when = i * (0.28 + Math.random() * 0.08);
    noiseBurst(am, dest, { freq: 650 + Math.random() * 250, q: 1.6, duration: 0.2, gain: 0.32 - i * 0.06, attack: 0.012, when });
    noiseBurst(am, dest, { freq: 1900, q: 3, duration: 0.12, gain: 0.08, when: when + 0.01 });
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    env(g, t, 0.01, 0.05, 0.03, 0.12);
    o.connect(lp).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.25);
  }
}

/** Steinfraß: trickling grains + a slow hollow swell; intensity 0..1. */
export function grainLoop(am: AudioManager, dest: AudioNode | null): Loop {
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !buf || !dest) return noop;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 3800;
  hp.Q.value = 0.8;
  // grainy amplitude: a fast square LFO through a smoothing gain
  const gate = ctx.createGain();
  gate.gain.value = 0.3;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 23;
  const lg = ctx.createGain();
  lg.gain.value = 0.28;
  lfo.connect(lg).connect(gate.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.21;
  const lg2 = ctx.createGain();
  lg2.gain.value = 9;
  lfo2.connect(lg2).connect(lfo.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(hp).connect(gate).connect(gain).connect(dest);
  // hollow swell
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 73.4;
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 110.4;
  const sw = ctx.createGain();
  sw.gain.value = 0;
  o.connect(sw);
  o2.connect(sw);
  sw.connect(dest);
  src.start();
  lfo.start();
  lfo2.start();
  o.start();
  o2.start();
  return {
    setIntensity(v, ramp = 1) {
      gain.gain.setTargetAtTime(Math.max(0, v) * 0.22, ctx.currentTime, ramp / 3);
      sw.gain.setTargetAtTime(Math.max(0, v) * 0.05, ctx.currentTime, ramp / 3);
    },
    stop(fade = 1.5) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      sw.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      const end = ctx.currentTime + fade + 0.2;
      for (const n of [src, lfo, lfo2, o, o2]) n.stop(end);
      setTimeout(() => {
        gain.disconnect();
        sw.disconnect();
      }, (fade + 0.5) * 1000);
    },
  };
}
