/**
 * Save round-trip and corrupt-slot fuzz tests (TASK-053). Seeded, so every failure names a
 * reproducible seed. The tests drive the real load path: `SaveManager` → `deserializeState` (object
 * slices, `readStorySlice`, the legacy migrations) and, where a system's restore code runs without a
 * scene, the owner's own codec (`owners` below). Invariants: docs/ARCHITECTURE.md, "Saves".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import tourRoute from '../content/routes/p-fuehrung.json';
import { ERAS, isEra } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore, serializeState, STATE_VERSION, type GameState, type SystemStates } from '../src/core/state';
import { allOf } from '../src/core/saved';
import { deriveStats, levelForXp } from '../src/rpg/stats';
import { createDeer, DEER, leaveDeer, stepDeer } from '../src/systems/animals/deer';
import { applyDogRequest, createDog } from '../src/systems/animals/dogs';
import { restoreAnimals, serializeAnimals } from '../src/systems/animals/save';
import { newMemory } from '../src/systems/barks/rules';
import { createSlice as createChronikSlice } from '../src/systems/chronik/types';
import { CombatSim } from '../src/systems/combat/sim';
import { FLASCHEN, readBottleSlice } from '../src/systems/flaschen/spots';
import { newLantern } from '../src/systems/hunt/lanternLogic';
import { PARTY_CREDITS, PARTY_VARIANTS } from '../src/systems/party/types';
import { normaliseSlice as restorePhoto } from '../src/systems/photo/core';
import { createProgressionSlice, normalizeSlice as restoreProgression } from '../src/systems/progression/logic';
import { createQuestSlice, normaliseSlice as restoreQuests } from '../src/systems/quests/logic';
import { createStorySlice } from '../src/systems/story/engine';
import { SURVEY_POINTS } from '../src/systems/travel/points';
import { generatePois } from '../src/systems/travel/pois';
import { buildRoute } from '../src/systems/walk/route';
import { createWalker, restoreWalker, serializeWalker } from '../src/systems/walk/walker';
import { seeded, type Seeded } from './seeded';

type SliceId = keyof SystemStates;
type SliceCase<K extends SliceId> = {
  valid: (rng: Seeded) => SystemStates[K];
  /** A field older saves may lack. */
  missing: keyof SystemStates[K] & string;
};

const SEED = 0x0535a7e;
const CASES = 200;
const CORRUPT_CASES = Math.max(30, Number(process.env.KQ_FUZZ_CASES) || 400);
const ROUTE = buildRoute(tourRoute as Parameters<typeof buildRoute>[0]);
const BOTTLES = FLASCHEN.map(({ id }) => id);
const HANGING_BOTTLES = FLASCHEN.filter(({ verb }) => verb === 'wucht').map(({ id }) => id);
const POINTS = SURVEY_POINTS.map(({ id }) => id);
const POIS = generatePois().slice(0, 12);
const position = (r: Seeded) => ({ x: r.int(500, 1300), z: r.int(-1200, -700) });
const beat = { a: { x: 700, z: -800 }, b: { x: 710, z: -790 } };
const watcher = { npc: 'hanne', x: 700, z: -800, era: '1789', yaw: 45 } as const;

