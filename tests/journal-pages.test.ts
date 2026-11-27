import { afterEach, expect, it, vi } from 'vitest';
import testPack from '../content/quests/99-test.quests.json';
import type { Fact } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import { itemDef } from '../src/rpg/items';
import type { ItemDef, QuestProgress } from '../src/rpg/types';
import type { QuestDefIn } from '../src/systems/quests/logic';
import { type PageData, renderCodex, renderQuests, renderSets } from '../src/systems/quests/pages';
import '../src/systems/quests/strings';
import { installPageDom } from './ui-fixture';

afterEach(() => vi.unstubAllGlobals());

function journal() {
  const root = installPageDom();
  const facts = new Map<string, Fact>();
  const codex = { facts: [] as string[] };
  const progress: Record<string, QuestProgress> = {};
  const owned: Record<string, number> = {};
  const unread = new Set<string>();
  const bestiary: Record<string, number> = {};
  const quests = testPack.quests.map(quest => ({ ...quest, chapter: testPack.chapter }) as QuestDefIn);
  const items = testPack.items as ItemDef[];
  const data: PageData = {
    ctx: { content: { facts }, state: { state: { codex } } } as GameContext,
    quests: () => quests, progress: id => progress[id], count: (id, obj) => progress[id]?.counts[obj] ?? 0,
    objectiveVisible: () => true, tracked: () => [], track: vi.fn(),
    item: id => itemDef(id) ?? items.find(item => item.id === id), questItems: () => items, owned: id => owned[id] ?? 0,
    unseen: () => [...unread], seen: id => { unread.delete(id); }, bestiary: () => bestiary, speaker: id => id,
  };
  return { root, data, facts, codex, progress, owned, unread, bestiary };
}

it('checks only earned optional objectives in the completed quest history', () => {
  const { root, data, progress } = journal();
  const saved = { state: 'done' as const, t: 5, counts: { briefe: 3, zettel: 1, marke: 0 } };
  progress['q.test.lohnzettel'] = saved;
  const objectives = () => root.byId('journal-quest-detail').all(node => node.tag === 'li');
  renderQuests(root.element, data);
  expect(objectives().map(row => row.textContent.startsWith('✓'))).toEqual([true, true, false]);
  expect(root.byId('journal-history').textContent).toContain(testPack.quests[0]!.history![0]!.text);
  saved.counts.marke = 1;
  renderQuests(root.element, data);
  expect(objectives().at(-1)?.textContent).toMatch(/^✓.*\+20 EP/);
});

it('marks the displayed quest as read without clearing unread siblings', () => {
  const { root, data, progress, unread } = journal();
  renderQuests(root.element, { ...data, quests: () => [] });
  progress['q.test.lohnzettel'] = { state: 'done', t: 1, counts: { briefe: 3, zettel: 1 } };
  progress['q.test.irrlichter'] = { state: 'done', t: 1, counts: { lichter: 2 } };
  for (const id of ['q.test.lohnzettel', 'q.test.irrlichter']) {
    unread.add(`q:${id}`);
  }
  renderQuests(root.element, data);
  const row = (id: string) => root.byId(`journal-quest-${id}`);
  const fresh = (id: string) => row(id).all(node => node.className === 'kqj-fresh').length;
  expect(root.byId('journal-quest-detail').dataset.quest).toBe('q.test.lohnzettel');
  expect([...unread]).toEqual(['q:q.test.irrlichter']);
  expect(fresh('q.test.lohnzettel')).toBe(0);
  expect(fresh('q.test.irrlichter')).toBe(1);
  row('q.test.irrlichter').click();
  expect(root.byId('journal-quest-detail').dataset.quest).toBe('q.test.irrlichter');
  expect(unread.size).toBe(0);
  expect(fresh('q.test.irrlichter')).toBe(0);
});

