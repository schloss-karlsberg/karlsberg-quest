---
id: TASK-041
aliases:
- TASK-041
title: 'Chapter 1: soft-lock and progress-loss hunt'
slug: k1-soft-lock-and-progress-loss
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- quests
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Chapter 1: soft-lock and progress-loss hunt

## Goal

Audit Chapter 1 from the spring to the chapter handoff, including side quests, and fix
the most serious confirmed progress blockers, losses and misleading next steps.

## Acceptance Criteria

- [x] Trace all K1 beats, quests and objectives against ordering, persistence, interruption,
  touch, reduced motion, chapter replay and older saves.
- [x] Confirm and fix 3–6 in-scope issues with Vitest regressions that fail before the fixes;
  recover already affected saves where applicable.
- [x] Preserve voiced dialogue, existing design and balance, and other tasks' scope.
- [x] Update behaviour docs and the PRD changelog; record reproductions, causes, fixes and tests.
- [ ] Run the four gates with zero unit failures; run touched specs and smoke under the lock
  on port 5429, or document the sandbox block.
- [x] Commit in logical pieces with Conventional Commits and the requested co-author trailer,
  or record the intended messages if Git is sandbox-blocked.
- [x] Recover legacy Die Enge replays before the encounter and preserve genuine encounter clears.
- [x] Restore the missing Schuldbuch kill rewards once, including after saving and loading again.
- [x] Verify a real level-up kill autosave captures current resources and idle combat batches
  avoid a second event scan.

## Plan

_Status: approved 2026-11-26_

**Approach:** Map generated K1 beats and objectives to the runtime paths that start, advance,
save and restore them. Start from the existing story and quest test helpers, prove each defect
before editing runtime or content, and target recovery to affected progress states.

**Files to touch:** K1 builder and generated JSON if needed, affected story/quest/save handlers,
existing Vitest suites, directly relevant e2e coverage, and behaviour docs plus `docs/PRD.md`.

**Steps:**
- [x] Audit K1 data and runtime transitions, excluding the separately assigned defects.
- [x] Write and run failing regressions for the highest-impact findings.
- [x] Fix the confirmed issues and verify recovery and idempotence.
- [x] Update docs, run gates and eligible e2e, and record results.
- [x] Commit locally or record the blocked commit commands. Do not push or open a PR.

**Test plan:** Targeted Vitest first, then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
Run touched Playwright specs and smoke separately with `KQ_E2E_PORT=5429` and the machine lock.

**Risks:** Shared runtime code affects later chapters; keep recovery narrow and avoid overlapping
echo, item-use, fast-travel, input or Die Enge wave-persistence work.

**Open questions:** Which persisted states can be repaired without granting unearned rewards?

### Review fix plan (2026-11-26)

**Approach:** Use the current beat and wave trigger to distinguish stale Die Enge groups from
current progress. Identify the legacy Schuldbuch autosave from its recorded drop and kill state,
and use the regular reward rules for the missing items and XP. Flush kill autosaves after the
combat resources are written and track kill batches as the simulation queues events.

**Files to touch:** Story migration, quest recovery, combat simulation and runtime, their Vitest
suites, behaviour documentation and the PRD changelog.

**Steps:**

- [x] Add regression assertions and correct Die Enge migration.
- [x] Reproduce the old Schuldbuch reward order and repair missing rewards.
- [x] Exercise the real autosave on a level-up kill and verify the per-batch kill flag resets.
- [x] Update docs, attempt all four gates and both locked Playwright specs, and commit locally or
  record blocked commit commands.

**Test plan:** Run focused Vitest suites, all four gates, then `e2e/chapter-k1.spec.ts` and
`e2e/smoke.spec.ts` separately under the lock on port 5429.

**Risks:** Only grant XP and loot when the saved event ordering establishes what is missing.

## Progress

- Branch: `dev/task-041`.
- 2026-11-26: Recorded the audit and test plan before implementation.
- 2026-11-26: Confirmed four defects with five failing Vitest regressions (combat save ordering
  has two cases). Early paperwork already reconciles from saved talk and clue evidence.
