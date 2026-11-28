---
id: TASK-078
aliases:
- TASK-078
title: Talk prompt reads „Mit Der Hofgärtner sprechen“
slug: talk-prompt-grammar-mit-der
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- ui
- localization
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# Talk prompt reads „Mit Der Hofgärtner sprechen“

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810). In chapter 1, near the gardener at
the Orangerie, the interaction prompt reads „E Mit Der Hofgärtner sprechen“. The correct German
is „Mit dem Hofgärtner sprechen“.

## Cause

`src/systems/npc/index.ts` builds the prompt from `'npc.prompt': 'Mit {name} sprechen'`, and
some speaker names in `content/packs/speakers.pack.json` (built by
`scripts/content-build/speakers.mjs`) start with an article: „Der Hofgärtner“, „Der Kommissär“,
„Die Menge“. The article is neither lower-cased nor declined (dative).

## Acceptance criteria

- [x] Talk prompts for article names read correctly („Mit dem Hofgärtner sprechen“, „Mit dem
      Kommissär sprechen“), for example via an optional dative form per speaker
      (`prompt_de`) or a neutral prompt („Sprechen: Der Hofgärtner“).
- [x] Names without an article are unchanged.
- [x] A unit test covers one article name and one plain name.

## Plan
_Status: approved 2026-11-27_

**Approach:** The talk prompt puts the speaker's display name into „Mit {name} sprechen“, and that name is in the nominative. So the placed people in chapter 1 read „Mit Der Hofgärtner sprechen“, „Mit Ein Gardist sprechen“, „Mit Ein Lakai sprechen“, „Mit Zweiter Gärtner sprechen“ and „Mit Diener sprechen“, and the party pack has „Mit Herr Soll sprechen“. German declension can't be computed from the name: weak nouns such as Gardist → Gardisten and Lakai → Lakaien break any rule. So each speaker gets an optional dative form `dative_de` in its pack („dem Hofgärtner“, „einem Gardisten“), and the prompt uses it when present, else the name. Names without an article (Hanne, Gerold Imhoff · Führung, Kanzlist Gottlob Soll) need nothing and stay unchanged. A content test keeps it that way: every speaker whose name starts with an article (Der, Die, Das, Ein, Eine, Zweite, Zweiter) must have a `dative_de`.

**Files to touch:**
- `src/content/types.ts` - `Speaker.dative_de?: string`.
- `content/schema/pack.schema.json` - allow `dative_de` on a speaker.
- `src/systems/story/dialogue/speakers.ts` - `speakerDative(id, content)`: the pack's `dative_de`, else the display name.
- `src/systems/npc/index.ts` - the talk prompt (and its "is the name still shown" check) uses `speakerDative`.
- `scripts/content-build/speakers.mjs` - an optional 4th argument for the dative, set for every name with an article (Der Hofgärtner, Ein Gardist, Ein Lakai, Zweiter Gärtner, Der Kommissär, Die Menge, …) and for „Diener“ („dem Diener“); then `node scripts/content-build/build.mjs` regenerates `content/packs/speakers.pack.json`.
- `content/packs/party.pack.json` - `solld` „Herr Soll“ gets „Herrn Soll“ (no builder, edited directly).
- `tests/npc-prompt-name.test.ts` (new) - `speakerDative` for an article name (hofgaertner → „dem Hofgärtner“) and a plain name (hanne → „Hanne“); the content rule above; „Diener“ and „Herr Soll“ by name.
- `tests/npc-encounter.test.ts` - the HUD prompt text for a speaker with `dative_de` („Mit dem … sprechen“) and one without.
- `docs/ARCHITECTURE.md` (npc), `content/story/README.md` if it lists speaker fields, `docs/PRD.md` changelog.

**Steps:**
- [x] 1. `dative_de` in the type and schema; `speakerDative()` with unit tests.
- [x] 2. The npc prompt uses it; HUD prompt test in `tests/npc-encounter.test.ts`.
- [x] 3. Dative forms in `speakers.mjs` (and `party.pack.json`), rebuild, `pnpm validate`; content rule test.
- [x] 4. Docs.
- [x] 5. Gates, e2e `npc.spec.ts`, after screenshots.

