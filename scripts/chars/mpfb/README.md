# MPFB characters (kqchar)

Data-driven characters on the MakeHuman base mesh, built in headless Blender. A new character is
**write a spec, run the build**. The people of the tour (featured / extra tiers, drawn by
`src/systems/people/`) start with `specs/guide.json`; the player (hero tier) is `specs/player.json`,
built by `build_player.py`. Install MPFB first (see [`../README.md`](../README.md)).

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
  --abduct 6 --stand Idle,Idle_Sword,Interact,Wave,HitRecieve --stand-width 0.06 --stand-abduct 4 --knees 1 --knees-loco 0.6

# pack for the browser (meshopt, prune) into the repo
pnpm assets:pack /tmp/kq-chars/<name>.glb public/assets/models/chars/<name>.glb

# previews (Cycles CPU, small): busts, and contact frames of clips
blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_bust.py -- \
  /tmp/kq-chars/<name>.blend /tmp/kq-chars/r --views front,34,side --size 440 [--view AgX] [--morph smile]
blender -b --factory-startup --disable-autoexec -P scripts/chars/mpfb/render_clips.py -- \
  <blend with clips> /tmp/kq-chars/clips --clips Walk,Run,Wave,Sword_Slash --frames 4
# either script: --costume court shows the court pieces instead of the default outfit
```

A packed model listed in `src/assets/manifests/chars-mpfb.ts` can be placed for art review with
`kq.spawnAsset('<asset id>', x, z, { yaw })`.

### The player (hero tier)

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/build_player.py -- --out /tmp/kq-chars/player.raw.glb \
  --blend /tmp/kq-chars/player.blend --stats /tmp/kq-chars/player.stats.json
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/retarget.py -- --char /tmp/kq-chars/player.blend \
  --src /tmp/kq-chars/surveyor.glb --clips all --glb /tmp/kq-chars/player.glb --report /tmp/kq-chars/player.retarget.json \
  --abduct 10 --stand Idle,Idle_Sword,Interact,Wave,HitRecieve --stand-width 0.06 --stand-abduct 8 --knees 1 --knees-loco 0.6 \
  --stand-upright 0.8 --stand-shoulders 7 --level-head 1 --relax-fingers 30
pnpm assets:pack /tmp/kq-chars/player.glb public/assets/models/chars/player-head-mpfb.glb
```

The look (`specs/player.json`): a stylised face with big, open blue-grey eyes and catchlights,
smiling lower lids (`face.stylize.lower_lid`) and raised cheeks, an open smile with a soft hint of
teeth, fair rosy skin with pink cheeks, soft arched brows, bold glasses, a full copper beard (a
2-3 cm shell with soft clumps) with a darker moustache root and a feathered cheek edge, swept-back
copper hair with a side part, full on top and over the upper ears; a stocky build (wider waist and
hips, thick legs, a big head, about 5.6 heads tall); a matte red hiking jacket with a darker yoke,
a closed collar and a solid zip, a hanging hip part over slate trousers, dark brown laced ankle
boots, a teal daypack; and the court costume (`costumes.court`, an ivory waistcoat). Vertex colours with occlusion baked
per costume (`ao`), toon shading in the game (`shading: 'toon'`). The build's stats JSON lists each
costume's triangles and draw calls (`costumes`).

### A person of the tour (featured / extra tier): the guide

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/build.py -- --spec scripts/chars/mpfb/specs/guide.json \
  --out /tmp/kq-chars/guide.raw.glb --blend /tmp/kq-chars/guide.blend --stats /tmp/kq-chars/guide.stats.json
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  -P scripts/chars/mpfb/retarget.py -- --char /tmp/kq-chars/guide.blend \
  --src /tmp/kq-chars/surveyor.glb --clips Idle,Walk,Run,Interact,Wave --point Interact --talk Idle \
  --glb /tmp/kq-chars/guide.glb --report /tmp/kq-chars/guide.retarget.json \
  --abduct -4 --stand Idle,Interact,Wave --stand-width 0 --stand-abduct -12 --stand-knee 5 \
  --stand-feet 0.095 --stand-toe 8 --stand-upright 0.8 --stand-lean 16 --stand-hips 0.85 --level-head 1 \
  --relax-fingers 40 --talk-seconds 4 --talk-open 0.4 --arm-swing Walk=26 --walk-lean 5 --knees 1 --knees-loco 0.6 \
  --stand-shoulders 4 --walk-shoulders 7
