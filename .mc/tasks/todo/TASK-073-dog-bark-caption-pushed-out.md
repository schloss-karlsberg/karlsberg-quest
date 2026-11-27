---
id: TASK-073
aliases:
- TASK-073
title: 'Dog-bark caption is pushed out of the subtitle box almost at once'
slug: dog-bark-caption-pushed-out
status: todo
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

- [ ] A sound caption stays readable for a minimum time (for example 1.5 s) even when dialogue
      lines arrive right after it; dialogue keeps its order and is not lost either.
- [ ] Subtitles switched off still show no captions.
- [ ] A unit test reproduces the early eviction first and then pins the fix.
- [ ] The tour-slice e2e caption check for the bark sees the caption visible, not only added.
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
      tour-slice and smoke e2e specs.

## Plan

**Approach:** Give sound captions (speaker `null`) a minimum dwell in the three-line cap, or let
the cap evict the oldest dialogue line first, in `Hud.subtitle`.

**Files to touch:** `src/ui/hud.ts`, a unit test, `e2e/tour-slice.spec.ts`, the PRD changelog.
