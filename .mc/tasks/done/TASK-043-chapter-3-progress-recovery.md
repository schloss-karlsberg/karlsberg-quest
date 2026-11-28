---
id: TASK-043
aliases:
- TASK-043
title: 'Soft-lock and progress-loss hunt: Chapter 3'
slug: chapter-3-progress-recovery
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- saves
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

## Goal

Find and fix the most serious confirmed Chapter 3 progress, reward, and guidance failures without changing dialogue, design, balance, or the fixes assigned elsewhere.

## Acceptance Criteria

- [x] Trace every Chapter 3 beat, quest, and objective through the systems that advance it; consider out-of-order play, retries, saves, travel, death, pause, touch, reduced motion, and chapter replay.
- [x] Reproduce 3–6 confirmed problems with failing Vitest regressions before fixing them; recover already affected saves where needed.
- [x] Update the applicable docs without changing voiced lines or assets.
- [ ] Pass typecheck, all unit tests, content validation, and build; run the requested browser smoke if permitted.
- [ ] Record fixes and follow-ups and commit locally with the requested trailer. The findings are recorded. Staging is blocked by the sandbox.
- [x] Review fix 1: A production-timed checkpoint retry with a saved Festsaal choice leaves Hanne available for turn-in.
- [x] Review fix 2: The 50-second choice timer counts only playable time in the July Festsaal.
- [x] Review fix 3: Continue restores the saved walkable storey when the palace plan is ready.
- [ ] Review fix 3 browser verification: a fresh page's Continue lets the player take an object with normal input.
- [x] Review fix 4: Accepting or loading an open jaguar quest credits a previously calmed `k3.jaguar`.
- [x] Review fix 5: Chapter selection preserves partial flares; calming or closing the encounter clears them.

## Plan

_Status: approved 2026-11-26_ (direct implementation request)

**Approach:** Map the generated story and quests to the engine, save lifecycle, and gameplay systems. Prioritize reproducible cases not covered by another task, reproduce them against the baseline, and change only the responsible paths.

**Files to touch:** K3 builder and generated content if needed; the affected systems, their Vitest coverage, and `docs/ACTION-RPG.md` and `docs/PRD.md`.

**Steps:**
- [x] 1. Trace K3 and screen suspected bugs against the excluded tasks.
- [x] 2. Run focused regressions red, then implement and verify recovery.
- [ ] 3. Document changes and run all local gates and browser smoke on port 5431. Documentation is complete. Validation and browser startup require a sandbox that permits local sockets.
- [ ] 4. Record outcomes and commit the work locally. Outcomes are recorded and staging is blocked.

**Test plan:** Focused Vitest specs first; then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Use the machine-wide lock and one worker for `e2e/smoke.spec.ts` and any changed e2e spec.

**Risks:** Persistent quest/objective data and one-shot events must remain compatible with old saves; no voiced text or voice assets can change.

**Open questions:** Which suspected failures reproduce independently of the excluded tasks?

### Review fix round

_Status: approved 2026-11-26_ (direct fix request)

**Approach:** Compare each finding with `origin/main`, fix the Chapter 3 paths and the shared save restoration they rely on, and cover each regression at its normal entry point.

**Files to touch:** Chapter 3 story, story/interiors/player save handling, quests and menagerie, their Vitest coverage, `e2e/chapter-k3.spec.ts`, and the relevant behaviour docs.

**Steps:**
- [x] Correct Festsaal action ordering and gate the timer on the playable room.
- [x] Restore saved floor height after interior collision loads and extend the Continue browser spec.
- [x] Reconcile saved jaguar completion and preserve partial flares across chapter selection.
- [ ] Update the docs and run the four gates, the touched browser spec, and smoke. Validation and Playwright startup are blocked by socket permissions.
- [ ] Record review dispositions and commit locally with the requested trailer. Review dispositions are recorded and staging is blocked.

## Progress

