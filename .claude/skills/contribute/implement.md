# Phase 2: Implement

<!-- Identical copy in .claude/skills/contribute/ and .agents/skills/contribute/. Change both. -->

Goal: every plan step done, tests added, the four gates green. Resumable at any point.

1. **Re-read** the task file: `## Plan` (approved) and `## Progress`. Say where you resume.
2. **Branch** (first entry only; afterwards check you are on it):
   `git switch main && git pull && git switch -c fix/task-00x-short-slug` (`feat/...` for features,
   `docs/...`, `refactor/...` as fits). Already on a branch for this task (e.g. a worktree)? Keep
   it. Note the branch name in `## Progress`.
3. **Work step by step.** For each plan step: implement, run the narrowest useful check
   (`pnpm exec vitest run tests/<file>.test.ts`, `pnpm typecheck`), tick the step in the task file
   (`- [x]`), and add one line to the log, right after that step, not in one batch at the end:

   ```markdown
   ## Progress
   - Branch: `fix/task-001-deer-visible`
   - YYYY-MM-DD: step 1 done - spawn moved to t10 enter; tests/animals-deer.test.ts extended.
   ```

   Plan turns out wrong (including the test plan)? Update the plan and say so in `## Progress`
   rather than drifting silently.
4. **Commit as you go** in logical pieces (see ship.md "Commits"); include the task file update.
5. **Tests:** add or adjust unit tests (vitest, `tests/`) for the logic you changed; extend an e2e
   spec in `e2e/` when gameplay flow changes. Content changes: `pnpm validate`.
6. **Gates**, all four:

   ```sh
   pnpm typecheck
   pnpm test
   pnpm validate
   pnpm build
   ```

   Fix failures before moving on. When green, log `gates green` with the date in `## Progress`.
7. Docs: behaviour or design changed → a row in `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog.
8. **Pause point:** if the session is getting long, make sure `## Progress` is current and tell the
   contributor they can compact or start fresh and run `/contribute TASK-00X` to resume.
   When all steps are ticked and gates are green → ship.md.
