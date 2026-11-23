---
id: TASK-012
aliases:
- TASK-012
title: Update the storyboard to the guided-tour concept
slug: update-the-storyboard-to-the-guided-tour-concept
status: todo
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
updated: 2026-11-23
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
- [ ] `docs/storyboard/README.md` updated; captions in German
- [ ] If `scripts/dev/storyboard.mjs` changed: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Notes
- Do not name or depict the real tour guide: the guide stays the placeholder until written consent exists.
- Depends loosely on TASK-007 (title, lantern screen, hub at the spring): shoot the UI shots after those land, or re-shoot them then.
- Heavy job: run captures one at a time (`scripts/dev/heavy.sh` if present).
