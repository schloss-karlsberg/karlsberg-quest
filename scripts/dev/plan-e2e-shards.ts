import { appendFileSync, readFileSync } from 'node:fs';
import { DEFAULT_TEST_MINUTES, SPEC_MINUTES } from '../ci/e2e-minutes.ts';

type ListedSuite = {
  specs?: { tests: { expectedStatus: string }[] }[];
  suites?: ListedSuite[];
};

export type ListedFile = ListedSuite & { file: string };

export type ShardPlanOptions = {
  /** Upper bound on matrix jobs, including the campaign's own runner. */
  maxShards?: number;
  /** Size the matrix to about this many minutes per shard. Unset: use every allowed shard. */
  shardMinutes?: number;
  /** Measured minutes per spec name (without `.spec.ts`). */
  minutes?: Readonly<Record<string, number>>;
};

export type Shard = { shard: number; specs: string; campaign: boolean; minutes: number };

// The account runs 20 hosted jobs at once (TASK-094). Twelve leaves room for a second run.
export const MAX_SHARDS = 12;
const CAMPAIGN = 'campaign.spec.ts';

function runnableTests(suite: ListedSuite): number {
  const own = (suite.specs ?? []).flatMap((spec) => spec.tests);
  return own.filter((test) => test.expectedStatus !== 'skipped').length
    + (suite.suites ?? []).reduce((total, child) => total + runnableTests(child), 0);
}

export function specName(file: string): string {
  return file.replace(/^e2e\//, '').replace(/\.spec\.ts$/, '');
}

export function planE2eShards(files: ListedFile[], requested = '', options: ShardPlanOptions = {}): { include: Shard[] } {
  if (!files.length) throw new Error('Playwright found no spec files.');

  const minutes = options.minutes ?? SPEC_MINUTES;
  const byName = new Map(files.map((file) => [file.file, file]));
  const names = requested.trim().split(/\s+/).filter(Boolean);
  const selection = new Set(names.map((input) => {
    const name = input.replace(/^e2e\//, '');
    const file = byName.get(name) ?? byName.get(`${name}.spec.ts`);
    if (!file) throw new Error(`Unknown e2e spec ${JSON.stringify(input)}.`);
    return file;
  }));
  const selected = selection.size ? [...selection] : files;
  const estimate = (suite: ListedFile) => {
    const count = runnableTests(suite);
    // A file whose tests all skip still runs, so that Playwright reports the skips.
    return count ? minutes[specName(suite.file)] ?? count * DEFAULT_TEST_MINUTES : 0;
  };
  const campaign = selected.find((suite) => suite.file === CAMPAIGN);
  const weighted = selected.filter((suite) => suite.file !== CAMPAIGN).map((suite) => ({ file: suite.file, weight: estimate(suite) }));
  weighted.sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file, 'en'));

  const maxShards = Math.max(1, Math.floor(options.maxShards ?? MAX_SHARDS));
  const regularSlots = Math.max(1, maxShards - Number(!!campaign));
  const total = weighted.reduce((sum, spec) => sum + spec.weight, 0);
  // The longest file sets the wall time, so no shard needs to be shorter than it.
  const perShard = Math.max(options.shardMinutes ?? 0, weighted[0]?.weight ?? 0);
  const wanted = options.shardMinutes && perShard > 0 ? Math.max(1, Math.ceil(total / perShard)) : regularSlots;
  const shards = Array.from({ length: Math.min(weighted.length, regularSlots, wanted) }, () => ({ files: [] as string[], weight: 0 }));
  for (const spec of weighted) {
    // Assign one file to each shard before adding work to the lightest one.
    const shard = shards.find((candidate) => !candidate.files.length)
      ?? shards.reduce((lightest, candidate) => candidate.weight < lightest.weight ? candidate : lightest);
    shard.files.push(spec.file);
    shard.weight += spec.weight;
  }

  const lists = shards.map((shard) => ({ files: shard.files, weight: shard.weight }));
  if (campaign) lists.unshift({ files: [CAMPAIGN], weight: estimate(campaign) });
  return {
    include: lists.map(({ files: specs, weight }, i) => ({
      shard: i + 1,
      specs: specs.join('\n'),
      campaign: specs[0] === CAMPAIGN,
      minutes: Math.round(weight * 10) / 10,
    })),
  };
}

/** Markdown for the run summary: one row per shard. */
export function describeShards(include: Shard[]): string {
  const total = include.reduce((sum, shard) => sum + shard.minutes, 0);
  const longest = Math.max(...include.map((shard) => shard.minutes));
  return [
    `**${include.length} shard${include.length === 1 ? '' : 's'}**, about ${Math.round(total)} runner-minutes of tests, longest shard about ${Math.round(longest)} min (estimates).`,
    '',
    '| Shard | Est. min | Specs |',
    '| ---: | ---: | --- |',
    ...include.map((shard) => `| ${shard.shard} | ${shard.minutes} | ${shard.specs.split('\n').map(specName).join(' ')} |`),
    '',
  ].join('\n');
}

function positive(value: string | undefined): number | undefined {
  const number = Number(value);
  return value && Number.isFinite(number) && number > 0 ? number : undefined;
}

if (import.meta.main) {
  const report = JSON.parse(readFileSync(0, 'utf8')) as { suites: ListedFile[] };
  const matrix = planE2eShards(report.suites, process.env.KQ_E2E_SPECS, {
    maxShards: positive(process.env.KQ_E2E_MAX_SHARDS),
    shardMinutes: positive(process.env.KQ_E2E_SHARD_MINUTES),
  });
  console.log(`matrix=${JSON.stringify(matrix)}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${describeShards(matrix.include)}\n`);
}
