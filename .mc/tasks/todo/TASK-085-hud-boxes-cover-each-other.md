---
id: TASK-085
aliases:
- TASK-085
title: 'HUD boxes cover each other: speech box over the tracker, toast over captions, level card over speech'
slug: hud-boxes-cover-each-other
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- mobile
- accessibility
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# HUD boxes cover each other: speech box over the tracker, toast over captions, level card over speech

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810). TASK-074 kept sound captions clear
of the skill and level cards on phones; these overlaps are still there:

1. **Phone (844×390, touch): the speech box hides the objective tracker.** The radio / speech box
   sits in the top band and covers the tracker (`.kqs-objective` at about 14/29). In the tour
   someone talks almost all the time, so the current objective is hidden most of the time.
2. **Phone: the tip toast covers the sound caption.** The „Laufschritt …“ toast (right of centre)
   was drawn over „Vögel zwitschern.“ (screenshot
   local screenshot `p06-after-walk.png` (not committed)).
3. **Desktop (1309×688): the level card covers the speech box.** At the start of chapter 1 the
   „Stufe III“ card sat on top of Laub's speech box for several seconds, so his line could not be
   read; with `?kapitel=4` the „Stufe IX“ card covered the chapter title card („Der Steinbruch“).
   Not captured on disk; it is visible for a few seconds after the first spring touch that ends
   the tour.

## Acceptance criteria

- [ ] On phones the objective stays readable while someone speaks (the speech box moves, or the
      tracker shows in a free spot or as a one-line strip).
- [ ] Toasts and tip cards never cover subtitles or sound captions (all viewports).
- [ ] The level card waits until the chapter title card and the current speech line are done, or
      takes a slot that covers neither.
- [ ] The mobile UI tour (`scripts/dev/mobile-tour.ts`) gets a state that checks tracker vs.
      speech box.