// The mapped type at the end requires a generator for every registered slice.
const slices = {
  animals: {
    valid: (r) => {
      const deer = createDeer({ op: 'spawn', kind: 'reh', id: 'ricke', look: 'ricke', ...position(r), spacing: r.int(1, 5) });
      const dog = createDog({ op: 'spawn', kind: 'hund', id: 'diane', look: 'diane', ...position(r), follow: 'npc:double.jost' });
      if (r.bool()) applyDogRequest(dog, { op: 'run', id: dog.id, path: [[dog.x, dog.z], [dog.x + 12, dog.z]], bark: r.bool(), back: r.bool() });
      deer.yaw = r.fraction() * Math.PI;
      dog.yaw = r.fraction() * Math.PI;
      if (r.bool()) leaveDeer(deer);
      return serializeAnimals(r.bool() ? [deer] : [], r.bool() ? [dog] : []);
    },
    missing: 'dogs',
  },
  barks: {
    valid: (r) => ({
      t: r.int(80, 200),
      mem: r.bool() ? newMemory() : { last: 70, lines: { 'imhoff.bark.wait.01': 70 }, groups: { 'imhoff.bark.wait': 70 } },
      memorials: r.bool() ? [{ id: 'rondell', x: 1815, z: 348, r: 20 }] : [],
    }),
    missing: 'memorials',
  },
  chronik: {
    valid: (r) => ({
      ...createChronikSlice(), since: { clues: r.subset(['clue.k1.rock', 'clue.k1.papier']), nouns: [], facts: r.subset(['cx.12', 'cx.48']) },
      hints: { buse: { stuck: r.int(0, 100), given: [] } }, lastCase: r.bool() ? 'buse' : null,
    }),
    missing: 'echoes',
  },
  cinematic: {
    valid: (r) => ({ playing: r.pick([null, 'reh']) }),
    missing: 'playing',
  },
  combat: {
    valid: (r): SystemStates['combat'] => ({
      hp: r.int(1, 100), stamina: r.int(0, 100), bann: r.int(0, 2), deaths: r.int(0, 8),
      groups: r.bool() ? { lichter: { group: 'lichter', kind: 'irrlicht', era: '1789', ...position(r), count: 4, killed: r.int(0, 4) } } : {},
    }),
    missing: 'deaths',
  },
  court: {
    valid: (r) => ({ sets: r.subset(['k1', '*']), hinted: r.bool() }),
    missing: 'hinted',
  },
  flaschen: {
    valid: (r) => {
      const found = r.subset(BOTTLES);
      const dropped = HANGING_BOTTLES.filter((id) => found.includes(id) || r.bool());
      return { found, dropped, said: found.length >= 8 && r.bool() ? ['marlene'] : [] };
    },
    missing: 'said',
  },
  fx: {
    valid: (r) => r.bool()
      ? { fire: { active: true, clock: r.int(0, 120), seconds: 120, cx: 1250, cz: -1140, radius: 100 }, oblivion: null }
      : { fire: null, oblivion: { active: true, t: r.int(0, 120), seconds: 120 } },
    missing: 'oblivion',
  },
  hunt: {
    valid: (r) => ({
      alert: r.fraction(), lantern: { ...newLantern(), oil: r.fraction(), lit: r.bool() },
      caught: r.int(0, 12), pack: r.bool() ? {
        era: '1793-02', opts: { ...position(r), hounds: r.int(3, 8), mode: 'patrol', beats: [beat, { ...beat, speed: r.fraction() + 0.5 }] },
      } : null,
      kennelOpen: r.bool(),
    }),
    missing: 'kennelOpen',
  },
  menagerie: {
    valid: (r) => ({
      animals: [{ animal: r.pick(['cassowary', 'dromedary', 'jaguar'] as const), ...position(r), id: 'karlslust', heading: r.int(0, 359), count: 1, era: '1789' }],
      calmed: r.subset(['karlslust']),
    }),
    missing: 'calmed',
  },
  npc: {
    valid: (r) => ({
      placed: { hanne: { ...watcher, ...position(r), yaw: r.int(0, 359), chapter: 'k1', look: 'solid', watch: { fov: 70, range: 16, sweep: [-20, 25] } } },
      said: r.subset(['hanne.k1.lohn.1', 'hanne.k1.lohn.2']),
    }),
    missing: 'said',
  },
  party: {
    valid: (r) => r.bool()
      ? { variant: r.pick(PARTY_VARIANTS), credits: r.pick(PARTY_CREDITS) }
      : { variant: null, credits: 'none' },
    missing: 'credits',
  },
  photo: {
    valid: (r) => {
      const id = r.pick(['reh.ricke', 'reh.kitz']);
      const stars = r.int(2, 3);
      const play = r.int(0, 400);
      return {
        album: [{ id, era: 'today', at: new Date(play * 1000).toISOString(), play, stars }],
        good: [id], granted: [id], cards: [], best: { [id]: stars }, near: { [id]: r.fraction() * 20 },
      };
    },
    missing: 'near',
  },
  progression: {
    valid: (r): SystemStates['progression'] => {
      const xp = r.int(0, 1500);
      const total = r.int(1, 8);
      return {
        ...createProgressionSlice(), xp, level: levelForXp(xp),
        inventory: { 'item.balsam': total, 'item.stab.esche': 1 }, equipped: { weapon: 'item.stab.esche', charms: [] },
        placed: r.bool() ? { 'tour.kastanie.01': { id: 'tour.kastanie.01', item: 'item.kastanie', era: 'today', ...position(r) } } : {},
        drops: r.int(0, 40), dry: r.int(0, 5),
      };
    },
    missing: 'drops',
  },
  quests: {
    valid: (r) => {
      const state = r.pick(['active', 'ready', 'done'] as const);
      return {
        ...createQuestSlice(),
        quests: { 'q.k1.kasuar': { state, counts: { beruhigen: state === 'active' ? 0 : 1 }, t: r.int(0, 200) } },
        tracked: state !== 'done' && r.bool() ? ['q.k1.kasuar'] : [],
        bestiary: { irrlicht: r.int(1, 10) },
      };
    },
    missing: 'unseen',
  },
  scenery: {
    valid: (r) => ({ windows: [{ building: 'orangerie', era: r.pick(ERAS), share: r.fraction() }], gate: r.pick([0, 1]), coatTaken: r.bool() }),
    missing: 'coatTaken',
  },
  story: {
    valid: (r) => ({
      ...createStorySlice(), active: true, chapter: 'tour', beat: r.pick(['t2', 't4', 't7', 't10']), chapterTime: r.int(60, 200),
      beatTime: r.fraction() * 60, name: r.pick(['Alex', 'Mina', 'Jo']), said: r.subset(['laub.t.seite', 'marlene.t.messstab']),
    }),
    missing: 'said',
  },
  travel: {
    valid: (r) => {
      const seen = r.subset(POIS);
      const done = r.subset(seen.filter((poi) => poi.kind !== 'shrine'));
      return {
        activated: r.subset(POINTS), announced: r.subset(POINTS), seen: seen.map(({ id }) => id), done: done.map(({ id }) => id),
        shrineT: Object.fromEntries(seen.filter((poi) => poi.kind === 'shrine').map(({ id }) => [id, r.int(0, 1000)])),
        tips: [],
      };
    },
    missing: 'announced',
  },
  walk: {
    valid: (r) => {
      const walker = createWalker({ npc: 'imhoff', route: ROUTE, to: 'einstieg', s: r.int(0, 5) / 10, speed: r.int(2, 5) / 2, wait: { for: 'player', r: 25 } });
      walker.waiting = r.bool();
      return {
        walkers: [serializeWalker(walker)],
        groups: [{ group: 'fuehrung', leader: 'imhoff', members: r.subset(['double.herzog', 'double.jost', 'extra.mats']), mode: r.pick(['follow', 'gather', 'hold'] as const) }],
      };
    },
    missing: 'groups',
  },
} satisfies { [K in SliceId]: SliceCase<K> };

