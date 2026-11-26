---
id: TASK-055
aliases:
- TASK-055
title: 'Test coverage and bug sweep: Cinematics and set pieces'
slug: cinematics-set-pieces-tests
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- cinematics
- court
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Cinematics and set pieces

## Goal

Map player-facing contracts in cinematic playback, court, the chapter-one court
bridge, Bleiche layout and cinematic assets. Add deterministic coverage and fix
the in-scope defects that the tests demonstrate.

## Acceptance criteria

- [x] Record player-facing behaviour, existing unit coverage and gaps by module.
- [x] Add at least 25 meaningful assertions across the area in about three seconds or less.
- [ ] Reproduce each confirmed bug before editing production code, commit each fix separately,
  and record unresolved design choices as test todos.
- [x] Document behaviour changes, add a PRD changelog row and document any new test helper.
- [x] Run typecheck, unit tests with zero failures, content validation and the production build.
  The validator entry point passed with Node's loader after the package command was sandbox-blocked.
- [x] Run touched Playwright specs and smoke separately behind the machine lock on port 5442,
  or record the sandbox blocker and specs to run.

## Plan

**Approach:** Trace player input, pause, save, restore, camera ownership and era
transitions from system registration through the existing contracts. Drive systems
with explicit simulation steps and small fixtures. Leave parallel-task areas alone.

**Files to touch:** Targeted tests in `tests/`, the in-scope modules implicated by
confirmed failures, this inventory and the related architecture and design docs.

**Steps:**

- [x] Inventory the modules and existing tests.
- [x] Add focused tests and record the failures before editing production code.
- [x] Fix confirmed defects and update the affected docs.
- [ ] Record separate commits for the regressions and fixes.
- [x] Run the focused suite and four gates, and check browser availability.

**Test plan:** Run targeted Vitest files together, then `pnpm typecheck`,
`pnpm test`, `pnpm validate` and `pnpm build`. Attempt the locked smoke spec
and any touched specs with `KQ_E2E_PORT=5442`.

**Risks:** Shared save, camera, story, tour and accessibility surfaces have parallel
owners. Exercise their boundaries through the in-scope systems.

**Open questions:** Record ambiguous player behaviour during the sweep.

## Progress

- Branch: `dev/task-055`.
- 2026-11-26: The initial cinematic, court, Bleiche and disguise suites passed (61 tests).
  The inventory below identifies gaps in the player-facing integrations.
- 2026-11-26: The focused run against unchanged production code had 105 passing tests,
  five regression failures and two design todos. The camera restored the in-progress hand-back FOV
  (46° instead of 70°), a held autosave on cinematic disposal retained the old shot ID, and a court
  escort still owned movement after load, era change or disposal.
- 2026-11-26: A loopback bind on port 5442 failed with `listen EPERM`, so browser runs require an
  environment that permits the preview server. Playwright listed 13 tests across
  `cinematic.spec.ts`, `court.spec.ts` and `smoke.spec.ts`.
- 2026-11-26: All five regressions passed after the three fixes. The focused run passed 110 tests
  with two design todos in 205 ms.
- 2026-11-26: Git staging was denied when creating the worktree's `index.lock`. Changes remain
  in the worktree for separate commits in a writable session.
- 2026-11-26: `pnpm typecheck`, `pnpm test` and `pnpm build` passed. The full run reported
  `Test Files  125 passed (125)` and `Tests  1625 passed | 3 todo (1628)` with zero failures.
  `pnpm validate` failed to open the runner's IPC socket (`listen EPERM`).
  `node --import tsx scripts/validate-content.ts` reported `✓ 1 cinematic file(s)` and
  `✓ content valid (1 warning(s))`. MissionControl validation passed.

## Follow-ups

- Decide whether Continue should resume or skip a cinematic suspended by returning to the title.
  Recorded as a todo in `cinematic-system.test.ts`.
- Decide which set piece takes precedence when a court escort overlaps a cinematic.
  Recorded as a todo in `court-system.test.ts`.
- Run each listed browser spec separately with
  `KQ_E2E_PORT=5442 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/<spec>.spec.ts --workers=1 --reporter=line`.

### Intended commits

Use `Co-Authored-By: Codex <noreply@openai.com>` as the trailer on each commit.

1. `test(story): cover cinematic and court set piece contracts` for the passing-on-main coverage,
   including Bleiche geometry, and its DOM fixture.
2. `fix(camera): restore gameplay field of view after consecutive cinematics` for
   `takeover.ts`, its focused regression and the cinematic browser extension.
3. `fix(story): clear the cinematic marker before releasing the autosave hold` for
   `cinematic/index.ts` and its disposal regression.
