---
id: TASK-092
aliases:
- TASK-092
title: Story NPCs are drawn semi-transparent like ghosts
slug: story-npcs-drawn-as-ghosts
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- npc
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Story NPCs are drawn semi-transparent like ghosts

## Goal

Found in the real-GPU playtest of 2026-11-28 (main f8a75ff7, desktop Chrome, finding F9). Marlene
at the pond in the tour (today) is drawn semi-transparent with a mist patch at her feet, next to an
opaque tour group; she also wears a tricorn. The Hofgärtner on the Orangerie lawn in 1789 looks the
same. People must be solid unless a deliberate effect is running, and that effect must end.

## Cause

No fade was stuck (`kq.npc.list()` reports `alpha: 1`). The npc system has only one way to draw
a placed person: `place()` in `src/systems/npc/index.ts` builds a `GhostFigure` for every
placement, a translucent smoke silhouette with mist and motes (`figure.ts`), or the ghost shader
on the rigged body on medium / high (`rigged.ts`). That was the design while the people of the
1790s appeared as memories. Since the tour redesign the player travels in time and stands among
living people, and Marlene is a forester of today. `NpcPlacement.look` (`'ghost' | 'solid'`) was
already in the contract, but its comment said „until then every figure is a ghost“ and nothing
read it. Marlene had no roster entry either, so she got the generic official with a tricorn.

Who shared the cause: every figure placed through `npc:spawn` without a live person bound to its
speaker. That is Marlene (tour, today) and all period people of chapters 1 to 4: Hanne, Soll, Jost,
Peter, Matthes, the Gärtner, the Diener, Liese, the Hofgärtner, both Gardisten, the Lakai, the Mann
aus dem Dorf, Mannlich and the Herzog. The guide and the doubles were not affected (bound to
people bodies). Not changed here, because they are deliberate crowd and echo effects of their own
systems: the K3 ghost crowd (`fx/k3-ghosts.ts`), the quarry workers (`scenery/workers.ts`), the
Chronik echoes and the people system's twins.

## Plan (approved)

- [x] `npc/look.ts`: a placement is solid unless it asks for `look: 'ghost'`; only a ghost kneels.
- [x] `npc/solid.ts` `SolidFigure`: the rigged CC0 body in the roster costume with opaque,
      world-lit materials on every quality tier, hats, props and the pike included; no mist, no
      motes. It dithers in over 0.35 s once the model is in and ends at exactly opacity 1; hidden
      beyond the people draw limit; a capsule if the model fails to load.
- [x] `npc/rigged.ts` `RiggedNpc` draws either look; the ghost path is unchanged.
- [x] Marlene gets a roster figure with the body and colours of her party stand-in.
- [x] Story: the `npc` action passes `look`; the validator checks it and rejects a kneeling solid
      person. The one deliberate ghost keeps its look: the old Pikeur at the kennel today (k4_13).
- [x] Tests: `tests/npc-look.test.ts` (look rule, fade maths, materials of every roster figure on
      the real models, the story's placements, the validator), `e2e/npc.spec.ts` (Marlene and the
      Hofgärtner: every drawn part opaque with depth write after the fade; the Pikeur still a ghost).
- [x] Docs: `docs/ARCHITECTURE.md` (npc), `docs/ART-DIRECTION.md` §6 and §21,
      `content/story/README.md`, `docs/PRD.md`.

## Acceptance criteria

- [x] Marlene (today) and the Hofgärtner (1789) are opaque on the low and the high tier (real-GPU
      before / after screenshots reviewed).
- [x] A solid person's opacity is exactly 1 once the 0.35 s fade has run, and stays 1.
- [x] The Pikeur's ghost at the kennel still reads as a ghost and still kneels.
- [x] The four gates pass; the hosted e2e run on the PR is green.

## Progress

- 2026-11-28: reproduced on a real GPU (ANGLE Metal); cause found; solid look implemented; tests
  added.
