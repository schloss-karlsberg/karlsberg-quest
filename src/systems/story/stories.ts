import type { StoryFile } from './types';

/** All story files bundled by Vite (content/story/*.story.json), sorted by file name. */
export function loadBundledStories(): { file: string; story: StoryFile }[] {
  const mods = import.meta.glob<StoryFile>('/content/story/*.story.json', { eager: true, import: 'default' });
  return Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, story]) => ({ file: file.replace(/^\//, ''), story }));
}
