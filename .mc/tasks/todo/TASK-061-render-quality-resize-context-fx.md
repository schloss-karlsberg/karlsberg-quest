---
id: TASK-061
aliases:
- TASK-061
title: 'Test coverage and bug sweep: rendering, quality and FX'
slug: render-quality-resize-context-fx
status: in-progress
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
updated: 2026-11-26
---

# Rendering and FX lifecycle coverage

## Goal

Pin down what happens to the rendered frame and active effects when the tier, viewport, pixel
density or WebGL context changes. Fix defects demonstrated by the new tests.

## Acceptance criteria

- [x] Inventory every module in `src/render/` and `src/systems/fx/` against existing unit coverage.
- [x] Add at least 25 deterministic assertions across the area. Run the focused suite in about three seconds or less.
- [x] Reproduce each defect before fixing it and record design questions as test todos.
- [ ] Commit each fix separately. The worktree index lock is sandbox-blocked.
- [x] Update the relevant docs and the PRD changelog.
- [ ] Pass the four gates as written. The validator CLI could not bind its IPC socket.
- [x] Run the locked smoke spec on port 5448 if allowed, or record the command and blocker.

## Plan

- [x] Trace renderer, tier, resize, context and effect lifecycle entry points and compare module paths and symbols with the unit suite.
- [x] Exercise the runtime objects using in-memory settings, explicit frame times, bounded pools and GPU-free render calls.
- [x] Reproduce failures on the original implementation, apply minimal corrections and rerun each regression.
- [x] Document results, run all gates, check smoke availability and record follow-ups.

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

### Verification

```text
Focused Vitest    Test Files  8 passed (8)
                  Tests  20 passed | 2 todo (22)
                  Duration  216ms
pnpm typecheck    $ tsc --noEmit                         exit 0
pnpm test         Test Files  132 passed (132)
                  Tests  1625 passed | 3 todo (1628)
pnpm validate     listen EPERM on the tsx IPC socket     exit 1
node --import tsx scripts/validate-content.ts
                  ✓ content valid (1 warning(s))        exit 0
pnpm build        ✓ 471 modules transformed.
                  ✓ built in 316ms                      exit 0
```

Both unit runs had 0 failed. The content warning is in the existing one-fact example case.
The sandbox denied a loopback bind on 127.0.0.1:5448, so smoke and visual WebGL checks were skipped.
No voiced lines require new text.

### Commits

`e8f9b8a chore(render): track rendering and fx coverage sweep` is the branch HEAD. The next
`git add` was denied on the worktree's `index.lock`. The fixes, tests and report are in the
worktree. Use these subjects for the remaining commits and finish each message with a blank line
and `Co-Authored-By: Codex <noreply@openai.com>`.

```sh
record() { git commit -m "$1" -m 'Co-Authored-By: Codex <noreply@openai.com>'; }

git add src/render/post.ts tests/render-post.test.ts
record 'fix(render): preserve bloom levels during additive upsampling'

git add -p src/render/quality.ts  # select only the inactive branch of frame()
git add tests/render-quality-runtime.test.ts
record 'fix(render): reset the slow frame streak while inactive'

git add -N src/render/viewport.ts tests/render-viewport.test.ts
git add -p src/boot.ts  # select the viewport import, binding and QualityManager assignment
git add -p src/render/viewport.ts tests/render-viewport.test.ts  # edit out the empty-size guard and zero-size/recovery assertions
git add src/render/quality.ts
record 'fix(render): resize at the active display pixel ratio'

git add src/render/viewport.ts tests/render-viewport.test.ts
record 'fix(render): preserve the camera projection for empty viewports'

git add src/boot.ts src/render/context.ts src/render/perf.ts src/render/standard.ts tests/render-context.test.ts
record 'fix(render): rebuild cached lighting after context restoration'

git add src/systems/fx/index.ts tests/fx-render-tier.test.ts
record 'fix(render): apply the active graphics tier to fx'

git add src/systems/fx/oblivion/oblivion.ts tests/fx-oblivion-tier.test.ts
record 'fix(render): resize active oblivion effects on tier changes'

git add tests/render-shadows-runtime.test.ts tests/fx-render-pools.test.ts
record 'test(render): cover shadow targets and fx pool limits'

git add .mc/tasks/todo/TASK-061-render-quality-resize-context-fx.md docs/{ARCHITECTURE,PERFORMANCE,ACTION-RPG,PRD}.md
record 'docs(render): record rendering regressions and verification'
```

### Follow-ups

- Decide whether gameplay and threat clocks should pause while the WebGL context is unavailable.
- Decide what the unused `PostFX.enabled` switch should disable, including whether to preserve the
  HDR composite. Both design questions are Vitest todos.
- The FX sampler and its change listener both call `fire.rebuild()` on an automatic FX downgrade.
  Pass that observation to the palace/fire performance sweep.
- Run `pnpm validate` outside the sandbox, then run the only required browser spec:
  `KQ_E2E_PORT=5448 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

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
