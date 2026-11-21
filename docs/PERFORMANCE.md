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

### 3.4 Triangle budget, phase A (2026-11-21)

Hoch peaked at 2.3–4.2 M triangles (budget 1.5 M) at the palace plateau, the Quelle, the
Felsenpfad and the Weiher, and 1789 at the palace at 2.5–3.7 M with 321–359 calls. Five fixes,
all meant to be invisible at normal viewing distance:

1. **Water reflection only when the water is on screen and near** (`world/water.ts`): the planar
   reflection re-rendered forest, terrain and scenery for any body within 450 m whose centre lay
   ahead, also off screen. Now only a body whose bounding box is in the camera frustum and within
   `reflectDist` = 150 m (`reflectionDistance`); over the last 30 % (105–150 m) the reflection fades
   into the shader's tree-line band (the Mittel look), beyond it the reflection pass is skipped.
2. **Reflection off-phase with the shadow map** (`ReflectionSchedule`): the shadow map re-renders
   every 2nd frame on Hoch; the reflection renders on the frames that re-use it (or after standing
   one frame), so with the usual pattern no frame pays for both. The reflection matrix is
   world-anchored, a one-frame-old image stays in place; a cut (camera jump > 2 m, turn > 3.4°,
   another body, new target, era change) forces a fresh one. When the shadow map re-renders every
   frame (sprinting, fights, bullet time) the reflection renders every 2nd frame.
3. **Forest looking down** (`world/forest.ts` `forestCullMode`): looking steeply down disabled
   culling and drew the whole 700 m ring (17 k impostors in the Quelle ravine). The full ring now
   stays only more than 20 m above the ground (flying, spirit view); on foot whole 64 m tiles
   outside a 3D view cone (frustum corner + 40°, rebuilt after a 20° turn; `world/viewCone.ts`) are
   dropped, everything within 30 m always stays.
4. **Ground cover culling and a distance tuft** (`world/vegetation/groundcover.ts`): the 360° ring
   is cut to the same view cone (everything within 3 m stays, the camera turns fast; rebuilt after
   3 m or a 20° turn), and grass beyond ≈ 12 m (dithered ±2 m per tuft, no ring line) is a 10-blade
   tuft of twice the blade width (60 instead of 132 triangles), where the blades are a pixel wide
   or less. Up close nothing changes.
5. **1789 palace** (`assets/loader.ts`, `systems/interiors/`): the CC0 chandelier's glass came with
   `KHR_materials_transmission`, which makes three.js redraw every opaque object in a transmission
   pre-pass whenever it is in view; at load it becomes alpha-blended glass (`dropTransmission`).
   The interior model groups (fauteuils, chandeliers; one building alone had 28 armchairs at 5.6 k
   triangles) are drawn only inside the building or within 25 m of it (hidden again beyond 28 m) and
   cast sun shadows only while the player is inside (`interiorModelsView`).

Measured on the real GPU (Apple M5 Pro, ANGLE Metal, headless Chromium 1280 × 720, pixel ratio 1,
uncapped), third-person camera 3.6 m, FOV 80°, pitch −6°; 3 s per view with the tier's own shadow
re-use; "peak" = the most expensive frame. Before = `4a3c98c`.

