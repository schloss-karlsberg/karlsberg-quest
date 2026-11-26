# Mobile UI pass: plan and checklist

The owner's ask: *"test the game in the mobile browser and improve the UI situation"*.

- **Phase 1 (this document):** a playtester tours the game on emulated phones and a tablet, takes screenshots and measures the UI.
- **Phase 2:** a fixer works from the findings.

This page holds the plan, the checklist, the rubric and the run commands. The findings go in §8 once the runs are done.

## 1. Scope

A fresh player's way through the game:

1. The title screen.
2. A new game: the content warning, the name, the tour map.
3. The whole prologue ("Vermessung"): the HUD, the first fights, Relief, the first time travel, the Bussole, the field book, the night.
4. The first minutes of K1 ("Der Hof"): the chapter card at the spring, the 1789 court, the first conversation (Hanne).

The pass covers UI only: the layout, the readability, the touch controls, menus and overlays. The 3D look, the balance and the story are out of scope.

## 2. Devices

Every unit runs with touch input on and mobile emulation (`isMobile`, `hasTouch`, a mobile UA, `pointer: coarse`, so the game turns its touch controls on by itself). Phones run at DPR 3, the tablet at DPR 2. Each unit also emulates safe-area insets; see §4.5.

| unit | viewport (CSS px) | DPR | insets t/r/b/l | what runs |
|---|---|---|---|---|
| `small-landscape` | 667×375 | 3 | 0/47/21/47 | everything |
| `small-portrait` | 375×667 | 3 | 47/0/34/0 | title, menus, the rotate overlay |
| `large-landscape` | 932×430 | 3 | 0/59/21/59 | everything |
| `large-portrait` | 430×932 | 3 | 59/0/34/0 | title, menus, the rotate overlay |
| `tablet-landscape` | 1180×820 | 2 | 24/0/20/0 | everything (optional, last) |
| `tablet-portrait` | 820×1180 | 2 | 24/0/20/0 | everything (optional, last) |

The table lives in code in `e2e/mobile/devices.ts`.

### 2.1 Portrait decision (the coordinator, for the owner)

**Phones are landscape-only for gameplay.** Portrait phones get the "please rotate" overlay: `.kq-rotate` in `src/ui/touch.css`, shown with `html[data-kq-touch]`, portrait orientation, `max-width: 600px`. The portrait units check:

- **The overlay itself.** It should be friendly and in German, with a clear rotate icon, and show the game title or art instead of a blank screen. Today it is only text on a dark panel (`touch.rotate`: „Bitte das Gerät quer halten – Karlsberg Quest spielt im Querformat.“). The tour records what a portrait user actually sees.
- **The title screen, the settings and the „Neuigkeiten“ page in portrait.** These should be readable in portrait if that is cheap. The overlay needs `data-kq-touch` and appears only once touch mode is on, so the title is reachable in portrait. The state `rotate` then checks whether the overlay sits above or below a modal opened under it.

**Tablets (820×1180) may play in portrait if the layout holds.** The overlay's `max-width: 600px` does not match the tablet, so tablet portrait runs the full gameplay list. The verdict goes in §8: does it hold, or should tablets be landscape-only too?

## 3. Screen / state checklist

Each unit shoots these states in order. The file name is `<NN>-<state>[-<sub>].png`, and `-bottom` marks a long page scrolled to its end. The ✱ column marks the states also shot on portrait phones.

| NN | state | ✱ | what is shot (subs) | how it is reached |
|---|---|---|---|---|
| 01 | `title` | ✱ | title screen | boot `?nosave&fresh` |
| 02 | `news` | ✱ | „Neuigkeiten“ modal, `-bottom` | **tap** `title-news`, touch swipe |
| 03 | `title-settings` | ✱ | settings from the title: every tab (`game` `controls` `graphics` `access` `audio`), each `-bottom` | **tap** `title-settings`, **tap** `set-nav-*`, swipe |
| 04 | `warning` | ✱ | content warning (16+) | **tap** `title-new` |
| 05 | `name` | ✱ | name entry, `-typed` | **tap** `warning-accept`, **tap** the field |
| 06 | `tour-map` | ✱ | route map, `-first-frame` (the first tour card) | **tap** `name-confirm`, **tap** `start-tour` |
| 07 | `rotate` | ✱ | portrait: `-overlay`, `-with-journal` (a modal under the overlay); landscape: N/A | — |
| 08 | `hud-idle` | | HUD at rest: compass, quest tracker, vitals, touch controls | `story.goto('prolog','p1')`, teleport to the station |
| 09 | `toasts` | | the first of two queued toasts, an XP float, the tracker | `ui.toast`, `progression.xp` |
| 10 | `touch-stick` | | stick `-walk`, `-sprint` (at the rim), `-walk-look` (2 fingers) | **real touch**, held during the shot |
| 11 | `touch-buttons` | | `-attack-held` (pressed), `-cue-interact` (Aktion lit with the prompt text), `-cue-shift` (cue ring), `-relief-pop` | **real touch**, `hud.prompt` |
| 12 | `dialogue` | | subtitles + portrait at the default size, `-xl` (largest subtitle size vs. the thumb arc) | `story.say('laub', …)` |
| 13 | `pause` | | pause menu, `-bottom`, `-controls` (+bottom), `-licences` (+bottom) | **tap** `touch-pause` … |
| 14 | `settings` | | settings from pause: every tab + `-bottom` | **tap** `touch-pause` → `pause-settings` → `set-nav-*` |
| 15 | `map` | | the map, `-bottom` if it scrolls | **tap** `touch-map` |
| 16 | `journal` | | Feldbuch: every tab present (`quests`, `codex`, `sets`, `gear` = inventory and equipment, `talents`, the Fundstücke tab …), each `-bottom` | **tap** `touch-journal`, **tap** `journal-tab-*` |
| 17 | `combat` | | `-approach` (enemy bars, threat), `-lock-on`, `-bannlicht`, `-hit`, `-skills` (skill buttons after a level-up), `-skill-used` (cooldown) | spawn 3 Nebelinge in the field (god mode), **tap** `touch-lock` / `touch-bannlicht` / `touch-attack` / `touch-skill1` |
| 18 | `level-card` | | level-up card | `progression.level(n+1)` |
| 19 | `era-shift` | | `-mid` (the effect over the HUD), `-1789` (lantern, era label) | `fx.shift('1789')` at the Ehrenhof |
| 20 | `travel-card` | | travel point activated banner | `travel.activate(id)` |
| 21 | `death` | | `-curtain`, `-wake` | `story.caught('combat', 4000)` |
| 22 | `photo` | | `-hud` (top row with the phone button), `-open` (phone frame), `-shutter` | **tap** `touch-photo`, **tap** `touch-attack` (the shutter); `kq.photo.open()` as fallback (photo mode landed on main as 63eca28) |
| 23 | `k1-card` | | „Der Hof“ chapter card at the spring, `-hud` (K1 opening HUD + tracker) | `story.goto('k1')` |
| 24 | `k1-court` | | 1789 court: NPC markers, lantern | `setEra('1789')`, teleport |
| 25 | `npc-talk` | | Hanne: `-line`, `-topics` (the choices), `-answer` | `npc.talk('hanne')`, **tap** a `npc-topic-*` |
| 26 | `skill-unlock` | | standalone Baumeister unlock with a long Aktion prompt, then `-dismissed` | `skills.grant('baumeister', 1)`, **tap** the play surface |
| 27 | `credits` | ✱ | `-crawl`, `-static`, `-static-scrolled`, or the rotate overlay during each mode on portrait phones | `party.set('burn')`, `party.credits()`, **swipe** the static list and **tap** `party-credits-skip` |

Long modals are covered by `news`, `title-settings`, `settings`, `pause` (controls, licences) and `journal`. Each is swiped with a finger to its end, then scrolled by script to be sure. The `-bottom` shot notes whether the swipe alone moved it; if not, that is a scroll trap.

## 4. UI problem rubric

Severity:

- **S1 blocks play:** you can't tap it, can't read it, or it hides something you need.
- **S2 hurts:** it works, but badly or with mis-taps.
- **S3 polish.**

The runner gives each issue a severity hint (`findings.json`). The playtester confirms or changes it from the screenshot.

