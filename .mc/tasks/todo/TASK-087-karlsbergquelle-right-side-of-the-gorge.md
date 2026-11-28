---
id: TASK-087
aliases:
- TASK-087
title: 'The Karlsbergquelle: back in view, on the right side of the gorge'
slug: karlsbergquelle-right-side-of-the-gorge
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tour
- quelle
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# The Karlsbergquelle: back in view, on the right side of the gorge

## Goal

Owner feedback (2026-11-28): „the 'spring' is not in the live game anymore (some agent did
delete/remove it). also the spring is on the right side of the 'schlucht'.“

The Karlsbergquelle is the home base, the wake spot and the place of the first time travel. It
has to be a visible, reachable, good-looking place on the tour and in the later chapters, on the
right-hand side of the ravine for people walking up from the Karlsbergweiher.

## Diagnosis

Checked on `main` f8a75ff7 (the live build) with ANGLE Metal, Hoch, Mittel and Niedrig.

1. **Nothing was deleted.** The scenery set `karlsbergquelle` (`src/systems/scenery/quelle.ts`, in
   `WORLD_SETS`) and the water system (`src/systems/quelle/`, registered in
   `src/systems/index.ts`) build in every era and on every tier. 5af21cee (PR #47) retired the hub
   overlay on purpose; the place stayed. 4fe50488 (PR #106) only changed the tour's reach.
2. **The title backdrop shows the hollow without the spring.** Scenery sets and the spring's
   water are built in the fixed steps, and those stand still under the `title` pause (the loop
   since 5d4ce30d). Since 4cd25592 („the Karlsbergquelle is home“) every save rests at the spring,
   so „Weiter“ opens on the spring's ground with no wall, trough or water. A new player (title at
   the Ehrenhof) never saw it; the owner sees it on every start.
3. **It stood on the left.** 83656a78 put the set at the OSM node, backed into the north-east
   flank and facing 234°. The tour comes up the OSM footpath, which runs along that flank: the
   group walked over the slope behind the wall (the route's stop, snapped to the path, lay 2 m
   behind it), and the player saw a dark wall end on the left, half hidden by 15 people.
4. **It did not read as running water.** The brook was a thread of 3 to 9 cm in a dark wet bed
   and the only fall was the 3 cm jet from the pipe.

## Which side

Reference direction: the tour, walking **up** the ravine from the Weiher (p-fuehrung, heading
about 127°).

- OSM: the spring node (local 1061 / −834.5) lies 2.3 m to the **right** of the footpath leg
  1046.6/−848.4 → 1064.2/−835.0, and the Karlsbergbach, which starts at the node, stays on that
  side of the path all the way down. Past the spring the path turns right in a hairpin (apex
  1066.6/−830.8) and climbs back along the south-west flank: the node is inside the bend.
- LiDAR (DGM1, 1 m, sister data read-only): a flat bench about 8 m wide on the floor (the path)
  and, along the foot of the south-west bank, a channel that starts in a hollow 0.4 m deep at
  1058.5 / −830.5 and runs north-west to the Weiher (x − z ≈ 1889).
- The reference description in the old layout („path in front, steps on the left, the trail
  comes up from the Weiher and climbs on the left“) only fits a spring that faces north-east: on
  the old flank „left“ was downhill, where the trail comes from.

So: right-hand side, foot of the south-west flank.

## Acceptance criteria

- [x] Root cause stated with commits (above).
- [x] The spring stands on the right of the tour path: `QUELLE` 1061.0/−834.5 facing 234° →
      **1058.5/−831.0 facing 24°**; trough stand (home spawn) unchanged at 1059.3/−833.1, yaw
      50 → 204.
- [x] Everything on the coordinates follows: home and wakes, chapter checkpoints and anchors,
      tour route, stop and group slots, markers, brook, trail, clearings, relief bake, bottles,
      clue spots, e2e helpers, storyboard cameras.
- [x] It reads from the path: wider running brook, an overflow fall at the trough, ferns and
      mossy boulders in the hollow, the information board first.
- [x] The title backdrop of a save at home builds the spring.
- [x] TASK-081: E „Untersuchen“ at the trough during the find, no facing asked; the marker is on
      the forecourt the arrival trail leads to.
- [x] Unit tests and e2e assertions keep it from vanishing or changing sides again.
- [ ] Owner confirms the side and the look on the real GPU.

## Plan

1. `src/systems/quelle/layout.ts`: new `QUELLE`; `OSM_SPRING`, `TOUR_PATH`, `rightOfTourPath`;
   the brook leaves at the trough's right end (`RUNNEL`); new `TRAIL` strands (fork off the OSM
   path, forecourt, hairpin, steps); `canFind`, `overflow`.
2. `src/systems/scenery/quelle.ts`: board between brook and trail, flat stones at the runnel,
   overflow lip, `HOLLOW_FERNS`, `HOLLOW_BOULDERS`.
3. `src/systems/quelle/`: overflow stream, brook shader (wider run, sky streaks, foam), water
   under the title, `quelle.find` prompt and `quelle:find`.
4. `src/systems/scenery/index.ts`: `TITLE_SETS` built per frame under the title.
5. Content: story yaws and anchors, tour markers and t16, route last leg with 14 slots, clue
   spots in the K2 to K4 builders, codex LiDAR note; `pnpm prepare-data --mesh-detail`.
6. Tests: `tests/quelle-place.test.ts`, `tests/scenery-runtime.test.ts`, updated expectations;
   e2e `tour-slice`, `quelle`; real-GPU spec `e2e/gpu/quelle.gpu.ts`.
7. Docs, four gates, PR, CI.

## Progress

- 2026-11-28: diagnosis on the live commit (real GPU, three tiers): set and water build; title
  backdrop at the home spot builds nothing; before shots in `test-results/contribute/TASK-087/before/`.
- 2026-11-28: steps 1 to 6 done. Relief re-baked (`relief2025.u8.deflate` 220,832 → 220,889
  bytes). `HOME.spawn` keeps its x/z, so the checkpoints of every chapter stay where they were.
- 2026-11-28: took over TASK-081 (same spot).
