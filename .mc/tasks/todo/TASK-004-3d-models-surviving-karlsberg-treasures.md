---
id: TASK-004
aliases:
- TASK-004
title: '3D models: surviving Karlsberg treasures'
slug: 3d-models-surviving-karlsberg-treasures
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

# 3D models: surviving Karlsberg treasures

> **Running collection task.** It stays open until the owner closes it. Each contributor picks
> **one** object (or the gallery set), models it in Blender, opens a PR, and adds a line to
> "Models so far" below. Don't move it to `done` yourself; leave it in `todo`.

## Description

Duke Karl II. August filled the Karlsberg with treasures. Some were saved before the castle was
destroyed in 1793 and are in Munich today. This task collects 3D models of those pieces for the game.

**Historical facts below are per owner notes — verify before using in lore/codex.** Every fact used
in the game needs a source (`CONTRIBUTING.md`, "Facts and fiction").

### Model candidates (pick one)

- **Prunk-Spazierstock** (ornate walking stick with a precious decorated knob).
  Residenz München, Schatzkammer. *Per owner notes — verify before using in lore/codex.*
- **Öfen / Kandelaber von Hebe und Ceres** (two monumental neoclassical sculpture-stoves from the
  castle's former dining hall). Residenz München, state rooms. One stove per PR is fine.
  *Per owner notes — verify before using in lore/codex.*
- **Pfeifenköpfe und Tabakdosen** (pipe bowls and snuff / tobacco boxes in Meissen porcelain, gold
  and meerschaum; the owner's notes speak of a collection of 1,500+ pieces). Residenz / Bayerisches
  Nationalmuseum. A small set of 3–6 pieces per PR. *Per owner notes — verify before using in lore/codex.*

### Separate item: gallery-room set (Karlsberger Gemäldesammlung)

Per owner notes (verify before using in lore/codex): the Duke's own gallery on the Karlsberg held
2,000+ paintings (Rembrandt, Rubens, van Dyck) and formed the core of today's Alte Pinakothek.

- Make a set of **ornate picture frames** (3–4 sizes / styles, modular, one shared material).
- Pair them with **public-domain painting images** (Wikimedia Commons PD files or museum PD scans),
  each credited with title, painter, year, holding museum and source URL. Only paintings that were
  plausibly in the collection; say in the PR why.
- Images go through `pnpm assets:tex <in.jpg> public/assets/textures/gallery/<name>.webp --size 1024`.
- Existing CC0 frames to look at first: `public/assets/models/architecture/fancy_picture_frame_01.glb`, `_02.glb`.

Reference images: public-domain or CC0 only (e.g. Wikimedia Commons PD/CC0 files); list them in
the PR. Models are original work in the spirit of the object, not scans. Museums are named, not
linked (URLs not checked).

## Pipeline and conventions (same as TASK-003)

- **Rules:** `CONTRIBUTING.md` and `docs/ART-DIRECTION.md` §8 "Assets". Look: stylized modern game
  look (`docs/ART-DIRECTION.md` top), readable shapes, no photoreal scan detail.
- **Blender:** see `scripts/chars/README.md` (Blender 5.3.0). Hand modelling is fine.
- **Export and pack:** `pnpm assets:pack <raw.glb> public/assets/models/treasures/<name>.glb --tex 1024`
  (`scripts/assets/pack-gltf.ts`), check with `npx tsx scripts/assets/inspect-glb.ts <file.glb>`.
  The `treasures/` folder is new; the first PR creates it.
- **Source file (proposal):** `art/treasures/<name>.blend`, packed textures, no external or personal paths, under ~10 MB.
- **Manifest:** a new `src/assets/manifests/treasures.ts`, same shape as `src/assets/manifests/architecture.ts`.
- **Credits:** a record in `public/assets/LICENSES.json`; `tests/assets.test.ts` must pass.
  - **Open point:** `ALLOWED_SOURCES` in `src/assets/types.ts` lists only the download sites. Own
    models (see TASK-003) and Wikimedia / museum PD images are not on it yet, so the first PR of
    each kind must add the source, with the owner's OK.
- **Budget (proposal, nothing official yet):**
  - small objects (walking stick, a pipe, a box): ≤ 3,000 triangles, one material, one 1024 px texture set, GLB < 500 KB;
  - a stove: ≤ 12,000 triangles, ≤ 2 materials, one 1024 px set (2048 only with the owner's OK), GLB < 1.5 MB;
  - a frame: ≤ 1,500 triangles each, frames share one material; each painting texture ≤ 1024 px WebP.
  Real-world scale in metres, +Y up, origin at the base (or the grip for the stick), no animation.

## Where it could appear in the game (optional ideas, not part of this task)

- Castle rooms (`src/systems/interiors/`, `props.ts`, `festsaal.ts`), a reconstructed dining hall
  with the two stoves, and a gallery room with the frames.
- A codex entry per object (`scripts/content-build/codex.mjs`, generated into `content/packs/codex.pack.json`;
  sourced facts, invented parts labelled FIKTION).
- Collectibles or quest items in the action-RPG style (collect quests from a quest giver, no quizzes),
  e.g. the Duke's lost walking stick as a quest item (`src/rpg/items.ts`, `content/quests/`), or
  pipe bowls as a collection (`COLLECTIONS` in `src/rpg/items.ts`). German names and texts.

## Acceptance Criteria (per model / per PR)
- [ ] One object (or one gallery set), original model; references PD/CC0 and listed in the PR
- [ ] `.blend` source committed (proposed `art/treasures/<name>.blend`)
- [ ] Packed GLB in `public/assets/models/treasures/<name>.glb` via `pnpm assets:pack` (painting textures in `public/assets/textures/gallery/`)
- [ ] Within the budget above (paste the `inspect-glb.ts` output in the PR)
- [ ] Record(s) in `public/assets/LICENSES.json` (every painting credited) and an entry in `src/assets/manifests/treasures.ts`; `pnpm test` passes
- [ ] Screenshot of the model in the PR (Blender render or in the game)
- [ ] Conventional Commit / PR title, e.g. `feat(content): add the Hebe stove model`
- [ ] A line added to "Models so far" below

## Models so far
<!-- Append one line per model: - [x] <German name> (<English>) · <file> · @author · PR #n -->

## Notes
- Task stays open until the owner closes it.
- All historical claims here come from the owner's notes and are unverified.
- Hunting weapons (incl. the flintlock rifles) are in TASK-003.
