# Handoff: kq-characters

Written 2026-11-21. This is the characters track: the MPFB character pipeline, the authored tour
people, the MPFB player avatar and the fauna bodies. Read this file, then the pointers at the end.

## What this track owns

- `scripts/chars/mpfb/`: the `kqchar` pipeline, specs, and build, retarget and preview scripts.
  Its README is the command and option reference.
- `src/systems/people/`: people contract v0.1, BodyKit, the shared palette material
  `peopleMaterial(eye, shading)`, LOD1 beyond 15 m (±0.5 m).
- `src/systems/fauna/`: fauna contract v0 bodies. Behaviour lives in `src/systems/animals/`.
- `src/systems/characters/`: toon shading (`toon.ts`), the rig and bone alias table, and the MPFB
  avatar integration.
- Character models in `public/assets/models/chars/` and the `chars.*` manifest entries.

## Branches

- **main:** the MPFB pipeline and authored people, opt-in.
  - Opt-in switch: `PEOPLE_AUTHORED_DEFAULT = false`; `?people=authored|standin` forces a mode.
  - Also on main: the guide r3 model and the toon base (manifest `shading: 'toon'` for `chars.*`
    entries, the people toon twin, face stylise options).
- **`chars/avatar-mr`** (4 commits, sent to integration): the MPFB player avatar in face style B.
  - Contents: the court costume, opt-in via `?avatar=mpfb`, pipeline options, per-slot toon
    settings and camera `fadeBounds`.
- **`chars/guide-r5`** (local, stacked on `chars/avatar-mr`): guide rounds 4–6 plus a fix pass.
  - Contents: the shared face preset, the people toon retune, the talk loop and `KQ_WALK_QUERY`
    for `walk.spec`.
  - To ship it:
    1. Wait until `chars/avatar-mr` is on main.
    2. Run `git rebase --onto main chars/avatar-mr chars/guide-r5`.
    3. Run the gates and e2e walk plus smoke.
    4. Send it as an opt-in MR.
- **`fix/dogs-follow`** (3 commits, sent to integration): the tour dogs now face where they walk,
  never slide backwards, stop flickering between clips, and land in their places after a warp or
  teleport.
  - It also changes `src/systems/animals/` code written by the systems track. Its slot-yaw `NaN`
    guard fixes the deer bodies too.
- **Older local avatar branches** (`chars/authored-mpfb`, `chars/mpfb-stylized`,
  `chars/avatar-mpfb`, `chars/avatar-r8s`): superseded by `chars/avatar-mr`. Never push them.

## Decisions waiting on the owner

1. Make the MPFB avatar the default player (today `?avatar=mpfb`)? It's a one-line flip. Suggested
   after the owner has played it once.
2. Make authored people the default (`PEOPLE_AUTHORED_DEFAULT`)?
   - The guide reached 7.1 but face 5 and deformation 6. The agreed ship rule is an average ≥ 7
     with at most one 6.
   - The authored walk group is cheaper than the stand-ins (173 vs 182 draw calls).
3. The guide model is an invented placeholder. Any change to it is the owner's call.

## Face style and shading switch

- **Face style:** the owner chose face style **B (stylised)** for every person: player, guide,
  extras, doubles, twins.
- **Shared preset:** `scripts/chars/mpfb/specs/_style_b.json` (on `chars/guide-r5`).
  - A spec opts in with `"extends": "_style_b.json"` and overrides only what differs. The merge
    is recursive.
  - Face options (`face.stylize`: lids, eye opening, smile and teeth, smoothing) are documented in
    the pipeline README.
- **Toon shading:** add `shading: 'toon'` on a `chars.*` manifest entry.
  - People share one toon twin per palette material via `peopleMaterial(eye, 'toon')`.
  - Per-slot settings live in `src/systems/characters/toon.ts`. `sunSat` pulls the sun colour
    toward grey on that material only.
  - Fix colour on the character. Never touch scene lights or tone mapping.

## How to build

- **Tools:** Blender 5.3 headless plus the MPFB2 extension and its official CC0 asset packs. Raw
  kits stay outside the repo.
