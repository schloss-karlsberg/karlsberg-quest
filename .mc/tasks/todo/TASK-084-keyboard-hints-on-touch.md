---
id: TASK-084
aliases:
- TASK-084
title: 'Touch players are told to hold the „Umschalttaste“'
slug: keyboard-hints-on-touch
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- mobile
- touch
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Touch players are told to hold the „Umschalttaste“

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, phone landscape 844×390 with touch,
real GPU). A few seconds into the tour, after pushing the touch stick fully, the tip toast reads
„Laufschritt: Halte die Umschalttaste, um außerhalb von Kämpfen schneller zu laufen.“ A phone
has no Shift key. The toast also covers the „Vögel zwitschern.“ caption (see TASK-085).

Screenshot:
`/private/tmp/claude-501/-Users-sebastian-develop-experiements-karlsberg-quest/39f9dec0-f81c-46df-91c2-f012b96a53a5/scratchpad/playtest/shots/p06-after-walk.png`

Other keyboard-only lines found with grep (not seen on the phone in this session):

- `src/systems/travel/strings.ts` `sprint` (the toast above, shown from `src/systems/travel/index.ts`).
- `src/systems/court/strings.ts` `court.hint.how.running`: „Umschalttaste loslassen …“.
- `content/story/03-kapitel-3.story.json`: „Halte die Umschalttaste zum Rennen.“ (fire escape).

## Acceptance criteria

- [ ] In touch mode these hints name the touch gesture (for example „Stick ganz nach vorn
      schieben“) or use the action label helper (`src/ui/actionLabel.ts`), as other prompts do
      („Wischen: Schauen“).
- [ ] Desktop wording is unchanged.
- [ ] A check (unit or content) flags hard-coded key names in player-facing strings that have no
      touch variant.
