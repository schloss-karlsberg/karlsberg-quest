---
id: TASK-008
aliases:
- TASK-008
title: 'Improve the castle landscape: terrain, trees, flowers, props; make full use of the LiDAR data'
slug: improve-the-castle-landscape-terrain-trees-flowers-props-make-full-use-of-the-li
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- 3d
- world
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-25
---

# Improve the castle landscape: terrain, trees, flowers, props; make full use of the LiDAR data

> Epic. Core dev team task. One PR per slice.

## Description

Owner: improve the landscape around the castle and add trees, flowers and other objects. The
LiDAR version of the castle area looks great, and the game may not use all of it.

### What the baseline uses (`6d288275`)

- **Data prep:** `scripts/prepare-data.ts` (`pnpm prepare-data`) reads the sister project
  `../saar-lidar-explorer` read-only and writes `public/data/` (manifest `public/data/manifest.json`, ~12.6 MB total).
- **Terrain:** source DGM is **1 m** (2150 × 2650 cells, 2.15 × 2.65 km, E 381150–383300 / N 5464500–5467150).
  The game resamples to **2 m** (`CELL = 2`; 1075 × 1325; `public/data/terrain/meta.json`): `h2025`
  (1.4 MB), `h1789` difference (1.0 MB). Runtime mesh: `src/world/terrain.ts` (64-quad chunks, LOD
  steps 1/2/4/8 over 2 m cells), shading `src/world/terrainShader.ts` (splats from land cover,
  slope, a derived local relief `slrm`), rasters `src/world/rasters.ts`, `src/world/heightfield.ts`.
- **Land cover:** `ground.u8` (2 m, classes meadow / lawn / gravel / cobbles / sand / water / forest ...).
- **Canopy:** CHM (DOM − DGM) max-pooled to 2 m, `canopy.u8` (1.1 MB); used for tree heights in
  `src/world/forest.ts` and the far-canopy shading.
- **Point cloud:** ALS 2025 ground points (classes 2, 6, 9, 24) in the 1 × 1 km palace box only, 82 % kept
  (`KEEP = 0.82`, budget ≤ 3 MB), for the "Röntgenblick" scan.
- **Historic maps:** 1840 and 1935 at 2 m/px.
- **Vegetation:** `src/world/forest.ts` (procedural beech / spruce / oak, near / mid / far impostor),
  `src/world/vegetation/trees.ts` (CC0 Quaternius trees, lod0 / lod1 / baked impostor),
  `vegetation/props.ts` (ferns, bushes, flower clumps, rocks, logs, stumps: instanced, deterministic scatter
  per 16 m tile from land cover; **off on the low tier**), `vegetation/scatter.ts` (pure, tested),
  `vegetation/groundcover.ts` (grass), `vegetation/duck.ts`. Assets: `public/assets/models/nature/`,
  `nature2/` (Quaternius Stylized Nature kit), manifests `src/assets/manifests/nature.ts`, `nature2.ts`.
- **Scenery sets** (`src/systems/scenery/`, list in `sets.ts`): per era and place, built within range
  (Quelle, Bleiche, orchard, Hohenburg, court, Rund, signs, ...). Checked in `tests/scenery.test.ts`.
- **Palace:** `public/data/palace/buildings.glb` (1789 model), `footprints.json`, `rooms.json`; `src/world/palace.ts`.

### Unused potential

- **3/4 of the terrain samples:** the 1 m DGM is downsampled to 2 m everywhere. Around the palace,
  terraces, the Quelle ravine, paths and ruins, 1 m (or 1 m in a core box + 2 m outside) would sharpen edges.
- **Sister karlsberg AOI layers** (3 × 3 km at 1 m, `app/public/data/karlsberg/manifest.json`):
  `hillshade`, `slope`, `slrm`, `svf`, `opns_pos/neg`, `vat`, `chm`, `mask`, `bldg`, `ortho`. The game
  reads the overall AOI's `chm` and `bldg` together to exclude buildings before pooling canopy heights.
  It also reads the historic maps. Local relief is re-derived from the 2 m terrain.
  The 1 m CHM could place individual trees where real crowns are; openness / SVF could drive
  moss, litter and flowers; `ortho` could guide meadow vs forest edges (check its licence first).
- **`ground2025.u8`** exists in the sister terrain folder next to `ground.u8`; the game reads only `ground.u8`.
- **Point cloud:** the scan includes class 6 (buildings), 9 (water) and 24 (cellars) alongside class 2
  (ground). Vegetation returns and points outside the palace box are unused.
- **Niedrig:** both scattered `NatureProps` and procedural `GroundCover` are off. Authored scenery,
  including the spring, still uses the procedural set kit on this tier.

### Proposed steps

1. **Terrain resolution where it matters:** a 1 m core tile around the palace / Quelle / tour route
   (e.g. the 1 × 1 km palace box) on top of the 2 m base; extend `prepare-data.ts` and `meta.json`, keep
   the data-before-first-input budget (≤ 20 MB, `docs/PERFORMANCE.md`).
2. **Vegetation from data:** trees placed from 1 m CHM crown maxima (species from height / land cover),
   bushes on forest edges, meadow flowers and tall grass from land cover + slope + openness masks;
   season tint from `foliage.ts` (mid-November).
3. **Props:** benches and signs along the tour route, sandstone ruins and stones of the Karlsberg
   (cream sandstone, `docs/ART-DIRECTION.md` palette), path edges; as scenery sets or scatter kinds.
