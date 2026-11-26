---
id: TASK-039
aliases:
- TASK-039
title: Restore the epilogue on continue
slug: restore-the-epilogue-on-continue
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- save
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Restore the epilogue on continue

## Goal

Recover the chosen epilogue and its Abspann button when continuing from an `e2` save.

## Acceptance Criteria

- [x] Weiter restores the matching epilogue for Museum, Burn and Keep, including existing `e2` saves.
- [x] Abspann starts the matching celebration and credits once.
- [x] The pre-choice save still supports Ende noch einmal wählen.
- [x] Desktop Weiter leaves the pointer unlocked while the restored epilogue is open.
- [x] Pending `e2` and in-progress `e3` saves each emit one cue for the selected celebration.
- [x] The browser spec uses `story.stageSkip()` and waits for the ending card's Weiter button.

## Plan

_Status: approved 2026-11-26_

**Approach**

Resume the saved epilogue using the ending already stored in the story slice. Reuse the existing
button and party handoff. Restrict restoration to an unfinished `e2` with the party still pending.

**Files to touch**

- `src/systems/story/index.ts` and `src/systems/story/endings/ui.ts` for the resume and button flow.
- Story unit tests and a focused Playwright spec for regression coverage.
- Story documentation and the changelogs in `docs/ACTION-RPG.md` and `docs/PRD.md`.

**Steps**

- [x] 1. Trace the save and resume flow and reproduce the bug in a failing unit test.
- [x] 2. Restore the epilogue and verify the party handoff and pre-choice save.
- [x] 3. Document the behaviour and run typecheck, tests, validation and build.
- [ ] 4. Run the touched spec and smoke spec separately using the heavy lock on port 5427.

**Test plan**

Check all three variants, the one-time handoff and the pre-choice save. In the browser, reload while
reading the epilogue, choose Weiter and open Abspann. Check the title's ending replay action as well.

**Review fixes (2026-11-26)**

- [x] Let synchronous `game:start` handlers restore the modal before requesting pointer lock in
  `src/boot.ts`. Test the startup handoff with the restored epilogue and with an empty modal stack.
- [x] Give the pending-`e2` and `e3` fixtures their saved ending flags. Step the runtime and verify
  one matching celebration cue for each save.
- [x] Use `story.stageSkip()` after confirmation in Playwright. Verify that the hook makes the
  ending card available and remains safe when called after the scene is over.
- [x] Document the desktop behaviour, run the four gates, and attempt the epilogue and smoke specs
  separately through the heavy lock.

**Risks**

Keep the resume guard local to the story system. Leave the shared save, title, engine and dialogue
queue files outside the change.

## Progress

- Branch `dev/task-039`.
- 2026-11-26. Confirmed that all three existing `e2` saves failed to open the epilogue in the new unit test.
- 2026-11-26. Restored all three variants from the saved story slice, guarded the Abspann handoff
  and verified the separate pre-choice slot with unit tests.
- 2026-11-26. Updated the story docs and changelogs. Typecheck and build passed.
  `Tests  1579 passed (1579)` with 0 failed. `pnpm validate` hit a sandbox `EPERM` on the `tsx`
  socket. The validator passed with `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. Both locked Playwright commands hit a sandbox `EPERM` on `127.0.0.1:5427`
  before launching the browser.
- 2026-11-26. The initial implementation is recorded in `e72cd7b`.
- 2026-11-26 review. Fixed all three findings. The pointer-lock ordering predates this branch.
  The restored epilogue now opens before boot checks whether it can request the lock. Tests verify
  both matching celebration cues and the stage skip hook before and after scene completion.
- 2026-11-26 review. Typecheck and build passed. `Tests  1581 passed (1581)` with 0 failed.
  `pnpm validate` again hit `EPERM` on the `tsx` IPC socket. The direct validator command passed
  with `✓ content valid (1 warning(s))`.
- 2026-11-26 review. Both locked Playwright commands again hit `EPERM` on `127.0.0.1:5427`
  before the browser launched.
- 2026-11-26 review. Git could not create the worktree's `index.lock`. The review patch is in the
  worktree.

## Follow-ups

- Run `e2e/epilogue-resume.spec.ts` and `e2e/smoke.spec.ts` with the heavy lock on port 5427
  in an environment that permits the preview server. Run `pnpm validate` where the `tsx` launcher
  can create its socket.
- Commit the review patch once Git can write the worktree index.
