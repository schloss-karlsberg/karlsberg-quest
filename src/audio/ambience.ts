import type { AudioManager } from './audio';
import { type Loop, noiseBurst } from './synth';

const WATER = {
  pond: { low: 290, high: 850, rate: 0.48, swell: 0.32, gain: 0.52 },
  brook: { low: 780, high: 2350, rate: 4.7, swell: 0.19, gain: 0.38 },
};

/** Broad water beds: a lapping shore or a shallow brook. The spring spout has its own source. */
export function waterLoop(am: AudioManager, dest: AudioNode, kind: keyof typeof WATER): Loop | null {
  const ctx = am.ctx;
  const buffer = am.noise();
  if (!ctx || !buffer) return null;
  const preset = WATER[kind];
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = preset.low;
  band.Q.value = 0.6;
  const ripple = ctx.createBiquadFilter();
  ripple.type = 'bandpass';
  ripple.frequency.value = preset.high;
  ripple.Q.value = 1.2;
  const wave = ctx.createGain();
  wave.gain.value = 0.36;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = preset.rate;
  const depth = ctx.createGain();
  depth.gain.value = preset.swell;
  lfo.connect(depth).connect(wave.gain);
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(band).connect(out);
  src.connect(ripple).connect(wave).connect(out);
  out.connect(dest);
  src.start(0, kind === 'brook' ? 1.5 : 0);
  lfo.start();
  src.onended = () => out.disconnect();
  return {
    setIntensity(v, ramp = 1.5) {
      out.gain.setTargetAtTime(v * preset.gain, ctx.currentTime, ramp / 3);
    },
    stop(fade = 1) {
      out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      const end = ctx.currentTime + fade;
      src.stop(end);
      lfo.stop(end);
    },
  };
}

/** A pair of walking horses beyond the courtyard, heard as soft, irregular clops. */
export function distantHooves(am: AudioManager, dest: AudioNode): void {
  for (const [i, when] of [0, 0.24, 0.4, 0.62, 0.91, 1.13, 1.32, 1.57, 1.81, 2.09].entries()) {
    const gain = (i % 2 === 0 ? 0.24 : 0.17) * (1 - i * 0.045);
    noiseBurst(am, dest, { when, duration: 0.075, freq: 440 + Math.random() * 115, q: 1.8, gain });
    noiseBurst(am, dest, { when: when + 0.012, duration: 0.12, freq: 300, type: 'lowpass', gain: gain * 0.6 });
  }
}

/** Two overlapping, filtered murmurs suggest conversation across the court. */
export function distantCourt(am: AudioManager, dest: AudioNode): void {
  const ctx = am.ctx;
  if (!ctx) return;
  for (const [i, offsets] of [[0, 0.17, 0.36, 0.58, 0.94], [0.73, 0.99, 1.18, 1.39, 1.61]].entries()) {
    const voice = ctx.createOscillator();
    voice.type = 'triangle';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620 + i * 170;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    voice.connect(filter).connect(gain).connect(dest);
    for (const offset of offsets) {
      const t = ctx.currentTime + offset;
      const f = 108 + i * 42 + Math.random() * 26;
      voice.frequency.setValueAtTime(f, t);
      voice.frequency.linearRampToValueAtTime(f * 0.84, t + 0.14);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.075 + Math.random() * 0.04, t + 0.035);
      gain.gain.linearRampToValueAtTime(0, t + 0.16);
      noiseBurst(am, dest, { when: offset, duration: 0.16, attack: 0.03, freq: 670, gain: 0.04 });
    }
    voice.start();
    voice.stop(ctx.currentTime + offsets[offsets.length - 1]! + 0.18);
  }
}
