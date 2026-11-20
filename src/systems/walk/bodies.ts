/**
 * Bodies for the walk system: the people API (kq-characters, `ctx.people`) — the primary path —
 * and, only when `ctx.people` is undefined (people system failed / not registered), cheap stand-ins — low-poly modern visitors built with the scenery Kit on the shared prop
 * material (world light, fog, one draw call for the body and one per leg, no shadows), legs
 * swinging with the distance walked. Good for 16 at once at every tier.
 */
import { Group, Mesh, type Scene, type ShaderMaterial } from 'three';
import { Kit, rng, tint } from '../scenery/kit';
import { propMaterial } from '../scenery/material';
import type { PeopleApi, PersonSpawnOpts } from '../people/types';
import type { Body, BodyClip, BodyFactory, BodySpawn } from './runtime';

// ---- the people API (kq-characters, src/systems/people/types.ts) -----------------------------

export type PeopleApiLike = Pick<PeopleApi, 'spawn' | 'specs'>;

/** `ctx.people` when the people system runs (undefined when it failed or is not registered). */
export function peopleOf(ctx: { people?: PeopleApi | undefined }): PeopleApiLike | null {
  const p = ctx.people;
  return p && typeof p.spawn === 'function' ? p : null;
}

export function peopleSpecs(api: PeopleApiLike): string[] | null {
  try {
    return [...api.specs()];
  } catch {
    return null;
  }
}

/**
 * A Body over a people-API person. The people system animates (locomotion from `setSpeed`) and
 * does its own distance LOD; we move `root` and turn with `face` (never root.rotation, never
 * lookAt: they would fight the person's own smooth turn). `play('walk' | 'run' | 'idle')` is left
 * out on purpose: locomotion follows the speed, and the npc system plays talk / idle in a
 * conversation.
 */
export function personBody(api: PeopleApiLike, o: BodySpawn): Body {
  const opts: PersonSpawnOpts = { x: o.x, z: o.z, y: o.y, yaw: o.yaw, look: 'solid', tier: o.tier, seed: o.seed, name: o.npc };
  if (o.speaker) opts.speaker = o.speaker;
  const p = api.spawn(o.spec, opts);
  let speed = -1;
  let yaw = Number.NaN;
  return {
    setPos: (x, y, z) => p.root.position.set(x, y, z),
    face: (v) => {
      if (Math.abs(v - yaw) < 1e-3) return;
      yaw = v;
      p.face(v);
    },
    setSpeed: (v) => {
      if (Math.abs(v - speed) < 0.02) return;
      speed = v;
      p.setSpeed(v);
    },
    play: (_clip: BodyClip) => {},
    setVisible: (on) => p.setVisible(on),
    dispose: () => p.dispose(),
  };
}

// ---- stand-ins ------------------------------------------------------------------------------

const SKIN = [0xf1c7a5, 0xe0ac84, 0xc68863, 0x9a6544, 0x6e4630];
const HAIR = [0x2a1d14, 0x4a3020, 0x7a5a36, 0xb89a6a, 0xd8d0c4, 0x1a1a1a];
const JACKET = [0x2f5d8a, 0xa43a2c, 0x3d6b45, 0xd9a336, 0x5a4a78, 0x2e3a40, 0xc7643a, 0x8a9aa6, 0xe8e2d4, 0x6b2f3a];
const TROUSERS = [0x2b3546, 0x3a3f48, 0x5c5246, 0x1f2328, 0x6d6a5f, 0x34506e];
const GUIDE_JACKET = 0x2f7a4a;

const STRIDE = 1.35;

interface Look {
  h: number;
  skin: number;
  hair: number;
  jacket: number;
  trousers: number;
  pack: boolean;
  hat: boolean;
}

function lookOf(o: BodySpawn): Look {
  const r = rng(o.seed || 1);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length) % a.length]!;
  const child = o.spec.startsWith('child.');
  return {
    h: child ? 1.25 : 1.58 + r() * 0.3,
    skin: pick(SKIN),
    hair: pick(HAIR),
    jacket: o.spec === 'guide' ? GUIDE_JACKET : tint(pick(JACKET), r, 0.1),
    trousers: pick(TROUSERS),
    pack: o.spec !== 'guide' && r() < 0.45,
    hat: o.spec !== 'guide' && r() < 0.25,
  };
}

