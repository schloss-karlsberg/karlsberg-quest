/**
 * Decide which end-to-end specs a run needs (.github/workflows/e2e.yml, job "Select specs and build").
 *
 * Pull requests run the specs that their changed paths can affect (e2e-areas.ts) plus smoke, the
 * full suite when shared code changed, and nothing when only docs, tasks or unit tests changed.
 * The merge queue, pushes to main and manual runs without a spec list run the full suite.
 *
 * Try it on your branch (no install needed, Node 24):
 *
 *   node scripts/ci/select-e2e.ts                      # committed changes against origin/main
 *   node scripts/ci/select-e2e.ts --base main --labels full-e2e
 *   gh pr diff 123 --name-only | node scripts/ci/select-e2e.ts --files -
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { describeShards, planE2eShards, specName } from '../dev/plan-e2e-shards.ts';
import { ALWAYS_SPECS, AREA_RULES, FULL_LABEL, QUICK_SPECS, type AreaRule } from './e2e-areas.ts';

export type Mode = 'none' | 'selected' | 'full';

export type Selection = {
  mode: Mode;
  /** Spec names (no `.spec.ts`), sorted. Empty unless `mode` is `selected`. */
  specs: string[];
  /** One line for the run summary and the job log. */
  reason: string;
  /** Pull requests: what each changed path asked for. */
  rows: { path: string; run: string; why: string }[];
};

/** What the selection needs to know about the checkout. */
export type RepoView = {
  /** Names of the specs in `e2e/` (no `.spec.ts`). */
  specs: readonly string[];
  /** Source of a file below the repository root, or null when it does not exist. */
  read(path: string): string | null;
};

export type SelectInput = {
  event: string;
  /** workflow_dispatch: the `specs` input. */
  requested?: string;
  /** pull_request: changed paths, or null when they could not be determined. */
  changed?: readonly string[] | null;
  /** pull_request: label names. */
  labels?: readonly string[];
  /** pull_request: `quick` runs QUICK_SPECS instead of the full suite when shared code changed. */
  sharedCode?: string;
  /** push: URL of a full run that already passed on this exact commit. */
  verifiedBy?: string;
  repo: RepoView;
};

/** A selection this close to the whole suite runs as the full suite. */
const FULL_SHARE = 0.8;

/** `**` crosses directories, `*` stays inside one path segment. */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      // `**/` also matches no directory at all, so `**/*.md` covers `README.md`.
      source += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else source += char.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

const compiled = new Map<string, RegExp>();
function matches(glob: string, path: string): boolean {
  let pattern = compiled.get(glob);
  if (!pattern) compiled.set(glob, pattern = globToRegExp(glob));
  return pattern.test(path);
}

/** The first rule that matches a path, or null (which means: full suite). */
export function findRule(path: string, rules: readonly AreaRule[] = AREA_RULES): AreaRule | null {
  return rules.find((rule) => rule.paths.some((glob) => matches(glob, path))) ?? null;
}

/**
 * Relative imports of a TypeScript source that load a module at run time, resolved against the
 * importing file. `import type` and `export type` are erased, so they are left out.
 */
