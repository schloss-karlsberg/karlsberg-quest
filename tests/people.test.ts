/**
 * People contract v0 / v0.1 (src/systems/people, docs/ARCHITECTURE.md "People contract v0"): the pure
 * locomotion / LOD / yaw logic, the spec table, the unknown-spec fallback, the registry, contract
 * conformance of the stand-in and of the authored MPFB guide (type level and at run time, with the
 * real GLBs loaded in node: budget, LOD1, the one shared palette material) and the npc binding
 * helpers (talking to people).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Box3, Frustum, Group, type Material, Matrix4, type Mesh, type MeshStandardMaterial, PerspectiveCamera, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import tourStory from '../content/story/00-tour.story.json';
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
import { AUTHORED_BONES, AUTHORED_CLIPS, AUTHORED_KIT, AUTHORED_SOURCE, AUTHORED_SUPPORTED, LOD1_SUFFIX, PEOPLE_EYE_MATERIAL, PEOPLE_MATERIAL, lod1Level, peopleMaterial } from '../src/systems/people/authored';
import { PeopleRegistry, type PersonFactoryArgs, type PersonRuntime } from '../src/systems/people/registry';
import { GENERIC_EXTRA, PEOPLE_AUTHORED_DEFAULT, PERSON_SPECS, SPEC_IDS, authoredBodiesOn, resolveSpec, standinColour, standinShows } from '../src/systems/people/specs';
import { STANDIN_CLIPS, STANDIN_KIT, STANDIN_SUPPORTED, type StandInLoader, StandInPerson, kitFor } from '../src/systems/people/standin';
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
  it('full within 25 m, ~10 Hz within 40 m, frozen beyond, hidden past the draw limit', () => {
    expect(PEOPLE_LOD).toMatchObject({ fullRate: 25, slowRate: 40, slowHz: 10, drawLimit: 60, drawReturnMargin: 2, lod1: 15, lod1Ratio: 0.5 });
    expect(lodFor(3)).toEqual({ rate: 'full', hidden: false });
    expect(lodFor(25)).toEqual({ rate: 'full', hidden: false });
    expect(lodFor(30)).toEqual({ rate: 'slow', hidden: false });
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
    expect(STANDIN_CLIPS.talk.talkLoop).toBeUndefined();
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
    expect(by('guide').authored?.model).toBe('chars.people.guide');
    // every other spec keeps its stand-in
    for (const s of PERSON_SPECS) if (s.id !== 'guide') expect(kitFor(s)).toBe(STANDIN_KIT);
    expect(kitFor(GENERIC_EXTRA)).toBe(STANDIN_KIT);
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

  it('grounds only the invalid coordinates and still spawns when terrain has no height', () => {
    const warn = vi.fn();
    const ground = vi.fn(() => NaN);
    const registry = new PeopleRegistry((args) => new FakePerson(args), ground, warn);
    const person = registry.spawn('extra.1', { x: Infinity, z: 12, y: NaN });
    expect(ground).toHaveBeenCalledWith(0, 12);
    expect(person.root.position.toArray()).toEqual([0, 0, 12]);
    const upstairs = registry.spawn('extra.2', { x: -7, z: NaN, y: 20 });
    expect(upstairs.root.position.toArray()).toEqual([-7, 20, 0]);
    expect(ground).toHaveBeenCalledTimes(1);
  });

  it('resumes a hidden body on return and drops its LOD stats when disposed', () => {
    const { reg } = fakeRegistry();
    const speaker = reg.spawn('double.soll', { x: 0, y: 0, z: 0, speaker: 'soll' });
    const env = { reducedMotion: true, reducedFlash: true, drawLimit: 45 };
    reg.tick(0.1, { x: 0, y: 46, z: 0 }, env);
    expect(reg.stats()).toMatchObject({ visible: 0, lod: { hidden: 1 } });
    expect(reg.bySpeaker('soll')).toBe(speaker);
    reg.tick(0.1, { x: 0, y: 20, z: 0 }, env);
    expect(reg.stats()).toMatchObject({ visible: 1, lod: { hidden: 0, full: 1 } });
    speaker.dispose();
    expect(reg.stats()).toMatchObject({ visible: 0, count: 0, lod: { full: 0 } });
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

  it('keeps the 60 m draw limit and avoids repeated toggles at the edge', () => {
    const { reg } = fakeRegistry();
    const p = reg.spawn('extra.1', { x: 0, z: 0, y: 0 });
    for (const [dist, hidden] of [[59.5, false], [60.5, true], [59.5, true], [60.5, true], [58, false], [59.5, false]] as const) {
      reg.tick(1 / 60, { x: dist, y: 0, z: 0 }, TICK);
      expect(p.ticks.at(-1)).toEqual({ rate: 'frozen', hidden });
    }
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
/** A GLB below public/assets/models/characters (or `dir`), parsed in node. */
function loadModel(file: string, dir = 'characters'): Promise<LoadedModel> {
  let p = models.get(`${dir}/${file}`);
  if (!p) {
    p = (async () => {
      await MeshoptDecoder.ready;
      const buf = readFileSync(resolve(import.meta.dirname, '../public/assets/models', dir, file));
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
      return { scene: g.scene, animations: g.animations };
    })();
    models.set(`${dir}/${file}`, p);
  }
  return p;
}
const adventurer = () => loadModel('human_adventurer.glb');
const guideGlb = () => loadModel('guide-mpfb.glb', 'chars');