pnpm assets:pack /tmp/kq-chars/guide.glb public/assets/models/chars/guide-mpfb.glb --anims Idle,Walk,Run,Interact,Wave,Point,Talk
```

The build log ends with `[palette] LOD0 … tris / … calls, LOD1 … tris, height … m` and any
`OVER BUDGET` line; the stats JSON has the same numbers (`triangles`, `draw_calls`, `lod1`,
`height`, `palette`, `budget_issues`). The game draws it for people spec `guide`
(`src/systems/people/authored.ts`); a new person is a spec here, a manifest entry in
`src/assets/manifests/chars-mpfb.ts` and `authored: { model, cloth }` on its people spec.

## Pipeline (`kqchar/`)

1. `human.py`: MPFB base mesh, body and face targets, expression units baked as morphs (`rest`
   expression in the base, `smile` and `blink` as morph targets), the 53-bone `game_engine` rig.
   Optional `face.stylize` (`stylize.py`) for a stylised face: the eye region grows about each eye
   centre (`eye_scale`, sunk back by `eye_sink` so the eyeball does not bulge, `eye_spread` apart,
   full strength inside `eye_inner` eye radii, faded out by `eye_outer`), then Taubin smoothing of
   the face front (`smooth` passes, `smooth_weight`) removes the realistic micro-forms (folds,
   creases, bags) while the lid margins (`lid_hold`, eye radii), lips and inner mouth are held;
   `nose_smooth` and `ear_smooth` simplify the nose and ears. Rest and morph shapes move together,
   so the smile and the blink keep working. Glasses and cheek paint scale with the face
   (`eye_radius_ref`, the radius before the eyes grew), not with the bigger eyes. `lower_lid`
   ({`deg`, `inner`, `outer`, `corner`: [full, none]}) turns the lower lid and the upper cheek up
   about each eye's horizontal axis, strongest at the outer corner, for smiling eyes; with eye
   slit / height targets narrowing the upper lid the eyes read about a quarter narrower.
   `face.eye_yaw_deg` turns each eyeball outward, so the iris sits in the middle of an opening that
   the lid targets moved outward (the eyes look straight ahead, not to the side).
2. `beard.py`: the beard. `mode: solid` is a sculpted shell on a structured grid over
   the jaw: columns fan round the face from a centre inside the jaw, rows run from the cheek line to
   the neck line (both smooth curves from landmarks). Two rows of each column inside the mouth width
   sit on the lip outline and a column lands on each mouth corner, so the lip opening is a clean loop
   that follows the smile. Thickness is fullest at the chin; the outer ring tucks under the skin.
   Downward clumps carry darker roots and lighter tips, at uneven spacing (`spacing_jitter`). The
   cheek line is broken into tufts and notches (`edge_jitter`), and the skin under and just beyond
   the beard edge takes a stubble tint (`palette.stubble`). A feathered edge: `edge_rows` rows rise
   from the skin to the full thickness (`edge_rows_cheek` lengthens that along the cheek line only),
   `edge_pow` shapes the rise, `clump_soft` (0..1) rounds the clump grooves and lifts their floor
   (soft waves, no hard dark streaks), `clump_edge_fade` fades the clump grooves out over the edge rows, and
   `edge_tint` mixes the cheek edge toward `palette[edge_tint_colour]` (default `stubble`), so the
   border melts into the skin. `moustache_dark` darkens the moustache roots so it parts from the
   skin by value. `stubble_lip_cut` [lo, hi] sets the lip weights over which the stubble tint fades
   out, and `skin_sink` (m) sinks the skin right under the beard, so no skin bump pokes through the
   shell where its rim tucks in. The fourth `lip_margins` value tucks the
   lower lip under the beard (a fraction of the lips' height). Weights and morphs come from the skin
   under each grid point (blended with nearby skin where the shell hangs close to it).
3. `hair.py`: a solid sculpted hair shell over the scalp (comb field, streamline clumps, lighter
   strands and optional lighter clump tips as vertex colour, a side-part groove with a scalp line);
   no alpha cards. A short skin-to-hair blend below the hairline (`hair.hairline_blend`) softens the
   edge. A soft shadow
   band below the hairline (`hair.hairline_shadow`) sets the hair into the skin. Stylised options:
   `smooth_passes` (softens the shell into big rounded clumps), `root_tip` ([dark, light]: darker
   roots, lighter tips along each clump), `under_dark` (darker underneath); the beard's
   `round_passes` (default 2) does the same smoothing for the beard shell.
4. `lod.py`: decimates the body to the budget, keeping the face, then cuts the low body along the
   hem, cuff, boot-top and collar planes (`cut_plane`), so those zone borders are straight lines
   instead of a sawtooth of whole triangles. The collar plane is tilted (`collar_tilt`), lower at the
   throat, so the skin / jacket border sits under the collar band all round.
5. `outfit.py`: the modular wardrobe (below) as material zones and offsets on the body, plus solid
   trims and gear (collar, a straight hem band, cuff bands, zip, pocket flaps, boot collars, daypack).
   The neck skin inside the collar is shaded up to just under the collar's top edge
   (`palette.collar_shadow`), and the neck faces hidden inside the collar are removed (`collar_cull`),
   so no pale gap, no slivers and no jacket shards show between the collar and the neck.
   Painted detail without geometry: `jacket.folds` (shade in the crook of each elbow),
   `trousers.knees` ([lighter knee fronts, darker hollows behind]), `shoes.details` ({`toe`: shade
   of the toe cap, `toe_from`: m in front of the ankle, `welt`: [height, colour], `laces`: colour,
   `lace_w`, `lace_strip`: {`colour`, `rows`, `width`, `below_top`, `above_sole`, `tongue`}: laces as
   a thin strip of geometry down the boot front, rows alternating lace and tongue}); `jacket.yoke_cut` (with `blocks`) cuts the body along the yoke line
   (`yoke_below_shoulder`, m), so the colour-blocked yoke has a crisp border.
6. `face.py`: skin colours (rosy cheek apples kept below the lens rim with `cheek_top`, a rosy nose
   tip, a warmer neck, an upper-lid line, optional soft smile creases at the outer eye corners
   (`palette.eye_crease`), a lip outline, optional faint freckles over the nose bridge and upper
   cheeks: `palette.freckles` [amount, share of the vertices, colour], low contrast so they show
   only in a close-up; optional soft age lines, `palette.age_lines` {amount, tint, folds, forehead,
   crows}: the nose-to-mouth folds, light forehead lines and crow's-feet as broad, soft bands of a
   slightly darker, warm skin (`tint` x the skin), shading only, no geometry creases), eyes (with a catchlight: `palette.eye_catchlight` [degrees up, degrees to
   +x, radius, aspect, segments]), brows and a strip of upper teeth behind the upper lip (with tooth
   separations; `face.teeth: null` leaves them out for a closed smile; `edge_median` takes a
   median of three over the columns' lip edge, so one missed column leaves no notch);
   `glasses.py`: a separate `avatar-glasses` object, rigid on the head bone. The temples run
   straight back from the hinges (`temple_straight`) and only follow the head out near the ear, into
   the hair, so they never splay out past the face (`temple_drop` points, if any, bend the ends down).
   `hinge_at` (share of the temple length) and `hinge_up` (m) place the hinge block; 0.09 and 0 tuck
   it into the temple, so no nub sticks out at the frame corner.
7. `parts.py`: joins everything into one skinned mesh (`avatar-body`), one material per semantic
   name, flat palette colours in a vertex colour attribute (no textures).
8. `court.py` (a spec with `costumes`, the player): outfit pieces instead of one mesh, all skinned to
   the one rig, so the game swaps costumes (`src/player/costume.ts`) by showing and hiding meshes:
   - `avatar-body`: what every costume wears (the bare skin of head, neck and hands and everything
     on the head: materials Skin, Eye, Hair, Beard), plus `avatar-glasses`;
   - `avatar-default-<material>`: the wardrobe above, one mesh per garment material
     (`avatar-default-jacket`, `-trousers`, `-gear`);
   - `avatar-court-<material>`: the court disguise (`costumes.court`), hidden in the .blend renders
     (`hide_render`) and hidden by the game until worn: `avatar-court-coat` (coat, skirts, collar,
     cuffs, buttons, tricorn), `-waistcoat` (waistcoat, stock, shirt cuffs, stockings), `-breeches`
     (breeches, knee bands, shoes, buckles).
   A plain 1780s secretary: a dark-blue coat cut away over a cream waistcoat, skirts to the knee with
   a back vent, a white stock, black breeches, white stockings, black buckled shoes, a plain black
   tricorn; `avatar-body` and `avatar-glasses` stay. The garments that hug the body are zones on a copy of the
   decimated skin, cut along their own planes (neckline, stock top, waist, waistcoat hem, knee, shoe
   top, cuffs, the coat's front edges); trims, skirts, buttons and the hat are solids. The skirts
   are weighted from the pelvis and spine at the waist towards the thighs at the hem (each vent half
   mostly to its own thigh), so they follow the legs in Walk, Run and Sword_Slash. Morph targets
   stay on `avatar-body` only (nothing else moves with them).

8. `palette.py` (featured / extra tiers only): the shared palette and the budget check (below).
9. `lod.py` `lod1`: the LOD1 copy (below). `lanyard.py`: the guide's lanyard and name badge
   (`wardrobe.lanyard`).
10. `shell.py` (people tiers): garment solids over the body. `jacket.hang` lets the jacket's trunk
   hang straight down from the chest and shoulder blades (it bridges the waist and the spine groove
   instead of hugging them); `jacket.skirt` is the jacket's hip part, a ring of rows from the body
   hem down to a straight hem about 8 cm over the crotch, with a hem band and an inward lip, so the
   jacket hangs over the trousers all round (`hang.rise` drapes the back out over the seat in a curve,
   the skirt's top row sits just under the jacket, `skirt.top_in`, and the body under it sinks a few
   mm, `skirt.sink`, in a zone without baked occlusion, `skirt.under_material`: no ledge or crease
   at the skirt top and no darker cloth where the body shows through in motion); `jacket.zip_solid` sweeps a centre zip (with its
   pull) down the dressed front, each ring weighted like the cloth under it; `shoes.solid` builds
   walking shoes (an upper with a rounded toe box and heel that close onto the sole, a thick sole
   with a proud ledge, a lace line in vertex colour) and the shoe zone ends at an ankle plane (no
   wedges up the calf); `trousers.hem` puts a clean hem ring over the trouser zone's cut edge at the
   shoe top (its top tucked under the cloth, its lower edge turned in). Body faces fully hidden under
   these solids (the feet, the hips under the skirt, the leg ends under the hems, the neck inside
   the collar with `jacket.collar_cull`) are dropped, which pays for them.
11. Panels in vertex colour only (`outfit.py`): a yoke seam (`jacket.yoke`, one cut plane across the
   chest, back and shoulder caps, the yoke a zone of its own colour) and a chest pocket's zip
   (`jacket.chest_pocket`, a narrow rectangle cut into the front): the zone borders are crisp along
   the cuts, no extra solids. `jacket.undershirt` colours the neck inside the collar's opening;
   `jacket.collar_garage` colours the collar's front centre as a zip garage.

Budget (hero tier): at most 25k triangles, 8 draw calls, textures at most 1k (the player uses none).
With costumes the budget holds per costume, visible at once: `stats.costumes` lists triangles and
draw calls of each (body + glasses + that costume's pieces) and the court pieces' parts. The player:
default 24 495 triangles / 8 draw calls, court 24 715 / 8 (the hip skirt, collar, eye cups and no
teeth drop hidden faces, which pays for the yoke cut and the solids).

**Occlusion for the hero tier** (`ao`, `kqchar/ao.py`): the same hemisphere bake as the people
tiers (below), per costume: the body and the default pieces see each other, and the court pieces
are baked against the body and each other; glasses cast nothing. The palette tiers use the same
module (`palette.bake_ao`).

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

## Shared face style B (`specs/_style_b.json`)

The stylised face of every person (the guide, the extras, the doubles, the child, the twins) sits
in one preset, not in each person: `face.stylize` (bigger eyes sunk into simpler, smoothed planes,
smoothed nose and ears, smiling lower lids lifted 17 degrees), calm eyes (the upper lids rest on the
top of the iris: `eye-*-opened-up` 1.0 with a touch of `eye-*-closure`; more closure creases the
inner lid corners) and an open smile (`face.expressions`), a strip of teeth (`face.teeth`), the
eye-shape targets, the iris (40 degrees, so white shows beside it), pupil (17 degrees: no pinpoint
pupils) and catchlight sizes and the
drawn lid and lip lines (`palette`, numbers only). A person spec starts with
`"extends": "_style_b.json"` and overrides only what differs (age, eye colour, smile strength,
brows); every colour stays in the person spec. The file is no person and is never built on its
own. The people's toon twin (`characters/toon.ts`, `People`, shared by every person) is
calibrated on the skin: a light shade tint (a saturated one turns the shadow side of a face
red-orange), almost no terminator band (on a face it draws a hard orange edge down the nose, a ring
in the eye socket and a crease through one mouth corner that reads as a smirk under a side sun),
wide, mostly smooth bands, a faint rim (a warm rim edges grey cloth pink) and a desaturated sun.

## The guide (`specs/guide.json`)

The placeholder tour guide "Gerold Imhoff": an invented, generic face in the shared face style B
(above), drawn with toon shading (`shading: 'toon'` on `chars.people.guide`).
Very tall (macro height 0.635, 1.95 m) and lanky (low weight, narrow torso, thin limbs, a longer
neck), about 50 (macro age 0.69), bald (`hair.style: bald`, no hair mesh) with a lowered, rounded
skull (`face.skull`: the crown comes down and the slices round toward a dome, so the head is no
cone or egg; about 7 heads tall with `head_scale` 1.17), clean-shaven, a calm open smile (the
style's smile softer, `mouth-corner-puller` 0.8, the lips barely parted, `mouth-open` 0.03, a
lighter mouth interior so the mouth reads as no dark hole at 10 m; the cheeks pushed up,
`lr-cheek-trans-up` 0.9, so the smile reaches the eyes); thin, tapered, slightly arched taupe brows
(`brow.shape` narrowing to the tail, `brow.soft`, `palette.brow_tint`); muted brown-hazel eyes; soft age
lines (`palette.age_lines`: light nose-to-mouth folds, `folds` 0.4, so a side sun does not turn
one of them into a smirk; light forehead lines; crow's-feet). Rounded ears
(`lr-ear-shape-round`, `budget.ear_keep`). A warm neutral beige skin (#A88470) with faint warm
cheeks, nose and ears and baked occlusion (`ao`). Practical modern clothes: a
hip-length forest-green softshell (#3E6A4C, a touch warm so it stays green and not teal at night)
that hangs straight from the shoulder blades (`jacket.hang` from 0.42 m over the body hem, less at
the front, `front` 0.1, so the front follows the body and does not stand out as a belly when he
leans) over a slimmed chest and shoulders (`measure-bust-circ-decr`, pectoral, lat and deltoid
targets, a thinner shell with `shoulder_offset`): a stiff closed stand collar (`collar_stiff`, no
hug toward the neck) with a darker lining and a dark zip garage, a dark undershirt in the collar's
opening, a darker yoke and a chest pocket's zip as a thin dark-green line in vertex colour, a solid centre zip, cuffs, a flush
hem band; grey straight trousers with a clean hem; brown walking shoes with a chunky rounded toe box,
a thick brown-grey sole (#6E6256, a light sole reads as a sneaker) and a light lace line; a mustard
lanyard (#D4A72C, warm but neither orange nor red) with a muted cream badge (`wardrobe.lanyard`; a
white card flares in bright light). Featured tier: LOD0 11.9k tris, LOD1 6.0k tris, one
draw call each.

Clips: the same retarget bake (Idle, Walk, Run, Interact, Wave from the surveyor). The slim trunk
needs no swing-out: `--abduct -4` keeps the arms close while walking, and the shoulders come down
there too (`--walk-shoulders 7`; `--stand-shoulders 4` in the standing clips). The planted legs stand
straighter (`--knees 1 --knees-loco 0.6`, pelvis_lift: the walk no longer creeps on bent knees). The standing clips bring the arms in to hang close
to the body (`--stand-abduct -12`, a negative value adducts) and stand him up: knees about 5 degrees
(`--stand-knee`), ankles 9.5 cm off the middle with the toes 8 degrees out (`--stand-feet`,
`--stand-toe`), the source's stoop mostly given back (`--stand-upright 0.8`) with a forward lean of
the upper back and neck, chin a little down (`--stand-lean 16`: the head about 16 cm ahead of the
feet, so the lean reads from the front too, in idle, talk and point), the hips turned back under the chest (`--stand-hips
0.85`: the source's Idle turns them 27 degrees, which pulled the jacket's zip off the centre line)
and a level head (`--level-head 1`). Walk leans a little too (`--walk-lean 5`) and its arms swing
against the thighs (`--arm-swing Walk=26`: each upper arm opposite its own thigh, the elbow bending
more as the arm comes forward). Every clip gets relaxed, loosely curled fingers (`--relax-fingers
40`). Plus **Talk**: `retarget.py --talk Idle` plays the baked Idle (feet locked as Idle's) twice
over 4 s (`--talk-seconds`) with open-palm explaining gestures on top (`kqchar/motion.py`
`talk_frames`): the right hand comes up to chest height and explains in three beats, the left joins
for an open two-handed sweep, small nods on the beats, the explaining hands' fingers open part way
(`--talk-open 0.4`, so a lower hand keeps a relaxed curl); both hands rest at the loop's seam. The people's `talk` plays it in place of idle. Plus **Point**:
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
- `wardrobe.jacket` (people tiers): `hem_above_crotch`, `hang` {`from`, `slope`, `rise`, `amount`, `front`},
  `shoulder_offset`, `shoulder_band`, `yoke` {`below_shoulder`, `colour`, `material`}, `chest_pocket`
  {`x`, `width`, `below_yoke`, `length`, `colour`, `material`}, `undershirt` {`colour`, `below_top`,
  `material`}, `collar_stiff`, `collar_taper`, `collar_thick`, `collar_garage` {`colour`, `deg`,
  `edge`}, `collar_cull` [m under the collar top, degrees from the front], `zip_top_below`, `skirt`
  {`above_hem`, `columns`, `rows`, `clearance`, `flare`, `settle`, `legs`, `band`, `band_out`, `lip`,
  `colour_band`, `show_below`, `hide_top`, `tuck`, `top_in`, `sink`, `under_material`}, `zip_solid` with `zip_samples`, `zip_width`, `zip_thick`,
  `zip_raise`, `zip_colour`, `zip_pull`; `collar_closed`, `collar_segments`, `collar_smooth`,
  `collar_lining`, `collar_trim_colour`; `cuff_colour`, `cuff_lift`, `cuff_smooth`.
- `wardrobe.shoes.solid` with `top` (the ankle plane), `sole_h`, `sole_flare`, `sole_top`,
  `sole_bottom`, `toe_h`, `toe_box` (the toe box keeps the ball's width), `toe_round`, `nose` (rings
  of the rounded toe and heel), `collar_z`, `sections`, `around`, `lace` {`colour`, `from`, `to`,
  `half`}.
- `wardrobe.trousers.hem`: `columns`, `height`, `out`, `tuck`, `lip`, `colour_lip`.
- `wardrobe.lanyard`: also `samples` and `smooth` (the strap path smoothed, never into the cloth).
- `ao`: `distance`, `rays`, `default`, `smooth`, `floor`, `zones` (strength per zone), see above;
  for the people tiers and, per costume, for the player.
- `face.teeth: null` (no teeth), `face.eye_yaw_deg`, `face.stylize.lower_lid`, the beard's edge
  keys and `glasses.hinge_at` / `hinge_up` (see the pipeline above); `palette.freckles`.
- `wardrobe.jacket.folds` / `yoke_cut`, `wardrobe.trousers.knees`, `wardrobe.shoes.details` (see
  `outfit.py` above).
- `palette_slots` (people tiers): the six slots, see above.
- `wardrobe.lanyard`: `colour`, `badge`, `width`, `badge_size`, `badge_below_neck`, `strap_x`.
- `costumes.court` (optional): the court disguise as outfit pieces (`kqchar/court.py`, which lists
  its keys: palette, materials, coat, waistcoat, stock, skirts, breeches, stockings, shoes, hat;
  merged over its defaults). Without `costumes` the build makes the single `avatar-body` mesh.
- `palette`: every colour by name (sRGB hex); `materials`: roughness / specular per material, and an
  optional `emit` (linear RGB emissive factor; skin, hair and beard use a faint warm one so they keep
  their warmth under cold moon or lantern light, with no scene or tone-map change).

**Shading in the game:** the manifest entry picks it. The default is the plain world-light bridge
(`kqStandard`); `shading: 'toon'` opts into the soft toon variant (`src/systems/characters/toon.ts`:
banded sun with soft edges, a warm terminator and warm shadow fill, a rim, catchlight glints on the
`Eye` slot). Per-slot toon settings key on the material names (`TOON_BY_MATERIAL`); the people
palette's `People` / `PeopleEye` have their own, and every toon person shares one toon material.

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
  hips. The whole arm swings as one (forearm, hand and fingers too), so the elbow keeps the source's
  bend and does not bow out. Standing clips (`--stand`) can use their own, smaller value
  (`--stand-abduct`, arms closer to the body; negative brings a slim body's arms in) and a wider stance (`--stand-width`, metres added
  between the planted feet). The player uses 10 and 8 degrees: the least that keeps the hands out
  of its stockier hips and the court coat's skirts. `--stand-shoulders` (degrees) drops both
  clavicles in the standing clips, so the shoulders sit down and relaxed.
- **Straighter legs** (`pelvis_lift`, before the foot lock; `--knees`, off by default): with the feet
  pinned, a rig whose hips sit lower on its legs than the source's ends up crouched. Per frame the
  pelvis rises until each planted leg bends `--knees` times the source's knee flexion (1 = as the
  source). The idle and locomotion clips (`--loco`, default Idle, Idle_Sword, Walk and the Runs) can
  stand straighter still (`--knees-loco`; the player uses 1 and 0.6). The lift is never negative and
  stops short of a locked knee. Frames with no planted foot take the lift of the planted frames
  around them, smoothed, and the lift fades out while the body is down.
- **Pose edits** (`kqchar/motion.py`, on the baked frames: a bone turns with everything below it):
  `--talk Idle` (the Talk loop; `--talk-open share`, how far its explaining fingers open), `--arm-swing
  Clip=deg` (a counter-swing of the arms against the thighs), `--walk-lean deg`, `--walk-shoulders
  deg` (the shoulder drop in Walk), `--stand-hips share` (the hips' yaw given back under the chest).
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
- hands inside the trunk (on the deformed mesh: the body, plus each costume's pieces when the
  character has costumes; for the court costume this includes the coat skirts over the hips and
  thighs; reported per costume as `hand_in_trunk_by_costume`),
- glasses staying on the head, and the skin never coming through the beard.
