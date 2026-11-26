---
id: TASK-034
aliases:
- TASK-034
title: 'Player-facing text sweep: German, consistent, no leftovers'
slug: player-facing-german-text
status: in-progress
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
updated: 2026-11-26
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
- [ ] 5. Commit the changes. The worktree index is blocked by the sandbox.

**Test plan:** Run `pnpm typecheck`, `pnpm test`, `pnpm validate`, and `pnpm build`. Run smoke and affected Playwright specs individually through the machine-wide lock on port 5422. Smoke covers title, loading, and entry into the game. Use the direct validator if the normal launcher is blocked.

**Risks:** Translation keys can be overridden by systems. Recorded dialogue must remain byte-for-byte identical after JSON decoding. Keep shared-file edits limited to individual strings.

**Open questions:** None for implementation.

## Progress

- Branch `dev/task-034`, based on `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92`.

- 2026-11-26: Audited the base and feature tables, inline labels, accessibility text and fallback paths. Standardized Reisepunkt, Zeitsprung, Fotomodus and Schnelltaste.
- 2026-11-26: Rebuilt the generated packs and quests. Compared 188 manifest lines and 201 direct or mirrored recorded text entries with the starting revision.
- 2026-11-26: Added the glossary and localization guard. The targeted Vitest run reported 3 passed.

- 2026-11-26: Translated asset modification and library descriptions in „Lizenzen & Quellen“. The voice section of the manifest is byte-identical.
- 2026-11-26: Typecheck and build passed. Vitest reported `Tests  1576 passed (1576)`. The sandbox denied the tsx launcher’s socket for `pnpm validate`. Direct invocation with `node --import tsx scripts/validate-content.ts` passed with the existing warnings.
- 2026-11-26: The locked smoke command stopped before browser startup with `listen EPERM 127.0.0.1:5422`. The affected specs are `e2e/smoke.spec.ts`, `e2e/art.spec.ts` and `e2e/world.spec.ts`. Run each through `KQ_E2E_PORT=5422 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/<spec>.spec.ts --workers=1 --reporter=line`.

- 2026-11-26: `mc validate` passed. The sandbox rejected writes to the worktree's `index.lock`. The changes are unstaged and HEAD remains at the starting revision.

## Follow-ups

- Recorded typography: `laub.k1.gagern`, `laub.k1.feenschloss`, `laub.k3.messen` and `laub.k4.graben` use single quotation marks around standalone quotations.
- Recorded spacing: `player.q.laub` needs a space after the opening ellipsis.
- In-fiction uses of „Feldbuch“ are deliberate (TASK-007). The legacy save migration still recognizes the original labels.

- Intended commits: `fix(content): polish German story and codex text`, `fix(ui): standardize German player-facing copy`, and `docs(ui): record the German player-facing glossary`. Each message includes `Refs: TASK-034` and ends with `Co-Authored-By: Codex <noreply@openai.com>`.
