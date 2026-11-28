import { describe, expect, it } from 'vitest';
import { dialogueGoal } from '../src/systems/story/objectives';

/** TASK-085: on a phone the dialogue card covers the tracker; the goal rides along in its footer. */
describe('dialogueGoal', () => {
  it('takes the story objective while it leads', () => {
    expect(dialogueGoal('Zur Gruppe am Wanderparkplatz · 15 m', 'Mahnbriefe zerreißen 1/3')).toBe('◆ Zur Gruppe am Wanderparkplatz · 15 m');
  });

  it('falls back to the tracker goal, with its whitespace collapsed', () => {
    expect(dialogueGoal(null, '  An der Quelle:\n  das Wasser berühren ')).toBe('◆ An der Quelle: das Wasser berühren');
    expect(dialogueGoal('   ', 'Am Gitter')).toBe('◆ Am Gitter');
  });

  it('is empty without either', () => {
    expect(dialogueGoal(null, null)).toBeNull();
    expect(dialogueGoal('', ' ')).toBeNull();
  });
});
