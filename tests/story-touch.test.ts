/**
 * Touch wording for story prompts (kq-mobile phone tests): a prompt whose text names the mouse or
 * keys carries a `touch` text (shown in touch mode, read at render time), short enough for the
 * Aktion button. The validator checks the field.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Action, PromptAction, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOUR = JSON.parse(readFileSync(`${ROOT}content/story/00-tour.story.json`, 'utf8')) as StoryFile;

/** Every action anywhere in a story file (enter / exit / reactions / choice options). */
function actions(f: StoryFile): Action[] {
  const out: Action[] = [];
  const walk = (list: Action[] | undefined) => {
    for (const a of list ?? []) {
      out.push(a);
      if (a.do === 'choice') for (const o of a.options) walk(o.then);
    }
  };
  for (const r of f.on ?? []) walk(r.do);
  for (const b of f.beats) {
    walk(b.enter);
    walk(b.exit);
    for (const r of b.on ?? []) walk(r.do);
  }
  return out;
}

const DESKTOP = /\b(Maus|Maustaste|LMB|RMB|Leertaste|Shift|klicken|Klick)\b|\b[A-Z]: |\(in der Luft: F/;

describe('story prompts on a touch screen', () => {
  const prompts = actions(TOUR).filter((a): a is PromptAction => a.do === 'prompt' && !!a.text);

  it('every tour prompt that names mouse or keys has a short touch text without them', () => {
    const desktop = prompts.filter((p) => p.key || DESKTOP.test(p.text!));
    expect(desktop.length).toBeGreaterThanOrEqual(4);
    for (const p of desktop) {
      expect(p.touch, p.text!).toBeTruthy();
      expect(p.touch!).not.toMatch(DESKTOP);
      expect(p.touch!.length, p.touch).toBeLessThanOrEqual(22);
    }
  });

  it('the first prompt (walking) speaks of swiping on touch', () => {
    const first = prompts.find((p) => p.key === 'W A S D')!;
    expect(first.touch).toBe('Wischen: Schauen');
  });

  it('tells touch players to move the stick all the way forward to sprint', () => {
    expect(prompts.find((p) => p.key === 'Umschalt')?.touch).toBe('Zum Rennen ganz vor');
  });

  it('first sends touch players to the Fotomodus button during the deer encounter', () => {
    expect(prompts.find((p) => p.key === 'N')?.touch).toBe('Fotomodus öffnen');
  });

  it('validator: touch must be a text, a long one warns', () => {
    const file = (touch: unknown): StoryFile =>
      ({ chapter: 'c', order: 0, title_de: 'C', start: 'b', beats: [{ id: 'b', enter: [{ do: 'prompt', key: 'E', text: 'Lauschen', touch }], complete: { manual: true } }] }) as unknown as StoryFile;
    const ok = validateStories([{ file: 'c.story.json', story: file('Lauschen') }]);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);
    expect(validateStories([{ file: 'c.story.json', story: file(3) }]).errors.map((e) => e.message).join()).toMatch(/touch must be a text/);
    expect(validateStories([{ file: 'c.story.json', story: file('Ein viel zu langer Hinweis für den Knopf') }]).warnings.map((e) => e.message).join()).toMatch(/Aktion button/);
  });
});
