/**
 * The burn ending's memories (playtest round 4: "the burn ending tells its memories in a
 * sentence"). While the Chronik burns, each page shows one memory through the hole the flame
 * eats into it, played by the world itself:
 *
 *  ehrenhof   the palace in the light of 1789: the Ehrenhof at a low golden sun
 *  feuerwerk  a night of 1789: fireworks burst over the roofs of the palace
 *  jagd       February 1793, the Apfelallee in the frost fog: the pack, eyes opening, the horn
 *
 * The world's era is lent for the shot (World.setEra — terrain, palace, trees, look; no era
 * event, nothing else in the game notices) and given back afterwards. Reduced motion: still
 * shots (no dolly); reduced flash: soft bursts without the white core.
 */
import type { GameContext } from '../../../core/context';
import type { Era } from '../../../core/era';
import { ERA_LOOKS, type EraLook } from '../../../world/eraPresets';
import { GlowPoints, lerp, pxScale, rng, smooth, yawTo } from './common';

export interface MemoryShot {
  key: 'ehrenhof' | 'feuerwerk' | 'jagd';
  era: Era;
  /** Camera at (x, z) h m above the ground, looking at (tx, ty above ground, tz); dolly m forward. */
  x: number;
  z: number;
  h: number;
  tx: number;
  tz: number;
  ty: number;
  dolly: number;
  /** Year shown under the picture. */
  year: string;
}

export const MEMORY_SHOTS: MemoryShot[] = [
  { key: 'ehrenhof', era: '1789', x: 1190, z: -1131, h: 1.7, tx: 1262, tz: -1112, ty: 9, dolly: 5, year: '1789' },
  { key: 'feuerwerk', era: '1789', x: 1196, z: -1130, h: 1.6, tx: 1262, tz: -1112, ty: 24, dolly: 2, year: '1789' },
  { key: 'jagd', era: '1793-02', x: 1478, z: -598, h: 1.4, tx: 1496, tz: -556, ty: 0.6, dolly: 1.5, year: '1793' },
];

const SPARKS = 900;

/** Fireworks over the palace: rockets rise, burst into a sphere of sparks that fall and fade. */
class Fireworks {
  readonly glow = new GlowPoints(SPARKS, { additive: true, renderOrder: 70 });
  private readonly vel = new Float32Array(SPARKS * 3);
  private readonly life = new Float32Array(SPARKS * 2);
  private readonly tint = new Float32Array(SPARKS * 3);
  private next = 0;
  private t = 0;
  private nextBurst = 0.15;
  private readonly R = rng(1789);

  constructor(
    private readonly cx: number,
    private readonly cy: number,
    private readonly cz: number,
  ) {}

  private burst(soft: boolean): void {
    const R = this.R;
    // over the corps de logis, a little before it (towards the courtyard)
    const x = this.cx - 14 + (R() - 0.5) * 40;
    const y = this.cy + 26 + R() * 20;
    const z = this.cz + (R() - 0.5) * 30;
    const palette = [
      [3.2, 2.2, 0.9],
      [3.0, 3.0, 2.6],
      [3.2, 1.1, 0.6],
      [1.6, 2.4, 3.2],
    ];
    const c = palette[Math.floor(R() * palette.length)]!;
    const n = 150;
    const sp = 11 + R() * 6;
    for (let i = 0; i < n; i++) {
      const j = this.next;
      this.next = (this.next + 1) % SPARKS;
      // a sphere of sparks
      const u = R() * 2 - 1;
      const a = R() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = sp * (0.85 + R() * 0.3);
      this.glow.pos[j * 3] = x;
      this.glow.pos[j * 3 + 1] = y;
      this.glow.pos[j * 3 + 2] = z;
      this.vel[j * 3] = Math.cos(a) * s * v;
      this.vel[j * 3 + 1] = u * v;
      this.vel[j * 3 + 2] = Math.sin(a) * s * v;
      this.life[j * 2] = 0;
      this.life[j * 2 + 1] = 1.4 + R() * 0.9;
      const k = soft ? 0.6 : 1;
      this.tint[j * 3] = c[0]! * k;
      this.tint[j * 3 + 1] = c[1]! * k;
      this.tint[j * 3 + 2] = c[2]! * k;
    }
  }

