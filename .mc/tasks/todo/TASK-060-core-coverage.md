---
id: TASK-060
aliases:
- TASK-060
title: 'Test coverage and bug sweep: core, debug flags, i18n and data'
slug: core-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- core
- i18n
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Core behaviour and regression coverage

## Goal

Identify untested player-visible contracts in core, debug URL flags, German string lookup and world data loading. Fix defects reproduced by focused tests.

## Acceptance criteria

- [x] Map each module to its player contract and existing tests.
- [x] Add at least 25 meaningful deterministic assertions across the area. Run the focused set in about three seconds or less.
- [x] Reproduce each defect before changing behaviour. Keep the six fixes minimal and record the catalog retention question as an `it.todo`.
- [ ] Commit each initial sweep fix separately. The sweep was committed as one group in `dae7d38`. Each review fix has its own commit.
- [x] Document behaviour changes and update the PRD changelog.
- [ ] Pass all four gates as written. Typecheck, unit tests and build passed. All four commands were run. The validator CLI was sandbox-blocked.
- [x] Run the locked smoke spec on port 5447 if supported, or identify the human-run command.

## Plan

_Based on the implementation brief of 2026-11-26._

- [x] Trace the modules and their consumers, then search existing tests by module and exported symbol.
- [x] Test uncovered event, state, settings, flag, translation and data contracts using fixed inputs and isolated stores.
- [x] Reproduce any defects, fix them individually and run their regression tests.
- [x] Update the relevant docs, check the focused duration, run the four gates and attempt the locked smoke spec.
- [x] Record results, remaining questions and follow-ups here.

## Progress

The initial sweep is in `dae7d38` on `dev/task-060`, based on `79c57184e15f1bd583943ac56fe43432ef28c922`. Save recovery, save ordering and the gameplay areas assigned to parallel sessions are outside this sweep.

## Review fixes (2026-11-26)

Keep look input responsive when shared links supply very large headings, and make the i18n suite repeatable with coverage of the feature controls shown in game.

- [x] Wrap finite URL yaw in degrees before converting to radians and add a regression case for a very large yaw.
- [x] Load a fresh i18n module for each stateful test and verify the suite with `--repeats 1`.
- [x] Exercise the photo, notes and skills registrations, assert their control IDs are present, and check both strings for every control.
- [x] Update the shared-link documentation and PRD changelog, run the four gate commands and check whether the sandbox allows the locked smoke spec.
- [x] Commit the fixes separately and record the outcome of every finding.

| Finding | Outcome |
| --- | --- |
| 1. Very large shared URL yaw | Fixed in `7220c70`. `origin/main` could overflow during conversion, and the initial sweep accepted a huge finite heading. The parser now wraps degrees first. The `1e308` and `-450` regressions both failed before the fix. |
| 2. i18n test state leaks across repeats | Fixed in `2915e7b`. The repeat run reproduced both failures. Each test now dynamically imports i18n after a module reset, and the repeat run passes. |
| 3. Missing feature coverage in the controls test | Fixed in `5355f12`. The test runs the actual photo, notes and skills initializers, then checks their five IDs and every control's label and description. Temporarily removing `ui.keys.photo.key` or the notes control registration made the test fail. |

## Coverage inventory

The baseline is `79c5718`. Test names below refer to files in `tests/`. The inventory includes indirect coverage where callers exercise the module.

