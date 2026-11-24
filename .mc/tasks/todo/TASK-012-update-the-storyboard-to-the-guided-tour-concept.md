---
id: TASK-012
aliases:
- TASK-012
title: Update the storyboard to the guided-tour concept
slug: update-the-storyboard-to-the-guided-tour-concept
status: in-progress
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- docs
- story
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-24
---

# Update the storyboard to the guided-tour concept

> Core dev team task (not community).

## Description

`docs/storyboard/index.html` is the static picture book of the story (places, cast, items; open it
from disk, no build). It still tells the **first concept**: the surveyor prologue at the Feldstation /
Bauwagen (`p1-feldstation`, `p2-damm`, ... in `scripts/dev/storyboard.mjs`), and it has **no party
endings**. `docs/storyboard/README.md` already carries an "Out of date" note. Since v0.7.0 the game
opens with the guided tour; the story is now **tour → first time travel at the Karlsbergquelle →
chapters → three endings → the party** on today's palace plateau.

Source of truth for the new beats:
- `docs/design/tour/storyboard-beats.md`: the planned shots, one sentence per beat, with place, era /
  light and a shot hint per row, already shaped for the `SHOTS` array: A. the tour (t0 ... t10),
  B. the first time travel and the 1789 training, C. the ending choice and the three parties,
  and "Existing shots replaced or retired"
- `docs/design/tour/README.md` (owner decisions), `docs/design/tour/systems.md` §6 (party),
  `content/story/00-tour.story.json` (the tour as it ships), `content/bible/06-enden.md` §8 "Das Fest"
- The capture script `scripts/dev/storyboard.mjs` (`SHOTS`, `h.place`, `h.look`, `h.say`, `ui:` shots)

### Steps
1. Retire the prologue shots listed under "Existing shots replaced or retired" (Feldstation, Bauwagen,
   lantern) from `SHOTS` and from the page; delete their pictures in `docs/storyboard/img/`.
2. Add the tour shots (section A), the first time travel (section B) and the ending choice plus the
   three parties (section C) to `SHOTS`. Add the new looks the beats need to `h.look()` (`tour`,
   `pause`). Check every coordinate marked **(prüfen)** on the terrain first.
3. Rewrite the page: story order tour → time travel → chapters → three endings → party; new cards
   (`<article class="card">`, `data-cap="Title — Era · light. Text"`) with German captions in the page's
   style; Places and Cast updated (the tour guide is shown only as the placeholder, see Notes; Marlene's
   role in the tour; no surveyor).