  frame(dt: number, soft: boolean): void {
    this.t += dt;
    while (this.t >= this.nextBurst) {
      this.burst(soft);
      this.nextBurst += 0.45 + this.R() * 0.35;
    }
    for (let j = 0; j < SPARKS; j++) {
      const L = this.life[j * 2 + 1]!;
      if (L <= 0) continue;
      const a = (this.life[j * 2]! += dt);
      const k = a / L;
      if (k >= 1) {
        this.life[j * 2 + 1] = 0;
        this.glow.col[j * 4 + 3] = 0;
        continue;
      }
      // drag, gravity
      const drag = Math.exp(-dt * 1.6);
      this.vel[j * 3]! *= drag;
      this.vel[j * 3 + 1] = this.vel[j * 3 + 1]! * drag - 4.5 * dt;
      this.vel[j * 3 + 2]! *= drag;
      this.glow.pos[j * 3]! += this.vel[j * 3]! * dt;
      this.glow.pos[j * 3 + 1]! += this.vel[j * 3 + 1]! * dt;
      this.glow.pos[j * 3 + 2]! += this.vel[j * 3 + 2]! * dt;
      // a hot white flash at the burst (not with reduced flash), then the colour, then out
      const hot = soft ? 0 : Math.max(0, 1 - a / 0.12);
      const flick = 0.75 + 0.25 * Math.sin(a * 40 + j);
      this.glow.col[j * 4] = this.tint[j * 3]! + hot * 3;
      this.glow.col[j * 4 + 1] = this.tint[j * 3 + 1]! + hot * 3;
      this.glow.col[j * 4 + 2] = this.tint[j * 3 + 2]! + hot * 3;
      this.glow.col[j * 4 + 3] = (1 - k) ** 1.5 * flick;
      this.glow.size[j] = 0.9 + hot * 0.8;
    }
  }

  dispose(): void {
    this.glow.dispose();
  }
}

export class MemoryShots {
  private idx = -1;
  private lent: Era | null = null;
  private worldEra: Era | null = null;
  private fireworks: Fireworks | null = null;

  constructor(private readonly ctx: GameContext) {}

  get shot(): MemoryShot | null {
    return MEMORY_SHOTS[this.idx] ?? null;
  }

  /** Show memory i (−1: back to the present). */
  show(i: number): void {
    if (i === this.idx) return;
    const ctx = this.ctx;
    this.idx = i;
    this.fireworks?.dispose();
    this.fireworks = null;
    ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'off' } });
    const s = MEMORY_SHOTS[i];
    if (!s) {
      this.giveBack();
      return;
    }
    if (!this.lent) this.lent = ctx.era.current;
    if (this.worldEra !== s.era) {
      this.worldEra = s.era;
      ctx.world.setEra(s.era);
    }
    ctx.world.forest.invalidate();
    if (s.key === 'feuerwerk') {
      this.fireworks = new Fireworks(s.tx, ctx.world.heightAt(s.tx, s.tz), s.tz);
      ctx.scene.add(this.fireworks.glow.points);
    } else if (s.key === 'jagd') {
      // the pack in the fog of the Allee, facing you; one pair of eyes after another, the horn
      // (an arc round the camera, opening the way it looks — like the keep ending's eyes)
      const face = (-yawTo(s.x, s.z, s.tx, s.tz) * 180) / Math.PI;
      // nearer and quicker (playtest round 5: the captures showed snow and no hounds): seven hounds
      // stand in the fog 6 m off, all eyes open within two seconds
      ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'eyes', n: 7, x: s.x, z: s.z, r: 6, face, stagger: 0.22 } });
    }
  }

  /** The world's era back to what it was (before the card opens). */
  giveBack(): void {
    if (this.lent) {
      this.ctx.world.setEra(this.lent);
      this.ctx.world.forest.invalidate();
      this.lent = null;
      this.worldEra = null;
    }
  }

  /** The look of the current shot (null: none). */
  look(): EraLook | null {
    const s = this.shot;
    if (!s) return null;
    const L = structuredClone(ERA_LOOKS[s.era]);
    if (s.key === 'feuerwerk') {
      // the same summer, after dark
      L.sun = { ...L.sun, elevation: -8, intensity: 0.4, color: '#8ea0c8' };
      L.disc = 'none';
      L.sky = { ...L.sky, zenith: '#070a18', horizon: '#2a2440', below: '#120f14', clouds: 0.2, stars: 1 };
      L.ambient = { ...L.ambient, sky: '#3a4566', ground: '#1c1612', intensity: 0.55 };
      L.fog = { ...L.fog, color: '#1c1a26', sunColor: '#2a2436', density: 0.0009 };
      L.grade = { ...L.grade, exposure: 1.5, lift: '#05050a' };
      L.glow = { color: '#ffb060', intensity: 0.6 };
    }
    return L;
  }

  /** Camera for the shot, `u` 0..1 through it. */
  camera(u: number, reduced: boolean): void {
    const s = this.shot;
    if (!s) return;
    const ctx = this.ctx;
    const cam = ctx.camera;
    const yaw = yawTo(s.x, s.z, s.tx, s.tz);
    const k = reduced ? 0 : smooth(u);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const x = s.x + fx * s.dolly * k;
    const z = s.z + fz * s.dolly * k;
    const y = ctx.world.heightAt(x, z) + s.h;
    const ty = ctx.world.heightAt(s.tx, s.tz) + s.ty;
    const d = Math.hypot(s.tx - x, s.tz - z);
    cam.position.set(x, y, z);
    cam.rotation.set(Math.atan2(ty - y, d) * lerp(1, 0.92, k), yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  frame(dt: number): void {
    if (this.fireworks) {
      this.fireworks.frame(dt, this.ctx.settings.state.reducedFlash);
      this.fireworks.glow.commit(pxScale(this.ctx));
    }
  }

  dispose(): void {
    this.fireworks?.dispose();
    this.fireworks = null;
    if (this.idx >= 0) this.ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'off' } });
    this.idx = -1;
    this.giveBack();
  }
}
