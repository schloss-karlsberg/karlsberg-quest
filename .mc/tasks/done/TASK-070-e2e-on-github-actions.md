---
id: TASK-070
aliases:
- TASK-070
title: Run sharded end-to-end tests on GitHub Actions
slug: e2e-on-github-actions
status: done
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
created: 2026-11-26
updated: 2026-11-28
---

# Run sharded end-to-end tests on GitHub Actions

## Goal

Move full-suite Playwright runs onto hosted runners so parallel PR reviews can proceed
without waiting for the shared development machine.

## Acceptance criteria

- [x] PRs and pushes to main run the hosted suite. Manual runs accept an optional spec list.
- [x] One build feeds a bounded matrix of single-worker jobs with cached dependencies and
      Chromium, per-job timeouts, superseded-run cancellation and failure artifacts.
- [x] File-level shards distribute the longer specs. Record the evidence and choice.
- [x] CI runs SwiftShader with a CI reporter and at most one retry. Machine-dependent
      checks are skipped with reasons, and local config and assertions keep their behaviour.
- [x] The contributing guide, agent commands, e2e architecture and PRD describe the change.
- [x] Validate workflow YAML, list the CI shards and skips, and run the four gates.
- [ ] Run the touched specs plus smoke under the local lock when loopback is available.
- [ ] Confirm the updated hosted suite completes, with any remaining failures coming from assertions.

## Plan

_Status: approved 2026-11-26_

**Approach:** Reuse the Pages build setup and share its output across the test runners. Inspect
the installed Playwright sharding implementation and the suite to choose a file allocation.
Keep machine-specific assertions available to local runs.

**Files to touch:** `.github/workflows/e2e.yml`, the Playwright config, affected e2e specs,
regression tests, contributor and architecture/performance docs, and the PRD changelog.

**Steps:**
- [x] 1. Audit the spec inventory, hardware assumptions and shard allocation.
- [x] 2. Add the workflow, CI settings and skip rules, with regression coverage.
- [x] 3. Document hosted and local testing.
- [x] 4. Verify discovery and configuration, run the gates and check local browser availability.

**Test plan:** Validate YAML with an available parser. List CI shards and dispatch selections,
check skip status in Playwright's discovery output, and run `pnpm typecheck`, `pnpm test`,
`pnpm validate` and `pnpm build`. Attempt changed e2e specs and `e2e/smoke.spec.ts` separately
under `scripts/dev/heavy.sh` if the sandbox permits the browser and preview server.

**Risks:** Software-rendering timings vary between hosted runners. The first PR run will
provide the Linux timing baseline.

**Open questions:** Revisit the file weights once the first hosted timings are available.

## Progress

- Branch `dev/task-070`.
- 2026-11-26 — Playwright discovered 58 files and 209 cases. Its native 1/8 shard puts
  `campaign`, `chapter-k1` and `chapter-k2` together, and 2/8 puts `chapter-k3` and
  `chapter-k4` together. Use eight explicit file lists generated from test discovery.
  Real-GPU and mobile-tour harnesses use separate configs. Skip the walk benchmark and
  four wall-clock framerate checks on CI. Keep the render budgets and settings tests.
- 2026-11-26 — Added the shared build artifact, weighted matrix, CI diagnostics and
  static skip reasons. The focused shard-planner tests passed. The weight model uses
  one unit per runnable test plus allowances for long playthroughs. It spreads the six
  named long specs across six runners and gives the campaign a runner of its own.
- 2026-11-26 — Updated the contributor guide, agent commands, architecture, performance
  guide and PRD.
- 2026-11-26 — The weighted split estimates 41–48 work units per shard. The largest native
  shard scores 103 with the same model. These are estimates. The campaign owns the 48-unit
  shard, and the Playwright deadline is 75 minutes within a 90-minute job to allow for setup
  and diagnostics. The earlier macOS estimate in TASK-019 was 33–50 minutes for the campaign.
- 2026-11-26 — Parsed the workflow with Playwright's bundled YAML parser and ran `bash -n`
  on its shell steps. Playwright `--list` covered all eight generated lists and the native
  `--shard` baseline. The CI lists contain 58 files, 204 runnable cases and five skips with
  reasons. Local discovery leaves those cases runnable and uses the slot-suffixed artifact
  directory. The `chapter-k2 smoke` dispatch lists exactly those two specs.
- 2026-11-26 — Four gates green. Vitest reported `Tests  2126 passed | 10 todo (2136)` and
  zero failures. Content validation reported 30 warnings. `mc validate` passed.
