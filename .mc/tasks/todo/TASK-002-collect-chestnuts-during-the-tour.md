---
id: TASK-002
aliases:
- TASK-002
title: Collect chestnuts during the tour
slug: collect-chestnuts-during-the-tour
status: todo
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
updated: 2026-11-23
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

## Notes
- Owner's words: "just following the group is very boring; the player could collect chestnuts along the way".
- Keep it small and optional; update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (see CONTRIBUTING.md).
