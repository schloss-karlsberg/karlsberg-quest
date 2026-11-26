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
- [x] Record the original sweep in `cba6c46`.
- [x] Update the PRD changelog and document the test helper in the architecture testing section.
- [ ] Pass all four gates (`pnpm validate` blocked before its script started).
- [x] Check smoke feasibility on port 5435; record results and follow-ups.

## Review fix plan and acceptance criteria

- [x] Reset quest selection with an empty render and verify unread marks on completed quests, including on a repeated run.
- [x] Use the quest engine's objective target for journal ticks and progress counts. Verify a skipped subsecond bonus and earned progress.
- [x] Verify the open-modal callback reports `1, 2, 1, 0` across Pause and save confirmation.
- [x] Verify tapping a blocked map point selects its row and Enter requests no travel.
- [x] Update the journal documentation and add a PRD changelog row.
- [x] Pass typecheck, the full unit suite with zero failures, and the production build.
- [ ] Pass `pnpm validate` in an environment that allows the validator to open its IPC socket.
- [x] Check smoke feasibility and record the sandbox result.
- [ ] Commit the review fixes locally. The sandbox denied `index.lock`.

## Progress

- Branch: `dev/task-047`, based on `d2d1f48`. No changes to other tasks, dialogue or audio planned.
- Review round, 2026-11-26. The unread test reproduced the stale selection with `--repeats=1`. The optional 0.4 s survival case also failed before using `need()`. All three reviewed test files now pass with `--repeats=1` (`13 passed | 1 todo`).

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

## Review verification

- Fixed 1. The unread test resets selection through an empty render and checks unread marks on completed quests.
- Fixed 2. The duplicated target calculation exists on `origin/main`. The journal now uses `need()` for ticks and progress counts, with regression coverage for a skipped 0.4 s objective and a 2.6 s objective rounded to 3 s.
- Fixed 3. The Pause test asserts `onChange` calls `[1, 2, 1, 0]`. It fails if closing the save confirmation reports zero open modals.
- Fixed 4. The map test asserts that tapping a blocked destination selects it and pressing Enter requests no travel. It fails if the map ignores the tap.
- Gates (Node 24). `pnpm typecheck` passed. `pnpm test` reported `Test Files  122 passed (122)` and `Tests  1589 passed | 1 todo (1590)`, with zero failures. `pnpm validate` stopped at `listen EPERM` in the `tsx` launcher. `pnpm build` reported `✓ built in 728ms`.
- Smoke remains unverified. The review round also hit `EPERM` binding `127.0.0.1:5435`. No e2e specs changed, and no voiced lines need new text.
- `git add` was denied when creating the current worktree's `index.lock`. The review changes are in the worktree, and `HEAD` is `cba6c46`.

## Follow-ups

- Run `pnpm validate` and `KQ_E2E_PORT=5435 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` on a machine that permits local sockets.
- Decide whether changing Codex filters should clear an open detail that falls outside the new filter.
- Commit the review changes from a session that can write the worktree index.

```sh
credit='Co-Authored-By: Codex <noreply@openai.com>'
git add -- src/systems/quests/pages.ts tests/journal-pages.test.ts docs/ACTION-RPG.md docs/ARCHITECTURE.md docs/PRD.md
git commit -m 'fix(ui): align journal progress with quest targets' -m "$credit"
git add -- tests/pause-controls.test.ts tests/field-map-page.test.ts .mc/tasks/todo/TASK-047-ui-pages-and-hud-coverage.md
git commit -m 'test(ui): verify pause depth and blocked map selection' -m "$credit"
```
