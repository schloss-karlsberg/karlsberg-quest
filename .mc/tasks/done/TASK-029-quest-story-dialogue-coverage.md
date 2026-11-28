---
id: TASK-029
aliases:
- TASK-029
title: Test coverage and bug sweep for quests, story flow and dialogue
slug: quest-story-dialogue-coverage
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- quests
- story
- testing
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Test coverage and bug sweep for quests, story flow and dialogue

## Goal

Map player-facing behavior and pin down high-value gaps in quests, story and dialogue (outside the
guided walk), Chronik and content validation. Fix demonstrated bugs within that scope.

## Acceptance criteria

- [x] Record a module-by-module behavior and coverage map against the existing Vitest suite.
- [x] Add at least 25 meaningful deterministic assertions across the mapped area, with the focused run under about three seconds.
- [x] Reproduce each bug with a failing test first and fix it minimally. Record design questions as test TODOs.
- [x] Keep parallel work and voiced text out of the diff. Update affected documentation and the PRD changelog.
- [x] Attempt all four gates and the locked smoke spec on port 5417. Record exact results or the blocker.
- [x] Preserve the combined implementation commit `d8d6cdd` and record the first review commit and follow-ups.

## Plan

_Status: approved 2026-11-26_

**Approach:** Read the modules and match their public entry points against tests. Test
high-impact state transitions and boundary cases using the existing unit fixtures and
simulated time. Reproduce discrepancies against the current branch before editing runtime code.

**Files to touch:** Focused files in `tests/`, minimal fixes in the scoped modules, the
relevant behavior docs, `docs/PRD.md`, and this task file.

**Steps:**

- [x] Map modules and identify the gaps with the greatest player impact.
- [x] Write and run tests against the baseline before making behavior changes.
- [x] Fix verified discrepancies and record unresolved design questions.
- [x] Measure the focused run and attempt the full gates and locked smoke spec.
- [x] Update the docs and record what remains in the report.
- [x] Record the combined implementation commit and its departure from the original separate-commit plan.

### Review fix round

Keep urgent dialogue playable at capacity and restrict pack discovery to regular files and links
to regular files. Strengthen the review's CLI, quest and echo regressions.

- [x] Reproduce the urgent-line loss through the presenter and the pack discovery issue using filesystem fixtures.
- [x] Fix both runtime issues, correct the existing test fixtures and update the behavior docs.
- [x] Run the focused tests, attempt all four gates and the locked smoke spec, and record the results.
- [x] Land the first review fixes in `0e6bbef`.

**Test plan:** Run targeted Vitest files, then typecheck, test, validate and build. Run the
locked Playwright smoke spec at 5417 and any specs edited by this task.

**Risks:** Preserve persisted progress and event ordering. Keep overlapping feature work and
spoken lines outside changes.

**Open questions:** Record design ambiguities found during the audit.

## Progress

- Branch `dev/task-029` starts at `d2d1f48a` (the local `origin/main`).

- 2026-11-26: Matched module imports, entry points and test cases. The priority gaps are
  queue saturation, chapter reaction state on replay, echo interruption, and validator file discovery.

- 2026-11-26: The baseline focused run reproduced seven failures covering four fixes. The
  remaining new cases passed and two behavior questions are recorded as Vitest TODOs. A
  subsequent baseline queue test also reproduced eviction when every slot held a continuation.
- 2026-11-26: Fixed all four issues. The focused run reported `Tests  76 passed | 2 todo (78)`
  in 214 ms with 61 new assertion sites. The full run reported `Test Files  119 passed (119)` and
  `Tests  1586 passed | 2 todo (1588)`, with zero failures.
- 2026-11-26: `pnpm typecheck`, `pnpm build`, and `mc validate` passed. `pnpm validate`
  stopped before running the validator because the sandbox denied the tsx IPC socket.
  The locked `e2e/smoke.spec.ts` command stopped before browser launch because the sandbox
  denied the preview server's bind on `127.0.0.1:5417`.
- 2026-11-26: The first review started on `dev/task-029` at `d8d6cdd`, the combined implementation
  commit. The first review fixes are in `0e6bbef`.
- 2026-11-26: The review baseline showed the presenter advancing to the first continuation after
  either a discarded tutorial or an expired urgent line. Pack discovery returned a linked directory,
  a dangling link, a pipe and a linked pipe alongside the valid pack.
- 2026-11-26: The presenter plays eligible urgent lines directly. Pack discovery verifies link
  targets and ignores special files. The review also corrected native paths in the CLI test,
  the pending bonus objective and whole-second save in the quest tests, and the fictional speaker
  in the echo lifecycle fixture. The focused run reported `Tests  80 passed | 2 todo (82)` in 434 ms.
