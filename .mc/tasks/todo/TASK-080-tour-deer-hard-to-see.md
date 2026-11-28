---
id: TASK-080
aliases:
- TASK-080
title: Tour deer are hard to see from the sneak path
slug: tour-deer-hard-to-see
status: in-progress
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
updated: 2026-11-28
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
local screenshot `d02-deer-viewfinder-2x.jpg` (not committed)

The deer meshes were present and visible (`kq.fauna.list()`: ready, visible, 0.75 / 0.68 m), so
this is staging, not a render bug.

## Acceptance criteria

- [x] From the point where „geduckt anschleichen“ starts, the doe is clearly recognisable in
      third person (for example: thin the ferns around 698/−773, let the doe lift her head when the
      player arrives, a short look-at in the t10 cinematic, or slightly warmer coat contrast).
- [x] The photo at 1× from about 12 m still earns at least two stars.
- [x] Winter coat and roe-deer look stay as designed (grey, no spots).

## Scope widened (2026-11-28)

The playtest of main db8b1b8d (real GPU, 1720x1232, Hoch) found three more things at the same
stop; the coordinator folded them into this task, one pull request:

- [x] The photo judge scores what is visible. A shot in which the deer are hidden (ferns, terrain)
      is never „Perfekt!“ and never good; the card says in German why a shot was weak.
- [x] The doe reacts to the player in a way that reads at tour distance: head up and a look, a
      step away, flight when rushed. A careful approach is not punished.
- [x] A thrown chestnut that lands near the deer makes them look up toward it; a hit makes them flee.
- [x] A first-time player still gets a good photo within a few tries (no fail state).

## Analysis (measured on main db8b1b8d, real GPU, before any change)

- The deer machine works, but nobody sees it. Walking upright from the group's stop (36 m) the doe
  goes `alert` at 24 m and bolts at 19 to 20 m, 1.5 s later; the pair lands 25 m further at about
  680 / −790, behind a row of ferns. „Zu schnell.“ is only said for a flight within 16 m, so
  nothing is said. This is what the playtester met: hidden deer and "no reaction".
- Sneaking (crouched, 1.6 m/s) the meter stays 0 down to 15 m; the doe looks up at 9 to 10 m.
- The photo judge is geometric: terrain, footprint walls and trunks block its sight rays, plants
  do not. From 11 m behind the ferns it gives 3 stars „Perfekt!“.
- At 1× the pair is „Zu klein im Bild“ from 14 m on (0.054 of the frame height, limit 0.055) and
  3 stars at 11 m; at 2× it is good from 26 m.
- Grazing head down, the grey animals read as two stones at 12 to 26 m.
- A chestnut's `world:noise` only adds to the notice meter (at most 0.56), so a single nut 3 m
  away is a coin flip between nothing and `alert`; the alert turns the body toward the player, not
  toward the noise. Nothing detects a hit.

