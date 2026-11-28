---
id: TASK-063
aliases:
- TASK-063
title: 'heavy.sh: several heavy jobs at once, with an exclusive lane'
slug: heavy-sh-slots
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# heavy.sh: several heavy jobs at once, with an exclusive lane

## Goal

`scripts/dev/heavy.sh` serialises correctly since #68, but strictly one job at a time machine-wide.
Typical jobs are SwiftShader Playwright runs using about 1.5–2 cores on an 18-core machine, and the
queue reached 15 tickets at load average 12. Run N normal jobs at once while jobs that need a quiet
machine stay exclusive, without breaking the heavy.sh copies that running jobs still use.

## Acceptance criteria

- [x] Old/new interop: the existing `$LOCK` dir stays a valid slot (slot 0). An old-format holder in
      `$LOCK` keeps excluding `--exclusive` runs and slot 0. Extra slots are `$LOCK.slot1` …
      `$LOCK.slot{N-1}` with the same metadata (pid, child_pid, owner, cmd, cwd, epoch, lane,
      max_hold, started) and the same stale rules (EPERM = alive, …).
- [x] `KQ_HEAVY_SLOTS` sets the slot count (default 3, minimum 1). `KQ_HEAVY_SLOTS=1` behaves exactly
      as before.
- [x] `--exclusive` takes every slot (0..N-1) atomically under the guard. An exclusive ticket at the
      head blocks normal tickets behind it from taking slots as they free up, until it holds all of them.
- [x] FIFO, priority lane and 2:1 anti-starvation still decide each acquisition. Nested runs
      (`KQ_HEAVY_HELD=1`) still run directly.
- [x] `--status` lists every holder per slot (slot 0 = `$LOCK`), then the queue, marking exclusive tickets.
- [x] Exclusive callers (walk / framerate / perf specs, `playwright.gpu.config.ts`, real-GPU screenshot
      sets, local MOSS / TTS runs) are documented in the heavy.sh usage text and in CONTRIBUTING.md,
      with an example.
- [x] Tests in `scripts/dev/heavy.test.sh`, using only a temp `KQ_HEAVY_LOCK`: 3 normal tickets run at
      once and a 4th waits; an exclusive ticket waits for all slots and blocks later normal tickets; an
      old-format holder in `$LOCK` leaves slots 1..N-1 usable while an exclusive waits;
      `KQ_HEAVY_SLOTS=1` keeps the old behaviour; stale-slot clearing and EPERM-alive per slot; the
      `--stress` run stays green and covers slots.
- [x] PRD changelog row.

## Plan

**Approach:** Keep the ticket queue and the single-lock "next ticket" rule, applied hold by hold to
get a service order. Walk that order and hand out free slots; a waiter claims when the walk gives its
own ticket a slot. A new lock file, `$LOCK.slots.guard`, serialises slot-aware acquisitions and is
released once the child has published its PID, so other slots stay acquirable. Slot 0 is also
guarded by the old `$LOCK.guard` whenever new code clears or creates it, because older copies keep
that guard for their whole hold. Tickets and holders gain a `mode` file (S / X); a ticket without
one comes from an older copy and can only take slot 0.

**Files to touch:** `scripts/dev/heavy.sh`, `scripts/dev/heavy.test.sh`, `CONTRIBUTING.md`,
`docs/NEXT-SESSION.md`, `docs/PRD.md`, this task file. Follow-ups found on the way: the Playwright
configs (per-slot default port), `scripts/voice/moss.ts` and its test (`--exclusive`),
`docs/ARCHITECTURE.md`.

**Test plan:** `bash scripts/dev/heavy.test.sh` and `bash scripts/dev/heavy.test.sh --stress`, each
with a private temp lock path; a mixed run with the real #68 script from git history.

**Risks:** Running jobs keep their old heavy.sh copy during the switch: they only know `$LOCK`, so
they share the machine with up to N-1 new jobs. Two concurrent e2e runs on the default preview port
would reuse each other's server.

## Notes

- 2026-11-26: `bash scripts/dev/heavy.test.sh`: 165 passed, 0 failed (three runs in a row and once
  more after the last change). `bash scripts/dev/heavy.test.sh --stress`: 24 passed, 0 failed (eight
  runs). Both old-copy mixes ran: the pre-priority script (1472fa4) with one slot, the #68 script
  (3dafa0e) with three. Tests use a temp `KQ_HEAVY_LOCK` only; the real lock was never touched.
- Concurrent e2e runs on the default preview port would reuse each other's server
  (`reuseExistingServer` is on locally). heavy.sh now exports `KQ_HEAVY_SLOT` to the child, and both
  Playwright configs default to port 5281 + slot when `KQ_E2E_PORT` is unset. Slot 0 and exclusive
  jobs keep 5281.
- The in-repo MOSS caller (`scripts/voice/moss.ts`) passes `--exclusive` (25–37 GB peak). The
  standalone kq-moss service outside the repo still needs the same flag.

## Closed (audit 2026-11-28)

Merged in PR #74 and #77. All acceptance criteria are met on main (`f8a75ff7`), and the hosted e2e suite is green.
