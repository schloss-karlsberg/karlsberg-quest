---
id: TASK-070
aliases:
- TASK-070
title: 'Run sharded end-to-end tests on GitHub Actions'
slug: e2e-on-github-actions
status: in-progress
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
updated: 2026-11-26
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

## Follow-ups

- The sandbox denied a bind on `127.0.0.1` with `EPERM`. Run `e2e/framerate.spec.ts`,
  `e2e/walk.spec.ts` and `e2e/smoke.spec.ts` locally, one file at a time. The timing cases
  use the exclusive lane.
- Check the first hosted PR run for Linux browser compatibility and per-shard durations.
  Calibrate the weights from those durations.
- Stage and commit the implementation and documentation outside this sandbox.
