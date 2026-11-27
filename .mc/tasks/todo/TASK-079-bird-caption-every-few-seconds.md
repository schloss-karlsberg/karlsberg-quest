---
id: TASK-079
aliases:
- TASK-079
title: '„Vögel zwitschern.“ caption fires every few seconds'
slug: bird-caption-every-few-seconds
status: todo
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
updated: 2026-11-27
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

- [ ] The bird caption appears once when birdsong starts (entering the forest, era change) and
      then at most every 30 s or so, not on every chirp; same for the other ambience loops.
- [ ] Story and sound-effect captions (barks, wind, water) are unchanged.
- [ ] A unit test pins the reduced cadence.
