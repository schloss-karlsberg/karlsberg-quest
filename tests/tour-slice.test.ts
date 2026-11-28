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
import { createInitialState, deserializeState, serializeState } from '../src/core/state';
import { createDeer } from '../src/systems/animals/deer';
import { restoreAnimals, serializeAnimals } from '../src/systems/animals/save';
import type { CinematicFile } from '../src/systems/cinematic/types';
import { answer } from '../src/systems/npc/logic';
import { type StoryEnv, type StorySlice, StoryEngine, createStorySlice, runsOnResume } from '../src/systems/story/engine';
import { objectivePoint } from '../src/systems/story/objectives';
import { acceptTourDeerPhoto, restoreTourDeerPhoto } from '../src/systems/story/stories';
import { type Action, type StoryFile, isWalkAction } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles, loadWalkRefs } from '../src/systems/story/validate-cli';
import type { Route } from '../src/systems/walk/types';
import { canTouch, toWorld, TOUR_REACH, yawToWater } from '../src/systems/quelle/layout';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tour = JSON.parse(readFileSync(`${ROOT}content/story/00-tour.story.json`, 'utf8')) as StoryFile;
const k1 = JSON.parse(readFileSync(`${ROOT}content/story/01-kapitel-1.story.json`, 'utf8')) as StoryFile;
const route = JSON.parse(readFileSync(`${ROOT}content/routes/p-fuehrung.json`, 'utf8')) as Route;
const pack = JSON.parse(readFileSync(`${ROOT}content/packs/tour.pack.json`, 'utf8')) as { dialogue: DialogueLine[] };

