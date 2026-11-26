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
- [ ] Hoch retains the best filtering, Mittel is cheaper and Niedrig keeps its existing cost.
- [ ] Unit tests cover shadow fit, caster limits and quality settings. All four gates pass.
- [ ] A repeatable GPU comparison, performance notes and a PRD changelog entry are available.

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
- [ ] Implement and test the shadow filtering, fit and caster limits.
- [ ] Document the tradeoffs and verification procedure, then run the gates and smoke spec.

**Test plan.** Run focused render and forest unit tests, then the four gates. Run the smoke
spec on port 5410. Capture Hoch forest A/B/C and Niedrig touch views, and compare uncapped
bench timing at the same poses on a machine with a real GPU.

**Risks.** Check the shadow transition while turning and walking, especially at low sun angles.

## Progress

- Branch: `dev/task-023`.
- 2026-11-26. The baseline GPU spec and scene selection pass typecheck. Playwright discovers both GPU tests.
