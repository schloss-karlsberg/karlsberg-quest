---
id: TASK-030
aliases:
- TASK-030
title: 'Test coverage and bug sweep: travel, era shift, interiors and the world'
slug: travel-shift-interiors-world-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- travel
- world
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Travel, era shift, interiors and world logic

## Goal

Identify player-visible behaviour without unit coverage and fix defects demonstrated by focused tests.

## Acceptance criteria

- [x] Record each module's player-facing contract and existing unit coverage, including exclusions.
- [x] Add at least 25 deterministic assertions across the four areas, with the focused set under about three seconds.
- [x] Reproduce each confirmed defect before changing its behaviour. Record unresolved design decisions as test todos.
- [x] Include the arrival-pose and fading-curtain fixes in the branch (`6530102` and `95952ef`).
- [x] Update affected documentation and the PRD changelog.
- [ ] Pass all four gates as written. Typecheck, unit tests and build passed. The validator CLI was sandbox-blocked.
- [x] Check whether the smoke spec can run and record the human-run command if the sandbox blocks its port.

## Plan

**Approach:** Follow the task brief on branch `dev/task-030`. Trace system events, save boundaries
and world-coordinate calculations against the architecture and tests. Use small fixtures and explicit
simulation steps for uncovered contracts.

**Files to touch:** Tests in `tests/`, the implicated in-scope modules for confirmed failures,
this coverage inventory, and the corresponding sections of the game documentation.

**Steps:**

- [x] Inventory modules, behaviours, test references and gaps.
- [x] Exercise travel, shifts, interior queries and outdoor sampling/placement at their boundaries.
- [x] Verify failures against intent, apply minimal fixes individually and rerun the regressions.
- [x] Run gates, record smoke results and complete documentation.

**Test plan:** Run targeted Vitest files together, then `pnpm typecheck`, `pnpm test`,
`pnpm validate` and `pnpm build`. Use port 5418 for the locked Playwright smoke spec.

**Risks:** Adjacent tasks own guarded caches, routing, rendering optimisations and several UI systems.
Keep changes focused on independent gameplay logic.

## Progress

### PR #62 review fixes (2026-11-26)

- [x] Cancel pending travel and remove its curtain before saving on return to the title screen.
- [x] Save the tour group's pending snap with the arrival pose and replay it on the first simulation tick after load.
- [x] Reproduce both failures with focused tests and verify that a held sprint regains its boost after combat.

Typecheck, the full Vitest run (124 files, 1605 passed, one todo), content validation and an
in-memory production build passed. Vitest used `--maxWorkers=2 --configLoader runner --no-cache`
after the default loader could not write through the shared `node_modules` symlink. Playwright
discovered `e2e/travel-session.spec.ts`. The sandbox denied binding a loopback port for browser execution.

### Review round on `dev/task-030` (2026-11-26)

**Goal:** Preserve the arrival pose in the travel autosave, clear old curtains on session changes,
and exercise the production save and load paths in the travel regressions.

- [x] Verify the arrival pose in an autosave backed by `MemoryStorage`.
- [x] Verify that loading a slot cancels a pending journey through `save:loaded`.
- [x] Verify that lore and shrine behavior uses the loaded slot and writes the next change to its state.
- [x] Verify immediate curtain removal during a fade on load, game start and disposal.
- [x] Update the travel docs and changelog, run the gates and attempt the locked smoke spec.
- [x] Include the curtain fix, its regression tests and the review documentation in `95952ef`.

**Plan:** Add the regression assertions first and reproduce the arrival and fade failures. Update
the arrival state before saving and keep the fading curtain and its timer available for cleanup.
Run the focused travel tests, all four gates and the locked smoke spec.

Both arrival cases reproduced the stale pose from `origin/main` before the fix. The pending
journey, lore and shrine regressions each failed with the `save:loaded` listener temporarily removed.
With the listener restored and the pose synced before saving, all eight focused tests passed.
The fade regressions reproduced the lingering curtain on all three exits. Tracking its removal
timer separately keeps the normal fade and lets the same exits clear it immediately. The six
focused files passed with 20 tests, one todo and zero failures in 296 ms.

- The initial sweep started from `d2d1f48` on 2026-11-26 and is recorded in `671172e`.
- Cross-checked the inventory against all 58 module paths, including the excluded route solver.
- The initial sweep added 92 assertions across six focused test files. The registered travel system runs on an in-memory store and event bus. Journey tests advance fake timers, shift tests advance effect time, and terrain fixtures use fixed inputs and seeds.

