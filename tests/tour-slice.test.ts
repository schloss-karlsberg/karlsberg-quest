/**
 * The tour (content/story/00-tour.story.json, the opening of a new game): the chapter runs beat by
 * beat from the car park to the shift to 1789 and on into chapter 1, headless. The story engine is driven with simulated
 * world events (npc:arrived, animal:returned, photo:good, quelle:touch); flag actions are applied
 * to the env like the story system does, the rest is recorded as the requests it would send.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CinematicFile } from '../src/systems/cinematic/types';
import { type StoryEnv, type StorySlice, StoryEngine, createStorySlice } from '../src/systems/story/engine';
import { type Action, type StoryFile, isWalkAction } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles, loadWalkRefs } from '../src/systems/story/validate-cli';
import type { Route } from '../src/systems/walk/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tour = JSON.parse(readFileSync(`${ROOT}content/story/00-tour.story.json`, 'utf8')) as StoryFile;
const k1 = JSON.parse(readFileSync(`${ROOT}content/story/01-kapitel-1.story.json`, 'utf8')) as StoryFile;
const route = JSON.parse(readFileSync(`${ROOT}content/routes/p-fuehrung.json`, 'utf8')) as Route;

function harness() {
  let slice: StorySlice = createStorySlice();
  const flags: Record<string, boolean | number | string> = {};
  const pos = { x: 529, z: -777 };
  const sent: { kind: string; a: Action }[] = [];
  const said: string[] = [];
  let era = 'today';
  const apply = (actions: Action[]) => {
    for (const a of actions) {
      if (a.do === 'flag') for (const [k, v] of Object.entries(a.set)) v === null ? delete flags[k] : (flags[k] = v);
      else if (a.do === 'say') said.push(a.id ?? a.line ?? '?');
      else if (a.do === 'teleport') Object.assign(pos, { x: a.x, z: a.z });
      else if (a.do === 'shift') era = a.to;
      else if (a.do === 'npc') sent.push({ kind: isWalkAction(a) ? 'npc:walk' : 'npc:spawn', a });
      else sent.push({ kind: a.do, a });
    }
  };
  const engine = new StoryEngine([tour, k1], () => slice, {
    run: (actions) => apply(actions),
    chapterEntered: () => {},
    beatEntered: () => {},
    chapterCompleted: () => {},
  });
  const env = (): StoryEnv => ({
    era: era as StoryEnv['era'],
    x: pos.x,
    z: pos.z,
    flags,
    inventory: { clues: [], nouns: [], items: [] },
    chronik: {},
    scan: 0,
    map: false,
    stance: 'stand',
    lantern: false,
    caseFacts: () => null,
  });
  const tick = (s = 0.5) => engine.tick(s, env());
  const ev = (name: string, payload: Record<string, unknown>) => {
    engine.onEvent(name, payload);
    tick(0.1);
  };
  return {
    engine,
    tick,
    ev,
    flags,
    pos,
    sent,
    said,
    beat: () => slice.beat,
    completed: () => slice.completed,
    chapter: () => slice.chapter,
    era: () => era,
    reset: () => (slice = createStorySlice()),
  };
}

describe('tour slice v0 (00-tour.story.json)', () => {
  it('validates against the routes and opens the game, leading into chapter 1', () => {
    const questItems = new Set<string>();
    for (const f of readdirSync(`${ROOT}content/quests`).filter((n) => n.endsWith('.quests.json')))
      for (const it of (JSON.parse(readFileSync(`${ROOT}content/quests/${f}`, 'utf8')) as { items?: { id: string }[] }).items ?? []) questItems.add(it.id);
    const r = validateStories(loadStoryFiles(ROOT).files, { ...loadWalkRefs(ROOT), items: questItems });
    expect(r.errors.map((e) => `${e.id}: ${e.message}`)).toEqual([]);
    expect(tour.dev).toBeUndefined();
    expect(tour.next).toBe('k1');
    // walk stops the chapter uses exist on p-fuehrung, in route order
    const used = JSON.stringify(tour).match(/"to": ?"([a-z]+)"/g)?.map((m) => m.replace(/.*"([a-z]+)"$/, '$1')) ?? [];
    const stops = route.stops.map((s) => s.id);
    for (const u of used.filter((u) => u !== 'plateau' && u !== '1789')) expect(stops, u).toContain(u);
    expect(stops.indexOf('reh')).toBeGreaterThan(stops.indexOf('wind'));
  });

  it('runs beat by beat from the car park to the shift to 1789 and into chapter 1', () => {
    const h = harness();
    h.engine.goto('tour');
    expect(h.beat()).toBe('t1');
    // the group and the dogs come up at the car park
    const walk = h.sent.filter((s) => s.kind === 'npc:walk').map((s) => (s.a as { op: string }).op);
    expect(walk).toEqual(['walk', 'group', 'gather']);
    expect(h.sent.filter((s) => s.kind === 'animal').map((s) => (s.a as { id: string }).id)).toEqual(['diane', 'bijou']);
    // walk up to the group, talk to Gerold
    Object.assign(h.pos, { x: 524, z: -771 });
    h.tick();
    expect(h.beat()).toBe('t2');
    h.flags['talked.tour.imhoff'] = true;
    h.tick();
    expect(h.beat()).toBe('t3');
    h.ev('npc:arrived', { npc: 'imhoff', at: 'abzweig', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t4');
    // the fade: out, warp, teleport behind the group, in
    const t4 = h.sent.slice(-6).map((s) => s.kind + ':' + ((s.a as { op?: string; to?: unknown }).op ?? (s.a as { to?: unknown }).to ?? ''));
    expect(t4).toContain('fade:1');
    expect(t4).toContain('npc:walk:warp');
    expect(t4).toContain('fade:0');
    expect(Math.hypot(h.pos.x - 623.4, h.pos.z + 485.9)).toBeLessThan(12);
    h.tick();
    expect(h.beat()).toBe('t5');
    h.ev('npc:arrived', { npc: 'imhoff', at: 'felsen', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t6');
    expect(h.said).toContain('player.t.fuehrer');
    h.tick();
    expect(h.beat()).toBe('t7');
    h.ev('npc:arrived', { npc: 'imhoff', at: 'wind', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t8');
    expect(h.sent.some((s) => s.kind === 'cinematic')).toBe(true);
    h.ev('animal:returned', { id: 'diane' });
    h.ev('animal:returned', { id: 'bijou' });
    for (let i = 0; i < 20; i++) h.tick();
    expect(h.beat()).toBe('t9');
    expect(h.said).toContain('player.t.hunde');
    // the deer come up off the route
    const ricke = h.sent.find((s) => s.kind === 'animal' && (s.a as { id: string }).id === 'ricke')!.a as { x: number; z: number };
    const reh = route.stops.find((s) => s.id === 'reh')!;
    expect(Math.hypot(ricke.x - reh.x, ricke.z - reh.z)).toBeLessThanOrEqual(45);
    h.ev('npc:arrived', { npc: 'imhoff', at: 'reh', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t10');
    // she looked up, then the good photo: Gerold's „Sie hat dich angesehen.“
    h.ev('animal:alert', { id: 'ricke' });
    h.ev('photo:good', { id: 'reh.ricke', stars: 2 });
    h.ev('photo:good', { id: 'reh.kitz', stars: 2 });
    h.tick();
    expect(h.said).toContain('imhoff.t.reh.alert');
    expect(h.said).not.toContain('imhoff.t.reh3');
    // t11 (the second fade) only waits for its own flag: here it passes in the same tick
    h.tick();
    expect(h.beat()).toBe('t12');
    expect(h.sent.some((s) => s.kind === 'npc:walk' && (s.a as { op: string; to?: string }).op === 'warp' && (s.a as { to: string }).to === 'damm')).toBe(true);
    expect(h.said).toContain('marlene.t.cameo');
    const staffGrants = () => h.sent.filter(({ a }) => a.do === 'item' && a.item === 'item.stab.esche');
    expect(staffGrants()).toHaveLength(0);
    h.ev('npc:arrived', { npc: 'imhoff', at: 'weiher', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t13');
    expect(h.said).toContain('marlene.t.messstab');
    expect(staffGrants().map(({ a }) => a)).toEqual([{ do: 'item', item: 'item.stab.esche' }]);
    h.tick();
    expect(h.beat()).toBe('t14');
    h.ev('npc:arrived', { npc: 'imhoff', at: 'quelle', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t15');
    expect(h.said).toContain('imhoff.t.pause');
    h.tick();
    expect(h.beat()).toBe('t16');
    // alone at the trough: the compass, Laub, the touch
    Object.assign(h.pos, { x: 1059.3, z: -833.1 });
    for (let i = 0; i < 25; i++) h.tick();
    expect(h.beat()).toBe('t17');
    expect(h.flags['story.compass']).toBe(true);
    expect(h.flags['quelle.call']).toBe(true);
    expect(h.said).toEqual(expect.arrayContaining(['player.q.fund', 'laub.t.intro', 'player.q.laub', 'laub.t.trog']));
    h.ev('quelle:touch', {});
    expect(h.era()).toBe('1789');
    expect(h.beat()).toBe('t18');
    expect(h.flags['quelle.call']).toBeUndefined();
    // no „Fortsetzung folgt“: a look round in 1789, then the hand-over into chapter 1
    expect(h.sent.some((s) => s.kind === 'card')).toBe(false);
    for (let i = 0; i < 80 && h.beat() === 't18'; i++) h.tick();
    expect(h.said).toEqual(expect.arrayContaining(['player.q.wo', 'laub.t.1789']));
    expect(h.flags['combat.disabled']).toBeUndefined();
    expect(h.flags['tour.slice']).toBeUndefined();
    expect(h.completed()).toContain('tour');
    expect(h.chapter()).toBe('k1');
    expect(h.beat()).toBe('k1_0');
  });

  it('the deer never block the tour: a plain good photo praises, a flight close by says „Zu schnell.“ and moves on', () => {
    const go = (h: ReturnType<typeof harness>) => {
      h.engine.goto('tour', 't10');
      expect(h.beat()).toBe('t10');
    };
    const a = harness();
    go(a);
    a.ev('photo:good', { id: 'reh.ricke', stars: 3 });
    a.tick();
    expect(a.said).toContain('imhoff.t.reh3');
    expect(a.beat()).not.toBe('t10');

    const b = harness();
    go(b);
    b.ev('animal:fled', { id: 'ricke', by: 'player', dist: 9.5 });
    expect(b.said).toEqual(expect.arrayContaining(['player.photo.weg', 'imhoff.t.reh.schnell']));
    b.tick(30);
    expect(b.beat()).toBe('t10');
    b.tick(20);
    expect(b.beat()).not.toBe('t10');

    const c = harness();
    go(c);
    c.tick(181);
    expect(c.beat()).not.toBe('t10');
  });

  it('t10 opens on the deer: the reh shot from the group stop, then the sneak prompt (TASK-001)', () => {
    // 36 m down the slope in the haze the pair covers a few dozen pixels in the normal view: the
    // scene needs the zoomed shot, filmed from the stop so it does not depend on where the player is,
    // a step ahead of it toward the deer (Imhoff stands on the stop, the group round him)
    const shot = JSON.parse(readFileSync(`${ROOT}content/cinematics/reh.json`, 'utf8')) as CinematicFile;
    const reh = route.stops.find((s) => s.id === 'reh')!;
    const eye = shot.keys![0]!.eye as { x: number; z: number; rel?: string };
    expect(eye.rel).toBeUndefined();
    const t9 = tour.beats.find((b) => b.id === 't9')!;
    const doe = (t9.enter ?? []).find((a) => a.do === 'animal' && (a as { id: string }).id === 'ricke') as unknown as { x: number; z: number };
    const fromStop = Math.hypot(eye.x - reh.x, eye.z - reh.z);
    expect(fromStop).toBeGreaterThan(1);
    expect(fromStop).toBeLessThan(4);
    expect(Math.hypot(eye.x - doe.x, eye.z - doe.z)).toBeLessThan(Math.hypot(reh.x - doe.x, reh.z - doe.z));
    const spawned = (t9.enter ?? []).filter((a) => a.do === 'animal').map((a) => `animal:${(a as { id: string }).id}`);
    const looks = shot.keys!.map((k) => (k.look as { target?: string } | undefined)?.target).filter(Boolean);
    expect(looks.length).toBeGreaterThan(0);
    for (const t of looks) expect(spawned).toContain(t);

    const h = harness();
    h.engine.goto('tour', 't10');
    const kinds = h.sent.map((s) => s.kind);
    const cine = h.sent.find((s) => s.kind === 'cinematic')?.a as { ref?: string; skippable?: boolean } | undefined;
    expect(cine).toMatchObject({ ref: 'reh', skippable: true });
    expect(kinds.indexOf('cinematic')).toBeLessThan(kinds.indexOf('prompt'));
    // the [C] prompt waits for the end of the shot
    const seconds = shot.keys!.at(-1)!.t;
    const prompt = h.sent.find((s) => s.kind === 'prompt' && (s.a as { key?: string }).key === 'C')!.a as { delay?: number };
    expect(prompt.delay ?? 0).toBeGreaterThanOrEqual(seconds);
  });
});
