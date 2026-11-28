---
id: TASK-090
aliases:
- TASK-090
title: 'Throw chestnuts; the stick cuts small plants and sometimes finds a chestnut'
slug: throw-chestnuts-and-cut-plants-with-the-stick
status: review
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- gameplay
- combat
- mobile
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-28
updated: 2026-11-28
---

# Throw chestnuts; the stick cuts small plants and sometimes finds a chestnut

## Goal

Owner feedback (2026-11-28): "it would be nice, if i can 'throw' the 'kastanien'. Make the game
also more fun (if the player finds the 'stick', he can attack small plants and also find
'kastanien' sometimes)."

Playtest of the same day: the 24 tour chestnuts have no use beyond three spoken lines, and the
Messstab stays lowered for the rest of the tour after Marlene hands it over. The first 15 minutes
of walking were judged slow. Foraging and throwing during the walk should make that stretch fun.

## Design

A new system `forage` (`src/systems/forage/`), described in `docs/ACTION-RPG.md` §7.1.

**Throw.** Action `throw`, default key F (rebindable; a key the player already put on F keeps
it), touch button „Kastanie“ in the bottom row of the thumb arc, shown only with chestnuts in the
pack and carrying the count. No gamepad: the game has no gamepad input. Hold shows the arc and a
landing ring, letting go throws; a tap throws at once. The landing point is where the view meets
the ground, 2–22 m from the hand, or the body of the locked / soft target. One chestnut leaves
the pack per throw (`item:take`), 0.55 s between throws. It is gone after it lands.

What a throw does:

- **Enemy:** 4 damage and a flinch; small bodies (up to 40 base Lebenskraft) lose their footing
  for 0.3 s, at most once every 4 s each. Armour, elites and bosses take 1. Lights and veiled
  bodies let it through. It never ends an enemy (the last blow is the staff's) and it wakes what
  it hits, so one enemy can be pulled out of a pack.
- **Noise where it lands** (`world:noise`): the tour's deer prick up, and bolt when it lands next
  to them twice; a calm pack on patrol sends its nearest hound to look for about ten seconds and
  is warier afterwards. A pack that is searching or chasing, and the staged pack modes (the
  chapter 2 chase, the drive, the kennel finale), ignore it.
- **People, dogs, trunks, walls:** it bounces off and drops. Nobody is hurt or alerted.
- Not while a scene lowers the staff (`combat.disabled` outside the tour), in photo mode, in a
  conversation, while measuring, flying or lying flat.

**Cut.** Where the staff comes down (`combat:arc`: Hieb, Wuchthieb, Erdstoß, Wirbel), ferns,
flower clumps and bushes up to 1.25 m are cut to a stub and grass, meadow flowers and reeds are
mown. They grow back in three steps over 75 s of game time. A freshly cut plant drops a chestnut
with a chance of 10 %, plus 3 % for every plant in a row that gave nothing (at most 34 %), halved
outside the forest; the roll is seeded by the plant's spot and the cut counter. The chestnut is
an ordinary pickup a step beyond the plant.

In the guided tour fighting stays off, but with the borrowed Messstab in the pack the Hieb and
the Wuchthieb work (`forageOnly`: `combat.disabled` and `tour.slice`); dodge, Bannlicht and the
abilities stay off there. Nothing in the tour can be hit.

**Instanced vegetation.** No per-plant meshes. A short list of mown circles
(`src/world/vegetation/cuts.ts`, at most 48) is read by `GroundCover` and `NatureProps` while
they build their instance lists; they rebuild once per cut and once per growth step. On Niedrig,
where the forest-floor props are not drawn, the nearest 48 of the same plants show as
broad-leaved clumps in one extra instanced layer, so the plants and the finds are the same on
every tier.

**Feel.** Procedural sounds (throw, landing, splash, cut, find), one pool of 120 leaf cards for
cut plants and landing chestnuts, a short trail behind the chestnut. With reduced motion: no
leaves, no trail, a steady landing ring.

**Teaching.** One toast on the first chestnut picked up („Kastanien kannst du werfen: …“) and one
when the staff first comes to hand, each once per save, between spoken lines. The HUD chip in the
vitals dock shows the key and the count while there are chestnuts.

**Save.** New optional slice `systems.forage` (counters and the hints shown); older saves load
without it. Cut plants and chestnuts in flight are not saved.

## Plan

1. Rules: `forage/logic.ts` (aim, arc, bounces, drop roll, slice), `vegetation/cuts.ts`.
2. Combat: the swing reports its arc, `CombatSim.pelt`, the tour's forage-only swings.
3. Nature layers read the cut list; the Niedrig stand-in layer.
4. System, visuals, audio, strings, HUD chip, touch button, key binding and its migration.
5. Deer and pack react to `world:noise`.
6. Unit tests, `e2e/forage.spec.ts`, real-GPU look, docs.

## Progress

- PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/140
- Tests: `tests/forage.test.ts`, `tests/forage-world.test.ts`, the `forage` case of
  `tests/save-fuzz.test.ts`, `e2e/forage.spec.ts`; real-GPU strips with `e2e/gpu/forage.gpu.ts`.
- Along the tour's path there are on average 11 plants to cut within 12 m of each of the 24
  chestnut spots (none without any), so the walk yields roughly two chestnuts per stop for a
  player who mows what is near.

## Open questions

- The tour's lines for 12 and 24 chestnuts fire on the count in the pack, whatever its source.
  They are voiced, so the wording was left alone.
- A chestnut thrown at the 1789 court is not a tell for the watchers.
- The hanging Fläschchen still need a Wuchthieb; a well-aimed chestnut could shake one down too.

## Acceptance criteria

- [x] With a chestnut in the pack, F (or the touch button) throws one where the view points; the
      count goes down by one; the arc is visible while the key is held.
- [x] In the tour, after Marlene lends the Messstab, a swing cuts ferns and grass; a chestnut
      sometimes rolls out and can be picked up.
- [x] Cut plants grow back; no frame-time regression with the cut list empty.
- [x] The touch button appears only with chestnuts; Pause → Steuerung lists the key.
- [x] Saves round-trip; older saves load.
- [x] Reduced motion: no flying leaves, no trail.
