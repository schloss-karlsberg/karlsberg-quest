/**
 * Story flow polish (pure parts): beat-scoped runs, reaction cooldowns, the speed condition,
 * running-joke variants, wake places, the dialogue queue rules, the follow pack of ending C and
 * the chapter content that uses them (k1 guard, k1/k2 wake places, k2 hunt retry).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeMode } from '../src/systems/hunt/modes';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { PackSim, type SimWorld } from '../src/systems/hunt/sim';
import { LOW_TTL, LineQueue, MAX_QUEUE, type QueuedLine, STALE_GRACE } from '../src/systems/story/dialogue/queue';
import { type RunOptions, type StoryEnv, type StorySlice, StoryEngine, createStorySlice, evaluate, whereOf } from '../src/systems/story/engine';
import type { Action, Condition, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const storyFile = (name: string) => JSON.parse(readFileSync(`${ROOT}content/story/${name}.story.json`, 'utf8')) as StoryFile;

function env(over: Partial<StoryEnv> = {}): StoryEnv {
  return {
    era: 'today',
    x: 0,
    z: 0,
    flags: {},
    inventory: { clues: [], nouns: [], items: [] },
    chronik: {},
    scan: 0,
    map: false,
    stance: 'stand',
    lantern: false,
    caseFacts: () => null,
    ...over,
  };
}
const say = (text: string, extra: Record<string, unknown> = {}) => ({ do: 'say', speaker: 'laub', text, ...extra }) as Action;

function engineWith(f: StoryFile) {
  let slice: StorySlice = createStorySlice();
  const runs: { src: string; beat: string | null | undefined; texts: string[] }[] = [];
  const engine = new StoryEngine([f], () => slice, {
    run: (actions: Action[], o: RunOptions) => runs.push({ src: o.source, beat: o.beat, texts: actions.map((a) => (a as { text?: string }).text ?? a.do) }),
    chapterEntered: () => {},
    beatEntered: () => {},
    chapterCompleted: () => {},
  });
  return { engine, runs, slice: () => slice, reset: () => (slice = createStorySlice()) };
}

describe('beat scope of action runs', () => {
  it('enter and beat reactions belong to their beat, exit bridges into the next, chapter reactions to none', () => {
    const f: StoryFile = {
      chapter: 'c',
      order: 0,
      title_de: 'C',
      start: 'b1',
      on: [{ id: 'ch', when: { flag: 'x' }, do: [say('chapter')] }],
      beats: [
        { id: 'b1', enter: [say('enter1')], on: [{ id: 'r1', when: { flag: 'y' }, do: [say('react1')] }], exit: [say('exit1')], complete: { flag: 'go' } },
        { id: 'b2', enter: [say('enter2')], complete: { flag: 'never' } },
      ],
    };
    const { engine, runs } = engineWith(f);
    engine.goto('c');
    engine.tick(0.1, env({ flags: { x: true, y: true } }));
    engine.tick(0.1, env({ flags: { go: true } }));
    const by = (t: string) => runs.find((r) => r.texts.includes(t));
    expect(by('enter1')?.beat).toBe('b1');
    expect(by('react1')?.beat).toBe('b1');
    expect(by('chapter')?.beat).toBeNull();
    expect(by('exit1')?.beat).toBe('b2');
    expect(by('enter2')?.beat).toBe('b2');
  });

  it('whereOf: the place of a reaction (all: first circle; any: only if every branch has one)', () => {
    const at = { enter: { x: 1, z: 2, r: 3 } } as Condition;
    expect(whereOf(at)).toEqual({ x: 1, z: 2, r: 3 });
    expect(whereOf({ all: [{ flag: 'a' }, at] })).toEqual({ x: 1, z: 2, r: 3 });
    expect(whereOf({ any: [{ flag: 'a' }, at] })).toBeNull();
    expect(whereOf({ any: [at, { enter: { x: 5, z: 5, r: 1 } }] })).toEqual({ x: 1, z: 2, r: 3 });
    expect(whereOf({ not: at })).toBeNull();
  });
});

describe('reaction cooldown, speed condition', () => {
  it('a repeatable reaction with a cooldown does not fire again within it', () => {
    const f: StoryFile = {
      chapter: 'c',
      order: 0,
      title_de: 'C',
      start: 'b1',
      on: [{ id: 'run', when: { speed: { gte: 4.8 } }, repeat: true, cooldown: 30, do: [say('Langsam!')] }],
      beats: [{ id: 'b1', complete: { flag: 'never' } }],
    };
    const { engine, runs } = engineWith(f);
    engine.goto('c');
    const fired = () => runs.filter((r) => r.texts.includes('Langsam!')).length;
    const tick = (speed: number, s = 1) => {
      for (let t = 0; t < s; t += 0.5) engine.tick(0.5, env({ speed }));
    };
    tick(6.2);
    expect(fired()).toBe(1);
    tick(3.2, 2); // walking: the edge falls
    tick(6.2, 2); // running again 4 s later: within the cooldown
    expect(fired()).toBe(1);
    tick(3.2, 30);
    tick(6.2);
    expect(fired()).toBe(2);
  });

  it('speed: gte / lte against the player speed (0 when unknown)', () => {
    const ev = (c: Condition, e: StoryEnv) => evaluate(c, e, {}, 'k', 0);
    expect(ev({ speed: { gte: 4.8 } }, env({ speed: 6.2 }))).toBe(true);
    expect(ev({ speed: { gte: 4.8 } }, env({ speed: 3.2 }))).toBe(false);
    expect(ev({ speed: { lte: 0.5 } }, env())).toBe(true);
  });
});

describe('validator: wake, variants, cooldown, follow pack', () => {
  const base = (beat: Record<string, unknown>, on: unknown[] = []): StoryFile =>
    ({ chapter: 'v', order: 0, title_de: 'V', start: 'b1', on, beats: [{ id: 'b1', complete: { timer: 1 }, ...beat }] }) as unknown as StoryFile;
  const errors = (f: StoryFile) => validateStories([{ file: 'v.json', story: f }]).errors.map((i) => i.message);

  it('wake must be in the present with a place', () => {
    expect(errors(base({ wake: { x: 10, z: 10, era: 'today', text: 'Du kommst zu dir.' } }))).toEqual([]);
    expect(errors(base({ wake: { x: 10, z: 10, era: '1789' } })).join()).toMatch(/present/);
  });

  it('variants need an id and a speaker; a cooldown needs repeat', () => {
    expect(errors(base({ enter: [{ do: 'say', speaker: 'wache', id: 'w.x', variants: ['a', 'b'] }] }))).toEqual([]);
    expect(errors(base({ enter: [{ do: 'say', speaker: 'wache', variants: ['a'] }] })).join()).toMatch(/variants need an id/);
    expect(errors(base({}, [{ id: 'r', when: { flag: 'a' }, cooldown: 5, do: [] }])).join()).toMatch(/cooldown needs repeat/);
  });

  it('pack mode follow is known', () => {
    expect(errors(base({ enter: [{ do: 'threat', kind: 'pack', active: true, mode: 'follow' }] }))).toEqual([]);
  });
});

describe('dialogue queue rules', () => {
  type L = QueuedLine & { id: string };
  const mk = (playing: () => number | undefined = () => undefined, valid?: (l: L) => boolean) => new LineQueue<L>(playing, valid);
  const drain = (q: LineQueue<L>) => {
    const out: string[] = [];
    for (let l = q.take(); l; l = q.take()) out.push(l.id);
    return out;
  };

  it("a 'now' line jumps the queue and drops waiting barks; an expired line is never said", () => {
    const q = mk();
    q.push({ id: 'a' });
    q.push({ id: 'bark', priority: 'low' });
    q.push({ id: 'b' });
    q.push({ id: 'tip', priority: 'now' });
    q.push({ id: 'tip2', priority: 'now' });
    expect(q.urgent).toBe(true);
    expect(drain(q)).toEqual(['tip', 'tip2', 'a', 'b']);
    let done = false;
    q.push({ id: 'press1', expired: () => done });
    q.push({ id: 'c' });
    done = true;
    q.prune();
    expect(drain(q)).toEqual(['c']);
  });

  it('caps the queue, dropping low-priority lines first', () => {
    const q = mk();
    q.push({ id: 'bark', priority: 'low' });
    for (let i = 0; i < MAX_QUEUE; i++) q.push({ id: `n${i}` });
    expect(q.length).toBe(MAX_QUEUE);
    expect(drain(q)).not.toContain('bark');
    expect(q.dropped).toBe(1);
  });

  it('low-priority lines expire after LOW_TTL seconds', () => {
    const q = mk();
    q.push({ id: 'bark', priority: 'low' });
    q.push({ id: 'story' });
    q.tick(LOW_TTL + 1);
    expect(drain(q)).toEqual(['story']);
  });

  it('a new beat retires lines of other beats: low at once, normal after a grace, chapter-wide lines stay', () => {
    const q = mk();
    q.push({ id: 'old-low', beat: 'b1', priority: 'low' });
    q.push({ id: 'old', beat: 'b1' });
    q.push({ id: 'chapter', beat: null });
    q.push({ id: 'new', beat: 'b2' });
    q.retireBeat('b2');
    expect(q.length).toBe(3);
    q.tick(STALE_GRACE + 0.5);
    expect(drain(q)).toEqual(['chapter', 'new']);
  });

  it('the rest of a sequence that is already playing is never cut off', () => {
    let playing: number | undefined = 7;
    const q = mk(() => playing);
    q.push({ id: 'seq-2', beat: 'b1', group: 7 });
    q.retireBeat('b2');
    q.tick(STALE_GRACE + 5);
    expect(drain(q)).toEqual(['seq-2']);
    playing = undefined;
  });

  it('a line about a place is skipped when the player has left it (valid callback)', () => {
    let near = true;
    const q = mk(undefined, () => near);
    q.push({ id: 'here' });
    near = false;
    expect(drain(q)).toEqual([]);
    expect(q.dropped).toBe(1);
  });
});

describe('ending C: the follow pack', () => {
  const world: SimWorld = {
    heightAt: () => 300,
    surfaceAt: () => 'meadow',
    coverAt: () => 0,
    bounds: () => ({ x0: 0, z0: -2000, x1: 3000, z1: 2000 }),
    trailBreakAt: () => null,
  };

  it('five hounds follow a walker at a distance and never catch, even when they stop', () => {
    const start = { x: 1200, z: -1100 };
    const sim = new PackSim(
      world,
      null,
      { x: start.x, z: start.z, radius: 300, intensity: 0.3, hounds: 5, pikeur: false, seed: 3, sight: 30, beacon: 65, gentle: false, rauhnacht: false, mode: 'follow' },
      start,
      null,
      makeMode,
    );
    const p: PlayerSense = { x: start.x, y: 300, z: start.z, stance: 'stand', noise: 0.45, visibility: 1, lanternLit: true, speed: 0, flying: false };
    let min = Infinity;
    const DT = 1 / 30;
    for (let t = 0; t < 90; t += DT) {
      // walk east for a minute, then stand
      const v = t < 60 ? 3.2 : 0;
      p.x += v * DT;
      p.speed = v;
      sim.update(DT, p);
      if (t > 20) for (const h of sim.hounds) min = Math.min(min, Math.hypot(h.x - p.x, h.z - p.z));
    }
    expect(sim.caught).toBeFalsy();
    expect(sim.hounds.length).toBe(5);
    expect(min).toBeGreaterThan(8);
    // they did come along: the nearest is within shouting distance of the walker
    const near = Math.min(...sim.hounds.map((h) => Math.hypot(h.x - p.x, h.z - p.z)));
    expect(near).toBeLessThan(60);
  });
});

describe('chapter content using the flow features', () => {
  const k1 = storyFile('01-kapitel-1');
  const k2 = storyFile('02-kapitel-2');

  it('k1: the guard calls out runners in the 1789 Ehrenhof, at most every 30 s, with escalating lines', () => {
    const r = k1.on!.find((x) => x.id === 'wache-rennen')!;
    expect(r.repeat).toBe(true);
    expect(r.cooldown).toBe(30);
    const a = r.do[0] as Extract<Action, { do: 'say' }>;
    expect(a.variants![0]).toBe('Langsam! Hier rennt nur das Geld davon.');
    expect(a.variants!.length).toBeGreaterThanOrEqual(3);
    const at = (x: number, z: number, speed: number, era = '1789') => evaluate(r.when, env({ x, z, speed, era: era as StoryEnv['era'] }), {}, 'k', 0);
    expect(at(1205, -1116, 6.2)).toBe(true);
    expect(at(1205, -1116, 3.2)).toBe(false); // walking is fine
    expect(at(1205, -1116, 6.2, 'today')).toBe(false);
    expect(at(1600, -400, 6.2)).toBe(false);
  });

  it('k1 / k2: being caught wakes you at the part of the chapter you were in, in the present', () => {
    const near = (w: { x: number; z: number } | undefined, x: number, z: number, r: number) => !!w && Math.hypot(w.x - x, w.z - z) < r;
    const wk = (f: StoryFile, id: string) => f.beats.find((b) => b.id === id)?.wake;
    for (const id of ['k1_1', 'k1_2', 'k1_3']) expect(near(wk(k1, id), 1222, -1119, 20), id).toBe(true);
    expect(near(wk(k1, 'k1_5'), 1165, -1571, 20)).toBe(true); // the Zwinger anchor
    expect(wk(k1, 'k1_6')).toBeUndefined(); // on the way home: the station
    for (const id of ['k1_8', 'k1_13', 'k1_14', 'k1_15']) expect(near(wk(k1, id), 1822, 70, 20), id).toBe(true);
    for (const id of ['k2_1', 'k2_4']) expect(near(wk(k2, id), 1680, -400, 20), id).toBe(true);
    for (const id of ['k2_5', 'k2_9', 'k2_10']) expect(near(wk(k2, id), 1222, -1118, 20), id).toBe(true);
    expect(near(wk(k2, 'k2_11'), 819, -875, 50)).toBe(true); // the dam: the Pikeur waits there
    for (const f of [k1, k2]) for (const b of f.beats) if (b.wake) expect(b.wake.era, b.id).toBe('today');
    // nothing is lost when you are caught: no Chronik promise in the wake texts any more
    for (const f of [k1, k2]) for (const b of f.beats) if (b.wake?.text) expect(b.wake.text, b.id).not.toMatch(/bestätigt/);
  });

  it('k2: on a retry Hanne and Jost are back and the horn waits (talk, the passage or 20 s)', () => {
    const b = k2.beats.find((x) => x.id === 'k2_10')!;
    const horn = b.on!.find((r) => r.id === 'k2_10-horn')!;
    const inCourt = env({ era: '1793-02', x: 1222, z: -1118 });
    const ev = (flags: Record<string, boolean>) => evaluate(horn.when, { ...inCourt, flags }, {}, 'k', 0);
    expect(ev({})).toBe(true); // first time: the horn at once
    expect(ev({ 'k2.jagd_versuch': true })).toBe(false); // retry: wait
    expect(ev({ 'k2.jagd_versuch': true, 'k2.jagd_los': true })).toBe(true);
    const again = b.on!.find((r) => r.id === 'k2_10-wieder')!;
    expect(again.do.filter((a) => a.do === 'npc').map((a) => (a as { npc: string }).npc).sort()).toEqual(['hanne', 'jost']);
    expect(again.do.some((a) => a.do === 'flag' && a.delay === 20)).toBe(true);
    const aus = k2.on!.find((r) => r.id === 'k2-jagd-aus')!;
    expect(Object.keys((aus.do[0] as { set: Record<string, unknown> }).set)).toEqual(expect.arrayContaining(['k2.jagd_los', 'k2.wieder_da']));
  });
});