**Test plan:**
- Unit: `pnpm exec vitest run tests/npc-prompt-name.test.ts tests/npc-encounter.test.ts`.
- e2e: `pnpm build && pnpm exec playwright test e2e/npc.spec.ts --workers=1`. Also grep the specs for „ sprechen“ expectations and run the ones found.
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`.
- Manual: `http://localhost:5280/?debug&nosave&fresh&notitle`, then in the console `kq.story.goto('k1', 'k1_0b')` and walk to the gardener at the Orangerie (about x 1221, z -993, 1789). Expect „E Mit dem Hofgärtner sprechen“; next to Hanne it still reads „E Mit Hanne sprechen“.
- Screenshots (desktop, real GPU), before / after: the prompt next to the Hofgärtner, and next to a Gardist at the gate (k1_0b).

**Risks:**
- A new speaker named with an article but no dative falls back to the old wording; the content test catches it. A bare noun without an article (like „Diener“) can't be detected automatically, so it stays a review point.
- „Liese, Wäscherin“ stays as it is („Mit Liese, Wäscherin sprechen“ reads like a name label).
- Other texts that use the name keep the nominative, which is right there (court captions „[Der Hofgärtner sieht herüber – …]“, speaker labels in the dialogue box).

**Open questions:** none. I chose the dative form over the neutral „Sprechen: Der Hofgärtner“, because it keeps the familiar „Mit Hanne sprechen“ for everyone else.

## Progress

- Branch: `fix/task-078-talk-prompt-dative`
- 2026-11-27: before screenshots (real GPU, Iris Xe) in `test-results/contribute/TASK-078/`: k1_0b (1789), next to the Hofgärtner „E Mit Der Hofgärtner sprechen“ and next to a Gardist „E Mit Ein Gardist sprechen“.
- 2026-11-27: step 1 done - `Speaker.dative_de` (type, `content/schema/pack.schema.json`, `src/content/validate.ts`: a non-empty string if set); `speakerDative()` in `src/systems/story/dialogue/speakers.ts`; `tests/npc-prompt-name.test.ts`: an article name gives its dative form, a plain name, a built-in and an unknown id stay as they are.
- 2026-11-27: step 2 done - `src/systems/npc/index.ts`: the talk prompt and its "is the name still shown" check use `speakerDative`. `tests/npc-encounter.test.ts`: „Mit dem Kanzlisten sprechen“ for a speaker with `dative_de`, „Mit Kanzlist Gottlob Soll sprechen“ without; fails on the old code. Set on the test context, not in the shared harness, so it does not overlap with PR #126.
- 2026-11-27: step 3 done - `scripts/content-build/speakers.mjs`: `sp()` takes an optional dative; set for every name with an article (20, e.g. „dem Hofgärtner“, „einem Gardisten“, „einem Lakaien“, „dem zweiten Gärtner“, „dem Kommissär“, „der Menge“) and for „Diener“ („dem Diener“); `node scripts/content-build/build.mjs` regenerated `content/packs/speakers.pack.json` (no other pack changed). `content/packs/party.pack.json`: „Herr Soll“ → „Herrn Soll“. `tests/npc-prompt-name.test.ts`: every article name has a lower-case dative; every placed person (story `npc spawn`, built-ins included) reads right after „Mit“; red without the new forms. `pnpm validate` green (28 warnings, none new).
- 2026-11-27: step 4 done - `docs/ARCHITECTURE.md` (npc: the prompt in the dative, `speakerDative`, the content rule), a row in `docs/ACTION-RPG.md` §14 and in the `docs/PRD.md` changelog (placed below the TASK-083 row and below the TASK-006 row, so they do not touch the lines PR #126 changes).
- 2026-11-27: step 5 done, gates green - `pnpm typecheck`, `pnpm validate` (28 warnings, none new), `pnpm build` green. `pnpm test`: 2,386 passed; 5 files fail locally, the known Windows-only ones (`content-packs`, `save-fuzz`, `voice-moss`, `voice-assets`, `voice-service`, also on untouched `main`). e2e `--workers=1`: `npc.spec.ts` 2/2, `chapter-k1-disguise.spec.ts` 2/2 (Hofgärtner and the gate Gardist), `court.spec.ts` 5/5. After screenshots (real GPU) in `test-results/contribute/TASK-078/`: „E Mit dem Hofgärtner sprechen“ and „E Mit einem Gardisten sprechen“.
- 2026-11-27: PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/127

## Closed (audit 2026-11-28)

Merged in PR #127. All acceptance criteria are met on main (`f8a75ff7`), and the hosted e2e suite is green.
