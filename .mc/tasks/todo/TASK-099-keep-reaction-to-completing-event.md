---
id: TASK-099
aliases:
- TASK-099
title: Keep dialogue triggered by a completing story event
slug: keep-reaction-to-completing-event
status: review
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- story
- bug
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Keep dialogue triggered by a completing story event

## Goal

The campaign test sometimes misses `laub.k4.nur_steine`. Discovering the clue queues Laub's
line in `k4_14` and advances the story to `k4_15`. With other dialogue still playing, the
line can spend the entire three-second retirement grace waiting.

## Acceptance criteria

- [x] The pack reaction to the event that completes a beat keeps its queue position through
      beat retirement. The queue still expires ordinary waiting dialogue as before.
- [x] Runtime tests reproduce the loss behind a long line and verify ordinary retirement.
- [x] All four local gates pass.
- [ ] The hosted chapter 4 and campaign runs verify the dialogue in the browser.

## Plan

- [x] Trace beat completion and audit matching dialogue triggers in the packs.
- [x] Reproduce the race in the story runtime test.
- [x] Protect the completing event's waiting dialogue group at the transition.
- [x] Document the retirement rule and run the focused story tests.
- [x] Run the four local gates.

## Progress

- Branch `fix/story-keep-completing-reaction`.
- 2026-11-28. The runtime test reproduced the missing line before the fix. Both retirement
  tests now pass. Hosted browser verification remains pending.
- 2026-11-28. All four gates passed. Vitest reported 2,735 passed, 0 failed and 17 todo.
  Content validation reported 0 errors and 29 warnings.
