import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALWAYS_SPECS, AREA_RULES, FULL_LABEL, FULL_ONLY_SPECS, QUICK_SPECS } from '../scripts/ci/e2e-areas';
import { SPEC_MINUTES } from '../scripts/ci/e2e-minutes';
import { specTimings, toTsv } from '../scripts/ci/e2e-timings';
import { findRule, globToRegExp, planSelection, relativeImports, selectE2e, specsImporting, type RepoView } from '../scripts/ci/select-e2e';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A made-up checkout: spec and helper sources by path. */
function fakeRepo(files: Record<string, string>): RepoView {
  const specs = Object.keys(files).flatMap((path) => /^e2e\/([^/]+)\.spec\.ts$/.exec(path)?.[1] ?? []).sort();
  return { specs, read: (path) => files[path] ?? null };
}

const repo = fakeRepo({
  'e2e/smoke.spec.ts': `import { ready } from './helpers/common';`,
  'e2e/minimap.spec.ts': `import { openPause } from './helpers/pause';`,
  'e2e/photo.spec.ts': `import { ready } from './helpers/common';\nimport { openPause } from './helpers/pause';`,
  'e2e/quelle.spec.ts': `import { ready } from './helpers/common';\nimport { TROUGH } from '../src/systems/quelle/layout';`,
  'e2e/fx.spec.ts': '',
  'e2e/skills.spec.ts': '',
  'e2e/animals.spec.ts': '',
  'e2e/tour-slice.spec.ts': '',
  'e2e/touch.spec.ts': '',
  'e2e/campaign.spec.ts': `import { walkTour } from './helpers/tour';`,
  'e2e/helpers/common.ts': `import { slotDir } from '../../scripts/dev/heavy-env.mjs';`,
  'e2e/helpers/pause.ts': `import { ready } from './common';`,
  'e2e/helpers/tour.ts': `import { openPause } from './pause';`,
  'e2e/helpers/unused.ts': '',
  'src/systems/quelle/layout.ts': `import { ERA } from './eras';`,
  'src/systems/quelle/eras.ts': '',
  'scripts/dev/heavy-env.mjs': '',
});

const pr = (changed: string[] | null, labels: string[] = []) => selectE2e({ event: 'pull_request', changed, labels, repo });

