import type { Issue, LoadedPack } from '../../src/content/validate';
import { ITEMS } from '../../src/rpg/items';
import { buildContent } from '../../src/systems/chronik/logic';
import { objectiveEvents } from '../../src/systems/quests/logic';
import { checkSayIds, visitStoryActions, type QuestInput, type StoryInput } from './catalog';
import { Chapter, Findings, freshState, type Catalog, type Save } from './chapter';

export function validateProgression(
  stories: StoryInput[], questFiles: QuestInput[], packs: LoadedPack[], events: ReadonlySet<string>,
): Issue[] {
  const issues = checkSayIds(stories, packs);
  const findings = new Findings();
  const allQuests = questFiles.flatMap(({ file, data }) => data.quests.map(q => ({ file, q: { ...q, chapter: data.chapter }, test: data.test })));
  const allItems = questFiles.flatMap(({ data }) => (data.items ?? []).map(item => ({ item, test: data.test })));
  for (const { file, q, test } of allQuests) for (const o of q.objectives) {
    const id = q.id + '/' + o.id;
    for (const name of objectiveEvents(o)) if (!events.has(name)) {
      issues.push({ level: 'error', file, id, message: `objective consumes '${name}' but no runtime emitter is known` });
    }
    if (o.item && !ITEMS.some(i => i.id === o.item) && !allItems.some(i => i.item.id === o.item && (!i.test || test))) {
      issues.push({ level: 'error', file, id, message: `objective requires unknown item '${o.item}'` });
    }
  }

  const limited = new Set<string>();
  const incoming = new Map<string, Save[]>();
  const declaredFlags = new Set<string>();
  const predecessors = new Map<string, Set<string>>();
  function link(from: string, to: string) {
    const parents = predecessors.get(to) ?? new Set<string>();
    parents.add(from);
    predecessors.set(to, parents);
  }
  for (const input of stories) {
    const { story } = input;
    for (const to of [story.next, ...story.unlocks ?? []]) if (to) link(story.chapter, to);
    visitStoryActions(input, a => {
      if (a.do === 'unlock') link(story.chapter, a.chapter);
      if (a.do === 'flag') for (const key of Object.keys(a.set)) declaredFlags.add(key);
      if (a.do === 'choice') {
        declaredFlags.add('choice.' + a.id);
        for (const o of a.options) for (const key of Object.keys(o.set)) declaredFlags.add(key);
      }
    });
  }
  for (const { q } of allQuests) {
    declaredFlags.add('quest.' + q.id);
    for (const o of q.objectives) declaredFlags.add('quest.' + q.id + '.' + o.id);
    for (const key of Object.keys(q.rewards?.flags ?? {})) declaredFlags.add(key);
  }
  for (const { item } of allItems) if (item.deed) declaredFlags.add(item.deed.flag);
  for (const { pack } of packs) for (const clue of pack.clues ?? []) {
    for (const key of clue.reveals.flags ?? []) declaredFlags.add(key);
  }
  // Normal chapter transitions carry inventory, flags and quest progress. Disconnected chapters
  // (including the debug chapter) start with fresh state and cannot supply a campaign prerequisite.
  const ordered = [...stories].sort((a, b) => a.story.order - b.story.order);
  const unfinished = new Set(ordered.map(s => s.story.chapter));
  while (ordered.length) {
    // Explicit transitions take precedence over chapter numbering. Break a chapter cycle at its first entry.
    const index = ordered.findIndex(s => ![...predecessors.get(s.story.chapter) ?? []].some(id => unfinished.has(id)));
    const [input] = ordered.splice(Math.max(0, index), 1);
    unfinished.delete(input.story.chapter);
    const { file, story } = input;
    const content = buildContent(packs, story.placeholder);
    const quests = allQuests.filter(q => !q.test || story.test);
    const catalog: Catalog = {
      quests: new Map(quests.map(({ q }) => [q.id, q])),
      questFiles: new Map(quests.map(({ q, file }) => [q.id, file])),
      clues: content.clues, cases: [...content.cases.values()],
      items: new Map([...ITEMS, ...allItems.filter(i => !i.test || story.test).map(i => i.item)].map(i => [i.id, i])),
      dialogue: packs.flatMap(p => p.pack.dialogue ?? []), events, declaredFlags,
    };
    const visited = new Set<string>();
    const starts = incoming.get(story.chapter) ?? [freshState()];
    const pending = starts.map(save => ({ save, options: new Map<string, number>() }));
    // Bound combinations in user-authored chapters; an incomplete search can only warn.
    let passes = 0;
    while (pending.length && passes++ < 64) {
      const { save, options } = pending.shift()!;
      const run = new Chapter(input, catalog, structuredClone(save), findings, options,
        other => pending.push({ save, options: other }));
      const finished = run.run();
      run.checkObjectives();
      for (const id of run.visited) visited.add(id);
      if (finished) for (const next of [story.next, ...story.unlocks ?? []]) if (next) run.unlocks.set(next, run.save);
      for (const [next, state] of run.unlocks) {
        if (!unfinished.has(next) || story.test || story.dev || story.placeholder) continue;
        const states = incoming.get(next) ?? [];
        states.push(state);
        incoming.set(next, states);
      }
    }
    if (pending.length) limited.add(file);
    if (pending.length) issues.push({ level: 'warning', file, id: story.chapter, message: 'choice path limit reached; check remaining paths in play' });
    for (const b of story.beats) if (!visited.has(b.id)) issues.push({
      level: story.test || pending.length ? 'warning' : 'error', file, id: story.chapter + '/' + b.id,
      message: `beat unreachable from chapter start '${story.start}'${story.test ? ' during normal play (debug goto can enter it)' : ''}`,
    });
  }
  return [...issues, ...findings.issues(limited)];
}
