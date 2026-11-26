import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runtimeEvents, type StoryInput } from '../scripts/content-validation/catalog';
import { validateProgression } from '../scripts/content-validation/progression';
import { loadPacks } from '../scripts/validate-content';
import type { LoadedPack } from '../src/content/validate';
import type { FlagValue, ItemDef, QuestDef, QuestObjective } from '../src/rpg/types';
import { loadQuestFiles } from '../src/systems/quests/validate-cli';
import type { Action, Beat, Condition, Reaction } from '../src/systems/story/types';
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
const paper: ItemDef = { id: item, kind: 'consumable', name_de: 'Papier', text_de: 'Ein Blatt' };
function check(stories: StoryInput[], quests: QuestDef[] = [], packs: LoadedPack[] = [], items = [paper]) {
  return validateProgression(stories, [{ file: 'k1.quests.json', data: {
    chapter: 'k1', quests, items,
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

  it('reads pack clue prerequisites and rewards across linked chapter exits', () => {
    const pack: LoadedPack = { file: 'paper.pack.json', pack: { pack: 'paper', clues: [{
      id: 'clue.paper', kind: 'object', title_de: 'Papier', where: { x: 1, z: 2, radius: 3, era: 'today' },
      requires: { flags: ['ready'] }, reveals: { flags: ['found'] },
    }] } };
    const first = chapter([beat('first')], 'prior');
    first.story.next = 'k1';
    const gate = chapter([beat('gate', { flag: 'found' })]);
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
    expect(errors(check([chapter([beat('gate', done, [loot, { do: 'loot', id: 'pile', clear: true }, start])])], [quest([collect])])))
      .toContainEqual(at('k1/gate', 'beat cannot complete'));
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
    const pre = quest([], { id: 'q.k1.before', kind: 'side', available: { flag: 'never' }, rewards: { items: [{ item }] } });
    const pay: Action = { do: 'quest', op: 'complete', id: pre.id };
    expect(errors(check([chapter([beat('gate', done, [pay, start])])], [pre, quest([collect])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    expect(errors(check([chapter([beat('gate', done, [start, pay])])], [pre, quest([collect])]))).toEqual([]);
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

describe('TASK-052 review regressions', () => {
  const pickup: Action = { do: 'loot', id: 'pile', item };
  const picked: Condition = { event: 'item:pickup', match: { item, id: 'pile', reason: 'pickup' } };
  const talker: Action = { do: 'npc', op: 'spawn', npc: 'hanne' };
  const manual: QuestObjective = { id: 'rings', type: 'manual', count: 2, text_de: 'Zweimal grüßen' };

  it('matches the actual tour arrival payload, including stop, route and count', () => {
    const tours = loadStoryFiles(root).files.filter(s => s.story.chapter === 'tour');
    expect(errors(check(tours))).toEqual([]);
    const stop = tours[0].story.beats.find(b => b.id === 't3')!;
    const complete: Condition = { event: 'npc:arrived', match: { npc: 'imhoff', at: 'abzweig', route: 'p-fuehrung' } };
    stop.complete = complete;
    expect(errors(check(tours))).toEqual([]);
    for (const change of [{ at: 'missing-stop' }, { route: 'p-aufstieg' }, { npc: 'hanne' }] as Record<string, FlagValue>[]) {
      stop.complete = { ...complete, match: { ...complete.match, ...change } };
      expect(errors(check(tours))).toContainEqual(at('tour/t3', 'beat cannot complete'));
    }
    stop.complete = { ...complete, times: 2 };
    expect(errors(check(tours))).toContainEqual(at('tour/t3', 'beat cannot complete'));
  });

  it('takes a matching placement once and credits its inventory to later use, not later collect', () => {
    const first = beat('pickup', picked, [pickup]);
    const second = beat('quest', done, [start, pickup]); // Re-declaring a taken placement is idempotent.
    const story = chapter([first, second]);
    expect(errors(check([story], [quest([collect])]))).toContainEqual(at('k1/quest', 'beat cannot complete'));
    expect(errors(check([story], [quest([{ ...collect, type: 'use' }])]))).toEqual([]);
    first.enter!.unshift(start);
    second.enter = [];
    expect(errors(check([story], [quest([collect])]))).toEqual([]);
  });

  it('counts distinct matching pickup events and applies payload bounds after the stack cap', () => {
    const event = { event: 'item:pickup', match: { item }, times: 2, gte: { count: 2 }, lte: { total: 4 } };
    const gate = beat('pickup', event, [{ ...pickup, count: 2 }]);
    const story = chapter([gate]);
    expect(errors(check([story]))).toContainEqual(at('k1/pickup', 'beat cannot complete'));
    gate.enter!.push({ ...pickup, id: 'another', count: 3 });
    expect(errors(check([story]))).toContainEqual(at('k1/pickup', 'beat cannot complete'));
    expect(errors(check([story], [], [], [{ ...paper, stack: 4 }]))).toEqual([]);
    expect(errors(check([story], [], [], [{ ...paper, stack: 3 }]))).toContainEqual(at('k1/pickup', 'beat cannot complete'));
  });

  it('leaves an oversized pickup on the ground until there is room for the remainder', () => {
    const use = quest([{ ...collect, type: 'use' }], { id: 'q.k1.use' });
    const story = chapter([
      beat('take', { ...picked, match: { item, id: 'pile', count: 1, total: 1 } }, [{ ...pickup, count: 2 }]),
      beat('use', { quest: { id: use.id } }, [{ ...start, id: use.id }]),
      beat('take-rest', picked),
    ]);
    expect(errors(check([story], [use], [], [{ ...paper, stack: 1 }]))).toEqual([]);
  });

  it('checks inline prerequisites before either set or then and uses only a live timeout', () => {
    const choice: Action = { do: 'choice', id: 'in', modal: false, prompt: 'Weiter?', fallback: 1, options: [
      { label: 'Ja', when: { flag: 'ready' }, set: { ready: true } },
      { label: 'Auch ja', when: { flag: 'ready' }, set: {}, then: [flag] },
    ] };
    const gate = beat('inline', { chosen: 'in', option: 1 }, [choice]);
    const story = chapter([gate]);
    expect(errors(check([story]))).toContainEqual(at('k1/inline', 'beat cannot complete'));
    choice.seconds = 2;
    expect(errors(check([story]))).toEqual([]);
    gate.enter!.unshift(flag);
    // The first option is selected immediately. The timeout cannot select the second later.
    expect(errors(check([story]))).toContainEqual(at('k1/inline', 'beat cannot complete'));
    delete choice.seconds;
    gate.complete = { chosen: 'in', option: 0 };
    expect(errors(check([story]))).toEqual([]);
  });

  it('waits for a reachable prerequisite while an inline choice is open', () => {
    const choice: Action = { do: 'choice', id: 'in', modal: false, prompt: 'Weiter?', options: [
      { label: 'Ja', when: { flag: 'ready' }, set: { picked: true } },
    ] };
    expect(check([chapter([beat('inline', { flag: 'picked' }, [choice, { ...flag, delay: 2 }])])])).toEqual([]);
  });

  it('can wait out an optional inline trigger while that choice is still open', () => {
    const choice: Action = { do: 'choice', id: 'in', modal: false, prompt: 'Weiter?', seconds: 2, fallback: 1, options: [
      { label: 'Licht', when: { lantern: true }, set: {} },
      { label: 'Dunkel', set: { waited: true } },
    ] };
    const gate = beat('inline', { flag: 'waited' }, [choice]);
    const story = chapter([gate]);
    expect(errors(check([story]))).toEqual([]);
    gate.complete = { timer: 1 };
    const after = beat('after', { flag: 'waited' });
    story.story.beats.push(after);
    expect(errors(check([story]))).toEqual([]);
    after.enter = [{ do: 'choice', id: 'new', prompt: 'Weiter?', options: [{ label: 'Ja', set: {} }] }];
    expect(errors(check([story]))).toContainEqual(at('k1/after', 'beat cannot complete'));
  });

  it('keeps a voice giver quest ready until the story completes it', () => {
    const voice = quest([], { turnin: 'giver' });
    const first = beat('ready', { quest: { id, state: 'ready' } }, [start]);
    const last = beat('done', done);
    const story = chapter([first, last]);
    expect(errors(check([story], [voice]))).toContainEqual(at('k1/done', 'beat cannot complete'));
    last.enter = [{ do: 'quest', op: 'complete', id }];
    expect(errors(check([story], [voice]))).toEqual([]);
  });

  it('keeps an NPC payout and the done state together, including when turn-in can be deferred', () => {
    const q = quest([], { turnin: { npc: 'hanne' }, rewards: { flags: { paid: true } } });
    const active = { quest: { id, state: 'active' } } as const;
    const gate = beat('gate', { all: [active, { flag: 'paid' }] }, [start, talker]);
    const completed = beat('completed', { all: [done, { flag: 'paid' }] });
    const story = chapter([gate, completed]);
    expect(errors(check([story], [q]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    gate.complete = active;
    expect(errors(check([story], [q]))).toEqual([]);
  });

  it('latches a delayed exit cue in the destination beat, but a synchronous exit cue in the old beat', () => {
    const first = { ...beat('a', { timer: 1 }), exit: [{ ...cue, delay: 1 }] };
    const second = beat('b', { event: 'story:cue', match: { id: 'bell' } });
    const story = chapter([first, second]);
    expect(check([story])).toEqual([]);
    first.exit = [{ ...cue, delay: 0 }];
    expect(errors(check([story]))).toContainEqual(at('k1/b', 'beat cannot complete'));
  });

  it('cannot fire a reaction beyond the beat deadline and can fire it at the deadline', () => {
    const voice = quest([manual], { turnin: 'giver' });
    const finish: Action = { do: 'quest', op: 'complete', id };
    const reaction = { id: 'pay', when: { timer: 5 }, do: [finish] };
    const first = { ...beat('a', { any: [{ timer: 1 }, { flag: 'other' }] }, [start]), on: [reaction] };
    const story = chapter([first, beat('b', done)]);
    expect(errors(check([story], [voice]))).toContainEqual(at('k1/b', 'beat cannot complete'));
    reaction.when.timer = 1;
    expect(errors(check([story], [voice]))).toEqual([]);
    reaction.when = { timer: 0.5 };
    expect(errors(check([story], [voice]))).toEqual([]);
  });

  it('bounds chapter reactions by the chapter clock and lets them fire in a later beat', () => {
    const story = chapter([beat('a'), beat('b', { timer: 2 }), beat('c', { flag: 'ready' })]);
    story.story.on = [{ id: 'pay', when: { chapterTimer: 4 }, do: [flag] }];
    // The chapter reaction survives the first two deadlines and runs in the waiting third beat.
    expect(errors(check([story]))).toEqual([]);
    story.story.beats[2].complete = { any: [{ timer: 0.5 }, { flag: 'ready' }] };
    story.story.beats.push(beat('d', { flag: 'ready' }));
    story.story.on[0].when = { chapterTimer: 10 };
    // A beat-scoped timer is checked against the chapter clock, including the previous 3 seconds.
    story.story.beats[2].on = [{ id: 'too-late', when: { chapterTimer: 4 }, do: [flag] }];
    story.story.on = [];
    expect(errors(check([story]))).toContainEqual(at('k1/d', 'beat cannot complete'));
  });

  it('uses chapter time for a chapter-scoped timer and starts beat timers over on entry', () => {
    const first = beat('a', { timer: 3 });
    const second = beat('b', { timer: 1 });
    const story = chapter([first, second, beat('c', { flag: 'ready' })]);
    const reaction: Reaction = { id: 'pay', when: { timer: 4 }, do: [flag] };
    second.on = [reaction];
    expect(errors(check([story]))).toContainEqual(at('k1/c', 'beat cannot complete'));
    second.on = [];
    story.story.on = [reaction];
    expect(errors(check([story]))).toEqual([]);
  });

  it('drops unfinished earlier main quests and retains a present-day side quest until it expires', () => {
    const side = quest([manual], { id: 'q.k1.side', kind: 'side', era: 'today' });
    const first = chapter([beat('a', { timer: 1 }, [start, { ...start, id: side.id }])]);
    first.story.next = 'k2';
    const second = chapter([beat('b', { quest: { id, state: 'active' } })], 'k2');
    expect(errors(check([second, first], [quest([manual]), side]))).toContainEqual(at('k2/b', 'beat cannot complete'));
    second.story.beats[0].complete = { quest: { id: side.id, state: 'active' } };
    second.story.next = 'k3';
    const third = chapter([beat('c', { quest: { id: side.id, state: 'failed' } })], 'k3');
    expect(errors(check([third, second, first], [quest([manual]), side])).map(i => i.id)).toEqual([id]);
  });

  it('pays out an earlier ready past-era side quest on chapter entry', () => {
    const side = quest([], { id: 'q.k1.side', kind: 'side', era: '1789', turnin: 'giver', rewards: { flags: { paid: true } } });
    const first = chapter([beat('a', { quest: { id: side.id, state: 'ready' } }, [{ ...start, id: side.id }])]);
    first.story.next = 'k2';
    const second = chapter([beat('b', { all: [{ quest: { id: side.id } }, { flag: 'paid' }] })], 'k2');
    expect(errors(check([second, first], [side]))).toEqual([]);
  });

  it('distinguishes legacy-only Chronik confirmation from the shipped case definition', () => {
    const { packs } = loadPacks(root);
    for (const c of [{ caseComplete: 'case.k1' }, { confirmed: { case: 'case.k1', n: 1 } },
      { event: 'chronik:case-complete', match: { caseId: 'case.k1' } }] as Condition[]) {
      const issues = check([chapter([beat('gate', c)])], [], packs);
      expect(errors(issues)).toContainEqual(at('k1/gate', 'beat cannot complete'));
      expect(issues).toContainEqual(at('k1/gate', 'legacy-save or debug'));
    }
    expect(errors(check([chapter([beat('gate', { confirmed: { case: 'case.k1', n: 0 } })])], [], packs))).toEqual([]);
  });

  it('explores successive occurrences of a choice id with different option counts', () => {
    const choose = (keys: string[]): Action => ({
      do: 'choice', id: 'door', prompt: 'Wohin?', options: keys.map(key => ({ key, label: key, set: {} })),
    });
    const story = chapter([
      beat('first', { chosen: 'door' }, [choose(['eins', 'zwei', 'drei'])]),
      beat('next', { all: [{ event: 'story:choice', match: { id: 'door', option: 'vier' } }, { chosen: 'door', option: 'vier' }] },
        [choose(['vier', 'fünf'])]),
    ]);
    const issues = check([story]);
    expect(errors(issues)).toEqual([]);
    expect(issues).toContainEqual(at('k1/next', 'door=drei, door=fünf'));
  });

  it('rearms on fresh matching greetings but cannot reuse one latched story cue', () => {
    const reaction: Reaction = { id: 'say-again', repeat: true, when: { event: 'npc:talk', match: { npc: 'hanne', topic: 'greet' } },
      do: [{ do: 'quest', op: 'progress', id, objective: 'rings' } as Action] };
    const gate = { ...beat('gate', done, [start, talker]), on: [reaction] };
    const story = chapter([gate]);
    expect(check([story], [quest([manual])])).toEqual([]);
    reaction.when = { event: 'npc:talk', match: { npc: 'soll', topic: 'greet' } };
    expect(errors(check([story], [quest([manual])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    gate.on[0] = { ...reaction, when: { event: 'story:cue', match: { id: 'bell' } } };
    gate.enter = [start, cue];
    expect(errors(check([story], [quest([manual])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    gate.enter.push({ ...cue, delay: 1 });
    expect(check([story], [quest([manual])])).toEqual([]);
  });

  it('respects cooldown between repeat greetings before the beat deadline', () => {
    const progress: Action = { do: 'quest', op: 'progress', id, objective: 'rings' };
    const reaction: Reaction = {
      id: 'say-again', repeat: true, cooldown: 2, when: { event: 'npc:talk', match: { npc: 'hanne', topic: 'greet' } }, do: [progress],
    };
    const first = { ...beat('first', { timer: 1 }, [start, talker]), on: [reaction] };
    const story = chapter([first, beat('gate', done)]);
    expect(errors(check([story], [quest([manual])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    first.complete = { timer: 3 };
    expect(check([story], [quest([manual])])).toEqual([]);
  });

  it('requires an era the player can reach to accept a placed NPC offer', () => {
    const q = quest([], { giver: { npc: 'hanne' } });
    const gate = beat('gate', done, [{ ...talker, era: '1789' }, { do: 'quest', op: 'offer', id }]);
    const story = chapter([gate]);
    expect(errors(check([story], [q]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    gate.enter!.push({ do: 'anchor', to: '1789' });
    expect(check([story], [q])).toEqual([]);
  });

  it('counts remaining enemies of the group in its reachable era', () => {
    const kill: QuestObjective = { id: 'clear', type: 'kill', group: 'pack', count: 4, text_de: 'Vier Schatten' };
    const spawn: Action = { do: 'enemy', op: 'spawn', kind: 'mahnbrief', group: 'pack', count: 1, era: '1789' };
    const gate = beat('gate', done, [start, spawn, { do: 'anchor', to: '1789' }]);
    const story = chapter([gate]);
    expect(errors(check([story], [quest([kill])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    spawn.count = 4;
    expect(check([story], [quest([kill])])).toEqual([]);
    gate.enter!.pop();
    expect(errors(check([story], [quest([kill])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    const next = quest([kill], { id: 'q.k1.next' });
    gate.enter!.push({ do: 'anchor', to: '1789' });
    story.story.beats.push(beat('again', { quest: { id: next.id } }, [{ ...start, id: next.id }, spawn]));
    expect(errors(check([story], [quest([kill]), next]))).toContainEqual(at('k1/again', 'beat cannot complete'));
  });

  it('writes court admission only after reachable inspection, and only as true', () => {
    const gate = beat('gate', { flag: 'court.admitted', eq: true }, [
      { do: 'npc', op: 'spawn', npc: 'wache', era: '1789', watch: { inspector: true, fov: 60, range: 24, set: 'gate' } },
      { do: 'anchor', to: '1789' },
      { do: 'flag', set: { 'disguise.coat': true, 'disguise.letter': true } },
    ]);
    const story = chapter([gate]);
    expect(errors(check([story]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    gate.enter!.push({ do: 'cue', id: 'court:on', data: { set: 'gate' } });
    expect(check([story])).toEqual([]);
    gate.complete = { flag: 'court.admitted', eq: 'impossible' };
    expect(errors(check([story]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
  });

  it('writes the shift flags with their values and clears them when the anchor closes', () => {
    const anchor: Action = { do: 'anchor', to: '1789', x: 30, z: -50, r: 8 };
    const gate = beat('gate', { all: [
      { flag: 'shift.allowed', eq: true }, { flag: 'shift.target', eq: '1789' },
      { flag: 'shift.x', eq: 30 }, { flag: 'shift.z', eq: -50 }, { flag: 'shift.r', eq: 8 },
    ] }, [anchor]);
    expect(check([chapter([gate])])).toEqual([]);
    gate.enter!.push({ do: 'anchor', to: null });
    expect(errors(check([chapter([gate])]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
  });

  it('mirrors the numeric RPG level when XP is actually earned', () => {
    const story = chapter([beat('gate', { flag: 'rpg.level', eq: 2 })]);
    expect(errors(check([story]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
    story.story.beats[0].enter = [{ do: 'xp', amount: 150 }];
    expect(check([story])).toEqual([]);
    story.story.beats[0].complete = { flag: 'rpg.level', eq: '2' };
    expect(errors(check([story]))).toContainEqual(at('k1/gate', 'beat cannot complete'));
  });

  it('writes built-in and declared deeds from pickups without a quest and honours first taken', () => {
    const handle: Action = { do: 'item', item: 'item.charm.tuergriff' };
    const coin: Action = { do: 'item', item: 'item.charm.dukat' };
    const story = chapter([beat('deed', { flag: 'flag.k3_objekt', eq: 'tuergriff' }, [
      { do: 'flag', set: { 'flag.k3_objekt': 'nichts' } }, handle, coin,
    ]), beat('placed', { flag: 'deed.read', eq: 'paper' }, [pickup])]);
    const items = [{ ...paper, deed: { flag: 'deed.read', value: 'paper' } }];
    expect(check([story], [], [], items)).toEqual([]);
    story.story.beats[0].complete = { flag: 'flag.k3_objekt', eq: 'dukat' };
    expect(errors(check([story], [], [], items))).toContainEqual(at('k1/deed', 'beat cannot complete'));
  });

  it('reports an unreferenced main quest with no offer, and a started one with no completion', () => {
    const story = chapter([beat('a')]);
    const reach: QuestObjective = { id: 'reach', type: 'reach', where: { x: 0, z: 0, r: 2 }, text_de: 'Ziel erreichen' };
    expect(errors(check([story], [quest([reach])]))).toContainEqual(at(id, 'no reachable offer or start'));
    story.story.beats[0].enter = [start];
    expect(check([story], [quest([reach])])).toEqual([]);
    expect(errors(check([story], [quest([reach], { turnin: 'giver' })]))).toContainEqual(at(id, 'no reachable completion'));
  });
});
