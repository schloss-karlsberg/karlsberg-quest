/** The end-of-game party (src/systems/party): the runtime with fake people, bus, set, strip and cinematic. */
import { describe, expect, it } from 'vitest';
import { CAM_MAX, ORBIT, PLACEHOLDER_LINES, creditLines, creditsPlan, stripAt } from '../src/systems/party/credits';
import { DOUBLES, PROPS, TF01, partyLayout, propsFor } from '../src/systems/party/placements';
import { CREDITS_CINEMATIC, PartyRuntime, type PartyBus, type PersonLike } from '../src/systems/party/runtime';
import type { PartySetHandle } from '../src/systems/party/set';
import type { PartySlice, PartyVariant } from '../src/systems/party/types';

const DT = 1 / 60;

class FakeBus implements PartyBus {
  readonly handlers = new Map<string, ((p: never) => void)[]>();
  readonly log: { n: string; p: any }[] = [];
  on(name: string, fn: (p: never) => void): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }
  emit(name: string, payload: unknown): void {
    this.log.push({ n: name, p: payload });
    for (const fn of this.handlers.get(name) ?? []) fn(payload as never);
  }
  of(name: string): any[] {
    return this.log.filter((e) => e.n === name).map((e) => e.p);
  }
}

interface FakePerson extends PersonLike {
  spec: string;
  opts: any;
  clips: string[];
  visible: boolean;
  disposed: boolean;
}

interface FakeSet extends PartySetHandle {
  variant: PartyVariant;
  props: string[];
  bursts: number;
  disposed: boolean;
  visible: boolean;
}

function setup(o: { file?: unknown; cinematic?: 'auto' | 'none' | 'reject'; reduced?: boolean; slice?: PartySlice; specs?: string[] } = {}) {
  const bus = new FakeBus();
  const people: FakePerson[] = [];
  const sets: FakeSet[] = [];
  const strip = { shown: [] as string[][], hidden: 0, renders: 0 };
  const world = { era: 'today', player: { x: 1200, z: -1095 } };
  const slice: PartySlice = o.slice ?? { variant: null, credits: 'none' };
  // a fake cinematic system: answers cinematic:play with start (or a rejection), stop = end skipped
  const cine = { playing: null as string | null, plays: [] as any[] };
  const mode = o.cinematic ?? 'auto';
  if (mode !== 'none') {
    bus.on('cinematic:play', (p: any) => {
      cine.plays.push(p);
      if (mode === 'reject') {
        bus.emit('cinematic:end', { id: p.id, skipped: true });
        return;
      }
      cine.playing = p.id;
      bus.emit('cinematic:start', { id: p.id, seconds: p.keys.at(-1).t });
    });
  }
  const endCine = (skipped: boolean) => {
    const id = cine.playing;
    if (!id) return;
    cine.playing = null;
    bus.emit('cinematic:end', { id, skipped });
  };
  let n = 0;
  const rt = new PartyRuntime({
    bus,
    log: () => {},
    people: () => ({
      specs: () => o.specs ?? ['guide', ...DOUBLES, 'child.compass', 'extra.1', 'extra.2', 'extra.3', 'extra.4', 'extra.5', 'extra.6', 'extra.7'],
      spawn: (spec, opts) => {
        const p: FakePerson = {
          id: `p${++n}`,
          specId: spec,
          spec,
          opts,
          root: { position: { x: opts.x, y: opts.y ?? 0, z: opts.z } },
          clips: [],
          visible: true,
          disposed: false,
          play: (c) => p.clips.push(c),
          face: () => {},
          setVisible: (v) => (p.visible = v),
          dispose: () => (p.disposed = true),
        };
        people.push(p);
        return p;
      },
    }),
    buildSet: (layout, variant) => {
      const s: FakeSet = {
        variant,
        props: propsFor(variant),
        bursts: 0,
        disposed: false,
        visible: true,
        root: {} as never,
        anchors: Object.fromEntries(propsFor(variant).map((k) => [k, { ...layout.props[k], y: 300 }])),
        setFire: () => {},
        burst: () => s.bursts++,
        update: () => {},
        setVisible: (v) => (s.visible = v),
        drawCalls: () => 2,
        dispose: () => (s.disposed = true),
      };
      sets.push(s);
      return s;
    },
    world: { heightAt: () => 300, player: () => world.player, era: () => world.era },
    slice: () => slice,
    creditsFile: () => o.file,
    reduced: () => o.reduced === true,
    strip: {
      show: (lines) => strip.shown.push([...lines]),
      render: () => strip.renders++,
      hide: () => strip.hidden++,
    },
    cinematic: {
      available: () => mode !== 'none',
      playing: () => cine.playing,
      stop: () => endCine(true),
    },
  });
  const step = (seconds: number) => {
    const k = Math.round(seconds / DT);
    for (let i = 0; i < k; i++) {
      rt.update(DT);
      rt.frame(DT);
    }
  };
  return { bus, rt, people, sets, strip, world, slice, cine, endCine, step };
}

