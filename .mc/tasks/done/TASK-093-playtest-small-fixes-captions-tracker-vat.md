---
id: TASK-093
aliases:
- TASK-093
title: 'Small playtest fixes: doubled captions, doubled tracker step, „VAT“ unexplained, prompt under the dialogue'
slug: playtest-small-fixes-captions-tracker-vat
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Small playtest fixes: doubled captions, doubled tracker step, „VAT“ unexplained, prompt under the dialogue

## Goal

Found in the real-GPU playtest of 2026-11-28 (main f8a75ff7, desktop, P3 findings). Small UI and
text bugs that each cost the player a moment of confusion. The birdsong caption cadence is
TASK-079 (PR #131); this task takes what remains.

## Acceptance criteria

- [x] The same caption is never shown twice at once („[Glas klirrt leise, vorn]“ stood twice in the
      box) and never waits twice in the queue; a repeat extends the line on screen instead.
- [x] The quest tracker shows a step once: in chapter 1 it listed „An der Quelle: das Wasser
      berühren“ (quest goal) and „→ An der Quelle: E – das Wasser berühren“ (the story's line for the
      same step). The story's line still shows under the goal when it names a different step.
- [x] „VAT“ is explained once in context: Laub's line for the third relief tier spells it out
      (Visualisierung für archäologische Topografie, with source in the code).
- [x] No HUD prompt under an open conversation („E bei Gerold: zuhören“ stood under the guide's
      first line); prompts set meanwhile come back when it closes.
- [x] No three.js `toNonIndexed()` warning at boot (combat rock shapes).
- [x] Unit tests for each fix.

## Progress

- 2026-11-28. `Hud.subtitle` keys lines by speaker, text and fiction mark; a repeat while the line
  is up or queued keeps the one line and extends its time (`tests/hud-subtitles.test.ts`). Captions
  that seemed to stay „more than 15 s“ were bullet time (wall-clock timers, fast `kq.step`), not a
  real-time bug.
- The tracker's `via` line goes through `viaLine()` (`src/systems/quests/stepText.ts`), which drops a
  story line that differs from the goal only by key hints or punctuation
  (`tests/quest-step-text.test.ts`, including the chapter 1 content pair).
- `skills.laub.relief.3` now explains VAT (Kokalj & Somrak 2019, Remote Sensing 11(7) 747).
- `src/ui/promptBlocks.ts`: cinematic and conversation block HUD prompts (moved from boot).
- `visuals-shapes.ts` rock: no `toNonIndexed()` on the already non-indexed icosahedron
  (`tests/combat-shapes.test.ts`).
- Not taken: caption bracket style („Vögel zwitschern.“ vs. „[Glas klirrt]“) touches the ambience
  file of PR #131; captions over the radio box are HUD layout (TASK-085).
