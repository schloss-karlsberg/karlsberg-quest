---
id: TASK-027
aliases:
- TASK-027
title: Show the player's actual key bindings in Steuerung
slug: show-actual-key-bindings-in-steuerung
status: in-progress
priority: 2
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
created: 2026-11-26
updated: 2026-11-26
---

# Show the player's actual key bindings in Steuerung

## Description

Pause → Steuerung should describe the controls the player can actually use. The audit at
`d2d1f48` is reproducible: the table prints fixed key labels and the settings editor formats
the effective bindings, including keyboard-layout labels.

## Acceptance Criteria

- [x] Reopening Steuerung shows saved keys, including alternates and the German unbound label.
- [x] Movement and look groups retain direction order, and scan shows Umschalt with the current scan key.
- [x] Registered survey rows use the shared formatter, and reset restores the current defaults.
- [x] Unit tests assert displayed default, remapped and unbound row values and a supplied layout label.

## Plan

_Status: implementation requested 2026-11-26_

**Approach**

Read the saved overrides when the pause page opens and use the editor's label
formatter for every mapped action. Keep the fixed notes shortcut and apply the same
keyboard-layout lookup to both pages. Keep German row descriptions free of stale key names.

**Files to touch**

- `src/ui/menus.ts`, `src/ui/settings.ts`, `src/ui/styles.css` and the control strings and feature registrations.
- `tests/controls.test.ts` and the key-help check in `e2e/skills.spec.ts`.
- `docs/PERFORMANCE.md`, `docs/ACTION-RPG.md` and `docs/PRD.md`.

**Steps**

- [x] Wire the controls rows and feature registrations to effective bindings and layout labels.
- [x] Test row values, saved overrides, reopening and reset.
- [x] Update the accessibility notes and changelogs.
- [x] Attempt all four gates and both locked browser specs on port 5415, then record the results.

**Test plan**

Run the controls unit tests, all four gates, then the skills and smoke specs
separately via `scripts/dev/heavy.sh --max-hold 15`. The skills spec captures the settings and
Steuerung views and exercises rebinding and reset.

**Risks**

The browser's layout map can arrive after the first render. Alternate bindings can
increase the width of the keys column.

## Progress

- Branch `dev/task-027`.
- 2026-11-26 audit confirmed at `d2d1f48`.
- 2026-11-26 mapped the controls and registered feature rows to input actions and shared the
  layout lookup with the editor. The table can wrap the longer key lists.
- 2026-11-26 all three focused unit tests passed. Extended the skills browser test to exercise
  reopening after adding and removing a key, followed by a reset.
- 2026-11-26 updated the accessibility notes and both changelogs.
- 2026-11-26 `pnpm typecheck`, `pnpm test`, `pnpm build` and `mc validate` passed.
  Vitest reported `Tests  1576 passed (1576)` with zero failures.
- 2026-11-26 `pnpm validate` could not open the `tsx` IPC socket in the sandbox.
  `node --import tsx scripts/validate-content.ts` reported `✓ content valid (1 warning(s))`.
- 2026-11-26 both locked browser runs stopped before test execution. The sandbox denied the
  preview server socket at `127.0.0.1:5415`.
- 2026-11-26 Git could not create this worktree's `index.lock`. Implementation, tests and
  documentation remain in the worktree.

## Follow-ups

- [ ] Run `pnpm validate` where the `tsx` CLI can open its IPC socket.
- [ ] Run the browser specs in an environment that can bind port 5415.

  ```sh
  KQ_E2E_PORT=5415 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/skills.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5415 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- [ ] Commit the implementation and docs from a session with write access to the worktree index.

  ```sh
  git add -- src/ui/menus.ts src/ui/settings.ts src/ui/styles.css src/i18n/de.content.ts src/i18n/de.ts \
    src/systems/notes/index.ts src/systems/photo/index.ts src/systems/skills/settings.ts \
    src/systems/skills/strings.ts tests/controls.test.ts e2e/skills.spec.ts
  git commit -m 'fix(ui): show current key bindings in Steuerung' \
    -m 'Refs: TASK-027' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  git add -- docs/PERFORMANCE.md docs/ACTION-RPG.md docs/PRD.md \
    .mc/tasks/todo/TASK-027-show-actual-key-bindings-in-steuerung.md
  git commit -m 'docs(ui): document current bindings in Steuerung' \
    -m 'Refs: TASK-027' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```
