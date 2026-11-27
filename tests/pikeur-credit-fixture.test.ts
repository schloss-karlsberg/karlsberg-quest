import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPikeurCredit } from '../e2e/helpers/pikeur-credit';
import type { ContentPack } from '../src/content/types';
import { buildContent, clueStatus, type ClueEnv } from '../src/systems/chronik/logic';

function setup() {
  const clues: string[] = [];
  const kq = {
    quests: { offer: vi.fn(), accept: vi.fn() },
    ctx: { state: { mutable: { inventory: { clues } } } },
    story: { goto: vi.fn() },
    setEra: vi.fn(),
    teleport: vi.fn(),
    combat: { god: vi.fn() },
  };
  vi.stubGlobal('window', { kq });
  setupPikeurCredit('q.k2.parforce');
  return { kq, clues };
}

describe('early Pikeur fight browser fixture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('jumps to the dam beat before overriding the chapter checkpoint', () => {
    const { kq } = setup();
    expect(kq.story.goto).toHaveBeenCalledExactlyOnceWith('k2', 'k2_11');
    expect(kq.setEra).toHaveBeenCalledExactlyOnceWith('1793-02');
    expect(kq.teleport).toHaveBeenCalledExactlyOnceWith(842, -878, 270, 0);
    expect(kq.story.goto).toHaveBeenCalledBefore(kq.setEra);
    expect(kq.story.goto).toHaveBeenCalledBefore(kq.teleport);
  });

  it('makes Landremont available and marks the earlier Orangerie echo as heard', () => {
    const { clues: found } = setup();
    const pack = JSON.parse(readFileSync(new URL('../content/packs/kapitel-2.pack.json', import.meta.url), 'utf8')) as ContentPack;
    const { clues } = buildContent([{ pack }]);
    const env: ClueEnv = { found, flags: {}, skills: {}, scanMode: 0, lanternLit: false };
    expect(clueStatus(clues.get('clue.k2.fackeln')!, env)).toBe('found');
    expect(clueStatus(clues.get('clue.k2.landremont')!, env)).toBe('available');
    expect(clueStatus(clues.get('clue.k2.orangerie')!, env)).toBe('found');
  });
});
