---
id: TASK-047
aliases:
- TASK-047
title: 'Test coverage and bug sweep: UI pages and HUD logic'
slug: ui-pages-and-hud-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- testing
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# UI pages and HUD coverage

Goal: pin down untested player-visible UI behaviour, and fix only demonstrated bugs outside the parallel tasks.

## Plan and acceptance criteria

- [x] Map UI modules and journal/page renderers to player contracts and existing unit tests.
- [x] Add at least 25 meaningful deterministic assertions for uncovered contracts; run the new set in about three seconds or less.
- [x] Reproduce bugs in failing tests first and fix only the observed behaviour. Record design questions as TODOs rather than changing behaviour.
- [ ] Commit the fixes separately (sandbox denied `index.lock`; handoff below).
- [x] Update the PRD changelog and document the test helper in the architecture testing section.
- [ ] Pass all four gates (`pnpm validate` blocked before its script started).
- [x] Check smoke feasibility on port 5435; record results and follow-ups.

## Progress

- Branch: `dev/task-047`, based on `d2d1f48`. No changes to other tasks, dialogue or audio planned.
- Git refused the initial `git add` (`index.lock`: operation not permitted); leave the intended changes and commit subjects for the maintainer.

## Coverage map (before this sweep)

| Module | What the player relies on | Unit coverage / gap |
| --- | --- | --- |
| `menus` | Resume, manual save acknowledgement only on success, page badges, back, notes confirmation, licences | `voice-assets` tests the voice credit summary only. |
| `modal`, `pointerTap` | Pause until the last panel closes; Escape closes only the top once, focus returns, drag/cancel does not dismiss | No direct tests. |
| `pause-pages` | Ordered destinations and contributed sections, replacement by id, one open instance, refresh without losing scroll, hide on close | No direct tests. |
| `quests/pages`: Aufgaben | Main/side listing and tracking, fallback story step, counts/bonuses, unseen marks, history after turn-in | `quests` and `quests-tracker` cover book/ordering, not rendered progress or reading a row. |
| `quests/pages`: Codex | No spoilers from locked cards, filters and unseen counts, source/confidence/fiction labels, detail after replacing a save | `content-packs` covers data; `quests` covers unlocks, not the page. |
| `quests/pages`: Sammlungen | Count distinct owned members, hide missing names, empty/complete sets, bestiary count and eras, bottle/find sections | `progression` tests set rewards, `flaschen` and `travel` test discovery, not this rendering. |
| `progression/pages` | Inventory and talent sections share live state; supply uses, quick slot, charm slots, max ranks, prerequisites, badge and home-only respec | `progression` tests rules and restore, not the controls. |
| `travel/map` | Only known, eligible destinations; distance ordering, pointer/keyboard parity, layer changes, cleanup on close | `travel` tests discovery and travel gates; not map events. Minimap/route solver excluded. |
| `story` chapter page; `photo` album | Only unlocked chapters can be replayed; album cards persist but session thumbnails do not | `story` / `photo` test state, not page navigation. No changes to photo. |
| `settings`, `actionLabel` | Controls reflect stored values (including zero), accessible names/value, reduced-motion navigation; action text follows active input | `core`, `perf-settings` cover storage/pacing; `touchMap` covers action labels, not form input. Binding editor excluded. |
| `cards`, `playDismissal`, `ui` | One notice at once, fight/talk holds, resumed lifetime, no stale queue after load; dismiss before Pause; toast wakes renderer, named layers reused | `cards`, `play-dismissal` cover slot timing, preemption and dismissal order. Reset and UI facade not directly covered. |
| `dom`, `news`, `releaseNotes` | Safe text and wired controls; newest-first notes, seen status survives reopen/storage failure | `releaseNotes` covers parser, escaping, sort and storage, not modal rendering. DOM builder not directly tested. |
| `loader` | Overlapping requests, delayed display, progress incl. unknown size, cancel/finish | `loader` covers timing, aggregation, percentages and first paint. |
| `waymark`, `touch`, `touchIcons` | Marker visibility, edge direction, distance; input mapping and cancelling a gesture, recognisable icons | `wayfinding`, `touchMap`, `story-touch` exercise targeting/input, not marker projection/icon rendering. Leave parallel HUD/mobile work alone. |
| `hud`, `title`, styles/fonts | Prompts, compass, toast presentation, Continue; responsive layout and motion preferences | Excluded/shared surfaces; no CSS, title or HUD edits. |

## Regressions and verification

- `quests/pages`: the completed Lohnzettel showed three ticks even with the optional Hundemarke count at zero. The test expected `[true, true, false]`; the earned-bonus case still gets its tick. No payout or save change.
- `quests/pages`: the first visible quest was removed from the unread list but still had a `neu` marker until the next render. The test found one marker instead of zero. Reading a detail now clears only that quest before drawing its row.
- `travel/map`: selecting a known point 24.9 m away on the canvas and pressing Enter requested travel despite its disabled button. The test recorded one travel request instead of zero. Exactly 25 m remains eligible, and travel blocks still apply.
- Focused: `pnpm exec vitest run tests/{cards,journal-pages,pause-controls,progression-page,field-map-page}.test.ts` — 25 passed (includes existing card tests), 1 design TODO, 286 ms. 14 new passing cases, 101 new assertions, no new dependencies, browser, timers or randomness required by the new cases.
- Gates (Node 24): `pnpm typecheck` passed; `pnpm test`: `Test Files  122 passed (122)`, `Tests  1587 passed | 1 todo (1588)`, 0 failed. `pnpm validate`: `listen EPERM` creating the tsx IPC socket. `pnpm build` run separately: `✓ built in 1.21s`. `mc validate` passed.
- No e2e specs changed. Binding `127.0.0.1:5435` returned `EPERM`, so smoke was skipped rather than taking the machine-wide lock. No voiced lines need new text.

## Follow-ups

- Run `pnpm validate` and `KQ_E2E_PORT=5435 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` on a machine that permits local sockets.
- Design TODO: should changing Codex filters clear an open detail if it is no longer in the grid? The current behaviour is unchanged.
- No commits or push. To preserve separate fixes in a writable checkout, use the following staging order (select only the indicated hunk for the first journal fix):

```sh
credit='Co-Authored-By: Codex <noreply@openai.com>'
git add .mc/tasks/todo/TASK-047-ui-pages-and-hud-coverage.md
git commit -m 'docs(ui): plan the pause page coverage sweep' -m "$credit"
git add tests/{cards,journal-pages,pause-controls,progression-page,field-map-page}.test.ts tests/ui-fixture.ts
git commit -m 'test(ui): cover pause pages and journal state transitions' -m "$credit"
git add -p src/systems/quests/pages.ts  # only the optional objective check
git add docs/ACTION-RPG.md
git commit -m 'fix(ui): keep unearned quest bonuses unchecked' -m "$credit"
git add src/systems/quests/pages.ts
git commit -m 'fix(ui): clear the displayed quest unread mark immediately' -m "$credit"
git add src/systems/travel/map.ts
git commit -m 'fix(ui): enforce map travel distance for keyboard input' -m "$credit"
git add docs/ARCHITECTURE.md docs/PRD.md
git commit -m 'docs(ui): record pause page behaviour and test coverage' -m "$credit"
```
