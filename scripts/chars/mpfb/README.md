# MPFB characters (kqchar)

Data-driven characters on the MakeHuman base mesh, built in headless Blender. A new character is
**write a spec, run the build**. The people of the tour (featured / extra tiers, drawn by
`src/systems/people/`) start with `specs/guide.json`; the player spec (hero tier) and its build
script ship with the avatar MR. Install MPFB first (see [`../README.md`](../README.md)).

## Commands

```sh
# build a spec into a raw GLB (+ a .blend to inspect, + stats)
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/build.py -- --spec scripts/chars/mpfb/specs/<name>.json \
  --out /tmp/kq-chars/<name>.raw.glb --blend /tmp/kq-chars/<name>.blend --stats /tmp/kq-chars/stats.json

# bake the clips from a Quaternius human already in the repo onto the character (copy the GLB to a
# temp dir first; repo assets are never modified). Writes the GLB with clips and a check report.
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/retarget.py -- --char /tmp/kq-chars/<name>.blend \
  --src /tmp/kq-chars/surveyor.glb --clips all --glb /tmp/kq-chars/<name>.glb --report /tmp/kq-chars/retarget.json \
  --abduct 16 --stand Idle,Idle_Sword,Interact,Wave,HitRecieve --stand-width 0.06 --stand-abduct 8

# pack for the browser (meshopt, prune) into the repo
pnpm assets:pack /tmp/kq-chars/<name>.glb public/assets/models/chars/<name>.glb

# previews (Cycles CPU, small): busts, and contact frames of clips
blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_bust.py -- \
  /tmp/kq-chars/<name>.blend /tmp/kq-chars/r --views front,34,side --size 440 [--view AgX] [--morph smile]
blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_clips.py -- \
  <blend with clips> /tmp/kq-chars/clips --clips Walk,Run,Wave,Sword_Slash --frames 4
```

The player GLB is not in the repo yet (it ships with the avatar MR); once packed and listed in
`src/assets/manifests/chars-mpfb.ts`, `kq.spawnAsset('<asset id>', x, z, { yaw })` places it for art
review.

### A person of the tour (featured / extra tier): the guide

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/build.py -- --spec scripts/chars/mpfb/specs/guide.json \
  --out /tmp/kq-chars/guide.raw.glb --blend /tmp/kq-chars/guide.blend --stats /tmp/kq-chars/guide.stats.json
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/retarget.py -- --char /tmp/kq-chars/guide.blend \
  --src /tmp/kq-chars/surveyor.glb --clips Idle,Walk,Run,Interact,Wave --point Interact \
  --glb /tmp/kq-chars/guide.glb --report /tmp/kq-chars/guide.retarget.json \
  --abduct 3 --stand Idle,Interact,Wave --stand-width 0 --stand-abduct -12 --stand-knee 5 \
  --stand-feet 0.095 --stand-toe 8 --stand-upright 0.8 --stand-lean 5 --level-head 1 --relax-fingers 30