const IDS = Object.keys(slices) as SliceId[];
const resolveRoute = (id: string) => (id === ROUTE.id ? ROUTE : undefined);

type Owner<K extends SliceId> = {
  /** What the owning system holds after a load, computed by its own restore code. */
  restore: (saved: SystemStates[K]) => unknown;
  /** The restore result for a valid slice (default: the slice itself). */
  expected?: (slice: SystemStates[K]) => unknown;
};

// Owner restore code that runs without a scene. Systems not listed read their slice in the scene
// class; for them the tests cover what `deserializeState` guarantees.
const owners: { [K in SliceId]?: Owner<K> } = {
  animals: {
    restore: (s) => {
      const { deer, dogs } = restoreAnimals(s);
      return serializeAnimals(deer, dogs);
    },
  },
  combat: {
    restore: (s) => {
      const sim = new CombatSim({ heightAt: () => 0 }, {});
      sim.loadResources(s);
      return { hp: sim.p.hp, stamina: sim.p.st.stamina, bann: sim.p.bann };
    },
    expected: ({ hp, stamina, bann }) => ({ hp, stamina, bann }),
  },
  flaschen: { restore: (s) => readBottleSlice(s) },
  photo: { restore: (s) => restorePhoto(s) },
  progression: {
    restore: (s) => {
      const slice = restoreProgression(structuredClone(s));
      return { slice, stats: deriveStats(slice) };
    },
    expected: (slice) => ({ slice, stats: deriveStats(slice) }),
  },
  quests: { restore: (s) => restoreQuests(structuredClone(s)) },
  walk: {
    // WalkSystem.slice resets a non-array list before the runtime restores each walker.
    restore: (s) => (Array.isArray(s.walkers) ? s.walkers : [])
      .map((saved) => restoreWalker(saved, resolveRoute))
      .map((walker) => walker && serializeWalker(walker)),
    expected: (s) => s.walkers,
  },
};

