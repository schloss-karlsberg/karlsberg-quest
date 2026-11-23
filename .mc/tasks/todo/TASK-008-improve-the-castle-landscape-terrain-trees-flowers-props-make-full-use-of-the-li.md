---
id: TASK-008
aliases:
- TASK-008
title: 'Improve the castle landscape: terrain, trees, flowers, props; make full use of the LiDAR data'
slug: improve-the-castle-landscape-terrain-trees-flowers-props-make-full-use-of-the-li
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- 3d
- world
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# Improve the castle landscape: terrain, trees, flowers, props; make full use of the LiDAR data

> Core dev team task (not community).

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
  uses only `chm` (pooled) and the historic maps; local relief is re-derived from the 2 m terrain.
  The 1 m CHM could place individual trees where real crowns are; openness / SVF could drive
  moss, litter and flowers; `ortho` could guide meadow vs forest edges (check its licence first).
- **`ground2025.u8`** exists in the sister terrain folder next to `ground.u8`; the game reads only `ground.u8`.
- **Point cloud** outside the palace box and non-ground classes (vegetation, buildings) are unused.
- **Props** on the low tier: nothing at all; the landscape there is terrain + trees only.

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

## Notes
- `pnpm prepare-data` needs the sister repo checked out next to this one; external contributors cannot run it.
- Wrap GPU screenshot runs in `scripts/dev/heavy.sh` if present.
