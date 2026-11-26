---
id: TASK-017
aliases:
- TASK-017
title: Photo mode polish
slug: photo-mode-polish
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- photo
- ui
- tour
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Photo mode polish

## Description

Resolve findings 12 and 13 in `docs/NEXT-SESSION.md` §7.2. Clear gameplay overlays from the phone
view and make the tour's deer photo achievable by crouching at a natural distance.

## Acceptance Criteria

- [x] Only the phone camera UI shows in photo mode on desktop and touch. Exiting restores gameplay overlays.
- [x] The doe has a clear idle spot and a good 2× shot is possible at about 20–25 m.
- [x] Standing and running near the deer raise suspicion faster than crouching. Document the tuning.
- [x] The existing voiced reaction follows `photo:good.state` and the crouch prompt uses the shared action label.
- [x] Scoring and HUD visibility have unit coverage.
- [ ] Verify all four gates as written and run the browser specs. See sandbox limits below.
- [x] Inline lantern choices lower the phone and keep it down until resolution.
- [x] Gerold's good-photo reaction is presented with the viewfinder down.
- [x] Measuring UI and NPC glyphs disappear during photo mode and return on exit.
- [x] Continuing t10 places the objective at the restored doe.
- [x] A paired shot beyond 27 m can pass after 90 s at 95° and 2× zoom. Out-of-range shots skip sight rays.
- [x] The manual tour test explicitly advances render frames to settle zoom.

## Plan

**Approach:** Use photo mode as the source of truth for gameplay overlay visibility. Tune deer
framing and detection and update the tour's photo condition and crouch prompt.

**Files to touch:** Photo and animal systems, overlay integration, tour story data, focused tests,
and the tour design and changelog docs.

**Steps:**

- [x] Wire overlay visibility for phone mode and cover entry, exit and touch in tests.
- [x] Tune deer placement, scoring and alert behaviour. Update the tour condition and prompt.
- [x] Cover the new framing distance in the tour regression, document the tuning and run available verification.

**Test plan:** Run focused Vitest tests, then typecheck, test, validate and build. Run the photo,
animals, tour-slice and smoke specs under the shared lock, one at a time on port 5403. Include
touch checks for the camera overlays and crouch label.

**Risks:** Keep overlay ownership compatible with other feature states. Check the new doe location
against the boulder and the approach in the real scene.

**Open questions:** None.

### Review fix round (2026-11-26)

Resolve the seven review findings on `dev/task-017`. Coordinate story presentation with the phone,
extend the viewfinder selectors, use the restored doe for the resumed objective, and verify fallback
framing and distance checks with shipped targets.

- [x] Fix choice and reaction presentation and cover them in unit tests.
- [x] Cover the measuring tool, NPC glyphs and t10 save compatibility.
- [x] Tune fallback framing, skip out-of-range sight rays and drive manual zoom frames.
- [x] Update design docs and changelogs.
- [x] Run the gates and check browser availability under the shared lock. See Progress for the
  launcher and preview server results.
- [ ] Commit the remaining scoring, documentation and test updates on `dev/task-017`.

## Progress

- Branch: `dev/task-017`
- 2026-11-26: The shared photo flag hides HUD overlays, and marker roots follow the phone events.
  Five focused unit tests passed. The sandbox denied binding port 5403 (`EPERM`).
- 2026-11-26: Moved the idle pair to 698/−773. A headless check of the shipped terrain, trunks
  and prop placement found all five sight samples clear for both deer at the tested route-side
  positions of 20, 23 and 25 m horizontally. The new path to the pair clears the nearby rock's
  placement. Rendering and touch layout still need browser verification.
- 2026-11-26: Typecheck and production build passed. Vitest reported `Tests  1579 passed (1579)`.
  The sandbox denied the local socket used by the `pnpm validate` launcher. Running the same
  script with `node --import tsx scripts/validate-content.ts` reported valid content with one
  existing example-pack warning. All 50 tour `say` texts match the baseline.
- 2026-11-26: The original HUD change is in `72bb0da` and the original deer and tour tuning is
  in `ab87429`.
- 2026-11-26: Implemented all seven review findings with focused regressions. The overlay
  omissions and unnecessary out-of-range sight sampling also existed on main and were small
  fixes within the viewfinder scope. All 50 tour `say` IDs and texts match the pre-review branch.
- 2026-11-26: Typecheck and production build passed. Vitest reported `Tests  1590 passed (1590)`
  with zero failures across 119 files. The `pnpm validate` launcher hit `EPERM` opening its IPC
  socket. `node --import tsx scripts/validate-content.ts` returned `✓ content valid (1 warning(s))`
  with the existing example-pack warning.
- 2026-11-26: Playwright collected the photo, tour-slice and smoke specs. Execution was skipped
  after the locked photo run hit `EPERM` binding the preview server to `127.0.0.1:5403`.
- 2026-11-26: Story, save compatibility and overlay fixes committed as `1380a93`. Git denied
  the worktree's `index.lock` when staging the scoring, render-clock test and verification updates.
  These changes are in the worktree.

## Follow-ups

- On a host with local sockets, run `pnpm validate` and the photo, tour-slice and smoke specs under
  the shared lock on port 5403. The original tuning still has a pending check in
  `e2e/animals.spec.ts`. Check the deer framing visually on Mittel or Hoch.
- Confirm the minimap hides once TASK-015 is available on the same branch.
- Commit the remaining worktree changes as
  `fix(camera): make timed deer framing work at wide field of view` with the Codex co-author trailer.
