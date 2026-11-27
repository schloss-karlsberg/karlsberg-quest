---
id: TASK-045
aliases:
- TASK-045
title: 'Soft-lock and progress-loss hunt: endings, epilogue, credits and the party'
slug: endings-epilogue-credits-party-progress
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- story
- bug
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Endings, epilogue, credits and party progress

## Goal

Find and fix the most serious progress blockers or losses from the ending choice through free play, without changing the design or voiced text.

## Acceptance Criteria

- [x] Trace all in-scope beats, quests, objectives, credits and party transitions, including out-of-order and repeated play, interruption, save/reload, old saves, replay, touch and reduced motion.
- [x] Reproduce 3–6 serious confirmed bugs with failing Vitest regressions before fixing them; recover already affected saves where possible.
- [x] Keep design, balance, voiced text, dependencies and excluded tasks unchanged.
- [ ] Pass typecheck, unit tests, content validation and build; run touched e2e specs and smoke under the machine lock or record the sandbox blocker.
- [x] Update behaviour docs and changelogs; make reviewable Conventional Commits or report the git blocker and intended messages.

## Plan

_Status: approved 2026-11-26_

**Approach:** Follow the ending data through the story runner and the save lifecycle, then trace the party and credits events back to the final progression gates. Reproduce only confirmed failures, then repair the underlying transitions and recover old saves without replaying committed choices or rewards.

**Files to touch:** relevant ending, party or save paths; existing story and party tests; `docs/PRD.md`, `docs/ACTION-RPG.md` and the relevant story or party documentation.

**Steps:**
- [x] Trace beat, objective, UI and save paths, and screen findings against the task exclusions.
- [x] Add focused regressions and record the failing baseline.
- [x] Fix the confirmed paths, including affected saves, and rerun the focused tests.
- [x] Update behaviour docs and changelogs; run all four gates and attempt locked e2e.
- [x] Record the original implementation in commit `10fdef4`.

**Test plan:** Run focused Vitest files, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. Run smoke and any touched e2e specs individually through `scripts/dev/heavy.sh` on port 5433, one worker per command.

**Risks:** Partial writes can persist contradictory slices; recovery must not reward twice or rewind legitimate postgame play.

**Open questions:** Which interruptions leave an inconsistent checkpoint on the base branch?

### Review repair plan (2026-11-26)

- [x] Compare all seven review findings with `origin/main` and add focused regressions for legacy checkpoints, fresh replay and the manual-step handoff.
- [x] Recover old e1–e3 saves using the choice, party handoff and arrival evidence. Restore replay dialogue and the free-play objective where appropriate.
- [x] Step the browser spec to the first e3 tick before capturing the save, update the behaviour docs and record the result of every finding.
- [x] Run all four gate commands and attempt locked browser coverage. Record sandbox blockers.
- [x] Commit the browser-spec change locally.
- [ ] Commit the remaining review fixes once git can create the worktree index lock.

## Progress

- Branch: `dev/task-045`.
- 2026-11-26: traced the final K4 handoff, e1–e3, variant speeches and spotlights, all eight final NPC placements, the free-play objective and the Keep return route. Endings and party introduce no quest or payout. The epilogue reads the prior deed flags and object, not a new reward.
- 2026-11-26: confirmed seven assertion failures across the two focused suites, plus the separate old e3 replay assertion, before editing production code.
- 2026-11-26: 37 focused tests passed. Added a browser check for loading the e3 entry save and for the credits autosave; documented replay and recovery.
- 2026-11-26: `pnpm typecheck` and `pnpm build` passed; `pnpm test` reported `Tests  1581 passed (1581)` (0 failed). `pnpm validate` could not start: `tsx`'s IPC listener was denied (`listen EPERM`). `mc validate` passed. The content-build script returned clean generated packs and all 26 ending `say` actions match the baseline.
- 2026-11-26: locked `e2e/story.spec.ts` could not start its preview server (`listen EPERM 127.0.0.1:5433`); skipped smoke for the same sandbox restriction. No browser result is claimed.
- 2026-11-26: the original sandbox blocked staging with `index.lock` (`Operation not permitted`). The original implementation is now consolidated in `10fdef4`.
- 2026-11-26 review: the save round-trip suite reproduced eight failing assertions before the repairs. The manual-step regression confirmed that the first tick still saves e2 after a player clicks through without ticking. All 48 focused story and party tests passed after the fixes.
- 2026-11-26 review: `pnpm typecheck`, `pnpm build`, `git diff --check` and `mc validate` passed. `pnpm test` reported `Tests  1592 passed (1592)` (0 failed). `pnpm validate` was blocked by `tsx`'s IPC listener (`listen EPERM`). Locked `e2e/story.spec.ts` was blocked by the preview listener (`listen EPERM 127.0.0.1:5433`). Smoke was skipped because it needs the same listener.
- 2026-11-26 review: the browser-spec change is in `26634fd`. Git denied creation of the worktree's `index.lock` while staging the remaining files (`Operation not permitted`). The save repairs, unit regressions and documentation remain in the worktree.

