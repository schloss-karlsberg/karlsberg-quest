# Handoff: kq-systems

Written 2026-11-21. This is the systems and performance track. Read this file, then the pointers
at the end.

## What this track owns

- Walk / group (`src/systems/walk`), animals (`src/systems/animals`), cinematic
  (`src/systems/cinematic`), party (`src/systems/party`).
- The `shift:done` reason (`ShiftReason`, `src/systems/contracts.ts`) and the `world:quiet` gate
  (`src/core/quiet.ts`).
- Performance work:
  - triangle budget, phases A and B (PERFORMANCE §3.4, §3.5);
  - Quelle reflection coverage (§3.4, water reflection);
  - the era-shift warm-up and the era prewarm registry (§3.6;
    `src/systems/fx/shift/warm.ts`, `reveal.ts`, `prewarm.ts`).
- Systems that build objects only once an era is active register one sample line with
  `registerEraMaterials` (see `prewarm.ts`).

## Open items

- Tour skip / `tour.walkAll`: parked until the owner has played tour slice v0.
- The GPU/driver-side part of the era-shift stall: parked (PERFORMANCE §7, "Later / parked").
- Occlusion culling for the Felsenpfad.
- A palace LOD for the past eras (artist route).
- Fire light on people: the shared lighting has no local-light slot.
- Add the party as a measured perf view once the authored extras land.
- Re-sample walk-group performance once kq-characters' 7 extras land.
- Low priority: cinematic keepAlive for animals, a dog-bark SFX, deer noise and wind input.

## Pointers

- `docs/PERFORMANCE.md`: budgets (§1), measuring (§2, including the real-GPU headless method:
  Chromium with ANGLE Metal, uncapped), results (§3), known gaps (§7).
- Heavy-job lock: wrap every e2e or GPU-screenshot run in `scripts/dev/heavy.sh` (one spec per
  hold, `--workers=1`, your own `KQ_E2E_PORT`). Stop jobs with TERM only, and kill the servers you
  start. Run only the specs you touched, plus smoke.
- Commits follow Conventional Commits (`type(scope): summary`).
