# Sister-repo inventory for the Karlsberg Quest GDD

Research date 2026-11-02, read-only. Paths are relative to the parent directory that holds the sibling repos.
Sources read: `saar-lidar-explorer/{README.md, PRD.md, CLAUDE.md, docs/data-contract.md, app/README.md, app/package.json, app/src/**, scripts/release/RELEASING.md, research/03-archaeology-visualization.md}`, `saar-lidar-explorer/app/public/data/{pois.geojson, overall/manifest.json, shared/karlsberg1789/index.json}`, `saar-lidar-explorer/schloss-karlsberg/{README.md, package.json, docs/architecture.md, docs/explorer-integration.md, viewer/src/*, viewer/public/terrain/meta.json, model/catalogue.json, research/01, 05, 07, 09 (+ grep of 02, 03, 06)}`, `saar-lidar-detect/{IDEA.md, docs/PRD.md, pyproject.toml}`.

---

## 1. Tech stack and reusable engine modules

### 1.1 Stack (both web apps share it, exact pins)

| | Explorer (`saar-lidar-explorer/app`) | Castle viewer (`schloss-karlsberg`) |
|---|---|---|
| Language | TypeScript **7.0.2**, ES modules, `allowImportingTsExtensions` | same |
| Build | **Vite 8.3.5**, pnpm (developed with Node 24 / pnpm 12) | same |
| 3D | **three.js 0.187.0 (r187)**, custom WebGLRenderer engine (GLSL3 shaders), no framework (no React) | three 0.187.0 + **three-mesh-bvh 0.9.16** (walk collisions) |
| Map | Leaflet 1.9.4 + proj4 2.22.0 (EPSG:25832 ⇄ WGS84) | — |
| UI | hand-written DOM + CSS; lil-gui 0.21.0 for early controls; German strings inline (**no i18n framework**) | hand-written DOM panel (`viewer/src/ui.ts`) |
| Other deps | qrcode-generator 2.0.4; dev: tsx, pngjs, @vitejs/plugin-basic-ssl 2.3.0 | dev: @gltf-transform 4.5.1, meshoptimizer 1.3.0 (export only) |
| Tests | **vitest 5.0.5**, 44 test files in `app/tests/` (pure modules unit-tested); pipeline pytest; `verify.sh` gate; browser checks via `window.sle.step(n)` | vitest, **209 tests**; hooks `window.skb` (`goto`, `step`, `gpuBench`, `handover`, `backUrl`) |
| Data pipeline | Python 3.12 via uv (rasterio, numpy, rvt-py, Pillow, pyproj, laspy, lxml, scikit-image, shapely) | generator in TS (`model/src`), `scripts/prepare-terrain.py` |
| Size | ≈ 24.6 k lines of TS in `app/src` | viewer ≈ 1.65 k lines; generator `model/src` (layout/exterior/interior/site) separate |
| Ports | dev 5240 (CLAUDE.md), `serve:local` 5250, `dev:lan` HTTPS 5243 | dev **5260**, preview 5261 |
| Hosting | **GitHub Pages, org Open-Kirrberg** (user decision 2026-11-02, reverses the old "local only" non-goal): app at `/saar-lidar-explorer/`, castle viewer at `/saar-lidar-explorer/castle/`; data in two Pages repos `saar-lidar-data` (AOI overall w/o tiles, `pois.geojson`, `shared/` = 1789 recon, `castle-viewer/terrain/`) and `saar-lidar-data-2` (Leaflet XYZ ≤ z17, 3MF print). Code MIT. | built into the same Pages workflow |

Hosting constraints (RELEASING.md): a Pages site ≤ **1 GB**, each file < 100 MB, push ≤ 2 GB; the team aims ≤ 900 MB per data repo. `overall` = 1.47 GB, which is why data is split. Data roots are build-time config: `VITE_DATA_URL`, `VITE_PRINT_URL`, `VITE_AOIS`, `VITE_VIEWER_URL` (`off` hides the handover), castle `VITE_EXPLORER_URL`. Cross-origin data needs CORS (Pages provides it). **A game can read the same public data roots without hosting its own copy.**

### 1.2 Engine modules worth reusing (explorer `app/src/`)

