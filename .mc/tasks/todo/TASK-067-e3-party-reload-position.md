---
id: TASK-067
aliases:
- TASK-067
title: 'Reloading during the e3 party puts the player back at the party'
slug: e3-party-reload-position
status: todo
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
updated: 2026-11-26
---

# Reload during the e3 party leaves the player at the Quelle

## Goal

Reloading a save made during the ending party (`content/story/05-enden.story.json`, beat
`e3`) puts the player at the Quelle, about 300 m from the party. The e3 autosave runs before
the delayed teleport to the party, so the saved position is still the Quelle and nothing moves
the player on resume. This is already on main; it was found in the TASK-039 review (PR #66)
and is not covered by TASK-045. **Fix it before the finish-line playtest.**

## Acceptance criteria

- [ ] Loading or booting into an e3 save (title „Weiter“ and a pause-menu load) places the
      player at the party, facing it, with the party people, scenery and dusk look in place.
- [ ] A save taken after the player walked away from the party during free play keeps the
      player where they were (no teleport back).
- [ ] Touch-only and reduced motion behave the same (no extra fade or camera move under reduced
      motion).
- [ ] A unit test reproduces the Quelle position first and then pins the fix.
- [ ] Gates pass: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, plus the
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
