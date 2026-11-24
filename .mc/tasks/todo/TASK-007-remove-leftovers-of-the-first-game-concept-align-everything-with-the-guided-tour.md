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
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-24
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
- [ ] **Decision: working title along the lines of "Schloss Karlsberg Tour"** on the title screen (`game.title` / title page); final wording is the owner's, keep it in one string so it is a one-line change
- [ ] **Decision: remove** the surveyor motto `title.motto` ("Fakten mit Quelle. ... Schauen, nicht graben.") and the subtitle `game.subtitle` ("Das Land erinnert sich") from the title screen (check other users of `game.subtitle`, e.g. `story.credits.sub`, `content/party/credits.json`; same decision there unless the owner says otherwise)
- [ ] Buttons without lantern icons (`LANTERN_SVG`, `.kq-lantern-btn`) and in plain wording: "Weiter" (`title.continue`, was "Weiter vermessen"), "Neues Spiel" (`title.newGame`, was "Neues Feldbuch beginnen"); delete `title.light` "Laterne entzünden"
- [x] `title.confirmNew`: "Der bisherige Spielstand wird überschrieben. Wirklich neu beginnen?"
- [ ] `title.hint` lists combat keys (Hieb, Wuchthieb, Bannlicht, Balsam) although the tour has no combat: show the tour's keys (move, interact, the survey-skill keys from section 6)
- [x] Pause / toasts in plain wording: "Speichern" (`pause.save`), "Spielstand gespeichert." (`pause.saved`, `toast.saved`), "Ausgeruht. Spielstand gespeichert." (`story.hub.bench.saved`, if the rest action survives)
- [ ] `index.html` meta description: "Ein düsteres Erkundungs-Rätselspiel ..." (a puzzle game; the game is an action RPG)
- [ ] README "How to play" still says "Laterne entzünden", "Neues Feldbuch beginnen"

### 2. The "lamp thing" before game start

