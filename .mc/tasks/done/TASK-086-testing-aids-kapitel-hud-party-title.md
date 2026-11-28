---
id: TASK-086
aliases:
- TASK-086
title: 'Testing aids: stale XP widget after ?kapitel, tour runs under ?party from the title'
slug: testing-aids-kapitel-hud-party-title
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- testing
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# Testing aids: stale XP widget after ?kapitel, tour runs under ?party from the title

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, desktop). Two URL flags from
CONTRIBUTING.md „Testing aids“ give a wrong picture to testers. Players are not affected.

1. **`?kapitel=2|3|4`: the XP widget shows „Stufe 1 · 0 / 150 EP“.** The state is right
   (`kq.state().systems.progression`: level 9, 4800 XP with `?kapitel=4`) and the „Stufe IX“ card
   shows, but `.kqp-xp` keeps the level-1 values until the first XP is earned (then „100 / 2400
   EP“). After a normal save load the widget is correct.
2. **`?party=museum` through the title („Neues Spiel“, with `&nosave&fresh`) starts the tour on
   top of the party.** The title card „Prolog · Die Führung“ shows, Gerold and Mats say their
   car-park lines (t1), and the tracker reads „Zur Gruppe am Wanderparkplatz · 750 m“ while the
   party plays on the plateau. With `&debug` (title skipped) the party is clean.
   Also with `?kapitel=N` the title flow shows the tour's route card („Tour starten“) before the
   chapter starts.

## Acceptance criteria

- [x] After a `?kapitel` jump the XP widget shows the granted level and XP at once.
- [x] `?party=…` started from the title goes straight to the party (no tour beat, title card or
      tour objective); `?kapitel=N` skips the tour route card.
- [x] The smoke or party e2e covers one of these paths without `?debug`.

## Done (2026-11-28)

- `src/systems/story/devstart.ts`: `kapitelJump`, `partyDevVariant`, `skipsTourRoute` read the
  two testing-aid flags in one place (boot, story, party use them; flag names and ranges unchanged).
- Title flow (`title/flow.ts`): with `skipRoute` the name confirm starts the game, no route card.
- Story `onStart`: a title new game under a valid `?party=` does not start the tour.
- Progression: `kq.progression.level(n)` redraws the XP widget at once (`refreshXp`).
- Tests: `tests/devstart.test.ts`, `tests/progression-level-hud.test.ts`, e2e
  `party (d): ?party=museum from the title …` in `e2e/party.spec.ts` (no `?debug`/`?notitle`).
- CONTRIBUTING testing-aids table and ARCHITECTURE party section updated.
