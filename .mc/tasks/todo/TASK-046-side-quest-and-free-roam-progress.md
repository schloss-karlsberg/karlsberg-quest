---
id: TASK-046
aliases:
- TASK-046
title: 'Soft-lock and progress-loss hunt: side quests and free roam'
slug: side-quest-and-free-roam-progress
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
- saves
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Soft-lock and progress-loss hunt: side quests and free roam

Trace optional progression and fix the highest-impact confirmed blockers without changing voiced
text, design, or balance. Do not redo fixes assigned to other tasks.

## Acceptance criteria

- [x] Trace side quests and objectives, bottles, Chronik echoes, free-roam hints, and chapter replay across interruptions and older saves.
- [x] Reproduce 3–6 confirmed bugs with failing Vitest cases; fix them and recover affected saves where possible.
- [x] Keep German text, touch and reduced motion intact; update the behaviour docs and PRD changelog.
- [x] Pass all four gates with zero failed unit tests; run locked smoke E2E on port 5434 or record the blocker and command.
- [x] Record repros, root causes, fixes, tests, and follow-ups; commit the review fixes locally.
- [x] Recover previously collected Pacht slips on retry, and honour the scheduled live deadline.
- [x] Keep Peter's Lehnstuhl offer reachable when replaying K3 while retaining earned rewards.
- [x] Restore the complete free-roam hint when the ending slot exists, and verify the auto slot written by the save manager.

## Plan
_Status: approved 2026-11-26 (implementation requested in task brief)_

**Approach:** Cross-check content definitions against progression dispatch and save lifecycles. Test
ordering, duplicate events, travel/era changes, interruption, reload, and replay before patching.

**Files to touch:** Relevant progression systems and existing tests, this task, and the RPG/PRD docs.

**Steps:**
- [x] Trace content and lifecycle owners; triage issues against the exclusions.
- [x] Record reproducible regressions and run them on the unfixed code.
- [x] Apply narrow fixes and guards; document what resumes and what is intentionally reset.
- [x] Attempt gates and locked smoke; record outcomes.
- [x] Commit the original ending fix and documentation locally (`6e4c83f`).

**Review fix round (2026-11-26):**

- [x] Add regressions for saved enemy drops and the authored Pacht cutoff, then fix retry and load reconciliation.
- [x] Track main-quest completion for the current replay and exercise chapter selection through Peter's offer and the era shift.
- [x] Exercise the real story runtime and in-memory save manager for completed-ending restore and autosave.
- [x] Update behaviour docs, attempt the four gates and locked browser checks, and record the results.
- [x] Commit the review fixes locally (`1b8a735`).

