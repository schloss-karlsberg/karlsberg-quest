---
id: TASK-019
aliases:
- TASK-019
title: Test speed and stability
slug: test-speed-and-stability
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- testing
- story
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Test speed and stability

## Goal

Speed up the release campaign test, make unit failures reproducible and identifiable,
and protect existing saves during playtests.

## Acceptance Criteria

- [x] Trace campaign pacing through the test driver, story, dialogue and audio clocks.
      Provide a test fast path with the same campaign behaviour and measure the spec,
      or record an estimate and an exact benchmark command if the sandbox blocks it.
- [x] Investigate load-sensitive tests, make timing deterministic where possible and
      keep failed test names visible in Vitest logs.
- [x] Starting „Neues Spiel“ with `?nosave` leaves the persisted save intact.
- [x] Add regression tests, document the testing aids and update the PRD changelog.
- [ ] All four named gate commands pass.
- [x] Run campaign and smoke separately under the shared lock on port 5405 if
      available, or record the blocked specs and commands.

## Plan

_Status: implementation requested 2026-11-26_

**Approach**

1. Trace the campaign driver and game clocks. Identify which work costs wall time
   and exercise the same story transitions with deterministic stepping.
2. Audit unit timers and real-data fixtures, run repeated suites under CPU load,
   and ensure the reporter names failed cases in captured logs.
3. Trace the title action to save storage and test both normal and isolated new games.
4. Update contributor testing aids and design logs, run the four gates and record
   browser timings or the sandbox limitation.

**Files to inspect**

Campaign spec and helpers, story presentation and audio, manual stepping in boot,
save handling, Vitest config and tests, CONTRIBUTING.md and the design logs.

**Test plan**

Use focused Vitest checks for each changed path, repeated single-worker load runs
and the standard typecheck, test, validate and build gates. Run each affected
Playwright spec and smoke with one worker and the machine-wide lock.

## Progress

- 2026-11-26 — Started on `dev/task-019` at `07d3c97d`.
- Boot disables writes on the save manager for `?nosave`, but `startGame(true)`
  called an unguarded `delete()`. Deletion now respects the same switch as writes.
- The title smoke case starts with the exact bytes of the v0.8.0 autosave, accepts
  the new-game confirmation and checks the slot again after entering the tour.

## Campaign timing

`VoiceClip` follows Web Audio's `currentTime` and source-ended event. A ready clip
changes the presenter's typing rate. Even if its audio clock stalls, the playback
hold expires after the clip duration plus one second of **game time**. Reading
time, queue expiry and the story scheduler also consume fixed updates. A
`say.wait` resumes once its particular line leaves the presenter.

The campaign opens at t1 and jumps to t17 without waiting for the station
conversations. All 20 authored `say.wait` actions are in t1–t15. Comparing the
v0.7.0 and v0.8.0 manifests gives 35 added recordings (239.6 s total), including
48.2 s across the six added recordings in t17–t18. Neither beat waits on playback.
This rules out a compulsory 36-minute audio wait. The historical runs lack a
per-phase profile that would attribute the whole difference.

Every `kq.step` used to draw the entire world, even `step(0)`. For example, the
chapter 1 walker refreshed an interaction target with 13 draws per waypoint.
Chapter 3 also polled for a clear HUD before shots disabled by the campaign.
With `?manual&faststep` the same fixed updates, frame-driven controls, subtitle
queue and story checks run. A batch of steps can share one browser paint.
`screenshotReady()` still waits for three real frames. Ordinary manual sessions
retain recorded voices and immediate drawing.

**Estimate.** The reported baseline was about 66 minutes. If redundant drawing
accounted for a quarter to half of that time, the new run would take roughly
33–50 minutes. This is a sensitivity estimate. The 13-to-one draw reduction
applies to the waypoint example, while loading, actual captures and fixed updates
still cost time.

## Unit stability

- A route search on the shipped raster expands 8,915 cells. The test now bounds
  expansions and checks the path and shoreline in one run. The 16-person walk
  test bounds collision queries and checks positions over 1,000 ticks.
- The terrain tests still examine all protected samples and compare every decoded
  byte. The sample checks build a diagnostic only on failure, and native buffer
  comparison replaces the generic deep comparison of the decoded raster.
  Mock voice fetches release in explicit batches and drain on the next event-loop
  turn. No timeout was increased.
- The scenery, bottle and Bauwagen cases already have an allowance for real-data
  work. The voice-service mock uses a deadline to exercise its timeout case.
- Baseline under load: `Tests  1571 passed (1571)`. After the changes, two
  one-worker runs and one two-worker run with two CPU burners each reported
  `Tests  1573 passed (1573)` (23.56 s, 20.51 s, 14.23 s). The burners were
  stopped on exit. The historical unnamed failure did not recur.
- Verified the reporter on a failing travel assertion. Its captured `FAIL` line
  included the file, suite and case. The route fixture lies beyond the search
  window so the final test checks the observable local route and its cost.

## Verification and follow-ups

- Typecheck, the unit suite (118 files, 1,573 tests, zero failed) and production
  build passed. `pnpm validate` was attempted and the tsx launcher received
  `listen EPERM` on its IPC socket. Running the same validator directly with
  `node --import tsx scripts/validate-content.ts` gave `✓ content valid (1 warning(s))`.
- Final gate output included `Test Files  118 passed (118)`,
  `Tests  1573 passed (1573)` and `✓ built in 301ms`. `mc validate` and
  `git diff --check` also passed.
- The sandbox denied a TCP listener on `127.0.0.1:5405`. Playwright discovered
  both campaign tests and all seven smoke tests. Browser execution and campaign
  timing remain unverified. The following commands measure both modes of this
  build. To measure the pre-change code as well, use the campaign invocation on
  a build of `07d3c97d`. Compare the Playwright durations, excluding queue time.

```sh
pnpm validate && pnpm build
CAMPAIGN_FASTSTEP=0 KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/campaign.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/campaign.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

- Git denied the worktree's `index.lock` at the first staging attempt. The changes
  remain in the worktree. Intended local commits:

```sh
git add src/core/save.ts tests/core.test.ts e2e/smoke.spec.ts
git commit -m 'fix: preserve stored saves during nosave playtests' -m 'Refs: TASK-019' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add src/{boot.ts,core/bullet.ts,core/loop.ts,debug/hooks.ts,systems/story/index.ts} tests/pilot.test.ts e2e/{campaign.spec.ts,helpers/k3.ts,helpers/k4.ts}
git commit -m 'perf(story): batch campaign draws and use subtitle timing' -m 'Refs: TASK-019' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add tests/{travel,walk-group,terrain-detail,voice-clips}.test.ts vite.config.ts
git commit -m 'test: replace wall-clock budgets and name failing cases' -m 'Refs: TASK-019' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add CONTRIBUTING.md docs/{PRD,ACTION-RPG}.md .mc/tasks/todo/TASK-019-test-speed-and-stability.md
git commit -m 'docs: record campaign timing and verification' -m 'Refs: TASK-019' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
