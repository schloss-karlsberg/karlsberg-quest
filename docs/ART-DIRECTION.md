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

The present-day tour and palace use 1 m DGM normals and local relief on Mittel and Hoch (TASK-008,
slice 3). The crop spans Karlsberger Hof, Felsenpfad, the Weiher, the Quelle ravine and the palace
plateau. Fine banks, hollows and terrace edges can catch the light along the walk. The shading fades
toward the wet shore and into the base 2 m surface at distance. The same 2 m terrain mesh sets the
silhouette across presets. The source is the existing GeoBasis-DE/LVGL-SL DGM1 export, credited in
`public/data/attribution.json`.

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
Niedrig uses procedural terrain, bark and trees. The present-day ground cover also runs on Niedrig
and uses the terrain data already in memory.

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
  On **Niedrig** in present-day November, the 14 m ring gives the open verges dry, sparse tufts and
  occasional meadow flowers. Growth thins under the canopy and on steep slopes. The gravel tread
  and the furnished Quelle hollow stay clear. Reeds follow the Weiher's shallow bank, leaving the
  open water visible. The Niedrig ground-cover layer is present-day only.
- **Tour stops (FIKTION):** present-day trail fittings mark the meeting point at Karlsberger Hof,
  the Felsenpfad stop and the Weiher. Weathered plank benches on pale sandstone feet anchor the
  Hof and Weiher verges. Cream wayfinding boards use the tour's German place names. Low sandstone
  blocks at Felsenpfad pick up the colours of the surrounding rock. The same silhouettes appear
  on Niedrig. Keep the fittings off the group's tread and the Weiher's bank.
- **Palace plateau (FIKTION):** weathered timber benches, broken courses of cream and muted red
  sandstone, and short groups of verge stones frame the track through the former Ehrenhof in
  today. The stones sit low in the ground, with uneven crowns on the broken courses and gaps
  between groups along the verge. Niedrig keeps both benches and both courses with fewer stones.
  The layout follows the shipped OpenStreetMap track and 2025 LiDAR heights (GeoBasis-DE/LVGL-SL).
  [Map and terrain attribution](../public/data/attribution.json)
- **Castle understory (FIKTION):** dull olive and russet shrubs break up the canopy edge at the
  Weiher, outside the Quelle hollow and on the palace plateau. Papery, pale seed heads sit in
  small gaps in the canopy. Keep the plants below eye level and leave space around the shore,
  trails, spring and fittings. Local canopy height, terrain grade, the water mask and OSM paths
  guide placement. Niedrig uses fewer plants with simpler silhouettes.
  [Map and terrain attribution](../public/data/attribution.json)
- **Props (`NatureProps`):** (round 2: stylised kit, see §5.2) CC0 ferns (wind), rocks, a
  fallen dead trunk and two stumps, instanced per kind around the player (ferns 46 m, rocks 170 m),
  never on water, paths or the parterre; snow on top in February 1793.
- **Water (`Water`):** the Karlsbergweiher, the Schwanenweiher and every other pond come from the
  ground raster (class `water`, flood-filled per level, `findWaterBodies`), with a signed shore
  distance for foam and depth. The lake bed sinks under the water (`uBedDepth`). Stylized shading:
  layered waves, Fresnel, sky gradient + tree-line reflection, a **planar reflection** of the scene
  on high (half resolution, nearest body in view, `KQ_WATER_REFL`), sun glitter, shore foam, depth
  colour and transparency, floating leaves in autumn, ice with cracks and drifts in February 1793.

### 5.2 Nature round 2: model trees, stylised floor, clear air (2026-11-19)

Code: `src/world/vegetation/trees.ts` (`ModelTrees`), `foliage.ts` (shared season colours),
`props.ts`, `src/world/eraPresets.ts`; assets `public/assets/models/nature2/*.glb` (Quaternius
Stylized Nature kit via poly.pizza, CC0, packed with `pnpm assets:set`). Medium / high only: the
low tier (SwiftShader, e2e) keeps the procedural forest and draws no props.

- **Trees are 3D models now**, not cards: 16 variants in four families — common (beech stands),
  pine (spruce stands), twisted (oak), dead (bare February crowns, snags in every stand). Leaves
  are real leaf-clump geometry tinted by season from the texture's luminance (summer 1789, golden
  2025, thinned 1796 crowns; winter swaps broadleaf to the dead models).
