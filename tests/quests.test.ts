/**
 * The quest state machine (src/systems/quests/logic.ts), headless: lifecycle, flag mirror,
 * objective ordering, bonus objectives, availability, stances, rewards, reset, drops, restore.
 * Uses the worked example content/quests/99-test.quests.json plus small inline quests.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../src/core/events';
import type { EnemyGroupState, FlagValue, QuestDef, QuestFile } from '../src/rpg/types';
import { remaining, upsertGroup } from '../src/systems/combat/rules';
import { questsInPlay } from '../src/systems/quests/data';
import { QuestBook, type QuestDefIn, type QuestEnv, availableHolds, createQuestSlice, normaliseSlice, seededRng, spawnGroup, turninOf } from '../src/systems/quests/logic';

const testFile = JSON.parse(readFileSync(new URL('../content/quests/99-test.quests.json', import.meta.url), 'utf8')) as QuestFile;

type Ev = { n: string; p: Record<string, unknown> };

function env(seed = 7): QuestEnv & { log: Ev[]; flags: Record<string, FlagValue>; codex: string[] } {
  const log: Ev[] = [];
  const rng = seededRng(seed);
  return {
    log,
    flags: {},
    codex: [],
    emit: <K extends keyof GameEvents>(n: K, p: GameEvents[K]) => {
      if (n === 'xp:grant') {
        const grant = p as GameEvents['xp:grant'];
        if (grant.receipt) grant.receipt.amount = grant.amount;
      } else if (n === 'item:grant') {
        const grant = p as GameEvents['item:grant'];
        if (grant.receipt) grant.receipt.amount = grant.count ?? 1;
      }
      log.push({ n, p: p as unknown as Record<string, unknown> });
    },
    now: () => 0,
    rng,
  };
}

function book(extra: QuestDef[] = [], chapter = 'test', seed = 7) {
  const { quests } = questsInPlay([{ data: testFile }], true);
  for (const q of extra) quests.set(q.id, { ...q, chapter });
  const e = env(seed);
  const b = new QuestBook(quests as Map<string, QuestDefIn>, createQuestSlice(), e);
  return { b, e, names: () => e.log.map((x) => x.n), of: (n: string) => e.log.filter((x) => x.n === n).map((x) => x.p) };
}

const kill = (b: QuestBook, p: Record<string, unknown>) => b.handle('enemy:killed', { id: `e${Math.random()}`, group: 'g', kind: 'mahnbrief', x: 1271, z: -1214, era: '1789', boss: false, by: 'light', ...p });

describe('Chapter 2 Pikeur credit', () => {
  const id = 'q.k2.parforce';
  const clue = 'clue.k2.landremont';
  const encounter = { group: 'k2.pikeur', kind: 'pikeur', era: '1793-02', x: 826, z: -868, boss: true } as const;

  function hunt() {
    const file = JSON.parse(readFileSync(new URL('../content/quests/02-kapitel-2.quests.json', import.meta.url), 'utf8')) as QuestFile;
    const { quests } = questsInPlay([{ data: file }], false);
    const e = env();
    const b = new QuestBook(quests, createQuestSlice(), e);
    b.offer(id);
    b.accept(id);
    const groups: Record<string, EnemyGroupState> = {};
    upsertGroup(groups, encounter);
    return { b, e, groups };
  }

  it('credits the fight normally when the echo is heard first', () => {
    const { b } = hunt();
    b.handle('echo:end', { id: clue });
    expect(b.count(id, 'kalk')).toBe(1);
    expect(kill(b, encounter)).toBe(true);
    expect(b.count(id, 'pikeur')).toBe(1);
    expect(b.openObjectives(b.defs.get(id)!).map((o) => o.id)).toEqual(['heim']);
  });

  it('credits an early fight once the echo opens the Pikeur objective', () => {
    const { b, e, groups } = hunt();
    groups[encounter.group]!.killed = 1;
    expect(kill(b, encounter)).toBe(false);
    upsertGroup(groups, encounter); // the story declares the spawned fight again
    const group = groups[encounter.group]!;
    expect(remaining(group)).toBe(0);

    b.settleKnown(() => false, undefined, { group, era: encounter.era });
    expect(b.count(id, 'pikeur')).toBe(0);
    b.handle('echo:end', { id: clue });
    b.settleKnown(() => false, undefined, { group, era: encounter.era });
    b.settleKnown(() => false, undefined, { group, era: encounter.era });
    expect(b.count(id, 'kalk')).toBe(1);
    expect(b.openObjectives(b.defs.get(id)!).map((o) => o.id)).toEqual(['heim']);
    expect(e.flags[`quest.${id}.pikeur`]).toBe(1);
    expect(e.log.filter(({ n }) => ['enemy:killed', 'enemy:spawn', 'xp:grant', 'item:grant', 'loot:place'].includes(n))).toEqual([]);
  });

  it.each(['1793-02', 'today'] as const)('recovers a stalled save in %s', (era) => {
    const { b, groups } = hunt();
    b.handle('echo:end', { id: clue });
    groups[encounter.group]!.killed = 1;
    const saved = JSON.parse(JSON.stringify({ quest: b.slice, combat: groups }));
    const e = env();
    const resumed = new QuestBook(b.defs, normaliseSlice(saved.quest), e);
    resumed.mirror();
    resumed.reassert();
    resumed.settleKnown(() => false, undefined, { group: saved.combat[encounter.group], era });

    expect(e.flags[`quest.${id}.pikeur`]).toBe(1);
    if (era === '1793-02') {
      expect(resumed.count(id, 'heim')).toBe(0);
      resumed.handle('era:change', { from: era, to: 'today' });
    }
    expect(resumed.state(id)).toBe('done');
    expect(e.log.filter(({ n }) => n === 'enemy:killed' || n === 'enemy:spawn')).toEqual([]);
    expect(e.log.filter(({ n, p }) => n === 'xp:grant' && p.reason === `quest:${id}`)).toHaveLength(1);
  });

  it('ignores a living Pikeur and clears of other groups or enemy kinds', () => {
    const { b, groups } = hunt();
    b.handle('echo:end', { id: clue });
    const group = groups[encounter.group]!;
    expect(kill(b, { ...encounter, group: 'other.pikeur' })).toBe(false);
    for (const candidate of [group, { ...group, group: 'other.pikeur', killed: 1 }, { ...group, kind: 'streuner', killed: 1 }]) {
      b.settleKnown(() => false, undefined, { group: candidate, era: encounter.era });
      expect(b.count(id, 'pikeur')).toBe(0);
    }
  });
});

describe('quest lifecycle (q.test.lohnzettel)', () => {
  it('offer → accept → kill 3 → collect → ready → turn-in', () => {
    const { b, e, of } = book();
    expect(b.state('q.test.lohnzettel')).toBe('hidden');
    expect(b.offer('q.test.lohnzettel')).toBe(true);
    expect(b.state('q.test.lohnzettel')).toBe('offered');
    expect(of('quest:offered')).toEqual([{ id: 'q.test.lohnzettel', giver: 'hanne', main: true }]);
    expect(b.markFor('hanne')).toBe('offer-main');
    const offer = b.topicsFor('hanne');
    expect(offer).toHaveLength(1);
    expect(offer[0]).toMatchObject({ kind: 'offer', main: true, accept: 'Ich hole ihn dir.', declinable: false, label: 'Der Lohnzettel' });

    expect(b.accept('q.test.lohnzettel')).toBe(true);
    expect(b.state('q.test.lohnzettel')).toBe('active');
    expect(b.tracked()).toEqual(['q.test.lohnzettel']);
    // the kill objective spawns its group; the bonus pickup is placed; the Zettel waits for `after`
    expect(of('enemy:spawn')).toEqual([expect.objectContaining({ group: 'q.test.lohnzettel.briefe', kind: 'mahnbrief', count: 3, quest: 'q.test.lohnzettel', objective: 'briefe' })]);
    expect(of('loot:place').map((p) => p.id)).toEqual(['q.test.lohnzettel.marke.0']);
    expect(b.markFor('hanne')).toBe('active');

    // a pickup of the Zettel before its turn does not count
    b.handle('item:pickup', { item: 'item.test.zettel', count: 1, total: 1 });
    expect(b.count('q.test.lohnzettel', 'zettel')).toBe(0);

    kill(b, { quest: 'q.test.lohnzettel', objective: 'briefe' });
    kill(b, { kind: 'mahnbrief' });
    expect(b.count('q.test.lohnzettel', 'briefe')).toBe(2);
    kill(b, { kind: 'mahnbrief' });
    expect(of('quest:progress').map((p) => p.count)).toEqual([1, 2, 3]);
    expect(of('quest:objective')).toEqual([{ id: 'q.test.lohnzettel', objective: 'briefe', optional: false }]);
    // now the Zettel is placed
    expect(of('loot:place').map((p) => p.id)).toContain('q.test.lohnzettel.zettel.0');
    expect(b.state('q.test.lohnzettel')).toBe('active');

    b.handle('item:pickup', { item: 'item.test.zettel', count: 1, total: 1 });
    expect(b.state('q.test.lohnzettel')).toBe('ready');
    expect(of('quest:ready')).toEqual([{ id: 'q.test.lohnzettel' }]);
    expect(b.markFor('hanne')).toBe('ready');
    const t = b.topicsFor('hanne')[0]!;
    expect(t.kind).toBe('turnin');
    expect(t.history?.[0]?.fact).toBe('cx.08');
    expect((t as { stance?: unknown }).stance).toBeUndefined();

    const pay = b.complete('q.test.lohnzettel')!;
    expect(pay).toMatchObject({ xp: 120, items: [{ item: 'item.balsam', count: 2 }], codex: ['cx.08', 'cx.10'], main: true });
    expect(b.state('q.test.lohnzettel')).toBe('done');
    expect(e.flags['quest.q.test.lohnzettel']).toBe('done');
    expect(b.tracked()).not.toContain('q.test.lohnzettel');
    // next: the voice quest is offered and accepted at once
    expect(b.state('q.test.irrlichter')).toBe('active');
    expect(of('quest:accepted').map((p) => p.id)).toEqual(['q.test.lohnzettel', 'q.test.irrlichter']);
    // a second turn-in does nothing
    expect(b.complete('q.test.lohnzettel')).toBeNull();
  });

  it('mirrors state and counts into the story flags (questHolds reads them)', () => {
    const { b, e } = book();
    b.offer('q.test.lohnzettel');
    expect(e.flags['quest.q.test.lohnzettel']).toBe('offered');
    b.accept('q.test.lohnzettel');
    expect(e.flags['quest.q.test.lohnzettel']).toBe('active');
    expect(e.flags['quest.q.test.lohnzettel.briefe']).toBe(0);
    kill(b, { kind: 'mahnbrief' });
    expect(e.flags['quest.q.test.lohnzettel.briefe']).toBe(1);
    b.progress('q.test.lohnzettel', 'briefe', 5);
    expect(e.flags['quest.q.test.lohnzettel.briefe']).toBe(3);
    // a fresh book over the same flags re-mirrors from a slice
    const slice = structuredClone(b.slice);
    const e2 = env();
    const b2 = new QuestBook(b.defs, slice, e2);
    b2.mirror();
    expect(e2.flags['quest.q.test.lohnzettel']).toBe('active');
    expect(e2.flags['quest.q.test.lohnzettel.briefe']).toBe(3);
  });
});

const chain = (over: Partial<QuestDef> = {}): QuestDef => ({
  id: 'q.test.kette',
  kind: 'side',
  title_de: 'Kette',
  summary_de: 'x',
  giver: { npc: 'soll' },
  offer: [{ speaker: 'soll', text: 'x' }],
  objectives: [
    { id: 'a', type: 'manual', text_de: 'A' },
    { id: 'b', type: 'reach', text_de: 'B', after: ['a'], where: { x: 10, z: 10, r: 5, era: '1789' } },
    { id: 'c', type: 'kill', text_de: 'C', after: ['b'], enemy: 'nebelling', count: 2, spawn: [{ kind: 'nebelling', x: 0, z: 0, era: '1789', count: 2 }] },
    { id: 'bonus', type: 'talk', text_de: 'Bonus', npc: 'jost', topic: 'hunde', optional: true, bonus_xp: 30 },
  ],
  rewards: { xp: 100, skills: [{ id: 'kartograf', tier: 2 }], flags: { 'flag.kette': true } },
  ...over,
});

describe('objectives', () => {
  it('honour `after`: later objectives neither count nor spawn early', () => {
    const { b, of } = book([chain()]);
    b.accept('q.test.kette');
    expect(of('enemy:spawn')).toEqual([]);
    b.tick(0.1, { x: 10, z: 10, era: '1789' });
    expect(b.count('q.test.kette', 'b')).toBe(0);
    b.handle('enemy:killed', { kind: 'nebelling' });
    expect(b.count('q.test.kette', 'c')).toBe(0);
    b.progress('q.test.kette', 'a');
    // reach: wrong era does not count, the right one does
    b.tick(0.1, { x: 10, z: 10, era: 'today' });
    expect(b.count('q.test.kette', 'b')).toBe(0);
    b.tick(0.1, { x: 12, z: 9, era: '1789' });
    expect(b.count('q.test.kette', 'b')).toBe(1);
    expect(of('enemy:spawn')).toEqual([expect.objectContaining({ group: 'q.test.kette.c', quest: 'q.test.kette', objective: 'c' })]);
    b.handle('enemy:killed', { kind: 'nebelling' });
    b.handle('enemy:killed', { kind: 'nebelling' });
    expect(b.state('q.test.kette')).toBe('ready');
  });

  it('kill objectives bound to a place ignore kills of the same kind elsewhere or in another era', () => {
    const lichter: QuestDef = {
      id: 'q.test.lichter', kind: 'side', title_de: 'Lichter', summary_de: 'x', giver: { npc: 'soll' }, offer: [{ speaker: 'soll', text: 'x' }],
      objectives: [{ id: 'l', type: 'kill', text_de: 'L', enemy: 'irrlicht', count: 3, where: { x: 820, z: -869, r: 24, era: 'today' }, spawn: [{ kind: 'irrlicht', x: 820, z: -869, era: 'today', count: 3, radius: 5 }] }],
      rewards: { xp: 10 },
    };
    const { b } = book([lichter]);
    b.accept('q.test.lichter');
    // Karlslust Irrlichter, 1789, 1.1 km away: no credit
    b.handle('enemy:killed', { id: 'k1', group: 'q.k1.karlslust.lichter', kind: 'irrlicht', x: 1846, z: 236, era: '1789', quest: 'q.k1.karlslust', objective: 'lichter' });
    // the right place but the wrong era: no credit
    b.handle('enemy:killed', { id: 'k2', group: 'other', kind: 'irrlicht', x: 821, z: -868, era: '1789' });
    // another group at the dam today, and the quest's own spawn: credit
    b.handle('enemy:killed', { id: 'k3', group: 'other', kind: 'irrlicht', x: 821, z: -868, era: 'today' });
    b.handle('enemy:killed', { id: 'k4', group: 'q.test.lichter.l', kind: 'irrlicht', x: 900, z: 0, era: 'today', quest: 'q.test.lichter', objective: 'l' });
    // a pack's escort of the same kind at the same place: XP only, never a quest kill
    b.handle('enemy:killed', { id: 'k5', group: 'poi.x+escort', kind: 'irrlicht', x: 821, z: -868, era: 'today', escort: true });
    expect(b.count('q.test.lichter', 'l')).toBe(2);
  });

  it('optional objectives pay bonus_xp and are not needed for ready', () => {
    const { b, of } = book([chain()]);
    b.accept('q.test.kette');
    b.handle('npc:talk', { npc: 'jost', chapter: 'test', topic: 'greet' });
    expect(b.count('q.test.kette', 'bonus')).toBe(0);
    b.handle('npc:talk', { npc: 'jost', chapter: 'test', topic: 'hunde' });
    expect(of('quest:objective')).toEqual([{ id: 'q.test.kette', objective: 'bonus', optional: true }]);
    expect(of('xp:grant')).toEqual([{ amount: 30, reason: 'quest:q.test.kette:bonus' }]);
    expect(b.state('q.test.kette')).toBe('active');
    b.progress('q.test.kette', 'a');
    b.tick(0.1, { x: 10, z: 10, era: '1789' });
    b.progress('q.test.kette', 'c', 2);
    expect(b.state('q.test.kette')).toBe('ready');
  });

  it('counts the other objective types: room, examine, echo, calm, use, event, survive, escort', () => {
    const q: QuestDef = {
      id: 'q.test.alles',
      kind: 'side',
      title_de: 'Alles',
      summary_de: 'x',
      giver: { voice: 'laub' },
      turnin: 'auto',
      offer: [{ speaker: 'laub', text: 'x' }],
      objectives: [
        { id: 'raum', type: 'room', text_de: 'r', room: 'B06.1.bildergalerie' },
        { id: 'blick', type: 'examine', text_de: 'e', clue: 'clue.x' },
        { id: 'echo', type: 'echo', text_de: 'h', clue: 'clue.y' },
        { id: 'kasuar', type: 'calm', text_de: 'c', animal: 'cassowary' },
        { id: 'balsam', type: 'use', text_de: 'u', item: 'item.balsam' },
        { id: 'jagd', type: 'event', text_de: 'v', event: 'hunt:goal', match: { mode: 'parforce' } },
        { id: 'halten', type: 'survive', text_de: 's', seconds: 3 },
        { id: 'peter', type: 'escort', text_de: 'g', npc: 'peter', to: { x: 0, z: 0, r: 4 } },
      ],
      rewards: { xp: 10 },
    };
    const { b } = book([q]);
    b.offer('q.test.alles');
    expect(b.state('q.test.alles')).toBe('active');
    b.handle('room:enter', { roomId: 'B06.1.bildergalerie', building: 'KB-B06', id: 'KB-B06/B06.1.bildergalerie', name: 'x' });
    b.handle('clue:found', { id: 'clue.x', kind: 'object' });
    b.handle('echo:end', { id: 'clue.y' });
    b.handle('menagerie:calmed', { id: 'kasuar', animal: 'cassowary' });
    b.handle('item:use', { item: 'item.balsam' });
    b.handle('hunt:goal', { mode: 'patrol' });
    expect(b.count('q.test.alles', 'jagd')).toBe(0);
    b.handle('hunt:goal', { mode: 'parforce' });
    for (const id of ['raum', 'blick', 'echo', 'kasuar', 'balsam', 'jagd']) expect(b.count('q.test.alles', id), id).toBe(1);
    b.tick(1.5, { x: 50, z: 50, era: 'today' }, () => 30);
    b.tick(1.6, { x: 50, z: 50, era: 'today' }, () => 30);
    expect(b.count('q.test.alles', 'halten')).toBe(3);
    // escort: at the destination, but the follower is lost → not yet
    b.tick(0.1, { x: 1, z: 1, era: 'today' }, () => 30);
    expect(b.count('q.test.alles', 'peter')).toBe(0);
    b.tick(0.1, { x: 1, z: 1, era: 'today' }, () => 2);
    expect(b.state('q.test.alles')).toBe('done');
  });

  it('rolls drops deterministically with a seeded rng and places them at the kill', () => {
    const q: QuestDef = {
      id: 'q.test.drop',
      kind: 'side',
      title_de: 'Drop',
      summary_de: 'x',
      giver: { voice: 'laub' },
      turnin: 'auto',
      offer: [{ speaker: 'laub', text: 'x' }],
      objectives: [{ id: 'seite', type: 'collect', text_de: 's', item: 'item.test.zettel', drop: { enemy: 'nebelling', chance: 0.5 } }],
    };
    const run = (seed: number) => {
      const { b, of } = book([q], 'test', seed);
      b.offer('q.test.drop');
      for (let i = 0; i < 12; i++) b.handle('enemy:killed', { id: `n${i}`, group: 'g', kind: 'nebelling', x: i, z: -i, era: '1789' });
      b.handle('enemy:killed', { id: 'other', kind: 'streuner', x: 0, z: 0, era: '1789' });
      return of('loot:place');
    };
    const a = run(42);
    expect(a).toEqual(run(42));
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan(12);
    expect(a[0]).toMatchObject({ item: 'item.test.zettel', era: '1789', quest: 'q.test.drop' });
    const first = a[0]!;
    expect(first.x).toBe(-Number(first.z));
    expect(run(43)).not.toEqual(a);
  });
});

describe('availability, stance, rewards, reset, restore', () => {
  it('side quests offer themselves by chapter, after, flag, era and level', () => {
    const side = chain({ id: 'q.test.seite', available: { after: ['q.test.lohnzettel'], flag: 'flag.x', era: '1789', level: 3 } });
    const { b, e } = book([side]);
    const st = (id: string) => b.state(id);
    expect(availableHolds(side, st, e.flags, '1789')).toBe(false);
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    b.complete('q.test.lohnzettel', true);
    expect(b.offerAvailable('test', '1789')).not.toContain('q.test.seite');
    e.flags['flag.x'] = true;
    expect(b.offerAvailable('test', '1789')).not.toContain('q.test.seite');
    e.flags['rpg.level'] = 3;
    expect(b.offerAvailable('test', 'today')).not.toContain('q.test.seite');
    expect(b.offerAvailable('k1', '1789')).not.toContain('q.test.seite');
    expect(b.offerAvailable('test', '1789')).toEqual(['q.test.seite']);
    expect(b.state('q.test.seite')).toBe('offered');
    expect(b.markFor('soll')).toBe('offer');
    expect(b.topicsFor('soll')[0]).toMatchObject({ kind: 'offer', declinable: true, main: false });
  });

  it('after the turn-in the giver offers "Erzähl mehr" (the rest of the history) until it is told', () => {
    const { b, e } = book();
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    for (const o of b.def('q.test.lohnzettel')!.objectives) b.progress('q.test.lohnzettel', o.id, 99, true);
    expect(b.told('q.test.lohnzettel')).toBe(false); // not done yet
    b.complete('q.test.lohnzettel');
    // the deed is in the flags (the epilogue reads quest.<id> = done), no stance flag
    expect(e.flags['quest.q.test.lohnzettel']).toBe('done');
    expect(e.flags['flag.test_lohn']).toBeUndefined();
    const more = b.topicsFor('hanne').find((x) => x.kind === 'more')!;
    expect(more.lines.length).toBe(1);
    expect(more.label).toMatch(/^Erzähl mehr/);
    // another chapter: the topic stays in its own
    b.chapter = 'k1';
    expect(b.topicsFor('hanne').some((x) => x.kind === 'more')).toBe(false);
    b.chapter = 'test';
    expect(b.told('q.test.lohnzettel')).toBe(true);
    expect(b.topicsFor('hanne').some((x) => x.kind === 'more')).toBe(false);
    expect(b.told('q.test.lohnzettel')).toBe(false);
  });

  it('turn-in emits xp:grant, item:grant, skill:grant, codex:unlocked and sets flags', () => {
    const { b, e, of } = book([chain()]);
    e.codex.push('cx.10');
    b.accept('q.test.kette');
    b.progress('q.test.kette', 'a');
    b.tick(0.1, { x: 10, z: 10, era: '1789' });
    b.progress('q.test.kette', 'c', 2);
    const pay = b.complete('q.test.kette')!;
    expect(of('xp:grant')).toContainEqual({ amount: 100, reason: 'quest:q.test.kette', receipt: { amount: 100 } });
    expect(of('skill:grant')).toEqual([{ skill: 'kartograf', level: 2 }]);
    expect(e.flags['flag.kette']).toBe(true);
    expect(of('quest:completed')).toEqual([{ id: 'q.test.kette', xp: 100, main: false }]);
    expect(pay.skills).toEqual([{ id: 'kartograf', tier: 2 }]);
    // the main test quest: items and codex (cx.10 known already → only cx.08 is new)
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    const p2 = b.complete('q.test.lohnzettel', true)!;
    expect(of('item:grant')).toEqual([{ item: 'item.balsam', count: 2, reason: 'quest:q.test.lohnzettel', receipt: { amount: 2 } }]);
    expect(of('codex:unlocked')).toEqual([{ factId: 'cx.08' }]);
    expect(p2.codex).toEqual(['cx.08']);
    expect(e.codex).toEqual(['cx.10', 'cx.08']);
    expect(b.slice.unseen).toContain('cx.08');
  });

  it('summarizes the XP and items accepted by progression', () => {
    const { b, e } = book([chain({ rewards: {
      xp: 100,
      items: [{ item: 'item.balsam', count: 2 }, { item: 'item.test.zettel' }],
    } })]);
    const emit = e.emit;
    e.emit = (name, payload) => {
      emit(name, payload);
      if (name === 'xp:grant') (payload as GameEvents['xp:grant']).receipt!.amount = 120;
      if (name === 'item:grant') {
        const grant = payload as GameEvents['item:grant'];
        grant.receipt!.amount = grant.item === 'item.balsam' ? 1 : 0;
      }
    };
    expect(b.complete('q.test.kette', true)).toMatchObject({
      xp: 120,
      items: [{ item: 'item.balsam', count: 1 }],
    });
  });

  it('reset clears counts and flags and asks for despawn and loot clear', () => {
    const { b, e, of } = book();
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    kill(b, { kind: 'mahnbrief' });
    expect(b.reset('q.test.lohnzettel')).toBe(true);
    expect(b.state('q.test.lohnzettel')).toBe('hidden');
    expect(b.count('q.test.lohnzettel', 'briefe')).toBe(0);
    expect(e.flags['quest.q.test.lohnzettel']).toBeUndefined();
    expect(e.flags['quest.q.test.lohnzettel.briefe']).toBeUndefined();
    expect(of('enemy:despawn')).toEqual([{ group: 'q.test.lohnzettel.briefe' }]);
    expect(of('loot:clear')).toEqual([{ quest: 'q.test.lohnzettel' }]);
    expect(b.tracked()).toEqual([]);
    // and it can be offered again
    expect(b.offer('q.test.lohnzettel')).toBe(true);
  });

  it('fail withdraws the world and frees the tracker', () => {
    const { b, of } = book();
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    expect(b.fail('q.test.lohnzettel', 'test')).toBe(true);
    expect(b.state('q.test.lohnzettel')).toBe('failed');
    expect(of('quest:failed')).toEqual([{ id: 'q.test.lohnzettel', reason: 'test' }]);
    expect(of('enemy:despawn').length).toBe(1);
  });

  it('restores from a saved slice: state, counts, tracker; re-asserts spawns and pickups', () => {
    const { b } = book();
    b.offer('q.test.lohnzettel');
    b.accept('q.test.lohnzettel');
    b.progress('q.test.lohnzettel', 'briefe', 3);
    const saved = JSON.parse(JSON.stringify(b.slice));
    const e2 = env();
    const b2 = new QuestBook(b.defs, normaliseSlice(saved), e2);
    b2.mirror();
    b2.reassert();
    expect(b2.state('q.test.lohnzettel')).toBe('active');
    expect(b2.count('q.test.lohnzettel', 'briefe')).toBe(3);
    expect(b2.tracked()).toEqual(['q.test.lohnzettel']);
    // briefe is complete: no respawn; the Zettel and the bonus marke are placed again
    expect(e2.log.filter((x) => x.n === 'enemy:spawn')).toEqual([]);
    expect(e2.log.filter((x) => x.n === 'loot:place').map((x) => x.p.id).sort()).toEqual(['q.test.lohnzettel.marke.0', 'q.test.lohnzettel.zettel.0']);
    b2.handle('item:pickup', { item: 'item.test.zettel', count: 1 });
    expect(b2.state('q.test.lohnzettel')).toBe('ready');
    // old saves: a missing / partial slice is filled in
    expect(normaliseSlice(undefined)).toEqual(createQuestSlice());
    expect(normaliseSlice({ quests: { x: { state: 'active' } } } as never).quests.x).toMatchObject({ counts: {}, t: 0 });
  });

  it('tracks at most three quests, main first', () => {
    const mk = (id: string, kind: 'main' | 'side'): QuestDef => ({ ...chain(), id, kind });
    const { b } = book([mk('q.test.s1', 'side'), mk('q.test.s2', 'side'), mk('q.test.s3', 'side'), mk('q.test.m1', 'main')]);
    for (const id of ['q.test.s1', 'q.test.s2', 'q.test.s3']) b.accept(id);
    expect(b.tracked()).toEqual(['q.test.s1', 'q.test.s2', 'q.test.s3']);
    b.accept('q.test.m1');
    expect(b.tracked()).toEqual(['q.test.m1', 'q.test.s2', 'q.test.s3']);
  });

  it('helpers: turn-in target, spawn group names', () => {
    const q = chain();
    expect(turninOf(q)).toEqual({ npc: 'soll' });
    expect(turninOf({ ...q, turnin: { npc: 'hanne' } })).toEqual({ npc: 'hanne' });
    expect(turninOf({ ...q, giver: { voice: 'laub' } })).toEqual({ voice: 'laub' });
    expect(turninOf({ ...q, turnin: 'auto' })).toBe('auto');
    const o = q.objectives[2]!;
    expect(spawnGroup(q, o, o.spawn![0]!, 0)).toBe('q.test.kette.c');
    expect(spawnGroup(q, o, { ...o.spawn![0]!, group: 'k1.weiher' }, 1)).toBe('k1.weiher');
  });

  it('no quest in the bundled files asks a quiz: no stance cards at all', () => {
    for (const q of testFile.quests) expect((q as { stance?: unknown }).stance).toBeUndefined();
  });
});
