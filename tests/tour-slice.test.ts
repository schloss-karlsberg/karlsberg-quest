/**
 * The tour (content/story/00-tour.story.json, the opening of a new game): the chapter runs beat by
 * beat from the car park to the shift to 1789 and on into chapter 1, headless. The story engine is driven with simulated
 * world events (npc:arrived, animal:returned, photo:good, quelle:touch); flag actions are applied
 * to the env like the story system does, the rest is recorded as the requests it would send.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import type { CinematicFile } from '../src/systems/cinematic/types';
import { answer } from '../src/systems/npc/logic';
import { type StoryEnv, type StorySlice, StoryEngine, createStorySlice, runsOnResume } from '../src/systems/story/engine';
import { type Action, type StoryFile, isWalkAction } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles, loadWalkRefs } from '../src/systems/story/validate-cli';
import type { Route } from '../src/systems/walk/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tour = JSON.parse(readFileSync(`${ROOT}content/story/00-tour.story.json`, 'utf8')) as StoryFile;
const k1 = JSON.parse(readFileSync(`${ROOT}content/story/01-kapitel-1.story.json`, 'utf8')) as StoryFile;
const route = JSON.parse(readFileSync(`${ROOT}content/routes/p-fuehrung.json`, 'utf8')) as Route;
const pack = JSON.parse(readFileSync(`${ROOT}content/packs/tour.pack.json`, 'utf8')) as { dialogue: DialogueLine[] };

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
    run: (actions, { resume }) => apply(resume ? actions.filter(runsOnResume) : actions),
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
  it('has a guide line for every stop on the guided route', () => {
    const beatsByStop: Record<string, string[]> = {
      parkplatz: ['t1', 't2'],
      abzweig: ['t3', 't4'],
      einstieg: ['t4'], // Imhoff announces the shortcut before the fade and warp.
      felsen: ['t6'],
      wind: ['t8'],
      reh: ['t10'],
      damm: ['t11', 't12'],
      weiher: ['t13'],
      quelle: ['t15'],
    };
    for (const { id } of route.stops) {
      const associatedBeats = beatsByStop[id];
      expect(associatedBeats, id).toBeDefined();
      const actions = associatedBeats!.flatMap((beatId) => {
        const beat = tour.beats.find((beat) => beat.id === beatId)!;
        return [...(beat.enter ?? []), ...(beat.exit ?? [])];
      });
      expect(actions.some((a) => a.do === 'say' && a.speaker === 'imhoff' && Boolean(a.text?.trim())), id).toBe(true);
    }
  });

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

  it('rejects a tour sound with a blank caption', () => {
    const story = structuredClone(tour);
    const cue = story.beats.find((beat) => beat.id === 't10')?.enter?.find((a) => a.do === 'sound');
    expect(cue?.sound).toBe('deer-rustle');
    cue!.caption = ' ';
    const r = validateStories([{ file: '00-tour.story.json', story }]);
    expect(r.errors.map((e) => e.message)).toContain("tour sound 'deer-rustle' needs a caption");
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
    h.ev('npc:conversation', { npc: 'imhoff', open: true });
    h.flags['talked.tour.imhoff'] = true;
    h.tick();
    expect(h.beat()).toBe('t2');
    h.ev('npc:conversation', { npc: 'imhoff', open: false });
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
    expect(h.sent.map(({ a }) => a).filter((a) => a.do === 'sound').map((a) => a.sound)).toEqual(['wind', 'bark']);
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
    const rustle = h.sent.findIndex(({ a }) => a.do === 'sound' && a.sound === 'deer-rustle');
    const deerShot = h.sent.findIndex(({ a }) => a.do === 'cinematic' && a.ref === 'reh');
    expect(rustle).toBeGreaterThanOrEqual(0);
    expect(rustle).toBeLessThan(deerShot);
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
    expect(h.sent.map(({ a }) => a)).toContainEqual({ do: 'sound', sound: 'compass', caption: '[Messing klirrt auf Stein]' });
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

  it('plays all three parking-lot greetings in order and can leave without an interaction or after a saved talk', () => {
    const context = { era: 'today', flags: {}, chapter: 'tour', beat: 't2' } as const;
    const ids = ['imhoff.t.station1', 'imhoff.t.station1a', 'imhoff.t.station1b'];
    expect(answer(pack.dialogue, 'imhoff', 'tour', 'greet', context, new Set()).map((line) => line.id)).toEqual(ids);
    expect(answer(pack.dialogue, 'imhoff', 'tour', 'greet', context, new Set(ids))).toEqual([]);

    const skipped = harness();
    skipped.engine.goto('tour', 't2');
    skipped.tick(59);
    expect(skipped.beat()).toBe('t2');
    skipped.tick(1);
    expect(skipped.beat()).toBe('t3');

    const resumed = harness();
    resumed.engine.goto('tour', 't2');
    resumed.ev('npc:conversation', { npc: 'imhoff', open: true });
    resumed.flags['talked.tour.imhoff'] = true;
    resumed.engine.resume();
    resumed.tick();
    expect(resumed.beat()).toBe('t3');
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
  });

  it('t10 prepares the sneak prompt and objective at once, including on Continue', () => {
    const enter = tour.beats.find((b) => b.id === 't10')!.enter!;
    // The cinematic hides the HUD until it ends. A delayed line would also delay later actions.
    const setup = enter.slice(0, enter.findIndex((a) => a.do === 'say'));
    expect(setup.map((a) => a.do)).toEqual(['npc', 'sound', 'cinematic', 'prompt', 'objective']);
    expect(setup.every((a) => (a.delay ?? 0) === 0)).toBe(true);

    const h = harness();
    h.engine.goto('tour', 't10');
    h.sent.length = 0;
    h.said.length = 0;
    h.engine.resume();
    expect(h.beat()).toBe('t10');
    expect(h.sent.map(({ a }) => a)).toMatchObject([
      { do: 'npc', op: 'hold', group: 'fuehrung' },
      { do: 'prompt', key: 'C', touch: 'Langsam heranpirschen' },
      { do: 'objective', id: 'tour', x: 704, z: -779 },
    ]);
    expect(h.said).toEqual([]);
  });
});
