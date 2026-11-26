---
id: TASK-050
aliases:
- TASK-050
title: Load-robust e2e timing and perf checks
slug: load-robust-e2e-timing
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- e2e
- performance
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Load-robust e2e timing and perf checks

## Description

Keep the ending C flow and tour-walk workload checks reliable on a shared machine while
preserving failures for gameplay, rendering and pacing regressions.

## Acceptance Criteria

- [x] Advance the ending C flow with bounded game steps and keep its gameplay and UI assertions.
- [x] Compare the empty and populated tour scenes at each quality tier with load-independent work budgets.
- [x] Audit the other specs for similar wall-clock assertions and convert the relevant normal-suite checks.
- [x] Unit-test the test logic that changes and document the rule in CONTRIBUTING.md and the PRD changelog.
- [ ] Pass typecheck, unit tests, content validation and build. Run the changed specs and smoke with the shared lock on port 5438 if the sandbox permits.

## Plan

_Status: approved by the task brief (2026-11-26)_

**Approach:** Advance the credits transition on a bounded simulation clock. Measure the walk
scene and its 16-person group at the same position over a fixed number of steps, with a budget
for the added draw calls and triangles. Check render pacing policy in the browser and cadence
with synthetic timestamps in Vitest. Keep readiness waits for asynchronous work.

**Files to touch:** `e2e/pol-flow.spec.ts` and its shared party helper, `e2e/walk.spec.ts`,
`e2e/framerate.spec.ts`, `e2e/voice.spec.ts`, relevant unit tests, `CONTRIBUTING.md`, `docs/PERFORMANCE.md`,
and `docs/PRD.md`.

**Steps:**
- [x] 1. Make the ending and credits checks advance on game time and report the state at a missed checkpoint.
- [x] 2. Measure a fixed walk sample and enforce a documented group workload budget.
- [x] 3. Replace normal-suite pacing thresholds derived from elapsed wall time with deterministic frame checks.
- [x] 4. Document the testing rule and record the verification results.

**Test plan:** Run `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run each changed
spec and `e2e/smoke.spec.ts` separately with
`KQ_E2E_PORT=5438 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test <spec> --workers=1 --reporter=line`.

**Risks:** Frame-driven visuals and asynchronous asset loads use different clocks from the
fixed simulation. Preserve readiness waits and let the renderer settle before sampling.

**Open questions:** None.

## Progress

- Branch `dev/task-050`.
- 2026-11-26. The ending path steps the credits cue and checks the synchronous completion event.
- 2026-11-26. The tour walk samples matched scenes and waits for the 16 rigged bodies to load.
- 2026-11-26. The render-pacing spec checks effective caps, and the voice spec steps the opening presenter to idle.
- 2026-11-26. Typecheck, build and MissionControl validation passed. Vitest reported `Tests  1585 passed (1585)`.
- 2026-11-26. `pnpm validate` was blocked by `listen EPERM` on the TypeScript runner's IPC socket.
  The locked `pol-flow.spec.ts` run was blocked by `listen EPERM` on `127.0.0.1:5438` before the browser launched.
- 2026-11-26. Git could not create the worktree's `index.lock`. The changes are left in the worktree.

## Follow-ups

- Run `pnpm validate` where the TypeScript runner can bind its IPC socket.
- Run `pol-flow`, `walk`, `framerate`, `voice` and `smoke` using the locked port 5438 command above,
  one spec per command. Check the walk deltas on all three presets.
- Commit the story and rendering changes from a session that can write the worktree's Git index.