4. **Performance budget with mobile in mind:** stay within `PERF_BUDGET` (`src/render/perf.ts`:
   ≤ 300 draw calls, ≤ 1.5 M triangles); give the low tier a cheap subset instead of nothing
   (`src/render/quality.ts`, `mobileDefaults.ts`, `docs/PERF-MOBILE-RESEARCH.md`).
5. **Screenshots:** fixed viewpoints before and after, real GPU (`playwright.gpu.config.ts`,
   `e2e/gpu/*.gpu.ts`), plus SwiftShader via `scripts/dev/shots.mjs`; bench with `kq.bench()` / `e2e/perf.spec.ts`.

Look and licensing: stylized modern look and CC0 / own assets only (`docs/ART-DIRECTION.md` §5, §8),
each file credited in `public/assets/LICENSES.json`; data licences in `public/data/attribution.json`.

## Acceptance Criteria
- [ ] Findings above confirmed or corrected in this task (what's used / unused)
- [ ] Higher terrain detail around the palace and tour route, data budget kept
- [ ] Data-driven tree, bush and flower placement in the castle area; new props (benches, ruins / stones, paths)
- [ ] Frame rate on the mobile profile (Niedrig, phone viewport) does not fall below the target (60 fps cap; bench scenes in `src/debug/bench.ts` within `PERF_BUDGET`); low tier gets a reduced version
- [ ] Before / after GPU screenshots from 4–6 fixed viewpoints (palace plateau, Ehrenhof, Quelle, tour route, Weiher) in the PR
- [ ] New assets CC0 / own work with credits; `tests/assets.test.ts` green
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass; `docs/ART-DIRECTION.md` / `docs/PERFORMANCE.md` updated

## Plan

### Slice 4 — Hoch first-input budget

_Status: approved 2026-11-25 (coordinator for the owner)_

**Approach:** Keep the 1789 palace mesh and six historical architecture surface pairs out of the
present-day title load. Fetch them once play begins, with eager loading for historical title views
and the existing skip-title paths. Keep the present-day surfaces, nature assets and preset
resolutions used at Karlsberger Hof. In the PR #35 capture, the deferred URLs account for
6,923,965 of 26,753,846 bytes. This leaves 19,829,881 bytes by subtraction, subject to a new capture.

**Files to touch:**

- `src/boot.ts`, `src/debug/hooks.ts`, `src/systems/scenery/index.ts`, `src/world/surfaces.ts` — gate historical requests by startup state and keep visual and debug readiness working.
- `tests/surfaces.test.ts`, `tests/scenery.test.ts`, `e2e/perf.spec.ts`, `e2e/gpu/tour-groundcover.gpu.ts` — test staging and the car-park materials and record browser checks.
- `docs/PERFORMANCE.md`, `docs/ARCHITECTURE.md`, `docs/ACTION-RPG.md`, `docs/PRD.md` — document when the assets are fetched and how to capture before and after.

**Steps:**

- [x] 1. Stream the historical palace mesh and surface layers after start. Preserve historical saves, skip-title and quality changes.
- [x] 2. Test request staging, preset changes and the materials used by the actual car-park scenery. Guard the first-input budget and prepare matched captures.
- [x] 3. Run the four local gates, document the change, and record the coordinator's capture commands.
- [ ] 4. Verify transfer bytes, the opening view and tour play on the coordinator's machine.

**Test plan:** Run focused Vitest tests and all four repo gates. Capture Hoch on the present-day
title with `PERF_LOAD_QUALITY=high` and check the strict 20 MiB cap and request timing. Compare
matched Karlsberger Hof and historical GPU views at Mittel and Hoch, plus the Niedrig controls in
the same GPU spec. Run `e2e/tour-slice.spec.ts`. Browser runs require the coordinator's machine.

**Risks:** Background decoding could move work into the first walk. Compare frame and CPU p95
and watch for texture or palace pop-in during the opening and first shift. Failed historical
texture requests should leave loaded surfaces usable.

**Open questions:** Paired browser bytes, GPU images and timings await capture.

**Acceptance criteria coverage**

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Used and unused data | partial | Attribute the fresh Hoch transfer to measured URLs. |
| 2. Higher terrain detail and data budget | partial | Address the first-input cap with the 1 m detail stream in place. |
| 3. Trees, bushes, flowers and props | follow-up | Present-day crowns and understory remain separate slices. |
| 4. Mobile frame rate and reduced version | partial | Preserve opening asset quality and run matched tier controls. |
| 5. Before/after GPU views | partial | Pair the existing six views per tier, pending capture. |
| 6. Assets and credits | full | Reuse the credited assets. |
| 7. Gates and docs | full | Run all four gates and update the performance guide. |

**Follow-up slices:** The terrain geometry, crown placement, understory and Röntgenblick follow-ups
listed in slice 3 remain open.

## Progress

- Slice 4 branch `perf/task-008-high-first-input`, based on `44f90fa` (PR #35 merged).
- 2026-11-25 — The coordinator approved slice 4 for the owner. Browser runs are outside this sandbox.
- 2026-11-25 — Step 1 complete. The present-day title skips the hidden palace mesh and historical
  layers. The opening and historical batches share their preset-sized arrays. Historical starts and
  skip-title retain eager loading, and the shift warmer can prepare the palace once it streams in.
- 2026-11-25 — Step 2 complete. All 33 focused tests passed. The byte spec checks request starts
  as well as the transfer total. Playwright lists the byte spec, five GPU cases and the tour case.
- 2026-11-25 — Step 3 complete. Typecheck, build and all 1,529 Vitest tests passed. pnpm used a
  worktree-local dependency copy with `--config.verify-deps-before-run=false`. The `pnpm validate`
  invocation hit the tsx IPC `EPERM` block. `node --import tsx scripts/validate-content.ts` passed
  with content warnings.
- 2026-11-25 — Step 4 is pending. First-input bytes, GPU stills and timings, tour flow, and other
  browser specs using `screenshotReady()` are unverified in the sandbox.
- 2026-11-25 — `mc validate` and `git diff --check` passed. Staging was blocked by
  `Operation not permitted` on the worktree's `index.lock`. The changes remain in the worktree.

### Slice 4 coordinator capture commands

On an ANGLE Metal machine with Chromium installed, run from this worktree. The baseline uses
the same GPU poses and its own byte spec. Keep the JSON from the expected baseline Hoch failure.
The final low and medium runs check both tiers against the same cap.

```sh
slice4_root=$(mktemp -d /tmp/kq-task-008-slice4.XXXXXX)
git worktree add --detach "$slice4_root/before" 44f90fa4367de004348d0647dcb69d2d7f60a13f
cp e2e/gpu/tour-groundcover.gpu.ts "$slice4_root/before/e2e/gpu/"
(cd "$slice4_root/before" && pnpm install --frozen-lockfile && pnpm build)
pnpm build

slice4_bytes() {
  CI=1 KQ_E2E_PORT=5361 PERF_LOAD_QUALITY="$1" PERF_LABEL="$2" scripts/dev/heavy.sh --max-hold 15 -- \
    pnpm exec playwright test e2e/perf.spec.ts --grep 'bytes and time before the first input' --workers=1
}
slice4_gpu() {
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh --max-hold 15 -- \
    pnpm exec playwright test -c playwright.gpu.config.ts e2e/gpu/tour-groundcover.gpu.ts --workers=1
}

(cd "$slice4_root/before" && slice4_bytes high slice4-before)
slice4_bytes high slice4-after
slice4_bytes medium slice4-after-medium
slice4_bytes low slice4-after-low
(cd "$slice4_root/before" && slice4_gpu slice4-before)
slice4_gpu slice4-after
CI=1 KQ_E2E_PORT=5361 scripts/dev/heavy.sh --max-hold 15 -- \
  pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1

mkdir -p test-results/contribute/TASK-008 test-results/perf
cp -R "$slice4_root/before/test-results/contribute/TASK-008/slice4-before" test-results/contribute/TASK-008/
cp "$slice4_root/before/test-results/perf/load-slice4-before.json" test-results/perf/
```

Compare the title-flow `desktop-high-opening.png` and the matched Karlsberger Hof and Ehrenhof
stills. Use the route JSON for frame and CPU p95 and all-pass peaks. Save the actual byte totals
and first-input times from `test-results/perf/load-slice4-*.json`.

## Slice 3 plan

_Status: approved 2026-11-25 (coordinator for the owner)_

**Approach:** Slice 3 uses the local 1 m present-day DGM to sharpen the shading on trail banks,
the Quelle ravine and the palace terraces. Bake normals and local relief into one cropped,
mipmapped surface raster that reaches west to Karlsberger Hof. Stream it after play starts on
Mittel and Hoch. Blend into the 2 m shading at the crop edge, at distance and toward water.
The 2 m terrain mesh and height queries continue to set the silhouette and walking surface.

**Files to touch:**

- `scripts/prepare-data.ts`, `src/world/rasters.ts` — bake the crop from the existing attributed DGM and support a detail-only rebuild.
- `public/data/` — check in the derived raster, catalogue it and link it to the existing DGM attribution.
- `src/data/`, `src/world/`, `src/boot.ts` — load the optional raster after start and blend it into present-day terrain lighting.
- `tests/terrain-detail.test.ts` (new), `e2e/gpu/tour-groundcover.gpu.ts` — test the raster and loading, add matched higher-tier captures and live samples.
- `docs/ART-DIRECTION.md`, `docs/PERFORMANCE.md`, `docs/ACTION-RPG.md`, `docs/PRD.md` — document the visible change and its limits.

**Steps:**

- [x] 1. Bake the 1 m crop from the existing DGM, preserving the metre-scale relief filters, and register its bytes and attribution.
- [x] 2. Wire the optional load and terrain blend. Keep it off Niedrig, during title loading, in historic eras and in survey overlays. Add unit tests for the raster, byte ceiling and optional loading.
- [x] 3. Extend the GPU spec for six fixed views and live route samples on Mittel and Hoch. Keep the existing Niedrig phone run and first-input checks in the capture recipe.
- [x] 4. Run the four gates and document the change, hardware checks and capture commands.
- [ ] 5. Capture and inspect matched images and measure performance on ANGLE Metal.

**Test plan:** Run `pnpm exec vitest run tests/terrain-detail.test.ts`, `pnpm typecheck`,
`pnpm test --maxWorkers=2`, `pnpm validate`, and `pnpm build`. Use `node --import tsx
scripts/validate-content.ts` if the `tsx` IPC socket is blocked. On ANGLE Metal, use matched
Karlsberger Hof, Felsenpfad, Weiher, Quelle and palace plateau views in today and an Ehrenhof
control in 1789. Compare with the same capture spec on `eb43993`. Check dry trail relief, the
shore blend, and the six Niedrig phone views. Run the first-input byte spec and the tour flow.

**Risks:** The effect depends on the scene lighting and only changes surface shading. Bound the
cost to one extra filtered texture read per shaded fragment in the active region, no extra terrain
draws or triangles, and at most 2 MiB compressed after start. Hoch has existing over-budget triangle
peaks at route stops. Report the paired hardware costs and check the 1.5 M triangle, 300 draw, 8 ms
CPU, 16.7 ms frame and 20 MB first-input budgets using the commands below.

**Open questions:** Hardware look and timing checks remain for the coordinator.

**Acceptance criteria coverage**

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Used and unused data | partial | Reuse the 1 m DGM in the surface raster and document the crop. |
| 2. Higher terrain detail and data budget | partial | 1 m surface shading along the route and palace; geometric refinement follows. |
| 3. Trees, bushes, flowers and props | follow-up | Present-day crowns and understory remain separate slices. |
| 4. Mobile frame rate and reduced version | partial | Niedrig keeps the 2 m shading and its ground cover; paired hardware checks pending. |
| 5. Before/after GPU views in the PR | full | Six paired views per tier, pending hardware captures. |
| 6. Assets and credits | full | No downloads; use the local DGM under its existing attribution. |
| 7. Gates and docs | full | Run the four gates and update the design and performance guides. |

**Follow-up slices:**

- Evaluate a small 1 m geometry pilot at the Quelle or palace terraces. Verify seams, collision and placement heights before extending it along the route.
- Place present-day trees at 1 m CHM crown maxima and check the forest LOD and shadow budgets.
- Place bushes and meadow flowers from canopy edges, slope and openness. Compare `ground2025.u8` and the current mask before changing it.
- Evaluate expanded Röntgenblick coverage and vegetation returns against the scan payload budget and data attribution.

## Slice 3 progress

- Branch `feat/task-008-slice3`, based on `eb43993` (slice 2 merged in PR #32).
- 2026-11-25 — The coordinator approved the plan for the owner. The source DGM is available in the read-only sister checkout. The sandbox cannot run the baseline or after GPU captures.
- 2026-11-25 — Step 1 complete. The 896 × 832 crop uses lossless byte deltas before deflate and is 1,816,196 bytes on disk. The data manifest and DGM attribution include the raster. The `tsx` CLI hit the IPC block, so the data builder ran with `node --import tsx scripts/prepare-data.ts --surface-detail`.
- 2026-11-25 — Step 2 complete. The post-start load is optional and the higher-tier shader blends it into dry ground. Typecheck and all 20 targeted tests passed. Vitest uses a worktree-local copy of the installed dependencies because the original link points outside the sandbox's writable roots.
- 2026-11-25 — Step 3 complete. Playwright discovers four GPU cases with the slice 3 label and
  discovers the first-input and tour cases. The high-preset byte test also checks for early detail requests.
- 2026-11-25 — Step 4 complete. Typecheck and build passed. `pnpm test --maxWorkers=2` passed
  all 1,525 tests in 114 files, including asset credits. pnpm used `--config.verify-deps-before-run=false`
  with the local dependency copy. `pnpm validate` hit the tsx IPC `EPERM` block, and
  `node --import tsx scripts/validate-content.ts` passed with content warnings. `mc validate` passed.
- 2026-11-25 — Step 5 is pending. ANGLE Metal captures, GPU and frame timings, all-pass peaks,
  first-input bytes and the tour playthrough require the coordinator's machine.
- 2026-11-25 — Git staging failed with `Operation not permitted` on the worktree's
  `index.lock`. The slice is in the worktree pending the local commit.

### Slice 3 coordinator capture commands

Run from this worktree with Chromium installed on an ANGLE Metal machine. The baseline worktree
uses the same specs and camera poses. Each Playwright run takes the shared lock separately.

```sh
capture_root=$(mktemp -d /tmp/kq-task-008-slice3.XXXXXX)
git worktree add --detach "$capture_root/before" eb4399333c1420bb4b937d9973b225e45da2d1d5
cp e2e/gpu/tour-groundcover.gpu.ts "$capture_root/before/e2e/gpu/"
cp e2e/perf.spec.ts "$capture_root/before/e2e/"

capture_gpu() {
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh --max-hold 15 -- \
    pnpm exec playwright test -c playwright.gpu.config.ts e2e/gpu/tour-groundcover.gpu.ts --workers=1
}
capture_bytes() {
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" PERF_LOAD_QUALITY=high scripts/dev/heavy.sh --max-hold 15 -- \
    pnpm exec playwright test e2e/perf.spec.ts --grep 'bytes and time before the first input' --workers=1
}

(cd "$capture_root/before" && pnpm install --frozen-lockfile && pnpm build)
pnpm build
(cd "$capture_root/before" && capture_gpu slice3-before)
capture_gpu slice3-after
(cd "$capture_root/before" && capture_bytes slice3-before)
capture_bytes slice3-after
CI=1 KQ_E2E_PORT=5361 scripts/dev/heavy.sh --max-hold 15 -- \
  pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1

mkdir -p test-results/contribute/TASK-008 test-results/perf
cp -R "$capture_root/before/test-results/contribute/TASK-008/slice3-before" test-results/contribute/TASK-008/
cp "$capture_root/before/test-results/perf/load-slice3-before.json" test-results/perf/
```

Compare `desktop-medium-*.png` and `desktop-high-*.png` under
`test-results/contribute/TASK-008/{slice3-before,slice3-after}/`. Check the tread and banks at
Karlsberger Hof and Felsenpfad, the shore at the Weiher, the Quelle ravine and the palace terrace.
The 1789 Ehrenhof and 667 × 375 Niedrig touch stills are controls. Compare the Mittel and Hoch
route JSON with the paired Niedrig `phone-route.json`, `phone-quelle-recheck.json` and
`phone-bench.json` results. Use the all-pass peaks, rendered fps and frame/CPU p95, and report any
Hoch overruns alongside the baseline values. Compare `test-results/perf/load-slice3-*.json`
against the first-input budget. Review the tour flow through the deer photo, staff and spring.

## Slice 2 plan

_Status: approved 2026-11-25 (coordinator for the owner)_

**Approach:** Slice 2 dresses three present-day tour stops. A bench and wayfinder establish the
meeting point at Karlsberger Hof, a marker and low sandstone stones mark the Felsenpfad stop, and
a bench and wayfinder mark the Weiher stop. These are the three stops that lack the Quelle's
existing authored landmarks. Use three short-range scenery sets and the same simple silhouettes
on all presets. Keep the Quelle as a control and repeat the PR #26 phone timing there.

**Files to touch:**

- `src/systems/scenery/tour.ts` (new), `src/systems/scenery/sets.ts` — build and register the three present-day sets.
- `tests/scenery.test.ts`, `tests/world-data.ts` — test geometry limits and clearance using the shipped terrain and tour route.
- `e2e/gpu/tour-groundcover.gpu.ts` — frame the new props in six matched stills and repeat the live Quelle sample.
- `docs/ART-DIRECTION.md`, `docs/PERFORMANCE.md`, `docs/ACTION-RPG.md`, `docs/PRD.md` — record the landscape changes, limits and recheck procedure.
- `tests/voice-playback.test.ts` — update the base revision’s fixture to use the existing audio-ducking API so the build and tests can run.

**Steps:**

- [x] 1. Add three procedural sets. Place them on dry verges, outside the group path and gathering points.
  Reuse the kit, sign atlas and scenery streaming. Limit each set to two meshes and 150 triangles per pass.
- [x] 2. Test present-day registration, streaming ranges, geometry ceilings and clearance on the real route and terrain.
- [x] 3. Extend the GPU capture spec with the three prop views and three repeat Quelle walking samples.
  Keep the timing position, heading, warm-up and sample length from PR #26. Save average fps, frame and
  CPU p95, long-frame counts and all-pass peaks. Preserve the nine-scene phone bench.
- [x] 4. Run the four gates, update docs and record the pending capture commands.
- [ ] 5. On a real GPU, capture matched baseline and slice stills and timings. Replay PR #26's before/after
  Quelle timing and check the full tour, including the deer photo and spring interaction, on touch.

**Test plan:** Run `pnpm exec vitest run tests/scenery.test.ts`, then `pnpm typecheck`, `pnpm test`,
`pnpm validate` and `pnpm build`. Use `node --import tsx scripts/validate-content.ts` if the `tsx` CLI's
IPC socket is blocked. The coordinator will run `e2e/gpu/tour-groundcover.gpu.ts` on ANGLE Metal,
`e2e/perf.spec.ts` for first-input bytes and `e2e/tour-slice.spec.ts` for the story, each with one
worker under `scripts/dev/heavy.sh`. Compare matching views of Karlsberger Hof, Felsenpfad, Weiher,
Quelle, palace plateau and 1789 Ehrenhof on desktop and 667×375 touch with reduced motion.

**Risks:** The shipped DGM can put furniture on a slope, and trees may obscure a sign. Check the
props from walking height and keep the access corridor clear. A single p95 can miss sporadic long
frames, so keep the three repeat windows separate when comparing the reported 60 → 55.8 fps dip.

**Open questions:** None for implementation. GPU sightlines and the timing comparison require the coordinator's machine.

**Acceptance criteria coverage** (planned for this slice)

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Used and unused data | partial | Sample the shipped present-day DGM and compare placements with path and water masks. |
| 2. Higher terrain detail and data budget | follow-up | This slice uses the shipped DGM. |
| 3. Trees, bushes, flowers and props | partial | Benches, wayfinding and sandstone at three tour stops. Crowns and understory follow. |
| 4. Mobile frame rate and reduced version | partial | Small procedural meshes on Niedrig and a matched Quelle timing recheck on the coordinator's machine. |
| 5. Before/after GPU views in the PR | full | Six paired views on desktop and phone, pending hardware captures. |
| 6. Assets and credits | full | Existing scenery kit and generated sign lettering. |
| 7. Gates and docs | full | Four gates and design/performance docs. |

**Follow-up slices:**

- Add a 1 m DGM core covering the palace and tour, including the western approach outside the scan box. Verify seams, collision heights and first-input bytes.
- Place present-day trees at 1 m CHM crown maxima and check the forest LOD and shadow budgets.
- Place bushes and meadow flowers from canopy edges, slope and openness. Compare `ground2025.u8` with the current masks and check imagery rights before using orthophotos.
- Evaluate expanded Röntgenblick coverage and vegetation returns against the scan payload budget and data attribution.

## Slice 2 progress

- Branch `feat/task-008-slice2`, based on `1cebc82`. Slice 1 merged in PR #26 (`cd55ebb`).
- 2026-11-25 — Plan approved by the coordinator for the owner. The three stops have nearby dry verges on the shipped DGM. The sandbox has no browser or GPU access for the baseline or after captures.
- 2026-11-25 — Step 1 complete. Added the three present-day sets and used the existing collider and zone streaming. Positioned the Hof board outside the seven-metre gathering area.
- 2026-11-25 — Step 2 complete. All 24 scenery tests passed, including the shipped terrain, tour corridor and geometry checks.
- 2026-11-25 — Step 3 complete. Playwright discovers both GPU tests with `--list`. The spec keeps the
  original live positions and adds three individual Quelle samples with long-frame counts. A CPU check
  using the shipped canopy and deterministic tree placement found a tree on the first Weiher sign
  sightline, so the sign moved east and the still turns toward the bench and sign.
- 2026-11-25 — The first gate run exposed an outdated voice fixture in `1cebc82`. It now passes the
  existing ducking callback and checks its release on the source's `ended` event. The isolated
  Fläschchen suite passed after a timeout in the initial concurrent gate run.
- 2026-11-25 — Step 4 complete. Typecheck and build passed. `pnpm test --maxWorkers=4` passed all
  1,512 tests across 113 files, including the asset suite. The default worker count timed out in the
  Fläschchen suite. The worktree's dependency link pointed outside the write sandbox, so the gates
  used a local copy of the installed packages with pnpm's automatic dependency reinstallation
  disabled. `pnpm validate` encountered the `tsx` IPC `EPERM` block. The authorized
  `node --import tsx scripts/validate-content.ts` fallback passed with content warnings.
- 2026-11-25 — Step 5 is pending. GPU screenshots, phone fps and all-pass costs, first-input bytes
  and the tour playthrough need the hardware runs below.
- 2026-11-25 — The voice fixture was committed locally as `fb94556`. Staging the slice then failed
  with `EPERM` on the worktree’s `index.lock`. The implementation and task updates are in the worktree.

### Slice 2 coordinator capture commands

Run from this worktree on the same ANGLE Metal machine with Chromium installed. The baseline and
historical revisions use the same capture spec. The test-only voice fixture lets `1cebc82` build
with its existing audio API. The PR #26 revisions are the slice 1 plan's baseline and the PR's
implementation commit.

```sh
slice_dir=$PWD
capture_root=$(mktemp -d /tmp/kq-task-008-slice2.XXXXXX)

capture_gpu() {
  pnpm build && CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh -- \
    pnpm exec playwright test -c playwright.gpu.config.ts e2e/gpu/tour-groundcover.gpu.ts --workers=1
}

capture_baseline() {
  local label="$1" revision="$2"
  local checkout="$capture_root/$label"
  git worktree add --detach "$checkout" "$revision" || return
  cp "$slice_dir/e2e/gpu/tour-groundcover.gpu.ts" "$checkout/e2e/gpu/" || return
  if [ "$label" = slice2-before ]; then
    cp "$slice_dir/tests/voice-playback.test.ts" "$checkout/tests/" || return
  fi
  (cd "$checkout" && pnpm install --frozen-lockfile && capture_gpu "$label")
}

capture_baseline slice2-before 1cebc82
capture_gpu slice2-after
capture_baseline pr26-before 6d288275
capture_baseline pr26-after 8142438

mkdir -p test-results/contribute/TASK-008
for label in slice2-before pr26-before pr26-after; do
  cp -R "$capture_root/$label/test-results/contribute/TASK-008/$label" test-results/contribute/TASK-008/
done
```

```sh
capture_bytes() {
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh -- \
    pnpm exec playwright test e2e/perf.spec.ts --grep 'bytes and time before the first input' --workers=1
}

(cd "$capture_root/slice2-before" && capture_bytes slice2-before)
capture_bytes slice2-after
cp "$capture_root/slice2-before/test-results/perf/load-slice2-before.json" test-results/perf/
CI=1 KQ_E2E_PORT=5361 scripts/dev/heavy.sh -- pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1
```

Compare the six matching desktop and phone stills in `slice2-before` and `slice2-after` under
`test-results/contribute/TASK-008/`. The three prop stills use the same positions as slice 1 and
face 312°, 72° and 20°. Check the wayfinding and silhouettes at walking height and follow the
group on touch through the deer photo and spring interaction. Compare `phone-route.json`,
`phone-bench.json` and the first-input byte totals in `test-results/perf/` with the performance
budgets. Compare the original Quelle window in `phone-route.json` and each window in
`phone-quelle-recheck.json` for both revision pairs. Report rendered fps, frame and CPU p95,
frames over 25 ms and draw/triangle peaks. A p95 similar to the reported result can coexist with
missed renders, so retain the per-window long-frame counts.

## Slice 1 plan

_Status: approved (2026-11-25, coordinator for the owner)_

**Approach:** Give the present-day tour a sparse November ground-cover layer on Niedrig. Players see
the verge at walking height from the meeting at Karlsberger Hof to the spring. The shipped rasters
already distinguish these places. Within 14 m of the car-park stop canopy height ranges from 0 to
22.5 m, at the Felsenpfad it ranges from 12.25 to 31.75 m, and the nearest water cell is 9.7 m
from the Weiher stop. One procedural system can show open tussocks, sparser growth under the trees
and reeds at the waterline using data already in memory.

**Files to touch:**

- `src/world/vegetation/groundcover.ts` — define the low-tier profile, select plant geometry and cap instances.
- `src/systems/quelle/index.ts` — pass the existing hollow clearings to ground cover for today's spring.
- `tests/nature.test.ts` — exercise placement, limits and tier/era changes with a small terrain fixture.
- `e2e/gpu/tour-groundcover.gpu.ts` (new) — reproduce the six views and sample the phone profile.
- `docs/ART-DIRECTION.md` — describe the November verge and shore on Niedrig.
- `docs/PERFORMANCE.md` — record the measured cost on the route and the final caps.

**Steps:**

- [ ] 1. Capture the six baseline views below on unchanged game code. Record the nine-scene bench,
  first-input bytes and phone frame times. Check the group’s path, deer sightline and trough at walking height.
- [x] 2. Add a `today`/Niedrig profile to `GroundCover`. Start with a 14 m radius, roughly one
  candidate per square metre, and caps of 128 sparse grass tufts, 16 reed clumps and 8 meadow flowers.
  Reuse the distance tuft, procedural reed/flower meshes, view culling and shadow/reflection exclusions.
  Together these caps cost at most three draws and 12,000 triangles for the layer, with zero new asset requests.
- [x] 3. Use the existing seeded scatter, canopy, slope, path and water weights. Keep the gravel tread
  clear, favour dry grass on open verges, allow occasional flowers in clearings and confine reeds to the
  Weiher shore band. Use the Quelle’s existing clearing circles around its steps and trough. Check cold
  start, teleport, graphics changes and the shift to 1789 for stale instances.
- [ ] 4. Test deterministic placement, the clear trail and spring, positive shore placement, instance
  ceilings and switching low → high → low and today → 1789 → today. Walk the tour on touch through the
  deer photo and spring interaction. Compare the six views, including reduced motion on the phone.
- [ ] 5. Run the gates and repeat the baseline measurements. Reduce density, radius or reed count if the
  phone misses budget. Record the measured settings and attach matched before/after GPU pairs to the slice PR.

**Test plan:**

- Run `pnpm exec vitest run tests/nature.test.ts tests/perf-culling.test.ts tests/assets.test.ts`,
  then `pnpm typecheck && pnpm test && pnpm validate && pnpm build`.
- Run `scripts/dev/heavy.sh -- pnpm exec playwright test e2e/perf.spec.ts --workers=1` and
  `scripts/dev/heavy.sh -- pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1` separately.
  Use `PERF_LABEL=before` and `PERF_LABEL=after` on the corresponding builds.
- Use `scripts/dev/heavy.sh -- pnpm exec playwright test -c playwright.gpu.config.ts e2e/gpu/tour-groundcover.gpu.ts --workers=1`
  on both builds. For matched stills use `/?notitle&nosave&fresh&manual&q=low&cam=third`,
  `kq.teleport(x, z, yaw, -6)`, 3.6 m zoom, 80° FOV and identical clock/step count. Keep pairs
  under `test-results/contribute/TASK-008/`. Use the same positions with `scripts/dev/shots.mjs` for SwiftShader.

  | View | Era | x, z | Yaw | Inspect |
  | --- | --- | --- | ---: | --- |
  | Karlsberger Hof car park | today | 524, −770 | 253° | Open verge and first turn onto the track |
  | Felsenpfad | today | 683, −596 | 90° | Sparse understory and clear sight of the sandstone |
  | Weiher | today | 897.2, −845.3 | 0° | Reeds on the near bank and open water behind |
  | Quelle | today | 1059, −833 | 270° | Ground cover stops at the furnished hollow |
  | Palace plateau | today | 1216, −1114 | 270° | Cost and placement away from the tour |
  | Ehrenhof | 1789 | 1138, −1120 | 90° | Historic control after the era switch |

- For timing use live play on a real GPU at 667×375 landscape, touch, Niedrig, power saving off and
  the 60 fps cap. After warm-up, measure rendered fps and average/p95 frame and CPU times while walking
  and turning. Target 60 fps (16.7 ms/frame) and ≤8 ms CPU. Check all-pass peaks ≤300 draws and ≤1.5 M
  triangles at the four stops and in every `kq.bench()` scene, and ≤20 MB before first input via the load test.

**Risks:** Clusters can fill their cap on one side of the camera or appear abruptly on a turn.
Check both directions along the bank. Hoch already has documented peaks of 1.80 M triangles at
Felsenpfad and 1.78 M at Quelle (§3.5 of the performance guide). Keep the added geometry on Niedrig
and report those higher-tier baselines separately.

**Open questions:** None for slice 1.

**Acceptance criteria coverage** (planned for this slice)

| Epic criterion | Coverage | Evidence or remaining work |
| --- | --- | --- |
| 1. Used and unused data | partial | Corrected the building mask, scan classes and Niedrig scenery above. Audit the remaining layers in their slices. |
| 2. Higher terrain detail and data budget | follow-up | The 1 m terrain core needs its own mesh, height-sampling and byte checks. |
| 3. Trees, bushes, flowers and props | partial | Land-cover-driven meadow flowers reach Niedrig. Crowns, bushes and built props follow. |
| 4. Mobile frame rate and reduced version | full | Capped ground cover on Niedrig, measured on the route and nine bench scenes. |
| 5. Before/after GPU views in the PR | full | Six paired views, including the plateau and Ehrenhof controls. |
| 6. Assets and credits | full | Procedural geometry, existing credited data and a passing asset suite. |
| 7. Gates and docs | full | All four gates and measured updates to both guides. |

**Follow-up slices:**

- Add a 1 m DGM core covering the palace and tour, including the western approach outside the scan box. Verify seams, collision heights and first-input bytes.
- Place present-day trees at 1 m CHM crown maxima and check the forest LOD and shadow budgets.
- Place bushes and meadow flowers from canopy edges, slope and openness. Compare `ground2025.u8` with the current masks and check imagery rights before using orthophotos.
- Dress the tour stops with benches, wayfinding and sandstone features in the scenery kit, with cheap silhouettes on Niedrig.
- Evaluate expanded Röntgenblick coverage and vegetation returns against the scan payload budget and data attribution.

## Slice 1 progress

- Branch: `feat/task-008-landscape`
- 2026-11-25 — Slice 1 planned on game revision `6d288275`. Baseline captures and timings are pending
  before implementation. The planning session excluded browser use.
- 2026-11-25 — Step 1 deferred to the coordinator. Build `6d288275` for the baseline and run the same
  capture spec against both builds. The implementation sandbox has no browser, preview server or GPU access.
- 2026-11-25 — Step 2 complete. Niedrig uses the existing 10-blade tuft and procedural flowers and
  reeds, with nearby tiles filled first. `pnpm typecheck` passed.
- 2026-11-25 — Step 3 complete. Added a tread cutoff for Niedrig and wired the existing Quelle
  clearings for today. Nature, culling and asset checks passed (41 tests), including the renderer-free
  cold start, teleport and tier/era checks. A CPU placement check with the shipped rasters found
  grass at Karlsberger Hof and reeds at the Weiher from the planned camera positions.
- 2026-11-25 — Step 4 unit coverage and GPU spec are in place. Playwright's `--list` discovered
  both tests in `tour-groundcover.gpu.ts`. Desktop and phone screenshots, the tour e2e and the
  touch playthrough through the deer photo and spring interaction are pending.
- 2026-11-25 — Step 5 local gates: `pnpm typecheck`, `pnpm test` (110 files, 1,507 tests) and
  `pnpm build` passed. `pnpm validate` failed to open the `tsx` IPC socket (`EPERM`). The same
  validator passed with `node --import tsx scripts/validate-content.ts`, with content warnings.
  `mc validate` passed. The matched GPU runs, `e2e/perf.spec.ts`, first-input bytes and the phone
  frame-time and all-pass budget checks are pending. The documented layer ceiling is calculated
  from mesh indices and instance limits.
- 2026-11-25 — `git add` succeeded. `git commit` was blocked by `EPERM` creating the worktree's
  `index.lock`. Commit the slice with `feat(render): add present-day ground cover on low`,
  `Refs: TASK-008` and the requested co-author trailer.

### Slice 1 coordinator capture commands

Run from the implementation worktree with Chromium installed. The detached worktree keeps the
baseline's production build at `6d288275`. Copying the new capture spec adds the same test harness
to that checkout. Keep the two runs on the same machine and GPU.

```sh
capture_task008() {
  pnpm build || return
  local capture_status=0
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh -- \
    pnpm exec playwright test -c playwright.gpu.config.ts e2e/gpu/tour-groundcover.gpu.ts --workers=1 || capture_status=$?
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" PERF_BASELINE=0 scripts/dev/heavy.sh -- \
    pnpm exec playwright test e2e/perf.spec.ts --workers=1 || capture_status=$?
  CI=1 KQ_E2E_PORT=5361 PERF_LABEL="$1" scripts/dev/heavy.sh -- \
    pnpm exec playwright test e2e/tour-slice.spec.ts --workers=1 || capture_status=$?
  return "$capture_status"
}

task_dir=$PWD
baseline_dir=$(mktemp -d /tmp/kq-task-008-before.XXXXXX)
git worktree add --detach "$baseline_dir" 6d288275
cp e2e/gpu/tour-groundcover.gpu.ts "$baseline_dir/e2e/gpu/"
(cd "$baseline_dir" && pnpm install --frozen-lockfile && capture_task008 before)
capture_task008 after

mkdir -p test-results/contribute/TASK-008 test-results/perf
cp -R "$baseline_dir/test-results/contribute/TASK-008/before" test-results/contribute/TASK-008/
cp "$baseline_dir/test-results/perf/bench-before.json" "$baseline_dir/test-results/perf/load-before.json" test-results/perf/
```

Run the companion SwiftShader stills against the two built checkouts. The helper uses the default
third-person rig and the SwiftShader Niedrig preset on a fresh session.

```sh
swift_task008() {
  VIEWS='[{"name":"01-karlsberger-hof","x":524,"z":-770,"yaw":253,"pitch":-6},{"name":"02-felsenpfad","x":683,"z":-596,"yaw":90,"pitch":-6},{"name":"03-weiher","x":897.2,"z":-845.3,"yaw":0,"pitch":-6},{"name":"04-quelle","x":1059,"z":-833,"yaw":270,"pitch":-6},{"name":"05-palace-plateau","x":1216,"z":-1114,"yaw":270,"pitch":-6},{"name":"06-ehrenhof","era":"1789","x":1138,"z":-1120,"yaw":90,"pitch":-6}]' \
  scripts/dev/heavy.sh -- bash -euc '
    mkdir -p "$1"
    node node_modules/vite/bin/vite.js preview --port 5361 --strictPort --host 127.0.0.1 &
    preview_pid=$!
    trap "kill $preview_pid 2>/dev/null || true" EXIT
    curl --fail --silent --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:5361/ >/dev/null
    node scripts/dev/shots.mjs "$1" http://127.0.0.1:5361/
  ' bash "$1"
}

(cd "$baseline_dir" && swift_task008 "$task_dir/test-results/contribute/TASK-008/before/swiftshader")
swift_task008 "$task_dir/test-results/contribute/TASK-008/after/swiftshader"
```

Compare `desktop-*.png`, `phone-reduced-motion-*.png`, `phone-route.json` and `phone-bench.json`
under each capture label. Review `test-results/perf/load-<label>.json` for first-input bytes. On
touch, follow the group, take the deer photo and touch the spring. Check the gravel tread, the deer
sightline and the trough at walking height, then look both ways along the Weiher's bank. Record
the results and pair the six GPU views for the slice PR.

## Notes
- `pnpm prepare-data` needs the sister repo checked out next to this one; external contributors cannot run it.
- Wrap GPU screenshot runs in `scripts/dev/heavy.sh` if present.
%% mc-links: [[SPR-001]] %%
