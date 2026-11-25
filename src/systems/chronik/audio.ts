/**
 * Procedural Chronik sounds (Web Audio, no files): clue chime, stamp, wrong-batch knock, paper,
 * echo onset swell, whispers and ghost breathing. All are no-ops while audio is locked.
 */
import type { AudioManager } from '../../audio/audio';
import { noiseBurst } from '../../audio/synth';

function out(am: AudioManager, dest?: AudioNode | null): AudioNode | null {
  return dest ?? am.bus('sfx');
}

function tone(am: AudioManager, dest: AudioNode, o: { f: number; f2?: number; t?: number; dur: number; gain: number; type?: OscillatorType; attack?: number }): void {
  const ctx = am.ctx!;
  const t = ctx.currentTime + (o.t ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

/** A glassy, slightly detuned chime: something was noticed. */
export function clueChime(am: AudioManager, dest?: AudioNode | null): void {
  const d = out(am, dest);
  if (!am.ctx || !d) return;
  const base = 660;
  [1, 1.5, 2.01, 3.02].forEach((m, i) => tone(am, d, { f: base * m, t: i * 0.07, dur: 1.6 - i * 0.25, gain: 0.07 / (1 + i * 0.6), attack: 0.01 }));
  noiseBurst(am, d, { duration: 0.5, freq: 7000, q: 1.2, gain: 0.02, type: 'highpass', attack: 0.15 });
}

/** A soft twinkle when a clue comes into reach. */
export function nearTwinkle(am: AudioManager, dest?: AudioNode | null): void {
  const d = out(am, dest);
  if (!am.ctx || !d) return;
  tone(am, d, { f: 1760, t: 0, dur: 0.6, gain: 0.025 });
  tone(am, d, { f: 2637, t: 0.09, dur: 0.5, gain: 0.018 });
}

/** Rubber stamp + ink seal: a thump with a paper crunch. */
export function stampThud(am: AudioManager, when = 0): void {
  const d = am.bus('sfx');
  if (!am.ctx || !d) return;
  tone(am, d, { f: 95, f2: 42, t: when, dur: 0.22, gain: 0.5, attack: 0.002 });
  noiseBurst(am, d, { duration: 0.09, freq: 500, q: 0.7, gain: 0.35, type: 'lowpass', when });
  noiseBurst(am, d, { duration: 0.06, freq: 3200, q: 1.5, gain: 0.08, when: when + 0.01 });
}

/** Two dull knocks on wood: "at least one is wrong". */
export function wrongKnock(am: AudioManager): void {
  const d = am.bus('sfx');
  if (!am.ctx || !d) return;
  for (const w of [0, 0.16]) {
    noiseBurst(am, d, { duration: 0.06, freq: 850, q: 9, gain: 0.5, when: w });
    tone(am, d, { f: 190, f2: 150, t: w, dur: 0.12, gain: 0.12 });
  }
}

/** Paper rustle (board open, noun dropped). */
export function paper(am: AudioManager, strength = 1): void {
  const d = am.bus('sfx');
  if (!am.ctx || !d) return;
  noiseBurst(am, d, { duration: 0.12 + 0.1 * strength, freq: 2400, q: 0.8, gain: 0.05 * strength, type: 'bandpass', attack: 0.02 });
  noiseBurst(am, d, { duration: 0.08, freq: 5200, q: 1.2, gain: 0.03 * strength, when: 0.05 });
}

/** The rising, breath-like swell when an echo opens. */
export function echoSwell(am: AudioManager, dest?: AudioNode | null): void {
  const d = out(am, dest);
  const ctx = am.ctx;
  const buf = am.noise();
  if (!ctx || !d || !buf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(240, t);
  bp.frequency.exponentialRampToValueAtTime(2600, t + 1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 1.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
  src.connect(bp).connect(g).connect(d);
  src.start(t);
  src.stop(t + 2.4);
  tone(am, d, { f: 55, t: 0, dur: 3.2, gain: 0.12, attack: 1.2 });
  tone(am, d, { f: 82.4, t: 0.4, dur: 2.8, gain: 0.06, attack: 1.0 });
}

/**
 * Whispered speech: band-passed noise in syllable-like bursts with moving formants. The words
 * are never intelligible; the subtitles carry them.
 */
export function whisper(am: AudioManager, dest: AudioNode | null, seconds: number, seed = 1, gain = 0.16): void {
  const ctx = am.ctx;
  const buf = am.noise();
  const d = out(am, dest);
  if (!ctx || !d || !buf) return;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const t0 = ctx.currentTime + 0.05;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = rnd() * 3;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 4;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 6;
  const mix = ctx.createGain();
  const env = ctx.createGain();
  env.gain.value = 0;
  src.connect(hp);
  hp.connect(f1).connect(mix);
  hp.connect(f2).connect(mix);
  mix.connect(env).connect(d);
  let t = t0;
  const end = t0 + seconds;
  while (t < end) {
    const syl = 0.07 + rnd() * 0.14;
    const amp = gain * (0.45 + rnd() * 0.55);
    f1.frequency.setTargetAtTime(1200 + rnd() * 1600, t, 0.02);
    f2.frequency.setTargetAtTime(2600 + rnd() * 2200, t, 0.02);
    env.gain.setTargetAtTime(amp, t, 0.012);
    env.gain.setTargetAtTime(0, t + syl, 0.03);
    // word gaps
    t += syl + (rnd() < 0.22 ? 0.18 + rnd() * 0.25 : 0.02 + rnd() * 0.05);
  }
  src.start(t0);
  src.onended = am.holdVoice();
  src.stop(end + 0.4);
}

export interface BreathLoop {
  setLevel(v: number): void;
  stop(): void;
}

/** Slow ghost breathing: noise swelling and sinking through a low-pass, ~4 s per breath. */
export function breathing(am: AudioManager, dest?: AudioNode | null): BreathLoop {
  const ctx = am.ctx;
  const buf = am.noise();
  const d = out(am, dest);
  if (!ctx || !d || !buf) return { setLevel() {}, stop() {} };
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = 700;
  lp.Q.value = 0.8;
  const breath = ctx.createGain();
  breath.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.24;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.5;
  const bias = ctx.createConstantSource();
  bias.offset.value = 0.15;
  lfo.connect(lfoGain).connect(breath.gain);
  bias.connect(breath.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.24;
  const lfo2g = ctx.createGain();
  lfo2g.gain.value = 300;
  lfo2.connect(lfo2g).connect(lp.frequency);
  const level = ctx.createGain();
  level.gain.value = 0;
  src.connect(lp).connect(breath).connect(level).connect(d);
  src.start();
  lfo.start();
  lfo2.start();
  bias.start();
  return {
    setLevel(v) {
      level.gain.setTargetAtTime(Math.max(0, v) * 0.18, ctx.currentTime, 0.6);
    },
    stop() {
      level.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      const end = ctx.currentTime + 2;
      for (const n of [src, lfo, lfo2, bias]) n.stop(end);
    },
  };
}
