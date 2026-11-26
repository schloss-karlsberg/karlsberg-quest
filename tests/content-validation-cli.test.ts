import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPacks, gameBounds, loadPacks } from '../scripts/validate-content';
import { validateContent } from '../src/content/validate';

describe('content validation inputs', () => {
  it('loads nested pack files in order, skips directories, and reports malformed JSON by relative path', () => {
    const root = mkdtempSync(join(tmpdir(), 'kq-validate-'));
    try {
      const content = join(root, 'content');
      expect(findPacks(content)).toEqual([]);
      expect(loadPacks(root)).toEqual({ packs: [], parseErrors: [] });
      mkdirSync(join(content, 'b.pack.json'), { recursive: true });
      writeFileSync(join(content, 'c.pack.json'), '{"pack":"last"}');
      writeFileSync(join(content, 'a.pack.json'), '{"pack":"first"}');
      writeFileSync(join(content, 'b.pack.json', 'a.pack.json'), '{"pack":"nested"}');
      writeFileSync(join(content, 'b.pack.json', 'b.pack.json'), '{');
      writeFileSync(join(content, 'unrelated.json'), '{');

      expect(findPacks(content).map((file) => relative(content, file))).toEqual([
        'a.pack.json', 'b.pack.json/a.pack.json', 'b.pack.json/b.pack.json', 'c.pack.json',
      ]);
      const { packs, parseErrors } = loadPacks(root);
      expect(packs.map(({ file, pack }) => [file, pack.pack])).toEqual([
        ['content/a.pack.json', 'first'], ['content/b.pack.json/a.pack.json', 'nested'], ['content/c.pack.json', 'last'],
      ]);
      expect(validateContent(packs).ok).toBe(true);
      expect(parseErrors).toHaveLength(1);
      expect(parseErrors[0]).toMatch(/^ERROR content\/b\.pack\.json\/b\.pack\.json: invalid JSON/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses local terrain margins when available and allows a content-only checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'kq-validate-'));
    try {
      expect(gameBounds(root)).toBeUndefined();
      const terrain = join(root, 'public/data/terrain');
      const extentLocal = { x0: -10, z0: -20, x1: 10, z1: 20 };
      mkdirSync(terrain, { recursive: true });
      writeFileSync(join(terrain, 'meta.json'), JSON.stringify({ extentLocal }));
      expect(gameBounds(root)).toEqual(extentLocal);
      const pack = {
        pack: 'bounds',
        clues: [
          { id: 'edge', title_de: 'Grenze', kind: 'object' as const, where: { x: 10, z: -20, era: 'today' as const, radius: 1 }, reveals: {} },
          { id: 'outside', title_de: 'Außen', kind: 'object' as const, where: { x: 11, z: -20, era: 'today' as const, radius: 1 }, reveals: {} },
        ],
      };
      const result = validateContent([{ file: 'bounds.pack.json', pack }], { bounds: gameBounds(root) });
      expect(result.errors).toEqual([expect.objectContaining({ id: 'outside', message: expect.stringContaining('outside the game area') })]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
