/**
 * ContentDB dialogue triggers. The matcher is shared with the NPC conversations and the barks
 * (pure, src/content/triggers.ts); see there for the trigger keys (event, era, flag + value,
 * below/above, hasClue, chapter, beat, step …).
 */
export { type TriggerContext, matchTrigger, pickLine, pickSequence, stepOf } from '../../../content/triggers';
