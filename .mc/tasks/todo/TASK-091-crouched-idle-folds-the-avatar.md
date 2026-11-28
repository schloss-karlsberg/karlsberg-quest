---
id: TASK-091
aliases:
- TASK-091
title: Crouched idle folds the avatar in half
slug: crouched-idle-folds-the-avatar
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- player
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Crouched idle folds the avatar in half

## Goal

Found in the real-GPU playtest of 2026-11-28 (main f8a75ff7, desktop Chrome, finding F6). Press C
to crouch and stand still: the torso swings round the waist, the head ends up upside down at knee
height, arms up. `kq.avatar.state()` reports clip `Idle`, stance `crouch`. Crouch idle, crouch
walk and the stand ↔ crouch transitions must look right from third person, in the default outfit
and in the court costume.

## Cause

`Rig.turnBone` (`src/systems/characters/rig.ts`) turns a bone on top of its current quaternion
and relies on the mixer writing the clip pose again every frame. three's mixer writes a bone only
when its blended value changed, and never a bone without a track. In the packed MPFB player clips
the `spine_01` rotation track holds still (two equal STEP keys in Idle, Walk and the others), so
the crouch's 0.42 rad lean (`src/player/avatar.ts`) was added again every drawn frame: the torso
spun round the waist, about four turns a second at 60 fps. Measured before the fix: head height
over the feet between 0.27 m and 1.31 m in crouched idle, in real time and in `?manual`. The
people stand-ins and the enemy rigs already put their own turns back each frame; the avatar and
the NPC head look (`src/systems/npc/rigged.ts`, `Neck` has no track in `Idle_Neutral`) did not.

The old crouch also only leaned the body and sank the whole model 0.2 m, so the boots stood in
the ground.

## Plan (approved)

- [x] `Rig.update` puts every bone turned since the last update back into the mixer's pose before
      the mixer runs, so a `turnBone` lasts one frame for every caller.
- [x] Avatar crouch as a pose over the clips (`CROUCH`): knees bent (thigh forward, shin back, foot
      levelled), the lean at the waist, the head lifted; the body is lowered by what the bent legs
      lost, so the planted foot keeps its height. The CC0 surveyor (`?avatar=surveyor`) has its
      feet as baked IK targets outside the leg chain: it keeps lean and sink.
- [x] Unit tests: `tests/rig-bones.test.ts` (a turn on a bone with a still track or no track is one
      turn after 240 frames and after frames with dt 0), `tests/avatar-crouch.test.ts` (the real
      player GLBs in node: head over hips, pose stable over 600 frames and 300 paused frames, feet
      on the ground standing and walking, standing up returns to the standing pose).
- [x] e2e: `e2e/avatar-mpfb.spec.ts` checks head over hips and feet on the ground in crouched idle.
- [x] Docs: `docs/ACTION-RPG.md` §4.2, `docs/ARCHITECTURE.md` (characters).

## Acceptance criteria

- [x] Crouched idle holds one pose: head above the hips, no drift, also when paused or in `?manual`.
- [x] Crouch walk and stand ↔ crouch look right from third person in both outfits (real-GPU
      before / after screenshots reviewed).
- [x] The four gates pass; the hosted e2e run on the PR is green.

## Progress

- 2026-11-28: reproduced on a real GPU (ANGLE Metal) in real time and in `?manual`; cause found
  and fixed; tests added; gates green.
