import { describe, expect, it, vi } from 'vitest';
import * as i18n from '../src/i18n';
import { de } from '../src/i18n/de';
import { deContent } from '../src/i18n/de.content';
import { REBINDABLE } from '../src/player/input';
import { SYSTEM_LOADERS } from '../src/systems';
import { TRAVEL_DE } from '../src/systems/travel/strings';

const englishUi = /(?<!\p{L})(?:build|cancel|close|continue|cooldown|debug|failed|loading|loot|mouse|quickslot|respawn|save|settings|shift|skip|slot|stick|tracker|unknown)(?!\p{L})/iu;
const retiredSurveyor = /Feldbuch|Feldstation|Laterne\s+entzünden|Vermess(?:er|ungspunkt)/iu;

// Exemptions must name a specific key or content field and explain its in-world use.
const fictionAllowlist = new Set([
  '/content/packs/enden.pack.json#epilog.intro.keep.text_de', // Laub's physical field book.
  '/content/story/05-enden.story.json#epilogue.intro.keep', // The same object in the epilogue.
  '/content/story/04-kapitel-4.story.json#laub.k4.x.luecken.text', // Laub is talking about his book.
]);

function surveyorLeftovers(text: unknown, file: string, path: string[] = []): string[] {
  if (typeof text === 'string') {
    const field = `${file}#${path.join('.')}`;
    return retiredSurveyor.test(text) && !fictionAllowlist.has(field) ? [field] : [];
  }
  if (Array.isArray(text)) return text.flatMap((entry) => surveyorLeftovers(entry, file, path));
  if (!text || typeof text !== 'object') return [];
  if ('id' in text && typeof text.id === 'string') path = [text.id];
  return Object.entries(text).flatMap(([key, value]) => surveyorLeftovers(value, file, [...path, key]));
}

describe('German player-facing text', () => {
  it('keeps English UI words and retired surveyor terms out of registered translations', async () => {
    const registrations = vi.spyOn(i18n, 'addStrings');
    let featureTables: Record<string, string>[];
    try {
      await import('../src/ui/touch');
      for (const load of SYSTEM_LOADERS) await load();
      featureTables = registrations.mock.calls.map(([, table]) => table);
    } finally {
      registrations.mockRestore();
    }
    expect(featureTables).toContainEqual(expect.objectContaining({ 'story.echo.date': 'Erinnerung · {when}' }));

    // Travel keeps a non-registered table and formats some labels with runtime values.
    const travel = {
      ...Object.fromEntries(Object.entries(TRAVEL_DE).filter(([, value]) => typeof value === 'string')),
      ...TRAVEL_DE.block,
      activated: TRAVEL_DE.activated('Ehrenhof'),
      announced: TRAVEL_DE.announced('Ehrenhof'),
      unknownOne: TRAVEL_DE.unknown(1),
      unknownMany: TRAVEL_DE.unknown(2),
    };

    const offending = [de, deContent, ...featureTables, travel].flatMap((table) =>
      Object.entries(table).flatMap(([key, value]) => {
        const text = value.replace(/\{\w+\}/g, '');
        return englishUi.test(text) || (retiredSurveyor.test(text) && !fictionAllowlist.has(key))
          ? [`${key}: ${value}`]
          : [];
      }),
    );
    expect(offending).toEqual([]);
  });

  it('preserves the explicitly allowed story uses of retired surveyor terms', () => {
    const content = import.meta.glob<unknown>('/content/{packs,quests,story}/*.json', { eager: true, import: 'default' });
    expect(Object.entries(content).flatMap(([file, data]) => surveyorLeftovers(data, file))).toEqual([]);
  });

  it('labels all rebindable controls and shows a German fallback for an absent key', () => {
    expect(REBINDABLE.filter((action) => !i18n.hasString(`action.${action}`))).toEqual([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(i18n.t('test.missingText')).toBe('Text nicht verfügbar');
      expect(i18n.t('test.missingText')).toBe('Text nicht verfügbar');
      expect(warn).toHaveBeenCalledExactlyOnceWith("[i18n] missing string 'test.missingText'");
    } finally {
      warn.mockRestore();
    }
  });
});
