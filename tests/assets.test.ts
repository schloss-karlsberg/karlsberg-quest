import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS } from '../src/assets/manifest';
import { ASSET_BUDGET, type LicencesFile, checkManifest } from '../src/assets/types';

const ROOT = path.resolve(__dirname, '../public/assets');
const licences = JSON.parse(fs.readFileSync(path.join(ROOT, 'LICENSES.json'), 'utf8')) as LicencesFile;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

describe('asset manifest (CC0 pipeline)', () => {
  it('every entry has a CC0 licence record from an allowed site', () => {
    expect(checkManifest(ASSETS, licences)).toEqual([]);
  });

  it('every entry points at an existing file with the recorded size', () => {
    for (const e of ASSETS) {
      const f = path.join(ROOT, e.url);
      expect(fs.existsSync(f), e.url).toBe(true);
      expect(fs.statSync(f).size, `${e.id} bytes`).toBe(e.bytes);
    }
  });

  it('every art file in public/assets is listed in LICENSES.json (decoders under libs/ excepted)', () => {
    const listed = new Set(licences.assets.flatMap((r) => r.files));
    const libs = new Set((licences.libraries ?? []).flatMap((l) => l.files));
    for (const abs of walk(ROOT)) {
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (rel === 'LICENSES.json' || rel.endsWith('.md') || rel.endsWith('.gitkeep')) continue;
      if (rel.startsWith('libs/')) expect(libs.has(rel), rel).toBe(true);
      else expect(listed.has(rel), `${rel} has no licence record`).toBe(true);
    }
  });

  it.each(['palace-plateau', 'castle-understory'])('credits the procedural %s geometry as own-work CC0', (id) => {
    const source = `src/systems/scenery/${id}.ts`;
    expect(licences.procedural).toContainEqual(expect.objectContaining({
      name: expect.stringContaining('FIKTION'),
      author: 'Karlsberg Quest',
      licence: 'CC0-1.0',
      source,
    }));
    expect(fs.existsSync(path.resolve(ROOT, '../..', source))).toBe(true);
  });

  it('stays inside the download budgets (whole folder, first playable load)', () => {
    const total = walk(ROOT).reduce((s, f) => s + fs.statSync(f).size, 0);
    expect(total).toBeLessThan(ASSET_BUDGET.total);
    const core = ASSETS.filter((e) => e.area === 'core').reduce((s, e) => s + e.bytes, 0);
    expect(core).toBeLessThan(ASSET_BUDGET.core);
  });

  it('textures are browser formats (webp / ktx2), models are GLB', () => {
    for (const e of ASSETS) {
      if (e.kind === 'model') expect(e.url).toMatch(/\.glb$/);
      else expect(e.url).toMatch(/\.(webp|ktx2|png|jpg)$/);
    }
  });

  it('checkManifest catches missing records, foreign licences and bad sources', () => {
    const bad = checkManifest(
      [{ id: 'x.y', kind: 'texture', url: 'textures/x.webp', area: 'core', bytes: 1, licence: 'nope' }],
      { policy: '', assets: [{ id: 'r', name: 'R', author: 'A', source: 'https://example.com/r', licence: 'CC-BY-4.0', files: [], retrieved: '2026-01-01' }] },
    );
    expect(bad.join('\n')).toMatch(/texture options missing/);
    expect(bad.join('\n')).toMatch(/licence record 'nope' missing/);
    expect(bad.join('\n')).toMatch(/not an allowed site/);
    expect(bad.join('\n')).toMatch(/CC-BY-4.0 is not CC0/);
  });
});