| # | problem | how it is measured | hint |
|---|---|---|---|
| 4.1 | **Overlaps** | Intersections (> 24 px²) between visible HUD/overlay regions (compass, docks, tracker, dialogue, subtitles, prompt, cards, touch buttons, stick, modals) and every interactive element; ancestors, modal-covered HUD and the rotate overlay are excluded | S1 two tap targets; S2 a control over text; S3 the rest |
| 4.2 | **Small text / low contrast** | Every visible text element under 12 CSS px; WCAG contrast against the nearest opaque background (text over the 3D canvas or a texture is "unknown": judged by eye) | S2 < 10 px or < 2.5:1; S3 < 12 px or below AA |
| 4.3 | **Tap targets < 44×44** | The bounding box of every visible, uncovered interactive element (the label for a radio or checkbox) | S1 < 24 px; S2 < 44 px |
| 4.4 | **HUD crowding** | Shots of `hud-idle`, `toasts`, `combat-*`, `dialogue-xl`; judged by eye, with the overlap count per state | — |
| 4.5 | **Notch / safe areas** | Insets are emulated per unit (below); visible UI inside an inset zone is flagged | S2 interactive; S3 other |
| 4.6 | **Modals cut off, scroll traps, double scrollbars** | The top modal's box outside the viewport; nested scroll containers; a scrollable page the touch swipe does not move | S1 cut or trap; S2 double |
| 4.7 | **Controls over UI or the subject; subtitles vs. touch controls** | Overlaps (4.1) with `.kq-t-*`; `dialogue-xl` against the thumb arc; `combat-*`, where the player and enemy should stay clear of the stick and buttons | as 4.1 |
| 4.8 | **Menu stutter** | Each shot samples 1.5 s of rAF frame deltas (p50, p95, max, frames > 50 ms) plus `kq.perf()` (`src/render/perf.ts` `PerfMonitor.summary()`: fps, frame avg/p95/max, CPU, GPU ms, draw calls) | S2 p95 > 33 ms in a menu; S3 > 20 ms |
| 4.9 | **Landscape vs. portrait** | The same state on both units side by side (tablet; phone title and menus) | — |
| 4.10 | **German text overflow** | Text cut by `overflow: hidden` / `text-overflow: ellipsis` / line clamp (`text-clipped`, with the text) | S2 if meaning is lost |

**Safe-area emulation (4.5).** Chromium's CDP has `Emulation.setSafeAreaInsetsOverride`; it is in Playwright 1.64's protocol types. The tour calls it and then checks with a probe element whether `env(safe-area-inset-*)` really resolves to the insets. If the method or the probe fails, it falls back to overriding the game's own variables `--kq-safe-t/r/b/l` on `:root`. Only `src/ui/touch.css` reads `env()`; the rest of the HUD ignores safe areas, which is a likely finding in itself.

`findings.json` records which method ran (`safeArea: "cdp" | "css-fallback"`). The geometric check runs either way, against the inset rectangles. `--mask` draws the inset zones as dashed outlines into the shots for review; it is off by default, so the shots show what a player sees.

## 5. Method

- **Reach states fast, interact for real.**
  - The tour stages each state through `window.kq`: `story.goto`, `teleport`, `setEra`, `combat.spawn`/`god`/`kill`, `progression.level`/`grant`, `fx.shift`, `travel.activate`, `story.caught`, `npc.talk`, `ui.modals`. It uses the shared `QUEST_PLAY` helpers from `e2e/helpers/prolog.ts` for the tidy-up.
  - Everything a player does with a finger is a real CDP touch event (`Input.dispatchTouchEvent`, the `Finger` class from `e2e/touch.spec.ts`), so the browser makes the pointer events itself: the title flow, opening pause, map and field book, tabs, lock-on, Hieb, Bannlicht, skills, the stick, look drags, swiping long pages, NPC topics.
  - The game runs in real time (no `?manual`), so frame times are real and cards and effects behave as on a phone.
  - Graphics quality is left to the game's mobile defaults (`src/render/mobileDefaults.ts` via `pointer: coarse`), not forced. The chosen level is recorded.
- **Measure automatically.** Each shot runs `measureUi` (`e2e/mobile/measure.ts`) in the page: tap targets, overlaps, text size and contrast, clipped text, safe-area intersections, modal scroll. It also samples frame times. The results land in `test-results/mobile-tour/<unit>/findings.json` next to the PNGs.
- **Then look.** Phase 1's report walks every PNG by eye. Some things the measurements cannot catch: art covered by the stick, a crowded HUD, text over a bright sky, whether the rotate overlay is friendly. The report lists issues as `S1/S2/S3 · unit · state · what · evidence (file)`.
- **A fresh player's eye.** Is the next step clear on a phone without a keyboard? Can every prompt be answered by touch? Is anything needed only reachable by keys?
- **Limits.**
  - Emulation has no on-screen keyboard: the name field's real-world view with the keyboard up is judged from its position.
  - Emulation has no real thumb occlusion and no dynamic toolbar (the browser bars that shrink on scroll).
  - The GPU is the Mac's (Apple, ANGLE Metal), not a phone's: frame times show UI stutter and relative cost, not phone performance.

## 6. Runner and real GPU

| file | role |
|---|---|
| `e2e/mobile/devices.ts` | the unit matrix |
| `e2e/mobile/tour.pw.ts` | the tour: states, touch, shots, `findings.json`. It is not a `*.spec.ts`, so the normal suite never runs it |
| `e2e/mobile/measure.ts` | in-page measurements |
| `e2e/mobile/playwright.config.ts` | its own config: real-GPU flags, preview server on port **5340** (`KQ_MOBILE_PORT`); refuses a normal `heavy.sh` slot, run it `--exclusive` |
| `scripts/dev/mobile-tour.ts` | the CLI: `--device`, `--states`, `--build`, `--headed`, `--mask`, `--list` |

**Real GPU.** The suite (`playwright.config.ts`) uses SwiftShader on purpose. The repo's real-GPU precedent is `scripts/dev/storyboard.mjs`: headless Chromium with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, which logs `UNMASKED_RENDERER_WEBGL` and warns on a software renderer. The tour uses the same flags.

- At boot it logs the renderer and **aborts if it is SwiftShader / software**, unless `KQ_MOBILE_ALLOW_SOFT=1` is set.
- If headless ever falls back to software on this Mac, `--headed` runs a visible Chromium window. That needs the logged-in desktop session; the lock rules are the same.
- The renderer string is stored in `findings.json` (`gpu`).

**Re-shooting a subset.** `--states journal,combat` shoots only those states (ids or prefixes) and merges them into the unit's existing `findings.json`. Notes are tagged with their state (`[journal] …`): a full unit run starts with none, and a subset run replaces the notes of the states it re-shoots (untagged notes from older runs are dropped). A title-flow step brings its predecessors (`tour-map` → `warning`, `name`). Gameplay states start a new game by taps when the title is still up.

## 7. Run commands (one unit per lock hold)

Run order (coordinator): small-landscape, large-landscape, small-portrait, large-portrait, tablet-portrait, tablet-landscape. Never two units at once.

Run from this worktree. `dist/` must exist: `pnpm build` once, outside the lock. If `dist/index.html` is missing, the runner builds it itself, and `--build` forces a fresh build.

```sh
cd <this worktree>
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device large-landscape
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-portrait
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device large-portrait
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device tablet-portrait
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device tablet-landscape
# re-shoot a subset:
KQ_HEAVY_OWNER=kq-mobile scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape --states journal,combat
```

**Estimated time per unit.** Boot is about 1–1.5 min: the preview server, terrain and assets on the real GPU, the title flow. Each shot takes about 3 s: 0.6 s settle, 1.5 s frame sample, measurement and a DPR 3 PNG.

| unit | shots | estimate |
|---|---|---|
| landscape phones | ≈ 75–80, plus about 15 s of staged waits | **≈ 6–8 min** |
| portrait phones | ≈ 20 | **≈ 2–3 min** |
| tablet, each orientation | ≈ 80 (DPR 2) | **≈ 7–9 min** |

Every unit stays under the 15-min hold; the test itself times out at 14 min. All six take about 35 min of lock time in all.

## 8. Findings

**Run of 2026-11-21.** Branch `mobile/ui-pass`, which includes main with photo mode (63eca28).