## Plan
_Status: approved 2026-11-28_ (scope and constraints set by the coordinator's brief)

**Approach:** Stage the stop so the animals can be seen (a small glade without forest-floor props
around the grazing spot, a doe that lifts her head between bites) and make her three reactions
readable (head up and a look at what she noticed, one step away, flight), with a sound caption for
each. The photo judge gets a one-off pixel test at the shutter: the subjects are drawn once
against the scene's depth into a small target and the share of each silhouette that is not hidden
replaces the sight rays for targets that have a drawn body. It lives in its own module; `core.ts`
only reads the share. The card names the reason for a weak shot. Chestnuts use the events that are
on main: `world:noise` (look toward it) and the `combat:pelt` receipt (a hit, flight).

**Files to touch:**
- `src/systems/photo/visibility.ts` (new) - subject registry, the pixel test, pure counting and the German tips.
- `src/systems/photo/core.ts` - `PhotoWorld.seen`, `TargetJudgement.seen`, the hidden / third-star rules in `judgeTarget`.
- `src/systems/photo/index.ts` - measure at the shutter, the tip on the card, the debug deer as a subject, `kq.photo.seen()`.
- `src/systems/photo/photo.css` - the tip line.
- `src/systems/animals/deer.ts` - attention point, the step, the hold outside the flee radius, glances while grazing, open ground for the flight, cause `hit`.
- `src/systems/animals/runtime.ts`, `index.ts`, `photoBridge.ts`, `types.ts` - head look-at, captions, the pelt receipt, the glade, the photo subject.
- `content/story/00-tour.story.json` - flight feedback at any distance, the hit, three chestnuts at the stop, one hint.
- `src/systems/walk/` (`types.ts`, `route.ts`, `index.ts`), `content/routes/p-fuehrung.json`, the route builder and spec - the glade (`glades` on a route stop).
- `tests/photo.test.ts`, `tests/photo-visibility.test.ts` (new), `tests/animals-deer.test.ts`, `tests/animals-system.test.ts`, `tests/tour-slice.test.ts`, `tests/walk-route.test.ts`.
- `e2e/tour-slice.spec.ts` - one extra shot with a screen in front of the pair. `e2e/photo.spec.ts` needed no change (it shoots the board, which has no measured body).
- `docs/design/tour/README.md`, `docs/ACTION-RPG.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md` (Fotomodus).

**Steps:**
- [x] 1. Before captures (Hoch, Niedrig, phone; third person and viewfinder; the F1 repro).
- [x] 2. Photo: `visibility.ts` (pure counting, tips) and the `seen` rules in `core.ts`, with unit tests.
- [x] 3. Photo: the pixel test at the shutter, subjects registered by the animals bridge and the debug deer, the tip on the card.
- [x] 4. Deer core: attention point (player or noise), the step, the hold outside the flee radius, glances, open-ground flight, cause `hit`; unit tests for the reaction states.
- [x] 5. Animals runtime: head look-at, captions, the pelt receipt, the glade clearing; runtime tests.
- [x] 6. Tour content: flight feedback, the hit, chestnuts at the stop, the hint; `pnpm validate`.
- [x] 7. After captures at the same views; look at them; tune.
- [x] 8. e2e expectations (`photo.spec.ts`, `tour-slice.spec.ts`); docs.
- [ ] 9. Four gates, self-review, pull request, checks.

**Test plan:** unit: `tests/photo.test.ts` (hidden deer → not good, never „Perfekt!“; clear deer →
good), `tests/photo-visibility.test.ts` (pixel counting, tips), `tests/animals-deer.test.ts`
(alert, look, step, hold, flight, noise look, hit), `tests/animals-system.test.ts` (wiring). e2e:
`e2e/photo.spec.ts`, `e2e/tour-slice.spec.ts`, plus what `node scripts/ci/select-e2e.ts` lists
(hosted). Manual, real GPU: the deer stop from the group's stop, at 26 / 20 / 14 / 11 m crouched,
third person and viewfinder at 1× and 2×, on Hoch, Niedrig and a phone viewport (844x390, touch);
the F1 repro (deer behind ferns after a flight, 1× from 11 m).

**Risks:** the pixel test draws the scene once more at the shutter (a small target; the shutter
already draws two full frames for the thumbnail and the gallery). A SwiftShader frame is slow, so
hosted photo specs take a little longer. Open pull request #146 edits `photo/index.ts`, `core.ts`
and `e2e/photo.spec.ts`; #148 edits forage, court and `combat:pelt`'s payload. Both are kept in
mind hunk by hunk (see Progress).

**Open questions:** none blocking. The guide has no new spoken line (new lines need voice clips);
the new feedback is captions, the card and one toast.

## Progress
- Branch: `feat/task-080-tour-deer-moment`
- 2026-11-28: step 1 done - before captures on the real GPU (ANGLE Metal) at Hoch, Niedrig and a
  phone viewport: `test-results/contribute/TASK-080/before/` (not committed). The F1 repro gives
  3 stars „Perfekt!“ with both deer behind ferns.
- 2026-11-28: steps 2 and 3 done - `photo/visibility.ts` (registry, three passes, counting, tips),
  `core.ts` reads `PhotoWorld.seen` (hidden under 35 % of the silhouette, third star from 70 %, a
  bound pair scores as its weakest member); the deer bodies reach it through the animals bridge.
  tests/photo-visibility.test.ts (14), tests/photo.test.ts (+9).
- 2026-11-28: the plan changed in three places, as found while building. (1) The glade is data on
  the route stop (`glades`), registered by the walk system at boot like the stops' standing
  places, not a request of the animals system: it survives a reload and needs no save field.
  (2) A chestnut aimed at the doe on this slope comes down a step short of her body, so a landing
  within 0.9 m of a deer counts as a hit as well as a flight step through the body. (3) „Perfekt!“
  with both animals as two specks in a wide picture was still wrong, so the third star of a
  measured target also needs it big in the frame (1.8 × `minFrac`: the 2× zoom from the sneak
  path, or closer than about 9.5 m at 1×).
- 2026-11-28: steps 4 to 6 done - deer core (glances, the look, the step, the hold outside the flee
  radius, open-ground flights, `hitDeer`), runtime (head look-at, captions, the `combat:pelt`
  receipt, the hint), the tour story (every flight answered, 60 s for another try, the hit).
  tests/animals-deer.test.ts (+11), tests/animals-system.test.ts (+4), tests/tour-slice.test.ts.
- 2026-11-28: step 7 done - after captures at the same views, real GPU (ANGLE Metal, Apple M5 Pro),
  `test-results/contribute/TASK-080/after/` (not committed). Seen in the frames:
  - Hoch, third person from 20 m and 14 m: no ferns in front of the pair any more; with a head up
    the two read as deer. Niedrig draws no ferns, so little changes there.
  - The playtest's F1 view rebuilt (pair behind the fern row, 1× from 11 m): 71 % and 83 % of the
    silhouettes show, the card gives 2 stars „Gutes Foto“ with „Für drei Sterne: näher heran oder
    2×-Zoom.“ instead of 3 stars „Perfekt!“. From the spot where the ferns cover both (0 %): 1
    star „Verdeckt“, „Etwas steht davor. Such dir eine freie Sicht.“
  - 1× from 11 m in the glade: 2 stars with the same tip (before: 3). 2× from 13 m with both heads
    up after a chestnut: 3 stars „Perfekt!“, and Gerold's „Sie hat dich angesehen. Gutes Bild.“
  - Walking upright from the stop: head up at 26.5 m, a step aside, flight at 19.8 m 2.7 s later,
    „Und weg.“ / „Zu schnell.“; the pair stops on open ground. Sneaking: head up at 9 m.
  - Chestnut through the doe: it bounces off, both bolt, „Und weg.“, „[Die Rehe springen ab]“.
  - Phone viewport (844x390, touch, Niedrig): the card with its tip fits beside the shutter; the
    hint toast shows in its touch wording.
  - Cost: the pixel test takes 11 to 12 ms once per shot (Hoch, Niedrig, phone viewport); the
    animals system 0.003 ms per tick at the stop.
- 2026-11-28: step 8 done - `e2e/tour-slice.spec.ts` shoots once with a screen in front of the
  pair („Verdeckt“, the tip) before the good shot; docs (PRD, ACTION-RPG §7.1 and §14,
  ARCHITECTURE, the tour design, the prologue bible).
- Open pull requests: #146 (phone out of the pocket) edits `photo/index.ts`, `core.ts` and
  `e2e/photo.spec.ts`; #148 (chestnut distraction) edits forage, court, `combat:pelt` and the
  docs. A trial merge of this branch with each (`git merge-tree`) is clean. With #148 the
  chestnut asks `combat:pelt` last and passes `before`; the deer's answer honours it.
- Not done, by decision: no new spoken lines (voice clips); the coat stays grey; the 1× lens still
  shows the pair small. Follow-up worth a task: the throw preview's ring does not account for
  rising ground (the nut lands short of the ring on a slope).
- 2026-11-28: gates green on the final state (`pnpm typecheck`, `pnpm test`: 246 files, 2770
  passed, `pnpm validate`: 0 errors, `pnpm build`). Local e2e (SwiftShader), one worker:
  `e2e/tour-slice.spec.ts` 3 passed, `e2e/animals.spec.ts` 4 passed, `e2e/photo.spec.ts` 8 passed
  (run one commit before the caption gating and the 260 s fallback; the hosted run covers the head).

