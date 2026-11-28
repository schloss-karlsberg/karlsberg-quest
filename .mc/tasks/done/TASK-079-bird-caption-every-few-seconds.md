---
id: TASK-079
aliases:
- TASK-079
title: „Vögel zwitschern.“ caption fires every few seconds
slug: bird-caption-every-few-seconds
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- accessibility
- audio
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# „Vögel zwitschern.“ caption fires every few seconds

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810). With subtitles on (the default),
the ambient caption „Vögel zwitschern.“ appears every 2.5 to 8.5 s for 2 s in the present-day
forest. In about 40 s of the tour it showed nine times. It competes with real story captions
(„[Diane und Bijou bellen]“, „[Der Wind frischt auf]“) and the bottom-centre prompts, and it reads
as noise rather than information.

## Cause

`src/systems/ambience/index.ts` `playBirds`: every chirp (`birdTimer = (2.5 + rand·6) / level`)
calls `this.caption('birds', 2000)`.

## Acceptance criteria

- [x] The bird caption appears once when birdsong starts (entering the forest, era change) and
      then at most every 30 s or so, not on every chirp; same for the other ambience loops.
- [x] Story and sound-effect captions (barks, wind, water) are unchanged.
- [x] A unit test pins the reduced cadence.

## Progress

- 2026-11-28. Recurring ambience captions (birds, 1789 hooves and court) now caption the first sound
  after the bed starts (entering it, landing, era change) and then wait at least 30 s
  (`AMBIENCE_CAPTION_GAP`); the sounds keep their rhythm. Wind and water already captioned once per
  era or visit; story and effect captions are untouched. New test "captions birdsong when it starts
  and then at most every 30 s, not on every chirp" in `tests/ambience.test.ts` drives fixed 0.2 s
  ticks with `Math.random` pinned to the shortest chirp interval; the court test was updated.
