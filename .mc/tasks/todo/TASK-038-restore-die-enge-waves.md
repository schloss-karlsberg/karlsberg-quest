---
id: TASK-038
aliases:
- TASK-038
title: Restore the waves of Die Enge on resume
slug: restore-die-enge-waves
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- combat
- saves
sprint: '[[SPR-001]]'
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Restore the waves of Die Enge on resume

## Goal

Keep Chapter 1 playable when a save is loaded during the two-wave Kaskade encounter. The story discards the delayed reinforcement spawn and beat event latches on load, while combat retains the first wave's defeat count.

## Acceptance Criteria

- [x] Between-wave saves, including existing stranded saves, produce four reinforcements.
- [x] A save with two reinforcements defeated restores the remaining two.
- [x] Clearing the second wave advances the beat once and preserves prior kill rewards.

## Plan

_Status: approved 2026-11-26_

**Approach**

Recover the encounter from the saved combat group counts. Reuse the chapter's existing reinforcement and completion logic, and keep combat responsible for restoring partially defeated groups.

**Files to touch**

- `src/systems/story/index.ts` and `content/story/01-kapitel-1.story.json` for encounter recovery.
- `tests/story-enge.test.ts` and `e2e/enge-save.spec.ts` for save and resume regressions.
- `docs/ACTION-RPG.md` and `docs/PRD.md` for the save behavior and changelog.

**Steps**

- [x] Reproduce the failure with a unit test against the existing code.
- [x] Recover the missing wave and verify partial and completed waves.
- [x] Add browser coverage and update the behavior docs and changelogs.
- [x] Pass typecheck, unit tests, and the production build.
- [x] Attempt content validation and both Playwright specs with the requested commands.

**Test plan**

Check saved combat counts and story advancement after Continue. Exercise a Pause save before reinforcements arrive, reload after defeating two reinforcements, and verify that seven actual kills earn their normal rewards.

**Risks**

The normal wave timing and the reward pipeline depend on real combat events. Keep recovery inside the story runtime and scoped to this encounter.

**Open questions**

None.

## Progress

- Branch `dev/task-038` starts at `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92`.
- 2026-11-26. The focused Continue regression failed against the branch base with four reinforcements expected and zero restored. The same regression passed with the resume fix. The Chapter 1 story file has no builder.
- 2026-11-26. Three unit tests passed, covering the missing wave, two survivors, and a saved second-wave clear. They verify that earned XP and loot survive the reload and that actual defeats award rewards once.
- 2026-11-26. Added a Pause save and Continue browser regression, the Chapter 1 behavior note, and both changelog entries.
- 2026-11-26. Typecheck and build passed. Vitest reported `Tests  1576 passed (1576)`, including the story content validator. The sandbox denied the tsx socket for `pnpm validate` and the Playwright preview server on port 5426 for both specs.
- 2026-11-26. The sandbox denied creation of the worktree's Git `index.lock` during staging. The changes remain in the worktree.

## Follow-ups

- [ ] Run `pnpm validate` in an environment that permits the tsx socket.
- [ ] Run `e2e/enge-save.spec.ts` and `e2e/smoke.spec.ts` separately using the shared lock, port 5426, and one worker.
- [ ] Stage the TASK-038 files and commit with `fix(story): restore Die Enge reinforcements on resume`.