- 2026-11-26: Review gates passed for `pnpm typecheck`, `pnpm test` and `pnpm build`. The full
  test run reported `Test Files  120 passed (120)` and `Tests  1590 passed | 2 todo (1592)`, with
  zero failures. `pnpm validate` hit `listen EPERM` in the tsx launcher. A direct run with
  `node --import tsx scripts/validate-content.ts` checked 12 packs and ended with
  `✓ content valid (1 warning(s))`. The locked `e2e/smoke.spec.ts` run hit `listen EPERM` at
  `127.0.0.1:5417` before launching a browser.
- 2026-11-26: PR #58 review fixes protect queued urgent dialogue and interrupted sequences at
  capacity, release the Chapter 2 lantern choice when the departure scene closes, and reject
  symlinked content directories with a path diagnostic. Added focused regression coverage and a
  browser case for leaving during the departure. This round is unstaged at `0e6bbef`.
- 2026-11-26: The requested pnpm commands stopped during dependency preflight because the sandbox
  denied writes through the shared `node_modules` link. The installed TypeScript checker passed.
  Vitest with Vite's runner config loader and two workers passed all 120 files, with 1,594 tests
  passed and two TODOs. `tests/content-validation-cli.test.ts` also passed individually, including
  the filesystem fixtures. `node --import tsx scripts/validate-content.ts` passed with one pack
  warning. The Vite build passed with the runner config loader. Playwright listed the specs, and
  preview hit `listen EPERM` on `127.0.0.1:5417` before browser launch.

## Baseline coverage map

Unit references below name files in `tests/` without the `.test.ts` suffix. Browser coverage
is identified separately where useful.

### Quests

| Module | Player-dependent behavior | Baseline unit coverage and gaps |
| --- | --- | --- |
| `index.ts` | Event subscriptions, chapter cleanup, voice turn-ins, autosaves, restore and reconcile known clues, NPC/visual sync | Pure paths in `quests`, `quests-tracker`, `quests-content-a/b`; system event ordering and save wiring mainly in `e2e/quests.spec.ts`. |
| `logic.ts` | Offer, accept, ready, turn-in, reward receipts and Codex, failed/reset quests, kill/drop rules, escort/survive, tracker, legacy saves | `quests`, `quests-tracker`, `quests-content-a/b`; gaps in partial survival after a save round-trip, ready optional objectives, interrupted echoes and cap/retry boundaries. |
| `data.ts` | Campaign and test chapter inclusion, archived definitions | `quests`, `quests-tracker`, `tour-handover`. |
| `validate.ts` | Objective and quest references, staged enemy placement, rewards and sourced history | `rpg-contracts`, `quests-content-a/b`; broken input combinations have lighter coverage. |
| `validate-cli.ts` | File loading and cross-checks against NPC placements, available items, chapters and packs | Campaign fixtures in `quests-content-a/b` and `rpg-contracts`; aggregate discovery and parse-error paths have no direct assertions. |
| `wayfinding.ts` | Objective positions and hints, portable clues, era visibility, stall reset | `wayfinding`; route selection and rendering belong to browser coverage and parallel work. |
| `hud.ts` | Tracker folding, ordered notices, payout timeout and walk-away dismissal | `quests-tracker` covers selection logic; `play-dismissal` covers the shared dismissal context. Quest HUD timing has no direct unit test. |
| `beacons.ts` | Era, range and objective-zone fades, lead emphasis, pause/visibility | No direct unit tests; in-world graphics coverage gap. |
| `pages.ts`, `quests.css` | Quest/Codex/collection pages, filters, badges, sources, tracker controls and touch layout | `quests-tracker`, `content-packs` cover data; page interactions in quests and Chronik browser specs. |
| `audio.ts`, `strings.ts` | Quest cue variants, German labels and objective feedback | No direct unit tests for playback or translation registration. |

### Story and dialogue

