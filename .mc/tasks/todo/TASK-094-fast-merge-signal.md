---
id: TASK-094
aliases:
- TASK-094
title: 'Fast merge signal: gates on every PR, e2e selected by changed paths'
slug: fast-merge-signal
status: review
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- env
- testing
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Fast merge signal: gates on every PR, e2e selected by changed paths

## Goal

A typical pull request gets its merge signal in minutes. Today every pull request, including one
that changes a single Markdown file, runs the full Playwright suite on 16 hosted runners, the
runners are shared by all open pull requests, and pull requests wait for hours. What protects
`main` (which deploys to the live game) must not get weaker.

## Acceptance criteria

- [x] Measure the current flow before changing it (below).
- [x] A `Gates` check runs the four gates on every pull request.
- [x] Docs, task files and unit tests skip e2e, and the check "End-to-end tests" still reports.
- [x] Runtime changes run the specs their paths can affect plus smoke; shared code and unmapped
      paths run the full suite. The matrix is sized to the selected work.
- [x] The full suite runs on every push to `main`, in the merge queue (`merge_group`) and on demand
      (`workflow_dispatch`, the `full-e2e` label). A red run on `main` opens an issue.
- [x] `gh workflow run e2e.yml -f specs="..." --ref <branch>` keeps working. Fork pull requests work
      with a read-only token and no secrets.
- [x] Unit tests for the selection and the shard plan; dry run against recent pull requests.
- [x] CONTRIBUTING, AGENTS, the architecture notes and both copies of the contribute skill describe the flow.
- [ ] The pull request's own run shows the gates job and the selection (full suite, because it
      changes the workflow). Record its times and the per-spec timings here.
- [ ] Replace the estimated minutes in `scripts/ci/e2e-minutes.ts` with the measured ones.

## Measurements (2026-11-27 and 2026-11-28, `gh run list`, `gh api .../actions/runs/<id>/jobs`)

**Runner pool.** The organisation is on the Free plan and the repository is public: 20 hosted
jobs run at a time. On 2026-11-28 at 01:50 UTC exactly 20 jobs were in progress and 74 were
queued, across seven pull-request runs, the post-merge run on `main`, the Release workflow and a
PR-title job. The release and title jobs waited behind e2e shards.

**One full run** (1 build job + 16 shards, 11 completed runs):

| | Value |
| --- | --- |
| Runner time of the shards | 291–368 min per run, about 330 typical |
| Wall time with free runners | 29–48 min (pushes to `main`: 32, 32, 46, 29, 48 min) |
| Longest shard | the campaign alone, 20–47 min; then `touch combat pol-flow notes`, 31–40 min |
| Shortest shard | 7–12 min, so the weights are off by a factor of four |
| Wall time with two or three runs in parallel | 53–67 min; shards waited 14–22 min (median) and up to 29 min for a runner |
| Queue on 2026-11-28 01:20–01:50 | seven runs waiting; a run started at 01:20 still had 4 of 16 shards queued after 30 min |

The same shard takes very different times on different runners: the campaign took 20, 23 and
47 min in three runs of the same code.

**Inside a shard** (run 46086245820): set-up takes about 35 s (checkout 3 s, build artifact 2 s,
pnpm 3 s, Node 3 s, install 1.4 s, browser cache 3 s, `playwright install --with-deps` 14 s).
Playwright itself takes 21 min on average, 97 % of the runner time. The build job takes 20–35 s
(`pnpm build`: 4 s). The build is already shared and the browser already cached, so the time is
in the tests and in how many of them run.

**Gates.** No workflow ran typecheck, unit tests or validate on a pull request. On `main` the
Pages workflow needs 3 s for typecheck, 33 s for the unit tests, under 1 s for validate and 3 s
for the build.