- **Steps:** build, retarget the clips from the repo's Quaternius human, pack, preview. Commands
  are in the pipeline README under "Commands". The player has its own `build_player.py` (on
  `chars/avatar-mr`).
- **Budgets:**
  - hero ≤ 25k tris / ≤ 8 calls;
  - featured ≤ 12k / ≤ 4;
  - extra ≤ 6k / ≤ 2 on the shared palette;
  - LOD1 ≈ 50 %.
- **In-game shots:** people tick in the render hook, so a shot harness steps `kq.step(1)` once
  per frame. `kq.step(n)` renders only once (ARCHITECTURE §12).
- **Heavy lock:** every Blender render, GPU shot and e2e run goes through
  `scripts/dev/heavy.sh --max-hold 15`.
  - One job per hold.
  - `--workers=1`.
  - Run only the specs you touched, plus smoke.

## Critic and pairwise process

- **Shot set:** fixed per character, with the same cameras every round. Bust front, 3/4 and tour
  distance; a 10 m silhouette; full front and back; dusk; night; clip strips; costume views. Plus
  a stats file (triangles, draw calls, textures).
- **Critic:** a fresh critic subagent sees only the rubric, a look description and the shots.
  - Never the builder's notes or anything else.
  - The lead writes the brief.
- **Rubric:** 9 categories scored 1–10: appeal, silhouette, likeness (to the look description),
  face, proportions, materials, clipping, deformation, budget.
  - Pass: average ≥ 8 and no score < 7.
  - Output: scores, average, pass, and the top 3 fixes with shot filenames.
- **Blind pairwise:** copy the matching views of two versions into `A/` and `B/` in random order,
  normalise the stats files, and keep the mapping out of the critic's reach. The critic names a
  winner per category and overall, with a confidence.
- **This sprint's caps** (to keep usage down):
  - at most 2 critic rounds per character, plus one blind pairwise for the avatar;
  - then one bug-fix pass without a critic, and ship;
  - one subagent at a time.
- **Where the files live:** the lead keeps the rubric and look files outside the repo. Look
  descriptions stay out of the public repo, except where the owner allowed them.

## Open items (next sprint)

- **Avatar:** critic 6.9 on the last round.
  - Scores: appeal 6, silhouette 8, likeness 7, face 6, proportions 7, materials 7, clipping 6,
    deformation 7, budget 8.
  - Blind pairwise: the last round beat the round before it, with medium confidence.
  - Still open:
    - a small notch at the front jacket hem in attack frames;
    - face edge and colour details in strong sun;
    - the build reads wider at the hips than the shoulders;
    - the head is a little small for the style;
    - plain pack and back-of-head detail;
    - jacket specular banding in motion.
- **Guide:** 7.1 after both rounds.
  - Scores: appeal 6, silhouette 8, likeness 7, face 5, proportions 7, materials 7, clipping 8,
    deformation 6, budget 10.
  - Still open:
    - the fix pass after round 2 (iris colour, softer folds, brows, soles, night skin) has not
      been re-scored;
    - the badge print band needs mesh work;
    - the walk: stride and foot spacing need a new retarget option;
    - the jacket clings and shows the back, and the collar edge is hard;
    - a style gap to the player (smoother shading, smaller head).
- **Not started:**
  - 7 extras, 7 doubles and the child: variations from the shared spec generator and palette in
    face style B, critiqued as group shots (at most 1 round per batch).
  - The twins after them: stylised, and without the servant figure from the 1783 portrait.
  - When the extras land, ask systems to re-sample walk-group performance.
- **Fauna:** the deer and dogs are still stand-ins. Authored fauna bodies have not started. A
  cinematic camera for the dogs is in the backlog.

## Pointers

- `scripts/chars/mpfb/README.md`: commands, `kqchar` modules, the spec format, retarget options,
  people tiers, the guide.
- `src/systems/people/types.ts` and `src/systems/fauna/types.ts`: the contract headers.
- `docs/ART-DIRECTION.md` (toon note), `docs/ARCHITECTURE.md` §12 (people tick and harness
  stepping).
- Commits follow Conventional Commits. Work stays on local branches; integration merges and
  pushes.
