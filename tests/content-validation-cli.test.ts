import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

      const first = 'a.pack.json';
      const nested = join('b.pack.json', 'a.pack.json');
      const malformed = join('b.pack.json', 'b.pack.json');
      const last = 'c.pack.json';
      expect(findPacks(content).map((file) => relative(content, file))).toEqual([
        first, nested, malformed, last,
      ]);
      const { packs, parseErrors } = loadPacks(root);
      expect(packs.map(({ file, pack }) => [file, pack.pack])).toEqual([
        [join('content', first), 'first'], [join('content', nested), 'nested'], [join('content', last), 'last'],
      ]);
      expect(validateContent(packs).ok).toBe(true);
      expect(parseErrors).toEqual([expect.stringContaining(`ERROR ${join('content', malformed)}: invalid JSON`)]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('only discovers regular packs and links to regular files', () => {
    const root = mkdtempSync(join(tmpdir(), 'kq-validate-'));
    try {
      const content = join(root, 'content');
      mkdirSync(content);
      mkdirSync(join(content, 'archive'));
      writeFileSync(join(content, 'source.json'), '{"pack":"linked"}');
      execFileSync('mkfifo', [join(content, 'pipe.pack.json')]);
      symlinkSync('archive', join(content, 'archive.pack.json'));
      symlinkSync('missing.json', join(content, 'missing.pack.json'));
      symlinkSync('pipe.pack.json', join(content, 'linked-pipe.pack.json'));
      symlinkSync('source.json', join(content, 'linked.pack.json'));

      expect(findPacks(content)).toEqual([join(content, 'linked.pack.json')]);
      expect(loadPacks(root)).toEqual({
        packs: [{ file: join('content', 'linked.pack.json'), pack: { pack: 'linked' } }],
        parseErrors: [],
      });
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
