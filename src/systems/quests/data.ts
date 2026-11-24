import type { ItemDef, QuestDef, QuestFile } from '../../rpg/types';

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
  const retired = new Map<string, QuestDef & { chapter: string }>();
  const items = new Map<string, ItemDef>();
  for (const { data } of files) {
    if (data.test && !withTests) continue;
    // The tour still grants the page defined in the old quest file.
    const catalog = data.chapter === 'prolog' ? retired : quests;
    for (const q of data.quests ?? []) catalog.set(q.id, { ...q, chapter: data.chapter });
    for (const it of data.items ?? []) items.set(it.id, it);
  }
  return { quests, items, retired };
}
