---
id: TASK-076
aliases:
- TASK-076
title: 'Talking to the guide at tour stops 2 to 4 opens an empty dialogue'
slug: empty-guide-dialogue-at-tour-stops
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- tour
- ui
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Talking to the guide at tour stops 2 to 4 opens an empty dialogue

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, real GPU, desktop). At the
Felsenpfad stop (t6) the HUD shows „E Mit Gerold Imhoff · Führung sprechen“ while the guide
gives his talk through the radio box. Pressing E opens the NPC dialogue with the portrait and
name but **no text**, only „Auf Wiedersehen“. The same prompt is on screen at the Weiher (t13)
and the Quelle (t15). A first-time player who follows the prompt sees a broken, empty box.

## Steps

1. New game, play the tour to the Felsenpfad stop (no debug flags).
2. When the group gathers and Gerold starts „So. Seht ihr den Buntsandstein …“, press E.
3. The dialogue opens empty (screenshot below). Pick 1 to close it; the talk continues in the
   radio box.

Screenshot (scratchpad of the playtest session):
local screenshot `d01-t6-empty-guide-dialog.jpg` (not committed)

## Likely cause

The stops t6, t13 and t15 in `content/story/00-tour.story.json` speak through `say` lines, but
the generic NPC talk prompt for `imhoff` (`src/systems/npc/index.ts`, `npc.prompt`) stays active
and has nothing to show. Only t2 has a real dialogue.

## Acceptance criteria

