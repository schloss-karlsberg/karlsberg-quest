# Karlsberg Quest – Performance, loading, accessibility

How fast the game is, how we measure it, what the graphics presets do, and which accessibility
settings exist. Numbers below were measured on 2026-11-02 (§5.1, render pacing: 2026-11-20);
re-measure after render changes and update the tables (how: §2).

## 1. Budgets

`src/render/perf.ts` → `PERF_BUDGET`. The bench (§2) checks every scene against the first two;
the e2e test fails when a scene is over.

| Budget | Value | Why |
|---|---|---|
| Draw calls per frame (all passes) | ≤ 300 | WebGL call overhead on mid laptops; we use 12–48 |
| Triangles per frame (all passes) | ≤ 1.5 M | integrated GPUs at 1080p; we use 0.55–0.7 M |
| CPU per rendered frame | ≤ 8 ms | systems.frame + world.frame + issuing GL calls, leaves room for GC and audio |
| Frame time | 16.7 ms (60 fps) on a mid laptop GPU | target; the auto-downgrade steps in above 25 ms (above 1.25 × the frame time of a lower cap) |
| Renders per second | the cap (60 default) while playing, ≤ 30 on the title, ≤ 15 or none in menus, none in bullet time (§5.1) | fans: a 120 Hz screen must not mean 120 renders a second, and nothing renders twice for a view that cannot change |
| Data before the first input | ≤ 20 MB | PRD D-007; we fetch 4.5 MB critical + 4.6 MB palace in parallel |

## 2. Measuring

- **Overlay**: F3 (or settings → Bild & Leistung → Leistungsanzeige, or `?perf`): frame-time graph,
  frame/CPU/GPU ms (avg, p95), draw calls, triangles, geometries/textures/programs, preset, terrain
  chunks, visible/culled trees, the five most expensive systems (update + frame ms).
- **Bench route**: Shift+F3 or `await kq.bench({frames, warmup})` in the console. Nine fixed views
  (`src/debug/bench.ts` → `BENCH_SCENES`): today-fly, today-forest, 1789-fly, 1789-ehrenhof,
  1789-night-pack (1793-02, pack running, lantern lit), 1793-07-festsaal-fire (inside the burning
  hall), 1793-07-fire-outside, 1796-ruin, scan3-fly. Per scene: frame/CPU ms percentiles, GPU ms
  (`EXT_disjoint_timer_query_webgl2`, when the browser exposes it), max calls and triangles,
  geometries/textures/programs, within budget. Result in `kq.lastBench` and as a console table.
- **Before/after**: `kq.baseline()` switches this round's render optimisations off (forest sector
  culling; modules can register more switches in `baselineHooks`), then run the bench again.
- **E2E**: `PERF_LABEL=after npx playwright test e2e/perf.spec.ts` writes
  `test-results/perf/bench-<label>.json` and `load-<label>.json`; `PERF_BASELINE=1` runs the
  baseline, `PERF_FRAMES=n` changes the frames per scene. Headless Chromium uses SwiftShader (CPU
  rasteriser): frame times there are 50–100× a real GPU and say little; calls, triangles, CPU
  time and bytes are exact.
- **Real GPU, headless**: Chromium with `--enable-gpu --ignore-gpu-blocklist --use-angle=metal`
  (add `--disable-gpu-vsync --disable-frame-rate-limit` for uncapped timing) and call `kq.bench()`.

## 3. Results

### 3.1 Real GPU (Apple M5 Pro, ANGLE Metal, 1920×1080, pixel ratio 1, Hoch, uncapped)

GPU ms from timer queries, 90 frames per scene after 15 warm-up frames. Apple GPUs clock up and
down (DVFS) under light load, so single GPU numbers vary ±30 % between runs; triangles and calls
are exact.