| View | Tier | Calls avg / peak | Triangles avg / peak | Per pass after (main / shadow / reflection, avg M) |
|---|---|---|---|---|
| Palace plateau (1216 / −1114), 270° | Hoch | 231 / 259 → **154 / 182** | 3.44 / 3.95 M → **2.08 / 2.60 M** | 1.57 / 0.52 / – (reflection 0.93 → off) |
| Quelle (1059 / −833), 270° | Hoch | 227 / 254 → **182 / 197** | 3.56 / 4.21 M → **2.72 / 2.79 M** | 1.56 / 0.61 / 0.54 (17 k → 9.7 k impostors) |
| Felsenpfad (683 / −596), 90° | Hoch | 134 / 159 → **135 / 160** | 2.35 / 2.97 M → **2.24 / 2.85 M** | 1.62 / 0.62 / – |
| Weiher (897 / −845), 90° | Hoch | 192 / 215 → **163 / 169** | 1.98 / 2.26 M → **1.57 / 1.59 M** | 0.99 / 0.28 / 0.30 |
| 1789 plateau (1216 / −1114), 180° | Hoch | 330 / 359 → **161 / 188** | 2.18 / 2.50 M → **0.91 / 1.10 M** | 0.73 / 0.19 / – |
| 1789 front (1184 / −1126), 90° | Hoch | 290 / 321 → **184 / 213** | 3.41 / 3.74 M → **1.27 / 1.46 M** | 1.08 / 0.19 / – |
| Palace plateau | Mittel | 146 / 171 → 147 / 172 | 1.32 / 1.62 M → **1.21 / 1.51 M** | 0.92 / 0.30 / – |
| Quelle | Mittel | 128 / 152 → 130 / 155 | 1.54 / 1.97 M → **1.49 / 1.91 M** | 1.07 / 0.42 / – |
| Felsenpfad | Mittel | 132 / 157 → 133 / 158 | 1.49 / 1.88 M → **1.46 / 1.85 M** | 1.07 / 0.39 / – |
| Weiher | Mittel | 131 / 154 → 132 / 155 | 0.86 / 1.03 M → **0.83 / 1.00 M** | 0.66 / 0.17 / – |
| 1789 plateau | Mittel | 223 / 247 → **152 / 174** | 1.62 / 1.91 M → **0.84 / 0.99 M** | 0.69 / 0.15 / – |
| 1789 front | Mittel | 283 / 312 → **179 / 206** | 2.54 / 2.86 M → **1.14 / 1.33 M** | 0.96 / 0.18 / – |

- Peaks with the shadow map forced every frame (the old worst case): Weiher 2.26 → 2.15 M, Quelle
  4.21 → 3.87 M (reflection and shadow coincide every 2nd frame there).
- Still over budget on Hoch: the Felsenpfad and the Quelle (forest model trees and the props,
  each drawn twice: main and shadow pass) and the palace plateau (the shadow pass, 1.03 M at its
  peak). Next phase.
- Look checks: the same camera before / after at every view, the Weiher from 100 / 125 / 160 m
  with the reflection forced on, off and as shipped, the chandelier at 1.8 m and 3 m, the
  walk-up to the furnished wing: no visible difference except the wind phase (session scratchpad
  `tri-phase-a/`).

### 3.5 Triangle budget, phase B (2026-11-21)

After phase A, Hoch still drew 2.1–2.7 M triangles on average at the palace plateau, the Quelle and
the Felsenpfad. Most of that was the forest model trees and the CC0 props, each drawn twice (main
and shadow pass). Three changes, each checked with before / after look pairs:

1. **Props re-packed** (`pnpm assets:pack --simplify`, fresh Poly Haven 1k sources, UVs /
   textures / credits kept; `tests/asset-tris.test.ts` caps them): tree_stump_01 12.3 k → 1.8 k,
   tree_stump_02 8.1 k → 1.9 k, dead_tree_trunk 6.1 k → 1.8 k, both crates 6.6 / 5.2 k → 1.9 / 1.8 k,
   ArmChair_01 5.6 k → 1.8 k, wine_barrel_01 10.8 k → 4.6 k, wicker_basket_01 16.6 k → 8.9 k. The
   barrel and basket stop higher. At ≈ 2 k the barrel's hoops tore away from the staves, and the
   basket's walls vanished because the weave is made of separate strands. Rule: compare the
   simplified surface area with the source; a loss of more than ≈ 5 % shows. The Apfelallee props
   (80–120 k per view) are procedural kit apple trees, not packed assets; they are the next knob
   there.
2. **Quelle ferns as a distance LOD** (`systems/scenery/quelle.ts` `fernDetailed`): the scanned
   clump (`nature.fern.02`, ≈ 5.6 k triangles) stays within 9 m of the trough or 3 m of the trail
   through the hollow. The 10 brook-bank clumps up the ravine use the stylised forest fern
   (`nature2.ferns#fern`, 288 triangles) at the same spot, height and footprint. Together they
   cost less than 75 % of the old triangles (`tests/quelle-ferns.test.ts`).
3. **Trees** (`world/vegetation/trees.ts`): the lod1 → impostor ring moved from 78·k to 72·k.
   At 60·k and 66·k the pines across the Weiher looked flatter in an A/B flip, so it backed off to
   72. In the shadow pass the model trees draw caster lists with the lod1 geometry (lod0 trees
   included), sorted by distance from the expected shadow focus. Only casters within box + 30 m
   are drawn, which is the same limit the vertex shaders already applied. So the cut changes no
   shadow, but the dropped casters no longer cost vertex work (`renderer.info` counted the
   collapsed instances). The lod1 casters move the edges of near trunk shadows by a few pixels.

