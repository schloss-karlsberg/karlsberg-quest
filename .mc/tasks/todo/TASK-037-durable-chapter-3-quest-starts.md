---
id: TASK-037
aliases:
- TASK-037
title: Make Chapter 3 quest starts durable across autosaves
slug: durable-chapter-3-quest-starts
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- quests
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Make Chapter 3 quest starts durable across autosaves

## Goal

Keep the two mandatory Chapter 3 quests playable after Continue, including saves already stranded in the garden or at the kennel.

## Acceptance Criteria

- [x] The first Hinauf autosave resumes with Der Festsaal active.
- [x] The first Zum Zwinger autosave resumes with Die Hunde los active.
- [x] Garden and kennel saves can finish from their current beat, including a garden save that only needs its missing choice count repaired.
- [x] Reload keeps earned objective counts and each quest pays once.
- [x] Laub's transition line queues before his quest offer at both starts.
- [x] The Chapter 3 browser regression checks the source beat after Continue and reads the autosave immediately after the first step.

## Plan

_Status: approved 2026-11-26 (implementation requested)_

**Approach:** Reproduce both early autosaves with the shipped chapter and real quest state. Move each quest start ahead of the save and use the chapter's resume or migration path to repair older saves.

**Files to touch:**

- `content/story/03-kapitel-3.story.json` for beat timing. The Chapter 3 builder writes the dialogue pack only.
- Chapter 3 save recovery in the story system.
- Story and quest tests, plus the relevant Chapter 3 browser spec.
- `docs/PRD.md` and `docs/ACTION-RPG.md` for the behavior change.

**Steps:**

- [x] 1. Reproduce both missing quests with failing unit tests.
- [x] 2. Fix both starts and recover saved progress without duplicate payouts.
- [x] 3. Document the fix, attempt the four gates, and check whether the locked browser specs can run on port 5425.
- [x] 4. Record the initial results and commit the local changes as `f42b606`.

**Test plan:** Exercise first autosaves, old downstream saves and repeated reloads with Vitest. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`, then run the changed browser spec and `e2e/smoke.spec.ts` separately under the shared lock when the sandbox allows.

**Risks:** Resume must preserve quest counters and completed payouts. Keep shared systems out of the diff where possible and preserve all voiced text.

**Open questions:** None.

### Review fix plan (2026-11-26)

- [x] Repair readiness after restoring legacy objective counts using the normal quest rules. Cover Hanne's single payout in a regression test.
- [x] Wait for the browser hooks without stepping and assert the source beat before the first transition tick. Cover the hook wait with a unit test.
- [x] Keep quest activation immediate and queue both offers after Laub's transition line. Cover queue order in the chapter tests.
- [x] Update the gameplay docs, attempt the four gates and the locked browser specs as the sandbox allows, and record the results in this task.
- [x] Commit the review fixes locally (`ddf16a0`).

## Progress

- Branch `dev/task-037`, based on `d2d1f48`.
- 2026-11-26: The eight regression checks failed on the original code. Both first transition saves loaded their next quest as hidden. The first Hinaus save also lacked its room and choice objectives.
- 2026-11-26: All eight regression checks passed after moving the quest actions into beat entry and adding the Chapter 3 save repair.
- 2026-11-26: Updated the Chapter 3 preservation fixture to represent a healthy Hinaus save. Verified that a repaired kennel quest re-declares its road enemies and credits a saved release clue.
- 2026-11-26: `pnpm typecheck`, `pnpm test` (`Tests  1581 passed (1581)`), and `pnpm build` passed. `pnpm validate` failed because the sandbox denied the tsx IPC socket. The validator passed via `node --import tsx scripts/validate-content.ts`.
- 2026-11-26: The Playwright spec collected two tests. The sandbox denied the preview server bind on `127.0.0.1:5425`, so Chapter 3 and smoke browser results are unverified. All 32 Chapter 3 dialogue actions match the original content.
- 2026-11-26: The initial implementation session could not stage changes because the sandbox denied the worktree index lock. The branch now contains the initial commit `f42b606`.
- 2026-11-26 review: The new Chapter 3 assertions reproduced both misordered transitions and the blocked garden turn-in with and without the bonus kills. All 28 focused tests passed after the fixes, including the render-only hook wait.
- 2026-11-26 review: `pnpm typecheck`, `pnpm test` (`Tests  1584 passed (1584)`, zero failed), `pnpm build`, and `mc validate` passed. `pnpm validate` was blocked by `listen EPERM` on the tsx IPC socket. The unit suite's story and quest validation passed.
- 2026-11-26 review: The locked Chapter 3 spec could not start because the sandbox denied the preview server bind on `127.0.0.1:5425`. The smoke spec was skipped after that failure. The story content changes only remove two line delays.
- 2026-11-26 review: All three findings are fixed in the worktree. `git commit` was blocked by `Operation not permitted` on the worktree's `index.lock`.

## Follow-ups

- Run `e2e/chapter-k3-autosave.spec.ts` and `e2e/smoke.spec.ts` separately under `scripts/dev/heavy.sh` on port 5425 where the preview server can bind.
- Run `pnpm validate` where the tsx IPC socket is permitted.
- Commit the review fixes when Git can acquire the worktree index lock. Use `test(story): isolate the first chapter 3 transition save` and `fix(story): restore chapter 3 turn-ins and dialogue order`.

## Second review (2026-11-26)

- All three first-round findings are confirmed fixed in `ddf16a0`.
- New blocker, fixed in `856d771`: `src/systems/story/migrate.ts` imported
  `content/quests/03-kapitel-3.quests.json`. `src/core/save` loads that module, and Playwright's
  Node ESM loader refuses JSON modules without an import attribute, so `story`, `chapter-prolog`
  and the new `chapter-k3-autosave` specs failed to load (a whole-suite `--list` showed 0 tests).
  The repair keeps the two quests' required objectives as data, checked against the content by a
  unit test, and `tests/e2e-imports.test.ts` walks the `src` imports of every e2e spec for JSON
  modules. The unused `requiredDone` refactor in `quests/logic.ts` is reverted.
- Gates outside the sandbox: `pnpm typecheck` passed; `pnpm test` reported `Test Files  121 passed (121)`
  and `Tests  1586 passed (1586)`; `pnpm validate` reported `✓ content valid (1 warning(s))`;
  `pnpm build` passed. `playwright test --list` loads 190 tests in 55 files.
- Locked e2e on port 5425 at `856d771`: `chapter-k3-autosave` 2 passed, `chapter-k3` 2 passed (35 min),
  `smoke` 7 passed.
