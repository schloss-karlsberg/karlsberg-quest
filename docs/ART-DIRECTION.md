# Karlsberg Quest – Art Direction

Status: foundation laid 2026-11-19 (D-009). Owner: art director / render engineer. The four art
tracks (nature, architecture, characters, FX + UI) build on this file; changes to the palette,
the render baseline or the asset rules are made here first.

**Why this exists.** The owner played on a real GPU: *"the whole game looks like a 1990 game …
objects, world, everything looks ugly and buggy."* What we saw on the Apple-Silicon GPU before
this round (screenshots `test-results/art/before-*.png`, after: `after-*.png`; local, not committed):

- no shadows at all: trees, palace and props float; the light is flat and comes from nowhere,
- one grey fog wall between the trunks, low saturation, a beige sky without depth,
- untextured ground (flat green / brown gradients), pale cylinder trunks in rows, leaf cards
  that alias into noise at night,
- bright white blobs where spectral enemies stand (HDR colour with nothing to roll it off),
- fine for a tech demo, not for a game people want to stay in.

The target is a **stylized modern game look**: rich colour, soft warm light, bloom, painterly /
hand-painted feel, lush vegetation, readable silhouettes. Think of a polished indie action RPG —
**not** photoreal, and never a copy of a specific commercial game.

## 1. Pillars

1. **Light tells the time.** Every era has one key light (sun or moon), a coloured fill and a
   haze colour. Shadows are always on (from medium up) and always soft.
2. **Colour, not grey.** Warm lights, cool shadows (split toning). Saturation stays ≥ 1.0 by
   day; night is blue-violet, never black-grey. The fog is a colour, never a wall.
3. **Shapes over detail.** Big readable silhouettes, chunky bevelled forms, hand-painted-feel
   textures with large colour variation and little high-frequency noise. Detail where the player
   looks (quest props, NPCs, enemies), calm elsewhere.
4. **Spectral is light.** Everything supernatural glows from within, is translucent at the
   edges and blooms; everything real is matte and solid. Players read "enemy" by light alone.
5. **The real place stays true.** LiDAR terrain, the palace reconstruction and historic facts
   are never bent for looks; styling happens on materials, light and vegetation.

## 2. Palette per era

Values are the live presets in `src/world/eraPresets.ts` (sun, sky, ambient, fog, grade, `post`).
Hex = sRGB. "Key" is the sun/moon colour, "fill" the sky ambient, "shade" the split-tone tint.

| Era | Mood | Key | Fill | Haze / fog | Shade tint / highlight tint | Accent |
| --- | --- | --- | --- | --- | --- | --- |
| **Heute (2025), autumn forest** | golden late afternoon, light shafts between beech trunks | `#ffd8a6` low sun (19°) | `#8aa2c0` | amber `#bdb5a0`, sun side `#f2cc94` | teal-blue / warm amber | rust and gold leaves, moss green, the survey orange of Marlene's gear |
| **Sommer 1789, palace** | high summer late afternoon, the court at its brightest | `#ffd4a0` (20°) | `#9ab4cc` | pale sage `#c9ccbc` (thinner than the other day eras) | blue / gold | ochre-cream façades, red-orange roofs, deep lawn green, white gravel |
| **Feb 1793, snow night** | blue moonlight on snow, lantern pools, stars | `#9fb6e0` moon | `#40517a` | ink blue `#2b3448` | deep blue / neutral | warm lantern orange as the only warm colour |
| **Jul 1793, fire** | the palace burns: orange-red glow under a black sky | moon `#8ea4cf`, fire glow `#ff6a1f` | `#3a4566` | smoky violet `#2a2630` | violet / orange | embers, sparks, silhouettes against fire |
| **1796, ruin** | cold autumn, low warm sun on charred stone | `#f0c890` (19°) | `#8c98a8` | dusty `#b4ab9c` | slate / warm | rust trees, black char, pale fresh-cut stone |
| **1840 (map overlay)** | paper and ink on the land | (lit like the era it lies on) | — | — | — | sepia ink, hand-coloured map washes |

