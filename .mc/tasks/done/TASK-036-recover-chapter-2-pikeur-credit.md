---
id: TASK-036
aliases:
- TASK-036
title: Recover Chapter 2 Pikeur credit after a late Orangerie echo
slug: recover-chapter-2-pikeur-credit
status: done
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
updated: 2026-11-28
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

### Review fix round (2026-11-26)

The regression spec must spawn the Pikeur at the dam and start Landremont's echo with E after the
early fight. Both findings concern the fixture added by this branch.

- [x] Enter `k2_11` before setting the era and teleporting to the dam. Add a unit assertion for the
  setup call order.
- [x] Seed the earlier Orangerie and Fackeln echoes as heard. Add unit assertions for the Orangerie
  and Landremont clue states and keep the browser assertion for the exact echo E starts.
- [x] Update the action-RPG guide and PRD. Attempt all four gates and the locked browser checks,
  and record any sandbox blockers.

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
  `index.lock` during the original implementation. Commit `90ed430` subsequently recorded that work.
- 2026-11-26 — Review findings 1 and 2 fixed in the browser fixture. Both new unit tests failed
  against the original setup and passed after the fixes. The fixture and quest tests passed together
  with `Tests  24 passed (24)`.
- 2026-11-26 — Updated the action-RPG guide and PRD. Review-round `pnpm typecheck` and `pnpm build`
  passed. `pnpm test` reported `Test Files  119 passed (119)` and `Tests  1580 passed (1580)`, with
  zero failures. `pnpm validate` was blocked by `listen EPERM` on the `tsx` IPC socket. The locked
  Pikeur spec was blocked by `listen EPERM` on `127.0.0.1:5424`. The smoke spec was skipped because
  it needs the same preview server.
- 2026-11-26 — `mc validate` passed. Git staging was blocked by `Operation not permitted` when
  creating the worktree's `index.lock`. The review changes are in the worktree.

## Follow-ups

- Run `pnpm validate` in an environment with IPC sockets enabled.
- Run the browser checks where local ports are available, after `pnpm build`.

  ```sh
  KQ_E2E_PORT=5424 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/pikeur-credit.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5424 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- Commit the review changes with write access to the worktree index.

  ```sh
  git add -- .mc/tasks/todo/TASK-036-recover-chapter-2-pikeur-credit.md docs/ACTION-RPG.md docs/PRD.md e2e/helpers/pikeur-credit.ts e2e/pikeur-credit.spec.ts tests/pikeur-credit-fixture.test.ts
  git commit -m 'test(story): fix chapter 2 pikeur recovery fixture' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```

## Closed (audit 2026-11-28)

Merged in PR #71. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
