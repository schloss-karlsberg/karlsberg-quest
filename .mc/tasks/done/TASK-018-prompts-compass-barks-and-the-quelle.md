---
id: TASK-018
aliases:
- TASK-018
title: Prompts, compass, barks and the Quelle
slug: prompts-compass-barks-and-the-quelle
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- ui
- story
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Prompts, compass, barks and the Quelle

## Goal

Resolve the assigned tour playtest findings in NEXT-SESSION §7.2 while preserving voiced dialogue and the walk-system and camera work in TASK-016.

## Acceptance Criteria

- [x] #8: The Quelle trough interaction is reachable from outside the wall and the tour prompt describes the action.
- [x] #16: The interaction prompt clears for time shifts and cinematics, and the tracker fits on desktop and phones.
- [x] #14 and #15: Verify the title action and lantern-gate line on the main baseline, with a trivial fix only if needed.
- [x] Group and next-stop compass labels have separate rows when looking ahead and at the same edge.
- [x] The group call-out bypasses the global bark interval and keeps its own short cooldown.
- [x] The find-the-group marker matches the objective's gold diamond.
- [x] The Die Führung chapter card uses the usual brief duration and waits during game pauses and hidden tabs.
- [x] The spring prompt and Marlene radio stay clear of the active tour Quelle beat.
- [x] The Bussole objective updates promptly, with the cause recorded.
- [x] The Karlsbergquelle replaces the Weiher as the tracked waypoint on the first frame after the station dialogue.
- [x] Regression tests and behavior documentation are complete. Gate and sandbox results are logged below.
- [ ] The locked tour and smoke specs pass in Chromium. The sandbox denied the preview server listener.

## Plan

**Approach** — Trace the tour script and its HUD, interaction and objective producers. Fix findings at their owning systems and verify existing title and dialogue behavior against the main baseline.

**Files to touch** — Tour content, HUD and story systems, focused Vitest and tour-slice checks, and the tour design and changelogs.

**Steps**

- [x] Verify the title action and lantern-gate dialogue on the main baseline.
- [x] Fix the Quelle interaction and radio suppression and trace the Bussole objective handoff.
- [x] Fix cinematic prompt visibility, tracker sizing, compass label placement, bark priority, marker style and chapter timing.
- [x] Run regression tests and gates, attempt locked browser specs, document results and prepare local commits.