| Module | What it gives a game | Coupling |
|---|---|---|
| `terrain/Terrain.ts` (1 245 lines) + `levels.ts`, `quadtree.ts`, `budget.ts`, `skirts.ts`, `TerrainChunk.ts`, `TerrainMaterial.ts`, GLSL | Quadtree streaming over a 5-level pyramid (1/2/4/8/16 m), screen-space-error LOD, job queue, LRU eviction under a GPU budget (600 MiB default, 200 MiB "Mobil"), skirts, per-pixel normals from 1 m heights, relief modes/blends/presets, canopy (DSM), raycast, collision height | **Moderate.** `class Terrain extends Object3D`, constructor `(manifest, baseUrl, DecodePool)`; imports only `data/*` (manifest, grid, lowpass) and its own siblings. Pure helpers (`levels`, `quadtree`, `budget`, `skirts`, `relief`) have no DOM. Realistically extractable as a unit together with `src/data/` (manifest loader, Terrarium decode, worker `DecodePool`). |
| `terrain/HeightQuery.ts` | CPU bilinear heights + ray marcher (`heightAt`, `heightAtDisplayed`) — the basis for "player within X m", ground snapping, quest triggers | low (pure-ish) |
| `controls/DroneController.ts` (441 lines) | Drone/free-cam with terrain following, AGL speed scaling, pointer lock + drag-look, gamepad, `flyTo`, `setPose` | Low: imports three, `geo` (utmToWorld), `ui/keys.isTyping`; constructor `(camera, dom, groundProvider, origin, opts)` |
| `controls/TouchController.ts`, `touchGestures.ts` (pure), `touchContext.ts` | Google-Earth-style map gestures (pan with anchor, pinch 5 m–30 km, twist, tilt, double tap, inertia, 600 ms long press) | Low: depends on `DroneController` + a `GroundProvider` |
| `geo.ts` | proj4 EPSG:25832 ⇄ WGS84, world ⇄ UTM, grid convergence | none |
| `state.ts` | `Store<AppState>` with keyed subscriptions + URL-hash sync | low |
| `ui/tour.ts`, `TourGuide.ts` | 7-stop guided tour with relief preset per stop, hedged text, reduced-motion jump — closest existing thing to a "quest path" | medium (UI) |
| `ui/mobileMode.ts`, `mobile.ts`, `sheet.ts` | *Einfach* layout (bottom bar, bottom sheets), automatic Mobil quality, WebGL context-loss → reload | medium (DOM) |
| `ui/a11y.ts`, `modalKeys.ts`, `shortcuts.ts` | focus rings, modal focus trap, single shortcut table (test checks every key) | low |
| `measure/*` | distance, area, 0.5 m height profile on 1 m DTM — the "miss die Wallhöhe" quest mechanic | `MeasureTool` is UI-bound; `geometry.ts`, `profile.ts`, `model.ts` pure |
| `pois/pois.ts` (pure), `reconstruction/recon.ts` (pure: index parsing, AOI offset, `buildViewerUrl`, `backTargetUrl`), `ReconLayer.ts` (GLTFLoader + meshopt) | Load POIs and the 1789 light model | low/moderate |
| `locate/*` | *Mein Standort* (geolocation, privacy: never stored, share/hash suppressed within 1 km) — relevant for an optional real-world trail mode | moderate |
| `pointcloud/*` | `sle-pts-v1` 100 m tiles, own ShaderMaterial, budgeted LOD, *Röntgen* clip — the "Röntgenblick" skill | moderate |
| `main.ts` (323 lines) | Wiring, frame loop, `AppContext` exposed as **`window.sle`** (`terrain`, `controller`, `camera`, `scene`, `renderer`, `store`, `flyTo`, `pickAt`, `step`, `terrainStats`, `touch`, `setNavigationMode`), event `sle:ready` | High — app-specific wiring |

