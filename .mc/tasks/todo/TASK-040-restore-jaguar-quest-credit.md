---
id: TASK-040
aliases:
- TASK-040
title: Restore jaguar quest credit after an early calm
slug: restore-jaguar-quest-credit
status: in-progress
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
updated: 2026-11-26
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

## Plan

_Status: approved 2026-11-26_

**Approach**. Pass the saved menagerie slice into quest objective reconciliation on acceptance,
objective activation and restore. Match saved calm IDs to the objective and recover the garden
jaguar from its stable ID when its spawn record has been cleared.

**Files to touch**

- `tests/quests.test.ts` for the failing reproduction and payout regression tests.
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

## Progress

- Branch `dev/task-040`.
- 2026-11-26. Confirmed that the story spawns the jaguar before the Festsaal prerequisite is met and that menagerie persists the calm in `systems.menagerie.calmed`.
- 2026-11-26. Before the fix, `tests/quests.test.ts` reported `Tests  2 failed | 19 passed (21)`. Both failures reproduced a jaguar objective stuck at 0/1.
- 2026-11-26. All four acceptance cases passed after the fix, and the quest and photo suites reported `Tests  60 passed (60)`.
- 2026-11-26. `pnpm typecheck`, `pnpm test` (`Tests  1577 passed (1577)`) and `pnpm build` passed. The sandbox blocked `pnpm validate` with `EPERM` when `tsx` tried to listen on its IPC socket.
- 2026-11-26. The locked jaguar spec could not start Vite preview (`listen EPERM` on `127.0.0.1:5428`). Smoke was skipped because it uses the same server.
- 2026-11-26. The sandbox denied `git add` access to the worktree `index.lock`. The patch is ready in the worktree.

## Follow-ups

- Run `pnpm validate` in an environment that allows the `tsx` IPC socket.
- Stage and commit the fix, regression coverage and task record from an environment that can write the worktree index.
- Run each browser spec with the shared lock and port 5428.

  ```sh
  KQ_E2E_PORT=5428 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/jaguar-quest.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5428 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```
