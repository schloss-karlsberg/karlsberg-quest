/**
 * The tour replaces the old surveyor prologue as the opening of a new game. Chapter 1 must find
 * the same world whichever opening ran: this test folds both chapter files into the state they
 * leave behind on the main path (story flags, items, skills, XP → level, codex, unlocks) and diffs
 * them on the keys chapter 1 and later read. Tour-only extras (the photo album, the deer card …)
 * may come on top; nothing the prologue left may be missing.
 *
 * Main path = every beat's enter / reactions / exit in order (the chapter-wide optional reactions
 * — hub clues, side quests — are left out), then the chapter's `leave` list, plus what the main quests the chapter offers pay out
 * when done: their rewards, their kill objectives' XP, their history facts (codex: +10 XP each).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore } from '../src/core/state';
import type { QuestFile, QuestState } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook } from '../src/systems/quests/logic';
import { CODEX_XP, createProgressionSlice } from '../src/systems/progression/logic';
import { enemyDef } from '../src/rpg/enemies';
import { levelForXp } from '../src/rpg/stats';
import { createStorySlice, StoryEngine, runsOnResume } from '../src/systems/story/engine';
import { storiesInPlay } from '../src/systems/story/stories';
import { loadStoryFiles } from '../src/systems/story/validate-cli';
import type { Action, StoryFile } from '../src/systems/story/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8')) as T;
const story = (name: string) => json<StoryFile>(`content/story/${name}.story.json`);

type Reveals = { facts?: string[]; flags?: string[] };
const clues = new Map<string, Reveals>();
for (const f of readdirSync(`${ROOT}content/packs`).filter((n) => n.endsWith('.json')))
  for (const c of json<{ clues?: { id: string; reveals?: Reveals }[] }>(`content/packs/${f}`).clues ?? []) clues.set(c.id, c.reveals ?? {});

interface QuestDef {
  id: string;
  kind: string;
  history?: { fact?: string }[];
  objectives?: { type: string; enemy?: string; count?: number; optional?: boolean }[];
  rewards?: { xp?: number; items?: { item: string; count?: number }[]; skills?: { id: string; tier: number }[]; codex?: string[]; flags?: Record<string, unknown> };
}
const quests = new Map<string, QuestDef>();
for (const f of readdirSync(`${ROOT}content/quests`).filter((n) => n.endsWith('.quests.json')))
  for (const q of json<{ quests: QuestDef[] }>(`content/quests/${f}`).quests) quests.set(q.id, q);

interface EndState {
  flags: Record<string, unknown>;
  items: Record<string, number>;
  skills: Record<string, number>;
  codex: Set<string>;
  xp: number;
  unlocked: Set<string>;
}

function fold(f: StoryFile): EndState {
  const st: EndState = { flags: {}, items: {}, skills: {}, codex: new Set(), xp: 0, unlocked: new Set() };
  const fact = (id: string) => {
    if (st.codex.has(id)) return;
    st.codex.add(id);
    st.xp += CODEX_XP;
  };
  const clue = (id: string) => {
    const r = clues.get(id) ?? {};
    for (const x of r.facts ?? []) fact(x);
    for (const x of r.flags ?? []) st.flags[x] = true;
  };
  const item = (id: string, n = 1) => (st.items[id] = (st.items[id] ?? 0) + n);
  const skill = (id: string, tier: number) => (st.skills[id] = Math.max(st.skills[id] ?? 0, tier));
  const mainQuests: string[] = [];
  const apply = (actions: Action[] | undefined) => {
    for (const a of actions ?? []) {
      if (a.do === 'flag') for (const [k, v] of Object.entries(a.set)) v === null ? delete st.flags[k] : (st.flags[k] = v);
      else if (a.do === 'give') {
        if (a.item) item(a.item);
        if (a.clue) clue(a.clue);
      } else if (a.do === 'grant') clue(a.clue);
      else if (a.do === 'item') item(a.item, a.count ?? 1);
      else if (a.do === 'skill') skill(a.id, a.tier);
      else if (a.do === 'xp') st.xp += a.amount;
      else if (a.do === 'unlock') st.unlocked.add(a.chapter);
      else if (a.do === 'quest' && (a.op === 'offer' || a.op === 'start') && quests.get(a.id)?.kind === 'main' && !mainQuests.includes(a.id)) mainQuests.push(a.id);
    }
  };
  for (const b of f.beats) {
    apply(b.enter);
    for (const r of b.on ?? []) apply(r.do);
    apply(b.exit);
  }
  // the chapter's own rules lifted as the story leaves it
  apply(f.leave);
  for (const id of mainQuests) {
    const q = quests.get(id)!;
    const r = q.rewards ?? {};
    st.xp += r.xp ?? 0;
    for (const o of q.objectives ?? []) if (o.type === 'kill' && !o.optional) st.xp += (enemyDef(o.enemy ?? '')?.xp ?? 0) * (o.count ?? 1);
    for (const i of r.items ?? []) item(i.item, i.count ?? 1);
    for (const s of r.skills ?? []) skill(s.id, s.tier);
    for (const [k, v] of Object.entries(r.flags ?? {})) st.flags[k] = v;
    for (const x of [...(q.history ?? []).map((h) => h.fact), ...(r.codex ?? [])]) if (x) fact(x);
  }
  if (f.next) st.unlocked.add(f.next);
  return st;
}

/** Flags chapter 1 and later read: their conditions, plus the ones the systems read in code. */
function laterFlags(): Set<string> {
  const keys = new Set(['story.compass', 'story.laub', 'laub.silent', 'combat.disabled', 'barks.quiet', 'quelle.guide', 'quelle.call', 'map.compare', 'tour.slice']);
  for (const n of ['01-kapitel-1', '02-kapitel-2', '03-kapitel-3', '04-kapitel-4', '05-enden']) {
    const text = readFileSync(`${ROOT}content/story/${n}.story.json`, 'utf8');
    for (const m of text.matchAll(/"flag":\s*"([^"]+)"/g)) keys.add(m[1]!);
  }
  return keys;
}

