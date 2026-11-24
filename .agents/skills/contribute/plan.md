# Phase 1: Plan

<!-- Identical copy in .claude/skills/contribute/ and .agents/skills/contribute/. Change both. -->

Goal: an approved plan written into the task file. No code changes yet.

1. **Claim it:** `mc task move TASK-00X in-progress` (collection tasks: keep `todo`, see SKILL.md).
2. **Show the task:** summarise context and acceptance criteria in a few lines.
3. **Setup check** (first time only): Node.js 24, `corepack enable`, `pnpm install`;
   `pnpm dev` serves http://localhost:5280. Useful URL flags: `?debug`, `?nosave`, `?fresh`,
   `?x=…&z=…`, `?era=…`; `window.kq` is the debug API (see CONTRIBUTING.md "Testing aids").
4. **Explore:** open every file the task points at, follow the code paths, find the related tests
   (`tests/*.test.ts`, `e2e/*.spec.ts`). Check `git status` is clean and you are on an up-to-date `main`.
5. **Write the plan** into the task file, under the Acceptance Criteria, using this template and its
   bold headings as they are:

   ```markdown
   ## Plan
   _Status: draft_ <!-- becomes "approved YYYY-MM-DD" -->

   **Approach:** two to five sentences.

   **Files to touch:** `path` - why, one line each.

   **Steps:**
   - [ ] 1. ...
   - [ ] 2. ...

   **Test plan:** unit tests to add/change, e2e specs to run, manual check (URL + what to look at).
   Visible change? List the screenshot views (URL flags / position) for before/after.

   **Risks:** ...

   **Open questions:** ...
   ```

   Keep steps small enough to tick off one at a time. More than about ten steps or many systems?
   Propose a smaller first cut and list the rest as follow-ups. Use the real commands (`pnpm typecheck`,
   `pnpm test`, `pnpm validate`, `pnpm build`, `pnpm exec playwright test e2e/<spec>.spec.ts --workers=1`).
6. **Ask for approval:** show the plan, ask the contributor to approve or adjust. Edit until approved,
   then set `_Status: approved <today>_`.
7. **Before screenshots** (visible changes only): take them now, while the code is unchanged; see
   ship.md "Screenshots" for the how and where. Blocked (see SKILL.md "Sandboxed agents")? Ask the
   contributor to take them now.
8. **Hand-off:** tell the contributor clearly:

   > The plan is saved in the task file. You can now compact the conversation (`/compact` in Claude
   > Code) or start a fresh session (Codex, or any agent), then run `/contribute` again
   > (or `/contribute TASK-00X`; `$contribute` in Codex) to continue with the implementation.

   If they want to keep going right away, continue with implement.md.
