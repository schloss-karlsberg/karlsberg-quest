import { legacyPrologueQuests } from '../../core/legacy-prologue-quests';
import type { ItemDef, QuestDef, QuestFile } from '../../rpg/types';
import type { Action, StoryFile } from '../story/types';

/** Past the offer window. On load, also repair deadlines whose scheduled command was lost. */
export function sideQuestClosed(story: StoryFile | undefined, beat: string | null, id: string): boolean {
  if (!story || !beat) return false;
  const index = story.beats.findIndex((entry) => entry.id === beat);
  const closes = (actions: Action[] | undefined) => actions?.some((action) => action.do === 'quest' && action.op === 'fail' && action.id === id);
  return story.beats.slice(0, index + 1).some((entry, ordinal) => closes(entry.enter) || (ordinal < index && closes(entry.exit)));
}

/** All quest files bundled by Vite (content/quests/*.quests.json), sorted by file name. */
export function loadBundledQuests(): { file: string; data: QuestFile }[] {
  const mods = import.meta.glob<QuestFile>('/content/quests/*.quests.json', { eager: true, import: 'default' });
  return Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, data]) => ({ file: file.replace(/^\//, ''), data }));
}

/**
 * The quests and quest items in play: test files (`"test": true`, 99-test) only with `?storytest`
 * (same rule as the story's test chapters).
 */
export function questsInPlay(files: { data: QuestFile }[], withTests: boolean) {
  const quests = new Map<string, QuestDef & { chapter: string }>();
  const retired = new Map(legacyPrologueQuests.map((q) => [q.id, q]));
  const items = new Map<string, ItemDef>();
  for (const { data } of files) {
    if (data.test && !withTests) continue;
    for (const q of data.quests ?? []) quests.set(q.id, { ...q, chapter: data.chapter });
    for (const it of data.items ?? []) items.set(it.id, it);
  }
  return { quests, items, retired };
}
