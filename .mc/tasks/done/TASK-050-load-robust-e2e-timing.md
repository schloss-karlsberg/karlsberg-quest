---
id: TASK-050
aliases:
- TASK-050
title: Load-robust e2e timing and perf checks
slug: load-robust-e2e-timing
status: done
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
updated: 2026-11-28
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
- [x] Pass typecheck, unit tests and build.
- [x] Pass content validation and run the changed specs and smoke with the shared lock on port 5438 (see the second review below).

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

## Review fix plan

_Status: authorized by the review brief (2026-11-26)_

Preserve the branch's gameplay checks and budgets while tightening the browser assertions that
can miss regressions or pick up unrelated streaming work.

- [x] Pair the hidden and visible tour-group measurements after all bodies load, at matching
  camera poses and simulation ticks. Check that all 16 bodies submit geometry in the main view.
- [x] Measure held pause and bullet time over a fixed number of browser animation callbacks after
  draining pending renders. Check that paced rendering resumes after the forced wake-up frame.
- [x] Require the voice presenter to have both a null active dialogue and an empty queue, with
  the active line's ID or text in the failure output.
- [x] Add Vitest regressions for all five findings and update the testing docs and PRD.
- [x] Run the four gate commands and check browser availability with the shared lock.

## Progress

- Branch `dev/task-050`.
- 2026-11-26. The ending path steps the credits cue and checks the synchronous completion event.
- 2026-11-26. The tour walk samples matched scenes and waits for the 16 rigged bodies to load.
- 2026-11-26. The render-pacing spec checks effective caps, and the voice spec steps the opening presenter to idle.
- 2026-11-26. Typecheck, build and MissionControl validation passed. Vitest reported `Tests  1585 passed (1585)`.
- 2026-11-26. `pnpm validate` was blocked by `listen EPERM` on the TypeScript runner's IPC socket.
  The locked `pol-flow.spec.ts` run was blocked by `listen EPERM` on `127.0.0.1:5438` before the browser launched.
- 2026-11-26. Review fixes build on `4ed208a`. All five findings were introduced by that commit.
  Unit regressions cover a scenery change between pairs, missing main-view bodies, redraw requests
  in held states, a forced frame with broken pacing, and active dialogue without an ID.
- 2026-11-26. Review round typecheck, build, and `mc validate` passed. Vitest reported
  `Test Files  121 passed (121)` and `Tests  1591 passed (1591)` with zero failures.
- 2026-11-26. Review round `pnpm validate` failed to start on the TypeScript runner's IPC socket
  (`listen EPERM`). The locked `walk.spec.ts` command failed before browser launch because the
  preview server could not listen on `127.0.0.1:5438` (`listen EPERM`). The other browser runs were
  skipped after that port failure.

## Follow-ups

- Run `pnpm validate` where the TypeScript runner can bind its IPC socket.
- Run `walk`, `framerate`, `voice`, and `smoke` using the locked port 5438 command above, one spec
  per command. Check the walk deltas and body visibility on all three presets.
- Verify `pol-flow` from the initial implementation round with the same lock.

## Second review (2026-11-26)

- All five first-round findings are confirmed fixed in `ff3eeb6` and `0ad785c`.
- The held-frame checks required zero draws in a short window, but streamed assets and the delayed
  camera-zoom settings save request redraws asynchronously; the old spec allowed one such stray
  frame. `43f5eec` observes 60 callbacks and allows at most two draws, so a redraw on every frame
  still fails. CONTRIBUTING.md and the performance guide say so.
- Gates outside the sandbox: `pnpm typecheck` passed; `pnpm test` reported `Test Files  121 passed (121)`
  and `Tests  1591 passed (1591)`; `pnpm validate` reported `✓ content valid (1 warning(s))`;
  `pnpm build` passed.
- Locked e2e on port 5438: `framerate` 5 passed (after `43f5eec`); `pol-flow` 4 passed, `walk` 4 passed
  (added work: 346 calls and 247,736 triangles on Hoch/Mittel, 173 and 123,868 on Niedrig) and
  `smoke` 7 passed at `0ad785c`. `voice` was not run in this round.

## Closed (audit 2026-11-28)

Merged in PR #94. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
