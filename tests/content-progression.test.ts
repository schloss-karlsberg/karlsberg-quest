import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runtimeEvents, type StoryInput } from '../scripts/content-validation/catalog';
import { validateProgression } from '../scripts/content-validation/progression';
import { loadPacks } from '../scripts/validate-content';
import type { LoadedPack } from '../src/content/validate';
import type { QuestDef, QuestObjective } from '../src/rpg/types';
import { loadQuestFiles } from '../src/systems/quests/validate-cli';
import type { Action, Beat, Condition } from '../src/systems/story/types';
import { loadStoryFiles } from '../src/systems/story/validate-cli';

const root = fileURLToPath(new URL('..', import.meta.url));
const events = runtimeEvents(root);
const id = 'q.k1.paper';
const item = 'item.k1.paper';
const done = { quest: { id } };
const start: Action = { do: 'quest', op: 'start', id };
const collect: QuestObjective = { id: 'get', type: 'collect', item, text_de: 'Papier holen' };
const cue: Action = { do: 'cue', id: 'bell' };
const bell: QuestObjective = { id: 'listen', type: 'event', event: 'story:cue', match: { id: 'bell' }, text_de: 'Zuhören' };
const flag: Action = { do: 'flag', set: { ready: true } };
const beat = (id: string, complete: Condition = { timer: 1 }, enter?: Action[]): Beat => ({ id, complete, enter });
function chapter(beats: Beat[], name = 'k1'): StoryInput {
  return { file: name + '.story.json', story: { chapter: name, order: 1, start: beats[0].id, title_de: 'Kapitel', beats } };
}
const quest = (objectives: QuestObjective[], extra: Partial<QuestDef> = {}): QuestDef => ({
  id, kind: 'main', title_de: 'Papier', summary_de: 'Papier finden', giver: { voice: 'laub' }, offer: [], objectives, turnin: 'auto', ...extra,
});
function check(stories: StoryInput[], quests: QuestDef[] = [], packs: LoadedPack[] = []) {
  return validateProgression(stories, [{ file: 'k1.quests.json', data: {
    chapter: 'k1', quests, items: [{ id: item, kind: 'consumable', name_de: 'Papier', text_de: 'Ein Blatt' }],
  } }], packs, events);
}
const errors = (issues: ReturnType<typeof check>) => issues.filter(i => i.level === 'error');
const at = (id: string, message: string) => expect.objectContaining({ id, message: expect.stringContaining(message) });

