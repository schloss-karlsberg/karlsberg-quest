import { describe, expect, it } from 'vitest';
import { planE2eShards } from '../scripts/dev/plan-e2e-shards';

function listedFile(name: string, ...statuses: string[]) {
  return { file: `${name}.spec.ts`, specs: [{ tests: statuses.map((expectedStatus) => ({ expectedStatus })) }] };
}

describe('hosted e2e shard plan', () => {
  it('assigns every file once and spreads long playthroughs across eight shards', () => {
    const long = ['campaign', 'chapter-k1', 'chapter-k2', 'chapter-k3', 'chapter-k4', 'tour-slice', 'walk'];
    const files = [...long, ...Array.from({ length: 50 }, (_, i) => `feature-${i}`)]
      .map((name) => listedFile(name, 'passed', 'passed', 'passed'));

    const { include } = planE2eShards(files, '  ');
    const shards = include.map(({ specs }) => specs.split('\n'));
    expect(shards).toHaveLength(8);
    expect(shards.flat().sort()).toEqual(files.map(({ file }) => file).sort());
    expect(shards.filter((specs) => specs.some((spec) => long.includes(spec.replace('.spec.ts', ''))))).toHaveLength(long.length);
    expect(shards.find((specs) => specs.includes('campaign.spec.ts'))).toEqual(['campaign.spec.ts']);
  });

  it('uses nested runnable counts and still includes files whose tests all skip', () => {
    const files = [listedFile('all-skipped', 'skipped'), listedFile('basic', 'passed'), {
      file: 'with-describe.spec.ts',
      suites: [listedFile('nested', 'passed', 'passed', 'skipped')],
    }];

    expect(planE2eShards(files).include.map(({ specs }) => specs)).toEqual([
      'with-describe.spec.ts', 'basic.spec.ts', 'all-skipped.spec.ts',
    ]);
  });

  it('runs only the exact dispatch selections, deduplicating repeated names', () => {
    const files = ['chapter-k2', 'chapter-k2-extra', 'smoke'].map((name) => listedFile(name, 'passed'));
    expect(planE2eShards(files, ' chapter-k2\tsmoke e2e/smoke.spec.ts ').include).toEqual([
      { shard: 1, specs: 'chapter-k2.spec.ts' },
      { shard: 2, specs: 'smoke.spec.ts' },
    ]);
    expect(() => planE2eShards(files, 'smoke chapter-k')).toThrow('Unknown e2e spec "chapter-k".');
    expect(() => planE2eShards([])).toThrow('Playwright found no spec files.');
  });
});