pnpm assets:pack /tmp/kq-chars/guide.glb public/assets/models/chars/guide-mpfb.glb --anims Idle,Walk,Run,Interact,Wave,Point
```

The build log ends with `[palette] LOD0 … tris / … calls, LOD1 … tris, height … m` and any
`OVER BUDGET` line; the stats JSON has the same numbers (`triangles`, `draw_calls`, `lod1`,
`height`, `palette`, `budget_issues`). The game draws it for people spec `guide`
(`src/systems/people/authored.ts`); a new person is a spec here, a manifest entry in
`src/assets/manifests/chars-mpfb.ts` and `authored: { model, cloth }` on its people spec.

## Pipeline (`kqchar/`)

1. `human.py`: MPFB base mesh, body and face targets, expression units baked as morphs (`rest`
   expression in the base, `smile` and `blink` as morph targets), the 53-bone `game_engine` rig.
2. `beard.py`: the beard. `mode: solid` is a sculpted shell on a structured grid over
   the jaw: columns fan round the face from a centre inside the jaw, rows run from the cheek line to
   the neck line (both smooth curves from landmarks). Two rows of each column inside the mouth width
   sit on the lip outline and a column lands on each mouth corner, so the lip opening is a clean loop
   that follows the smile. Thickness is fullest at the chin; the outer ring tucks under the skin.
   Downward clumps carry darker roots and lighter tips, at uneven spacing (`spacing_jitter`). The
   cheek line is broken into tufts and notches (`edge_jitter`), and the skin under and just beyond
   the beard edge takes a stubble tint (`palette.stubble`). The fourth `lip_margins` value tucks the
   lower lip under the beard (a fraction of the lips' height). Weights and morphs come from the skin
   under each grid point (blended with nearby skin where the shell hangs close to it).
3. `hair.py`: a solid sculpted hair shell over the scalp (comb field, streamline clumps, lighter
   strands and optional lighter clump tips as vertex colour, a side-part groove with a scalp line);
   no alpha cards. A short skin-to-hair blend below the hairline (`hair.hairline_blend`) softens the
   edge. A soft shadow
   band below the hairline (`hair.hairline_shadow`) sets the hair into the skin.
4. `lod.py`: decimates the body to the budget, keeping the face, then cuts the low body along the
   hem, cuff, boot-top and collar planes (`cut_plane`), so those zone borders are straight lines
   instead of a sawtooth of whole triangles. The collar plane is tilted (`collar_tilt`), lower at the
   throat, so the skin / jacket border sits under the collar band all round.
5. `outfit.py`: the modular wardrobe (below) as material zones and offsets on the body, plus solid
   trims and gear (collar, a straight hem band, cuff bands, zip, pocket flaps, boot collars, daypack).
   The neck skin inside the collar is shaded up to just under the collar's top edge
   (`palette.collar_shadow`), and the neck faces hidden inside the collar are removed (`collar_cull`),
   so no pale gap, no slivers and no jacket shards show between the collar and the neck.
6. `face.py`: skin colours (rosy cheek apples kept below the lens rim with `cheek_top`, a rosy nose
   tip, a warmer neck, an upper-lid line, soft smile creases at the outer eye corners, a lip
   outline), eyes (with a
   catchlight), brows and a strip of upper teeth behind the upper lip (with tooth separations);
   `glasses.py`: a separate `avatar-glasses` object, rigid on the head bone. The temples run
   straight back from the hinges (`temple_straight`) and only follow the head out near the ear, into
   the hair, so they never splay out past the face (`temple_drop` points, if any, bend the ends down).
7. `parts.py`: joins everything into one skinned mesh (`avatar-body`), one material per semantic
   name, flat palette colours in a vertex colour attribute (no textures).

8. `palette.py` (featured / extra tiers only): the shared palette and the budget check (below).
9. `lod.py` `lod1`: the LOD1 copy (below). `lanyard.py`: the guide's lanyard and name badge
   (`wardrobe.lanyard`).
10. `shell.py` (people tiers): garment solids over the body. `jacket.hang` lets the jacket's trunk
   hang straight down from the chest and shoulder blades (it bridges the waist and the spine groove
   instead of hugging them); `jacket.skirt` is the jacket's hip part, a ring of rows from the body
   hem down to a straight hem about 8 cm over the crotch, with a hem band and an inward lip, so the
   jacket hangs over the trousers all round; `jacket.zip_solid` sweeps a centre zip (with a lighter
   pull) down the dressed front, each ring weighted like the cloth under it; `shoes.solid` builds
   walking shoes (an upper with a rounded toe and heel, a thick sole with a proud ledge) and the
   shoe zone ends at an ankle plane (no wedges up the calf). Body faces fully hidden under these
   solids (the feet, the hips under the skirt) are dropped, which pays for them.

Budget (hero tier): at most 25k triangles, 8 draw calls, textures at most 1k (the player uses none).

## People tiers: one shared palette material, LOD1

The people of the tour share their budget with the whole frame (a CC0 stand-in costs 10–15 draw
calls and clones its materials per person; a tour group is 16 people), so a featured or extra spec
builds differently from the hero:

| Tier | LOD0 | Draw calls | LOD1 |
| --- | --- | --- | --- |
| hero (player) | ≤ 25k tris | ≤ 8 (one material per zone) | none |
| featured (guide, doubles, child) | ≤ 12k tris | ≤ 4 (the guide: 1) | about 50 %, beyond 15 m |
| extra (tour members) | ≤ 6k tris | ≤ 2 | about 50 %, beyond 15 m |

**Shared palette (`palette.py`), vertex-colour route.** Every surface colour of a body is already
baked into its colour attribute (COLOR_0) by the steps above. For `budget.tier` featured or extra
the build then joins all objects into the body (glasses, if any, ride the head bone), and
replaces the semantic materials (Skin, Hair, Jacket, Trousers, Gear, Eye …) with ONE material
`People`. Skin, hair, clothes, shoes and eyes are one draw call. `budget.eye_call: true` would put
the eyes and glasses into a second material `PeopleEye`; the guide does not need it.

Why vertex colours and not a palette texture: the material then carries no colour at all, so the
game can draw every person, every variant and every GLB with the SAME three.js material instance
(`peopleMaterial()` in `src/systems/people/authored.ts`). There is no per-person clone and no
material switch between people. A palette texture (UVs snapped to swatches) would need either one
global atlas that every new spec re-packs (and every GLB re-points its UVs at) or one texture per
GLB, which means one material per GLB and no sharing. Vertex colours also keep the soft painted
detail (cheeks, lid lines, the cloth's top light), which swatches would flatten. The cost is one
roughness for the whole body (0.72) and no per-zone emissive; at the people's distances that does
not read.

The semantic zone of every face stays in a face attribute `kq_zone` (names in the mesh property
`kq_zones`, not exported), so `retarget.py`'s mesh checks still tell skin from cloth.

**Palette slots** (`palette_slots` in the spec): `skin`, `hair`, `top`, `bottom`, `shoes`,
`accent`, each a palette key or a hex colour. Every palette entry the steps paint with is a shade of
one of them (the guide: skin, brows as hair, softshell, trousers, walking shoes, the lanyard). The
stats list the resolved slots (`palette`); an extra's variant is a spec that overrides the slots.

**LOD1 (`lod.py` `lod1`).** A copy of the finished body, `avatar-body_lod1`, decimated to
`budget.lod1_ratio` (0.5) of its triangles (collapse, symmetric in x; `lod1_keep_face` protects the
head a little), the same materials and vertex groups, limited to 4 influences, the same armature:
the GLB carries it skinned to the same rig (the pack step merges the two skins into one). No morphs:
beyond 15 m a smile or a blink does not read. The game switches to it beyond `PEOPLE_LOD.lod1`.

**Budget check.** `palette.check` compares the stats with `budget.max_triangles`,
`budget.max_draw_calls` and the LOD1 ratio (0.35–0.65); issues go to the log (`OVER BUDGET`) and to
`stats.budget_issues`. At low budgets `budget.hand_keep` protects the fingers from the body
decimation, so a pointing hand still reads, and `budget.ear_keep` the ear rim (a decimated rim
turns the ear tips pointed). `budget.face_keep` (the face in front of the ears) and
`budget.body_keep` (everything off the head) balance the rest: without a body share the collapse
eats the near-flat cloth first and leaves faceted shoulders and legs of a few dozen triangles (the
guide: about 5.7k on the head, 4k on the clothed body, 1.5k on the hands).

**Baked ambient occlusion (`ao`, `palette.bake_ao`).** With no texture, the creases carry their own
shade in the vertex colours: per vertex, rays over the outer hemisphere (`ao.rays`, up to
`ao.distance` m) give the unoccluded share, and the colour is multiplied by
mix(1, visibility, strength) per zone (`ao.zones`, e.g. Skin 0.6). The eye sockets, the underside of
the brows, nose and chin, the ears, the collar and the armpits keep a value range under the game's
flat ambient light, without touching the scene's lights. `ao.smooth` averages the visibility over
edge neighbours (passes), so a coarse mesh shows no blotchy dark facets (the inner ear), and
`ao.floor` keeps a minimum visibility.

## The guide (`specs/guide.json`)

The placeholder tour guide "Gerold Imhoff": an invented, generic face.
Very tall (macro height 0.635, 1.95 m) and lanky (low weight, narrow torso, thin limbs, a longer
neck), about 50 (macro age 0.69), bald (`hair.style: bald`, no hair mesh) with a lowered, rounded
skull (`face.skull`: the crown comes down and the slices round toward a dome, so the head is no
cone or egg; about 7 heads tall with `head_scale` 1.17), clean-shaven, a calm friendly look (a soft,
symmetric mouth-corner pull with the cheeks lifted, `lr-cheek-trans-up` and slightly open lids, so
the smile reaches the eyes; soft-edged mid-brown brows, `brow.soft` and `palette.brow_tint`; dark
pupils with a catchlight). Rounded ears (`lr-ear-shape-round`, `budget.ear_keep`). A fair-to-medium
warm skin with rosy cheeks, nose and ears and baked occlusion (`ao`). Practical modern clothes: a
hip-length forest-green softshell (#3E6A4C, a touch warm so it stays green and not teal at night;
closed stand collar with a darker lining, a solid centre zip with a light pull, cuffs, a hem band,
no chest flaps), grey straight trousers, brown walking shoes with a thick dark sole, a mustard
lanyard (#D4A72C, warm but neither orange nor red) with a light badge (`wardrobe.lanyard`).
Featured tier: LOD0 11.6k tris, LOD1 5.8k tris, one draw call each.

Clips: the same retarget bake (Idle, Walk, Run, Interact, Wave from the surveyor). The slim trunk
needs no swing-out: `--abduct 3` while walking. The standing clips bring the arms in to hang close
to the body (`--stand-abduct -12`, a negative value adducts) and stand him up: knees about 5 degrees
(`--stand-knee`), ankles 9.5 cm off the middle with the toes 8 degrees out (`--stand-feet`,
`--stand-toe`), the source's stoop mostly given back (`--stand-upright 0.8`) with a slight forward
lean of the upper spine and neck (`--stand-lean 5`) and a level head (`--level-head 1`); every clip
gets relaxed, gently curled fingers (`--relax-fingers 30`). Plus **Point**:
`retarget.py --point Interact` copies the retargeted Interact (a forward reach of the right arm) and
poses the reaching hand to point (index straight, middle / ring / pinky curled into the palm, the
thumb tucked; eased in and out with the reach). The people's `point` plays it.


## The spec

`specs/<name>.json`, merged over an optional `"extends": "<other>.json"`:

- `body.targets` / `face.targets`: MakeHuman target weights (body and face shape).
- `face.expressions`: `rest` (baked), plus named morphs from the CC0 expression units.
- `hair`, `beard`, `glasses`: shape parameters (hairline curve, volumes, beard thickness per zone, lens size, rim).
- `wardrobe`: modular slots, each with palette keys:
  - `jacket` (`style`, `colour`, `trim`, offsets, collar, `blocks` for colour-blocked panels),
  - `shirt` (sleeves long / short, collar), `trousers`, `shoes`, `bag` (daypack).
  Set a slot to `null` to leave it out. Modern NPCs reuse the same slots with their own palette.
- `budget`: `tier` (hero / featured / extra), `max_triangles`, `max_draw_calls`, `skin_ratio` (body
  decimation), `face_keep`, `back_of_head_keep`, `body_keep`, `hand_keep`, `ear_keep`, `lod1_ratio`,
  `lod1_keep_face`, `eye_call`.
- `face.skull` (bald heads): `base` (m over the eyes where it starts), `lower` (share of the dome
  height the crown comes down), `round` (how far the slices pull toward a round dome).
- `face.brow`: `soft` blends the brow's edge rows and tail into the skin; `palette.brow_tint`
  ([amount, spread m]) tints the skin under and round the brow.
- `wardrobe.jacket` (people tiers): `hem_above_crotch`, `hang` {`from`, `slope`, `amount`}, `skirt`
  {`above_hem`, `columns`, `rows`, `clearance`, `flare`, `settle`, `legs`, `band`, `band_out`, `lip`,
  `colour_band`, `show_below`, `tuck`}, `zip_solid` with `zip_samples`, `zip_width`, `zip_thick`,
  `zip_raise`, `zip_colour`, `zip_pull`; `collar_closed`, `collar_segments`, `collar_smooth`,
  `collar_lining`, `collar_trim_colour`; `cuff_colour`, `cuff_lift`, `cuff_smooth`.
- `wardrobe.shoes.solid` with `top` (the ankle plane), `sole_h`, `sole_flare`, `toe_h`, `collar_z`,
  `sections`, `around`.
- `wardrobe.lanyard`: also `samples` and `smooth` (the strap path smoothed, never into the cloth).
- `ao` (people tiers): `distance`, `rays`, `default`, `smooth`, `floor`, `zones` (strength per zone), see above.
- `palette_slots` (people tiers): the six slots, see above.
- `wardrobe.lanyard`: `colour`, `badge`, `width`, `badge_size`, `badge_below_neck`, `strap_x`.
- `palette`: every colour by name (sRGB hex); `materials`: roughness / specular per material, and an
  optional `emit` (linear RGB emissive factor; skin, hair and beard use a faint warm one so they keep
  their warmth under cold moon or lantern light, with no scene or tone-map change).

**Body variants:** a variant spec only overrides what differs, for example
`{"extends": "guide.json", "body": {"targets": {"torso-scale-horiz-decr": 0.0}}}` for a broader man,
or swap the wardrobe palette for another NPC.

## MakeHuman proxies (hair, brows, lashes, beard, clothes, shoes): status

The MPFB 2.0.18 extension ships no proxy assets: its `data/` folder holds only the base mesh, targets,
rigs, poses, expressions, node trees, textures and UV layers. Proxies such as hair, eyebrows,
eyelashes, beards, clothes and shoes come in separate MakeHuman asset packs. To try them:

1. Download only the CC0 system-assets pack from the official makehumancommunity source, into a
   fresh `~/.cache/kq-chars/kits/mpfb/<pack>/`. Packs under CC-BY or an unclear licence stay out.
2. Load it through MPFB's own asset loader. Nothing from the zip is run by hand.
3. Credit each asset used in `public/assets/LICENSES.json`.

Until then, everything is our own geometry. Beard routes in `kqchar/beard.py`:

- `mode: solid`: the sculpted shell on a structured grid (r4). If the CC0 pack is used
  later, its beard proxy gets compared against this shell.
- `mode: skin`: a displacement of the face, used in r3. The critic rejected it: the colour edge
  reads as skin paint.
- Default: an offset shell cut along the mask.

## Animations: retargeting (`retarget.py`)

The clips come from the Quaternius humans already in the repo (the rigged humans in
`src/systems/characters/catalog.ts`; `models/camera/surveyor.glb` has the widest set, 16 clips).
The bake is a world-space rotation transfer with rest-pose alignment:

- **Bone map:** Hips to pelvis, Abdomen / Torso / Chest to spine_01..03, Neck to neck_01, Head to
  head, Shoulder to clavicle, UpperArm / LowerArm / Wrist to upperarm / lowerarm / hand,
  UpperLeg / LowerLeg / Foot to thigh / calf / foot, fingers 1..3 to the finger bones.
- **Limbs and fingers** take the source's bone direction (T-pose rest vs our A-pose). The trunk,
  clavicles and feet take only the source's change from rest.
- The Quaternius rest sits far from where its clips put the rig, so the rest is moved by the Root
  bone's rest-to-pose transform first.
- The pelvis takes the hips' motion, scaled by the hip-height ratio.
- `--abduct` swings hanging arms out a few degrees so a stockier trunk keeps the hands clear of the
  hips. Standing clips (`--stand`) can use their own, smaller value (`--stand-abduct`, arms closer
  to the body; negative brings a slim body's arms in) and a wider stance (`--stand-width`, metres
  added between the planted feet).
- **Feet:** the source's Idle stance is the flat-foot reference (`--ankle-ref Idle`), since its
  T-pose rest feet are not flat.
- **Foot lock** (`foot_lock`, a reusable step on the baked pose matrices; `--lock 0` turns it off,
  `--no-lock Roll` by default):
  - Planted phases come from the source foot (its lowest 1.5 cm).
  - In a phase the ankle follows the source's planted path, scaled, plus the phase's mean offset, at
    our rest ankle height. Our stance width stays and in-place walks keep their treadmill speed.
  - The thigh and calf are re-solved with two-bone IK in their own bend plane.
  - The sole turns flat under the foot's heading.
  - Ramps of three frames lead in and out, and the lock fades out while the body is down (falls).
- Clip setup: before each clip the source pose goes back to its import state, so a clip never
  inherits the previous clip's unkeyed channels.

The report checks each clip for:

- knee / elbow bend against the source,
- foot sliding while planted, against the source, and the sole's pitch while planted (tiptoe),
- shoulder drop,
- hands inside the trunk (on the deformed mesh),
- glasses staying on the head, and the skin never coming through the beard.
