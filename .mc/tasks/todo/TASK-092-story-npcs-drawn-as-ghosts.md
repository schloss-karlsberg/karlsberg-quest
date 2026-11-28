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
- [x] The costumes colour the stand-ins' bare limbs: coat sleeves for officials and livery, a linen
      fichu with sleeves and white stockings for the maids (`characters/catalog.ts`).
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

## Measured cost

Apple M5 Pro, ANGLE Metal, 1280×720, uncapped, 240 frames per row, same camera in the Ehrenhof in
1789, `main` against this branch (full table: `docs/PERFORMANCE.md` §3.9). Chapter 1 places ten
people; four stand within 60 m of the Ehrenhof.

| Preset | Scene | Draw calls before → after | CPU ms before → after | Frame ms before → after |
| --- | --- | --- | --- | --- |
| Niedrig | court, k1 people | 132 → 136 | 1.37 → 1.49 | 1.58 → 1.69 |
| Mittel | court, k1 people | 384 → 207 | 2.08 → 2.00 | 2.39 → 2.36 |
| Niedrig | 16 figures in view (not a story scene) | 156 → 279 | 1.40 → 1.56 | 1.60 → 1.78 |
| Mittel | 16 figures in view (not a story scene) | 548 → 420 | 2.53 → 3.01 | 2.79 → 3.30 |

Budget: 300 draw calls and 8 ms CPU per frame. Niedrig stays inside it at the busiest story scene,
so the figures are not made cheaper there. Mittel got cheaper: the ghost look drew every part
twice for all ten figures at any distance. Sixteen figures in view on Mittel peak over 300 draws
with the shadow pass (538; the ghost look: 570); the story never places that many together.

## Open points for the owner

- The CC0 bodies are modern cuts (bare arms, a sleeveless knee-length dress, no mob cap on the
  woman model, a wide flat tricorn). The smoke hid that. Sleeves, fichu and stockings are now laid
  over the bare limbs by colour; real period bodies are an art task.
- The Ehrenhof's set dressing still has ghost figures of its own in 1789 (crowd silhouettes, the
  coach and its horse). They come from other systems and were left as they are.

## Progress

- 2026-11-28: reproduced on a real GPU (ANGLE Metal); cause found; solid look implemented; tests
  added.
- 2026-11-28: real-GPU review (ANGLE Metal, 1280×720, Hoch and Niedrig, build + preview), before
  from main and after: Marlene at the pond beside two tour members, the Hofgärtner on the Orangerie
  lawn, all 16 roster figures in two rows, the chapter 1 court, the kneeling Pikeur today (still a
  ghost). After: every drawn part of a solid figure is a standard material, not transparent,
  opacity 1. `e2e/npc.spec.ts` passes locally on SwiftShader (Niedrig).
