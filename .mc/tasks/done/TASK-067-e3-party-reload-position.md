---
id: TASK-067
aliases:
- TASK-067
title: 'Reloading during the e3 party puts the player back at the party'
slug: e3-party-reload-position
status: done
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- story
- saves
- party
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-27
---

# Reload during the e3 party leaves the player at the Quelle

## Goal

Reloading a save made during the ending party (`content/story/05-enden.story.json`, beat
`e3`) puts the player at the Quelle, about 300 m from the party. The e3 autosave runs before
the delayed teleport to the party, so the saved position is still the Quelle and nothing moves
the player on resume. This is already on main; it was found in the TASK-039 review (PR #66)
and is not covered by TASK-045. **Fix it before the finish-line playtest.**

## Acceptance criteria

- [x] Loading or booting into an e3 save (title „Weiter“ and a pause-menu load) places the
      player at the party, facing it, with the party people, scenery and dusk look in place.
- [x] A save taken after the player walked away from the party during free play keeps the
      player where they were (no teleport back).
- [x] Touch-only and reduced motion behave the same (no extra fade or camera move under reduced
      motion).
- [x] A unit test reproduces the Quelle position first and then pins the fix.
- [x] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
      party, epilogue-resume, story and smoke e2e specs.

## Plan

**Approach:** Either save the e3 checkpoint after the teleport (move the autosave behind the
delayed `warp` / arrival), or record that the arrival teleport is still pending in the story
slice and replay it on resume (like the pending tour-group snap from TASK-030). Prefer the
variant that also covers saves already written at the Quelle.

**Files to touch:** `src/systems/story/index.ts` (resume path), possibly
`src/systems/party/runtime.ts` and `scripts/content-build` if the beat's actions change (don't
hand-edit generated story files), a unit test, the PRD changelog.

**Risks:** Do not teleport players who are legitimately elsewhere in free play after the
credits; keep TASK-045's credits and replay handling intact.

## Resolution

Mostly fixed by TASK-045 (#108): the e3 arrival step (`fest-ankunft`, 0.4 s) sets
`story.party.arrived`, runs again after a resume that lost it, and `migrateEndingProgress`
marks saves already away from the spring as arrived. One case remained: a save written while
the credits were playing but still at the spring. On load the party skips the saved credits,
which ends e3 before the arrival can run again, so the player stayed at the spring.
`migrateEndingProgress` now restores the arrival pose for that case.

The Codex branch (8116168, never pushed) restored the pose in the story resume path instead;
its unit tests were ported to `tests/story-party-resume.test.ts` and adapted to main's arrival
step (the test seeds now use a real e3 beat time and look). Its party e2e additions were not
ported: the unit tests cover boot and in-session load.
