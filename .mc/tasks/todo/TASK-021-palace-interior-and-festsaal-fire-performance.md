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
- [x] Reduce rendering work across all three tiers and cover the changed logic with unit tests.
- [ ] Confirm the 16.7 ms target, comparable visuals and no phone regression on hardware.
- [ ] Run the four gates with zero failed unit tests. Run the touched e2e specs and smoke
  under the machine lock if the browser can start.
- [x] Document the expected effects, remaining costs and exact paired benchmark procedure.
  Add a PRD changelog row.
- [x] Verify the exterior poses clear the Festsaal, pair fixed and advancing fire samples,
  capture matched fire frames, and cover the benchmark and allocation fixes with unit tests.

## Plan

**Approach:** Read the existing benchmark and follow both fire render paths through the
interior shader, particle batches and pass scheduling. Target redundant shading and particle
work while retaining the near-fire layers, palette, room geometry and accessibility settings.

**Files to touch:** `src/systems/interiors/` and `src/systems/fx/fire/` for the render path,
`tests/` for regressions, and the benchmark tooling and docs for the hardware comparison.

**Steps:**

- [x] 1. Identify the costly draw and frame paths.
- [x] 2. Implement scoped optimisations with unit coverage.
- [x] 3. Document how to reproduce the baseline and compare the changed build.
- [x] 4. Run the requested checks and record the follow-ups.

**Test plan:** Run focused Vitest tests, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
Run smoke and any edited e2e spec under the shared lock. Compare the burning hall, exterior fire,
and 1789 palace views on hardware on Hoch, then recheck Mittel and Niedrig with a phone control.

**Risks:** A change in transparency ordering or in the lighting at room boundaries may be visible.
Only hardware timing and matched views can confirm the frame-time and visual criteria.

### Review fixes

- [x] Step the exterior teleports and check room tracking before warm-up.
- [x] Add paired advancing fire samples and deterministic, held visual captures. Check
  the 16.7 ms target explicitly on the reference profile.
- [x] Keep four fire-light slots allocated and fill ember buffers by component. Add
  Vitest regression assertions for the benchmark and allocation fixes.
- [x] Run the available gates and check whether the locked Playwright specs can start.
- [ ] Record paired reference measurements, matched visuals and the physical-phone result.

## Progress

- Branch `dev/task-021`.
- 2026-11-26: Traced both fire layers and the palace draw passes. The sun pass shades the shell
  and room geometry, room clips run on palace fragments, and each ember stream evaluates nine
  sparks over a full quad. Inside, fire-light selection also allocates and sorts each frame.
- 2026-11-26: Added depth-only shader exits, bounds for shell cuts, reusable fire-light slots,
  direct room-state lookup, separate fire and smoke submissions, fitted ember quads and cached
  facade fire-map bytes. Focused Vitest run passed 17 tests.
- 2026-11-26: Recorded the paired GPU procedure in PERFORMANCE §3.8, with `a1082bb` as the
  benchmark-only baseline. Added PRD and ACTION-RPG log rows.
- 2026-11-26: `pnpm typecheck`, `pnpm test` and `pnpm build` passed. Vitest reported
  `Test Files  119 passed (119)` and `Tests  1577 passed (1577)`. `pnpm validate` hit
  `listen EPERM` on the TSX IPC socket. The same script passed via
  `node --import tsx scripts/validate-content.ts` with the example-pack warning.
- 2026-11-26: The locked smoke and interiors specs could not start the preview server
  (`listen EPERM` at ports 5362 and 5363). Playwright discovered all three GPU profiles.
- 2026-11-26: The benchmark-only commit succeeded. Git later reported `Operation not
  permitted` for the worktree's `index.lock`; the rendering, test and documentation changes
  remain in the worktree.
- 2026-11-26: The original rendering and documentation commits are now on `dev/task-021`.
  The review fixes step and check the two exterior poses, measure both fire clocks, enforce
  the Hoch frame target, hold captures at eight visual seconds, and remove the remaining
  fire-light and ember writes that allocate. The focused Vitest run passed 49 tests.
- 2026-11-26: `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  120 passed (120)` and `Tests  1587 passed (1587)`, with zero failures.
  `mc validate` passed. `pnpm validate` was blocked by `listen EPERM` on the TSX IPC socket.
- 2026-11-26: Playwright discovered all three corrected GPU profiles. The locked GPU and
  smoke runs were blocked at preview startup by `listen EPERM` on localhost ports 5368 and
  5367. The interiors spec was skipped after confirming the same preview dependency.
- 2026-11-26: The benchmark and allocation fixes are committed. The final documentation and
  task update remain in the worktree after Git was denied access to `index.lock`.

## Follow-ups

- Run `e2e/smoke.spec.ts` and `e2e/interiors.spec.ts` under the machine lock where preview
  can bind. Rerun `pnpm validate` where TSX can open its IPC socket.
- Review finding 3 remains open. Run `e2e/gpu/palace-fire.gpu.ts` on the reference GPU as
  documented in PERFORMANCE §3.8. Record paired p95 values, compare the held stills on Hoch
  and Mittel, and verify Niedrig on a physical phone. If p95 still exceeds 16.7 ms, isolate
  the smoke and fullscreen passes and the remaining sun-shadow cost before changing effect quality.