function restoreWith<K extends SliceId>(id: K, saved: unknown): unknown {
  return (owners[id] as Owner<K> | undefined)?.restore(saved as SystemStates[K]);
}

function slot() {
  const store = new GameStateStore(createInitialState());
  const storage = new MemoryStorage();
  const events = new EventBus();
  const loaded = vi.fn();
  events.on('save:loaded', loaded);
  const manager = new SaveManager(store, storage, events, () => 0, () => 0);
  return { manager, store, storage, loaded };
}

/** A slot main's design calls unreadable: never loaded, the running state and stored bytes untouched. */
function expectUnreadable(bytes: string): void {
  const { manager, store, storage, loaded } = slot();
  store.mutable.flags.running = true;
  const before = store.state;
  storage.setItem(SAVE_KEY('auto'), bytes);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(manager.availability(), bytes).toBe('unreadable');
    expect(manager.peek(), bytes).toBeNull();
    expect(manager.load(), bytes).toBe(false);
  } finally {
    warn.mockRestore();
  }
  expect(store.state).toBe(before);
  expect(store.state.flags).toEqual({ running: true });
  expect(storage.getItem(SAVE_KEY('auto'))).toBe(bytes);
  expect(loaded).not.toHaveBeenCalled();
}

const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Every number is finite and every field the valid restore result has keeps its kind (an object or
 * string field may be null and the reverse, as with `flee` or `equipped.weapon`). Record keys are compared only
 * where both sides have them; list items are compared with the first valid item.
 */
