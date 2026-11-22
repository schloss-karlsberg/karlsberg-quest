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
import { CODEX_XP } from '../src/systems/progression/logic';
import { enemyDef } from '../src/rpg/enemies';
import { levelForXp } from '../src/rpg/stats';
import { StoryEngine, createStorySlice } from '../src/systems/story/engine';
import type { Action, StoryFile } from '../src/systems/story/types';
import { loadStoryFiles } from '../src/systems/story/validate-cli';

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
    expect(k1.checkpoint).toMatchObject({ x: 1059.3, z: -833.1, era: 'today' });
  });

  it('saves: a new game opens with the tour; a save in the old prologue or in chapter 1 resumes where it was', () => {
    const files = loadStoryFiles(ROOT).files.map((f) => f.story).filter((f) => !f.test);
    for (const [chapter, beat] of [['prolog', 'p5'], ['prolog', 'p11'], ['k1', 'k1_3']] as const) {
      const slice = Object.assign(createStorySlice(), { active: true, chapter, beat, unlocked: [chapter] });
      const entered: string[] = [];
      const engine = new StoryEngine(files, () => slice, { run: () => {}, chapterEntered: () => {}, beatEntered: (c, b) => entered.push(`${c}/${b.id}`), chapterCompleted: () => {} });
      expect(engine.first?.chapter).toBe('tour');
      engine.resume(false);
      expect(entered).toEqual([`${chapter}/${beat}`]);
    }
  });
});
