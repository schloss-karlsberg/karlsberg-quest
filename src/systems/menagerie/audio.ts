/**
 * Procedural animal sounds (Web Audio only): the cassowary's sub-bass boom and hiss, heavy
 * running steps, the knockdown thud; the dromedaries' gurgling grumble; the jaguar's sawing
 * cough and growl. Every call is a no-op while audio is locked.
 */
import type { AudioManager, Source3D } from '../../audio/audio';
import { noiseBurst } from '../../audio/synth';

type V3 = { x: number; y: number; z: number };

export class MenagerieAudio {
  constructor(private readonly am: AudioManager) {}

  private src(p: V3, ref: number, ms: number): Source3D | null {
    if (!this.am.unlocked) return null;
    const s = this.am.createSource3D('sfx', { refDistance: ref, rolloff: 1 });
    if (!s) return null;
    s.setPosition(p.x, p.y, p.z);
    setTimeout(() => s.dispose(), ms);
    return s;
  }

  /** Cassowary: three deep booms you feel more than hear. */
  boom(p: V3): void {
    const s = this.src(p, 14, 5000);
    const ctx = this.am.ctx;
    if (!s || !ctx) return;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + 0.05 + i * 0.62;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(52, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(104, t);
      o2.frequency.exponentialRampToValueAtTime(70, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(s.input);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.6);
      o2.stop(t + 0.6);
    }
  }

  /** A hiss (cassowary display, jaguar driven off by the light). */
  hiss(p: V3, low = false): void {
    const s = this.src(p, 6, 3000);
    if (!s) return;
    noiseBurst(this.am, s.input, { freq: low ? 1400 : 3200, q: 1.2, duration: low ? 0.9 : 0.7, gain: 0.5, attack: 0.08 });
  }

  /** Heavy running step (charge) or a soft pad. */
  step(p: V3, heavy: boolean): void {
    const s = this.src(p, heavy ? 8 : 3, 1200);
    if (!s) return;
    noiseBurst(this.am, s.input, { freq: heavy ? 140 : 380, q: 0.9, duration: heavy ? 0.12 : 0.06, gain: heavy ? 0.7 : 0.15 });
  }

  /** You go down: a body thud, breath knocked out. */
  thud(p: V3): void {
    const s = this.src(p, 3, 2500);
    const ctx = this.am.ctx;
    if (!s || !ctx) return;
    noiseBurst(this.am, s.input, { freq: 90, q: 0.7, duration: 0.3, gain: 1 });
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(s.input);
    o.start(t);
    o.stop(t + 0.5);
    noiseBurst(this.am, s.input, { freq: 900, q: 0.6, duration: 0.5, gain: 0.12, attack: 0.15, when: 0.25 });
  }

  /** Dromedary: a long gurgling grumble. */
  grumble(p: V3, pitch = 1): void {
    const s = this.src(p, 7, 4000);
    const ctx = this.am.ctx;
    if (!s || !ctx) return;
    const t = ctx.currentTime + 0.02;
    const dur = 1.6;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * pitch, t);
    o.frequency.linearRampToValueAtTime(130 * pitch, t + 0.5);
    o.frequency.linearRampToValueAtTime(80 * pitch, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 1.6;
    // gurgle: amplitude modulation
    const g = ctx.createGain();
    g.gain.value = 0;
    const am = ctx.createOscillator();
    am.frequency.setValueAtTime(14, t);
    am.frequency.linearRampToValueAtTime(22, t + dur);
    const amg = ctx.createGain();
    amg.gain.value = 0.22;
    am.connect(amg).connect(g.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.6, t + 0.15);
    env.gain.setValueAtTime(0.55, t + dur - 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const bias = ctx.createConstantSource();
    bias.offset.value = 0.3;
    bias.connect(g.gain);
    o.connect(f).connect(g).connect(env).connect(s.input);
    for (const n of [o, am, bias]) {
      n.start(t);
      n.stop(t + dur + 0.05);
    }
  }

  /** Jaguar: the "sawing" cough — rasping in and out, five times. Or a low growl. */
  saw(p: V3, growl = false): void {
    const s = this.src(p, growl ? 4 : 10, 4000);
    const ctx = this.am.ctx;
    if (!s || !ctx) return;
    const n = growl ? 1 : 5;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.03 + i * 0.42;
      const dur = growl ? 1.5 : i % 2 ? 0.2 : 0.3;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(growl ? 62 : i % 2 ? 150 : 115, t);
      o.frequency.linearRampToValueAtTime(growl ? 70 : 95, t + dur);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = growl ? 380 : 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(growl ? 0.5 : 0.55, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(s.input);
      o.start(t);
      o.stop(t + dur + 0.05);
      noiseBurst(this.am, s.input, { freq: 500, q: 0.8, duration: dur, gain: 0.18, attack: 0.03, when: t - ctx.currentTime });
    }
  }
}