/** Body (torso, arms, head, extras) facing −z, feet at the origin; legs separate. */
function torsoGeo(l: Look, guide: boolean): { body: Kit; leg: Kit; hip: number } {
  const s = l.h / 1.75;
  const hip = 0.86 * s;
  const k = new Kit();
  // torso, a little wider at the shoulders
  k.box(0.38 * s, 0.24 * s, 0.22 * s, 0, hip - 0.04 * s, 0, l.trousers);
  k.box(0.44 * s, 0.42 * s, 0.25 * s, 0, hip + 0.16 * s, 0, l.jacket);
  // arms hanging at the sides
  for (const sx of [-1, 1]) {
    k.box(0.11 * s, 0.56 * s, 0.12 * s, sx * 0.28 * s, hip + 0.03 * s, 0, l.jacket, [0, 0, sx * 0.06]);
    k.box(0.09 * s, 0.09 * s, 0.1 * s, sx * 0.3 * s, hip - 0.05 * s, 0, l.skin);
  }
  // neck, head, hair (the face looks to −z)
  k.cyl(0.06 * s, 0.065 * s, 0.08 * s, 0, hip + 0.58 * s, 0, l.skin);
  k.box(0.21 * s, 0.25 * s, 0.23 * s, 0, hip + 0.65 * s, 0, l.skin);
  k.box(0.23 * s, 0.09 * s, 0.25 * s, 0, hip + 0.85 * s, 0.01 * s, l.hair);
  k.box(0.23 * s, 0.17 * s, 0.06 * s, 0, hip + 0.7 * s, 0.1 * s, l.hair);
  // nose: the facing reads at a distance
  k.box(0.04 * s, 0.05 * s, 0.04 * s, 0, hip + 0.7 * s, -0.13 * s, l.skin);
  if (l.hat) k.cyl(0.15 * s, 0.15 * s, 0.05 * s, 0, hip + 0.9 * s, 0, 0x3a3a34, undefined, 10);
  if (l.pack) k.box(0.32 * s, 0.38 * s, 0.14 * s, 0, hip + 0.1 * s, 0.19 * s, tint(0x4a5a3a, rng(l.jacket), 0.3));
  if (guide) {
    // the tour guide's raised pennant on a short pole in the right hand
    k.pole(0.3 * s, hip, -0.05, 0.36 * s, hip + 1.2 * s, -0.08, 0.012, 0x3a3a3a, 5);
    k.box(0.02, 0.22, 0.3, 0.36 * s, hip + 0.98 * s, -0.24, 0xe8b530);
    // a lanyard badge on the chest
    k.box(0.08 * s, 0.1 * s, 0.01, 0.08 * s, hip + 0.22 * s, -0.13 * s, 0xf2f2ea);
  }
  const leg = new Kit();
  leg.box(0.14 * s, hip - 0.06 * s, 0.15 * s, 0, -hip + 0.06 * s, 0, l.trousers);
  leg.box(0.15 * s, 0.07 * s, 0.24 * s, 0, -hip, -0.04 * s, 0x2a2622);
  return { body: k, leg, hip };
}

class StandIn implements Body {
  readonly root = new Group();
  private readonly torso: Mesh;
  private readonly legs: Mesh[];
  private speed = 0;
  private phase = 0;
  private readonly hip: number;

  constructor(o: BodySpawn, mat: ShaderMaterial) {
    const l = lookOf(o);
    const g = torsoGeo(l, o.spec === 'guide');
    this.hip = g.hip;
    this.torso = new Mesh(g.body.build(), mat);
    const legGeo = g.leg.build();
    this.legs = [-1, 1].map((sx) => {
      const m = new Mesh(legGeo, mat);
      m.position.set(sx * 0.1 * (l.h / 1.75), g.hip, 0);
      return m;
    });
    this.root.add(this.torso, ...this.legs);
    this.root.name = `walk-body:${o.npc}`;
    this.root.position.set(o.x, o.y, o.z);
    this.root.rotation.y = o.yaw;
    this.phase = (o.seed % 100) / 16;
  }

  setPos(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }
  face(yaw: number): void {
    this.root.rotation.y = yaw;
  }
  setSpeed(mps: number): void {
    this.speed = mps;
  }
  play(_clip: BodyClip): void {
    // the leg swing follows the speed
  }
  setVisible(on: boolean): void {
    this.root.visible = on;
  }
  /** Legs swing with the distance covered; a slight bob. Skipped far away. */
  tick(dt: number, near: boolean): void {
    if (!this.root.visible) return;
    const v = this.speed;
    if (v < 0.05) {
      if (this.legs[0]!.rotation.x !== 0) for (const m of this.legs) m.rotation.x = 0;
      this.torso.position.y = 0;
      return;
    }
    if (!near) return;
    this.phase += (v * dt * Math.PI * 2) / STRIDE;
    const amp = Math.min(0.55, 0.28 + v * 0.1);
    const a = Math.sin(this.phase) * amp;
    this.legs[0]!.rotation.x = a;
    this.legs[1]!.rotation.x = -a;
    this.torso.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * (this.hip / 0.86);
  }
  dispose(): void {
    this.root.removeFromParent();
    this.torso.geometry.dispose();
    this.legs[0]!.geometry.dispose();
  }
}

/** The stand-in figures of the walk system: one parent group, one shared material. */
export class StandInPool {
  readonly group = new Group();
  private readonly mat = propMaterial();
  private readonly bodies = new Set<StandIn>();

  constructor(scene: Scene) {
    this.group.name = 'walk-standins';
    scene.add(this.group);
  }

  readonly factory: BodyFactory = (o) => {
    const b = new StandIn(o, this.mat);
    this.group.add(b.root);
    this.bodies.add(b);
    const dispose = b.dispose.bind(b);
    b.dispose = () => {
      this.bodies.delete(b);
      dispose();
    };
    return b;
  };

  get count(): number {
    return this.bodies.size;
  }

  tick(dt: number, cam: { x: number; z: number }): void {
    for (const b of this.bodies) {
      const p = b.root.position;
      b.tick(dt, Math.hypot(p.x - cam.x, p.z - cam.z) < 60);
    }
  }

  dispose(): void {
    for (const b of [...this.bodies]) b.dispose();
    this.group.removeFromParent();
    this.mat.dispose();
  }
}
