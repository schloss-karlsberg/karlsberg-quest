---
id: TASK-019
aliases:
- TASK-019
title: Test speed and stability
slug: test-speed-and-stability
status: done
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
updated: 2026-11-28
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
- [x] Sixty parked `step(0)` calls advance presentation by one second and draw 60
      times in either mode, with zero fixed updates.
- [x] Continue reloads the read-only autosave after a temporary tour. New Game
      opens the content warning directly in read-only mode and keeps the writable
      overwrite confirmation.
- [x] A screenshot-disabled K3 run leaves the station without waiting for a skill
      card to fade.

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

### Review fixes

_Requested 2026-11-26 on `dev/task-019` at `74141bd`._

Keep fast-step presentation timing independent of deferred paints, make the title
actions reflect save availability, and skip cosmetic waiting in the campaign.

- [x] Compare each finding with `origin/main`. Make deferred paints draw the
  prepared scene and assert equal presentation elapsed time for both step modes.
- [x] Reload the autosave on „Weiter“ and confirm overwrites only for writable
  saves. Cover both behaviours in unit tests and exercise the K1 round trip in smoke.
- [x] Keep K3's skill-card wait inside the screenshot path and assert disabled
  screenshots skip it.
- [x] Update the testing and game docs, run the four gates, and record the locked
  Playwright results and any follow-ups.

## Progress

- 2026-11-26 — Started on `dev/task-019` at `07d3c97d`.
- Boot disables writes on the save manager for `?nosave`, but `startGame(true)`
  called an unguarded `delete()`. Deletion now respects the same switch as writes.
- The title smoke case starts with the exact bytes of the v0.8.0 autosave,
  opens the content warning directly and checks the slot after entering the tour.
  It then returns via Pause and checks that Continue restores K1 at `k1_0`, the
  legacy slot's migration destination.
- Review baseline: the Continue assumption, confirmation and station wait also
  existed on `origin/main`. All three are small and within this task's scope.
- The fast-step regression reproduced two seconds of presentation before the
  fix. The focused loop and pilot run passed all 52 tests after it.
- The title and K3 helper unit regressions passed. The K3 check caught a station
  poll before the wait was removed. The focused run covered 59 tests in total.
- 2026-11-26 — PR #56 review fix. Imports of the shared chapter helpers now work
  in a read-only checkout. Playwright creates screenshot directories when it
  writes the files. Full synchronous draws satisfy a queued fast-step paint,
  with regressions for both `step()` and `renderOnce()`.

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

## Review verification

- All four findings were fixed. The review tests cover parked paint timing,
  loading before Continue starts, overwrite confirmation for writable slots,
  and leaving the K3 station with chapter screenshots disabled.
- `pnpm typecheck` passed. `pnpm test` reported `Test Files  120 passed (120)`
  and `Tests  1584 passed (1584)`, with zero failures. `pnpm build` reported
  `✓ built in 361ms`.
- `pnpm validate` could not start because the sandbox denied the tsx IPC listener
  (`listen EPERM`). `node --import tsx scripts/validate-content.ts` reported
  `✓ content valid (1 warning(s))`.
- The locked smoke run could not start the preview server because the sandbox
  denied the listener on `127.0.0.1:5405`. Playwright discovered all 11 cases
  across smoke, campaign, and chapter K3 with `--list`.
- The original implementation is committed on this branch (`51973bd`, `28da407`,
  `b5c8e0f`, `74141bd`). Staging the review changes failed at the worktree's
  `index.lock` with `Operation not permitted`.

## Follow-ups

- Run the named content gate and the three affected browser specs in an
  environment that allows the required listeners. Compare the ordinary and fast
  campaign runs using the Playwright durations. A build of `07d3c97d` can also
  provide a pre-task baseline.

```sh
pnpm validate && pnpm build
KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/chapter-k3.spec.ts --workers=1 --reporter=line
CAMPAIGN_FASTSTEP=0 KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/campaign.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5405 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/campaign.spec.ts --workers=1 --reporter=line
```

- Commit the review changes where the current worktree's index is writable.

```sh
git add -p src/boot.ts # Stage the render and prepareFrame changes.
git add src/core/loop.ts tests/pilot.test.ts
git commit -m 'fix(render): paint prepared fast-step frames' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add src/boot.ts src/ui/title.ts src/systems/story/index.ts e2e/smoke.spec.ts tests/title.test.ts
git commit -m 'fix(ui): restore the autosave from the title' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add e2e/helpers/k3.ts tests/campaign-helpers.test.ts
git commit -m 'test: skip the K3 skill-card wait without screenshots' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add CONTRIBUTING.md docs/{PRD,ACTION-RPG,ARCHITECTURE}.md .mc/tasks/todo/TASK-019-test-speed-and-stability.md
git commit -m 'docs: record TASK-019 review fixes and verification' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```

## Closed (audit 2026-11-28)

Merged in PR #56 (together with TASK-024). The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
