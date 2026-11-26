---
id: TASK-056
aliases:
- TASK-056
title: 'Test coverage and bug sweep: resource leaks across transitions'
slug: resource-leaks-across-transitions
status: in-progress
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
updated: 2026-11-26
---

# Resource leaks across transitions

## Goal

Map player-facing transition lifecycles and their unit coverage. Reproduce and fix leaks in
transition-owned resources, and verify that repeated transitions keep live counts bounded.

## Acceptance criteria

- [x] Map the relevant modules, contracts, existing tests and gaps.
- [ ] Add at least 25 meaningful deterministic assertions and keep the focused run under about three seconds.
- [x] Demonstrate bounded live resource counts through repeated transitions.
- [x] Reproduce each bug before fixing it and commit each confirmed fix separately.
- [x] Record design ambiguities as test todos and keep concurrent work out of scope.
- [ ] Update the relevant architecture and changelog documentation.
- [ ] Run the four gates and attempt locked smoke on port 5443.

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
- [ ] Run the four gates and locked smoke, then record results and follow-ups.

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
