---
id: TASK-053
aliases:
- TASK-053
title: Save round-trip fuzz tests for every system slice
slug: save-round-trip-fuzz-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- saves
- tests
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Save round-trip fuzz tests for every system slice

## Goal

Catch save regressions across all persistent systems with fast, reproducible unit tests.

## Acceptance Criteria

- [x] Run 200 seeded valid JSON round trips per persistent slice and check idempotence, including the owner's own restore code where it runs without a scene.
- [x] Check legacy, missing and extra fields and preserve known progress.
- [x] Check malformed values are sanitized or rejected cleanly, following main's save design (TASK-024: unreadable slots; owners sanitise everything else).
- [x] Seeded corrupt-slot fuzz over whole saves.
- [x] Keep the new suite under 3 seconds without dependencies.
- [x] Load every real save available (release fixtures in the repo, campaign saves from `test-results/campaign-saves`).
- [x] Tie saved value lists to their TypeScript unions.
- [x] Document save invariants and add the PRD changelog entry.
- [x] Verify all four gates.

## Plan

**Re-cut (2026-11-26).** The first branch (`dev/task-053`, commits `051043f`..`48ae01d`) built its own
slice validator (`src/core/save-slices.ts`, `checkSaveSlices`) in parallel with TASK-024's unreadable
autosaves, TASK-048's animal saves, TASK-031's save clocks and TASK-025's combat saves on main. It
conflicted in 8 files. The re-cut on `dev/task-053-fuzz` keeps the fuzz harness and the union tie-in
and points both at main's validators instead:

- Unreadable (main's design): bad JSON, non-object state / `systems` / slice, a newer version and
  malformed story fields (`deserializeState`, `readStorySlice`).
- Everything else loads; owners sanitise per field. The fuzz drives the owners that restore without
  a scene: `restoreAnimals`, `CombatSim.loadResources`, `readBottleSlice`, photo `normaliseSlice`,
  `normalizeSlice` + `deriveStats` (progression), quests `normaliseSlice`, `restoreWalker`.
- Dropped from the first branch: `save-slices.ts` and `checkSaveSlices` (duplicate validation that
  would have made whole slots unreadable for one bad field), its title / `SaveManager` changes (TASK-024
  covers Continue and overwrite protection) and the sparse story fix (main's `readStorySlice` fills
  defaults).

**Files.** `tests/save-fuzz.test.ts`, `tests/seeded.ts`, `src/core/saved.ts` (union lists and field
readers), the owner restore code listed above, `docs/ARCHITECTURE.md` (§7 save invariants), `docs/PRD.md`.

## Progress

- 2026-11-26: Re-cut on `dev/task-053-fuzz` from `origin/main` 5550403.
- Union tie-in: `allOf<T>()` in `src/core/saved.ts`; used for story look times and endings, quest
  states, deer and dog states, party variants and credits. A type test checks that a missing value fails.
- Holes found by the fuzz in main's owner restore code, each fixed with a regression case:
  1. Combat: a save without `stamina` or `bann` restored NaN (`Math.min(max, undefined)`). Now
     `CombatSim.loadResources` (moved out of the scene class) falls back to full.
  2. Deer: a partial `shy` object lost the missing radii (NaN meter). `createDeer` / `restoreDeer`
     fill each missing or non-positive radius; corrupt numbers, `flee`, `away` fall back.
  3. Animals: a non-list `deer` / `dogs` or a null entry threw in `restoreAnimals`; a non-string
     `follow` threw in `leaderId`. Corrupt entries are dropped, dog `path` / `lie` are checked.
  4. Progression: `equipped: "x"` threw in `normalizeSlice` (assigning `charms` to a string); corrupt
     talents, inventory, lists and pickups loaded as is. Fields now fall back per field; pickups
     without id, item, coordinates or era are dropped.
  5. Quests: a null quest entry threw in `normaliseSlice`; a non-record `bestiary` threw at the next
     kill. Corrupt entries are dropped, counts and bestiary keep only numbers.
  6. Walk: a null walker threw in `restoreWalker`; a non-numeric `s` restored NaN. Corrupt walkers
     are skipped, `s`, `speed` and `wait` fall back.
  7. Photo: album entries with wrong field types and non-numeric `best` / `near` values loaded.
  8. Bottles: duplicate or retired ids counted towards the collection (`readBottleSlice`).
- Corrupt-slot fuzz: 400 cases by default; 30 000 cases passed locally (`KQ_FUZZ_CASES=30000`).
- Real saves: the 4 fixtures in `tests/fixtures/saves/` are a unit test. The 25 campaign slots
  (`test-results/campaign-saves` in 7 local worktrees, not in the repo) passed with
  `KQ_SAVE_DIRS`, including the check that the owner restore drops nothing.

## Follow-ups

- Systems whose restore runs inside the scene class (barks, chronik, cinematic, court, fx, hunt,
  menagerie, npc, party, scenery, travel, walk groups) only get the core guarantees (object slice,
  no crash in `deserializeState`). Extracting their slice readers would let the fuzz cover them.