Rules: by day the darkest shadow is a coloured dark (never `#000`), by night the brightest
non-light pixel is moonlit snow or a lit façade. Accents are rare and meaningful (quest
objects, enemies, UI focus).

## 3. Lighting moods

- **Key + fill + bounce.** Sun/moon (one direct light with soft shadows), hemisphere fill
  (sky colour above, ground colour below), AO in contact areas. Local lights: the lantern (warm,
  12 m), fire glow (1793-07), emissive windows and spectral cores (bloom).
- **Golden hour is the default** for day eras: sun 13–20° high so shadows are long and trunks
  catch rim light. Never noon.
- **Night eras** keep a moon key (shadow strength ~0.5) so shapes read; exposure raised, blue
  white balance, bloom threshold lowered so lanterns and windows glow.
- **Fog** is distance + height fog tinted by the era (sun-side in-scatter warmer). Forest haze
  (`fog.ground`) is a soft depth cue, not a wall: ≤ 0.005 by day.
- **Bloom** lifts lights, fire, spectral cores and the sun's rim on clouds; it must never turn a
  whole enemy into a white blob (keep emissive cores small, bodies below the threshold).

## 4. Material style

- **PBR, hand-painted feel.** Albedo with broad value and hue variation (warm/cool shifts), low
  high-frequency noise; roughness mostly 0.6–0.95 (matte world); metalness only for real metal.
- **Bevel everything** that the player sees up close (≥ 2–3 cm chamfers catch the rim light).
- **Textures:** 1k by default, 2k only for hero props and terrain sets; tiling ground / wall
  sets use detail + macro variation (no visible repeat at 20 m).
- **Stone:** cream sandstone (Karlsberg façades), warm grey rubble, black char + ember cracks
  (1793-07), pale fresh-cut stone (1796 quarry). **Wood:** warm brown, visible grain at 1 m.
  **Ground:** leaf litter + moss (today), lawn + gravel (1789), snow with blue shading (1793-02).
- Imported glTF materials are patched to the world light automatically (`kqStandard`, §7):
  author them for a neutral white key light.

## 5. Vegetation style

- **Lush and layered:** canopy (beech, oak, spruce), understorey (saplings, holly, ferns),
  ground cover (grass tufts, leaf piles, mushrooms, fallen logs, stumps, rocks with moss).
- **Stylized foliage:** clumped leaf masses with soft (wrapped / spherical) normals, not
  individual noisy cards; a gentle wind sway; autumn hue ramps per tree (gold → rust → crimson).
- **Trunks:** tapered, rooted, with bark texture and moss on the weather side; never pale
  uniform cylinders in rows (vary scale, lean, spacing; keep the LiDAR canopy positions).
- **Distance:** impostors keep the silhouette and the hue ramp; the far canopy is a painted
  layer, not a flat colour.
- **Seasons** stay era-driven (summer 1789, autumn today, bare + snow 1793-02, sparse 1796).

### 5.1 Nature track (implemented 2026-11-19)

Code: `src/world/vegetation/` (`nature.ts` owns the layers, `strips.ts`, `scatter.ts` pure rules,
`groundcover.ts`, `props.ts`), `src/world/water.ts`, `src/world/terrainShader.ts`, `forest.ts`.
Everything below is **off on the low tier** (SwiftShader / e2e / `?q=low`): nothing is fetched and
the procedural terrain, bark and forest from the render baseline stay as they were.

- **Ground (medium / high):** 8 CC0 Poly Haven sets packed into two WebP strips
  (`textures/nature/ground_albedo.webp` 8 × 1k, `ground_nh.webp` 8 × 512 with normal RG + height B,
  `pnpm assets:strip`) and uploaded as `DataArrayTexture`s: leaf litter, forest floor, leafy grass,
  rocky trail (paths / gravel), rock ground (slopes 30–46°), snow, forest mud (shores, damp
  hollows), burned ground (1796 ruin field). Splat weights come from the land-cover rasters, slope,
  shore distance and the era; layers are height-blended, sampled twice with offsets picked by a
  macro noise (no visible tiling), and tinted per era (lush 1789, golden today, snow 1793-02, dry and
  burnt 1796). Defined as `KQ_SPLAT` in the terrain shader (`terrain.setGroundSet`).