It is the new-game flow in `src/systems/story/title/flow.ts` (installed via `titleHooks.beforeNewGame`):
content warning (16+) → name entry for the **surveyor** ("Feldbuch", default "Vermesser*in") →
a dark screen "Früh am Morgen, vor dem Bauwagen." with a big storm lantern and a matchbox and the
button "Laterne anzünden" (`story.lantern.*` in `src/systems/story/strings.ts`). The click also
unlocks audio. Styles in `src/systems/story/story.css` (`kqs-*`).
- [ ] **Decision: replace the lantern screen with a tour map screen** that shows the route **Karlsberger Hof → Felsenpfad → Weiher → Karlsbergquelle** (stops and path drawn on the map, in the UI's ink-on-paper style). It keeps exactly **one click / tap, "Tour starten"**, because that gesture unlocks audio. Remove `story.lantern.*`, the lantern and matchbox art and their `kqs-*` styles; the e2e test id changes (e.g. `start-tour` instead of `light-lantern`)
- [ ] Rework the name entry wording (visitor, not surveyor; `story.name.*`)
- [ ] Review the content warning text (`story.warning.body1` "Du kämpfst mit einem Messstab ...") against the tour opening
- [ ] Update `e2e` specs that click `light-lantern` / `title-new` (about 20 hits in `e2e/` and `tests/`)

### 3. The Messstab (the "stick")

Today: the tour grants `item.stab.esche` **quietly in the exit of beat `t18`** (after the first time
travel) together with XP, skills and items (`content/story/00-tour.story.json`, around line 347).
The avatar may show the staff on the back regardless (`staffOnBack()` in `src/player/costume.ts`,
used in `src/player/avatar.ts`); `src/systems/combat/index.ts` (~line 1320) still talks about
"picked up at the trailer". The tour design (Q14) says "Marlene lends it" and "Ach, behalt ihn" at
the party; Marlene only has a cameo in the tour today (beat `t12`).
- [ ] Keep the stick, but have the player **receive it during the tour**, before the time travel (e.g. Marlene hands it over at the Weiher, or a collect objective on the way); visible pickup feedback
- [ ] Hide the staff on the avatar until the item is owned
- [ ] Remove the quiet grant from `t18`; keep the XP budget (prologue ends at level 3, `tests/quests-content-a.test.ts`)
- [ ] Fix stale comments (combat, `src/ui/hud.ts` ~line 293 "the staff beside the trailer")

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

- [ ] **Decision: remove the legacy `?classic` prologue in this task, with save migration**: `content/story/00-prolog.story.json` (`legacy`), the `?classic` branch in `src/systems/story/index.ts` (~line 656) and its doc in `src/systems/story/types.ts` (~line 741), the builder `scripts/content-build/prolog.mjs`, `content/quests/00-prolog.quests.json`, `content/packs/prolog.pack.json`, and the voice lines only it uses. **Old saves must still load**: a save that stands in the legacy prologue (any beat, any quest state) is migrated, e.g. to the matching point of the tour or to the start of chapter 1 with the prologue's XP, items and skills granted (level 3, as the tour ends), never to a blank game; a unit test feeds real v0.6–v0.8 legacy saves through the migration
- [ ] Feldstation remnants: `RETIRED_POINTS` in `src/systems/travel/points.ts`, comments in `travel/pois.ts`, `story.end.back` "Zur Feldstation", `story.credits.fictionText` (lists "die Feldstation")
- [ ] `docs/archive/IDEA.md` (working title "Saarpfalz-Chroniken", the pre-design idea): archive or mark historical
- [ ] `docs/PRD.md`: §6.1 "No XP" (already marked superseded), §6.3 "The field station (hub)", §3 core loop and §4.2 story: rewrite for the tour concept
- [ ] `content/bible/*` vs `docs/design/tour/bible/*`: **decided, merge in this task**, see section 8
- [ ] `docs/ACTION-RPG.md`, `docs/ARCHITECTURE.md`: sections that still describe the surveyor start, the Feldstation, the hub overlay
- [ ] Save fields: story slice name default, hub state, any `feldstation` ids (see `src/core/save.ts`, story `migrate` maps)
- [ ] Dead code after the above (unused strings in `src/i18n/de.ts` and `story/strings.ts`, CSS, SVGs)

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
| Talent branch named "Feldbuch" ("Wissen und Vorrat") | `src/systems/progression/journal-tabs.ts` (`BRANCHES`, id `feldbuch`) | rename the label (e.g. "Wissen"); keep the internal id `feldbuch` so saves keep their talent points; **verify with owner** |
| Name entry titled "Feldbuch" | `story.name.title` in `src/systems/story/strings.ts` | plain title (e.g. "Dein Name"), see section 2 |
| Credits end line "{name} · Feldbuch geschlossen" | `src/systems/story/endings/ui.ts` ~line 270 | drop "Feldbuch geschlossen" |
| Other UI strings: "Noch keine Pläne im Feldbuch", skill card "Neu im Feldbuch" | `src/systems/skills/strings.ts` | plain wording ("Noch keine Pläne", "Neue Fähigkeit") |
| In-fiction mentions: Laub's notebook, Marlene's loose page, quest "Feldbuch-Notiz", story lines ("steht im Feldbuch") | `content/story/00-tour.story.json` (`laub.t.seite`), `01-kapitel-1`, `04-kapitel-4`, `05-enden` (`keep`, free-roam hint "im Feldbuch (J)"), `content/packs/*.pack.json`, `content/quests/04-kapitel-4.quests.json`, `src/systems/travel/lore.ts` | **verify with owner**: Laub's own field book as a story object may stay; lines that point the player to "das Feldbuch (J)" must change. Voiced lines need new clips |

- [x] Remove the journal modal, its key J and the touch button; nothing is lost: every surviving tab above has a new home
- [x] Quest log and Codex reachable from the phone or the pause menu (pick one primary route, keep it consistent on desktop and mobile)
- [ ] Rename the save UI as in the table; no "Feldbuch" left in UI strings (`grep -rn Feldbuch src content`), except in-fiction lines the owner keeps
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

- [ ] Apply the layout to `DEFAULT_BINDINGS`, `SHARED_KEYS`, the settings key list, `title.hint` and the key hints / tutorial strings (`ui.keys.*`, `tut.*`)
- [ ] Settings migration for stored bindings (unit test)
- [ ] **Mobile:** one small "survey" button that expands into a radial or sub-menu with the skill buttons (Geisterblick, Relief, Messen, Röntgenblick, Planblatt, Karte); builds on the existing relief pop-up (`scanPop` in `src/ui/touch.ts`); the top bar keeps only Pause (and the phone)
- [ ] e2e specs that press F / R / V / B / digit keys updated

### 8. Story bible merge (owner decision 2026-11-23: merge now, in this task)

- [ ] Merge `docs/design/tour/bible/*` (00-overview, 01-prolog, 06-enden, 07-codex-impact, 08-stimmen) into `content/bible/*` so `content/bible/` is the one bible for the tour concept; then delete or archive `docs/design/tour/bible/` and update every link to it (`docs/design/tour/README.md`, `impact.md`, `content/story/README.md`, AGENTS.md / CLAUDE.md if they mention it)
- [ ] Old-concept chapters in the bible (surveyor prologue `01-prolog.md`, Feldstation) rewritten or marked historical; `09-ui-texte.md` loses the "Feldbuch-Ton" rule

## Acceptance Criteria
- [ ] Title, new-game flow and pause menu speak of the tour, not of a surveyor / lantern / Feldstation (German text); working title on the title screen, no motto / subtitle
- [ ] The lantern screen is a tour map (Karlsberger Hof → Felsenpfad → Weiher → Karlsbergquelle) with one "Tour starten" click that unlocks audio
- [ ] No journal and no "Feldbuch" in the UI; save UI in plain wording; quest log, codex, map and album reachable as decided (section 6)
- [ ] Survey skills on the new keymap (no clash with the WASD hand) and behind one expanding button on mobile
- [ ] `?classic` and the legacy prologue files are gone; `content/bible/` is the single merged bible
- [ ] The Messstab is received visibly during the tour, before the first time travel, and not shown before
- [ ] No menu at the spring; its functions open at the Bauwagen (or, if the owner rejects the restore, through Marlene); the spring's touch has no E conflict
- [ ] **Old saves load**: saves from v0.6–v0.8 (mid-tour, after the tour, legacy prologue) are migrated or tolerated without losing XP, items or progress; a unit test covers the migration
- [x] e2e smoke and touched specs updated and green (`--workers=1`); unit tests green
- [ ] Docs updated: `docs/PRD.md` (changelog + outdated sections), `docs/ACTION-RPG.md` §14, README "How to play"
- [x] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan

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
- [ ] 2. Migrate by current story chapter, independent of beat or quest state. Resume active `k1/k1_0` in `today` at the chapter checkpoint (1059.3, −833.1, yaw 50°). Mark the replacement opening `tour` complete and add K1 to the unlocked chapters. Preserve name, completed beats/chapters, quest counts and deeds, codex, playtime and unrelated system slices. Clear the retired objective, latches, timers, threats, anchor, tracked objectives and their spawned groups/pickups before restore. Preserve quest history and credit earned pending rewards once. Apply the `t17/t18` handover as minimums. Bring XP to at least 549 (level 3), credit the newly earned level points, keep higher totals, talents and equipment. Set relief ≥3, kartograf ≥1, the Bussole in story inventory, `story.compass` and `story.laub`. In RPG inventory ensure the Eschenstab, `item.p.seite`, four Balsam and one Lampenöl, preserving higher counts.
- [ ] 3. Retire `classic`, `PROLOG_WAKES` / `prologWake` and the playable `prolog` entry. Register the retired file’s item definitions independently of its playable quests. Verify that chapter select and debug jumps cannot reach the prologue, the normal tour and test/dev chapters still work, and K1 offers its first quest and accepts the spring touch after Continue.
- [ ] 4. Replace the legacy browser playthrough with bookmark and saved-game Continue coverage. Move pacing, spring, hub and cross-system assertions onto tour/K1 beats or existing test content. Keep the shared `newGame`, quest and spring helpers used by later chapters. Update the affected docs.
- [ ] 5. Run the migration matrix, identifier audit and four gates. The contributor runs the named browser checks, compares the desktop pair and checks the touch Continue view. Record results under Progress. Allow at most two fix rounds after implementation. If issues remain after round two, record them and stop for the contributor.

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

  - Desktop 1280×720: the contributor captured `before-classic-start-desktop.png` on unchanged code at `http://localhost:5280/?classic&notitle&fresh&nosave&q=low`. Repeat that URL and the same start action and framing for `after-classic-start-desktop.png`.
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
| 9. Smoke, affected e2e and units | full | Requires green units and contributor-run browser checks for this slice. |
| 10. PRD, ACTION-RPG and README | partial | PRD changelog, §14 and active opening/save references. Slice 1 updated README controls. The wider docs sweep follows. |
| 11. Four gates | full | Requires green results on the implementation. |

**Follow-up slices:**

- [ ] §5 — Extract the shared page item and K4 nouns, rehome codex unlocks and retain earned epilogue deeds. Delete `content/story/00-prolog.story.json`, `content/quests/00-prolog.quests.json`, `content/packs/prolog.pack.json`, `scripts/content-build/prolog.mjs` and its `build.mjs` entry. Audit exclusive voice IDs, text hashes, priority selectors and manifest/clip references against the tour, chapters, speakers and shared barks before pruning. Retarget the content, budget, wayfinding, travel and voice tests. Edit builders, run `node scripts/content-build/build.mjs`, inspect generated diffs and run `pnpm validate`.
- [ ] §§1–2 — Tour title, icons, hints, metadata and one-tap route-map/audio start, including the remaining opening copy.
- [ ] §3 — Tour Messstab handoff, avatar visibility and XP budget.
- [ ] §§4–5 — Relocate the hub after placement is settled, restore the spring interaction and reconcile station IDs, endings and the e1-wahl card.
- [ ] §6 — Remaining destinations, talent wording and in-fiction/voiced references, once settled.
- [ ] §7 — Survey keymap, settings migration, touch expansion and tutorials.
- [ ] §§5, 8 — Merge the bibles and reconcile remaining PRD, architecture, gameplay and historical references.

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

## Notes
- Items marked "verify with owner" need a decision before work starts. Still open after 2026-11-23: final title wording, Bauwagen placement, where Sammlungen / Funde / Ausrüstung / Talente go, the "Feldbuch" talent branch label, which in-fiction "Feldbuch" lines stay.
- Story content: chapters are generated by `scripts/content-build/`; the tour file is hand-authored.
