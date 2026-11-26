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

const promptFields = new Set(['key', 'text', 'touch']);
const withoutParams = (text: string) => text.replace(/\{\w+\}/g, '');

function contentLeftovers(text: unknown, file: string, path: string[] = []): string[] {
  if (typeof text === 'string') {
    const field = `${file}#${path.join('.')}`;
    return retiredSurveyor.test(text) && !fictionAllowlist.has(field) ? [field] : [];
  }
  if (Array.isArray(text)) return text.flatMap((entry) => contentLeftovers(entry, file, path));
  if (!text || typeof text !== 'object') return [];
  if ('id' in text && typeof text.id === 'string') path = [text.id];
  const isPrompt = 'do' in text && text.do === 'prompt';
  return Object.entries(text).flatMap(([key, value]) => {
    const field = [...path, key];
    if (isPrompt && promptFields.has(key) && typeof value === 'string' && englishUi.test(withoutParams(value))) {
      return [`${file}#${field.join('.')}`];
    }
    return contentLeftovers(value, file, field);
  });
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
        const text = withoutParams(value);
        return englishUi.test(text) || (retiredSurveyor.test(text) && !fictionAllowlist.has(key))
          ? [`${key}: ${value}`]
          : [];
      }),
    );
    expect(offending).toEqual([]);
  });

  it('checks authored prompts for English UI words and preserves allowed fictional surveyor terms', () => {
    const content = import.meta.glob<unknown>('/content/{packs,quests,story}/*.json', { eager: true, import: 'default' });
    expect(Object.entries(content).flatMap(([file, data]) => contentLeftovers(data, file))).toEqual([]);
  });

  it('flags English in each displayed prompt field and ignores internal action IDs', () => {
    const data = { id: 'sprint', enter: [
      { do: 'prompt', key: 'Shift', text: 'Zum Rennen Shift halten', touch: 'Stick ganz vor' },
      { do: 'shift', to: '1789' },
    ] };
    expect(contentLeftovers(data, 'tour.json')).toEqual(['key', 'text', 'touch'].map((field) => `tour.json#sprint.enter.${field}`));
  });

  it('describes holding Q to return without stating a duration', () => {
    for (const key of ['ui.keys.shift', 'ui.tip.20']) {
      expect(i18n.t(key)).toMatch(/\bQ\]? gedrückt halten\b/);
      expect(i18n.t(key)).not.toMatch(/Sekunden|\b\d+\s*s\b/i);
    }
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

describe('missing-key fallback callers', () => {
  it('lets Laub skip a skill level without a line instead of saying the placeholder', async () => {
    const { laubLine } = await import('../src/systems/skills/index');
    const emit = vi.fn();
    const ctx = {
      state: { state: { flags: { 'story.laub': true }, systems: {} } },
      t: i18n.t,
      events: { emit },
    } as unknown as Parameters<typeof laubLine>[0];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      laubLine(ctx, 'roentgen', 2);
      expect(emit).not.toHaveBeenCalled();
      laubLine(ctx, 'roentgen', 1);
      expect(emit).toHaveBeenCalledExactlyOnceWith('dialogue:say', expect.objectContaining({ speaker: 'laub', id: 'laub.skill.roentgen.1', text: i18n.t('skills.laub.roentgen.1') }));
      expect(emit.mock.calls[0]![1].text).not.toBe('Text nicht verfügbar');
    } finally {
      warn.mockRestore();
    }
  });
});
