---
id: TASK-002
aliases:
- TASK-002
title: Collect chestnuts during the tour
slug: collect-chestnuts-during-the-tour
status: in-progress
priority: 3
owner: ''
projects: []
customers: []
tags:
- feature
- community
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-25
---

# Collect chestnuts during the tour

## Description

Owner feedback: just following the group in the tour is very boring. Give the player something to
do along the way: **collect chestnuts** (Kastanien) while walking with the group.

Karlsberg Quest is an action RPG with quest-giver collect/kill gameplay (no quizzes, no word
puzzles). The tour is a peaceful prologue: it sets `combat.disabled` and `laub.silent`, so this is
an optional collect activity, not a fight.

Relevant code and content:

- **Tour story:** `content/story/00-tour.story.json` (chapter `tour`, beats `t1`... with
  objectives like "Der Gruppe folgen"). It is hand-authored (no builder in
  `scripts/content-build/`). Story actions/format: `content/story/README.md`,
  `src/systems/story/types.ts`, `src/systems/story/index.ts`.
- **Group walk:** the guide Gerold Imhoff walks route `content/routes/p-fuehrung.json`
  (route points `wind`, `reh`, `weiher`, ...); walkers/group follow in `src/systems/walk/`
  (`group.ts`, `route.ts`, `walker.ts`). Chestnuts should be placed along this route.
- **Collect quests:** `content/quests/*.quests.json` have `"type": "collect"` objectives with an
  `item` and `place` (see the Messstab in `content/quests/00-prolog.quests.json`); quest system in
  `src/systems/quests/`, schema `content/schema/quests.schema.json`.
- **Items and pickups:** item definitions in `src/rpg/items.ts` (incl. `COLLECTIONS`); world
  pickups, pickup feed and collections in `src/systems/progression/` (`index.ts`, `logic.ts`).
- **Hidden collectibles reference:** `src/systems/flaschen/` (spots, glint, pickup with E) shows
  how a small collectible system is built.
- **Lore hook:** the "Herzogskastanien" (old sweet chestnut trees, natural monuments) are already in
  the codex (`scripts/content-build/codex.mjs`, `content/bible/07-codex.md`).

## Acceptance Criteria
- [ ] Chestnuts (a new item, German name e.g. "Kastanie") lie along the tour route, mostly near the path, a few slightly off it
- [ ] The player picks them up with E (or by walking over them), with the normal pickup feedback and a running count
- [ ] Optional: the guide or a group member comments on it, or a small reward at the end of the tour (e.g. a collection or a tour-end line); no XP balance break (see `tests/quests-content-a.test.ts`)
- [ ] Collecting never blocks or delays the tour; the group still waits for the player as before
- [ ] Count is saved and survives reload; works with touch controls
- [ ] All player-facing text is German; any new art is CC0 and credited in `public/assets/LICENSES.json`
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan
_Status: approved 2026-11-25_

**Approach:** Chestnuts reuse the progression system's world pickups. `{ "do": "loot" }` places them, and they persist in `systems.progression.placed`. You pick one up by walking over it (1.3 m) or with E / the touch action (2.7 m). Each pickup shows a line in the pickup feed and plays the pickup sound. The count lives in the inventory, so the save keeps it.

A new item kind `collectible` makes them plain:
- smaller glow, no light column, ordinary pickup sound;
- not usable and not gear;
- stacks to 99;
- the feed shows the running count (`+ Kastanie ×1 (7)`).

The tour places 24 chestnuts (`tour.kastanie.01`–`24`), each when the walk on its section of `p-fuehrung` starts. They lie in small clusters, mostly 1.5–4 m off the path, about five of them 6–10 m off. There are none near the stops (talk E) and none on the last stretch before the deer. Three chapter-wide reactions in the tour comment on them (first, 12th, all 24). There is no XP, no collection reward and no `item` action, so the XP band and the handover stay as they are. At the tour's `leave`, chestnuts nobody took are cleared, so nothing glows on the paths in chapter 1.

