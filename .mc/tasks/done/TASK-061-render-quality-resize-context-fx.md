---
id: TASK-061
aliases:
- TASK-061
title: 'Test coverage and bug sweep: rendering, quality and FX'
slug: render-quality-resize-context-fx
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- render
- fx
- tests
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Rendering and FX lifecycle coverage

## Goal

Pin down what happens to the rendered frame and active effects when the tier, viewport, pixel
density or WebGL context changes. Fix defects demonstrated by the new tests.

## Acceptance criteria

- [x] Inventory every module in `src/render/` and `src/systems/fx/` against existing unit coverage.
- [x] Add at least 25 deterministic assertions across the area. Run the focused suite in about three seconds or less.
- [x] Reproduce each defect before fixing it and record design questions as test todos.
- [ ] Commit each fix separately. Not met: the sandboxed round could not commit, so the first fixes
  landed together in `2aeeb2e`. History is not rewritten.
- [x] Update the relevant docs and the PRD changelog.
- [x] Pass the four gates as written.
- [x] Run the locked `fx` and smoke specs on port 5448.
- [x] Review round: restore the cached tree silhouettes before shadow and scene draws, and restore sky lighting before water reflections.
- [x] Review round: build the replacement Steinfraß terrain cloud across frames and keep the existing cloud visible until the swap.
- [x] Review round: apply viewport dimensions and pixel ratio in one buffer update and skip unchanged sizes.
- [x] Review round: replace the stale commit handoff, verify the findings with regression checks, and rerun the gates and locked smoke spec.

## Plan

- [x] Trace renderer, tier, resize, context and effect lifecycle entry points and compare module paths and symbols with the unit suite.
- [x] Exercise the runtime objects using in-memory settings, explicit frame times, bounded pools and GPU-free render calls.
- [x] Reproduce failures on the original implementation, apply minimal corrections and rerun each regression.
- [x] Document results, run all gates, check smoke availability and record follow-ups.

### Review round (2026-11-26)

- [x] Verify the branch and baseline, then cover first-frame WebGL recovery with recorded draws of the tree atlas, shadows, sky and water reflection.
- [x] Extend the active Steinfraß test to observe bounded work, staged geometry replacement and cancellation.
- [x] Record the drawing-buffer call count for density changes and duplicate resize events.
- [x] Update the render docs, replace the stale handoff, and record gates and commits.

## Progress

Started on `dev/task-061` at `79c5718`, matching local `origin/main`.

### Results

The inventory covers all 56 original files. Eight focused Vitest files add 133 assertion sites
using explicit frame steps, in-memory settings, seeded geometry and recorded draw calls. In
addition to the regressions below, coverage includes MSAA reallocation, physical post-target
sizes and pass selection, persistence of the shadow preset, shadow target replacement, weather
budgets across eras, an overflowing crowd batch and the four-slot collapse burst pool.

| Area | Failing observation before the fix | Corrected behaviour |
| --- | --- | --- |
| Bloom | All four additive upsample draws started by clearing their destination. | Each draw adds to the finer mip already there. The caller's clear mode is restored. |
| Display density | A move from DPR 1 to 2 at 80% resolution left the renderer at 0.8. | The viewport observes successive resolution changes and resizes the renderer and post targets with the current preset and slider. |
| Empty viewport | A 0 × 0 window made the camera projection non-finite. | Keep the last projection until the window has a drawable size. |
| Automatic tier | Five slow seconds before a pause counted toward a downgrade just after resuming. | An inactive frame breaks the streak. Six consecutive seconds of slow play can still downgrade and persist the new tier. |
| Context restoration | In the same era the sky was captured just once across loss/restore. Both map schedules allowed reuse and the GPU timer polled a query issued before loss. | Regenerate the sky and active maps, drop old queries, reacquire enabled timing and request a frame even for a held view. |
| FX tier | A low session override over a high preference, or an unsaved low device fallback, built a 29,929-vertex scan. | Use the low 13,456-vertex scan and keep the saved preference available for the next session. |
| Active Steinfraß | A high-to-low switch kept 2,600 dust slots, 110,000 ruin grains and 106,800 terrain points in the fixture. | Switch to 1,200 dust slots, 45% of the ruin grains and the lower-density terrain cloud. Changing back preserves meter progress and duration. |

