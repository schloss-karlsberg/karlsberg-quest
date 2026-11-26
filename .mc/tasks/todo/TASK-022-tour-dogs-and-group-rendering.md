---
id: TASK-022
aliases:
- TASK-022
title: Tour dogs and group rendering
slug: tour-dogs-and-group-rendering
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- tour
- render
sprint: ''
milestone: ''
depends_on:
- TASK-016
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Tour dogs and group rendering

## Goal

Resolve the remaining dog and crowd rendering findings in the tour handoff, building on TASK-016.

## Acceptance criteria

- [x] Tour dogs move with the group through fades and warps, including sharp reversals without backward foot slide. Reduced motion is respected.
- [x] Tour members are solid at 5–20 m and stay visible within normal tour distances. Document the cause, LOD distances, and the draw call and triangle cost.
- [x] A regression test verifies that Gerold's wait barks fire when the player falls behind.
- [x] Voiced text is preserved.
- [ ] All four gate commands and browser verification pass.

## Plan
_Status: approved 2026-11-26_

**Approach:** Trace the walk transition, dog steering, and people render paths. Reuse the group relocation signal for dog placement and align movement with body heading. Inspect material and culling settings before changing the crowd budget. Cover the wait bark through the walk system.

**Files to touch:** Walk, animals and people systems, focused Vitest tests, and the handoff, tour systems, performance and changelog docs.

**Steps:**
- [x] 1. Wire dogs into group relocations and test their turning behaviour.
- [x] 2. Fix crowd opacity and visibility with render-budget regression coverage.
- [x] 3. Cover the lagging-player wait bark in a system test.
- [x] 4. Update docs, run the four gate commands and try the locked e2e check.
- [x] 5. Commit the changes.

**Test plan:** Run focused Vitest tests, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run the tour, animals and smoke Playwright specs individually under the heavy lock on port 5408. When a browser is available, inspect the walkers from the trail at conversational distance and around LOD changes.

**Risks:** Walk and animal system update order can affect relocation timing. More permissive render bounds can draw extra triangles near the edge of the camera view.

**Open questions:** None.

## Review fix round

Resolve the crowd rendering, bark delivery, dog save and portrait test findings on
`dev/task-022`, including the TASK-016 changes that ship with it.

### Acceptance criteria

- [x] Every skinned part, including ghost depth twins, has a local sphere before its first render.
- [x] A quiet leash wait delivers an `imhoff.bark.wait.*` dialogue line in the unit test. The tour
  spec asserts delivery, with browser verification tracked below.
- [x] A mid-turn save preserves planted dog movement and older saves default to normal steering.
- [x] The tour browser test emulates touch and asserts portrait rotation and landscape dialogue.
- [ ] All four standard gates pass with zero unit failures, and the tour, animals and smoke specs pass.
- [ ] Inspect the crowd at 5–20 m on a phone and the Bussole departure through the era shift.
- [x] Preserve the voiced dialogue and record the review changes in the docs.
- [ ] Commit the remaining review changes.

### Plan

- [x] Initialize local render spheres alongside the shared frustum bounds and test both mesh paths.
- [x] Drive the walk and bark systems together in the unit regression and observe delivered dialogue in the tour spec.
- [x] Persist the planted turn state and check resumed and legacy saves.
- [x] Match the tour's portrait test setup to the runtime touch requirements and cover the rotate rule in Vitest.
- [x] Update the docs, attempt the gates and locked verification, and record blocked checks.

## Progress

- Branch `dev/task-022` starts at `05b3249`, the tip of `dev/task-016`.
- 2026-11-26. Both authored fades and catch-up snaps place the dogs using the walk runtime's
  landing poses. The dog tests cover a planted 180° turn with both reduced-motion settings.
- 2026-11-26. Removed the solid stand-ins' alpha-hash fade. Shared body bounds keep animated
  parts together, and 58–60 m draw hysteresis keeps the hard limit. The original slice report
  also identified the scripted Bussole despawn. The group and dogs continue uphill until the
  shift hides them. Full-crowd mesh counts are 161 draws and 118,392 triangles at 10 m and
  161 draws and 112,431 triangles at 20 m.
- 2026-11-26. The leash test matches the real wait-bark lines. The tour spec checks the event
  in its existing wait sequence. All 50 tour `say` actions preserve IDs, speakers, text and order.
- 2026-11-26. `pnpm typecheck`, `pnpm test`, and `pnpm build` passed.
  `Test Files  119 passed (119)` and `Tests  1588 passed (1588)`, with zero failures.
  `pnpm validate` hit `EPERM` on the launcher's IPC socket. Running the validator directly
  reported `✓ content valid (1 warning(s))`. The warning is in the example pack.
- 2026-11-26. Locked tour e2e stopped before browser launch because the sandbox refused
  Vite's bind on `127.0.0.1:5408`. The remaining browser checks use the same listener.
- 2026-11-26. Verified the diff against `dev/task-016` and ran `mc validate`. The original
  changes are in `afc7568` and `cf32d07`.
- 2026-11-26 review. Body construction seeds each skinned mesh's local sort bound. Ghost twins
  copy the bound, and all parts still share the root-space frustum check.
- 2026-11-26 review. A save made with 89° left in a dog reversal matches the uninterrupted run.
- 2026-11-26 review. The wait test drives the walk and bark systems together. The tour spec
  steps a quiet 30 m wait and checks delivered dialogue before triggering the find call at 45 m.
  The portrait test now uses mobile touch emulation and advances the raised card with a tap.
  The spec also checks that Gerold advances uphill during the Bussole beat.
- 2026-11-26 review. `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  119 passed (119)` and `Tests  1596 passed (1596)`, with zero failures. All 50 tour
  `say` actions still match `origin/main` by ID, speaker, text and order.
- 2026-11-26 review. `pnpm validate` stopped at the tsx IPC listener with `EPERM`. The locked
  tour spec stopped before browser launch at the Vite listener on `127.0.0.1:5408`. The animals
  and smoke specs use that same listener and were skipped. The phone and era-shift visual checks
  remain open. `mc validate` passed.
- 2026-11-26 review. The render and dog save fixes are committed as `b5ec804` and `667b1ed`.
  Git refused to create `index.lock` when staging the test and documentation batch.

## Follow-ups

- Run the validator and these specs on a host that permits local sockets. Inspect the crowd
  at 5–20 m on a phone and watch the group and dogs leave the Bussole through the era shift.

```sh
pnpm validate
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/animals.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

- Commit the remaining batch when Git can lock the worktree index.

```sh
git add -- e2e/tour-slice.spec.ts tests/walk-system.test.ts tests/touchMap.test.ts docs/ACTION-RPG.md docs/ARCHITECTURE.md docs/PRD.md docs/design/tour/systems.md .mc/tasks/todo/TASK-022-tour-dogs-and-group-rendering.md
git commit -m 'test(story): verify delivered wait barks and phone rotation' -m 'Refs: TASK-022, TASK-016' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