- **Bark:** three CC0 bark sets (beech, oak, spruce; `bark_albedo.webp`, `bark_nh.webp`) on the near
  trunks with a tangent-frame normal, moss on the weather (west) side (`forest.setBark`, `KQ_BARK`).
- **Crowns:** scalloped leaf-clump cut-outs with anti-aliased edges and alpha-to-coverage on medium /
  high (no honeycomb, no shimmering); spruces rebuilt as denser whorls of shorter needle cards.
- **Ground cover (`GroundCover`):** instanced grass tufts, meadow flowers (1789 most, none in the
  snow) and reeds / cattails on the shore band, deterministic per 8 m tile from the land cover; wind
  gusts, grow-in at the ring edge (high 30 m, medium 21 m), tall reeds duck away right at the camera.
- **Props (`NatureProps`):** CC0 ferns (wind), two mossy rock sets (every rock its own variant), a
  fallen dead trunk and two stumps, instanced per kind around the player (ferns 46 m, rocks 170 m),
  never on water, paths or the parterre; snow on top in February 1793.
- **Water (`Water`):** the Karlsbergweiher, the Schwanenweiher and every other pond come from the
  ground raster (class `water`, flood-filled per level, `findWaterBodies`), with a signed shore
  distance for foam and depth. The lake bed sinks under the water (`uBedDepth`). Stylized shading:
  layered waves, Fresnel, sky gradient + tree-line reflection, a **planar reflection** of the scene
  on high (half resolution, nearest body in view, `KQ_WATER_REFL`), sun glitter, shore foam, depth
  colour and transparency, floating leaves in autumn, ice with cracks and drifts in February 1793.

## 6. Character style

- **Spectral enemies:** glowing, translucent, stylized. A bright core (emissive, blooms) inside
  a translucent body (fresnel rim, soft alpha, drifting particles); a family colour per kind
  (mist = pale blue-white, paper = ink + parchment glow, stone = ember-orange cracks, hounds =
  cold green eyes). Silhouettes read at 30 m; the core never fills more than ~15 % of the body.
- **NPCs / ghosts of people:** stylized low-poly-but-smooth humans (smooth shading, simple
  faces, period costume shapes: tricorn, coat tails, aprons, bonnets), slightly translucent
  edges and a soft inner glow so they read as memories, not living people.
- **Animation:** readable anticipation and follow-through; idle breathing; no T-poses.
- **Implemented (characters track, 2026-11-19), medium / high tiers:** NPC ghosts are rigged CC0
  Quaternius humans (`public/assets/models/characters/`: adventurer, farmer, animated woman; 0.5–0.6 MB
  each, meshopt, lazy on first sight) dressed per outfit by recolouring the model's material slots
  (`src/systems/characters/catalog.ts`: official coat blue, livery green, mason stone, maid dress, carter
  overalls; per-NPC accents) under the ghost shader (`characters/shaders.ts`: luma-normalised era tint,
  fresnel rim, flowing bands, feet dissolving into mist, depth pre-pass). Clips: `Idle_Neutral`, Walk /
  Run by real travel speed, Wave when a warm ghost starts talking, Interact gestures while talking; the
  neck and head turn to the player within 9 m (additive bone turns after the mixer). Hats (tricorn,
  huntcap, mobcap) and props (basket, stick, book) from the procedural figure ride the Head / WristR
  bones. Enemies: the Streuner is a smoke hound on the CC0 wolf rig, the Raffschatten a smoke plunderer
  on the human rig, the Pikeur rides a spectral CC0 horse with two hounds at heel (rider stays
  procedural). Spectral shader: dark ink smoke, fog-contrast rim, ragged wisp edges, a small point core
  (≤ 10 % of the height), the telegraph on the rim, a burning noise dissolve over the death clip; the
  AI state picks the clip (wind-up = attack clip held at its anticipation pose, strike played through,
  hit react, gallop by ground speed). The low tier keeps the procedural figures and bodies (no
  downloads). The other kinds (mist, paper, straw, stone, the Schuldbuch, Strohmann, Steinbrecher)
  stay procedural; the Nebelling got a smaller cold heart in darker mist. View model: a gloved fist
  with four curled fingers, knuckles, thumb and cuff; per-part gloss (satin paint, leather, iron),
  band seams, chipped paint and mud towards the shoe.
