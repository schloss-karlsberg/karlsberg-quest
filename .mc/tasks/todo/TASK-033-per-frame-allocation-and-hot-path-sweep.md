---
id: TASK-033
aliases:
- TASK-033
title: Per-frame allocation and hot-path sweep
slug: per-frame-allocation-and-hot-path-sweep
status: in-progress
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
updated: 2026-11-26
---

# Per-frame allocation and hot-path sweep

## Goal

Reduce repeated heap allocation and work in the simulation, renderer and UI while preserving gameplay, visuals and accessibility.

## Acceptance criteria

- [ ] Trace fixed updates and frame callbacks across `src/` and prioritise clear wins by frequency and cost.
- [ ] Remove redundant work on the selected paths, including unchanged HUD work where practical.
- [ ] Add focused Vitest coverage for unchanged state and transitions.
- [ ] Document hot-path rules and the top findings in `docs/PERFORMANCE.md` and add a PRD changelog row.
- [ ] Run the four gates and record the smoke result or sandbox limitation.

## Plan

1. Follow the loop into systems, renderer and HUD. Identify the owning lifetime of temporary values and all inputs to any proposed cache.
2. Optimise the most frequent avoidable work in independent areas. Keep any edits in shared areas small and record larger opportunities for their owners.
3. Exercise the normal entry points with operation counters or state transition tests. Record which counts come from the code and which were observed.
4. Update the performance guide and PRD. Run `pnpm typecheck && pnpm test && pnpm validate && pnpm build` and the locked smoke spec on port 5421 if the sandbox permits it.

## Progress

- 2026-11-26. Started on `dev/task-033` at `d2d1f48`.
