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

- [x] Check prerequisite flags and conditions against reachable earlier producers and known runtime sources.
- [x] Check each beat from its chapter start and each required quest for a reachable offer and completion.
- [x] Check objective items for existence and acquisition, and objective events for emitters and timing.
- [x] Detect conflicting text under a shared say id, including pack dialogue.
- [x] Exercise each rule on small Vitest fixtures and keep the extra validation time below two seconds.
- [x] Document the checks in both authoring guides and the PRD, and record findings and gate results.

## Plan

- [x] Trace beat transitions, action ordering, quest activation, event consumption and pack rewards in the runtime.
- [x] Add the cross-file checks to the existing validation entry point, with regression fixtures and diagnostics.
- [x] Run the checks on the shipped chapters, investigate findings and record unresolved cases.
- [x] Update the authoring guides and changelog. Run the four gates and the locked smoke spec if available.

## Progress

- Branch `dev/task-052`. Traced the story engine, NPC topics, Chronik discoveries, quest book,
  item pickup events and turn-in rewards.
- Added an ordered progression pass, emitter and dialogue checks, and fixtures for broken and
  working paths. The CLI uses Node's tsx import hook because the tsx launcher opens an IPC socket.

- Corrected the chapter 3 basket cue. The quest caps `schatten` at four and opens the basket
  objective at that count. The old cue waited for five. Verified that the threshold was the
  only changed value in the story JSON.
- Updated both authoring guides, the PRD changelog and the action-RPG risk log.
- Four gates passed. TypeScript exited 0. Vitest reported `Test Files  119 passed (119)` and
  `Tests  1604 passed (1604)`, with zero failures. Validation reported
  `Progression: 0 error(s), 11 warning(s)` and `✓ content valid (20 warning(s))` across all
  checks. The production build reported `✓ built in 933ms`.
- Five measurements of the added work, including quest loading and the source-emitter scan,
  took 78, 66, 56, 56 and 88 ms on the shipped catalog. The progression suite has 21 tests.
- The locked smoke run stopped before browser launch. The sandbox denied the preview server
  permission to listen on `127.0.0.1:5439`.

## Findings and follow-ups

- Check the intended fallback in `k2_6`. A fresh run first writes `k2.abfahrt` on exit from
  `k2_8`. The quest and clue alternatives can complete the beat.
- Decide whether `debug.k2` in `k2_12` is still needed. There is no runtime or content writer.
  Completing the parforce quest satisfies the normal path.
- Check whether the `chosen: k3.objekt` fallback in `k3_3` serves replayed saves. A fresh run
  can enter the Festsaal and choose the object in `k3_4`.
- Eight test-catalog warnings come from the worked example. Only the door-handle option
  advances `test/t3`. The manual stop at `t6` leaves `r1–r4` and `q1–q2` for debug
  entry. The side quest `q.test.irrlichter` depends on the quest in that separate sequence.
- No voiced lines need new text. Source and clip ids are unchanged.
- Run the smoke spec on a host that permits the preview server to bind its port.

```sh
KQ_E2E_PORT=5439 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

## Local commits

The plan commit is `be58d3e`. Git then denied creation of the worktree's `index.lock`.
The following commands capture the remaining changes in reviewable commits.

```sh
git add src/systems/quests/index.ts src/systems/quests/logic.ts
git commit -m 'refactor(content): share quest objective event subscriptions' -m 'Refs: TASK-052' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add package.json scripts/validate-content.ts scripts/content-validation src/content/validate.ts src/systems/photo/validate-cli.ts tests/content-progression.test.ts
git commit -m 'feat(content): check story and quest progression across files' -m 'Refs: TASK-052' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add content/story/03-kapitel-3.story.json
git commit -m 'fix(story): trigger the basket cue at four required kills' -m 'Refs: TASK-052' -m 'Co-Authored-By: Codex <noreply@openai.com>'

git add content/story/README.md content/quests/README.md docs/PRD.md docs/ACTION-RPG.md .mc/tasks/todo/TASK-052-static-soft-lock-checks.md
git commit -m 'docs(content): document progression checks and findings' -m 'Refs: TASK-052' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