- **Never:** gore, real victims or animals as enemies, likenesses of real people.

## 7. Render baseline (engineering, implemented 2026-11-19)

| Part | Where | What |
| --- | --- | --- |
| Tone mapping | `src/render/post.ts` | ACES filmic (Hill fit, as three's `ACESFilmicToneMapping`) on the HDR target; sRGB encode in the final pass (renderer output sRGB, `NoToneMapping` on the renderer) |
| Shadows | `src/render/shadows.ts`, `kqShadow` in `src/world/atmosphere.ts` | one fitted orthographic sun/moon shadow map that follows the player (box pushed ahead along the view, texel-snapped); depth pass with the scene's own materials (wind, instancing, leaf cut-outs stay right); bilinear PCF (2×2 / 3×3 taps), normal offset, edge fade; strength per era (`post.shadow`); terrain receives but does not cast; opt out with `userData.noShadow = true` |
| Sky + IBL | `src/world/sky.ts`, `EnvLight` in `src/render/standard.ts` | stylized gradient sky (zenith / horizon band, Mie glow, painterly clouds with lit sides and silver lining, stars, moon); a PMREM of it per era is the environment light of imported PBR materials |
| Fog | `kqFog` (atmosphere.ts) | distance + height + forest haze, sun in-scatter, fire tint — per era |
| AO | post.ts | half-res depth-only SAO (10 taps, spiral, depth-aware blur), fades out by 90 m; strength per era (`post.ao`) |
| Bloom | post.ts | soft-knee threshold → 5-level 13-tap downsample / tent upsample chain; strength + threshold per era |
| Grade | post.ts + `eraPresets.ts` | white balance (`post.white`), split toning (`post.shadowTint` / `post.highTint`), saturation, contrast, lift / gain, vignette, luma-weighted grain |
| Imported PBR | `kqStandard` / `kqStandardize` (standard.ts) | three's Standard / Physical BRDF lit by the era sun (shadowed), hemisphere fill, lantern, fire glow, sky IBL, and `kqFog` |

**Quality tiers** (`src/render/quality.ts`, settings „Bild & Leistung“):

| Tier | Shadows | AO | Bloom | Grade extras | MSAA / DPR |
| --- | --- | --- | --- | --- | --- |
| Niedrig (`low`) | off (canopy shade fallback) | off | off | off | 0 / 1.0 |
| Mittel (`medium`) | 1024², ±55 m, 2×2 PCF | off | on | on | 2 / 1.25 |
| Hoch (`high`) | 2048², ±75 m, 3×3 PCF | on | on | on | 4 / 1.5 |

`?q=low|med|high` sets the tier for the session (not saved); a software renderer (SwiftShader,
llvmpipe — the headless e2e run) starts on `low`; choosing a level in the settings clears both.
Target: 60 fps at 1440×900 on an Apple-Silicon Mac in `high` (measured 2026-11-19: 65–100 fps in
forest / palace views, frame ≈ 10–15 ms).

**Art review hooks:** `kq.ctx.post.debug = 1` (AO buffer) / `2` (bloom buffer);
`kq.spawnAsset(id, x, z, {yaw, scale})` places a manifest asset in the world.

## 8. Assets

**Licence: CC0 1.0 only**, downloaded only from the official sites / APIs: polyhaven.com
(api.polyhaven.com, dl.polyhaven.org), ambientcg.com, kenney.nl, quaternius.com, poly.pizza
(CC0 filter). Never anything from, or imitating, a commercial game. Every asset gets a record in
`public/assets/LICENSES.json` (name, author, source URL, licence, files, what we changed, date);
the in-game „Lizenzen & Quellen“ screen lists it. `tests/assets.test.ts` fails on a file without
a record, a record that is not CC0 or not from an allowed site, a wrong byte count, or a budget
overrun.

**Downloads are untrusted data:** unpack each archive into a fresh empty temp dir (the
scratchpad), copy out only the model / texture files, never run anything from it.

**Pipeline:**

```
pnpm assets:pack <in.gltf|glb> public/assets/models/<track>/<name>.glb [--tex 1024] [--simplify 0.5]
    # dedup / weld / prune, optional meshopt simplify, textures → WebP (cwebp, ≤ --tex px),
    # EXT_meshopt_compression; prints { bytes } for the manifest
pnpm assets:tex <in.jpg|png> public/assets/textures/<set>/<name>.webp [--size 1024]
pnpm assets:strip <out.webp> [--nh] [--size 1024] in1 in2 …   # layers stacked vertically for a texture array
    # (--nh: normal RG + height B); pack-gltf also takes --error <0.002> (simplify tolerance, raise for scans)
npx tsx scripts/assets/inspect-glb.ts <file.glb>             # materials, alpha, textures, triangles
```

Layout: `public/assets/{models,textures,hdri}/<track or set>/…`. Budgets: whole folder
< 150 MB, `core` area (loaded behind the title) < 40 MB; everything else lazy per area / era.
KTX2 (Basis) and Draco are supported by the loader (decoders bundled, fetched only on use);
prefer WebP textures + meshopt meshes unless a texture set is large.

**Manifest + loader** (`src/assets/`):

```ts
// src/assets/manifests/<track>.ts  — one file per track, merged by import.meta.glob
const entries: AssetEntry[] = [
  { id: 'nature.stump.01', kind: 'model', url: 'models/nature/tree_stump_01.glb',
    area: 'forest', eras: ['today', '1796'], bytes: 946064, licence: 'polyhaven.tree_stump_01' },
  { id: 'ground.litter.albedo', kind: 'texture', url: 'textures/ground/litter_diff.webp',
    area: 'forest', bytes: 123456, licence: 'polyhaven.forest_leaves_02',
    texture: { colorSpace: 'srgb', repeat: true } },
];
export default entries;

// in a system
const stump = await ctx.assets.instance('nature.stump.01'); // clone, materials patched to world light
const tex = await ctx.assets.texture('ground.litter.albedo');
await ctx.assets.loadArea('palace', (done, total) => …);  // byte progress
ctx.assets.peek('nature.stump.01');                         // sync, null until loaded
```

`area: 'core'` entries load behind the title; entries listing `eras` prefetch when that era
opens (`era:change`). Ids are dotted lower-case `<track>.<thing>[.<variant>]`.

### 8.1 Shopping list per track (CC0, to be fetched by the tracks)

| Track | Needs | Where to look (CC0; names are search hints, check the exact asset on the site) |
| --- | --- | --- |
| **Nature** (terrain, vegetation) | terrain texture sets 2k: forest floor / leaf litter, moss, meadow grass, gravel path, rock, snow, mud bank; stylized trees (beech / oak / spruce in 2–3 LODs) or foliage cards; ferns, grass tufts, bushes, fallen logs, stumps, mossy rocks, mushrooms; water normal map for the Damm pond | Poly Haven (textures: `forest_leaves_02`, `brown_mud_leaves_01`, `aerial_grass_rock`, `rocky_terrain_02`, `snow_02`, `gravel_*`; models: `tree_stump_*`, `dead_tree_trunk*`, `rock_moss_set_*`, `fern_02`), Quaternius (Stylized Nature MegaKit, Ultimate Nature), ambientCG (Ground, Grass, Rock, Snow sets) |
| **Architecture** (palace, ruins, props) | sandstone / plaster / roof tile / slate / wood plank / cobble textures (1k–2k, tiling); trim sheet for cornices; props: barrels, crates, carts, lanterns, fences, benches, tools, scaffolding, charred beams, rubble piles | Poly Haven (`castle_brick_*`, `plastered_wall_*`, `roof_tiles_*`, `wood_planks_*`, `cobblestone_*`; models: barrels, crates, `wooden_*`), ambientCG (Bricks, Plaster, RoofingTiles, Planks, PavingStones), Kenney (Medieval / Survival kits), Quaternius (Medieval Village, Fantasy Props) |
| **Characters** (NPCs, spectral enemies) | rigged stylized humanoids with idle / walk / talk / gesture; base meshes for ghost costumes (coat, apron, dress); creature bases (hound, crow, stag); particle textures for spectral bodies (soft puffs, wisps, sparks) | Quaternius (Ultimate Animated Characters, Animated Animals, Ultimate Monsters as shape reference only), Kenney (Animated Characters, Particle Pack), Poly Pizza (CC0 filter) |
| **FX + UI** | particle sheets (smoke, fire, embers, sparks, magic), decals (scorch, footprints), a parchment / paper texture set and ornament frames for the UI, icons for items / skills | Kenney (Particle Pack, Game Icons, UI Pack RPG expansion), ambientCG (Paper, Fabric), Poly Haven (`paper_*` textures) |
| **Sky** (render, optional) | a few CC0 HDRIs only as lighting reference or for interiors' reflections (the outdoor sky stays procedural so it can follow every era) | Poly Haven HDRIs (`kloofendal_*`, `belfast_sunset`, night skies) |

### 8.2 Architecture track (implemented 2026-11-19)

**Surfaces** (`src/world/surfaces.ts`): 15 tiling CC0 PBR sets from Poly Haven (plaster
`white_plaster_02`, ashlar `medieval_blocks_03`, roof tiles `clay_roof_tiles_02`, slate
`roof_slates_02`, planks `weathered_brown_planks`, painted boards `green_rough_planks`, iron
`green_metal_rust`, rubble `castle_wall_varriation`, parquet `herringbone_parquet`, `marble_01`,
fabric `hessian_230`, straw `reed_roof_04`, fine wood `wood_table_worn`, cobbles
`cobblestone_floor_01`, sandstone `sandstone_cracks`), packed by `pnpm assets:surface <diff>
<nor_gl> <arm> <out-base>` into two 1k WebP files each (`_col`: albedo × AO, `_nrm`: RG normal +
B roughness), ≈ 8.5 MB, area `palace`. They load into two `DataArrayTexture`s shared by every
shader through the `surfaces` uniforms and `SURF_GLSL`:

- `kqSurface(layer, uvMetres, world, …)` modulates the vertex colour by the texture relative to
  its mean (the palette keeps its colours), perturbs the normal (derivative frame, no tangents)
  and sets roughness / metalness; detail fades out 50–260 m.
- `kqLightPbr` adds a GGX-ish sun highlight and a sky reflection to the usual world light.
- **Who uses it:** the palace shell (per-vertex class from colour + normal: plaster, ashlar
  trims, roofs, shutters, glass), the scenery kit (`kit.ts`: layer from the palette colour or
  given per piece; metre UVs), the interiors (per finish: parquet, plaster, boiserie, boards,
  masonry, marble, damask, iron / gilt …) and the field station.
- **Tiers:** `low` sets `uSurfOn = 0` and every shader takes the old flat path (e2e /
  SwiftShader unchanged); `medium` uploads 512 px layers, `high` 1024 px.

**Prop models** (`src/systems/scenery/models.ts`, manifest `src/assets/manifests/architecture.ts`):
19 CC0 GLBs (Poly Haven: barrels, crates, bucket, lantern, pick, basket, stool, chest, chandelier,
picture frames, fauteuil, console, mirror, candelabra, commode, folding stool, field table;
meshopt + 1k WebP, ≈ 8 MB) instanced per set (one `InstancedMesh` per model part). Medium /
high tier only: the scenery sets (Baumagazin barrels and tools, kennels, post lanterns, Orangerie
crates and chest, Festsaal fauteuils and chandelier in 1793-07), the interiors (chandeliers with
their candle flames at the model's candle tips, fauteuils) and the field station's table, stools,
crate and barrel. The low tier keeps the procedural kit props. Glass materials of the models are
made thin and see-through (`lightenGlass`).

**Field station** (`src/systems/story/hub/station.ts`): green board-and-batten Bauwagen on a steel
chassis (longerons, disc wheels, mudguards, A-frame drawbar, jockey wheel), tin barrel roof with
gutters and downpipe, framed windows with sills and open shutters, planked door with a lit pane,
steps on stringers, awning, gas bottle, extinguisher, firewood under a tin sheet; textured via the
surfaces on medium / high.

## 9. UI style

Field-book look stays (parchment, ink, IM Fell English / Caveat), but cleaner: higher contrast
panels with soft drop shadows, thin gold-ink rules, icons with a hand-drawn line, colour only for
state (health red, Atem blue, quest gold, spectral cyan). Big readable numbers; no grey-on-grey.
HUD sits on a subtle dark vignette, never on flat boxes.

**Implemented 2026-11-19 (`src/ui/hud-restyle.css`, loaded after `styles.css`; `--hud-*` tokens):**

- **One type system:** IM Fell English for all HUD text (tracker, feed, prompts, toasts, dialogue),
  small caps for labels; Caveat stays only on hand-written cards (Marlene's notes, field book).
- **The centre stays free:** nothing sits between 25 % and 75 % of the screen height in the middle
  third except the crosshair, the waymark and (briefly) the click-to-look pill; the "Neue Aufgabe"
  banner sits just under the compass; prompts and subtitles sit at the bottom.
- **Slim vitals** bottom-left (thin segmented bars, small-caps labels, numbers right), glass panels
  (dark, 60–70 % opacity, a 1 px gold-ink rule) instead of solid boxes.
- **Tracker** top-left: quest title in small caps, diamond boxes, the lead objective glows gold
  and carries a distance chip; the stall hint is a cyan-ruled "Tipp" box under it.
- **Compass band:** a masked strip (letters fade at the ends), the lead diamond with its distance
  under it; off-strip targets clamp to the edge with a chevron.
- **Waymark:** a diamond icon over the lead target with the distance, the label when you look at it;
  off screen it clamps to the screen edge with an arrow. Fades inside the zone.
- **Objective beacons:** a soft volumetric gold beam (90 m, view-angle soft edges, rising sparks)
  and a crisp ground ring with an outward pulse over the lead; other open goals are fainter and
  era-tinted. Additive, no textures: same cost on every tier.
- **Prompts:** a glass pill with a key cap (`E`, `W A S D`) and a real verb ("Messstab nehmen",
  "Riechsalz aufheben"); low-priority prompts (the Feldstation hub) yield to any other.
- **Dialogue card:** narrower, lower, parchment kept; radio icon on the left.

## 10. References (described, not copied)

- *Painterly golden-hour forests* of story-driven indie adventures: long soft shadows, warm haze,
  saturated foliage clumps, a clear path of light leading the eye.
- *Stylized action-RPG night scenes*: blue moonlight, warm practical lights, bloom on magic,
  enemies readable as glowing silhouettes.
- *Baroque garden paintings* (18th-c. vedute of residences): cream façades, ordered lawns,
  luminous skies with towering clouds — for 1789.
- *Romantic ruin paintings*: low sun on broken stone, rust and gold trees — for 1796.

## 11. Do / Don't

| Do | Don't |
| --- | --- |
| warm key, cool shade, coloured fog | grey fog walls, black shadows, desaturated "realism" |
| soft shadows everywhere (medium+) | floating objects without contact shadow / AO |
| clumped, layered, swaying vegetation | single-plane noisy leaf cards, trunks in rows |
| glow only where something is magic or a real light | whole bodies above the bloom threshold (white blobs) |
| CC0 assets from the listed sites, recorded in LICENSES.json | assets from or imitating commercial games, unlicensed or "free for personal use" packs |
| 1k textures, WebP, meshopt GLB, lazy per area | 4k textures, uncompressed glTF + PNG, everything in `core` |
| judge on the real GPU (headed Chromium, Metal) | judging the look from SwiftShader screenshots |
