---
id: TASK-084
aliases:
- TASK-084
title: 'Touch players are told to hold the „Umschalttaste“'
slug: keyboard-hints-on-touch
status: done
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
local screenshot `p06-after-walk.png` (not committed)

Other keyboard-only lines found with grep (not seen on the phone in this session):

- `src/systems/travel/strings.ts` `sprint` (the toast above, shown from `src/systems/travel/index.ts`).
- `src/systems/court/strings.ts` `court.hint.how.running`: „Umschalttaste loslassen …“.
- `content/story/03-kapitel-3.story.json`: „Halte die Umschalttaste zum Rennen.“ (fire escape).

## Acceptance criteria

- [x] In touch mode these hints name the touch gesture (for example „Stick ganz nach vorn
      schieben“) or use the action label helper (`src/ui/actionLabel.ts`), as other prompts do
      („Wischen: Schauen“).
- [x] Desktop wording is unchanged.
- [x] A check (unit or content) flags hard-coded key names in player-facing strings that have no
      touch variant.

## Progress

- 2026-11-27 — Travel: the Laufschritt tip shows `TRAVEL_DE.sprintTouch` („Schieb den
  Bewegungsregler ganz nach vorn …“) in touch mode. Court: `court.hint.how.running.touch`, picked by
  the new `tInput(id, touch)` helper in `src/i18n`. Chapter 3: the `k3.hinaus` objective (not a
  dialogue or voiced line) now reads „… Renn, dann bist du kürzer im Rauch.“ for every input.
  Desktop wording of the travel and court lines is unchanged. `tests/touch-wording.test.ts` flags
  registered strings naming Shift without a `.touch` twin and story objectives/toasts naming keys.
- Left open (follow-up): the chapter 1 kennel chase objective `k1.flucht` („weich aus [Leertaste]“)
  and its toast („Aufstehen: [Leertaste]. Rennen: [Umschalt] …“) still name keys on touch. Story
  objectives and toasts have no touch variant; a `touch` field on those actions (like prompts have)
  would fix them. Both are allowlisted in the test. No dialogue or voiced line names the Shift key (grep;
  no `k3.brand.aufbruch` line exists).
