---
id: TASK-076
aliases:
- TASK-076
title: 'Talking to the guide at tour stops 2 to 4 opens an empty dialogue'
slug: empty-guide-dialogue-at-tour-stops
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- tour
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Talking to the guide at tour stops 2 to 4 opens an empty dialogue

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, real GPU, desktop). At the
Felsenpfad stop (t6) the HUD shows „E Mit Gerold Imhoff · Führung sprechen“ while the guide
gives his talk through the radio box. Pressing E opens the NPC dialogue with the portrait and
name but **no text**, only „Auf Wiedersehen“. The same prompt is on screen at the Weiher (t13)
and the Quelle (t15). A first-time player who follows the prompt sees a broken, empty box.

## Steps

1. New game, play the tour to the Felsenpfad stop (no debug flags).
2. When the group gathers and Gerold starts „So. Seht ihr den Buntsandstein …“, press E.
3. The dialogue opens empty (screenshot below). Pick 1 to close it; the talk continues in the
   radio box.

Screenshot (scratchpad of the playtest session):
local screenshot `d01-t6-empty-guide-dialog.jpg` (not committed)

## Likely cause

The stops t6, t13 and t15 in `content/story/00-tour.story.json` speak through `say` lines, but
the generic NPC talk prompt for `imhoff` (`src/systems/npc/index.ts`, `npc.prompt`) stays active
and has nothing to show. Only t2 has a real dialogue.

## Acceptance criteria

- [x] At t6, t13 and t15 the guide either offers no talk prompt while he has nothing to say, or E
      opens a dialogue with real lines (for example a repeat of the stop's talk).
- [x] No NPC dialogue in the tour or chapters opens with empty text (a unit or e2e check).
- [x] t2 (the first conversation) still works as before.

## Result

The guide's tour lines (`content/packs/tour.pack.json`) are a three-step greeting for t2. After it
he has no greeting, topic or quest topic left, but the talk prompt stayed. Now a person offers the
prompt only while it has something to say (`hasWords` in `src/systems/npc/logic.ts`, used by the
talk-range check in `src/systems/npc/index.ts`; E stays free for others). As a safety net
`open()` shows „(Schweigt und sieht dich an.)“ whenever there would be no text and no topic.

Checks: `tests/npc-has-words.test.ts` (fails on main), `e2e/tour-slice.spec.ts` at t6 (next to
the guide: no „sprechen“ prompt). t2's conversation is covered by the same spec.

## Follow-up: PR #126 (contributor)

Started in parallel before the fix above landed; after merging `main` the PR keeps only what
`main` does not have:

- The stop-1 greetings need `tour.station1.ready` (`content/packs/tour.pack.json`), cleared on t2's
  `exit` (`content/story/00-tour.story.json`): a player who skipped the car-park talk does not get
  it at the Felsenpfad (`tests/tour-slice.test.ts`).
- `tests/npc-talk-waits.test.ts`: no beat `complete` or `on[].when` in the tour and chapters 1-4
  waits for a talk with someone who has nothing to say (`hasWords` with the flags the beat's
  `enter` sets).
- `tests/npc-encounter.test.ts`: no E once everything is said; a forced `kq.npc.talk` says the
  silent line.
- `e2e/tour-slice.spec.ts`: a short test for t6, t13 and t15 next to the guide and the forced open;
  the t6 check in the full run reads only the visible prompt (`.kq-prompt.show`), because the hidden
  element keeps its last text.
- PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/126
