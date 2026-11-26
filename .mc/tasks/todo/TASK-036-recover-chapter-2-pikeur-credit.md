---
id: TASK-036
aliases:
- TASK-036
title: Recover Chapter 2 Pikeur credit after a late Orangerie echo
slug: recover-chapter-2-pikeur-credit
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- quests
- combat
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Recover Chapter 2 Pikeur credit after a late Orangerie echo

## Description

Keep Chapter 2 playable when the player repels the Pikeur before hearing the Landremont echo at the
Orangerie. Recover stalled saves using the recorded clear of the named `k2.pikeur` encounter.

## Acceptance Criteria

- [x] Hearing the echo before repelling the Pikeur completes both objectives.
- [x] Repelling the Pikeur before hearing the echo unlocks the return objective once the echo ends.
- [x] A save with the echo complete and `k2.pikeur` cleared recovers upon load.
- [x] Recovery grants neither a second boss payout nor credit for an unrelated kill.

## Plan
_Status: approved 2026-11-26_

**Approach:** Trace the Chapter 2 story, chase, combat and quest paths, then reproduce the missed
credit in a unit test. Reconcile the quest from the saved named encounter once its Pikeur objective
opens and when quest progress is restored.

**Files to touch:** `src/systems/quests/index.ts` and `logic.ts` for reconciliation,
`tests/quests.test.ts` and `e2e/pikeur-credit.spec.ts` for regression coverage, and
`docs/ACTION-RPG.md` and `docs/PRD.md` for the behaviour change.

**Steps:**
- [x] 1. Confirm the code path and run the failing regression test.
- [x] 2. Reconcile saved Pikeur credit and verify both orders, reload and reward safety.
- [x] 3. Document the change, run the available gates and record the sandbox blocks.

**Test plan:** Run targeted Vitest quest tests, `pnpm typecheck && pnpm test && pnpm validate && pnpm build`,
and `e2e/smoke.spec.ts` plus any edited spec under `scripts/dev/heavy.sh` on port 5424 with one worker.

**Risks:** Reconciliation must recognise only the named Chapter 2 fight and must preserve objective
ordering and normal combat reward handling.

**Open questions:** None.

## Progress

- Branch `dev/task-036`.
- 2026-11-26 — Confirmed that reaching the dam advances the story independently of the echo and
  that combat retains the cleared group. The targeted test run on the original quest logic failed
  on the late echo and both reload cases. The echo-first and unrelated-kill controls passed.
- 2026-11-26 — All 22 quest unit tests passed after reconciliation. Recovery uses normal
  quest progress and also credits a return already made in saves loaded in the present.
- 2026-11-26 — Documented the behaviour in the action-RPG guide and PRD. `pnpm typecheck` and
  `pnpm build` passed. `pnpm test` reported `Test Files  118 passed (118)` and
  `Tests  1578 passed (1578)`, with zero failures. `pnpm validate` was blocked before execution by
  `listen EPERM` on the `tsx` IPC socket. The locked Pikeur browser run was blocked by `listen EPERM`
  on `127.0.0.1:5424`, so the smoke spec could not start on that port either.
- 2026-11-26 — `mc validate` passed. Git staging was blocked by the sandbox at the worktree's
  `index.lock`. The implementation, tests, docs and task record are in the worktree.

## Follow-ups

- Run `pnpm validate` in an environment with IPC sockets enabled.
- Run the browser checks where local ports are available, after `pnpm build`.

  ```sh
  KQ_E2E_PORT=5424 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/pikeur-credit.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5424 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- Create the local commits with write access to the worktree index.

  ```sh
  git add -- src/systems/quests/index.ts src/systems/quests/logic.ts tests/quests.test.ts e2e/pikeur-credit.spec.ts
  git commit -m 'fix(story): restore chapter 2 pikeur quest credit' -m 'Refs: TASK-036' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  git add -- docs/ACTION-RPG.md docs/PRD.md .mc/tasks/todo/TASK-036-recover-chapter-2-pikeur-credit.md
  git commit -m 'docs(story): record chapter 2 pikeur recovery' -m 'Refs: TASK-036' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```
