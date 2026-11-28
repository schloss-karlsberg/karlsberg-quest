import { describe, expect, it } from 'vitest';
import { SPEC_MINUTES } from '../scripts/ci/e2e-minutes';
import { describeShards, MAX_SHARDS, planE2eShards } from '../scripts/dev/plan-e2e-shards';

function listedFile(name: string, ...statuses: string[]) {
  return { file: `${name}.spec.ts`, specs: [{ tests: statuses.map((expectedStatus) => ({ expectedStatus })) }] };
}

describe('hosted e2e shard plan', () => {
  it('assigns every file once and spreads long playthroughs across the allowed shards', () => {
    const long = ['campaign', 'chapter-k1', 'chapter-k2', 'chapter-k3', 'chapter-k4', 'tour-slice', 'integration'];
    const files = [...long, ...Array.from({ length: 50 }, (_, i) => `feature-${i}`)]
      .map((name) => listedFile(name, 'passed', 'passed', 'passed'));
    const minutes = Object.fromEntries(long.map((name) => [name, 20]));

    for (const maxShards of [undefined, 8, 16]) {
      const { include } = planE2eShards(files, '  ', { maxShards, minutes });
      const shards = include.map(({ specs }) => specs.split('\n'));
      expect(shards).toHaveLength(maxShards ?? MAX_SHARDS);
      expect(shards.flat().sort()).toEqual(files.map(({ file }) => file).sort());
      expect(shards.filter((specs) => specs.some((spec) => long.includes(spec.replace('.spec.ts', ''))))).toHaveLength(long.length);
      expect(include.filter(({ campaign }) => campaign)).toEqual([
        { shard: 1, specs: 'campaign.spec.ts', campaign: true, minutes: 20 },
      ]);
    }
  });

  it('balances shards by measured minutes and counts unmeasured files by their tests', () => {
    const files = [listedFile('slow', 'passed'), listedFile('medium', 'passed'), listedFile('new-a', 'passed', 'passed'), listedFile('new-b', 'passed', 'skipped')];
    const { include } = planE2eShards(files, '', { maxShards: 2, minutes: { slow: 12, medium: 6 } });
    expect(include).toEqual([
      { shard: 1, specs: 'slow.spec.ts', campaign: false, minutes: 12 },
      { shard: 2, specs: 'medium.spec.ts\nnew-a.spec.ts\nnew-b.spec.ts', campaign: false, minutes: 10.5 },
    ]);
  });

  it('sizes a selection by its minutes, never below one shard or above the limit', () => {
    const files = ['a', 'b', 'c', 'd', 'campaign'].map((name) => listedFile(name, 'passed'));
    const minutes = { a: 9, b: 4, c: 3, d: 2, campaign: 30 };
    const plan = (requested: string, shardMinutes: number, maxShards?: number) =>
      planE2eShards(files, requested, { shardMinutes, maxShards, minutes }).include.map(({ specs, minutes: m }) => [specs.replaceAll('.spec.ts', '').replaceAll('\n', ' '), m]);

    expect(plan('b c d', 10)).toEqual([['b c d', 9]]);
    // 18 minutes at 8 per shard would be three shards; the 9-minute file sets the pace instead.
    expect(plan('a b c d', 8)).toEqual([['a', 9], ['b c d', 9]]);
    expect(plan('b c d', 1)).toEqual([['b', 4], ['c', 3], ['d', 2]]);
    expect(plan('b c d', 1, 2)).toEqual([['b', 4], ['c d', 5]]);
    expect(plan('a b campaign', 8)).toEqual([['campaign', 30], ['a', 9], ['b', 4]]);
    expect(plan('campaign', 8)).toEqual([['campaign', 30]]);
    // The full suite ignores the target and uses every allowed shard.
    expect(planE2eShards(files, '', { maxShards: 3, minutes }).include).toHaveLength(3);
  });

  it('does not put low-weight or all-skipped files in the campaign shard', () => {
    const files = [listedFile('campaign', 'passed'), ...Array.from({ length: 17 }, (_, i) => listedFile(`skip-${i}`, 'skipped'))];
    expect(planE2eShards(files).include[0]).toEqual({ shard: 1, specs: 'campaign.spec.ts', campaign: true, minutes: SPEC_MINUTES.campaign });
    expect(planE2eShards(files, 'campaign').include).toEqual([
      { shard: 1, specs: 'campaign.spec.ts', campaign: true, minutes: SPEC_MINUTES.campaign },
    ]);
  });

  it('describes the plan for the run summary', () => {
    const text = describeShards(planE2eShards([listedFile('a', 'passed'), listedFile('b', 'passed')], '', { minutes: { a: 4, b: 2 } }).include);
    expect(text).toContain('**2 shards**, about 6 runner-minutes of tests, longest shard about 4 min');
    expect(text).toContain('| 2 | 2 | b |');
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
    expect(planE2eShards(files, ' chapter-k2\tsmoke e2e/smoke.spec.ts ', { minutes: { 'chapter-k2': 6, smoke: 4 } }).include).toEqual([
      { shard: 1, specs: 'chapter-k2.spec.ts', campaign: false, minutes: 6 },
      { shard: 2, specs: 'smoke.spec.ts', campaign: false, minutes: 4 },
    ]);
    expect(() => planE2eShards(files, 'smoke chapter-k')).toThrow('Unknown e2e spec "chapter-k".');
    expect(() => planE2eShards([])).toThrow('Playwright found no spec files.');
  });
});
