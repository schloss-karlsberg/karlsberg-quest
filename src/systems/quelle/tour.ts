import type { StorySlice } from '../story/engine';

const QUELLE_BEATS = new Set(['t14', 't15', 't16', 't17', 't18']);

/** The approach can enter the hub radius before the guide arrives at the spring. */
export function inTourQuelle(story: Pick<StorySlice, 'active' | 'chapter' | 'beat'> | undefined): boolean {
  return !!story?.active && story.chapter === 'tour' && story.beat !== null && QUELLE_BEATS.has(story.beat);
}
