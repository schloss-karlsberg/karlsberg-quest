---
id: TASK-080
aliases:
- TASK-080
title: 'Tour deer are hard to see from the sneak path'
slug: tour-deer-hard-to-see
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- tour
- photo
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Tour deer are hard to see from the sneak path

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, real GPU, desktop 1309x688). The
roe doe and fawn are the tour's first wow moment. From the sneak path (11 to 14 m, the path is
about 2 m above them) the grey, grazing animals are almost invisible: in third person and in the
viewfinder at 1× they read as two small grey rocks among the ferns inside the objective ring.
Only at 2× zoom did they read as deer (screenshot below). A first-time player sees a marker ring
with "nothing" in it, and the game's own „Tipp“ toast appears.

Screenshot at 2× (1× shows only ferns at this size):
`/private/tmp/claude-501/-Users-sebastian-develop-experiements-karlsberg-quest/39f9dec0-f81c-46df-91c2-f012b96a53a5/scratchpad/playtest/shots/d02-deer-viewfinder-2x.jpg`

The deer meshes were present and visible (`kq.fauna.list()`: ready, visible, 0.75 / 0.68 m), so
this is staging, not a render bug.

## Acceptance criteria

- [ ] From the point where „geduckt anschleichen“ starts, the doe is clearly recognisable in
      third person (for example: thin the ferns around 698/−773, let the doe lift her head when the
      player arrives, a short look-at in the t10 cinematic, or slightly warmer coat contrast).
- [ ] The photo at 1× from about 12 m still earns at least two stars.
- [ ] Winter coat and roe-deer look stay as designed (grey, no spots).