| Module | Player or testing contract | Existing unit coverage and gaps |
| --- | --- | --- |
| core/events | Era, pause and reward listeners run synchronously in registration order. A listener can unsubscribe or subscribe once. | `core` checks delivery, unsubscribe between emissions and named listener failures. Nested delivery, in-flight subscription changes and failure in an all-event observer lack coverage. |
| core/state | Fresh games own their inventory and flags. Updates notify after mutation. Replacing the state on load redirects live slices and subscribers. | `core` checks JSON migrations and lazy slices. `tour-handover` checks old saves. Subscriber reasons, disposal and slice ownership across replacement are gaps. |
| core/save | Settings merge saved overrides onto defaults and migrate bindings. Disabled storage allows play. Save slots preserve progress. | `core` and `perf-settings` cover persistence, partial volume settings, survey remaps and frame caps. Add settings cases for saved zero, false, unbound actions and OS preferences. Save recovery and ordering belong to another task. |
| core/loop | Pause and bullet time suspend simulation. Resuming, manual steps and frame requests control simulated and visual time separately. | `core` and `pilot` cover stepping, stalls, render caps and parking. Test resuming after a pause with fixed frame times. |
| core/bullet | Manual mode, WebDriver and the idle flag determine which clock advances visual effects. | `pilot` tests the pure truth table and skipped waits. The URL and navigator adapter lacks a direct test. |
| core/era | Each valid era selects terrain, palace, flight/night rules and a translated HUD label. Invalid era overrides are ignored. | `world`, `camera` and the shift suites exercise individual eras indirectly. Check the full set of runtime label keys. |
| core/systems | Dependencies precede consumers, failed systems are isolated, lazy registration and reverse disposal preserve order. | `core` tests sorting, cycles and a failed update. Registry consistency after a rejected registration is untested. |
| core/context | Typed access to pause, era, camera, event and persistence services. | Interfaces only. Their implementations are exercised by feature suites. |
| core/quiet | Overlapping quiet reasons hide markers until the last release. Disposal detaches the listener. | `world-quiet` covers overlapping reasons, disposal and resuming survey activation. |
| core/legacy-prologue | Loading an old prologue settles rewards once, clears retired objectives and restores minimum equipment and skills. | `tour-handover` covers payout, reloading, handover and retained progress. |
| core/legacy-prologue-quests | Retired quest data supplies historical payouts and log entries during migration. | `quests-content-a` and `tour-handover` cover definitions and payouts. |
| debug/hooks and boot URL consumers | Shared links can override the starting era and pose. Debug, perf, idle and manual flags enable their respective aids. | `render-tiers`, `pilot` and `nanWatch` cover individual policies. Boot parses coordinates inline. Empty, incomplete and non-finite inputs are untested. |
| debug/nanWatch | Debug/WebDriver enables scene diagnostics. | `nanWatch` covers activation, scanning and deactivation. |
| debug/pilot | Bullet-time input and observations reflect the simulation state. | `pilot` covers deterministic steps, controls and observations. |
| debug/panel | Debug mode displays current position, era and system stats. | Browser presentation with no separate URL parser or direct unit test. |
| debug/perfHud | Perf flag or saved preference shows timings. F3 toggles the overlay. | `perf-settings` tests underlying statistics. Overlay presentation has no direct unit test. |
| debug/bench | Benchmark steps through scene presets, restores the view and reports frame timings. | GPU/browser path with no separate URL parser or direct unit test. |
| i18n/index | Missing keys warn once and echo the key. Features register and override strings. Interpolation preserves unspecified placeholders. | Some feature suites call `t` and `rpg-contracts` checks combat keys. No direct coverage of lookup, warning deduplication or interpolation. |
| i18n/de | Boot, controls and the HUD resolve German labels including keys built from era and action IDs. | `perf-settings` checks rebindable actions have defaults. Their dynamic translation keys are untested. |
| i18n/de.content | The content-bible table supplies UI templates, key help and count placeholders. Features choose singular/plural forms where needed. | No dedicated catalog tests. Literal-reference audit found legacy tutorial text without a runtime consumer, e.g. `ui.tut.fill`. Dynamic keys and retained bible text make deletion by grep unreliable. |
| data/decode | Recover both eras' quantised heights and metric canopy values, and undo surface row deltas. Reject incorrect raster sizes. | `world` and `terrain-detail` exercise genuine rasters, signed deltas and whole-sample size mismatches. Odd offsets, incomplete final samples and extreme values are gaps. |
| data/loader | Load rasters and catalogues relative to the deployment, report progress, defer optional detail, stop reporting after failure. | `loader` and `terrain-detail` cover file-count progress, HTTP errors and optional rasters. Boot data assembly from distinct layer values lacks a small fixture. |
| data/types | Historical ground classes map to the common surface vocabulary used by movement and footsteps. | `world` covers ground lookup. The mapping of individual historic classes is indirect. |