function expectSane(value: unknown, reference: unknown, path: string): void {
  if (typeof value === 'number') expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  if (reference === undefined) {
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) expectSane(v, undefined, `${path}.${k}`);
    return;
  }
  const [a, b] = [kind(value), kind(reference)];
  const nullable = (a === 'null' && (b === 'object' || b === 'string')) || ((a === 'object' || a === 'string') && b === 'null');
  if (!nullable) expect(a, `${path} is ${a}, expected ${b}`).toBe(b);
  if (Array.isArray(value)) {
    const item = (reference as unknown[])[0];
    value.forEach((v, i) => expectSane(v, item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    const ref = reference && typeof reference === 'object' ? (reference as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(value)) expectSane(v, ref[k], `${path}.${k}`);
  }
}

/** A readable state satisfies the invariants every system relies on before its own restore runs. */
function expectLoadable(state: GameState, context: string, reference?: GameState): void {
  expect(state.version, context).toBe(STATE_VERSION);
  expect(isEra(state.era), context).toBe(true);
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch'] as const) expect(Number.isFinite(state.player[key]), `${context}: player.${key}`).toBe(true);
  for (const [id, value] of Object.entries(state.systems)) expect(kind(value), `${context}: systems.${id}`).toBe('object');
  const story = state.systems.story;
  if (story) {
    for (const key of ['fired', 'unlocked', 'completed', 'doneBeats', 'said'] as const) {
      expect(Array.isArray(story[key]) && story[key].every((id) => typeof id === 'string'), `${context}: story.${key}`).toBe(true);
    }
  }
  for (const id of IDS) {
    if (!state.systems[id] || !owners[id]) continue;
    const restored = restoreWith(id, structuredClone(state.systems[id]));
    const ref = reference?.systems[id] ? restoreWith(id, structuredClone(reference.systems[id])) : undefined;
    expectSane(restored, ref, `${context}: ${id}`);
  }
}

function roundTrip<K extends SliceId>(id: K, slice: SystemStates[K], context: string): void {
  const state = createInitialState();
  state.systems = { [id]: structuredClone(slice) };
  const json = serializeState(state);
  const loaded = deserializeState(json);
  expect(loaded.systems[id], context).toEqual(slice);
  expect(serializeState(loaded), context).toBe(json);
  const owner = owners[id] as Owner<K> | undefined;
  if (owner) expect(owner.restore(loaded.systems[id] as SystemStates[K]), context).toEqual((owner.expected ?? ((s) => s))(slice));
}

describe.each(IDS)('%s save slice', (id) => {
  const { valid, missing } = slices[id] as SliceCase<typeof id>;

  it('round-trips 200 valid seeded states', () => {
    for (let i = 0; i < CASES; i++) {
      const seed = SEED + i;
      roundTrip(id, valid(seeded(seed)), `${id}, seed ${seed}`);
    }
  });

  it('keeps known progress through v0, missing fields and extra data', () => {
    const { manager, store, storage } = slot();
    const state = createInitialState();
    state.inventory.clues.push('clue.k1.rock');
    const known: Record<string, unknown> = { ...valid(seeded(SEED)) };
    delete known[missing];
    const legacy = { version: 0, inventory: state.inventory, systems: { [id]: { ...known, futureField: ['keep'] }, futureSystem: { n: 1 } } };
    storage.setItem(SAVE_KEY('auto'), JSON.stringify(legacy));

    expect(manager.load()).toBe(true);
    expect(store.state.systems[id]).toMatchObject({ ...known, futureField: ['keep'] });
    expect(store.state.systems.futureSystem).toEqual({ n: 1 });
    expect(store.state.inventory).toEqual(state.inventory);
    expect(store.state.version).toBe(STATE_VERSION);
    expect(store.state.player).toEqual(state.player);
    expect(store.state.meta).toEqual(state.meta);
    expectLoadable(store.state, `${id} legacy`);
    expect(manager.save()).toBe(true);
    expect(manager.peek()).toEqual(store.state);
  });

  it('rejects a slice that is not an object', () => {
    for (const value of [null, [], 9, 'x', true]) expectUnreadable(JSON.stringify({ version: STATE_VERSION, systems: { [id]: value } }));
  });
});

// Field-level corruption in slices whose owner restores without a scene: the slot loads and the
// owner's restore result has the same shape as for a valid save, with no NaN.
const ownerMalformed: { [K in SliceId]?: Record<string, unknown>[] } = {
  animals: [
    { deer: 'ricke' }, { dogs: [null] }, { deer: [null, 7] }, { v: -1 },
    ...[{ notice: 0 }, { flee: -1 }, { settle: 'far' }, {}].map((shy) => ({
      deer: [{ ...serializeAnimals([createDeer({ op: 'spawn', kind: 'reh', id: 'ricke' })], []).deer[0]!, shy }],
    })),
    { deer: [{ id: 'ricke', look: 'ricke', state: 'graze' }] },
    { dogs: [{ id: 'diane', look: 'diane', state: 'bolt', path: 'west' }] },
  ],
  combat: [{ stamina: 'full' }, { stamina: null }, { bann: -3 }, { hp: '50' }, { hp: 1e9 }, {}],
  flaschen: [{ found: 'fl.heute.quelle' }, { dropped: [1] }, { said: null }],
  photo: [{ album: 'x' }, { album: [null, 4] }, { good: [1, 'reh.ricke'] }, { best: [] }, { near: 'far' }],
  progression: [
    { xp: 'lots' }, { level: -4 }, { inventory: null }, { equipped: 'staff' }, { equipped: { weapon: 4, charms: 'x' } },
    { talents: { 'tal.zaeh': 'x' } }, { talents: [] }, { placed: [] }, { drops: 'x' },
  ],
  quests: [
    { quests: { 'q.k1.kasuar': null } }, { quests: { 'q.k1.kasuar': 'done' } }, { quests: [] },
    { quests: { 'q.k1.kasuar': { state: 'active', counts: 'x', t: 'x' } } }, { tracked: 'q.k1.kasuar' }, { bestiary: 'x' },
  ],
  walk: [{ walkers: 'x' }, { walkers: [null] }, { walkers: [{ npc: 'imhoff' }] }, { walkers: [{ npc: 'imhoff', route: ROUTE.id, s: 'x', speed: -1 }] }],
};

describe.each(Object.keys(ownerMalformed) as SliceId[])('%s owner restore of malformed fields', (id) => {
  it('loads and restores the same shape as a valid save', () => {
    const base = (slices[id] as SliceCase<typeof id>).valid(seeded(SEED));
    const reference = restoreWith(id, structuredClone(base));
    for (const patch of ownerMalformed[id]!) {
      const { manager, store, storage } = slot();
      const bytes = JSON.stringify({ version: STATE_VERSION, systems: { [id]: { ...base, ...patch } } });
      storage.setItem(SAVE_KEY('auto'), bytes);
      expect(manager.load(), bytes).toBe(true);
      expectSane(restoreWith(id, structuredClone(store.state.systems[id])), reference, bytes);
    }
  });
});

describe('story slice (readStorySlice)', () => {
  it.each([
    { fired: 'k1_0' }, { doneBeats: false }, { said: [1] }, { latched: { a: 'x' } }, { sayCount: [] },
    { threats: { pack: 1 } }, { meters: { m: null } }, { objective: 'Zur Quelle' }, { objective: { x: 1 } },
    { look: 'noon' }, { lookPast: { era: '1789', time: 'noon' } }, { ending: 'flood' },
  ])('rejects a malformed story field as unreadable (%o)', (patch) => {
    const story = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_3', ...patch };
    expectUnreadable(JSON.stringify({ version: STATE_VERSION, systems: { story } }));
  });

  it('accepts every look time and ending the story types allow', () => {
    for (const look of allOf<SystemStates['story']['look']>()(['day', 'dawn', 'dusk', 'night', 'tour'])) {
      for (const ending of [...PARTY_VARIANTS, null]) {
        const story = { ...createStorySlice(), look, ending };
        expect(deserializeState(JSON.stringify({ systems: { story } })).systems.story).toMatchObject({ look, ending });
      }
    }
  });

  // migrateEndingProgress (TASK-045) runs on every load of the endings chapter.
  const endingSave = (r: Seeded): GameState => {
    const state = createInitialState();
    const beat = r.pick(['e1', 'e2', 'e3'] as const);
    const ending = beat === 'e1' && r.bool() ? null : r.pick(PARTY_VARIANTS);
    state.systems.story = {
      ...createStorySlice(), active: true, chapter: 'enden', beat, ending, beatTime: r.fraction() * 60,
      unlocked: ['enden'], completed: r.bool() ? ['enden'] : [],
    };
    if (ending) state.flags['flag.end'] = ending;
    if (beat === 'e3' || (beat === 'e2' && ending && r.bool())) state.flags['story.party'] = ending ?? 'museum';
    if (beat === 'e3') state.flags['story.party.arrived'] = true;
    state.systems.party = slices.party.valid(r);
    return state;
  };

  it('leaves 200 current-format ending saves unchanged', () => {
    for (let i = 0; i < CASES; i++) {
      const seed = SEED + i;
      const json = serializeState(endingSave(seeded(seed)));
      expect(serializeState(deserializeState(json)), `ending, seed ${seed}`).toBe(json);
    }
  });

  it('loads a finished legacy ending save with any party slice', () => {
    const party = [undefined, {}, { variant: 7 }, { credits: null }, { variant: 'keep', credits: 'done' }, { variant: null, credits: 'done' }];
    for (const [i, slice] of party.entries()) {
      const state = endingSave(seeded(SEED + i));
      state.systems.story = { ...state.systems.story!, finished: true, completed: ['enden'] };
      state.flags['story.credits'] = true;
      const raw = JSON.parse(serializeState(state)) as { systems: Record<string, unknown> };
      if (slice === undefined) delete raw.systems.party;
      else raw.systems.party = slice;
      const { manager, store, storage } = slot();
      storage.setItem(SAVE_KEY('auto'), JSON.stringify(raw));
      expect(manager.load(), JSON.stringify(slice)).toBe(true);
      expectLoadable(store.state, `legacy ending, party ${JSON.stringify(slice)}`);
    }
  });
});

it('allOf fails the typecheck when a union value is missing', () => {
  type Mode = 'a' | 'b';
  expect(allOf<Mode>()(['a', 'b'])).toEqual(['a', 'b']);
  // @ts-expect-error 'b' is missing from the list
  allOf<Mode>()(['a']);
});

// ---- corrupt-slot fuzz -------------------------------------------------------------------------

function fullSave(r: Seeded): GameState {
  const state = createInitialState();
  for (const id of IDS) (state.systems as Record<string, unknown>)[id] = (slices[id] as SliceCase<typeof id>).valid(r);
  state.meta.playSeconds = r.int(0, 20000);
  state.era = r.pick(ERAS);
  return state;
}

const JUNK: readonly unknown[] = [null, -1, 0, 1.5, 1e9, -1e9, '', 'x', true, false, [], {}, [null], { x: null }, ['x', 1]];

/** All paths below `systems` (where saves vary most), plus the top-level fields. */
function paths(value: unknown, at: string[] = [], out: string[][] = []): string[][] {
  if (at.length) out.push(at);
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (at.length === 0 && k !== 'systems') out.push([k]);
      else paths(v, [...at, k], out);
    }
  }
  return out;
}

