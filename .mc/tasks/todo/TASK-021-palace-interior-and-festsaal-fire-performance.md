---
id: TASK-021
aliases:
- TASK-021
title: Palace interior and Festsaal fire performance
slug: palace-interior-and-festsaal-fire-performance
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- render
- performance
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Palace interior and Festsaal fire performance

## Goal

Reach frame p95 at or below 16.7 ms in the burning Festsaal and 1789 palace views on the
same real GPU and preset used in PERFORMANCE §3.1a. Preserve the look of the fire and
palace while reducing rendering work across tiers.

## Acceptance criteria

- [x] Trace fire particles, lighting, interior materials, transparency, shadows and CPU work.
- [ ] Reduce rendering work across all three tiers and cover the changed logic with unit tests.
- [ ] Confirm the 16.7 ms target, comparable visuals and no phone regression on hardware.
- [ ] Run the four gates with zero failed unit tests. Run the touched e2e specs and smoke
  under the machine lock if the browser can start.
- [ ] Document the expected effects, remaining costs and exact paired benchmark procedure.
  Add a PRD changelog row.

## Plan

**Approach:** Read the existing benchmark and follow both fire render paths through the
interior shader, particle batches and pass scheduling. Target redundant shading and particle
work while retaining the near-fire layers, palette, room geometry and accessibility settings.

**Files to touch:** `src/systems/interiors/` and `src/systems/fx/fire/` for the render path,
`tests/` for regressions, and the benchmark tooling and docs for the hardware comparison.

**Steps:**

- [x] 1. Identify the costly draw and frame paths.
- [ ] 2. Implement scoped optimisations with unit coverage.
- [ ] 3. Document how to reproduce the baseline and compare the changed build.
- [ ] 4. Run the requested checks and record the follow-ups.

**Test plan:** Run focused Vitest tests, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
Run smoke and any edited e2e spec under the shared lock. Compare the burning hall, exterior fire,
and 1789 palace views on hardware on Hoch, then recheck Mittel and Niedrig with a phone control.

**Risks:** A change in transparency ordering or in the lighting at room boundaries may be visible.
Only hardware timing and matched views can confirm the frame-time and visual criteria.

## Progress

- Branch `dev/task-021`.
- 2026-11-26: Traced both fire layers and the palace draw passes. The sun pass shades the shell
  and room geometry, room clips run on palace fragments, and each ember stream evaluates nine
  sparks over a full quad. Inside, fire-light selection also allocates and sorts each frame.