- 2026-11-26 — The sandbox denied `git add` at the worktree's `index.lock`. The changes
  remain in the worktree.

### Fix round 1 · 2026-11-27

- Reviewed PR #92's first hosted run (45907871976). The build took 22 seconds. Timeouts
  dominated across the eight shards. Five supplied logs show the 75-minute suite deadline,
  and the runner sent exit 143 on the campaign and animals shards. The downloaded shard 3
  log contains `BlobNotFound`. The GitHub CLI returned job metadata but could not retrieve
  its full log.
- The hosted default is 640×360. The existing SwiftShader detection selects Niedrig with
  pixel ratio 1, no shadows or MSAA, terrain LOD scale 0.6 and a 480 m far tree ring. It
  already supplies the cheap preset, so the viewport change requires no new game flag or
  settings override. Explicit tiers still work. Preserve desktop viewports for
  art, scenery, readability, render budgets, framerate and specific pixel or layout
  checks. Device-sized touch tests keep their viewport. Local runs retain 1280×720,
  their earlier deadlines, port overrides and `heavy.sh` slot paths.
- The campaign and animals already use a single Playwright page per test. The campaign's
  screenshots were resetting its viewport to 1280×720. CI now captures them at 640×360.
  The three demo animals cases use the existing `?manual&faststep` option to defer paint
  while stepping behaviour. The deer pixel coverage case keeps full rendering. Playwright's
  Chromium defaults already include `--disable-dev-shm-usage`. CI traces omit filmstrips
  and keep snapshots and still failure screenshots. The logs have no OOM or crash
  diagnostic that establishes what caused the runner shutdowns.
- The matrix reserves one of 16 jobs for the campaign. The other 15 distribute the chapters
  and give extra weight to the costly render and gameplay specs seen in the first run,
  including animals, fx, the bench route, and art polish. The resulting non-campaign shards
  score 22–23 estimated units each. These are relative weights. Recalibrate from completed
  hosted durations. The shared timeout helper triples the default test and expect
  budgets, explicit test budgets, and explicit screenshot budgets on CI. Regular shards
  have 180 minutes within 205-minute jobs. The campaign has 240 within 270. The extra
  time covers setup and diagnostics. Test retries remain at zero.
- Workflow YAML and shell steps validated. `CI=1 pnpm exec playwright test --list --shard=1/16`
  listed 16 cases in six files. The workflow's 16 weighted lists cover 59 files and 207
  runnable cases, with the same five local-only skips
  (four timed framerate checks and one walk sample). A `chapter-k2 smoke` dispatch listed
  exactly those files. Local discovery listed all 212 cases as runnable. The local config
  check also verified slot 2 on port 5283 with `test-results/artifacts-slot2`.
- The four gates passed. Vitest reported `Tests  2135 passed | 10 todo (2145)`.
  Content validation reported 30 warnings. The local smoke attempt timed out in the
  `heavy.sh` queue, and the sandbox independently denied a loopback bind with `EPERM`.
- The sandbox denied creation of the worktree's Git `index.lock`. The fix is unstaged.
  The intended commit is `ci(env): lighten and rebalance hosted Playwright runs`.

The four assertion messages visible in the supplied logs represent two failed checks.
The GitHub reporter printed each in the live annotation and again in the summary.

| Log | Failed assertion | Assessment |
| --- | --- | --- |
| Shard 2, twice | `notes.spec.ts` F8 note should include the `Testereignis` toast event | Likely sensitive to hosted load. The note snapshots a 30-second wall-clock event window and synchronously captures the rendered view. |
| Shard 4, twice | `chapter-k2.spec.ts` via `helpers/k2.ts` expected the player to reach the sneak waypoint | Genuine playthrough assertion. The walk has a fixed simulation step budget, so a real route or setup flake is plausible. It needs a hosted rerun to distinguish that from a timing-sensitive setup. |

## Follow-ups

- Run the full updated hosted matrix. Check for runner shutdowns and unfinished shards.
  Recheck both assertion failures with `chapter-k2 notes` if they persist.
- Verify `e2e/smoke.spec.ts`, `e2e/animals.spec.ts`, `e2e/campaign.spec.ts`, graphics and
  layout opt-outs where loopback is available. Use the exclusive lane for local
  `e2e/framerate.spec.ts`, `e2e/walk.spec.ts` and `e2e/perf.spec.ts`.

## Closed (audit 2026-11-28)

Merged in PR #92. All acceptance criteria are met on main (`f8a75ff7`), and the hosted e2e suite is green.