describe('the tour hands over into chapter 1 like the old prologue did', () => {
  const prolog = fold(story('00-prolog'));
  const tour = fold(story('00-tour'));

  it('the prologue main path, as a reference (level 3: the XP budget of the opening)', () => {
    expect(levelForXp(prolog.xp)).toBe(3);
    expect(prolog.skills).toEqual({ relief: 3, kartograf: 1 });
    // (the Messstab is picked up in the world, a collect objective; chapter 1 hands it over again)
    expect(prolog.items).toEqual({ 'item.bussole': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1 });
    expect(prolog.xp).toBe(549);
  });

  it('diff on the keys chapter 1 reads: flags, skills, items, XP / level, unlock', () => {
    const diff: string[] = [];
    for (const k of laterFlags()) if (prolog.flags[k] !== tour.flags[k]) diff.push(`flag ${k}: prolog ${String(prolog.flags[k])} · tour ${String(tour.flags[k])}`);
    for (const [k, v] of Object.entries(prolog.skills)) if ((tour.skills[k] ?? 0) !== v) diff.push(`skill ${k}: prolog ${v} · tour ${tour.skills[k] ?? 0}`);
    for (const k of Object.keys(tour.skills)) if (!(k in prolog.skills)) diff.push(`skill ${k}: tour only`);
    // items: everything the prologue left (quest rewards included); tour-only extras on top
    for (const [k, v] of Object.entries(prolog.items)) if ((tour.items[k] ?? 0) < v) diff.push(`item ${k}: prolog ${v} · tour ${tour.items[k] ?? 0}`);
    if (levelForXp(tour.xp) !== levelForXp(prolog.xp)) diff.push(`level: prolog ${levelForXp(prolog.xp)} · tour ${levelForXp(tour.xp)}`);
    if (tour.xp < prolog.xp) diff.push(`xp: prolog ${prolog.xp} · tour ${tour.xp}`);
    if (!tour.unlocked.has('k1')) diff.push('k1 not unlocked');
    expect(diff).toEqual([]);
  });

  it('both openings end in today and lead into chapter 1 at the Quelle', () => {
    const k1 = story('01-kapitel-1');
    expect(story('00-tour').next).toBe('k1');
    expect(story('00-prolog').next).toBe('k1');
    // chapter 1's checkpoint puts both into the present at the spring (the tour ends in 1789)
    expect(k1.checkpoint).toMatchObject({ x: 1059.3, z: -833.1, yaw: 50, era: 'today' });
  });

});

