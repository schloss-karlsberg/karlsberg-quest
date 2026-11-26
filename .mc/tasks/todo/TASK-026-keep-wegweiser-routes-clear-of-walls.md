---
id: TASK-026
aliases:
- TASK-026
title: Keep Wegweiser routes clear of walls
slug: keep-wegweiser-routes-clear-of-walls
status: in-progress
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
updated: 2026-11-26
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

## Follow-ups

- Run `pnpm validate` and the smoke command in the test plan where local listeners are permitted.
- A grid leg can fail final collision sampling even when its midpoint is free. The trail stops at
  the last checked waypoint in that case. Finding a detour around that leg would require checking
  more points during search.
