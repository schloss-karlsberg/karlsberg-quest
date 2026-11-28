---
id: TASK-056
aliases:
- TASK-056
title: 'Test coverage and bug sweep: resource leaks across transitions'
slug: resource-leaks-across-transitions
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- render
- lifecycle
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Resource leaks across transitions

## Goal

Map player-facing transition lifecycles and their unit coverage. Reproduce and fix leaks in
transition-owned resources, and verify that repeated transitions keep live counts bounded.

## Acceptance criteria

- [x] Map the relevant modules, contracts, existing tests and gaps.
- [x] Add at least 25 meaningful deterministic assertions and keep the focused run under about three seconds.
- [x] Demonstrate bounded live resource counts through repeated transitions.
- [x] Reproduce each production bug before fixing it.
- [x] Commit each confirmed fix separately (`0003fec` to `d374066`; review fixes in `fa60b81`).
- [x] Record design ambiguities as test todos and keep concurrent work out of scope.
- [x] Update the relevant architecture and changelog documentation.
- [x] Verify that warm-up alone uploads GPU buffers and that effect teardown deletes them all.
- [x] Verify that returning during the title fade cancels its pending hide.
- [x] Strengthen the phone and echo lifecycle assertions and use fictional dialogue in the fixture.
- [x] Pass all four gates (see the second review below).
- [x] Check smoke eligibility on port 5443 and record the spec for a human run when blocked.

## Plan

**Approach**

Trace chapter, era, interior, photo, party and title lifecycles against their tests and game
contracts. Count transition-owned allocations and disposal using production entry points and
explicit steps. Verify intentional shared and session-wide ownership at teardown.

**Files to touch**

- `tests/` for focused regression coverage.
- In-scope owners of leaks demonstrated by failing tests.
- `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md`, `docs/PRD.md` and this task file.

**Steps**

- [x] Record the transition and coverage map.
- [x] Add deterministic checks and run them against the starting implementation.
- [x] Fix confirmed leaks in reviewable commits and repeat the focused checks.
- [x] Attempt the four gates, check smoke eligibility, and record results and follow-ups.
- [x] Reproduce the two production bugs and confirm which behavior predates the branch.
- [x] Let the warmer draw the shift effect's own geometries and verify buffer deletion with
  three.js's WebGL resource managers. Fix the title fade race and tighten the phone and echo tests.
- [x] Update the architecture and changelogs, run the four gate commands, check smoke eligibility,
  and record each review finding's disposition.

**Test plan**

Run the focused Vitest set, then `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`.
Attempt `e2e/smoke.spec.ts` using the machine-wide lock and port 5443.

**Risks**

Shared assets must survive consumers leaving. Parallel tasks own gameplay changes in several of
these modules. Coverage that directly exercises those modules must pass on `origin/main`.

**Open questions**

Record design-dependent ownership decisions only if encountered during the audit.

## Progress

- Branch `dev/task-056` starts at `79c5718` (`origin/main`).
- 2026-11-26: Traced lifecycle entry points and matched them to `tests/`.
- 2026-11-26: Reproduced cumulative paper instance buffers, surviving stone and rewind instance
  buffers, and duplicate rewind cart geometry disposal. All three checks passed after the fix.
- 2026-11-26: Each Festsaal replacement left eight prop materials live and disposed one shared
  geometry twice. The regression now observes exactly one disposal per prop resource and one
  glint texture for the feature's lifetime.
- 2026-11-26: Actual interior streaming released its GPU resources on the baseline, but the
  distance cache grew from one to five building records after four era changes. It now holds only
  the current plan's records and is empty at teardown.
- 2026-11-26: A torn-down StageDirector still responded to eight subscriptions and retained its
  debug hook and card hold. A later cue recreated paper meshes on the abandoned stage.
- 2026-11-26: Repeated full shifts returned to their allocation baseline, but effect teardown
  left 12 resources alive (screen passes and warm-up stand-ins). The tests check reuse between
  shifts and disposal at teardown.
- 2026-11-26: Added 13 tests, plus one design todo. Focused gate on Node.js 24.19.0 reported
  `Tests  22 passed | 1 todo (23)` in 361 ms. The title, phone, credits, party, and audio tests
  passed with their production modules unchanged from `origin/main`.
- 2026-11-26: `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Tests  1618 passed | 2 todo (1620)`, with zero failures. `pnpm validate` exited before running
  the content validator because the sandbox denied the `tsx` IPC socket (`EPERM`) on Node.js 24
  and 26. A loopback probe returned `EPERM` for `127.0.0.1:5443`, so browser smoke was skipped.
- 2026-11-26: Documented the test helper and resource lifetimes in the architecture, and added
  changelog rows in the PRD and action-RPG design docs. No voiced lines need new recordings.
- 2026-11-26: Review-round regressions reproduced 21 GPU buffer uploads and zero deletions after a
  warm-up-only session, and a reopened title that vanished after its original fade deadline.
  `origin/main` had both the warm-up ownership gap and the title race. The echo and phone review
  findings concern tests added by this branch.
- 2026-11-26: The focused regressions passed in 315 ms. The audio assertion failed when the
  looping whisper's stop was removed. The phone assertion failed when each open added a listener.
- 2026-11-26: `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Tests  1620 passed | 2 todo (1622)` with zero failures. The `tsx` IPC socket failed with `EPERM`
  before `pnpm validate` reached the validator. Loopback on port 5443 was denied with `EPERM`, so
  `e2e/smoke.spec.ts` remains unverified. `mc validate` passed.