- 2026-11-26 rebase onto main (#66 TASK-039, #78, #88): the story runtime has one `resume()` path (boot, in-play load, wake after being caught). It re-enters the beat, reopens the e2 epilogue once when the ending is saved but the party handoff is not (TASK-039), and finishes e3 when `story.credits` is already set. Main's title guard and `cancelCaught()` stay in the `save:loaded` handler. Label migration stays in `readStorySlice`; the ending repair is `migrateEndingProgress`, which runs after it in `deserializeState` because it needs flags, player and party. TASK-039's resume test now steps past e3's 0.4 s arrival. The Keep free-play test stores its probe as an object slice, as #88 requires. `tests/save-fuzz.test.ts` now checks that current-format e1–e3 saves load unchanged and that finished legacy saves load with any party slice. `pnpm typecheck`, `pnpm exec vitest run` (2152 passed, 0 failed), `pnpm validate` and `pnpm build` passed. The content builder leaves generated content unchanged; `--story` output matches semantically.
- TASK-067 (e3 reload at the Quelle) appears to be covered by the e3 arrival checkpoint and the legacy pose repair. Verify with the party e2e spec before closing it. TASK-069 (v0.5.0 e2 saves): `migrateEndingProgress` treats an active e2 save with `finished`, `story.credits` and `completed: ['enden']` as an old replay and reopens the epilogue. That task needs to check whether real v0.5.0 saves have this shape.

## Confirmed regressions

Root cause locations refer to the pre-fix revision `d2d1f48`.

| Reproduction | Root cause | Fix | Vitest |
| --- | --- | --- | --- |
| Confirm an ending, then continue from the save written before the next story tick. | `content/story/05-enden.story.json:97` gated e1 on an event latch discarded on resume; `src/systems/story/index.ts:877` reopened the choice. | Complete on the stored choice and open that scene card without asking again. | `keeps a confirmed choice saved before e1 advances and opens that scene` |
| Click through the epilogue and load the first party autosave. | `content/story/05-enden.story.json:139` scheduled the teleport as a one-shot, after the first e3 autosave. | Checkpoint the arrival and snapshot the new pose before saving. Load a later position without teleporting again. | `recovers an e3 autosave from before the plateau teleport without rewinding a later position` |
| Skip credits in the Keep ending and load the autosave immediately. | `src/systems/story/index.ts:547` saved before e3 placed NPCs, restored combat, set the objective and committed the Keep route. | Finalise e3 before the credits autosave; finish and re-save existing partial slots. | `saves free play, NPC placement, and the Keep route when credits are dismissed`; `checkpoints an old autosave taken between credits dismissal and the e3 exit` |
| Load a pre-party slot with another run's animated or static credits still open. | `src/systems/party/runtime.ts:368` wrote to the newly loaded slice during camera teardown; `src/systems/party/runtime.ts:395` counted any abandoned live strip as skipped in the loaded slot. | Bind a live strip to its owning slice. Dismiss it on load without awarding completion; restore the party and skip only credits recorded in the loaded slot. | `does not finish the loaded slot from abandoned credits (reduced motion: %s)` |
| Finish an ending, then select the endings chapter in Pause → Kapitel and choose again. | `src/systems/story/index.ts:1408` restarted the chapter, but `content/story/05-enden.story.json:56` only cleared party scenery; the previous `story.party`, `story.credits` and ending fields survived. | Reset the run on fresh e1, keep deeds and chapter history, and repair identifiable old in-progress replay slots. | `starts a new ending run from chapter replay without inheriting the old party or credits`; `does not skip the party in an old e3 replay carrying the last run’s credits flag` |

## Review findings

| Finding | Result |
| --- | --- |
| 1. Legacy e2 handoff | Fixed. Matching handoffs survive migration. Missing or mismatched handoffs recover the epilogue button on resume, including the original missing-button case. |
| 2. Legacy e1 title-card autosave | Fixed. The old choice latch identifies a confirmed e1 choice even when the preceding party variant is still in the save. |
| 3. Legacy Keep route | Fixed. Repaired replays discard the old Keep reaction marker and route flags. Completing Keep again restores the route. |
| 4. Manual e3 capture | Fixed. Step one tick at a time until e3, then read the entry save before the arrival reaction. |
| 5. Legacy e3 pose | Fixed. The saved timer and distance from the spring identify a completed arrival. Players whose trip is pending still go to the plateau. |
| 6. Finale dialogue on replay | Fixed. Fresh e1 runs reset the finale line IDs. Ordinary resumes keep them. This affected the original chapter replay too. |
| 7. Completed save without an objective | Fixed. Restore the authored free-play hint through the usual objective action, including its replay-slot check. This recovers the original delayed objective. |

## Follow-ups

- Run `pnpm validate` outside the sandbox.
- Run `KQ_E2E_PORT=5433 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/story.spec.ts --workers=1 --reporter=line`.
- Run `KQ_E2E_PORT=5433 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line`.
- Stage and commit the remaining changes from this worktree:

  ```sh
  git add .mc/tasks/todo/TASK-045-endings-epilogue-credits-party-progress.md \
    content/story/README.md docs/ACTION-RPG.md docs/PRD.md docs/design/tour/systems.md \
    src/core/state.ts src/systems/story/endings/ui.ts src/systems/story/index.ts \
    src/systems/story/migrate.ts tests/story-party-save.test.ts
  git commit -m 'fix(story): repair legacy ending checkpoints and replay' \
    -m 'Refs: TASK-045' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```
