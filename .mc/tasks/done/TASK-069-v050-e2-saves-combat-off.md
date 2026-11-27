---
id: TASK-069
aliases:
- TASK-069
title: 'Old v0.5.0 saves finished on e2 get combat back'
slug: v050-e2-saves-combat-off
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- story
- saves
- migration
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-27
---

# Old v0.5.0 saves finished on e2 stay with combat off

## Goal

Saves written by v0.5.0 that finished the story on beat `e2` load with combat still switched
off, so the player cannot fight in free play. The behaviour dates from v0.6.0 (commit aeaaa92),
which changed how the ending switches combat back on. Rare, but a stuck save. Found in the
TASK-039 review (PR #66).

## Acceptance criteria

- [x] Loading a v0.5.0-style save finished on e2 restores combat (and anything else the current
      ending flow turns back on) without replaying the ending.
- [x] Current saves are unchanged.
- [x] A fixture or unit test with a v0.5.0-shaped slice reproduces the stuck state first and then
      pins the migration (see `tests/fixtures/saves/` and `tests/save-fuzz.test.ts`).
- [x] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the smoke
      e2e spec.

## Plan

**Approach:** A migration step in `src/systems/story/migrate.ts` (or the story resume path) that
recognises a finished e2 run without the newer ending flags and re-applies the post-ending
state.

**Files to touch:** `src/systems/story/migrate.ts`, a fixture/unit test, the PRD changelog.

**Risks:** Must not match saves that are legitimately mid-ending.

## Resolution

v0.5.0 closed its credits page by setting `story.finished` and `story.credits`, then autosaved at
once while beat `e2` was still active; e2's exit (`combat.disabled: false`, the free-play hint)
only ran on the next tick. Since v0.6.0 e2 completes on `story.party`, so such a save stayed in e2
with combat off. v0.5.0 had no party system, so these saves hold no `party` slice, while every
later release creates one at boot; that tells them apart from the chapter replays TASK-045 repairs.

`migrateEndingProgress` turns that save into today's credits-done party beat (beat `e3`,
`story.party` = the ending, `story.party.arrived`). The story resume then finishes e3 through its
exit as after any credits: combat back on, the post-game NPCs and the free-play hint, and ending C
opens Q. The ending, the epilogue and the credits do not replay; e3's short "Das Fest" title card
shows once as the beat is entered. Tests: `tests/story-party-save.test.ts` › "v0.5.0 ending saves
(TASK-069)" (a first run and a chapter replay; both failed before the fix).
