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
- [ ] F3. Align the coat marker with a working interaction spot and brief the player on approach.
- [ ] F5 and F10. Switch goals at the first shift and share the group target between HUD indicators.
- [ ] F8 and F9. Pace clink captions and show the full goal as it wraps.
- [ ] F12. Deliver the throw hint with the first pickup.
- [ ] F7 and F11. Check the scripted compass grant and recorded dialogue before changing either.
- [ ] Run the four gates and push the branch for review. Update the affected browser specs for CI.

## Progress

- Branch `fix/first-15-minutes`.
- F2. Spaced the gathered arcs for player clearance. The car-park regression reproduced the stall on the baseline and now passes from 16 headings, including starts inside the ring.