**Setup, every unit:**
- GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)`. Headless Metal works; no SwiftShader fallback was needed.
- Safe areas: the CDP override `Emulation.setSafeAreaInsetsOverride` worked. The probe confirmed that `env()` returns the emulated insets.
- Graphics: the game picked quality `high` on its own (the mobile defaults with an Apple GPU string).

**Screenshot root:** `test-results/mobile-tour/<unit>/`, with `findings.json` next to the PNGs. The folder is not committed; it is reproducible with §7. In the findings below, screenshot paths are relative to that root.

| unit | result | wall time (lock hold) | shots |
|---|---|---|---|
| small-landscape | pass. `news` and `journal` failed in the first run; the re-run of `news,hud-idle,journal,photo` fixed `journal` and `photo`, but `news` still fails (M-04) | 4.5 min + 1.7 min | 78 |
| large-landscape | pass, all states (its run predates photo mode, so it has no `photo` shots) | 4.5 min | 76 |
| small-portrait | the first run failed: the overlay blocks every tap (M-02). After a runner fix: pass | 1.1 min | 21 |
| large-portrait | pass | 1.1 min | 21 |
| tablet-portrait | pass, all states | 4.6 min | 78 |
| tablet-landscape | pass, all states | 4.5 min | 75 |

**Not reached:**
- `news` on small-landscape: the „Neuigkeiten“ link sits below the fold of the title card (M-04).
- `photo` on large-landscape: its run predates photo mode and was not re-run.
- Taps on `touch-journal` and `touch-photo` failed on small-landscape (M-01). The runner opened those screens through `kq` instead and wrote this to `findings.json` → `notes`.

**Menu stutter:** none. Every menu, modal and HUD state samples at p50 and p95 16.7 ms, i.e. 60 fps, on all units. The only outlier is the era-shift effect itself (M-17).

**Measurement caveats.** I read every screenshot myself; the automatic numbers were only a guide. The severities below are mine, not the runner's hints.
- `K-BERG 2` at 6.5 px is the drawn display of the radio prop, decoration only, so I dropped it.
- On the tablet units the runner reports `touch-* ∩ canvas` overlaps. That is a runner artefact: once the touch layer is skipped, the canvas counts as a region. Ignore those lines.

**Counts (curated): S1 1 · S2 12 · S3 6**, 19 findings in all.

### S1: blocks play

**M-01 · S1 · small-landscape (667×375), and partly large-landscape · hud-idle, dialogue, combat, photo** → *fixed* (see §8.1)
- **What's wrong:**
  - On a small phone the dialogue card (`.kqs-dlg`) shrinks to a narrow, very tall column, about 287 px wide, because of `width: calc(100vw - 380px)`. It runs from the top edge to the thumb arc, on the right half of the screen.
  - It sits above the touch layer and has `pointer-events: auto`, so while a radio line or Laub is talking it covers and **swallows taps** on the top-row buttons (Relief, Handy-Kamera, Feldbuch, Fliegen) and on the Epoche and Aktion buttons.
  - The tour's taps on `touch-journal` and `touch-photo` did nothing because of this. The radio lines play during the whole prologue, so the field book and the phone are often unreachable by touch.
  - The tall card also hides the subject in the middle of the screen.
- **Screenshots:** `small-landscape/08-hud-idle.png`, `small-landscape/22-photo-hud.png`, `small-landscape/06-lantern-first-frame.png`, `small-landscape/17-combat-lock-on.png`.
- **Suggested fix:** a phone rule for `.kqs-dlg` under `@media (max-height: 500px)`:
  - a wide, low card between the stick zone and the thumb arc, roughly `left: 20vw; right: 30vw; bottom: 8px; max-height: 38vh`, with a smaller font and portrait, and scrolling inside;
  - never higher than the top row: z-index below `.kq-t-top`, or `top >= 60px`;
  - `pointer-events` only on the card body.
- **Likely files:** `src/systems/story/story.css` (`.kqs-dlg`), `src/ui/touch.css`.

### S2: hurts

**M-02 · S2 · small-portrait, large-portrait · title, rotate** → *fixed* (see §8.1)
- **What's wrong:**
  - The rotate overlay already shows on the title screen. Touch mode is on from the first frame, and the overlay keys only on `data-kq-touch` and orientation, so it blocks every tap: no title, no „Neuigkeiten“, no settings, no new game.
  - The overlay itself is plain white text on a dimmed screen. It has no rotate icon and no title art.
  - The title screen behind it would be readable in portrait: the runner hid the overlay to take `01-title-no-overlay.png`.
- **Screenshots:** `small-portrait/01-title.png`, `small-portrait/01-title-no-overlay.png`, `small-portrait/07-rotate-overlay.png`, `large-portrait/07-rotate-overlay.png`.
- **Suggested fix:**
  - Show the overlay only during gameplay, e.g. `html[data-kq-touch][data-kq-playing]`, set when the touch controls become visible. Leave the title, the new-game screens and the menus usable in portrait.
  - Make the overlay friendly: the game title in its small-caps face, a rotate-phone SVG with a gentle animation (still under reduced motion), the German text on two short lines, and paper or dark-wood art instead of a flat dim.
- **Likely files:** `src/ui/touch.css` (`.kq-rotate`), `src/ui/touch.ts` (overlay markup, `touch.rotate`).

**M-03 · S2 · small-portrait, large-portrait · title-settings** → *fixed* (see §8.1)
- **What's wrong:**
  - The settings grid keeps its two columns at 375 and 430 px. The label column is squeezed to one or two words per line, e.g. „Eine / Taste / für / Aktionen / (z. / B. …“.
  - Checkboxes, sliders and radio groups are drawn on top of the label text: „Ge✓sche“, the sliders cross „Gesamtlautstärke“, and the Grafik radios sit on „Grafik“.
  - The tab chips wrap to three rows and the sticky tab bar covers the first row of the content.
- **Screenshots:** `small-portrait/03-title-settings-game.png`, `small-portrait/03-title-settings-controls.png`, `small-portrait/03-title-settings-graphics.png`, `small-portrait/03-title-settings-access.png`, `large-portrait/03-title-settings-game.png`.
- **Suggested fix:** under about 600 px width, stack each row: label on top, control below (`grid-template-columns: 1fr`). Let the tab chips scroll horizontally on one line.
- **Likely files:** `src/ui/settings.ts`, `src/ui/styles.css` (`.kq-settings`).

**M-04 · S2 · small-landscape · title, news** → *fixed* (see §8.1)
- **What's wrong:**
  - On a 375 px tall screen the title card is taller than the viewport. „Neuigkeiten“ and „Lizenzen & Quellen“ sit below the fold, measured off-screen at y ≈ 399.
  - The tour scrolled the link into view and tapped it, and the news did not open, in both runs. The tap after the scroll seems to land on the scroll container, not the link. A manual check is needed.
  - On large-landscape the links are also flagged off-screen, but the tap worked there.
- **Screenshots:** `small-landscape/01-title.png`, `small-landscape/02-news-error.png`.
- **Suggested fix:** a compact title layout for `max-height: 500px`:
  - title and subtitle smaller;
  - the hint lines („Maus: umsehen · WASD …“) hidden on touch, since they are desktop keys anyway;
  - „Neuigkeiten“ and „Lizenzen“ moved next to the buttons, so everything fits without scrolling.
- **Likely files:** `src/ui/title.ts`, `src/ui/styles.css` (`.kq-title`).

**M-05 · S2 · all touch units · lantern first frame, hud-idle** → *partly fixed (Aktion label); wording at kq-story* (see §8.1)
- **What's wrong:** the first gameplay prompt is desktop-only text. „Gehen · ins Bild klicken, dann Maus: Schauen · Shift: Rennen“ shows in the bottom prompt pill and in the Aktion button's label, where it is cut to „Gehen · ins Bild klick…“. On touch there is no mouse, no click-to-look and no Shift.
- **Screenshots:** `tablet-landscape/06-lantern-first-frame.png`, `small-portrait/06-lantern-first-frame.png`, `large-landscape/06-lantern-first-frame.png`.
- **Suggested fix:**
  - A touch variant of the prompt, e.g. „Gehen · links ziehen: laufen, rechts wischen: umsehen“.
  - Keep the Aktion button label at „Aktion“ for prompts that are not interactions. `touchIconFor` returns `interact` for this `W A S D` key.
- **Likely files:** `content/story/00-prolog.story.json` (the p1 prompt), `src/player/touchMap.ts` (`touchIconFor`), `src/ui/touch.ts` (`setPrompt`).

**M-06 · S2 · all units · every gameplay state** → *fixed* (see §8.1)
- **What's wrong:** the Epoche button (`touch-shift`, hourglass) overlaps the Aktion pill (`touch-interact`) by about 34×19 px, on every device. The two have different jobs (time travel vs. interact/listen), so a thumb aiming for one can hit the other.
- **Screenshots:** `tablet-landscape/11-touch-buttons-cue-shift.png`, `large-landscape/08-hud-idle.png`.
- **Suggested fix:** move `.kq-t-btn.shift` left or down in the arc, or let the Aktion pill grow to the left from a fixed right edge so the two keep at least 8 px apart.
- **Likely file:** `src/ui/touch.css` (`.kq-t-arc`, `.shift`, `.interact`).

**M-07 · S2 · all units (worst on phones) · settings, title-settings, pause** → *fixed* (see §8.1)
- **What's wrong:** the menu controls are desktop-sized for touch:
  - checkboxes are 20×20 px: Sanfter Modus, Schadenszahlen, Energiesparen, Weniger Bewegung …;
  - sliders are 180×16 px: volumes, Sichtfeld, Auflösung;
  - radio labels are 23 px tall: Grafik, Bildrate, Kamera, Untertitelgröße, Touch-Steuerung;
  - the settings tab chips are 27 px tall;
  - the modal close `×` is 24×28 px;
  - pause „Zum Titelbild“ is 92×24 px;
  - the menu buttons are 43 px tall.
- **Screenshots:** `small-landscape/14-settings-game.png`, `small-landscape/14-settings-audio.png`, `small-landscape/13-pause.png`; all measured in `findings.json`.
- **Suggested fix:** under `html[data-kq-touch]`:
  - make the whole settings row the tap target (wrap each control in its `<label>`, or give the row `min-height: 44px`);
  - checkboxes 28 px with 44 px rows;
  - slider thumb 28 px, track hit area 44 px;
  - radio labels with `min-height: 44px; padding`;
  - tab chips and `×` at least 44 px;
  - `.kq-btn` with `min-height: 44px`.
- **Likely files:** `src/ui/styles.css`, `src/ui/settings.ts`, `src/ui/touch.css`.

**M-08 · S2 · small-landscape, large-landscape · settings, pause, map, npc-talk** → *fixed* (see §8.1)
- **What's wrong:**
  - Modals ignore the notch: content and buttons sit inside the 47 or 59 px side insets of a phone held sideways. Examples: the Grafik radio „Hoch“, „Schließen“, „Zurück“, the map's „Hinreisen“, all of Hanne's topic buttons.
  - The modal's 82 px left gutter wastes the width that is missing on the right.
- **Screenshots:** `small-landscape/14-settings-graphics.png`, `small-landscape/25-npc-talk-topics.png`, `small-landscape/15-map-bottom.png`.
- **Suggested fix:** for `.kq-modal-layer`, `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` (or the `--kq-safe-*` variables). Under `max-height: 500px`, shrink the 82 px gutter to about 36 px.
- **Likely files:** `src/ui/styles.css` (`.kq-modal-layer`, `.kq-modal`), `src/ui/touch.css`.

**M-09 · S2 · small-landscape · npc-talk** → *fixed* (see §8.1)
- **What's wrong:** Hanne's conversation card is taller than the 375 px screen. Its top edge is above the viewport (`modal-cut`), and the 5th choice „Auf Wiedersehen“ is below the bottom edge. The card does not scroll, so the goodbye choice cannot be tapped; only the `×` closes it.
- **Screenshot:** `small-landscape/25-npc-talk-topics.png`.
- **Suggested fix:** on short screens:
  - put the topics in a two-column grid, as the tablet already does;
  - shrink the portrait to 48 px;
  - `max-height: calc(100vh - 16px - insets); overflow: auto` on the card.
- **Likely files:** `src/systems/npc/npc.css`, `src/systems/npc/ui.ts`.

**M-10 · S2 · small-landscape, large-landscape · journal (every tab)** → *fixed* (see §8.1)
- **What's wrong:** on a phone in landscape the eight Feldbuch tabs wrap to two rows. With the title row, they take more than half of the about 340 px tall modal, so every tab shows only 2–3 lines of content:
  - the Codex shows only its filter buttons;
  - Ausrüstung shows only the staff;
  - Talente shows one talent.
- **Screenshots:** `small-landscape/16-journal-codex.png`, `small-landscape/16-journal-gear.png`, `small-landscape/16-journal-talents.png`, `small-landscape/16-journal-karte.png`.
- **Suggested fix:** under `max-height: 500px`:
  - one horizontally scrolling tab row, or a left rail of icon tabs;
  - hide the subtitle „Aufgaben, Codex, Sammlungen“;
  - title and tabs together under 70 px;
  - the modal at the full 94vh.
- **Likely files:** `src/systems/quests/quests.css` (`.kqj-tabs`), `src/systems/quests/journal.ts`.

**M-11 · S2 · small-landscape, small-portrait, large-portrait · lantern first frame, hud-idle** → *partly fixed (placement; timing stays with story/quests)* (see §8.1)
- **What's wrong:** the first gameplay frame on a phone stacks four layers in the middle of the screen at once:
  - the chapter card „Prolog · heute, ein Novembernachmittag / Vermessung“;
  - the „Neue Aufgabe · Der Messstab“ banner;
  - the radio dialogue card;
  - the top-left tracker.
  The texts overlap and none of them is readable.
- **Screenshots:** `small-landscape/08-hud-idle.png`, `small-portrait/06-lantern-first-frame.png`, `small-portrait/07-rotate-overlay.png`.
- **Suggested fix:** on phones, queue the quest banner until the chapter card has faded (`CardDirector`), hold the first radio line until both are gone, and keep the banner clear of the dialogue area.
- **Likely files:** `src/ui/cards.ts`, `src/systems/quests/` (banner), `src/systems/story/story.css` (chapter card position on phones).

**M-12 · S2 · small-landscape, large-landscape · combat (skills)** → *fixed* (see §8.1)
- **What's wrong:**
  - The three skill buttons (Ausfall, Erdstoß, Wirbel) are 38×38 px on phones, below 44.
  - In combat the narrow dialogue card (M-01) also sits over Ausweichen, Balsam, Epoche and Aktion: `small-landscape/17-combat-lock-on.png` has Marlene's card on the arc.
- **Screenshots:** `small-landscape/17-combat-skills.png`, `small-landscape/17-combat-lock-on.png`.
- **Suggested fix:** 44 px skill buttons (`.kq-t-skills .kq-t-btn` in the phone media query); with M-01 fixed, the in-combat dialogue rule (`body.kq-in-combat .kqs-dlg`) must keep clear of the arc.
- **Likely files:** `src/ui/touch.css`, `src/systems/story/story.css`.

**M-13 · S2 · all units (was "pending tour/photo"; now live on main) · photo** → *fixed* (see §8.1)
- **What's wrong:**
  - With the phone up, the touch top-row buttons lie over the phone frame's status bar: the clock „14:31“, the signal bars and the battery are under Pause, Karte and the phone button.
  - On phones the Bussole medallion also overlaps the shutter (the attack button).
- **Screenshots:** `small-landscape/22-photo-open.png`, `tablet-landscape/22-photo-open.png`, `tablet-portrait/22-photo-open.png`.
- **Suggested fix:**
  - In photo mode hide the top row except the phone (close) button, or push the frame's status bar below the row (`top: calc(60px + var(--kq-safe-t))`).
  - Hide the Bussole while the phone is up.
- **Likely files:** `src/systems/photo/` (photo CSS), `src/ui/touch.css` (the photo-mode block near „the attack button is the shutter“).

### S3: polish

**M-14 · S3 · all units (live) · photo** → *fixed* (see §8.1)
- **What's wrong:** while aiming the phone, the combat buttons stay up: Ausweichen, Bannlicht, Ziel, Balsam, Epoche, Aktion and the skill buttons. They clutter the viewfinder.
- **Screenshots:** `small-landscape/22-photo-open.png`, `tablet-landscape/22-photo-open.png`.
- **Suggested fix:** in photo mode show only the stick, look, the shutter, zoom 1×/2× and close; hide `.kq-t-arc` (except the shutter) and `.kq-t-skills`.
- **Likely files:** `src/ui/touch.css` (photo block), `src/ui/touch.ts` (`setPhoto`).

**M-15 · S3 · known from the photo screenshots (desktop) · photo** → *fixed (CSS, desktop)* (see §8.1)
- **What's wrong:** the desktop pointer-lock chip „Ins Bild klicken …“ (`hud.clickToPlay`) is visible in photo mode.
- **Tour result:** not reproduced on touch, since the chip is hidden in touch mode. It stays a desktop issue.
- **Suggested fix:** hide `[data-testid=click-to-look]` while `photo:open`.
- **Likely files:** `src/ui/hud.ts`, `src/boot.ts` (the click-to-play chip).

**M-16 · S3 · phones · combat, dialogue, top row** → *fixed* (see §8.1)
- **What's wrong:** the top-row buttons are 42×42 px and the arc buttons 43×43 px; the Balsam button is 41×41 px. All just under 44.
- **Screenshot:** `small-landscape/08-hud-idle.png`.
- **Suggested fix:** 44 px minimum in the `max-height: 500px` rule (`.kq-t-top .kq-t-btn`, `--kq-t-btn`), or scale the arc 0.9 instead of 0.86.
- **Likely file:** `src/ui/touch.css`.

**M-17 · S3 · all units · era-shift** → *measured, not changed (handed over)* (see §8.1)
- **What's wrong:** the era-shift transition drops frames: p95 33 ms, max 150–167 ms, 2–3 frames over 50 ms. On the 1789 arrival, p95 is 50 ms on small-landscape. This is on an M5 Pro, so a phone will be worse.
- **Screenshots and data:** `*/19-era-shift-mid.png`, `findings.json` → `frames`.
- **Suggested fix:** on coarse-pointer or low quality, lighten the shift effect (fewer passes or particles) and pre-warm the 1789 materials before the shift starts.
- **Likely file:** `src/systems/fx/` (shift).

**M-18 · S3 · all units · travel-card, level-card, photo** → *fixed* (see §8.2)
- **What's wrong:** centre cards stack on each other:
  - the „Vermessungspunkt eingemessen“ banner lies on top of the Kartograf skill card;
  - in photo mode the „Stufe IX“ level card sits in the middle of the viewfinder.
  Partly the tour's quick staging, but real play can do it too.
- **Screenshots:** `tablet-landscape/20-travel-card.png`, `tablet-landscape/22-photo-open.png`.
- **Suggested fix:** route the travel banner through `CardDirector`; hold level and skill cards while the phone is up.
- **Likely files:** `src/systems/travel/index.ts` (`showCard`), `src/ui/cards.ts`.

**M-19 · S3 · small-landscape · npc-talk, dialogue** → *handed over to kq-story* (see §8.1)
- **What's wrong:**
  - The „erfunden“ tag on the NPC card and the fiction tag in dialogue have low contrast (about 3:1).
  - The „Enter weiter“ hint in the dialogue card is desktop wording on touch.
- **Screenshots:** `small-landscape/25-npc-talk-line.png`, `tablet-landscape/12-dialogue-xl.png`.
- **Suggested fix:** darker tag ink; on touch, „Tippen: weiter“ instead of „Enter weiter“.
- **Likely files:** `src/systems/npc/npc.css`, `src/systems/story/dialogue/presenter.ts`.

### Verdicts

- **Portrait phones:** what a portrait user sees today is a dimmed title with white text and no icon, and nothing can be tapped. That is not acceptable as it stands; see M-02.
  - With the overlay limited to gameplay and made friendly, landscape-only gameplay is fine.
  - The title, „Neuigkeiten“, the content warning, the name page and the lantern screen read well in portrait already (`small-portrait/01-title-no-overlay.png`, `02-news.png`, `04-warning.png`, `05-name-typed.png`, `06-lantern.png`).
  - The settings need M-03.
- **Tablet portrait (820×1180): the layout holds, so keep portrait allowed on tablets.**
  - The HUD, the dialogue (bottom centre between stick and arc), the journal tabs (two rows, plenty of room), combat, the map, the NPC card and photo mode all read well.
  - Only the general issues apply there: M-06, M-07, M-11 to a lesser degree, M-13, M-14.
  - Evidence: `tablet-portrait/08-hud-idle.png`, `12-dialogue.png`, `16-journal-gear.png`, `17-combat-approach.png`, `22-photo-open.png`.

### 8.1 Fix pass (2026-11-21)

**Branch** `mobile/ui-pass` with main merged (cdc8f40). Commits `b2edcef` (touch / phone layout), `bcea427` (the pol-flow HUD overlap) and a follow-up for photo mode and the banner (see `git log`).

**Where the fixes live.** Everything is in our files: `src/ui/touch.css`, `src/ui/touch.ts`, `src/player/touchMap.ts`, one rule in `src/ui/styles.css`. The story, NPC and quest UI is only overridden from `touch.css`, under `html[data-kq-touch]` and `@media (max-height: 500px)` / `(max-width: 600px)`. Their own files are untouched. Desktop selectors are unchanged; the only desktop-visible change is M-15 (no click-to-look chip while the phone is up).

**Screenshots.** The "before" set is in `test-results/mobile-tour/_before/<unit>/`, the "after" set in `test-results/mobile-tour/_after/<unit>/`, both with the same file names. The re-runs covered:
- small-landscape: `title, news, title-settings, lantern, hud-idle, touch-buttons, dialogue, pause, settings, journal, combat, photo, k1-card, k1-court, npc-talk`;
- small-portrait: the full unit;
- large-landscape: `title, news, hud-idle, touch-buttons, dialogue, pause, settings, journal, combat, photo, k1-card, k1-court, npc-talk`;
- tablet-portrait: `rotate, hud-idle, touch-buttons, dialogue, settings, photo`.

**A second cause behind the swallowed taps (M-01).** The dialogue card was one cause. The other one was ours, in `touch.ts`. A top-row button opens its page on `pointerup`, and the browser then sends a `click` to whatever is under the finger by then. That was often the new page's `×` or a menu entry, so the page closed again at once. The runner's probe showed it: `pointerdown@touch-pause, pointerup@touch-pause, click@close`. Touch buttons now swallow that one click. Since then, real taps on Pause, Feldbuch and the phone work in every state, with or without a line up.

| finding | status | what changed | before → after |
|---|---|---|---|
| M-01 | fixed | On a landscape phone the dialogue card is a wide, low card in the top band. It runs from the left inset to the top-row buttons (it moves over when Fliegen / Sinken are in the row), and it is capped at 36vh, with a 44 px portrait, a smaller font and its own scroll. It uses the same place in fights. Only the card's box takes taps. The runner now taps Feldbuch and Handy while a line shows: both open by a real tap. | `small-landscape/08-hud-idle.png`, `12-dialogue.png`, `17-combat-lock-on.png` → same names, plus `12-dialogue-tap-journal.png`, `12-dialogue-tap-photo.png` |
| M-02 | fixed | `touchMap.rotateWanted()` (unit-tested): touch, portrait, short side < 600 and gameplay, which means no title or new-game flow is up. `touch.ts` watches the title element and sets `html[data-kq-rotate]`. The new overlay has the game title, an original turning-phone SVG (it holds still under reduced motion), „Bitte das Gerät quer halten.“ and „Karlsberg Quest spielt sich im Querformat.“ on dark wood. Tablets never see it. | `small-portrait/01-title.png`, `07-rotate-overlay.png` → same names (the title is tappable; the runner no longer has to hide the overlay) |
| M-03 | fixed | Below 600 px width or 500 px height, a setting's label sits above its control (a checkbox stays beside its label) and the section chips scroll in one row. | `small-portrait/03-title-settings-*.png` → same names |
| M-04 | fixed | On short screens the title card is compact: smaller title, the buttons in one row, no desktop key hints on touch, and the title can scroll as a fallback. „Neuigkeiten“ and „Lizenzen & Quellen“ are on screen. The news tap failed because the link sat below the fold of a non-scrolling title (ours); it now opens. | `small-landscape/01-title.png`, `02-news-error.png` → `01-title.png`, `02-news.png` |
| M-05 | partly | The Aktion button keeps „Aktion“ for a movement prompt (`touchPromptIcon`, unit-tested). The prompt's desktop wording is in progress at kq-story. | `small-landscape/06-lantern-first-frame.png` → same name |
| M-06 | fixed | The Aktion pill moved up (bottom 184 instead of 150), 12 px clear of the Epoche button. | `large-landscape/08-hud-idle.png`, `small-landscape/11-touch-buttons-cue-shift.png` → same names |
| M-07 | fixed | On touch: checkboxes 28 px in 44 px rows, radio labels 44 px tall, sliders with a 44 px hit area and a 28 px thumb, chips, `.kq-btn`, links and the modal `×` at 44 px or more. | `small-landscape/14-settings-*.png`, `13-pause.png` → same names |
| M-08 | fixed | On touch, `.kq-modal-layer` is padded by the safe-area insets plus 6 px, and the modal fits inside it. The phone gutter is now 36 px instead of 52. | `small-landscape/14-settings-graphics.png`, `15-map-bottom.png` → same names |
| M-09 | fixed | On short screens Hanne's page has a 44 px portrait, two topic columns with 44 px rows, scrolls inside and keeps a sticky `×`. All five choices, including „Auf Wiedersehen“, show on a 375 px screen. | `small-landscape/25-npc-talk-topics.png` → same name |
| M-10 | fixed | On landscape phones the title and the tabs share one row, the tabs scroll sideways (44 px tall, no numbers), there is no subtitle, and the page is as tall as the screen allows. | `small-landscape/16-journal-*.png` → same names |
| M-11 | partly | On phones the chapter card and the quest banner sit mid-screen, left of the arc and under the dialogue band, at a smaller size. The banner sits at a fixed 196 px in the 0.78-zoomed HUD (about 153 px on screen), under the dialogue band. The chapter card's fade-out is 0.35 s, so the banner (which already waits for `.kqs-card.kqs-show`) no longer overlaps it. The tracker steps back while a line is up. Holding the first radio line until both are gone is story logic: see the handover list. | `small-landscape/06-lantern-first-frame.png`, `08-hud-idle.png` → same names |
| M-12 | fixed | Skill buttons are 44 px on phones; the dialogue card no longer touches the arc in fights (M-01). | `small-landscape/17-combat-skills.png` → same name |
| M-13 | fixed | While the phone is up on touch, only the phone (close) button stays visible in the top row, in its place (the others are hidden but keep their room), which is clear of the frame's clock and battery. The Bussole is hidden. In normal play on touch the Bussole moved bottom-left, right of the lamp-oil gauge: it used to sit under the attack button. | `small-landscape/22-photo-open.png` → same name |
| M-14 | fixed | In photo mode the arc shows only the shutter; skills, the Relief pop-up and the HUD prompt (it sat under 1× / 2×) are hidden. | `small-landscape/22-photo-open.png` → same name |
| M-15 | fixed | `html[data-kq-photo] .kq-click-to-play { display: none }` (desktop). | desktop only; not shot |
| M-16 | fixed | On phones the arc is scaled 0.9 instead of 0.86 with 52 px base buttons, Balsam and Ziel are 50 px, and the top-row buttons are 44 px with 6 px gaps. Every arc target is ≥ 45 px after the scale. | `small-landscape/08-hud-idle.png` → same name |
| M-17 | measured | Era shift, mid-effect: p95 33 ms on every unit; max 150 ms (small and large landscape), 167 ms (tablet landscape), 183 ms (tablet portrait); 2–3 frames over 50 ms. The 1789 arrival on small-landscape: p95 50 ms, max 83 ms. The one long stall at the start of the shift looks like material or shader warm-up for 1789. Not changed: this is `src/systems/fx/` (shift), handed over. | `*/19-era-shift-mid.png`, `_before/*/findings.json` → `frames` |
| M-18 | fixed in §8.2 | Not done in this pass. | — |
| M-19 | handed over | Tag contrast and „Enter weiter“: kq-story (see below). | — |

**E2E, one spec per lock hold:** `touch` 4/4, `photo` 4/4 (after the photo follow-up: the first run failed because the phone button moved away from under the thumb, so it now stays in place), `smoke` 3/3, `court` 4/4, `pol-flow` 4/4.

**Extra (not in the tour): pol-flow at 1280×720.** `e2e/pol-flow.spec.ts:133` failed on main with `skill-card-0 × hud-boss`. The cause was the Unauffällig meter from `62f7607`: while off, it sat in the top-centre boss dock at opacity 0 and kept the dock about 75 px tall under the compass. Off now means `display: none` (it fades in when it turns on). While the meter really shows, the skill cards sit below the dock (`skills.css`). Result: pol-flow passes, 4/4.

**Handover to kq-story** (their files; we only override layout):
- **Prompt wording (M-05)**, `content/story/00-prolog.story.json` p1 prompt „Gehen · ins Bild klicken, dann Maus: Schauen · Shift: Rennen“: a touch variant. **In progress at kq-story** (hint lines via `actionLabel`).
- **„Enter weiter“ (M-19)**, `src/systems/story/dialogue/presenter.ts`, `.kqs-skip`: touch wording „Tippen: weiter“ and tap-to-advance. **In progress at kq-story.**
- **The NPC card's „E weiter“**, `src/systems/npc/ui.ts` line ~90 (`h('div.kqn-next', [h('kbd', 'E'), …])`): the same touch wording.
- **Tag contrast (M-19)**: `src/systems/npc/npc.css` `.kqn-tag.fic` (`color: #8a5a2b`, about 3:1 on paper) and `src/systems/story/story.css` `.kqs-tag` (`color: var(--ink-soft)`). Suggestion: a darker ink such as `#6b4219` to reach 4.5:1.
- **M-11 timing**: hold the first radio line of a chapter until the chapter card has faded (the quest banner already waits). Placement on phones is ours and done.
- **Base dialogue width**: `.kqs-dlg { width: min(820px, 92vw, calc(100vw - 380px)) }` is what made the 287 px column. Our phone rule replaces it on touch; between 501 and 760 px of height (small tablets, not in the matrix) the base rule still applies.

### 8.2 Follow-up pass (2026-11-21)

**Branch** `mobile/ui-pass-2`, from 92f4146, with main merged after `mobile/ui-pass` landed (ef5c8c3). Our files only: `src/ui/touch.css`, `src/ui/touch.ts`, `src/ui/touchIcons.ts`, `src/ui/hud.ts` (one CSS variable), `src/player/touchMap.ts`, `src/systems/travel/`, `src/systems/photo/index.ts` (one card hold), `e2e/mobile/tour.pw.ts`. `CardDirector` (`src/ui/cards.ts`) is only used, not changed. Desktop: the layout does not change; the two non-CSS changes that reach desktop (the travel banner waits while another centre card is up; level, skill and reward cards wait while the phone is up) are covered by smoke, photo, travel-paths and world.

**Screenshots.** Before: `test-results/mobile-tour/_before/<unit>/` (not overwritten). After: `test-results/mobile-tour/_after/<unit>/`, same file names. This pass shot:
- small-landscape: `lantern, hud-idle, touch-buttons, dialogue, combat, travel-card, photo, k1-card`;
- large-landscape: `hud-idle, touch-buttons, dialogue, combat, travel-card, photo`;
- tablet-landscape and large-portrait: the full unit (the missing after shots of §8.1).
- New shot: `20-travel-card-shown.png`, the banner once nothing holds it back. It has no "before" (the old banner never waited); compare it with `_before/<unit>/20-travel-card.png`.

| item | status | what changed | before → after |
|---|---|---|---|
| Dialogue card vs the HUD (landscape phones) | fixed | The card ends above the bottom-left zone: the HUD publishes that zone's top as `--kq-bl-top`, and the card body is capped at `clamp(84px, --kq-bl-top − 14px, 36vh)`; a longer line scrolls inside. The radio portrait and its torn tab are gone on landscape phones (the name says who speaks, and the text gets about 50 px more width), and the era column fades while a line is up. „Lebenskraft“ and the health bar stay clear. | `small-landscape/12-dialogue.png`, `06-lantern-first-frame.png`, `17-combat-lock-on.png`; `large-landscape/12-dialogue.png` |
| Double action prompt | fixed | While the Aktion pill carries the interact prompt (`.lit`), the HUD prompt pill steps aside, on every touch layout. A long prompt wraps to two lines in the pill instead of being cut („Mauerrest untersuchen“). | `small-landscape/12-dialogue.png`, `11-touch-buttons-cue-interact.png` |
| Clipped „weiter“ hint | fixed | The card's footer (hint and source) is a sticky footer at the card's lower edge; the text scrolls under it. | `small-landscape/12-dialogue.png` |
| M-18 banner stacking | fixed | The activation banner takes `CardDirector`'s slot when it is free and waits (or steps aside, its clock stopped) while another centre card holds it; a later level or skill card waits for it. On a landscape phone it takes the dialogue card's top band, smaller and capped above the vitals, and waits while a line is up. The photo system holds the slide-in cards while the phone is up (`cards.hold('photo')`), so no level card lands in the viewfinder. | `tablet-landscape/20-travel-card.png` (the banner waits behind the Kartograf card), `22-photo-open.png`; `small-landscape/20-travel-card.png` (waits for Marlene's line) → `20-travel-card-shown.png` |
| Missing after shots | done | tablet-landscape (79 shots, all states pass) and large-portrait (20 shots, all pass), both full units. | `_after/tablet-landscape/`, `_after/large-portrait/` |
| `findings.json` notes | fixed | Notes are tagged by state (`[dialogue] …`). A full unit run starts with none; a subset run replaces the notes of the states it re-shoots and drops untagged ones from older runs. | `_after/*/findings.json` → `notes` |
| Crouch on touch (from kq-story) | done | The sink button moved from the top row into the thumb arc as a crouch button: on foot a tap toggles crouching (`crouch`, the C path; active state and `aria-pressed` while crouched), in the spirit view it is held to sink (`down`). Right edge of the arc, 8 px clear of Ziel and the Aktion pill, under the skill row; 52 px (47 px on phones after the 0.9 scale). Its class was `.down`, which is also the pressed state; it is `.crouch` now. `crouchButtonMode()` is unit-tested. | `small-landscape/11-touch-buttons-*.png`, `large-landscape/08-hud-idle.png` |
| Key-cap icons (from kq-story) | done | `touchIconFor`: `N` → the phone, `C` / `X` / „Sinken“ / „Ducken“ → the crouch button, `Maus` → a neutral swipe icon (`look`) instead of the Aktion hand. `touchName('crouch')` is „Ducken“. Unit-tested. | — |

**Crouch after a load.** A load sets the stance without a `player:stance` event, so `touch.ts` reads the stance back (`TouchDeps.stance`) on `game:start` and `save:loaded`.

**The world spec and the banner.** `world.spec` „survey points“ expects `travel-card-activated` right after an activation. The banner only waits while another centre card is on screen (or, on a landscape phone, while a line is up); a spoken line or a fight on desktop does not hold it. With nothing else up it shows at once, so the test needed no change.

**E2E, one spec per lock hold (port 5340):** `touch` 4/4, `photo` 4/4, `smoke` 3/3, `travel-paths` 1/1, `world -g "survey points"` 1/1. Gates: `pnpm typecheck`, `pnpm test` (91 files, 1268 tests), `pnpm validate`, `pnpm build`, all green. `npc` was not run: its overrides were not touched.

**Still open:**
- The first prompt („Gehen · ins Bild klicken, dann Maus: Schauen · Shift: Rennen“) is long enough that the HUD pill runs under Balsam and Ausweichen on a small phone (`small-landscape/06-lantern-first-frame.png`). The touch wording at kq-story fixes it; if it stays long, cap the pill's width on phones.
- The combat callout („Nebelling duckt sich – Ausfall!“) touches the unlit Aktion pill on small-landscape (`17-combat-lock-on.png`).
- The level card („Stufe VIII“) covers most of a landscape phone (seen in an intermediate run, after the banner released the slot); it is progression's card.

### 8.3 S1 pass, small phone landscape (2026-11-26)

**Branch** `fix/mobile-s1`, from main fd18dcd. Unit `small-landscape` (667×375, insets 0/47/21/47), full unit before and after (82 shots each, 0 failed states). Shots and `findings.json`: `test-results/mobile-tour/_before/small-landscape/` and `_after/small-landscape/`, same file names.

**Result.** S1 386 → 0. S2 249 → 186 (no new S2 from this pass; the five S2 left on `13-pause*` were already in the before set, with another line up). Changed: `src/ui/touch.css` (phone rules only) and the measurer `e2e/mobile/measure.ts`.

| screen (shot) | S1 before → after | real or false | why |
|---|---|---|---|
| `01-title` | 3 → 0 | real | The link row („Neuigkeiten“, „Lizenzen & Quellen“, both 44 px tall on touch) touched the button row with no gap, and the card's −1.2° tilt made the boxes overlap by 2–5 px. |
| `06-tour-map-first-frame`, `08-hud-idle`, `09-toasts`, `11-touch-buttons-attack-held / cue-interact / cue-shift`, `12-dialogue`, `12-dialogue-xl`, `17-combat-approach / lock-on / bannlicht / hit` | 11 each → 0 | false | Every finding was „button ∩ canvas“: the game's full-screen WebGL canvas has `tabIndex 0` (`src/boot.ts`, keyboard focus), so the measurer took it for a tap target that every touch button overlaps. It is the play surface. |
| `10-touch-stick-walk / sprint / walk-look` | 12 each → 0 | false | The same, plus the stick ∩ canvas. |
| `12-dialogue-tap-photo`, `22-photo-open`, `22-photo-shutter` | 4 each → 0 | false | The canvas again (shutter, phone button, 1× / 2× lens buttons). |
| `11-touch-buttons-relief-pop` | 2 → 0 | false | „Zurück“ ∩ Epoche button and „Aus“ ∩ Aktion pill: the open survey menu (opaque, on top) covers those arc buttons, as a modal covers the HUD. A tap lands on the menu. The menu also moved (below). |
| `15-map`, `15-map-bottom`, `16-journal-karte`, `16-journal-karte-bottom` | 1 each → 0 | false | The map canvas ∩ „Zurück“: the canvas runs on below its scroll box, and that part is cut off (not visible, not hittable). |
| `16-journal-talents`, `16-journal-gear-bottom` | 1 each → 0 | false | „Lernen“ ∩ „Zurück“ and `×` ∩ „Benutzen“: rows scrolled under the page's bottom or top edge, the same clipping case. |
| `17-combat-skills`, `17-combat-skill-used`, `18-level-card`, `19-era-shift-mid / 1789`, `20-travel-card`, `20-travel-card-shown`, `21-death-curtain / wake`, `22-photo-hud`, `23-k1-card`, `23-k1-card-hud`, `24-k1-court` | 15 each → 0 | 14 false (canvas, as above), 1 real | Wirbel (skill 3) sat on the survey button („Erkunden“), 36×40 px. Ausfall (skill 1) was also hidden under the dialogue band whenever a line was up; the measurer skips covered targets, so that one was not even counted. |

**What changed (real problems).**
- Title: on short screens the link row has `margin-top: 8px` (it was 0).
- Skills and survey on a landscape phone (`@media (max-height: 500px)`): the survey button moved into the top row, left of the phone (Erkunden · Handy · Pause), and the skill row takes the second row, right-aligned under it (Ausfall · Erdstoß · Wirbel, 6 px gaps like the top row), 15 px above the Aktion pill. The dialogue band ends at `right: 170px + inset` (was 112), clear of both rows; on this phone it is about 395 px wide instead of 453. The survey menu now opens below the top row, over the skill row (hidden while the menu is open) and the top of the arc, so with the menu open the dialogue band only gives up 270 px instead of 300. Tablets keep the old layout.
- Tried first and dropped: a 2 × 2 skill block left of the arc. It cleared the S1 but sat on the sound subtitles (S2) and on the centre cards, and the Aktion pill grows into that space with a long prompt.

**Measurer changes (`e2e/mobile/measure.ts`).** Each one is limited to a case the shots show is not a problem:
1. *Play surface.* A `canvas` that covers ≥ 98 % of the viewport is not a tap target. Only the 3D view matches; the travel map canvas inside a page is still measured.
2. *Visible part only.* Overlaps use an element's box cut by every ancestor that clips (overflow other than `visible`). What is scrolled out of a page cannot be seen or tapped. Tap sizes still use the full box.
3. *Open pop-up.* As with modals, a button that an open `.kq-t-pop` hides (something else at its centre) is not counted against the pop-up's chips. Buttons the pop-up only grazes are still counted.

**E2E, one spec per lock hold, port 5340:** `touch` 7/7 (including the survey menu on a landscape phone), `smoke` 7/7, plus the full `small-landscape` tour unit (82 shots, 0 failed states). Gates: `pnpm typecheck`, `pnpm test` (114 files, 1537 tests), `pnpm validate`, `pnpm build`, all green.

**Still open (not S1):**
- The level card („Stufe VIII“) still covers most of a landscape phone and runs off the bottom edge (`17-combat-skills.png`, `18-level-card.png`). Not touched here.
- `13-pause*`: the measurer pairs the dialogue card with the pause menu (S2) while a line is up behind the modal. These were already in the before set; not investigated.
- In the full-unit runs, the `20-travel-card-shown` sub-shot went missing twice („the banner did not show within 20 s“). A `combat,level-card,era-shift,travel-card` subset run and the final full run both shot it. The cause is the order and timing of the story lines; layout is not involved.

### 8.4 Level card and the travel shot (2026-11-26)

**Branch** `fix/mobile-level-card`, from main 8dac136 (after §8.3). Unit `small-landscape` (667×375, insets 0/47/21/47). Before: the §8.3 after set (`_before/small-landscape/17-combat-skills.png`, `18-level-card.png`); after: `test-results/mobile-tour/small-landscape/`, same names, plus `18-level-card-dismissed.png`.

**The level card on a landscape phone.** At its desktop size (440 px wide, from 170–206 px down, about 140 px tall and more with „Ein zweiter Platz für ein Amulett“ and a merged skill unlock) the „Stufe VIII“ card covered the middle of the screen, sat on the Epoche button and ran off the bottom edge. Under `html[data-kq-touch]` and `@media (max-height: 500px)` (`src/ui/touch.css`) it is now a compact slip:
- *Place.* Under the dialogue card's top band (top = the band's own cap + 12 px, about 96 px on this phone) from `8px + inset` on the left to `220px + inset` from the right edge: left of the Epoche button, the Aktion pill, the skill row and the top row. It stays there with no line up as well, so it does not jump when a line starts. With the survey menu open it ends at `270px + inset`.
- *Size.* At most 400 px wide (about 345 px on this phone), medal 50 px instead of 88, title 21 px instead of 32, gains 12.5 px, stamp 11 px. The worst case (VIII with the amulet line and Wirbel merged in) is 343 × 156 px, from 96 to 252 px down (it was 440 px wide and ran past 375). A long skill description keeps to two lines. The „I Talente“ key hint is hidden (no keyboard).
- *Dismiss.* The card takes no taps (the stick and the drag-look underneath keep working). On touch, progression claims the card slot with a dismiss callback, so a tap on the play surface (`TouchControls` → `dismissNoticeAt` → `CardDirector.dismissNotice`, the same path as a toast) jumps the card's clock into its 0.6 s fade-out (`LevelCards.dismiss`, `dismissedClock`, unit-tested in `tests/cards.test.ts`). On a desktop no dismiss is passed, so Escape still opens the pause menu. A held card (stepped aside for a line, a fight or a modal) cannot be dismissed: it is not on screen.
- Desktop and tablets: unchanged (phone media query only; the dismiss is touch-only and also works on tablets).

**Runner (`e2e/mobile/tour.pw.ts`, `level-card`).** The card steps aside while a line is spoken (the soft hold, at most 8 s), so the old fixed 500 ms wait often shot an empty screen. The state now waits until the card is up (tapping lines away), re-takes the shot (same file, `shot(…, again)`) when a line started during the 2 s shot, then checks the dismiss on a fresh card about 1 s after it came up: one tap mid-screen, gone within 0.9 s → `18-level-card-dismissed.png`.

**`20-travel-card-shown`: the cause.** Test timing, not a game fault; the game showed the banner in every run of this pass. The failed runs left no artefacts, so the exact case cannot be replayed, but the state had two races, both in the test:
1. *The banner ran out inside the first shot.* On a landscape phone the activation banner waits while a line is up. The state activated a point, waited 400 ms, saw the banner aside and took the first shot, which takes about 4 s (600 ms settle, 1.5 s frame sample, measuring, the screenshot). A banner released early in that window shows for its 4.5 s (game time) while the test is busy and can be gone before the loop's first look. The watcher below measured how close it runs: the banner came up 3.9 s after the activation with the shot ending at 4.0 s (subset run), and 4.46 s against 4.55 s (final full run). A slower shot, or a release a little earlier, misses it.
2. *A long talk outlasted the 20 s.* The banner waits for every line on a phone (§8.2), and the loop tapped one line every 700 ms or more (a tap during typing only finishes the line). A guide's talk of a dozen lines is longer than 20 s that way. The banner comes after the talk, as designed.

**Fix (test only, `e2e/mobile/tour.pw.ts`).** A frame watcher records when the banner first comes up and when it goes. If it came and went during the first shot, the state notes that with the times and activates the next point for the `shown` shot. The loop polls every 300 ms (was 700) and waits up to 40 s (was 20). If the banner still does not show, the note says why: the banner state, who holds the card slot, the hold reasons and the line on screen, so a real game fault would show up as such. The state no longer falls back to an already activated point (that one shows no banner).

**Result.** Full `small-landscape` unit: 83 shots (82 + `18-level-card-dismissed`), 0 failed states, S1 0, S2 187 (186 before; the one new S2 is the existing „Halten: zur Gruppe“ prompt ∩ Balsam pair, repeated in the new shot; no S2 involves the level card). The `20-travel-card-shown` shot was taken in every run of this pass. `13-pause*`: not touched (the S2 pairs are a line behind the pause modal, as in §8.3).

**E2E, one spec per lock hold, port 5340:** `progression` 3/3, `touch` 7/7, `smoke` 7/7, plus the full `small-landscape` tour unit and a `level-card,era-shift,travel-card` subset after the last runner change. Gates: `pnpm typecheck`, `pnpm test` (117 files, 1559 tests), `pnpm validate`, `pnpm build`, all green.

**Still open:** the skill unlock card (`.kqk-card`) on its own (without a level card to ride on) was not looked at on phones.
### 8.4 Minimap (TASK-015)

On short landscape touch screens the 72 px map sits below the compass, left of the top and skill
rows and above the thumb arc. While the map is visible, the dialogue band leaves room for its slot
and the notice dock sits lower. Opening the survey pop-up or lighting the action pill at heights
up to 365 px hides the map, suspends its redraws and releases that space. The notice dock clears
the lit pill using its maximum reach and the HUD zoom. Above 500 px, notices sit below the 104 px
map and to the left of the unlocked skills. `e2e/minimap.spec.ts` checks the live layout at
568 × 320, 667 × 375 with the §8.3 safe-area insets, and 1024 × 550 with all three skills unlocked.

### 8.5 Phone credits and standalone skill unlocks (2026-11-26)

**Credits (MR 13).** Both credit modes hide the visible gameplay controls on phones and keep the
strip and Skip button within the safe width. The crawl clears the lower letterbox. A drag on the
play surface outside the strip and Skip button hands the camera back while the crawl continues.
The reduced-motion list sits above the home indicator and scrolls natively. Controls return when
the credits end. The portrait phone keeps the rotate overlay in front, and tablets retain the side
gutter for controls.

**Standalone skill unlock.** The landscape phone card starts 6 px below the maximum dialogue
body and ends at least 12 px above the home indicator. Its right edge reserves the full Aktion
pill, skill buttons and survey menu. A grouped card keeps the primary description and one
additional description, with the remaining skills listed by name and tier. A held movement stick
defers the notice or hides it and pauses its reading time if it is already up. A play-surface tap
uses the same card director path as the level card and starts the 0.6 s fade, skipping a stamp that
has yet to play. Each eligible Laub remark still queues once.

**MR 9 and Pause.** The tour opening already supplies the short touch hint „Wischen: Schauen“.
The HUD pill now wraps longer text between the vitals and Balsam/Ausweichen, with its position
adjusted for HUD zoom. Combat callouts wrap below the dialogue band and left of Aktion. The
level card already uses the compact layout from §8.4. No new overlay uses the top-right region
reserved for TASK-015. For the `13-pause*` S2 pairs, the pause paper is opaque and its modal
layer sits above the dialogue. The measurer tests the intersection itself against the paper,
including intersections with its buttons. A line may remain visible beside the paper under the
dim backdrop. On the 667×375 fixture the tour requires a visible dialogue body and an intersection
whose hit belongs to the Pause paper, then checks the reported pairs.

**Device review pending.** The worktree sandbox denied the local `tsx` socket and the Playwright
preview listener on port 5407. Run the following from the worktree on a machine that can bind
the preview port. Each spec or screenshot set takes its own lock.

```sh
pnpm build
KQ_E2E_PORT=5407 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/party.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5407 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
KQ_MOBILE_PORT=5407 scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape
for device in large-landscape tablet-landscape tablet-portrait; do
  KQ_MOBILE_PORT=5407 scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device "$device" --states touch-buttons,dialogue,pause,combat,level-card,skill-unlock,credits
done
for device in small-portrait large-portrait; do
  KQ_MOBILE_PORT=5407 scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device "$device" --states rotate,credits
done
```

- Start with 667×375. In `11-touch-buttons-long-hint.png` and `11-touch-buttons-callout.png`,
  check the prompt can be read between the vitals and the arc and that the caption clears Aktion.
- Inspect `26-skill-unlock.png` for the complete description and stamp, below the dialogue band
  and clear of the top row and the long Aktion pill. The tour checks the text fragments and settled
  stamp against the card's clipping rectangle, holds the stick for more than the card's full
  duration, then verifies that a tap starts the fade on a fresh card.
- In the `13-pause*` shots, look for dialogue showing through the dim backdrop beside the paper
  only. Pause buttons should take taps at the same point even if dialogue runs behind them.
- In `27-credits*`, check the crawl is cropped to the safe strip, Skip sits above it and the
  static list scrolls through to the end. Drag outside the crawl to take back the camera while the
  credits continue. Check the controls return after Skip, and that portrait phones show the rotate
  prompt. Read each unit's `findings.json` alongside the shots.
