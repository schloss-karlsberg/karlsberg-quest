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
over the feet between 0.27 m and 1.31 m in crouched idle, in real time and in `?manual`. After
walking it starts a few seconds late: while the idle and walk weights still settle, the blended
value changes and the mixer keeps writing the bone. The CC0 surveyor folded at once (`Abdomen`
has no track in its idle). The people stand-ins and the enemy rigs already put their own turns back each frame; the avatar and
the NPC head look (`src/systems/npc/rigged.ts`, `Neck` has no track in `Idle_Neutral`) did not.

The old crouch also only leaned the body and sank the whole model 0.2 m, so the boots stood in
the ground.

## Plan (approved)

- [x] `Rig.update` puts every bone turned since the last update back into the mixer's pose before
      the mixer runs, so a `turnBone` lasts one frame for every caller.
- [x] Avatar crouch as a pose over the clips (`CROUCH`): the hips sink by 0.28 of the leg length
      and each knee bends to keep its foot where the clip put it (two-bone IK, `legBend.ts`), with
      the lean at the waist and the head lifted. Idle and walk keep their foot plants and the
      clip's own hip bob. The CC0 surveyor (`?avatar=surveyor`) has its feet as baked IK targets
      outside the leg chain: it keeps lean and sink.
- [x] With the staff in hand (a fight) the crouch keeps 0.35 of the lean (`CROUCH.guard`): at the
      full lean the staff's shoe was 0.14 m in the ground (0.11 m on main).
- [x] Unit tests: `tests/rig-bones.test.ts` (a turn on a bone with a still track or no track is one
      turn after 240 frames and after frames with dt 0), `tests/leg-bend.test.ts` (the IK maths),
      `tests/avatar-crouch.test.ts` (the real player GLBs in node: head over hips, pose stable over
      600 frames and 300 paused frames, feet on the ground and hips level standing and walking,
      standing up returns to the standing pose).
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
- 2026-11-28: real-GPU review (ANGLE Metal, 1280×720, `?manual`, build + preview), before from main
  and after: stand, going down, crouch idle (side and back), three walk phases, getting up, in the
  default outfit today and the court costume in 1789; the staff in hand in a fight; the surveyor.
  Measured after: head 1.24 m and hips 0.69 m over the feet in crouched idle (standing 1.56 /
  0.93), ankles at their standing height (0.10 m), head height within 5 mm over 4 s of real time.
  Crouch walk in node: hip bob 5.4 cm (standing walk 5.6 cm), no foot below its standing height.
  The surveyor leans without folding; its feet stand 0.2 m in the ground as before (fallback).
