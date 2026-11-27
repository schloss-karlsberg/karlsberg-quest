import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de';
import { deContent } from '../src/i18n/de.content';
import { t, tInput } from '../src/i18n';
import '../src/systems/court/strings';
import { TRAVEL_DE } from '../src/systems/travel/strings';

/**
 * TASK-084: touch players must not be told to hold the Shift key. A player-facing string that
 * names a keyboard key needs a touch variant (`<key>.touch`, or `<name>Touch` in a strings object);
 * story content has no touch variant for objectives and toasts, so it must stay input-neutral.
 */
const KEY_WORDS = /Umschalt|\bShift\b/;
// keyboard-only by design: the key-binding settings list and its action names, and the F8
// developer-notes field (a text box typed on a keyboard)
const KEYBOARD_ONLY = /^(ui\.keys\.|action\.|notes\.hint$)/;

const STORY_KEYS = /Umschalt|Leertaste/;
// Known open: the chapter 1 kennel chase teaches its keys in an objective and a toast; story
// objectives and toasts have no touch variant yet (follow-up noted in TASK-084).
const STORY_OPEN = [
  'Die Kaskade hinunter! Springt einer, weich aus [Leertaste]',
  'Aufstehen: [Leertaste]. Rennen: [Umschalt]. Duckt sich ein Hund zum Sprung: [Leertaste] zur Seite.',
];

describe('touch wording for lines that name keys', () => {
  it('tInput picks the .touch variant in touch mode and falls back to the keyboard text', () => {
    expect(tInput('court.hint.how.running', false)).toBe(t('court.hint.how.running'));
    expect(tInput('court.hint.how.running', true)).toBe(t('court.hint.how.running.touch'));
    expect(tInput('court.hint.how.staff', true)).toBe(t('court.hint.how.staff'));
  });

  it('the court hint and the Laufschritt tip name the stick, not the Shift key, on touch', () => {
    for (const s of [t('court.hint.how.running.touch'), TRAVEL_DE.sprintTouch]) {
      expect(s).toMatch(/Bewegungsregler/);
      expect(s).not.toMatch(KEY_WORDS);
    }
    // desktop wording unchanged
    expect(t('court.hint.how.running')).toMatch(/Umschalttaste/);
    expect(TRAVEL_DE.sprint).toMatch(/Umschalttaste/);
  });

  it('every registered string naming Shift has a touch variant', () => {
    // string tables: de.ts, de.content.ts and every system's addStrings('de', { 'id': '…' })
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const table: Record<string, string> = { ...de, ...deContent };
    const entry = /^\s*'([\w.-]+)':\s*'((?:[^'\\]|\\.)*)',?\s*$/;
    for (const f of files(join(__dirname, '../src'))) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const m = entry.exec(line);
        if (m) table[m[1]!] ??= m[2]!;
      }
    }
    const missing = Object.entries(table)
      .filter(([k, v]) => !k.endsWith('.touch') && !KEYBOARD_ONLY.test(k) && KEY_WORDS.test(v) && !(`${k}.touch` in table))
      .map(([k]) => k);
    expect(missing).toEqual([]);
    const travel = TRAVEL_DE as unknown as Record<string, unknown>;
    const travelMissing = Object.entries(travel)
      .filter(([k, v]) => typeof v === 'string' && !k.endsWith('Touch') && KEY_WORDS.test(v) && typeof travel[`${k}Touch`] !== 'string')
      .map(([k]) => k);
    expect(travelMissing).toEqual([]);
  });

  it('story objectives and toasts do not tell the player to hold the Shift key', () => {
    const dir = join(__dirname, '../content/story');
    const hits: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.story.json'))) {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== 'object') return;
        const o = n as Record<string, unknown>;
        if ((o.do === 'objective' || o.do === 'toast') && typeof o.text === 'string' && STORY_KEYS.test(o.text) && !STORY_OPEN.some((p) => o.text === p)) hits.push(`${f}: ${o.text}`);
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    }
    expect(hits).toEqual([]);
  });
});