describe('glob matching', () => {
  it('keeps * inside a path segment and lets ** cross directories', () => {
    expect(globToRegExp('docs/**').test('docs/design/tour/README.md')).toBe(true);
    expect(globToRegExp('docs/**').test('src/docs/x.ts')).toBe(false);
    expect(globToRegExp('**/*.md').test('README.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('content/story/README.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('src/ui/md.ts')).toBe(false);
    expect(globToRegExp('content/story/01-*').test('content/story/01-kapitel-1.story.json')).toBe(true);
    expect(globToRegExp('content/story/01-*').test('content/story/01-x/deep.json')).toBe(false);
    expect(globToRegExp('scripts/dev/heavy-env.*').test('scripts/dev/heavy-env.d.mts')).toBe(true);
    expect(globToRegExp('src/boot.ts').test('src/bootXts')).toBe(false);
  });
});

describe('e2e selection for a pull request', () => {
  it('runs nothing for docs, task files and unit tests', () => {
    const selection = pr(['.mc/tasks/todo/TASK-094-x.md', 'docs/PRD.md', 'CONTRIBUTING.md', 'tests/photo.test.ts', '.github/workflows/pages.yml']);
    expect(selection).toMatchObject({ mode: 'none', specs: [] });
    expect(selection.rows.map((row) => row.run)).toEqual(['none', 'none', 'none', 'none', 'none']);
    expect(pr([])).toMatchObject({ mode: 'none' });
  });

  it('runs the specs of the changed area plus smoke', () => {
    const selection = pr(['docs/PRD.md', 'src/systems/ambience/index.ts', 'tests/ambience.test.ts']);
    expect(selection).toMatchObject({ mode: 'selected', specs: ['fx', 'skills', 'smoke'] });
    expect(pr(['src/systems/minimap/draw.ts', 'src/systems/photo/data.ts']).specs)
      .toEqual(['animals', 'minimap', 'photo', 'smoke', 'touch', 'tour-slice']);
  });

  it('runs the full suite for shared code, the workflow, unmapped paths and the label', () => {
    for (const path of [
      'src/boot.ts', 'src/core/save.ts', 'src/player/player.ts', 'src/render/quality.ts', 'src/debug/hooks.ts', 'src/world/terrain.ts',
      'scripts/content-build/kapitel1.mjs', 'playwright.config.ts', '.github/workflows/e2e.yml', 'scripts/ci/e2e-areas.ts',
      'scripts/dev/plan-e2e-shards.ts', 'scripts/dev/heavy-env.mjs', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'index.html',
      'src/systems/brand-new/index.ts', 'some/new/place.ts',
    ]) {
      expect(pr(['docs/PRD.md', path, 'src/systems/minimap/draw.ts']), path).toMatchObject({ mode: 'full', specs: [] });
    }
    expect(pr(['src/boot.ts']).reason).toContain('src/boot.ts');
    expect(pr(['some/new/place.ts']).rows[0].why).toContain('e2e-areas.ts');
    expect(pr(['docs/PRD.md'], [FULL_LABEL])).toMatchObject({ mode: 'full' });
    expect(pr(null)).toMatchObject({ mode: 'full' });
  });

  it('runs a cross-section for shared code only when the repository opts in', () => {
    const quick = (changed: string[], labels: string[] = []) => selectE2e({ event: 'pull_request', changed, labels, sharedCode: 'quick', repo });
    const selection = quick(['src/boot.ts', 'src/systems/ambience/index.ts']);
    // The fake checkout has five of the cross-section's specs; fx comes from the ambience rule.
    expect(selection).toMatchObject({ mode: 'selected', specs: ['fx', 'minimap', 'photo', 'skills', 'smoke', 'tour-slice'] });
    expect(selection.reason).toContain('src/boot.ts');
    expect(selection.rows[0]).toMatchObject({ path: 'src/boot.ts', run: 'full' });
    expect(quick(['some/new/place.ts']).mode).toBe('selected');
    expect(quick(['docs/PRD.md'])).toMatchObject({ mode: 'none' });
    expect(quick(['src/boot.ts'], [FULL_LABEL])).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'pull_request', changed: null, sharedCode: 'quick', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'pull_request', changed: ['src/boot.ts'], sharedCode: 'anything else', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'merge_group', sharedCode: 'quick', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'push', sharedCode: 'quick', repo })).toMatchObject({ mode: 'full' });
  });

  it('keeps a bundled Markdown file out of the docs rule', () => {
    // The fake checkout has no accessibility spec: a path of the game still runs smoke.
    expect(pr(['content/release-notes/v0.9.0.md'])).toMatchObject({ mode: 'selected', specs: ['smoke'] });
    expect(pr(['content/bible/01-prolog.md']).mode).toBe('none');
  });

  it('selects a changed spec, and for a helper every spec that imports it', () => {
    expect(pr(['e2e/minimap.spec.ts']).specs).toEqual(['minimap', 'smoke']);
    expect(specsImporting('e2e/helpers/pause.ts', repo)).toEqual(['campaign', 'minimap', 'photo']);
    expect(pr(['e2e/helpers/pause.ts']).specs).toEqual(['campaign', 'minimap', 'photo', 'smoke']);
    expect(pr(['e2e/helpers/tour.ts']).specs).toEqual(['campaign', 'smoke']);
    expect(pr(['e2e/helpers/unused.ts'])).toMatchObject({ mode: 'none' });
    expect(pr(['e2e/removed.spec.ts'])).toMatchObject({ mode: 'none' });
    expect(pr(['e2e/helpers/removed.ts'])).toMatchObject({ mode: 'full' });
    expect(pr(['e2e/gpu/look.gpu.ts', 'e2e/mobile/tour.pw.ts'])).toMatchObject({ mode: 'none' });
    expect(pr(['e2e/fixtures/save.json'])).toMatchObject({ mode: 'full' });
  });

  it('adds the specs that import a changed game module', () => {
    expect(specsImporting('src/systems/quelle/eras.ts', repo)).toEqual(['quelle']);
    expect(pr(['src/systems/minimap/draw.ts']).specs).toEqual(['minimap', 'smoke']);
    // No rule lists `quelle` for the minimap; this fake spec imports the file.
    const importing = fakeRepo({
      'e2e/smoke.spec.ts': '', 'e2e/minimap.spec.ts': '', 'e2e/fx.spec.ts': '', 'e2e/skills.spec.ts': '', 'e2e/photo.spec.ts': '',
      'e2e/quelle.spec.ts': `import '../src/systems/minimap/draw';`,
      'src/systems/minimap/draw.ts': '',
    });
    expect(selectE2e({ event: 'pull_request', changed: ['src/systems/minimap/draw.ts'], repo: importing }).specs).toEqual(['minimap', 'quelle', 'smoke']);
  });

  it('turns a selection that covers most of the suite into a full run', () => {
    // helpers/common reaches 5 of the 10 fake specs: still a selection.
    expect(pr(['e2e/helpers/common.ts']).mode).toBe('selected');
    const small = fakeRepo({ 'e2e/smoke.spec.ts': `import './helpers/common';`, 'e2e/photo.spec.ts': `import './helpers/common';`, 'e2e/helpers/common.ts': '' });
    expect(selectE2e({ event: 'pull_request', changed: ['e2e/helpers/common.ts'], repo: small })).toMatchObject({ mode: 'full', specs: [] });
  });

  it('reads imports written in the usual forms', () => {
    const source = [
      `import a from './a';`, `import type { T } from './types';`, `import { type U, b } from "../b";`, `export { c } from './c.ts';`,
      `export type { V } from './more-types';`, `const d = await import('./d');`, `import './e';`, `import x from 'vitest';`,
      `import {\n  f,\n  g,\n} from './f';`,
    ].join('\n');
    expect(relativeImports('e2e/helpers/k1.ts', source))
      .toEqual(['e2e/helpers/a', 'e2e/b', 'e2e/helpers/c.ts', 'e2e/helpers/d', 'e2e/helpers/e', 'e2e/helpers/f']);
  });
});