function corrupt(r: Seeded, state: GameState): string {
  if (r.int(0, 9) === 0) {
    const json = serializeState(state);
    return json.slice(0, r.int(0, json.length - 1));
  }
  const doc = structuredClone(state) as unknown as Record<string, unknown>;
  const all = paths(doc);
  for (let n = r.int(1, 3); n > 0; n--) {
    const path = r.pick(all);
    let parent = doc as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      const next = parent[key];
      if (!next || typeof next !== 'object') break;
      parent = next as Record<string, unknown>;
    }
    const key = path[path.length - 1]!;
    if (r.int(0, 4) === 0) delete parent[key];
    else parent[key] = structuredClone(r.pick(JUNK));
  }
  return JSON.stringify(doc);
}

describe('corrupt save slots', () => {
  it(`loads ${CORRUPT_CASES} seeded corrupt slots cleanly or rejects them as unreadable`, () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let readable = 0;
    try {
      for (let i = 0; i < CORRUPT_CASES; i++) {
        const seed = SEED + 10_000 + i;
        const r = seeded(seed);
        const original = fullSave(r);
        const bytes = corrupt(r, original);
        const { manager, store, storage, loaded } = slot();
        const before = store.state;
        storage.setItem(SAVE_KEY('auto'), bytes);
        const context = `seed ${seed}`;
        const status = manager.availability();
        if (status === 'unreadable') {
          expect(manager.load(), context).toBe(false);
          expect(store.state, context).toBe(before);
          expect(storage.getItem(SAVE_KEY('auto')), context).toBe(bytes);
          expect(loaded, context).not.toHaveBeenCalled();
          continue;
        }
        readable++;
        expect(status, context).toBe('readable');
        expect(manager.load(), context).toBe(true);
        expectLoadable(store.state, context, deserializeState(serializeState(original)));
        // A loaded slot saves and loads back unchanged.
        expect(manager.save(), context).toBe(true);
        expect(manager.peek(), context).toEqual(store.state);
      }
    } finally {
      warn.mockRestore();
    }
    // Most single-field corruptions stay loadable: the fuzz must exercise the owners, not only rejection.
    expect(readable).toBeGreaterThan(CORRUPT_CASES / 3);
  });
});

