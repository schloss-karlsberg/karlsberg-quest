---
id: TASK-016
aliases:
- TASK-016
title: Tour behaviour polish
slug: tour-behaviour-polish
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- tour
- camera
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Tour behaviour polish

## Goal

Resolve tour playtest findings 7, 9, 10, 11 and 18 on the current main baseline.

## Acceptance criteria

- [x] 7. The Wind shot shows both dogs, with a headless camera-frustum test.
- [x] 9. Stopped visitors turn toward Gerold, and he faces the player when addressing them. Reduced motion snaps the turns.
- [x] 10. Soft separation keeps the player clear of visitors and dogs and keeps dogs clear of visitors.
- [x] 11. The follow camera clears the Felsenpfad terrain and rocks, and the radio clears the player on desktop and phones.
- [x] 18. The first departure waits for the line or its muted subtitle, and the Felsenpfad group stops on the trail clear of boulders.
- [ ] Voiced text is preserved, the four gates pass, and the tour and smoke e2e specs are checked on port 5402 where the sandbox permits.

## Plan
_Status: approved 2026-11-26_

**Approach:** Trace the live tour at each affected beat, then adjust the shot, staging and dialogue timing at their existing entry points. Use the existing world collision and lightweight horizontal separation. Keep changes to shared content and UI limited to the affected lines and radio layout.

**Files to touch:**
- `src/systems/walk/`, `src/systems/animals/` and player movement for staging, facing and separation.
- `src/systems/cinematic/`, tour story and route content for camera framing and departure order.
- `src/player/camera.ts` and story radio styles for Felsenpfad visibility.
- Focused unit tests, the tour spec where appropriate, and tour design and changelog docs.

**Steps:**
- [x] 1. Trace the Wind shot and frame the dogs during the authored run.
- [x] 2. Turn the stopped group and guide, add soft separation and adjust Felsenpfad slots.
- [x] 3. Reuse world collision for the third-person camera and reposition the radio.
- [x] 4. Tie the first departure to dialogue completion and preserve voiced text.
- [x] 5. Verify the available checks and update the behaviour docs.

**Test plan:** Run focused Vitest tests and `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run `e2e/tour-slice.spec.ts` and `e2e/smoke.spec.ts` separately under the heavy lock on port 5402. Check the Wind camera at the run keyframes and the Felsenpfad stop from desktop and phone viewpoints.

**Risks:** Terrain heights and crowd placement affect sightlines and escape routes. A dialogue wait must also complete with muted audio, skipping and a resumed save.

**Open questions:** None.

## Progress

- Branch: `dev/task-016` at `07d3c97`.
- 2026-11-26. Checked the branch against `origin/main`. The five findings applied. The old
  Felsenpfad warning was already replaced by the voiced „Bleibt bitte auf dem Weg.“.
- 2026-11-26. Checked both dogs against the Wind frustum over the whole run in landscape and
  portrait, with additional terrain sightline checks.
- 2026-11-26. Checked the facing, separation and saved gathering poses with unit tests.
  Placed all fourteen Felsenpfad slots on the path raster outside the scenery solids. The nearest
  generated tree is 5.52 m from a slot.
- 2026-11-26. Added a camera regression for rock crossing the shoulder sightline and moved the
  radio and Felsenpfad captions to the upper band.
- 2026-11-26. Checked the departure wait and the muted-audio fallback. Compared all 50 tour
  `say` actions to `origin/main` and confirmed their IDs and text match.
- 2026-11-26. `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  119 passed (119)` and `Tests  1582 passed (1582)`, with 0 failures.
- 2026-11-26. The sandbox blocked the IPC socket for the `pnpm validate` launcher.
  `node --import tsx scripts/validate-content.ts` ran the same validator successfully and
  reported `✓ content valid (1 warning(s))`. The warning is in the example pack.
- 2026-11-26. Both locked Playwright commands stopped before browser launch. The sandbox rejected
  Vite's bind to `127.0.0.1:5402` with `EPERM`.
- 2026-11-26. Git could not create the worktree's `index.lock`. The changes are unstaged.
- 2026-11-26. `origin/main` advanced to `d2d1f48` during the task. Its chestnut recordings
  and landscape level-card work do not overlap any edited file.

## Follow-ups

- Run the verification commands on a host that permits the validator's IPC socket and Playwright's
  preview listener. Inspect the Wind shot in the rendered scene and the Felsenpfad card on phones.

```sh
pnpm validate
KQ_E2E_PORT=5402 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5402 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

- Commit the changes from this worktree once Git can create its index lock.

```sh
git add -- content/routes/p-fuehrung.json content/story/00-tour.story.json src tests ':!src/player/camera.ts' ':!src/systems/story/story.css' ':!tests/camera.test.ts'
git commit -m 'fix(story): stage the tour group and frame the dogs' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add -- .mc/tasks/todo/TASK-016-tour-behaviour-polish.md docs/ACTION-RPG.md docs/NEXT-SESSION.md docs/PRD.md docs/design/tour/systems.md e2e/tour-slice.spec.ts src/player/camera.ts src/systems/story/story.css tests/camera.test.ts
git commit -m 'fix(camera): keep the felsenpfad view clear' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