4. Capture on a real GPU (the README's three steps; `--only` for single shots), review every picture,
   re-shoot weak ones.
5. Update `docs/storyboard/README.md`: drop the "Out of date" note, update "What is not captured, and
   why", the shot count and the image budget.

## Acceptance Criteria
- [ ] No Feldstation / Bauwagen / lantern / surveyor prologue left in `index.html`, `img/` or `SHOTS`
- [ ] The page shows the tour, the first time travel, the three endings and the party, in story order
- [ ] Pictures captured on a real GPU (the script's software-renderer warning did not fire)
- [ ] `img/` stays within the budget (about 8 MB, about 60 pictures); the page still opens from disk with no network
- [x] `docs/storyboard/README.md` updated; captions in German
- [ ] If `scripts/dev/storyboard.mjs` changed: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

### Coverage

- **Full** — Remove the retired prologue from the page, JPEGs and shot definitions.
- **Full** — Show the tour, first time travel, chapters, three endings and parties in story order.
- **Full** — The contributor captures on a real GPU and checks the renderer log.
- **Partial** — Target about 8 MB and verify the page opens offline. The planned 68 pictures exceed the original “about 60” and fall within the owner-approved 66–68 in [storyboard-beats.md](../../../docs/design/tour/storyboard-beats.md).
- **Full** — Update the storyboard README and write German captions.
- **Full** — The contributor runs all four gates and reports the results.

## Plan

_Status: approved 2026-11-24_

**Approach:** Give each of the 28 beats in sections A–C of `docs/design/tour/storyboard-beats.md` one card. The replacement table gives 68 distinct pictures (60 − 20 + 28), within the owner's approved 66–68. Keep the roughly 8 MB image budget. The storyboard itself is the visual review artifact.

**Files to touch:**

- `scripts/dev/storyboard.mjs` — shot definitions, lighting, framing and UI staging.
- `docs/storyboard/index.html` — German captions, story order, Places, Cast and local image references.
- `docs/storyboard/README.md` — capture instructions, coverage, final count and measured size.
- `docs/storyboard/img/` — reviewed JPEGs and removal of retired files after capture.

**Steps:**

- [x] 1. I will map the 28 shot IDs to shipped story actions or existing debug hooks. For the five **(prüfen)** positions below I will compare the camera and subject with route, spawn and terrain data before choosing a frame.
- [x] 2. I will retire or replace the 20 `SHOTS` entries listed in the beat sheet and stage all 28 beats. Reuse the spring touch and Brunnenstube framing. In `h.look`, use the game's `tour` light and lower its sun for a script-local `pause` look. Set up each shot for `--only` and reset actors, camera, lighting and UI between shots.
- [x] 3. I will order the page from the guided tour through the spring crossing, 1789 training and K1–K4, then show the ending choice, the museum, burn and keep parties, and the credits. Use German card and lightbox captions, preserve FAKT/FIKTION labels, and update Places, Cast and Items wherever they refer to the old prologue. In captions and Cast, use only the placeholder name “Gerold Imhoff” for the guide. Show Marlene as the forester at the dam.
- [x] 4. I will update the storyboard README's capture examples, outdated notice, coverage notes and budget, then compare `node scripts/dev/storyboard.mjs --list` with the page's thumbnail and full-size references before handing over for capture.
- [ ] 5. You will build, preview and capture the full set on your GPU directly into this worktree's `docs/storyboard/img/` using the commands below. Confirm the renderer and completed shot count, review every picture, and report weak or missing shots by ID with what you saw.
- [ ] 6. I will fix the reported framing, lighting, UI or captions. You will recapture the affected IDs in place with `--only`. Repeat for any picture still unreadable.
- [ ] 7. I will delete the retired JPEGs after checking their references and record the final image count and size in the storyboard README.
- [ ] 8. You will open `docs/storyboard/index.html` from disk with the network off, check the chapter order, images and lightbox, and run `pnpm typecheck && pnpm test && pnpm validate && pnpm build`. I will record your capture and gate results in this task.

**Test plan:** For step 1, use the grid metadata and present-day or 1789 height raster in `public/data/terrain/` to sample ground height and slope at each proposed camera and subject. Check the following compositions in step 5.

| Shot and draft x/z | My browser-free check | What to eyeball on the GPU |
|---|---|---|
| `t5-wind` · 700/−640 | Compare the `wind` stop in `content/routes/p-fuehrung.json` with both dogs' run paths in shipped tour beat t8. This point is on Diane's run. | Both dogs are visible running uphill through the leaves. |
| `t6-reh-sicht` · 817/−704 | Use the doe's shipped spawn at 704/−779 in `content/story/00-tour.story.json` t9 and the route stop at 727.4/−751.5. Aim all three deer views at the doe and her following fawn. | Check the sightline past the group, the crouched approach and the fawn inside the phone frame. |
| `t7-marlene` · 826/−866 | Compare with the route's `damm` stop at 837/−839.5, t12's cameo and the terrain/water edge. Pick dry ground with the pond behind the two figures. | Marlene and the staff are legible against the water. |
| `t12-training` · 1030/−852 | Check the 1789 meadow against the spring and Bleiche layouts in `src/systems/{quelle,bleiche}/layout.ts`. Allow the design's 25 m clearance from each and check the brook line in `public/data/paths.json`. | Three Nebelinge fit on the bank, the lesson is readable, and the companion Bannlicht shot shows both targets. |
| `e1-wahl` · 1200/−1095 | Match `PARTY_CHECKPOINT` in `src/systems/party/placements.ts` and aim toward the lights around `TF01` at 1216/−1114. | The choice is readable and the lit party is visible beyond it. |

Contributor capture commands for steps 5–6, from the worktree root. Keep the preview running and run captures one at a time in a second shell. The default capture destination is `docs/storyboard/img/`.

```sh
pnpm exec vite build --outDir /tmp/kq-storyboard
pnpm exec vite preview --outDir /tmp/kq-storyboard --port 5370 --strictPort --host localhost

# Second shell, full capture
scripts/dev/heavy.sh -- node scripts/dev/storyboard.mjs http://localhost:5370/

# Example retake after a framing fix
scripts/dev/heavy.sh -- node scripts/dev/storyboard.mjs http://localhost:5370/ --only t6-reh-sicht
```

**Risks:** Shot IDs in the design and beat IDs in the game differ. The shipped tour ends at t18 on arrival in 1789, so the training needs capture staging. The script continues after shot failures. Check the final capture count against the shot list and check the log for a software-renderer warning.

**Open questions:** None.

### follow-up

- [ ] Re-shoot the ticket or spring hub if TASK-007 changes their UI. Record any pending frame in the storyboard README.
- [ ] If a party prop or planned pose is unavailable, document what the reviewed frame actually shows and identify that shot for a future retake.

## Progress

2026-11-24 — Contributor approved the plan on `docs/task-012-storyboard`. The contributor owns the real-GPU capture and the four gates. Results are pending.

- Branch: `docs/task-012-storyboard`
- 2026-11-24: Step 1 done. Mapped the tour stops to shipped walk, animal, photo and spring actions, the training to combat hooks, and the ending frames to the ending UI and party runtime. Decoded both height rasters and checked the route and brook data.
  - `t5-wind`: the dogs' paths climb from 272.5 m at the wind stop to about 277 m at 700/−640. Frame from downhill near 688/−642.
  - `t6-reh-*`: use the shipped doe at 704/−779 (267.3 m) and her following fawn. The route stop is 9 m above the doe. Take the wide shot from the stop and the two closer shots lower on the slope.
  - `t7-marlene`: use 826/−866 on dry ground (276.3 m, 9° slope), with the camera on the dam and the pond to the east.
  - `t12-training` and `t12-bannlicht`: 1030/−852 is open 1789 meadow (282.2 m, 11° slope), 35.6 m from the spring and 26.5 m from the design's Bleiche reference. Frame targets east to northeast on the bank of the mapped Karlsbergbach.
  - `e1-wahl`: keep the player at the shipped checkpoint (343.8 m), with the camera slightly inside the clearing on flatter gravel at 1203/−1098, aimed toward TF01 (344.4 m).
- 2026-11-24: Step 2 done. `node --check scripts/dev/storyboard.mjs` passed. `--list` prints 68 distinct IDs, including all 28 beats in sections A–C. The shot script stages the ticket, training and designed choice at the clearing using the current game systems. Framing and props are pending GPU review.
  - Retired JPEGs to remove in step 7, after capture: `p1-feldstation.jpg`, `p2-damm.jpg`, `p3-orangeriemauer.jpg`, `p3q-quelle.jpg`, `p3q-touch.jpg`, `p3r-brunnenstube.jpg`, `p4-ehrenhof.jpg`, `p5-hohlweg.jpg`, `p6-eiskeller.jpg`, `p7-punktwolke.jpg`, `p8-regeln.jpg`, `p9-wechsel.jpg`, `p9b-sommer-1789.jpg`, `p10-abend.jpg`, `p11-nacht.jpg`, `c-marlene.jpg`, `e-museum.jpg`, `e-burn.jpg`, `e-keep.jpg`. Capture overwrites `e1-wahl.jpg` in place.
- 2026-11-24: Step 3 done. Replaced the old prologue and ending cards, updated Orte, Figuren and Gegenstände, and translated the retained chapter and lightbox captions. The 28 new cards follow the beat sheet, with K1–K4 between the crossing and the endings. Static checks passed for the local links and lightbox script. Browser and offline visual review remain for the contributor.
- 2026-11-24: Step 4 done. Updated the capture commands and coverage notes. All 101 thumbnail and lightbox pairs match the 68 distinct IDs from `--list`. The only missing sources are the 27 JPEGs with new filenames. All 60 original JPEGs are still present. The retake of `e1-wahl` will replace its old image in place. The final size remains pending.
- 2026-11-24: Sandbox gates. `pnpm typecheck`, `pnpm test` (1,460 passed), and `pnpm build` passed. `pnpm validate` stopped before content validation when tsx could not open its IPC socket (`listen EPERM`). The contributor runs all four gates on the final state. No game entry points, gameplay behavior, or e2e selectors changed.
- 2026-11-24: `git add` could not create the linked worktree's `index.lock` (`Operation not permitted`). The changes are unstaged. The contributor can make the intended commits outside the sandbox from the worktree root:

  ```sh
  git add -- scripts/dev/storyboard.mjs
  git commit -m 'docs(story): stage the guided tour and party captures' -m 'Refs: TASK-012'
  git add -- docs/storyboard/index.html
  git commit -m 'docs(story): tell the guided tour in the storyboard' -m 'Refs: TASK-012'
  git add -- docs/storyboard/README.md .mc/tasks/todo/TASK-012-update-the-storyboard-to-the-guided-tour-concept.md
  git commit -m 'docs(story): document the storyboard capture and handoff' -m 'Refs: TASK-012'
  ```

## Notes
- Do not name or depict the real tour guide: the guide stays the placeholder until written consent exists.
- Depends loosely on TASK-007 (title, lantern screen, hub at the spring): shoot the UI shots after those land, or re-shoot them then.
- Heavy job: run captures one at a time (`scripts/dev/heavy.sh` if present).