**Files to touch:**
- `src/rpg/types.ts` - `ItemKind` gains `collectible`.
- `src/rpg/items.ts` - `item.kastanie` („Kastanie“, kind `collectible`, stack 99, German text).
- `src/systems/progression/logic.ts` - `stackLimit` for `collectible` (99); not usable.
- `src/systems/progression/index.ts` - feed shows the running count for `collectible`, like consumables; verb „aufheben“.
- `src/systems/progression/icons.ts` - a chestnut icon, or the default icon for the kind.
- `src/systems/story/types.ts`, `src/systems/story/index.ts` - `LootAction` gets an optional `group` (the pickup's existing `quest` field), passed on `loot:place`. `loot:clear` can then clear by group.
- `content/story/00-tour.story.json` - 24 `loot` actions in t3, t5, t7, t9, t12 and t14 (the beat in which the group walks that section); chapter `on` with three reactions; `leave` clears group `tour.kastanien`.
- `tests/tour-kastanien.test.ts` (new) - placement rules, reactions, cleanup, no XP / item grants.
- `tests/progression.test.ts` - `collectible` stacks, is not usable, keeps its count across serialise / load.
- `e2e/kastanien.spec.ts` (new) - in the tour at t3: walk over one, E-pick one, feed and count, touch prompt, save and reload keeps the count.
- `docs/design/tour/slice-v0.md` (beats table plus a „Kastanien“ line), `docs/ACTION-RPG.md` §7 (item kind) and §14, `docs/PRD.md` changelog.

**Steps:**
- [x] 1. Item kind `collectible` and `item.kastanie`: types, stack, not usable, no beam, ordinary sound, feed count, icon; unit tests.
- [x] 2. Story `loot` with `group` (place and clear); validator accepts it; unit test.
- [x] 3. Positions: pick 24 spots along the walked sections with a script (route offset, terrain height and slope from the heightfield). Check them in the dev build (`?debug`, teleport): on walkable ground, not in a rock or the Weiher, visible from the path.
- [x] 4. `00-tour.story.json`: `loot` actions per section beat, chapter `on` reactions, `leave` cleanup; `pnpm validate`.
- [ ] 5. `tests/tour-kastanien.test.ts`, written to fail before step 4 and pass after it.
- [ ] 6. `e2e/kastanien.spec.ts`; run it with one worker.
- [ ] 7. Manual check in the dev build: new game → tour; collect a few while following; the group waits as before; feed, count and lines; reload keeps the count; touch mode (E button) and reduced motion.
- [ ] 8. Docs: `slice-v0.md`, ACTION-RPG §7 and §14, PRD changelog.
- [ ] 9. Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`; `pnpm build && pnpm exec playwright test e2e/kastanien.spec.ts e2e/tour-slice.spec.ts --workers=1`.

**Placement (24):**

| Beat | Section | Count |
| --- | --- | --- |
| t3 | parkplatz → abzweig | 3 |
| t5 | einstieg → felsen | 6 |
| t7 | felsen → wind | 3 |
| t9 | wind → reh | 6 |
| t12 | damm → weiher | 2 |
| t14 | weiher → quelle | 4 |

Rules, checked by the unit test:
- each chestnut is within 12 m of its section's route line;
- each is ≥ 8 m from every route stop (talk circles, the group's gather points);
- each is ≥ 40 m from the doe's spawn (704 / −779) and ≥ 15 m from the `reh` stop;
- the ids are unique and all lie in era `today`.

**Lines (German, dialogue fallback, no voice clip yet):**
- First chestnut, imhoff: „Esskastanien. Hier oben stehen alte Bäume, die man Herzogskastanien nennt, über zweihundert Jahre alt.“ The fact is from cx.39, sources SBT and HP. The line makes no claim about which tree these chestnuts fell from.
- 12th, solld (Herr Soll, who counts the group in t1): „Zwölf Kastanien. Ich zähl ja sowieso.“ (FIKTION, a running gag)
- All 24, imhoff: „Alle vierundzwanzig? Die Eichhörnchen werden sich beschweren.“

Each reaction is chapter-wide and fires once, on `item:pickup` with `match {item}` and `gte {total}`.

**Test plan:**
- Unit: `pnpm exec vitest run tests/tour-kastanien.test.ts tests/tour-slice.test.ts tests/tour-handover.test.ts tests/quests-content-a.test.ts tests/progression.test.ts`.
- e2e: `e2e/kastanien.spec.ts` and `e2e/tour-slice.spec.ts` (the tour still runs through, timings logged), with one worker.
- Manual: `http://localhost:5280/?debug&nosave&fresh` → „Neues Spiel“, follow the tour.
- Screenshots, saved to `test-results/contribute/TASK-002/`:
  - before: `before-1-path-t9.png`, the path on the wind → reh section at the start of t9;
  - after: `after-1-path-t9.png`, the same view with chestnuts;
  - after: `after-2-feed.png`, the pickup feed with the count.

**Risks:**
- A new `ItemKind` member: exhaustive switches and validators must accept it (typecheck finds them).
- Draw calls: each pickup is about four draws, visible within 95 m. A cluster adds about 10–25 draws near the path (docs/PERFORMANCE.md budget; checked with `?debug` stats).
- The E prompt must not shadow a talk E. That's why they keep ≥ 8 m from the stops, and the pickup prompt already yields to an NPC's prompt.
- Lines may overlap Gerold's station talk. Reactions queue like other `say` lines.
- `voice-assets` manifest coverage might demand clips for new line ids. If so, use the dialogue fallback as the Marlene loan line does, and note it.
- The positions need an in-game look: the terrain is LiDAR, with rocks at the Felsenpfad.

**Open questions:** none. The plan was approved as written on 2026-11-25. That settles 24 chestnuts with the small glow. A row in Pause → Sammlungen („Kastanien: 7 von 24“) is not in this cut; it is noted as a possible follow-up.

## Progress
- Branch: `feat/task-002-chestnuts` (from `main` `fd18dcd`)
- 2026-11-25: plan approved. Before shot `test-results/contribute/TASK-002/before-1-path-t9.png`: t9, player on the wind → reh path at route point 627 / −647, looking down the path (yaw 29.3, pitch −9). No pickups.
- 2026-11-25: step 1 done - `ItemKind` `collectible`, `item.kastanie` („Kastanie“, stack 99). A collectible is not precious: smaller glow, no light column, the ordinary pickup sound (`BEAM_KINDS` / `pickupSound` leave it out). It is not usable or equippable. The feed shows the running count like consumables, and there is a chestnut glyph in `icons.ts`. Quest files keep their own kind list (a core-only kind). `tests/progression.test.ts` gains a collectibles case. The progression test and every test touching `ITEMS` are green (6 files, 113 tests), typecheck green.
- 2026-11-25: step 2 done - `LootAction.group`: on place it becomes the pickup's `quest` tag. `{ group, clear: true }` (no `id`) sends `loot:clear {quest: group}`. The validator checks the group's form and allows a clear by group without an id. `content/story/README.md` row updated; `tests/rpg-contracts.test.ts` covers the good and bad cases. Typecheck and `pnpm validate` green.
- 2026-11-25: step 3 done (data side) - spots chosen as (arc length, side offset) per walked section of `p-fuehrung`, then checked against the running dev build's world (`heightAt`, slope over 1 m, `surfaceAt`, `collider.solidAt` r 0.3).
  - No spot is in water or in a solid. Two first picks on the Felsenpfad were steep (0.68, 0.52): 08 moved to the other side and 04 moved closer to the path; the steepest left is 0.44, on the climb itself.
  - Trees and rocks drawn as scenery are not in the collider, so the visual check follows in step 7 (after shots).
- 2026-11-25: step 4 done - `00-tour.story.json`: 24 `loot` actions (era `today`, group `tour.kastanien`), three chapter `on` reactions (first, 12th, 24th pickup; `item:pickup` + `match.item` + `gte.total`), and `{ group, clear: true }` in `leave` before the fade.
  - Plan adjusted: sections einstieg → felsen and damm → weiher place their chestnuts in **t5** and **t12**, the beats in which the group walks them, not in t4 and t11. Those two beats end on a flag right after the fade, and `tests/tour-slice.test.ts` reads t4's last six actions. t4 and t11 are unchanged.
  - `pnpm validate` green (214 lines). `tour-slice`, `tour-handover`, `quests-content-a`, `flaschen` and story tests green. `voice-assets` shows only its 2 known Windows path failures (same on `main`).

## Notes
- Owner's words: "just following the group is very boring; the player could collect chestnuts along the way".
- Keep it small and optional; update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (see CONTRIBUTING.md).
