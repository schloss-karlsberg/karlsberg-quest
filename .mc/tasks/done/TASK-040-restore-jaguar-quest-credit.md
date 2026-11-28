---
id: TASK-040
aliases:
- TASK-040
title: Restore jaguar quest credit after an early calm
slug: restore-jaguar-quest-credit
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- quests
- menagerie
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Restore jaguar quest credit after an early calm

## Goal

The garden spawns `k3.jaguar` before Hanne can offer „Der Jaguar“. Menagerie saves the calm and
suppresses the spawn, while the quest only counts live calm events with an open objective. Use the
saved calm to award the existing quest payout in that order and recover active saves at 0/1.

## Acceptance Criteria

- [x] Calming the jaguar before acceptance pays the quest once when accepted.
- [x] Accepting first and calming it afterward still pays once.
- [x] A stranded save with the animal absent recovers on load.
- [x] Calming another species leaves the jaguar objective at 0/1.
- [x] Early calm completes the quest and saves the payout while Hanne’s conversation is still open.
- [x] Recovery pays exactly 200 base XP and two Lampenöl once. Continue presents the recovered
  reward, and New Game discards the pending presentation.

## Plan

_Status: approved 2026-11-26_

**Approach**. Pass the saved menagerie slice into quest objective reconciliation on acceptance,
objective activation and restore. Match saved calm IDs to the objective and recover the garden
jaguar from its stable ID when its spawn record has been cleared.

**Files to touch**

- `tests/quests.test.ts` and `tests/quests-runtime.test.ts` for saved calm, autosave and payout regressions.
- `src/systems/quests/index.ts` and `logic.ts` for saved calm reconciliation.
- `e2e/jaguar-quest.spec.ts` for the browser regression.
- `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md` and `docs/PRD.md` for behavior and changelog entries.

**Steps**

- [x] Reproduce the bug with a failing unit test against the shipped Chapter 3 quest.
- [x] Add saved calm reconciliation and verify the four acceptance cases.
- [x] Document the behavior and attempt the four gates.
- [x] Check browser availability with the jaguar regression under the shared lock on port 5428.
- [x] Review the diff and prepare the local Conventional Commits.

**Test plan**. Run `pnpm exec vitest run tests/quests.test.ts`, then `pnpm typecheck`, `pnpm test`,
`pnpm validate` and `pnpm build`. Run the jaguar regression and `e2e/smoke.spec.ts` separately,
with one worker and `scripts/dev/heavy.sh --max-hold 15`.

**Risks**. TASK-029 also touches `quests/logic.ts`. Keep the change within calm reconciliation and
reuse the normal objective progress and payout paths.

**Open questions**. None.

### Review fix round (2026-11-26)

- [x] Reconcile an already-calmed jaguar during quest acceptance, before its forced autosave.
- [x] Carry recovered reward presentation through Continue and clear it when starting a new game.
- [x] Add unit regressions and tighten the browser checks for paused acceptance and exact payout.
- [x] Update the behavior docs, attempt the four gates and the locked browser check, and record the results.

## Progress

- Branch `dev/task-040`.
- 2026-11-26. Confirmed that the story spawns the jaguar before the Festsaal prerequisite is met and that menagerie persists the calm in `systems.menagerie.calmed`.
- 2026-11-26. Before the fix, `tests/quests.test.ts` reported `Tests  2 failed | 19 passed (21)`. Both failures reproduced a jaguar objective stuck at 0/1.
- 2026-11-26. All four acceptance cases passed after the fix, and the quest and photo suites reported `Tests  60 passed (60)`.
- 2026-11-26. `pnpm typecheck`, `pnpm test` (`Tests  1577 passed (1577)`) and `pnpm build` passed. The sandbox blocked `pnpm validate` with `EPERM` when `tsx` tried to listen on its IPC socket.
- 2026-11-26. The locked jaguar spec could not start Vite preview (`listen EPERM` on `127.0.0.1:5428`). Smoke was skipped because it uses the same server.
- 2026-11-26. The initial patch is committed as `c985e66`.
- 2026-11-26. Review fixes cover the paused acceptance autosave, recovered reward presentation on
  Continue and New Game, and exactly 200 XP and two Lampenöl on the first recovery. The quest,
  quest runtime and photo suites reported `Tests  63 passed (63)`.
- 2026-11-26. Review gates passed for `pnpm typecheck`, `pnpm test` (`Tests  1580 passed (1580)`,
  zero failed) and `pnpm build`. `pnpm validate` hit the same `tsx` IPC permission error.
- 2026-11-26. The locked jaguar spec again hit `listen EPERM` on `127.0.0.1:5428` before
  Chromium could start. The smoke spec uses the same server and was skipped.
- 2026-11-26. All three review findings are fixed. The unit suite covers the acceptance save,
  the two title choices and the exact payout across reloads. Browser verification is pending.
- 2026-11-26. The review patch was committed as `249ab0a`.
- 2026-11-26. PR review: a quest finished on acceptance still showed its „Nebenaufgabe“ banner
  after the payout. The banner now shows only while the quest runs. The jaguar spec failed on the
  stale banner before the guard and passes with it.
- 2026-11-26. Gates passed: `pnpm typecheck`, `pnpm test` (`Tests  1612 passed | 1 todo`, zero
  failed), `pnpm validate` and `pnpm build`. Under the shared lock on port 5428,
  `e2e/jaguar-quest.spec.ts` passed 2/2 and `e2e/smoke.spec.ts` passed 7/7.

## Follow-ups

- None.

## Closed (audit 2026-11-28)

Merged in PR #69. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