describe('e2e selection for the other events', () => {
  it('runs the full suite in the merge queue, on main and for a manual run without specs', () => {
    expect(selectE2e({ event: 'merge_group', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'push', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'workflow_dispatch', requested: '  ', repo })).toMatchObject({ mode: 'full' });
    expect(selectE2e({ event: 'schedule', repo })).toMatchObject({ mode: 'full' });
    // Changed paths and labels only count for pull requests.
    expect(selectE2e({ event: 'push', changed: ['docs/PRD.md'], repo })).toMatchObject({ mode: 'full' });
  });

  it('skips a push whose commit already passed the full suite', () => {
    const selection = selectE2e({ event: 'push', verifiedBy: 'https://example.invalid/runs/1', repo });
    expect(selection).toMatchObject({ mode: 'none', specs: [] });
    expect(selection.reason).toContain('https://example.invalid/runs/1');
  });

  it('runs exactly the requested specs for a manual selection', () => {
    expect(selectE2e({ event: 'workflow_dispatch', requested: ' photo  e2e/minimap.spec.ts photo ', repo }))
      .toMatchObject({ mode: 'selected', specs: ['minimap', 'photo'] });
    expect(() => selectE2e({ event: 'workflow_dispatch', requested: 'nope', repo })).toThrow('Unknown e2e spec "nope".');
  });
});

describe('shard plan of a selection', () => {
  const minutes = (selection: ReturnType<typeof pr>, shardMinutes = 8) => planSelection(selection, repo, { shardMinutes });

  it('sizes a selected run by its work and gives the full suite every allowed shard', () => {
    expect(minutes(pr(['docs/PRD.md']))).toEqual([]);
    const small = minutes(pr(['src/systems/minimap/draw.ts']));
    expect(small.map((shard) => shard.specs)).toEqual(['smoke.spec.ts', 'minimap.spec.ts']);
    const full = planSelection(pr(['src/boot.ts']), repo, { maxShards: 4, shardMinutes: 8 });
    expect(full).toHaveLength(4);
    expect(full[0]).toMatchObject({ specs: 'campaign.spec.ts', campaign: true });
  });
});

