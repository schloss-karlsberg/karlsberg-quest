# Tour opening and party endings: design drafts

**Status: draft for the release after 0.5.0.** Nothing here is built. These files are replacement drafts; `content/bible/*` stays unchanged until the owner approves and the work packages land. Player-facing text is German; docs prose is English or German as in the existing bible.

## Index

| File | What |
|---|---|
| [`bible/00-overview.md`](bible/00-overview.md) | Changed sections of the overview: Ausgangslage, Meute, Bogen, Ende, chapter table, travel, wow moments, unlocks, fiction list |
| [`bible/01-prolog.md`](bible/01-prolog.md) | Full rewrite of the prologue as „Die Führung“: beats t0–t15, stops with x/z, dialogue sketches, tutorials, photo targets, the deer, the dogs, Marlene's quests, the break at the Quelle, the 1789 training, XP budget, save migration |
| [`bible/06-enden.md`](bible/06-enden.md) | The three endings with the new choice place and the party per ending |
| [`bible/07-codex-impact.md`](bible/07-codex-impact.md) | New cards (stops, roe deer, photo cards), changed unlocks, the cx.32 conflict |
| [`bible/08-stimmen.md`](bible/08-stimmen.md) | Gerold Imhoff, the doubles, Marlene as forester, new barks |
| [`storyboard-beats.md`](storyboard-beats.md) | 28 storyboard beats mapped onto `SHOTS`, and the shots they replace |
| [`impact.md`](impact.md) | 25 work packages with files, change, size and dependencies |
| [`systems.md`](systems.md) | Photo mode, cinematic, tour group, animals, Quelle hub, party, training flag; pacing targets |
| [`open-questions.md`](open-questions.md) | 16 questions for the owner with defaults |

## Decisions recorded (owner, 2026-11-20, via the coordinator)

1. The opening is a guided tour (a tutorial). The player is an ordinary visitor; the look is the owner's avatar. No surveyor, Feldstation or Bauwagen.
2. The guide is big, skinny and bald, modelled on a real living guide whose consent is pending. **Placeholder name: Gerold Imhoff** in all docs and dialogue; the swap is one name. No real name, no personal details.
3. Route: meet at the **Karlsberger Hof** car park at the forest edge → the hook along the farm track to the Felsenpfad → along the Karlsbergweiher → the Karlsbergquelle. The place name "Karlsberger Hof" may be named as a location (guide dialogue, map label, docs); no logo, signage, slogans, products, advertising tone or beer talk; FAKT texts stay neutral and sourced.
4. The group has 15 people, including modern doubles of the Duke, Mannlich, Hanne, Jost and Soll (plus proposed: Peter, Liese); modern Jost has two dogs. The circle closes at the party.
5. The tour teaches walking, camera, talking, map, codex, photo mode and sneaking. No combat in the tour; the first fight is a short guided training in 1789.
6. A mysterious moment: the wind picks up and the two dogs run barking into the forest (foreshadowing the Meute).
7. The deer scene is the first wow moment and the sneak tutorial: a roe doe and her fawn (November: no spots, grey winter coat, still following the doe), a good smartphone photo, may be a cinematic. Roe deer, not red deer.
8. Smartphone photo mode in the present; good photos fill an album and unlock codex cards; no signal in the past (running joke).
9. Marlene is a forester (Forstamt) along the route; the measuring quests become her optional side quests, during the tour and later in the present.
10. At the Quelle the player takes a break, the group walks on; the brass compass lies in the water, it talks; the first time travel is the spring touch.
11. The whole time journey happens during that break. The Quelle is the new home base and wake spot everywhere (caught respawn, Q-hold return, hub functions).
12. Season: mid-November, golden leaves, slightly dusky light.
13. The three endings stay; after each comes a credits party on today's palace plateau at dusk with the guide and the group (cake, mulled wine, fairy lights), the historical characters as their modern doubles; per ending: museum → the guide shows the chronicle, burn → a fire bowl, keep → two dogs at your feet.
14. Kept: FAKT/FIKTION labels, tone rules, German player-facing content, the XP budget (prologue incl. the 1789 training ends at level 3).
15. Unverified facts (the Weiher's date and purpose, whether the Quelle fed the palace, palace-era quarrying on the Felsenpfad) are never FAKT; they are marked open, in the guide's mouth too.
16. The cx.32 re-check is an open task (`bible/07-codex-impact.md` §4).

## The five hard problems, solved on paper

- **Prologue-only grants:** relief 1–2 from Marlene at the Weiher (main path), relief 3 unlocked there and taught at the Quelle; `item.bussole` + `story.compass` + `story.laub` + kartograf 1 when the compass comes out of the trough (t10); `item.stab.esche` lent by Marlene (t7). All on the main path, none in an optional quest.
- **Epilogue deeds:** the slot `vermessung` (read `q.p.trichter/meiler/irrlichter`) becomes `fuehrung`, counting Marlene's optional quests with a default line for none, plus Irrlichter and album add-ons.
- **First fight, Bannlicht, Meute:** a guided training in 1789 right after the touch (3 Nebelinge, 2 Mahnbriefe for the Bannlicht) before K1's k1_0b; Jost (K1 1.5) and the first Meute (K1 1.10) keep the pack tutorials; the old p9b Streuner/hounds go; Liese's Mahnbriefe become the first application, not a second tutorial.
- **Old saves and POI ids:** a `migrate` map p1…p11 → t1/t14/t15 with grants; station positions moved to the spring; quest ids kept; POI routes kept in order and the new route appended.
- **Pacing:** "first fight < 60 s" is replaced by: first wow ≤ 8 min, time travel ≤ 15 min, first fight ≤ 17 min (humans); bot limits 5 / 9 / 10 min (`systems.md`).
