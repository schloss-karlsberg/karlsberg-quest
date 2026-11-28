---
id: TASK-089
aliases:
- TASK-089
title: 'Story structure: travel in time once and stay; the tour is chapter 1, „Der Hof“ is chapter 2'
slug: one-time-travel-tour-is-chapter-1
status: todo
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
- story
- quests
- saves
- content
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Story structure: travel in time once and stay; the tour is chapter 1, „Der Hof“ is chapter 2

## Goal

Owner feedback (2026-11-28, verbatim): "we need to revise the first 'timetravel' thing. it does
not make sense that we travel in time, then just 'look' and travel back. i just want to travel
once and stay there. if i travel, tutorials (chapter 1 finishes) and chapter 2 begins (outside the
castle)."

Today the tour ends with a 15-second look at 1789, a fade to black and a return to the present;
„Der Hof“ then asks for a second touch of the spring. After this task the first touch is the
journey: the tour (chapter 1, the tutorials) ends at the jump, the player stays in 1789 at the
spring below the palace, and chapter 2 „Der Hof“ begins there, outside the gate.

## Acceptance criteria

- [ ] A new game has exactly one „Wasser berühren“ before the court: touch at `tour/t17`, arrive in
      1789, keep control, no fade to black, no return to the present, no second touch.
- [ ] The chapter card after the jump reads „Der Hof“ / „Kapitel 2 · Sommer 1789“ and shows in 1789
      at the Brunnenstube; the first objective is the coat at the Bleiche („Ein Rock, der nicht
      leuchtet …“).
- [ ] Chapter labels for the player: Kapitel 1 „Die Führung“, 2 „Der Hof“, 3 „Die Flucht“,
      4 „Die Nacht“, 5 „Der Steinbruch“; no „Prolog“ on a card or in Pause → Kapitel.
- [ ] No tutorial is taught twice or lost (table in „Target flow“).
- [ ] Old saves at every point of the old flow load and can finish the game: `tour/t1…t18`,
      `k1/k1_0` (present, waiting for the second touch), `k1/k1_0b…`, legacy `prolog` saves. Unit
      tests cover each; none needs a touch that is no longer offered.
- [ ] `pnpm typecheck && pnpm test && pnpm validate && pnpm build` green per PR; the hosted e2e
      suite green per PR (campaign included).
- [ ] PRD, tour design, bibles and the story README describe the new flow.

## Analysis

### 1. Current flow (title → first hour of 1789)

Chapter ids and files: `tour` (`content/story/00-tour.story.json`, `order -1`, card „Die Führung“ /
„Prolog · heute, ein Novembernachmittag“, `next: k1`), `k1` (`01-kapitel-1.story.json`, „Der Hof“ /
„Kapitel 1 · Sommer 1789“), `k2` „Die Flucht“ / „Kapitel 2 · …“, `k3` „Die Nacht“ / „Kapitel 3 · …“,
`k4` „Der Steinbruch“ / „Kapitel 4 · …“, `enden`. The story JSON of `k1…k4` is edited directly (no
builder writes it); `scripts/content-build/kapitel1.mjs` / `kapitel2.mjs` write the K1/K2 quest
files and all `kapitel-N.pack.json`; the tour files have no builder.