// --- The rules against the real repository ---------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    // `worktrees`: agent checkouts below .claude/ are other copies of the repository.
    if (['node_modules', 'dist', '.git', 'test-results', 'worktrees'].includes(entry.name)) continue;
    const path = dir ? posix.join(dir, entry.name) : entry.name;
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe('scripts/ci/e2e-areas.ts against the repository', () => {
  const files = walk('');
  const present = new Set(files);
  const specs = files.flatMap((path) => /^e2e\/([^/]+)\.spec\.ts$/.exec(path)?.[1] ?? []);
  const listed = AREA_RULES.flatMap((rule) => (typeof rule.run === 'string' ? [] : rule.run));
  const source = (path: string) => readFileSync(join(root, path), 'utf8');

  it('names only specs that exist, and never the campaign', () => {
    expect(specs.length).toBeGreaterThan(40);
    expect([...new Set(listed)].filter((name) => !specs.includes(name))).toEqual([]);
    expect([...ALWAYS_SPECS, ...FULL_ONLY_SPECS, ...QUICK_SPECS].filter((name) => !specs.includes(name))).toEqual([]);
    expect([...listed, ...QUICK_SPECS].filter((name) => FULL_ONLY_SPECS.includes(name))).toEqual([]);
  });

  it('reaches every spec from at least one rule', () => {
    const reachable = new Set([...listed, ...ALWAYS_SPECS, ...FULL_ONLY_SPECS]);
    expect(specs.filter((name) => !reachable.has(name))).toEqual([]);
  });

  it('has no glob that matches nothing', () => {
    const stale = AREA_RULES.flatMap((rule) => rule.paths).filter((glob) => {
      const pattern = globToRegExp(glob);
      return !files.some((path) => pattern.test(path));
    });
    expect(stale).toEqual([]);
  });

  it('has a rule for every file of the game', () => {
    const unmapped = files.filter((path) => path.startsWith('src/') && !findRule(path));
    expect(unmapped, 'Add a rule for these paths to scripts/ci/e2e-areas.ts: the specs that cover them, or "full".').toEqual([]);
  });

  it('treats nothing that the game, its build or the hosted specs load as "none"', () => {
    const isNone = (path: string) => findRule(path)?.run === 'none';
    const loaded = new Set<string>(files.filter((path) => path.startsWith('public/')));
    const code = files.filter((path) => /\.(ts|mts|mjs)$/.test(path)
      && (path.startsWith('src/') || /^e2e\/[^/]+\.spec\.ts$/.test(path) || path.startsWith('e2e/helpers/') || ['vite.config.ts', 'playwright.config.ts'].includes(path)));
    const queue = [...code];
    const seen = new Set<string>();
    for (let path = queue.pop(); path; path = queue.pop()) {
      if (seen.has(path)) continue;
      seen.add(path);
      loaded.add(path);
      if (!/\.(ts|mts|mjs)$/.test(path)) continue;
      const text = source(path);
      for (const imported of relativeImports(path, text)) {
        const hit = [imported, `${imported}.ts`, `${imported}/index.ts`].find((candidate) => present.has(candidate));
        if (hit) queue.push(hit);
      }
      // import.meta.glob('/content/**/*.pack.json') and friends bundle whole directories.
      for (const match of text.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) {
        const glob = match[1].startsWith('/') ? match[1].slice(1) : posix.normalize(posix.join(posix.dirname(path), match[1]));
        const pattern = globToRegExp(glob);
        for (const file of files) if (pattern.test(file)) queue.push(file);
      }
    }
    expect(loaded.size).toBeGreaterThan(300);
    expect([...loaded].filter(isNone)).toEqual([]);
  });

  it('keeps the timing table in step with the specs', () => {
    expect(Object.keys(SPEC_MINUTES).filter((name) => !specs.includes(name))).toEqual([]);
  });
});

describe('spec timings', () => {
  it('sums a file including retries and names flaky tests', () => {
    const report = {
      suites: [{
        title: 'smoke.spec.ts',
        file: 'smoke.spec.ts',
        specs: [{ title: 'boots', line: 3, tests: [{ status: 'expected', results: [{ duration: 60_000, status: 'passed' }] }] }],
        suites: [{
          title: 'world',
          specs: [
            { title: 'walks | far', line: 9, tests: [{ status: 'flaky', results: [{ duration: 90_000, status: 'failed' }, { duration: 30_000, status: 'passed' }] }] },
            { title: 'skipped', line: 12, tests: [{ status: 'skipped', results: [] }] },
            { title: 'breaks', line: 15, tests: [{ status: 'unexpected', results: [{ duration: 6_000, status: 'failed' }] }] },
          ],
        }],
      }],
    };
    const timings = specTimings(report);
    expect(timings).toEqual([{ spec: 'smoke', minutes: 3.1, tests: 3, failed: 1, flaky: ['walks | far'], slowest: 'walks | far', slowestMinutes: 2 }]);
    expect(toTsv(timings)).toBe('smoke\t3.1\t3\t1\t1\twalks   far\t2\n');
    expect(specTimings({})).toEqual([]);
  });
});
