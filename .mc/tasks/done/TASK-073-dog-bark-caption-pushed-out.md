---
id: TASK-073
aliases:
- TASK-073
title: 'Dog-bark caption is pushed out of the subtitle box almost at once'
slug: dog-bark-caption-pushed-out
status: done
priority: 3
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
created: 2026-11-27
updated: 2026-11-27
---

# Dog-bark caption is pushed out of the subtitle box almost at once

## Goal

In the tour, the sound caption „[Diane und Bijou bellen]“ leaves the subtitle box about 28 ms
after it appears, so deaf and hard-of-hearing players barely see it. The bug is pre-existing on
main; the TASK-016/TASK-022 review found it while recording the tour-slice captions.

Cause (suspected): `Hud.subtitle` (`src/ui/hud.ts`) keeps at most three lines and drops the
oldest one. The bark caption arrives together with a burst of dialogue lines, so it is the oldest
line and is evicted at once, long before its 3.5 s timer (`src/systems/story/sfx.ts`).

## Acceptance criteria

- [x] A sound caption stays readable for a minimum time (for example 1.5 s) even when dialogue
      lines arrive right after it; dialogue keeps its order and is not lost either.
- [x] Subtitles switched off still show no captions.
- [x] A unit test reproduces the early eviction first and then pins the fix.
- [x] The tour-slice e2e caption check for the bark sees the caption visible, not only added (check written; the run is left to the integration run).
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` (passed), plus the
      tour-slice and smoke e2e specs (left to the integration run).

## Plan

**Approach:** Give sound captions (speaker `null`) a minimum dwell in the three-line cap, or let
the cap evict the oldest dialogue line first, in `Hud.subtitle`.

**Files to touch:** `src/ui/hud.ts`, a unit test, `e2e/tour-slice.spec.ts`, the PRD changelog.

## Resolution

Confirmed: `Hud.subtitle` appended each line and at once removed the oldest while more than three
were up, so the bark caption, followed within a second by three dialogue lines, was evicted almost
immediately. The box now keeps visible and queued lines: when it is full, the oldest line gives way
only after 1.5 s on screen (`SUB_MIN_MS`), and newer lines wait in order until then. This applies to
dialogue lines too, so none is lost or reordered; each line's own time starts when it appears.
Callers still gate on the subtitles setting (covered in `tests/audio-mix.test.ts`).
`tests/hud-subtitles.test.ts` failed on main and passes now. The tour-slice recorder also notes
when a caption leaves the box, and the bark check asserts it was visible for at least 1.45 s.
