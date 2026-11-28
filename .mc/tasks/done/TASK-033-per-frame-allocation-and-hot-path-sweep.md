---
id: TASK-033
aliases:
- TASK-033
title: Per-frame allocation and hot-path sweep
slug: per-frame-allocation-and-hot-path-sweep
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- performance
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Per-frame allocation and hot-path sweep

## Goal

Reduce repeated heap allocation and work in the simulation, renderer and UI while preserving gameplay, visuals and accessibility.

## Acceptance criteria

- [x] Trace fixed updates and frame callbacks across `src/` and prioritise clear wins by frequency and cost.
- [x] Remove redundant work on the selected paths, including unchanged HUD work where practical.
- [x] Add focused Vitest coverage for unchanged state and transitions.
- [x] Document hot-path rules and the top findings in `docs/PERFORMANCE.md` and add a PRD changelog row.
- [x] Run the four gates and record the smoke result or sandbox limitation (see the second review below).

## Plan

1. Follow the loop into systems, renderer and HUD. Identify the owning lifetime of temporary values and all inputs to any proposed cache.
2. Optimise the most frequent avoidable work in independent areas. Keep any edits in shared areas small and record larger opportunities for their owners.
3. Exercise the normal entry points with operation counters or state transition tests. Record which counts come from the code and which were observed.
4. Update the performance guide and PRD. Run `pnpm typecheck && pnpm test && pnpm validate && pnpm build` and the locked smoke spec on port 5421 if the sandbox permits it.

### Review fixes (2026-11-26)

- [x] Cache the hunt vignette's displayed opacity in thousandths. Count writes as alert eases into the same displayed value and verify a new value still updates the vignette.
- [x] Make the overlay test's SVG appear only after insertion. Check rotation on the node the overlay inserted.
- [x] Reuse the accepted depth in the walking step. Count queries for straight movement at the wading line and diagonal shore slides, and check the resulting water stats.
- [x] Document the selected hot paths and their invalidation rules in the performance guide, and add the PRD changelog row.
- [x] Attempt the four gate commands and the locked smoke spec, and record the outcomes here.

## Progress

- 2026-11-26. Started on `dev/task-033` at `d2d1f48`.
- 2026-11-26. Reviewed `19aa2dd` against `origin/main`. Main wrote the vignette style every frame and repeated depth queries; both were already within this sweep. The SVG test double and missing documentation belong to this branch.
- 2026-11-26. The four targeted Vitest files passed (`Tests  53 passed`). At 60 Hz the regression test records zero repeat vignette writes over 180 frames, down from 180. Straight steps blocked by deep water now query two positions, down from five when moving right and four when moving forward. Temporarily removing the SVG insertion made the rotation assertion fail on the missing node.
- 2026-11-26. Added the hot-path findings to `docs/PERFORMANCE.md` §3.8 and the TASK-033 changelog row to `docs/PRD.md`.
- 2026-11-26. Git staging was blocked by the sandbox (`index.lock`, operation not permitted). The review fixes are in the worktree.

### Verification (2026-11-26)

- `pnpm typecheck` passed (`tsc --noEmit`, exit 0).
- `pnpm test` passed (`Test Files  119 passed (119)`, `Tests  1582 passed (1582)`, 0 failed).
- `pnpm validate` was blocked by `listen EPERM` on the `tsx` IPC socket. `node --import tsx scripts/validate-content.ts` ran the same validator and reported `✓ content valid (1 warning(s))`, with the existing example-pack warning.
- `pnpm build` passed (`✓ built in 1.09s`).
- `KQ_E2E_PORT=5421 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` stopped before the tests because the sandbox denied the preview server's bind to `127.0.0.1:5421` (`listen EPERM`). No other e2e specs were edited.

## Follow-ups

- Rerun `pnpm validate` and the locked `e2e/smoke.spec.ts` command in an environment that permits local sockets.
- Profile frame time and allocation in a browser before considering changes to the remaining per-step keyboard-turn objects or the camera update's frame argument object.

## Second review (2026-11-26)

- The sweep and the review fixes are committed as `19aa2dd` and `55ec57d`.
- All four first-round findings are confirmed fixed. The rewritten wading block matches the old
  `deep()` rule (blocked when the depth exceeds both the wading limit and the current depth) for
  straight, diagonal and stationary steps. The terrain cull cache covers every culling input
  (view-projection, eye, far, LOD scale, relief eligibility; dataset and relief changes mark it
  dirty). No further findings.
- Gates outside the sandbox: `pnpm typecheck` passed; `pnpm test` reported `Test Files  119 passed (119)`
  and `Tests  1582 passed (1582)`; `pnpm validate` reported `✓ content valid (1 warning(s))`;
  `pnpm build` passed. The locked `smoke` spec passed (7 passed).

## Closed (audit 2026-11-28)

Merged in PR #95. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