// ---- regressions found by the fuzz -------------------------------------------------------------

it.each([
  { saved: {}, expected: { stamina: 100, bann: 2 } },
  { saved: { stamina: 0 }, expected: { stamina: 0, bann: 2 } },
  { saved: { bann: 0 }, expected: { stamina: 100, bann: 0 } },
])('cold-restores sparse combat resources and reloads the next save ($saved)', ({ saved, expected }) => {
  const { manager, store, storage } = slot();
  const combat = { hp: 65, groups: {}, deaths: 3, ...saved };
  storage.setItem(SAVE_KEY('auto'), JSON.stringify({ systems: { combat } }));

  expect(manager.load()).toBe(true);
  const sim = new CombatSim({ heightAt: () => 0 }, store.mutable.systems.combat!.groups);
  sim.loadResources(store.mutable.systems.combat!);
  expect({ hp: sim.p.hp, stamina: sim.p.st.stamina, bann: sim.p.bann }).toEqual({ hp: 65, ...expected });
});

it.each([
  { shy: {}, expected: { notice: DEER.NOTICE, flee: DEER.FLEE, settle: DEER.SETTLE } },
  { shy: { notice: 40, settle: 30 }, expected: { notice: 40, flee: DEER.FLEE, settle: 30 } },
  { shy: { notice: 'near', flee: -2, settle: 0 }, expected: { notice: DEER.NOTICE, flee: DEER.FLEE, settle: DEER.SETTLE } },
])('restores sparse deer radii and reloads a save after a nearby step ($shy)', ({ shy, expected }) => {
  const { manager, store, storage } = slot();
  const herd = serializeAnimals([createDeer({ op: 'spawn', kind: 'reh', id: 'ricke', x: 700, z: -800 })], []);
  const animals = { ...herd, deer: [{ ...herd.deer[0]!, shy }] };
  storage.setItem(SAVE_KEY('auto'), JSON.stringify({ systems: { animals } }));

  expect(manager.load()).toBe(true);
  const { deer, dogs } = restoreAnimals(store.state.systems.animals);
  const doe = deer[0]!;
  expect(doe.shy).toEqual(expected);
  stepDeer(doe, 0.1, { player: { x: doe.x + doe.shy.flee + 1, z: doe.z, stance: 'stand', speed: 1 } });
  expect(Number.isFinite(doe.meter)).toBe(true);
  expect(doe.meter).toBeGreaterThan(0);
  store.mutable.systems.animals = serializeAnimals(deer, dogs);
  expect(manager.save()).toBe(true);
  expect(manager.load()).toBe(true);
  expect(store.state.systems.animals?.deer[0]).toMatchObject({ shy: expected, meter: doe.meter });
});

