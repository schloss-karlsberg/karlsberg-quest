---
id: TASK-034
aliases:
- TASK-034
title: 'Player-facing text sweep: German, consistent, no leftovers'
slug: player-facing-german-text
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- localization
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Player-facing German text

## Goal

Make German player-facing copy consistent across menus, prompts, accessible labels, and authored content.

## Acceptance criteria

- [x] Correct English, mixed language, German wording, and quotation marks across player-facing surfaces.
- [x] Standardize interface terminology and remove retired surveyor labels while retaining in-fiction uses.
- [x] Update generated content through its builders and preserve all recorded dialogue text.
- [x] Add a Vitest guard for English UI words and retired surveyor terms, with explicit fiction exceptions.
- [x] Document the canonical terms and add a PRD changelog row.

## Plan

_Status: approved 2026-11-26_

**Approach:** Inspect the base and system translation tables, text rendered inline, and content sources. Keep edits in concurrently owned files local to copy. Compare every recorded dialogue line against the starting revision after rebuilding.

**Files to touch:** `src/i18n/` and player-facing sources under `src/`, `index.html`, content and its generators, focused tests, `docs/`, and the non-voice descriptions in the asset attribution list.

**Steps:**

- [x] 1. Audit and correct UI copy, including settings, controls, errors, and accessible labels.
- [x] 2. Correct authored copy, rebuild generated files, and verify the voiced-text baseline.
- [x] 3. Add the localization check and glossary and update design logs.
- [x] 4. Run the four gates and attempt the locked browser check.
- [x] 5. Commit the original German text sweep (`2f275cb`).

**Test plan:** Run `pnpm typecheck`, `pnpm test`, `pnpm validate`, and `pnpm build`. Run smoke and affected Playwright specs individually through the machine-wide lock on port 5422. Smoke covers title, loading, and entry into the game. Use the direct validator if the normal launcher is blocked.

**Risks:** Translation keys can be overridden by systems. Recorded dialogue must remain byte-for-byte identical after JSON decoding. Keep shared-file edits limited to individual strings.

**Open questions:** None for implementation.

## Review fix plan

The follow-up starts from `2f275cb` on `dev/task-034`. Fix player-facing issues in the tour,
touch controls, controls help and public news. Restore coverage for the Ehrenhof banner and
extend the English-word guard to authored prompts. Preserve recorded dialogue.

- [x] The deer prompt cues the Fotomodus button and then the shutter while the camera is open.
- [x] The sprint prompt explains full stick travel and leaves Aktion unlit.
- [x] The touch Zeitsprung button announces regrouping only while the group hold is offered.
- [x] The controls help and loading tip describe holding Q without an incorrect duration.
- [x] The localization guard checks prompt `key`, `text` and `touch` and ignores internal action IDs.
- [x] The Ehrenhof end-to-end check requires both the visible banner and its German text.
- [x] The public news footer uses „Stand“, matching the in-game revision label.
- [x] Regression assertions, updated docs, four gates and locked browser checks or documented blockers.
- [ ] Local review commits. The sandbox denied creation of the worktree's `index.lock`.

## Progress

- Branch `dev/task-034`, based on `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92`.

- 2026-11-26: Audited the base and feature tables, inline labels, accessibility text and fallback paths. Standardized Reisepunkt, Zeitsprung, Fotomodus and Schnelltaste.
- 2026-11-26: Rebuilt the generated packs and quests. Compared 188 manifest lines and 201 direct or mirrored recorded text entries with the starting revision.
- 2026-11-26: Added the glossary and localization guard. The targeted Vitest run reported 3 passed.

- 2026-11-26: Translated asset modification and library descriptions in „Lizenzen & Quellen“. The voice section of the manifest is byte-identical.
- 2026-11-26: Typecheck and build passed. Vitest reported `Tests  1576 passed (1576)`. The sandbox denied the tsx launcher’s socket for `pnpm validate`. Direct invocation with `node --import tsx scripts/validate-content.ts` passed with the existing warnings.
- 2026-11-26: The locked smoke command stopped before browser startup with `listen EPERM 127.0.0.1:5422`. The affected specs are `e2e/smoke.spec.ts`, `e2e/art.spec.ts` and `e2e/world.spec.ts`. Run each through `KQ_E2E_PORT=5422 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/<spec>.spec.ts --workers=1 --reporter=line`.

- 2026-11-26: `mc validate` passed. The original implementation sandbox rejected writes to the
  worktree index. The sweep was subsequently committed as `2f275cb`.

- 2026-11-26: Fixed all seven review findings. The misleading deer hint, incomplete sprint
  cue mapping, generic regroup label, incorrect return timing and English public footer had
  counterparts on `origin/main` and were small enough to fix within TASK-034. The wording of
  all 50 tour dialogue actions matches `2f275cb`.
- 2026-11-26: `pnpm typecheck` and `pnpm build` passed. Vitest reported
  `Test Files  120 passed (120)` and `Tests  1585 passed (1585)`. The build emitted the
  translated footer in `dist/neu.html`. The sandbox denied the launcher socket for
  `pnpm validate`. The direct validator (`node --import tsx scripts/validate-content.ts`)
  passed with the existing warnings and reported zero story warnings.
- 2026-11-26: The locked run of `e2e/world.spec.ts` stopped at `listen EPERM 127.0.0.1:5422`
  before browser startup. The same preview requirement applies to `e2e/animals.spec.ts`
  and `e2e/smoke.spec.ts`.
- 2026-11-26: `git add` was blocked by `index.lock` permissions. The review changes
  are in this worktree and HEAD is still `2f275cb`.

## Follow-ups

- Recorded typography: `laub.k1.gagern`, `laub.k1.feenschloss`, `laub.k3.messen` and `laub.k4.graben` use single quotation marks around standalone quotations.
- Recorded spacing: `player.q.laub` needs a space after the opening ellipsis.
- In-fiction uses of „Feldbuch“ are deliberate (TASK-007). The legacy save migration still recognizes the original labels.
- Run `e2e/world.spec.ts`, `e2e/animals.spec.ts` and `e2e/smoke.spec.ts` individually with
  `KQ_E2E_PORT=5422 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/<spec>.spec.ts --workers=1 --reporter=line`
  on a machine that can start the preview server.
- Commit the review changes as `fix(touch): correct guided tour control cues` and
  `fix(ui): align German revision and prompt checks`. Include `Refs: TASK-034` and end
  each message with `Co-Authored-By: Codex <noreply@openai.com>`.

## Closed (audit 2026-11-28)

Merged in PR #80. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