- [ ] At t6, t13 and t15 the guide either offers no talk prompt while he has nothing to say, or E
      opens a dialogue with real lines (for example a repeat of the stop's talk).
- [ ] No NPC dialogue in the tour or chapters opens with empty text (a unit or e2e check).
- [ ] t2 (the first conversation) still works as before.

## Plan
_Status: approved 2026-11-27_

**Approach:** The guide's only conversation lines are the three stop-1 greetings
(`imhoff.t.station1`, `…1a`, `…1b`, all `once`). After t2 they are spoken and he has no
menu topics, but his placement (spawned at t2, removed only on t15's exit) still claims E. `open()`
then shows only „Auf Wiedersehen“: its „(Schweigt und sieht dich an.)“ fallback only covers NPCs
with no lines at all. The fix goes into the npc system, for every NPC: a placed person offers E
only while it has something to say now (a greeting that can still play, a menu topic, or a quest
topic). Silent ghosts with no lines at all keep their „(Schweigt …)“ answer. `open()` gets the
same rule as a guard, so even a forced open never shows an empty box. In the tour, the stop-1
greetings are also tied to stop 1 (flag `tour.station1.ready`, cleared on t2's exit). So a player
who skipped the talk at the car park does not get the car-park talk at the Felsenpfad.

**Files to touch:**
- `src/systems/npc/logic.ts` - pure `offersTalk()`: a greeting left, a menu topic, a quest topic, or a silent ghost.
- `src/systems/npc/index.ts` - in `update()`, the nearest-NPC choice skips NPCs with nothing to say (no prompt, no `npc.near`, so E stays free for others); `open()` falls back to the silent line instead of an empty box; talk lines cached per NPC and chapter.
- `content/packs/tour.pack.json` - the three stop-1 greetings get `"flag": "tour.station1.ready"` (no builder, edited directly).
- `content/story/00-tour.story.json` - t2's `exit` clears `tour.station1.ready`.
- `tests/story-ext.test.ts` - unit tests for `offersTalk()`.
- `tests/tour-slice.test.ts` - the stop-1 greeting test with the flag; the flag is gone after t2.
- `tests/npc-talk-waits.test.ts` (new) - content check: every beat that waits for a talk (`talked` / `npc:conversation`) has an NPC that can talk then (a greeting or topic whose conditions hold, counting flags the beat's `enter` sets).
- `e2e/tour-slice.spec.ts` - new test: E at t2 as before, then no talk prompt next to the guide at t6, t13 and t15, and a forced open shows the silent line.
- `docs/ARCHITECTURE.md` - the npc note on E, if it describes it.

**Steps:**
- [x] 1. `offersTalk()` in `logic.ts` with unit tests (`tests/story-ext.test.ts`).
- [x] 2. npc system: `update()` offers E only to NPCs with something to say; `open()` guard; cached talk lines.
- [x] 3. Tour content: stop-1 greetings need `tour.station1.ready`; t2's `exit` clears it; update `tests/tour-slice.test.ts`.
- [x] 4. Content check `tests/npc-talk-waits.test.ts`: no beat waits for a talk with an NPC that has nothing to say then.
- [x] 5. e2e test in `e2e/tour-slice.spec.ts` (t2, t6, t13, t15, forced open).
- [x] 6. Docs (`docs/ARCHITECTURE.md` npc note).
- [x] 7. Gates, e2e runs, after screenshots.

**Test plan:**
- Unit: `pnpm exec vitest run tests/story-ext.test.ts tests/tour-slice.test.ts tests/npc-talk-waits.test.ts`.
- e2e: `pnpm build && pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1`, plus the other specs that open NPC conversations (found with grep for `npc!.talk` / `KeyE`).
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`.
- Manual: `http://localhost:5280/?debug&nosave&fresh&notitle`. Run `kq.story.goto('tour','t2')`, talk to Gerold with E, then `kq.story.goto('tour','t6')` and stand next to him. Expect no „Mit Gerold Imhoff · Führung sprechen“, and E does nothing.
- Screenshots (desktop, real GPU), before / after:
  1. t6 next to the guide after pressing E. Before: the empty dialogue; after: no prompt.
  2. t2 at the car park: the first conversation, unchanged.

**Risks:**
- Hiding E could block a beat that waits for a talk. The content check in step 4 covers it; today
  every such beat has an NPC with lines that can always play.
- A quest topic that arrives later brings E back at once: `offersTalk()` reads the live quest topics.
- Per-frame cost: the check runs only for NPCs within talk range (2.8 m), on cached lines.
- A revisit to an NPC with menu topics but no greeting left still opens on the question menu
  without a line (unchanged; that is the normal „ask again“ state, not an empty box).

**Open questions:** none. The criteria allow either no prompt or real lines. I chose no prompt,
because at the stops the guide is already talking in the speech box.

## Progress

- Branch: `fix/task-076-empty-guide-dialogue`
- 2026-11-27: before screenshots (real GPU, Iris Xe) in `test-results/contribute/TASK-076/`: the E prompt at t2, the first talk, the prompt at t6 during the guide's talk, and the empty box (only „Auf Wiedersehen“) after E at t6 and t13.
- 2026-11-27: step 1 done - `offersTalk()` in `src/systems/npc/logic.ts`; `tests/story-ext.test.ts`: the guide, Hanne (k1, k3g), a silent figure, quest topics, and a check that it agrees with `answer` / `availableTopics` for every NPC in the k1, k3, tour and endings packs.
- 2026-11-27: step 2 done - `src/systems/npc/index.ts`: the nearest-NPC choice skips a placement with nothing to say (no prompt, no `npc.near`); `open()` says „(Schweigt und sieht dich an.)“ when there is no greeting, topic or quest topic; talk lines cached per NPC and chapter. `tests/npc-encounter.test.ts`: the reload case gives Soll a question so it still reopens; new case (no E once all is said, a forced open shows the silent line) fails on the old code.
- 2026-11-27: step 3 done - the three stop-1 greetings in `content/packs/tour.pack.json` need `tour.station1.ready`; t2's `exit` clears it. `tests/tour-slice.test.ts`: no car-park talk without the flag, the flag is gone after t2. `pnpm validate` green (28 warnings, none new).
- 2026-11-27: step 4 done - `tests/npc-talk-waits.test.ts` (named so it does not mix with the existing `npc-talk-hint`): every beat `complete` and every `on[].when` (story and beat level) of the tour and chapters 1-4 that waits for a talk (`talked`, a closed `npc:conversation`) has someone who offers E then (`offersTalk` with the flags the beat's `enter` sets); an `any` with a timer or another way out does not block; a wait for one topic is skipped (whenever the topic is in the menu, E is offered). Plan updated: the file name.
- 2026-11-27: step 6 done - `docs/ARCHITECTURE.md` (npc: E only with something to say, the silent-line guard, the talk-wait check), a row in `docs/ACTION-RPG.md` §14 and in the `docs/PRD.md` changelog.
- 2026-11-27: step 5 done - new test in `e2e/tour-slice.spec.ts` (t2 talk as before; no prompt and no conversation next to the guide at t6, t13, t15; a forced open says the silent line): green in 3.0 min, and red on the old npc code (at „no E after the car-park talk“). It counts only the visible prompt (`.kq-prompt.show`): the HUD keeps the last text in the hidden element.
- 2026-11-27: step 7 done, gates green - `pnpm typecheck`, `pnpm validate` (28 warnings, none new), `pnpm build` green. `pnpm test`: 2,365 passed; 6 files fail locally: `content-packs`, `save-fuzz`, `voice-moss`, `voice-assets`, `voice-service` (the known Windows-only ones, also on untouched `main`) and `i18n-text` (its 5 s timeout on a cold start; alone with a longer timeout it passes, 6/6). e2e `--workers=1`: `npc.spec.ts` 2/2, `tour-slice.spec.ts` 2/3 (the new test and the landscape-phone test green), `integration.spec.ts` 0/2. The three red ones fail on untouched `main` too, in a `main` worktree on this machine: integration „the tour and K1“ at the chapter card „Die Führung“ (its 5.5 s wall-clock cap under SwiftShader; `main` twice at the same line), integration „round 2“ waiting for Hanne's fade-in (`alpha > 0.95`, same line on `main`; `near` is still „hanne“ on this branch), and the full tour run (the 10-minute test timeout, on `main` too). After screenshots (real GPU) in `test-results/contribute/TASK-076/`: no talk prompt and no box at t6 and t13; the t2 talk unchanged.
