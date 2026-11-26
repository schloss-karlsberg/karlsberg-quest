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
- [ ] 5. Commit the changes.

**Test plan:** Run focused Vitest tests, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run the tour, animals and smoke Playwright specs individually under the heavy lock on port 5408. When a browser is available, inspect the walkers from the trail at conversational distance and around LOD changes.

**Risks:** Walk and animal system update order can affect relocation timing. More permissive render bounds can draw extra triangles near the edge of the camera view.

**Open questions:** None.

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
- 2026-11-26. Verified the diff against `dev/task-016` and ran `mc validate`. Git could not
  create the worktree's `index.lock`. The changes are unstaged.

## Follow-ups

- Run the validator and these specs on a host that permits local sockets. Inspect the car park
  at 5–20 m on a phone and check the group's departure at the Bussole.

```sh
pnpm validate
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/animals.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5408 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

- Commit the two batches once Git can lock the index.

```sh
git add -- content/story/00-tour.story.json e2e/tour-slice.spec.ts src/systems/animals/dogs.ts src/systems/animals/index.ts src/systems/animals/runtime.ts src/systems/walk/runtime.ts src/systems/walk/types.ts tests/animals-dogs-follow.test.ts tests/tour-slice.test.ts tests/walk-system.test.ts
git commit -m 'fix(story): keep the tour group together through transitions' -m 'Refs: TASK-022' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add -- .mc/tasks/todo/TASK-022-tour-dogs-and-group-rendering.md docs/ACTION-RPG.md docs/ARCHITECTURE.md docs/NEXT-SESSION.md docs/PERFORMANCE.md docs/PRD.md docs/design/tour/systems.md src/systems/people/registry.ts src/systems/people/standin.ts src/systems/people/types.ts tests/people.test.ts
git commit -m 'fix(render): keep tour visitors solid and visible' -m 'Refs: TASK-022' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
