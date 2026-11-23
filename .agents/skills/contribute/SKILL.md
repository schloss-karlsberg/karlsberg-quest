---
name: contribute
description: Guided contributor workflow for Karlsberg Quest - welcome, pick an open task, plan it, implement it, ship a PR. Use when someone says "I want to contribute", runs /contribute (optionally with a task ID like TASK-001 and a phase plan|implement|ship), asks "what can I work on", asks for a good first issue, or asks about community or bug tasks.
---

# Contribute

<!-- Kept in sync by hand: everything in .claude/skills/contribute/ (Claude) and
     .agents/skills/contribute/ (Codex) is an identical copy. Change both. -->

A guided workflow, one task at a time: **Welcome → Plan → Implement → Ship**. The task file in
`.mc/tasks/` is the shared memory between sessions, so a contributor can stop after any phase and
resume later in a fresh session. Phase details: [plan.md](plan.md), [implement.md](implement.md),
[ship.md](ship.md). Read the one for the current phase before acting.

Speak to the contributor directly and neutrally ("you", "the contributor", they/them).

## Arguments

| Call | What happens |
| --- | --- |
| `/contribute` | Exactly one task `in-progress` → resume it (say which). Otherwise → Welcome. |
| `/contribute TASK-00X` | Jump to that task's current phase (see *Detect the phase*). |
| `/contribute TASK-00X plan\|implement\|ship` | Force that phase (warn if earlier phases look unfinished). |

In Codex the same calls start with `$contribute` instead of `/contribute`.

## Tasks and the mc tool

Tasks are Markdown files with YAML frontmatter in `.mc/tasks/todo/` (open) and `.mc/tasks/done/`,
managed by MissionControl (`mc`). Run it from the repo (or worktree) root, without `--root`.

| Need | With `mc` | Without `mc` (fallback) |
| --- | --- | --- |
| list open | `mc list tasks --open --tag bug --json`, same with `--tag community` | read frontmatter of `.mc/tasks/todo/*.md` |
| show | `mc show TASK-00X` | read the file |
| set status | `mc task move TASK-00X in-progress` (`review`, `done`) | edit `status:` and `updated: <today>` in the frontmatter |
| checklist | `mc check TASK-00X` / `mc check TASK-00X <n>` | edit the `- [ ]` lines |

Statuses: `backlog`, `todo`, `in-progress`, `review`, `done`, `cancelled`. Finish with `mc validate`
when `mc` is installed. Task file edits are committed together with the work.

## Sandboxed agents

A sandbox (e.g. Codex `workspace-write`) can block a local server, Chromium, the network (`git
push`, `gh`) or, in a git worktree, `git commit`. Don't work around it with substitute commands or
ad-hoc configs: do everything else, note the blocked step in `## Progress`, and give the
contributor the exact command to run (Codex worktree: add `--add-dir <repo>/.git` to commit).
A gate or spec you could not run as written is not green.

## Detect the phase

Read the task file:

- status `todo` / `backlog` → **Plan** (it has not started).
- `in-progress`, no `## Plan` section, or the plan is not marked approved → **Plan**.
- `in-progress`, `## Plan` approved, unticked plan steps or gates not green in `## Progress` → **Implement**.
- `in-progress`, every plan step ticked and `## Progress` says gates green → **Ship**.
- `review` → PR is open: show the PR link from the task file, offer to address review comments
  (back to Implement on the same branch) or to pick the next task.

## 0. Welcome

1. Greet briefly and warmly. One or two sentences: Karlsberg Quest is a free, open-source
   German-language action RPG in the browser (Vite, TypeScript, three.js) set on the Karlsberg, the
   ruined 18th-century palace of Duke Karl II. August near Homburg (Saar), with time travel between
   today and the 1790s.
2. List open tasks (`todo` / `backlog`) tagged `bug` or `community`, deduped, **bugs first, then by
   priority** (1 critical ... 4 low). One line each with a one-line summary from the description:

   ```
   1. TASK-001  P2  Fix the deer bug                   bug, community      Roe deer in the tour are invisible; make the deer scene play.
   2. TASK-002  P3  Collect chestnuts during the tour  feature, community  Give the player something to collect while following the group.
   ```

3. The contributor picks one. If they are unsure ("you pick", "no idea"), pick yourself: prefer bugs
   and high priority, something that fits one session; say why in one line.
   Nothing open → say so and point to the issue forms on GitHub.
4. Go straight into **Plan** for that task.

**One task at a time:** finish (Ship) or park the current task before offering another. Parking =
leave it `in-progress` with an up-to-date `## Progress` note, or move it back to `todo` if no work
was done.

## Collection tasks

Tasks that stay open for many contributors (e.g. TASK-003 hunting weapons, TASK-004 Karlsberg
treasures: they say "Running collection task") are never moved to `in-progress` or `done` as a
whole. Keep their status `todo`. Write the contributor's plan and progress under
`## Plan: <contributor> - <model>` / `## Progress: <contributor> - <model>`, and on Ship append a
line to "Models so far" instead of closing the task.

## Ground rules (from CONTRIBUTING.md)

German in-game text; English code, comments and commits. CC0 or own-work assets only, credited in
`public/assets/LICENSES.json`. Sourced facts, invented parts labelled FIKTION. No brand names. Story
packs are generated: edit `scripts/content-build/`, then `node scripts/content-build/build.mjs`
(`content/story/00-tour.story.json` has no builder and is edited directly).
