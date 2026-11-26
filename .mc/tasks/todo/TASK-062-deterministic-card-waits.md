---
id: TASK-062
aliases:
- TASK-062
title: Deterministic e2e waits for skill cards and timed notices
slug: deterministic-card-waits
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- e2e
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Deterministic e2e waits for timed cards

## Goal

Make the skill-card checks reliable on a loaded machine while preserving what players see and how they dismiss notices.

## Acceptance criteria

- [x] Explain the clock and hold conditions that control skill-card dismissal.
- [x] Advance the skill-card checks deterministically and cover the timing contract with a unit test.
- [x] Audit e2e specs and helpers for similar waits and fix the obvious cases.
- [x] Preserve normal duration, touch and reduced-motion behaviour.
- [x] Document the testing aid and add a PRD changelog row.
- [ ] Pass the four gates and run the affected specs plus smoke under the lock where supported.

## Plan

- [x] Trace skill, level and other timed notices through their update callbacks and the debug step API.
- [x] Use the existing simulation path where possible. Exercise the timing boundary and update the affected specs with bounded checks.
- [x] Update the testing aids and PRD, run the gates and check each affected spec and smoke on port 5449.

## Progress

Branch `dev/task-062`, opened on 2026-11-26.

The old skill-card clock advanced by at most 0.1 s per render and also by fixed updates in manual mode. The level card advanced only on renders. A passive wait could take minutes to accumulate the 6.2 s reading time. The slot also pauses cards behind a title, modal, action or dialogue. CSS starts the entrance animation. The card removes itself when its elapsed time reaches its duration.

Skill and level cards now count fixed game ticks. The shared slot still uses presentation time for its gap and soft holds. The manual-mode helper supplies both deltas, checks the state before advancing, and reports the slot and hold reasons after a budget of 1,800 ticks. Waiting for an unlock to finish includes the settle window and queued unlocks.

Audited the specs and helpers for card, toast, reward and banner assertions. Replaced passive waits in skills, progression, integration, quests and the chapter 3 helper, and rAF polling for the payout and queued clue in pacing. The phone screenshot tour in `e2e/mobile/tour.pw.ts` measures live banner exposure and captures actual touch interactions. Toast input assertions exercise real dismissal. These checks retain their presentation timing.

## Verification

- `pnpm typecheck` passed.
- `pnpm test` passed with 0 failed. `Test Files  125 passed (125)`. `Tests  1608 passed | 1 todo (1609)`.
- `pnpm validate` stopped at `listen EPERM` when tsx opened its IPC socket. Running the same validator with `node --import tsx scripts/validate-content.ts` returned `✓ content valid (1 warning(s))`.
- `pnpm build` passed.
- The sandbox denied binding `127.0.0.1:5449` with `EPERM`. Browser execution was skipped.
- Git could not create the worktree's `index.lock`. All edits remain in the worktree.
- Voiced lines requiring new text — none.

## Follow-ups

Run `pnpm validate` and the browser specs outside the sandbox. The chapter 3 and 4 specs and the campaign use the changed chapter helper. Each iteration below takes its own machine-wide lock.

```sh
for spec in skills chapter-k3 integration progression quests pacing chapter-k4 campaign smoke; do
  KQ_E2E_PORT=5449 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1 --reporter=line
done
```

Playwright discovered 31 tests across these nine files. MissionControl validation passed.

Commit the two changes from this worktree once its Git index is writable.

```sh
git add src/systems/skills/{card,index}.ts src/systems/progression/index.ts tests/skill-card-clock.test.ts
git commit -m 'fix(ui): advance skill and level cards on game time' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add e2e/helpers/{cards,k3}.ts e2e/{integration,pacing,progression,quests,skills}.spec.ts CONTRIBUTING.md docs/{ACTION-RPG,PRD}.md .mc/tasks/todo/TASK-062-deterministic-card-waits.md
git commit -m 'test(ui): step through timed card waits' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
