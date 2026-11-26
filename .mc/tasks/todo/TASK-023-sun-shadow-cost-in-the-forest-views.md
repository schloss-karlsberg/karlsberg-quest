---
id: TASK-023
aliases:
- TASK-023
title: Sun shadow cost in the forest views
slug: sun-shadow-cost-in-the-forest-views
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

# Sun shadow cost in the forest views

Reduce Hoch shadow cost by at least 3 ms in forest view B (1632 / −1640).
Keep the near-field look, tier ordering and existing phone performance and grounding.

## Acceptance criteria

- [ ] Real-GPU comparison shows a reduction of at least 3 ms on Hoch in view B.
- [ ] Paired screenshots and motion checks confirm the near-field look and character grounding.
- [x] Hoch retains the widest near filter, Mittel uses fewer taps and Niedrig skips the sun pass.
- [x] Unit tests cover shadow fit, caster limits and quality settings.
- [ ] All four gates pass as written.
- [x] A repeatable GPU comparison, performance notes and a PRD changelog entry are available.

## Plan

**Approach.** Add a baseline-compatible GPU spec first. Use WebGL depth comparison filtering
to reduce receiver texture work, with the full Hoch kernel close to the camera and fewer taps
farther out. Fit a shorter texel-snapped volume around the camera so the forest submits fewer
casters. Keep character casters and the existing map update cadence.

**Files to touch.** Shadow rendering, the shared atmosphere shader and tier configuration;
forest caster integration; graphics unit tests; debug bench and GPU spec; performance and
changelog docs.

**Steps.**
- [x] Add fixed forest views B/C and a paired GPU benchmark spec.
- [x] Implement and test the shadow filtering, fit and caster limits.
- [x] Document the tradeoffs and verification procedure.
- [x] Attempt all four gates and the locked smoke spec. Record sandbox blockers.

**Test plan.** Run focused render and forest unit tests, then the four gates. Run the smoke
spec on port 5410. Capture Hoch forest A/B/C and Niedrig touch views, and compare uncapped
bench timing at the same poses on a machine with a real GPU.

**Risks.** Check the shadow transition while turning and walking, especially at low sun angles.

### Review fix round (2026-11-26)

Preserve nearby shadows at low sun angles and make the paired comparison test the player view,
shadow quality and normal phone pacing. The task still requires a measured 3 ms improvement in
view B and a review of nearby shadows and character grounding in motion.

- [x] Use projected tree shadow footprints for CPU and shader culling and cover the low-sun case.
- [x] Keep the player camera active in fixed benchmark views and define matched manual-tick captures.
- [x] Sample natural phone frame intervals and assert receiver pixels during tier switches.
- [x] Attempt the four gates and both locked browser specs.
- [ ] Compare both revisions on a real GPU with the corrected harness, record the paired medians,
  and review the near-field motion and phone grounding.

## Progress

- Branch: `dev/task-023`.
- 2026-11-26. The baseline GPU spec and scene selection pass typecheck. Playwright discovers both GPU tests.
- 2026-11-26. The comparison sampler, fitted tiers and caster selection pass the focused unit tests.
- 2026-11-26. Typecheck and build passed. Vitest reported `Tests  1579 passed (1579)`, 0 failed.
  The sandbox blocked the `pnpm validate` launcher's IPC socket with `EPERM`.
  The validator completed via `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. The smoke run stopped before browser startup because the preview server could not
  bind to 127.0.0.1:5410 (`EPERM`). Real-GPU execution is outside the sandbox.
- 2026-11-26. Baseline commit `1a70652` and the original implementation commit `58800b4`
  are both on the branch.
- 2026-11-26. Review findings 2–6 have fixes and focused regression tests. The smoke test has
  a 26 m occluder at the tour's sun angle and compares receiver pixels on all three tiers.
- 2026-11-26. The corrected benchmark records per-scene GPU queries and enforces the 3 ms
  view B threshold against the baseline artifact. The port error prevented measuring either
  revision or capturing stills and motion, so finding 1 remains open.
- 2026-11-26. Typecheck and production build passed. Vitest reported `Tests  1588 passed (1588)`,
  0 failed. The `pnpm validate` launcher hit `EPERM` on its IPC socket. The same validator
  passed via `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. Playwright discovered both forest GPU tests and all eight smoke tests. Both
  locked runs stopped before browser startup with `listen EPERM` on 127.0.0.1:5410.
- 2026-11-26. The caster and receiver fixes are committed as `aed1526`. Git denied the
  worktree's `index.lock` when staging the benchmark and verification updates.

## Follow-ups

- Commit the remaining changes as `test(render): enforce the paired forest shadow target`
  with the Codex co-author trailer.
- Run `pnpm validate` and `e2e/smoke.spec.ts` on a host that allows the required sockets.
- Run `e2e/gpu/forest-shadows.gpu.ts` using the before/after commands in PERFORMANCE §3.1b.
  Record the three forest medians, shadows-on frame p95 and peak triangles, and verify the
  3 ms Hoch reduction at view B.
- Review nearby trunks and player/NPC grounding while walking and turning. Check Niedrig on a
  phone and record any timing or visual difference.
- The pre-existing forest view cone also limits which trees reach the caster lists. Assess
  out-of-view casters independently if turning still drops ground shadows. Expanding that
  selection needs a separate draw-budget and motion check.
