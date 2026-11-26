---
id: TASK-061
aliases:
- TASK-061
title: 'Test coverage and bug sweep: rendering, quality and FX'
slug: render-quality-resize-context-fx
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- render
- fx
- tests
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Rendering and FX lifecycle coverage

## Goal

Pin down what happens to the rendered frame and active effects when the tier, viewport, pixel
density or WebGL context changes. Fix defects demonstrated by the new tests.

## Acceptance criteria

- [ ] Inventory every module in `src/render/` and `src/systems/fx/` against existing unit coverage.
- [ ] Add at least 25 deterministic assertions across the area. Run the focused suite in about three seconds or less.
- [ ] Reproduce each defect before fixing it, commit each fix separately and record design questions as test todos.
- [ ] Update the relevant docs and the PRD changelog.
- [ ] Run typecheck, unit tests, content validation and the production build.
- [ ] Run the locked smoke spec on port 5448 if allowed, or record the command and blocker.

## Plan

- [ ] Trace renderer, tier, resize, context and effect lifecycle entry points and compare module paths and symbols with the unit suite.
- [ ] Exercise the runtime objects using in-memory settings, explicit frame times, bounded pools and GPU-free render calls.
- [ ] Reproduce failures on the original implementation, apply minimal corrections and rerun each regression.
- [ ] Document results, run all gates, check smoke availability and record follow-ups.

## Progress

Started on `dev/task-061` at `79c5718`, matching local `origin/main`.