4. `fix(story): release interrupted court escorts` for `court/index.ts`, the interrupted escort
   regressions and the court browser extension.
5. `docs(story): document cinematic and court set piece regressions` for the task inventory and
   the architecture, design and changelog updates.

## Coverage inventory

| Module | Player-facing contract | Existing coverage and gaps |
| --- | --- | --- |
| `cinematic/index.ts` | Play a file, inline shot or orbit. Freeze move and look by default. Pause with menus, skip after the grace interval, and signal completion on every gameplay exit. Keep captions, defer cards and autosaves, skip an unfinished shot on reload, and restore the world's look if the era still matches. | `cinematic-system.test.ts` covers start, natural end, direct skip, stop, replacement, reduced motion, life/era events, basic save/restore and the debug seek. Gaps include registered key/touch input, paused frames, mixed in-flight and saved IDs, cleanup state and exceptional exits. |
| `cinematic/takeover.ts` | Give the rig back its framing and restore the player's previous input flags and view. Ease normal hand-back and cut for reduced motion. Refuse another owner and recover from broken shots. | `cinematic-system.test.ts` covers one hand-back, slot notifications, avatar, exclusive owner/title and non-finite poses. Gaps include consecutive shots sharing a hand-back, throwing shots and prior input locks. |
| `cinematic/keys.ts`, `types.ts` | Validate a request shape, inherit omitted fields, sample camera pose and fog/sun/dark, follow finite targets, support stills and reverse orbits. These shots give no direct rewards. | `cinematic-keys.test.ts` covers validation, interpolation, snapshot eyes, held aim, orbit, yaw wrapping and stills. `story.test.ts` covers dispatch/waits. Gaps include file discovery and live targets below. |
| `cinematic/data.ts`, `validate-cli.ts`, `content/cinematics/reh.json` | The shipped reference resolves by filename and frames the fawn first, then the doe, with the fawn zoom held. The content gate uses the same normalization. | The existing tests import the JSON directly and assert length, valid shape and FOV. The build-time catalog and the two look targets lack an end-to-end unit check. Validator changes belong to the parallel validator task. |
| `cinematic/targets.ts` | Keep aiming at a moving target, fall back when it is lost, and let a new registration take over even if the old one unregisters later. | `animals-system.test.ts` exercises registration via animals. Replacement, stale unsubscribe and a failing getter lack direct coverage. |
| `cinematic/cinematic.css` | Letterbox and hint hide the HUD and touch controls while leaving subtitles accessible. Reduced motion removes the HUD transitions. | `e2e/cinematic.spec.ts` checks HUD visibility. Unit coverage can check the DOM lifecycle and fade values. Rendering and accessibility styling belong to the browser and adjacent tasks. |
| `court/index.ts` | Activate matching watchers, build and reset suspicion, hold E to show the letter, refuse or admit and open the gate, escort without loss, show the first hint once, and persist sets and earned flags. A switch or reload resets transient state and reapplies costume. | `court.test.ts` covers pure rules. `e2e/court.spec.ts` covers ordinary inspection, escort, costume and travel. Gaps include transient locks on interruptions, saved sets/flags and the actual inspection event sequence in unit tests. |
| `court/logic.ts`, `zones.ts` | Run, staff, vest and visible pickups raise bounded suspicion. Decay and hysteresis allow recovery. Only designated eras and spaces count. Gate admission softens the rate and the escort lands outside. | `court.test.ts` covers tells, stages, bounds, rate modifiers, inspection outcomes, costume, fan geometry and gate membership. Runtime reset and admission still need unit coverage. |
| `court/props.ts` | Render an upright pike in the guard's hand when rigged or beside the procedural figure on low. | `bleiche.test.ts` covers pike geometry. `court.test.ts` covers the low-tier prop. Rig placement is independent of the exit and persistence sweep. |
| `court/strings.ts`, `court/court.css`, `court-k1/index.ts` | Show readable German prompts, suspicion cues and the hint. Chapter-one overrides provide the inspection and escort lines, with escort variants driven by the saved count. | `k1-disguise.test.ts` checks the overrides and quest rewards. `e2e/court.spec.ts` checks the live meter and captions. The saved-count wrap and real caption selection lack unit checks. |
| `bleiche/layout.ts` | Keep the laundry clear of the brook and the coat reachable. Rope ends sit on their posts across uneven terrain. Grass is removed beneath linen and props. This layout awards nothing. | `bleiche.test.ts` and `quelle.test.ts` cover positions, real terrain, clearings, visibility and era. `k1-disguise.test.ts` covers coat access/rewards. Gaps include rope bounds, continuity at posts, slope interpolation and bare-ground coverage. |
