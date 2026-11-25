/**
 * Procedural sound of the hunt (Web Audio only, no files): horn calls, baying / barking /
 * growling, panting, paw steps, hoof beats, the player's heartbeat and the "caught" rush.
 * Every call is a no-op while audio is locked (before the game starts).
 */
import type { AudioManager, Source3D } from '../../audio/audio';
import { hornCall, noiseBurst } from '../../audio/synth';
import type { HornSignal } from './sim';

type V3 = { x: number; y: number; z: number };

export class HuntAudio {
  constructor(private readonly am: AudioManager) {}

  get on(): boolean {
    return this.am.unlocked;
  }

  private src(p: V3, ref: number, ms: number, bus: 'sfx' | 'ambience' = 'sfx'): Source3D | null {
    const s = this.am.createSource3D(bus, { refDistance: ref, rolloff: 1 });
    if (!s) return null;
    s.panner.positionX.value = p.x;
    s.panner.positionY.value = p.y;
    s.panner.positionZ.value = p.z;
    setTimeout(() => s.dispose(), ms);
    return s;
  }

  /** The Parforcehorn. Returns the call duration (s). */
  horn(signal: HornSignal, p: V3): number {
    if (!this.on) return 0;
    const s = this.src(p, 28, 9000);
    if (!s) return 0;
    const f0 = 58.3;
    const g = 0.5;
    switch (signal) {
      case 'search': // Anblasen: one long tone
        return hornCall(this.am, s.input, { notes: [3, 4], durations: [0.16, 2.6], fundamental: f0, gain: g });
      case 'found': // two short
        hornCall(this.am, s.input, { notes: [6], durations: [0.24], fundamental: f0, gain: g });
        hornCall(this.am, s.input, { notes: [6], durations: [0.24], fundamental: f0, gain: g, when: 0.42 });
        return 0.75;
      case 'lost': // a falling run
        return hornCall(this.am, s.input, { notes: [8, 6, 5, 4, 3], durations: [0.34, 0.3, 0.3, 0.32, 1.4], fundamental: f0, gain: g * 0.9 });
      case 'call-off': // three long
        for (let i = 0; i < 3; i++) hornCall(this.am, s.input, { notes: [4], durations: [0.95], fundamental: f0, gain: g, when: i * 1.25 });
        return 3.5;
    }
  }

