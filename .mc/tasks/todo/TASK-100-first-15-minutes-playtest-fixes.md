---
id: TASK-100
aliases:
- TASK-100
title: Fix the first 15 minutes of the guided tour
slug: first-15-minutes-playtest-fixes
status: in-progress
priority: 2
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
created: 2026-11-28
updated: 2026-11-28
---

# Fix the first 15 minutes of the guided tour

## Goal

Address the fresh-game playtest on main at db8b1b8d, through the first visit to the Bleiche.

## Acceptance criteria and plan

- [x] F2. Open passages between car-park visitors, with multi-direction collision regressions.
- [x] F3. Align the coat marker with a working interaction spot and brief the player on approach.
- [x] F5 and F10. Switch goals at the first shift and share the group target between HUD indicators.
- [x] F8 and F9. Pace clink captions and show the full goal as it wraps.
- [x] F12. Deliver the throw hint with the first pickup.
- [ ] F7 and F11. Check the scripted compass grant and recorded dialogue before changing either.
- [ ] Run the four gates and push the branch for review. Update the affected browser specs for CI.

## Progress

- Branch `fix/first-15-minutes`.
- F2. Spaced the gathered arcs for player clearance. The car-park regression reproduced the stall on the baseline and now passes from 16 headings, including starts inside the ring.
- F3. The story and quest point to the existing reach spot behind the second line. The brief starts within 30 m, including during the spring arrival beat. The disguise spec checks the approach and takes the coat from its marked spot.
- F5. The coat objective replaces the trough on the first story tick in 1789 and stays in the HUD through the chapter handover. The runtime and tour spec check both moments.
- F10. The story HUD reads the moving waypoint used by the group marker and uses its distance format. Unit and tour coverage check both indicators.
- F8. The glass sound keeps its cue cadence. The first caption is immediate when the sound plays, and later captions are at least 30 seconds apart.
- F9. Removed the objective text wipe that clipped the line. The tour spec checks the first arrival frame and wrapping in the HUD column.
- F12. The first non-debug chestnut pickup shows the one-time help in the HUD alongside the controls. The unit test exercises desktop and touch with the cut tip and dialogue already active.
