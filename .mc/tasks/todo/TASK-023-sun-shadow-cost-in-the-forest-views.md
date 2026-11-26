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

## Progress

- Branch: `dev/task-023`.
- 2026-11-26. The baseline GPU spec and scene selection pass typecheck. Playwright discovers both GPU tests.
- 2026-11-26. The comparison sampler, fitted tiers and caster selection pass the focused unit tests.
- 2026-11-26. Typecheck and build passed. Vitest reported `Tests  1579 passed (1579)`, 0 failed.
  The sandbox blocked the `pnpm validate` launcher's IPC socket with `EPERM`.
  The validator completed via `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. The smoke run stopped before browser startup because the preview server could not
  bind to 127.0.0.1:5410 (`EPERM`). Real-GPU execution is outside the sandbox.
- 2026-11-26. Baseline commit `1a70652` is available. Git denied access to the worktree's
  `index.lock` when staging the implementation, which remains in the worktree.

## Follow-ups

- Commit the implementation as `perf(render): reduce forest sun shadow cost` with the Codex
  co-author trailer.
- Run `pnpm validate` and `e2e/smoke.spec.ts` on a host that allows the required sockets.
- Run `e2e/gpu/forest-shadows.gpu.ts` using the before/after commands in PERFORMANCE §3.1b.
  Record the three forest timings and check the 3 ms Hoch target at view B.
- Review nearby trunks and player/NPC grounding while walking and turning. Check Niedrig on a
  phone and record any timing or visual difference.
