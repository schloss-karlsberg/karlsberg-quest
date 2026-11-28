---
id: TASK-097
aliases:
- TASK-097
title: Keep dialogue visible and interrupted toasts clear of subtitles
slug: hud-caption-limit-and-toast-hold
status: review
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Keep dialogue visible and interrupted toasts clear of subtitles

## Goal

Restore the two HUD fixes reverted after the Bildrate settings test timed out in CI.

## Acceptance criteria

- [x] With a spoken line and two sound captions visible, the third sound caption rotates out the
  oldest sound caption after its minimum display time.
- [x] An interrupted toast resumes once the subtitle box clears on short touch layouts. Its
  remaining display time and the card gap are preserved.
- [x] Both regressions have unit coverage and the four gates pass.
- [ ] Complete four locked, single-worker runs of the framerate spec on a browser-capable machine.

## Plan

- Select a sound caption for replacement when the incoming sound would exceed the sound limit.
- Check the subtitle hold before an interrupted toast reclaims the shared card slot.
- Compare the old HUD paths with the failing test and its hosted diagnostics.

## Progress

- Branch `fix/hud-caption-limit-toast-hold`. Both adapted regression tests failed against the
  reverted HUD code and passed with the fixes. All four gates passed. Vitest reported 2,734 passed,
  17 todo and 0 failed. Content validation reported 0 errors and 29 warnings.
- The [hosted framerate attempt](https://github.com/schloss-karlsberg/karlsberg-quest/actions/runs/46134771968)
  timed out in the wait for `window.kq.ctx` after reload. A retry in the
  [full-suite run](https://github.com/schloss-karlsberg/karlsberg-quest/actions/runs/46128313378)
  showed the canvas and initial loader. Boot awaits data and system initialization before
  publishing the context or starting card ticks. The cause remains unproven. A browser-side
  stall during boot or its polling is the leading hypothesis. The spec uses a desktop viewport
  and disables game saves, which rules out a short-touch toast hold and the hide autosave.
- Chromium exited during launch in both attempts under the exclusive heavy lock. The headless
  shell reported a permission denial registering its Mach service. Gameplay verification is pending.
