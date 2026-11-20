# Mobile UI pass: plan and checklist

The owner's ask: *"test the game in the mobile browser and improve the UI situation"*.

- **Phase 1 (this document):** a playtester tours the game on emulated phones and a tablet, takes screenshots and measures the UI.
- **Phase 2:** a fixer works from the findings.

This page holds the plan, the checklist, the rubric and the run commands. The findings go in §8 once the runs are done.

## 1. Scope

A fresh player's way through the game:

1. The title screen.
2. A new game: the content warning, the name, the lantern screen.
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
| 06 | `lantern` | ✱ | lantern screen, `-first-frame` (the prologue card) | **tap** `name-confirm`, **tap** `light-lantern` |
| 07 | `rotate` | ✱ | portrait: `-overlay`, `-with-journal` (a modal under the overlay); landscape: N/A | — |
| 08 | `hud-idle` | | HUD at rest: compass, quest tracker, vitals, touch controls | `story.goto('prolog','p1')`, teleport to the station |
| 09 | `toasts` | | two toasts, an XP float, the tracker | `ui.toast`, `progression.xp` |
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
| 22 | `photo` | | photo mode | `kq.photo` if present; **N/A on this branch** (no `kq.photo` in `src/`) |
| 23 | `k1-card` | | „Der Hof“ chapter card at the spring, `-hud` (K1 opening HUD + tracker) | `story.goto('k1')` |
| 24 | `k1-court` | | 1789 court: NPC markers, lantern | `setEra('1789')`, teleport |
| 25 | `npc-talk` | | Hanne: `-line`, `-topics` (the choices), `-answer` | `npc.talk('hanne')`, **tap** a `npc-topic-*` |

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
| `e2e/mobile/playwright.config.ts` | its own config: real-GPU flags, preview server on port **5340** |
| `scripts/dev/mobile-tour.ts` | the CLI: `--device`, `--states`, `--build`, `--headed`, `--mask`, `--list` |

**Real GPU.** The suite (`playwright.config.ts`) uses SwiftShader on purpose. The repo's real-GPU precedent is `scripts/dev/storyboard.mjs`: headless Chromium with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, which logs `UNMASKED_RENDERER_WEBGL` and warns on a software renderer. The tour uses the same flags.

- At boot it logs the renderer and **aborts if it is SwiftShader / software**, unless `KQ_MOBILE_ALLOW_SOFT=1` is set.
- If headless ever falls back to software on this Mac, `--headed` runs a visible Chromium window. That needs the logged-in desktop session; the lock rules are the same.
- The renderer string is stored in `findings.json` (`gpu`).

**Re-shooting a subset.** `--states journal,combat` shoots only those states (ids or prefixes) and merges them into the unit's existing `findings.json`. A title-flow step brings its predecessors (`lantern` → `warning`, `name`). Gameplay states start a new game by taps when the title is still up.

## 7. Run commands (one unit per lock hold)

Run order (coordinator): small-landscape, large-landscape, small-portrait, large-portrait, tablet-portrait, tablet-landscape. Never two units at once.

Run from this worktree. `dist/` must exist: `pnpm build` once, outside the lock. If `dist/index.html` is missing, the runner builds it itself, and `--build` forces a fresh build.

```sh
cd <this worktree>
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device large-landscape
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-portrait
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device large-portrait
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device tablet-portrait
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device tablet-landscape
# re-shoot a subset:
KQ_HEAVY_OWNER=kq-mobile /Users/sebastian/develop/experiements/karlsberg-quest/scripts/dev/heavy.sh --max-hold 15 -- pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape --states journal,combat
```

**Estimated time per unit.** Boot is about 1–1.5 min: the preview server, terrain and assets on the real GPU, the title flow. Each shot takes about 3 s: 0.6 s settle, 1.5 s frame sample, measurement and a DPR 3 PNG.

| unit | shots | estimate |
|---|---|---|
| landscape phones | ≈ 75–80, plus about 15 s of staged waits | **≈ 6–8 min** |
| portrait phones | ≈ 20 | **≈ 2–3 min** |
| tablet, each orientation | ≈ 80 (DPR 2) | **≈ 7–9 min** |

Every unit stays under the 15-min hold; the test itself times out at 14 min. All six take about 35 min of lock time in all.

## 8. Findings

*(Filled in after the runs. Per unit: the GPU string and the safe-area method; then the issues as `S1/S2/S3 · unit · state · what · evidence`; then the verdicts on the portrait overlay and the tablet in portrait.)*