it('keeps only distinct known bottles when loading collection progress', () => {
  const { manager, store, storage } = slot();
  const bottle = BOTTLES.find((id) => !HANGING_BOTTLES.includes(id))!;
  const hanging = HANGING_BOTTLES[0]!;
  storage.setItem(SAVE_KEY('auto'), JSON.stringify({
    version: 0,
    systems: {
      flaschen: { found: [bottle, 'unknown.bottle', hanging, bottle, 7], dropped: [bottle, hanging, hanging], said: ['marlene'] },
    },
  }));
  expect(manager.load()).toBe(true);
  expect(readBottleSlice(store.state.systems.flaschen!)).toEqual({ found: [bottle, hanging], dropped: [hanging], said: ['marlene'] });
});

it.each([0, 2, undefined])('restores unsupported animal version %s as empty and keeps quest progress', (v) => {
  const { manager, store, storage } = slot();
  const animals = { v, deer: [{ id: 'ricke' }] };
  const quests = { quests: { 'q.k1.kasuar': { state: 'done', counts: { beruhigen: 1 } } } };
  storage.setItem(SAVE_KEY('auto'), JSON.stringify({ systems: { animals, quests } }));

  expect(manager.load()).toBe(true);
  expect(restoreAnimals(store.state.systems.animals)).toEqual({ deer: [], dogs: [] });
  expect(store.state.systems.quests).toEqual(quests);
});

// ---- real saves ----------------------------------------------------------------------------------

/**
 * Real slots: the legacy release fixtures, plus any directory listed in KQ_SAVE_DIRS (colon
 * separated), e.g. the e2e campaign's test-results/campaign-saves.
 */
const realSaves = [
  new URL('./fixtures/saves/', import.meta.url).pathname,
  ...(process.env.KQ_SAVE_DIRS ?? '').split(':').filter(Boolean),
].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `${dir.replace(/\/$/, '')}/${f}`));

it.each(realSaves)('loads, restores and re-saves the real slot %s', (file) => {
  const bytes = readFileSync(file, 'utf8');
  const { manager, store, storage } = slot();
  storage.setItem(SAVE_KEY('auto'), bytes);
  expect(manager.availability()).toBe('readable');
  expect(manager.load()).toBe(true);
  expectLoadable(store.state, file);
  // The stricter owner reads drop nothing from a real save.
  const { systems } = store.state;
  const size = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
  const restored = <K extends SliceId>(id: K) => restoreWith(id, structuredClone(systems[id])) as Record<string, unknown>;
  if (systems.animals?.v === 1) {
    const { deer, dogs } = restored('animals') as unknown as SystemStates['animals'];
    expect([deer.length, dogs.length]).toEqual([size(systems.animals.deer), size(systems.animals.dogs)]);
  }
  if (systems.quests) expect(Object.keys(restored('quests').quests as object)).toEqual(Object.keys(systems.quests.quests ?? {}));
  if (systems.flaschen) expect(restored('flaschen')).toEqual(systems.flaschen);
  if (systems.photo) expect(size(restored('photo').album)).toBe(size(systems.photo.album));
  if (systems.progression) expect((restored('progression').slice as SystemStates['progression'])).toEqual(systems.progression);
  if (systems.walk) expect(size(restored('walk'))).toBe(size(systems.walk.walkers));
  expect(manager.save()).toBe(true);
  expect(manager.peek()).toEqual(store.state);
});
