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
- [ ] e2e smoke and touched specs updated and green (`--workers=1`); unit tests green
- [ ] Docs updated: `docs/PRD.md` (changelog + outdated sections), `docs/ACTION-RPG.md` §14, README "How to play"
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Plan

_Status: approved 2026-11-24_

**Approach:** Retire the Feldbuch as a navigation system (§6) and change its save wording (§1). Pause is the primary route to all eight destinations on desktop and touch. Render each existing tab body in a plain modal with “Zurück”, using the current modal manager and dependencies. The phone gallery belongs to TASK-006. The complete legacy prologue belongs to the `?classic` follow-up, together with its save migration and tests against real v0.6–v0.8 saves.

**Files to touch:**

- `src/ui/menus.ts`, `src/ui/journal.ts`, `src/boot.ts` — connect registered feature pages to Pause and the existing modal manager. Preserve the independent shelf and collection-section registrations.
- `src/systems/quests/{index,journal,hud,strings}.ts`, `quests.css` — extract the Aufgaben, Codex and Sammlungen views from the book shell, including badges, tracking, sources and history.
- `src/systems/progression/{index,journal-tabs}.ts`, `progression.css` — use the equipment and talent renderers directly and remove the delayed inventory fallback.
- `src/systems/travel/index.ts`, `src/systems/flaschen/index.ts`, `src/systems/story/hub/overlay.ts` — carry over Karte, Funde, bottle counts and shelf access.
- `src/systems/photo/index.ts` — register the existing Album renderer as a Pause destination.
- `src/systems/chronik/{index,strings}.ts`, `src/systems/chronik/ui/card.ts` — point the clue card and the hub's Chronik path at Codex.
- `src/player/{input,touchMap}.ts`, `src/ui/{touch.ts,touchIcons.ts,touch.css}` — remove the journal action, button, icon and mobile book layout.
- `src/i18n/{de,de.content}.ts`, `src/systems/{story,skills}/strings.ts` — update save, name, skill and control text. The credits end line mentioned in §6 is already absent from `src/systems/story/endings/ui.ts`.
- `scripts/content-build/enden.mjs` → `content/story/05-enden.story.json` — make the endings builder own the free-roam objective text (`end.frei`) on a normal `node scripts/content-build/build.mjs` run. Its current optional `--story` path only writes epilogue data.
- `README.md`, `docs/ACTION-RPG.md`, `docs/PRD.md` — update “How to play”, the current journal controls and §14 row, and the PRD changelog. Unit and browser files are named below.

**Steps:**

- [x] 1. List Aufgaben, Codex, Sammlungen, Funde, Ausrüstung, Talente, Karte and Album in Pause. Use their existing tab renderers as plain modal bodies, including their refresh and close callbacks. “Zurück” returns focus to the entry. Make the list scrollable in landscape and keep the story's conditional pause actions available.
- [x] 2. Keep I → Ausrüstung and M → Karte as shortcuts. Connect the clue-card action to Codex and preserve the hub's pending clue cards, its `chronik:open/opened/closed` events and its return from Codex to the Pinnwand. Check the map's cleanup when leaving the view.
- [x] 3. Remove both journal shells, the J listener, journal default and rebind row, touch button and icon mappings, tab navigation and obsolete journal debug hooks. Update the HUD, controls, skill messages and name-entry heading. Use “Mehr dazu unter Pause → Aufgaben”, “Neu im Codex” and “Codex öffnen”. Point the free-roam ending at Pause in the endings builder, regenerate with `node scripts/content-build/build.mjs` and verify the generated story diff is confined to `end.frei`. Preserve the four owner-pending pages, their records and the `feldbuch.*` talents.
- [x] 4. Set title buttons to “Neues Spiel” and “Weiter”, and the overwrite prompt to “Der bisherige Spielstand wird überschrieben. Wirklich neu beginnen?”. Use “Speichern” for the pause action, “Spielstand gespeichert.” for its confirmation and save toast, and “Ausgeruht. Spielstand gespeichert.” for a successful rest. Update the corresponding README instructions and the two design-doc entries without linking task files.
- [ ] 5. Update the affected unit tests, Playwright specs and shared prologue helper. Run the four gates and compare the contributor's before/after views. Record results against this slice and keep the epic in progress.

**Test plan:**

- **Screenshots.** The contributor takes both before shots on unchanged code and repeats the same views after implementation. Save all four images in the **main checkout** under `test-results/contribute/TASK-007/`.
  1. **Desktop title, 1280×720.** In a disposable browser profile, start `http://localhost:5280/?notitle&fresh&q=low` and save once through Pause. Open `http://localhost:5280/?q=low` in that profile and wait for enabled `title-continue` and `title-new`. Capture both labels in `before-title.png` and later `after-title.png`.
  2. **Phone Pause, 844×390 landscape.** Enable touch emulation (`hasTouch: true`, mobile/coarse pointer) and open `http://localhost:5280/?notitle&fresh&nosave&q=low`. Once the opening card clears and the HUD is active, tap `touch-pause`. Capture the top of the menu in `before-pause-touch.png` and later `after-pause-touch.png` at the same scroll position.
