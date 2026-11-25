import type { ProgressionSlice } from '../../rpg/types';
import type { StorySlice } from './engine';
import type { LootAction, StoryFile } from './types';

/** All story files bundled by Vite (content/story/*.story.json), sorted by file name. */
export function loadBundledStories(): { file: string; story: StoryFile }[] {
  const mods = import.meta.glob<StoryFile>('/content/story/*.story.json', { eager: true, import: 'default' });
  return Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, story]) => ({ file: file.replace(/^\//, ''), story }));
}

/** Chapters available to the story engine, chapter selector and debug jumps. */
export function storiesInPlay(files: { story: StoryFile }[], params: URLSearchParams): StoryFile[] {
  return files.map(({ story }) => story).filter((story) =>
    (!story.test || params.has('storytest')) && (!story.dev || params.has(story.dev)),
  );
}

/** An older tour save can have finished a walk before that beat placed any chestnuts. */
export function missingTourChestnuts(file: StoryFile, story: StorySlice, progression: ProgressionSlice | undefined): LootAction[] {
  if (file.chapter !== 'tour') return [];
  const done = new Set(story.doneBeats);
  const known = new Set([...(progression?.taken ?? []), ...Object.keys(progression?.placed ?? {})]);
  const missing: LootAction[] = [];
  for (const beat of file.beats) {
    if (beat.id === story.beat || !done.has(`tour/${beat.id}`)) continue;
    for (const a of beat.enter ?? []) {
      if (a.do === 'loot' && a.group === 'tour.kastanien' && !a.clear && a.id && !known.has(a.id)) missing.push(a);
    }
  }
  return missing;
}
