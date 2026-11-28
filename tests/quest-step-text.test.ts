import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sameStep, stepWords, viaLine } from '../src/systems/quests/stepText';

describe('quest step text (TASK-093: the tracker showed the same step twice)', () => {
  it('treats a story line that only adds the key as the same step', () => {
    expect(sameStep('An der Quelle: E – das Wasser berühren', 'An der Quelle: das Wasser berühren')).toBe(true);
    expect(sameStep('Am Trog: E - das Wasser berühren.', 'am Trog das Wasser berühren')).toBe(true);
    expect(stepWords('VAT (3): die Kante im Wald ansehen')).toBe('vat 3 die kante im wald ansehen');
  });

  it('keeps different steps apart', () => {
    expect(sameStep('Zum Ehrenhof', 'Hinauf zum Ehrenhof, zu Fuß')).toBe(false);
    expect(sameStep('An der Quelle: E – das Wasser berühren', 'An der Quelle: den Rock holen')).toBe(false);
  });

  it('shows the story line under the goal only when it says something else', () => {
    expect(viaLine('An der Quelle: E – das Wasser berühren', 'An der Quelle: das Wasser berühren')).toBeUndefined();
    expect(viaLine('Zurück in den Sommer 1789: Q an der Quelle', 'Hinauf zum Ehrenhof, zu Fuß')).toBeUndefined();
    expect(viaLine('Erst zur Bleiche', undefined)).toBeUndefined();
    expect(viaLine('Erst zur Bleiche', 'Den Rock anziehen')).toBe('Erst zur Bleiche');
  });

  it('the chapter 1 arrival no longer asks for the water twice: the touch step is gone from story and quest', () => {
    // TASK-089: the tour's touch is the journey, so „Der Hof“ has neither the `k1.quelle` story line
    // nor the `quelle` step of its arrival quest. What is left of the pair that showed twice here:
    const story = readFileSync('content/story/01-kapitel-1.story.json', 'utf8');
    const quests = JSON.parse(readFileSync('content/quests/01-kapitel-1.quests.json', 'utf8')) as {
      quests: { id: string; objectives: { id: string; text_de: string }[] }[];
    };
    const steps = quests.quests.find((q) => q.id === 'q.k1.ankunft')!.objectives;
    expect(steps.map((o) => o.id)).toEqual(['wechsel', 'wache', 'fluegel']);
    expect(story).not.toContain('"id": "k1.quelle"');
    expect(`${story}${JSON.stringify(steps)}`).not.toMatch(/das Wasser berühren/);
    // the way back after a wake is a „Q …“ line: the story shows it itself, never under the quest goal
    const back = /"id": "k1\.zurueck-q",\s*"text": "([^"]+)"/.exec(story)?.[1];
    expect(back).toBe('Zurück in den Sommer 1789: Q an der Quelle');
    expect(viaLine(back!, steps[0]!.text_de)).toBeUndefined();
  });
});
