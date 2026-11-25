---
id: TASK-001
aliases:
- TASK-001
title: Fix the deer bug
slug: fix-the-deer-bug
status: in-progress
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
updated: 2026-11-25
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

## Plan
_Status: approved 2026-11-25_

**Root cause (reproduced 2026-11-25, dev build, `?debug`):** the deer exist and are drawn. Both
bodies spawn (`kq.fauna` ready, no fallback, no `fauna.spawn failed`), stay `graze` while the group
walks (the route never comes closer than ~36 m, outside the 30 m notice radius; a flight would end
`settled`, never `gone`, so likely cause 1 is ruled out, and so is cause 2). They are simply too
small to see: 36 m down the slope in the tour's haze, both together cover **29-49 px** of a 960×540
frame in the normal 80° view, brown on brown. Nothing points the camera at them (cause 3). Played at
the stop, `content/cinematics/reh.json` (fov 18) brings them to **~1,300-1,460 px**, fully
unoccluded. But its eye is player-relative: from 23 m before the stop (inside Imhoff's 25 m wait
radius) the same shot is **fully occluded (0 px)**.

**Approach:** Play the deer cinematic at the start of `t10`, while Imhoff says "Pssst. Da unten."
Give `reh.json` a fixed eye at the group's `reh` stop (a step ahead of it toward the deer, clear of
Imhoff and the group) instead of the player-relative one, so the shot works wherever the player
stands when Imhoff arrives. The timing
stays as it is (6 s, fov 40 → 18, kitz then ricke), so the cinematic tests keep their numbers. The
sneak prompt waits until the shot is over. Regression: a unit test on the tour data and an e2e test
that measures how many pixels the deer cover during the shot.

**Files to touch:**
- `content/cinematics/reh.json` - absolute eye at the `reh` stop (same keys, same 6 s).
- `content/story/00-tour.story.json` - `t10` enter: `{ "do": "cinematic", "id": "tour.reh", "ref": "reh", "skippable": true }` after the hold; delay the [C] prompt past the shot.
- `tests/tour-slice.test.ts` - `t10` plays `reh` (skippable) before the sneak prompt; its look targets are the deer `t9` spawns; its eye is at the `reh` route stop.
- `e2e/animals.spec.ts` - new test (d): deer as in `t9`, the `reh` shot held at 3 s and 6.5 s, from the stop and from 23 m before it; the deer cover > 300 px (render with / without the deer, read back).
- `docs/design/tour/slice-v0.md` - `t9-t10` row: mention the cinematic.
- this task file - plan and progress.

**Steps:**
- [x] 1. `reh.json`: eye `{ "x": 725.8, "z": -753.4, "y": 1.6 }` on key 0 (2.5 m from the stop toward the deer, see Progress); keep t / fov / look.
- [x] 2. `00-tour.story.json` `t10`: add the cinematic after `npc hold`; `delay` on the [C] prompt (about 6.5 s) so it shows after the shot.
- [x] 3. Unit test in `tests/tour-slice.test.ts` (fails on today's data, passes after 1-2).
- [ ] 4. e2e test (d) in `e2e/animals.spec.ts` (pixel coverage; fails today from 23 m before the stop and without the cinematic).
- [x] 5. Manual check in the dev build: new game → tour → `t9`/`t10`; shot plays, Esc / any key skips, then sneak + photo (good, alert, "zu schnell").
- [x] 6. Docs row in `slice-v0.md` (plus the ACTION-RPG §14 row and the PRD changelog, per implement.md).
- [ ] 7. Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`; `pnpm build && pnpm exec playwright test e2e/animals.spec.ts --workers=1`.

**Test plan:** unit: `pnpm exec vitest run tests/tour-slice.test.ts tests/cinematic-keys.test.ts
tests/cinematic-system.test.ts`. e2e: `e2e/animals.spec.ts` with one worker. Manual:
`http://localhost:5280/?debug&nosave&fresh`, start the tour, `kq.story.goto('tour','t9')`, follow
Imhoff to `reh`; watch the shot, skip it once, then sneak [C] and take a photo [N]. Screenshots
(before / after, `test-results/contribute/TASK-001/`): view from the `reh` stop at the start of
`t10` (before: `before-1-stop-t10.jpg`, deer not visible); after: the same moment, mid-shot.

**Risks:** the camera cuts to the stop when the player is up to 25 m away (a cut, then the 0.4 s
hand-back; fine for a cut-scene). If the player spooked the deer before `t10`, the shot follows them
to where they settled and may be blocked by trees (no fail state; the marker still leads there).
Pixel thresholds in e2e depend on resolution and SwiftShader; keep them generous. Local Node is 22,
CI uses 24.

**Open questions:** none. (e2e needs Playwright's Chromium, `pnpm exec playwright install
chromium`: approved by the contributor 2026-11-25.)

## Progress
- Branch: `fix/task-001-deer`
- 2026-11-25: steps 1-2 done - `reh.json` eye fixed at the `reh` stop; `t10` plays `tour.reh` (ref `reh`, skippable) after the hold, [C] prompt delayed 6.5 s. `pnpm validate` and the cinematic / tour unit tests green.
- 2026-11-25: step 3 done - `tests/tour-slice.test.ts` "t10 opens on the deer" (shot eye at the stop, targets spawned in t9, cinematic before the [C] prompt, prompt delay ≥ shot length); fails on the old data (player-relative eye), passes now.
- 2026-11-25: plan adjusted - the eye moved from the stop itself to 2.5 m toward the deer (725.8 / -753.4, 1.6 m): Imhoff stands on the stop and the group gathers round him, so an eye on the stop sat in his head and group members covered 12-17 % of the frame. From 1.5 m ahead on, people cover 0 % (render read-back, group warped to `reh`), and the deer cover ~1,900 px of 768×576 instead of ~1,450. Unit test now checks the eye is 1-4 m from the stop and closer to the doe.
- 2026-11-25: step 5 done (dev build, `?debug`): `t9` → player 23 m back on the route → `npc:arrived imhoff reh` → `t10` plays `tour.reh` once (Imhoff's "Pssst" line runs over it), deer 1,902 px / people 0 %; a real key press skips it (`cinematic:end {skipped: true}`), the beat stays `t10`, the [C] prompt shows after the shot. The photo / alert / "zu schnell" branches are unchanged story logic, covered by `tests/tour-slice.test.ts`. Note: the Browser-pane screenshot crops the frame under viewport emulation; `scripts/dev/shot.mjs` needs `&manual` here or `page.screenshot` times out under SwiftShader. Before / after: `test-results/contribute/TASK-001/before-1-stop-t10.jpg`, `after-1-reh-shot.png`.
- 2026-11-25: step 4 written - `e2e/animals.spec.ts` "animals (d)"; not run yet.
- 2026-11-25: step 6 done - docs: `slice-v0.md` t9-t10 row, ACTION-RPG §14 row, PRD changelog row.
- 2026-11-25: gates (Windows 11, Node 22.18): `pnpm typecheck` green, `pnpm validate` green (1 pre-existing warning in `content/examples`), `pnpm build` green. `pnpm test`: 1,481 passed, 4 failed in `tests/content-packs.test.ts`, `voice-moss`, `voice-assets`, `voice-service` - the same files fail on untouched `main` on this machine (Windows paths `C:\C:\…`, symlink EPERM, `\` vs `/`, a 5 s timeout), unrelated to this change; expected green on CI (Linux, Node 24).

## Notes
- Reported by the owner; root cause confirmed 2026-11-25 (see Plan).
- In-game text stays German.