**Test plan:** Focused Vitest, `pnpm typecheck && pnpm test && pnpm validate && pnpm build`, then
`KQ_E2E_PORT=5434 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

**Risks:** Reapplying a payout could duplicate rewards; changing quest eligibility could affect intended chapter deadlines.

**Open questions:** None before triage.

## Progress
- Branch: `dev/task-046`.
- Baseline: eight regressions fail on the original implementation (quests, bottles, and post-credits hints).
- `pnpm typecheck` and `pnpm build` passed; `pnpm test`: `Test Files  118 passed (118)`, `Tests  1582 passed (1582)`.
- `pnpm validate` was blocked by `EPERM` on tsx's IPC listener. The smoke spec was blocked by `EPERM` on `127.0.0.1:5434` before Chromium started. No E2E specs were edited. On an unrestricted shell, run `pnpm validate` and the locked `e2e/smoke.spec.ts` command above.
- `mc validate` and `git diff --check` passed. No voiced text, voice assets, input mappings, or motion settings changed.
- Original implementation committed as `626a097` (side quests and replay), `c18853c` (bottles), and `6e4c83f` (side-quest credit and post-credits guidance).

### Review fix round

| Finding | Outcome and regression |
| --- | --- |
| 1. Pacht retry after reload | Fixed. Recover unique saved pickup IDs for the drop objective. The test takes a slip, fails, reloads, and reuses the enemy ID. It also checks that duplicate and unrelated IDs give no extra progress. |
| 2. Peter's offer on K3 replay | Fixed. The three main quests gating Peter's departure use saved replay attempts. Original completions and quest payouts stay recorded. Tests select K3 through Kapitel, use Q, accept Peter's offer, reload, and advance through the opening gates. They also check the saved basket and bonus XP. |
| 3. Early Pacht deadline | Fixed. The authored command waits for the shift to finish. Availability polling prevents new offers past the cutoff, and load reconciliation repairs a stale quest. A runtime test checks the line, horn, shift and failure in order. |
| 4. Legacy free-roam hint | Fixed. Restore uses the same authored objective and ending-slot check as fresh completion. A runtime test loads legacy saves with and without the slot and checks the Pause action. |
| 5. Completion autosave test | Fixed. Credits run through the story system and a real SaveManager with in-memory storage. The test reads the written auto slot and checks that the story is inactive and the objective is `end.frei`. Removing the completion autosave makes the test fail. |
| 6. Obsolete commit instructions | Fixed. The checklist records `6e4c83f` and removes the stale staging and commit commands. |

The targeted unit assertions failed when their corresponding runtime fixes were temporarily
removed. The browser regression is in `e2e/chapter-k3.spec.ts`.

- Review gates: `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  119 passed (119)` and `Tests  1587 passed (1587)`. `pnpm validate` was blocked
  by `EPERM` when tsx tried to open its IPC socket.
- Locked runs of `e2e/chapter-k3.spec.ts` and `e2e/smoke.spec.ts` both stopped before the
  browser started because the preview server could not bind `127.0.0.1:5434` (`EPERM`).
- The review fixes were committed as `1b8a735`.

### Integration (2026-11-26)

- The four branch commits were squashed into one and rebased onto main after #69 (TASK-040).
  The quest chapter cleanup had moved to `QuestBook.dropEarlier`, so the side-quest `close` rule
  now lives there. TASK-040's saved-calm credit (`settleCalm`) runs for every calm objective, and
  the cassowary receipt stays as the fallback once its spawn record is gone. Restore keeps main's
  order (reassert with the combat recovery first), then settles saved progress and repairs
  deadlines while recovered payouts are collected. A second rebase (after #99) also validates a
  saved `replay` attempt in `normaliseSlice` like the earned quests.
- Gates after the rebase: typecheck, `pnpm test` (2002 passed, 0 failed), `pnpm validate` and
  `pnpm build` passed. The locked e2e runs on port 5434 cover `quests`, `chronik`, `chapter-k3` and `smoke`.

### Audit trail

| Area | Data and runtime traced |
| --- | --- |
| K1 | Kasuar (one-time calm and gardener turn-in), Festpläne (group kills, three fixed finds, two ordered clues), Hundenamen (five guarded fixed finds) through offer, accept, era-gated encounters, turn-in, chapter close, and load. |
| K2 | Bodenbrett and Lichter (voice offers after Wachbuch, group kills, optional clue timing), Kisten (four fixed finds, one group, giver turn-in) through chapter exit and replay. |
| K3 | Jaguar (TASK-040), Kabinett (four kills and four drops), Lehnstuhl (kills, follower and gate, Peter’s earlier departure) through chapter beats, wake checkpoints, and NPC rebuild. |
| K4 | Zeichen (two saved clues, Gruslinge, fixed find, present-day reach), Gräben (three groups, previously examined relief), Pacht (three kills and drops) through their entry/exit deadlines, partway saves, and the change to endings. |
| Bottles and echoes | All 24 bottle spots across five eras; pickup/drop IDs, lighting, touch action, threat and animation holds, milestones. All campaign echo clues traced through eligibility, hold-to-listen, detachment, archive discovery, save hooks, and era/capture interruption; no overlap with TASK-029. |
| Ending and replay | `e1` choice, `e2` handoff, `e3` credits and free-roam exit; Pause confirmation, retained history, earlier quest cleanup, delayed hint writes, and the saved ending slot. TASK-039 stays separate. |

### Confirmed bugs

Root-cause line numbers refer to the original checkout (`d2d1f48`).

| Repro | Root cause | Fix and regression |
| --- | --- | --- |
| Lead the cassowary home during the Karlslust visit before accepting the gardener’s quest; later accept, or reload an already-stuck active quest. | `src/systems/quests/logic.ts:613` only reconciles clue and photo history, but `src/systems/menagerie/index.ts:221` suppresses a calmed animal. | Reconcile the saved `kasuar` receipt once. `credits the already-homed Karlslust cassowary after accepting the gardener’s quest`. |
| Skip accepting Gräben, then reach the K4 dawn return; it auto-starts after its deadline. A stale active save can also retain the quest hint. | `src/systems/quests/index.ts:212` withdraws the offer while `src/systems/quests/logic.ts:645` can re-offer it immediately. | Honour authored entry and earlier exit cutoffs, including after load; distinguish a missing giver from a genuine retry. `does not restart the Graben quest or keep its stale hint after the K4 deadline`. |
| Leave K2 with unfinished Bilderkisten, then select K2 again and visit its giver. | `src/systems/quests/logic.ts:648` auto-offers only `hidden` quests, never `failed`. | Re-offer missed quests only in their chapter/window; leave completed payouts and bonuses intact. `offers a missed Bilderkisten quest again when replaying its original chapter`. |
| Load a retry with one Bilderkiste already taken and reset objective counts; the other three never reach four. | `src/systems/quests/logic.ts:298` resets counts while `src/systems/progression/logic.ts:399` refuses to respawn taken pickup IDs. | Reconcile exact fixed pickup IDs without granting them again. `recovers the already-taken Bilderkiste in a replay save with reset objective counts`. |
| Shake down or take a bottle within the save cooldown, then reload; an old complete bottle save may also have no Codex reward. | `src/systems/flaschen/index.ts:328` and `:350` did not checkpoint reliably; `:439` reapplied the tint without reconciling the final fact. | Force the checkpoint after stable state and repair the completion reward idempotently. `keeps a shaken-down bottle and a pickup made inside the autosave cooldown`; `restores a fully collected old save that is missing the final reward`. |
| Finish credits, save between ending completion and the delayed hint, and reload into inactive free roam; the hint is gone. | `content/story/05-enden.story.json:285` schedules the hint after the story has already stopped; `src/systems/story/index.ts:547` only forces the earlier credits save. | Install and save the Pause hint at completion; repair old missing hints (no voice changes). `sets the free-roam hint before a save can capture an inactive ending`; `restores the missing free-roam hint in an older completed ending save`. |

### Follow-ups

- Browser-check party scenery and ending flag lifetime when going backwards through Kapitel after credits; the epilogue Continue issue is tracked separately in TASK-039.
- Once TASK-029 lands, exercise full echo discovery and immediate auto-slot reload together, including the detached listening path; this patch does not change Chronik.
