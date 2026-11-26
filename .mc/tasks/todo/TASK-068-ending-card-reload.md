---
id: TASK-068
aliases:
- TASK-068
title: 'A reload during the ending scene keeps the closing card'
slug: ending-card-reload
status: todo
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
updated: 2026-11-26
---

# Reload during the ending scene skips the closing card

## Goal

Reloading a save made while an ending scene or its closing card is showing skips the card and
goes straight to the epilogue. Nothing in the save records that the card is still owed. Found
in the TASK-039 review (PR #66) as a pre-existing bug on main.

## Acceptance criteria

- [ ] A save taken during the ending scene or while the closing card is up shows the closing
      card again after a reload (title „Weiter“ and a pause-menu load), then continues to the
      epilogue as normal.
- [ ] A save taken after the card was dismissed goes straight on, without showing it twice.
- [ ] Touch and reduced motion still work.
- [ ] A unit test reproduces the skipped card first and then pins the fix.
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
      epilogue-resume, party and smoke e2e specs.

## Plan

**Approach:** Persist a small marker in the story slice when the closing card opens and clear it
when it closes; on resume, reopen the card if the marker is set. Add a fallback for saves
without the marker.

**Files to touch:** `src/systems/story/endings/*`, `src/systems/story/index.ts` (resume),
`src/systems/story/migrate.ts` if the slice gains a field (and the save fuzz test,
`tests/save-fuzz.test.ts`), a unit test, the PRD changelog.

**Risks:** Interplay with TASK-039's epilogue resume and TASK-045's ending replay handling.