| Scene | Triangles before | after | GPU ms before | after | CPU ms after | Calls |
|---|---:|---:|---:|---:|---:|---:|
| today-fly | 887 k | **564 k** | 2.5 | 2.4 | 0.60 | 15 |
| today-forest | 877 k | **546 k** | 2.0 | 1.8 | 0.28 | 17 |
| 1789-fly | 791 k | **629 k** | 2.8 | 1.9 | 0.23 | 12 |
| 1789-ehrenhof | 699 k | 686 k | 3.6 | 2.1 | 0.22 | 36 |
| 1789-night-pack | 700 k | 687 k | 4.7 | 3.1 | 0.55 | 40 |
| 1793-07-festsaal-fire | 718 k | 701 k | 4.9 | 4.0 | 0.98 | 40 |
| 1793-07-fire-outside | 673 k | 668 k | 2.9 | 3.6 | 2.27 | 48 |
| 1796-ruin | 681 k | 672 k | 2.4 | 2.4 | 0.78 | 22 |
| scan3-fly | 948 k | **621 k** | 2.4 | 2.4 | 0.79 | 29 |

"Before" = `kq.baseline()` (forest culling off). It does not undo the CPU work below, so the CPU
column is "after" only. Every scene is far inside the budget on this machine (≤ 5 ms GPU at
1080p); the most expensive views are the fire and the night pack (particles, smoke, lantern).

Presets on the same machine (GPU ms / triangles):

| Scene | Niedrig | Mittel | Hoch |
|---|---|---|---|
| today-fly | 1.9 / 300 k | 1.7 / 455 k | 2.4 / 564 k |
| 1789-fly | 1.0 / 524 k | 2.4 / 606 k | 1.9 / 629 k |
| 1789-night-pack | 3.8 / 577 k | 2.4 / 654 k | 3.1 / 687 k |
| 1793-07-festsaal-fire | 3.1 / 567 k | 3.5 / 653 k | 4.0 / 701 k |
| scan3-fly | 1.3 / 326 k | 1.8 / 485 k | 2.4 / 621 k |

On a fast GPU the presets differ little in time (noise dominates); the triangle count and MSAA
(fill rate, see 3.2) are what saves time on integrated GPUs.

### 3.1a Nature round 2 (Apple M5 Pro, ANGLE Metal, headed Chromium, 1440×900, Hoch, uncapped)

`requestAnimationFrame` intervals over 240 frames per view, vsync and frame limit off; the machine
was shared with other jobs, so single runs vary by ±25 %. Before = `b03a39f` (card trees), after =
model trees + impostors + shadow-pass early-outs (docs/ART-DIRECTION.md §5.2).

| View | fps before | p95 before | fps after | p95 after |
|---|---:|---:|---:|---:|
| Title (forest behind the menu) | 47 | 33.9 ms | 85 | 27.1 ms |
| Forest today (1240 / −1060) | 56 | 35.3 ms | 87 | 16.5 ms |
| Forest today B (1632 / −1640, densest) | 40 | 34.2 ms | 101 | 13.2 ms |
| Forest today C (1952 / −1010) | 41 | 33.1 ms | 92 | 16.4 ms |
| Palace 1789 | 49 | 34.9 ms | 59 | 35.0 ms |
| Night 1793-02 | 73 | – | 84 | 16.8 ms |

