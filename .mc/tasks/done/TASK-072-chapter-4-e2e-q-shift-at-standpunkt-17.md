---
id: TASK-072
aliases:
- TASK-072
title: 'Chapter 4 e2e: Q at Standpunkt 17 lost behind a deferred clue page'
slug: chapter-4-e2e-q-shift-at-standpunkt-17
status: done
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- e2e
- story
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Chapter 4 e2e: Q at Standpunkt 17 lost behind a deferred clue page

## Problem

`e2e/chapter-k4.spec.ts:14` failed at `e2e/helpers/k4.ts:410`. After `shiftQ` at the well
(Standpunkt 17) it expected era `1796` but got `today`.

## Cause

The game was fine; the test helper was not.

1. `examineHere` takes the clue pages `clue.k4.anschlag`, `clue.k4.graben` and
   `clue.k4.graben_heute` while the fights of 4.4–4.5 run.
2. The card director (`src/ui/cards.ts`) queues those pages while the HUD's `combat` action
   reason holds the slot.
3. That reason lingers 3 s after the fight, and the linger is counted in rendered frames.
   `kq.step(n)` renders once per call, so the pages stay queued for most of the chapter.
4. They open only after the station teleport, just before the Q press at Standpunkt 17. An open
   page disables gameplay input, so the press was lost.

A real player sees the page, closes it and then presses Q. Nothing is broken in the game.

The failure is not a merge regression. The same instrumented run fails the same way on
fcb43ad, the last commit that had been green. Whether the pages open before or after the press
depends on how many frames get rendered.

## Fix

- `shiftQ` first reads away every page that is open or free to open, as a player would
  (`readPages`).
- `shiftQ` now asserts that the press started a shift. A lost press fails right there, with the
  input, modal and card-queue state in the message.

## Acceptance criteria

- [x] `e2e/chapter-k4.spec.ts` green (whole spec), plus smoke.
