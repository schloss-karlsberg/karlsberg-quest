---
id: TASK-081
aliases:
- TASK-081
title: '„Nachsehen, was im Trog glänzt“ gives no prompt and only fires when facing the trough'
slug: trough-find-has-no-prompt
status: review
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- tour
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# „Nachsehen, was im Trog glänzt“ gives no prompt and only fires when facing the trough

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, desktop). At the Quelle (t16) the
objective „Nachsehen, was im Trog glänzt“ points to about 1058.5/−832.5. Coming up the path from
the east, the trough wall is between you and the marker, and walking at the marker stops at
about 4 m. Standing exactly on the marker facing away does nothing either: no E prompt, no
hint. The find fired only after turning the camera to face the trough (about 50°). A player can
stand there for a while without knowing what to do.

## Acceptance criteria

- [x] Near the trough the player gets a clear action: an „E Untersuchen“ prompt, or a gaze
      trigger with a wider angle plus a hint after a few seconds („Schau in den Trog“).
- [x] The marker leads to a spot the player can reach from the arrival path without walking into
      the trough wall.
- [ ] The tour e2e still reaches t17 (hosted run on the PR).

## Cause

t16 completed only by walking into a 1.45 m circle before the trough, after 10 s. The spring
stood on the far flank from the arrival path, so the group's stop lay behind the wall and the
straight walk to the marker ran into it. There was no prompt at all; the playtester's „facing the
trough“ was the walk round the wall into the circle.

## Plan

Done together with TASK-087 (same spot, same PR).

1. The spring moved to the right-hand flank; the arrival trail now ends on its forecourt and the
   marker (1059.6/−833.8) is on it, 1.9 m before the trough.
2. `quelle.find` (set when the glint shows, 9 s into t16; cleared on exit and on leaving the tour)
   lets the spring offer E „Untersuchen“ within 3.25 m before the trough, whichever way the
   player looks (`canFind` in `src/systems/quelle/layout.ts`); E emits `quelle:find`.
3. t16 completes on `quelle:find` or, as before, by walking up to the trough after 10 s.
4. Tests: `tests/quelle-place.test.ts` (markers, reach, the beat's wiring), `e2e/tour-slice.spec.ts`
   (beside the trough with the back to the water: prompt, the beat waits, E → t17).

## Progress

- 2026-11-28: steps 1 to 4 done in the TASK-087 branch.