| Module | Player-dependent behavior | Baseline unit coverage and gaps |
| --- | --- | --- |
| `engine.ts` | Chapter/beat transitions, latches, reactions and cooldowns, unlocks, checkpoint/reload, one-shot actions | `story`, `story-flow`, `story-ext`, `story-card-hold`; fresh chapter reaction state, interrupted echo gates and event ranges could use direct checks. |
| `index.ts` | Action scheduling and cleanup, dialogue/echo/choice holds, resume, capture, reward and ending wiring | `story-card-hold`, `story-party`, `integration-round2` and `k3-fire-hold` cover portions. Runtime scheduling and mid-action loads mainly have browser coverage. |
| `meters.ts` | Pause and era filtering, fill bounds, wrapped meters, relief, re-arming | `story-ext` covers hold, era, full-once, modes and wrappers; relief and a second fill are a gap. |
| `migrate.ts` | Old objective destinations and retired station state | Save migration tests in `core` and `tour-handover`. |
| `stories.ts` | Test chapter opt-in and bundled order | `story`, `tour-handover`; guided-walk code is outside scope. |
| `types.ts`, `validate.ts`, `validate-cli.ts` | Action/condition vocabulary, action references, content diagnostics, file loading | `story`, `story-flow`, `story-ext`, `story-touch`, `stage-directions`, `rpg-contracts`; checks for malformed input are sampled. |
| `objectives.ts` | Bearings, compass tracking and cue display, reduced motion | Bearing helpers in `story`; display and input are parallel work. |
| `overlays.ts`, `story.css` | Chapter card holds, fades, gauges, choice interaction and reduced motion | `story-card-hold` covers timed/held presentation; modal/inline choice interaction and styling rely on browser coverage. |
| `hub/home.ts` | Home ring in the present, safe return and wake location | `story`, `quelle`; no changes here. |
| `sfx.ts`, `strings.ts` | Horn signal patterns, captions, German prompts and titles | Signal data in `story`; playback and registration have no direct unit tests. |
| `title/flow.ts` | Content note, visitor name and starting the tour | No direct unit test of the full UI flow. Title/save overlap stays with the parallel task. |
| `dialogue/queue.ts` | Urgent jumps, cap and expiration, sequence continuity, held lore, context changes | `story-flow`; incoming low-priority lines at capacity and eviction of an active sequence are gaps. |
| `dialogue/presenter.ts` | Typing, line holds, skip, blocked lines, pause and resume, fallback voice and touch | Text and duration helpers in `story` and `story-ext`; clip playback in `voice-playback`; full presenter wiring gap. |
| `dialogue/voice.ts`, `voiceClips.ts`, `voiceManifest.ts` | Clip selection, formats, text match, cache/concurrency, playback state and pause | `voice-clips`, `voice-manifest`, `voice-playback`, `audio-mix`, `story`. |
| `dialogue/triggers.ts`, `speakers.ts`, `portraits.ts` | Trigger matching/order, German speaker identity and portrait selection | `story`, `story-ext` cover trigger/speaker helpers; portrait rendering gap. |
| `endings/assemble.ts`, `epilogue.ts`, `scenes.ts` | Ending text, deeds and source variants, year-dependent scenes | `story`, `story-ext`, `story-party`, `quests-content-b`. |
| `endings/stage.ts`, `ui.ts` | Staging, skip, reduced motion, look/camera release, credits | `setpieces` covers stage sampling and memory timing; `credits` covers data. Full staging/hand-off and UI are browser gaps. |

### Chronik and validation entry point

| Module | Player-dependent behavior | Baseline unit coverage and gaps |
| --- | --- | --- |
| `chronik/index.ts` | Discover and persist clues, era/capture/load transitions, tap vs hold, marker and card updates | `chronik`, `integration-round2`, `echo-twins` cover portions; full interaction paths primarily in `e2e/chronik.spec.ts`. |
| `chronik/logic.ts`, `types.ts` | Pack selection, clue requirements, discovery idempotence, legacy progress, loss and hints | `chronik`, `content-packs`; empty/legacy case and persisted discovery edges have thinner coverage. |
| `chronik/echo.ts`, `staging.ts` | Echo timing, walk-and-listen, skip, abort/cleanup, figures and transcripts | `echo-twins` covers two staging cases; no lifecycle distinction tests. |
| `chronik/audio.ts`, `strings.ts` | Audible memory cues and German feedback | No direct unit tests on audio or registration. |
| `chronik/ui/card.ts`, `ui/sketch.ts`, `ui/textures.ts`, `ui/chronik.css` | Discoveries, sourced transcript, map sketch, readability and display on touch | `chronik` covers data; card, canvas and styles are browser concerns. |
| `chronik/world/gfx.ts`, `world/ghosts.ts`, `world/markers.ts`, `world/props.ts` | Ghost silhouettes, overlay effects, clue visibility and inspectable props | `echo-twins` checks silhouettes and `chronik` checks visibility rules; scene rendering and marker lifecycle remain browser gaps. |
| `scripts/validate-content.ts` | Recursive pack discovery, per-file parse diagnostics, bounds and combined gate result | `content`, `content-packs`, `story`, `rpg-contracts` cover validators and bundled data; no direct recursive discovery, mixed input or bounds-loading tests. |

## Follow-ups

- Decide whether fractional survival progress belongs in the save. Whole seconds currently
  survive a round-trip.
- Decide how the queue should handle an already playing sequence with more continuations than all
  six waiting slots.
- Run `pnpm validate` in an environment that permits the tsx IPC socket.
- Run the browser specs with one worker where preview can bind. The affected specs are `smoke`,
  `combat`, `story`, `touch`, `chapter-k2`, `stage-k2k4`, `chronik` and `quests` under `e2e/`.

## Closed (audit 2026-11-28)

Merged in PR #58. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
