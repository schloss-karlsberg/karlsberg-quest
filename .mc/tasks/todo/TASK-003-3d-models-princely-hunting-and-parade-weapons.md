---
id: TASK-003
aliases:
- TASK-003
title: '3D models: princely hunting and parade weapons'
slug: 3d-models-princely-hunting-and-parade-weapons
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- feature
- community
- 3d
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# 3D models: princely hunting and parade weapons

> **Running collection task.** It stays open until the owner closes it. Each contributor picks
> **one** weapon, models it in Blender, opens a PR, and adds a line to "Models so far" below.
> Don't move it to `done` yourself; leave it in `todo` (or put it back there after your PR).

## Description

Duke Karl II. August of Pfalz-Zweibrücken, who built the Karlsberg, was notorious for his
excessive passion for hunting. Around the Karlsberg grounds he had huge game enclosures built.
The Bayerisches Nationalmuseum in Munich has a hall dedicated to the princely hunt of the
Wittelsbachs, with ornate hunting and parade weapons:

- hunting swords (**Jagdschwerter**)
- hangers / hunting cutlasses (**Hirschfänger**)
- boar swords and boar spears (**Saufänger**, **Saufeder**)
- ornate flintlock hunting rifles (**Steinschloss-Jagdgewehre**) of the Wittelsbachs, partly made
  for the court by Zweibrücken gunsmiths (Bayerisches Nationalmuseum). *Per owner notes — verify
  before using in lore/codex.*

**What to make:** one hunting or parade weapon of your choice, inspired by that kind of collection
(second half of the 18th century fits the game best). It should be an original model in the spirit of
the period, not a scan or a copy of a specific museum piece. Use only **public-domain or CC0**
reference images (e.g. Wikimedia Commons files marked PD/CC0); list your references in the PR.
No copyrighted photos go into the repo or into textures.

## Pipeline and conventions (read first)

- **Rules:** `CONTRIBUTING.md` (CC0 / licensed AI only, credits, untrusted downloads) and
  `docs/ART-DIRECTION.md` §8 "Assets" (licence, pipeline, layout, manifest + loader).
- **Look:** stylized modern game look (`docs/ART-DIRECTION.md` top): clean shapes, readable
  silhouette, rich but not noisy materials (steel, gilded brass, horn/antler, wood grip). No
  photoreal scan detail.
- **Blender:** the repo's Blender work so far is the character pipeline in `scripts/chars/`
  (`README.md`, `mpfb/README.md`; Blender 5.3.0). For a weapon, plain hand modelling is fine.
- **Export and pack:** export glTF/GLB from Blender, then pack it:
  `pnpm assets:pack <raw.glb> public/assets/models/weapons/<name>.glb --tex 1024`
  (`scripts/assets/pack-gltf.ts`: weld/prune, WebP textures, meshopt). Check it with
  `npx tsx scripts/assets/inspect-glb.ts public/assets/models/weapons/<name>.glb`
  (materials, textures, triangles). The `weapons/` folder is new; the first PR creates it.
- **Source file:** commit the `.blend` next to the art sources, proposal: `art/weapons/<name>.blend`
  (packed textures, no external paths, no personal data in file paths). Keep it small (under ~10 MB).
- **Manifest:** add an entry to a new `src/assets/manifests/weapons.ts` (same shape as
  `src/assets/manifests/architecture.ts`: `id`, `kind: 'model'`, `url`, `area`, `bytes`, `licence`).
- **Credits:** add a record to `public/assets/LICENSES.json` (name, author, source, licence, files,
  what was done, date). `tests/assets.test.ts` checks every file has a record and the byte count is right.
  - **Open point for the first PR:** `ALLOWED_SOURCES` in `src/assets/types.ts` only lists the
    download sites (Poly Haven, Kenney, Quaternius, ...), so a record for a contributor's *own* model
    fails the test today. The first PR needs to add a source for own work (e.g. the repo URL)
    to that list, with the owner's OK. Your own model is released as CC0 (MIT for code).
- **Budget (proposal, nothing official yet):** at most **3,000 triangles** per weapon (a spear
  or a rifle may use up to 4,000), **one material** (two if really needed), **one 1024 px texture set**
  (base colour + optional normal/ORM, WebP after packing), packed GLB **under 500 KB**. Real-world
  scale in metres, +Y up, origin at the grip (where the hand holds it), blade along +Z, no animation.

## Where it could appear in the game (optional ideas, not part of this task)

- As a display piece: a weapon rack or wall trophy in a castle room or a hunting lodge
  (`src/systems/interiors/`, e.g. `props.ts`, `festsaal.ts`), or in the hunt chapter
  ("Die Parforcejagd", `docs/ACTION-RPG.md`).
- As an item: `src/rpg/items.ts` already has `kind: 'weapon'` entries (the Messstab line).
  A Hirschfänger could be a pickup or a collection item there. German name and text required.
- As equipment on NPCs: the Pikeur or the huntsmen in the hunt chapter.

## Acceptance Criteria (per model / per PR)
- [ ] One weapon, original model, inspired by the princely hunting collection; references are PD/CC0 and listed in the PR
- [ ] `.blend` source committed (proposed `art/weapons/<name>.blend`)
- [ ] Packed GLB in `public/assets/models/weapons/<name>.glb` via `pnpm assets:pack`
- [ ] Within the budget above (paste the `inspect-glb.ts` output in the PR)
- [ ] Record in `public/assets/LICENSES.json` and an entry in `src/assets/manifests/weapons.ts`; `pnpm test` (incl. `tests/assets.test.ts`) passes
- [ ] Screenshot of the model in the PR (Blender render or in the game)
- [ ] Conventional Commit / PR title, e.g. `feat(content): add a Hirschfänger model`
- [ ] A line added to "Models so far" below

## Models so far
<!-- Append one line per model: - [x] <German name> (<English>) · <file> · @author · PR #n -->

## Notes
- Task stays open until the owner closes it.
- German terms: Jagdschwert (hunting sword), Hirschfänger (hanger / hunting cutlass), Saufänger
  (boar sword), Saufeder (boar spear), Steinschloss-Jagdgewehr (flintlock hunting rifle),
  Prunkwaffe (parade weapon).
- See also TASK-004 (surviving Karlsberg treasures) for the non-weapon pieces.
- Museum named, not linked: the URL of the museum's online collection was not checked.
