import { allOf, isOneOf } from '../../core/saved';
import { createStorySlice, DEFAULT_VISITOR_NAME, type StorySlice } from './engine';
import type { GameState } from '../../core/state';
import { createQuestSlice } from '../quests/logic';
import { HOME } from './hub/home';
import type { EndingId, FlagValue, LookTime } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LOOK_TIMES = allOf<LookTime>()(['day', 'dawn', 'dusk', 'night', 'tour']);
const ENDINGS = allOf<EndingId>()(['museum', 'burn', 'keep']);

/** Fill missing legacy fields and reject malformed values used when restoring the story. */
export function readStorySlice(saved: Record<string, unknown>, flags: Record<string, FlagValue>, clues: readonly string[]): StorySlice {
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
  migrateStorySlice(story, flags, clues);
  return story;
}

const K3_QUEST_MILESTONES = new Map<string, { id: string; objectives: string[] }>([
  ['k3_4', { id: 'q.k3.festsaal', objectives: ['saal'] }],
  ['k3_5', { id: 'q.k3.festsaal', objectives: ['saal', 'wahl'] }],
  ['k3_6', { id: 'q.k3.festsaal', objectives: ['saal', 'wahl', 'hinaus'] }],
  ['k3_8', { id: 'q.k3.hunde', objectives: ['zwinger'] }],
]);

/**
 * Required objectives (id → count) of the quests repaired above. They are data here, not a content
 * import: `src/core/save` loads this module, and e2e specs import it in Node, which refuses JSON
 * modules without an import attribute. tests/chapter-k3-autosave.test.ts checks them against
 * content/quests/03-kapitel-3.quests.json.
 */
export const K3_REQUIRED_OBJECTIVES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'q.k3.festsaal': { saal: 1, wahl: 1, hinaus: 1, pforte: 1 },
  'q.k3.hunde': { streuner: 3, zwinger: 1, tueren: 1 },
};

/** Restore quest progress implied by downstream beats whose entry assumes the quest is running. */
function migrateChapter3Quests(story: StorySlice, state: GameState): void {
  if (!story.active || story.chapter !== 'k3' || !story.beat) return;
  const milestone = K3_QUEST_MILESTONES.get(story.beat);
  if (!milestone) return;

  const slice = (state.systems.quests ??= createQuestSlice());
  const quests = (slice.quests ??= {});
  const progress = (quests[milestone.id] ??= { state: 'hidden', counts: {}, t: 0 });
  if (progress.state === 'hidden') {
    progress.state = 'active';
    progress.t = state.meta.playSeconds;
  }
  if (progress.state !== 'active') return;
  const counts = (progress.counts ??= {});
  for (const objective of milestone.objectives) {
    counts[objective] = Math.max(counts[objective] ?? 0, 1);
  }
  const required = Object.entries(K3_REQUIRED_OBJECTIVES[milestone.id] ?? {});
  if (required.length && required.every(([objective, n]) => (counts[objective] ?? 0) >= n)) {
    progress.state = 'ready';
    progress.t = state.meta.playSeconds;
  }
}

/** Repair quest progress implied by the saved story position (needs the whole state). */
export function migrateStoryQuests(story: StorySlice, state: GameState): void {
  migrateChapter3Quests(story, state);
}

/** Bring persisted story state up to date before Continue. */
function migrateStorySlice(story: StorySlice, flags: Record<string, FlagValue>, clues: readonly string[]): void {
  const { name } = story;
  if (typeof name !== 'string' || !name.trim() || name === 'Vermesser*in' || name === 'story.name.suggest') {
    story.name = DEFAULT_VISITOR_NAME;
  }

  // The spring dialogue and photo grant both follow the dawn teleport in older saves.
  if (story.chapter === 'k4' && story.beat === 'k4_14' && flags['k4.dawn.arrived'] === undefined
      && (story.said?.includes('marlene.end.morgen') || clues.includes('clue.k4.foto'))) {
    flags['k4.dawn.arrived'] = true;
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
