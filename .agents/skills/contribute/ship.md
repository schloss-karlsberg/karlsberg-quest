# Phase 3: Ship

<!-- Identical copy in .claude/skills/contribute/ and .agents/skills/contribute/. Change both. -->

Goal: a reviewed, well-described PR, and the task file pointing at it.

## Final check

- Four gates green again on the final state (`pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`).
- Relevant e2e specs green, always one worker:
  `pnpm build && pnpm exec playwright test e2e/<spec>.spec.ts --workers=1`
  (`pnpm e2e --workers=1` runs everything and can take about an hour). If the repo's shared-machine
  lock `scripts/dev/heavy.sh` is present and needed on your machine, wrap each spec in it.
- Self-review the full diff: `git diff main...HEAD`. Look for bugs, leftovers, debug code
  (`console.log`, `debugger`, commented-out code), stray files, English text in the UI (must be German),
  missing asset credits.

## Commits

Conventional Commits, English, imperative, lower case after the colon: `type(scope): summary`.
release-please builds the changelog from them (`feat`, `fix`, `perf`, `docs` appear there).
Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`. Scopes (optional):
`story`, `quelle`, `combat`, `camera`, `touch`, `render`, `content`, `ui`, `release`, `env`
(never `main`). Several logical commits, not one blob, each with the task ID in the body:

```
fix(story): deer stay visible until the player reaches them

Refs: TASK-001
```

Task-file updates ride along in those commits; a commit that only touches `.mc/` is `chore: ...` (`mc` is not a lint scope).

## Screenshots (visible changes)

Before shots are taken in the plan phase on the unchanged code; after shots now, same views.
Tooling in the repo, with `pnpm dev` running:

```sh
mkdir -p test-results/contribute/TASK-00X
node scripts/dev/shot.mjs "http://localhost:5280/?debug&nosave&fresh&x=704&z=-779" test-results/contribute/TASK-00X/after-1.png
```

`scripts/dev/shot.mjs <url> <out.png> [js]` (one view; the optional js runs against `window.kq`
first); `scripts/dev/shots.mjs <outdir>` takes several views from `VIEWS='[{"name":..,"x":..,"z":..}]'`.
Both render with SwiftShader (software). For the real-GPU look, `e2e/gpu/*.gpu.ts` with
`playwright.gpu.config.ts`. `test-results/` is gitignored: **never commit screenshots.**

## Pull request

1. `git push -u origin <branch>`
2. `gh pr create --base main --title "<conventional summary>" --body-file <tmp file>`. The title is
   checked by `.github/workflows/pr-lint.yml`. Follow `.github/pull_request_template.md`:
   - **What and why:** summary, `Task: TASK-00X` (task IDs are not GitHub issues, so no "Fixes #"),
     what changed and why.
   - **How to test:** URL with flags, steps, what to expect.
   - **Gates:** the template's checklist, ticked; which e2e specs ran.
   - **Content and assets:** the template's checklist.
   - **Screenshots / notes:** `gh` cannot upload images and the repo has no image convention, so
     put the placeholder `<!-- images below: before / after -->` and tell the contributor exactly
     which files to drag into the PR description on GitHub (full paths under `test-results/contribute/TASK-00X/`).
     Don't drive their browser or desktop to upload them.
   - Risks and notes.

## Close out

- Add `PR: <url>` to `## Progress` in the task file and move the task to **`review`**
  (`mc task move TASK-00X review`). It stays there until the PR is merged; the maintainer moves it to
  `done` after the merge. (This repo uses `review` so open PRs are visible on `mc task board`.)
  Commit and push that task-file change on the branch.
- Collection tasks: append a line to "Models so far" (`- [x] <German name> (<English>) · <file> · @author · PR <url>`),
  keep the task `todo`.
- `mc validate` if `mc` is installed.
- Offer to add the contributor to the credits: one entry in `content/credits.json` (name, German role, optional links), with their consent (once that file exists, TASK-013).
- Thank the contributor, then offer the next task (back to the Welcome menu).