/** The authored path, forced as `?people=authored` does (whatever PEOPLE_AUTHORED_DEFAULT says). */
const FORCED_AUTHORED = authoredBodiesOn(new URLSearchParams('?people=authored'));

async function realRegistry(authored = FORCED_AUTHORED) {
  const files: Record<string, string> = {
    'characters.human.adventurer': 'human_adventurer.glb',
    'characters.human.farmer': 'human_farmer.glb',
    'characters.human.woman': 'human_woman.glb',
  };
  const loaded = new Map<string, LoadedModel>();
  for (const [id, f] of Object.entries(files)) loaded.set(id, await loadModel(f));
  loaded.set('chars.people.guide', await guideGlb());
  const loader: StandInLoader = { model: async (id) => loaded.get(id)!, peek: (id) => loaded.get(id) ?? null };
  return new PeopleRegistry<StandInPerson>((a) => new StandInPerson(a.id, a.specId, a.spec, a.opts, loader, a.onDispose, kitFor(a.spec, authored)), () => 0);
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
      expect(st.body).toBe(spec.authored ? 'authored' : 'standin');
      // Walk ≈ 0.98 m per loop per metre of height, Run ≈ 1.31 (strideFromFeet on the clips' foot
      // tracks); the stand-in's width factor scales it, an authored body brings its own build
      const build = spec.authored ? 1 : spec.build;
      expect(st.stride.walk / (spec.height * build)).toBeGreaterThan(0.85);
      expect(st.stride.walk / (spec.height * build)).toBeLessThan(1.1);
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
    expect(p.state().weights.talk).toBe(0);
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

  it('culls all parts together with a world bound that holds the skinned poses', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 120, z: -40, y: 5, yaw: 1.1 });
    const c = reg.spawn('child.compass', { x: 118, z: -40, y: 5, yaw: -2 });
    await Promise.all([p.ready, c.ready]);
    const v = new Vector3();
    const camera = new PerspectiveCamera(45, 9 / 16, 0.1, 60);
    camera.position.set(120, 6, -27);
    const frustum = new Frustum();
    const intersect = vi.spyOn(frustum, 'intersectsSphere');
    const aim = (x: number, z: number) => {
      camera.lookAt(x, 6, z);
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    };
    const check = (q: Person) => {
      q.root.updateMatrixWorld(true);
      aim(q.root.position.x, q.root.position.z);
      let parts = 0;
      q.root.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isSkinnedMesh || !m.visible) return;
        parts++;
        expect(m.frustumCulled).toBe(true);
        expect(m.intersectsFrustum(frustum)).toBe(true);
        const sphere = intersect.mock.lastCall![0];
        const n = m.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i += 5) {
          m.getVertexPosition(i, v);
          expect(sphere.containsPoint(v.applyMatrix4(m.matrixWorld))).toBe(true);
        }
      });
      // a stand-in is a dozen parts, the authored guide one mesh (of the LOD shown)
      expect(parts).toBeGreaterThanOrEqual(q.info.specId === 'guide' ? 1 : 9);
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
      run(reg, 1.5, { x: 120, y: 6, z: -20 });
      check(q);
    }
    aim(120, -10);
    expect(meshesOf(c.root).filter((m) => m.visible).every((m) => !m.intersectsFrustum(frustum))).toBe(true);
    reg.clear();
  });

  it('draws solid visitors at conversational distances from their first visible frame', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('double.jost', { x: 0, z: 0 });
    expect(await p.ready).toBe(true);
    for (const dist of [5, 10, 20]) {
      reg.tick(1 / 60, { x: 0, y: 0, z: dist }, TICK);
      expect(p.root.visible).toBe(true);
      const meshes = meshesOf(p.root).filter((m) => m.visible);
      expect(meshes.length).toBeGreaterThan(0);
      for (const { material } of meshes) {
        expect(material as MeshStandardMaterial).toMatchObject({ alphaHash: false, opacity: 1, transparent: false, depthWrite: true });
      }
    }
    reg.clear();
  });

  it('draws one mesh LOD per body across the conversation range', async () => {
    const reg = await realRegistry();
    const members = tourStory.beats[0]!.enter.flatMap((action) => 'members' in action ? action.members ?? [] : []);
    const group = ['guide', ...members].map((id) => reg.spawn(id, { x: 0, z: 0 }));
    expect(await Promise.all(group.map((p) => p.ready))).toEqual(Array(15).fill(true));
    for (const [z, tris] of [[10, 118_392], [20, 112_431]] as const) {
      reg.tick(1 / 60, { x: 0, y: 0, z }, TICK);
      expect(reg.stats()).toMatchObject({ count: 15, visible: 15, drawCalls: 161, tris, lod: { full: 15 } });
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

// ---- the authored guide (MPFB build, one shared palette material) -------------------------------

const meshesOf = (root: { traverse(f: (o: unknown) => void): void }): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};
const trisOf = (ms: readonly Mesh[]) => ms.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);

describe('authored guide (MPFB build behind the contract)', () => {
  it('the GLB fits the featured budget: ≤ 12k tris and ≤ 4 draw calls per LOD, LOD1 at about half, skinned to the same rig', async () => {
    const g = await guideGlb();
    const all = meshesOf(g.scene);
    const lod0 = all.filter((m) => !m.name.endsWith(LOD1_SUFFIX));
    const lod1 = all.filter((m) => m.name.endsWith(LOD1_SUFFIX));
    expect(lod0.length).toBeGreaterThan(0);
    expect(lod1.length).toBeGreaterThan(0);
    // GLTFLoader makes one Mesh per primitive: one draw call each
    expect(lod0.length).toBeLessThanOrEqual(TIER_BUDGET.featured.drawCalls);
    expect(lod1.length).toBeLessThanOrEqual(TIER_BUDGET.featured.drawCalls);
    expect(trisOf(lod0)).toBeLessThanOrEqual(TIER_BUDGET.featured.tris);
    const ratio = trisOf(lod1) / trisOf(lod0);
    expect(ratio).toBeGreaterThan(PEOPLE_LOD.lod1Ratio - 0.1);
    expect(ratio).toBeLessThan(PEOPLE_LOD.lod1Ratio + 0.1);
    // the palette material (plus the eyes' own, budget.eye_call), colours in the vertices; LOD1 drives the same bones
    for (const m of all) {
      expect([PEOPLE_MATERIAL, PEOPLE_EYE_MATERIAL]).toContain((m.material as Material).name);
      expect(m.geometry.getAttribute('color')).toBeTruthy();
      expect((m as SkinnedMesh).isSkinnedMesh).toBe(true);
    }
    const bones0 = (lod0[0] as SkinnedMesh).skeleton.bones;
    expect((lod1[0] as SkinnedMesh).skeleton.bones).toEqual(bones0);
    expect(bones0.length).toBe(53);
  });

  it('one clip table: every MPFB source clip is in the GLB, the upper-body split cuts each one', async () => {
    const g = await guideGlb();
    for (const names of Object.values(AUTHORED_SOURCE)) expect(g.animations.some((a) => (names as readonly string[]).includes(a.name))).toBe(true);
    for (const n of ['Idle', 'Walk', 'Run', 'Interact', 'Wave', 'Point', 'Talk']) {
      const c = g.animations.find((a) => a.name === n)!;
      const up = c.tracks.filter((t) => AUTHORED_BONES.upper.test(t.name.split('.')[0]!));
      expect(up.length).toBeGreaterThan(10);
      expect(c.tracks.length - up.length).toBeGreaterThan(5);
    }
    expect(Object.keys(AUTHORED_CLIPS).sort()).toEqual([...ALL_CLIPS].sort());
    for (const c of AUTHORED_SUPPORTED) expect(AUTHORED_CLIPS[c].native).toBe(true);
    // the authored body points for real (the baked Point clip); only the sits fall back
    expect(resolveClip('point', AUTHORED_SUPPORTED)).toBe('point');
    expect([...AUTHORED_SUPPORTED].sort()).toEqual(['idle', 'interact', 'lookAround', 'point', 'run', 'talk', 'walk', 'wave']);
    expect(resolveClip('sit', AUTHORED_SUPPORTED)).toBe('idle');
    // talk is the baked Talk loop (about 4 s), the gestures are the fallback of a GLB without it
    expect(AUTHORED_CLIPS.talk.talkLoop).toBe(true);
    expect(AUTHORED_CLIPS.talk.gestures).toBeUndefined();
    const talk = g.animations.find((a) => a.name === 'Talk')!;
    expect(talk.duration).toBeGreaterThan(3.5);
    expect(talk.duration).toBeLessThan(4.5);
  });

  it('authored talk plays the Talk loop in place of idle: no Interact gestures, walking takes over, reduced motion stands', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 0, z: 0, yaw: 0 });
    await p.ready;
    run(reg, 0.5);
    p.play('talk');
    run(reg, 0.8);
    expect(p.state().playing).toBe('talk');
    expect(p.state().weights.talk).toBeGreaterThan(0.9);
    expect(p.state().weights.idle).toBeLessThan(0.1);
    // the hands are the clip's: no auto Interact one-shot over a whole loop
    for (let i = 0; i < 10; i++) {
      run(reg, 0.5);
      expect(p.state().shot).toBeNull();
      expect(p.state().weights.interact).toBeLessThan(0.01);
    }
    // the right hand comes up to the chest early in the loop (the clock starts with talk)
    const hand = p.body!.getObjectByName('hand_r')!;
    const handY = () => {
      p.root.updateMatrixWorld(true);
      return p.root.worldToLocal(hand.getWorldPosition(new Vector3())).y;
    };
    p.play('idle');
    run(reg, 1);
    const rest = handY();
    p.play('talk');
    run(reg, 1.2);
    expect(handY() - rest).toBeGreaterThan(0.15);
    // walking overrides it; standing again, it comes back
    p.setSpeed(1.4);
    run(reg, 0.8);
    expect(p.state().weights.walk).toBeGreaterThan(0.9);
    expect(p.state().weights.talk).toBeLessThan(0.1);
    p.setSpeed(0);
    run(reg, 1);
    expect(p.state().weights.talk).toBeGreaterThan(0.9);
    // reduced motion: no talking hands, he stands (idle)
    for (let i = 0; i < 60; i++) reg.tick(1 / 60, { x: 0, y: 1.6, z: 0 }, { ...TICK, reducedMotion: true });
    expect(p.state().weights.talk).toBeLessThan(0.1);
    expect(p.state().weights.idle).toBeGreaterThan(0.9);
    reg.clear();
  });

  it('the authored-bodies switch: ?people=authored / ?people=standin force a mode, else PEOPLE_AUTHORED_DEFAULT', async () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(authoredBodiesOn(q(''))).toBe(PEOPLE_AUTHORED_DEFAULT);
    expect(authoredBodiesOn(q('?people=other'), false)).toBe(false);
    expect(authoredBodiesOn(q('?people=other'), true)).toBe(true);
    // forced, whatever the default
    for (const fallback of [true, false]) {
      expect(authoredBodiesOn(q('?people=authored'), fallback)).toBe(true);
      expect(authoredBodiesOn(q('?people=standin'), fallback)).toBe(false);
    }
    const guide = resolveSpec('guide').spec;
    expect(kitFor(guide, true)).toBe(AUTHORED_KIT);
    expect(kitFor(guide, false)).toBe(STANDIN_KIT);
    expect(kitFor(resolveSpec('extra.1').spec, true)).toBe(STANDIN_KIT);
    // forced authored: the guide draws its MPFB body
    const on = await realRegistry(authoredBodiesOn(q('?people=authored'), false));
    const a = on.spawn('guide', { x: 0, z: -6 });
    expect(await a.ready).toBe(true);
    expect(a.state().body).toBe('authored');
    expect(a.info.clips).toEqual(AUTHORED_SUPPORTED);
    on.clear();
    // forced stand-in: the same spec on its Quaternius stand-in, the same contract numbers
    const off = await realRegistry(authoredBodiesOn(q('?people=standin'), true));
    const b = off.spawn('guide', { x: 0, z: -6 });
    expect(await b.ready).toBe(true);
    run(off, 0.3);
    expect(b.state().body).toBe('standin');
    expect(b.info).toMatchObject({ specId: 'guide', tier: 'featured', height: 1.95, radius: 0.3 });
    expect(b.info.clips).toEqual(STANDIN_SUPPORTED);
    off.clear();
  });

  it('lod1Level switches at 15 m with hysteresis', () => {
    expect(lod1Level(5, 0)).toBe(0);
    expect(lod1Level(20, 0)).toBe(1);
    expect(lod1Level(15.2, 1)).toBe(1);
    expect(lod1Level(15.2, 0)).toBe(0);
    expect(lod1Level(14, 1)).toBe(0);
    expect(lod1Level(Number.NaN, 1)).toBe(1);
  });

  it('spawn("guide") draws the authored body: ready, 1.95 m, featured budget, info.clips, MPFB strides', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 0, z: -6 });
    expect(await p.ready).toBe(true);
    run(reg, 0.3);
    const st = p.state();
    expect(st.body).toBe('authored');
    expect(st.fallback).toBe(false);
    expect(st.lodLevel).toBe(0);
    expect(p.info).toMatchObject({ specId: 'guide', tier: 'featured', height: 1.95, radius: 0.3 });
    expect(p.info.clips).toEqual(AUTHORED_SUPPORTED);
    expect(st.drawCalls).toBeGreaterThan(0);
    expect(st.drawCalls).toBeLessThanOrEqual(TIER_BUDGET.featured.drawCalls);
    expect(st.tris).toBeLessThanOrEqual(TIER_BUDGET.featured.tris);
    expect(st.stride.measured).toBe(true);
    // standing in the idle pose: about the spec height (head top, feet on the ground)
    p.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(p.body!, true);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.85);
    expect(box.max.y - box.min.y).toBeLessThan(2.0);
    expect(Math.abs(box.min.y)).toBeLessThan(0.05);
    reg.clear();
  });

  it('LOD1 beyond 15 m (with hysteresis): half the triangles, the same draw calls', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 0, z: 0 });
    await p.ready;
    run(reg, 0.1, { x: 0, y: 1.6, z: 10 });
    const near = p.drawStats();
    expect(p.state().lodLevel).toBe(0);
    run(reg, 0.1, { x: 0, y: 1.6, z: 20 });
    const far = p.drawStats();
    expect(p.state().lodLevel).toBe(1);
    expect(far.calls).toBe(near.calls);
    expect(far.tris / near.tris).toBeGreaterThan(0.4);
    expect(far.tris / near.tris).toBeLessThan(0.6);
    // only the LOD shown is drawn
    const shown = meshesOf(p.root).filter((m) => m.visible);
    expect(shown.length).toBe(far.calls);
    expect(shown.every((m) => m.name.endsWith(LOD1_SUFFIX))).toBe(true);
    run(reg, 0.1, { x: 0, y: 1.6, z: 15.2 });
    expect(p.state().lodLevel).toBe(1);
    run(reg, 0.1, { x: 0, y: 1.6, z: 14 });
    expect(p.state().lodLevel).toBe(0);
    reg.clear();
  });

  it('one shared material instance across people: never cloned, never disposed by a person', async () => {
    const reg = await realRegistry();
    const a = reg.spawn('guide', { x: 0, z: -5 });
    const b = reg.spawn('guide', { x: 2, z: -5, yaw: 1 });
    await Promise.all([a.ready, b.ready]);
    run(reg, 0.2);
    const mats = (q: Person) => new Set(meshesOf(q.root).filter((m) => m.visible).map((m) => m.material as Material));
    const shared = peopleMaterial();
    expect([...mats(a)]).toEqual([shared]);
    expect([...mats(b)]).toEqual([shared]);
    expect(shared.vertexColors).toBe(true);
    // the ghost look is per person; back to solid is the shared instance again
    a.setLook('ghost');
    run(reg, 0.1);
    expect(mats(a).has(shared)).toBe(false);
    a.setLook('solid');
    run(reg, 0.1);
    expect([...mats(a)]).toEqual([shared]);
    let disposed = false;
    shared.addEventListener('dispose', () => (disposed = true));
    a.dispose();
    expect(disposed).toBe(false);
    expect([...mats(b)]).toEqual([shared]);
    reg.clear();
    expect(disposed).toBe(false);
  });

  it('contract conformance on the authored body: locomotion, one-shots, fallbacks, lookAt, looks', async () => {
    const reg = await realRegistry();
    const p = reg.spawn('guide', { x: 0, z: 0, yaw: 0 });
    await p.ready;
    run(reg, 0.3);
    expect(p.state().weights.idle).toBeGreaterThan(0.95);
    p.setSpeed(1.4);
    run(reg, 0.6);
    expect(p.state().weights.walk).toBeGreaterThan(0.95);
    // the MPFB feet travel through the stride while walking (root frame), under the body
    const foot = p.body!.getObjectByName('foot_l')!;
    const at = () => {
      p.root.updateMatrixWorld(true);
      return p.root.worldToLocal(foot.getWorldPosition(new Vector3()));
    };
    const f0 = at();
    run(reg, 0.3);
    const f1 = at();
    expect(Math.hypot(f1.x - f0.x, f1.y - f0.y, f1.z - f0.z)).toBeGreaterThan(0.1);
    expect(Math.abs(f1.z)).toBeLessThan(0.8);
    p.setSpeed(4.5);
    run(reg, 0.6);
    expect(p.state().weights.run).toBeGreaterThan(0.95);
    p.setSpeed(0);
    run(reg, 0.8);
    p.play('wave');
    run(reg, 0.5);
    expect(p.state().shot).toBe('wave');
    expect(p.state().weights.wave).toBeGreaterThan(0.5);
    run(reg, 2.5);
    expect(p.state().weights.wave).toBeLessThan(0.05);
    p.play('point');
    expect(p.state().playing).toBe('point');
    run(reg, 0.5);
    expect(p.state().shot).toBe('point');
    expect(p.state().weights.point).toBeGreaterThan(0.5);
    expect(p.state().weights.interact).toBeLessThan(0.05);
    run(reg, 1.6);
    expect(p.state().weights.point).toBeLessThan(0.05);
    p.play('talk');
    run(reg, 0.5);
    expect(p.state().playing).toBe('talk');
    p.play('sit');
    run(reg, 2);
    expect(p.state().playing).toBe('idle');
    expect(p.state().drop).toBeGreaterThan(0.3);
    p.play('idle');
    p.lookAt({ x: 3, y: 1.9, z: -1 });
    run(reg, 1.5);
    expect(p.state().head.yaw).toBeLessThan(-0.4);
    expect(Math.abs(p.state().head.yaw)).toBeLessThanOrEqual(HEAD_YAW + 1e-6);
    p.lookAt(null);
    p.face(PI / 2);
    run(reg, 1.5);
    expect(p.root.rotation.y).toBeCloseTo(PI / 2, 2);
    const solid = p.drawStats();
    p.setLook('ghost');
    run(reg, 0.1);
    expect(p.drawStats().calls).toBe(solid.calls * 2);
    p.setVisible(false);
    run(reg, 0.1);
    expect(p.drawStats()).toEqual({ tris: 0, calls: 0 });
    p.dispose();
    expect(reg.list()).toEqual([]);
    expect(p.root.parent).toBeNull();
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
