/**
 * Fauna contract v0 (src/systems/fauna, docs/ARCHITECTURE.md "fauna"): the pure gait / pose / clip
 * logic, the spec table and its paint, the unknown-spec fallback, the registry and its LOD,
 * contract conformance of the stand-in (type level and at run time, with the real CC0 wolf and
 * horse loaded in node): sizes, measured strides, the clip map and its fallbacks, the poses checked
 * against the ground, bounds, look-at, eye glints and disposal. These node tests stand in for the
 * visual check of the stand-ins.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Group, type Mesh, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { LoadedModel } from '../src/assets/loader';
import { ANIMAL_HEAD, carriageFor, gaitsFor, kneePoint, resolveAnimalClip, shotEnvelope } from '../src/systems/fauna/locomotion';
import { type AnimalFactoryArgs, type AnimalRuntime, FaunaRegistry } from '../src/systems/fauna/registry';
import { FAUNA_SPECS, FAUNA_SPEC_IDS, GENERIC_DOG, type PaintVertex, paintColour, patchNoise, resolveFaunaSpec } from '../src/systems/fauna/specs';
import { POSES, RUN_STRIDE_PER_LENGTH, STANDIN_CLIPS, type StandInLoader, StandInAnimal, planClip, standinSupported } from '../src/systems/fauna/standin';
import {
  ANIMAL_CLIPS,
  type Animal,
  type AnimalClip,
  CLIP_FALLBACK,
  FAUNA_BUDGET,
  FAUNA_LOD,
  type FaunaApi,
  ONE_SHOTS,
} from '../src/systems/fauna/types';
import { HUMAN_GAITS, locoWeights } from '../src/systems/people/locomotion';
import { PEOPLE_LOD } from '../src/systems/people/types';

const PI = Math.PI;
const TICK = { rate: 'full' as const, hidden: false, reducedMotion: false };

// ---- pure logic --------------------------------------------------------------------------------

describe('gaits and the people helpers', () => {
  it('gait thresholds follow the spec speeds; weights sum to 1 and are monotonic', () => {
    const diane = gaitsFor({ walk: 1.4, run: 7 });
    expect(diane.runFrom).toBeCloseTo(2.1);
    expect(diane.runFrom + diane.runSpan).toBeCloseTo(3.5);
    expect(locoWeights(1.4, diane).walk).toBeGreaterThan(0.99);
    expect(locoWeights(3.6, diane).run).toBeGreaterThan(0.99);
    const bijou = gaitsFor({ walk: 1.2, run: 5 });
    expect(bijou.runFrom + bijou.runSpan).toBeCloseTo(2.75);
    let prev = locoWeights(0, bijou);
    for (let s = 0.05; s <= 9; s += 0.05) {
      const w = locoWeights(s, bijou);
      expect(w.idle + w.walk + w.run).toBeCloseTo(1, 9);
      expect(w.idle).toBeLessThanOrEqual(prev.idle + 1e-12);
      expect(w.run).toBeGreaterThanOrEqual(prev.run - 1e-12);
      prev = w;
    }
    // nonsense speeds fall back to something sane
    const bad = gaitsFor({ walk: Number.NaN, run: -1 });
    expect(bad.runFrom).toBeGreaterThan(bad.walkFrom);
    // the people's defaults are unchanged by the generalisation
    expect(HUMAN_GAITS).toEqual({ walkFrom: 0.08, walkSpan: 0.55, runFrom: 2.4, runSpan: 1.5 });
    expect(locoWeights(4.5)).toEqual(locoWeights(4.5, HUMAN_GAITS));
  });

  it('an animal turns its head further than a person', () => {
    expect(ANIMAL_HEAD.yaw).toBeGreaterThan(1.05);
    expect(ANIMAL_HEAD.pitchDown).toBeGreaterThan(0.3);
  });
});

describe('pose solver helpers', () => {
  it('kneePoint keeps the segment lengths, bends toward the pole, clamps out-of-reach targets', () => {
    const root = { x: 0, y: 2, z: 0 };
    const t = { x: 0, y: 0.5, z: 0.6 };
    for (const pole of [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]) {
      const { knee, end } = kneePoint(root, t, 1, 1.2, pole);
      const d = (a: typeof root, b: typeof root) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      expect(d(root, knee)).toBeCloseTo(1, 6);
      expect(d(knee, end)).toBeCloseTo(1.2, 6);
      expect(d(end, t)).toBeLessThan(1e-6);
      // the knee lies on the pole's side of the root → target line
      const side = (knee.z - root.z) * (t.y - root.y) - (knee.y - root.y) * (t.z - root.z);
      const want = pole.z * (t.y - root.y) - pole.y * (t.z - root.z);
      expect(Math.sign(side)).toBe(Math.sign(want));
    }
    // too far: the limb straightens toward the target; too close: it folds fully
    const far = kneePoint(root, { x: 0, y: -5, z: 0 }, 1, 1.2, { x: 0, y: 0, z: 1 });
    expect(far.end.y).toBeCloseTo(2 - 2.2, 4);
    const near = kneePoint(root, { x: 0, y: 1.99, z: 0 }, 1, 1.2, { x: 0, y: 0, z: 1 });
    expect(Math.hypot(near.end.x, near.end.y - 2, near.end.z)).toBeCloseTo(0.2, 4);
    // degenerate pole (along the line) still gives a finite knee
    const deg = kneePoint(root, { x: 0, y: 0.5, z: 0 }, 1, 1, { x: 0, y: -1, z: 0 });
    expect(Number.isFinite(deg.knee.y) && Number.isFinite(deg.knee.z)).toBe(true);
  });

  it('carriageFor lifts the eyes to the target height (and clamps)', () => {
    const base = { y: 1, z: 0 };
    const eye = { y: 1.5, z: 0.866 }; // 1 m from the base, 30° up
    const up = carriageFor(base, eye, 1 + Math.sin(PI / 4));
    expect(up).toBeCloseTo(PI / 4 - PI / 6, 4);
    expect(carriageFor(base, eye, 1.5)).toBeCloseTo(0, 4);
    expect(carriageFor(base, eye, 99)).toBeLessThanOrEqual(0.6);
    expect(carriageFor(base, eye, -99)).toBeGreaterThanOrEqual(-0.3);
    expect(carriageFor(base, base, 2)).toBe(0);
  });

  it('shotEnvelope rises, decays and ends', () => {
    expect(shotEnvelope(0, 1)).toBe(0);
    expect(shotEnvelope(0.06, 1)).toBeCloseTo(1);
    expect(shotEnvelope(0.5, 1)).toBeGreaterThan(0);
    expect(shotEnvelope(0.5, 1)).toBeLessThan(1);
    expect(shotEnvelope(1, 1)).toBe(0);
    expect(shotEnvelope(Number.NaN, 1)).toBe(0);
  });
});

describe('clips and fallbacks', () => {
  it('the chain ends in idle (no cycles); graze → sniff, sleep → lie, bark → alert', () => {
    for (const c of ANIMAL_CLIPS) {
      let k: AnimalClip | null = c;
      for (let i = 0; i < 12 && k; i++) k = CLIP_FALLBACK[k];
      expect(k).toBeNull();
      expect(resolveAnimalClip(c, ANIMAL_CLIPS)).toBe(c);
      expect(resolveAnimalClip(c, ['idle'])).toBe('idle');
    }
    expect(resolveAnimalClip('graze', ['idle', 'sniff'])).toBe('sniff');
    expect(resolveAnimalClip('sleep', ['idle', 'lie'])).toBe('lie');
    expect(resolveAnimalClip('bark', ['idle', 'alert'])).toBe('alert');
    expect(resolveAnimalClip('run', ['idle', 'walk'])).toBe('walk');
    expect(resolveAnimalClip('shake', [])).toBe('idle');
    expect([...ONE_SHOTS].sort()).toEqual(['bark', 'shake']);
  });

  it('the stand-in clip map: what each species really has, and what plays for the rest', () => {
    expect(standinSupported('dog')).toEqual(['idle', 'walk', 'run', 'sniff', 'alert', 'sit', 'lie', 'sleep']);
    expect(standinSupported('deer')).toEqual(['idle', 'walk', 'run', 'graze', 'sniff', 'alert', 'lie', 'sleep']);
    // a dog's graze is its sniff (the contract's rule); bark / shake are stand-in looks of their own
    expect(planClip('dog', 'graze')).toBe('sniff');
    expect(planClip('dog', 'bark')).toBe('bark');
    expect(STANDIN_CLIPS.dog.bark!.native).toBe(false);
    expect(STANDIN_CLIPS.dog.shake!.native).toBe(false);
    // a deer has no sit / bark / shake: idle / alert / idle
    expect(planClip('deer', 'sit')).toBe('idle');
    expect(planClip('deer', 'bark')).toBe('alert');
    expect(planClip('deer', 'shake')).toBe('idle');
    for (const sp of ['dog', 'deer'] as const)
      for (const c of ANIMAL_CLIPS) {
        const p = STANDIN_CLIPS[sp][planClip(sp, c)];
        expect(p).toBeTruthy();
        expect(p!.kind).toBe(ONE_SHOTS.has(planClip(sp, c)) ? 'shot' : 'loop');
        if (p!.pose) expect(POSES[sp][p!.pose]).toBeTruthy();
      }
  });
});

// ---- the contract's numbers and the spec table -------------------------------------------------

describe('spec table v0', () => {
  it('LOD and budget numbers match the contract (slow band shared with people)', () => {
    expect(FAUNA_LOD).toMatchObject({ fullRate: 15, slowRate: 40, slowHz: 10, drawLimit: 60, lod1: 15, lod1Ratio: 0.5 });
    // fauna's full-rate band stays 15 m; the people band is 25 m (trailing tour camera), so only slowRate is shared
    expect(FAUNA_LOD.slowRate).toBe(PEOPLE_LOD.slowRate);
    expect(FAUNA_BUDGET).toEqual({ featured: { tris: 8000, drawCalls: 2 } });
  });

  it('has exactly the provisional ids with the contract numbers', () => {
    expect([...FAUNA_SPEC_IDS]).toEqual(['reh.ricke', 'reh.kitz', 'dog.diane', 'dog.bijou']);
    const by = (id: string) => resolveFaunaSpec(id).spec;
    expect(by('reh.ricke')).toMatchObject({ species: 'deer', height: 0.75, length: 1.15, radius: 0.35, headHeight: 0.95, speeds: { walk: 1.2, run: 8 } });
    expect(by('reh.kitz')).toMatchObject({ species: 'deer', height: 0.68, length: 1.05, radius: 0.32, headHeight: 0.86 });
    expect(by('dog.diane')).toMatchObject({ species: 'dog', height: 0.58, length: 0.95, radius: 0.3, headHeight: 0.62, speeds: { walk: 1.4, run: 7 } });
    expect(by('dog.bijou')).toMatchObject({ species: 'dog', height: 0.32, length: 0.55, radius: 0.2, headHeight: 0.36, speeds: { walk: 1.2, run: 5 } });
    expect(by('reh.ricke').model).toBe('characters.creature.horse');
    expect(by('dog.bijou').model).toBe('characters.creature.wolf');
    for (const s of FAUNA_SPECS) expect(s.speeds.run).toBeGreaterThan(s.speeds.walk);
    expect(resolveFaunaSpec('fox.1')).toEqual({ spec: GENERIC_DOG, known: false });
  });

  it('paint: the roe has a white rump and NO spots (both), Diane a liver head and patches', () => {
    const v = (o: Partial<PaintVertex>): PaintVertex => ({ slot: 'Main', bone: 'Torso', fy: 0.8, fz: 0.5, ax: 1, px: 0.3, py: 0.8, pz: 0, ...o });
    for (const id of ['reh.ricke', 'reh.kitz']) {
      const s = resolveFaunaSpec(id).spec;
      expect(s.paint!.some((r) => r.patches !== undefined)).toBe(false); // no spots on the fawn either
      expect(paintColour(s, v({ fz: 0.02, fy: 0.8 }))).toBe(0xece6da); // rump patch
      expect(paintColour(s, v({}))).toBe(s.palette.Main); // grey flank
      expect(s.hideSlots).toContain('Hair'); // no mane, no horse tail
    }
    const d = resolveFaunaSpec('dog.diane').spec;
    expect(paintColour(d, v({ bone: 'Head', fy: 1.0 }))).toBe(0x5b3322);
    const flank = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => paintColour(d, v({ fy: 0.7, px: 0.3, py: 0.7, pz: i * 0.13 - 0.6 })));
    expect(new Set(flank).size).toBe(2); // white and liver along the flank
    expect(paintColour(d, v({ slot: 'Nose' }))).toBe(d.palette.Nose);
    for (let i = 0; i < 200; i++) {
      const n = patchNoise(i * 0.37, i * 0.11, -i * 0.23, 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    expect(patchNoise(1.3, 2.1, 0.4, 5)).toBe(patchNoise(1.3, 2.1, 0.4, 5));
  });
});

// ---- the registry (fake bodies) ----------------------------------------------------------------

class FakeAnimal implements AnimalRuntime {
  readonly root = new Group();
  readonly info: Animal['info'];
  readonly ready = Promise.resolve(true);
  readonly name: string;
  readonly keepAlive: boolean;
  readonly specId: string;
  readonly id: string;
  ticks: { rate: string; hidden: boolean }[] = [];
  disposed = false;
  constructor(private readonly a: AnimalFactoryArgs) {
    this.id = a.id;
    this.specId = a.specId;
    this.name = a.opts.name ?? a.specId;
    this.keepAlive = a.opts.keepAlive === true;
    const s = a.spec;
    this.info = { specId: a.specId, length: s.length, height: s.height, radius: s.radius, headHeight: s.headHeight, speeds: s.speeds, clips: ['idle'] };
    this.root.position.set(a.opts.x, a.opts.y, a.opts.z);
  }
  setSpeed(): void {}
  play(): void {}
  face(): void {}
  lookAt(): void {}
  headWorld(out: { x: number; y: number; z: number }): void {
    out.x = this.root.position.x;
    out.y = this.root.position.y + this.info.headHeight;
    out.z = this.root.position.z;
  }
  setEyeShine(): void {}
  setVisible(v: boolean): void {
    this.root.visible = v;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.a.onDispose(this);
  }
  tick(f: { rate: string; hidden: boolean }): void {
    this.ticks.push({ rate: f.rate, hidden: f.hidden });
    this.root.visible = !f.hidden;
  }
  drawStats() {
    return this.root.visible ? { tris: 2000, calls: 4 } : { tris: 0, calls: 0 };
  }
}

function fakeRegistry() {
  const warn = vi.fn();
  const reg = new FaunaRegistry<FakeAnimal>((a) => new FakeAnimal(a), (x, z) => 100 + x * 0.01 + z * 0.001, warn);
  return { reg, warn };
}

describe('registry', () => {
  it('an unknown spec id is a generic dog with one warning per id', () => {
    const { reg, warn } = fakeRegistry();
    const a = reg.spawn('fox.red', { x: 1, z: 2 });
    const b = reg.spawn('fox.red', { x: 3, z: 4 });
    reg.spawn('boar', { x: 0, z: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain('fox.red');
    expect(a.specId).toBe('fox.red');
    expect(a.info.height).toBe(GENERIC_DOG.height);
    expect(a.info.radius).toBe(GENERIC_DOG.radius);
    expect(a.id).not.toBe(b.id);
    reg.spawn('dog.diane', { x: 0, z: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('grounds spawns without y, keeps a given y, guards non-finite x/z, unique ids', () => {
    const { reg, warn } = fakeRegistry();
    const a = reg.spawn('reh.ricke', { x: 100, z: 200 });
    expect(a.root.position.y).toBeCloseTo(100 + 1 + 0.2);
    const b = reg.spawn('reh.ricke', { x: 100, z: 200, y: 7 });
    expect(b.root.position.y).toBe(7);
    const c = reg.spawn('reh.kitz', { x: Number.NaN, z: 3 });
    expect(c.root.position.x).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(reg.specs()).toBe(FAUNA_SPEC_IDS);
  });

  it('get / list / dispose / clear', () => {
    const { reg } = fakeRegistry();
    const a = reg.spawn('dog.diane', { x: 0, z: 0 });
    const b = reg.spawn('dog.bijou', { x: 0, z: 0 });
    expect(reg.get(a.id)).toBe(a);
    expect(reg.list()).toEqual([a, b]);
    a.dispose();
    expect(reg.get(a.id)).toBeUndefined();
    reg.clear();
    expect(b.disposed).toBe(true);
    expect(reg.list()).toEqual([]);
  });

  it('tick runs the distance LOD from the camera; keepAlive ignores it; stats count what is drawn', () => {
    const { reg } = fakeRegistry();
    const near = reg.spawn('dog.diane', { x: 5, z: 0, y: 0 });
    const mid = reg.spawn('dog.bijou', { x: 30, z: 0, y: 0 });
    const far = reg.spawn('reh.ricke', { x: 50, z: 0, y: 0 });
    const gone = reg.spawn('reh.kitz', { x: 80, z: 0, y: 0 });
    const star = reg.spawn('reh.ricke', { x: 100, z: 0, y: 0, keepAlive: true });
    reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, { reducedMotion: false });
    expect(near.ticks[0]).toEqual({ rate: 'full', hidden: false });
    expect(mid.ticks[0]).toEqual({ rate: 'slow', hidden: false });
    expect(far.ticks[0]).toEqual({ rate: 'frozen', hidden: false });
    expect(gone.ticks[0]).toEqual({ rate: 'frozen', hidden: true });
    expect(star.ticks[0]).toEqual({ rate: 'full', hidden: false });
    expect(reg.stats()).toEqual({ count: 5, visible: 4, tris: 8000, drawCalls: 16, lod: { full: 2, slow: 1, frozen: 1, hidden: 1 } });
  });
});

// ---- contract conformance ----------------------------------------------------------------------

describe('contract conformance', () => {
  it('type level: the stand-in is an Animal, the registry a FaunaApi', () => {
    expectTypeOf<StandInAnimal>().toExtend<Animal>();
    expectTypeOf<StandInAnimal>().toExtend<AnimalRuntime>();
    expectTypeOf<FaunaRegistry<StandInAnimal>>().toExtend<FaunaApi>();
    expectTypeOf<FaunaApi['spawn']>().returns.toEqualTypeOf<Animal>();
    expectTypeOf<Animal['info']['clips']>().toEqualTypeOf<readonly AnimalClip[]>();
    expectTypeOf<Parameters<FaunaApi['spawn']>[0]>().toExtend<string>();
    expectTypeOf<'reh.ricke'>().toExtend<Parameters<FaunaApi['spawn']>[0]>();
  });

  it('the handle is usable before the mesh is in; a failed load is a capsule and ready → false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let fail: (e: unknown) => void = () => {};
    const loader: StandInLoader = { model: () => new Promise((_, rej) => (fail = rej)), peek: () => null };
    const reg = new FaunaRegistry<StandInAnimal>((a) => new StandInAnimal(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
    const a = reg.spawn('reh.ricke', { x: 1, z: 2, yaw: 0.5, name: 'Ricke' });
    expect(a.root.visible).toBe(false);
    expect(a.root.position.toArray()).toEqual([1, 0, 2]);
    expect(a.root.rotation.y).toBeCloseTo(0.5);
    expect(a.info).toMatchObject({ specId: 'reh.ricke', height: 0.75, length: 1.15, radius: 0.35, headHeight: 0.95, speeds: { walk: 1.2, run: 8 } });
    expect(Object.isFrozen(a.info)).toBe(true);
    // headWorld before the body: the root plus the eye height, a little forward
    const h = { x: 0, y: 0, z: 0 };
    a.headWorld(h);
    expect(h.y).toBeCloseTo(0.95);
    // every call works before ready
    a.setSpeed(1.2);
    a.play('graze');
    a.play('bark');
    a.face(-PI / 2);
    a.lookAt({ x: 0, y: 1, z: 0 });
    a.lookAt(null);
    a.setEyeShine(1);
    a.setVisible(true);
    reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, TICK);
    fail(new Error('offline'));
    expect(await a.ready).toBe(false);
    expect(a.state().fallback).toBe(true);
    expect(a.root.visible).toBe(true);
    expect(a.drawStats().calls).toBe(1);
    for (let i = 0; i < 90; i++) reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, TICK);
    expect(a.root.rotation.y).toBeCloseTo(-PI / 2, 2);
    a.dispose();
    expect(reg.list()).toEqual([]);
    expect(a.root.parent).toBeNull();
    warn.mockRestore();
  });

  it('disposed before the model arrives: ready → false, nothing built', async () => {
    let ok: (m: LoadedModel) => void = () => {};
    const loader: StandInLoader = { model: () => new Promise((res) => (ok = res)), peek: () => null };
    const reg = new FaunaRegistry<StandInAnimal>((a) => new StandInAnimal(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
    const a = reg.spawn('dog.diane', { x: 0, z: 0 });
    a.dispose();
    ok(await loadModel('wolf.glb'));
    expect(await a.ready).toBe(false);
    expect(a.bodyRoot).toBeNull();
  });
});

// ---- the stand-in on the real CC0 models (node, no GPU) ----------------------------------------

const models = new Map<string, Promise<LoadedModel>>();
function loadModel(file: string): Promise<LoadedModel> {
  let p = models.get(file);
  if (!p) {
    p = (async () => {
      await MeshoptDecoder.ready;
      const buf = readFileSync(resolve(import.meta.dirname, '../public/assets/models/characters', file));
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
      return { scene: g.scene, animations: g.animations };
    })();
    models.set(file, p);
  }
  return p;
}

async function realRegistry() {
  const loaded = new Map<string, LoadedModel>([
    ['characters.creature.wolf', await loadModel('wolf.glb')],
    ['characters.creature.horse', await loadModel('horse.glb')],
  ]);
  const loader: StandInLoader = { model: async (id) => loaded.get(id)!, peek: (id) => loaded.get(id) ?? null };
  return new FaunaRegistry<StandInAnimal>((a) => new StandInAnimal(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
}

const run = (reg: FaunaRegistry<StandInAnimal>, s: number, cam = { x: 0, y: 1.6, z: 4 }) => {
  for (let i = 0; i < Math.round(s * 60); i++) reg.tick(1 / 60, cam, TICK);
};

/** Skinned vertices of the drawn parts in the animal's root frame, with their dominant bone. */
function verts(a: Animal): { v: Vector3; bone: string }[] {
  a.root.updateMatrixWorld(true);
  const inv = a.root.matrixWorld.clone().invert();
  const out: { v: Vector3; bone: string }[] = [];
  a.root.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh || !m.visible) return;
    const pos = m.geometry.getAttribute('position');
    const si = m.geometry.getAttribute('skinIndex');
    const sw = m.geometry.getAttribute('skinWeight');
    for (let i = 0; i < pos.count; i++) {
      const v = m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      let best = -1;
      let j = 0;
      for (let k = 0; k < 4; k++)
        if (sw.getComponent(i, k) > best) {
          best = sw.getComponent(i, k);
          j = si.getComponent(i, k);
        }
      out.push({ v, bone: m.skeleton.bones[j]!.name });
    }
  });
  return out;
}