`kq.bench` frame p95 after: today-forest 14.5 ms (was 29.4), 1789-night-pack 35.4 ms (was 32.6),
1793-07-festsaal-fire 37.5 ms (was 31.4; avg 28 ms ≈ 35 fps). The forest itself was the cost: its
fragment shading paid twice (main + shadow pass). Toggling layers in the densest view: whole forest
≈ 3.3 ms, impostors ≈ 0.6 ms, props / ground cover ≈ 0.3 ms each, the sun shadows (casting +
9-tap receiving everywhere) ≈ 7 ms — the next knob. The Festsaal fire and the palace views are
bound by the fire / interior effects and stay under 60 fps (open, not this track's code).

### 3.2 SwiftShader (headless e2e, 1280×720, pixel ratio 1, Hoch, 8 frames per scene)

| Scene | Triangles before | after | Frame ms before | after | CPU ms before | after |
|---|---:|---:|---:|---:|---:|---:|
| today-fly | 879 k | 554 k | 373 | 366 | 1.39 | 1.34 |
| today-forest | 876 k | 550 k | 422 | 382 | 0.75 | 1.21 |
| 1789-fly | 788 k | 622 k | 360 | 346 | 0.66 | 0.64 |
| 1789-ehrenhof | 699 k | 686 k | 552 | 632 | 0.56 | 0.66 |
| 1789-night-pack | 696 k | 680 k | 441 | 518 | 1.00 | 1.11 |
| 1793-07-festsaal-fire | 715 k | 698 k | 616 | 470 | 1.18 | 1.24 |
| 1793-07-fire-outside | 671 k | 669 k | 390 | 369 | 1.10 | 1.17 |
| 1796-ruin | 681 k | 671 k | 654 | 452 | 151 ¹ | 119 ¹ |
| scan3-fly | 941 k | 614 k | 589 | 475 | 1.37 | 1.09 |

¹ First render of the ruin compiles its shaders inside the measured frame (SwiftShader compiles
serially); on a GPU the warm-up (§4) does this behind the title.

Where SwiftShader's time goes (fill-bound, measured by switching parts off): 4× MSAA ≈ half of the
frame, terrain 100–120 ms, palace 100–150 ms, forest 36–150 ms. That is the reason Niedrig turns
MSAA off and Mittel uses 2×.

### 3.3 CPU per frame (systems)

Measured with the per-system timers (`systems.stats()`, overlay "Systeme"):

| | before | after |
|---|---|---|
| interiors `frame()` near the palace | 1.2–2.5 ms, garbage every frame (arrays, closures, light sort, shell box rebuild) | < 0.05 ms, no allocations |
| forest rebuild | closures per rebuild | reused buffers, rebuild after 12 m / 20° only |
| terrain LOD pass | new count array per frame | reused |

The whole rendered frame stays ≤ 1 ms CPU in most scenes on the M5 Pro, 2.3 ms at the burning
palace from outside (fire particles).

## 4. Loading

Measured with `e2e/perf.spec.ts` (preview build on localhost, cold cache, SwiftShader).

| | before | after |
|---|---|---|
| Bytes until the title takes input | 9.15 MB (palace awaited) | **4.5 MB** critical; the palace (4.6 MB) streams in parallel and is not awaited |
| Total fetched while the title shows | 8.73 MiB (9.15 MB) | 9.15 MB (same files) |
| Title ready | 557 ms | 507 ms (local; the gain grows with slower connections, where the 4.6 MB palace no longer blocks) |
| Progress | text only | bar with streamed byte progress of the four terrain rasters (`role=progressbar`) |

Timeline (marks in `window.__kqReady`, after): boot 26 ms → data 108 ms → world 362 ms → systems
500 ms → ready 507 ms; palace 507 ms. Largest files: palace `buildings.glb` 4.6 MB, `h2025` 1.4 MB,
`canopy` 1.1 MB, `h1789` 1.0 MB, main JS 285 KB gzip, four fonts 250 KB. The palace is only shown
in the past eras, so the first minutes of play never need it; a resumed save in 1789 sees it pop in
within the download time.

Shader warm-up: once the palace is in, `renderer.compileAsync(scene, camera)` compiles every
material while the title is shown (parallel compile where the driver offers
`KHR_parallel_shader_compile`). Without it the first 1789 frame took 2.5 s in SwiftShader (47
programs); later era first frames ~85 ms. Not run under WebDriver (keeps e2e timing as before);
`?warm` forces it.

## 5. Graphics presets and the auto-downgrade

`src/render/quality.ts`. Settings → Bild & Leistung → Grafik: Niedrig / Mittel / Hoch.

| | Niedrig | Mittel | Hoch |
|---|---|---|---|
| Max pixel ratio | 1 | 1 (was 1.25) | 1.25 (was 1.5) |
| MSAA | off | 2× | 4× |
| Terrain LOD distance | 0.6 | 0.8 | 1 (200 / 450 / 1000 m) |
| Tree rings near / far | 110 / 480 m | 140 / 600 m | 170 / 700 m |
| Sun shadow map | none | 1024², re-used every 2nd frame | 2048², re-used every 2nd frame |
| fx particles | low | high | high |
| Point cloud (Röntgenblick) | sparser | full | full |

- **Bildrate** 30 / **60** / unbegrenzt (default 60): the most frames a second while playing
  (`core/loop.ts` `FramePacer`: on a 120 Hz screen 60 draws every 2nd display frame with even
  spacing, 30 every 4th). The fixed 60 Hz simulation does not depend on it.
- **Energiesparen** (off by default): 30 fps, pixel ratio ≤ 1, no AO, no planar water
  reflection, on top of any preset. On battery (Battery API, Chromium only) a toast suggests it
  once, 15 s after the start; nothing switches by itself.
- **Shadow re-use**: a frame keeps the last shadow map only while it is still exact: the focus
  moved less than ¾ of a texel (walking 3.2 m/s = 5.3 cm a 60 fps frame keeps it on Hoch and
  Mittel; sprinting 6.2 m/s = 10.3 cm re-renders), the sun did not turn, the map is ≤ 25 ms old
  (so at 30 fps every frame re-renders), and never in a fight or in bullet time.

- **Auflösung der 3D-Ansicht** (50–100 %) scales the 3D resolution under the preset's pixel-ratio cap; the UI
  stays sharp.
- **First run** guesses a preset from the GPU name (`WEBGL_debug_renderer_info`): software
  rasterisers, phones and tablets → Niedrig; Intel / AMD integrated → Mittel; else Hoch.
- **Grafik automatisch anpassen** (on by default): when the average frame time stays above 25 ms for six
  seconds in a row while playing, the preset goes one step down (Hoch → Mittel → Niedrig → 75 %
  resolution), with a toast saying so. Stalls ≥ 250 ms (shader compiles, loading rooms, tab
  switches), era shifts and the first seconds are ignored. Off under WebDriver, `?manual` and
  in bullet time. Under a 30 fps cap the threshold is 1.25 × 33 ms (`slowMsFor`), so the cap's
  own frame time does not count as slow.

### 5.1 Render pacing and the fan round (2026-11-20)

Owner report: the laptop fans get loud (MacBook Pro M-series, 120 Hz ProMotion). Causes
(research of the same day): no frame cap (Chrome renders at 120 Hz), rendering never idled
(title, menus and bullet time drew at the full rate), Hoch at pixel ratio 1.5, the shadow map
re-rendered every frame. What changed:

1. **Frame cap** „Bildrate“ (default 60), see above.
2. **Idle rendering** (`renderRate`, docs/ARCHITECTURE.md §3): title ≤ 30 fps; pause menu,
   journal, map, cards and other "still" panels draw once and hold the frame; dialogue and other
   live panels 15 fps after a 1.5 s settle; bullet time only on request (pilot frames, `kq.step`,
   `screenshotReady`, hooks, real input); hidden tab nothing and the AudioContext suspended; the
   rAF loop parks while it has nothing to do.
3. **Pixel-ratio caps** Hoch 1.25, Mittel 1.
4. **Shadow re-use** every 2nd frame on every tier with shadows (Hoch and Mittel; Niedrig has none).
5. **Energiesparen**, see above.

Measured on the real GPU (Apple M5 Pro, ANGLE Metal, headless Chromium, 1512 × 982 at device
pixel ratio 2 like a 14" MacBook Pro, `--disable-gpu-vsync --disable-frame-rate-limit` so the
GPU, not a display, limits the rate; script `measure.mjs` in the session scratchpad, `?idle`
gives the player's policy under automation). Before = `02340f5`. The machine was shared with
another session's GPU work, so single numbers vary by ±10 %; ratios hold.

| View | Before: renders/s | After: renders/s | After, „unbegrenzt“: fps |
|---|---:|---:|---:|
| Title, Hoch | 53 (GPU-bound) | **30** | – (title stays ≤ 30) |
| Title, Mittel | 73 (GPU-bound) | **30** | – |
| Densest forest (1632 / −1640), Hoch | 66 (GPU-bound) | **60** | 87 (+32 %) |
| Densest forest, Mittel | 108 (GPU-bound) | **60** | 129 (+19 %) |
| Pause menu over the forest, Hoch | 65 | **0** (frame held) | |
| Journal, Hoch | 69 | **0** | |
| Bullet time (`kq.pilot.bulletTime(true)`), idle | 66 | **0** | |
| Bullet time, one `act` with 3 frames / `screenshotReady()` | 3 / 3 | 3 / 3 | |

- GPU load at the 60 cap, estimated as renders/s ÷ uncapped fps: Hoch ≈ 69 %, Mittel ≈ 47 %
  (before: 100 % on every view, menus included; on a 120 Hz screen Mittel would have drawn 108
  frames a second).
- `kq.perf()` in the forest at the cap: frame 16.7 ms avg, CPU of the render callback 1.8 ms
  (before 14.9 ms: the callback blocked on a saturated GPU).
- Pixel ratio: Hoch draws 1890 × 1227 instead of 2268 × 1473 (−31 % pixels), Mittel 1512 × 982
  instead of 1890 × 1227 (−36 %).
- Shadow re-use, standing in the forest at 60 fps: 50 % of the shadow passes skipped.
- **No visible shadow swimming** (checked on the real GPU, script `swim.mjs`): the same walking
  frame drawn with the re-used and with a fresh map. Static shadows (buildings, trees) are
  identical, pixel for pixel; only the walking avatar's own shadow lags (≤ 0.11 % of pixels
  differ by more than 12 / 255, max 58 / 255), invisible at 1:1. Sprinting re-renders every
  frame (0 differing pixels).
- Not measured here: a real 120 Hz display (headless has none; `tests/core.test.ts` checks the
  pattern for 120 / 60 / 144 / 50 Hz with jitter), Safari (60 Hz rAF by default anyway).

## 6. Accessibility settings

Settings page (`src/ui/settings.ts`): five sections with a sticky jump bar (Spiel, Steuerung,
Bild & Leistung, Barrierefreiheit, Ton), every control labelled (`<label for>`), sliders announce
their value (`aria-valuetext`), help text under rows that need it, Tab/Shift+Tab stay inside the
open dialog, visible focus outlines.

| Setting | Effect |
|---|---|
| Sanfter Modus | slower pack, no knock-downs, thinner smoke, finds kept (with explanation) |
| Maus-Y / Maus-X umkehren, Mausempfindlichkeit, Sichtfeld | camera |
| Tastenbelegung | remap every action (physical keys, layout-aware names via the Keyboard Map API), × removes a key, reset; keyboard look on Komma / Punkt / Bild↑ / Bild↓ / Numpad 4 6 8 2 (play without a mouse) |
| Untertitelgröße klein / mittel / groß / sehr groß, Untertitel-Hintergrund 0–100 % | subtitles readable on any scene |
| Keine Lichtblitze | era-shift flash, fire collapse flashes, candle and fire flicker damped to ≤ 25 % (default from `prefers-reduced-motion`) |
| Weniger Bewegung | no head bob, calm transitions (existing) |
| Kontrastreiche Anzeige | solid dark backings behind every HUD element, larger crosshair, bolder text (default from `prefers-contrast: more`) |
| Farbenblind-sichere Farben | relief scan in Okabe-Ito blue ↔ orange instead of blue ↔ red |
| Gesamtlautstärke, Musik, Geräusche, Stimmen, Umgebung | voices (dialogue, echo whispers) on their own bus; the music slider now also drives the dread drone |

## 7. Known gaps

- No measurement on a real mid-range laptop (Intel Iris Xe / AMD 680M); the Mittel/Niedrig guess
  for those GPUs is a heuristic, the auto-downgrade is the safety net.
- GPU timer numbers on Apple silicon are noisy (DVFS); compare triangles/calls first.
- The palace fragment shader (fbm stone and roof detail) is the largest remaining GPU cost in
  1789 views; not optimised this round.
- Chapter content packs are bundled into the story chunk (~100 KB gzip), not lazy-loaded per
  chapter.
- The shader warm-up cannot be verified headless (SwiftShader compiles serially).
- The key-help page lists the bible's default key names; it does not yet follow remapped keys.
- Fan round leftovers (research 2026-11-20, wins 6–8): the auto-downgrade still reads only frame
  time (no missed-frame or thermal signal, never steps back up); the first-run guess still gives
  Apple GPUs Hoch; no dynamic resolution. A live dialogue renders 15 fps after its 1.5 s settle:
  NPC idle motion behind the panel looks a little stepped.
