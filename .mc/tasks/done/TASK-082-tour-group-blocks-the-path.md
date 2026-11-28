---
id: TASK-082
aliases:
- TASK-082
title: Waiting tour group blocks the player on the narrow dam path
slug: tour-group-blocks-the-path
status: done
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- tour
- npc
- player
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-28
---

# Waiting tour group blocks the player on the narrow dam path

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, desktop). After the second shortcut
(t11 → t12, the dam at about 833/−839) the guide stood 22 m ahead, waiting, and the group
members stood on the narrow path between him and the player. Walking at the guide (W held, a
few degrees off the member in front) did not move the player at all for 30 s: the NPC collision
stops the player dead with no sliding. Only a sideways step got past. Then the guide moved on.

Screenshot:
local screenshot `d03-dam-blocked-by-group.jpg` (not committed)

## Acceptance criteria

- [x] Walking into a standing NPC at an angle slides the player along it (as with walls), or tour
      members step aside when the player pushes into them.
- [x] When the guide waits for the player, the members do not form a wall across a narrow path
      (wait slots beside the path, or the guide's wait radius reaches the player behind them).
- [x] The tour e2e and the walk specs still pass.

## Outcome

Cause: t10 holds the group and t11 warps it to `damm` without a `follow`, so the held members
landed in the follow layout (rows of three across the path) and stayed there while Gerold walked
on and waited. Bumping into a visitor only pushed the player radially out, which keeps sin(angle)
of the step (about 5 % at 3°), so it felt like a dead stop.

- `slideThroughCrowd` (`src/world/crowd.ts`), used for the player in `src/boot.ts`, collides and
  slides. The step is swept, so the player never tunnels. At a contact the player keeps the part
  along the visitor, at least 45 % of the step, and a head-on bump goes round the side that no
  wall or other visitor shuts. In a corner closer than the player is wide, the player stops. A
  slide that a wall pushes back into a visitor is refused. `Player.updateWalk` runs one more crowd
  push-out after slope, water and walls, and stays put if that would push it into a wall.
- `laneSlots` (`src/systems/walk/group.ts`) places the members in two files 1.15 m left and right
  of the route line, a pair every 1.1 m behind the guide. A held group lands there on a warp, and
  a following group stands there while its guide waits on the leash.
- Tests: `tests/crowd-slide.test.ts` (head-on, glancing, tunnelling, corner, wide gap, visitor by
  a wall, head-on by a wall, player with keyboard / odd stick angle / diagonal, lane layout on
  straight and bent paths, the held group on the dam). `e2e/walk.spec.ts` walk (e) holds W
  through the held group on the dam to the waiting guide.
- Enemy body-blocking (`combat/sim.ts`) and the dogs' own crowd push-out are unchanged.