## Reproduced defects

Each regression below failed before the corresponding behaviour change and passed afterwards.

| Area | Failure before the fix | Result |
| --- | --- | --- |
| Events | A throwing `onAny` handler escaped `emit` and prevented the next gameplay observer from receiving the era change. | Log each observer failure and continue dispatch. |
| System registry | After rejecting a dependency cycle, `get` returned the rejected system and a corrected registration under the same ID was refused. | Validate the new order before publishing the entry. |
| Shared URL flags | The original boot conversion passed zero for blank fields and NaN or infinity for malformed coordinates or yaw. | Require two finite coordinates before teleporting. A valid pair still works with an omitted or invalid heading. |
| i18n lookup | `hasString('toString')` reported a translation for an unregistered key. Inherited properties could also replace omitted placeholders. | Resolve strings from a dictionary without inherited keys and interpolate supplied parameter properties only. |
| Height decoding | Both era decoders accepted a three-byte buffer as one complete 16-bit sample, silently discarding the trailing byte. | Reject incomplete samples before constructing the typed view. |
| Terrain loading | A two-cell world loaded with only one ground or canopy cell. | Require one byte per grid cell in each layer. The existing progress fixture now encodes the declared one-cell grid. |

Settings defaults, remap migration, snapshot replacement, pause/resume, key help and hunt singular/plural templates passed against their existing implementations. Seven new test files have 83 assertion sites before counting parameterized cases and loops.

## Initial sweep verification

```text
Focused Vitest   Test Files  7 passed (7)
                 Tests  34 passed | 1 todo (35)
                 Duration  135ms
pnpm typecheck   $ tsc --noEmit (exit 0)
pnpm test        Test Files  131 passed (131)
                 Tests  1639 passed | 2 todo (1641)
pnpm validate    listen EPERM on the tsx IPC socket (exit 1)
node --import tsx scripts/validate-content.ts
                 ✓ content valid (1 warning(s)) (exit 0)
pnpm build       ✓ 470 modules transformed.
                 ✓ built in 640ms
```

Both unit runs had 0 failed. Smoke entered the shared lock queue. An independent bind check on `127.0.0.1:5447` returned `listen EPERM`, so the queued job was withdrawn before browser startup. No e2e specs changed. No voiced lines need new text.

## Review verification

```text
Focused Vitest   Test Files  2 passed (2)
with --repeats 1 Tests  22 passed | 1 todo (23)
pnpm typecheck   $ tsc --noEmit (exit 0)
pnpm test        Test Files  131 passed (131)
                 Tests  1642 passed | 2 todo (1644)
pnpm validate    listen EPERM on the tsx IPC socket (exit 1)
node --import tsx scripts/validate-content.ts
                 ✓ content valid (1 warning(s)) (exit 0)
pnpm build       ✓ 470 modules transformed.
                 ✓ built in 316ms
```

Both unit runs had 0 failed. The sandbox denied binding the smoke preview port with `listen EPERM`. No e2e specs changed. No voiced lines need new text.

## Follow-ups

- Run `pnpm validate` outside the sandbox and run the smoke spec with the shared lock.
- Decide whether to retain unused content-bible tutorial strings such as `ui.tut.fill`. Recorded as `it.todo` in `tests/i18n.test.ts`.
- The German-text session should restore the existing echo date label. `StoryRuntime.echoDate` still requests `story.echo.date`. Commit `5af21ce` removed the registration `Erinnerung · {when}`. This is an on-screen label.

```sh
KQ_E2E_PORT=5447 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```