**Castle viewer modules (`schloss-karlsberg/viewer/src/`):** `controls.ts` (250 lines) = **Fliegen + Gehen**: first-person walk, gravity 9.81, eye 1.65 m, capsule radius 0.3 m, step height 0.35 m (`WALK_STEP_MAX`, shared with the generator's reachability test), jump, Shift fast, collision against a **BVH of collider meshes** (three-mesh-bvh). Keyboard + mouse only (pointer lock on dblclick, right-drag look). **No touch support in the castle viewer.** `handover.ts` (pure, tested) = URL pose in/out. `terrain.ts` = 1789 or 2025 1 m heightfield. `ui.ts` = "Gehe zu" selector grouped Ansichten/Eingänge/Räume/Gebäude, time of day, shadows, confidence colours, roofs, interiors, hypotheses toggle. Generator API (`model/src`, documented in `docs/architecture.md` §4–5): `loadSite`, `layoutBuilding`, `buildExterior(b, ctx)`, `buildInterior(b, ctx)`, `buildSite(spec, ctx) → { group, colliders, pois }`; every object named `<buildingId>/<part>` with `userData { buildingId, part, lod, confidence, tag, collider, roomId }`. Pure layout code has no three import and is unit-tested.

### 1.3 How a game could use them — what the docs recommend

- **Neither app is published as a library.** Both are `"private": true` packages with no `exports`; the explorer is a single SPA wired in `main.ts`. There is no shared engine package yet. A game "importing" modules today means a path/alias import or a copy — the IDEA.md rule is **"interfaces, not forks"** and "write requests to those projects instead of editing them" (their agents are active).
- **Documented integration path = data contracts + URL handover**, not shared code:
  - `docs/data-contract.md` (v2) is "binding" between pipeline and app; additive optional keys only; any change needs a PRD changelog entry. A game reading the same `manifest.json` / chunks / `shared/karlsberg1789/` is the supported route.
  - Explorer ⇄ castle viewer handover by URL (same tab, `location.assign`): `<viewer>?src=explorer&E=&N=&h=&heading=&pitch=&mode=fliegen|gehen&back=<url-encoded explorer URL incl. hash>`; back = replace the first five hash fields `E,N,h,heading,pitch`. True heights (DHHN2016), heading ° clockwise from UTM grid north, pitch negative = down, 0.1 m / 0.1° rounding. `back` validated against open redirect (local hosts or same origin in the public build). A game could use the same protocol to send the player into the castle viewer and receive them back — but it then loses its own HUD/quest state during the visit (state would have to live in localStorage and be re-read on return).
  - PRD decision F19 explicitly kept the explorer and castle viewer **separate**: "different terrains (2025 ruins vs. 1789 ground), the 5× exaggeration, 3–4.5 M triangles and walk physics would compromise both apps".
- **Realistic options for the GDD tech plan** (IDEA §6 a/b/c):
  - (c) **Separate app that imports modules by path alias + reads public data** is the lowest-friction start, but pins the game to another repo's internals (no API stability promise; e.g. `MarkerManager.openForm` is private, Q-23).
  - (a) **Shared package extraction** (`terrain` + `data` + `controls` + `geo` + castle `controls`/`handover`) is cleaner but must be negotiated with the explorer owner (they have a module-ownership/skill-driven process and one commit per roadmap item).
  - (b) **Game as an explorer mode** collides with active development and the explorer's "Sie"-form, heritage-first UI.
- **Coordinate conventions to adopt verbatim:** EPSG:25832, local origin, three world `x = E − E0, y = h, z = −(N − N0)`; never raw UTM in float32; recon model frame E0 381000 / N0 5465000 (karlsberg AOI); overall AOI origin 378000 / 5460000 → recon offset (3000, 0, −5000). Exaggeration rule `y' = hRef + (y − hRef)·exag`.

---

## 2. Data assets actually present

### 2.1 Terrain AOIs (`app/public/data/<aoi>/`)

| AOI | Extent (EPSG:25832) | Size | Notes |
|---|---|---|---|
| `overall` (default) | E 378000–384000 / N 5460000–5468000 = **6 × 8 km** (48 km²), 6000 × 8000 cells at **1 m** | 1.4 GB local (relief 252 MB, xyz 739 MB, point clouds 115 MB, vectors 70 MB, dsm 68 MB, ortho 61 MB, dtm 48 MB, levels 42 MB, models 30 MB, hist_1935 26 MB, hist_1840 24 MB, candidates 6.5 MB) | heights 222.5–385.9 m; contract v2 with levels 1–4 |
| `karlsberg` | 381000–384000 / 5465000–5468000 = 3 × 3 km | 305 MB | dev/test AOI |
| `fixture` | synthetic | 14 MB | `?aoi=fixture`, used when no data |

Format: 500-cell chunks; heights as **Terrarium PNG** (≈ 4 mm precision, 502² incl. apron, decode without colour management); relief layers u8 PNG/WebP; images (`rgb`) WebP/JPEG.

Layers in `overall`: `hillshade, slope, slrm (Lokales Relief), svf, opns_pos, opns_neg, vat, chm (canopy height 0–40 m), mask (RLP/filled), bldg (building mask), ortho (DOP20, 1000 px/chunk = 0.5 m), hist_1840 (Bayer. Positionsblätter 1836–41, shows "Ruine Carlsberg"; georeferencing off by tens of metres in places — the castle research corrected −50 m E locally), hist_1935 (TK25 1935–40)`. Plus live local relief in-shader. Height source: LVGL ALS 2025 DGM1/DOM1 (flown ~Feb 2025, leaf-off) + RLP 2022 fill on 3 tiles.

### 2.2 Vectors, models, POIs, candidates, point clouds

- **OSM** draped: 4 803 features in overall (roads, tracks, paths, waterways, disused rail, walls/ditches), baked heights.
- **Flurstücke**: 66 653 dedup lines + labels + parcel polygons (offline lookup).
- **LoD2 buildings**: **20 038** buildings, one glb per level-0 chunk, clay shader, streamed within 2 km.
- **POIs** `pois.geojson`: **44** sites (types: other 14, garden 6, palace 5, bunker 5, burial_mound 4, castle 3, cave 3, boundary_stone 2, mine 2; confidence high 14 / med 25 / low 5). Each has `id, name, name_en, type, confidence, source (URL), sources[], note`. Notable for quests: Hauptschloss ruins, Orangerie, Eiskeller, Bärenzwinger, Herzogsterrassen (bear cages 1786), Schwanenweiher, Tosbecken/Kaskade, Tschifflik, Eremitage, Merburg, Rabenhorst barrows (9), Totenstein menhir, Hohenburg + Vauban fortress, Schlossberghöhlen, Römermuseum Schwarzenacker, Klosterruine Wörschweiler, 5 bunkers, old adit, sand pit, "Homburg Innenstadt (Luftangriffe 1944/45 – Bombentrichter?)", Napoleon-Stein, 3 low-confidence "mögliche Höhenbefestigung" hills.
- **Relict candidates** (overall): **3 276** (pit 439, mound 853, linear 1 502, rect 16, platform 466), rule-based, precision unknown; known-site recall 8/18 within 30 m. Now published in the public data repo as unverified hypotheses (user decision 2026-11-02). IDEA.md: use "very carefully or not at all".
- **Point clouds** `sle-pts-v1`: 3 focus areas of 1 km² (karlsberg-schloss 381700/5465600–382700/5466600, homburg-schlossberg, merburg), 100 m tiles, ≈ 4 M points per area (~4 pts/m²; under canopy only ~1.1–1.2 ground pts/m²), classes + `agl` baked. Point memory ≈ 60 MB GPU + 60 MB CPU at default budget, not counted in the terrain budget (Q-18).
- **3D print** series (F21, in progress): 3MF tiles 1:8500 and detail 1:2125 — physical-board tie-in.

### 2.3 Palace reconstruction (1789, hypothesis)

- **Light layer `sle-recon-v1`** at `app/public/data/shared/karlsberg1789/`: `buildings.glb` **4.6 MB** (meshopt, 340 k triangles, 91 building nodes + 8 `site:` nodes, vertex colours, per-vertex `_CONF` 0/1/2, no textures/interiors/trees; base skirts ≥ 0.5 m below the 2025 DTM), `footprints.geojson` (91 polygons), `index.json` (**91 building entries: confidence high 3 / med 10 / low 78**, `eaves_h`, `ridge_h`, `bbox_local`, ≤ 3 `sources_de` each; anchor = Corps de logis centre E 382262.7 / N 5466126.3, enter radius 300 m; bbox E 381255–383159 / N 5464622–5467054). Node `extras.id` is the stable id (GLTFLoader strips `:`). Disclaimer string: "Hypothetische Rekonstruktion, kein Befund. Schauen, nicht graben."
- **Full catalogue** `schloss-karlsberg/model/catalogue.json` v2: **101 buildings** (confidence low 87 / med 10 / high 4), **32 terrain features** (court, terrace, scarp, avenue, rondell, pond, island, dam, cascade, moat, enclosure, well, wall, parterre, path), **10 open questions**. Interiors: **7 buildings "detailed"** (+2 "simple"), **114 rooms** with ids, `name_de`, function, storey, polygon, finish, evidence tag:
  - KB-B01 Corps de logis (19 rooms: Schreibkabinett/Schlafzimmer des Herzogs, Gelber Salon, Vestibül, Prunktreppenhaus, Audienzzimmer, Paradeschlafzimmer, Salon/Festsaal, Garde-/Vorsaal …)
  - KB-B02 Südflügel/Herzogin (27: Silberkammer, Großer/Kleiner Speisesaal, Offizierszimmer, Herzogin's apartment, Dienerzimmer …)
  - KB-B03 Nordflügel/Herzog (27: **Wachstube**, Offizierszimmer der Wache, Kavalierszimmer, Gesindestube, Registratur, Bibliothek des Herzogs …)
  - KB-B04 Sammlungsflügel (11: **Waffensammlung, Büchsenmacherei**, Kanzlei, Wachstube am Tor, Bibliothek, Naturalienkabinett, Physikalisches Kabinett, Kupferstichkabinett?)
  - KB-B05 Küchenbau (12: Hofküche, Konditorei, Spülküche, Bäckerei, Wohnung des Mundkochs, servants' Kammern)
  - KB-B06 Galerie (3: Bildergalerie — the hidden-trapdoor legend)
  - KB-B10 Orangerie (15: Sommellerie/wine cellar, Vorratskeller, Pfeilersaal, Gärtnerstube, Logis der Kavaliere)
- Notable named buildings in the index (game locations): Lazarett, Waffenschmiede, Chevau-leger-Kaserne, Kaserne mit Exerzierplatz, two Kasernen opposite the Lazarett, Jägerhaus (later Kaserne der Jäger und Scharfschützen), Wachhäuser, Zwinger (Hundezwinger?), Eiskeller, Brauerei und Wirtshaus, Torfschuppen ×3, Schäfereien, Carlsdorf houses 1–5 (workers' hamlet), Baumagazin (only surviving building = Karlsberger Hof), Fasanerie, Hirschwürzloch; Karlslust: Amphitheater with 19 half-round cages ("Bärenzwinger"), Menagerie/Herzogsterrassen with iron bear boxes, Tschifflik, "Altertum" (artificial ruin), Hymenäostempel, Point de Vue.
- **Evidence model**: tags `D` (documented), `D->` (documented at a comparable), `I` (inferred), `N` (period norm), `U` (unknown), `HMS` (numbers from the Historisches Museum Saar 2022 model, **numbers only, no frames/textures — ©**). Confidence high/med/low per building and per vertex. Every plan sheet carries "Hypothese – Stand <date>". Confidence colours: explorer Okabe–Ito hoch `#009E73` / mittel `#E69F00` / niedrig `#CC79A7`; viewer `#3f9b4f` / `#e0a526` / `#c8452f`.
- **Castle viewer terrain** `viewer/public/terrain/` (48 MB, also published as `castle-viewer/terrain/`): `dtm1789.f32` (1789 terrain hypothesis) + `dtm2025.f32`, 2150 × 2650 at 1 m (E 381150–383300 / N 5464500–5467150), `ground.u8` 2 m land-cover classes (meadow, lawn, …). 1789 vs 2025 differ by up to 2–3 m around the ruin. Textures: 8 Poly Haven CC0 sets, 66 MiB (fetched by script, not in git).
- **Plans**: 30 sheets (Lagepläne, Grundrisse, Ansichten, Schnitte) as SVG/PDF in `plans/out/` — candidate collectibles.
- **Walk entry points**: entrance POIs with generator-computed `walkable` flag; "Gehe zu" lists views, entrances, rooms, buildings. `mode=gehen` starts at the nearest reachable entrance within 200 m.

### 2.4 Performance figures documented

- Explorer quality presets measured synchronously on one Apple machine: Hoch 2.5–3.1, Mittel 1.9–2.5, Niedrig 1.5–2.4 ms/frame; *Mobil* 1.52 ms/frame (emulated). Real phone never tested (Q-22). GPU budget 600 MiB (Mobil 200 MiB); worst case "Luftbild × Relief + buildings + Wald voll" ≈ 548 MiB (Q-12).
- Recon light layer adds +3–8 ms GPU over the palace in the explorer.
- **Castle viewer is heavy**: view-west 6.5 ms GPU, 820 draw calls, **4.36 M triangles** (trees +1.4 M), **JS heap 445 MB** (README fix round 1). Not mobile-tuned; walk feel / real frame pacing never verified in a visible tab.
- `dist/` of the explorer ≈ 2 MB; data never copied into dist.

### 2.5 URL / state handover parameters

- Explorer hash: `#E,N,h,heading,pitch,layer,overlay,opacity,forest,exag,sunAz,sunEl,…,presetId` (fields 10–14 added in v1.0; old 5/6/9/13-field links load). Never contains markers/candidates; pose suppressed within 1 km of the user's location.
- `?aoi=overall|karlsberg|fixture`.
- Castle viewer query: `?src=explorer&E&N&h&heading&pitch&mode=fliegen|gehen&back=` (see §1.3).
- localStorage keys in use (avoid collisions): `sle.settings.v1`, `sle.markers.v1`, `sle.candidates.v1.<aoi>`, `sle.vectors.v1`, `sle.reconstruction.v1`, `sle.pointcloud.v1`. Same origin on GitHub Pages (`open-kirrberg.github.io`) means a game hosted there shares localStorage with the explorer — namespace keys (e.g. `kq.*`).

---

## 3. Style of the explorer PRD.md (to match)

- Title `# <Project> — Living PRD`; a blockquote status line: version, what is done, open items (with Q-ids), "**Last updated:** date · **Owner:** <name>"; second blockquote: "This is a *living* document. Every decision, open question and change is tracked here (see Decisions Log and Changelog). Detailed research lives in `research/` — this PRD only holds the conclusions." Then `---`.
- Numbered sections: `## 1. Vision` (prose + **Focus areas** bullets) · `## 2. Goals & Non-Goals` (numbered goals with bold lead; non-goals bullets, dropped ones struck through `~~…~~ → dropped <date> (Fx): reason`) · `## 3. Users & Use Cases` (primary user line + table `| # | Use case |` with U1…U5) · `## 4. Data Sources` (table Data | Source | Use | Status with ✅) · `## 5. Technical Approach` (`> Detail: research/0x` pointer, subsections 5.1–5.8) · `## 6. Features (prioritized)` (subsections MVP (P0), P1, Phase 2, Final polish → v1.0, Phase 3…; tables `| ID | Feature |` with ids F1…F21 and ✅ marks, version in parentheses) · `## 7. Implementation Plan / Milestones` · `## 8. Open Questions` · `## 9. Decisions Log` · `## 10. Risks` · `## Changelog`.
- **Milestone table**: `| M | Name | Content | Done when |` with rows M0 "Data spike" … M4 "Forest & finds … → **MVP done**", then R0 ✅, M5 ✅, M6 ✅, P ✅; "Done when" is a concrete observable ("Can fly over Karlsberg in browser", "U3 works", "verify.sh green, browser-checked"). Followed by an **Execution model (decided)** paragraph (subagents with module ownership, run against the data contract, one commit per milestone).
- **Open questions**: bullet list `Q-n <question>` with context and a "**Lean:** …" recommendation; resolved ones struck through `~~Q-1 …~~ → resolved: …`.
- **Decisions log**: table `| Date | Decision | Rationale |`, ISO dates, decision in one bold-phrased sentence, rationale short and often citing "Interview", "Research 0x", "User request" or a measured number. Feature-prefixed decisions ("F19: …").
- **Risks**: table `| Risk | Mitigation |`, includes **Legal / ethical** row (SDschG §§ 3, 8, 16, 18, 28; DSchG RLP; UXO) and licensing row.
- **Changelog**: newest first, `- **YYYY-MM-DD vX.Y** — **<headline>.** <dense detail>`; v0.1 "Skeleton created; research kicked off".
- Conventions: English docs/code, German UI (users addressed with "Sie" in the explorer), pinned dependencies, local git, data out of git.
- saar-lidar-detect's PRD (shorter) uses: Vision · Hard constraints · Decisions (dated) · Approach · Success metrics table (Metric | Target | Measured on | Milestone) · Milestones table (Milestone | Done when) with gates · Open questions · Status · Changelog. Its living source is a Claude Docs artifact with a repo snapshot.

---

## 4. Historical facts for a darker narrative (with the sources the research cites)

Evidence markers from the research: [D] documented, [I] inferred, [U] unknown. Most citations are secondary (Wikipedia, homburg-im-bild chronology = nhp-2000.de, schloss-karlsberg.de, NDB); the two monographs **Schwan 2010** (747 pp.) and **Weber 1987** (607 pp., *Schloss Karlsberg – Legende und Wirklichkeit*) are print-only and unread.

### 4.1 The duke and the court
- **Karl II. August** of Pfalz-Zweibrücken, r. 1775–1795. [D de.wikipedia Schloss_Karlsberg]
- Bought the Louisenhof on 27 Jul 1777; per Mannlich the purchase was pushed by his mistress **Caroline von Esebeck**, cousin of the owner. [D de.wikipedia citing Mannlich, *Rokoko und Revolution* p. 202 f.] Price conflict: 35 000 Gulden + 60 Louis d'or (de.wp, homburg-im-bild) vs 23 000 (en.wp). [research/01 §0]
- "Extravagant wishes"; **went into debt** for the building. [D schloss-karlsberg.de, via research/09 §1.1]
- Nickname **"Hundskarl"** (dog-Karl), linked to the kennels; "popularised in 1923". [D rosalux 2015; en.wikipedia — research/01 §2.3 row 13]
- Court in residence from 1779; "Feenschloss" (fairy palace, Knigge 1792 — passage not seen); "largest country residence in Europe" (attributed to Dehio). Gilding, mirrors, chandeliers. [research/01 §0, §3.2]
- Interiors: Louis-seize, Georges Jacob giltwood seating delivered 5 Mar 1782, Lyon silks, Strasbourg silver; collections: painting gallery (later core of the Alte Pinakothek; "≈ 2 000 paintings" unverified), library (now Bamberg), prints, antiquities, coins, natural-history and physics cabinets, **arms collection with its own gunsmith's workshop**. [research/01 §3.2–3.3; research/09 §0.11]
- 1785 wedding of Pfalzgraf **Maximilian Joseph** (later King Max I of Bavaria) — Rotunde built for it, illuminations. [Fürstenwärther 1786, *Mitt. Hist. Verein der Pfalz* 7 (1878) 63–70, PD on dilibri; *Zweibrücker Zeitung* 1 Jan 1786, PD]
- **19 Dec 1785: a fireworks explosion in the Tschifflik area kills several people.** [D de.wikipedia citing Mannlich pp. 226 ff.]

### 4.2 Workers, money, building site
- 6–10 building sites open at once 1779–1785; "the first conversions proved too small", so more material followed; **the palace was never finished**. [D schloss-karlsberg.de; en.wp/Schneider 1988 — research/09 §1.2]
- **"A journeyman had to work two days to earn one Gulden."** [D en.wikipedia — research/09 §1.2]
- Site entrusted to a **foreman/store-keeper, Franz Georg Schäfer**; in **1785** the recalled Baudirektor **Christian Ludwig Hautt** wrote a **"vernichtendes Gutachten über die Bau-Zustände auf dem Karlsberg"** (damning report), blaming Schäfer and Kammerpräsident **von Creutzer** for mismanagement "zum Schaden des Staates"; Krutthofen took over 1785; 1788 Hautt back as Hofbaudirektor, mainly **fixing defects**; Mannlich (a painter by training) had to give up the building department. [D NDB, Medding 1969, deutsche-biographie.de/sfz28384.html; de.wikipedia Christian_Ludwig_Hautt]
- Material stripped from **Schloss Jägersburg** (panelling, furniture, "a complete stable"; large parts demolished); **stone of the razed Hohenburg/Vauban fortress** quarried for Karlsberg. [D schloss-karlsberg.de; de.wp Schloss_Jägersburg; wikiwand Hohenburg Castle — research/02 K10, research/09 §1.2]
- Many buildings were **plastered timber-frame (Fachwerk)** — the reason they burned. [D de.wikipedia]
- "Eine Stadt auf dem Berg" (Weber chapter): barracks, farms, nurseries, kennels, stables. 1791 "Pleine vue du Carlsberg" legend lists: Caserne des chevaux légers, Maison des armuriers, Maison des Veneurs, La caserne avec la place d'armes, **L'hôpital** (Lazarett), deux nouvelles casernes vis-à-vis de l'hôpital, Grand corps de garde devant le Château, guard houses at the park barrier, "le petit hameau hors du parc" (Carlsdorf). [research/07 Appendix B; Commons Karlsberg_II.jpg, PD]
- **Jägerhaus converted to barracks in 1791** (Kaserne der Jäger und Scharfschützen) — militarisation as revolution approached. [D research/01 §1.2; LP06]

### 4.3 Hunting and animals
- Kennels (Hundezwinger) 1780–83; Jägerhaus/Jägermeisterei 1780–84; pheasantry (Fasanerie) 1780–81; Hirschwürzloch fountain house 1783. [D research/01 §1.2]
- The "Bärenzwinger" ring (19 half-round cages + loge, moat, island pavilion, 1778/79–86) was probably an **aviary/menagerie ring, not for bears**; the real **iron "Bären-Kästen" (bear boxes)** stood on the **Herzogsterrassen, 1786**. Conflict on whether the 1780–83 "Zwinger" was kennel or bear pit. [D de.wikipedia; schloss-karlsberg.de; urlaub.saarland — research/01 §2.3 rows 36–37, research/05 C6, research/07 C15]
- Arms collection items shown in 2018: a pistol and a **hunting knife**. [Rheinpfalz 2018]

### 4.4 Revolution, flight, destruction (1793)
- After the execution of Louis XVI a **revolutionary tribunal sought the duke**; **night of 9 Feb 1793**, warned by a farmer from Rohrbach, he fled via Kaiserslautern to Mannheim. [D de/en.wikipedia, homburg-im-bild]
- Feb–Jul 1793: Prussian and French troops alternate; **looting and fires**; under Prussian protection Mannlich evacuates paintings, library, arms, furniture, panelling to Mannheim (paintings → Munich). Legend of a **hidden trapdoor in the picture gallery** to hide treasures. [D; schloss-karlsberg.de]
- **28 Jul 1793**: after the capitulation of Mainz the retreating French **release the palace for general plunder; villagers from nearby are allowed to loot**; in the evening it is **set on fire with ~100 wagons of straw (or hay), reportedly brought from as far as Metz over about three days**. Main damage to the residence and timber-framed buildings; service/farm buildings largely survived. [D de/en.wikipedia; homburg-im-bild; Saarpfalz-Kreis 2025]
- Nov 1793 births still recorded at Karlsberg; court accounts continue to 1797. [D]
- A 19th-c.(?) image "**Einfall der Franzosen auf Schloss Karlsberg 1793**" exists on Commons (PD-marked). [research/01 V14]
- The duke died in 1795, two years after his flight ("r. 1775–95", "around the duke's death (1795)" in research/01). Place and circumstances of death are **not** in the research — verify before using.

### 4.5 Afterlife — the ruin as quarry
- 1796: 14 Homburg citizens lease the right to sell the remaining wood and stone; by the early 19th century the ruins are **cleared to the foundations**; the palace becomes a "**preisgünstige Baustoffhandlung**" (cheap building-materials store). Napoleonic era: ruins returned to the duke's widow **on condition they be demolished**. [D homburg-im-bild; rosalux 2015; de/en.wikipedia]
- Hill reforested; Bavarian survey 1836–41 labels "Ruine Carlsberg" (in the explorer's `hist_1840` layer).
- 1950s excavations (the "Kapelle"/Tschifflik identity mix-up); ruins consolidated 2009–2013; WaldPark Schloss Karlsberg since 2008; Hörpfad (5.5 km audio trail) since 2007 — **an existing audio trail, i.e. prior art/partner**. Storm Wiebke 1990 felled the "Herzogskastanien". [D research/01 §1.4]

### 4.6 Other grim regional content (explorer research/03, POIs)
- **Rabenhorst** Celtic barrow cemetery: 9 mounds; mound 1 excavated 2002: **12 graves**, ~2.5 m stele, late Hallstatt/early La Tène. [KuLaDig KLD-354061]
- "Pyramidenstein / **Totenstein**" menhir (OSM megalith). [OSM]
- **Hohenburg** + Vauban fortress (1679–1692, **razed 1714**, later quarried for Karlsberg). [OSM; en.wikipedia]
- **Merburg** (12th c., Count Dietrich v. Merburg 1179), octagonal keep, 75 m ring wall. [de/en.wikipedia]
- **WWII**: Homburg air raids 1944–45, heaviest **14 March 1945** (RAF/USAAF), **220 killed**; a synthetic-fuel plant still operating; US troops entered 20 March 1945. [de.wikipedia Homburg] ~4 500 of ~14 200 Westwall bunkers were in the Saarland; most blown up after 1945; 5 bunker POIs. [memotransfront Uni Saarland PDF] Crater locations are **not documented** — only inferred; saar-lidar-detect's IDEA notes "real crater fields exist in the Karlsberg forest" with a top pit candidate at 0.97 (unverified). **UXO: never dig; report to police / Kampfmittelbeseitigungsdienst.**
- Legal frame (good "dark but responsible" content): SDschG Saarland 2018 §3 (monuments protected by law, even unknown ones), §8 (permit for detector/technical search), §16 (report finds without delay, leave unchanged 6 working days), §18 Schatzregal (state owns finds), §28 fines up to €250 k / €500 k. [research/03 Legal notes]

### 4.7 Licence / image notes for content
- PD images: Le Clerc 1790 (Commons, low-res), "Pleine vue" 1791, 1805 ruins map, Meissen plate, 1782 Schäfer map, "Einfall der Franzosen" (PD-marked). CC BY-SA 2.0 DE: 2006 Lageplan and Ansicht (schloss-carlsberg.de) — share-alike obligations. CC BY-NC-ND: Ruppenthal leporello 1788 (Speyer). **HMS 2022 reconstruction video/frames: © (local reference only).** Heinrich Lau 1978 painting: ©.
- Contacts named in research: Dr. Jutta Schwan (schloss-carlsberg.de), Historisches Museum Saar (Simon Matzerath), Stiftung Karlsberger Hof, Landesdenkmalamt Saarland, WaldPark partners.

---

## 5. Gaps — what a game needs that does not exist yet

| Need | Status in sister projects | Note for the GDD |
|---|---|---|
| **Shared engine package** | none; both apps private SPAs | decide (a)/(b)/(c); budget an extraction or a thin wrapper |
| **Navmesh / walkable surfaces outdoors** | none. Explorer: free drone flight + terrain-following clearance only. Castle viewer: BVH collision walk with gravity, but only inside its 2.15 × 2.65 km 1789 terrain + generated colliders; no path-finding | walking on the 2025 DTM needs a character controller over `HeightQuery` (slope limits, water, buildings); NPC movement needs a navmesh or graph (OSM paths are a ready graph: 4 803 ways with baked heights) |
| **Touch walking** | explorer has touch map-gestures (no joystick, Q-24 lean "no"); castle viewer has **no touch at all** | on-screen joystick / tap-to-move must be built |
| **Quest anchors / triggers** | none. Closest: POIs (44, WGS84 points), tour stops (7, hard-coded), recon `anchor` + `enterRadius_m`, room ids + polygons, entrance POIs with `walkable` | needs a quest-anchor schema (ids referencing POI ids, building ids `KB-Bxx`, room ids, E/N + radius, layer/measure conditions) and an event bus on top of `window.sle`-like context |
| **Interior state across apps** | handover drops all app state; castle viewer has no hooks for "entered room Y" events (only `window.skb` test hooks) | either embed walk mode in the game or request a room-enter event / postMessage API from the castle project |
| **NPCs / characters** | none (no character models, animation, dialogue) | portraits 2D are cheapest; low-poly needs an art pipeline + animation |
| **Dialogue / quest / codex / inventory / save systems** | none (only localStorage patterns `sle.*.v1` and settings persistence) | all new; namespace keys (same Pages origin) |
| **Audio** | **none** anywhere (no Web Audio, no SFX, no music); only the external Hörpfad audio trail exists in the real world | ambience, SFX, voice all new; licence pipeline needed |
| **i18n** | none; German strings inline, explorer uses "Sie" | IDEA wants i18n-ready German UI — add a string table from day one |
| **Era switching ("Zeitreise")** | partial: hist_1840/hist_1935 textures, 1789 terrain only inside castle viewer, recon layer on 2025 terrain in explorer (skirts sink into ruins) | a 1789 terrain in the open world means merging `dtm1789.f32` (only 2.15 × 2.65 km) into the streamed terrain or swapping at the palace; other eras have no 3D content at all |
| **Content for non-palace eras** | only POI points with notes/links; no reconstructions for Merburg, Hohenburg, Roman, Celtic | each era beyond 1789 is text/codex + relief only unless new modelling is commissioned |
| **Lighting/mood for a dark tone** | explorer: analytical relief look, gradient sky, sun az/el, fog uniforms; castle viewer: time of day + shadows | night/fire/smoke/weather, 1793 fire state, ruins-state variant of the model — none exist |
| **Destroyed/ruin variant of the palace** | none; model is "summer 1789" intact; 2025 DTM shows the ruin pits | the 1793 story needs a burnt/ruin state (could be procedural from the generator: roofless, charred materials) — a request to the castle project |
| **Mobile performance of the palace** | castle viewer 4.36 M tris / 445 MB heap; explorer phone mode never tested on a real phone (Q-22) | MVP interior quest on phones is a risk; budget a light interior LOD |
| **Content validation pipeline** | castle catalogue has validators + evidence tags; explorer has none for prose | build the "fails on missing source/confidence" validator (IDEA §6) — can mirror the `D/I/N/U` tag scheme |
| **Accessibility** | explorer v1.0: focus rings, labelled buttons, modal focus trap, ≥ 4.5:1 contrast, reduced-motion tour | reuse patterns; castle viewer has none of this |
| **Telemetry / playtesting** | none (by design, privacy-first) | if needed, opt-in only |
| **Data stability** | contract is additive-only, but `sle-recon-v1` ids and room ids can change with catalogue versions (`catalogueVersion: 2`) | pin to catalogue version; ask the castle project for stable-id guarantees |

Small but relevant facts: the explorer's `?aoi=` + data-root env vars mean a game can point at the public `saar-lidar-data` host; the castle viewer accepts `back` only from local hosts or its own origin — a game on the same `open-kirrberg.github.io` origin would pass, a different origin would not. The data contract still says the recon dataset is "only served locally", but RELEASING.md (2026-11-02) publishes `shared/` — the contract text is stale on that point.
