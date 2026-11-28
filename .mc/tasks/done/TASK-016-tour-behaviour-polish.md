---
id: TASK-016
aliases:
- TASK-016
title: Tour behaviour polish
slug: tour-behaviour-polish
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- tour
- camera
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Tour behaviour polish

## Goal

Resolve tour playtest findings 7, 9, 10, 11 and 18 on the current main baseline.

## Acceptance criteria

- [x] 7. The Wind shot shows both dogs, with a headless camera-frustum test.
- [x] 9. Stopped visitors turn toward Gerold, and he faces the player when addressing them. Reduced motion snaps the turns.
- [x] 10. Soft separation keeps the player clear of visitors and dogs and keeps dogs clear of visitors.
- [x] 11. The follow camera clears the Felsenpfad terrain and rocks, and the radio clears the player on desktop and phones.
- [x] 18. The first departure waits for the line or its muted subtitle, and the Felsenpfad group stops on the trail clear of boulders.
- [ ] Voiced text is preserved, the four gates pass, and the tour and smoke e2e specs are checked on port 5402 where the sandbox permits.

## Plan
_Status: approved 2026-11-26_

**Approach:** Trace the live tour at each affected beat, then adjust the shot, staging and dialogue timing at their existing entry points. Use the existing world collision and lightweight horizontal separation. Keep changes to shared content and UI limited to the affected lines and radio layout.

**Files to touch:**
- `src/systems/walk/`, `src/systems/animals/` and player movement for staging, facing and separation.
- `src/systems/cinematic/`, tour story and route content for camera framing and departure order.
- `src/player/camera.ts` and story radio styles for Felsenpfad visibility.
- Focused unit tests, the tour spec where appropriate, and tour design and changelog docs.

**Steps:**
- [x] 1. Trace the Wind shot and frame the dogs during the authored run.
- [x] 2. Turn the stopped group and guide, add soft separation and adjust Felsenpfad slots.
- [x] 3. Reuse world collision for the third-person camera and reposition the radio.
- [x] 4. Tie the first departure to dialogue completion and preserve voiced text.
- [x] 5. Verify the available checks and update the behaviour docs.

**Test plan:** Run focused Vitest tests and `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run `e2e/tour-slice.spec.ts` and `e2e/smoke.spec.ts` separately under the heavy lock on port 5402. Check the Wind camera at the run keyframes and the Felsenpfad stop from desktop and phone viewpoints.

**Risks:** Terrain heights and crowd placement affect sightlines and escape routes. A dialogue wait must also complete with muted audio, skipping and a resumed save.

**Open questions:** None.

## Review fix round

**Goal:** Resolve the seven review findings on `dev/task-016` while preserving the recorded dialogue and tour flow.

**Acceptance criteria:**

- [x] A player blocking Diane's waypoint cannot stall either dog's return through the crowd.
- [x] The final outdoor camera sweep pulls in immediately and releases smoothly after a ridge clears.
- [x] Loading during the departure line replays it. Loading after departure preserves the group's progress.
- [x] Player and dog collision share visitor circles and resample height only after a visitor moves.
- [x] A muted recorded line types out without creating audio sources.
- [x] The departure e2e holds the line beyond the old estimate before asserting that the guide walks.
- [x] The phone e2e checks the portrait rotate prompt and visible, tappable dialogue in gameplay.
- [x] Regression tests and all four gate commands were checked. Both Playwright specs were attempted under the lock.

**Plan:**

- [x] Fix dog waypoint progression and share visitor collision data, with runtime regressions.
- [x] Carry the final camera sweep into release smoothing and extend the ridge test.
- [x] Persist departure completion, restore unfinished playback and cover mute and saved progress.
- [x] Strengthen the tour e2e, update the behaviour docs and run the gates and locked specs.

## Progress

- Branch: `dev/task-016` at `07d3c97`.
- 2026-11-26. Checked the branch against `origin/main`. The five findings applied. The old
  Felsenpfad warning was already replaced by the voiced „Bleibt bitte auf dem Weg.“.
- 2026-11-26. Checked both dogs against the Wind frustum over the whole run in landscape and
  portrait, with additional terrain sightline checks.
- 2026-11-26. Checked the facing, separation and saved gathering poses with unit tests.
  Placed all fourteen Felsenpfad slots on the path raster outside the scenery solids. The nearest
  generated tree is 5.52 m from a slot.
- 2026-11-26. Added a camera regression for rock crossing the shoulder sightline and moved the
  radio and Felsenpfad captions to the upper band.
- 2026-11-26. Checked the departure wait and the muted-audio fallback. Compared all 50 tour
  `say` actions to `origin/main` and confirmed their IDs and text match.
- 2026-11-26. `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  119 passed (119)` and `Tests  1582 passed (1582)`, with 0 failures.
- 2026-11-26. The sandbox blocked the IPC socket for the `pnpm validate` launcher.
  `node --import tsx scripts/validate-content.ts` ran the same validator successfully and
  reported `✓ content valid (1 warning(s))`. The warning is in the example pack.
- 2026-11-26. Both locked Playwright commands stopped before browser launch. The sandbox rejected
  Vite's bind to `127.0.0.1:5402` with `EPERM`.
- 2026-11-26. The original tour changes landed in local commits `69cccb7` and `05b3249`.
- 2026-11-26. `origin/main` advanced to `d2d1f48` during the task. Its chestnut recordings
  and landscape level-card work do not overlap any edited file.
- 2026-11-26 review. Both dogs returned before timeout with the player at Diane's waypoint and a
  visitor at Bijou's. Collision callers share visitor circles and resample moved visitors.
- 2026-11-26 review. A 0.17° turn past the test ridge releases the final camera sweep gradually.
- 2026-11-26 review. The saved walk destination distinguishes an unfinished departure from a walk
  in progress. The walk system restores its saved route before the story reissues walk commands.
  Muted recorded subtitles create no audio sources while typing.
- 2026-11-26 review. Tour Playwright now holds the departure line for seven game seconds before
  advancing it, and checks the portrait rotate prompt and landscape dialogue hit-testing.
- 2026-11-26 review. `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  119 passed (119)` and `Tests  1587 passed (1587)`, with zero failures. All 45 voiced
  tour actions match `origin/main`. `mc validate` passed.
- 2026-11-26 review. The sandbox blocked `pnpm validate` at the tsx IPC socket. The direct validator
  returned `✓ content valid (1 warning(s))` for the existing example-pack warning. The two locked
  Playwright commands stopped before browser launch because Vite could not bind `127.0.0.1:5402`.

## Follow-ups

- Run the verification commands on a host that permits the validator's IPC socket and Playwright's
  preview listener. Inspect the Wind shot in the rendered scene and the Felsenpfad card on phones.

```sh
pnpm validate
KQ_E2E_PORT=5402 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5402 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

## Closed (audit 2026-11-28)

Merged in PR #101 (together with TASK-022). The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
