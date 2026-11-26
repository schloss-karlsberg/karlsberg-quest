---
id: TASK-031
aliases:
- TASK-031
title: Test coverage and bug sweep for saves, migration, settings and input
slug: save-settings-input-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- saves
- input
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Save, settings and input coverage

## Goal

Pin down the behavior players rely on across save slots, state migrations, settings and controls. Fix reproducible defects in this area with a failing test first.

## Acceptance criteria

- [ ] Map important behavior and existing coverage for each module.
- [ ] Add at least 25 meaningful, deterministic assertions across the area. Run the new tests together in about three seconds or less.
- [ ] Commit each verified bug fix separately. Record any unresolved design decision as a test TODO.
- [ ] Keep changes focused and respect the concurrent tasks.
- [ ] Update the relevant docs and PRD changelog. Run the four gates and the locked smoke spec if the sandbox permits it.

## Plan

1. Compare the save and input contracts and their callers with named unit tests. Record existing coverage and gaps below.
2. Exercise save/load and migration boundaries, live settings edits, control transitions and labels using deterministic fixtures.
3. Reproduce any discrepancy against the unmodified implementation, check the contract, then make the smallest fix and rerun the test.
4. Record test results, documentation changes and any follow-ups. Run the four gates and Playwright smoke on port 5419.

## Progress

- Started on `dev/task-031` at `d2d1f48a`, matching `origin/main`.