describe('retired prologue saves', () => {
  it.each(['v0.6.0', 'v0.7.0', 'v0.8.0'])('continues and re-saves the unmodified %s auto slot', (tag) => {
    const bytes = readFileSync(new URL(`./fixtures/saves/${tag}.json`, import.meta.url), 'utf8');
    const original = JSON.parse(bytes) as ReturnType<typeof createInitialState>;
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY('auto'), bytes);
    const store = new GameStateStore(createInitialState());
    const saves = new SaveManager(store, storage, undefined, () => Date.parse(original.meta.savedAt!));

    const preview = saves.peek()!;
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(bytes);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(preview);
    expect(preview.era).toBe('today');
    expect(preview.player).toMatchObject({ x: 1059.3, z: -833.1, yaw: -50 * Math.PI / 180, stance: 'stand', flying: false });
    expect(preview.systems.story).toMatchObject({
      active: true, chapter: 'k1', beat: 'k1_0', name: 'Mara', completed: ['tour'], unlocked: ['prolog', 'k1'],
      doneBeats: original.systems.story!.doneBeats, said: original.systems.story!.said, objective: null,
    });
    expect(preview.meta).toEqual(original.meta);
    expect(preview.codex).toEqual(original.codex);
    expect(preview.systems.quests?.quests).toEqual(original.systems.quests?.quests);
    expect(preview.systems.quests?.tracked).toEqual([]);
    expect(preview.systems.photo).toEqual(original.systems.photo);
    if (tag === 'v0.8.0') {
      expect(preview.systems.combat).toMatchObject({ hp: 61, deaths: 1, groups: {} });
      expect(preview.systems.progression?.placed).toEqual(original.systems.progression?.placed);
    }
    expect(preview.skills).toMatchObject({ relief: 3, kartograf: 1 });
    expect(preview.flags).toMatchObject({ 'story.compass': true, 'story.laub': true, 'rpg.level': 3 });
    expect(preview.inventory.items).toEqual(['item.bussole']);
    expect(preview.systems.progression).toMatchObject({
      xp: 549, level: 3, points: tag === 'v0.6.0' ? 2 : 1, talents: original.systems.progression!.talents,
      equipped: { weapon: 'item.stab.esche', charms: [] },
      inventory: { 'item.stab.esche': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1 },
    });
    const current = store.mutable;
    const defs = questsInPlay(['00-prolog', '01-kapitel-1'].map((id) => ({
      data: json<QuestFile>(`content/quests/${id}.quests.json`),
    })), false);
    const book = new QuestBook(defs.quests, current.systems.quests!, {
      flags: current.flags, codex: current.codex.facts, emit: () => {}, now: () => current.meta.playSeconds, rng: () => 0,
    });
    const engine = new StoryEngine(storiesInPlay(loadStoryFiles(ROOT).files, new URLSearchParams()), () => current.systems.story!, {
      run: (actions, { resume }) => {
        for (const action of actions) {
          if (resume && !runsOnResume(action)) continue;
          if (action.do === 'quest' && action.op === 'offer') book.offer(action.id);
          if (action.do === 'shift') current.era = action.to;
        }
      },
      chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {},
    });
    engine.resume();
    expect(engine.beat()?.id).toBe('k1_0');
    expect(book.tracked()).toEqual(['q.k1.ankunft']);
    expect(book.state('q.k1.ankunft')).toBe('active');
    engine.onEvent('quelle:touch', { era: 'today' });
    engine.tick(0.1, {
      era: current.era, x: current.player.x, z: current.player.z, flags: current.flags, inventory: current.inventory,
      chronik: current.chronik, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
    });
    expect(engine.beat()?.id).toBe('k1_0b');
    expect(current.era).toBe('1789');

    expect(saves.save()).toBe(true);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(current);
  });

  const beats = story('00-prolog').beats.map((b) => b.id);
  const questStates = [undefined, 'hidden', 'offered', 'active', 'ready', 'done', 'failed'] as const satisfies readonly (QuestState | undefined)[];
  it.each(beats)('moves %s regardless of quest status', (beat) => {
    for (const status of questStates) {
      const state = createInitialState();
      state.era = '1789';
      state.flags = { 'shift.allowed': true, 'shift.target': '1789', 'shift.x': 1, 'barks.quiet': true };
      state.systems.story = Object.assign(createStorySlice(), {
        active: true, chapter: 'prolog', beat, beatTime: 90, chapterTime: 400, latched: { 'c:touch': 1 }, fired: ['c:foo'],
        objective: { text: 'Alt' }, completed: ['test'], room: 'old-room',
        threats: { pack: { kind: 'pack', active: true } },
        meters: { oil: { id: 'oil', value: 0.5, seconds: 120, full: 'caught' } },
      });
      state.systems.hunt = { alert: 0.6, caught: 2, pack: { era: '1789', opts: {} } };
      const quests = state.systems.quests = createQuestSlice();
      if (status) {
        quests.quests['q.p.irrlichter'] = { state: status, counts: { lichter: status === 'ready' ? 3 : 1 }, t: 12 };
        quests.tracked.push('q.p.irrlichter');
      }
      const migrated = deserializeState(JSON.stringify(state));
      expect(migrated.systems.story).toMatchObject({
        chapter: 'k1', beat: 'k1_0', beatTime: 0, chapterTime: 0, latched: {}, fired: [], objective: null,
        completed: ['test', 'tour'], room: null, threats: {}, meters: {},
      });
      expect(migrated.systems.hunt).toEqual({ alert: 0, caught: 2, pack: null });
      for (const key of Object.keys(state.flags)) expect(migrated.flags[key]).toBeUndefined();
      expect(migrated.systems.quests?.tracked).toEqual([]);
      expect(migrated.systems.quests?.quests['q.p.irrlichter']?.state).toBe(status === 'ready' ? 'done' : status);
      expect(migrated.systems.quests?.quests['q.p.irrlichter']?.counts).toEqual(quests.quests['q.p.irrlichter']?.counts);
    }
  });

  it('pays earned quest rewards once and retains gear, skills and progression above the floor', () => {
    const state = createInitialState();
    state.systems.story = Object.assign(createStorySlice(), { active: true, chapter: 'prolog', beat: 'p9b' });
    state.skills = { relief: 4, kartograf: 2 };
    state.systems.progression = Object.assign(createProgressionSlice(), {
      xp: 1150, level: 4, points: 1, talents: { 'stab.wucht': 2 },
      inventory: { 'item.stab.esche': 1, 'item.balsam': 7, 'item.lampenoel': 2, 'item.stab.eiche': 1 },
      equipped: { weapon: 'item.stab.eiche', charms: ['charm.example'] },
      placed: {
        old: { id: 'old', x: 0, z: 0, era: 'today', item: 'item.balsam', quest: 'q.p.relief' },
        other: { id: 'other', x: 1, z: 1, era: 'today', item: 'item.balsam' },
      },
    });
    state.systems.quests = { ...createQuestSlice(), tracked: ['q.p.irrlichter', 'q.k1.kasuar'], quests: {
      'q.p.irrlichter': { state: 'ready', counts: { lichter: 4 }, t: 12 },
      'q.p.trichter': { state: 'done', counts: { finden: 1, melden: 1 }, t: 8 },
    }};
    const migrated = deserializeState(JSON.stringify(state));
    expect(migrated.systems.progression).toMatchObject({
      xp: 1210, level: 5, points: 2, talents: { 'stab.wucht': 2 },
      inventory: { 'item.balsam': 7, 'item.lampenoel': 4, 'item.p.seite': 1 },
      equipped: state.systems.progression.equipped,
    });
    expect(migrated.systems.progression?.placed).toEqual({ other: state.systems.progression.placed!.other });
    expect(migrated.skills).toEqual(state.skills);
    expect(migrated.systems.quests?.tracked).toEqual(['q.k1.kasuar']);
    expect(migrated.codex.facts).toEqual(['rm.08']);
    expect(migrated.flags).toMatchObject({ 'quest.q.p.irrlichter': 'done', 'quest.q.p.trichter': 'done' });
    expect(deserializeState(JSON.stringify(migrated))).toEqual(migrated);
  });

  it.each([['tour', 't13'], ['k1', 'k1_3'], ['k3', 'k3_5']])('preserves a save in %s', (chapter, beat) => {
    const state = createInitialState();
    state.systems.story = Object.assign(createStorySlice(), { active: true, chapter, beat });
    state.systems.progression = Object.assign(createProgressionSlice(), { xp: 123, inventory: { 'item.balsam': 1 } });
    state.skills.relief = 1;
    if (chapter === 'k3') {
      state.systems.story.completed = ['prolog', 'k1', 'k2'];
      state.systems.quests = { ...createQuestSlice(), quests: { 'q.p.trichter': { state: 'done', counts: { finden: 1, melden: 1 }, t: 40 } } };
      state.flags['quest.q.p.trichter'] = 'done';
    }
    expect(deserializeState(JSON.stringify(state))).toEqual(state);
  });
});
