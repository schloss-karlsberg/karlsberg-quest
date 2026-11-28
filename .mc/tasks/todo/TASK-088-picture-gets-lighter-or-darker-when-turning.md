---
id: TASK-088
aliases:
- TASK-088
title: 'The picture gets lighter or darker when the view turns'
slug: picture-gets-lighter-or-darker-when-turning
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- render
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# The picture gets lighter or darker when the view turns

## Goal

Owner feedback (2026-11-28): „we have a 'visual bug' sometimes when the player rotates
(light/darker).“ While the player turns the view on the spot, the picture sometimes gets visibly
lighter or darker. A playtester saw the same on main f8a75ff7 (Chrome, real GPU): a hard
one-frame pop of the sun shadows on ground, trunks and avatar in the present day on Mittel and
Hoch, dark while looking through south and west, bright in the other half, the switching yaw
shifting by up to 20° between runs.

Find it by measuring, fix the cause, keep the frame cost.

## Acceptance criteria

- [x] A measurement that turns the view through 360° at fixed spots and reads back every frame's
      luminance, on the real GPU, for all three tiers and the eras.
- [x] The jumps are attributed to their causes and gone after the fix (before / after curves).
- [x] No visible loss of quality, frame cost compared at the same spots.
- [x] A regression test for each cause.

## Plan

1. `e2e/gpu/turn-luma.gpu.ts`: at each spot three passes over 360° in 2° steps (a steady turn in
   each direction at 120°/s, and every yaw after the view has rested), per frame the mean display
   luminance of the whole frame and of its thirds, with the state that can explain a step (tree
   lists, ground cover, lens position, haze, reflection, casters, triangles).
2. Attribute every large step, look at the frame pairs, fix the causes one at a time and sweep again.
3. Unit tests on the logic, one cheap e2e case per cause for the hosted runner.

## Result

Three causes, measured on an Apple M5 Pro (ANGLE Metal, headless Chromium, 1280 × 720, `?manual`).
Luminance is the mean of the frame on the display's 0..255 scale; a typical 2° step is 0.2–0.4.
The playtester's repro (dark half centred on the sun, the switching yaw shifting by up to 20°)
is cause 1: the sweep found the steps at the rebuilds, 90–110° either side of the sun's azimuth.

1. **Trees out of view stopped casting** (Mittel and Hoch, wherever forest stands sunward).
   `Forest.update` (`src/world/forest.ts`) rebuilds its instance lists for the view sector
   (half-FOV + 40°) after every 20° of a turn, and the shadow caster lists (lod1 and impostor
   alike) were filled from the same cut. The sun stands 19° up, so a tree behind the camera
   shades the ground in front of it: each rebuild switched those shadows on or off. Fix: a tree
   the picture leaves out stays a caster (`ModelTrees.cast`) while its shadow can fall into the
   shadow box and into the picture (`castGap`, `shadowInSector`).
2. **Casters were picked by a disc, box + 30 m** (Mittel and Hoch). A 25 m tree throws its shadow
   70 m, so trees on the sun's side joined and left the casters with their shadow already well
   inside the box, as the box moves with the view: a 10 m patch of ground flashed lit or shaded.
   Fix: a tree casts while its shadow, foot to tip, comes within the box's radius plus a crown
   (`castGap` in `src/world/vegetation/trees.ts`, the same rule in the vertex shaders); the
   pass's box is set before the pass (`src/render/shadows.ts`).
3. **The haze under the trees followed the lens** (all tiers). `World.frame` took the tree cover
   under the camera, which circles the character 3.6 m out: at a forest edge a turn on the spot
   moved the haze between 0.5 and 1.0, eased over about a second. On the present-day paths 89
   spots of a 4 m grid do this; between open and closed cover the same frame differs by 2–8.
   Fix: the cover is taken where the character stands (`src/boot.ts` passes it as `stand`).