**Flaky failures.** 4 of the 11 full runs failed in one test and passed when the shard was run
again (`art` at `?q=high` twice, the `chapter-k1` pause twice; both fixed since in #128 and #129).
Each repeat cost 15–29 min of wall time, after 3 min to 2.6 h until someone started it.

**Cancellation.** A new push cancels the previous run of the same pull request. A second merge
also cancelled the post-merge run on `main` that was still in progress.

**What `main` requires.** Nothing: `branches/main/protection` answers 404 "Branch not protected"
and `rulesets` is empty. The merge bar is a convention the integrator follows.

**Per spec.** Not available: the hosted reporter printed no durations. Single-spec manual runs
give `chapter-k1` 5.5–8.4 min and `art` 1.8–4.1 min.

**Docs-only pull requests** (#130 with 51 task files, #132 with two Markdown files) each ran all
16 shards.

## Plan

_Status: approved 2026-11-28_

**Approach:** Two levels. The pull request gets a fast signal (gates in a minute, then only the
specs its paths can affect). The full suite runs once per merge or per batch: on every push to
`main`, on a batch branch before `main` moves, in a merge queue if the owner turns one on, and on
demand.

**Files to touch:** `.github/workflows/e2e.yml`, new `.github/workflows/gates.yml`,
new `scripts/ci/` (`e2e-areas.ts` rules, `select-e2e.ts`, `e2e-minutes.ts`, `e2e-timings.ts`),
`scripts/dev/plan-e2e-shards.ts`, `playwright.config.ts`, `tests/e2e-select.test.ts`,
`tests/e2e-shards.test.ts`, CONTRIBUTING, AGENTS, `docs/ARCHITECTURE.md`, `docs/PRD.md`, both
copies of the contribute skill.

**Steps:**
- [x] 1. Measure.
- [x] 2. Selection: rules by path, a spec selects itself, a helper selects its importers, unknown
      paths run everything. Unit tests check the rules against the repository.
- [x] 3. Workflow: gates, selection, sized matrix, always-reporting result job, `merge_group`,
      non-cancelling runs on `main` with an issue on failure, per-spec timings.
- [x] 4. Docs.
- [ ] 5. Read the pull request's own run, calibrate the minutes, record the results.

**Test plan:** `pnpm exec vitest run tests/e2e-select.test.ts tests/e2e-shards.test.ts`, the four
gates, a YAML parse and `bash -n` of every workflow step, a local run of the select and plan steps
with the hosted environment variables, a dry run against 18 pull requests, then the pull
request's own hosted run.

**Risks:** A rule can be too narrow. Then a regression shows up in the full run of the merge
(queue, batch branch or push to `main`) and not on the pull request. The rules are a first
version; widen a rule whenever a full run catches what a selected run missed.

**Open questions (owner):** make `Gates` and `End-to-end tests` required; whether to use a merge
queue. The pull request lists the exact settings.

## Design

| Event | What runs | Runners |
| --- | --- | --- |
| Pull request, only docs / `.mc/` / unit tests / tooling | Gates. "End-to-end tests" passes without running a spec. | 2 small jobs |
| Pull request, feature system / content / spec / helper | Gates, the covering specs plus smoke | 1–12, about 8 min of estimated work per shard, never more shards than the longest spec needs |
| Pull request, shared code or a path without a rule | Gates, the full suite | 12 |
| Pull request with the `full-e2e` label, or from a fork | Gates, the full suite | 12 |
| Merge queue (`merge_group`) | Gates, the full suite | 12 |
| Push to `main` | the full suite, unless the same commit already passed it in the queue or in a manual full run | 8, one run at a time and one waiting |
| `workflow_dispatch` | the listed specs, or the full suite | up to 12 |

- The job **"End-to-end tests"** reports for every run that is not cancelled and fails when a
  shard failed or timed out or the plan failed. A manual run of chosen specs reports as
  "End-to-end tests (manual selection)", so it cannot stand in for the pull request's check.
- The campaign runs only with the full suite. Rules never list it.
- Specs import some game modules in Node (save format, layouts). A change to such a module also
  selects the importing specs.
- One retry per failed test on hosted runners, none for the campaign and none in the run on
  `main` after a merge, where a flaky test turns `main` red. On a pull request a test that passes
  on its retry leaves the check green; the result job then raises the warning "Flaky e2e tests"
  and the run summary lists the tests.
- A file that a spec imports or reads with `new URL('../x', import.meta.url)` selects that spec,
  also below a `none` rule (the save fixtures in `tests/fixtures/`).
- A cancelled run leaves "End-to-end tests" without a result (GitHub can show it as skipped).
  Only a green check on the latest commit counts. The first version of the job used `always()`
  to fail on a cancelled run. Under load that blocked the next run: the superseded run of this
  pull request kept its concurrency group for as long as its 10-second result job waited for a
  runner (queued from 02:22 UTC with 112 jobs waiting), and the run of the new commit stayed
  "pending" behind it. The job now uses `!cancelled()`.
- Each shard writes per-spec minutes; the result job prints one "Spec timings" table per run.
- 12 shards instead of 16 for a full run: the campaign sets the wall time, and 12 + 8 (a run on
  `main`) fit the pool of 20.
- `E2E_SHARED_CODE=quick` (repository variable, unset by default) replaces the full suite on a
  pull request that changes shared code with a cross-section of 11 specs. It is meant for a
  repository where the full suite passes before every merge (batch branches or a merge queue).
- **A merge queue does not batch.** GitHub's documentation says "Merge limits do not combine
  merge_group builds": every pull request that enters the queue gets its own `merge_group` run,
  on a branch that also holds the pull requests ahead of it. A queue therefore costs one full run
  (about 330 runner-minutes) per pull request. The workflow supports it, but the cheap batch is
  the integrator's batch branch: merge several green pull requests into `integrate/<name>`, run
  the full suite once by hand, fast-forward `main`. The push run on `main` finds that run and
  does not repeat the suite.

## Dry run (selection as merged in this pull request, minutes from the estimate table)

Changed paths from `gh api repos/.../pulls/<n>/files`. Expected wall time is the longest shard
plus 2 min for planning, set-up and the result job, with free runners.

| PR | Run | Specs | Shards | Runner-min | Expected wall | Decided by |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| #121 | selected | 6 (animals minimap photo smoke touch tour-slice) | 4 | 54 | 19 min | content/photo/targets.json, systems/photo/data.ts |
| #122 | selected | 33 | 11 | 179 | 19 min | e2e/quests.spec.ts, systems/quests/* |
| #123 | selected | 15 | 8 | 94 | 14 min | e2e/tour-slice.spec.ts, systems/npc/* |
| #124 | full | 62 | 12 | 330 | 32 min | src/i18n/index.ts |
| #125 | full | 62 | 12 | 330 | 32 min | src/debug/hooks.ts, src/debug/stepGate.ts |
| #126 | selected | 10 | 6 | 54 | 12 min | tour pack and story, e2e/tour-slice.spec.ts |
| #127 | full | 62 | 12 | 330 | 32 min | scripts/content-build/speakers.mjs, src/content/* |
| #128 | full | 62 | 12 | 330 | 32 min | playwright.config.ts |
| #129 | selected | 33 | 11 | 194 | 32 min | e2e/helpers/pause.ts (imported by 33 specs, the campaign among them) |
| #130 | none | 0 | 0 | 0 | < 1 min | 51 task files |
| #131 | selected | 3 (fx skills smoke) | 3 | 21 | 11 min | systems/ambience/index.ts |
| #132 | none | 0 | 0 | 0 | < 1 min | a task file and docs/PERFORMANCE.md |
| #133 | full | 62 | 12 | 330 | 32 min | src/boot.ts |
| #134 | full | 62 | 12 | 330 | 32 min | src/boot.ts, src/player/player.ts |
| #135 | full | 62 | 12 | 330 | 32 min | vite.config.ts |
| #136 | selected | 33 | 11 | 179 | 19 min | systems/quests/index.ts, systems/walk/*, src/world/crowd.ts |
| #137 | full | 62 | 12 | 330 | 32 min | src/boot.ts |
| #138 | full | 62 | 12 | 330 | 32 min | scripts/content-build/kapitel1.mjs, src/core/* |

2 run nothing, 7 run a selection, 9 run the full suite: 3,748 runner-minutes for one push each,
against 5,947 today (37 % less). With `E2E_SHARED_CODE=quick` only #128 stays full (it changes a
helper that every spec imports) and the total is 2,539 runner-minutes (57 % less); the full suite
then runs once per batch branch.

## Progress

- Branch `ci/task-094-fast-merge-signal`. PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/143
- 2026-11-28: measured, implemented, documented. Four gates green
  (`Tests  2562 passed | 17 todo`, content valid with 28 warnings). Workflow YAML parsed and every
  `run` step passed `bash -n`. `actionlint` is not installed here. The select and plan steps were
  run locally with the hosted environment variables for a pull request (this branch: full suite,
  12 shards; #131: `fx skills smoke`, 3 shards; #132: none), a push to `main` (8 shards) and a
  manual `chapter-k2 smoke` run (2 shards).
- The unit test that walks the build's imports caught `content/examples/`, which the first draft
  treated as docs: the example pack is bundled by `import.meta.glob`.

### Review fixes · 2026-11-28

- Fail-open hole: `tests/**` ran nothing, but `e2e/smoke.spec.ts` and `e2e/chapter-prolog.spec.ts`
  read `tests/fixtures/saves/v0.8.0.json`. The import graph now follows
  `new URL('../x', import.meta.url)` and is asked before a `none` rule applies, and
  `tests/fixtures/**` has its own rule. No other hosted spec or helper reads a file outside
  `e2e/` and `src/` (the campaign's saves are its own output below `test-results/`); a unit test
  fails when a spec names such a path relative to the working directory.
- Pull requests from a fork always run the full suite.
- `src/systems/characters/**` and the model and texture rule now include the fight specs:
  `characters/rig.ts` drives the enemy rigs too.
- Flaky tests: warning from the result job, list in the run summary, no retry on `main`.
- The workflow YAML and its expressions were checked by reading, a YAML parse and `bash -n` only:
  `actionlint` is installed neither here nor at the reviewer's. The pull request's hosted run is
  the first real check of the expressions.

## Follow-ups

- Calibrate `scripts/ci/e2e-minutes.ts` from the first "Spec timings" table and re-check the
  shard balance. Split specs that turn out to set the wall time (`touch` and `perf` are the
  candidates by estimate). The campaign has two tests; if both are long, give each its own runner.
- Widen or narrow rules in `scripts/ci/e2e-areas.ts` as full runs show what selections miss.
- The release pull request (#22) never gets checks: its workflow runs end as `action_required`.
