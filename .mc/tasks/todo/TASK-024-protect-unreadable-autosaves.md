---
id: TASK-024
aliases:
- TASK-024
title: Protect unreadable autosaves at the title
slug: protect-unreadable-autosaves
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- ui
- save
sprint: ''
milestone: ''
depends_on:
- TASK-019
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Protect unreadable autosaves at the title

## Goal

Keep unreadable autosave bytes intact at the normal title until the player
confirms replacement and completes the new-game flow.

## Acceptance Criteria

- [x] Readable current and migratable saves enable „Weiter“ and resume their chapter and progress.
- [x] Malformed and newer-version saves show a German explanation at the title.
- [x] Opening the title and cancelling „Neues Spiel“ preserve the exact stored bytes.
- [x] Occupied unreadable slots require overwrite confirmation. Empty slots start normally.
- [x] MemoryStorage regression tests cover every case, including the newer-version slot.

## Plan

_Status: implementation requested 2026-11-26_

**Approach**

Use the same decoding and migration path to check availability and load a slot.
Refresh the title when it opens and if a Continue attempt fails. Use slot
occupancy to decide whether to ask for replacement, preserving `?nosave`.

**Files to touch**

- `src/core/save.ts` for availability and shared decoding.
- `src/boot.ts`, `src/ui/title.ts` and `src/i18n/de.ts` for title readiness and status.
- `tests/title.test.ts` and `e2e/smoke.spec.ts` for save protection regressions.
- `docs/PRD.md`, `docs/ACTION-RPG.md` and `docs/ARCHITECTURE.md` for the title contract.

**Steps**

- [x] 1. Check save readability without loading it and use it to present title actions.
- [x] 2. Cover current, migratable, empty and unreadable saves, plus cancelled and confirmed replacement.
- [x] 3. Update the PRD, action RPG and architecture docs.
- [x] 4. Run typecheck, unit tests and build.
- [ ] 5. Complete `pnpm validate` and the locked smoke spec on port 5412.

**Test plan**

Use `MemoryStorage` in Vitest to check that title readiness leaves state and storage
alone, Continue loads progress, cancellation preserves bytes and confirmed new
games use the existing path. In smoke, seed an unreadable autosave before normal
startup and check the title, overwrite prompt and stored bytes after cancellation.

**Risks**

The autosave can change after the title becomes ready. Continue must still load
successfully before play starts, and New Game should check occupancy on selection.

## Progress

- 2026-11-26 — Started on `dev/task-024`, stacked at `dev/task-019` (`e55f711`).
  TASK-019 already aborts Continue on a failed load. Title readiness still uses
  key presence, so an unreadable save shows a Continue action that silently fails.
- 2026-11-26 — Availability shares the load decoder. A failed Continue refreshes
  the title. Boot treats a successful title load as a resume even for a save
  without a timestamp.
- 2026-11-26 — Focused title and core Vitest checks reported `Tests  34 passed (34)`.
  The smoke spec checks a newer save on normal boot and a migrated save without
  a timestamp after a read-only new game.
- 2026-11-26 — `pnpm typecheck` passed. `pnpm test` reported `Test Files  120 passed (120)`
  and `Tests  1589 passed (1589)` with zero failures. `pnpm build` reported
  `✓ built in 648ms`. `mc validate` passed.
- 2026-11-26 — `pnpm validate` hit `listen EPERM` on the tsx IPC socket. The locked
  smoke run hit `listen EPERM` on `127.0.0.1:5412` before launching the browser.
  Playwright listed all eight smoke cases.
- 2026-11-26 — Git could not create the worktree's `index.lock`. The full task
  remains in the worktree and `HEAD` is still at the TASK-019 base.

## Follow-ups

- Complete the content gate and smoke spec in an environment that permits the
  listeners. No voiced lines require new text.

```sh
pnpm validate
KQ_E2E_PORT=5412 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

- Commit the two changesets where the worktree's index is writable.

```sh
git add -- src/core/save.ts src/boot.ts src/ui/title.ts src/i18n/de.ts tests/title.test.ts e2e/smoke.spec.ts
git commit -m 'fix(ui): protect unreadable autosaves at the title' -m 'Refs: TASK-024' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add -- docs/PRD.md docs/ACTION-RPG.md docs/ARCHITECTURE.md .mc/tasks/todo/TASK-024-protect-unreadable-autosaves.md
git commit -m 'docs(ui): document unreadable autosave handling' -m 'Refs: TASK-024' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
