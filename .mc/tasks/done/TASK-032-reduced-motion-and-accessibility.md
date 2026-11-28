---
id: TASK-032
aliases:
- TASK-032
title: Reduced motion and accessibility sweep
slug: reduced-motion-and-accessibility
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- accessibility
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Reduced motion and accessibility sweep

## Goal

Reduce involuntary motion and flashing while preserving legible gameplay cues and touch controls. Make menus usable by keyboard and give interactive DOM controls German accessible names.

## Acceptance Criteria

- [x] Audit motion and flashing across `src/` and fix gaps or record large fixes in parallel-owned systems as follow-ups.
- [ ] Verify keyboard order and visible focus in the pause, settings, title and journal menus. The fixes and browser assertions are in place. Browser execution is blocked.
- [x] Give interactive controls accessible names.
- [x] Cover new reduced-motion behavior with unit tests.
- [ ] Pass all four gate commands. Typecheck, tests and build passed. The validation launcher was blocked and the same validator passed when invoked directly.
- [ ] Run the touched browser specs and smoke on port 5420 when the sandbox allows it.
- [x] Document the accessibility rules and update the changelogs.
- [x] Resolve all nine review findings and add unit regressions for each fix.

## Plan

Implement the requested sweep on `dev/task-032`. Inventory CSS, render and camera effects, and motion in UI and gameplay systems. Preserve essential world movement and input feedback. Prefer static cues, camera cuts and brief fades for presentation. Make local edits in shared files and record larger changes alongside the audit.

- [x] 1. Audit motion, flashing, and interactive DOM controls throughout `src/`.
- [x] 2. Fix motion gaps and add focused unit tests for new branches.
- [x] 3. Fix focus order, focus visibility and German accessible names. Add browser regression coverage.
- [x] 4. Update architecture, PRD and action-RPG documentation.
- [ ] 5. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`, then the touched spec and smoke separately under the shared lock on port 5420.
- [ ] 6. Record results and follow-ups, and commit locally.

### Review fix round

- [x] Stabilize reduced-motion camera clearance and restore the OS preference for both credits paths.
- [x] Keep static cues for the torch, reflected Bannlicht, and fireworks. Freeze survey, loot, and party lights while preserving gameplay timing.
- [x] Keep reading dialogs at the top and route inline pilot choices through the story API.
- [x] Run regression tests and the four gate commands, attempt browser verification, update the docs, and record results.
- [ ] Commit locally. The sandbox denied Git's worktree index lock.

## Progress

- Branch `dev/task-032`.
- The initial sweep is committed at `e081b3b`.
- Audited CSS keyframes and transitions, WebGL and canvas effects, camera writes and interpolation, animation controllers, programmatic scrolling, and interactive DOM creation across `src/`.
- Fixed presentation in boot, the camera rig, the spring scene and knockdown, indoor and outdoor HUDs, the map and survey marks, loot, combat, the lantern, and story and party set pieces. Existing motion policies cover cinematic stills, the era crossfade, static credits, body locomotion and player-controlled look. Natural terrain, water and foliage motion and gameplay telegraphs remain part of the world.
- Added menu focus wrapping and restoration, named dialog and icon controls, and selection focus on journal refresh. Unit tests cover the motion helpers, camera, lantern, survey markers, caches, mirror, chapter fading, torch and party set. Playwright checks title, settings, pause and Codex with the keyboard.

### Review results (2026-11-26)

1. Fixed camera pumping. The boom still retracts immediately and tests the extended shoulder path before cutting outward. A 60-frame stationary corner regression also checks recovery after the obstruction clears.
2. Fixed both credits paths for returning players. The in-game setting or the OS preference selects the static list.
3. Fixed the chapter-three torch. Window ignition still advances on the story clock. The panes hold their flicker phase and skip ignition spikes in reduced motion.
4. Fixed reflected Bannlicht. A brief steady beam identifies the mirror and the HUD shows „Geblendet“ for the debuff's duration.
5. Fixed the initial focus in reading-only dialogs. „Neuigkeiten“ opens at the top of the notes.
6. Fixed the fireworks echo. Reduced motion skips spark, trail and smoke work, keeps the phase and shell audio schedules, and shows a stationary light during darkness.
7. Fixed survey beam bands and loot rotation. Activation and collection timers continue to run.
8. Fixed party fire-bowl glow flicker. Unit tests exercise the flame and glow at multiple nonzero world times.
9. Fixed the playtest pilot. It resolves the inline gate choice through the story API and returns the label after acceptance.

- `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported `Test Files  121 passed (121)` and `Tests  1593 passed (1593)`, with 0 failures.
- `pnpm validate` reached the `tsx` launcher, whose IPC listen failed with `EPERM`. `node --import tsx scripts/validate-content.ts` passed with `✓ content valid (1 warning(s))`. `mc validate` passed.
- The sandbox rejected the Vite preview listener on `127.0.0.1:5420` with `EPERM` during the locked accessibility spec run. Run each spec below on a host that permits localhost listeners.

  ```sh
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/accessibility.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/party.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/pilot.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/story.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- Git staging succeeded for the camera changes. `git commit` could not create the worktree's `index.lock`. The edits remain in the worktree. The intended commits are `fix(camera): verify clearance before extending the reduced-motion boom`, `fix(render): keep reduced-motion gameplay cues steady`, and `fix(ui): restore static credits and accessible story controls`, each with `Co-Authored-By: Codex <noreply@openai.com>`.

## Follow-ups

- Run the remaining browser checks and `pnpm validate` on a host that permits the preview and `tsx` listeners, then commit the review fixes locally.
- Share a live reduced-motion material preset with the palace and fire work. The existing low-motion flames, smoke, collapse geometry and effects need combined scene review for overlapping luminance changes.
- Coordinate authored tour rigs with the people and animals work. Review idle, gesture and spline layers together while keeping footsteps, gait and group timing aligned.
- Review the Quelle water reversal and mote shaders with the spring work so the still version communicates the same cue. The scripted camera turn and expanding ripple already use the setting.
- Review remaining combat and item shader feedback together with the combat work. Preserve gameplay tells while replacing close-range emissive pulses and movement in optional trails and aura layers.
- Run the keyboard and touch regressions and measure overlapping flashes on a browser host. The source review is complete and rendered frequency measurements are pending.

No voiced dialogue text needs to change.

## Closed (audit 2026-11-28)

Merged in PR #87. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
