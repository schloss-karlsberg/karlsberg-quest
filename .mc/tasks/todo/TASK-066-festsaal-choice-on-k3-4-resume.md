---
id: TASK-066
aliases:
- TASK-066
title: 'Show the Festsaal choice when a k3_4 save resumes'
slug: festsaal-choice-on-k3-4-resume
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- story
- saves
- interiors
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Festsaal choice missing after resuming a k3_4 save

## Goal

Resuming a save in chapter 3, beat `k3_4`, shows no Festsaal objects. The `festsaal:objects`
cue (authored in `content/story/03-kapitel-3.story.json`) only runs on beat entry, so a slot
load or a boot that resumes the beat never places the choice, so the player may be unable to make the
chapter-3 choice. The same happens on main; it was found in the TASK-059 review
and left out of that task's scope.

## Acceptance criteria

- [ ] Loading or booting into a `k3_4` save where `festsaal.took` is not set shows the four
      Festsaal objects and the prompt in the Festsaal.
- [ ] A save where the choice was already taken does not show them again.
- [ ] A fire that has ended, or the `festsaal:clear` cue, still drops the choice as it does now.
- [ ] A unit test reproduces the missing objects first and then pins the fix.
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
      interiors and smoke e2e specs.

## Plan

**Approach:** Re-issue the Festsaal cue on beat resume (an `onResume` action for `k3_4` in the
content builder, or the interiors system restoring an untaken choice from the slot). Edit
`scripts/content-build` and rebuild if the story content changes; don't hand-edit generated files.

**Files to touch:** `scripts/content-build/*` (or `src/systems/interiors/index.ts`), a unit
test, and the PRD changelog.

**Risks:** The choice must not appear twice when the beat is entered fresh and the cue runs
on entry as well.