const live = (people: FakePerson[]) => people.filter((p) => !p.disposed);
const byName = (people: FakePerson[], who: string) => live(people).find((p) => p.opts.name === `party:${who}`)!;

describe('party placements (bible 06 §8.1)', () => {
  it('16 people round TF-01 (guide, Marlene, 7 doubles, 7 extras), props in the clearing, moved with `at`', () => {
    const L = partyLayout('keep');
    expect(L.people).toHaveLength(16);
    expect(L.people.filter((p) => p.double).map((p) => p.who)).toEqual([...DOUBLES]);
    expect(L.people.find((p) => p.who === 'guide')).toMatchObject({ spec: 'guide', speaker: 'imhoff', x: 1214, z: -1112 });
    for (const p of L.people) expect(Math.hypot(p.x - TF01.x, p.z - TF01.z)).toBeLessThan(14);
    for (const k of Object.keys(PROPS) as (keyof typeof PROPS)[]) expect(Math.hypot(PROPS[k].x - TF01.x, PROPS[k].z - TF01.z)).toBeLessThan(14);
    const M = partyLayout('keep', { x: TF01.x + 10, z: TF01.z - 5 });
    expect(M.people[3]!.x - L.people[3]!.x).toBeCloseTo(10);
    expect(M.props.fireBowl.z - L.props.fireBowl.z).toBeCloseTo(-5);
    // no two people on the same spot
    for (const v of ['museum', 'burn', 'keep'] as const) {
      const ps = partyLayout(v).people;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.z - ps[j]!.z), `${v} ${ps[i]!.who}/${ps[j]!.who}`).toBeGreaterThan(0.6);
    }
  });
});