Largest step between two neighbouring yaws, before (main f8a75ff7) → after, lens cuts left out:

| Place | Mittel | Hoch | Niedrig |
|---|---|---|---|
| Palace plateau | 28.8 → 1.1 | 28.5 → 1.2 | 0.8 → 0.8 |
| Weiher | 15.8 → 2.3 | 15.8 → 2.0 | 1.2 → 1.2 |
| Forest at the corps de logis | 11.9 → 1.6 | 11.7 → 1.6 | 1.3 → 1.3 |
| Forest edge (1216 / −1052) | 11.5 → 1.9 | 11.7 → 2.2 | 2.8 → 1.5 |
| Quelle | 5.6 → 1.5 | 10.5 → 1.2 | 1.3 → 1.3 |
| Felsenpfad | 7.6 → 3.1 | 7.7 → 3.1 | 3.2 → 3.2 |
| Car park | 1.4 → 1.4 | 1.4 → 1.4 | 0.9 → 0.9 |

The historic eras showed no step of cause 1 at the places swept (1789: Ehrenhof, palace door,
Weiher, Quelle; a forest edge in 1789, 1793-02, 1793-07 and 1796), before or after. The code
path is the same in every era, so it would show wherever forest stands sunward of an open view.
Cause 3 is the same in every era (haze 0.51–1.00 → one value at that forest edge).

Frame cost (all 16 places and the look pairs: `docs/PERFORMANCE.md` §3.10). The casters added
by 1 are a fifth of the shadow pass where the sun stands behind the camera. They are paid for by
the trees the new rules leave out (down-sun of the box, or with their shadow pointing away
behind the camera) and by the casters' own impostor ring (`CAST_N1` 60 · k instead of 72; look
pairs at seven views per tier differ by 0.03–0.5 of 255 on average). Over the seven present-day
places the frame draws 1.525 M → 1.516 M triangles on Hoch and 1.009 M → 0.999 M on Mittel, the
shadow pass 446 k → 436 k and 292 k → 282 k; the largest peak is 1.89 M → 1.93 M on Hoch (plateau,
sun at the back), unchanged on Mittel. Draw calls are the same within one. Frame time
(`kq.bench`, uncapped, baseline and branch alternately in one hold): today-forest 4.10 → 4.15 ms
on Hoch and 2.71 → 2.66 ms on Mittel, GPU timer 10.3 → 10.2 ms and 5.5 → 5.7 ms; the other four
scenes agree to 0.07 ms.

Not lighting, the same before and after, left as they are: at the Quelle the lens cuts in when
its boom meets the spring house's wall or the ravine's slope (`src/player/camera.ts`, by design;
up to 30 in one frame in 1789, when the character then fills the frame); a trunk at the lens is
dithered away (see-through, 3–4 at the forest edges); a signpost leaves the frame's corner at the
Felsenpfad (3.1); the sun and a quest beacon enter the view (1–2).

Ruled out by the sweep: tone mapping and bloom (no adaptation in the pipeline; on Niedrig only
steps where the lens moves or the haze changed), the planar water reflection (it fades in
between 2 % and 4 % coverage, no step at the Weiher on Hoch), the auto-downgrade (off in the
sweep; in play it needs six slow seconds and shows a toast), ground cover and terrain LOD
rebuilds (no step with them alone).

Checks: `tests/forest-casters.test.ts` (the reach rule, casters for every yaw, a turn and a walk
between rebuilds, the sun), `tests/world-canopy.test.ts`, `e2e/turn-light.spec.ts` (haze by yaw on
Niedrig; on Mittel a rebuild of the tree lists leaves the frame as it was: 0.03 against 27.5 with
the old behaviour as the control, SwiftShader). Tool: `e2e/gpu/turn-luma.gpu.ts`
(`docs/PERFORMANCE.md` §2). Docs: `docs/ARCHITECTURE.md` (forest culling, model trees),
`docs/PERFORMANCE.md` §3.10.
