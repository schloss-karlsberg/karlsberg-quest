---
id: TASK-082
aliases:
- TASK-082
title: 'Waiting tour group blocks the player on the narrow dam path'
slug: tour-group-blocks-the-path
status: todo
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
updated: 2026-11-27
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

- [ ] Walking into a standing NPC at an angle slides the player along it (as with walls), or tour
      members step aside when the player pushes into them.
- [ ] When the guide waits for the player, the members do not form a wall across a narrow path
      (wait slots beside the path, or the guide's wait radius reaches the player behind them).
- [ ] The tour e2e and the walk specs still pass.
