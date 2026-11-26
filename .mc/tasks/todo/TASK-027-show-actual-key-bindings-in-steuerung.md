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
- [x] Pause lists Escape, the fixed menu shortcut.
- [x] Printable keys use the supplied layout, and either bound Shift key is shown as a standalone reverse scan shortcut.
- [x] The phone row describes the toggle in all eras.
- [x] The skills spec uses a deterministic layout and exact Back navigation to check remapping and reset.
- [ ] The skills and smoke specs pass in a browser.

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

### Review round, 2026-11-26

The goal is to resolve all six review findings and unblock the skills spec.

- [x] Restore the fixed Escape label and add regression assertions for it, printable layout labels,
  Shift-only and mixed scan bindings, and the phone toggle description.
- [x] Seed the keyboard layout before navigation and use the exact Back button name in the skills spec.
- [x] Update the controls and photo documentation and both changelogs.
- [x] Run the four gates and attempt the skills and smoke specs under the machine-wide lock.

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
- 2026-11-26 the initial Git attempt could not create this worktree's `index.lock`.
- 2026-11-26 the original implementation is now committed as `4d01755`.
- 2026-11-26 fixed the Pause, keyboard layout, scan and phone labels. Focused controls and photo
  tests reported `Tests  46 passed (46)`.
- 2026-11-26 the skills spec seeds the digit labels before navigation and targets the exact Back
  button while the bindings editor is expanded.
- 2026-11-26 `pnpm typecheck`, `pnpm test` and `pnpm build` passed. Vitest reported
  `Test Files  119 passed (119)` and `Tests  1580 passed (1580)` with zero failures.
- 2026-11-26 `pnpm validate` stopped at `listen EPERM` on the `tsx` IPC socket.
  The validator ran directly with `node --import tsx scripts/validate-content.ts` and reported
  `✓ content valid (1 warning(s))`.
- 2026-11-26 attempted `e2e/skills.spec.ts` and `e2e/smoke.spec.ts` separately under the shared lock.
  The sandbox denied the preview server bind at `127.0.0.1:5415` before either spec ran.
- 2026-11-26 committed the controls, photo copy, unit tests and documentation as `08c02e6`.
- 2026-11-26 Git denied creation of this worktree's `index.lock` while staging the skills spec
  and this task update. Both edits are in the worktree.

### Review findings

| # | Status | Resolution |
| --- | --- | --- |
| 1 | Fixed | The Pause row shows `[Esc]` even with a saved override. |
| 2 | Fixed | The skills spec uses exact Back navigation while the reset button is visible and retains the remap and reset assertions. Browser verification is pending. |
| 3 | Fixed | The shared formatter uses the supplied Backquote, Comma and Period labels and preserves localized control-key names. The formatter priority predates this branch and is in scope. |
| 4 | Fixed | The skills spec installs the expected Digit2, Digit4 and Digit5 labels before navigation. Unit tests cover layout-specific digit labels. Browser verification is pending. |
| 5 | Fixed | Both Shift keys are shown explicitly as standalone reverse bindings, including alongside other scan keys. |
| 6 | Fixed | The phone toggle copy applies in every era. The photo system still shows „Kein Netz“ in the past. |

## Follow-ups

- [ ] Run `pnpm validate` where the `tsx` CLI can open its IPC socket.
- [ ] Run the browser specs in an environment that can bind port 5415.

  ```sh
  KQ_E2E_PORT=5415 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/skills.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5415 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- [ ] Commit the skills spec and task update from a session with worktree index access.

  ```sh
  git add -- e2e/skills.spec.ts .mc/tasks/todo/TASK-027-show-actual-key-bindings-in-steuerung.md
  git commit -m 'test(ui): stabilize the Steuerung browser regression' \
    -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```