| Step | Where | What happens |
| --- | --- | --- |
| Title | `src/systems/story/title/flow.ts` | „Neues Spiel“ → content warning → name → route card „Tour starten“ → `story.start()` → `tour/t1` |
| `t1`–`t2` | car park, today | card „Die Führung“; prompts WASD / look, E „Gerold zuhören“; flags `combat.disabled`, `laub.silent` |
| `t3`–`t9` | Felsenpfad, slope | follow the group (Q hold = „Zur Gruppe“), run prompt (`t5`), two fade shortcuts (`t4`, `t11`), dog cinematic (`t8`, skippable) |
| `t10` | deer | sneak prompt, photo mode (N), cinematic `content/cinematics/reh.json` |
| `t13` | Weiher | Marlene lends `item.stab.esche` |
| `t14`–`t16` | Quelle | Gerold's station, „Ruh dich hier kurz aus“ (`imhoff.t.pause`), the group leaves on `p-aufstieg` |
| `t17` | trough | Bussole (`item.bussole`, `story.compass`, `story.laub`), Laub's five lines, flags `quelle.call` / `quelle.guide`, explicit `autosave`; completes on `quelle:touch` (`src/systems/quelle/index.ts`); exit: `shift → 1789, reason quelle` |
| `t18` „Sommer 1789“ | spring, 1789 | `player.q.wo`, `laub.t.1789` („… Für heute genügt ein Blick.“), `laub.t.seite`, **fade to black**, flag `tour.ende`; exit grants relief 3, kartograf 1, `item.p.seite`, 4 Balsam, 1 Lampenöl, 549 XP (level 3), unlock `k1` |
| hand-over | `StoryEngine.completeBeat` → `goto('k1')` | tour `leave` (flags off, group and animals despawn, fade back in); `chapterEntered` reads K1's `checkpoint {… era: today}` and **sets the era back to today** (hard cut, `story/index.ts:706`); card „Der Hof“ |
| `k1_0` „Morgengrauen an der Quelle“ | spring, today, `look dawn` | NPC spawns for the chapter, `q.k1.ankunft` offered (objective `quelle` = `quelle:touch`), radio + `marlene.k1.morgen.quelle` („Morgen, {Name}! …“), `laub.k1.morgen.quelle` („… Ein zweites Mal also.“); completes on a **second** `quelle:touch`; exit `shift → 1789` |
| `k1_0b` „Die Brunnenstube, Sommer“ | 1789, outside the palace | flag `k1.vorspiel` (no oil timer), Liese at the Bleiche, Hofgärtner and guards (`court:on`), `q.k1.kleider` then `q.k1.brief`; Laub: `laub.k1.brunnenstube`, `laub.k1.fremde`; optional first fight (Liese's Mahnbriefe) |
| `k1_0c` „Die Musterung“ | gate | show the letter → `court.admitted` |
| `k1_1`… | Ehrenhof | oil meter 360 s starts (`oel-a`); at 75 s toast „Halte [Q], um ins Heute zurückzukehren …“; registry (first mandatory fight), Bauplatz, Zwinger; `k1_5` exit „Gehen wir erst nach Hause“ → `k1_6` „Q halten: zurück ins Heute“ → present → Tschifflik anchor → `k1_7`… night part |

Era switches in that stretch: today → 1789 (`t17`) → today (K1 checkpoint) → 1789 (`k1_0`). Saves:
an autosave on every beat entry (`pendingAutosave`, written in the same tick, so a `tour/t18` save
still has `era: today`), explicit autosaves at `t17` and in later K1 beats; being caught wakes the
player in the present at the beat's `wake` (K1: Quelle, Ehrenhof, Zwinger, Tschifflik).

Beyond the first jump the whole campaign is built on the present as hub: every chapter `k1…k4`
starts at the Quelle today with a Q anchor to walk to, each has „…heute“ reactions that re-arm
the anchor, the oil meter and every defeat send the player to the present, and K1 itself has two
authored returns (`k1_6`, `k1_15`). PRD pillar 5 and tour decision 11 describe this loop.

### 2. Challenge to the brief

The brief reads the feedback as "no return to the present until the ending". The code says that
would be a redesign of all four chapters (hub, anchors, oil, wake, chapter openers, K1's voiced
„Gehen wir erst nach Hause“), not a rework of "the first time travel thing". This plan fixes what
the owner named, the look-and-return, and makes the first stay last until the story itself goes
home (owner decision 1 below sets how far „stay“ reaches).

### 3. Target flow

1. `t1`–`t17` unchanged. Chapter 1 is the tour with its tutorials.
2. **The jump (`t17` → `t18`).** The touch shifts to 1789 as today. `t18` stays as the arrival
   beat with the same id: `player.q.wo` („Wo sind die alle hin?“), `laub.t.1789` without its last
   sentence, `laub.t.seite`. No fade. The beat completes when the lines are done **and** the era
   is 1789; its exit grants are unchanged (level 3, relief 3, kartograf 1, the page, Balsam,
   Lampenöl, unlock `k1`). Toast „Abgeschlossen: Die Führung“.
3. **Chapter 2 „Der Hof“ begins where the player stands**: at the Karlsbergquelle in 1789, the
   invented Brunnenstube (FIKTION, cx.42) in the ravine below the Orangerie, about 310 m west of
   the palace gate. Same place, other time (pillar 1), so no teleport. K1's `checkpoint` becomes
   `era: 1789`; a chapter `wake` keeps the Quelle today as the wake spot.
4. `k1_0` keeps its id and becomes the arrival beat in 1789: the chapter set-up it has today (NPC
   spawns, flags, staff, `q.k1.ankunft`), no dawn, no radio, no touch. It completes in 1789 and
   runs into `k1_0b` unchanged: `laub.k1.brunnenstube` („Sommer 1789. Kies, Hunde, irgendwo eine
   Geige. Und mittendrin Sie. In Orange.“), `laub.k1.fremde`, first objective „Ein Rock, der nicht
   leuchtet: hinunter zur Bleiche am Bach“ (72 m), then the paper, the letter, the Musterung.
5. From `k1_0b` on, content is unchanged in slice 1.

Kept / moved / cut:

| Item | Fate |
| --- | --- |
| `player.q.wo`, `laub.t.seite` | kept in `t18` |
| `laub.t.1789` (voiced, 8.8 s) | kept, last sentence „Für heute genügt ein Blick.“ removed → **the one line that needs a new recording** |
| `t18` fade to black, `tour.ende` | fade cut; the flag stays as the "lines done" latch |
| `k1_0` dawn look, second touch, `quelle.call` / `quelle.guide`, objective „An der Quelle: E – das Wasser berühren“ | cut |
| `marlene.k1.morgen.quelle`, `laub.k1.morgen.quelle` (neither is voiced) | cut from story and pack (`kapitel1.mjs`); they also contradict the one-afternoon rule (tour decision „Time“, WP-12) |
| `q.k1.ankunft` | objective `quelle` removed, `wechsel` no longer `after` it; `summary_de` and Laub's offer line reworded (unvoiced): no „über Nacht“, no „Erst die Quelle“ |
| K1 chapter set-up (spawns, staff, flags) | stays in `k1_0` |
| Every other voiced line (`laub.k1.*` 25, `laub.t.*` 4, `player.*`) | untouched |

Chapter names for the player (ids, file names, quest / clue / voice ids stay `tour`, `k1…k4`):

| id | Card title | `sub_de` |
| --- | --- | --- |
| `tour` | Die Führung | Kapitel 1 · heute, ein Novembernachmittag |
| `k1` | Der Hof | Kapitel 2 · Sommer 1789 |
| `k2` | Die Flucht | Kapitel 3 · Nacht vom 9. auf den 10. Februar 1793 |
| `k3` | Die Nacht | Kapitel 4 · Sonntag, 28. Juli 1793 |
| `k4` | Der Steinbruch | Kapitel 5 · 1796 → 1840 → heute |
| `enden` | Was das Feuer nicht fraß | heute · Morgengrauen (unchanged) |

Tutorials (nothing twice, nothing lost):

| Tutorial | Before | After |
| --- | --- | --- |
| Walk, look, talk (E), run, follow / „Zur Gruppe“ (Q hold), skip a cinematic, sneak, photo (N) | tour `t1`–`t10` | same |
| „Wasser berühren“ | `t17` and again `k1_0` | `t17` only |
| Being watched (court), disguise | `k1_0b` | same, now the first thing in chapter 2 |
| First fight, dodge hint | optional at Liese (`k1_0b`), mandatory in the Registratur (`k1_2`); dodge hint from combat | same |
| Q hold home, lantern oil | toast 75 s after admission (`lauf-zurueck`) | same in slice 1; reworded in slice 3 |
| Q at an anchor (present → past) | „…heute“ objectives after a return | same |
| Hide from the pack (C / X / L) | Jost `k1_5`, night `k1_11` | same |

What depended on the present between the jump and the stay: only the dawn look, Marlene's radio
line and the second touch, all cut. The guide and group are already gone to the plateau (`t15`),
which `player.q.wo` plays on. Phone / photo mode works in every era („Kein Netz“ in the past).
The home ring (heal, respec) exists only today and is reached as before by holding Q. The Q
mechanic itself is unchanged: Q at an anchor crosses, Q held in the past goes home.

### 4. Save compatibility

No `STATE_VERSION` bump; migrations detect the old shape (`src/core/state.ts` `deserializeState`).

| Old save | Today | After |
| --- | --- | --- |
| `tour/t1…t16` | plays on | unchanged |
| `tour/t17` (before the touch) | touch → `t18` | unchanged; lands in the new `t18` |
| `tour/t18` (saved with `era: today`, shift not saved) | flag completes it, K1 resets the era anyway | `t18` gets `shift → 1789` with `onResume: true` and waits for the era, so Continue finishes the jump, then hands over |
| `k1/k1_0` at the spring today (dawn, `quelle.call` set, `q.k1.ankunft` open) | waits for the second touch | new `migrateFirstJump`: era → 1789, player at the spring, `quelle.call` / `quelle.guide` / `shift.*` cleared, present look back to `day`; the beat's arrival lines are `onResume`. Safety net in content: `k1_0` gets the same „heute“ reaction as `k1_0b` (anchor at the spring, „Zurück in den Sommer 1789: Q an der Quelle“), so even an unmigrated or Q-returned player never needs a touch |
| `k1/k1_0b`, `k1_0c`, later, also standing in the present | „…heute“ reactions | unchanged; a saved `quelle` count on `q.k1.ankunft` is ignored (objective gone), `wechsel` / `wache` / `fluegel` counts keep |
| legacy `prolog` (`src/core/legacy-prologue.ts`) | → `k1/k1_0`, `era: today` | → `k1/k1_0`, `era: 1789` (same target id, so `tests/title.test.ts` and `tests/tour-handover.test.ts` shapes hold) |
| `k2…k4`, `enden` | | unchanged |

Chapter replay (Pause → Kapitel → „Der Hof“) and `kq.story.goto('k1')` enter through the
checkpoint, which now sets 1789 at the spring.

### 5. Blast radius

Content: `content/story/00-tour.story.json` (`t18`, `sub_de`), `content/story/01-kapitel-1.story.json`
(`checkpoint`, new `wake`, `k1_0`, `k1_1` enter, `sub_de`), `02`–`04` (`sub_de`),
`scripts/content-build/kapitel1.mjs` → `content/packs/kapitel-1.pack.json`,
`content/quests/01-kapitel-1.quests.json`.

Code: `src/core/legacy-prologue.ts`, `src/systems/story/migrate.ts` + `src/core/state.ts` (new
migration), `src/boot.ts` (`?kapitel`), `src/i18n/de.content.ts` (`ui.keys.measure` „ab Kapitel …“).
No engine change in slices 1–2. `src/systems/quelle/tour.ts` (`t18` stays in `QUELLE_BEATS`) and
`src/systems/court-k1` need no change.

Unit tests: `tests/story.test.ts` (K1 opening block, about lines 660–800), `tests/tour-slice.test.ts`,
`tests/tour-handover.test.ts`, `tests/title.test.ts`, `tests/voice-pipeline.test.ts` (`tour:t18` line
list), `tests/content-progression.test.ts`, `tests/k1-disguise.test.ts`, `tests/quests-tracker.test.ts`,
`tests/save-fuzz.test.ts`, `tests/barks.test.ts`; new cases for the migration and the `t18` resume.

e2e: `e2e/helpers/tour.ts` (`throughTour`, `expectHandover`), `e2e/helpers/k1.ts` (`boot`,
`touchSpring`, `openAtSpring`, `playK1`), `e2e/helpers/prolog.ts` (`touchSpring`), then
`chapter-prolog`, `chapter-k1-quelle` (rewrite: arrival, wake, Q back), `chapter-k1`, `quelle`
(the touch scene moves to `t17`), `smoke`, `story`, `tour-slice`, `campaign`, `integration`,
`quests` (`?kapitel` numbers); check `pacing`, `pol-flow`, `touch`, `pikeur-credit`, `chapter-k2`,
`chapter-k1-disguise`, `mobile/tour.pw.ts` (they import the helpers).

Docs: `docs/PRD.md` (changelog row, §1 pitch, §3.1, §4.2 „The first shift“ and chapter structure,
decision log D-012), `docs/design/tour/README.md` (new decision, note on 10 / 11),
`docs/design/tour/slice-v0.md`, `sources.md`, `storyboard-beats.md`, `content/bible/00-overview.md`,
`01-prolog.md`, `02-kapitel-1.md` §1.1, `content/story/README.md`, `docs/ACTION-RPG.md` (§11.0,
unlock table, §14 log row), `docs/ARCHITECTURE.md` (migration note), `CONTRIBUTING.md`,
`docs/RELEASE.md`, `docs/NEXT-SESSION.md`, `AGENTS.md` (id ↔ chapter number mapping).

Testing aids: `?kapitel=N` follows the number on the card: `2` „Der Hof“ (`k1`, new, with the tour
hand-over grants) … `5` „Der Steinbruch“ (`k4`). `kq.story.goto('k1')` now starts in 1789.
`CAMPAIGN_FROM` / `CAMPAIGN_TO` keep the internal ids. TASK-086 quotes the old numbers.

## Plan
_Status: draft_

**Approach:** Four PRs. The first makes the jump one-way with content edits and one save
migration, no engine change. The second renames the chapters for the player and moves the testing
aids and docs along. The third lets the first stay run until the story goes home (no oil eviction
in the day part of „Der Hof“). The fourth is the one re-recorded voice line.

**Files to touch:** see „Blast radius“.

**Steps:**

PR 1 — `feat(story): the first time travel is one-way`
- [ ] 1. `00-tour.story.json` `t18`: no fade, new `laub.t.1789` text („Nicht fort. Nur zweihundert
      Jahre weiter, je nachdem, wie man rechnet. Sommer 1789. Atmen Sie.“), `shift → 1789` with
      `onResume`, complete on `tour.ende` and era 1789.
- [ ] 2. `01-kapitel-1.story.json`: `checkpoint.era` 1789, chapter `wake` (Quelle, today); `k1_0`
      as the arrival beat with a „heute“ safety reaction; drop the `quelle` progress in `k1_1`.
- [ ] 3. `kapitel1.mjs`: remove the two `morgen.quelle` lines, rework `q.k1.ankunft`; run
      `node scripts/content-build/build.mjs`, `pnpm validate`.
- [ ] 4. `migrateFirstJump` (+ `legacy-prologue.ts` era) with unit tests for every row of the save
      table.
- [ ] 5. Unit tests listed above.
- [ ] 6. e2e helpers first, then the specs; run `tour-slice`, `chapter-prolog`, `chapter-k1-quelle`,
      `quelle`, `smoke` locally one at a time, the rest and the campaign in CI.
- [ ] 7. Docs for the flow (PRD row and §4.2, tour README decision, bibles, ACTION-RPG §14).

PR 2 — `feat(ui): the tour is chapter 1, „Der Hof“ chapter 2`
- [ ] 8. `sub_de` of the five chapters; `ui.keys.measure`; grep player text for chapter numbers.
- [ ] 9. `?kapitel=2…5` in `src/boot.ts`; `e2e/quests.spec.ts`; CONTRIBUTING, RELEASE,
      NEXT-SESSION, AGENTS.md mapping; note in TASK-086.

PR 3 — `feat(story): the first stay lasts until the story goes home` (owner decision 1)
- [ ] 10. K1 `oel-a` off for the day part (as K4 runs without an oil meter); `lauf-zurueck` toast
      reworded; check lantern / Bannlicht supply without the meter; `chapter-k1`, `campaign`,
      `story.test.ts` assertions on the oil meter.

PR 4 — `feat(content): re-record laub.t.1789`
- [ ] 11. One MOSS clip through the voice pipeline (owner's `moss-run`), manifest and credits.
      Until it lands the line shows as a subtitle with the murmur fallback.

**Test plan:** gates per PR. Manual: `/?nosave&fresh` new game through the tour; with
`kq.story.goto('tour','t17')` for the jump; old saves built in unit tests from the shapes above.
Screenshots before / after (real GPU): the moment after the touch, the card „Der Hof“, the first
objective, Pause → Kapitel.

**Risks:**
- e2e blast radius: about 12 specs and three helpers open K1 through the touch; the campaign shard
  takes hours in CI. Mitigation: change the helpers first, keep beat ids.
- A burst at arrival (level-3 card, two skill cards, „Abgeschlossen“ toast, chapter card) now plays
  over the 1789 view instead of black. Check on a real GPU; if crowded, delay the chapter card.
- The static validator and `content-progression` start K1 from the checkpoint era; an event
  objective removed from `q.k1.ankunft` may trip its one-shot rules.
- The wow moment murmurs until PR 4.
- Slice 3 changes K1 balance (no 6-minute eviction); it is one reaction and easy to revert.
- The seams between later chapters still return to the Quelle and still imply several days
  (Marlene's „Erzähl’s mir morgen“, „Brötchen auf der Stufe“). Not changed here.

**Open questions:** owner decisions, each with the default taken without an answer.

1. **How far does „stay there“ reach?** (a) only the first jump is one-way; (b) also no oil
   eviction during the day part of „Der Hof“, so the first return is the story's own „Gehen wir
   erst nach Hause“ after the Zwinger (PR 3); (c) no present at all in „Der Hof“: needs wake-in-
   the-past in the engine, a rewrite of about 20 beats and re-recording `laub.k1.nacht` and
   others, a follow-up task; (d) the whole game: a new design (PRD pillar 5, tour decision 11),
   not sliceable here. Recommendation and default: **(b)**.
2. **Arrival spot.** The spring in 1789 (Brunnenstube, 310 m from the gate), first objective the
   coat at the Bleiche, versus a new arrival nearer the palace. Recommendation and default: the
   spring, no teleport.
3. **Chapter numbers.** Five numbered chapters (table above), „Prolog“ gone, internal ids
   unchanged. Default: as in the table.
4. **Voice.** Re-record `laub.t.1789` with MOSS (synthetic Laub voice, one line). Default: yes,
   the text ships in PR 1, the clip in PR 4 when the machine is free.

## Progress

- 2026-11-28: analysis and plan written (planning run, no code changes).
