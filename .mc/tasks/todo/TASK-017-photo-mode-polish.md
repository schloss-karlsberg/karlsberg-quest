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

- [ ] Only the phone camera UI shows in photo mode on desktop and touch. Exiting restores gameplay overlays.
- [ ] The doe has a clear idle spot and a good 2× shot is possible at about 20–25 m.
- [ ] Standing and running near the deer raise suspicion faster than crouching. Document the tuning.
- [ ] The existing voiced reaction follows `photo:good.state` and the crouch prompt uses the shared action label.
- [ ] Scoring and HUD visibility have unit coverage. All four gates and the photo, tour and smoke specs pass if runnable.

## Plan

**Approach:** Use photo mode as the source of truth for gameplay overlay visibility. Tune deer
framing and detection and update the tour's photo condition and crouch prompt.

**Files to touch:** Photo and animal systems, overlay integration, tour story data, focused tests,
and the tour design and changelog docs.

**Steps:**

- [x] Wire overlay visibility for phone mode and cover entry, exit and touch in tests.
- [ ] Tune deer placement, scoring and alert behaviour. Update the tour condition and prompt.
- [ ] Exercise the new framing distance in the tour regression, document the tuning and run verification.

**Test plan:** Run focused Vitest tests, then typecheck, test, validate and build. Run the photo,
tour-slice and smoke specs under the shared lock, one at a time on port 5403. Include a touch
viewport check for overlay visibility.

**Risks:** Keep overlay ownership compatible with other feature states. Check the new doe location
against the boulder and the approach in the real scene.

**Open questions:** None.

## Progress

- Branch: `dev/task-017`
- 2026-11-26: The shared photo flag hides HUD overlays, and marker roots follow the phone events.
  Five focused unit tests passed. The sandbox denied binding port 5403 (`EPERM`).

## Follow-ups

- Pending verification.
