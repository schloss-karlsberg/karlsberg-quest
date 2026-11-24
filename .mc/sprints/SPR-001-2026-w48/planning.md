# 2026-W48 -- Sprint Planning

## Capacity

Core team plus Codex runs through the `contribute` skill (plan and ship on the default model; implement on gpt-6.2-sol, xhigh). One task at a time, one PR per slice.

## Selected Items

1. [[TASK-007]] next slices. First: delete the legacy prologue content left behind after `?classic` was removed. The follow-up list is in the task file.
2. [[TASK-008]] castle landscape and LiDAR (epic: split into slices of about 5 steps).
3. [[TASK-010]] more tour audio (epic: split into slices).

Community tasks TASK-001…006 stay open for outside contributors.

## Open owner decisions

- Consent of the second credits seed to be named publicly (TASK-013 is merged; consent is still pending).
- TASK-007 "verify with owner" items: where Sammlungen, Funde, Ausrüstung and Talente live; the talent branch label; where the Bauwagen stands.
- Whether a CI workflow should run the four gates on PRs (today only the PR title is checked).

## Notes

- Known failure on main: `e2e/pol-flow.spec.ts:147`.
- Codex usually cannot commit in a git worktree (blocked on `index.lock`); the driver commits what it hands over.