- **Units.** Change the J assertions in `tests/camera.test.ts`, `tests/rpg-contracts.test.ts` and `tests/touchMap.test.ts`. In `tests/perf-settings.test.ts` cover an old settings record with a journal override plus a custom binding for a surviving action. Verify the retired action is ignored and the other binding still works. Keep quest tracking, talent ranks, album entries and save round-trip coverage green. Run `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
- **Selector and hook audit.** The recursive search includes `e2e/helpers/` and `e2e/mobile/`. Repeat against the final diff for each removed or renamed selector, hook and player-facing label. The old surface includes `journal`, `journal-fallback`, `journal-tab-*`, `journal-panel-*`, `touch-journal`, `bind-journal`, tab roles/selection and arrow/digit keys, `KeyJ` and quoted lowercase `'j'`. Migrate `window.kq.quests.journal/closeJournal/journalOpen` and `window.kq.progression.journal` callers to player controls. Retain the Chronik debug surface over Codex and the existing inner content selectors (including quest detail/history, gear/talents, Codex and album entries).

  ```sh
  rg -ni -e 'journal|feldbuch|weiter vermessen|keyj|[\x22\x27\x60]j[\x22\x27\x60]|kqj-|kqp-jf|data-tab|role=.tab|aria-selected' \
    -e 'chronik[!?.]+(open|isOpen|tab|close)\(|chronik:(open|closed)|hub-chronik' e2e/
  ```

  | Affected Playwright file | What to exercise |
  | --- | --- |
  | `quests.spec.ts` | Reward hint, Pause → Aufgaben, quest detail/history and sources, Codex and Sammlungen. |
  | `chronik.spec.ts` | Replace J and tab-strip arrow/digit assertions with keyboard entry, focus, Back/Escape, direct card → Codex and hub return. On default settings J alone opens nothing. |
  | `integration.spec.ts`, `npc.spec.ts` | Replace the journal root and Codex tab assertions. Close Codex to return to the originating hub exactly once. |
  | `progression.spec.ts`, `flaschen.spec.ts` | I → Ausrüstung, Pause → Talente, learn a talent, and Pause → Sammlungen for the bottle row. Replace the fallback selector and quest journal hooks. |
  | `photo.spec.ts` | Take a successful shot, put the phone away, open Pause → Album and verify the saved entry. |
  | `touch.spec.ts` | Replace the journal-button tap with `touch-pause`. Reach all eight destinations, scroll to the last entry and return with “Zurück”. |
  | `chapter-prolog.spec.ts` via `helpers/prolog.ts` | Replace only the journal open/close calls and screenshot in `playProlog` with Pause → Aufgaben and a return to play. |
  | `smoke.spec.ts`, `story.spec.ts` | Smoke plus title, overwrite/cancel, pause save/reload and bench feedback with saving enabled in an isolated profile. Preserve the title flow and hub clue-card queue. |

  `notes.spec.ts` injects its own Feldbuch toast and `perf.spec.ts` mentions the old title in a comment. Neither uses a retired control. The key search found `KeyJ` calls in quests, chronik and photo, and zero quoted lowercase `'j'` calls.

- **Contributor's browser run after the build.** Use keyboard events, touch taps and DOM buttons throughout. With `&manual`, wait for base `window.kq`, call `kq.step(1)` while polling for feature hooks, then drive the UI. Exercise the Pause list at both viewport sizes, the reduced-motion setting, Tab/Shift+Tab, one-layer dismissal, saved data after reload and the existing I/M shortcuts. The tests must run without acquiring real pointer lock.

  ```sh
  scripts/dev/heavy.sh -- pnpm exec playwright test \
    e2e/{smoke,quests,chronik,integration,npc,progression,flaschen,photo,touch,chapter-prolog,story}.spec.ts --workers=1
  ```

  The separate `e2e/mobile/tour.pw.ts` audit found `touch-journal`, dynamic `journal-tab-*` selectors and `quests.journal()` calls. Limit its edits to those broken interactions, retaining its state names and `scripts/dev/mobile-tour.ts` runner. The contributor's run comprises the eleven specs above.

  Audit player text with `rg -ni 'Feldbuch|\(J\)|\[J\]' src content`. Expect legacy prologue hits until the `?classic` slice removes `00-prolog.story.json`, its builder, pack and quests. Check the implementation diff for accidental changes to these files after regeneration.

**Risks:** Closing Codex can reopen the hub, and leaving Karte must release its map listeners. Run each cleanup once and restore focus to the originating control. Use the existing scrollable modal and still backdrop for touch and reduced motion. Verify save confirmation with saving enabled.

**Open questions:** Where should Sammlungen, Funde, Ausrüstung and Talente ultimately live? All four stay usable as separate Pause entries pending the owner's decision. The owner also retains the decision on the “Feldbuch” talent label and in-fiction notebook references, including voiced lines. These decisions can follow this slice.

**Acceptance criteria coverage** (in epic order, planned scope)

| Epic criterion | Coverage | Slice outcome |
| --- | --- | --- |
| 1. Title, new game and pause language | partial | Save actions and name heading. Title identity, lantern and wider opening copy follow. |
| 2. One-click tour map start | follow-up | New-game flow. |
| 3. Journal, Feldbuch wording and destinations | partial | Both shells and default J/touch entrances removed, all eight destinations reachable from Pause and save UI renamed. Legacy prompts, the phone gallery and owner-pending wording have later slices. |
| 4. Survey keymap and mobile controls | follow-up | Survey controls have their own slice. |
| 5. Classic removal and single bible | follow-up | Legacy migration and bible merge have separate slices. |
| 6. Visible Messstab handoff | follow-up | Tour item and avatar work. |
| 7. Hub move and spring E conflict | follow-up | Only the existing hub's Codex round trip is in scope. |
| 8. v0.6–v0.8 saves and migration test | follow-up | Existing formats and talent IDs are reused here. Legacy progress migration and its real-save test go together. |
| 9. Smoke, affected e2e and units | full | Required for this slice, including contributor-run browser checks. |
| 10. PRD, ACTION-RPG and README | partial | Changelog, §14 row and current controls/how-to. The broader concept rewrite follows. |
| 11. Four gates | full | All four must pass on the implemented slice. |

**Follow-up slices:**

- [ ] §5 — Retire `?classic`, legacy story/quests/pack, builder and exclusive voices. Migrate every legacy beat/quest state and test real v0.6–v0.8 saves for preserved progress and grants.
- [ ] §§1–2 — Tour title, icons, hints, metadata and one-tap route-map/audio start, including the remaining opening copy.
- [ ] §3 — Tour Messstab handoff, avatar visibility and XP budget.
- [ ] §§4–5 — Relocate the hub after the placement decision, restore the spring interaction and reconcile station IDs, endings and the “Bauwagen” text on the e1-wahl card.
- [ ] §6 — Resolve permanent destinations, talent wording and in-fiction/voiced references with the owner.
- [ ] §7 — Survey keymap, settings migration, touch expansion and tutorials.
- [ ] §§5, 8 — Merge the bibles, reconcile remaining PRD/architecture/gameplay docs, historical material and dead references.

## Progress

- Branch: `refactor/task-007-journal-classic`
- 2026-11-24: Step 1 implemented. Pause lists the eight existing feature views with badges, a scrollable list and a Back action. The conditional story actions remain available.
- 2026-11-24: Step 2 implemented. I opens Ausrüstung, M retains its map and comparison behavior, and the map cancels its frame and key listeners on close. Codex opens from clue cards and above the Pinnwand, preserving the hub and its clue queue.
- 2026-11-24: Step 3 implemented. Removed both journal shells, J and the touch entry. Regenerated content with `node scripts/content-build/build.mjs`. The generated diff changes only `end.frei`. Pending labels and legacy prologue content remain in place.

- 2026-11-24: Step 4 implemented. Updated the title, overwrite, pause, toast and bench wording, README “How to play”, ACTION-RPG §14 and the PRD changelog.
- 2026-11-24: Step 5 implementation and selector audit complete. Retained the inner quest, gear and talent test IDs. The only remaining J in e2e verifies that the retired binding does nothing. `helpers/prolog.ts` uses Pause in `playProlog` and steps the manual loop while `newGame` waits for hooks.
- 2026-11-24: `pnpm typecheck`, `pnpm test` (1,471 tests in 110 files), `pnpm build` and `git diff --check` passed. `pnpm validate` was blocked by `tsx` receiving `EPERM` while opening its IPC socket. Run `pnpm validate` outside the sandbox.
- 2026-11-24: Playwright specs awaiting the contributor's run, one worker per spec. Changed behavior or assertions: `smoke`, `quests`, `chronik`, `integration`, `npc`, `progression`, `flaschen`, `photo`, `touch`, `chapter-prolog` and `story`. The other specs that call the changed `newGame` helper are `campaign`, `pacing` and `quelle`. The audited `e2e/mobile/tour.pw.ts` runner uses the new controls. Title and landscape Pause after shots and the before/after comparison are pending.
- 2026-11-24: `git commit` was denied access to the worktree's `index.lock` after initial staging. Run the two commits from the contributor shell.
- 2026-11-24: Round 1. The contributor committed the slice (`fabbd44`, `05d40c5`) and passed all four gates outside the sandbox. Playwright reported 45 passed and one failure in `story.spec.ts`. Removed the duplicate title overrides so the main dictionary supplies „Weiter“ and „Neues Spiel“, and aligned the story alias and quest comment. Typecheck and 41 related unit tests passed. The browser rerun is pending. The sandbox denied `git add` access to the worktree's `index.lock`.

```sh
pnpm validate
pnpm build
for spec in smoke quests chronik integration npc progression flaschen photo touch chapter-prolog story pacing quelle campaign; do
  scripts/dev/heavy.sh -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1
done
```

## Notes
- Items marked "verify with owner" need a decision before work starts. Still open after 2026-11-23: final title wording, Bauwagen placement, where Sammlungen / Funde / Ausrüstung / Talente go, the "Feldbuch" talent branch label, which in-fiction "Feldbuch" lines stay.
- Story content: chapters are generated by `scripts/content-build/`; the tour file is hand-authored.
