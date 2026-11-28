/**
 * Comparing a quest goal with the story's own line for the same step. The story often words the
 * step with its key („An der Quelle: E – das Wasser berühren“) while the quest goal leaves the key
 * out („An der Quelle: das Wasser berühren“); the tracker must not list both (TASK-093).
 */

/** The step's words without key hints, punctuation and case. */
export function stepWords(text: string): string {
  return text
    // a key hint in front of the verb: „E – “, „E: “, „Q - “
    .replace(/(^|[\s:])[A-ZÄÖÜ](?:\s*[–—-]|:)\s+/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Do the two lines name the same step (only key hints or punctuation differ)? */
export function sameStep(a: string, b: string): boolean {
  return stepWords(a) === stepWords(b);
}

/**
 * The story's line to show under a quest goal as the step before it (`TrackerQuest.via`), or
 * undefined when it only repeats the goal or tells the way through time (a „Q …“ line the story
 * shows above the tracker itself).
 */
export function viaLine(storyLabel: string, goalText: string | undefined): string | undefined {
  if (goalText === undefined || sameStep(storyLabel, goalText) || /\bQ\b/.test(storyLabel)) return undefined;
  return storyLabel;
}
