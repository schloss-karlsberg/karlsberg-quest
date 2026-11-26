---
id: TASK-025
aliases:
- TASK-025
title: Save integrity for item use and caches, plus the Lampenöl amount
slug: save-integrity-and-lampenoel
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- save
- combat
- progression
- travel
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Save integrity for item use and caches, plus the Lampenöl amount

## Description

Save successful consumable uses and guarded-cache rewards as complete updates. Apply the oil
amount already defined for Lampenöl and preserve the existing reward and resource caps.

At `d2d1f48`, Ausrüstung and quick-use both save after `ProgressionCore.use`, but combat waits
until its next update to mirror HP, stamina and Bannlicht. Each cache pickup can autosave after
the cache is marked done and before its remaining rewards arrive. Lampenöl requests a full tank
even though its `ItemEffect` specifies 0.5.

## Acceptance Criteria

- [x] Immediate save and reload preserve one fewer Kräuterbalsam and 65 HP from a starting 20 HP with a 1× multiplier. A Node test covers Ausrüstung while paused, quick-use, and an empty stack.
- [x] Riechsalz and Lampenöl persist stamina and Bannlicht within the player's caps.
- [x] A two-supply cache saves its opened flag, both seeded pickup IDs and XP together, even just after another autosave or when a cinematic holds autosaves. Replaying the clear before or after reload leaves the payout unchanged.
- [x] Lampenöl adds 0.5 oil, lights the lantern, consumes one bottle and grants up to two Bannlicht charges. Tests cover 20% → 70% and 80% → 100%, plus full refills for story, home and Wegsteine.
- [x] Update documentation and attempt the touched e2e spec and `e2e/smoke.spec.ts` on port 5413 with the machine-wide lock.
- [ ] Pass all four gates. Content validation needs a shell that allows the `tsx` IPC socket.

## Plan

_Status: approved 2026-11-26_ (task instructions authorize implementation)

**Approach:** Mirror combat resources synchronously in the item handler and share the successful
use and save path between the gear button and quick-use. Carry the oil increment to hunt, where
full refills retain their existing behavior. Hold autosaves during the cache reward events and
request a forced checkpoint once the opened flag, rewards and XP are ready.

**Files to touch:**

- `src/systems/combat/index.ts` for combat resource snapshots.
- `src/systems/progression/{index,pages,logic}.ts`, `src/systems/contracts.ts` and `src/systems/hunt/{index,lanternLogic}.ts` for item use, oil and saving.
- `src/systems/travel/index.ts` for the cache checkpoint.
- `tests/` for immediate save and reload, request handling and seeded payout checks. `e2e/progression.spec.ts` for the oil-use contract and gameplay checks.
- `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md` and `docs/PRD.md` for the behavior and changelogs.

**Steps:**

- [x] 1. Fix the item-use checkpoint and oil amount, then cover the shared use paths in Node and update the progression browser spec.
- [x] 2. Fix guarded-cache checkpoints and cover throttle, cinematic holds and duplicate clear events with a fake clock.
- [x] 3. Update the docs, run the four gates and attempt both browser specs under the lock.

**Test plan:** Run focused Vitest tests first, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
Run `e2e/progression.spec.ts` and `e2e/smoke.spec.ts` individually using `KQ_E2E_PORT=5413`,
`scripts/dev/heavy.sh --max-hold 15`, one worker and the line reporter.

**Risks:** Event handlers can request nested autosaves. A cinematic hold must keep the completed
cache checkpoint pending until playback ends. Preserve the existing pickup IDs and XP formula.

**Open questions:** None.

## Progress

- Branch `dev/task-025`, based on `d2d1f48`.
- 2026-11-26. Both use paths share a forced checkpoint after their effects. The focused save, progression and hunt tests pass (48 tests), and typecheck passes.
- 2026-11-26. Cache payouts use a single checkpoint. The focused save and travel tests pass (43 tests), including recent autosaves, cinematic release and duplicate clear events after reload.
- 2026-11-26. Git staging was blocked by a permission error creating the worktree's `index.lock`.
- 2026-11-26. Updated the architecture, action RPG and PRD docs. Typecheck, unit tests (`Tests  1585 passed (1585)`) and build passed. `pnpm validate` stopped before validation because the sandbox denied the `tsx` IPC socket. Playwright attempted both specs under the lock and stopped before launching Chromium because the preview server could not bind `127.0.0.1:5413`.

## Follow-ups

- Run `pnpm validate` and the locked `e2e/progression.spec.ts` and `e2e/smoke.spec.ts` commands in a shell that permits socket listeners.
- Stage and commit from a shell with write access to this worktree's Git index. The changes are in the worktree.
- Voiced dialogue text changes needed: none.
