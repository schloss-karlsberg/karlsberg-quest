---
id: TASK-052
aliases:
- TASK-052
title: Static soft-lock checks in the content validator
slug: static-soft-lock-checks
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- content
- validation
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Static soft-lock checks in the content validator

## Goal

Catch broken story and quest progression while authors are editing content. Report the file
and affected id, with warnings for cases that need a playthrough or an editorial decision.

## Acceptance criteria

- [ ] Check prerequisite flags and conditions against reachable earlier producers and known runtime sources.
- [ ] Check each beat from its chapter start and each required quest for a reachable offer and completion.
- [ ] Check objective items for existence and acquisition, and objective events for emitters and timing.
- [ ] Detect conflicting text under a shared say id, including pack dialogue.
- [ ] Exercise each rule on small Vitest fixtures and keep the extra validation time below two seconds.
- [ ] Document the checks in both authoring guides and the PRD, and record findings and gate results.

## Plan

1. Trace beat transitions, action ordering, quest activation, event consumption and pack rewards in the runtime.
2. Add the cross-file checks to the existing validation entry point, with regression fixtures and diagnostics.
3. Run the checks on the shipped chapters, investigate findings and record unresolved cases.
4. Update the authoring guides and changelog. Run the four gates and the locked smoke spec if available.
