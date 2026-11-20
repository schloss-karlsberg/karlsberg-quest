/**
 * The spring's sounds, procedural like the rest (src/audio/synth.ts): a trickle from the pipe
 * (noise through two narrow band-passes with a quick random gurgle), the splash of the hand, the
 * moment time stands still (the trickle cut, the ambience ducked, a thin glassy chord) and the
 * brook running back (a rising, swelling hush).
 */
import type { AudioManager, Source3D } from '../../audio/audio';

export interface SpringSound {
  /** Trickle loudness 0..1 (0 when frozen / no stream), at the outlet's position. */
  trickle(v: number, x: number, y: number, z: number): void;
  splash(): void;
  /** Time stops: the trickle is cut, the ambience ducked, the chord comes in. */
  stillness(): void;
  /** The brook runs back. */
  rewind(): void;
  /** Everything back to normal (the ambience bus restored). */
  release(): void;
  dispose(): void;
}

const noop: SpringSound = { trickle() {}, splash() {}, stillness() {}, rewind() {}, release() {}, dispose() {} };

export function springSound(am: AudioManager): SpringSound {
  const ctx = am.ctx;
  const buf = am.noise();
  const sfx = am.bus('sfx');
  if (!ctx || !buf || !sfx) return noop;
  const src3d: Source3D | null = am.createSource3D('ambience', { refDistance: 2.5, maxDistance: 60, rolloff: 1.3 });
  if (!src3d) return noop;
  // ---- the trickle: two band-passes, a fast wobbling gain (the gurgle)
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = 2300;
  bp1.Q.value = 3.5;
  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.value = 900;
  bp2.Q.value = 1.4;
  const mix1 = ctx.createGain();
  mix1.gain.value = 0.55;
  const mix2 = ctx.createGain();
  mix2.gain.value = 0.35;
  const wob = ctx.createGain();
  wob.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 7.3;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.35;
  lfo.connect(lfoG).connect(wob.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.9;
  const lfo2G = ctx.createGain();
  lfo2G.gain.value = 600;
  lfo2.connect(lfo2G).connect(bp1.frequency);
  const level = ctx.createGain();
  level.gain.value = 0;
  n.connect(bp1).connect(mix1).connect(wob);
  n.connect(bp2).connect(mix2).connect(wob);
  wob.connect(level).connect(src3d.input);
  n.start();
  lfo.start();
  lfo2.start();
  let ducked = false;
  let chord: { stop(): void } | null = null;
  const now = () => ctx.currentTime;

  const burst = (dur: number, f0: number, f1: number, gain: number, attack = 0.005) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, now());
    f.frequency.exponentialRampToValueAtTime(f1, now() + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(gain, now() + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    s.connect(f).connect(g).connect(sfx);
    s.start(now(), Math.random() * 2);
    s.stop(now() + dur + 0.05);
  };

  return {
    trickle(v, x, y, z) {
      src3d.setPosition(x, y, z);
      level.gain.setTargetAtTime(Math.max(0, v) * 0.5, now(), v > 0.01 ? 0.25 : 0.03);
    },
    splash() {
      burst(0.35, 3200, 900, 0.35);
      burst(0.6, 1400, 500, 0.18, 0.02);
    },
    stillness() {
      level.gain.cancelScheduledValues(now());
      level.gain.setTargetAtTime(0, now(), 0.02);
      const amb = am.bus('ambience');
      if (amb && !ducked) {
        ducked = true;
        amb.gain.setTargetAtTime(am.volumes.ambience * 0.12, now(), 0.08);
      }
      // a thin, glassy chord (E6, B6, a quiet E7), slow in, held
      chord?.stop();
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, now());
      out.gain.exponentialRampToValueAtTime(0.06, now() + 0.6);
      out.connect(sfx);
      const oscs = [1318.5, 1975.5, 2637].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 4;
        const g = ctx.createGain();
        g.gain.value = i === 2 ? 0.25 : 0.5;
        o.connect(g).connect(out);
        o.start();
        return o;
      });
      chord = {
        stop() {
          out.gain.cancelScheduledValues(now());
          out.gain.setTargetAtTime(0.0001, now(), 0.4);
          for (const o of oscs) o.stop(now() + 2);
        },
      };
    },
    rewind() {
      // a hush that swells and rises (the brook pulled back up the ravine)
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, now());
      f.frequency.exponentialRampToValueAtTime(4200, now() + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now());
      g.gain.exponentialRampToValueAtTime(0.22, now() + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, now() + 2.2);
      s.connect(f).connect(g).connect(sfx);
      s.start();
      s.stop(now() + 2.3);
    },
    release() {
      chord?.stop();
      chord = null;
      const amb = am.bus('ambience');
      if (amb && ducked) amb.gain.setTargetAtTime(am.volumes.ambience, now(), 0.6);
      ducked = false;
    },
    dispose() {
      this.release();
      try {
        n.stop();
        lfo.stop();
        lfo2.stop();
      } catch {
        /* already stopped */
      }
      level.disconnect();
      src3d.dispose();
    },
  };
}