- 2026-11-26: `git add` was denied when creating the worktree's `index.lock`. The review fixes
  are in the worktree for local staging and commits.

## Review findings

1. **Fixed.** Warm-up draws the effect's own geometries with temporary draw ranges. The WebGL
   regression verifies that teardown before the first shift deletes every buffer uploaded by the pass.
2. **Fixed.** `show()` cancels the pending hide. The fake-timer test returns to the title halfway
   through the fade and checks visibility after the old deadline.
3. **Fixed.** The echo test verifies a finite future `stop()` time before dispatching `ended`.
4. **Fixed.** The phone test checks that the keydown registration count remains one after four opens.
5. **Fixed.** The echo fixture and its expected transcript use a fictional speaker. No voiced line
   needs new text or recordings.

## Coverage map

| Module | Player contract and resource boundary | Existing coverage and gap |
| --- | --- | --- |
| `story/index`, `story/engine`, `dialogue`, `cinematic` | Chapter/beat transitions retire their queues and timeouts, keep saved progress and chapter unlocks, and hand back the camera on skip/era change/load. Simulation waits while paused. Story rewards are owned by quests/progression. | `story-flow`, `story-card-hold`, `story-party`, `voice-playback`, `audio-mix` and `cinematic-system` cover queue limits/resume/rewards, camera release and speech ducking. Stage-owned GPU teardown is uncovered. |
| `fx/stage`, `chronik/echo`, `chronik/world/markers` | Cues mount scene pieces; completion, capture, load or specific shifts retire them. Echo completion records the discovery, an abort does not. Replacing a cue or leaving a clue should retire the old visual instance. Frost should vanish after thaw; the echo's audio tail may outlast the stage. | `setpieces`, `stage-directions`, `chronik` and `echo-twins` cover placement, staging rules and echo actors. They do not count retired instance buffers, shared cart geometry, live sound handles or director listeners. |
| `fx/shift`, `fx/ui`, `render/standard`, `render/shadows`, `world/water` | Animated/reduced/instant shifts change era once and preserve the caller's freeze state. Warm-up shaders are retained while the effect owns them. Environment, shadow and reflection targets are bounded across era/quality changes. Capture notice duration belongs to the latest notice. | `shift-lifecycle`, `fx-shift-reason`, `fx-effects`, `fx-prewarm-registry`, `render-tiers` and `perf-culling` cover timing, cache entries, presets and render scheduling. Target disposal, detached screen passes and pending notice timers are unpinned. |
| `interiors/index`, `interiors/festsaal`, `scenery/models` | Nearby shell streams in, remains warm just outside, and drops at distance or on era switch. Lightmap and mesh belong to the active building; authored model assets are shared. The four Festsaal choices save once; replacement/clear releases mesh resources and keeps a single reusable glint texture. | `interiors`, `interior-door-state`, `interiors-models` and `setpieces` cover collision, visibility thresholds, placement and geometry validity. No repeated enter/drop or prop disposal counts. |
| `photo/index`, `photo/core`, `photo/demo` | Phone up takes input/camera, forced close releases them; album and grants persist with a cap and no past-era rewards. The phone chrome and placeholder board are session-owned. | `photo` and `camera-photo` cover shot edge cases, grants, album cap, save conformance and camera snap. Repeated open/close and the global key listener are unpinned. |
| `party/runtime`, `party/strip`, `party/fest` | Skip releases camera/credits UI, keeps the party; clear/load drops party set, or restores the saved variant. Reduced motion uses a static strip. | `party`, `party-set`, `story-party` and `credits` cover these transitions with a fake strip, scene removal and render budget. The real strip's attached nodes and set disposals are unpinned. |
| `ui/title`, `boot`, `core/systems`, `audio/audio`, `ambience` | Start/return reuse one title, renderer, systems registry and audio graph. Fresh start emits load for clean state; Continue restores saved state. Pause and backgrounding stop gameplay and have separate audio policy. | `core`, `story`, `story-party`, `travel-journey`, `play-dismissal` and `audio-mix` cover loop/store, load, travel cancellation, pause input and audio routing. Title fade timing and audio ownership across repeated switches are unpinned. |

## Follow-ups

- Decide whether Continue after a title round trip should resume a half-heard Chronik echo or
  retire its stage and audio. The question is an `it.todo` in `tests/session-resources.test.ts`.
- Audit buffer ownership for warm-up stand-ins for hidden scene objects, model templates and
  registered samples. Their shared attributes and instance buffers have separate owners.
- Run `pnpm validate` in an environment that permits the CLI's IPC socket.
- Verify browser smoke with `KQ_E2E_PORT=5443 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

## Second review (2026-11-26)

- All five first-round findings are confirmed fixed in `fa60b81`. Warm-up stand-ins for the
  effect borrow its geometries and restore their draw ranges in a `finally`; other stand-ins still
  share buffers through temporary geometries. No further findings.
- Gates outside the sandbox: `pnpm typecheck` passed; `pnpm test` reported `Test Files  128 passed (128)`
  and `Tests  1620 passed | 2 todo (1622)`; `pnpm validate` reported `✓ content valid (1 warning(s))`;
  `pnpm build` passed. The locked `smoke` spec passed (7 passed).

## Closed (audit 2026-11-28)

Merged in PR #96. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
