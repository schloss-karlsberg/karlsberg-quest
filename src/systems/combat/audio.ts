/**
 * Procedural combat sound (Web Audio only, D-007), all on the sfx bus: the staff's whoosh and its
 * dull wooden thock with a family layer (mist hiss, glassy light, paper rustle, stone crack, ember
 * crackle, smoke whoomph), the crack of a Wuchthieb, the dissolve, the immune clink, telegraph calls
 * per family, the player's hurt breath and heartbeat, the dodge, the perfect-dodge chime, the
 * Bannlicht flare, boss roars and the Pikeur's "verloren". Every call is a no-op while locked.
 */
import type { AudioManager, Source3D } from '../../audio/audio';
import { hornCall } from '../../audio/synth';

type V3 = { x: number; y: number; z: number };

export class CombatAudio {
  private lastHit = -1;
  private hbT = 0;

  constructor(private readonly am: AudioManager) {}

  private get ctx(): AudioContext | null {
    return this.am.ctx;
  }

  private src(p: V3, ref = 5, ms = 3000): Source3D | null {
    if (!this.am.unlocked) return null;
    const s = this.am.createSource3D('sfx', { refDistance: ref, rolloff: 1 });
    if (!s) return null;
    s.setPosition(p.x, p.y, p.z);
    setTimeout(() => s.dispose(), ms);
    return s;
  }

  private get bus(): AudioNode | null {
    return this.am.unlocked ? this.am.bus('sfx') : null;
  }

