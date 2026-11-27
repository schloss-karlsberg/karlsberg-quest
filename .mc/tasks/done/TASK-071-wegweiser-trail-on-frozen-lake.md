---
id: TASK-071
aliases:
- TASK-071
title: 'Wegweiser trail on the frozen lake (February 1793)'
slug: wegweiser-trail-on-frozen-lake
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- travel
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Wegweiser trail on the frozen lake (February 1793)

## Goal

On the frozen lake (February 1793) the Wegweiser trail is hidden because the route treats ice
as water. The bug was already on main before TASK-026; the TASK-026 review (PR #67) found it.
A player standing on or crossing the walkable ice loses the trail and the „Weg“ marker.

## Acceptance criteria

- [x] While the lake is frozen, the route search and the start-spot check treat walkable ice as
      ground, using the same rule as player movement on the ice.
- [x] Open water and every other era are unchanged; the trail still never crosses walls.
- [x] A unit test reproduces the hidden trail on the ice first and then pins the fix (see
      `tests/travel.test.ts`).
- [x] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
      travel-paths and smoke e2e specs.

## Plan

**Approach:** Have the blocked/water predicate the travel system passes to `src/world/route.ts`
and `wayStartBlocked` (`src/systems/travel/points.ts`) ask whether the ice currently carries the
player, instead of only reading the water depth.

**Files to touch:** `src/systems/travel/index.ts`, `src/systems/travel/points.ts`, a unit test,
the PRD changelog.

**Risks:** The ice state must follow era changes and loads, so the trail does not lead across
open water after a thaw.

## Resolution

The travel system's route search and „Weg“ line check asked `surfaceAt(x, z) === 'water'`, which
stays true on the ice, while player movement uses `Water.depthInside`, where frozen water counts as
land. Both now use `isOpenWater(surface, frozen)` (`src/systems/travel/points.ts`) with the new
`Water.isFrozen`, read on every call, so a thaw (era change or load) restores the water at once.
The start-spot check already used `depthInside` and needed no change. Tests:
`tests/travel.test.ts` › "Wegweiser on the frozen lake (TASK-071)".
