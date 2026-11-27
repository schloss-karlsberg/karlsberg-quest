---
id: TASK-077
aliases:
- TASK-077
title: 'The deer photo card shows „Ricke (Platzhalter) · Kitz (Platzhalter)“'
slug: deer-photo-shows-placeholder-labels
status: todo
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- photo
- tour
- content
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# The deer photo card shows „Ricke (Platzhalter) · Kitz (Platzhalter)“

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, real GPU, desktop). The deer photo
is the tour's first wow moment. After a three-star shot the result card reads „Perfekt!“ and
then „Ricke (Platzhalter) · Kitz (Platzhalter)“. Every player who takes the photo sees the
placeholder text.

## Steps

1. New game, play the tour to the deer (t9 and t10), sneak in and take the photo with both animals
   in the frame.
2. The photo card (bottom right) shows the labels with „(Platzhalter)“.

## Cause

`content/photo/targets.json`: `reh.ricke` and `reh.kitz` still have `"label_de": "Ricke
(Platzhalter)"` / `"Kitz (Platzhalter)"` and `"placeholder": true`, with a note that the
animals system should attach them. The animals system now drives them (the photo judged both
animals), so the placeholder marks are stale. `photo.parkplatz` is also still marked placeholder.

## Acceptance criteria

- [ ] The card, the album and the gallery show „Ricke“ and „Kitz“ (or the final wording) with no
      „Platzhalter“.
- [ ] `placeholder` / `note` in `content/photo/targets.json` match reality for the two deer;
      check `photo.parkplatz` too.
- [ ] A content check fails if a player-facing photo label contains „Platzhalter“.