- 2026-11-26: Fixed all four; `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported
  `Test Files  118 passed (118)` and `Tests  1578 passed (1578)` with no failures.
  `pnpm validate` could not start: the sandbox denied the `tsx` IPC socket with `EPERM`.
  Both locked browser commands reached the Vite preview startup and were blocked by `EPERM`
  binding `127.0.0.1:5429`. No browser assertions ran.
- 2026-11-26: Compared all 42 story `say` IDs and texts against HEAD; all are unchanged.
  The original sandbox run could not stage changes. The initial implementation was subsequently
  committed as `2d80af9`.
- 2026-11-26: Review regressions reproduced all four findings. The focused suites passed with
  `Tests  85 passed (85)` after the fixes. The new combat test reads the actual autosave bytes,
  and the Schuldbuch test takes a reconstructed drop before saving and loading again.
- 2026-11-26: Review verification passed `pnpm typecheck`, `pnpm test`, `pnpm build` and
  `mc validate`. Vitest reported `Test Files  119 passed (119)` and `Tests  1587 passed (1587)`
  with zero failures. `pnpm validate` was blocked by the sandbox's `EPERM` on the `tsx` IPC socket.
  Both locked Playwright commands failed during Vite preview startup because the sandbox denied
  binding `127.0.0.1:5429` with `EPERM`. No browser assertions ran.
- 2026-11-26: Committed replay migration (`943ddcf`) and Schuldbuch recovery (`d572824`). The
  sandbox denied `index.lock` for the final commit. Combat changes, tests and documentation are in
  the worktree. The review round made no dialogue or voice asset changes.

## Audit

| Beats | Quest objectives and runtime checks |
| --- | --- |
| `k1_0`, `k1_0b`, `k1_0c`, `k1_1` | Spring touch → summer shift; arrival `quelle`, `wechsel`, `wache`, `fluegel`. Coat theft or `bitte` → `zettel` → `rock`; paper talk then letter `schreiben`, inspection sets admission. Checked old arrival prerequisite, recovered touch/return at the spring, early paperwork already settled, gate and disguise flags, caught/re-entered wayfinding. |
| `k1_2`, `k1_3` | Soll's `rechenbrett`, `kaufbrief`, `heft` → Mahnbriefe `briefe` → payout and Hanne's offer. Hanne's `soll`, `zeichen` → `buch` → `zettel` → payout. Traced saved clues, quest/group ownership, autosave timing, guaranteed drop and dusk cue. Festpläne: `briefe`, `jahrmarkt`, `karlslust`, `hofgarten`, `mannlich`, `lohn`; verified ordering against the three item IDs and the two clue records. |
| `k1_5`, `k1_6`, `k1_7` | Jost's `lehre`, `fleisch` → `bringen` → `streuner`, then return and terrace Q. Hundenamen: `diane`, `sultan`, `fanfare`, `rauhreif`, `bijou`; distinct pickup IDs, carried quest counts and chapter-side-quest cleanup. |
| `k1_8`, `k1_9`, `k1_10`, `k1_11`, `k1_12`, `k1_13` | Karlslust `terrasse`, `rund`, `baeren`, `lichter`, `rondell`, `seite`; checked repeated zone/clue access, memorial hold, patrol/lantern setup and the Tschifflik return anchor. Kasuar `beruhigen`: same animal ID on early story spawn and quest spawn; saved `calmed` survives the animal leaving. |
| `k1_14`, `k1_14b`, `k1_14c`, `k1_15`, `k1_16`, `k1_17` | Hunt goal/zone → two pack clears → water → `flucht` and `heim` → quest payout and transition. Traced caught/era return, saved cleared groups, the replay entry and both closing autosaves. In-run wave recovery remains TASK-038. |

Touch and reduced-motion paths were checked at the shared source, NPC, memorial, combat, hunt and
save interfaces. This patch changes neither controls nor presentation timing. Browser confirmation
of those paths is still outstanding where the sandbox blocks preview.

## Findings

1. **Older arrival save.** Load a pre-spring save at Ankunft after `wechsel`; the gate echo and
   wings do not finish the quest because the newer `quelle` event never ran. The added prerequisite
   is in `scripts/content-build/kapitel1.mjs:476`; the `k1_1` beat in
   `content/story/01-kapitel-1.story.json:1624` now credits it on entry or resume without paying twice.
   Test: `resumes a pre-Quelle arrival save without requiring a second spring touch`.
2. **Kill autosave.** Allow the autosave throttle to expire, kill the last Registratur Mahnbrief or
   the Schuldbuch, then Continue before another save. `src/systems/combat/sim.ts:1721` has already
   persisted the clear in memory when `src/systems/progression/index.ts:257` saves from the named
   listener, ahead of the quest's `onAny` handler. The updated quest count and wage slip are missing.
   Hold saves for the full combat event batch; repair old counts from quest-owned groups and place
   a missing wage slip at the boss's spawn without duplicating existing loot. Tests:
   `reconciles an autosave with the Registratur pack cleared one kill ahead of the quest` and
   `restores the wage slip after reloading a save taken during the Schuldbuch kill`.
3. **Kasuar before quest acceptance.** Lead the bird home when first reaching Tschifflik, then take
   the gardener's quest. It stays active: `src/systems/menagerie/index.ts:218` suppresses the calmed
   animal and `src/systems/quests/logic.ts:625` previously needed a live event. Match the quest's
   exact saved encounter ID on acceptance/restore; the gardener still pays only on turn-in.
   Test: `lets the gardener pay once for the Kasuar led home before quest acceptance`.
4. **Die Enge on chapter replay.** Finish K1, select it again in Pause → Kapitel, then reach Die
   Enge. `src/systems/combat/rules.ts:464` keeps the killed count when the story respawns an existing
   group, so the encounter cannot emit a new clear. Clear both groups only at fresh chapter entry;
   migrate older replays with stale cleared groups without resetting an in-run wave.
   Test: `clears both completed Die Enge packs on a chapter replay, not on resume`.

### Review findings

1. **Fixed.** Use the saved beat before Die Enge to clear leftover packs from a prior run,
   including a lone first pack. After Die Enge the migration preserves both clear records.
2. **Fixed.** The old first-drop save is identifiable by the defeated quest boss, pending
   kill credit and partial loot roll. Restore 200 base XP, bestiary credit, Riechsalz, Lampenöl
   and Kalkstaub. Existing quest recovery restores the Lohnzettel. The same roll IDs survive a
   second load, including a pickup already taken.
3. **Fixed.** Release the combat autosave after copying HP, stamina and Bannlicht. An actual
   level-up kill writes those values to the raw autosave.
4. **Fixed.** The simulation flags a kill when it queues the event and resets the flag when
   draining the batch. The dispatch loop no longer scans for a kill first.

## Follow-ups

- Run `pnpm validate` outside the IPC restriction, then run `e2e/chapter-k1.spec.ts` and
  `e2e/smoke.spec.ts` separately with `KQ_E2E_PORT=5429 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test <spec> --workers=1 --reporter=line`.
- Keep interrupted echoes and saves between Die Enge waves with TASK-029 and TASK-038.
- No voiced lines need new text.

## Intended Commit

Run from this worktree with write access to its Git index.

```sh
git add -- src/systems/combat/index.ts src/systems/combat/sim.ts tests/combat.test.ts tests/combat-autosave.test.ts docs/ACTION-RPG.md docs/ARCHITECTURE.md docs/PRD.md .mc/tasks/todo/TASK-041-k1-soft-lock-and-progress-loss.md
git commit -m 'fix(combat): capture updated vitals in kill autosaves' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
%% mc-links: [[SPR-001]] %%

## Closed (audit 2026-11-28)

Merged in PR #99. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