  /** A spectral hound voice: long howl, short bark or low growl. `pitch` varies per hound. */
  bay(kind: 'howl' | 'bark' | 'growl', p: V3, pitch = 1): void {
    const ctx = this.am.ctx;
    if (!ctx || !this.on) return;
    const s = this.src(p, kind === 'growl' ? 3 : 10, 4000);
    if (!s) return;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0;
    // ghostly room: short feedback delay
    const dl = ctx.createDelay(0.5);
    dl.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const lpFb = ctx.createBiquadFilter();
    lpFb.type = 'lowpass';
    lpFb.frequency.value = 1500;
    out.connect(s.input);
    out.connect(dl).connect(lpFb).connect(fb).connect(dl);
    lpFb.connect(s.input);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 3.5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 5;
    f1.connect(out);
    f2.connect(out);
    const oscs: OscillatorNode[] = [];
    const voice = (type: OscillatorType, detune: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.connect(f1);
      o.connect(f2);
      oscs.push(o);
      return o;
    };
    let dur: number;
    if (kind === 'howl') {
      dur = 2.1;
      const base = 360 * pitch;
      f1.frequency.value = 750;
      f2.frequency.value = 1250;
      for (const [type, det] of [
        ['sawtooth', 0],
        ['triangle', 9],
      ] as const) {
        const o = voice(type, det);
        o.frequency.setValueAtTime(base * 0.75, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.18, t + 0.5);
        o.frequency.setValueAtTime(base * 1.18, t + 1.2);
        o.frequency.exponentialRampToValueAtTime(base * 0.62, t + dur);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.3;
        const vg = ctx.createGain();
        vg.gain.value = base * 0.018;
        vib.connect(vg).connect(o.frequency);
        vib.start(t);
        vib.stop(t + dur + 0.1);
      }
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.32, t + 0.25);
      out.gain.setValueAtTime(0.3, t + dur - 0.5);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noiseBurst(this.am, s.input, { freq: 1600, q: 0.8, duration: dur, gain: 0.03, attack: 0.3 });
    } else if (kind === 'bark') {
      dur = 0.26;
      const base = 520 * pitch;
      f1.frequency.value = 900;
      f2.frequency.value = 1700;
      const o = voice('sawtooth', 0);
      o.frequency.setValueAtTime(base * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.6, t + dur);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noiseBurst(this.am, s.input, { freq: 1100, q: 0.9, duration: 0.12, gain: 0.25 });
    } else {
      dur = 1.4;
      const base = 85 * pitch;
      f1.frequency.value = 300;
      f2.frequency.value = 520;
      f1.Q.value = 1.2;
      const o = voice('sawtooth', 0);
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.15, t + dur);
      // rattle: amplitude modulation at ~28 Hz
      const am = ctx.createOscillator();
      am.frequency.value = 27;
      const ag = ctx.createGain();
      ag.gain.value = 0.18;
      am.connect(ag).connect(out.gain);
      am.start(t);
      am.stop(t + dur + 0.1);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.3, t + 0.2);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** One breath of panting (in + out). */
  pant(p: V3, gain = 0.12, fast = false): void {
    if (!this.on) return;
    const s = this.src(p, 2.5, 900);
    if (!s) return;
    const r = 0.9 + Math.random() * 0.2;
    noiseBurst(this.am, s.input, { freq: 1500 * r, q: 2.2, duration: fast ? 0.1 : 0.16, gain, attack: 0.03 });
    noiseBurst(this.am, s.input, { freq: 1050 * r, q: 2, duration: fast ? 0.12 : 0.2, gain: gain * 0.8, attack: 0.04, when: fast ? 0.14 : 0.24 });
  }

  /** A soft paw step; frost adds the crunch of hoar frost. */
  paw(p: V3, frost: boolean, gain = 0.1): void {
    if (!this.on) return;
    const s = this.src(p, 2, 700);
    if (!s) return;
    noiseBurst(this.am, s.input, { freq: 380, q: 0.8, duration: 0.07, gain, type: 'lowpass' });
    if (frost) noiseBurst(this.am, s.input, { freq: 3200 + Math.random() * 800, q: 1.2, duration: 0.06, gain: gain * 0.6, when: 0.01 });
  }

  /** A hoof beat (heavy, low). */
  hoof(p: V3, gain = 0.3): void {
    const ctx = this.am.ctx;
    if (!ctx || !this.on) return;
    const s = this.src(p, 6, 800);
    if (!s) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(s.input);
    o.start(t);
    o.stop(t + 0.2);
    noiseBurst(this.am, s.input, { freq: 900, q: 1, duration: 0.04, gain: gain * 0.4 });
  }

  /** The player's own heartbeat (not positional). */
  heartbeat(gain: number): void {
    const ctx = this.am.ctx;
    const bus = this.am.bus('sfx');
    if (!ctx || !bus || !this.on || gain <= 0.01) return;
    const t = ctx.currentTime + 0.01;
    for (const [dt, k] of [
      [0, 1],
      [0.17, 0.65],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(62, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(gain * k, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
      o.connect(g).connect(bus);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }

  /** The caught stinger: a rushing swell of breath and smoke, cut by a low boom. */
  rush(): void {
    const ctx = this.am.ctx;
    const bus = this.am.bus('sfx');
    const buf = this.am.noise();
    if (!ctx || !bus || !buf || !this.on) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(4200, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 1.5);
    g.gain.setValueAtTime(0.0001, t + 1.62);
    src.connect(lp).connect(g).connect(bus);
    src.start(t, 0.5);
    src.stop(t + 1.7);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t + 1.62);
    o.frequency.exponentialRampToValueAtTime(24, t + 3.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t + 1.62);
    og.gain.exponentialRampToValueAtTime(0.7, t + 1.66);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(og).connect(bus);
    o.start(t + 1.6);
    o.stop(t + 3.5);
  }

  /** A hound lies down: a long, low exhale through the nose and a faint settling whine. */
  sigh(p: V3, pitch = 1): void {
    const ctx = this.am.ctx;
    if (!ctx || !this.on) return;
    const s = this.src(p, 3, 4000);
    if (!s) return;
    noiseBurst(this.am, s.input, { freq: 700 * pitch, q: 1.4, duration: 1.3, gain: 0.07, attack: 0.25, type: 'bandpass' });
    noiseBurst(this.am, s.input, { freq: 260, q: 0.7, duration: 0.35, gain: 0.05, attack: 0.02, type: 'lowpass', when: 0.05 });
    const t = ctx.currentTime + 0.4;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(330 * pitch, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(g).connect(s.input);
    o.start(t);
    o.stop(t + 1);
  }

  /** Brought home (drive mode): no stinger, a soft swell of wind and breath. */
  homed(): void {
    const ctx = this.am.ctx;
    const bus = this.am.bus('sfx');
    const buf = this.am.noise();
    if (!ctx || !bus || !buf || !this.on) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    src.connect(lp).connect(g).connect(bus);
    src.start(t, 0.3);
    src.stop(t + 3.1);
  }
}