function harness(onAction?: (a: Action) => void | false, saved = createInitialState(), holdDialogue = false) {
  let slice: StorySlice = saved.systems.story ?? createStorySlice();
  const flags = saved.flags;
  const pos = { x: 529, z: -777 };
  const sent: { kind: string; a: Action }[] = [];
  const said: string[] = [];
  let afterLine: Action[] = [];
  let era = 'today';
  // delayed actions, as the host schedules them: due after `delay` s, or at once when their beat ends
  let clock = 0;
  const delayed: { at: number; beat: string | null; a: Action }[] = [];
  const apply = (actions: Action[]) => {
    for (const [i, a] of actions.entries()) {
      if (a.delay && a.delay >= 30) {
        delayed.push({ at: clock + a.delay, beat: slice.beat, a: { ...a, delay: 0 } });
        continue;
      }
      if (onAction?.(a) === false) continue;
      if (a.do === 'flag') for (const [k, v] of Object.entries(a.set)) v === null ? delete flags[k] : (flags[k] = v);
      else if (a.do === 'say') {
        const id = a.id ?? a.line;
        if (holdDialogue && id && slice.said.includes(id) && !a.repeat) continue;
        said.push(id ?? '?');
        if (id && !slice.said.includes(id)) slice.said.push(id);
        if (holdDialogue && a.wait) {
          afterLine = actions.slice(i + 1);
          return;
        }
      } else if (a.do === 'teleport') Object.assign(pos, { x: a.x, z: a.z });
      else if (a.do === 'shift') era = a.to;
      else if (a.do === 'npc') sent.push({ kind: isWalkAction(a) ? 'npc:walk' : 'npc:spawn', a });
      else {
        if (a.do === 'objective') slice.objective = a.text ? { text: a.text, id: a.id, x: a.x, z: a.z } : null;
        sent.push({ kind: a.do, a });
      }
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
  const tick = (s = 0.5) => {
    clock += s;
    for (let i = 0; i < delayed.length; i++) {
      const d = delayed[i]!;
      if (d.at > clock && d.beat === slice.beat) continue;
      delayed.splice(i--, 1);
      apply([d.a]);
    }
    engine.tick(s, env());
  };
  const ev = (name: string, payload: Record<string, unknown>) => {
    engine.onEvent(name, payload);
    tick(0.1);
  };
  return {
    engine,
    tick,
    ev,
    photo: (state: string | undefined, id = 'reh.ricke') => {
      const shot = { id, stars: 2, state };
      const accepted = acceptTourDeerPhoto(slice, flags, shot);
      ev('photo:good', shot);
      return accepted;
    },
    resumeSaved: () => {
      const saved = deserializeState(serializeState({ ...createInitialState(), flags, systems: { story: slice } }));
      slice = saved.systems.story!;
      for (const key of Object.keys(flags)) delete flags[key];
      Object.assign(flags, saved.flags);
      restoreTourDeerPhoto(slice, flags);
      engine.resume();
    },
    flags,
    pos,
    sent,
    said,
    beat: () => slice.beat,
    completed: () => slice.completed,
    chapter: () => slice.chapter,
    era: () => era,
    objective: () => slice.objective,
    saved: () => deserializeState(serializeState({ ...saved, systems: { ...saved.systems, story: slice } })),
    finishLine: () => {
      const actions = afterLine;
      afterLine = [];
      apply(actions);
    },
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
    // She was looking up when the shutter fired: Gerold's „Sie hat dich angesehen.“
    h.photo('alert');
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
    expect(h.objective()).toEqual({ id: 'tour', text: 'Der Gruppe folgen: hinauf zur Karlsbergquelle', x: 1059.3, z: -833.1 });
    h.ev('npc:arrived', { npc: 'imhoff', at: 'quelle', route: 'p-fuehrung', skipped: false });
    expect(h.beat()).toBe('t15');
    expect(h.said).toContain('imhoff.t.pause');
    h.tick();
    expect(h.beat()).toBe('t16');
    // The group continues uphill as the player finds the compass, alone at the trough.
    const departing = h.sent.length;
    const [x, z] = toWorld(0.1, 4.15);
    Object.assign(h.pos, { x, z });
    expect(canTouch(x, z, yawToWater(x, z, 'today'), 'today', TOUR_REACH)).toBe(true);
    expect(h.flags['quelle.call']).toBeUndefined();
    for (let i = 0; i < 25; i++) h.tick();
    expect(h.beat()).toBe('t17');
    expect(h.sent.map(({ a }) => a)).toContainEqual({ do: 'sound', sound: 'compass', caption: '[Messing klirrt auf Stein]' });
    const cleanups = () => h.sent.slice(departing).filter(({ a }) =>
      (a.do === 'npc' && a.op === 'despawn' && 'group' in a && a.group === 'fuehrung') ||
      (a.do === 'animal' && a.op === 'despawn' && ['diane', 'bijou'].includes(a.id)));
    expect(cleanups()).toHaveLength(0);
    expect(h.flags['walk.find']).toBe(false);
    expect(h.flags['story.compass']).toBe(true);
    expect(h.flags['quelle.call']).toBe(true);
    expect(h.said).toEqual(expect.arrayContaining(['player.q.fund', 'laub.t.intro', 'player.q.laub', 'laub.t.trog']));
    h.ev('quelle:touch', {});
    expect(h.era()).toBe('1789');
    expect(h.beat()).toBe('t18');
    expect(cleanups()).toHaveLength(0);
    expect(h.flags['quelle.call']).toBeUndefined();
    // no „Fortsetzung folgt“ and no way back: the arrival in 1789, then the hand-over into chapter 1
    expect(h.sent.some((s) => s.kind === 'card')).toBe(false);
    const arrival = h.sent.length;
    for (let i = 0; i < 80 && h.beat() === 't18'; i++) h.tick();
    expect(h.said).toEqual(expect.arrayContaining(['player.q.wo', 'laub.t.1789', 'laub.t.seite']));
    expect(h.sent.slice(arrival).some(({ a }) => a.do === 'fade' && a.to === 1)).toBe(false);
    expect(h.era()).toBe('1789');
    expect(h.flags['combat.disabled']).toBeUndefined();
    expect(h.flags['tour.slice']).toBeUndefined();
    expect(h.flags['walk.find']).toBeUndefined();
    expect(cleanups()).toHaveLength(3);
    expect(h.completed()).toContain('tour');
    expect(h.chapter()).toBe('k1');
    expect(h.beat()).toBe('k1_0');
  });

  it('plays all three parking-lot greetings in order and can leave without an interaction or after a saved talk', () => {
    const context = { era: 'today', flags: { 'tour.station1.ready': true }, chapter: 'tour', beat: 't2' };
    const ids = ['imhoff.t.station1', 'imhoff.t.station1a', 'imhoff.t.station1b'];
    expect(answer(pack.dialogue, 'imhoff', 'tour', 'greet', context, new Set()).map((line) => line.id)).toEqual(ids);
    expect(answer(pack.dialogue, 'imhoff', 'tour', 'greet', context, new Set(ids))).toEqual([]);
    // the car-park talk belongs to stop 1 (TASK-076): not before t2 is ready, not at the later stops
    expect(answer(pack.dialogue, 'imhoff', 'tour', 'greet', { ...context, flags: {} }, new Set())).toEqual([]);

    const skipped = harness();
    skipped.engine.goto('tour', 't2');
    skipped.tick(59);
    expect(skipped.beat()).toBe('t2');
    expect(skipped.flags['tour.station1.ready']).toBe(true);
    skipped.tick(1);
    expect(skipped.beat()).toBe('t3');
    expect(skipped.flags['tour.station1.ready']).toBeFalsy();

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
    a.ev('animal:alert', { id: 'ricke' });
    a.photo('graze');
    a.tick();
    expect(a.said).toContain('imhoff.t.reh3');
    expect(a.said).not.toContain('imhoff.t.reh.alert');
    expect(a.beat()).not.toBe('t10');

    // a flight at any distance is answered, and the player has a minute to try again
    const b = harness();
    go(b);
    b.ev('animal:fled', { id: 'ricke', by: 'player', dist: 19.5 });
    expect(b.said).toEqual(expect.arrayContaining(['player.photo.weg', 'imhoff.t.reh.schnell']));
    b.tick(55);
    expect(b.beat()).toBe('t10');
    b.tick(10);
    expect(b.beat()).not.toBe('t10');

    const c = harness();
    go(c);
    c.tick(181);
    expect(c.beat()).not.toBe('t10');

    // a late flight does not end the stop at once (the old 45 s counted from the beat's start)
    const late = harness();
    go(late);
    late.tick(170);
    late.ev('animal:fled', { id: 'ricke', by: 'player', dist: 19.5 });
    late.tick(50);
    expect(late.beat()).toBe('t10');
    late.photo('graze');
    late.tick();
    expect(late.said).toContain('imhoff.t.reh3');
    expect(late.beat()).not.toBe('t10');

    // a chestnut hit: „Und weg.“, never „Zu schnell.“, and the same minute
    const hit = harness();
    go(hit);
    hit.ev('animal:fled', { id: 'ricke', by: 'hit', dist: 14 });
    expect(hit.said).toContain('player.photo.weg');
    expect(hit.said).not.toContain('imhoff.t.reh.schnell');
    hit.tick(55);
    expect(hit.beat()).toBe('t10');
    hit.tick(10);
    expect(hit.beat()).not.toBe('t10');

    // a save from mid-stop (the flight flag without the minute's timer, which is not saved) still moves on
    const stale = harness();
    go(stale);
    stale.flags['tour.reh.weg'] = true;
    stale.tick(250);
    expect(stale.beat()).toBe('t10');
    stale.tick(15);
    expect(stale.beat()).not.toBe('t10');

    // a scripted startle (a cue) says nothing
    const cue = harness();
    go(cue);
    cue.ev('animal:fled', { id: 'ricke', by: 'cue', dist: 5 });
    expect(cue.said).not.toContain('player.photo.weg');
  });

  it.each([['graze', 'alert', 'imhoff.t.reh3'], ['alert', 'graze', 'imhoff.t.reh.alert']])(
    'uses only the first good shot (%s), even if a %s shot arrives before the reaction finishes',
    (first, second, reaction) => {
      const h = harness((a) => {
        // Simulate the completion flag waiting for the presenter to finish the reaction.
        if (a.do === 'flag' && a.set['tour.reh.done']) return false;
      });
      h.engine.goto('tour', 't10');
      h.tick(175);
      expect(h.photo(second, 'reh.kitz')).toBe(false);
      expect(h.photo(first)).toBe(true);
      expect(h.photo(second)).toBe(false);
      h.tick(20);
      expect(h.flags['tour.reh.photo']).toBe(first);
      expect(h.said.slice(2)).toEqual(['player.photo.gut', reaction]);
      expect(h.beat()).toBe('t10');
    },
  );

  it.each([false, true])('finishes an accepted shot on Continue (legacy save: %s)', (legacy) => {
    let interrupted = true;
    const h = harness((a) => {
      if (interrupted && a.do === 'flag' && a.set['tour.reh.done']) return false;
    });
    h.engine.goto('tour', 't10');
    if (legacy) {
      h.engine.s.latched['br:foto-alert'] = 1;
      h.engine.s.fired.push('b:foto-alert');
      h.engine.s.said.push('player.photo.gut', 'imhoff.t.reh.alert');
    } else {
      expect(h.photo('alert')).toBe(true);
      expect(h.said).toContain('imhoff.t.reh.alert');
    }
    expect(h.flags['tour.reh.done']).toBeUndefined();
    expect(h.beat()).toBe('t10');

    interrupted = false;
    h.said.length = 0;
    h.resumeSaved();
    expect(h.engine.s.latched).toEqual({});
    h.tick();
    expect(h.said.slice(0, 2)).toEqual(['player.photo.gut', 'imhoff.t.reh.alert']);
    expect(h.flags['tour.reh.done']).toBe(true);
    expect(h.beat()).toBe('t11');
  });

  it('resolves the continued t10 objective at the pre-branch saved doe position', () => {
    const h = harness();
    h.engine.goto('tour', 't10');
    h.sent.length = 0;
    h.engine.resume();
    const action = h.sent.find(({ a }) => a.do === 'objective')?.a;
    if (action?.do !== 'objective') throw new Error('t10 must restore its objective on Continue');
    const save = serializeAnimals([createDeer({ op: 'spawn', id: 'ricke', kind: 'reh', x: 704, z: -779 })], []);
    const [restored] = restoreAnimals(save).deer;
    expect(objectivePoint(action, save)).toEqual({ x: restored!.x, z: restored!.z });
    expect(objectivePoint(action)).toEqual({ x: 698, z: -773 });
  });

  it('updates the Bussole objective on pickup, then offers the water when Laub finishes', () => {
    const beat = tour.beats.find((b) => b.id === 't17')!;
    const actions = beat.enter!;
    const pickup = actions.findIndex((a) => a.do === 'give' && a.item === 'item.bussole');
    const listen = actions.findIndex((a) => a.do === 'objective' && a.text === 'Laub zuhören');
    expect(pickup).toBeGreaterThanOrEqual(0);
    expect(listen).toBeGreaterThan(pickup);
    expect(actions.some((a) => a.do === 'say')).toBe(false);
    expect(actions[listen]?.delay).toBeUndefined();
    expect(runsOnResume(actions[listen]!)).toBe(false);
  });

  it.each([0, 2])('resumes t17 with %i dialogue lines already in the save', (heard) => {
    const ids = ['laub.t.intro', 'player.q.laub', 'laub.t.intro.b', 'laub.t.quelle', 'laub.t.trog'];
    const initial = harness(undefined, createInitialState(), true);
    initial.engine.goto('tour', 't17');
    if (heard > 0) {
      initial.tick();
      for (let i = 1; i < heard; i++) initial.finishLine();
    }
    const resumed = harness(undefined, initial.saved(), true);
    resumed.engine.resume();
    expect(resumed.flags['quelle.call']).toBeUndefined();
    expect(resumed.objective()?.text).toBe('Laub zuhören');
    resumed.tick();
    for (const [i, id] of ids.slice(heard).entries()) {
      expect(resumed.said).toEqual(ids.slice(heard, heard + i + 1));
      expect(resumed.said.at(-1)).toBe(id);
      expect(resumed.flags['quelle.call']).toBeUndefined();
      expect(resumed.objective()?.text).toBe('Laub zuhören');
      resumed.finishLine();
    }
    expect(resumed.flags['quelle.call']).toBe(true);
    expect(resumed.objective()?.text).toBe('Am Trog das Wasser berühren');
    expect(resumed.sent.at(-1)?.kind).toBe('autosave');
    const unlocked = harness(undefined, resumed.saved(), true);
    unlocked.engine.resume();
    unlocked.tick();
    expect(unlocked.said).toEqual([]);
    expect(unlocked.flags['quelle.call']).toBe(true);
    expect(unlocked.objective()?.text).toBe('Am Trog das Wasser berühren');
    unlocked.ev('quelle:touch', {});
    expect(unlocked.beat()).toBe('t18');
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
    expect(setup.find((a) => a.do === 'prompt')).toMatchObject({ action: 'crouch' });

    const h = harness();
    h.engine.goto('tour', 't10');
    h.sent.length = 0;
    h.said.length = 0;
    h.engine.resume();
    expect(h.beat()).toBe('t10');
    expect(h.sent.map(({ a }) => a)).toMatchObject([
      { do: 'npc', op: 'hold', group: 'fuehrung' },
      { do: 'prompt', action: 'crouch', touch: 'Langsam heranpirschen' },
      { do: 'objective', id: 'tour', x: 698, z: -773 },
    ]);
    expect(h.said).toEqual([]);
  });
});
