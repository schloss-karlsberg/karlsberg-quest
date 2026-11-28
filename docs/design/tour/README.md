# Guided tour opening and party endings

The guided tour with time travel has been the default opening since v0.7.0. The
[story bible](../../../content/bible/00-overview.md) contains the story, Codex and voice design.
This directory records the feature design and owner decisions. The work packages and original
slice notes document the rollout. The [live story files](../../../content/story/README.md)
define shipped content.

## Index

| File | What |
|---|---|
| [Player-facing glossary](../glossary.md) | Canonical German terms for interface copy and content |
| [`content/bible/00-overview.md`](../../../content/bible/00-overview.md) | Story, chapters, set pieces, unlocks and fiction |
| [`content/bible/01-prolog.md`](../../../content/bible/01-prolog.md) | Shipped beats, route, handover and optional quest design |
| [`content/bible/06-enden.md`](../../../content/bible/06-enden.md) | Three choices, epilogue and party at dusk |
| [`content/bible/07-codex.md`](../../../content/bible/07-codex.md) | Codex sources, tour-card proposals and open source questions |
| [`content/bible/08-stimmen.md`](../../../content/bible/08-stimmen.md) | Gerold Imhoff, the modern doubles, Marlene and barks |
| [`storyboard-beats.md`](storyboard-beats.md) | 28 storyboard beats mapped onto `SHOTS`, and the shots they replace |
| [`impact.md`](impact.md) | 25 work packages with files, change, size and dependencies |
| [`systems.md`](systems.md) | Photo mode, cinematic, tour group, animals, Quelle home base, party, training flag; pacing targets |
| [`open-questions.md`](open-questions.md) | 16 questions, all resolved by the owner |

## Decisions recorded (owner, 2026-11-20, via the coordinator)

