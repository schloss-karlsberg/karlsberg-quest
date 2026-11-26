---
id: TASK-065
aliases:
- TASK-065
title: 'Fix the chapter 2 sneak after TASK-048'
slug: fix-chapter-2-sneak-after-task-048
status: review
priority: 1
owner: ''
projects: []
customers: []
tags:
- dev
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Fix the chapter 2 sneak after TASK-048

## Goal

`e2e/chapter-k2.spec.ts` fails at the sneak to the hedge (`e2e/helpers/k2.ts`, the `walk` to
[1478, -584] with `maxSeconds` 70): `sneak.reached` is false since PR #75 (TASK-048). The bisect
found it passes at `79c5718` and fails at `d70927d`. Keep TASK-048's fixes and make the sneak work.

## Root cause

`src/systems/hunt/sim.ts` `PackSim.freshPrintNear` matched every boot print before #75, including
the Warner's scripted trail (agent −2, the `hunt:trail` cue in `02-kapitel-2.story.json`). That
trail runs straight through the sneak: all three sentry beats of the `k2_2-augen` threat cross it.
Within seconds of the horn a sentry crossed it at about (1491, −558). The pack went `searching`
and ran off south-west along the trail. The sentries never walked their beats in any e2e run or
playtest since they were added (39ca74d, playtest round 5). The e2e's straight walk passed only
because the pack had left.

#75 added `p.agent !== -1` (the documented rule: the Warner's prints are for the player, not the
hounds). The sentries now stay and walk their beats. The straight walk meets them: in the browser
it was seen and caught at t = 23 s near (1487, −567), with no tracking involved.

A second problem came to light: a sentry walking its beat back over the player's fresh prints puts
its nose down and the pack tracks the player. In the pure simulation, a walker that stays out of
every cone and out of earshot was still caught in 6 of 10 start phases this way. Waiting for a
gap, the option the sneak was designed around, did not work.

## The rule

The pack follows only the player's boot prints (agent −1) on a segment it has not lost. It never
follows the Warner's or any other scripted prints (agent −2), or its own paw and hoof prints.
Calm sentries on `beats` (only the K2 sneak has them) pick up no prints at all. Their sight
cones (`hunt.cones`) and hearing decide the sneak. Once they have noticed you, the searching pack
casts round where it lost you and picks up your prints there.

## Fix

- `src/systems/hunt/sim.ts`: `scanForTrail` skips the hound-crossing pickup while the pack is
  calm and on its beats (`onBeats`). TASK-048's ownership check and pruning stay unchanged.
- `e2e/helpers/k2.ts`: `walk(..., { sneak: true })` plays the sneak like a player watching the
  cones. It steps only where no hound will see or hear it within the next second. It veers up
  to 75° to find such a step, otherwise holds still or backs away. The sneak step uses it instead
  of the straight `dodge` walk.
- `tests/hunt-k2.test.ts`: "which prints the pack follows in the K2 sneak". Sentries walk over
  both the Warner's prints and the player's and never start tracking. This failed on main and
  passes with the fix. A searching or roaming pack still picks up the player's prints, never the
  Warner's.
- Docs: `docs/ARCHITECTURE.md` (snow tracks), `docs/ACTION-RPG.md` (§14 risks, K2 pacing),
  `docs/PRD.md` changelog.

## Results

See the PR description for gate and e2e results.