- Branch: `dev/task-043`.
- 2026-11-26: Traced the Quelle/Ehrenhof handoff, afternoon and gallery, torch, Festsaal and escape, garden, Zwinger, and the home sequence against the quest book, cues, saves, and chapter selector. Focus: pending and committed Festsaal choices, the jaguar's spawn and partial flare progress, and its stall hint. The K3 builder generates the clue/dialogue pack, not the story or quest files.
- 2026-11-26: The seven new tests failed on the baseline (`Tests  7 failed | 48 passed (55)`) and passed after the fixes (`Tests  55 passed (55)`). Extended the Festsaal browser spec to reload an undecided save before exercising the existing timeout.
- 2026-11-26: `pnpm typecheck` passed; `pnpm test`: `Tests  1580 passed (1580)`; `pnpm build`: `✓ built in 941ms`. `pnpm validate` stopped before validation because `tsx` could not bind its IPC socket (`listen EPERM`). Playwright could not start preview (`listen EPERM 127.0.0.1:5431`), so neither spec is verified. Compared the `say` and quest-dialogue records to the baseline: no text changes.
- 2026-11-26: `mc validate` passed. Git could not create the worktree's `index.lock` (`Operation not permitted`); no commit was created. Changes remain in the worktree.
- 2026-11-26 review round: Hanne's regression fails with the old entry ordering and passes with the fix. The focused suite passed all 83 tests. Dialogue records match the branch baseline, including voiced lines.
- 2026-11-26 review round: `pnpm typecheck` passed. `pnpm test` reported `Test Files  119 passed (119)` and `Tests  1590 passed (1590)`. `pnpm build` reported `✓ built in 737ms`. `pnpm validate` stopped at `tsx` IPC startup with `listen EPERM`. The locked Chapter 3 browser run stopped at `listen EPERM 127.0.0.1:5431` before launching a browser. Smoke was skipped on the same port restriction.
- 2026-11-26 review round: `mc validate` and `git diff --check` passed. Git staging stopped at the worktree's `index.lock` with `Operation not permitted`. The review changes remain in the worktree at `b3c42e2`.
- 2026-11-27 rebase onto main (#98 TASK-037, #99 TASK-041, 14d7b1a1 storey/Festsaal): dropped this branch's player storey hint (main's interiors `restoreStorey` covers Continue), its `MenagerieSlice.jaguarFlares` (main persists `flares`/`misses`; `keepProgress` and quest-close forgetting now act on those) and its `hasCalmed` quest credit (main's `settleCalm` with `STORY_ANIMALS`); the jaguar objective keeps `animal: "jaguar"`. The Festsaal flag repair moved to `migrateStoryFlags` (story/migrate.ts), called from deserializeState after the other story migrations. The Festsaal timeout e2e test is back next to the new Continue test.
- 2026-11-27 review: the load-time room reset left a live load in the same room without a room (main's interiors do not re-announce an unchanged room), so `timerWhile` and `room` conditions stayed false. Interiors now re-announce the room when the loaded flags no longer know it (`tests/interiors-runtime.test.ts`, red before the fix).

## Review findings

| # | Disposition | Origin and fix |
| --- | --- | --- |
| 1 | Fixed | The branch's saved-choice replay exposed the old delayed hush ordering. The hush now runs before the delayed grant. Loading an affected save clears stale Hanne hush state. The production scheduler test checks the garden turn-in and beat advance. |
| 2 | Fixed | The unrestricted timeout was present on `origin/main`. The beat clock now accumulates only in the July Festsaal. The regression returns after 60 seconds in the present and spends time outside the room in July before using the remaining time. Older saves record the same `nichts` value for a door choice and for a timeout. |
| 3 | Fixed, browser verification pending | The height loss was present on `origin/main`. Continue retains the grounded height while the palace streams and snaps to the saved walkable storey when collision is ready. Unit coverage uses the real floor plan. The fresh-page browser test asserts the upper floor and takes the handle with E. |
| 4 | Fixed | The quest missed prior calm events on `origin/main`, and this branch made the early encounter easier to reach. The exact saved `k3.jaguar` id completes the open objective on accept or load and pays once. |
| 5 | Fixed | The branch's new chapter-leave cue removed the partial flare count. Temporary removal keeps the count. Calming, permanent removal and quest closure clear it. |

## Findings

Root-cause locations are from the pre-fix revision `d2d1f48a`.

| Repro | Root cause | Fix | Red → green regression |
| --- | --- | --- | --- |
| Save in the Festsaal before picking an object, then Continue. The objects are gone and the fallback can choose nothing. | `content/story/03-kapitel-3.story.json:382`: props were staged by a one-shot cue. | Restage while undecided in July 1793. Drop stale props and their saved interaction owner on load. | `restages an undecided Festsaal choice after continuing` |
| Take the clock, get caught on the way out, or replay the chapter after the pick. The beat asks for a second choice and can overwrite the first. | `content/story/03-kapitel-3.story.json:381`: entering the choice beat erased `festsaal.took`. | Keep the committed choice, guard its payout, and recover the missing flag from `choice.k3.objekt` in old saves. | `keeps the Festsaal choice and does not pay for it again after a checkpoint retry or chapter replay`; `repairs an old Festsaal save whose committed choice was cleared by a retry` |
| Continue the first garden autosave before Laub's spawn cue, or return to today before that cue and then go back. The jaguar can be missing when the quest needs it. | `content/story/03-kapitel-3.story.json:507`: delayed one-shot spawn; `src/systems/menagerie/index.ts:194`: implicit current era. | Reassert the July 1793 spawn by id in the garden, at the gate, and at the kennel. Repair missing or misfiled spawns without reviving a calmed jaguar. | `reasserts the fire-night jaguar when continuing in the garden, at the gate, or at the kennel`; `reasserts a jaguar saved in the wrong era without bringing back a calmed one` |
| Land two Bannlicht hits, save, start a fresh runtime and land another hit. It is treated as the first. | `src/systems/menagerie/index.ts:165`: successful flares lived in a runtime-only map. | Persist partial flares in the menagerie slice; clear them on removal or calming. Older saves never recorded partial flares. | `calms the jaguar on the third flare across a reload, using the saved count` |
| Let the jaguar quest's stall hint appear. It recommends dodging rather than using Bannlicht. | `src/systems/quests/wayfinding.ts:184`: every calm objective used the cassowary hint. | Give the jaguar an input-neutral three-flare hint; retain the wrong-era guidance. | `tells a stalled jaguar quest player to aim the Bannlicht, not to dodge` |

## Follow-ups

- Run `pnpm validate` where `tsx` can open a local IPC socket.
- Run the Chapter 3 and smoke browser specs, one spec per command:

  ```sh
  KQ_E2E_PORT=5431 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/chapter-k3.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5431 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- Verify Festsaal re-entry with touch and reduced motion in a browser.
- Stage the review changes and commit where Git can write the worktree index:

  ```sh
  git add -A -- .mc/tasks/todo/TASK-043-chapter-3-progress-recovery.md \
    content/quests/03-kapitel-3.quests.json content/quests/README.md \
    content/story/03-kapitel-3.story.json content/story/README.md \
    docs/ACTION-RPG.md docs/ARCHITECTURE.md docs/PRD.md e2e/chapter-k3.spec.ts \
    src/boot.ts src/player/player.ts src/systems/contracts.ts \
    src/systems/interiors/festsaal.ts src/systems/interiors/index.ts src/systems/menagerie/index.ts \
    src/systems/quests/index.ts src/systems/quests/logic.ts src/systems/quests/wayfinding.ts \
    src/systems/story/engine.ts src/systems/story/index.ts src/systems/story/migrate.ts \
    src/systems/story/types.ts src/systems/story/validate.ts \
    tests/chapter-k3-recovery.test.ts tests/interiors.test.ts tests/menagerie.test.ts \
    tests/quests-content-b.test.ts tests/story.test.ts
  git commit -m 'fix(story): recover Festsaal and jaguar progress across retries' \
    -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```

## Closed (audit 2026-11-28)

Merged in PR #103. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