export function relativeImports(path: string, source: string): string[] {
  const found: string[] = [];
  const pattern = /\b(?:import|export)\s+(?!type\b)[^'";]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) found.push(posix.normalize(posix.join(posix.dirname(path), match[1] ?? match[2])));
  return found;
}

function resolveModule(path: string, repo: RepoView): string | null {
  for (const candidate of [path, `${path}.ts`, `${path}/index.ts`, path.replace(/\.js$/, '.ts')]) {
    if (repo.read(candidate) !== null) return candidate;
  }
  return null;
}

const dependencies = new WeakMap<RepoView, Map<string, Set<string>>>();

/** Every repository file each spec loads in Node: helpers, and the `src/` modules some specs import. */
function specDependencies(repo: RepoView): Map<string, Set<string>> {
  let bySpec = dependencies.get(repo);
  if (bySpec) return bySpec;
  const direct = new Map<string, string[]>();
  const importsOf = (path: string) => {
    let list = direct.get(path);
    if (!list) {
      const source = /\.(?:ts|mts|mjs|js)$/.test(path) ? repo.read(path) : null;
      list = source === null ? [] : relativeImports(path, source).flatMap((imported) => resolveModule(imported, repo) ?? []);
      direct.set(path, list);
    }
    return list;
  };
  bySpec = new Map(repo.specs.map((name) => {
    const seen = new Set<string>();
    const queue = [`e2e/${name}.spec.ts`];
    for (let path = queue.pop(); path; path = queue.pop()) {
      if (seen.has(path)) continue;
      seen.add(path);
      queue.push(...importsOf(path));
    }
    return [name, seen];
  }));
  dependencies.set(repo, bySpec);
  return bySpec;
}

/** Specs that import a file, directly or through other files. */
export function specsImporting(target: string, repo: RepoView): string[] {
  return [...specDependencies(repo)].filter(([, files]) => files.has(target)).map(([name]) => name);
}

type PathResult = { run: 'none' | 'full' | string[]; why: string };

function classify(path: string, repo: RepoView): PathResult {
  const rule = findRule(path);
  // Local-only suites and docs below e2e/ are ruled out before the import graph is asked.
  if (rule && typeof rule.run === 'string') return { run: rule.run, why: rule.why };

  const spec = /^e2e\/([^/]+)\.spec\.ts$/.exec(path)?.[1];
  if (spec) return repo.specs.includes(spec) ? { run: [spec], why: 'the spec itself' } : { run: 'none', why: 'spec removed' };
  const importers = specsImporting(path, repo);
  if (path.startsWith('e2e/') && path.endsWith('.ts')) {
    if (repo.read(path) === null) return { run: 'full', why: 'e2e helper removed or renamed' };
    return importers.length ? { run: importers, why: 'specs that import this helper' } : { run: 'none', why: 'no spec imports it' };
  }

  if (!rule || typeof rule.run === 'string') return { run: 'full', why: 'no rule in scripts/ci/e2e-areas.ts' };
  // Some specs import game modules (save format, layouts) to build their fixtures.
  return { run: [...new Set([...rule.run, ...importers])], why: importers.length ? `${rule.why}; imported by specs` : rule.why };
}

function requestedSpecs(requested: string, repo: RepoView): string[] {
  const names = requested.trim().split(/\s+/).filter(Boolean).map(specName);
  for (const name of names) if (!repo.specs.includes(name)) throw new Error(`Unknown e2e spec ${JSON.stringify(name)}.`);
  return [...new Set(names)].sort();
}

export function selectE2e(input: SelectInput): Selection {
  const { event, repo } = input;
  const full = (reason: string, rows: Selection['rows'] = []): Selection => ({ mode: 'full', specs: [], reason, rows });

  if (event === 'workflow_dispatch') {
    const specs = requestedSpecs(input.requested ?? '', repo);
    return specs.length
      ? { mode: 'selected', specs, reason: 'manual run of the requested specs', rows: [] }
      : full('manual run without a spec list');
  }
  if (event === 'push') {
    return input.verifiedBy
      ? { mode: 'none', specs: [], reason: `this commit already passed the full suite: ${input.verifiedBy}`, rows: [] }
      : full('push to main');
  }
  if (event !== 'pull_request') return full(event === 'merge_group' ? 'merge queue' : `event ${event}`);

  if (input.labels?.includes(FULL_LABEL)) return full(`the pull request has the ${FULL_LABEL} label`);
  if (!input.changed) return full('the changed files could not be determined');

  const selected = new Set<string>();
  const fullPaths: string[] = [];
  let affected = false;
  const rows = input.changed.map((path) => {
    const result = classify(path, repo);
    if (result.run === 'full') fullPaths.push(path);
    else if (result.run !== 'none') {
      affected = true;
      for (const spec of result.run) selected.add(spec);
    }
    return { path, run: typeof result.run === 'string' ? result.run : result.run.join(' '), why: result.why };
  });

  let shared = '';
  if (fullPaths.length) {
    const more = fullPaths.length > 3 ? ` and ${fullPaths.length - 3} more` : '';
    shared = `shared code or a path without a rule changed: ${fullPaths.slice(0, 3).join(', ')}${more}`;
    if (input.sharedCode !== 'quick') return full(shared, rows);
    for (const spec of QUICK_SPECS) selected.add(spec);
    affected = true;
  }
  if (!affected) return { mode: 'none', specs: [], reason: 'no changed path can affect the hosted e2e run', rows };
  // A rule may still name a spec that this pull request removes; the unit test catches stale names.
  const specs = [...selected].filter((name) => repo.specs.includes(name));
  for (const name of ALWAYS_SPECS) if (repo.specs.includes(name) && !specs.includes(name)) specs.push(name);
  if (!specs.length) return full('no spec is left to run for the changed paths', rows);
  if (specs.length >= repo.specs.length * FULL_SHARE) {
    return full(`the changed paths affect ${specs.length} of ${repo.specs.length} specs`, rows);
  }
  const reason = shared
    ? `${shared}. Quick cross-section of ${specs.length} specs; the full suite runs before the merge`
    : `${specs.length} of ${repo.specs.length} specs can be affected`;
  return { mode: 'selected', specs: specs.sort(), reason, rows };
}

// --- Command line ----------------------------------------------------------------------------------

export function checkout(root: string): RepoView {
  // Names end up in the job outputs, one per word: plain file names only.
  const specs = readdirSync(posix.join(root, 'e2e')).filter((file) => /^[\w.-]+\.spec\.ts$/.test(file)).map(specName).sort();
  return {
    specs,
    read(path) {
      const file = posix.join(root, path);
      try {
        return existsSync(file) ? readFileSync(file, 'utf8') : null;
      } catch {
        return null; // a directory
      }
    },
  };
}

function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** The matrix a selection gets, estimated from the spec minutes without asking Playwright. */
export function planSelection(selection: Selection, repo: RepoView, options: { maxShards?: number; shardMinutes?: number } = {}) {
  if (selection.mode === 'none') return [];
  const files = repo.specs.map((name) => ({ file: `${name}.spec.ts`, specs: [{ tests: [{ expectedStatus: 'passed' }] }] }));
  const shardMinutes = selection.mode === 'selected' ? options.shardMinutes : undefined;
  return planE2eShards(files, selection.specs.join(' '), { maxShards: options.maxShards, shardMinutes }).include;
}

function summarize(selection: Selection): string {
  const title = { none: 'No end-to-end tests needed', selected: 'Selected end-to-end specs', full: 'Full end-to-end suite' }[selection.mode];
  const out = [`### ${title}`, '', selection.reason, ''];
  if (selection.mode === 'selected') out.push(`Specs: \`${selection.specs.join(' ')}\``, '');
  if (selection.rows.length) {
    out.push('<details><summary>Changed paths</summary>', '', '| Path | Runs | Why |', '| --- | --- | --- |');
    for (const row of selection.rows) out.push(`| \`${row.path}\` | ${row.run} | ${row.why} |`);
    out.push('', '</details>', '');
  }
  return out.join('\n');
}

function main(argv: string[]): void {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const env = process.env;
  const root = posix.resolve(import.meta.dirname, '../..');
  const repo = checkout(root);
  const event = flag('event') ?? env.GITHUB_EVENT_NAME ?? 'pull_request';

  let changed: string[] | null = null;
  if (event === 'pull_request') {
    const from = flag('files') ?? env.KQ_E2E_CHANGED_FILE;
    try {
      if (from) changed = lines(readFileSync(from === '-' ? 0 : from, 'utf8'));
      else if (!env.GITHUB_ACTIONS) {
        const base = flag('base') ?? 'origin/main';
        changed = lines(execFileSync('git', ['diff', '--no-renames', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' }));
      }
    } catch (error) {
      console.error(`Could not read the changed files: ${(error as Error).message}`);
    }
  }

  const selection = selectE2e({
    event,
    requested: flag('specs') ?? env.KQ_E2E_SPECS,
    changed,
    labels: (flag('labels') ?? env.KQ_E2E_LABELS ?? '').split(',').map((label) => label.trim()).filter(Boolean),
    sharedCode: flag('shared-code') ?? env.KQ_E2E_SHARED_CODE,
    verifiedBy: env.KQ_E2E_VERIFIED_BY || undefined,
    repo,
  });

  const summary = summarize(selection);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `mode=${selection.mode}\nspecs=${selection.specs.join(' ')}\nreason=${selection.reason.replace(/\s+/g, ' ')}\n`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    console.log(`${selection.mode}: ${selection.reason}`);
    if (selection.specs.length) console.log(selection.specs.join(' '));
    return;
  }
  const shards = planSelection(selection, repo, { shardMinutes: Number(flag('shard-minutes')) || 8 });
  console.log(summary);
  if (shards.length) console.log(describeShards(shards));
}

if (import.meta.main) main(process.argv.slice(2));
