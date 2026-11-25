---
id: TASK-007
aliases:
- TASK-007
title: Remove leftovers of the first game concept; align everything with the guided tour with time travel
slug: remove-leftovers-of-the-first-game-concept-align-everything-with-the-guided-tour
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- refactor
- tech-debt
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-25
---

# Remove leftovers of the first game concept; align everything with the guided tour with time travel

> **Epic** (core dev team, not a community task). One task with a checklist; split items out as
> their own `dev` tasks (`--depends-on`) if one grows big.

## Description

The game started as "a surveyor (Vermesser*in) with a field book, a Feldstation / Bauwagen and a
lantern". Since v0.7.0 the opening is the **guided tour** ("Die Führung", `content/story/00-tour.story.json`,
design in `docs/design/tour/`), with the first time travel at the Karlsbergquelle. Much of the
first concept is still visible. This epic removes or reworks it.

Design source of truth: `docs/design/tour/README.md` (owner decisions 2026-11-20) and
`docs/design/tour/systems.md`, `impact.md`.

**Owner decisions (2026-11-23)** are written into the items below: hub menu → Bauwagen (fallback
Marlene), no journal and no "Feldbuch" name, a working title like "Schloss Karlsberg Tour", a tour map
instead of the lantern screen, the `?classic` prologue removed with save migration, survey skills
kept on a conflict-free keymap, and the two story bibles merged in this task.

### 1. Main menu / title (owner: "still reflects the old concept")

`src/ui/title.ts` (TitleScreen), strings in `src/i18n/de.ts`:
- [x] **Decision: working title along the lines of "Schloss Karlsberg Tour"** on the title screen (`game.title` / title page); final wording is the owner's, keep it in one string so it is a one-line change
- [x] **Decision: remove** the surveyor motto `title.motto` ("Fakten mit Quelle. ... Schauen, nicht graben.") and the subtitle `game.subtitle` ("Das Land erinnert sich") from the title screen (check other users of `game.subtitle`, e.g. `story.credits.sub`, `content/party/credits.json`; same decision there unless the owner says otherwise)
- [x] Buttons without lantern icons (`LANTERN_SVG`, `.kq-lantern-btn`) and in plain wording: "Weiter" (`title.continue`, was "Weiter vermessen"), "Neues Spiel" (`title.newGame`, was "Neues Feldbuch beginnen"); delete `title.light` "Laterne entzünden"
- [x] `title.confirmNew`: "Der bisherige Spielstand wird überschrieben. Wirklich neu beginnen?"
- [x] `title.hint` lists combat keys (Hieb, Wuchthieb, Bannlicht, Balsam) although the tour has no combat: show the tour's keys (move, interact, the survey-skill keys from section 6)
- [x] Pause / toasts in plain wording: "Speichern" (`pause.save`), "Spielstand gespeichert." (`pause.saved`, `toast.saved`), "Ausgeruht. Spielstand gespeichert." (`story.hub.bench.saved`, if the rest action survives)
- [x] `index.html` meta description: "Ein düsteres Erkundungs-Rätselspiel ..." (a puzzle game; the game is an action RPG)
- [x] README "How to play" still says "Laterne entzünden", "Neues Feldbuch beginnen"

### 2. The "lamp thing" before game start