  /** A tone with a pitch glide and an exponential decay. */
  private tone(dest: AudioNode | null, o: { type?: OscillatorType; f0: number; f1?: number; dur: number; gain: number; attack?: number; when?: number; lp?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** Filtered noise with a frequency sweep. */
  private noise(dest: AudioNode | null, o: { f0: number; f1?: number; q?: number; dur: number; gain: number; attack?: number; when?: number; type?: BiquadFilterType }): void {
    const ctx = this.ctx;
    const buf = this.am.noise();
    if (!ctx || !buf || !dest) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, (t * 7.3) % 3);
    src.stop(t + o.dur + 0.05);
  }

  // ---- the player's moves ------------------------------------------------------------------------

  swing(heavy: boolean, combo: number): void {
    const b = this.bus;
    const r = 1 + combo * 0.08;
    this.noise(b, { f0: heavy ? 280 : 520 * r, f1: heavy ? 1300 : 2200 * r, q: 1.4, dur: heavy ? 0.34 : 0.2, gain: heavy ? 0.5 : 0.32, attack: heavy ? 0.06 : 0.03, when: heavy ? 0 : 0.03 });
    if (heavy) this.tone(b, { type: 'sine', f0: 90, f1: 55, dur: 0.3, gain: 0.25 });
  }

  /** The staff connects: a wooden thock + the family's layer. */
  hit(p: V3, family: string, heavy: boolean, finisher: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // several hits in one swing: one sound
    if (ctx.currentTime - this.lastHit < 0.03) return;
    this.lastHit = ctx.currentTime;
    const s = this.src(p, 6, 2500);
    const d = s?.input ?? null;
    const b = this.bus;
    this.tone(b, { type: 'triangle', f0: heavy ? 150 : 210, f1: heavy ? 60 : 95, dur: heavy ? 0.16 : 0.09, gain: heavy ? 0.7 : 0.5 });
    this.noise(b, { f0: 1800, q: 2, dur: 0.035, gain: 0.35 });
    if (heavy || finisher) {
      this.noise(b, { f0: 600, f1: 200, q: 0.7, dur: 0.22, gain: 0.5, type: 'lowpass' });
      this.tone(b, { type: 'sine', f0: 70, f1: 38, dur: 0.28, gain: 0.55 });
    }
    switch (family) {
      case 'mist':
        this.noise(d, { f0: 1200, f1: 500, q: 0.6, dur: 0.3, gain: 0.35, type: 'lowpass', attack: 0.02 });
        break;
      case 'light':
        this.tone(d, { f0: 1760, f1: 1500, dur: 0.4, gain: 0.25 });
        this.tone(d, { f0: 2640, f1: 2400, dur: 0.3, gain: 0.15 });
        break;
      case 'paper':
        for (let i = 0; i < 4; i++) this.noise(d, { f0: 4200 + i * 300, q: 3, dur: 0.03, gain: 0.25, when: i * 0.025 });
        break;
      case 'stone':
        this.noise(d, { f0: 900, q: 1.2, dur: 0.08, gain: 0.6 });
        this.noise(d, { f0: 2400, q: 2, dur: 0.05, gain: 0.3, when: 0.02 });
        break;
      case 'ember':
        for (let i = 0; i < 5; i++) this.noise(d, { f0: 3000 + i * 400, q: 4, dur: 0.02, gain: 0.25, when: i * 0.03 + 0.01 });
        break;
      default:
        this.noise(d, { f0: 300, f1: 120, q: 0.6, dur: 0.25, gain: 0.45, type: 'lowpass' });
    }
  }

  whiff(): void {
    /* the swing whoosh is enough */
  }

  immune(p: V3): void {
    const s = this.src(p, 6, 2000);
    this.tone(s?.input ?? null, { f0: 2400, f1: 2300, dur: 0.25, gain: 0.3 });
    this.tone(s?.input ?? null, { f0: 3600, dur: 0.18, gain: 0.18 });
  }

  /** Undone: a rising whoosh and the family's tail. */
  dissolve(p: V3, style: string, boss: boolean): void {
    const s = this.src(p, boss ? 14 : 6, 4000);
    const d = s?.input ?? null;
    this.noise(d, { f0: 300, f1: 2400, q: 0.8, dur: boss ? 1.6 : 0.7, gain: boss ? 0.7 : 0.4, attack: 0.08 });
    switch (style) {
      case 'sparks':
        for (let i = 0; i < 8; i++) this.noise(d, { f0: 3500 + i * 200, q: 5, dur: 0.025, gain: 0.22, when: 0.05 + i * 0.05 });
        break;
      case 'paper':
        for (let i = 0; i < 10; i++) this.noise(d, { f0: 4000 + (i % 3) * 600, q: 3, dur: 0.04, gain: 0.2, when: i * 0.06 });
        break;
      case 'grit-rising':
        this.noise(d, { f0: 2600, f1: 5000, q: 1, dur: 1.2, gain: 0.2, attack: 0.3 });
        break;
      case 'ash':
        this.noise(d, { f0: 1500, f1: 600, q: 0.7, dur: 1, gain: 0.25 });
        break;
      default:
        this.tone(d, { f0: 220, f1: 440, dur: 0.6, gain: 0.08, attack: 0.1 });
    }
    if (boss) this.tone(d, { type: 'sawtooth', f0: 70, f1: 30, dur: 2.2, gain: 0.3, lp: 400, attack: 0.1 });
  }

  /** The wind-up call of an attack (pose + glow + sound + caption). */
  telegraph(p: V3, family: string, boss: boolean, dur: number): void {
    const s = this.src(p, boss ? 12 : 6, 3000);
    const d = s?.input ?? null;
    const T = Math.max(0.3, dur);
    switch (family) {
      case 'mist':
        this.noise(d, { f0: 200, f1: 700, q: 2, dur: T, gain: 0.35, attack: T * 0.7 });
        break;
      case 'light':
        this.tone(d, { f0: 600, f1: 1500, dur: T, gain: 0.18, attack: T * 0.8 });
        break;
      case 'hound':
        this.tone(d, { type: 'sawtooth', f0: 85, f1: 110, dur: T, gain: 0.25, lp: 500, attack: 0.05 });
        break;
      case 'paper':
        for (let i = 0; i < Math.round(T * 18); i++) this.noise(d, { f0: 3600, q: 3, dur: 0.02, gain: 0.18, when: i * 0.05 });
        break;
      case 'shade':
        this.noise(d, { f0: 900, f1: 300, q: 1, dur: T, gain: 0.3, attack: T * 0.5 });
        break;
      case 'ember':
        this.noise(d, { f0: 1200, f1: 4000, q: 1.5, dur: T, gain: 0.3, attack: T * 0.9 });
        break;
      case 'stone':
        this.noise(d, { f0: 120, f1: 260, q: 0.8, dur: T, gain: 0.55, type: 'lowpass', attack: T * 0.6 });
        break;
    }
    if (boss) this.tone(d, { type: 'sawtooth', f0: 55, f1: 75, dur: T, gain: 0.3, lp: 300, attack: T * 0.5 });
  }

  /** An area attack lands / a block lands: a thud. */
  slam(p: V3, big: boolean): void {
    const s = this.src(p, big ? 14 : 8, 2500);
    this.noise(s?.input ?? null, { f0: 400, f1: 80, q: 0.6, dur: big ? 0.6 : 0.35, gain: big ? 0.9 : 0.6, type: 'lowpass' });
    this.tone(s?.input ?? null, { f0: 60, f1: 30, dur: big ? 0.6 : 0.35, gain: 0.6 });
  }

  shot(p: V3, cold: boolean): void {
    const s = this.src(p, 6, 2000);
    if (cold) this.tone(s?.input ?? null, { f0: 1200, f1: 600, dur: 0.3, gain: 0.18 });
    else this.noise(s?.input ?? null, { f0: 800, f1: 2400, q: 2, dur: 0.25, gain: 0.3 });
  }

  burst(p: V3): void {
    const s = this.src(p, 8, 2500);
    this.noise(s?.input ?? null, { f0: 1800, f1: 300, q: 0.5, dur: 0.4, gain: 0.8 });
    for (let i = 0; i < 6; i++) this.noise(s?.input ?? null, { f0: 4000, q: 5, dur: 0.02, gain: 0.3, when: 0.05 + i * 0.04 });
  }

  /** The player is hit: a dull blow and the breath knocked out. */
  hurt(heavy: boolean): void {
    const b = this.bus;
    this.tone(b, { type: 'sine', f0: heavy ? 80 : 110, f1: 45, dur: 0.25, gain: heavy ? 0.7 : 0.5 });
    this.noise(b, { f0: 700, f1: 400, q: 2.5, dur: 0.22, gain: 0.25, when: 0.04, attack: 0.03 });
  }

  /** Below 30 % Lebenskraft: a heartbeat (called every frame with the rate). */
  heartbeat(dt: number, low: number): void {
    if (low <= 0) {
      this.hbT = 0;
      return;
    }
    this.hbT -= dt;
    if (this.hbT > 0) return;
    this.hbT = 1.1 - low * 0.45;
    const b = this.bus;
    this.tone(b, { f0: 62, f1: 48, dur: 0.14, gain: 0.35 * low + 0.15 });
    this.tone(b, { f0: 58, f1: 44, dur: 0.12, gain: 0.25 * low + 0.1, when: 0.22 });
  }

  dodge(perfect: boolean): void {
    const b = this.bus;
    this.noise(b, { f0: 400, f1: 1400, q: 0.8, dur: 0.28, gain: 0.3, attack: 0.04 });
    if (perfect) {
      this.tone(b, { f0: 1320, dur: 0.6, gain: 0.18 });
      this.tone(b, { f0: 1980, dur: 0.5, gain: 0.12, when: 0.04 });
      this.tone(b, { type: 'sine', f0: 140, f1: 70, dur: 0.5, gain: 0.25 });
    }
  }

  evade(): void {
    this.noise(this.bus, { f0: 2000, f1: 800, q: 1, dur: 0.15, gain: 0.15 });
  }

  /** The Bannlicht flares: a bright shimmer over a low thrum. */
  bann(): void {
    const b = this.bus;
    this.noise(b, { f0: 300, f1: 3000, q: 0.8, dur: 0.45, gain: 0.45, attack: 0.02 });
    for (const [f, g] of [
      [880, 0.12],
      [1320, 0.09],
      [1760, 0.07],
      [2640, 0.05],
    ] as const)
      this.tone(b, { f0: f, f1: f * 0.98, dur: 1.1, gain: g, attack: 0.01 });
    this.tone(b, { f0: 55, f1: 50, dur: 0.9, gain: 0.3 });
  }

  /** Not possible (no charge, out of breath). */
  denied(): void {
    this.tone(this.bus, { f0: 300, f1: 220, dur: 0.12, gain: 0.12 });
  }

  chargeFull(): void {
    this.tone(this.bus, { f0: 520, f1: 780, dur: 0.18, gain: 0.15 });
  }

  stun(p: V3): void {
    const s = this.src(p, 6, 2000);
    this.tone(s?.input ?? null, { f0: 900, f1: 300, dur: 0.6, gain: 0.15 });
  }

  /** Boss phase change / summon: a low roar. */
  roar(p: V3): void {
    const s = this.src(p, 16, 4000);
    this.noise(s?.input ?? null, { f0: 150, f1: 500, q: 0.7, dur: 1.4, gain: 0.8, type: 'lowpass', attack: 0.3 });
    this.tone(s?.input ?? null, { type: 'sawtooth', f0: 48, f1: 62, dur: 1.4, gain: 0.35, lp: 260, attack: 0.3 });
  }

  /** The Pikeur blows "verloren" (a falling horn call) and rides off. */
  verloren(p: V3): void {
    const s = this.src(p, 30, 6000);
    hornCall(this.am, s?.input ?? null, { notes: [8, 6, 5, 4], durations: [0.5, 0.5, 0.6, 1.6], gain: 0.5 });
  }

  /** Horn before the charge (Pikeur telegraph). */
  horn(p: V3): void {
    const s = this.src(p, 30, 4000);
    hornCall(this.am, s?.input ?? null, { notes: [6, 8], durations: [0.25, 0.6], gain: 0.4 });
  }

  balk(p: V3): void {
    const s = this.src(p, 14, 3000);
    this.noise(s?.input ?? null, { f0: 800, f1: 2400, q: 1.5, dur: 0.6, gain: 0.5 });
    this.tone(s?.input ?? null, { type: 'sawtooth', f0: 300, f1: 180, dur: 0.7, gain: 0.25, lp: 1200 });
  }

  // ---- fun pass: stings, the Gnadenstoß, armour ---------------------------------------------------

  /** A boss reveals itself: two drum blows, a low brass chord swelling under a high cold note. */
  sting(kind: string): void {
    const b = this.am.unlocked ? (this.am.bus('music') ?? this.bus) : null;
    // each boss its own chord (minor, heavy): the root in Hz
    const root = kind === 'pikeur' ? 73.4 : kind === 'strohmann' ? 65.4 : kind === 'steinbrecher' ? 55 : 82.4;
    this.tone(b, { type: 'sine', f0: 90, f1: 38, dur: 0.9, gain: 0.9 });
    this.noise(b, { f0: 300, f1: 60, q: 0.6, dur: 0.7, gain: 0.7, type: 'lowpass' });
    for (const [m, g] of [
      [1, 0.26],
      [1.5, 0.18],
      [2, 0.16],
      [2.38, 0.12],
    ] as const)
      this.tone(b, { type: 'sawtooth', f0: root * m, f1: root * m * 0.995, dur: 2.6, gain: g, lp: 900, attack: 0.35, when: 0.05 });
    this.tone(b, { type: 'triangle', f0: root * 8, f1: root * 7.9, dur: 2.2, gain: 0.07, attack: 0.6, when: 0.3 });
    this.tone(b, { type: 'sine', f0: 80, f1: 36, dur: 0.7, gain: 0.7, when: 0.62 });
  }

  /** A boss comes apart: a long fall under a rising, released chord. */
  bossDown(): void {
    const b = this.bus;
    this.tone(b, { type: 'sine', f0: 70, f1: 28, dur: 2.4, gain: 0.8 });
    this.noise(b, { f0: 200, f1: 3200, q: 0.6, dur: 2.2, gain: 0.45, attack: 0.4 });
    for (const [f, w] of [
      [523, 0.3],
      [659, 0.5],
      [784, 0.7],
      [1047, 0.95],
    ] as const)
      this.tone(b, { f0: f, f1: f * 1.002, dur: 2.2, gain: 0.08, attack: 0.2, when: w });
  }

  /** The Gnadenstoß: a crack, a deep thump and a bell. */
  finisher(p: V3): void {
    const s = this.src(p, 8, 3000);
    const d = s?.input ?? null;
    this.noise(this.bus, { f0: 2400, f1: 300, q: 0.8, dur: 0.18, gain: 0.7 });
    this.tone(this.bus, { type: 'sine', f0: 110, f1: 32, dur: 0.6, gain: 0.85 });
    this.tone(d, { f0: 1175, f1: 1170, dur: 1.4, gain: 0.16, when: 0.08 });
    this.tone(d, { f0: 1760, f1: 1755, dur: 1.1, gain: 0.1, when: 0.1 });
  }

  /** The staff glances off armour: a dull clank. */
  clank(p: V3): void {
    const s = this.src(p, 6, 1500);
    this.tone(s?.input ?? null, { type: 'square', f0: 520, f1: 480, dur: 0.08, gain: 0.12, lp: 1800 });
    this.noise(s?.input ?? null, { f0: 2800, q: 6, dur: 0.06, gain: 0.25 });
  }

  /** A pack's elite calls them on: a rough, rising cry (a grinding rumble for stone). */
  eliteCall(p: V3, family: string): void {
    const s = this.src(p, 14, 3000);
    const d = s?.input ?? null;
    if (family === 'stone') this.noise(d, { f0: 90, f1: 220, q: 0.7, dur: 0.9, gain: 0.7, type: 'lowpass', attack: 0.2 });
    else this.tone(d, { type: 'sawtooth', f0: family === 'hound' ? 160 : 120, f1: family === 'hound' ? 320 : 180, dur: 0.8, gain: 0.25, lp: 1400, attack: 0.1 });
  }
  // ---- combat variety pass: abilities, guards, veils, mirrors, callers, waves, hazards -------------

  /** Ausfall: a hard rising rush of air and a bite of wood at the end. */
  lunge(): void {
    const b = this.bus;
    this.noise(b, { f0: 300, f1: 2600, q: 0.9, dur: 0.32, gain: 0.5, attack: 0.03 });
    this.tone(b, { type: 'triangle', f0: 140, f1: 260, dur: 0.22, gain: 0.25 });
  }

  /** Erdstoß: the staff driven into the ground — a deep boom, a crack, grit settling. */
  groundSlam(): void {
    const b = this.bus;
    this.tone(b, { type: 'sine', f0: 72, f1: 28, dur: 0.75, gain: 0.85 });
    this.noise(b, { f0: 520, f1: 70, q: 0.6, dur: 0.6, gain: 0.8, type: 'lowpass' });
    this.noise(b, { f0: 2200, q: 1.6, dur: 0.07, gain: 0.45 });
    for (let i = 0; i < 6; i++) this.noise(b, { f0: 1600 + i * 350, q: 4, dur: 0.03, gain: 0.12, when: 0.12 + i * 0.06 });
  }

  /** The Erdstoß winds up (the staff raised). */
  slamRaise(): void {
    this.noise(this.bus, { f0: 200, f1: 900, q: 1, dur: 0.35, gain: 0.25, attack: 0.15 });
  }

  /** Wirbel: three whooshes round you. */
  whirl(): void {
    const b = this.bus;
    for (let i = 0; i < 3; i++) this.noise(b, { f0: 380 + i * 60, f1: 1900 + i * 200, q: 1.3, dur: 0.24, gain: 0.34, attack: 0.05, when: 0.12 + i * 0.27 });
    this.tone(b, { type: 'sine', f0: 110, f1: 160, dur: 0.9, gain: 0.12, attack: 0.1 });
  }

  /** A blow bounces off a guard: a dull board knock and a scrape. */
  blocked(p: V3): void {
    const s = this.src(p, 7, 2000);
    const d = s?.input ?? null;
    this.tone(d, { type: 'triangle', f0: 180, f1: 120, dur: 0.12, gain: 0.55 });
    this.noise(d, { f0: 900, f1: 500, q: 2, dur: 0.18, gain: 0.35 });
  }

  /** A guard broken: the cover thrown open, a crack and pages riffling. */
  guardBreak(p: V3): void {
    const s = this.src(p, 9, 2500);
    const d = s?.input ?? null;
    this.noise(d, { f0: 1400, f1: 300, q: 0.7, dur: 0.3, gain: 0.7 });
    this.tone(d, { type: 'sine', f0: 95, f1: 45, dur: 0.3, gain: 0.5 });
    for (let i = 0; i < 6; i++) this.noise(d, { f0: 4000 + i * 250, q: 3, dur: 0.03, gain: 0.2, when: 0.1 + i * 0.03 });
  }

  /** A veil laid: a cold breath drawn in. Torn: a glassy rip. */
  veil(p: V3, torn: boolean): void {
    const s = this.src(p, 9, 2500);
    const d = s?.input ?? null;
    if (torn) {
      this.noise(d, { f0: 4500, f1: 900, q: 1.5, dur: 0.35, gain: 0.45 });
      this.tone(d, { f0: 1500, f1: 700, dur: 0.3, gain: 0.12 });
    } else {
      this.noise(d, { f0: 600, f1: 2400, q: 0.8, dur: 0.9, gain: 0.3, attack: 0.3, type: 'lowpass' });
      this.tone(d, { f0: 660, f1: 990, dur: 0.9, gain: 0.08, attack: 0.3 });
    }
  }

  /** The mirror throws the light back: a bright ring and a glass shriek. Cracked: glass breaking. */
  reflect(p: V3, cracked: boolean): void {
    const s = this.src(p, 9, 2500);
    const d = s?.input ?? null;
    if (cracked) {
      for (let i = 0; i < 7; i++) this.noise(d, { f0: 3000 + i * 500, q: 6, dur: 0.05, gain: 0.25, when: i * 0.025 });
      this.tone(d, { f0: 2100, f1: 1700, dur: 0.4, gain: 0.12 });
      return;
    }
    this.tone(d, { f0: 2640, f1: 3520, dur: 0.5, gain: 0.2 });
    this.tone(d, { f0: 3960, f1: 3300, dur: 0.4, gain: 0.12 });
    this.noise(this.bus, { f0: 5000, f1: 1500, q: 1, dur: 0.35, gain: 0.3 });
  }

  /** A Rufer calls: a hollow rising call through the fog (the funnel). */
  call(p: V3): void {
    const s = this.src(p, 18, 4000);
    const d = s?.input ?? null;
    this.tone(d, { type: 'sawtooth', f0: 92, f1: 138, dur: 1.2, gain: 0.25, lp: 700, attack: 0.25 });
    this.tone(d, { type: 'sine', f0: 184, f1: 276, dur: 1.2, gain: 0.12, attack: 0.25 });
  }

  /** A call broken off: the note chokes. */
  callBroken(p: V3): void {
    const s = this.src(p, 12, 2000);
    this.tone(s?.input ?? null, { type: 'sawtooth', f0: 150, f1: 60, dur: 0.3, gain: 0.25, lp: 600 });
  }

  /** Something rises out of the fog. */
  emerge(p: V3): void {
    const s = this.src(p, 8, 2500);
    this.noise(s?.input ?? null, { f0: 200, f1: 900, q: 0.6, dur: 0.7, gain: 0.35, type: 'lowpass', attack: 0.25 });
  }

  /** The second wave is coming (from where it will come). */
  waveIncoming(p: V3): void {
    const s = this.src(p, 30, 4000);
    const d = s?.input ?? null;
    this.tone(d, { type: 'sawtooth', f0: 70, f1: 105, dur: 1.4, gain: 0.3, lp: 400, attack: 0.4 });
    this.noise(d, { f0: 180, f1: 600, q: 0.6, dur: 1.4, gain: 0.4, type: 'lowpass', attack: 0.4 });
  }

  /** A hazard about to land: embers hissing down / stone grinding loose above. */
  hazardWarn(p: V3, kind: 'fire' | 'stone'): void {
    const s = this.src(p, 10, 2500);
    const d = s?.input ?? null;
    if (kind === 'fire') for (let i = 0; i < 8; i++) this.noise(d, { f0: 2500 + i * 300, q: 4, dur: 0.04, gain: 0.15, when: i * 0.12 });
    else this.noise(d, { f0: 120, f1: 300, q: 0.8, dur: 1.2, gain: 0.35, type: 'lowpass', attack: 0.4 });
  }

  /** A hazard lands. */
  hazardLand(p: V3, kind: 'fire' | 'stone'): void {
    if (kind === 'stone') return this.slam(p, true);
    const s = this.src(p, 10, 2500);
    this.noise(s?.input ?? null, { f0: 1600, f1: 400, q: 0.6, dur: 0.5, gain: 0.6 });
  }
}

