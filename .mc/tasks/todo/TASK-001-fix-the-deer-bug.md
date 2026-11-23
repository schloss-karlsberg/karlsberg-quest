---
id: TASK-001
aliases:
- TASK-001
title: Fix the deer bug
slug: fix-the-deer-bug
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- bug
- community
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# Fix the deer bug

## Description

In the guided tour (prologue, `content/story/00-tour.story.json`) the roe deer (Ricke + Kitz) are
currently **not visible**. Make them visible, and make the scripted deer scene actually play when
the player reaches them.

Where the deer live:

- **Spawn:** beat `t9` ("Am Hang entlang") in `content/story/00-tour.story.json` spawns
  `ricke` (x 704, z -779, `shy: notice 30 / flee 20 / settle 25`) and `kitz` (follows `animal:ricke`).
  Beat `t10` ("Ricke und Kitz") is the photo/sneak scene; it starts when Imhoff arrives at the
  route point `reh` (`content/routes/p-fuehrung.json`, x 727.4, z -751.5).
- **Runtime:** `src/systems/animals/runtime.ts` (spawn via `animal:request`, `applyVisible()`,
  era gating via `ANIMAL_ERA`), behaviour core `src/systems/animals/deer.ts`
  (states incl. `flee` / `gone`), story bridge `src/systems/story/index.ts` (`do: "animal"`).
- **Body:** `src/systems/fauna/standin.ts` + `src/systems/fauna/specs.ts` (`reh.ricke`, `reh.kitz`;
  stand-in = the CC0 Quaternius horse, lazy-loaded through `ctx.assets`).
- **Scene:** a deer cinematic already exists at `content/cinematics/reh.json` (camera on
  `animal:kitz`, then `animal:ricke`), loaded by `src/systems/cinematic/data.ts`, but **no story
  beat plays it**. Compare beat `t8`, which plays the inline cinematic `tour.hunde` for the dogs.

Likely causes (unverified, check these first):

1. The deer are spawned at the start of `t9`, while the player and the group are still walking
   towards them. If the herd notices the player (or the walking group) inside the 30 m / 20 m
   radii, the doe flees, reaches state `gone`, and `applyVisible()` hides both bodies before the
   player ever arrives.
2. `fauna.spawn` failing (logged as `[animals] fauna.spawn failed for ...`) or the horse stand-in
   asset not loading, so the slot has no body.
3. The scene in `t10` has no cinematic step, so even when the deer exist the player gets no
   "look, there they are" moment.

Debug aids: `?debug`, `window.kq` (teleport, step), the animals system's `stats()`
(`deer`, `bodies`, `visible`).

## Acceptance Criteria
- [ ] Starting a new game and following the tour, Ricke and Kitz are visible when the group stops at `reh`
- [ ] A short scripted deer scene plays at the start of `t10` (e.g. play `content/cinematics/reh.json`), skippable
- [ ] The existing sneak/photo flow in `t10` still works (photo good, alert, "zu schnell" branches)
- [ ] A unit or e2e test covers the regression (see `tests/animals-deer.test.ts`, `tests/tour-slice.test.ts`, `e2e/animals.spec.ts`)
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- Reported by the owner; root cause not yet confirmed.
- In-game text stays German.
