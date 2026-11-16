/**
 * Action-RPG contract layer (docs/ACTION-RPG.md): quest files and their validator, the story's new
 * actions / conditions, the enemy / item / loot catalogues, the level curve and derived stats, the
 * shared input keys. The three RPG tracks build on these; keep them green.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gameBounds, loadPacks } from '../scripts/validate-content';
import { DEFAULT_BINDINGS, REBINDABLE, SHARED_KEYS } from '../src/player/input';
import { ENEMIES, ENEMY_IDS } from '../src/rpg/enemies';
import { COLLECTIONS, ITEMS, ITEM_IDS, LOOT } from '../src/rpg/items';
import { BASE_STATS, LEVEL_XP, MAX_LEVEL, TALENTS, charmSlots, deriveStats, levelForXp, levelProgress } from '../src/rpg/stats';
import type { QuestFile } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { chapterKey, validateQuests } from '../src/systems/quests/validate';
import { loadQuestFiles, questRefs, storyNpcs } from '../src/systems/quests/validate-cli';
import { evaluate, questHolds } from '../src/systems/story/engine';
import type { StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles } from '../src/systems/story/validate-cli';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { packs } = loadPacks(ROOT);
const chapters = new Set(loadStoryFiles(ROOT).files.map((f) => f.story.chapter));
const refs = questRefs(packs, chapters, gameBounds(ROOT));

describe('quest files', () => {
  const { files, parseErrors } = loadQuestFiles(ROOT);
  it('parse and validate with zero errors (content/quests/*.quests.json)', () => {
    expect(parseErrors).toEqual([]);
    const r = validateQuests(files, { ...refs, npcs: storyNpcs(ROOT) });
    expect(r.errors.map((e) => `${e.file} [${e.id}] ${e.message}`)).toEqual([]);
    expect(r.questIds.has('q.test.lohnzettel')).toBe(true);
  });
  it('test files are in play only with ?storytest', () => {
    expect(questsInPlay(files, false).quests.has('q.test.lohnzettel')).toBe(false);
    expect(questsInPlay(files, true).quests.get('q.test.lohnzettel')?.chapter).toBe('test');
    expect(questsInPlay(files, true).items.has('item.test.zettel')).toBe(true);
  });
  it('chapter keys: prolog → p, enden → end', () => {
    expect(chapterKey('prolog')).toBe('p');
    expect(chapterKey('enden')).toBe('end');
    expect(chapterKey('k3')).toBe('k3');
  });

  const good = (): QuestFile => ({
    chapter: 'k1',
    quests: [
      {
        id: 'q.k1.probe',
        kind: 'side',
        title_de: 'Probe',
        summary_de: 'Eine Probe.',
        giver: { npc: 'hanne' },
        offer: [{ speaker: 'hanne', text: 'Hilf mir.' }],
        objectives: [{ id: 'a', type: 'kill', text_de: 'Zwei Nebelinge', enemy: 'nebelling', count: 2, spawn: [{ kind: 'nebelling', x: 1270, z: -1215, era: '1789', count: 2 }] }],
        rewards: { xp: 50, items: [{ item: 'item.balsam' }], codex: ['cx.08'], skills: [{ id: 'spurenleser', tier: 1 }] },
        available: {},
      },
    ],
  });
  const errs = (f: QuestFile) => validateQuests([{ file: 'x.quests.json', data: f }], refs).errors.map((e) => e.message);

  it('a boss spawned inside an NPC talk bubble (+ reach + room) is an error, a pack a warning', () => {
    const npcs = [{ npc: 'hanne', x: 1287, z: -1228, era: '1789', chapter: 'k1' }];
    const f = good();
    f.quests[0]!.objectives[0]!.spawn = [{ kind: 'schuldbuch', x: 1294, z: -1234, era: '1789', count: 1, boss: true }];
    const r = validateQuests([{ file: 'x.quests.json', data: f }], { ...refs, npcs });
    expect(r.errors.map((e) => e.message).join(' | ')).toContain('talk bubble');
    f.quests[0]!.objectives[0]!.spawn = [{ kind: 'nebelling', x: 1294, z: -1234, era: '1789', count: 2 }];
    const r2 = validateQuests([{ file: 'x.quests.json', data: f }], { ...refs, npcs });
    expect(r2.errors).toEqual([]);
    expect(r2.warnings.map((e) => e.message).join(' | ')).toContain('talk bubble');
    f.quests[0]!.objectives[0]!.spawn = [{ kind: 'schuldbuch', x: 1300, z: -1254, era: '1789', count: 1, boss: true }];
    expect(validateQuests([{ file: 'x.quests.json', data: f }], { ...refs, npcs }).warnings.map((e) => e.message).join(' | ')).not.toContain('talk bubble');
  });
  it('accepts a well-formed quest', () => {
    expect(errs(good())).toEqual([]);
  });
  it('rejects broken quests: ids, enemies, items, facts, stances, speakers, historical lines, places', () => {
    const cases: [string, (f: QuestFile) => void][] = [
      ["quest id must be 'q.<chapter>.<name>'", (f) => (f.quests[0]!.id = 'k1.probe')],
      ['does not match the file', (f) => (f.quests[0]!.id = 'q.k2.probe')],
      ["unknown enemy 'drache'", (f) => (f.quests[0]!.objectives[0]!.enemy = 'drache')],
      ["unknown item 'item.gold'", (f) => (f.quests[0]!.rewards!.items = [{ item: 'item.gold' }])],
      ["unknown codex fact 'cx.99'", (f) => (f.quests[0]!.rewards!.codex = ['cx.99'])],
      ['stance cards are gone', (f) => ((f.quests[0] as unknown as Record<string, unknown>).stance = { id: 's', prompt_de: 'Warum?', flag: 'flag.x', options: [] })],
      ["unknown speaker 'niemand'", (f) => (f.quests[0]!.offer = [{ speaker: 'niemand', text: 'x' }])],
      ["historical speaker 'mannlich' needs sources", (f) => (f.quests[0]!.offer = [{ speaker: 'mannlich', text: 'x' }])],
      ['outside the playable area', (f) => (f.quests[0]!.objectives[0]!.where = { x: 99999, z: 0 })],
      ['reach needs where', (f) => (f.quests[0]!.objectives = [{ id: 'r', type: 'reach', text_de: 'Hin' }])],
      ['could never be ready', (f) => (f.quests[0]!.objectives[0]!.optional = true)],
      ["bad skill 'magie:1'", (f) => (f.quests[0]!.rewards!.skills = [{ id: 'magie', tier: 1 }])],
    ];
    for (const [msg, mutate] of cases) {
      const f = good();
      mutate(f);
      expect(errs(f).join(' | '), msg).toContain(msg);
    }
  });
});

describe('story actions and conditions of the RPG layer', () => {
  const file = (beats: StoryFile['beats']): StoryFile => ({ chapter: 'v', order: 0, title_de: 'V', start: beats[0]!.id, beats });
  const errors = (f: StoryFile, rpg = {}) => validateStories([{ file: 'v.json', story: f }], rpg).errors.map((e) => e.message);
  it('validates quest / enemy / loot / xp / item actions and quest / level conditions', () => {
    const ok = file([
      {
        id: 'a',
        enter: [
          { do: 'quest', op: 'offer', id: 'q.k1.lohn' },
          { do: 'enemy', op: 'spawn', group: 'k1.weiher', kind: 'irrlicht', x: 1854, z: 214, era: '1789', count: 5, radius: 18 },
          { do: 'enemy', op: 'despawn', group: '*' },
          { do: 'loot', id: 'k1.zettel', item: 'item.balsam', x: 1262, z: -1224, era: '1789' },
          { do: 'xp', amount: 50 },
          { do: 'item', item: 'item.stab.esche', quiet: true },
        ],
        complete: { all: [{ quest: { id: 'q.k1.lohn' } }, { quest: { id: 'q.k1.lohn', objective: 'zettel', gte: 1 } }, { level: 3 }] },
      },
    ]);
    expect(errors(ok)).toEqual([]);
    expect(errors(ok, { quests: new Set(['q.k1.lohn']) })).toEqual([]);
    expect(errors(ok, { quests: new Set(['q.k1.other']) }).some((m) => m.includes("unknown quest 'q.k1.lohn'"))).toBe(true);
    const bad = file([
      {
        id: 'a',
        enter: [
          { do: 'quest', op: 'explode' as 'offer', id: 'lohn' },
          { do: 'enemy', op: 'spawn', group: 'g', kind: 'drache' },
          { do: 'loot', id: 'l', item: 'item.gold' },
          { do: 'xp', amount: 0 },
          { do: 'item', item: 'item.gold' },
          { do: 'quest', op: 'progress', id: 'q.k1.lohn' },
        ],
        complete: { all: [{ quest: { id: 'q.k1.lohn', state: 'vergessen' as 'done' } }, { level: 99 }] },
      },
    ]);
    const m = errors(bad).join(' | ');
    for (const s of ["unknown op 'explode'", "malformed id 'lohn'", "unknown kind 'drache'", "loot: unknown item 'item.gold'", 'xp needs an amount', "item: unknown item 'item.gold'", 'quest progress needs an objective', "unknown state 'vergessen'", 'level must be 1..12']) expect(m).toContain(s);
  });
  it('quest condition reads the flag mirror: default done, active also while ready, objective counts', () => {
    const f = { 'quest.q.k1.lohn': 'ready', 'quest.q.k1.lohn.zettel': 1 };
    expect(questHolds({ id: 'q.k1.lohn' }, f)).toBe(false);
    expect(questHolds({ id: 'q.k1.lohn', state: 'active' }, f)).toBe(true);
    expect(questHolds({ id: 'q.k1.lohn', state: 'ready' }, f)).toBe(true);
    expect(questHolds({ id: 'q.k1.lohn', objective: 'zettel' }, f)).toBe(true);
    expect(questHolds({ id: 'q.k1.lohn', objective: 'zettel', gte: 2 }, f)).toBe(false);
    expect(questHolds({ id: 'q.k1.lohn' }, { 'quest.q.k1.lohn': 'done' })).toBe(true);
    const env = { era: 'today' as const, x: 0, z: 0, flags: { 'rpg.level': 4 }, inventory: { clues: [], nouns: [], items: [] }, chronik: {}, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null };
    expect(evaluate({ level: 4 }, env, {}, 'k', 0)).toBe(true);
    expect(evaluate({ level: 5 }, env, {}, 'k', 0)).toBe(false);
  });
});

describe('catalogues', () => {
  it('enemies: unique ids, a dissolve style, readable telegraphs, bosses with phases, known loot tables', () => {
    expect(ENEMY_IDS.size).toBe(ENEMIES.length);
    const loot = new Set(LOOT.map((l) => l.id));
    for (const e of ENEMIES) {
      expect(e.id).toMatch(/^[a-z]+$/);
      expect(e.dissolve).toBeTruthy();
      expect(e.note_de).toContain('Fiktion');
      for (const a of e.attacks) expect(a.telegraph, `${e.id}.${a.id}`).toBeGreaterThanOrEqual(0.4);
      if (e.boss) expect(e.phases?.length).toBeGreaterThan(0);
      if (e.loot) expect(loot.has(e.loot)).toBe(true);
    }
    // one boss per chapter 1–4; the finale is no fight
    expect(ENEMIES.filter((e) => e.boss).map((e) => e.id)).toEqual(['schuldbuch', 'pikeur', 'strohmann', 'steinbrecher']);
  });
  it('items: unique ids, loot tables name known items, collections exist, a starting weapon', () => {
    expect(ITEM_IDS.size).toBe(ITEMS.length);
    for (const l of LOOT) for (const e of l.entries) expect(ITEM_IDS.has(e.item), e.item).toBe(true);
    expect(COLLECTIONS.map((c) => c.id)).toContain('hundemarken');
    expect(ITEMS.find((i) => i.id === 'item.stab.esche')?.kind).toBe('weapon');
    for (const i of ITEMS.filter((x) => x.kind === 'consumable')) expect(i.stack).toBeGreaterThan(1);
  });
});

describe('progression rules', () => {
  it('twelve levels on a rising curve', () => {
    expect(LEVEL_XP.length).toBe(MAX_LEVEL);
    for (let i = 1; i < LEVEL_XP.length; i++) expect(LEVEL_XP[i]!).toBeGreaterThan(LEVEL_XP[i - 1]!);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(149)).toBe(1);
    expect(levelForXp(150)).toBe(2);
    expect(levelForXp(1e9)).toBe(12);
    expect(levelProgress(275)).toBeCloseTo(0.5, 2);
    expect(charmSlots(5)).toBe(1);
    expect(charmSlots(6)).toBe(2);
  });
  it('derived stats: level, weapon, talents, charms, gentle mode', () => {
    const base = deriveStats(null);
    expect(base.maxHp).toBe(BASE_STATS.maxHp);
    const p = { level: 5, talents: { 'stab.standfest': 2, 'laterne.kreis': 1 }, equipped: { weapon: 'item.stab.eisen', charms: ['item.charm.tuergriff'] } };
    const s = deriveStats(p);
    expect(s.maxHp).toBe(100 + 4 * 12 + 30);
    expect(s.damage).toBeGreaterThan(base.damage);
    expect(s.bannCharges).toBe(3);
    expect(s.stagger).toBeCloseTo(1.25);
    expect(deriveStats(p, { gentle: true }).damageTaken).toBeCloseTo(0.5);
    expect(new Set(TALENTS.map((t) => t.id)).size).toBe(TALENTS.length);
    expect(TALENTS.reduce((n, t) => n + t.maxRank, 0)).toBeGreaterThanOrEqual(MAX_LEVEL - 1);
  });
});

describe('input contract', () => {
  it('combat keys exist, are rebindable, and share only the documented keys', () => {
    for (const a of ['attack', 'bannlicht', 'dodge', 'quickUse', 'inventory'] as const) {
      expect(DEFAULT_BINDINGS[a].length).toBeGreaterThan(0);
      expect(REBINDABLE).toContain(a);
    }
    expect(SHARED_KEYS).toContainEqual(['interact', 'attack']);
    expect(SHARED_KEYS).toContainEqual(['up', 'dodge']);
    expect(DEFAULT_BINDINGS.journal).toEqual(['KeyJ', 'Tab']);
  });
});

describe('credits data', () => {
  it('one clean label and the licence once per layer, no internal project names', async () => {
    const { creditData } = await import('../src/systems/story/endings/ui');
    const { readFileSync } = await import('node:fs');
    const items = JSON.parse(readFileSync(new URL('../public/data/attribution.json', import.meta.url), 'utf8')).items;
    const rows = creditData(items);
    expect(rows.length).toBe(items.length);
    for (const r of rows) {
      const line = `${r.label}: ${r.text} — ${r.licence}`;
      expect(line).not.toMatch(/Teilprojekt|schloss-karlsberg\b|research\/|source je|Generator-Regeln/);
      expect(line.split(r.licence).length - 1, line).toBe(1);
      expect(r.text.startsWith(r.label.split(' ')[0]!), line).toBe(false);
    }
  });
});

describe('combat curtain', () => {
  it('names every enemy family that can throw you down', async () => {
    await import('../src/systems/story/strings');
    const { hasString } = await import('../src/i18n');
    const { ENEMIES } = await import('../src/rpg/enemies');
    for (const e of ENEMIES) expect(hasString(`story.caught.combat.${e.family}`), e.family).toBe(true);
  });
});