| Area | Failure observed before the fix | Result |
| --- | --- | --- |
| Travel curtain | A pending trip replaced a newly loaded position (75, 20) with the spring arrival (1074.2, −822.8). Loading after arrival also kept the old travel pause. | Cancel the journey timer and release its curtain and pause on state replacement, game start, load and disposal. |
| Travel autosave | The autosave kept the departure pose in manual and timed journeys. | Copy the live arrival pose into the store before autosaving. |
| Curtain fade | Loading, starting a game or disposing the travel system during the fade left the old curtain mounted until its timer fired. | Track the fading element and cancel its removal timer during cleanup. |
| Laufschritt | After a minute running and three seconds off sprint the multiplier was still 1.45. Entering combat multiplied a requested speed of 0.7 up to 1.015. | Cap stored run-up at the end of the ramp and drop the boost immediately when ineligible. |
| Shift | Finishing a non-instant capture return raised a saved count of 7 to 8. | Apply the documented capture exception in the effect just as in the instant path. |
| Interiors | Clearing one of two collapsed rooms made its shared door traversable. | Derive the blocked doors from the set of collapsed rooms. |
| Water | Three metres inside the upper pond, the lower pond’s shore band returned −3 m. | Use the greatest signed shore distance from nearby bodies when checking wading. |
| Scenery collision | A 0.3 m circular probe reported contact more than 0.35 m from a rotated box corner. The movement resolver allowed passage. | Check the distance to the corner in both overlap queries. |

### Verification

```text
pnpm typecheck  →  tsc --noEmit (exit 0)
Focused Vitest  →  Test Files  6 passed (6)
                   Tests  20 passed | 1 todo (21)
                   Duration  296ms
pnpm test       →  Test Files  124 passed (124)
                   Tests  1593 passed | 1 todo (1594)
pnpm validate   →  listen EPERM on the tsx IPC socket (exit 1)
node --import tsx scripts/validate-content.ts  →  ✓ content valid (1 warning(s))
pnpm build      →  ✓ 469 modules transformed.
                   ✓ built in 558ms
```

Both Vitest runs had 0 failed. MissionControl validation passed. The locked smoke attempt stopped
before Playwright could run its tests because the preview server could not bind `127.0.0.1:5418`
in the sandbox (`listen EPERM`). No voiced lines require new text.

### Follow-ups

