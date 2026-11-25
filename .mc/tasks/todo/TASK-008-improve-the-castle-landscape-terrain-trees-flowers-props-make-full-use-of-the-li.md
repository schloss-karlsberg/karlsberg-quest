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

### What's used now

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

_Status: draft_

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
- [ ] 2. Add a `today`/Niedrig profile to `GroundCover`. Start with a 14 m radius, roughly one
  candidate per square metre, and caps of 128 sparse grass tufts, 16 reed clumps and 8 meadow flowers.
  Reuse the distance tuft, procedural reed/flower meshes, view culling and shadow/reflection exclusions.
  Together these caps cost at most three draws and 12,000 triangles for the layer, with zero new asset requests.
- [ ] 3. Use the existing seeded scatter, canopy, slope, path and water weights. Keep the gravel tread
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

## Progress

- 2026-11-25 — Slice 1 planned on game revision `6d288275`. Baseline captures and timings are pending
  before implementation. The planning session excluded browser use.

## Notes
- `pnpm prepare-data` needs the sister repo checked out next to this one; external contributors cannot run it.
- Wrap GPU screenshot runs in `scripts/dev/heavy.sh` if present.
%% mc-links: [[SPR-001]] %%
