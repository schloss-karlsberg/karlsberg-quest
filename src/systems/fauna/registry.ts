/**
 * The fauna registry: `FaunaApi` over whatever body implementation the factory builds (the
 * stand-in today, the authored meshes later). It resolves spec ids (unknown → the generic dog and
 * one warning per id), grounds spawns, hands out unique ids, and once per frame runs the distance
 * LOD (`keepAlive` animals: full rate, never hidden by distance) and every animal's tick. No
 * three.js beyond the animals' `root` positions; unit-tested with a fake factory in
 * tests/fauna.test.ts. The people registry's twin.
 */
import { type AnimRate, lodFor } from './locomotion';
import { type FaunaSpec, FAUNA_SPEC_IDS, resolveFaunaSpec } from './specs';
import { type Animal, type AnimalSpawnOpts, FAUNA_LOD, type FaunaApi, type FaunaSpecId } from './types';

/** What the fauna system drives besides the contract (every body implementation provides it). */
export interface AnimalRuntime extends Animal {
  readonly name: string;
  readonly keepAlive: boolean;
  tick(f: { dt: number; rate: AnimRate; hidden: boolean; reducedMotion: boolean }): void;
  drawStats(): { tris: number; calls: number };
}

export interface AnimalFactoryArgs {
  id: string;
  specId: string;
  spec: FaunaSpec;
  opts: AnimalSpawnOpts & { y: number };
  /** Call once from the animal's `dispose()`: it leaves the registry. */
  onDispose: (a: AnimalRuntime) => void;
}

export type AnimalFactory<A extends AnimalRuntime = AnimalRuntime> = (a: AnimalFactoryArgs) => A;

export interface FaunaStats {
  count: number;
  /** Drawn now (not hidden by the LOD or setVisible, the body in). */
  visible: number;
  /** Approximate triangles and draw calls of the drawn animals (frustum culling not counted). */
  tris: number;
  drawCalls: number;
  lod: Record<AnimRate | 'hidden', number>;
}

export class FaunaRegistry<A extends AnimalRuntime = AnimalRuntime> implements FaunaApi {
  private readonly animals = new Map<string, A>();
  private readonly lods = new Map<string, AnimRate | 'hidden'>();
  private readonly warned = new Set<string>();
  private n = 0;

  constructor(
    private readonly make: AnimalFactory<A>,
    private readonly ground: (x: number, z: number) => number,
    private readonly warn: (msg: string) => void = (m) => console.warn(m),
  ) {}

  spawn(specId: FaunaSpecId, o: AnimalSpawnOpts): A {
    const { spec, known } = resolveFaunaSpec(specId);
    if (!known && !this.warned.has(specId)) {
      this.warned.add(specId);
      this.warn(`[fauna] unknown spec id '${specId}': a generic dog stands in`);
    }
    let x = o.x;
    let z = o.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      this.warn(`[fauna] spawn '${specId}' at a non-finite x/z (${x}, ${z}): placed at 0, 0`);
      x = Number.isFinite(x) ? x : 0;
      z = Number.isFinite(z) ? z : 0;
    }
    const y = Number.isFinite(o.y) ? (o.y as number) : this.ground(x, z);
    const id = `${specId}#${++this.n}`;
    const a = this.make({
      id,
      specId,
      spec,
      opts: { ...o, x, z, y: Number.isFinite(y) ? y : 0 },
      onDispose: (q) => {
        this.animals.delete(q.id);
        this.lods.delete(q.id);
      },
    });
    this.animals.set(id, a);
    return a;
  }

  get(id: string): A | undefined {
    return this.animals.get(id);
  }

  list(): readonly A[] {
    return [...this.animals.values()];
  }

  clear(): void {
    for (const a of [...this.animals.values()]) a.dispose();
    this.animals.clear();
    this.lods.clear();
  }

  specs(): readonly string[] {
    return FAUNA_SPEC_IDS;
  }

  /** Once per rendered frame: the distance LOD (from the camera) and every animal's tick. */
  tick(dt: number, cam: { x: number; y: number; z: number }, env: { reducedMotion: boolean; drawLimit?: number }): void {
    for (const a of [...this.animals.values()]) {
      const r = a.root.position;
      const d = Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z);
      const l = a.keepAlive ? { rate: 'full' as const, hidden: false } : lodFor(d, env.drawLimit ?? FAUNA_LOD.drawLimit, FAUNA_LOD);
      this.lods.set(a.id, l.hidden ? 'hidden' : l.rate);
      a.tick({ dt, rate: l.rate, hidden: l.hidden, reducedMotion: env.reducedMotion });
    }
  }

  stats(): FaunaStats {
    const s: FaunaStats = { count: this.animals.size, visible: 0, tris: 0, drawCalls: 0, lod: { full: 0, slow: 0, frozen: 0, hidden: 0 } };
    for (const a of this.animals.values()) {
      const l = this.lods.get(a.id);
      if (l) s.lod[l]++;
      const d = a.drawStats();
      if (a.root.visible && d.calls > 0) s.visible++;
      s.tris += d.tris;
      s.drawCalls += d.calls;
    }
    return s;
  }
}
