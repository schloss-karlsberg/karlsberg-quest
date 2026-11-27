---
id: TASK-083
aliases:
- TASK-083
title: 'Chapter 3 and 4 opening objectives show no marker in the present'
slug: chapter-3-4-openers-have-no-marker
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- quests
- story
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-27
updated: 2026-11-27
---

# Chapter 3 and 4 opening objectives show no marker in the present

## Goal

Found in the finish-line playtest (2026-11-27, main 6796810, desktop, `?kapitel=3` and
`?kapitel=4`). Both chapters start at the Quelle in the present with an objective that asks for a
walk and then a Q shift, but the HUD shows **no distance, no compass marker and no waymark**:

- Chapter 3: „Im Ehrenhof: Q – in den Juli 1793“ (target 1210/−1114, about 320 m away).
- Chapter 4: „Hinunter zum Taleingang. Dort: Q – nach 1796“ (target 497/−900, about 560 m away,
  across the Weiher).

Only Laub's radio line names the place. Chapter 2 does it right: „Zum Parkzaun am Carlsluster
Torhaus …, dort Q“ shows 757 m and a marker in the present. The „Q Zeitsprung“ prompt does appear
once you stand at the spot, and the next objective after the shift has a marker again.

## Cause

The quest objectives (`content/quests/03-kapitel-3.quests.json` `ehrenhof`,
`content/quests/04-kapitel-4.quests.json` the objective after `zettel`) put the target era in
`where.era` (`1793-07`, `1796`), and the HUD hides waymarks whose era is not the current one
(`src/systems/quests/logic.ts`). Chapter 2 sets a story `objective` with plain x/z
(`content/story/02-kapitel-2.story.json`), so its marker shows in the present. These files are
generated: change `scripts/content-build/` and rebuild.

## Acceptance criteria

- [x] At the start of chapters 3 and 4 (fresh and via a normal chapter transition) the opening
      objective shows its distance and marker in the present.
- [x] After the Q shift the marker logic is unchanged (the next objective leads on).
- [x] A content or unit check: every objective whose text asks for a Q shift has a waymark in
      the era the player is in when it becomes active.

## Result

Fixed in the quest wayfinding, not in the content: a `reach` objective's place is now `anyEra`
(`objectiveTarget` in `src/systems/quests/wayfinding.ts`), so it is shown from every era. All four
„dort: Q“ openers (chapters 1 to 4) had the same tag; chapter 2 only worked because its story
objective led instead. Other objective kinds still hide in another era. The stall hint for such a
place reads „Zur Markierung gehen (… m Richtung …), dort Q halten, um … zu wechseln.“ After the
shift the next objective leads as before.

Checks: `tests/wayfinding.test.ts` (reach place from every era, hint) and
`tests/quests-qshift-marker.test.ts` (every objective text with „Q –“ has a marker in the present;
both fail on main), `e2e/quests.spec.ts` › chapter 3 / 4 opener markers.
