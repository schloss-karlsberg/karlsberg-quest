import type { GameEvents } from '../../core/events';
import type { ProgressionSlice } from '../../rpg/types';
import type { StorySlice } from './engine';
import type { FlagValue, LootAction, StoryFile } from './types';

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

/** Lock in the first good shot while this tour stop is active, before the shot is autosaved. */
export function acceptTourDeerPhoto(story: StorySlice, flags: Record<string, FlagValue>, shot: GameEvents['photo:good']): boolean {
  if (!story.active || story.chapter !== 'tour' || story.beat !== 't10' || shot.id !== 'reh.ricke') return false;
  if (flags['tour.reh.done'] || flags['tour.reh.photo']) return false;
  flags['tour.reh.photo'] = shot.state || 'unknown';
  return true;
}

/** Recover a pending shot in an older t10 save before resume clears its beat latches. */
export function restoreTourDeerPhoto(story: StorySlice, flags: Record<string, FlagValue>): void {
  if (story.chapter !== 'tour' || story.beat !== 't10') return;
  const reaction = story.fired.find((id) => id === 'b:foto' || id === 'b:foto-alert');
  if (!reaction && !story.latched['br:foto.0'] && !story.latched['br:foto-alert']) return;
  const alert = reaction ? reaction === 'b:foto-alert' : !!story.latched['br:foto-alert'] || flags['tour.reh.alert'] === true;
  acceptTourDeerPhoto(story, flags, { id: 'reh.ricke', stars: 2, state: alert ? 'alert' : undefined });
}
