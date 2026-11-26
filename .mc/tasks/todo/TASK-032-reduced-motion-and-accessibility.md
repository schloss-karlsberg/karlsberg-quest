---
id: TASK-032
aliases:
- TASK-032
title: Reduced motion and accessibility sweep
slug: reduced-motion-and-accessibility
status: in-progress
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
updated: 2026-11-26
---

# Reduced motion and accessibility sweep

## Goal

Reduce involuntary motion and flashing while preserving legible gameplay cues and touch controls. Make menus usable by keyboard and give interactive DOM controls German accessible names.

## Acceptance Criteria

- [x] Audit motion and flashing across `src/` and fix gaps or record large fixes in parallel-owned systems as follow-ups.
- [ ] Verify keyboard order and visible focus in the pause, settings, title and journal menus. The fixes and browser assertions are in place. Browser execution is blocked.
- [x] Give interactive controls accessible names.
- [ ] Cover new reduced-motion behavior with unit tests and pass all four gates.
- [ ] Run the touched browser specs and smoke on port 5420 when the sandbox allows it.
- [x] Document the accessibility rules and update the changelogs.

## Plan

Implement the requested sweep on `dev/task-032`. Inventory CSS, render and camera effects, and motion in UI and gameplay systems. Preserve essential world movement and input feedback. Prefer static cues, camera cuts and brief fades for presentation. Make local edits in shared files and record larger changes alongside the audit.

- [x] 1. Audit motion, flashing, and interactive DOM controls throughout `src/`.
- [x] 2. Fix motion gaps and add focused unit tests for new branches.
- [x] 3. Fix focus order, focus visibility and German accessible names. Add browser regression coverage.
- [x] 4. Update architecture, PRD and action-RPG documentation.
- [ ] 5. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`, then the touched spec and smoke separately under the shared lock on port 5420.
- [ ] 6. Record results and follow-ups, and commit locally.

## Progress

- Branch `dev/task-032`.
- Audited CSS keyframes and transitions, WebGL and canvas effects, camera writes and interpolation, animation controllers, programmatic scrolling, and interactive DOM creation across `src/`.
- Fixed presentation in boot, the camera rig, the spring scene and knockdown, indoor and outdoor HUDs, the map and survey marks, loot, combat, the lantern, and story and party set pieces. Existing motion policies cover cinematic stills, the era crossfade, static credits, body locomotion and player-controlled look. Natural terrain, water and foliage motion and gameplay telegraphs remain part of the world.
- Added menu focus wrapping and restoration, named dialog and icon controls, and selection focus on journal refresh. Unit tests cover the motion helpers, camera, lantern, survey markers, caches, mirror, chapter fading, torch and party set. Playwright checks title, settings, pause and Codex with the keyboard.
- `pnpm typecheck` and `pnpm build` passed. The unit summary was `Test Files  119 passed (119)` and `Tests  1584 passed (1584)`, with 0 failures.
- `pnpm validate` reached the `tsx` launcher, whose IPC listen failed with `EPERM`. `node --import tsx scripts/validate-content.ts` passed with the existing example-pack warning. `mc validate` passed.
- The sandbox rejected the Vite preview listener on `127.0.0.1:5420` with `EPERM` under the shared lock. Run these commands on a host where localhost listeners are allowed.

  ```sh
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/accessibility.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5420 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- The sandbox denied the worktree's `index.lock` during Git staging. The edits remain in the worktree. Intended commits are `fix(render): honor reduced motion across game effects` and `fix(ui): preserve keyboard focus and name controls`, each with `Co-Authored-By: Codex <noreply@openai.com>`.

## Follow-ups

- Share a live reduced-motion material preset with the palace and fire work. The existing low-motion flames, smoke, collapse geometry and effects need combined scene review for overlapping luminance changes.
- Coordinate authored tour rigs with the people and animals work. Review idle, gesture and spline layers together while keeping footsteps, gait and group timing aligned.
- Review the Quelle water reversal and mote shaders with the spring work so the still version communicates the same cue. The scripted camera turn and expanding ripple already use the setting.
- Review remaining combat and item shader feedback together with the combat work. Preserve gameplay tells while replacing close-range emissive pulses and movement in optional trails and aura layers.
- Run the keyboard and touch regressions and measure overlapping flashes on a browser host. The source review is complete and rendered frequency measurements are pending.

No voiced dialogue text needs to change.
