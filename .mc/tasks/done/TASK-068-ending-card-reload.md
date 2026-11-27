---
id: TASK-068
aliases:
- TASK-068
title: 'A reload during the ending scene keeps the closing card'
slug: ending-card-reload
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- story
- saves
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-27
---

# Reload during the ending scene skips the closing card

## Goal

Reloading a save made while an ending scene or its closing card is showing skips the card and
goes straight to the epilogue. Nothing in the save records that the card is still owed. Found
in the TASK-039 review (PR #66) as a pre-existing bug on main.

## Acceptance criteria

- [x] A save taken during the ending scene or while the closing card is up shows the closing
      card again after a reload (title „Weiter“ and a pause-menu load), then continues to the
      epilogue as normal.
- [x] A save taken after the card was dismissed goes straight on, without showing it twice.
- [x] Touch and reduced motion still work.
- [x] A unit test reproduces the skipped card first and then pins the fix.
- [x] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` (the
      epilogue-resume, party and smoke e2e specs are left to the integration run).

## Plan

**Approach:** Persist a small marker in the story slice when the closing card opens and clear it
when it closes; on resume, reopen the card if the marker is set. Add a fallback for saves
without the marker.

**Files to touch:** `src/systems/story/endings/*`, `src/systems/story/index.ts` (resume),
`src/systems/story/migrate.ts` if the slice gains a field (and the save fuzz test,
`tests/save-fuzz.test.ts`), a unit test, the PRD changelog.

**Risks:** Interplay with TASK-039's epilogue resume and TASK-045's ending replay handling.

## Resolution

Root cause: the save only knew that an ending was chosen (`slice.ending`, autosaved at the
choice, before the staged scene). The story's resume reopened every e2 save with an ending at
the epilogue, so the closing card between scene and epilogue was skipped.

Fix: a story flag `story.endcard` (persisted with the flags, no slice or schema change) is set
when the card's „Weiter“ button is pressed, followed by a forced autosave. The flag is cleared by
a new choice and on entering e1. `resume()` (title Continue, pause-menu load, wake) now opens
the closing card (`EndingScreen.show(ending)`, no staged replay, no new animation) when the flag
is missing and the epilogue when it is set. The card's button is guarded so a stale second tap
does nothing.

Legacy saves: an e2 save without the marker cannot be told apart (a save from the choice, the
scene or the card, or an older save taken at the epilogue), so it shows the card once; its
button leads to the epilogue as before. Saves made after the card was dismissed carry the flag
and never show it twice.

Tests: `tests/story-party-save.test.ts` › "the ending card after a reload (TASK-068)" (failed
on main first: the in-play load showed no card), plus the card-then-epilogue path in
`tests/story-epilogue-resume.test.ts`.
