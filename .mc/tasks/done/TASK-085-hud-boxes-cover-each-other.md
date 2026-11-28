---
id: TASK-085
aliases:
- TASK-085
title: 'HUD boxes cover each other: speech box over the tracker, toast over captions, level card over speech'
slug: hud-boxes-cover-each-other
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- mobile
- accessibility
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# HUD boxes cover each other: speech box over the tracker, toast over captions, level card over speech

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810). TASK-074 kept sound captions clear
of the skill and level cards on phones; these overlaps are still there:

1. **Phone (844×390, touch): the speech box hides the objective tracker.** The radio / speech box
   sits in the top band and covers the tracker (`.kqs-objective` at about 14/29). In the tour
   someone talks almost all the time, so the current objective is hidden most of the time.
2. **Phone: the tip toast covers the sound caption.** The „Laufschritt …“ toast (right of centre)
   was drawn over „Vögel zwitschern.“ (screenshot
   local screenshot `p06-after-walk.png` (not committed)).
3. **Desktop (1309×688): the level card covers the speech box.** At the start of chapter 1 the
   „Stufe III“ card sat on top of Laub's speech box for several seconds, so his line could not be
   read; with `?kapitel=4` the „Stufe IX“ card covered the chapter title card („Der Steinbruch“).
   Not captured on disk; it is visible for a few seconds after the first spring touch that ends
   the tour.

## Acceptance criteria

- [x] On phones the objective stays readable while someone speaks (the speech box moves, or the
      tracker shows in a free spot or as a one-line strip).
- [x] Toasts and tip cards never cover subtitles or sound captions (all viewports).
- [x] The level card waits until the chapter title card and the current speech line are done, or
      takes a slot that covers neither.
- [x] The mobile UI tour (`scripts/dev/mobile-tour.ts`) gets a state that checks tracker vs.
      speech box.

## Plan

_Status: done 2026-11-28 (branch `fix/hud-overlaps`)_

**Approach:** Keep the phone dialogue card where it is and carry the goal in its footer as a
strip; keep captions out of the toast dock's reach; tighten the card director's hold so the level
card neither starts during a chapter card's fade nor comes in over a line after `SOFT_MAX`.

- [x] 1. Goal strip: `DialoguePresenter.setGoal`, filled by story from the objective or the
  tracker's current goal (`dialogueGoal`); only the short touch layout shows it, one line on the row of „Tippen: weiter“ (cut with an ellipsis), so it never takes room from the spoken text.
- [x] 2. Captions: on the short touch layout they stay above the prompt while a line is up (the
  dialogue card is in the top band there); a toast waits, or steps aside with its clock stopped,
  while a line is in the subtitle box (`cards.toastHold`, `subtitlesCoverToast`).
- [x] 3. Level card: the chapter card holds the slot from the frame it is added until its fade
  ends (`.kqs-card`); past `SOFT_MAX` toasts and payouts wait until the line on screen is done (a
  break or the next line), then stay for the rest of the spell; the level card waits while
  any dialogue box is open (`cards.cardHeld`; seen in 1789's arrival on the desktop, where
  "Stufe III" lay over Laub's lines) and are never dropped; a raised radio line keeps the level and skill
  cards below it on taller layouts; no tilt on the phone slip (a corner reached the dialogue band).
- [x] 3b. Sound captions: at most two at once in the subtitle box (an era's sound bed started
  three cues that stacked over the avatar); further ones wait their turn.
- [x] 4. Mobile tour state `hud-overlap` (goal vs. speech box, toast vs. captions incl. three xl
  captions, level card vs. chapter card and dialogue at the start of chapter 1); the measurer's
  `caption-covered` also counts toasts and quest payouts. Unit tests in `tests/cards.test.ts` and
  `tests/dialogue-goal.test.ts`. Docs: ARCHITECTURE (card discipline), MOBILE-UI-PASS (state 28).

## Progress

- Repro before the fix (desktop 1309×688, real GPU): at the start of chapter 1 and with
  `?kapitel=4` the level card was up while the chapter card faded (3 overlapping samples each).
  After the fix: 0 overlapping samples; at the start of chapter 1 the card came up at the turn to
  Marlene's radio line, below it.
- Mobile tour `hud-overlap` on `small-landscape`, `large-landscape` and `tablet-landscape` with
  the shots judged by eye: the goal strip reads „◆ Zur Gruppe am Wanderparkplatz · 10 m“ in the
  phone dialogue footer (the tracker is clear of the dialogue card on the tablet), no caption under
  a toast, the level card never on the chapter card or the dialogue card.

