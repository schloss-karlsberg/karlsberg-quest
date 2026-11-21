/**
 * Era prewarm registry (M-17 follow-up). Systems that build objects only once an era is active
 * (on `era:change`: markers, ambient layers, set workers and signs, bottles, boards, tripods)
 * register a sample of their materials here, in one line where they build them:
 *
 *   registerEraMaterials('flaschen.bottle', '*', () => buildBottle(true, 0).group);
 *
 * The idle era-shift warm-up (warm.ts) draws one-triangle stand-ins of the samples for the era
 * the next shift goes to, so the programs exist before the switch. The registry keeps the samples
 * alive: a system that disposes its materials at the switch would otherwise release the program
 * (three deletes a program when its last material is disposed), and the new era's identical
 * materials would compile again in the shift's middle frame.
 *
 * A sample is a Material (drawn on a tiny triangle), an Object3D (its meshes and points are drawn
 * with their own geometry layout), a list of those, or a factory called lazily, once per era.
 */
import { BufferAttribute, BufferGeometry, type Material, Mesh, type Object3D } from 'three';
import type { Era } from '../../../core/era';

export type PrewarmItem = Material | Object3D;
export type PrewarmItems = PrewarmItem | readonly PrewarmItem[] | null | undefined;
export type PrewarmSource = PrewarmItems | ((era: Era) => PrewarmItems);
export type PrewarmEras = Era | readonly Era[] | '*';

export interface PrewarmOptions {
  /** Called with the items a factory built when the entry is removed (default: nothing). */
  dispose?: (items: Object3D[]) => void;
}

interface Entry {
  eras: PrewarmEras;
  source: PrewarmSource;
  opts: PrewarmOptions;
  built: Map<Era, Object3D[]>;
}

let triangle: BufferGeometry | null = null;
/** One small triangle with position, normal and uv (bare materials are drawn on it). */
function sampleTriangle(): BufferGeometry {
  if (triangle) return triangle;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  triangle = g;
  return g;
}

function isMaterial(v: PrewarmItem): v is Material {
  return (v as Material).isMaterial === true;
}

function toObjects(items: PrewarmItems): Object3D[] {
  if (!items) return [];
  const list = (Array.isArray(items) ? items : [items]) as PrewarmItem[];
  return list.map((it) => {
    if (!isMaterial(it)) return it;
    const m = new Mesh(sampleTriangle(), it);
    m.name = `prewarm:${it.name || it.type}`;
    return m;
  });
}

function covers(eras: PrewarmEras, era: Era): boolean {
  return eras === '*' || eras === era || (Array.isArray(eras) && eras.includes(era));
}

export class EraPrewarmRegistry {
  private readonly entries = new Map<string, Entry>();

  /**
   * Register (or replace, by `key`) the materials a system builds for `eras`. Returns a function
   * that removes the entry again.
   */
  register(key: string, eras: PrewarmEras, source: PrewarmSource, opts: PrewarmOptions = {}): () => void {
    this.remove(key);
    const entry: Entry = { eras, source, opts, built: new Map() };
    this.entries.set(key, entry);
    return () => {
      if (this.entries.get(key) === entry) this.remove(key);
    };
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * The sample objects for `era`, world matrices updated. Factories run on the first call per era
   * and their result is kept (so the programs stay alive).
   */
  objects(era: Era): Object3D[] {
    const out: Object3D[] = [];
    for (const [key, e] of this.entries) {
      if (!covers(e.eras, era)) continue;
      let objs = e.built.get(era);
      if (!objs) {
        try {
          objs = toObjects(typeof e.source === 'function' ? e.source(era) : e.source);
        } catch (err) {
          console.warn(`[prewarm] ${key} failed`, err);
          objs = [];
        }
        for (const o of objs) o.updateMatrixWorld(true);
        e.built.set(era, objs);
      }
      out.push(...objs);
    }
    return out;
  }

  /** Remove one entry (its factory output goes to its `dispose` option). */
  remove(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    if (typeof e.source !== 'function' || !e.opts.dispose) return;
    const all = [...e.built.values()].flat();
    if (all.length) e.opts.dispose(all);
  }

  /** Remove everything. */
  clear(): void {
    for (const key of [...this.entries.keys()]) this.remove(key);
  }
}

/** The game's registry (systems register, the era-shift warm-up drains it). */
export const eraPrewarm = new EraPrewarmRegistry();

/** Register a sample of the materials a system builds for `eras` (see the module comment). */
export function registerEraMaterials(key: string, eras: PrewarmEras, source: PrewarmSource, opts?: PrewarmOptions): () => void {
  return eraPrewarm.register(key, eras, source, opts);
}