describe('party runtime', () => {
  it.each([
    ['museum', 'npc:double.jost', 0],
    ['burn', undefined, 0],
    ['keep', 'player', 0.6],
  ] as const)('variant %s spawns the people, the set and the dogs, then emits party:ready', (variant, follow, shine) => {
    const c = setup();
    c.bus.emit('party:set', { variant });
    expect(live(c.people)).toHaveLength(16);
    expect(c.sets).toHaveLength(1);
    expect(c.sets[0]!.props.includes('archiveBox')).toBe(variant === 'museum');
    expect(c.sets[0]!.props).toEqual(expect.arrayContaining(['table', 'cake', 'pot', 'stove', 'fireBowl', 'lightsA', 'lightsB', 'lantern1', 'lantern2', 'chair']));
    expect(c.sets[0]!.bursts).toBe(variant === 'burn' ? 1 : 0);
    // speakers bound: the guide, Marlene (stand-in), the doubles
    expect(byName(c.people, 'guide').opts.speaker).toBe('imhoff');
    expect(byName(c.people, 'marlene')).toMatchObject({ spec: 'extra.7', opts: { speaker: 'marlene', seed: 9071 } });
    expect(byName(c.people, 'double.jost').opts.speaker).toBe('jostd');
    expect(byName(c.people, 'mats').spec).toBe('child.compass');
    // dogs through the animals system
    const req = c.bus.of('animal:request');
    expect(req.filter((r) => r.op === 'spawn').map((r) => [r.id, r.kind, r.look])).toEqual([
      ['diane', 'hund', 'diane'],
      ['bijou', 'hund', 'bijou'],
    ]);
    const lie = req.filter((r) => r.op === 'lie');
    expect(lie).toHaveLength(2);
    if (follow) expect(lie.every((r) => r.follow === follow)).toBe(true);
    else expect(lie.every((r) => typeof r.x === 'number' && Math.hypot(r.x - PROPS.fireBowl.x, r.z - PROPS.fireBowl.z) > 10)).toBe(true);
    expect(req.filter((r) => r.op === 'shine')).toEqual(shine ? [{ op: 'shine', id: 'diane', k: shine }, { op: 'shine', id: 'bijou', k: shine }] : []);
    expect(c.bus.of('party:ready')).toEqual([{ variant }]);
    expect(c.slice.variant).toBe(variant);
  });

  it('per-variant activities: museum leans in round the guide, burn rings the fire bowl, sitters sit', () => {
    const m = setup();
    m.bus.emit('party:set', { variant: 'museum' });
    const g = byName(m.people, 'guide');
    expect(g.clips).toContain('talk');
    const hanne = byName(m.people, 'double.hanne');
    expect(Math.hypot(hanne.opts.x - g.opts.x, hanne.opts.z - g.opts.z)).toBeLessThan(1.5);
    // neighbours face him (yaw toward the guide)
    const yawTo = (a: any, b: any) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
    expect(hanne.opts.yaw).toBeCloseTo(yawTo(hanne.opts, g.opts));
    expect(byName(m.people, 'double.herzog').clips).toContain('sit');
    const b = setup();
    b.bus.emit('party:set', { variant: 'burn' });
    for (const who of ['guide', 'double.mannlich', 'double.liese', 'marlene']) {
      const p = byName(b.people, who);
      expect(Math.hypot(p.opts.x - PROPS.fireBowl.x, p.opts.z - PROPS.fireBowl.z)).toBeLessThan(3);
    }
    // interact people repeat their one-shot
    const k = setup();
    k.bus.emit('party:set', { variant: 'keep' });
    const soll = byName(k.people, 'double.soll');
    const before = soll.clips.filter((c) => c === 'interact').length;
    k.step(20);
    expect(soll.clips.filter((c) => c === 'interact').length).toBeGreaterThan(before + 1);
  });

  it('the cue bridge: story:cue party:set / party:credits / party:clear', () => {
    const c = setup();
    c.bus.emit('story:cue', { id: 'party:set', data: { variant: 'burn', at: { x: 1220, z: -1110 } } });
    expect(c.bus.of('party:ready')).toEqual([{ variant: 'burn' }]);
    expect(c.rt.party!.layout.centre).toEqual({ x: 1220, z: -1110 });
    c.bus.emit('story:cue', { id: 'party:credits', data: { lines: ['Eins', 'Zwei'] } });
    expect(c.bus.of('credits:start')).toHaveLength(1);
    expect(c.strip.shown).toEqual([['Eins', 'Zwei']]);
    c.bus.emit('story:cue', { id: 'party:clear' });
    expect(c.rt.party).toBeNull();
    expect(c.bus.of('credits:done')).toEqual([{ skipped: true }]);
    // a bad variant does nothing
    c.bus.emit('story:cue', { id: 'party:set', data: { variant: 'fireworks' } });
    expect(c.rt.party).toBeNull();
    expect(c.bus.of('party:ready')).toHaveLength(1);
  });

  it('credits: a keys cinematic round the party (lockInput false), spotlights in order once each, credits:done once at the natural end', () => {
    const c = setup();
    c.bus.emit('party:set', { variant: 'keep' });
    c.bus.emit('party:credits', {});
    const play = c.cine.plays[0];
    expect(play).toMatchObject({ id: CREDITS_CINEMATIC, skippable: true, lockInput: false });
    expect(play.keys.at(-1).t).toBeLessThanOrEqual(60);
    const [start] = c.bus.of('credits:start');
    expect(start.seconds).toBeGreaterThanOrEqual(play.keys.at(-1).t);
    // the cinematic ends on its own at the end of its keys (not skipped): the credits run on
    c.step(play.keys.at(-1).t + 0.05);
    c.endCine(false);
    expect(c.bus.of('credits:done')).toHaveLength(0);
    c.step(start.seconds);
    const spots = c.bus.of('party:spotlight');
    expect(spots.map((s) => s.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(spots.map((s) => s.who))).toEqual(new Set(DOUBLES));
    expect(c.bus.of('credits:done')).toEqual([{ skipped: false }]);
    expect(c.strip.hidden).toBe(1);
    expect(c.slice.credits).toBe('done');
    // afterwards: the party stands, nothing more
    c.step(10);
    expect(c.bus.of('credits:done')).toHaveLength(1);
    expect(live(c.people)).toHaveLength(16);
    expect(c.cine.playing).toBeNull();
  });

  it('credits:done once on a skip: the cinematic skip, the strip keys after the grace, kq.party.skip()', () => {
    // the cinematic's skip
    const a = setup();
    a.bus.emit('party:set', { variant: 'burn' });
    a.bus.emit('party:credits', {});
    a.step(5);
    expect(a.rt.userSkip()).toBe(false); // the cinematic owns the skip while it plays
    a.endCine(true);
    expect(a.bus.of('credits:done')).toEqual([{ skipped: true }]);
    a.step(80);
    expect(a.bus.of('credits:done')).toHaveLength(1);
    expect(a.bus.of('party:spotlight').length).toBeLessThan(7);
    // no cinematic system: the strip's own keys after the grace
    const b = setup({ cinematic: 'none' });
    b.bus.emit('party:credits', {});
    expect(b.rt.userSkip()).toBe(false);
    b.step(1.5);
    expect(b.rt.userSkip()).toBe(true);
    expect(b.rt.userSkip()).toBe(false);
    expect(b.bus.of('credits:done')).toEqual([{ skipped: true }]);
    // the debug skip stops our cinematic too (its end is not a second done)
    const d = setup();
    d.bus.emit('party:set', { variant: 'museum' });
    d.bus.emit('party:credits', {});
    d.step(2);
    d.rt.skip();
    expect(d.cine.playing).toBeNull();
    expect(d.bus.of('credits:done')).toEqual([{ skipped: true }]);
    expect(d.bus.of('cinematic:end')).toEqual([{ id: CREDITS_CINEMATIC, skipped: true }]);
  });

  it('a rejected camera (held elsewhere) does not end the credits', () => {
    const c = setup({ cinematic: 'reject' });
    c.bus.emit('party:set', { variant: 'keep' });
    c.bus.emit('party:credits', {});
    expect(c.bus.of('credits:done')).toHaveLength(0);
    expect(c.rt.credits!.cam).toBe('off');
    c.step(c.rt.credits!.plan.seconds + 0.1);
    expect(c.bus.of('credits:done')).toEqual([{ skipped: false }]);
    expect(c.bus.of('party:spotlight')).toHaveLength(7);
  });

  it('party:clear disposes the people, the set and the dogs', () => {
    const c = setup();
    c.bus.emit('party:set', { variant: 'keep' });
    c.bus.emit('party:clear', {});
    expect(c.people.every((p) => p.disposed)).toBe(true);
    expect(c.sets[0]!.disposed).toBe(true);
    expect(c.bus.of('animal:request').filter((r) => r.op === 'despawn').map((r) => r.id)).toEqual(['diane', 'bijou']);
    expect(c.slice.variant).toBeNull();
    expect(c.bus.of('credits:done')).toHaveLength(0);
    // a new party:set replaces the old one
    c.bus.emit('party:set', { variant: 'museum' });
    c.bus.emit('party:set', { variant: 'burn' });
    expect(live(c.people)).toHaveLength(16);
    expect(c.sets.filter((s) => !s.disposed)).toHaveLength(1);
  });

  it('other eras hide the party; conversations hold the gestures', () => {
    const c = setup();
    c.bus.emit('party:set', { variant: 'keep' });
    c.world.era = '1789';
    c.bus.emit('era:change', { from: 'today', to: '1789' });
    expect(live(c.people).every((p) => !p.visible)).toBe(true);
    expect(c.sets[0]!.visible).toBe(false);
    c.world.era = 'today';
    c.bus.emit('era:change', { from: '1789', to: 'today' });
    expect(live(c.people).every((p) => p.visible)).toBe(true);
    const soll = byName(c.people, 'double.soll');
    c.bus.emit('npc:conversation', { npc: 'solld', open: true });
    const n = soll.clips.length;
    c.step(20);
    expect(soll.clips.length).toBe(n);
    c.bus.emit('npc:conversation', { npc: 'solld', open: false });
    expect(soll.clips.length).toBeGreaterThan(n);
  });

  it('the credits file and its fallback; data.lines overrides both', () => {
    expect(creditLines(undefined, undefined)).toEqual(PLACEHOLDER_LINES);
    expect(creditLines(undefined, { lines: ['A', ' ', 'B'] })).toEqual(['A', 'B']);
    expect(creditLines(['X'], { lines: ['A'] })).toEqual(['X']);
    expect(creditLines([], { lines: [] })).toEqual(PLACEHOLDER_LINES);
    const f = setup({ file: { lines: ['Aus der Datei'] } });
    f.bus.emit('party:credits', {});
    expect(f.strip.shown).toEqual([['Aus der Datei']]);
    const g = setup({ file: { lines: ['Aus der Datei'] } });
    g.bus.emit('party:credits', { lines: ['Override'] });
    expect(g.strip.shown).toEqual([['Override']]);
    const h = setup();
    h.bus.emit('party:credits', {});
    expect(h.strip.shown).toEqual([PLACEHOLDER_LINES]);
  });

  it('resume: credits playing at save time end skipped once (game start or load); no party in the save clears', () => {
    const a = setup({ slice: { variant: 'keep', credits: 'playing' } });
    a.bus.emit('game:start', { resumed: true });
    expect(a.bus.of('credits:done')).toEqual([{ skipped: true }]);
    a.bus.emit('game:start', { resumed: true });
    expect(a.bus.of('credits:done')).toHaveLength(1);
    expect(a.slice.credits).toBe('done');
    // a load while the credits play: one done for the live run (the saved one was 'playing' too)
    const b = setup();
    b.bus.emit('party:set', { variant: 'burn' });
    b.bus.emit('party:credits', {});
    b.slice.credits = 'playing';
    b.slice.variant = null;
    b.bus.emit('save:loaded', { slot: 'auto' });
    expect(b.bus.of('credits:done')).toEqual([{ skipped: true }]);
    expect(b.strip.hidden).toBe(1);
    expect(b.rt.party).toBeNull();
    b.step(80);
    expect(b.bus.of('credits:done')).toHaveLength(1);
    expect(b.bus.of('party:spotlight')).toHaveLength(0);
    // a save that held no credits: nothing
    const c = setup({ slice: { variant: null, credits: 'done' } });
    c.bus.emit('game:start', { resumed: true });
    expect(c.bus.of('credits:done')).toHaveLength(0);
  });
});

describe('credits plan', () => {
  it('orbits r 14 round the centre, lingers 2–3 s per double in angle order, stays within the cinematic key limit', () => {
    for (const v of ['museum', 'burn', 'keep'] as const) {
      const L = partyLayout(v);
      const doubles = L.people.filter((p) => p.double);
      const plan = creditsPlan(L.centre, doubles, 3);
      expect(plan.spots).toHaveLength(7);
      expect(plan.camSeconds).toBeLessThanOrEqual(CAM_MAX);
      for (let i = 1; i < plan.keys.length; i++) expect(plan.keys[i]!.t).toBeGreaterThan(plan.keys[i - 1]!.t);
      for (const k of plan.keys) {
        const e = k.eye as { x: number; z: number };
        expect(Math.hypot(e.x - L.centre.x, e.z - L.centre.z)).toBeCloseTo(ORBIT.r, 1);
      }
      // a dwell key right after each spot looks at that double
      for (const s of plan.spots) {
        const d = doubles.find((p) => p.who === s.who)!;
        const k = plan.keys.find((q) => Math.abs(q.t - (s.t + ORBIT.dwell)) < 1e-6)!;
        expect(k.look).toMatchObject({ x: d.x, z: d.z });
      }
      for (let i = 1; i < plan.spots.length; i++) expect(plan.spots[i]!.t - plan.spots[i - 1]!.t).toBeGreaterThanOrEqual(ORBIT.dwell);
    }
    // many lines: the strip sets the length
    const L = partyLayout('keep');
    expect(creditsPlan(L.centre, L.people.filter((p) => p.double), 40).seconds).toBe(160);
    expect(stripAt(5, 10, 4, true)).toEqual({ crawl: 0.5, line: 2 });
    expect(stripAt(20, 10, 4, false).crawl).toBe(1);
  });
});