### Review round

| Finding | Resolution |
| --- | --- |
| Distant trees lose their impostor atlas after WebGL restoration | The restore handler invalidates the atlas. `renderWorldMaps` bakes it again before the shadow, reflection and main passes, but only while the model trees are shown (`75f1580`). |
| Tier change during the Steinfraß stalls a frame | The replacement terrain cloud is built by `TerrainCloudJob` in 2 ms slices while the old cloud stays visible (`959b331`). |
| Water reflection samples the erased sky on the first restored frame | `renderWorldMaps` rebuilds the sky lighting before the shadow and reflection passes (`75f1580`). |
| A density change resizes the drawing buffer twice | One `setDrawingBufferSize` call applies size and pixel ratio, and unchanged sizes are skipped (`959b331`). |
| Stale commit handoff | Replaced by the commit list below. |

### Verification

```text
pnpm typecheck    exit 0
pnpm test         Test Files  132 passed (132)
                  Tests  1629 passed | 3 todo (1632)
pnpm validate     ✓ content valid (1 warning(s))
pnpm build        ✓ built
e2e fx            7 passed (3.6m)
e2e smoke         7 passed (2.1m)
```

The unit run had 0 failed. The content warning is in the existing one-fact example case. No voiced
lines require new text.

### Commits

All work is committed on `dev/task-061`:

- `e8f9b8a chore(render): track rendering and fx coverage sweep`
- `2aeeb2e fix(render): cover quality tiers, resize and context loss` (bloom, display density, empty
  viewport, automatic tier, context restoration, FX tier, active Steinfraß, tests and docs)
- `959b331 fix: address review findings for TASK-061` (sliced Steinfraß relief, single buffer
  resize, review tests)
- `75f1580 fix(render): rebake the tree atlas and sky before restored map passes`
- the commit that adds this report

### Follow-ups

- Decide whether gameplay and threat clocks should pause while the WebGL context is unavailable.
- Decide what the unused `PostFX.enabled` switch should disable, including whether to preserve the
  HDR composite. Both design questions are Vitest todos.
- The FX sampler and its change listener both call `fire.rebuild()` on an automatic FX downgrade.
  Pass that observation to the palace/fire performance sweep.

## Coverage inventory at 79c5718

Checked module paths and exported symbols against `tests/*.test.ts`, then read the matches.
Names in the last column omit `.test.ts`. A dash indicates no runtime unit coverage found.
Rendering and FX do not grant rewards. Settings survive reloads, threat meters have saved
slices, and short-lived GPU resources and particle effects live in the current session.

| Render module | Player or diagnostics contract | Existing coverage |
| --- | --- | --- |
| mobileDefaults | Phone, tablet and mobile GPU first-run tier | touchMap |
| quality | Session override, saved tier, fallback, MSAA, DPR, power saving, LOD, listeners and sustained slow play | render-tiers and perf-settings cover pure decisions, not manager transitions |
| post | Physical target sizes, MSAA replacement, optional AO, additive bloom and final grade, including at tiny sizes | — |
| shadows | Caster selection, fitted map, reuse, tier change, disabling and re-enabling shadows | render-tiers and perf-settings cover selection and the reuse decision |
| standard | Shared era lighting on imported materials, regenerated sky reflections when GPU data becomes invalid | props-shader and character-toon cover shader patches |
| perf | HUD and benchmark measurements, empty and wrapped frame history, clocks after idle and optional GPU timer | perf-settings covers frameStats |

Boot owns the window resize listener, camera aspect, held-frame redraw and wiring of tier changes
to shadow configuration. The renderer library handles the canvas loss/restore events internally.
No existing unit test exercises display-density changes or application-owned data after restoration.