The Quelle water box was checked as well. The reflected body is the Weiher, 102 m away, seen
through the trunks (≈ 200 px of 0.92 M). The box is the body plus its bank pad, so it is not a
bounds bug and was left alone.

Measured as in §3.4 (real GPU, Apple M5 Pro, ANGLE Metal, headless Chromium 1280 × 720). Before is
`3b6739d` (phase A plus main).

| View | Tier | Calls avg / peak | Triangles avg / peak | Peak, shadow every frame | Per pass after (main / shadow / reflection, avg M) |
|---|---|---|---|---|---|
| Palace plateau, 270° | Hoch | 154 / 182 → **150 / 173** | 2.08 / 2.60 M → **1.50 / 1.77 M** | 2.60 → 1.77 M | 1.23 / 0.27 / – |
| Quelle, 270° | Hoch | 182 / 197 → **180 / 199** | 2.72 / 2.79 M → **1.98 / 2.17 M** | 3.87 → 2.76 M | 1.20 / 0.29 / 0.49 |
| Felsenpfad, 90° | Hoch | 135 / 160 → **130 / 149** | 2.24 / 2.85 M → **1.51 / 1.80 M** | 2.85 → 1.80 M | 1.23 / 0.29 / – |
| Weiher, 90° | Hoch | 163 / 169 → **160 / 169** | 1.57 / 1.59 M → **1.23 / 1.38 M** | 2.15 → 1.64 M | 0.81 / 0.13 / 0.28 |
| 1789 plateau, 180° | Hoch | 161 / 188 → **160 / 187** | 0.91 / 1.10 M → **0.75 / 0.89 M** | 1.10 → 0.89 M | 0.62 / 0.13 / – |
| 1789 front, 90° | Hoch | 184 / 213 → **184 / 212** | 1.27 / 1.46 M → **1.01 / 1.15 M** | 1.46 → 1.15 M | 0.88 / 0.14 / – |
| Palace plateau | Mittel | 147 / 172 → 144 / 166 | 1.21 / 1.51 M → **0.95 / 1.12 M** | | 0.78 / 0.17 / – |
| Quelle | Mittel | 130 / 155 → 125 / 147 | 1.49 / 1.91 M → **1.04 / 1.24 M** | | 0.83 / 0.21 / – |
| Felsenpfad | Mittel | 133 / 158 → 128 / 147 | 1.46 / 1.85 M → **1.05 / 1.24 M** | | 0.86 / 0.19 / – |
| Weiher | Mittel | 132 / 155 → 128 / 148 | 0.83 / 1.00 M → **0.62 / 0.70 M** | | 0.55 / 0.07 / – |
| 1789 plateau | Mittel | 152 / 174 → 152 / 173 | 0.84 / 0.99 M → **0.68 / 0.78 M** | | 0.58 / 0.10 / – |
| 1789 front | Mittel | 179 / 206 → 179 / 205 | 1.14 / 1.33 M → **0.89 / 1.02 M** | | 0.76 / 0.13 / – |

- Hoch is now at or near the 1.5 M budget on average everywhere except the Quelle (1.98 M). There
  the water reflection (0.49 M, the Weiher through the trunks) is the remaining knob. A minimum
  screen coverage for the reflection would remove it, but that changes the look.
- Look checks were done with a frozen clock and a fixed camera before / after:
  - Every re-packed prop at 2–3 m and 10 m: same silhouette and texture, slightly simpler edges.
  - The ferns from the home-base view, down the brook, and on the far bank from 6 / 10 m.
  - The trees and shadows at the Felsenpfad, across the Weiher, and at the palace clearing.
  - The impostor ring at 60 / 66 / 72 / 78.
  - What differs: the wind phase, and near trunk-shadow edges that move a few pixels (lod1 casters)
    (session scratchpad `tri-phase-b/`).

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
- **Planar water reflection** (Hoch only): the nearest body on screen within 150 m, fading to
  the tree-line band from 105 m; re-rendered on the frames that re-use the shadow map (§3.4).
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