describe('static story and quest progression', () => {
  it('runs on the same files and runtime emitters as the CLI', () => {
    const issues = validateProgression(loadStoryFiles(root).files, loadQuestFiles(root).files, loadPacks(root).packs, events);
    expect(errors(issues)).toEqual([]);
  });

  it('follows next and fallthrough from start, independent of declaration order', () => {
    const s = chapter([beat('unused', { timer: 1 }, [flag]), beat('gate', { flag: 'ready' }), { ...beat('first'), next: 'gate' }]);
    s.story.start = 'first';
    const issues = check([s]);
    expect(issues).toContainEqual(at('k1/unused', 'unreachable'));
    expect(errors(issues)).toContainEqual(at('k1/gate', 'ready'));
    s.story.beats[2].exit = [flag];
    expect(errors(check([s])).map(i => i.id)).toEqual(['k1/unused']);
  });

  it('rejects a setter behind its own gate, wrong values and cleared flags', () => {
    for (const enter of [[], [flag, { do: 'flag', set: { ready: null } }], [{ do: 'flag', set: { ready: false } }]] as Action[][]) {
      const b = { ...beat('gate', { flag: 'ready' }, enter), exit: [flag], on: [{ id: 'loop', when: { flag: 'ready' }, do: [flag] }] };
      expect(errors(check([chapter([b])]))).toContainEqual(at('k1/gate', 'ready'));
    }
  });

  it('reports the choice branch that lacks a prerequisite', () => {
    const choice: Action = { do: 'choice', id: 'door', prompt: 'Wohin?', options: [
      { key: 'yes', label: 'Links', set: {}, then: [flag] }, { key: 'no', label: 'Rechts', set: {} },
    ] };
    const issues = check([chapter([beat('pick', { chosen: 'door' }, [choice]), beat('gate', { flag: 'ready' })])]);
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', id: 'k1/gate', message: expect.stringContaining('path') }));
  });

  it('reads pack clue prerequisites and rewards, linked chapter exits, and runtime flags', () => {
    const pack: LoadedPack = { file: 'paper.pack.json', pack: { pack: 'paper', clues: [{
      id: 'clue.paper', kind: 'object', title_de: 'Papier', where: { x: 1, z: 2, radius: 3, era: 'today' },
      requires: { flags: ['ready'] }, reveals: { flags: ['found'] },
    }] } };
    const first = chapter([beat('first')], 'prior');
    first.story.next = 'k1';
    const gate = chapter([beat('gate', { all: [{ flag: 'found' }, { flag: 'court.admitted' }] })]);
    expect(errors(check([gate, first], [], [pack]))).toContainEqual(at('k1/gate', 'found'));
    first.story.leave = [flag];
    expect(check([gate, first], [], [pack])).toEqual([]);
  });

  it('requires a reachable offer, available giver and turn-in for a gated quest', () => {
    const talker = quest([], { giver: { npc: 'hanne' }, turnin: { npc: 'soll' } });
    const b = beat('gate', done);
    const s = chapter([b]);
    expect(check([s], [talker])).toContainEqual(at(id, 'no reachable offer'));
    b.enter = [{ do: 'quest', op: 'offer', id }];
    expect(check([s], [talker])).toContainEqual(at(id, 'giver unavailable'));
    b.enter.push({ do: 'npc', op: 'spawn', npc: 'hanne' });
    expect(check([s], [talker])).toContainEqual(at(id, 'turn-in unavailable'));
    b.enter.push({ do: 'npc', op: 'spawn', npc: 'soll' });
    expect(check([s], [talker])).toEqual([]);
  });

  it('resolves side availability, chained offers and reward flags only after completion', () => {
    const pre = quest([], { id: 'q.k1.before', kind: 'side', available: { flag: 'ready' }, next: id });
    const q = quest([], { rewards: { flags: { paid: true } } });
    const b = beat('gate', { flag: 'paid' });
    expect(check([chapter([b])], [pre, q])).toContainEqual(at(pre.id, 'available.flag'));
    expect(check([chapter([{ ...b, enter: [flag] }])], [pre, q])).toEqual([]);
  });

  it('checks item existence and distinguishes ownership from a pickup while collecting', () => {
    const b = beat('gate', done, [start]);
    const grant: Action = { do: 'item', item };
    expect(check([chapter([b])], [quest([{ ...collect, item: 'item.no' }])])).toContainEqual(at(id + '/get', 'unknown item'));
    expect(check([chapter([b])], [quest([collect])])).toContainEqual(at(id + '/get', item));
    expect(errors(check([chapter([{ ...b, enter: [grant, start] }])], [quest([collect])]))).toContainEqual(at('k1/gate', id));
    expect(check([chapter([{ ...b, enter: [start, grant] }])], [quest([collect])])).toEqual([]);
    expect(check([chapter([{ ...b, enter: [grant, start] }])], [quest([{ ...collect, type: 'use' }])])).toEqual([]);
  });

  it('keeps untaken loot available, respects clear, and accepts objective placements and drops', () => {
    const loot: Action = { do: 'loot', id: 'pile', item };
    for (const enter of [[loot, start], [start, loot]]) {
      expect(check([chapter([beat('gate', done, enter)])], [quest([collect])])).toEqual([]);
    }
    expect(errors(check([chapter([beat('gate', done, [loot, { do: 'loot', id: 'pile', clear: true }, start])])], [quest([collect])]))).toHaveLength(1);
    for (const o of [{ ...collect, place: [{ x: 1, z: 2 }] }, { ...collect, drop: { enemy: 'streuner', chance: 0.5 } }]) {
      expect(check([chapter([beat('gate', done, [start])])], [quest([o])])).toEqual([]);
    }
  });

  it('requires an emitter even for an optional objective and checks one-shot event order and match', () => {
    expect(check([chapter([beat('a')])], [quest([{ ...bell, optional: true, event: 'none:here' }])]))
      .toContainEqual(at(id + '/listen', 'no runtime emitter'));
    for (const enter of [[cue, start], [start, { ...cue, id: 'other' }]]) {
      expect(check([chapter([beat('gate', done, enter)])], [quest([bell])])).toContainEqual(at(id + '/listen', 'story:cue'));
    }
    expect(check([chapter([beat('gate', done, [start, cue])])], [quest([bell])])).toEqual([]);
  });

  it('requires the objective to be open at the event and catches dependency cycles', () => {
    const manual: QuestObjective = { id: 'first', type: 'manual', text_de: 'Warten' };
    const advance: Action = { do: 'quest', op: 'progress', id, objective: 'first' };
    const q = quest([manual, { ...bell, after: ['first'] }]);
    expect(errors(check([chapter([beat('gate', done, [start, cue, advance])])], [q]))).toContainEqual(at('k1/gate', id));
    expect(check([chapter([beat('gate', done, [start, advance, cue])])], [q])).toEqual([]);
    expect(check([chapter([beat('gate', done, [start])])], [quest([{ ...manual, after: ['listen'] }, { ...bell, after: ['first'] }])]))
      .toContainEqual(at(id, 'first (manual)'));
  });

  it('does not pay a quest reward retroactively to a later collect objective', () => {
    const pre = quest([], { id: 'q.k1.before', rewards: { items: [{ item }] } });
    const pay: Action = { do: 'quest', op: 'complete', id: pre.id };
    expect(errors(check([chapter([beat('gate', done, [pay, start])])], [pre, quest([collect])]))).toHaveLength(1);
    expect(check([chapter([beat('gate', done, [start, pay])])], [pre, quest([collect])])).toEqual([]);
  });

  it('warns when a gate relies on a reaction that could be skipped in an earlier beat', () => {
    const first = { ...beat('first'), on: [{ id: 'detour', when: { enter: { x: 0, z: 0, r: 2 } }, do: [flag] }] };
    const s = chapter([first, beat('gate', { flag: 'ready' })]);
    expect(check([s])).toContainEqual(at('k1/gate', 'optional reaction k1/first/detour'));
    first.complete = { flag: 'ready' };
    expect(check([s])).toEqual([]);
  });

  it('warns about a one-shot cue if players can walk past a giver without accepting', () => {
    const q = quest([bell], { giver: { npc: 'hanne' } });
    const first = beat('offer', { timer: 1 }, [{ do: 'npc', op: 'spawn', npc: 'hanne' }, { do: 'quest', op: 'offer', id }]);
    const s = chapter([first, beat('bell', done, [cue])]);
    expect(check([s], [q])).toContainEqual(at(id + '/listen', 'before the player accepts'));
    first.complete = { quest: { id, state: 'active' } };
    expect(check([s], [q])).toEqual([]);
  });

  it('distinguishes a raw clue event from a backfilled examine objective', () => {
    const pack: LoadedPack = { file: 'paper.pack.json', pack: { pack: 'paper', clues: [{
      id: 'clue.paper', kind: 'object', title_de: 'Papier', where: { x: 0, z: 0, radius: 3, era: 'today' }, reveals: {},
    }] } };
    const raw = { ...bell, event: 'clue:found', match: { id: 'clue.paper' } };
    const first = beat('walk');
    const s = chapter([first, beat('quest', done, [start])]);
    expect(errors(check([s], [quest([raw])], [pack]))).toEqual([]);
    expect(check([s], [quest([raw])], [pack])).toContainEqual(at(id + '/listen', 'before this event objective opens'));
    first.complete = { have: { clue: 'clue.paper' } };
    expect(errors(check([s], [quest([raw])], [pack]))).toContainEqual(at('k1/quest', id));
    expect(check([s], [quest([{ id: 'see', text_de: 'Ansehen', type: 'examine', clue: 'clue.paper' }])], [pack])).toEqual([]);
  });

  it('reports missing item sources even for a quest that the story never starts', () => {
    expect(check([chapter([beat('a')])], [quest([collect])])).toContainEqual(at(id + '/get', 'no reachable source'));
  });

  it('respects pickup quantities and distinguishes a future grant from a cleared placement', () => {
    const twice = { ...collect, count: 2 };
    const b = beat('gate', done, [start, { do: 'item', item, count: 1 }]);
    expect(errors(check([chapter([b, beat('late', { timer: 1 }, [{ do: 'item', item }])])], [quest([twice])])))
      .toContainEqual(at('k1/gate', id));
    b.enter!.push({ do: 'item', item });
    expect(check([chapter([b])], [quest([twice])])).toEqual([]);
  });

  it('includes forward checkpoints and keeps test-only writers out of production', () => {
    const a = { ...beat('a'), next: 'last', checkpoint: 'rescue' };
    expect(check([chapter([a, beat('rescue'), beat('last')])])).toEqual([]);
    const example = chapter([beat('test', { timer: 1 }, [flag])], 'debug');
    example.story.test = true;
    example.story.next = 'k1';
    const live = chapter([beat('first', { flag: 'ready' })]);
    expect(errors(check([example, live]))).toContainEqual(at('k1/first', 'ready'));
  });

  it('reports an out-of-range counter in a reaction even when the beat can finish', () => {
    const q = quest([{ ...collect, count: 2 }]);
    const b = { ...beat('gate', done, [start, { do: 'item', item, count: 2 }]), on: [
      { id: 'basket', when: { quest: { id, objective: 'get', gte: 3 } }, do: [flag] },
    ] };
    expect(check([chapter([b])], [q])).toContainEqual(at('k1/gate/basket', '"gte":3'));
  });

  it('lets a repeatable interaction progress a manual objective several times', () => {
    const o: QuestObjective = { id: 'rings', type: 'manual', count: 3, text_de: 'Läuten' };
    const b = { ...beat('gate', done, [start]), on: [{ id: 'ring', repeat: true,
      when: { enter: { x: 0, z: 0, r: 2 } }, do: [{ do: 'quest', op: 'progress', id, objective: o.id } as Action],
    }] };
    expect(check([chapter([b])], [quest([o])])).toEqual([]);
  });

  it('compares text across packs, leave actions, and nested choices, including variants and eras', () => {
    const packs = [{ file: 'dialogue.pack.json', pack: { pack: 'voice', dialogue: [
      { id: 'line', speaker: 'laub', text_de: 'Hier.', trigger: { event: 'story:cue' } },
    ] } }];
    const s = chapter([beat('a', { timer: 1 }, [{ do: 'say', line: 'line' }])]);
    const a: Action = { do: 'say', id: 'line', text: 'Hier.', speaker: 'laub' };
    s.story.leave = [{ do: 'choice', id: 'exit', prompt: 'Wohin?', options: [{ label: 'Los', set: {}, then: [a] }] }];
    expect(check([s], [], packs)).toEqual([]);
    a.text_by_era = { today: 'Da.' };
    expect(errors(check([s], [], packs))).toContainEqual(at('k1/leave/exit/Los', 'dialogue.pack.json [line]'));
    delete a.text_by_era;
    a.variants = ['Hier.', 'Da.'];
    expect(errors(check([s], [], packs))).toHaveLength(1);
  });
});