It is the new-game flow in `src/systems/story/title/flow.ts` (installed via `titleHooks.beforeNewGame`):
content warning (16+) → name entry for the **surveyor** ("Feldbuch", default "Vermesser*in") →
a dark screen "Früh am Morgen, vor dem Bauwagen." with a big storm lantern and a matchbox and the
button "Laterne anzünden" (`story.lantern.*` in `src/systems/story/strings.ts`). The click also
unlocks audio. Styles in `src/systems/story/story.css` (`kqs-*`).
- [x] **Decision: replace the lantern screen with a tour map screen** that shows the route **Karlsberger Hof → Felsenpfad → Weiher → Karlsbergquelle** (stops and path drawn on the map, in the UI's ink-on-paper style). It keeps exactly **one click / tap, "Tour starten"**, because that gesture unlocks audio. Remove `story.lantern.*`, the lantern and matchbox art and their `kqs-*` styles; the e2e test id changes (e.g. `start-tour` instead of `light-lantern`)
- [x] Rework the name entry wording (visitor, not surveyor; `story.name.*`)
- [x] Review the content warning text (`story.warning.body1` "Du kämpfst mit einem Messstab ...") against the tour opening
- [x] Update `e2e` specs that click `light-lantern` / `title-new` (about 20 hits in `e2e/` and `tests/`)

### 3. The Messstab (the "stick")

Today: the tour grants `item.stab.esche` **quietly in the exit of beat `t18`** (after the first time
travel) together with XP, skills and items (`content/story/00-tour.story.json`, around line 347).
The avatar may show the staff on the back regardless (`staffOnBack()` in `src/player/costume.ts`,
used in `src/player/avatar.ts`); `src/systems/combat/index.ts` (~line 1320) still talks about
"picked up at the trailer". The tour design (Q14) says "Marlene lends it" and "Ach, behalt ihn" at
the party; Marlene only has a cameo in the tour today (beat `t12`).
- [x] Keep the stick, but have the player **receive it during the tour**, before the time travel (e.g. Marlene hands it over at the Weiher, or a collect objective on the way); visible pickup feedback
- [x] Hide the staff on the avatar until the item is owned
- [x] Remove the quiet grant from `t18`; keep the XP budget (prologue ends at level 3, `tests/quests-content-a.test.ts`)
- [x] Fix stale comments (combat, `src/ui/hud.ts` ~line 293 "the staff beside the trailer")

### 4. The spring's own menu

It is the **hub overlay at the Quelle** (`src/systems/story/hub/overlay.ts`, `src/systems/story/hub/home.ts`):
E inside the 12 m home ring opens a field-book spread with the Chronik, the phone (Marlene's messages),
the shelf (RPG counts), the drawer (Bussole state), the map (chapter select / continue) and the bench
(rest = save). Its E prompt competes with the spring's scripted touch "Wasser berühren"
(`src/systems/quelle/index.ts`; workaround `HOME.troughR` / `atTrough`).
- [ ] **Decision: move the hub menu's functions into the Bauwagen** (owner rule: Bauwagen if its model still exists, else open the menu by interacting with Marlene). Finding (2026-11-23): there is **no Bauwagen asset** in `public/assets` or `LICENSES.json`; it was never a model file but procedural code, `src/systems/story/hub/station.ts` (mesh, collider, warm windows, CC0 table / stools / barrel via `instanceModels`), deleted in commit `4cd2559` ("the Karlsbergquelle is home"). It is **restorable from git**: `git show 4cd2559^:src/systems/story/hub/station.ts` (plus the clearing in `src/world/forest.ts` and the collider / push-out removed in the same commit). So: restore it from history and open the menu with E at its door
  - Placement of the restored Bauwagen: **verify with owner** (old spot 760/−915 below the Weiher dam is off the tour route; e.g. near the spring or the Wanderparkplatz as Marlene's Forstamt trailer). Tour decision 1 in `docs/design/tour/README.md` ("No surveyor, Feldstation or Bauwagen") must be updated to match
  - **Fallback if the owner rejects the restore:** the same menu opens by talking to Marlene (an NPC dialogue option)
  - What moves there: Chronik (read-only view; see section 7 for the codex), chapter select / continue, rest = save ("Speichern"), the RPG counts and the Bussole state. Marlene's messages and side quests go to Marlene herself / the phone
  - The endings already mention the Bauwagen (`src/systems/story/endings/scenes.ts`, `content/story/05-enden.story.json`, `story.end.*`): keep them consistent with the decision
- [ ] **Then remove the hub overlay and its E prompt at the spring**, so E there is only "Wasser berühren"; drop the `HOME.troughR` / `atTrough` workaround
- [ ] Keep what still belongs to the spring: home / wake spot, heal and hunt reset on `hub:enter`, Q-hold return
- [ ] `hub:use` events used by story beats: find and replace them

### 5. Sweep: other old-concept candidates

- [x] **Decision: remove the legacy `?classic` prologue in this task, with save migration**: `content/story/00-prolog.story.json` (`legacy`), the `?classic` branch in `src/systems/story/index.ts` (~line 656) and its doc in `src/systems/story/types.ts` (~line 741), the builder `scripts/content-build/prolog.mjs`, `content/quests/00-prolog.quests.json`, `content/packs/prolog.pack.json`, and the voice lines only it uses. **Old saves must still load**: a save that stands in the legacy prologue (any beat, any quest state) is migrated, e.g. to the matching point of the tour or to the start of chapter 1 with the prologue's XP, items and skills granted (level 3, as the tour ends), never to a blank game; a unit test feeds real v0.6–v0.8 legacy saves through the migration
- [x] Feldstation remnants: `RETIRED_POINTS` in `src/systems/travel/points.ts`, comments in `travel/pois.ts`, `story.end.back` "Zur Feldstation", `story.credits.fictionText` (lists "die Feldstation")
- [x] `docs/archive/IDEA.md` (working title "Saarpfalz-Chroniken", the pre-design idea): archive or mark historical
- [x] `docs/PRD.md`: §6.1 "No XP" (already marked superseded), §6.3 "The field station (hub)", §3 core loop and §4.2 story: rewrite for the tour concept
- [x] `content/bible/*` vs `docs/design/tour/bible/*`: **decided, merge in this task**, see section 8
- [x] `docs/ACTION-RPG.md`, `docs/ARCHITECTURE.md`: sections that still describe the surveyor start, the Feldstation, the hub overlay
- [x] Save fields: normalize the visitor name, retired station objectives and survey points. The current hub has no dedicated save slice. Retain earned quest records and talent IDs.
- [x] Dead code from this cleanup (unused strings, CSS and SVGs). Recheck hub-specific code after §4.

### 6. Feldbuch: no journal, plain save wording (owner decision 2026-11-23)

The owner dislikes the name and thinks the game does not need a journal. What "Feldbuch" covers today:

| What | Where | Decision |
| --- | --- | --- |
| **Save naming**: title buttons, confirm, pause, toasts, bench | `src/i18n/de.ts` (`title.newGame`, `title.confirmNew`, `pause.save`, `pause.saved`, `toast.saved`), `story.hub.bench.saved` in `src/systems/story/strings.ts` | rename to plain wording: "Spielstand", "Neues Spiel", "Weiter", "Speichern", "Spielstand gespeichert." |
| **The journal modal (J)**, one "field book" with tabs | `src/ui/journal.ts` (tab registry), `src/systems/quests/journal.ts`, fallback modal titled "Feldbuch" in `src/systems/progression/index.ts` (~line 477); key `journal: KeyJ`; touch button "Feldbuch" (`touch.journal` in `src/ui/touch.ts`, `src/player/touchMap.ts`) | **remove the journal** as a place; its useful tabs move (rows below) |
| Tab "Aufgaben" (quest log, order 10) + HUD hint "Mehr dazu im Feldbuch (J)" | `src/systems/quests/index.ts` ~line 967, `quest.moreJournal` | **survives** as the quest log, reachable from the phone (an app) or the pause menu; HUD hint points there |
| Tab "Codex" (order 20; Chronik cards "Neu im Feldbuch", "Feldbuch öffnen") | `src/systems/quests/index.ts`, `src/systems/chronik/strings.ts` | **survives** as the Codex (the game's facts with sources), reachable from the phone or the pause menu; cards say "Neu im Codex", "Codex öffnen" |
| Tab "Sammlungen" (30) and "Funde" (35) | `src/systems/quests/index.ts`, `src/systems/travel/index.ts` ~line 1058 | **verify with owner**: proposal: fold both into the Codex as sections |
| Tab "Karte" (60) | `src/systems/travel/index.ts` ~line 1039 | **survives** as the map (M already opens maps); also a phone app |
| Tab "Album" (70, photos) | `src/systems/photo/index.ts` ~line 275 | **survives** in the phone's gallery (see TASK-006) |
| Tabs "Ausrüstung" (40, key I) and "Talente" (50) | `src/systems/progression/journal-tabs.ts` | **verify with owner**: the chapters after the tour still have combat; proposal: one small "Ausrüstung & Talente" screen on I / the pause menu |
| Talent branch named "Feldbuch" ("Wissen und Vorrat") | `src/systems/progression/journal-tabs.ts` (`BRANCHES`, id `feldbuch`) | use "Wissen" for the heading (slice 7). Keep the internal id `feldbuch` so saves keep their talent points. |
| Name entry titled "Feldbuch" | `story.name.title` in `src/systems/story/strings.ts` | plain title (e.g. "Dein Name"), see section 2 |
| Credits end line "{name} · Feldbuch geschlossen" | `src/systems/story/endings/ui.ts` ~line 270 | drop "Feldbuch geschlossen" |
| Other UI strings: "Noch keine Pläne im Feldbuch", skill card "Neu im Feldbuch" | `src/systems/skills/strings.ts` | plain wording ("Noch keine Pläne", "Neue Fähigkeit") |
| In-fiction mentions: Laub's notebook, Marlene's loose page, quest "Feldbuch-Notiz", story lines ("steht im Feldbuch") | `content/story/00-tour.story.json` (`laub.t.seite`), `01-kapitel-1`, `04-kapitel-4`, `05-enden` (`keep`, free-roam hint "im Feldbuch (J)"), `content/packs/*.pack.json`, `content/quests/04-kapitel-4.quests.json`, `src/systems/travel/lore.ts` | **verify with owner**: Laub's own field book as a story object may stay; lines that point the player to "das Feldbuch (J)" must change. Voiced lines need new clips |

- [x] Remove the journal modal, its key J and the touch button; nothing is lost: every surviving tab above has a new home
- [x] Quest log and Codex reachable from the phone or the pause menu (pick one primary route, keep it consistent on desktop and mobile)
- [x] Rename the save UI as in the table and remove "Feldbuch" from interface copy. Retain in-fiction lines.
- [ ] Rows marked "verify with owner" decided before work starts

### 7. Survey skills: keep them, conflict-free keys (owner decision 2026-11-23)

Spirit view, relief scan, maps and measuring stay as a cool extra.

**Current keymap** (`DEFAULT_BINDINGS` in `src/player/input.ts`, labels `action.*` in `src/i18n/de.ts`):
movement W A S D (+ ↑ ↓), Shift sprint, Space dodge / up, C crouch / down, X prone, Ctrl down;
E interact / listen, LMB interact + attack, K attack, G / RMB Bannlicht, H quick use, I inventory,
T / Y / U abilities, Tab / MMB lock-on, Q Zeitsprung (hold: back to the spring), L lantern, J journal,
N phone, P / Esc pause, F5 camera, ← → Bild↑ Bild↓ look. **Survey skills today:** F Geisterblick
(fly), 0 / ` and 1 / 2 / 3 relief scan modes, R Messen, M Karten, V / 4 Röntgenblick, B Planblatt.
F, R and Q sit inside the WASD hand and are pressed by accident while moving.

**Proposed layout** (no survey skill under the WASD hand; number row = survey, letters = action):

| Key | Action | Was |
| --- | --- | --- |
| 1 | Geisterblick (spirit view / fly) | F |
| 2 | Relief scan: cycle the modes (Shift+2 back, ` off) | 0–3, ` |
| 3 | Messen (measuring) | R |
| 4 | Röntgenblick | V, 4 |
| 5 | Planblatt | B |
| M | Karten (maps) | M (unchanged, far from WASD) |

F, R, V, B become free (V stays a secondary binding only if the owner wants). Combat (K, G, H, T / Y / U),
E, Q, J (removed with the journal, section 6) and N are unchanged. All of these stay rebindable in the
settings (`REBINDABLE`); stored custom bindings are kept, only bindings equal to the old defaults are
moved to the new defaults (settings migration).

- [x] Apply the layout to `DEFAULT_BINDINGS`, `SHARED_KEYS`, the settings key list, `title.hint` and the key hints / tutorial strings (`ui.keys.*`, `tut.*`)
- [x] Settings migration for stored bindings (unit test)
- [x] **Mobile:** one small "survey" button that expands into a radial or sub-menu with the skill buttons (Geisterblick, Relief, Messen, Röntgenblick, Planblatt, Karte); builds on the existing relief pop-up (`scanPop` in `src/ui/touch.ts`); the top bar keeps only Pause (and the phone)
- [x] e2e specs that press F / R / V / B / digit keys updated

### 8. Story bible merge (owner decision 2026-11-23: merge now, in this task)

- [x] Merge `docs/design/tour/bible/*` (00-overview, 01-prolog, 06-enden, 07-codex-impact, 08-stimmen) into `content/bible/*` so `content/bible/` is the one bible for the tour concept; then delete or archive `docs/design/tour/bible/` and update every link to it (`docs/design/tour/README.md`, `impact.md`, `content/story/README.md`, AGENTS.md / CLAUDE.md if they mention it)
- [x] Old-concept chapters in the bible (surveyor prologue `01-prolog.md`, Feldstation) rewritten or marked historical; `09-ui-texte.md` loses the "Feldbuch-Ton" rule

## Acceptance Criteria
- [x] Title, new-game flow and pause menu speak of the tour, not of a surveyor / lantern / Feldstation (German text); working title on the title screen, no motto / subtitle
- [x] The lantern screen is a tour map (Karlsberger Hof → Felsenpfad → Weiher → Karlsbergquelle) with one "Tour starten" click that unlocks audio
- [ ] No journal and no "Feldbuch" in the UI; save UI in plain wording; quest log, codex, map and album reachable as decided (section 6)
- [x] Survey skills on the new keymap (no clash with the WASD hand) and behind one expanding button on mobile
- [x] `?classic` and the legacy prologue files are gone; `content/bible/` is the single merged bible
- [x] The Messstab is received visibly during the tour, before the first time travel, and not shown before
- [ ] No menu at the spring; its functions open at the Bauwagen (or, if the owner rejects the restore, through Marlene); the spring's touch has no E conflict
- [x] **Old saves load**: saves from v0.6–v0.8 (mid-tour, after the tour, legacy prologue) are migrated or tolerated without losing XP, items or progress; a unit test covers the migration
- [ ] e2e smoke and touched specs updated and green (`--workers=1`); unit tests green. Slice 2 has a guard callout failure also observed on main. See Progress.
- [x] Docs updated: `docs/PRD.md` (changelog + outdated sections), `docs/ACTION-RPG.md` §14, README "How to play"
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Slice 2 plan (history)

_Status: approved 2026-11-24_

**Approach:** Slice 2 retires the playable §5 opening. A new game from an old `?classic` bookmark opens „Die Führung“. Continuing a save in `prolog` starts „Der Hof“ at the Karlsbergquelle with the tour's handover and the player's earned progress. Limit refactoring to what removing the path and migrating saves require. Shared content deletion follows in its own slice.

**Files to touch:**

- `src/core/state.ts` — migrate in `deserializeState`, after defaults and before restore. Both `SaveManager.peek` and `load` use it, including Continue and loads during play.
- `src/systems/story/index.ts`, `types.ts` — remove the URL branch, legacy chapter-select exception and prologue-only combat wake. Exclude the legacy story from the engine's playable files, including debug jumps. Document what the retained data marker means.
- `src/systems/quests/data.ts` — separate registration of the retired quests from their shared item definition. Check `src/systems/quests/index.ts` and `logic.ts` so restored quests retain their history and retired objectives leave the tracker.
- `src/systems/story/strings.ts` — remove `story.caught.wakeNear` with its last caller. The key search across all 13 `strings.ts` files and `src/i18n/` found that single definition.
- `tests/fixtures/saves/` (new), including `README.md` — exact autosave JSON from each tagged serializer and instructions to reproduce each fixture.
- `tests/tour-handover.test.ts`, `tests/story.test.ts`, `tests/quests-tracker.test.ts` — playable chapter selection, handover and tracker regression cases.
- `e2e/helpers/prolog.ts`, the specs and mobile runner below — retire the legacy playthrough and reuse the shared quest controls and tour helpers.
- `docs/ACTION-RPG.md` (§11.0 and the §14 row), `docs/PRD.md` (opening history and unreleased changelog), `docs/ARCHITECTURE.md`, `content/story/README.md`, `content/bible/01-prolog.md`, `docs/design/tour/slice-v0.md` — distinguish the historical release behavior from the new save destination. Keep task-file links out of docs.

**Dependency findings:** K1 starts at `k1_0` and offers `q.k1.ankunft` without a `q.p.*` prerequisite. The tour's `t18` grants `item.p.seite`, whose sole definition is in `00-prolog.quests.json`. K4's pack uses five nouns from `prolog.pack.json`, including `n.hohlweg`. Codex tags reference `entry.p.1` and `clue.p.handbuch`. The endings read three legacy side-quest deed flags. Laub and Marlene have tour lines and shared barks, while the voice priority catalogue selects legacy beats, line IDs and quest speech. `scripts/validate-content.ts` discovers files and cross-checks chapter, quest, item and pack references. Content budgets, wayfinding, travel, pack and voice tests also read the old data directly. These dependencies put physical deletion in the next §5 slice.

**Steps:**

- [x] 1. Generate a legacy prologue slot for each of `v0.6.0`, `v0.7.0` and `v0.8.0` without a browser. For each tag, run `mkdir -p "$TMPDIR/kq-$tag"` and `git archive "$tag" | tar -x -C "$TMPDIR/kq-$tag"`. Run tsx or Vitest inside that extracted tree, reusing the main worktree's `node_modules` if needed. Use the tag's state constructors and its own `SaveManager.save('auto')` with `MemoryStorage`. Write the exact string stored at `kq.save.v1.auto` to the fixture. At least one slot must stand mid-prologue with objective counts, earned gear and XP. In `tests/fixtures/saves/README.md`, record the tag, resolved commit, beat, state setup and exact generation commands for each slot. If the tagged serializer cannot be run through either runner, stop and give the contributor exact browser capture instructions for the affected tag, beat and slot.
- [x] 2. Migrate by current story chapter, independent of beat or quest state. Resume active `k1/k1_0` in `today` at the chapter checkpoint (1059.3, −833.1, yaw 50°). Mark the replacement opening `tour` complete and add K1 to the unlocked chapters. Preserve name, completed beats/chapters, quest counts and deeds, codex, playtime and unrelated system slices. Clear the retired objective, latches, timers, threats, anchor, tracked objectives and their spawned groups/pickups before restore. Preserve quest history and credit earned pending rewards once. Apply the `t17/t18` handover as minimums. Bring XP to at least 549 (level 3), credit the newly earned level points, keep higher totals, talents and equipment. Set relief ≥3, kartograf ≥1, the Bussole in story inventory, `story.compass` and `story.laub`. In RPG inventory ensure the Eschenstab, `item.p.seite`, four Balsam and one Lampenöl, preserving higher counts.
- [x] 3. Retire `classic`, `PROLOG_WAKES` / `prologWake` and the playable `prolog` entry. Register the retired file’s item definitions independently of its playable quests. Verify that chapter select and debug jumps cannot reach the prologue, the normal tour and test/dev chapters still work, and K1 offers its first quest and accepts the spring touch after Continue.
- [x] 4. Replace the legacy browser playthrough with bookmark and saved-game Continue coverage. Move pacing, spring, hub and cross-system assertions onto tour/K1 beats or existing test content. Keep the shared `newGame`, quest and spring helpers used by later chapters. Update the affected docs.
- [x] 5. Run the migration matrix, identifier audit and four gates. The contributor runs the named browser checks, compares the desktop pair and checks the touch Continue view. Record results under Progress. Allow at most two fix rounds after implementation. If issues remain after round two, record them and stop for the contributor.
  - [x] Contributor verification. Run `pnpm validate` and the 16 named browser specs, compare the desktop screenshots and check the touch Continue capture. Results and the known guard callout failure are recorded under Progress.
  - [ ] Run the standalone mobile-tour `hud-idle` check on `small-landscape`.

**Test plan:**

- Feed the **unmodified release slot bytes** into `MemoryStorage` under `SAVE_KEY('auto')`, then `peek`, `load`, resume against the playable chapters, save and reload. Assert the actual K1 beat, location/era, first quest, historical progress, both inventories, skill tiers, XP, level and points. Compare the second load for duplicate grants. A constructed `StorySlice` or an existing K1 campaign snapshot cannot exercise this regression.
- Supplement the release-generated saves with table cases for all 14 legacy beats (`p1–p11`, including `p3q`, `p3r`, `p9b`) and missing/hidden, offered, active, ready, done and failed quest records. Include an over-budget character. Load mid-tour and post-tour controls, including a later chapter with legacy history, and assert that their chapter, beat, XP, gear, skills and progress survive. Keep `tests/quests-content-a.test.ts` and the tour handover's 549-XP reference green.
- **Identifier audit.** Before editing, take the beat IDs from `00-prolog.story.json` and the eight quest IDs from `00-prolog.quests.json` (feldstation, relief, quelle, bussole, punktwolke, meiler, trichter, irrlichter under `q.p.`). Search literal IDs, prefixes and derived objective/group IDs recursively in `e2e/`, including `e2e/helpers/`. Include `classic`, `prolog`, `chapter-prolog`, `story.goto` arguments, `playProlog`, `newGame`, helper imports, and the referenced clue/echo/dialogue IDs. Feed the full token list to `rg -nF -f <token-file> e2e/`. Follow indirect imports through helpers k1, k2 and k4. Repeat with **every** removed/renamed hook, selector, URL flag, helper, quest and beat from the implementation diff, including dynamically built test IDs. Check every changed string key with `rg -nF -g 'strings.ts' -g 'src/i18n/**' -- '<key>' .` and check its call sites. The shared `window.kq` APIs and title controls still have callers.
- **Browser coverage** (contributor, outside the sandbox, one worker):

  | Specs or runner | What to exercise |
  | --- | --- |
  | `chapter-prolog.spec.ts` | Repurpose both old scenarios. Test the old bookmark opening the tour and Continue with an injected release slot at `?manual`. Exercise the first K1 spring interaction, save and reload. |
  | `story.spec.ts`, `integration.spec.ts`, `pacing.spec.ts`, `quelle.spec.ts` | Replace explicit and helper-default classic starts, old chapter selector, quest groups and beat jumps. Retain hub, FX/hunt/Chronik, input pacing, spring touch and return coverage on playable content. |
  | `quests.spec.ts`, `pol-flow.spec.ts` | Remove the obsolete `q.p.*` event exclusion. The printout sketch uses the retained clue pack and can still be checked. |
  | `campaign.spec.ts`, `tour-slice.spec.ts` | Tour start, handover and continued chapter play. Campaign already passes its own URL to `newGame`. |
  | `chapter-k1.spec.ts`, `chapter-k1-disguise.spec.ts`, `chapter-k1-quelle.spec.ts`, `chapter-k2.spec.ts`, `chapter-k4.spec.ts` | Direct and indirect consumers of shared quest, spring and modal helpers. |
  | `smoke.spec.ts`, `touch.spec.ts`, `e2e/mobile/tour.pw.ts` | Boot, landscape taps and reduced motion. Retarget the mobile runner's explicit `goto('prolog','p1')` and old quest cleanup. |

  Use `e2e/helpers/pause.ts`'s `waitForHooks`: once base `window.kq` exists, step `kq.step(1)` while polling for feature hooks under `&manual`. Drive DOM buttons, keyboard events, taps and existing debug controls without real pointer lock.

  ```sh
  pnpm exec vitest run tests/tour-handover.test.ts tests/story.test.ts tests/quests-tracker.test.ts tests/quests-content-a.test.ts
  pnpm typecheck && pnpm test && pnpm validate && pnpm build
  scripts/dev/heavy.sh -- pnpm exec playwright test e2e/{smoke,chapter-prolog,story,integration,pacing,quelle,quests,pol-flow,campaign,tour-slice,chapter-k1,chapter-k1-disguise,chapter-k1-quelle,chapter-k2,chapter-k4,touch}.spec.ts --workers=1
  scripts/dev/heavy.sh -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape --states hud-idle
  ```

- **Screenshots.** The contributor keeps the captures in the main checkout's `test-results/contribute/TASK-007/`.

  - Desktop 1280×720: load `http://localhost:5280/?classic&notitle&fresh&nosave&q=low` on each revision. The `notitle` flag skips the title screen and waits for an explicit start. Once the story hook is ready, run `kq.story.start('Alex')` and capture the opening card. Use `before-classic-start-desktop.png` for „Vermessung“ (`prolog/p1`) and `after-classic-start-desktop.png` for „Die Führung“ (`tour/t1`).
  - Phone 844×390 landscape touch, reduced motion: on the implementation, inject the populated legacy fixture at `kq.save.v1.auto` before loading `http://localhost:5280/?manual` in a clean profile. Tap „Weiter“, wait for the K1 objective at the Quelle and capture `after-classic-continue-touch.png` (after only).

**Risks:** `StoryEngine.resume(false)` returns silently if a saved chapter or beat is absent. Restore also reasserts active quests and combat groups. Migrating before either runs, keeping the old slot's metadata and testing Continue through the first K1 interaction cover the blank-world and stale-objective failures.

**Open questions:** None for this slice.

**Acceptance criteria coverage** (planned for slice 2)

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1. Title, new game and Pause wording | follow-up | Slice 1 covered save wording. The tour title and remaining copy follow. |
| 2. One-tap tour map | follow-up | The opening gesture belongs to §§1–2. |
| 3. Journal, Feldbuch and destinations | partial | Slice 1 delivered Pause navigation. This slice retires playable surveyor beats. The remaining terminology and destinations are separate. |
| 4. Survey keymap and mobile controls | follow-up | §7. |
| 5. Classic removal and single bible | partial | Playable legacy route and switch retired. Shared content extraction, deletion and the bible merge follow. |
| 6. Visible Messstab handoff | follow-up | §3. |
| 7. Hub move and spring E conflict | follow-up | §§4–5. |
| 8. v0.6–v0.8 saves | full | Tagged legacy slots migrate and reload with grants. Mid-tour and later saves retain their progress. |
| 9. Smoke, affected e2e and units | partial | All 1,493 units passed. The nine original browser failures passed on rerun. The guard callout also fails on main, and the standalone mobile runner is outstanding. |
| 10. PRD, ACTION-RPG and README | partial | PRD changelog, §14 and active opening/save references. Slice 1 updated README controls. The wider docs sweep follows. |
| 11. Four gates | full | The contributor passed all four gates on `da4d945`. |

**Follow-up slices:**

- [ ] §5 — Extract the shared page item and K4 nouns, rehome codex unlocks and retain earned epilogue deeds. Preserve the retired quest definitions needed for save payouts and historical log entries before deleting `content/story/00-prolog.story.json`, `content/quests/00-prolog.quests.json`, `content/packs/prolog.pack.json`, `scripts/content-build/prolog.mjs` and its `build.mjs` entry. Audit exclusive voice IDs, text hashes, priority selectors and manifest/clip references against the tour, chapters, speakers and shared barks before pruning. Retarget the content, budget, wayfinding, travel and voice tests. Edit builders, run `node scripts/content-build/build.mjs`, inspect generated diffs and run `pnpm validate`.
- [x] §§1–2 — Tour title, icons, hints, metadata and one-tap route-map/audio start, including the remaining opening copy.
- [ ] §3 — Tour Messstab handoff, avatar visibility and XP budget.
- [ ] §§4–5 — Relocate the hub after placement is settled, restore the spring interaction and reconcile station IDs, endings and the e1-wahl card.
- [ ] §6 — Remaining destinations, talent wording and in-fiction/voiced references, once settled.
- [ ] §7 — Survey keymap, settings migration, touch expansion and tutorials.
- [ ] §§5, 8 — Merge the bibles and reconcile remaining PRD, architecture, gameplay and historical references.

## Slice 3 plan (history)

_Status: approved 2026-11-25_ (slice 3, coordinator approval for the owner)

**Approach:** Align the title and new-game screens with the guided tour (§§1–2). Keep one localized working title for the title screen. Present the ordered route as a static illustrated paper map and start the game through the existing audio-unlock path on its sole action. Show the current survey bindings, since the new keymap and mobile survey menu belong to §7.

**Files to touch:**

- `src/boot.ts` — skip the title fade under reduced motion.
- `src/ui/title.ts`, `src/ui/dom.ts`, `src/ui/styles.css`, `src/ui/touch.css`, `src/i18n/de.ts` — tour title, plain actions and current controls.
- `src/systems/story/title/flow.ts`, `src/systems/story/story.css`, `src/systems/story/strings.ts` — visitor name and warning, paper map, responsive layout and one start action.
- `src/audio/audio.ts`, `src/systems/hunt/audio.ts` — update comments for the existing audio-unlock path.
- `index.html`, `content/party/credits.json`, `README.md`, `docs/PRD.md`, `docs/ACTION-RPG.md`, `docs/ARCHITECTURE.md`, `docs/MOBILE-UI-PASS.md` — metadata, credits and current opening instructions.
- `e2e/` (including helpers and mobile runner), `tests/credits.test.ts` — update the opening selectors, screenshots and credits expectation. Check all feature dictionaries for overrides.

**Steps:**

- [x] 1. Update the title, buttons, credits heading, controls and metadata. Remove obsolete title art and rules.
- [x] 2. Reframe the warning and name entry. Draw the four stops and route, remove the lantern screen and resolve the start from its button's gesture. Check focus, touch and reduced motion.
- [x] 3. Update the README and design changelogs. Audit all affected identifiers and copy. Update browser coverage for the stops, sole action, audio and touch, as well as the credits unit test.
- [x] 4. Run the four gates, validate the task, and run the affected browser specs if the sandbox permits the preview server. Record the results and any sandbox blocks.

**Test plan:** Run `pnpm exec vitest run tests/credits.test.ts`, then `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`. Audit `e2e/`, `e2e/helpers/`, `tests/`, `src/i18n/` and each `strings.ts` for changed keys and selectors. Run the title, tour-start and helper callers with `pnpm exec playwright test e2e/<spec>.spec.ts --workers=1` under `scripts/dev/heavy.sh`, one spec per lock hold. At `?nosave&fresh`, capture the title and the screen after name entry at 1280×720, phone landscape and phone portrait. Compare the title and onboarding against the unchanged revision if captures are available. The owner requested no browser or computer tools, so captures depend on Playwright.

**Risks:** Web Audio requires the start gesture. Check that no context exists on the map and that it runs after the single click or tap. Check the entire map and action fit on a short landscape phone. Continue and the overwrite confirmation use the existing save path.

**Open questions:** None for this slice.

**Acceptance criteria coverage**

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1. Title, new game and Pause wording | full | This slice completes the opening copy and title. Slice 1 covered save wording in Pause. |
| 2. One-tap tour map | full | Four stops, one action and the existing audio unlock. |
| 3. Journal, Feldbuch and destinations | partial | Plain name entry in this slice. Remaining §6 terminology and destinations follow. |
| 4. Survey keymap and mobile controls | follow-up | §7. |
| 5. Classic removal and single bible | partial | Slice 2 retired the playable classic path. Content extraction and the bible merge follow. |
| 6. Visible Messstab handoff | follow-up | §3. |
| 7. Hub move and spring E conflict | follow-up | §§4–5. |
| 8. v0.6–v0.8 saves | full | Covered in slice 2. |
| 9. Smoke, affected e2e and units | partial | Updated coverage, with 1,504 unit tests green. Browser execution and visual checks are pending. |
| 10. PRD, ACTION-RPG and README | partial | Update the opening and changelogs. The wider docs sweep follows. |
| 11. Four gates | partial | Typecheck, unit tests and build passed. Content validation is blocked by the sandbox. |

**Follow-up slices:**

- §5 — Extract shared content and retire the remaining classic files and exclusive voice clips.
- §3 — Tour Messstab handoff, avatar visibility and XP budget.
- §§4–5 — Hub relocation, spring interaction, station IDs and endings.
- §6 — Remaining destinations, talent wording and in-fiction references pending owner decisions.
- §7 — Survey keymap, settings migration, touch expansion and tutorials.
- §§5, 8 — Bible merge and remaining design and architecture references.

## Slice 4 plan (history)
_Status: approved 2026-11-25_ (coordinator approves for the owner)

**Approach:** Slice 4 removes the remaining surveyor chapter, quest and pack content from the live catalogs. Move the Bussole page and shared nouns to live content and keep the Codex facts and historical deed checks. Give save migration and the completed quest log a small archive with the original IDs, objective counts, history and payouts.

**Files to touch:**

- `src/core/legacy-prologue.ts`, `src/core/legacy-prologue-quests.ts`, `src/systems/quests/data.ts` — isolate old-save payouts and quest-log history from live quest files.
- `src/rpg/items.ts`, `scripts/content-build/kapitel4.mjs`, `scripts/content-build/codex.mjs` — retain the shared Bussole page, collective noun definitions and sourced Codex entries.
- `content/story/00-prolog.story.json`, `content/quests/00-prolog.quests.json`, `content/packs/prolog.pack.json`, `scripts/content-build/prolog.mjs`, `scripts/content-build/build.mjs` — remove classic content and rebuild.
- `src/systems/story/`, `src/systems/chronik/`, `src/systems/combat/`, `scripts/voice/` — retire catalog and encounter branches and voice metadata. Verify whether `public/voice/` contains any exclusive recordings.
- `tests/`, `e2e/`, `content/{story,quests}/README.md`, `docs/{ACTION-RPG,PRD}.md` — exercise migration with the existing release fixtures, test live content and document the change.

**Steps:**

- [x] 1. Extract the saved-quest records and payout inputs. Preserve finished/failed quest log entries, Codex grants, and old ending deeds. Re-run the release-save and quest-tracker tests.
- [x] 2. Move the shared item and nouns and remove obsolete Codex tags. Delete the classic chapter, quests, pack and builder, rebuild, and check cross-references.
- [x] 3. Retire the exclusive voice configuration and remove any matching entries or clips. Check ID and text-hash consumers and validate the voice assets.
- [x] 4. Audit removed IDs in `e2e/` (including helpers), `tests/` and every `strings.ts`. Adapt affected tests to live content, preserve migration cases and record the removal in the docs.
- [x] 5. Run the four gates and `mc validate`, review the diff, and list the affected Playwright specs. Record the local commit outcome in Progress.

**Test plan:** Run the migration and tracker tests, the tour handover and content validators, then `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`. If the tsx IPC socket blocks validation, run `node --import tsx scripts/validate-content.ts`. List the affected Playwright specs with one worker for an external run. The user's browser restriction also leaves screenshots pending.

**Risks:** Old reward thresholds, save IDs and the tour's 549 XP need to stay stable. Old quest history includes codex unlocks, and unnamed dialogue can resolve a recording by text hash.

**Open questions:** None for this slice.

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1. Title, new game and Pause wording | full | Covered in slices 1 and 3. |
| 2. One-tap tour map | full | Covered in slice 3. |
| 3. Journal, Feldbuch and destinations | partial | Remaining wording and owner decisions are in §6. |
| 4. Survey keymap and mobile controls | follow-up | §7. |
| 5. Classic removal and single bible | partial | Retire the classic content here. Merge the bible in a later slice. |
| 6. Visible Messstab handoff | follow-up | §3. |
| 7. Hub move and spring E conflict | follow-up | §§4–5. |
| 8. v0.6–v0.8 saves | full | The three tagged slots and payout regression cases verify compatibility. |
| 9. Smoke, affected e2e and units | partial | The browser specs will be listed for an external run. |
| 10. PRD, ACTION-RPG and README | partial | Document removal and migration. The wider docs sweep follows. |
| 11. Four gates | partial | Typecheck, unit tests and build passed. The content validator passed via the Node loader after the tsx CLI socket was denied. |

**Follow-up slices:**

- §3 — Tour Messstab handoff, avatar visibility and XP budget.
- §§4–5 — Hub relocation, spring interaction, station IDs and endings.
- §6 — Remaining destinations, talent wording and in-fiction references pending owner decisions.
- §7 — Survey keymap, settings migration, touch expansion and tutorials.
- §§5, 8 — Bible merge and remaining design and architecture references.

## Slice 5 plan (history)

_Status: approved 2026-11-25_ (coordinator approves for the owner)

**Approach:** Slice 5 moves the Messstab to Marlene's stop at the Weiher. Apply the §7 survey bindings on the number row and put the six survey controls in one touch menu. Update the remaining actionable German wording and the live gameplay documentation for the tour.

**Files to touch:**

- `content/story/00-tour.story.json`, `src/core/`, `src/systems/combat/index.ts`, `src/ui/hud.ts` — Weiher handoff, save compatibility, staff visibility and comments.
- `src/player/input.ts`, `src/core/save.ts`, `src/systems/{survey,skills,tools}/`, `src/i18n/` and control hints — new bindings, relief cycling and migration.
- `src/ui/touch.ts`, `src/ui/touch.css`, `src/player/touchMap.ts` — survey submenu and touch cues.
- `src/systems/story/`, `scripts/content-build/`, `public/voice/` if needed — current UI wording and matching voice metadata.
- `docs/{PRD,ACTION-RPG,ARCHITECTURE}.md`, `docs/design/tour/`, `README.md`, `e2e/`, `tests/` — document and cover the changed behaviour.

**Steps:**

- [x] 1. Grant the Messstab visibly at the Weiher, gate both staff renders on ownership, and keep older tour saves and the 549 XP handover working.
- [x] 2. Implement the number-row keymap, relief cycle and settings migration. Update control strings and audit keyboard callers.
- [x] 3. Put the six survey tools behind one touch button. Preserve the tap, look, flight, and reduced-motion paths.
- [x] 4. Sweep German UI copy and current documentation for the tour. Keep archived material and owner-dependent items pending.
- [x] 5. Audit changed IDs and keys in e2e, e2e/helpers, tests and all dictionaries. Run the four gates and MissionControl validation, list the Playwright specs and attempt the local commit.

**Test plan:** Run focused tour, save, keybinding and touch unit tests, then `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`. If the tsx IPC socket is denied, run `node --import tsx scripts/validate-content.ts`. The external one-worker specs cover the handoff and new controls. Suggested desktop comparison at `?debug&nosave&fresh` is the avatar immediately before and after the Weiher handoff. Suggested phone views are the closed and expanded survey controls in 844×390 landscape. Browser captures are outside this session.

**Risks:** Older tour slots can be past the Weiher with no staff yet. Custom key overrides can claim a new default key. Survey tools still use the same skill gates and reduced-motion settings.

**Open questions:** None for this slice.

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1. Title, new game and Pause wording | full | Refresh the title controls and legacy default name. |
| 2. One-tap tour map | full | Covered in slice 3. |
| 3. Journal, Feldbuch and destinations | partial | Sweep active UI copy. Talent wording and in-fiction decisions remain open. |
| 4. Survey keymap and mobile controls | full | Number row, rebind migration and touch submenu. |
| 5. Classic removal and single bible | partial | Classic is retired. Bible merge follows. |
| 6. Visible Messstab handoff | full | Weiher loan and staff visibility. |
| 7. Hub move and spring E conflict | follow-up | Owner placement decision pending. |
| 8. v0.6–v0.8 saves | full | Retain legacy migration and cover older mid-tour saves. |
| 9. Smoke, affected e2e and units | partial | Unit gates and external browser spec list. |
| 10. PRD, ACTION-RPG and README | full | Refresh current gameplay and control documentation. |
| 11. Four gates | partial | Typecheck, build, the two-worker unit suite and the Node content validator passed. The tsx CLI was denied its IPC socket. |

**Follow-up slices:**

- [ ] §§4–5 — Bauwagen placement (verify with owner), hub relocation, spring interaction and associated station IDs and ending checks.
- [ ] §6 — Talent wording, destinations and in-fiction Feldbuch choices (verify with owner).
- [ ] §§5, 8 — Merge the bibles and update links. Review remaining obsolete code after the hub move.

## Slice 6 plan (history)

_Status: approved 2026-11-25_ (slice 6, coordinator approves for the owner)

**Approach:** Complete §§5 and 8's merge into `content/bible/`. Reconcile the guided opening, endings, Codex and character voices with the live content and label proposals whose scenes or unlocks are still pending. Mark obsolete surveyor and station descriptions where the chapter drafts still contain them. Queue the two authorized voice lines in TASK-014 and give the three real-data checks more time under load.

**Files to touch:**

- `content/bible/` and `docs/design/tour/bible/` — merge the five tour documents and remove their superseded copies.
- `content/story/README.md`, `docs/design/tour/`, PRD, ACTION-RPG and other tracked references — use canonical bible paths.
- TASK-007, TASK-010 and TASK-014 — record the slice, repair design references and queue the two exact tour lines for later recording.
- `tests/{flaschen,scenery,travel}.test.ts` — explicit per-test timeouts for the three specified real-data cases.

**Steps:**

- [x] 1. Merge the overview and guided prologue. Reconcile the current beat IDs, route, grants, XP and save migration with the live story. Preserve authored draft material where it still informs the design, with its status marked.
- [x] 2. Merge the endings and party, Codex sources and unlocks, and voice guidance. Preserve the later chapters' retained design and distinguish their obsolete hub references and other historical draft material. Bring the UI writing rules and opening/control references up to date.
- [x] 3. Remove the five superseded tour drafts, update all incoming links and canonical-path references, and record both slice 5 line IDs and texts in TASK-014's recording queue.
- [x] 4. Add 30-second budgets to the three named real-data unit tests and run their files together.
- [x] 5. Audit the referenced IDs and keys in `e2e/`, `e2e/helpers/`, `tests/` and all `strings.ts` files. Check local documentation links, run the four gates and `mc validate`, list external Playwright checks and attempt the local commit.

**Test plan:** Run the three focused unit suites, then `pnpm typecheck`, `pnpm test --maxWorkers=2`, `pnpm validate` and `pnpm build`. If the tsx CLI IPC socket is denied, run `node --import tsx scripts/validate-content.ts` and record both results. List one-worker Playwright smoke, tour, touch, party, voice, Codex and related travel checks based on the identifier audit. This slice edits documentation and unit test timeouts. Browser runs and screenshots are outside this session.

**Risks:** Some tour draft material was superseded by shipped beats, grant sources or chapter loading. Retain story and source guidance with explicit status, and use the live JSON, generators and migration code for shipped details. Historical quest IDs can still describe effects on legacy saves.

**Open questions:** None for this slice.

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1. Title, new game and Pause wording | full | Record the current wording in the bible. |
| 2. One-tap tour map | full | Document the shipped opening. |
| 3. Journal, Feldbuch and destinations | partial | Update the UI guide. Owner-dependent decisions remain open. |
| 4. Survey keymap and mobile controls | full | Record the desktop defaults and touch survey menu. |
| 5. Classic removal and single bible | full | Merge the design drafts after the classic content retirement. |
| 6. Visible Messstab handoff | full | Document the shipped handoff and queue the new line. |
| 7. Hub move and spring E conflict | follow-up | Owner placement decision pending. |
| 8. v0.6–v0.8 saves | full | Document the shipped migration and its retained quest history. |
| 9. Smoke, affected e2e and units | partial | Target the three load-sensitive tests and record the browser checks. |
| 10. PRD, ACTION-RPG and README | full | Record the consolidated design location and update canonical links. |
| 11. Four gates | partial | Typecheck, both unit runs, the production build and the Node content validator passed. The pnpm validator wrapper hit the sandbox’s tsx IPC denial. |

**Follow-up slices:**

- [ ] §§4–5 — Bauwagen placement (verify with owner), hub relocation, spring interaction and associated station IDs, save fields, ending checks and obsolete code.
- [ ] §6 — Talent wording, destinations and in-fiction Feldbuch choices (verify with owner).
- [ ] Complete the previously listed contributor browser and mobile checks.

## Plan

_Status: approved 2026-11-25_ (slice 7, coordinator approves for the owner)

**Approach:** Finish the live Feldstation and Feldbuch cleanup in §§5–6 around the guided tour and Karlsbergquelle. Normalize legacy story and travel data when a slot is read. Keep historical quest and talent IDs where saves use them. The hub interaction and Bauwagen placement are outside this slice.

**Files to touch:**

- `src/core/state.ts`, `src/systems/story/` and `src/systems/travel/` — normalize the visitor name and retired travel point, clean up stale location wording and keep generated POI IDs stable.
- `src/i18n/`, `src/systems/progression/pages.ts`, the K4 quest file and affected UI styles — replace the remaining interface wording and remove orphaned strings, rules and artwork where verified.
- `tests/fixtures/saves/`, focused tests and affected e2e specs or helpers — exercise old-slot reads and audit changed keys, copy, selectors and IDs.
- `docs/ACTION-RPG.md`, `docs/PRD.md` and this task — document behavior, test results and the Bauwagen asset inventory.

**Steps:**

- [x] 1. Clean up the retired travel point and story copy. Inspect the asset filenames and licence manifest for a Bauwagen model and record the result.
- [x] 2. Normalize older story and travel saves before systems restore. Cover a legacy station slot through preview, load, save and reload. Preserve the character's active beat and earned progress where playable, and retain archived quest records.
- [x] 3. Remove Feldbuch from interface labels and item descriptions. Retain authored in-fiction lines. Remove verified unused localization, CSS and SVG markup.
- [x] 4. Audit IDs and keys in e2e, its helpers, tests and every strings.ts. Update docs and list smoke, save, map, progression, endings and touch/reduced-motion coverage as applicable.
- [x] 5. Run the four gates and MissionControl validation, review the diff and attempt the local commit with the requested trailer. Record any sandbox block.

**Test plan:** Run the focused travel, legacy-save, story and progression tests. Run `pnpm typecheck`, `pnpm test --maxWorkers=2`, `pnpm validate` and `pnpm build`. If the validator CLI hits the tsx IPC block, run `node --import tsx scripts/validate-content.ts`. Use Playwright discovery to list the affected specs for a one-worker run outside this session. For visual checking, open Talente and the survey map after Continue on desktop and in landscape touch with reduced motion. Browser runs and captures are outside this session.

**Risks:** POI list order seeds saved IDs. Old station quest IDs and talent ranks are player history. The touch action and the spring hub share existing prompt handling, which this slice leaves in place.

**Open questions:** The owner still needs to decide Bauwagen placement and the remaining interface destinations.

| Epic criterion | Coverage | Outcome |
| --- | --- | --- |
| 1–2. Opening copy and tour map | full | Retain the shipped opening and consolidate the name fallback. |
| 3. Journal, Feldbuch and destinations | partial | Finish the live interface wording. Owner-dependent destinations remain open. |
| 4–6. Survey controls, classic retirement, bible and staff | full | Earlier slices completed these items. |
| 7. Hub move and spring E conflict | follow-up | Bauwagen placement is pending. |
| 8. Old saves | full | Add compatibility coverage for the station point and visitor name. |
| 9. Smoke, affected e2e and units | partial | Run unit tests and list browser specs for follow-up. |
| 10. PRD, ACTION-RPG and README | full | Update the design and migration notes. |
| 11. Four gates | full | Run the gates with the documented validation fallback if required. |

**Follow-up slices:**

- [ ] §4 — Confirm Bauwagen placement with the owner, then move the hub functions, restore the spring's sole E interaction and reconcile hub triggers and endings.
- [ ] §6 — Confirm remaining interface destinations and any further changes to in-fiction lines with the owner.
- [ ] Complete the listed contributor browser and mobile checks.

## Progress

- 2026-11-24: Slice 1 merged in PR #15. Its five steps covered Pause navigation, shortcuts and touch, journal removal, save wording and regression checks.
- Branch: `refactor/task-007-journal-classic`
- PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/15
- 2026-11-24: Step 1 implemented. Pause lists the eight existing feature views with badges, a scrollable list and a Back action. The conditional story actions remain available.
- 2026-11-24: Step 2 implemented. I opens Ausrüstung, M retains its map and comparison behavior, and the map cancels its frame and key listeners on close. Codex opens from clue cards and above the Pinnwand, preserving the hub and its clue queue.
- 2026-11-24: Step 3 implemented. Removed both journal shells, J and the touch entry. Regenerated content with `node scripts/content-build/build.mjs`. The generated diff changes only `end.frei`. Pending labels and legacy prologue content remain in place.

- 2026-11-24: Step 4 implemented. Updated the title, overwrite, pause, toast and bench wording, README “How to play”, ACTION-RPG §14 and the PRD changelog.
- 2026-11-24: Step 5 implementation and selector audit complete. Retained the inner quest, gear and talent test IDs. The only remaining J in e2e verifies that the retired binding does nothing. `helpers/prolog.ts` uses Pause in `playProlog` and steps the manual loop while `newGame` waits for hooks.
- 2026-11-24: `pnpm typecheck`, `pnpm test` (1,471 tests in 110 files), `pnpm build` and `git diff --check` passed. `pnpm validate` was blocked by `tsx` receiving `EPERM` while opening its IPC socket. Run `pnpm validate` outside the sandbox.
- 2026-11-24: Playwright specs awaiting the contributor's run, one worker per spec. Changed behavior or assertions: `smoke`, `quests`, `chronik`, `integration`, `npc`, `progression`, `flaschen`, `photo`, `touch`, `chapter-prolog` and `story`. The other specs that call the changed `newGame` helper are `campaign`, `pacing` and `quelle`. The audited `e2e/mobile/tour.pw.ts` runner uses the new controls. Title and landscape Pause after shots and the before/after comparison are pending.
- 2026-11-24: `git commit` was denied access to the worktree's `index.lock` after initial staging. Run the two commits from the contributor shell.
- 2026-11-24: Round 1. The contributor committed the slice (`fabbd44`, `05d40c5`) and passed all four gates outside the sandbox. Playwright reported 45 passed and one failure in `story.spec.ts`. Removed the duplicate title overrides so the main dictionary supplies „Weiter“ and „Neues Spiel“, and aligned the story alias and quest comment. Typecheck and 41 related unit tests passed. The browser rerun is pending. The sandbox denied `git add` access to the worktree's `index.lock`.

- 2026-11-24: Fix round 1 committed as `5f8db36` (`fix(ui): use the plain continue label on the title`). The contributor ran all four gates outside the sandbox on this commit. Typecheck passed, all 1,471 unit tests passed, content validation passed and the production build passed.
- 2026-11-24: The contributor ran smoke, quests, chronik, integration, npc, progression, flaschen, photo, touch, chapter-prolog, story, pacing, quelle and campaign with `--workers=1` under `scripts/dev/heavy.sh`. Across `fabbd44`–`05d40c5`, 45/46 passed. The sole failure at `story.spec.ts:94` showed “Fortsetzen” on the saved-game title. After the fix, story and smoke passed 13/13 on `5f8db36`.
- 2026-11-24: Compared the four SwiftShader captures in the main checkout under `test-results/contribute/TASK-007/`. At 1280×720, `before-title.png` and `after-title.png` show “Fortsetzen” changing to “Weiter” for the saved game. At 844×390, `before-pause-touch.png` and `after-pause-touch.png` show all eight destinations added to landscape Pause.
- 2026-11-24: Self-reviewed `git diff c344059...5f8db36`, including the retired inputs, stacked dialogs, map cleanup, German labels and generated ending. `git diff --check` passed. The hub now stays open under Codex. One obsolete comment in `src/systems/story/index.ts` still describes reopening it. Slice 1 is ready for review. The seven follow-up slices keep the epic in progress.
- 2026-11-24: Pushed `5f8db36` and opened PR #15. The sandbox denied the task-file commit at the worktree's `index.lock`. The contributor can stage this record, commit it and push it to the open PR.
- 2026-11-24: Contributor approved slice 2 on `refactor/task-007-remove-classic` after the dependency and release-format audit. Fixtures will use the tagged serializers. The contributor captured the desktop baseline on unchanged code. Desktop and touch after shots are due after implementation.

- Slice 2 branch: `refactor/task-007-remove-classic`
- 2026-11-24: Slice 2 step 1 complete. Vitest ran the serializer from each tagged archive and captured three exact auto slots. The tsx runner was blocked by IPC EPERM.

- 2026-11-24: Slice 2 step 2 complete. Deserialization moves legacy saves to the K1 checkpoint, preserves historical records and earned progression, and clears retired objectives and spawns. The 24 handover and migration tests passed. Regenerated the v0.8 fixture with the full photo slice and verified the documented direct Vitest command on all three archives.

- 2026-11-24: Slice 2 step 3 complete. The playable chapter catalog excludes the legacy prologue from new games, chapter select and debug jumps. Retired quests are excluded from runtime registration, with completed and failed entries still visible in the quest log. The shared page item remains registered. Typecheck and 67 focused tests passed, including resumed K1 quest and spring-event coverage.
- 2026-11-24: Fixture commit `b1b2b94` succeeded. The next `git add` was denied at the worktree index.lock. Remaining commits will be handed to the contributor without retrying.

- 2026-11-24: Slice 2 step 4 complete. Replaced the legacy playthrough with bookmark and release-save Continue scenarios, including a landscape touch run with reduced motion. Pacing, spring, hub and cross-system specs use playable content. Updated the mobile runner, shared helpers and all six planned docs. Browser checks and captures are pending outside the sandbox.

- 2026-11-24: Slice 2 step 5 local checks complete. The migration matrix covers all three tagged slots, 14 beats across seven quest states, higher progression and tour/later-chapter controls. Typecheck, all 1,493 unit tests in 110 files, the production build, `mc validate` and `git diff --check` passed. `pnpm validate` was attempted and stopped at the tsx IPC socket with EPERM. The full K1 script stays in the story chunk.
- 2026-11-24: Audited the removed URL switch, quest and beat IDs, derived objective groups and pickups, legacy clues/echoes/dialogue, dynamic chapter selector and shared helper callers. The deleted `story.caught.wakeNear` key has no remaining references in `strings.ts`, `src/i18n/` or its former call site. Legacy content and builders are intact.
- 2026-11-24: Playwright discovered 47 tests in the approved 16 specs and one mobile runner test with `--list`. Browser execution is pending for `smoke`, `chapter-prolog`, `story`, `integration`, `pacing`, `quelle`, `quests`, `pol-flow`, `campaign`, `tour-slice`, `chapter-k1`, `chapter-k1-disguise`, `chapter-k1-quelle`, `chapter-k2`, `chapter-k4`, `touch` and mobile `hud-idle`. The contributor's desktop before shot is on record. The desktop after comparison and touch Continue capture are pending.

- 2026-11-24: Slice 2 fix round 1 of 2. The contributor committed `ea409bf`, `aa138c6` and `85eafa9` on top of `b1b2b94` and passed all four gates outside the sandbox. Playwright reported 38 passed and nine failed across the 16 specs, with `pol-flow` passing.
- 2026-11-24: Compared the failures and page snapshots against `origin/main`. The unchanged chapter-card gate held K1's court cue, quest offer and delayed objective when the direct-boot specs acted. Being caught retired the pending court cue before it could be applied. The K1 specs now step through entry before those checks. The portrait spec runs the chapter's authored radio timeline and waits for both named lines. At the spring, the tour's distant-group Q prompt owned the HUD and blocked the low-priority hub prompt. The three hub specs now set up the spring break with the group nearby and press E after checking the hub owns the prompt. The payout spec checks the hook's boolean result and keeps a separate fight active through turn-in to verify the payout stays queued.
- 2026-11-24: Round 1 typecheck and all 1,493 unit tests passed. Playwright discovered 23 tests in the eight specs for rerun. The browser rerun is pending for `chapter-k1-disguise`, `chapter-k1-quelle`, `integration`, `pacing`, `story` and the other K1 boot consumers `chapter-k1`, `quelle`, `pol-flow`.

- 2026-11-24: The sandbox denied the round 1 `git add` at the worktree index.lock. The fix commit is pending in the contributor shell.

- 2026-11-24: The contributor committed the fix as `da4d945` and verified all four gates outside the sandbox. Typecheck, 1,493 unit tests in 110 files, content validation and the production build passed.
- 2026-11-24: Playwright ran with one worker under `scripts/dev/heavy.sh`. The first run across all 16 specs had 38 passes and nine failures across chapter-k1-disguise (2), chapter-k1-quelle (2), integration (1), pacing (2) and story (2). On `da4d945` the contributor reran smoke, chapter-k1-disguise, chapter-k1-quelle, integration, pacing, story, chapter-k1, quelle, pol-flow, chapter-prolog and touch. All nine original failures passed. The rerun had 37 passes and one failure at `e2e/pol-flow.spec.ts:148` (guard calls out a runner), also reproduced on main at line 147. Campaign, quests, tour-slice, chapter-k2 and chapter-k4 passed in the first run and the fix did not edit those specs. The standalone mobile-tour runner was not run.
- 2026-11-24: The 1280×720 desktop pair in `test-results/contribute/TASK-007/` shows the same bookmark and explicit start changing from „Vermessung“ to „Die Führung“. The 844×390 landscape touch capture with reduced motion shows Continue from the v0.8.0 slot at the spring. The contributor confirmed `k1/k1_0` with objective `k1.quelle`. Laub's line and „Wasser berühren“ are visible alongside level 3 and 149/350 EP toward the next level (549 total XP).
- 2026-11-24: Checked the existing ACTION-RPG §14 row and PRD changelog. The epic stays in progress with the seven follow-up slices above. The standalone mobile-tour check and investigation of the guard callout on main remain open.
- 2026-11-24: Pushed slice 2 on `refactor/task-007-remove-classic` and opened it for review against `main`. PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/17

- 2026-11-25: Slice 3 approved by the coordinator for the owner on `feat/task-007-title-tour-map`. The branch starts at `origin/main` (`6d28827`).

- 2026-11-25: Slice 3 step 1 complete. The title and rotate screen share `game.title`. Main-menu buttons are text, the hint uses the active defaults and the credits omit the subtitle. The credits unit file passed 4/4.
- 2026-11-25: Slice 3 step 2 complete. Content notice and name entry lead to the static paper route. The title controls are inert during onboarding. The sole start action resolves within the gesture and starts the existing audio path. Reduced motion skips the title fade.
- 2026-11-25: Slice 3 step 3 complete. Updated the README, design logs and browser checks including desktop, touch, helper and mobile runner paths. Audited all feature dictionaries and all consumers of the changed copy and selectors. The `title-new` selector remains valid for the plain button. Current survey bindings are advertised pending §7.

- 2026-11-25: Slice 3 step 4 checks. `pnpm typecheck`, `pnpm test` (1,504 tests in 110 files), `pnpm build`, `mc validate` and `git diff --check` passed. An initial FFmpeg-backed voice-service timeout passed in isolation and on both complete reruns. `pnpm validate` was attempted and blocked by `listen EPERM` on the tsx IPC socket.
- 2026-11-25: Playwright discovered 39 tests across the nine affected standard specs and one standalone mobile runner. The smoke run was blocked before Chromium by Vite preview's `listen EPERM` on loopback. The desktop and mobile visual checks are pending.
  Run these commands outside the sandbox from the worktree root. The mobile state includes the warning and name steps.

  ```sh
  pnpm validate
  pnpm build
  for spec in smoke story touch integration framerate perf campaign chapter-prolog pacing; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
  done
  for device in small-landscape small-portrait; do
    scripts/dev/heavy.sh -- pnpm exec tsx scripts/dev/mobile-tour.ts --device "$device" --states title,tour-map
  done
  ```

- 2026-11-25: Initial staging succeeded. The sandbox denied `git commit` at the worktree's `index.lock`. Stage this progress entry with the rest of the slice and commit from the contributor shell.

  ```sh
  git add -u -- .
  git commit -m 'feat(ui): open new games with the Karlsberg tour map' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  ```

- 2026-11-25: Slice 4 approved by the coordinator for the owner on `refactor/task-007-legacy-prologue`. The branch starts at `origin/main` (`9996dc8`). This cleanup fills the five-step slice.

- 2026-11-25: Slice 4 step 1 complete. The save and quest-log archive retains objective counts, historical text and payout inputs. The 31 handover, release-save and tracker tests passed using a worktree-local copy of the installed dependencies.

- 2026-11-25: Slice 4 step 2 complete. The Bussole page is a core item, five reused nouns are in the K4 builder, and the Codex facts retain their IDs. Deleted the four legacy source files and rebuilt. The full content validator passed via the Node loader.

- 2026-11-25: Slice 4 step 3 complete. Removed the old priority selectors and three speech overrides. The deleted content had 103 exclusive line IDs and no committed recordings. All 168 manifest entries resolve to live IDs, and all 21 voice asset tests passed.

- 2026-11-25: Slice 4 step 4 complete. Searched 156 legacy identifiers across e2e, its helpers, tests and all feature dictionaries. Gameplay references now use live content or the Chronik fixture. Retained save fixture IDs, archive data, negative chapter checks and three ending deed flags for older saves.

- 2026-11-25: Slice 4 step 5 checks complete. Typecheck, all 1,497 unit tests in 110 files, build, `mc validate` and `git diff --check` passed. `pnpm validate` reached the tsx IPC socket and received `EPERM`; `node --import tsx scripts/validate-content.ts` passed. The worktree used a local copy of the installed dependencies with pnpm's reinstall check disabled because the shared installation is read-only here. Cross-checked the archive's quest-log and payout fields against all eight original definitions. The combat simulation starts and runs against current encounters.
- 2026-11-25: Playwright discovered 39 tests in 12 specs. Browser runs and screenshots are pending. Run these commands outside the sandbox from the worktree root.

  ```sh
  pnpm build
  for spec in smoke chapter-prolog story integration pol-flow chronik pacing campaign tour-slice chapter-k4 quests progression; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
  done
  ```

- 2026-11-25: The sandbox denied `git add` at the worktree's `index.lock`. Stage the new archive and the four deleted legacy files with the rest of the slice, then commit from the contributor shell.

  ```sh
  git add -A -- AGENTS.md CONTRIBUTING.md .mc/tasks/todo/TASK-007-*.md content docs e2e scripts src tests
  git commit -m 'refactor(content): retire the legacy prologue' -m 'Refs: TASK-007' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  ```

- 2026-11-25: Slice 5 approved by the coordinator for the owner on `refactor/task-007-slice5`, based on `dc82563`.

- 2026-11-25: Slice 5 step 1 complete. Marlene loans the staff at the Weiher using the standard pickup feed. The staff render checks the equipped item against inventory. Older tour saves past the handoff receive the loan when loaded. All 38 focused tests passed and the tour still grants 549 XP.

- 2026-11-25: Slice 5 step 2 complete. Survey keys use 1–5, Backquote and M. Shift is captured with the relief keypress, and custom settings keep priority over new defaults. The bindings, survey, settings and input suites passed 67 focused tests.
- 2026-11-25: Slice 5 step 3 complete. Erkunden opens the six touch controls, with a nested relief view and direct mode choices. A world tap sets a measuring point; the flight and photo controls preserve their existing game modes. The touch, story touch and tools suites passed 47 focused tests.

- 2026-11-25: Slice 5 step 4 complete. The tour page points to Ausrüstung, K1 uses a plain pickup toast, and the K2 return names the spring. Rebuilt generated content and removed the two recordings of the former tour line. New and revised dialogue uses the normal fallback. The current gameplay and architecture docs describe the guided start and survey controls. The owner-dependent wording remains on the follow-up list. The voice and tour suites passed 86 focused tests.

- 2026-11-25: Slice 5 step 5 complete. Grepped the changed input codes, selectors, line IDs, item IDs, objectives and translation keys across `e2e/`, `e2e/helpers/`, `tests/` and all 13 `strings.ts` dictionaries. The two remaining Digit1 uses in Chronik and NPC specs exercise modal shortcuts. Typecheck, build, `mc validate` and `git diff --check` passed. The full unit suite passed all 1,507 tests in 110 files with `--maxWorkers=2` after the default parallel runs hit terrain-test timing limits. `pnpm validate` hit the tsx IPC sandbox block. `node --import tsx scripts/validate-content.ts` passed with existing warnings. The worktree used a local copy of the installed dependencies and pnpm’s dependency verification was disabled for the gate commands.
- 2026-11-25: Playwright discovered 64 tests across the 18 selected specs, plus the mobile tour runner. Browser runs and screen captures are pending. Run from the worktree root.

  ```sh
  pnpm build
  for spec in tour-slice chapter-prolog chapter-k1 chapter-k2 campaign story skills touch integration smoke combat camera avatar-mpfb chronik npc progression perf voice; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
  done
  scripts/dev/heavy.sh -- pnpm exec playwright test -c e2e/mobile/playwright.config.ts --workers=1
  ```

- 2026-11-25: The sandbox denied `git add` access to the worktree's `index.lock`. Run these commands from the worktree root to stage the slice and the two deleted voice clips, then commit.

  ```sh
  git add -A -- README.md .mc/tasks/todo/TASK-007-*.md content docs e2e public/voice/manifest.json public/voice/laub.t.seite.977b1f12.m4a public/voice/laub.t.seite.eb4cb03e.webm scripts src tests
  git commit -m 'feat(tour): add the Weiher staff handoff and survey controls' -m 'Refs: TASK-007' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  ```

- 2026-11-25: Slice 6 approved by the coordinator for the owner on `refactor/task-007-slice6`, based on `eb43993`.

- 2026-11-25: Slice 6 step 1 complete. Merged the opening and overview around the 18 shipped beats, Weiher staff handoff, spring touch, 549 EP and migration to K1. Optional quests and 1789 training are design proposals. All 38 focused tour, handover and content-budget tests passed.

- 2026-11-25: Slice 6 step 2 complete. Consolidated the endings, party sketches, Codex sources and voice direction. Marked older chapter and interface material as historical and documented the live startup, pause wording and touch controls. The 115 focused story, party, credits and voice tests passed.

- 2026-11-25: Slice 6 step 3 complete. Removed the five superseded tour drafts, repointed their references and queued the exact t13 Marlene and t18 Laub lines in TASK-014. No recordings were generated.

- 2026-11-25: Slice 6 step 4 complete. Added a 30-second timeout to each requested real-data test. The three files passed all 64 tests together. The travel route’s existing 150 ms performance assertion still applies.

- 2026-11-25: Slice 6 step 5 complete. Audited documented identifiers and keys in e2e, its helpers, tests and all 13 feature dictionaries plus src/i18n. No runtime identifiers changed. The legacy station point remains covered by its save-compatibility test. Relative documentation links and git diff --check passed.

- 2026-11-25: Typecheck and the production build passed. All 1,520 unit tests in 113 files passed with both the default worker count and `--maxWorkers=2`. `pnpm validate` hit the tsx IPC socket `EPERM`. `node --import tsx scripts/validate-content.ts` passed with the existing content warnings. MissionControl validation passed. Gate commands used a local copy of the installed dependencies and disabled pnpm’s automatic reinstall check.
- 2026-11-25: Playwright discovered 55 tests across 17 specs and one mobile tour test. Browser runs are pending. Run each spec with one worker.

  ```sh
  pnpm build
  for spec in smoke chapter-prolog tour-slice walk story integration pacing quelle chapter-k1-quelle campaign party chronik voice touch flaschen scenery travel-paths; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
  done
  scripts/dev/heavy.sh -- pnpm exec playwright test -c e2e/mobile/playwright.config.ts --workers=1
  ```

- 2026-11-25: The sandbox denied staging at the worktree’s `index.lock`. Stage the documentation, including the five deleted drafts under `docs/design/tour`, and the three test edits from the contributor shell.

  ```sh
  git add -A -- .mc/tasks/todo/TASK-010-*.md .mc/tasks/todo/TASK-014-*.md content/bible content/story/README.md docs/ACTION-RPG.md docs/IDEAS-ROUND11.md docs/PRD.md docs/design/tour scripts/content-build/routes/p-fuehrung.spec.json
  git commit -m 'docs(story): merge the guided-tour story bible' -m 'Refs: TASK-007' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

  git add -- .mc/tasks/todo/TASK-007-*.md tests/flaschen.test.ts tests/scenery.test.ts tests/travel.test.ts
  git commit -m 'test(world): allow more time for real-data checks' -m 'Refs: TASK-007' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  ```

- 2026-11-25: Slice 7 approved by the coordinator for the owner on `refactor/task-007-slice7`, based on `7f74d8d`.
- 2026-11-25: Slice 7 step 1 complete. Removed the unused retired-point list, retained the tripod seed and POI ordering, and updated location comments. All 33 travel tests passed. Bauwagen model in `public/assets`: none. The original trailer was procedural; `git show 4cd2559^:src/systems/story/hub/station.ts` retrieves its source. `story.end.back` and `story.credits.fictionText` were already absent.
- 2026-11-25: Slice 7 step 2 complete. Save preview and load now normalize the visitor name, live survey point lists and three retired station objective forms. The K3 slot is byte-for-byte reproducible with the historical serializer. It retains the active beat, character position, earned talent rank, items, POI history and archived quest. Typecheck and all 93 focused tests passed.
- 2026-11-25: Slice 7 step 3 complete. Talente shows „Wissen“, the K4 item and Fundstücke metadata use plain copy, and the bench uses „speichern“. The in-fiction Laub lines stay. Removed orphaned strings, the unused DOM ending fallback with its hound SVG and CSS, and the unused hand-font utility. The engine ending stage still provides the live motion and reduced-motion paths. Content regeneration produced no incidental changes. All 181 focused tests passed.
- 2026-11-25: Slice 7 step 4 complete. Audited 56 keys and IDs across e2e, its helpers, tests and all 13 feature dictionaries. Checked dynamic translation lookups, including the live turning controls and the three ending choices. Updated PRD and ACTION-RPG. Playwright discovered 82 tests across 21 specs and one mobile runner test. Browser execution and visual checks are pending. Run each spec with one worker.

  ```sh
  pnpm build
  for spec in smoke story chapter-prolog chapter-k2 chapter-k3 chapter-k4 campaign world progression touch notes npc chronik integration pacing pol-flow setpieces stage-k2k4 camera cinematic perf; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
  done
  scripts/dev/heavy.sh -- pnpm exec playwright test -c e2e/mobile/playwright.config.ts --workers=1
  ```
- 2026-11-25: Slice 7 step 5 checks complete. Typecheck, the production build, all 1,528 unit tests in 113 files with two workers, MissionControl validation and `git diff --check` passed. `pnpm validate` hit the tsx IPC socket `EPERM`. `node --import tsx scripts/validate-content.ts` passed with existing warnings. Tests also cover saves in which an earlier build persisted the untranslated name fallback key. Gate commands used a local copy of the installed dependencies with pnpm's reinstall check disabled.
- 2026-11-25: The sandbox denied staging at the worktree's `index.lock`. Run these commands from the worktree root. The additions are the migration module and historical slot. The SVG and CSS cleanup removes inline code.

  ```sh
  git add -A -- .mc/tasks/todo/TASK-007-*.md content docs e2e scripts src tests src/systems/story/migrate.ts tests/fixtures/saves/pre-quelle-k3.json
  git commit -m 'refactor(story): retire field station interface remnants' -m 'Refs: TASK-007' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  ```

## Notes
- Items marked "verify with owner" need a decision before work starts. Still open after 2026-11-23: final title wording, Bauwagen placement, where Sammlungen / Funde / Ausrüstung / Talente go, which in-fiction "Feldbuch" lines stay.
- Story content: chapters are generated by `scripts/content-build/`; the tour file is hand-authored.
%% mc-links: [[SPR-001]] %%
