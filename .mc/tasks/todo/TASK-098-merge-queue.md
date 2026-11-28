---
id: TASK-098
aliases:
- TASK-098
title: 'Merge queue: few open pull requests, nobody waits for the owner'
slug: merge-queue
status: review
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- env
sprint: ''
milestone: ''
depends_on:
- TASK-094
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Merge queue: few open pull requests, nobody waits for the owner

## Goal

Owner, 2026-11-28: "i dont want such a big amount of PRs - but also dont want to block you. find a
way where you can good work (and work in parallel). this is also needed for community working (if
we have a lot of community members, we need good workflows)". Fifteen pull requests were open at
once that night, and they went into `main` through one hand-made combined branch.

A reviewed, green pull request should reach `main` without anyone merging by hand, `main` should
only move to commits that passed the full suite, and the same flow should work for a contributor
with a fork.

## Acceptance criteria

- [x] Evaluate GitHub's merge queue for this repository and say what it does and does not do.
- [x] Workflows fit the queue: both required checks report on `merge_group`, the run is sized for
      two entries side by side, a dropped group stops itself.
- [x] Measured minutes per spec replace the estimates.
- [x] CONTRIBUTING "How a pull request merges", written for outside contributors first; AGENTS
      "Merging"; the contribute skill's ship phase; the cap on open pull requests.
- [x] Exact ruleset JSON and commands in the pull request description. Nothing applied.
- [ ] Owner decides; then apply the ruleset and check the open points below on the first merges.

## Findings

- **The queue does not batch CI.** GitHub's documentation: "Merge limits do not combine
  `merge_group` builds." and "Merge limits only affect merges to the base branch once one or more
  `merge_group` has satisfied build checks." Every queued pull request gets its own `merge_group`
  run, on a branch that holds it and the pull requests ahead of it. The group size only decides
  how many green entries merge together.
- So there is no bisection: the first entry that fails is removed, and the queue recreates the
  branches of the entries behind it.
- A pile of pull requests shares one run as a **train**: one `integrate/<name>` branch, one pull
  request from it, one queue entry. That is the hand-made combined branch, entering `main`
  through the queue.
- `gh pr merge --auto` queues a pull request when its required checks have passed, and enables
  auto-merge until then. On a branch with a merge queue the repository's auto-merge setting does
  not apply.
- The release pull request (#22) has no checks: a pull request opened with `GITHUB_TOKEN` gets its
  workflow runs in an approval-required state (`action_required`), behind "Approve workflows to
  run".
- Repository state on 2026-11-28: no ruleset, no branch protection, merge commits titled "Merge
  pull request #N" with the pull request title as the message, auto-merge off, Actions may approve
  pull requests, workflows of first-time contributors need approval. Two accounts have access:
  the owner (admin) and one maintainer.
- release-please reads the Conventional Commits of each branch (the changelog lists them one by
  one), so the queue keeps merge commits.

## Design

| Step | Who or what | Time |
| --- | --- | --- |
| Pull request opened or pushed | Gates, path-selected e2e (TASK-094) | 1 min, then 1–45 min |
| Review | a maintainer for outside contributors; an independent session for an agent's change | — |
| `gh pr merge <n> --auto --merge` | the reviewer | — |
| Merge queue | Gates and the full suite on the merge result, 8 shards | about 50 min |
| `main` moves to the tested commit | GitHub | — |

- **Two entries at a time.** A merge-group run takes 8 shards: with the measured minutes the
  seven shards beside the campaign carry 38 min each, so the campaign (45 min) still sets the wall
  time, as with 12. Two entries use 16 of the 20 runners. That is about 2.5 merges an hour.
- **A dropped group stops itself.** The documentation does not say that GitHub cancels the runs of
  a group it drops. Each shard checks that its `gh-readonly-queue` branch still exists, before it
  starts and once a minute, and stops as a failure when it is gone.
- **No second run on `main`.** The push run looks for a passed merge-queue run of the same commit
  and skips (TASK-094). Whether `main` ends on the tested commit is not in the documentation.
- **Shared code on a pull request.** With `E2E_SHARED_CODE=quick` it runs the cross-section of 11
  specs there and the full suite in the queue, instead of the full suite twice.
- **Ruleset "main: tested merges":** required checks "Gates" and "End-to-end tests", merge queue,
  no force-push, no deletion. Organisation admins may merge a pull request past it (bypass mode
  "pull requests only"), which the release pull request needs; nobody can push to `main`.
- **Review is a written rule for now.** GitHub cannot enforce "the reviewer is not the author"
  when every agent uses the owner's account. A ruleset that requires an approval would either
  stop every agent pull request (an account cannot approve its own) or, with a bypass for the
  owner, enforce nothing. Outside contributors cannot merge at all; that part GitHub enforces.
  A later step can make it enforceable: require one approval without bypass, and let a small
  workflow approve a member's pull request as the Actions bot once an independent review comment
  with an approving verdict is there. It needs a workflow with `pull-requests: write`, and a
  test of whether a bot approval counts.
- **Cap on open pull requests:** bundle related changes, drafts until ready, about five agent
  pull requests at once. One full run per merged pull request is affordable only with the cap.

Rejected for now: our own "integrate" workflow that builds the combined branch from labelled pull
requests. It would run the suite once per batch, but it is a merge bot to maintain: the Actions
app needs a bypass to push `main`, pushes made with `GITHUB_TOKEN` trigger neither the deploy nor
release-please, and it needs its own bisection.

## Open points to check when the ruleset is applied

- The merge queue is available for a public repository of an organisation on the Free plan. The
  documentation pages read for this task do not say; the ruleset call will.
- After the first queued merge: `main` points at the commit the merge-group run tested, and the
  push run on `main` skips.
- A run of a dropped group: does GitHub cancel it, or does the self-stop act.
- The owner can merge the release pull request with the bypass.

## Progress

- Branch `ci/task-098-merge-queue`, on `main` at db8b1b8d. PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/147
- 2026-11-28: evaluated, workflow and docs prepared, minutes measured from run 46104995434
  (62 specs, 304 min; `forage` and `turn-light` are newer and count by their tests). With them a
  full run plans as 12 shards of 24 min beside the campaign, or 8 shards of 38 min.