- **Stand proportions:** the kit's trees are 7–19 m and stout; LiDAR stands are 20–35 m. The crown
  keeps the model's size (scale `min(h·k, max)` per family) and only the trunk below the crown base
  stretches; the trunk is slimmed to ≈ 1.8 % of the height and low limbs are pulled onto the stem
  (no giant elephant trunks, no limbs dragged to 15 m).
- **LOD:** lod0 (full, bark normal map < 30 m) → lod1 (bark ≈ 25 %, half the leaf cards ×1.35)
  → **baked impostors** (8 azimuths per variant, normal + albedo + bark/leaf flag, lit at runtime
  with the same light, fog and season colour as the models). Levels cross-fade by screen-space
  dither; no pop, no pale far palisade (far bark darkens towards the impostors' ×0.6).
- **Wind:** gust-modulated sway on every level, stronger on leaf cards.
- **Floor:** stylised low-poly ferns / forest plants, bushes (green, blossoming, rust), flower
  clumps and mossy boulders + pebbles replace the photo-scan rocks and fern; placed with full-cell
  jitter and a warped clump noise on top of the patch noise, so they come in clusters and glades,
  never in rows. Logs and stumps stay.
- **Air:** "today" and 1789 have a cooler, thinner ground haze and more saturation / contrast (the
  crowns' colour carries instead of a brown veil); the night presets got a stronger blue moon fill.
  Sub-pixel dust / pollen motes fade out earlier, so nothing reads as stars in a day sky.

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
  on the human rig, the Pikeur rides a spectral CC0 horse with two hounds at heel (rider: see §15). Spectral shader: dark ink smoke, fog-contrast rim, ragged wisp edges, a small point core
  (≤ 10 % of the height), the telegraph on the rim, a burning noise dissolve over the death clip; the
  AI state picks the clip (wind-up = attack clip held at its anticipation pose, strike played through,
  hit react, gallop by ground speed). The low tier keeps the procedural figures and bodies (no
  downloads). The other kinds are sculpted procedural creatures (§15). View model: a gloved fist
  with four curled fingers, knuckles, thumb and cuff; per-part gloss (satin paint, leather, iron),
  band seams, chipped paint and mud towards the shoe.
- **Player character (camera track, 2026-11-19):** see §16 — seen over the shoulder; the default is
  the authored MPFB player (an ordinary visitor), the earlier rigged CC0 surveyor is the fallback.
- **Authored characters, toon option (2026-11-21):** an authored character's manifest entry may opt
  into a soft toon variant of the world-light bridge (`shading: 'toon'`,
  `src/systems/characters/toon.ts`): the sun through 2–3 soft bands (no hard cel lines), a warm
  terminator and a warm shadow fill (never grey or lavender), a subtle rim, catchlight glints on
  the eyes. It is still lit by the era sun and its shadows, the era ambient, the sky IBL, the lantern
  and the fire glow; world materials never use it. The authored people keep their one shared palette
  material: a toon GLB draws every person with one shared toon twin of it. Opt-in per entry; the
  look is calibrated on the character (its palette and per-slot toon settings), never on the scene
  lights or the tone mapping. The face can be stylised in the build (`face.stylize`, scripts/chars/mpfb).
  Face style B (owner decision, 2026-11-21) is the face of every person: one shared preset
  (`scripts/chars/mpfb/specs/_style_b.json`) that each person spec extends; the guide is the first.
- **Never:** gore, real victims or animals as enemies. No likeness of a real living person without
  that person's consent. Historical figures may be modelled from public-domain portraits (§21).

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

**AI-generated assets (owner, 2026-11-20):** AI-generated assets are allowed when the tool's licence permits public redistribution of the output. Credit each file in `LICENSES.json` with the tool, model, version, date and licence. Release generated art under CC0. Use a living person's likeness only with their consent. Historical figures may be modelled from public-domain portraits.

**Voices (owner, 2026-11-24):** Public voice clips use MOSS-TTS-v1.5. Synthetic output is CC0. Real-person output requires written public consent in moss-service, a named credit and a game-only licence. See [Contributing](../CONTRIBUTING.md#art-assets-cc0-or-licensed-ai-generated).

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
Credit own-work runtime geometry in the `procedural` list of `public/assets/LICENSES.json`,
using the repo-relative source file.

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
  masonry, marble, damask, iron / gilt …) and, until the tour redesign removed it, the field station.
- **Tiers:** `low` sets `uSurfOn = 0` and every shader takes the old flat path (e2e /
  SwiftShader unchanged); `medium` uploads 512 px layers, `high` 1024 px.

**Prop models** (`src/systems/scenery/models.ts`, manifest `src/assets/manifests/architecture.ts`):
19 CC0 GLBs (Poly Haven: barrels, crates, bucket, lantern, pick, basket, stool, chest, chandelier,
picture frames, fauteuil, console, mirror, candelabra, commode, folding stool, field table;
meshopt + 1k WebP, ≈ 8 MB) instanced per set (one `InstancedMesh` per model part). Medium /
high tier only: the scenery sets (Baumagazin barrels and tools, kennels, post lanterns, Orangerie
crates and chest, Festsaal fauteuils and chandelier in 1793-07), the interiors (chandeliers with
their candle flames at the model's candle tips, fauteuils) and the field station's table, stools,
crate and barrel (the field station is gone since tour WP-01). The low tier keeps the procedural kit props. Glass materials of the models are
made thin and see-through (`lightenGlass`). A costly model can be kept to the high tier
(`b.model(id, fallback, { high: true })`): its procedural fallback then stands on medium too. The
Bleiche's wicker basket (then 16.6k triangles, four times the rest of the green; 8.9k since the
tri-budget phase B re-pack, docs/PERFORMANCE.md §3.5) is the first.

**Field station (removed; kept for the record).** The tour redesign took the Bauwagen out of the world (tour
WP-01, `docs/design/tour/`); `src/systems/story/hub/station.ts` no longer exists. It was a green board-and-batten Bauwagen on a steel
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
  "Riechsalz aufheben"); low-priority prompts (the hub at the Quelle, legacy — TASK-007) yield to any other.
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
| CC0 assets from the listed sites, or AI-generated assets whose tool licence allows redistribution, recorded in LICENSES.json | assets from or imitating commercial games, unlicensed or "free for personal use" packs |
| 1k textures, WebP, meshopt GLB, lazy per area | 4k textures, uncompressed glTF + PNG, everything in `core` |
| judge on the real GPU (headed Chromium, Metal) | judging the look from SwiftShader screenshots |

## 12. Integration pass (2026-11-20)

The four art tracks (nature §5.1, architecture §8.2, characters §6, UX / HUD §9) and the round 6
readability work were merged into one build and checked together on the real GPU (headed Chromium,
Metal, Apple M5 Pro, 1440 × 900, `?q=high`), every era. What the pass changed so the parts read as
one look:

- **One light, one palette:** materials (CC0 PBR on the palace, splat ground, bark), the rigged
  ghosts / spectral bodies and the HUD all take the era preset's key, fill and fog; 1789 got a
  higher (20°) sun and a thinner sage haze (`#c9ccbc`) — under the old 13° orange sun and sand fog
  the meadows, the grass layer and the far hills fused into one sand colour.
- **Meadows:** the summer grass layer of the ground splat is pulled towards a fresh green at the
  texture's own brightness (the CC0 leafy-grass set is straw-warm); grass tufts are placed with full
  jitter and a 3 m clump noise (dense tussocks, thinner gaps) instead of one tuft per cell, which
  read as planted rows; tufts are wider (22 blades, 0.42 spread).
- **Shores:** cattails are rounded velvet-brown heads on a stem with a bare spike, not dark pointed
  thorns.
- **Readability on rigs:** the near-camera dither (`occlusionVis`) also fades the rigged bodies; ink
  outlines stay on the procedural solids only (rigged bodies carry the spectral rim instead).
- **Cost:** the forest crown shader skips sub-pixel detail on cards under ~100 px (mid ring: the
  forest view went from ≈ 52 to ≈ 76 fps at high on an M5 Pro); see ACTION-RPG §14 for all numbers.
- **HUD:** subtitles and the dialogue card keep clear of the slim vitals at 1024 / 1280 px.

Open (next art round): distant tree impostors still read as flat umbrella cards (1789 avenues);
the 1796 palace ruin reads as a red box from afar; Festsaal paintings / mirrors / consoles are in
the manifest but not yet placed; the remaining procedural enemies (mist, paper, straw, stone,
three bosses) and the Pikeur's rider are not rigged yet.

## 13. Real-GPU playtest round 7 (2026-11-19, "stuck at the lake")

Two testers played on the real GPU (Apple M5 Pro, Metal, 1440 × 900, `?q=high`); what this round
changed in the look, each checked with headed-Chromium screenshots before / after:

- **Night reads:** the prologue night (`story` look `night`) has a brighter cool moon (1.15),
  a blue sky fill (ambient 0.95), a lighter blue haze and exposure 1.75 — terrain, paths, the
  wagon and the lake shore read without the lantern; the lantern adds warmth, not visibility.
- **No stars in a day sky:** the ambient motes (dust, pollen, ash, snow) fade out once they are
  smaller than about a pixel instead of being clamped to a hard 1 px dot (they read as stars over
  the 1789 / 1796 / 2025 day sky and as white noise over the snow); the 1796 ash is a dark grey.
- **Palace shell:** the merged palace draws both sides; the inside of the shell is a dim warm
  interior, so upper-floor windows without a room behind them no longer show the sky through a
  hollow facade.
- **Lantern viewmodel:** the brass lantern is shaded (key light, its own flame on the frame, rim,
  specular) instead of a flat unlit silhouette; rounder parts (28 segments, round bars).
- **Forest:** distant bark sinks into the stand's shade and the far impostors draw only a short dark
  trunk (the "palisade of pale poles" between the crowns); leaf-clump rims have softer, shorter
  tips (less "torn paper"); the mid ring ends at 130 m (impostors beyond).
- **Fire night:** `1793-07` always burns — outside the staged K3 beat the fire runs as scenery
  (flames, smoke, glow, collapses; no smoke meter, never catches, not saved).
- **Markers:** the quest ground ring fades at grazing angles (no orange streak through the forest);
  a veiled enemy (Schleier) has a pale ring and a slow shell of mist motes, so its place reads in
  daylight before the Bannlicht.
- **HUD:** the pointer-lock hint is a small chip under the compass (never over fights, dialogue or
  subtitles); enemy nameplates stay out of the quest tracker / top-left column; a favicon.

Still open (next art round): CC0 tree models for the near ring (the crowns are still procedural
cards — done in the nature round 2, §5.2); stylised models for the procedural enemies
and bosses (done, §15); 1796 ruins from a broken-wall kit instead of stepped blocks; people,
carriages and props in the 1789 Ehrenhof (done, §14); Festsaal paintings.

## 14. The 1789 Ehrenhof lived in (2026-11-19, round 7 follow-up)

Before: an empty, burnt-out sand plane between the wings (real GPU, `v2-places-before-*`).
After (`v2-places-after-*`, same views, 100 fps vsync-capped on M5 Pro at high, unchanged):

- **Paving, not sand:** a grey-brown cobble field (CC0 `cobblestone_floor_01` layer) framed by
  worn sandstone bands along the wings, dark gutters, a sandstone walk on the axis from the gate
  to the vestibule and cross walks to the wing doors; a red sandstone **rosette with a star**
  round the era anchor, so "the middle of the Ehrenhof" is a place one can see. Sandstone is a
  muted grey-beige (the summer light and the memory grade warm it; a saturated tone turned
  orange against the sun).
- **Overexposure:** the 1789 gravel layer of the terrain is brightened ×1.12 instead of ×1.45 —
  the walks and the forecourt no longer burn out to white.
- **Furniture:** iron lantern posts with warm glass, orange trees in green Versailles tubs along
  the wings and before the Corps de logis, two flagpoles with blue-white lozenge banners at the
  gate, a dark red coach parked by the south wing, market stalls with striped awnings, crates,
  baskets and barrels on the square outside the railing.
- **People:** the court's guards, courtiers, maids and servants are the sepia ink silhouettes of
  the K3 crowd (same material, one family of ghosts): guards at the gate and at the steps, groups
  of two and three talking with a raised hand now and then, servants crossing with bundles, a
  chair or a painting, a guard on his round, and a ghost coach with its horse that rolls in,
  waits at the steps and leaves. Not on the low tier.

Still open: a garden parterre (box hedges, beds, fountain) east of the Corps de logis; dressing of
the other past-era places (the Orangerie in 1789, the Karlslust); CC0 models for the coach and
the lanterns instead of the kit pieces.


## 15. Creature & boss models (2026-11-19)

No CC0 creature in the listed sources fits a mist wraith, a paper bird or a ledger, so every
procedural family is now a **sculpted multi-part body** (`src/systems/combat/visuals-shapes.ts`:
shroud with a pointed hood and tattered hem, mask, trailing tail, limb, claw spike, flame and drop
lathes, displaced flat-shaded rocks, crystals, rounded blocks, sheaves, tori, curled pages, folded
wings; each fitted to the unit box so a part's size stays its extents) on instanced pools, one per
shape, with an ink outline (no outline on sheets). Surfaces per part (`MAT` in `bodies.ts`):

- **Spectral** (mist family): a dark ink body (never transparent, never a white blob), a family-tint
  fresnel rim, an ink band inside the rim by day, drifting flow bands, a small heart seen *through*
  the body (distance of the view ray to the core, ≤ ~12 % of the height), frayed hems.
- **Mask**: pale bone with slanted eye hollows and a shadow under the hood.
- **Paper / flame / crystal / rock** (ember veins) / **stone** (chisel bands) / **straw** (stalks with
  dark bundle gaps).
- **Death dissolve** per family: a noise front eats every piece from below in ≈ 1.2 s with a burning
  edge in the family colour (mist cold blue, paper ember, stone orange, straw fire) and char behind it.
- **Size variance**: every template rolls ±10–20 % per individual; gameplay numbers unchanged.

Families: **Nebelling** hooded wraith (mask, ember eyes, clawed sleeves, trailing tail, cold heart);
**Irrlicht** iron lantern round a flame orb with three orbiting cold flames; **Mahnbrief** paper
crane with beating wings and a wax-seal eye; **Glutling** coal lump with a flame crown; **Grusling**
mortar lumps on stubby feet; **Steinfresser** rock brute with a crystal heart and back crystals;
**Nebelweber** tall shrouded caster with crystal hands and threads; **Foliant** a walking tome with a
gilt board; **Scherbling** shard ring round a flame; **Rufer** shroud with a horn mouth.
Bosses: **Schuldbuch** an open giant ledger — covers opening towards the player, six page pinions per
side beating as wings, turning pages, ribbon pages, a wax-seal eye with a crystal iris;
**Strohmann** bound sheaves with cord ties, burning at the head, shoulders and flail ends;
**Steinbrecher** carved sandstone blocks (cornice brow, volutes, bosses) with ember seams in the big
blocks; **Pikeur** the CC0 human rig seated on the CC0 horse (thighs over the flanks, bent after the
mixer, hips at the horse's Torso bone), whip = sword slash, a black tricorn with a brass band (low tier
keeps the procedural rider).

Real GPU (M5 Pro, Metal, 1440 × 900, high): every showcase scene 92–100 fps (vsync cap 100), the
Pikeur 92–96 fps. Open: the Strohmann still reads stiff (a straight torso of sheaves), the
Steinbrecher stays blocky by design but could use broken edges; no CC0 rigged creatures used.

## 16. Third-person camera and the player character (2026-11-19)

- **Who you are:** a present-day visitor. The default is now the authored MPFB player (see below and
  `scripts/chars/mpfb/README.md`); the rest of this bullet describes the earlier CC0 surveyor
  (`?avatar=surveyor`) — olive field jacket, hi-vis orange vest panel, dark
  work trousers, boots, an orange backpack, a brass lantern on the left hip (lit at night, it lights
  the scene from the character) and the red / white Messstab across the back, in hand in a fight.
  Model: CC0 Quaternius adventurer (poly.pizza), recoloured per material slot, kqStandard shading,
  no hat, no armour, nothing from any commercial game.
- **Camera:** over the right shoulder, character in the lower-left third, 3.6 m by default (wheel
  1.8–8 m); pulls back and up in fights so the pack fits; two-shot in conversations; never inside a
  wall, trunk, hill or ceiling. First person stays as an option (F5 / Einstellungen).
- **Readability:** a thin warm additive ring under the target (no colour-only meaning: it also
  rotates); off-screen attackers as chevrons around the character, pulsing on a wind-up; enemies
  keep 0.95 m + radius off the body so they never sit inside it.
- Before / after (headed Chromium, Metal, 1440 × 900, high): `test-results/look/shots/v2-camera-*`.
- **Authored player (2026-11-21, now the default):** the MPFB character (built by
  `scripts/chars/mpfb` from `specs/player.json`; its look is described in that README's player
  section); `?avatar=surveyor` wears the earlier CC0 surveyor. Its court disguise
  is built as outfit pieces, not a recolour: a plain 1780s secretary in a dark-blue coat cut away
  over a cream waistcoat, skirts to the knee, a white stock, black breeches, white stockings, black
  buckled shoes and a plain black tricorn. Each costume stays within the hero budget (≤ 25k
  triangles, ≤ 8 draw calls visible).

## 17. Integration of the round 8 tracks (2026-11-19)

Nature round 2 (§5.2), the creature and boss models (§15), the lived-in 1789 Ehrenhof (§14) and the
third-person camera with the player character (§16) merged into `main` as one look. Checked on the
real GPU (headed Chromium, Metal, M5 Pro, 1440 × 900, high; shots in `test-results/look/int/`):

- **One look:** the surveyor stands in the model forest, the Ehrenhof court and the 1793 / 1796
  scenes with the same kqStandard shading as the trees and the palace; the creature ink outlines read
  against the model forest and over the character's shoulder; the camera's trunk collision uses the
  slimmed model trunks (radius ≈ 1.6 % of the stand height, the trees' own slimming ≈ 1.8 %); the
  Ehrenhof props are collider solids, so the spring arm stays out of them too.
- **Frame rate, uncapped** (other e2e runs on the same machine): forest 160–210 fps, title 150,
  palace 1789 ≈ 100, Ehrenhof 1789 ≈ 100, Ehrenhof today 155, night 1793-02 163, fire night
  1793-07 ≈ 90, 1796 180; live boss fights in third person (Strohmann, Steinbrecher) 260–290 fps,
  a five-enemy pack in the forest ≈ 175 fps (≈ 335 draw calls). `kq.bench` frame avg / p95:
  today-forest 7.1 / 7.1 ms, 1789-ehrenhof 9.3 / 10.9 ms, Festsaal fire 15.1 / 19.7 ms (≈ 66 fps,
  p95 ≈ 50 fps — the one scene still under 60 at its worst frames).
- **Fix at integration:** a boss title card still fading out was left on screen for good when the next
  boss's card came and went (a later hide cancelled its removal timer); each fading card now owns its
  timer and a new card clears any fading one (`combat/hud.ts`).
- **Still open:** the Festsaal fire's worst frames; a close enemy straight ahead can hide behind the
  character's body (no avatar fade toward the locked target yet); loot glows read as white balls
  on night snow; a few motes still show in the 1789 day sky; the Strohmann stiff, the Steinbrecher
  blocky; no IK on the surveyor; the unused Poly Haven rock sets / fern_02 still sit in the manifest.

## 18. Real-GPU playtest round 9 (2026-11-20)

Two testers (a new player and a tour) on the real GPU. Checked with headed Chromium (Metal,
1440 × 900, high; shots in `test-results/look/r9/`):

- **Creatures:** the Irrlicht is a wisp (heart orb, flame drop, halo, dark eye hollows, orbiting
  motes, a trailing tail; no lantern cage); its sparks are larger with a halo and a longer trail.
  The Rufer is a hooded shroud with a bone mask, a glowing mouth ring and raised clawed arms; the
  Foliant is a book golem (bound-volume torso, book head, an open tome as shield, page wings); the
  Nebelweber has a shoulder shroud and sleeve tails; the Mahnbrief is twice the size, with no ground blob.
- **Glare:** the Bannlicht flare and the dazzle overlay are capped (overlay ≤ 0.38, reduced flash
  0.2); pickup glows are a soft tint (HDR 2.4 instead of 6), not white balls.
- **Ehrenhof:** the court rosette is a stone inlay (warm grey), not a red disc.
- **Camera:** the fight shoulder is higher (lift 0.45) and rises over a boss's body; a conversation
  frames the speaker from the player's side; the avatar fades (dither) when the lens comes close or
  the locked target is behind it.
- **Reeds / grass** duck out of the line between the camera and the lantern (no wall of blades in
  front of the light).
- **Focus ring:** the canvas has no browser focus outline.
- **Palace draw cells** (see ARCHITECTURE): 1789 Ehrenhof 112 fps (≈ 100 before).

Frame rate this round was measured under heavy machine load (Spotlight indexing at ~350 % CPU);
the forest A/B (same spot, same build, old vs new) moved between 20 and 57 fps on the *old* build
too, so no regression is attributable to this round; not re-benchmarked on a quiet machine.

Still open: the 1793-07 window flames and the smoke column (reads as a skull at some angles);
the 1796 stepped ruins and the sky ellipse; relief views hiding vegetation; the red bushes; the
light-shaft quad; ghost props near the player; the wireframe market stall; the Messstab in hand.

## 19. The Karlsbergquelle (2026-11-20)

The spring that starts the time travel (NEXT-SESSION §3.6). Set `src/systems/scenery/quelle.ts`,
water `src/systems/quelle/water.ts`. Reference for today: a photo of the real spring (komoot
highlight 780842). The whole hollow is kept free of trees and scattered props.

| Era | Stonework | Water |
| --- | --- | --- |
| **Today** (real) | low dry wall of red sandstone (`#a86f58` / `#8e5a47`, moss on top) with a small plate; a hollowed log trough on two stumps; an iron pipe; up the slope an arched spring house sunk into the earth, heaped stones on its flanks, an iron grate; mossy steps on the left; edge blocks along the red path; an info board at the trail; ferns | a still, slightly murky pool; a thin stream from the pipe; the brook a wet bed with a broken trickle and small pools |
| **1789** (invented) | a dressed baroque Brunnenstube: pale ashlar front (`#d8c3a2`, warm `#c9ab86`), round-arched niche, pilasters, cornice, a bronze spout (`#b8923e`), a stone basin with a rim moulding, a flagged apron; the old dry wall goes on either side; a plank door on the spring house | clear and deeper teal; the spout runs |
| **Feb 1793** | the 1789 set with icicles (`#dde8f0`); the prop material puts snow on top | milky, cracked ice with no ripples; the brook iced; no trickle |
| **Jul 1793** | the 1789 set in the fire night's glow | dark; fire and lantern light glint on it |
| **1796** | plundered: the spout torn out, cornice stones on the ground, the basin cracked, apron flags missing, the spring house door gone, more and larger ferns | low and murky, leaves in the brook, no stream |

**The magic** (cool cyan, a touch of gold, never white):

- **Guide:** motes drift down the brook and hover over the water, with a soft additive light column
  over it. The column fades to nothing before the sprite's edge, so no quad shows.
- **Touch:** a ripple ring runs out and freezes, the water gets a glassy sheen, cyan / gold caustics,
  and the brook's ripples climb back up. The new era's water starts frozen and thaws.
- **Under the canopy:** the sky reflection is dimmed (fresnel 0.7 → 0.45), so the water does not glow
  in the shade.

**Palette note: untextured kit pieces need lighter hexes.** The scenery kit
(`src/systems/scenery/kit.ts`) converts each piece's vertex colour sRGB → linear **twice**:
`Color.setHex` already converts under three's colour management, then `convertSRGBToLinear()` runs
again. An untextured piece therefore renders much darker than its hex. That is why `C` in
`src/systems/scenery/props.ts` uses mid and light tones, and why the spring's moss, earth and fern
are set to `#7f9150`, `#9c7a5a` and `#7f9f4c`. Pick kit hexes about one step lighter than the target
and check them on the real GPU. Do not "fix" the kit on its own: every existing set is tuned against
the double conversion.

**The brook past the Bleiche.** The Karlsbergbach is drawn 80 m (`BROOK_LEN`) along the OSM line,
down the ravine and out past the 1789 laundry green, whose wash corner stands on its bank; the last
6 m fade out beyond the green. Each sample snaps to the lowest ground within ±3 m, as before. In
1789 the meadow by the green falls away northwards, so the snap stays out of the Bleiche's
clearings (`KEEP_OFF`). The bed stays ≥ 1.6 m from the beating board and the linen (tested). Bank
stones, moss and ferns run the whole length in every era's look. Past the stretch the look pass
tuned (46 m, `BROOK_REF`) the ferns stand further apart, because each CC0 clump is ~5.6k triangles.
Nothing stands on today's OSM footpaths: a fern moves to the other bank instead. In 1789 nothing
stands on the green. The touch's light pulses on the brook stretch with the drawn length
(`brookPulse`), so the run-back crosses the whole brook in the time it took on 46 m. The guide
motes along the brook grow in number with the length.

Still open (look polish runs in another session): ivy on the wall, the burning palace reflected in
the July water, an ice crust to break in February 1793.

## 20. Real-GPU playtest round 10: look fixes (2026-11-20)

Report `docs/PLAYTEST-ROUND10.md`. Checked in headless Chrome on ANGLE Metal (Apple M5 Pro,
1280 × 720, high), before / after from the same views.

- **Nebelinge on the forest floor (F-04).** In daylight the spectral body showed as a dark blob, and
  only its health pips read. The rim is now a light, not an ink edge: the family tint runs round the
  silhouette (stronger in pale day fog), and the heart is brighter (0.6 → 0.8). Just inside the rim
  the body darkens a little, so the pale edge stands against the dark core. The inverted-hull outline
  of a spectral body takes the family tint (× 0.8) instead of ink, so it reads as a pale-blue halo on
  leaf litter, meadow and snow. The body stays dark and misty, with no white blob. Checked in all five
  eras, at dusk and at night.
- **Ferns part round creatures (F-04, F-21 part).** Ferns, bushes and flower clumps (the swaying
  `NatureProps` kinds) lie down and spread within an enemy's radius + 1.4 m (at least 1.9 m). They
  sink to ≈ 22 % height and spread × 1.3. `src/world/vegetation/duck.ts` holds 8 slots (nearest to
  the camera, ≤ 46 m) that combat fills every frame, and the props' vertex shader reads them.
  Flyers 2.5 m or more above the ground do not count. A Nebelling standing in a fern clump is now
  seen whole, with its ground ring.
- **Foundations in 2025 (F-14).** The mossy foundation lines of the vanished buildings sat on the
  ground under their centres. On the Orangerie's step they hung up to 0.7 m in the air (74 floating
  vertices at KB-B10). A run down a slope now steps in shorter stones, each falling at most 0.3 m
  along its length (`foundationStones` in `src/systems/interiors/builder.ts`). Every stone reaches
  0.3 m below the lowest ground under its corners. A run along the contour stays one long stone.
  Result: 0 floating vertices. The stone is a little lighter (`#8a8a74`, moss in patches up to 75 %),
  so the lines read as weathered stone, not dark-green slabs.

Not taken here: the black cone (F-15) did not reproduce, from the report's spot or with its quest
state. The straight-edged flat black wedge, seen together with a missing player, looks like a single
exploded triangle (degenerate or NaN vertex) more than a scene prop. The camera findings (F-03,
F-07 / F-08, F-21 trunks, F-31, F-35) belong to the camera session.

## 21. The historical twins (2026-11-20)

Two real men of the court have roster ids: **Johann Christian von Mannlich** (`mannlich`) and
**Duke Karl II. August** (`herzog`; alias `karl-ii-august`), flagged `historical: true` in
`src/systems/npc/roster.ts` (heights 1.76 / 1.80 m). Every other figure stays fiction. The identity
API (`rosterId`, `TWINS`, `isTwin`, `NpcPlacement.look`, `twinEcho()` in `src/systems/npc/twins.ts`)
is in place. Their own look is being rebuilt on an authored-mesh pipeline, after the public-domain
portraits in `docs/reference/people/`. Until then they wear the generic official's look (powdered
wig, bareheaded), every figure is a ghost, and `twinEcho()` returns null, so the Chronik echoes keep
their smoke silhouette.