**Test plan** — Targeted unit coverage for changed behavior. Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`. Run the tour slice and smoke specs individually under the heavy lock on port 5404. Check tracker sizing at desktop and phone widths where Chromium is available.

**Risks** — Save and replay progression through the Quelle, competing prompt producers, and narrow mobile HUD space.

## Review fix plan

Restore the complete Quelle instruction on Continue, stabilize the compass and title layout, and
verify the tour flow on desktop and touch. Keep the voiced lines and the existing save format.

- [x] Resume Laub's remaining lines before unlocking water, and preserve the unlocked state on reload.
- [x] Give the guide label its own row across the strip and at the edge. Update marker classes when their values change.
- [x] Reserve the ending-slot action before title readiness and suspend the chapter card while the tab is hidden.
- [x] Scan eligible barks in priority and recency order with a bounded in-place scan.
- [x] Exercise phone bounds with real touch settings and restore the tour slice's same-edge assertion.
- [x] Add unit regressions, run the gates, attempt both locked specs, and update the docs.

## Second review pass

**Goal:** Resolve the reported Weiher-to-Quelle browser regression and reverify the earlier
review fixes without weakening the tour assertions or changing voiced text.

- [x] Identify what keeps the Weiher objective active, and add a regression for the intended handoff.
- [x] Keep the spring objective, recovery call-out and both compass row checks in the tour spec.
- [x] Recheck findings 1–8, run the four gates, and try the locked tour and smoke specs.
- [x] Record outcomes and update the behavior documentation and PRD changelog.

## Progress

- Branch `dev/task-018`, based on `07d3c97` (local `origin/main`).

- 2026-11-26 — Verified #15 against the main tree and the removal of the lantern greeting in
  `904f49d`. For #14, `TitleScreen.setReady` still inserted the continue action above the disabled
  new-game action at load completion. Boot now reads save availability before rendering the title
  and reserves the loader space after readiness. Smoke covers both action positions.
- 2026-11-26 — Moved the Bussole trigger to the forecourt, extended reach for the tour's water
  action, and suppressed the separate spring action until Laub's tour instruction finishes. The
  old objective survived Laub's whole time-estimated introduction. It now updates on pickup and
  the water action follows the last spoken instruction. Unit tests cover the three-metre approach,
  objective order and the ambient radio suppression.
- 2026-11-26 — Added HUD prompt blocking for scenes, wrapping for tracker text, shared objective
  diamonds and a separate compass edge row for the group. The guide's call-out keeps a 15 s group
  cooldown, and the chapter card keeps a 5.5 s hold even when fixed updates run slowly. Unit tests
  cover the bark scheduler and the card clock. Playwright covers prompt visibility, tracker bounds,
  the marker style and edge rows, and the water handoff.
- 2026-11-26 — Typecheck and build passed. Vitest reported `Tests  1576 passed (1576)`. The
  sandbox denied the IPC socket for `pnpm validate`; the same validator passed with
  `node --import tsx scripts/validate-content.ts`. Compared all tour say IDs, text, variants and
  order with `origin/main` and found them identical.

- 2026-11-26 — The first implementation landed locally as `2c47c87` and `8d7dbdf`.

### Review results

| Finding | Status | Verification |
| --- | --- | --- |
| 1. Laub's instruction on Continue | Fixed | The beat reruns the unseen lines until the saved water unlock. Unit coverage loads a save before the first line, midway through and after the unlock. The tour spec exercises both autosaves. |
| 2. Forward compass label overlap | Fixed | The guide label has its own row at every bearing. Unit tests check aligned marker state. The tour spec checks the rendered label bounds looking ahead and at the left edge. |
| 3. Ending action moves the title buttons | Fixed | The pre-existing ending-slot layout shift is in scope. The title renders the disabled action from the saved slots on first paint. Unit and smoke tests cover the action before and after readiness. |
| 4. Hidden tabs consume the chapter card | Fixed | The clock resumes when the tab is visible and the game is running. Unit coverage exercises both orders of returning and unpausing. |
| 5. Compass class churn | Fixed | The marker writes its classes at creation and when its kind or row changes. A unit assertion counts writes across repeated updates. |
| 6. Ineligible bark queue work | Fixed | The scheduler checks eligibility before dialogue and modal checks, scans by priority and recency, and prunes expired requests in place. Unit tests cover priority, expiry and skipping quiet checks during cooldown. |
| 7. Phone objective bounds | Fixed in spec | Playwright verifies auto touch mode in a landscape phone context before measuring. A unit test verifies the coarse-pointer HUD mode at the same viewport size. |
| 8. Tour same-edge assertion | Fixed in spec | The previous heading did not guarantee that both live markers would clamp. The spec aligns the player with the guide and spring, refreshes the objective bearing at the settled position, and checks aligned forward labels and both `l` edge markers without overlap. Unit coverage checks both headings. Browser verification remains pending. |
| 9. Quest lead still points to the Weiher in t14 | Fixed | A single manual step batch draws one frame, so four seconds of simulation did not necessarily cross the pre-existing 10 Hz render-time waypoint refresh. The new tour assertion exposed that cache lag. `objective:set` now prompts a refresh on the next frame, without changing routine marker cadence. Unit coverage checks both the story handoff and the live quest lead, compass marker and world waymark. |

- 2026-11-26 — `pnpm typecheck` and `pnpm build` passed. Vitest reported
  `Tests  1587 passed (1587)` with zero failures. `pnpm validate` stopped at the sandbox's
  `tsx` IPC listener. The same validator passed via `node --import tsx scripts/validate-content.ts`
  with zero story warnings. `mc validate` passed. All 50 tour say actions retained their IDs,
  speakers, text and order.
- 2026-11-26 — The first review fixes were committed as `3bb1e0c`.
- 2026-11-26 — Second review pass: changed the quest waypoint refresh, not the tour dialogue or
  route. `pnpm typecheck`, `pnpm test`, and `pnpm build` passed; `Tests  1588 passed (1588)` with
  zero failures. `pnpm validate` was blocked by the `tsx` IPC listener (`listen EPERM`); the same
  validator passed via `node --import tsx scripts/validate-content.ts` with zero story warnings.
  All 50 tour say actions still match `origin/main` in ID, speaker, text, variants and order.
- 2026-11-26 — `mc validate` passed. Git staging was blocked by the worktree `index.lock`
  sandbox restriction; no new commit was made.

## Follow-ups

- Both locked browser runs in the second pass stopped at `listen EPERM` on `127.0.0.1:5404`.
  Verify the tour slice and smoke specs after `pnpm build` where the preview listener is available.
- Rerun `pnpm validate` where the `tsx` IPC listener is available.
- Stage this review pass and commit `fix(ui): refresh the tour waypoint on objective changes`
  with the Codex co-author trailer where the worktree index is writable.

  ```sh
  KQ_E2E_PORT=5404 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5404 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```
- The remaining §7.2 items stay with their own tasks. The group movement and camera work belongs
  to TASK-016.

## Closed (audit 2026-11-28)

Merged in PR #106. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
