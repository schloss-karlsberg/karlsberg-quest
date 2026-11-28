---
id: TASK-062
aliases:
- TASK-062
title: Deterministic e2e waits for skill cards and timed notices
slug: deterministic-card-waits
status: done
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
updated: 2026-11-28
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
- [x] Pass the four gates and run the affected specs plus smoke under the lock where supported.

## Plan

- [x] Trace skill, level and other timed notices through their update callbacks and the debug step API.
- [x] Use the existing simulation path where possible. Exercise the timing boundary and update the affected specs with bounded checks.
- [x] Update the testing aids and PRD, run the gates and check each affected spec and smoke on port 5449.

## Progress

Branch `dev/task-062`, opened on 2026-11-26.

The old skill-card clock advanced by at most 0.1 s per render and also by fixed updates in manual mode. The level card advanced only on renders. A passive wait could take minutes to accumulate the 6.2 s reading time. The slot also pauses cards behind a title, modal, action or dialogue. CSS starts the entrance animation. The card removes itself when its elapsed time reaches its duration.

Skill and level cards now count fixed game ticks. The shared slot still uses presentation time for its gap and soft holds. The manual-mode helper supplies both deltas, checks the state before advancing, and reports the slot and hold reasons after a budget of 1,800 ticks. Waiting for an unlock to finish includes the settle window and queued unlocks.

Audited the specs and helpers for card, toast, reward and banner assertions. Replaced passive waits in skills, progression, integration, quests and the chapter 3 helper, and rAF polling for the payout and queued clue in pacing. The phone screenshot tour in `e2e/mobile/tour.pw.ts` measures live banner exposure and captures actual touch interactions. Toast input assertions exercise real dismissal. These checks retain their presentation timing.

## Review round (2026-11-26)

- The behaviour change is sound: in normal play both cards tick at 60 Hz, a held or paused card
  stops, and the hold now covers every pause reason (title, modal, travel), which the slot's own
  holds already covered for modals. Touch dismissal and reduced motion are unchanged.
- `clearCards` in `e2e/helpers/k3.ts` dismissed the payout notice only before stepping the level
  card out, so a payout queued behind it could reach the screenshot. It now dismisses it again.
- The `pol-flow` comment still said unlock cards settle on rendered frames. Corrected.
- Note for the PR title: `42f5a7c` changes runtime card timing under a `test` type. Squash with
  `fix(ui): advance skill and level cards on game time` so release-please lists it.

## Verification

```text
pnpm typecheck    exit 0
pnpm test         Test Files  125 passed (125)
                  Tests  1608 passed | 1 todo (1609)
pnpm validate     ✓ content valid (1 warning(s))
pnpm build        ✓ built
e2e skills        7 passed (3.0m)
e2e chapter-k3    2 passed (32.2m, load average about 40)
e2e smoke         7 passed (1.8m)
```

The unit run had 0 failed. No voiced lines require new text.

## Commits

- `42f5a7c test(main): deterministic waits for the skill card in e2e` (runtime clock change, helper,
  specs, unit test and docs)
- `1beaae1 test(ui): dismiss a payout that waited behind the level card in k3 shots`
- the commit that adds this report

## Follow-ups

The other specs that use the changed helpers were not run in this round: `integration`,
`progression`, `quests`, `pacing`, `chapter-k4` and `campaign`. Run them under the lock before release.

## Closed (audit 2026-11-28)

Merged in PR #97. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