it.each([
  { seconds: 0.4, savedCount: 0, earnedCount: 1, progressText: [], earnedText: [] },
  { seconds: 2.6, savedCount: 2, earnedCount: 4, progressText: ['2/3'], earnedText: ['3/3'] },
])('uses the gameplay target for a $seconds-second survival bonus after turn-in', ({ seconds, savedCount, earnedCount, progressText, earnedText }) => {
  const { root, data, progress } = journal();
  const quest = data.quests()[0]!;
  const saved = { state: 'done' as const, t: 5, counts: { briefe: 3, zettel: 1, hold: savedCount } };
  progress[quest.id] = saved;
  const quests: PageData['quests'] = () => [{
    ...quest,
    objectives: [...quest.objectives, { id: 'hold', type: 'survive', text_de: 'Am Bauplatz ausharren', optional: true, seconds }],
  }];
  const render = () => renderQuests(root.element, { ...data, quests });
  const objective = () => root.byId('journal-quest-detail').all(node => node.tag === 'li').at(-1)!;
  const count = () => objective().all(node => node.className === 'kqj-n').map(node => node.textContent.trim());

  render();
  expect(objective().textContent).not.toMatch(/^✓/);
  expect(count()).toEqual(progressText);
  saved.counts.hold = earnedCount;
  render();
  expect(objective().textContent).toMatch(/^✓/);
  expect(count()).toEqual(earnedText);
});

it('keeps locked facts anonymous and removes a read card from Neu, not from the collection', () => {
  const { root, data, facts, codex, unread } = journal();
  const fact: Fact = { id: 'entry', title_de: 'Seite', text_de: 'Text', confidence: 'D', fiction: true, sources: [], tags: ['label:FAKT'] };
  facts.set('locked', { ...fact, id: 'locked', title_de: 'Geheimer Titel' });
  facts.set(fact.id, fact);
  facts.set('rm.01', { ...fact, id: 'rm.01', title_de: 'Muster' });
  unread.add('locked'); unread.add('entry'); unread.add('q:test');
  codex.facts.push('entry', 'rm.01');
  renderCodex(root.element, data);
  const grid = () => root.byId('codex-grid');
  expect(grid().children.map(card => card.dataset.fact)).toEqual(['entry', 'locked']);
  expect(grid().textContent).not.toContain('Geheimer Titel');
  expect(grid().textContent).toContain('Fiktion');
  expect(root.byId('codex-filter-new').textContent).toContain('1');
  root.byId('codex-filter-new').click();
  expect(grid().children.map(card => card.dataset.fact)).toEqual(['entry']);
  root.byId('codex-card-entry').click();
  expect(root.byId('codex-detail').dataset.fact).toBe('entry');
  expect(grid().children).toHaveLength(0);
  expect([...unread]).toEqual(['locked', 'q:test']);
  root.byId('codex-filter-relief').click();
  expect(grid().children.map(card => card.dataset.fact)).toEqual(['rm.01']);
  root.byId('codex-filter-all').click();
  expect(root.byId('codex-card-entry').textContent).toContain('Seite');
  codex.facts = [];
  renderCodex(root.element, data);
  expect(root.all(node => node.dataset.testid === 'codex-detail')).toHaveLength(0);
});

it.todo('Codex: decide whether switching filters should clear an already-open detail outside the new filter');

it('counts distinct collection members, not copies, and reveals bestiary entries only after a kill', () => {
  const { root, data, owned, bestiary } = journal();
  const set = () => root.byId('set-hundemarken');
  const enemy = () => root.byId('bestiary').all(node => node.dataset.enemy === 'streuner')[0]!;
  renderSets(root.element, data);
  expect(set().textContent).toContain('0/1');
  expect(set().textContent).not.toContain('Probe');
  expect(root.byId('set-festplaene').className).not.toContain('complete');
  expect(enemy().textContent).toContain('???');
  owned['item.test.marke'] = 3; bestiary.streuner = 2;
  renderSets(root.element, data);
  expect(set().textContent).toContain('1/1');
  expect(set().textContent).toContain('Probe');
  expect(set().className).toContain('kqj-complete');
  expect(enemy().textContent).toContain('2× aufgelöst');
  expect(enemy().textContent).toContain('Epochen:');
});