1. The opening is a guided tour (a tutorial). The player is an ordinary visitor with the owner's avatar. The former surveyor opening and field-station hub are retired.
2. The guide is big, skinny and bald, modelled on a real living guide whose consent is pending. **Placeholder name: Gerold Imhoff** in all docs and dialogue; the swap is one name. No real name, no personal details.
3. Route: meet at the car park at the forest edge (Wanderparkplatz; the building there is the Karlsberger Hof) → the hook along the farm track to the Felsenpfad → along the Karlsbergweiher → the Karlsbergquelle. The place name "Karlsberger Hof" may be named as a location (guide dialogue, map label, docs); no logo, signage, slogans, products, advertising tone or beer talk; FAKT texts stay neutral and sourced.
4. The group has 15 people, including modern doubles of the Duke, Mannlich, Hanne, Jost and Soll, plus Peter and Liese; modern Jost has two dogs. The circle closes at the party.
5. The tour teaches walking, camera, talking, map, codex, photo mode and sneaking. No combat in the tour; the first fight is a short guided training in 1789.
6. A mysterious moment: the wind picks up and the two dogs run barking into the forest (foreshadowing the Meute).
7. The deer scene is the first wow moment and the sneak tutorial: a roe doe and her fawn (November: no spots, grey winter coat, still following the doe), a good smartphone photo, may be a cinematic. Roe deer, not red deer.
8. Smartphone photo mode in the present; good photos fill an album and unlock codex cards; no signal in the past (running joke).
9. Marlene is a forester (Forstamt) along the route; the measuring quests become her optional side quests, during the tour and later in the present.
10. At the Quelle the player takes a break, the group walks on; the brass compass lies in the water, it talks; the first time travel is the spring touch. Since 2026-11-28 that touch is the journey: the visitor stays in 1789 and the tour ends there (see "Travel once and stay" below).
11. The whole time journey happens during that break. The Quelle is the home base and wake spot (caught respawn, Q-hold return and arrival effects). Pause provides saving and the feature pages.
12. Season: mid-November, golden leaves, slightly dusky light.
13. The three endings stay; after each comes a credits party on today's palace plateau at dusk with the guide and the group (cake, mulled wine, fairy lights), the historical characters as their modern doubles; per ending: museum → the guide shows the chronicle, burn → a fire bowl, keep → two dogs at your feet.
14. Kept: FAKT/FIKTION labels, tone rules, German player-facing content, the XP budget (prologue incl. the 1789 training ends at level 3).
15. Unverified facts (the Weiher's date and purpose, whether the Quelle fed the palace, palace-era quarrying on the Felsenpfad) are never FAKT; they are marked open, in the guide's mouth too.
16. The owner ruled that the disputed use of the Baumagazin should be dropped from cx.32. The builder update is pending. [Codex source notes](../../../content/bible/07-codex.md#offene-quellenfragen)

The owner confirmed on 2026-11-25 that the Bauwagen belongs at its old spot by the track as a
hidden present-day easter egg. The guided route, map and campaign omit the trailer. Pause provides
saving and access to feature pages.

## Travel once and stay (2026-11-28, TASK-089)

Owner feedback: "it does not make sense that we travel in time, then just 'look' and travel back.
i just want to travel once and stay there. if i travel, tutorials (chapter 1 finishes) and chapter 2
begins (outside the castle)." The scope below was set by the coordinator while the owner's answers
are pending; PRD D-012.

- **One touch.** `t17` ends on the touch, `t18` is the arrival: the shift, `player.q.wo`,
  `laub.t.1789` (without „Für heute genügt ein Blick.“) and `laub.t.seite`, with the player free to
  move as soon as the shift is done. No fade, no return, no second touch. The hand-over grants are
  unchanged.
- **„Der Hof“ continues where the visitor stands** (`continues` in the story file): no teleport, no
  era change. Its first beat `k1_0` sets the chapter up under the card; then Laub says „Sommer 1789.
  Kies, Hunde …“ and what is needed, and only then `k1_0b` offers the quests, with the coat at the
  Bleiche as the first objective. The chapter card stands alone. Chosen from
  Pause → Kapitel the chapter starts at the spring in the present, and Q there leads into the summer.
- **Arrival spot:** the spring itself, the invented Brunnenstube (cx.42), about 310 m from the
  palace gate. Positions come from the shared home constant (`src/systems/story/hub/home.ts`).
- **Cut:** the dawn opening, Marlene's radio line and Laub's „Ein zweites Mal also“, the arrival
  quest's „das Wasser berühren“ step. The next-morning framing also broke the one-afternoon rule.
- **How far "stay" reaches:** the first jump is one-way. Not built: a chapter or a game without
  the present (wake in the past, no Q home); see TASK-089, follow-ups.

## The deer stop (2026-11-28, TASK-080)

The playtest of 2026-11-28 called the deer photo the weakest moment of the first fifteen minutes:
both animals stood behind ferns, the photo scored „Perfekt!“ with no deer in the picture, and the
doe seemed never to react. Measured on that build, she did react, but out of sight: an upright
walker made her bolt at 20 m without a word, and the pair landed behind a row of ferns. Scope set
by the coordinator; decision 7 (the first wow moment, the sneak tutorial, grey winter coat, no
fail state) stands.

- **Seeing them.** The grazing spot (698 / −773) is a glade: no ferns or bushes within 9 m, on
  every graphics tier that draws them (`glades` on the `reh` stop of `p-fuehrung`). The doe lifts
  her head for 2.4 s every 9 s while grazing.
- **Her reactions, in the order they escalate.** Each has a sound caption.
  1. Head up, a look at the player: „[Die Ricke hebt den Kopf]“. Upright and walking: from about
     27 m. Crouched and slow: from about 10 m. Outside 20 m she only watches, however long.
  2. One step aside, away from the player, and she watches again.
  3. The flight: „[Die Rehe springen ab]“, then „Und weg.“ and Gerold's „Zu schnell.“ at any
     distance. Upright walking inside 20 m, running, or creeping on once she has stepped aside.
  Standing still when she looks up ends the alert, as the guide says. The pair stops 25 m on, on
  open ground where there is some, and grazes again; the stop waits 60 s after a flight before the
  tour moves on (180 s without one, 260 s at the latest).
- **The photo counts what is in it.** A shot is measured at the shutter: an animal of which less
  than 35 % shows is „Verdeckt“ and the shot is not good. „Perfekt!“ needs both animals at least
  70 % in the open, closer than 16 m and big in the frame, which from the sneak path means the 2×
  zoom. The card says in one sentence what to change. Between about 10 and 17 m the wide lens
  still gives two stars, which is all the tour asks for.
- **Chestnuts.** One that lands within about 13 m of the pair makes them look toward it for 8 s
  („[Die Ricke horcht auf]“): a photo in that time is the one Gerold praises with „Sie hat dich
  angesehen.“ One that hits a deer sends both running („Und weg.“). A toast says so once, when the
  player stalks the deer with a chestnut in the pack.
- **Not done.** No new spoken lines (they need voice clips). The coat stays grey; at 1× the pair is
  still small in a wide picture.

## Decisions (owner, 2026-11-20)

The owner's answers to the open questions, plus the earlier rulings:

- **Guide:** "Gerold Imhoff" is the placeholder name until the real guide gives written consent; the swap is one name. No real name, no personal details.
- **Karlsberger Hof:** the name may be used as a location only; no logo, signage, slogans, products, advertising tone or beer talk; FAKT texts neutral and sourced. **Q2 resolved:** no detailed model exists, so the tour starts at the Wanderparkplatz, the building is not modelled in the present (no new mesh), the name appears only where it occurs naturally (an address, the road name), and the guide points toward it in one line.
- **Animals:** roe deer (doe and fawn), not red deer.
- **Unverified facts** (the Weiher's date and purpose, whether the Quelle fed the palace, palace-era quarrying on the Felsenpfad) are never FAKT; they are marked open, in the guide's mouth too. The cx.32 re-check is an open task.
- **Time:** strict, one afternoon (≈ 14:30–16:50): the present is one November afternoon, from the tour through dusk to the party at nightfall. WP-12 is approved.
- **Doubles:** as proposed: the Duke (Carl Herzog), Mannlich (Christian Mann), Hanne Matz + Peter, Jost Fendel with two dogs, Herr Soll, Liese Wendling; the child Mats with the toy compass is the Laub nod; 7 extras, 15 in total.
- **Q-hold** teleports to the Quelle.
- **Old saves** are migrated without XP loss.
- **The tour is skippable on replay**, starting at the break at the Quelle.
- **Photo mode:** N toggles the viewfinder in every era. It shows „Kein Netz“ in the past. Good photos in the present unlock codex cards. Photos give no XP.
- **Storyboard:** 66–68 shots accepted; the budget is raised.
- **Party drinks (Q12):** mulled wine plus children's punch, nobody drunk, no brands, no fireworks; fairy lights; a fire bowl in the burn ending.
- **Jacket (Q13):** a bright outdoor jacket (orange or red), so „Feuersalamander“ and `laub.k1.orange` survive; costume by kq-characters (WP-13).
- **Messstab (Q14):** Marlene lends it and says „Ach, behalt ihn“ at the party. **Return leg (Q15):** the group goes uphill to the plateau. **cx.32 (Q16):** the brewery / villa sentence is dropped.

All open questions are resolved.

## Owners of the work packages

| Owner | Work packages |
|---|---|
| kq-mobile | WP-02 (safe ring, heal, respec), WP-05 (fast travel, POIs), WP-14 (photo mode) |
| kq-systems (new session) | WP-15 (cinematic), WP-16 (path-walk group), the Quelle home ring (WP-01) and return teleport (WP-04) |
| kq-characters | WP-17 (animals), WP-13 costume |
| 3D subagent (later) | WP-18 party set (props, lights, fire bowl) |
| kq-integrate | WP-22 (e2e) |
| kq-story | everything else (content, strings, story files, generators, unit tests for content, docs, storyboard) |

The story contracts these owners build against are in [`systems.md`](systems.md) § "Story contracts".

## Original rollout proposals

These notes describe the initial design. The [prologue bible](../../../content/bible/01-prolog.md) records the shipped grants, beats and save migration.

- **Prologue-only grants:** relief 1–2 from Marlene at the Weiher (main path), relief 3 unlocked there and taught at the Quelle; `item.bussole` + `story.compass` + `story.laub` + kartograf 1 when the compass comes out of the trough (t10); `item.stab.esche` lent by Marlene (t7). All on the main path, none in an optional quest.
- **Epilogue deeds:** the slot `vermessung` (read `q.p.trichter/meiler/irrlichter`) becomes `fuehrung`, counting Marlene's optional quests with a default line for none, plus Irrlichter and album add-ons.
- **First fight, Bannlicht, Meute:** a guided training in 1789 right after the touch (3 Nebelinge, 2 Mahnbriefe for the Bannlicht) before K1's k1_0b; Jost (K1 1.5) and the first Meute (K1 1.10) keep the pack tutorials; the old p9b Streuner/hounds go; Liese's Mahnbriefe become the first application, not a second tutorial.
- **Old saves and POI ids:** a `migrate` map p1…p11 → t1/t14/t15 with grants; station positions moved to the spring; quest ids kept; POI routes kept in order and the new route appended.
- **Pacing:** "first fight < 60 s" is replaced by: first wow ≤ 8 min, time travel ≤ 15 min, first fight ≤ 17 min (humans); bot limits 5 / 9 / 10 min (`systems.md`).
