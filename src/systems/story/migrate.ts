import { allOf, isOneOf } from '../../core/saved';
import { createStorySlice, DEFAULT_VISITOR_NAME, type StorySlice } from './engine';
import { HOME } from './hub/home';
import type { EndingId, LookTime } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LOOK_TIMES = allOf<LookTime>()(['day', 'dawn', 'dusk', 'night', 'tour']);
const ENDINGS = allOf<EndingId>()(['museum', 'burn', 'keep']);

/** Fill missing legacy fields and reject malformed values used when restoring the story. */
export function readStorySlice(saved: Record<string, unknown>): StorySlice {
  for (const key of ['fired', 'unlocked', 'completed', 'doneBeats', 'said']) {
    const value = saved[key];
    if (value !== undefined && (!Array.isArray(value) || !value.every((id) => typeof id === 'string'))) {
      throw new Error(`save: story.${key} must be a list of strings`);
    }
  }
  for (const key of ['latched', 'sayCount']) {
    const value = saved[key];
    if (value !== undefined && (!isRecord(value) || !Object.values(value).every(Number.isFinite))) {
      throw new Error(`save: story.${key} must be a record of numbers`);
    }
  }
  for (const key of ['threats', 'meters']) {
    const value = saved[key];
    if (value !== undefined && (!isRecord(value) || !Object.values(value).every(isRecord))) {
      throw new Error(`save: story.${key} must be a record of objects`);
    }
  }
  const { objective, look, lookPast, ending } = saved;
  if (objective != null && (!isRecord(objective) || typeof objective.text !== 'string')) {
    throw new Error('save: invalid story objective');
  }
  if (look !== undefined && !isOneOf(LOOK_TIMES, look)) {
    throw new Error('save: invalid story look');
  }
  if (lookPast != null && (!isRecord(lookPast) || typeof lookPast.era !== 'string'
    || !isOneOf(LOOK_TIMES, lookPast.time))) {
    throw new Error('save: invalid story look for a past era');
  }
  if (ending != null && !isOneOf(ENDINGS, ending)) {
    throw new Error('save: invalid story ending');
  }

  const story = { ...createStorySlice(), ...saved };
  migrateStorySlice(story);
  return story;
}

/** Update persisted labels and the return objective from before the spring became home. */
function migrateStorySlice(story: StorySlice): void {
  const { name } = story;
  if (typeof name !== 'string' || !name.trim() || name === 'Vermesser*in' || name === 'story.name.suggest') {
    story.name = DEFAULT_VISITOR_NAME;
  }

  const objective = story.objective;
  if (!objective) return;
  if (objective.id === 'k3.station') {
    Object.assign(objective, { id: 'k3.quelle', text: 'Zur Quelle', x: HOME.spawn.x, z: HOME.spawn.z });
  } else if (objective.id === 'k2.heim' && objective.text === 'Q halten: zurück in die Feldstation') {
    objective.text = 'Q halten: zurück zur Quelle';
  } else if (objective.id === 'k2.ende' && objective.text === 'Feldstation. Die Nacht ist vorbei.') {
    objective.text = 'An der Quelle. Die Nacht ist vorbei.';
  }
}
