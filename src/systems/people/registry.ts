/**
 * The people registry: `PeopleApi` over whatever body implementation the factory builds (the
 * stand-in, or an authored MPFB body for the specs that have one). It resolves spec ids (unknown → the generic extra and
 * one warning per id), grounds spawns, hands out unique ids, and once per frame runs the distance
 * LOD and every person's tick. No three.js beyond the persons' `root` positions; unit-tested with a
 * fake factory in tests/people.test.ts.
 */
import { lodFor, type AnimRate } from './locomotion';
import { type PersonSpec, SPEC_IDS, resolveSpec } from './specs';
import { PEOPLE_LOD, type PeopleApi, type Person, type PersonSpawnOpts } from './types';

/** What the people system drives besides the contract (every body implementation provides it). */
export interface PersonRuntime extends Person {
  readonly name: string;
  readonly speaker: string | undefined;
  /** `dist`: metres from the camera (the mesh LOD of an authored body). */
  tick(f: { dt: number; rate: AnimRate; hidden: boolean; reducedMotion: boolean; reducedFlash: boolean; dist?: number }): void;
  drawStats(): { tris: number; calls: number };
}

export interface PersonFactoryArgs {
  id: string;
  specId: string;
  spec: PersonSpec;
  opts: PersonSpawnOpts & { y: number };
  /** Call once from the person's `dispose()`: it leaves the registry. */
  onDispose: (p: PersonRuntime) => void;
}

export type PersonFactory<P extends PersonRuntime = PersonRuntime> = (a: PersonFactoryArgs) => P;

export interface PeopleStats {
  count: number;
  /** Drawn now (not hidden by the LOD or setVisible, the body in). */
  visible: number;
  /** Approximate triangles and draw calls of the drawn people (frustum culling not counted; a ghost draws twice). */
  tris: number;
  drawCalls: number;
  lod: Record<AnimRate | 'hidden', number>;
}

export class PeopleRegistry<P extends PersonRuntime = PersonRuntime> implements PeopleApi {
  private readonly people = new Map<string, P>();
  private readonly lods = new Map<string, AnimRate | 'hidden'>();
  private readonly warned = new Set<string>();
  private n = 0;

  constructor(
    private readonly make: PersonFactory<P>,
    private readonly ground: (x: number, z: number) => number,
    private readonly warn: (msg: string) => void = (m) => console.warn(m),
  ) {}

  spawn(specId: string, o: PersonSpawnOpts): P {
    const { spec, known } = resolveSpec(specId);
    if (!known && !this.warned.has(specId)) {
      this.warned.add(specId);
      this.warn(`[people] unknown spec id '${specId}': a generic extra stands in`);
    }
    let x = o.x;
    let z = o.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      this.warn(`[people] spawn '${specId}' at a non-finite x/z (${x}, ${z}): placed at 0, 0`);
      x = Number.isFinite(x) ? x : 0;
      z = Number.isFinite(z) ? z : 0;
    }
    const y = Number.isFinite(o.y) ? (o.y as number) : this.ground(x, z);
    const id = `${specId}#${++this.n}`;
    const p = this.make({
      id,
      specId,
      spec,
      opts: { ...o, x, z, y: Number.isFinite(y) ? y : 0 },
      onDispose: (q) => {
        this.people.delete(q.id);
        this.lods.delete(q.id);
      },
    });
    this.people.set(id, p);
    return p;
  }

  get(id: string): P | undefined {
    return this.people.get(id);
  }

  list(): readonly P[] {
    return [...this.people.values()];
  }

  clear(): void {
    for (const p of [...this.people.values()]) p.dispose();
    this.people.clear();
    this.lods.clear();
  }

  specs(): readonly string[] {
    return SPEC_IDS;
  }

  bySpeaker(speaker: string): P | undefined {
    let hit: P | undefined;
    for (const p of this.people.values()) if (p.speaker === speaker) hit = p;
    return hit;
  }

  /** Once per rendered frame: the distance LOD (from the camera) and every person's tick. */
  tick(dt: number, cam: { x: number; y: number; z: number }, env: { reducedMotion: boolean; reducedFlash: boolean; drawLimit?: number }): void {
    for (const p of [...this.people.values()]) {
      const r = p.root.position;
      const d = Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z);
      const limit = env.drawLimit ?? PEOPLE_LOD.drawLimit;
      const l = lodFor(d, this.lods.get(p.id) === 'hidden' ? Math.max(0, limit - PEOPLE_LOD.drawReturnMargin) : limit);
      this.lods.set(p.id, l.hidden ? 'hidden' : l.rate);
      p.tick({ dt, rate: l.rate, hidden: l.hidden, reducedMotion: env.reducedMotion, reducedFlash: env.reducedFlash, dist: d });
    }
  }

  stats(): PeopleStats {
    const s: PeopleStats = { count: this.people.size, visible: 0, tris: 0, drawCalls: 0, lod: { full: 0, slow: 0, frozen: 0, hidden: 0 } };
    for (const p of this.people.values()) {
      const l = this.lods.get(p.id);
      if (l) s.lod[l]++;
      const d = p.drawStats();
      if (p.root.visible && d.calls > 0) s.visible++;
      s.tris += d.tris;
      s.drawCalls += d.calls;
    }
    return s;
  }
}
