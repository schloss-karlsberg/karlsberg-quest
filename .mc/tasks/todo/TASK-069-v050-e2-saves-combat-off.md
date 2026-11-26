---
id: TASK-069
aliases:
- TASK-069
title: 'Old v0.5.0 saves finished on e2 get combat back'
slug: v050-e2-saves-combat-off
status: todo
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
updated: 2026-11-26
---

# Old v0.5.0 saves finished on e2 stay with combat off

## Goal

Saves written by v0.5.0 that finished the story on beat `e2` load with combat still switched
off, so the player cannot fight in free play. The behaviour dates from v0.6.0 (commit aeaaa92),
which changed how the ending switches combat back on. Rare, but a stuck save. Found in the
TASK-039 review (PR #66).

## Acceptance criteria

- [ ] Loading a v0.5.0-style save finished on e2 restores combat (and anything else the current
      ending flow turns back on) without replaying the ending.
- [ ] Current saves are unchanged.
- [ ] A fixture or unit test with a v0.5.0-shaped slice reproduces the stuck state first and then
      pins the migration (see `tests/fixtures/saves/` and `tests/save-fuzz.test.ts`).
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the smoke
      e2e spec.

## Plan

**Approach:** A migration step in `src/systems/story/migrate.ts` (or the story resume path) that
recognises a finished e2 run without the newer ending flags and re-applies the post-ending
state.

**Files to touch:** `src/systems/story/migrate.ts`, a fixture/unit test, the PRD changelog.

**Risks:** Must not match saves that are legitimately mid-ending.
