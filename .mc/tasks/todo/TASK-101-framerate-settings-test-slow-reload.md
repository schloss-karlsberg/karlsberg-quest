---
id: TASK-101
aliases:
- TASK-101
title: Framerate settings e2e runs into its time limit around the reload on CI
slug: framerate-settings-test-slow-reload
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- test
- ci
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

## Problem

`e2e/framerate.spec.ts` › „settings: Bildrate … persist and act“ failed on CI with the 15 min
test timeout, at `page.reload()` or at the `kq.ctx` wait after it. It looked like a boot hang
after the reload and seemed to follow the HUD caption/toast fix (TASK-097), but the unchanged
main (db8b1b8d) fails the same way.

## Cause

Not a hang, not the HUD change: the test is slow. It boots with `q=high` at 1280×720 and works
in the pause menu and bullet time. Under webdriver the game does not hold the paused frame
(`holdIdle = !navigator.webdriver || params.has('idle')` in `src/boot.ts`), so the page keeps
drawing Hoch frames on CI's software renderer (SwiftShader). Traced CI runs (four repetitions per
run, timestamps around the reload):

- steps before the reload: 434–766 s
- `page.reload()` itself: 97–143 s; boot after it: about 4 s
- the runs that failed crossed 900 s while the reload was still going (for example +766 s
  reload, +908 s returned)

Players are not affected: a normal browser holds the paused frame, and a GPU draws Hoch easily.

## Acceptance criteria

- [x] The test boots with `idle`, so Pause and bullet time hold their frame as for a player.
- [x] The reload and the boot wait are bounded and fail with their own message.
- [ ] Six framerate-only CI runs pass with no retry.
