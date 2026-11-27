import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { objectiveTarget, targetVisible, type WayDeps } from '../src/systems/quests/wayfinding';

// TASK-083: an objective that asks for a Q shift ("Dort: Q – nach 1796") is shown before the shift,
// in the era the player is in when it becomes active (here: the present).
const dir = 'content/quests';
const deps: WayDeps = {
  era: 'today',
  player: { x: 0, z: 0 },
  pickups: () => [],
  npc: () => null,
  clue: () => null,
};

describe('Q-shift objectives', () => {
  const found: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.quests.json'))) {
    const pack = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { quests: { id: string; era?: string; objectives: { id: string; text_de?: string }[] }[] };
    for (const q of pack.quests) {
      for (const o of q.objectives) {
        if (/\bQ –/.test(o.text_de ?? '')) found.push(`${f}:${q.id}/${o.id}`);
        if (!/\bQ –/.test(o.text_de ?? '')) continue;
        it(`${q.id}/${o.id} has a waymark in the present`, () => {
          const t = objectiveTarget(q as never, o as never, deps);
          expect(targetVisible(t, 'today', q.era)).toBe(true);
        });
      }
    }
  }
  it('covers the chapter openers', () => expect(found.length).toBeGreaterThanOrEqual(4));
});