| FX module | Behaviour | Existing coverage |
| --- | --- | --- |
| index | Bind tiers, shift, threat and scan events, resume saved threats, stop threats in other eras | — |
| quality | Forced and automatic particle tier, sustained slow frames and change notifications | fx-effects covers initial flags |
| ambient/ambient | Era-specific weather, roof shelter, tier budgets, nearby embers and shift fade | scenery covers roof selection and containment |
| audio | Shift and scan tones, fire and grain loops, collapse and cough cues | — |
| geom | Seeded placements and distances to areas and outlines | fx-effects, fx-fire, bauwagen |
| gl | Screen passes, billboard geometry, point size after resize, resource disposal | — |
| palacePatch | Compose palace shader effects once without losing the previous patch | — |
| ui | Threat gauges, compass overlay and rate-limited captions | Stubbed in shift-lifecycle |
| fx.css | Gauge, caption and effect overlay layout | — |
| strings | German threat and shift feedback | — |
| fire/emitters | Seeded facade, roof and smoke positions and unit associations | fx-fire |
| fire/fire | Threat start/stop, holds, quality rebuild, capture and reload | fx-fire and k3-fire-hold cover underlying simulation |
| fire/firemap | Floor selection and changing burn/soot texels | fx-fire |
| fire/palaceGlow | Apply and release fire textures on palace materials | — |
| fire/schedule | Ignition order and timed collapse by room | fx-fire, k3-fire-hold |
| fire/shaders | Window glow, flames, smoke, embers, halos and burst lifetime | — |
| fire/sim | Clock, smoke, crouching, gentle mode, collapse and hold | fx-fire, k3-fire-hold |
| fire/visuals | Per-source particle budgets, bounded collapse bursts, flash decay and disposal | — |
| k3-blaze | Strongest visible smoke columns and tier-scaled plume detail | k3-stage covers column selection |
| k3-crowd | Crowd and cart placement over time in the court | k3-stage, scenery |
| k3-ghosts | Bounded instance batches and poses for crowd figures and carts | — |
| k3-stage | Start, advance and tear down the crowd, torch and blaze on cues | k3-stage covers cue content and component calculations |
| k3-torch | Flight to the nearest court window and outward ignition | k3-stage |
| oblivion/dust | Bounded grains on the advancing rim, off at an empty meter, fewer in reduced motion | — |
| oblivion/oblivion | Blended fog and dust, remembering, meter, capture, restoring the look on stop | fx-effects covers underlying meter |
| oblivion/sim | Meter growth, relief radius, remembering and clamping | fx-effects |
| scan/pulse | Drape over terrain, retrigger and expire, reduced-motion reveal | fx-effects covers only the drape |
| shift/instant | Immediate shift, event order, reason and count | fx-shift-reason |
| shift/pointcloud | Sample both terrain eras, silhouette trees and palace within a budget | fx-effects, fx-warm-slices cover terrain samples |
| shift/prewarm | Register and replace destination stand-ins, reuse and dispose | fx-prewarm-registry |
| shift/reveal | Objects stay hidden behind the veil and reappear in time | fx-warm-reveal |
| shift/shaders | Point-cloud, veil, fade and rewind appearance | — |
| shift/shift | Movement lock, midpoint switch, completion and capture count | shift-lifecycle |
| shift/slices | Frame budget and suspension of warm-up jobs | fx-warm-slices |
| shift/timeline | Full and reduced transition timing and cover at midpoint | fx-effects, fx-warm-reveal |
| shift/warm | Destination selection, incremental upload and release while shifting | fx-warm-slices covers policy |
| stage/common | Shared materials, points, scale and temporary loan of a colour grade | — |
| stage/index | Cue dispatch, holds, teardown on shift/load/capture | — |
| stage/end-memories | World memory shots during the burn ending, return to the prior view | — |
| stage/end-prints | Frost and ring or trail of prints on the ground | — |
| stage/k1-papers | Sheets whirl out and disappear, with reduced-motion sizing | — |
| stage/k2-abfahrt | Wagons and torchbearers depart during the departure memory | — |
| stage/k2-candle | Window candle, flash preference and teardown on shift | — |
| stage/k2-door | Keyhole camera, posed memory and release of the view | — |
| stage/k2-frost | Compass frost grows and thaws with the chapter | — |
| stage/k2-reiter | Riders pass the player and continue after the last line | — |
| stage/k4-1840 | Lantern, surveyor and eyes appear in the fog and flee | — |
| stage/k4-quader | Stone blocks assemble before the boss and fade | — |
| stage/k4-rewind | Carts reverse and stones rebuild a wall within the cue duration | — |
| stage/stage.css | Frost, keyhole and staged overlay presentation | — |

## Closed (audit 2026-11-28)

Merged in PR #91. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
