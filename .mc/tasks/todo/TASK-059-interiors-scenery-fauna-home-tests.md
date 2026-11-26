---
id: TASK-059
aliases:
- TASK-059
title: 'Test coverage and bug sweep for interiors, scenery, fauna and home'
slug: interiors-scenery-fauna-home-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- interiors
- scenery
- fauna
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Interiors, scenery, fauna and home

## Goal

Pin down what happens to rooms, doors, scenery, animal bodies and the Bauwagen discovery as the player moves, shifts era or resumes a save. Fix reproducible defects in these systems.

## Acceptance criteria

- [ ] Map player behaviours to existing unit coverage, including untested boundaries.
- [ ] Add at least 25 meaningful deterministic assertions across the area. Run the focused set in about three seconds or less.
- [ ] Reproduce each defect before fixing it, commit fixes individually and record unresolved design questions as Vitest todos.
- [ ] Update the affected docs and PRD log, run the four gates and attempt the permitted smoke spec on port 5446.

## Plan

_Status: user-directed, 2026-11-26_

**Approach.** Trace the registered systems, state hooks and tests against the architecture and PRD. Exercise normal entry points with explicit simulation steps and real state where possible.

**Files to touch.** Tests under `tests/`, confirmed defects in the named modules, this task record, and the relevant sections of the architecture, action-RPG and PRD documents.

**Steps**

- [ ] Audit modules and existing unit tests.
- [ ] Add coverage for missing lifecycle, visibility, reward and persistence rules.
- [ ] Run regression tests against the original behaviour, fix each confirmed defect and rerun.
- [ ] Record gate results, the smoke result and follow-ups.

**Test plan.** Run the focused Vitest files, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run only the smoke spec through the machine lock if the sandbox permits it.

**Risks.** Keep tests headless and avoid changes to adjacent gameplay systems being worked on separately.

## Progress

- Working branch `dev/task-059`, starting at `79c5718` (origin/main).
