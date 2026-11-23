---
id: TASK-007
aliases:
- TASK-007
title: Remove leftovers of the first game concept; align everything with the guided tour with time travel
slug: remove-leftovers-of-the-first-game-concept-align-everything-with-the-guided-tour
status: todo
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
updated: 2026-11-23
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
- [ ] `title.confirmNew`: "Der bisherige Spielstand wird überschrieben. Wirklich neu beginnen?"
- [ ] `title.hint` lists combat keys (Hieb, Wuchthieb, Bannlicht, Balsam) although the tour has no combat: show the tour's keys (move, interact, the survey-skill keys from section 6)
- [ ] Pause / toasts in plain wording: "Speichern" (`pause.save`), "Spielstand gespeichert." (`pause.saved`, `toast.saved`), "Ausgeruht. Spielstand gespeichert." (`story.hub.bench.saved`, if the rest action survives)
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

- [ ] Remove the journal modal, its key J and the touch button; nothing is lost: every surviving tab above has a new home
- [ ] Quest log and Codex reachable from the phone or the pause menu (pick one primary route, keep it consistent on desktop and mobile)
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
- [ ] e2e smoke and touched specs updated and green (`--workers=1`); unit tests green
- [ ] Docs updated: `docs/PRD.md` (changelog + outdated sections), `docs/ACTION-RPG.md` §14, README "How to play"
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- Items marked "verify with owner" need a decision before work starts. Still open after 2026-11-23: final title wording, Bauwagen placement, where Sammlungen / Funde / Ausrüstung / Talente go, the "Feldbuch" talent branch label, which in-fiction "Feldbuch" lines stay.
- Story content: chapters are generated by `scripts/content-build/`; the tour file is hand-authored.