const TORSO = /^(Torso\d?|Back)$/;
const PAW = /^(IK|FF)/;
const top = (vs: { v: Vector3; bone: string }[], re: RegExp) => Math.max(...vs.filter((x) => re.test(x.bone)).map((x) => x.v.y));
const low = (vs: { v: Vector3; bone: string }[], re: RegExp) => Math.min(...vs.filter((x) => re.test(x.bone)).map((x) => x.v.y));

describe('stand-in on the rigged Quaternius wolf and horse', () => {
  it('every spec builds at its shoulder height and length, ready → true, measured strides, eyes at the spec height', async () => {
    const reg = await realRegistry();
    for (const id of FAUNA_SPEC_IDS) {
      const a = reg.spawn(id, { x: 0, z: 0 });
      expect(await a.ready).toBe(true);
      run(reg, 1);
      const st = a.state();
      const spec = resolveFaunaSpec(id).spec;
      expect(st.fallback).toBe(false);
      expect(a.info.clips).toEqual(standinSupported(spec.species));
      const vs = verts(a);
      // shoulder: the torso top; feet on the ground; nose to rump along −z (the root faces −z)
      expect(top(vs, TORSO) / spec.height).toBeGreaterThan(0.95);
      expect(top(vs, TORSO) / spec.height).toBeLessThan(1.05);
      expect(Math.abs(low(vs, PAW))).toBeLessThan(0.03 * spec.height);
      const body = vs.filter((x) => !/^(Tail|Ear)/.test(x.bone));
      const nose = Math.min(...body.map((x) => x.v.z));
      const rump = Math.max(...body.map((x) => x.v.z));
      expect((rump - nose) / spec.length).toBeGreaterThan(0.9);
      expect((rump - nose) / spec.length).toBeLessThan(1.12);
      expect(nose).toBeLessThan(0); // the head is forward (−z)
      // the eyes at the spec's eye height (the head carriage), and headWorld agrees
      expect(Math.abs(st.eye.y - spec.headHeight) / spec.headHeight).toBeLessThan(0.07);
      // strides measured from the paws (walk exact; run floored at two body lengths)
      expect(st.stride.measured).toBe(true);
      expect(st.stride.raw.walk).toBeGreaterThan(0.6 * spec.height);
      expect(st.stride.raw.run).toBeGreaterThan(st.stride.raw.walk);
      expect(st.stride.walk).toBe(st.stride.raw.walk);
      expect(st.stride.run).toBeCloseTo(Math.max(st.stride.raw.run, RUN_STRIDE_PER_LENGTH * spec.length), 2);
      // stand-in cost (reported, not budgeted): one draw call per drawn slot
      expect(st.drawCalls).toBe(spec.species === 'dog' ? 4 : 7);
      expect(st.tris).toBeGreaterThan(1500);
    }
    expect(reg.stats().visible).toBe(FAUNA_SPEC_IDS.length);
    reg.clear();
    expect(reg.stats().count).toBe(0);
  });

  it('speed blends idle → walk → run, the paws move, walking overrides the action loops', async () => {
    const reg = await realRegistry();
    const a = reg.spawn('dog.diane', { x: 2, z: 0 });
    await a.ready;
    run(reg, 0.3);
    expect(a.state().weights.idle).toBeGreaterThan(0.95);
    a.setSpeed(1.4);
    run(reg, 0.6);
    expect(a.state().weights.walk).toBeGreaterThan(0.95);
    const paw = a.bodyRoot!.getObjectByName('IKFrontLegL')!;
    const at = () => {
      a.root.updateMatrixWorld(true);
      return a.root.worldToLocal(paw.getWorldPosition(new Vector3()));
    };
    const p0 = at();
    run(reg, 0.2);
    const p1 = at();
    expect(p1.distanceTo(p0)).toBeGreaterThan(0.05);
    a.setSpeed(7);
    run(reg, 0.6);
    expect(a.state().weights.run).toBeGreaterThan(0.95);
    // sitting while running: no pose until it stops
    a.play('sit');
    run(reg, 0.5);
    expect(a.state().weights.pose).toBeLessThan(0.01);
    a.setSpeed(0);
    run(reg, 2);
    expect(a.state().pose).toBe('sit');
    expect(a.state().weights.pose).toBeGreaterThan(0.95);
    a.setSpeed(1.4);
    run(reg, 1.5);
    expect(a.state().weights.pose).toBeLessThan(0.05);
    expect(a.state().clip).toBe('sit');
    // play('walk') ends a looping action and leaves the legs to setSpeed
    a.setSpeed(0);
    a.play('walk');
    run(reg, 1);
    expect(a.state().base).toBe('walk');
    expect(a.state().weights.idle).toBeGreaterThan(0.95);
    // a loop played once ends in idle
    a.play('alert', { loop: false });
    run(reg, 3.5);
    expect(a.state().base).toBe('idle');
    reg.clear();
  });

  it('dog poses against the ground: sit (rump down, front up), lie (belly down), sleep (head down), sniff (nose down ahead of the paws)', async () => {
    const reg = await realRegistry();
    for (const id of ['dog.diane', 'dog.bijou']) {
      const S = resolveFaunaSpec(id).spec.height;
      const a = reg.spawn(id, { x: 0, z: 0 });
      await a.ready;
      run(reg, 0.5);
      const stand = verts(a);
      const standTorso = low(stand, TORSO);
      const check = (clip: AnimalClip) => {
        a.play(clip);
        run(reg, 3);
        expect(a.state().playing).toBe(clip === 'graze' ? 'sniff' : clip);
        const vs = verts(a);
        // nothing sinks into the ground; the paws stay on it
        const lowest = vs.reduce((m, x) => (x.v.y < m.v.y ? x : m));
        expect(lowest.v.y, `${id} ${clip}: ${lowest.bone}`).toBeGreaterThan(-0.06 * S);
        expect(Math.abs(low(vs, PAW))).toBeLessThan(0.05 * S);
        return vs;
      };
      const sit = check('sit');
      const hipsRear = sit.filter((x) => /^(Back|Tail1|BackLeg[LR])$/.test(x.bone));
      expect(Math.min(...hipsRear.map((x) => x.v.y))).toBeLessThan(0.16 * S); // rump on the ground
      expect(top(sit, /^Torso3$/)).toBeGreaterThan(0.9 * S); // chest up
      expect(a.state().eye.y).toBeGreaterThan(0.95 * a.info.headHeight); // looking forward, head up
      const lie = check('lie');
      expect(low(lie, TORSO)).toBeLessThan(0.16 * S);
      expect(low(lie, TORSO)).toBeLessThan(standTorso - 0.3 * S);
      expect(a.state().eye.y).toBeGreaterThan(0.45 * a.info.headHeight); // head up
      check('sleep');
      expect(a.state().eye.y).toBeLessThan(0.4 * a.info.headHeight);
      const sniff = check('sniff');
      const head = sniff.filter((x) => x.bone === 'Head');
      const paws = sniff.filter((x) => /^(IKFrontLeg|FF)[LR]$/.test(x.bone));
      expect(Math.min(...head.map((x) => x.v.y))).toBeLessThan(0.15 * S);
      // the root faces −z: ahead of the forefeet = smaller z
      expect(Math.min(...head.map((x) => x.v.z))).toBeLessThan(Math.min(...paws.map((x) => x.v.z)));
      check('graze'); // a dog's graze is its sniff
      reg.clear();
    }
  });

  it('deer: graze puts the muzzle in the grass ahead of the forefeet; lie folds the legs; alert lifts the head', async () => {
    const reg = await realRegistry();
    for (const id of ['reh.ricke', 'reh.kitz']) {
      const S = resolveFaunaSpec(id).spec.height;
      const a = reg.spawn(id, { x: 0, z: 0 });
      await a.ready;
      run(reg, 1);
      const idleEye = a.state().eye.y;
      a.play('alert');
      run(reg, 1.5);
      expect(a.state().eye.y).toBeGreaterThan(idleEye);
      expect(a.state().head.mode).toBe('alert');
      a.play('graze');
      run(reg, 3);
      let vs = verts(a);
      const head = vs.filter((x) => x.bone === 'Head');
      const fore = vs.filter((x) => /^(IKFrontLeg|FF)[LR]$/.test(x.bone));
      expect(Math.min(...head.map((x) => x.v.y))).toBeLessThan(0.2 * S);
      expect(Math.min(...head.map((x) => x.v.z))).toBeLessThan(Math.min(...fore.map((x) => x.v.z)));
      expect(Math.min(...vs.map((x) => x.v.y))).toBeGreaterThan(-0.06 * S);
      a.play('lie');
      run(reg, 3);
      vs = verts(a);
      expect(low(vs, TORSO)).toBeLessThan(0.16 * S);
      expect(Math.min(...vs.map((x) => x.v.y))).toBeGreaterThan(-0.08 * S);
      // folded legs stay under the body: no hoof sticks out far in front or behind
      const body = vs.filter((x) => TORSO.test(x.bone));
      const legs = vs.filter((x) => /Leg/.test(x.bone));
      expect(Math.min(...legs.map((x) => x.v.z))).toBeGreaterThan(Math.min(...body.map((x) => x.v.z)) - 0.45 * S);
      expect(Math.max(...legs.map((x) => x.v.z))).toBeLessThan(Math.max(...body.map((x) => x.v.z)) + 0.35 * S);
      a.play('sleep');
      run(reg, 3);
      expect(a.state().eye.y).toBeLessThan(0.35 * a.info.headHeight);
      // no sit / bark for a deer: idle / an alert head
      a.play('sit');
      expect(a.state().playing).toBe('idle');
      a.play('bark');
      expect(a.state().playing).toBe('alert');
      reg.clear();
    }
  });

  it('one-shots: bark (a stand-in head jerk) and shake play out and hand back to the loop', async () => {
    const reg = await realRegistry();
    const a = reg.spawn('dog.bijou', { x: 0, z: 0 });
    await a.ready;
    a.play('sit');
    run(reg, 2);
    a.play('bark');
    run(reg, 0.1);
    expect(a.state().shot).toBe('bark');
    expect(a.state().substitute).toBe(true);
    expect(a.state().weights.jerk).toBeGreaterThan(0.3);
    run(reg, 0.6);
    expect(a.state().shot).toBeNull();
    expect(a.state().base).toBe('sit');
    expect(a.state().weights.pose).toBeGreaterThan(0.95);
    a.play('shake');
    run(reg, 0.3);
    expect(a.state().shot).toBe('shake');
    run(reg, 1);
    expect(a.state().shot).toBeNull();
    expect(a.state().playing).toBe('sit');
    // a looping one-shot repeats until another clip is asked for
    a.play('bark', { loop: true });
    run(reg, 1.5);
    expect(a.state().shot).toBe('bark');
    a.play('idle');
    expect(a.state().shot).toBeNull();
    reg.clear();
  });

  it('frustum culling stays on: each part has a bound that holds its skinned vertices in every pose', async () => {
    const reg = await realRegistry();
    const v = new Vector3();
    for (const id of FAUNA_SPEC_IDS) {
      const a = reg.spawn(id, { x: 120, z: -40, y: 5, yaw: 1.1 });
      await a.ready;
      const check = () => {
        a.root.updateMatrixWorld(true);
        let parts = 0;
        a.root.traverse((o) => {
          const m = o as SkinnedMesh;
          if (!m.isSkinnedMesh || !m.visible) return;
          parts++;
          expect(m.frustumCulled).toBe(true);
          const sphere = m.boundingSphere!;
          const n = m.geometry.getAttribute('position').count;
          for (let i = 0; i < n; i += 3) {
            m.getVertexPosition(i, v);
            expect(sphere.containsPoint(v)).toBe(true);
          }
        });
        expect(parts).toBeGreaterThan(3);
      };
      const cam = { x: 120, y: 6, z: -36 };
      a.setSpeed(a.info.speeds.run);
      run(reg, 0.7, cam);
      check();
      a.setSpeed(0);
      for (const c of ['alert', 'graze', 'sit', 'lie', 'sleep'] as const) {
        a.play(c);
        run(reg, 2.5, cam);
        check();
      }
      reg.clear();
    }
  });

  it('lookAt turns the head within limits; null = forward; headWorld follows the head', async () => {
    const reg = await realRegistry();
    const a = reg.spawn('reh.ricke', { x: 0, z: 0, yaw: 0 });
    await a.ready;
    run(reg, 0.5);
    const h0 = { x: 0, y: 0, z: 0 };
    a.headWorld(h0);
    expect(h0.z).toBeLessThan(-0.2); // the head is forward (−z)
    // faces −z; a point to the east (+x) is to its right: negative head yaw
    a.lookAt({ x: 3, y: 1, z: -1 });
    run(reg, 1.5);
    expect(a.state().head.yaw).toBeLessThan(-0.4);
    expect(Math.abs(a.state().head.yaw)).toBeLessThanOrEqual(ANIMAL_HEAD.yaw + 1e-6);
    const h1 = { x: 0, y: 0, z: 0 };
    a.headWorld(h1);
    expect(h1.x).toBeGreaterThan(h0.x + 0.03);
    // behind: no owl neck
    a.lookAt({ x: 0, y: 1, z: 5 });
    run(reg, 2);
    expect(Math.abs(a.state().head.yaw)).toBeLessThan(0.05);
    a.lookAt(null);
    run(reg, 1);
    expect(Math.abs(a.state().head.yaw)).toBeLessThan(0.05);
    // the root moves: headWorld moves with it at once
    a.root.position.x += 10;
    const h2 = { x: 0, y: 0, z: 0 };
    a.headWorld(h2);
    expect(h2.x - h0.x).toBeCloseTo(10, 1);
    reg.clear();
  });

  it('distance LOD hides and freezes, keepAlive does not; eye glints; disposal frees what it owns', async () => {
    const reg = await realRegistry();
    const a = reg.spawn('dog.diane', { x: 0, z: -10 });
    const star = reg.spawn('reh.kitz', { x: 0, z: -100, keepAlive: true });
    await Promise.all([a.ready, star.ready]);
    run(reg, 0.2);
    // eye glints: nothing drawn at 0; one extra draw call when on
    const off = a.drawStats();
    a.setEyeShine(1);
    expect(a.drawStats().calls).toBe(off.calls + 1);
    const glint = a.root.getObjectByName('eye-shine') as Mesh;
    expect(glint.visible).toBe(true);
    expect(glint.parent?.name).toBe('Head');
    a.setEyeShine(0);
    expect(glint.visible).toBe(false);
    expect(a.drawStats()).toEqual(off);
    // 70 m: hidden, frozen; the keepAlive kitz 100 m away stays drawn at full rate
    run(reg, 0.1, { x: 0, y: 1.6, z: 60 });
    expect(a.root.visible).toBe(false);
    expect(a.state().lod).toBe('frozen');
    expect(star.root.visible).toBe(true);
    expect(star.state().lod).toBe('full');
    star.setVisible(false);
    run(reg, 0.1);
    expect(star.root.visible).toBe(false);
    star.setVisible(true);
    run(reg, 0.1);
    expect(a.root.visible).toBe(true);
    // disposal: own materials (slot clones, the glint) disposed, the asset's untouched; the painted
    // geometry is shared per spec (kept), the glint's geometry is the animal's (disposed)
    type Disp = { dispose(): void; addEventListener(t: string, f: () => void): void };
    const own = new Set<Disp>();
    const geoOwn = new Set<Disp>();
    a.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      own.add(m.material as unknown as Disp);
      if (m.name === 'eye-shine') geoOwn.add(m.geometry as unknown as Disp);
    });
    const wolf = await loadModel('wolf.glb');
    const shared = new Set<Disp>();
    wolf.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) shared.add(m.material as unknown as Disp);
    });
    const disposed = new Set<unknown>();
    for (const m of [...own, ...shared, ...geoOwn]) m.addEventListener('dispose', () => disposed.add(m));
    a.dispose();
    for (const m of own) expect(disposed.has(m)).toBe(true);
    for (const m of shared) expect(disposed.has(m)).toBe(false);
    for (const g of geoOwn) expect(disposed.has(g)).toBe(true);
    expect(reg.get(a.id)).toBeUndefined();
    expect(a.bodyRoot).toBeNull();
    a.dispose(); // twice is harmless
    // a second Diane still builds from the shared caches
    const b = reg.spawn('dog.diane', { x: 0, z: 0 });
    expect(await b.ready).toBe(true);
    reg.clear();
  });
});
