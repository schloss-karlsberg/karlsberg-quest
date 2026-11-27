---
id: TASK-075
aliases:
- TASK-075
title: 'Browser memory growth on hosted e2e runners'
slug: browser-memory-growth
status: review
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- render
- performance
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Browser memory growth on hosted e2e runners

## Goal

Find out why the headless Chromium processes grow by several GB during hosted e2e runs, fix the
cause in the game if it is there, and guard the fix with a regression test. Check whether a normal
player session hits the same path.

## Evidence

GitHub Actions, PR #92 run (ubuntu, 16 GB RAM, headless Chromium on ANGLE/SwiftShader,
Playwright 1.64.1, CI profile 640×360, Niedrig tier). A 20 s resource trace shows two
`chrome-headless` processes growing to about 9 GB + 6 GB before the runner is shut down (exit 143).
The Linux repro below shows these are the renderer and the browser process, not the GPU process.

- Shard with `chapter-k3`, `chapter-k1-quelle` and `framerate`: Playwright runs the files in
  alphabetical order, so `chapter-k1-quelle` ran first (its `[k1] clue.k1.rock` line confirms it).
  Test 1 oscillated: renderer and GPU process grew together to 5.2 GB + 2.7 GB and dropped back
  twice. Test 2 grew from 1.1 GB + 0.5 GB to 6.2 GB + 3.4 GB in about 100 s right after
  `clue.k1.rock`, then jumped again to 9.4 GB + 4.7 GB.
- Shard with `chapter-k2`, `camera`, `chapter-k3-autosave` and `kastanien`: `camera` ran first.
  Its first test printed F-03 0/1/2 at 02:15:39, 02:17:39 and 02:19:39 (two minutes per
  iteration), stayed at about 1.6 GB + 0.3 GB, then grew by 30–45 MB/s per process from
  02:21:45 until the runner died at 02:23:20, before the F-07 log line.
- `free` reports no growth of shared memory, so the growth is private memory in both processes.

## Findings

Reproduced in a Linux container like the runner: 4 CPUs, Playwright 1.64.1 image,
chrome-headless-shell, SwiftShader, 640×360. Numbers and the before/after table are in
docs/PERFORMANCE.md §3.9.

- **Not the trace.** It reproduces with tracing off, and a CI run with `trace: 'off'` still ran out
  of memory.
- **Trigger.** Unpaced synchronous draws from `kq.step` / `kq.press` (`src/debug/hooks.ts`
  `step` / `press` → `loop.step(n, true)` → `renderOnce`). A spec loop of 45 × `kq.step(1)` in one
  evaluate (`frames()` helpers, dodge loops, F-07) queues 45 frames. SwiftShader needs about 0.8 s
  for each.
- **Stall and growth.** The renderer main thread blocks in a GPU round trip (native code). While it
  is blocked, the renderer and browser processes grow by 28–40 MB/s each, in PartitionAlloc heap
  (2 MiB anonymous mappings, no shared memory). The GPU process stays flat. The memory drains when
  the thread resumes. It grows without bound when the backlog does not clear.
- **Headless shell only.** Full Chromium in new-headless mode (`channel: 'chromium'`) stalls but
  stays flat. `--disable-gpu-compositing` does not help. The coordinator has set `channel: 'chromium'`
  on CI (PR #92).
- **Players.** Not affected. Game code never calls the step hooks. Real-time play in headless
  shell stays flat, and players run full Chrome.
- **Fix.** `src/debug/stepGate.ts`: a stepped draw runs only after a WebGL2 fence on the previous
  stepped draw has signalled. Otherwise the step prepares the frame and queues a paint (the
  `?manual&faststep` path). `kq.step(n, { draw: true })` forces a draw (`e2e/helpers/render-work.ts`).
- **Guards.** `tests/step-gate.test.ts`, and `e2e/framerate.spec.ts` "a stepping loop draws once"
  (45 draws before the fix, at most 1 after).
- **Left open.** Specs that step once per evaluate are still paced by the rAF loop's own full draws
  (every frame in `?manual` under WebDriver, about 1.6 fps on SwiftShader). Measurement loops that
  call `loop.renderOnce` directly (minimap, tour-slice FOV) are not gated.

## Progress

- 2026-11-27: Branch `dev/task-075` from `origin/main` (`b8162d33`).
- 2026-11-27: Root cause found in the Linux container; step gate, guards and docs added.
