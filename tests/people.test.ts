/**
 * People contract v0 / v0.1 (src/systems/people, docs/ARCHITECTURE.md "People contract v0"): the pure
 * locomotion / LOD / yaw logic, the spec table, the unknown-spec fallback, the registry, contract
 * conformance of the stand-in (type level and at run time, with the real CC0 model loaded in node)
 * and the npc binding helpers (talking to people).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Group, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { LoadedModel } from '../src/assets/loader';
import { ROSTER } from '../src/systems/npc/roster';
import { bodySpot, faceYaw, talkCues } from '../src/systems/npc/bind';
import {
  FACE_SECONDS,
  HEAD_PITCH_DOWN,
  HEAD_PITCH_UP,
  HEAD_YAW,
  type FootSample,
  advancePhase,
  animTick,
  easeYaw,
  headAim,
  locoWeights,
  lodFor,
  moveAmount,
  resolveClip,
  strideAt,
  strideFromFeet,
  wrapPi,
} from '../src/systems/people/locomotion';
import { PeopleRegistry, type PersonFactoryArgs, type PersonRuntime } from '../src/systems/people/registry';
import { GENERIC_EXTRA, PERSON_SPECS, SPEC_IDS, resolveSpec, standinColour, standinShows } from '../src/systems/people/specs';
import { STANDIN_CLIPS, STANDIN_SUPPORTED, type StandInLoader, StandInPerson } from '../src/systems/people/standin';
import { CLIP_FALLBACK, PEOPLE_LOD, TIER_BUDGET, type PeopleApi, type Person, type PersonClip } from '../src/systems/people/types';

const PI = Math.PI;
const ALL_CLIPS: PersonClip[] = ['idle', 'walk', 'run', 'talk', 'point', 'wave', 'lookAround', 'sit', 'sitTalk', 'interact'];
const TICK = { rate: 'full' as const, hidden: false, reducedMotion: false, reducedFlash: false };

// ---- pure logic --------------------------------------------------------------------------------

describe('locomotion blend', () => {
  it('idle at rest, walk at walking pace, run when running; weights sum to 1', () => {
    expect(locoWeights(0)).toEqual({ idle: 1, walk: 0, run: 0 });
    const w = locoWeights(1.4);
    expect(w.walk).toBeGreaterThan(0.99);
    expect(locoWeights(4.5).run).toBeGreaterThan(0.99);
    for (let s = 0; s <= 8; s += 0.05) {
      const v = locoWeights(s);
      expect(v.idle + v.walk + v.run).toBeCloseTo(1, 9);
      for (const k of [v.idle, v.walk, v.run]) expect(k).toBeGreaterThanOrEqual(0);
    }
    // monotonic: more speed never means more idle or less run
    let prev = locoWeights(0);
    for (let s = 0.05; s <= 8; s += 0.05) {
      const v = locoWeights(s);
      expect(v.idle).toBeLessThanOrEqual(prev.idle + 1e-12);
      expect(v.run).toBeGreaterThanOrEqual(prev.run - 1e-12);
      prev = v;
    }
    expect(locoWeights(Number.NaN)).toEqual({ idle: 1, walk: 0, run: 0 });
    expect(locoWeights(-3)).toEqual({ idle: 1, walk: 0, run: 0 });
  });

  it('a body is mostly moving above the 0.2 m/s override', () => {
    expect(moveAmount(0)).toBe(0);
    expect(moveAmount(0.2)).toBeGreaterThan(0.1);
    expect(moveAmount(0.7)).toBeGreaterThan(0.99);
  });

  it('feet are phase-locked: the cycle counter covers ground at the blended stride', () => {
    expect(strideAt(1.4, 1.8, 2.4)).toBeCloseTo(1.8, 6);
    expect(strideAt(5, 1.8, 2.4)).toBeCloseTo(2.4, 6);
    const mid = strideAt(3.1, 1.8, 2.4);
    expect(mid).toBeGreaterThan(1.8);
    expect(mid).toBeLessThan(2.4);
    // 1.8 m stride at 1.35 m/s for 4 s = 5.4 m = 3 loops → back at the same phase
    let ph = 0.25;
    let loops = 0;
    for (let i = 0; i < 240; i++) {
      const n = advancePhase(ph, 1.35, 1.8, 2.4, 1 / 60);
      if (n < ph) loops++;
      ph = n;
    }
    expect(loops).toBe(3);
    expect(ph).toBeCloseTo(0.25, 6);
    expect(advancePhase(0.5, 0, 1.8, 2.4, 1)).toBe(0.5);
  });

  it('measures a stride from a foot that slides back while planted', () => {
    // synthetic in-place walk: each foot planted half the loop (y = 0, z sliding back at v), swinging
    // forward lifted the other half; two feet half a loop apart
    const T = 1.2;
    const v = 1.5;
    const foot = (off: number): FootSample[] => {
      const out: FootSample[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * T;
        const k = (t / T + off) % 1;
        const stance = k < 0.5;
        const z = stance ? (v * T) / 4 - v * k * T : -(v * T) / 4 + (v * T) * (k - 0.5);
        out.push({ t, y: stance ? 0 : 0.15 * Math.sin((k - 0.5) * 2 * PI), z });
      }
      return out;
    };
    const s = strideFromFeet([foot(0), foot(0.5)], T);
    expect(s).not.toBeNull();
    expect(s!).toBeCloseTo(v * T, 1);
    // nothing planted and sliding: no measurement
    expect(strideFromFeet([[{ t: 0, y: 0, z: 0 }, { t: 1, y: 0, z: 0 }]], 1)).toBeNull();
    expect(strideFromFeet([foot(0)], 0)).toBeNull();
  });
});

describe('turning and the head', () => {
  it('easeYaw takes the shortest arc, caps the rate and lands within FACE_SECONDS', () => {
    expect(wrapPi(3 * PI)).toBeCloseTo(-PI);
    expect(wrapPi(-PI / 2)).toBeCloseTo(-PI / 2);
    // from 170° to −170°: 20° the short way (through 180°)
    const a = easeYaw((170 * PI) / 180, (-170 * PI) / 180, 1 / 60);
    expect(Math.abs(wrapPi(a - PI))).toBeLessThan((10 * PI) / 180);
    // never faster than 5 rad/s
    expect(Math.abs(easeYaw(0, 3, 1 / 60))).toBeLessThanOrEqual(5 / 60 + 1e-9);
    let y = 0;
    for (let i = 0; i < Math.round(FACE_SECONDS * 2 * 60); i++) y = easeYaw(y, PI / 2, 1 / 60);
    expect(y).toBeCloseTo(PI / 2, 2);
    expect(easeYaw(1, 1.0005, 1 / 60)).toBeCloseTo(1.0005, 9);
  });

  it('headAim turns toward the point within limits and ignores points behind', () => {
    // straight ahead (+z in the body frame), level
    expect(headAim(0, 0, 3)).toEqual({ yaw: 0, pitch: -0 });
    // to the left (+x), clamped
    expect(headAim(5, 0, 0.5).yaw).toBeCloseTo(HEAD_YAW);
    expect(headAim(-5, 0, 0.5).yaw).toBeCloseTo(-HEAD_YAW);
    // behind: no owl neck
    expect(headAim(0.2, 0, -3)).toEqual({ yaw: 0, pitch: 0 });
    // below: chin down (positive pitch), above: up, both clamped
    expect(headAim(0, -10, 1).pitch).toBeCloseTo(HEAD_PITCH_DOWN);
    expect(headAim(0, 10, 1).pitch).toBeCloseTo(-HEAD_PITCH_UP);
  });
});

describe('distance LOD', () => {
  it('full within 15 m, ~10 Hz within 40 m, frozen beyond, hidden past the draw limit', () => {
    expect(PEOPLE_LOD).toMatchObject({ fullRate: 15, slowRate: 40, slowHz: 10, drawLimit: 60, lod1: 15, lod1Ratio: 0.5 });
    expect(lodFor(3)).toEqual({ rate: 'full', hidden: false });
    expect(lodFor(15)).toEqual({ rate: 'full', hidden: false });
    expect(lodFor(20)).toEqual({ rate: 'slow', hidden: false });
    expect(lodFor(50)).toEqual({ rate: 'frozen', hidden: false });
    expect(lodFor(61)).toEqual({ rate: 'frozen', hidden: true });
    expect(lodFor(Number.NaN).hidden).toBe(true);
    expect(lodFor(70, 100).hidden).toBe(false);
  });

  it('animTick evaluates every frame / about 10 times a second / never', () => {
    const count = (rate: 'full' | 'slow' | 'frozen', fps: number) => {
      let acc = 0;
      let n = 0;
      for (let i = 0; i < fps * 3; i++) {
        const r = animTick(acc, 1 / fps, rate);
        acc = r.acc;
        if (r.evaluate) n++;
      }
      return n / 3;
    };
    expect(count('full', 60)).toBe(60);
    expect(count('slow', 60)).toBeGreaterThanOrEqual(9);
    expect(count('slow', 60)).toBeLessThanOrEqual(10.5);
    expect(count('slow', 120)).toBeGreaterThanOrEqual(9);
    expect(count('slow', 30)).toBeGreaterThanOrEqual(9);
    expect(count('frozen', 60)).toBe(0);
  });
});

describe('clips and fallbacks', () => {
  it('every clip resolves to itself when supported, else along CLIP_FALLBACK, idle at the end', () => {
    for (const c of ALL_CLIPS) expect(resolveClip(c, ALL_CLIPS)).toBe(c);
    for (const c of ALL_CLIPS) expect(resolveClip(c, ['idle'])).toBe('idle');
    expect(resolveClip('point', ['idle', 'interact'])).toBe('interact');
    expect(resolveClip('sitTalk', ['idle', 'sit'])).toBe('sit');
    expect(resolveClip('run', ['idle', 'walk'])).toBe('walk');
    expect(resolveClip('wave', [])).toBe('idle');
    // the chain ends (no cycles)
    for (const c of ALL_CLIPS) {
      let k: PersonClip | null = c;
      for (let i = 0; i < 10 && k; i++) k = CLIP_FALLBACK[k];
      expect(k).toBeNull();
    }
  });

  it('the stand-in clip map covers every clip; point and the sits are fallbacks', () => {
    expect(Object.keys(STANDIN_CLIPS).sort()).toEqual([...ALL_CLIPS].sort());
    expect([...STANDIN_SUPPORTED].sort()).toEqual(['idle', 'interact', 'lookAround', 'run', 'talk', 'walk', 'wave']);
    expect(resolveClip('point', STANDIN_SUPPORTED)).toBe('interact');
    expect(resolveClip('sit', STANDIN_SUPPORTED)).toBe('idle');
    expect(STANDIN_CLIPS.sit.drop).toBeCloseTo(0.42);
    expect(STANDIN_CLIPS.sitTalk.drop).toBeCloseTo(0.42);
    expect(STANDIN_CLIPS.talk.gestures).toBe(true);
    expect(STANDIN_CLIPS.lookAround.sweep).toBe(true);
    for (const c of ['point', 'wave', 'interact'] as const) expect(STANDIN_CLIPS[c].kind).toBe('shot');
    for (const c of ['idle', 'walk', 'run', 'talk', 'lookAround', 'sit', 'sitTalk'] as const) expect(STANDIN_CLIPS[c].kind).toBe('loop');
  });
});

// ---- the spec table ----------------------------------------------------------------------------

describe('spec table v0', () => {
  it('has exactly the provisional ids', () => {
    expect([...SPEC_IDS]).toEqual([
      'guide',
      'double.herzog',
      'double.mannlich',
      'double.hanne',
      'double.peter',
      'double.jost',
      'double.soll',
      'double.liese',
      'child.compass',
      'extra.1',
      'extra.2',
      'extra.3',
      'extra.4',
      'extra.5',
      'extra.6',
      'extra.7',
      'twin.herzog',
      'twin.mannlich',
    ]);
    expect(new Set(SPEC_IDS).size).toBe(SPEC_IDS.length);
  });

  it('tiers, heights, radii and default looks follow the contract', () => {
    for (const s of PERSON_SPECS) {
      const extra = s.id.startsWith('extra.');
      expect(s.tier).toBe(extra ? 'extra' : 'featured');
      expect(s.radius).toBe(s.id === 'child.compass' ? 0.22 : extra ? 0.28 : 0.3);
      expect(s.look).toBe(s.id.startsWith('twin.') ? 'ghost' : 'solid');
      expect(s.height).toBeGreaterThan(1.1);
      expect(s.height).toBeLessThan(2.05);
      expect(Object.keys(s.palette).length).toBeGreaterThan(3);
      expect(s.build).toBeGreaterThan(0.8);
      expect(s.build).toBeLessThan(1.2);
    }
    const by = (id: string) => resolveSpec(id).spec;
    expect(by('guide').height).toBe(1.95);
    expect(by('guide').build).toBeLessThan(0.95); // skinny
    expect(by('guide').hideSlots).toContain('Hair'); // bald
    expect(by('child.compass').height).toBeCloseTo(1.25, 2);
    expect(by('twin.herzog').height).toBe(ROSTER.herzog!.height);
    expect(by('twin.mannlich').height).toBe(ROSTER.mannlich!.height);
    expect(by('double.herzog').height).toBe(ROSTER.herzog!.height);
    expect(by('twin.herzog').tint).toBe(ROSTER.herzog!.tint);
    expect(TIER_BUDGET).toEqual({ hero: { tris: 25000, drawCalls: 8 }, featured: { tris: 12000, drawCalls: 4 }, extra: { tris: 6000, drawCalls: 2 } });
  });

  it('stand-in parts: the guide has no hair, a backpack only with a pack palette, mesh keys win', () => {
    const guide = resolveSpec('guide').spec;
    expect(standinShows(guide, 'Adventurer_Head_4', 'Hair')).toBe(false);
    expect(standinShows(guide, 'Adventurer_Head_1', 'Skin')).toBe(true);
    expect(standinShows(guide, 'Backpack_2', 'Green')).toBe(false);
    const child = resolveSpec('child.compass').spec;
    expect(standinShows(child, 'Backpack_2', 'Green')).toBe(true);
    expect(standinColour(child, 'Backpack_3', 'LightGreen')).toBe(child.pack!.LightGreen);
    expect(standinColour(child, 'Adventurer_Body_1', 'Green')).toBe(child.palette.Green);
    const hanne = resolveSpec('double.hanne').spec;
    expect(standinColour(hanne, 'Formal_Feet_2', 'Red')).toBe(hanne.palette['mesh:Formal_Feet_2']);
    expect(standinColour(hanne, 'Formad_Head_2', 'Red')).toBe(hanne.palette.Red);
    expect(standinColour(guide, 'X', 'NoSuchSlot')).toBeNull();
  });
});

// ---- the registry (fake bodies) ----------------------------------------------------------------

class FakePerson implements PersonRuntime {
  readonly root = new Group();
  readonly info: Person['info'];
  readonly ready = Promise.resolve(true);
  readonly name: string;
  readonly speaker: string | undefined;
  readonly specId: string;
  readonly id: string;
  ticks: { rate: string; hidden: boolean }[] = [];
  disposed = false;
  constructor(private readonly a: PersonFactoryArgs) {
    this.id = a.id;
    this.specId = a.specId;
    this.name = a.opts.name ?? a.specId;
    this.speaker = a.opts.speaker;
    this.info = { specId: a.specId, tier: a.opts.tier ?? a.spec.tier, height: a.spec.height, radius: a.spec.radius, clips: ['idle'] };
    this.root.position.set(a.opts.x, a.opts.y, a.opts.z);
  }
  setSpeed(): void {}
  play(): void {}
  face(): void {}
  lookAt(): void {}
  setLook(): void {}
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
    return this.root.visible ? { tris: 1000, calls: 2 } : { tris: 0, calls: 0 };
  }
}

function fakeRegistry() {
  const warn = vi.fn();
  const reg = new PeopleRegistry<FakePerson>((a) => new FakePerson(a), (x, z) => 100 + x * 0.01 + z * 0.001, warn);
  return { reg, warn };
}

describe('registry', () => {
  it('an unknown spec id is a generic extra with one warning per id', () => {
    const { reg, warn } = fakeRegistry();
    const a = reg.spawn('tourist.42', { x: 1, z: 2 });
    const b = reg.spawn('tourist.42', { x: 3, z: 4 });
    reg.spawn('nobody', { x: 0, z: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain('tourist.42');
    expect(a.specId).toBe('tourist.42');
    expect(a.info.tier).toBe('extra');
    expect(a.info.height).toBe(GENERIC_EXTRA.height);
    expect(a.info.radius).toBe(0.28);
    expect(a.id).not.toBe(b.id);
    expect(resolveSpec('tourist.42')).toEqual({ spec: GENERIC_EXTRA, known: false });
    // a known id never warns
    reg.spawn('guide', { x: 0, z: 0 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('grounds spawns without y, keeps a given y, tier override, unique ids', () => {
    const { reg } = fakeRegistry();
    const a = reg.spawn('guide', { x: 100, z: 200 });
    expect(a.root.position.y).toBeCloseTo(100 + 1 + 0.2);
    const b = reg.spawn('guide', { x: 100, z: 200, y: 7, tier: 'hero' });
    expect(b.root.position.y).toBe(7);
    expect(b.info.tier).toBe('hero');
    expect(a.info.tier).toBe('featured');
    expect(a.id).not.toBe(b.id);
    expect(reg.specs()).toBe(SPEC_IDS);
  });

  it('get / list / dispose / clear', () => {
    const { reg } = fakeRegistry();
    const a = reg.spawn('extra.1', { x: 0, z: 0 });
    const b = reg.spawn('extra.2', { x: 0, z: 0 });
    expect(reg.get(a.id)).toBe(a);
    expect(reg.list()).toEqual([a, b]);
    a.dispose();
    expect(reg.get(a.id)).toBeUndefined();
    expect(reg.list()).toEqual([b]);
    reg.clear();
    expect(b.disposed).toBe(true);
    expect(reg.list()).toEqual([]);
  });

  it('bySpeaker finds the newest live person with that speaker (v0.1)', () => {
    const { reg } = fakeRegistry();
    expect(reg.bySpeaker('imhoff')).toBeUndefined();
    const a = reg.spawn('guide', { x: 0, z: 0, speaker: 'imhoff' });
    reg.spawn('extra.1', { x: 0, z: 0 });
    expect(reg.bySpeaker('imhoff')).toBe(a);
    const b = reg.spawn('guide', { x: 5, z: 0, speaker: 'imhoff' });
    expect(reg.bySpeaker('imhoff')).toBe(b);
    b.dispose();
    expect(reg.bySpeaker('imhoff')).toBe(a);
    a.dispose();
    expect(reg.bySpeaker('imhoff')).toBeUndefined();
  });

  it('tick runs the distance LOD from the camera; stats count what is drawn', () => {
    const { reg } = fakeRegistry();
    const near = reg.spawn('extra.1', { x: 5, z: 0, y: 0 });
    const mid = reg.spawn('extra.2', { x: 30, z: 0, y: 0 });
    const far = reg.spawn('extra.3', { x: 50, z: 0, y: 0 });
    const gone = reg.spawn('extra.4', { x: 80, z: 0, y: 0 });
    reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, { reducedMotion: false, reducedFlash: false });
    expect(near.ticks[0]).toEqual({ rate: 'full', hidden: false });
    expect(mid.ticks[0]).toEqual({ rate: 'slow', hidden: false });
    expect(far.ticks[0]).toEqual({ rate: 'frozen', hidden: false });
    expect(gone.ticks[0]).toEqual({ rate: 'frozen', hidden: true });
    expect(reg.stats()).toEqual({ count: 4, visible: 3, tris: 3000, drawCalls: 6, lod: { full: 1, slow: 1, frozen: 1, hidden: 1 } });
  });
});

// ---- contract conformance ----------------------------------------------------------------------

describe('contract conformance', () => {
  it('type level: the stand-in is a Person, the registry a PeopleApi', () => {
    expectTypeOf<StandInPerson>().toExtend<Person>();
    expectTypeOf<StandInPerson>().toExtend<PersonRuntime>();
    expectTypeOf<PeopleRegistry<StandInPerson>>().toExtend<PeopleApi>();
    expectTypeOf<PeopleApi['spawn']>().returns.toEqualTypeOf<Person>();
    expectTypeOf<Person['info']['clips']>().toEqualTypeOf<readonly PersonClip[]>();
  });

  it('the handle is usable before the mesh is in; a failed load is a capsule and ready → false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let fail: (e: unknown) => void = () => {};
    const loader: StandInLoader = { model: () => new Promise((_, rej) => (fail = rej)), peek: () => null };
    const reg = new PeopleRegistry<StandInPerson>((a) => new StandInPerson(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
    const p = reg.spawn('guide', { x: 1, z: 2, yaw: 0.5, name: 'Gerold' });
    expect(p.root.visible).toBe(false);
    expect(p.root.position.toArray()).toEqual([1, 0, 2]);
    expect(p.root.rotation.y).toBeCloseTo(0.5);
    expect(p.info).toMatchObject({ specId: 'guide', tier: 'featured', height: 1.95, radius: 0.3 });
    // every call works before ready
    p.setSpeed(1.4);
    p.play('talk');
    p.play('point', { speed: 1.2 });
    p.face(-PI / 2);
    p.lookAt({ x: 0, y: 1.7, z: 0 });
    p.lookAt(null);
    p.setLook('ghost');
    p.setLook('solid');
    p.setVisible(true);
    reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, TICK);
    fail(new Error('offline'));
    expect(await p.ready).toBe(false);
    expect(p.state().fallback).toBe(true);
    expect(p.root.visible).toBe(true);
    expect(p.drawStats().calls).toBe(1);
    // face() turns smoothly toward the yaw over the next frames
    for (let i = 0; i < 90; i++) reg.tick(1 / 60, { x: 0, y: 0, z: 0 }, TICK);
    expect(p.root.rotation.y).toBeCloseTo(-PI / 2, 2);
    p.dispose();
    expect(reg.list()).toEqual([]);
    expect(p.root.parent).toBeNull();
    warn.mockRestore();
  });

  it('disposed before the model arrives: ready → false, nothing built', async () => {
    let ok: (m: LoadedModel) => void = () => {};
    const loader: StandInLoader = { model: () => new Promise((res) => (ok = res)), peek: () => null };
    const reg = new PeopleRegistry<StandInPerson>((a) => new StandInPerson(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
    const p = reg.spawn('extra.1', { x: 0, z: 0 });
    p.dispose();
    ok(await adventurer());
    expect(await p.ready).toBe(false);
    expect(p.body).toBeNull();
  });
});

// ---- the stand-in on the real CC0 model (node, no GPU) -----------------------------------------

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
const adventurer = () => loadModel('human_adventurer.glb');

async function realRegistry() {
  const files: Record<string, string> = {
    'characters.human.adventurer': 'human_adventurer.glb',
    'characters.human.farmer': 'human_farmer.glb',
    'characters.human.woman': 'human_woman.glb',
  };
  const loaded = new Map<string, LoadedModel>();
  for (const [id, f] of Object.entries(files)) loaded.set(id, await loadModel(f));
  const loader: StandInLoader = { model: async (id) => loaded.get(id)!, peek: (id) => loaded.get(id) ?? null };
  return new PeopleRegistry<StandInPerson>((a) => new StandInPerson(a.id, a.specId, a.spec, a.opts, loader, a.onDispose), () => 0);
}

const run = (reg: PeopleRegistry<StandInPerson>, s: number, cam = { x: 0, y: 1.6, z: 0 }) => {
  for (let i = 0; i < Math.round(s * 60); i++) reg.tick(1 / 60, cam, TICK);
};

describe('stand-in on the rigged Quaternius humans', () => {
  it('every spec builds, scaled to its height, ready → true, measured strides', async () => {
    const reg = await realRegistry();
    for (const id of SPEC_IDS) {
      const p = reg.spawn(id, { x: 0, z: 0 });
      expect(await p.ready).toBe(true);
      const st = p.state();
      expect(st.fallback).toBe(false);
      expect(st.stride.measured).toBe(true);
      const spec = resolveSpec(id).spec;
      // Walk ≈ 0.98 m per loop per metre of height, Run ≈ 1.31 (strideFromFeet on the clips' foot tracks)
      expect(st.stride.walk / (spec.height * spec.build)).toBeGreaterThan(0.85);
      expect(st.stride.walk / (spec.height * spec.build)).toBeLessThan(1.1);
      expect(st.stride.run).toBeGreaterThan(st.stride.walk);
      expect(st.look).toBe(spec.look);
    }
    run(reg, 0.5);
    const s = reg.stats();
    expect(s.count).toBe(SPEC_IDS.length);
    expect(s.visible).toBe(SPEC_IDS.length);
    expect(s.tris).toBeGreaterThan(50_000);
    reg.clear();
    expect(reg.stats().count).toBe(0);
  });

  it('speed blends idle → walk → run; play / one-shots / sit; info.clips', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('double.soll', { x: 2, z: 0 });
    await p.ready;
    expect(p.info.clips).toEqual(STANDIN_SUPPORTED);
    run(reg, 0.3);
    expect(p.state().weights.idle).toBeGreaterThan(0.95);
    p.setSpeed(1.4);
    run(reg, 0.6);
    expect(p.state().weights.walk).toBeGreaterThan(0.95);
    // the pose really moves: the left foot travels through the stride (root frame) while walking
    const foot = p.body!.getObjectByName('FootL')!;
    const at = () => {
      p.root.updateMatrixWorld(true);
      return p.root.worldToLocal(foot.getWorldPosition(new Vector3()));
    };
    const f0 = at();
    run(reg, 0.3);
    const f1 = at();
    expect(Math.hypot(f1.x - f0.x, f1.y - f0.y, f1.z - f0.z)).toBeGreaterThan(0.1);
    // and its feet stay under the body (the root is not moved: an in-place clip)
    expect(Math.abs(f1.z)).toBeLessThan(0.7);
    p.setSpeed(4.5);
    run(reg, 0.6);
    expect(p.state().weights.run).toBeGreaterThan(0.95);
    // walking overrides a looping action; standing, talk plays (with gestures)
    p.setSpeed(1.4);
    p.play('talk');
    run(reg, 0.6);
    expect(p.state().weights.walk).toBeGreaterThan(0.9);
    p.setSpeed(0);
    run(reg, 6);
    expect(p.state().weights.idle).toBeGreaterThan(0.3);
    expect(p.state().clip).toBe('talk');
    // a one-shot plays, then the loop that was playing
    p.play('wave');
    run(reg, 0.5);
    expect(p.state().shot).toBe('wave');
    expect(p.state().weights.wave).toBeGreaterThan(0.5);
    run(reg, 2.5);
    expect(p.state().shot === null || p.state().shot === 'interact').toBe(true);
    expect(p.state().clip).toBe('wave');
    expect(p.state().weights.wave).toBeLessThan(0.05);
    // point is a fallback to interact
    p.play('point');
    expect(p.state().playing).toBe('interact');
    // sit: the body sinks 0.42 m (stand-in)
    p.play('sit');
    run(reg, 2);
    expect(p.state().drop).toBeCloseTo(0.42, 2);
    expect(p.state().base).toBe('sit');
    expect(p.state().playing).toBe('idle');
    p.setSpeed(1);
    run(reg, 2);
    expect(p.state().drop).toBeLessThan(0.01);
    // play('walk') ends a looping action and leaves the legs to setSpeed: standing still it idles
    p.setSpeed(0);
    p.play('talk');
    p.play('walk');
    run(reg, 1);
    expect(p.state().base).toBe('walk');
    expect(p.state().weights.idle).toBeGreaterThan(0.95);
    p.setSpeed(1.4);
    run(reg, 0.6);
    expect(p.state().weights.walk).toBeGreaterThan(0.95);
    // talk with loop: false ends in idle
    p.setSpeed(0);
    p.play('talk', { loop: false });
    expect(p.state().base).toBe('talk');
    run(reg, 5);
    expect(p.state().clip).toBe('talk');
    expect(p.state().base).toBe('idle');
    expect(p.state().playing).toBe('idle');
    reg.clear();
  });

  it('frustum culling stays on: each part has a bound that holds its skinned vertices while running, waving and sitting', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 120, z: -40, y: 5, yaw: 1.1 });
    const c = reg.spawn('child.compass', { x: 118, z: -40, y: 5, yaw: -2 });
    await Promise.all([p.ready, c.ready]);
    const v = new Vector3();
    const check = (q: Person) => {
      q.root.updateMatrixWorld(true);
      let parts = 0;
      q.root.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isSkinnedMesh || !m.visible) return;
        parts++;
        expect(m.frustumCulled).toBe(true);
        const sphere = m.boundingSphere!;
        expect(sphere).toBeTruthy();
        const n = m.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i += 5) {
          m.getVertexPosition(i, v);
          expect(sphere.containsPoint(v)).toBe(true);
        }
      });
      expect(parts).toBeGreaterThan(8);
    };
    for (const q of [p, c]) {
      q.setSpeed(4.5);
      run(reg, 0.7, { x: 120, y: 6, z: -36 });
      check(q);
      q.setSpeed(0);
      q.play('wave');
      run(reg, 0.8, { x: 120, y: 6, z: -36 });
      check(q);
      q.play('sit');
      run(reg, 1.5, { x: 120, y: 6, z: -36 });
      check(q);
    }
    reg.clear();
  });

  it('lookAt turns the head within limits; null = forward', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 0, z: 0, yaw: 0 });
    await p.ready;
    // faces −z (north); a point to the east (+x) is to its right: negative head yaw in the body frame
    p.lookAt({ x: 3, y: 1.8, z: -1 });
    run(reg, 1.5);
    const h = p.state().head;
    expect(h.yaw).toBeLessThan(-0.4);
    expect(Math.abs(h.yaw)).toBeLessThanOrEqual(HEAD_YAW + 1e-6);
    // a point behind: no owl neck
    p.lookAt({ x: 0, y: 1.8, z: 5 });
    run(reg, 2);
    expect(Math.abs(p.state().head.yaw)).toBeLessThan(0.05);
    p.lookAt(null);
    run(reg, 1);
    expect(Math.abs(p.state().head.yaw)).toBeLessThan(0.05);
    reg.clear();
  });

  it('distance LOD hides and freezes; ghost / solid looks; disposal frees everything', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('twin.herzog', { x: 0, z: -10 });
    await p.ready;
    run(reg, 0.2);
    expect(p.state().look).toBe('ghost');
    const ghost = p.drawStats();
    p.setLook('solid');
    run(reg, 0.1);
    const solid = p.drawStats();
    expect(ghost.calls).toBe(solid.calls * 2); // the depth pre-pass twins
    expect(ghost.tris).toBe(solid.tris * 2);
    run(reg, 0.1, { x: 0, y: 1.6, z: 60 }); // 70 m away
    expect(p.root.visible).toBe(false);
    expect(p.state().lod).toBe('frozen');
    expect(reg.stats().visible).toBe(0);
    p.setVisible(false);
    run(reg, 0.1);
    expect(p.root.visible).toBe(false);
    p.setVisible(true);
    run(reg, 0.1);
    expect(p.root.visible).toBe(true);
    // disposal: materials disposed, mixer actions uncached, out of the scene graph and the registry
    // (the hidden backpack keeps the asset cache's own materials: those must survive)
    type Mat = { dispose(): void; addEventListener(t: string, f: () => void): void };
    const own = new Set<Mat>();
    const shared = new Set<Mat>();
    let skinned = 0;
    p.root.traverse((o) => {
      const m = (o as { material?: Mat }).material;
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned++;
      if (m) (o.name.startsWith('Backpack') ? shared : own).add(m);
    });
    expect(skinned).toBeGreaterThan(10);
    expect(shared.size).toBe(4);
    const disposed = new Set<unknown>();
    for (const m of [...own, ...shared]) m.addEventListener('dispose', () => disposed.add(m));
    p.dispose();
    expect(disposed.size).toBe(own.size);
    for (const m of shared) expect(disposed.has(m)).toBe(false);
    expect(reg.get(p.id)).toBeUndefined();
    expect(p.body).toBeNull();
    p.dispose(); // twice is harmless
  });
});

// ---- talking to people (v0.1): the npc binding helpers ------------------------------------------

describe('npc binding (people contract v0.1)', () => {
  const person = (x: number, y: number, z: number) => ({ root: { position: { x, y, z } }, info: { height: 1.95 } });

  it('bodySpot: a bound person is the body, else the placement', () => {
    expect(bodySpot({ x: 10, z: 20 }, undefined)).toEqual({ bound: false, x: 10, z: 20, y: null, height: null });
    expect(bodySpot({ x: 10, z: 20 }, null)).toEqual({ bound: false, x: 10, z: 20, y: null, height: null });
    expect(bodySpot({ x: 10, z: 20 }, person(1, 300, 2))).toEqual({ bound: true, x: 1, z: 2, y: 300, height: 1.95 });
    // a broken root falls back to the placement
    expect(bodySpot({ x: 10, z: 20 }, person(Number.NaN, 0, 0)).bound).toBe(false);
  });

  it('faceYaw gives the player-convention yaw toward a point', () => {
    expect(faceYaw(0, 0, 0, -5)).toBeCloseTo(0); // north
    expect(faceYaw(0, 0, 5, 0)).toBeCloseTo(-PI / 2); // east (debug 90°)
    expect(faceYaw(0, 0, -5, 0)).toBeCloseTo(PI / 2); // west
    expect(Math.abs(faceYaw(0, 0, 0, 5))).toBeCloseTo(PI); // south
  });

  it('talkCues start a newly bound talker and end the previous one once', () => {
    const a = { n: 'a' };
    const b = { n: 'b' };
    expect(talkCues(null, null)).toEqual({ start: null, end: null });
    expect(talkCues(null, a)).toEqual({ start: a, end: null });
    expect(talkCues(a, a)).toEqual({ start: null, end: null });
    expect(talkCues(a, null)).toEqual({ start: null, end: a });
    expect(talkCues(a, b)).toEqual({ start: b, end: a });
  });
});
