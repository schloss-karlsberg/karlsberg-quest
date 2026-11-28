---
id: TASK-026
aliases:
- TASK-026
title: Keep Wegweiser routes clear of walls
slug: keep-wegweiser-routes-clear-of-walls
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- travel
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Keep Wegweiser routes clear of walls

## Goal

Only return route legs the Wegweiser can draw toward a reachable destination or approach point.
Travel uses the returned waypoints directly.

## Acceptance criteria

- [x] An enclosed start returns an incomplete route with no drawable leg through the obstacle.
- [x] A blocked endpoint half a metre away cannot use the straight-line shortcut. A reachable approach point is valid.
- [x] An incomplete search ends at the reachable point. A free straight line still returns two points with zero expansions.
- [x] Regression tests cover both reported failures alongside the wall, doorway and palace footprints.
- [x] A thin wall missed by an edge midpoint triggers a detour when one is reachable.
- [x] A free off-grid goal is reached through another clear connector when the first approach fails.
- [x] A player beside a wall can leave with player clearance; later legs keep the routing margin.
- [x] All four gates pass, with zero unit test failures.

## Plan

_Status: implementation requested 2026-11-26_

**Approach** — Reproduce both results on the audited revision. Check exact endpoints and their
connections to the search grid. Retain the reachable path when the search cannot finish and
return the start alone when there is no drawable progress.

**Files to touch**

- `src/world/route.ts` for straight, partial and blocked routes.
- `tests/travel.test.ts` for regression coverage.
- `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md` and `docs/PRD.md` for behavior and changelogs.

**Steps**

- [x] Reproduce the audit failures on the baseline and in unit tests.
- [x] Fix the pure route solver and verify travel cases.
- [x] Document the behavior and attempt all four gates.
- [x] Attempt the smoke spec under the machine-wide lock on port 5414.

**Test plan** — Run `pnpm exec vitest run tests/travel.test.ts`, then `pnpm typecheck`,
`pnpm test`, `pnpm validate` and `pnpm build`. Run the smoke spec with
`KQ_E2E_PORT=5414 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.

**Risks** — The solver must preserve its unobstructed fast path and continue to route around
palace walls and through doorways.

### Review fix round (2026-11-26)

- [x] Reproduce both detours and the wall-adjacent start in travel regression tests.
- [x] Check full grid edges during A* and reuse the checked path during simplification.
- [x] Consider multiple clear final connectors for a free off-grid goal and use the player's
  collider radius at the start and on the first search edge.
- [x] Update the travel docs and PRD changelog, rerun all four gates, and attempt locked smoke.

## Progress

- Branch `dev/task-026`, baseline `d2d1f48`.
- 2026-11-26 — Node reproduced both audit failures. The focused baseline tests also exposed an
  unchecked connector to a free off-grid goal and a blocked-goal approach marked as complete.
- 2026-11-26 — The solver checks the exact endpoints, anchors the grid to the start and keeps the
  usable prefix of the route. `pnpm exec vitest run tests/travel.test.ts` passed all 39 tests.
- 2026-11-26 — Updated the architecture and both changelogs. `pnpm typecheck`, `pnpm test` and
  `pnpm build` passed. Vitest reported `Test Files  118 passed (118)` and `Tests  1579 passed (1579)`.
  `pnpm validate` was blocked by `listen EPERM` on the `tsx` IPC socket.
- 2026-11-26 — The locked smoke command reached preview startup. The sandbox denied the listener
  on `127.0.0.1:5414` with `EPERM`, so the spec did not launch.
- 2026-11-26 — Review findings 1–3 fixed. All three new regressions failed before the fix;
  focused Vitest now reports `Tests  42 passed (42)`. The detour cases also check each returned
  leg; the wall-adjacent case checks that the wider margin still blocks a later leg.
- 2026-11-26 — Review round: `pnpm typecheck`, `pnpm test` and `pnpm build` passed. Vitest
  reported `Test Files  118 passed (118)` and `Tests  1582 passed (1582)` (0 failed).
  `pnpm validate` was blocked at the `tsx` IPC listener (`listen EPERM`). The locked smoke spec
  was blocked at preview startup (`listen EPERM` on `127.0.0.1:5414`); no e2e specs changed.
- 2026-11-26 — `mc validate` and `git diff --check` passed. The sandbox denied Git's worktree
  `index.lock` at staging, so the review changes remain unstaged and uncommitted in this worktree.
- 2026-11-27 — PR review: the start probe hid the trail for a player pushed against a wall
  (rounding reads one radius off as an overlap) and for a player wading in the shallows.
  `wayStartBlocked` (`points.ts`) now probes walls at the walking radius less 5 cm and water past
  the wading limit; both new tests fail without it. Gates: `Tests  1594 passed (1594)`, validate
  and build pass. Locked e2e: smoke 7, travel-paths 1, chapter-k1 2, world 4 passed.

## Follow-ups

- Route cost: the 0.3 m edge sampling raises probe calls about 1.2–1.8× on long routes (same
  expansions). Consider cheaper edge checks if replans hitch.

## Closed (audit 2026-11-28)

Merged in PR #67. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
