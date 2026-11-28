/**
 * Per-spec timings of a hosted Playwright shard (.github/workflows/e2e.yml).
 *
 *   node scripts/ci/e2e-timings.ts <playwright-report.json> <out.tsv>
 *
 * Writes one line per spec file to the TSV (spec, minutes, tests, failed, flaky, slowest test,
 * its minutes, titles of the flaky tests), and prints GitHub annotations: a warning for each test
 * that passed only on its retry. The workflow's last job joins the TSVs of all shards into the
 * "Spec timings" table, the source for scripts/ci/e2e-minutes.ts, and repeats the flaky tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Result = { duration: number; status: string };
type Test = { status: string; results: Result[] };
type Spec = { title: string; line: number; tests: Test[] };
type Suite = { title: string; file?: string; specs?: Spec[]; suites?: Suite[] };

export type SpecTiming = {
  spec: string;
  minutes: number;
  tests: number;
  failed: number;
  flaky: string[];
  slowest: string;
  slowestMinutes: number;
};

const toMinutes = (ms: number) => Math.round(ms / 6000) / 10;

function walk(suite: Suite, visit: (spec: Spec) => void): void {
  for (const spec of suite.specs ?? []) visit(spec);
  for (const child of suite.suites ?? []) walk(child, visit);
}

export function specTimings(report: { suites?: Suite[] }): SpecTiming[] {
  return (report.suites ?? []).map((file) => {
    const timing: SpecTiming = {
      spec: (file.file ?? file.title).replace(/^.*\//, '').replace(/\.spec\.ts$/, ''),
      minutes: 0, tests: 0, failed: 0, flaky: [], slowest: '', slowestMinutes: 0,
    };
    let total = 0;
    let slowest = 0;
    walk(file, (spec) => {
      for (const test of spec.tests) {
        if (test.status === 'skipped') continue;
        // Retries count: they are time the shard spent.
        const duration = test.results.reduce((sum, result) => sum + result.duration, 0);
        total += duration;
        timing.tests++;
        if (test.status === 'unexpected') timing.failed++;
        if (test.status === 'flaky') timing.flaky.push(spec.title);
        if (duration > slowest) {
          slowest = duration;
          timing.slowest = spec.title;
        }
      }
    });
    timing.minutes = toMinutes(total);
    timing.slowestMinutes = toMinutes(slowest);
    return timing;
  });
}

const cell = (text: string) => text.replace(/[\t\n|]/g, ' ').slice(0, 90);

export function toTsv(timings: SpecTiming[]): string {
  return timings
    .map((t) => [t.spec, t.minutes, t.tests, t.failed, t.flaky.length, cell(t.slowest), t.slowestMinutes, t.flaky.map(cell).join('; ')].join('\t'))
    .join('\n') + '\n';
}

if (import.meta.main) {
  const [reportFile, outFile] = process.argv.slice(2);
  const timings = specTimings(JSON.parse(readFileSync(reportFile, 'utf8')));
  writeFileSync(outFile, toTsv(timings));
  for (const timing of timings) {
    console.log(`${timing.spec}: ${timing.minutes} min, ${timing.tests} tests`);
    for (const title of timing.flaky) {
      console.log(`::warning title=Flaky e2e test::${timing.spec}: "${cell(title)}" failed, then passed on its retry. Fix it or file a task.`);
    }
  }
}
