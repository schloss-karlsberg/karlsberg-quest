/** The end-of-game party (src/systems/party): the runtime with fake people, bus, set, strip and cinematic. */
import { describe, expect, it } from 'vitest';
import { creditLines, creditSections } from '../src/systems/party/creditContent';
import { CAM_MAX, ORBIT, creditsPlan } from '../src/systems/party/credits';
import { DOUBLES, PROPS, SPOT_LAST, SPOT_ROUND, TF01, partyLayout, propsFor } from '../src/systems/party/placements';
import { CREDITS_CINEMATIC, PartyRuntime, type PartyBus, type PersonLike } from '../src/systems/party/runtime';
import type { PartySetHandle } from '../src/systems/party/set';
import { PARTY_VARIANTS, type PartySlice, type PartyVariant } from '../src/systems/party/types';

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

function setup(o: { lines?: readonly string[]; cinematic?: 'auto' | 'none' | 'reject'; reduced?: boolean; slice?: PartySlice; specs?: string[] } = {}) {
  const bus = new FakeBus();
  const people: FakePerson[] = [];
  const sets: FakeSet[] = [];
  const strip = { shown: [] as string[][], reduced: false, hidden: 0, renders: 0, camera: [] as boolean[] };
  const world = { era: 'today', player: { x: 1200, z: -1095, yaw: 0.5, pitch: 0 } };
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
  if (mode !== 'none') bus.on('cinematic:stop', (p: any) => p?.id === cine.playing && endCine(true));
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
    defaultLines: o.lines ?? ['Karlsberg Quest', 'Danke fürs Spielen'],
    reduced: () => o.reduced === true,
    strip: {
      show: (lines, reduced) => {
        strip.shown.push([...lines]);
        strip.reduced = reduced;
      },
      camera: (on) => strip.camera.push(on),
      render: () => strip.renders++,
      hide: () => strip.hidden++,
    },
    cinematic: {
      available: () => mode !== 'none',
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

  it('world:quiet: held from party:set until the end of the credits or party:clear, once each way', () => {
    const quiet = (c: ReturnType<typeof setup>) => c.bus.of('world:quiet');
    // natural end of the credits: the world wakes for the free play, the party stays
    const a = setup();
    a.bus.emit('party:set', { variant: 'museum' });
    const ready = a.bus.log.findIndex((e) => e.n === 'party:ready');
    expect(a.bus.log.findIndex((e) => e.n === 'world:quiet')).toBeLessThan(ready);
    expect(quiet(a)).toEqual([{ on: true, reason: 'party' }]);
    a.bus.emit('party:credits', {});
    a.step(Math.ceil((a.rt.credits!.plan.seconds + 1) / DT));
    expect(a.bus.of('credits:done')).toEqual([{ skipped: false }]);
    expect(quiet(a)).toEqual([
      { on: true, reason: 'party' },
      { on: false, reason: 'party' },
    ]);
    expect(a.rt.party).not.toBeNull();
    // party:clear without credits (a re-set keeps the one hold)
    const b = setup();
    b.bus.emit('party:set', { variant: 'burn' });
    b.bus.emit('party:set', { variant: 'keep' });
    b.bus.emit('party:clear', {});
    expect(quiet(b)).toEqual([
      { on: true, reason: 'party' },
      { on: false, reason: 'party' },
    ]);
    // a party re-issued after the credits (resume into the free play) leaves the world awake
    const c = setup({ slice: { variant: 'keep', credits: 'done' } });
    c.bus.emit('party:set', { variant: 'keep' });
    expect(quiet(c)).toEqual([]);
    // dispose gives the markers back
    const d = setup();
    d.bus.emit('party:set', { variant: 'museum' });
    d.rt.dispose();
    expect(quiet(d).at(-1)).toEqual({ on: false, reason: 'party' });
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
    expect(play).toMatchObject({ id: CREDITS_CINEMATIC, skippable: false, lockInput: false });
    expect(play.keys.at(-1).t).toBeLessThanOrEqual(60);
    const [start] = c.bus.of('credits:start');
    expect(start.seconds).toBeGreaterThanOrEqual(play.keys.at(-1).t);
    // the cinematic ends on its own at the end of its keys (not skipped): the credits run on
    c.step(play.keys.at(-1).t + 0.05);
    c.endCine(false);
    expect(c.bus.of('credits:done')).toHaveLength(0);
    c.step(start.seconds);
    const spots = c.bus.of('party:spotlight');
    // 9: the doubles and Mats round the clearing, Gerold last; Marlene none
    expect(spots.map((s) => s.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(spots.slice(0, 8).map((s) => s.who))).toEqual(new Set(SPOT_ROUND));
    expect(spots[8].who).toBe(SPOT_LAST);
    expect(spots.some((s) => s.who === 'marlene' || s.who === 'extra.7')).toBe(false);
    expect(c.bus.of('credits:done')).toEqual([{ skipped: false }]);
    expect(c.strip.hidden).toBe(1);
    expect(c.slice.credits).toBe('done');
    // afterwards: the party stands, nothing more
    c.step(10);
    expect(c.bus.of('credits:done')).toHaveLength(1);
    expect(live(c.people)).toHaveLength(16);
    expect(c.cine.playing).toBeNull();
  });

  it('movement or look during the orbit hands the camera back: cinematic:stop, the strip runs on, credits:done {skipped: false} at its end', () => {
    for (const move of ['walk', 'look'] as const) {
      const c = setup();
      c.bus.emit('party:set', { variant: 'burn' });
      c.bus.emit('party:credits', {});
      expect(c.strip.camera.at(-1)).toBe(true);
      c.step(4);
      if (move === 'walk') c.world.player.x += 0.5;
      else c.world.player.yaw += 0.1;
      c.step(0.1);
      expect(c.bus.of('cinematic:stop')).toEqual([{ id: CREDITS_CINEMATIC }]);
      expect(c.cine.playing).toBeNull();
      expect(c.rt.credits!.cam).toBe('off');
      expect(c.rt.credits!.handedBack).toBe(true);
      expect(c.strip.camera.at(-1)).toBe(false);
      expect(c.strip.hidden).toBe(0);
      expect(c.bus.of('credits:done')).toHaveLength(0);
      // more movement: nothing more to hand back
      c.world.player.x += 3;
      c.step(1);
      expect(c.bus.of('cinematic:stop')).toHaveLength(1);
      c.step(c.rt.credits!.plan.seconds);
      expect(c.bus.of('credits:done')).toEqual([{ skipped: false }]);
      expect(c.bus.of('party:spotlight')).toHaveLength(9);
    }
    // standing still (tiny drift) keeps the orbit
    const d = setup();
    d.bus.emit('party:credits', {});
    d.world.player.x += 0.01;
    d.step(3);
    expect(d.bus.of('cinematic:stop')).toHaveLength(0);
    expect(d.cine.playing).toBe(CREDITS_CINEMATIC);
  });

  it('emits credits:done once on dismissal or when the orbit is interrupted', () => {
    // A keyboard dismissal ends the credits and stops the orbit, including at the start.
    const a = setup();
    a.bus.emit('party:set', { variant: 'burn' });
    a.bus.emit('party:credits', {});
    a.bus.emit('party:skip', {});
    a.bus.emit('party:skip', {});
    expect(a.cine.playing).toBeNull();
    expect(a.bus.of('credits:done')).toEqual([{ skipped: true }]);
    expect(a.bus.of('cinematic:end')).toEqual([{ id: CREDITS_CINEMATIC, skipped: true }]);
    a.step(80);
    expect(a.bus.of('credits:done')).toHaveLength(1);
    expect(a.bus.of('party:spotlight').length).toBeLessThan(9);
    // The keyboard also dismisses the credits after a camera hand-back.
    const b = setup();
    b.bus.emit('party:set', { variant: 'keep' });
    b.bus.emit('party:credits', {});
    b.step(2);
    b.rt.handBack();
    b.step(2);
    b.bus.emit('party:skip', {});
    expect(b.bus.of('credits:done')).toEqual([{ skipped: true }]);
    expect(b.bus.of('cinematic:stop')).toHaveLength(1);
    // the button (kq.party.skip) at once
    const d = setup();
    d.bus.emit('party:set', { variant: 'museum' });
    d.bus.emit('party:credits', {});
    d.rt.skip();
    expect(d.cine.playing).toBeNull();
    expect(d.bus.of('credits:done')).toEqual([{ skipped: true }]);
    // Keyboard dismissal also works without a cinematic system.
    const e = setup({ cinematic: 'none' });
    e.bus.emit('party:credits', {});
    e.bus.emit('party:skip', {});
    expect(e.bus.of('credits:done')).toEqual([{ skipped: true }]);
    // the cinematic ended under us (era change, death): skipped
    const f = setup();
    f.bus.emit('party:set', { variant: 'keep' });
    f.bus.emit('party:credits', {});
    f.step(3);
    f.endCine(true);
    expect(f.bus.of('credits:done')).toEqual([{ skipped: true }]);
  });

  it('keeps all lines open without animation or camera movement until a reduced-motion dismissal', () => {
    const lines = ['Karlsberg Quest', 'Mitwirkende', 'Danke fürs Spielen'];
    const { rt, bus, step, strip, slice } = setup({ lines, reduced: true });
    bus.emit('party:set', { variant: 'burn' });
    bus.emit('party:credits', {});
    step(rt.credits!.plan.seconds + 10);
    expect(strip.shown).toEqual([lines]);
    expect(strip.reduced).toBe(true);
    expect(strip.renders).toBe(0);
    expect(bus.of('cinematic:play')).toEqual([]);
    expect(bus.of('credits:done')).toEqual([]);
    expect(slice.credits).toBe('playing');
    bus.emit('party:skip', {});
    rt.skip();
    expect(bus.of('credits:done')).toEqual([{ skipped: true }]);
    expect(strip.hidden).toBe(1);
    expect(rt.quiet).toBe(false);
    expect(rt.party?.variant).toBe('burn');
  });

  it('a rejected camera (held elsewhere) does not end the credits', () => {
    const c = setup({ cinematic: 'reject' });
    c.bus.emit('party:set', { variant: 'keep' });
    c.bus.emit('party:credits', {});
    expect(c.bus.of('credits:done')).toHaveLength(0);
    expect(c.rt.credits!.cam).toBe('off');
    c.step(c.rt.credits!.plan.seconds + 0.1);
    expect(c.bus.of('credits:done')).toEqual([{ skipped: false }]);
    expect(c.bus.of('party:spotlight')).toHaveLength(9);
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

  it('uses the assembled lines unless the request has a nonblank override', () => {
    const { bus, rt, strip } = setup({ lines: ['Gemeinsamer Abspann'] });
    bus.emit('party:credits', {});
    rt.skip();
    bus.emit('party:credits', { lines: [' Extra ', ' ', 0] });
    rt.skip();
    bus.emit('party:credits', { lines: [' '] });
    expect(strip.shown).toEqual([['Gemeinsamer Abspann'], ['Extra'], ['Gemeinsamer Abspann']]);
  });

  it.each(PARTY_VARIANTS)('shows new contributor and asset rows in the %s party', (variant) => {
    const sections = creditSections({
      assets: [{ source: 'https://kenney.nl/assets/test', author: 'Beispielstudio', licence: 'CC0-1.0' }],
    }, {
      people: [{ name: 'Beispielperson', role: 'Übersetzung', links: ['https://example.org'] }],
      closing: 'und alle, die noch kommen',
    });
    const { bus, strip } = setup({ lines: creditLines(sections) });
    bus.emit('party:set', { variant });
    bus.emit('party:credits', {});
    expect(strip.shown[0]).toEqual(expect.arrayContaining([
      'Beispielperson · Übersetzung',
      'Kenney (CC0-1.0): Beispielstudio',
    ]));
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
  it('orbits r 14 round the centre, holds ≥ 2 s per person in angle order with Gerold last, stays within the cinematic key limit', () => {
    for (const v of ['museum', 'burn', 'keep'] as const) {
      const L = partyLayout(v);
      const ppl = L.people.map((p) => ({ who: p.spec, x: p.x, z: p.z }));
      const circle = ppl.filter((p) => (SPOT_ROUND as readonly string[]).includes(p.who));
      const last = ppl.find((p) => p.who === SPOT_LAST)!;
      const plan = creditsPlan(L.centre, circle, 3, last);
      expect(plan.spots).toHaveLength(9);
      expect(plan.spots[8]!.who).toBe('guide');
      expect(plan.camSeconds).toBeLessThanOrEqual(CAM_MAX);
      for (let i = 1; i < plan.keys.length; i++) expect(plan.keys[i]!.t).toBeGreaterThan(plan.keys[i - 1]!.t);
      for (const k of plan.keys) {
        const e = k.eye as { x: number; z: number };
        expect(Math.hypot(e.x - L.centre.x, e.z - L.centre.z)).toBeCloseTo(ORBIT.r, 1);
      }
      // the hold after each spot looks at that person (a key at the hold's end)
      for (const s of plan.spots) {
        const d = ppl.find((p) => p.who === s.who)!;
        const k = plan.keys.find((q) => q.t > s.t && q.t <= s.t + ORBIT.dwell + 1e-6 && q.ease === 'linear' && (q.look as { x: number })?.x === d.x)!;
        expect(k, `${v} ${s.who}`).toBeTruthy();
        expect(k.t - s.t).toBeGreaterThanOrEqual(ORBIT.minDwell - 1e-6);
      }
      for (let i = 1; i < plan.spots.length; i++) expect(plan.spots[i]!.t - plan.spots[i - 1]!.t).toBeGreaterThanOrEqual(ORBIT.minDwell);
    }
    // many lines: the strip sets the length
    const L = partyLayout('keep');
    expect(creditsPlan(L.centre, L.people.filter((p) => p.double).map((p) => ({ who: p.spec, x: p.x, z: p.z })), 40).seconds).toBe(160);
  });
});