- Decide whether a full-health traveller with a partly empty lantern should consume the Wegstein’s cooldown. The design question is an `it.todo` in `tests/travel-runtime.test.ts`.
- Outside the sandbox, run `pnpm validate` and
  `KQ_E2E_PORT=5418 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

## Coverage inventory

Checked module imports and exported function names in `tests/*.test.ts` at `d2d1f48`.
Test names below omit `.test.ts`. “Indirect” means the test exercises a caller.

### Travel

| Module | Player contract | Coverage before this sweep |
| --- | --- | --- |
| index | Activation, announced destinations, journey eligibility and arrival, one-time lore XP, shrine heal/refill/cooldown, sprint restrictions, and reloading travel state | No system-level unit test. Guarded caches belong to a parallel task. |
| points | Known, retired and nearby destinations, home, activation radius, blocking reasons and announcement range | travel, world-quiet, bauwagen |
| pois | Stable seeded route placements, spacing, empty routes, era guards, loot and tier XP | travel, bleiche and bauwagen cover placements, ids and loot. Reward delivery untested. |
| lore | Era-appropriate unique finds for the collection | travel checks distinct ids and eras. Collection after reloading untested. |
| laufschritt | Delayed, capped sprint ramp and loss of boost when no longer eligible | travel covers the pure ramp and simulated onset, omits actual runtime release and re-entry. |
| trail | Distance along a route, visibility timeout, clearing and reduced movement | No direct unit test. The route solver is TASK-026. |
| map | Known-point list, layer choice, zoom and journey actions | No direct unit test of the DOM controls. |
| visuals | Tripods, reward markers and reduced-flash/reduced-motion cues | No direct unit test of their appearance. |
| audio | Chimes, chest, paper, shrine and journey sounds when audio is available | No direct unit test. |
| strings | German labels and feedback for travel and its map | Presentation only. |

### Era shift

| Module | Player contract | Coverage before this sweep |
| --- | --- | --- |
| instant | Switch era between begin and midpoint, propagate reason, exclude captures from player count | fx-shift-reason checks the destination, count and done payload. |
| shift | Freeze player, switch once at midpoint, release on completion, preserve prior movement lock, count player shifts | No direct lifecycle test for the animated or reduced transition. |
| timeline | Scan and reassembly order, cover at midpoint, reduced crossfade | fx-effects and fx-warm-reveal |
| shaders | Veil, point clouds, fade and rewind drawing | Rendering only. |
| reveal | Hold new objects only while hidden, release as the wave reaches them | fx-warm-reveal |
| pointcloud | Terrain heights in both eras, bounded progressive sampling, tree and palace points | fx-effects and fx-warm-slices cover terrain samples, hillshade and ring jobs. |
| prewarm | Reuse the destination’s materials across visits and release replaced samples | fx-prewarm-registry |
| slices | Suspend async warm-up jobs and resume within per-frame budgets | fx-warm-slices |
| warm | Choose the next era, prepare its objects, release them as the veil passes | fx-warm-slices covers the warm-up policy, fx-warm-reveal covers the release predicate. GPU work excluded. |

### Interiors

| Module | Player contract | Coverage before this sweep |
| --- | --- | --- |
| index | Install era-specific floor and wall queries, room enter/leave flags, delay collapse blocking until exit, unload props | interiors-models covers model visibility by distance. Event transitions have little unit coverage. |
| layout | Connected rooms, storeys, stoops and passable doors per palace era | interiors, camera-palace |
| stairs | Reachable floor heights on flights and landings inside stair halls | interiors covers real palace stair plans. |
| geom | Polygon containment, edge projection and local room geometry for doors and walls | interiors uses edge positions and exercises plan geometry indirectly. |
| collide | Height-aware wall and floor selection, dynamic furniture and collapsed doors | interiors checks floors and single collapse; camera-palace checks walkable spaces. Shared-door reopening and furniture replacement uncovered. |
| festsaal | Four choices placed in reach and recorded once for the story | setpieces covers placement. No direct test of taking the choice. |
| builder | Floor surfaces, furnished solids, foundations, debris and era variants | interiors builds shipped rooms in each era. Rendering excluded. |
| props | Furnishings and their obstacle outlines | Indirect through interiors builds. No direct furniture lifetime test. |
| shell | Cut doors and windows in the facade while interiors are active | interiors covers opening classification and extraction. |
| beams | Falling joists with a reduced-motion version | Visual only. |
| flames | Fire, smoke and embers for burning rooms | Visual only. |
| geobuf | Batched room geometry | Indirect through interiors mesh tests. |
| lightmap | Baked lighting for room windows | interiors checks lighting data. |
| material | Era and fire appearance of interior surfaces | Rendering only. |
| strings | German room feedback | Presentation only. |
| types | Plan, wall height, door endpoints and room identifiers | Data contracts exercised in interiors, setpieces and k3-stage. |

### World

| Module | Player contract | Coverage before this sweep |
| --- | --- | --- |
| heightfield | Heights, slope, normals, coordinate origins, clamping and nearest land class | world checks interpolation, bounds, slope and class. Normal direction across grid axes unpinned. |
| rasters | Path coverage from graph edges, blended surface and ground-cover weights | terrain-detail covers surface detail; travel and castle-understory use path/cover samples indirectly. |
| collision | Footprint edges, pass zones, persistent ruin footprints, set solids and interior overlay | world, camera, scenery and bauwagen cover several shapes and gates. Corner clearance and overlay fallback untested. |
| forest | Seeded trees on level-appropriate ground, exclusion of paths and water, era-specific clearings | world covers seeds and canopy/forest classes; perf-culling covers visibility. Combined exclusion masks untested. |
| water | Detect separate pond levels, sample shores for wading, allow crossing frozen water | nature checks body generation and distance on a single shore; perf-culling covers reflection. Runtime queries near adjacent ponds untested. |
| world | Combine current-era terrain, floor patches, indoor hints and surface overrides; swap foliage, collision and water on shift | Indirect coverage in scenery and interiors. No direct World unit test. |
| palace | Standing structures, open ground, surviving ruin footprints and surfaces | scenery, flaschen, surfaces |
| terrain | Terrain datasets, near-detail geometry and base-surface fallback | terrain-detail |
| vegetation/groundcover | Seeded plants avoid paths, shoreside clearings and open water as tiers and eras change | nature, perf-culling |
| vegetation/scatter | Plant probabilities by habitat, season and slope | nature |
| vegetation/props | Era-appropriate props, habitat and clearings | nature checks prop rules, props-shader checks presentation. |
| vegetation/trees | Tree variants, crown scale and distance levels | nature |
| vegetation/nature | Apply era, detail and clearing changes to vegetation layers | No direct unit test of the coordinator. |
| vegetation/duck | Part plants around nearby enemies | props-shader |
| vegetation/foliage | Keep foliage colour consistent across tree variants and distance | Rendering only. |
| vegetation/strips | Select ground and bark texture layers | nature checks layer tables. |
| eraPresets | Lighting and weather for each era | render-tiers |
| atmosphere | Shared light and fog inputs | props-shader checks shared uniforms. |
| sky | Era sky, clouds and fire glow | Rendering only. |
| surfaces | Map surface types and stream opening/historical layers when needed | surfaces checks mapping, streaming, retries and out-of-order completion. |
| terrainShader | Display relief, ground cover and era overlays | Rendering, with detail inputs checked by terrain-detail. |
| viewCone | Determine which scenery lies in the field of view | perf-culling |
| route | Walking directions and route costs | travel. Solver owned by TASK-026. |
