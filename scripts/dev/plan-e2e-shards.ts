import { readFileSync } from 'node:fs';

type ListedSuite = {
  specs?: { tests: { expectedStatus: string }[] }[];
  suites?: ListedSuite[];
};

type ListedFile = ListedSuite & { file: string };

const MAX_SHARDS = 8;

// One unit per runnable test, plus an estimate for the extra steps, loads and screenshots in
// longer playthroughs. Update these estimates using hosted durations once they are available.
const extraWork = new Map([
  ['campaign.spec.ts', 46],
  ['chapter-k1.spec.ts', 16],
  ['chapter-k2.spec.ts', 14],
  ['chapter-k3.spec.ts', 17],
  ['chapter-k4.spec.ts', 13],
  ['integration.spec.ts', 6],
  ['tour-slice.spec.ts', 12],
  ['walk.spec.ts', 8],
]);

function runnableTests(suite: ListedSuite): number {
  const own = (suite.specs ?? []).flatMap((spec) => spec.tests);
  return own.filter((test) => test.expectedStatus !== 'skipped').length
    + (suite.suites ?? []).reduce((total, child) => total + runnableTests(child), 0);
}

export function planE2eShards(files: ListedFile[], requested = '') {
  if (!files.length) throw new Error('Playwright found no spec files.');

  const byName = new Map(files.map((file) => [file.file, file]));
  const names = requested.trim().split(/\s+/).filter(Boolean);
  const selection = new Set(names.map((input) => {
    const name = input.replace(/^e2e\//, '');
    const file = byName.get(name) ?? byName.get(`${name}.spec.ts`);
    if (!file) throw new Error(`Unknown e2e spec ${JSON.stringify(input)}.`);
    return file;
  }));
  const weighted = (selection.size ? [...selection] : files).map((suite) => {
    const count = runnableTests(suite);
    return { file: suite.file, weight: count ? count + (extraWork.get(suite.file) ?? 0) : 0 };
  });
  weighted.sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file, 'en'));

  const shards = Array.from({ length: Math.min(weighted.length, MAX_SHARDS) }, () => ({ files: [] as string[], weight: 0 }));
  for (const spec of weighted) {
    // Assign one file to each shard before adding work to the lightest one.
    const shard = shards.find((candidate) => !candidate.files.length)
      ?? shards.reduce((lightest, candidate) => candidate.weight < lightest.weight ? candidate : lightest);
    shard.files.push(spec.file);
    shard.weight += spec.weight;
  }

  return { include: shards.map(({ files: specs }, i) => ({ shard: i + 1, specs: specs.join('\n') })) };
}

if (import.meta.main) {
  const report = JSON.parse(readFileSync(0, 'utf8')) as { suites: ListedFile[] };
  const matrix = planE2eShards(report.suites, process.env.KQ_E2E_SPECS);
  console.log(`matrix=${JSON.stringify(matrix)}`);
}
