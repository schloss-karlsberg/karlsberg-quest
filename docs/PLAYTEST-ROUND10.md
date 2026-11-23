# Playtest round 10 (2026-11-20): newcomer play in bullet time, real GPU

> **History:** this playtest (2026-11-20) covers the earlier surveyor prologue (Feldstation / Bauwagen, lantern start). Since v0.7.0 a new game opens with the guided tour (`docs/design/tour/`); the findings below are a record, not a description of the current opening.

Tester: Claude (playtester agent), via the Claude in Chrome extension in the owner's real Chrome.
Build: play copy at http://localhost:5290/?nosave (lead-run server). Fresh new game by hand, name "Jona",
Sanfter Modus **off**. Fights in bullet time (`kq.pilot.act`, ~15 steps per act).
Timestamps are wall-clock minutes since the start of play (T+mm); game time from the observation is in
brackets where useful.

## 1. Play log

- **T+00** Title screen shows straight away with "Fortsetzen / Neues Spiel / Einstellungen" (the
  "Laterne anzünden" gate came *after* the name, not before). "Neues Spiel" asks an in-game "overwrite
  Feldbuch?" modal, then the 16+ notice (good, clear, honest), then the Feldbuch name, then the lantern
  gate "Früh am Morgen, vor dem Bauwagen." Starts in an autumn forest, warm low sun, Bauwagen with lit
  windows. First impression: genuinely pretty.
- **T+05** Radio intro from Marlene ("Fiktion" tag, nice touch). The lantern gate said "Früh am Morgen",
  the chapter card says "heute, ein Novembernachmittag" -> contradiction (F-02). Walked to the Messstab (11 m,
  marker clear), E picks it up, toast stack on the right. Objective switches to the Nebelinge at the Damm.
- **T+08** Walking down to the Damm: the camera sits right behind the head with huge dark tree trunks
  filling a third of the frame, again and again (F-03). The Nebellinge are small dark-blue blobs half hidden
  in ferns and *below* the crest of the slope; at 8 m I often only see their HP bars (F-04).
- **T+12** First fight (3 Nebellinge). First hit 12, finisher 17, nice white dissolve puff with "+8 EP". The
  caption "Nebelling duckt sich - Ausfall!" + "Er holt aus - [Leertaste]: zur Seite ausweichen!" is clear.
  Second and later lunges get the caption only sometimes. Light attacks often whiff: the Nebellinge circle at
  3.0-3.4 m, just outside reach (F-06). Stamina ran out after 3 swings + 2 dodges (100 -> 0, exhausted).
- **T+14** I dodged once (~5 m) away from a lunge, and the fight **ended**: both wounded Nebellinge
  "return"ed and regenerated to full HP (9 -> 18 and 6 -> 18) within ~1.5 s (F-05). Felt like being punished
  for dodging.
- **T+20** Re-engaged and won (0 damage taken). "Taste 2" relief view: trees vanish, the ground turns into a
  red/white/blue relief map with an orange contour ring. Striking, and enemies read *much* better on it than in
  the normal forest. Walking onto the marker opened "Mauerrest am Weiher" (nice Lageskizze card, a bit
  pixelated). One more Nebelling from the wall, easy.
- **T+25** Next objective: "Den Waldweg hinauf nach Osten: die hohe Stufe im Wald", **430 m** away. Straight
  line runs into the Weiher ("Zu tief zum Waten"), I had to find my own way round. No visible Waldweg. Then
  ~45 s of sprinting uphill through a (beautiful, sunlit) pine forest with nothing happening (F-10). Marlene's
  radio lines arrive one by one, the bottom radio box sits there the whole time; the first "Du schnaufst ja"
  line played twice (F-09). The map (M) is a lovely hachure Altkarte but the objective is a 6 px diamond
  with no label (F-11).
- **T+33** Arrived: level 2 card, Kohlplatten quest added, and two **Streuner** (wolves, 36 HP) came down the
  slope. This fight was the worst moment so far: the camera framed the fight between two trunks, twice lost
  the player completely after a dodge (F-07), and one Streuner ran *through* the camera so a huge
  semi-transparent wolf covered the whole screen (F-08). Took 27 damage, 9 of it from a lunge that started
  while I could not see my own character. Stamina ran dry twice; "exhausted" blocks attacks *and* dodges until
  ~30 stamina, so I stood next to a recovering wolf at 22 stamina, got "Kein Atem." and could not punish
  (F-12). Kill puff and swing trail look good. "Die Truhe springt auf." toast, but I never saw a chest (F-13).
- **T+40** (game ~120-150 s) Kohlplatten, map overlay 1836-41 at the Ehrenhof (sepia, ruin outlines: lovely).
  On the way: floating dark-green slabs near the hohe Stufe (F-14) and a huge black cone right in front of
  the camera at the Lichtung with the player invisible (F-15). Clicking the "Aufgabe erfüllt" card also
  swung the staff in the world (F-16).
- **T+50** (g150-193) Hohlweg (Taste 2) -> card "Der Hohlweg", then 340 m east to the round Grube. Taste 3
  (VAT) there opens "Die Grube mit Ringwall" and 4 Nebellinge pop out, plus 2 "escort" Nebellinge from
  behind ("Da kommen mehr - von hinten!" caption: good). `kq.perf()` here: 120 fps, 8.3 ms avg, p95 8.8 ms,
  cpu 2.0 ms, 142 draw calls, 3.56 M triangles. No perf problem at all on this GPU.
- **T+60** (g193-217) Grube fight, 24 s, 0 damage taken but stressful: trunks filled 30-45 % of the frame after
  most dodges (F-21), quest Nebellinge "reform" instead of dying when the killing blow is not the 3rd combo
  hit (F-22), and some of my clicks and one dodge were swallowed (F-23). Quest done, level 3.
- **T+65** Talents: took Langer Atem and Standfest (clear, nice tree). Objective "Die Punktwolke auf dem
  Tablet ansehen" pointed **860 m** back west. Used the Feldbuch Karte "Hinreisen" to the Feldstation (fast
  travel is a real feature, not a cheat). At the Bauwagen: the Feldstation hub (Pinnwand, Funkgerät, Regal,
  Kartentisch, Feldbett, Schublade) is charming. But the Tablet objective then just ticked itself after ~6 s
  of standing there (radio line + "[Das Tablet piept]"); I never saw a point cloud. The next objective: "Zurück
  zum Ehrenhof", **502 m** back east (F-25).
- **T+75** (g218-300) Walked 500 m back to the Ehrenhof (Bussole page found on the way: nice). At the
  compass rose, Q: the time-switch effect (point cloud, scanlines, giant Bussole) is the best moment so far,
  and the 1789 Ehrenhof with Corps de logis and wings is stunning. Screenshots:
  `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795194099387-8.jpg`.
  Lauschen (hold E) only worked after walking to the ghost group 5 m away (F-29). Streuner in 1789: Bannlicht
  cone + "Der Schleier reißt" is clear and satisfying; open cobbles make the fight readable; 0 damage.
- **T+85** (g323-344) Back in today it is suddenly sunset. "Lichter am Weiher" was offered on return. Fast travel
  to the Feldstation, 3 Irrlichter over the reeds: they hover over the water, shoot a slow visible spark
  ("funke", 0.8 s windup), Bannlicht drops them to the ground, then one hit each. 0 damage, camera fine at the
  shore. Suspected "invisible Irrlicht hits / camera stuck in reeds": **not reproduced**. Only nits: three
  stacked "UNGREIFBAR" labels overlap, the explanatory radio line came after the fight.
- **T+90** (g344-352) After "Spuren in der Punktwolke" no main quest was tracked (only 3 side quests) until I
  walked back to the Feldstation and the objective "Schlafen: das Feldbett" appeared (F-30). Feldbett ->
  "abgeschlossen: Vermessung" (prologue done) -> Kapitel "Der Hof", quest "Zu Fuß, außer einem".
- **T+95** (g352-414) Fast travel to the Ehrenhof, Q, the Wache am Gitter (Echo card), the wings, the
  Registratur in the Nordflügel. Walked into the wing wall following the crow-line marker before I found
  the "Eingang" waypoint. Interior: the camera sits in the back of the head in every room, the NPC Soll
  hides behind my head while talking (F-31). Quest "Der Kanzlist zählt": Rechenbrett, Kaufbrief, then I read
  "Das graue Buch" thinking it was "das Heft im Regal"; the objective did not tick, the real "beschlagnahmte
  Heft" was a second inspectable 1 m away (F-32).
- **T+105** (g412-434) Talked to Soll again: no option said "the Heft is elsewhere", so I walked around the
  room and found the second inspectable 1 m from the grey book: "Ein beschlagnahmtes Heft" (it shows a
  *Lageskizze* map, odd for a booklet). The objective switched to "Die entflogenen Mahnbriefe im Küchenhof
  zerreißen 0/6". Getting out of the Nordflügel took ~25 s of game time: corridor, "Tür" waypoints, one stair
  side I walked into. The Küchenhof itself is a great arena: flat cobbles, three façades, warm sunset.
  `kq.perf()` there: 68 fps, 14.7 ms avg, p95 16 ms, 428 draw calls, 1.84 M triangles.
- **T+110** (g434-480) **Mahnbriefe fight**, 46 s: 5 Mahnbriefe + a Pfändungsbefehl (ranged Siegelwurf)
  + 2 escort Mahnbriefe "von der Seite" + a Foliant ("Deckung"). Best fight of the session: paper planes are
  easy to read on the cobbles, the captions teach the Foliant perfectly ("Der Deckel hält - Wuchthieb (halten)
  oder von der Seite!", "Der Foliant senkt den Deckel - er rammt!", "Von der Seite!"), two "Im letzten
  Moment!" perfect dodges felt great. Low points: the camera went inside the wing stairs twice (F-35),
  the Pfändungsbefehl sat *inside* the Nordflügel behind a window for a few seconds (F-36), Mahnbriefe
  "reform" on a killing blow (F-34), and three whiffs on the stunned Foliant wasted a Bannlicht (F-37).
  Mid-fight toast: "Grafik automatisch auf Mittel gesenkt" (F-38). 12 damage taken, from a Siegel thrown
  from behind while I ran away exhausted. Counter hit 6/6 with the Pfändungsbefehl; the Foliant is optional
  but keeps attacking, so I finished it (flank hit).
- **T+120** (g480-500) Back to Soll: the "Eingang" waypoint hung on a window 20 m away, not on the door I
  needed, and I got stuck on the stair side again; a "Tipp: ... 18 m Richtung Südwesten" toast popped up
  (good). Turn-in screen (Ziele, Lohn +130 EP, Solls Rechenpfennig, 2 Codex cards) is lovely, then a
  "Was wirklich war" card (14 Mio. Gulden vs. 800 000 a year: strong fact). For a moment the tracker showed
  the old step "Die Mahnbriefe! Hinterher ..." again (F-39). New main objective: "Der Bauplatz am Ostende
  der Galerie: Hanne", 116 m, but the Feldbuch "Laufend" list does not contain it (F-41). **Stopped here**
  (~T+125, ~2 h 05 min of play; I kept the remaining time for the write-up). Kapitel 1 quests done:
  "Zu Fuß, außer einem", "Der Kanzlist zählt" (incl. Mahnbriefe). Not reached: the Schuldbuch boss.

## 2. Findings

| id | sev | cat | where | what happened | expected | suggested fix |
|---|---|---|---|---|---|---|
| F-01 | polish | text | title flow | The order of the start screens differs from the docs: title (Fortsetzen / Neues Spiel) comes first, the lantern gate only after the name. Not a problem, just noting it for the doc. | as documented | update NEXT-SESSION §4 |
| F-02 | minor | text | prologue start | Lantern gate says "Früh am Morgen, vor dem Bauwagen", the chapter card right after says "Prolog · heute, ein Novembernachmittag". The low warm sun reads as afternoon. | one time of day | change the gate line to "Am Nachmittag, vor dem Bauwagen" (or the card) |
| F-03 | major | ugly | today, slope Bauwagen -> Damm, ~784..797 / -910..-889 | The third-person camera keeps parking behind or next to a tree trunk: a black, out-of-focus trunk covers 25-35 % of the screen in most frames, or the camera pushes into the back of the head (hair fills the lower left). The player model also dithers (occlusion fade) for many frames on the slope. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795192313382-0.jpg` | trunks between camera and player fade out or the camera slides sideways; a clear view of the player and the enemies | fade/hide trunks within ~1.5 m of the camera ray (like the player dither), or make the collision probe slide around thin occluders instead of zooming in; thin out trunks near the first fight |
| F-04 | major | unfair/ugly | today, Damm, ~797 / -894 (first fight) | The Nebellinge are small, dark navy and sit below the crest of the slope among ferns. From 6-9 m I only see their orange HP bars; they only become readable at 2-3 m when they glow. | an enemy you can see from 10 m, especially the very first one | brighter emissive / rim light on Nebellinge, a soft mist halo; spawn the first group on flat open ground by the water, not on the far side of a crest |
| F-05 | major | unfair/dull | today, Damm, first fight | One dodge took me ~6 m from the pack; `combatEnd` fired at once, both wounded Nebellinge switched to "return" and regenerated to full HP in ~1.5 s. | a fight does not reset because the player rolled away once; regen only after a long leash or several seconds out of combat | longer leash (>= 15 m) and a 4-5 s grace before reset; no HP regen for quest-tied enemies in the tutorial |
| F-07 | major | unfair/ugly | today, slope below the hohe Stufe, ~1210 / -960 | Twice, right after a dodge on the slope, my character vanished from the frame for 1-2 acts (camera inside the head or left behind; only empty forest on screen). During one of those a Streuner wound up its lunge behind me and hit me for 9. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795192797959-1.jpg` | the player stays in frame during a dodge | when the camera collision pulls closer than ~1.2 m, raise the camera over the shoulder instead of entering the head; never fade the player to 0 in combat |
| F-08 | major | ugly | same fight | A circling Streuner passed through the camera: a giant semi-transparent black wolf covered the whole screen for ~1 s. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795192834493-2.jpg` | enemies never fill the screen | keep enemies out of a ~1.5 m sphere around the camera (push the circling target radius, or fade enemies near the near plane quickly) |
| F-09 | minor | bug/text | prologue radio | Marlene's line "Du schnaufst ja. Was war da unten? ..." played twice (after the first fight and again ~15 s later). Later the line "Sie sind zurück ..." after the Q-return also came twice. Enter does not close or skip the radio box (pilot tap and a real Enter both tried); it advances only on its own timer, so the box covers the bottom centre for minutes. | each line once; Enter skips | dedupe the radio queue; let Enter/Space advance; auto-hide after the line |
| F-10 | major | dull/stuck | today, Damm -> hohe Stufe (813,-892 -> 1180,-962) | The next objective is 430 m away. The straight line runs into the Weiher ("Zu tief zum Waten") and there is no visible "Waldweg" to follow. Then ~45-60 s of uphill sprint with nothing to do. | a trail I can see, and something on the way | a worn path decal/stones along the real route, the waymark following the path rather than the crow line, one small event or collectible halfway (or a Vermessungspunkt to travel) |
| F-11 | minor | clarity | map (M) | The objective on the Altkarte is a tiny unlabeled gold diamond; my own position is a tiny red triangle under the "Feldstation" label. With a 430 m trip I wanted the map to show the way. | objective clearly marked and labeled, player arrow bigger | larger pulsing objective pin with the objective text on hover, a bigger player arrow |
| F-12 | major | unfair | fights with 2+ enemies | Stamina: 3 swings + 2 dodges empties the bar. "Exhausted" then blocks attacks *and* dodges until ~30 stamina, with a ~1 s regen delay. Twice I had an enemy in "recover" right in front of me and got "Kein Atem." at 22 stamina; Streuner lunges track you, so being exhausted means taking the hit. | being low on stamina hurts, but a dodge stays possible | let a dodge always go through above ~10 stamina, shorten the regen delay after a dodge, or lower the exhausted threshold to ~15; show the threshold notch on the bar |
| F-13 | minor | clarity | poi.p-hang (~1214,-962) | After killing the Streuner the toast "Die Truhe springt auf." appeared but no chest was visible or marked. | a marker or a camera hint to the chest | a short-lived marker on the chest or a glint/beam |
| F-14 | major | ugly | today, below the hohe Stufe, ~1180 / -960 | Flat dark-green slabs float in the air above the forest floor. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795193132226-3.png` | props sit on the ground | check the prop placement height sampling (probably placed on a coarser height than the rendered terrain) |
| F-15 | major | ugly | today, Lichtung on the way to the Ehrenhof | A huge black cone (tree/rock LOD?) sits right in front of the camera; the player is not visible at all. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795193190836-4.jpg` | camera never ends up inside/behind a big prop | same camera-occluder fix as F-03; check that prop for missing collision/LOD |
| F-16 | minor | bug | any "Aufgabe erfüllt" card | Clicking the card to dismiss it also swung the staff in the world. | a UI click is consumed by the UI | stopPropagation on card clicks / ignore attack input for one frame after a UI click |
| F-17 | polish | text | first fights | After the last KO the telegraph caption ("... duckt sich - Ausfall!") stayed on screen for a moment. | captions clear on KO | clear the enemy's caption when it dies |
| F-18 | polish | text | objectives vs enemy names | Objectives say "Nebelinge", the enemy nameplate/caption says "Nebelling" (double l). | one spelling | pick "Nebelling/Nebellinge" everywhere |
| F-19 | polish | clarity | compass vs tracker | Compass, quest tracker and world marker sometimes show different distances for the same target (e.g. 340 m vs 338 m, 7 m vs 6 m), and the compass shows two diamonds with 540 m / 600 m with no label. | one number; label which diamond is which | round consistently; tooltip or colour per diamond |
| F-20 | polish | ugly | Codex card "Laubs Karte" | The card reuses the same image as another card. | own image | give it its own illustration |
| F-21 | major | unfair/ugly | today, Grube east of the Schloss, ~1505..1524 / -1294..-1311 (Die Bussole spricht) | Same camera problem as F-03 but in a 6-enemy fight: after most dodges a trunk covers 30-45 % of the screen and the enemies behind it show only their HP bars; once the lunging Nebelling itself was behind the trunk. Foreground ferns also hide the player, and an enemy at the left edge sat under the Lebenskraft HUD panel. Screenshots: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795193539401-5.jpg`, `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795193564189-6.jpg` | a readable fight | fade trunks/ferns between camera and player (and between player and locked target) in combat; clear the trunks inside fight arenas |
| F-22 | minor | clarity/unfair | Grube fight | Quest Nebellinge do not die from a normal killing blow: at 4 HP a 12-damage hit gave a "reform" and the Nebelling was back at 12/30 (twice). Only the 3rd hit of a combo (finisher) or an exact kill seems to dissolve them. The escort Nebellinge died normally from a plain hit. Nothing on screen explains this. | a hit that empties the bar kills, or the rule is shown | show it ("Nebel formt sich neu - der dritte Hieb löst ihn auf") the first time, and give reform a clear VFX; apply it to all Nebellinge or none |
| F-23 | minor | unfair | combat input | Inputs were swallowed with no feedback: three times a click ~0.2-0.3 s after the 2nd combo swing produced nothing (no swing, no stamina cost), and once a dodge pressed ~0.17 s after a light swing did nothing while a lunge was 0.33 s out (the second press worked, "perfect"). | a press during recovery is buffered and fires when allowed | 0.2-0.3 s input buffer for attack and dodge; allow dodge-cancel out of light-attack recovery |
| F-24 | minor | clarity | lock-on | With a hard lock (Tab) on a retreating enemy, turning to a closer one and attacking still pulled the swing toward the locked one (yaw jumped 30°) and whiffed. | the lock follows the threat, or the swing goes where I face | drop the hard lock when the target leaves ~6 m; or let a strong mouse turn switch the target |
| F-25 | major | dull/stuck | today, Grube (1523,-1311) -> Feldstation (762,-913) -> Ehrenhof (Spuren in der Punktwolke) | After the Grube the marker pointed 860 m back to the Feldstation for "Die Punktwolke auf dem Tablet ansehen". There was nothing to use there: the objective ticked itself after ~6 s of standing (radio line, subtitle "[Das Tablet piept: eine neue Datei]"); no point-cloud image was shown. Then "Zurück zum Ehrenhof", 502 m back east. ~1.3 km of backtracking (or a fast travel + 500 m walk) for one radio line. | look at the tablet where I am (it is a tablet) and see the footprints | trigger the tablet in place after the Grube (radio + a full-screen point-cloud view with the tracks), keep the player near the Ehrenhof |
| F-26 | polish | clarity | Feldstation > Kartentisch | "Weiter: Die Punktwolke" looks like an action button but only closes the modal. | the button does what it says, or is labelled "Zurück zum Spiel" | rename, or start the next step from it |
| F-27 | minor | ugly | Feldstation hub, fast travel | The radio box draws on top of the Feldstation modal (over "Hinaus" and the status line); on first open the modal was semi-transparent with the Bauwagen showing through. During fast travel the travel title, the late "Aufgabe erfüllt: Die Bussole spricht" card and an empty radio box were all on screen at once. | one layer at a time | hide the radio box while a modal is open; queue the quest card until after travel |
| F-28 | minor | text | radio queue | Radio lines lag far behind events: Laub's "Nebel mit Augen ... kriecht aus Senken" (about the first fight) appeared after the fast travel, minutes later, and stayed on screen for ~15 s of game time. Marlene's "Morgen, Jona!" (a today line) arrived while I was in 1789. | lines play near their trigger, stale ones are dropped | drop queued lines older than ~20-30 s, or tie them to the context |
| F-29 | minor | clarity | 1789 Ehrenhof, "Zuhören: der Hof von 1789" | Prompt "E halten - Lauschen" shows right after the time switch, but holding E there for 10 s only gives "[Summen]". It only worked after walking 5 m to the ghost group (the marker was off-screen behind me). | listening works where the prompt appears, or the prompt only appears in range | show the prompt only inside the listen radius; turn the camera toward the ghosts after the switch |
| F-30 | major | stuck/clarity | today, after "Spuren in der Punktwolke" | Back in today the tracker showed no main quest at all, only Kohlplatten, Nicht anfassen and the new Lichter am Weiher (all "Nebenaufgabe"). The journal had nothing under Hauptaufgabe. Only after fast travelling to the Feldstation did "Zurück zur Feldstation (F: Geisterblick)" / "Schlafen: das Feldbett" appear. | the next main step is always tracked | add "Zurück zur Feldstation: schlafen" as the next main objective right after the Q-return |
| F-31 | major | ugly | 1789 Nordflügel interiors (Registratur) | Indoors the camera sits in the back of the player's head in almost every frame: dithered hair fills the lower third, the staff crosses the screen, and during the talk with Soll the NPC is hidden behind my head and faces away. Screenshots: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795194586404-9.jpg`, `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795194606161-11.jpg`, `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795194606162-12.jpg` | a shoulder camera indoors; a framed two-shot in dialogue | indoor camera profile (shorter arm, shoulder offset, higher FOV); dialogue camera that frames the NPC; NPC turns to face the player |
| F-32 | minor | clarity | Registratur, "Das beschlagnahmte Heft lesen" | Soll says "das Heft im Regal". Next to it is "Das graue Buch" (same prompt "E Untersuchen", same card style, mentions the Bussole headline). Reading it does not tick the objective; the real "beschlagnahmte Heft" is a second object ~1 m away. I stood there for ~10 s of game time and talked to Soll again before finding it. | the objective object is the obvious one | mark the quest object (glint), or let the grey book count, or move it away from the Heft |
| F-33 | polish | ugly | NPC talk | NPCs do not turn toward the player when spoken to (Soll talked with his back to me). | NPC faces the player | turn the NPC head/body on talk |
| F-34 | minor | clarity/unfair | Küchenhof, Mahnbriefe | Same "reform" rule as F-22, now on Mahnbriefe, and it looks random: a Mahnbrief at 1/14 took a 14-damage hit and came back at 6/14; one at 5/14 took a 7-damage cleave hit and came back at 6/14; but one at 6/14 died to a plain 13-damage hit, and a 14/14 one died to an exact 14. The bar empties, the paper flutters, and it is back. Nothing explains it. | the bar emptying means death, or the rule is taught once on screen | as F-22: teach it with a caption the first time ("Papier faltet sich neu - der dritte Hieb zerreißt es"), or drop reform for overkill hits |
| F-35 | major | ugly/unfair | Küchenhof, by the Nordflügel stairs (~1210..1216 / -1159..-1163) | Twice in the Mahnbriefe fight the camera went into the stone stairs/wall of the wing: 40-50 % of the screen was flat dark polygons, the player invisible, enemies only at the edge. Once it happened right as I perfect-dodged a lunge, so I had no idea where I was. Screenshots: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795195083224-14.jpg`, `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795195123639-15.jpg` | camera stays outside architecture | camera collision against building/stair meshes (the forest fix F-03 should cover buildings too); keep fight spawns a few metres away from façades and stairs |
| F-36 | minor | bug | Küchenhof | The Pfändungsbefehl (in "retreat") flew into the Nordflügel and hovered *inside* the building behind a window, with its nameplate showing through the glass, for a few seconds, then came back out through the wall. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795195220641-16.png` | flying enemies stay in the arena | clamp flyer positions to the arena / navmesh bounds, or collide them with building volumes |
| F-37 | minor | unfair | Küchenhof, Foliant | I banned the Foliant (stun 2 s) and swung three times: all three "whiff" at 3.4 m, though on screen the staff overlapped its body. Every swing roots you, so the buffered swings also stopped me closing in. The whole stun was wasted. Screenshot: `/var/folders/5j/3ywfksdj6_d7010lb5cdbtfw0000gn/T/claude-chrome-screenshots-FHbzAL/screenshot-1795195476047-17.jpg` | if the staff touches the big box, it hits | reach measured to the enemy's hull, not its centre (the Foliant is ~1 m wide); a short step-in on the light attack toward the locked target (see F-06) |
| F-38 | minor | perf | Küchenhof fight | Toast "Grafik automatisch auf „Mittel“ gesenkt" mid-fight, while `kq.perf()` showed 68-96 fps (p95 11-16 ms) right before and after. Probably the auto-quality saw the long wall-clock gaps of bullet time, but a real player whose tab stalls once would get the same downgrade. | only a sustained low frame rate lowers quality | ignore paused/bullet-time frames and single long gaps; use a rolling p95 over several seconds |
| F-39 | minor | bug | Soll turn-in | Right after "Übergeben" the tracker showed the old step "Die Mahnbriefe! Hinterher, in den Küchenhof hinter dem Nordflügel" with a 32 m marker for ~1 s, then switched to "Der Bauplatz am Ostende der Galerie". The tracker title was then cut to "Der Baupla". | the next objective at once, no stale step; titles wrap | don't re-show completed steps on turn-in; wrap or ellipsize the tracker title |
| F-40 | minor | clarity | Nordflügel in/out | Crow-line markers through walls: following the marker I walked into the wing wall twice; the "Eingang" waypoint hung on a window 20-25 m away instead of the door 3 m away; and walking toward a door I got stuck on the side of its stone stairs (no slide). The stuck "Tipp" toast helped. | the waypoint sits on the door I should use; stairs let me slide off | snap "Eingang/Tür" waypoints to the nearest usable door; a small slide/step-up on stair sides |
| F-41 | minor | clarity | Feldbuch > Aufgaben | After "Der Kanzlist zählt" the tracker showed the new main objective "Der Bauplatz ...: Hanne", but the Feldbuch "Laufend" list only had the two side quests. Same gap as F-30. | the tracked main quest is in the journal | list the current main quest under Laufend as soon as it is tracked |
| F-42 | polish | ugly/text | various UI | (a) The early tip toast "Im Feldbuch (J) ..." came back late and stayed. (b) Three stacked "UNGREIFBAR" labels over the Irrlichter overlap into one smear. (c) The chapter title "Der Hof" overlapped the new-quest banner. (d) Indoor item cards (the Heft, books) show a *Lageskizze* terrain map as their picture. | one clean layer; fitting pictures | stagger/merge enemy labels; queue the chapter title before the quest banner; a document illustration for indoor items |
| F-43 | minor | unfair | HUD, all fights | The left HUD stack (Lebenskraft, Atem, Bannlicht, skills, EP, Balsam) is a large opaque block over ~15-45 % of the screen height. Twice the Foliant stood exactly behind it (and once a Nebelling in the Grube, F-21). | enemies at the left edge stay visible | make the panel smaller/translucent in combat, or move it lower |
| F-06 | minor | unfair | first fight | Nebellinge circle at 3.0-3.4 m; my light attacks whiff at 3.2-3.3 m even with the lock-on soft target. 3 of 6 swings whiffed. | swings connect when the enemy looks adjacent | small lunge-step on the light attack toward the soft target (1 m), or keep circling radius < reach |

## 3. Fight notes

All numbers from `kq.combat.report()` at the end of the session (reaction threshold 0.25 s). Game time `t`
is the fight start in seconds. Every hit had the full feedback set (hit-stop ~80 ms, flash, knockback,
sound, particles, shake, numbers): `feedback.hits == hitStop == ... == numbers` in all 7 fights.

| # | where | t | length | enemies | damage taken | unfair (report) | windups (mean) | dodges ok/tried (perfect) | dealt |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Damm, first fight | 29.3 | 9.7 s | 3 Nebelling | 0 | 0 | lunge 0.75 s ×4 | 2/2 (0) | 98 |
| 2 | Mauerrest | 46.7 | 3.0 s | 1 Nebelling | 0 | 0 | lunge 0.75 s ×1 | 0/0 | 25 |
| 3 | slope below the hohe Stufe | 98.3 | 14.9 s | 2 Streuner | 27 (3 hits, hp 112->85) | **1 offscreen** | sprung 0.6 s ×6, 1 started offscreen | 3/4 (0) | 75 |
| 4 | Grube (Die Bussole spricht) | 193.8 | 23.7 s | 5 Nebelling (+escort) | 0 | 0 | lunge 0.75 s ×8 | 6/7 (1), 1 "noThreat" | 204 |
| 5 | 1789 Ehrenhof | 314.6 | 4.2 s | 1 Streuner | 0 | 0 | biss 0.5 s ×1 | 1/1 | 42 |
| 6 | Weiher, Lichter am Weiher | 335.4 | 7.0 s | 3 Irrlicht | 0 | 0 | funke 0.8 s ×3 | 2/2 | 55 |
| 7 | Küchenhof, Mahnbriefe | 433.8 | 46.1 s | 7 Mahnbrief, 1 Pfändungsbefehl, 1 Foliant | 11.7 (1 hit, hp 151->139) | 0 | schnitt 0.55 s ×6, siegelwurf 0.8 s ×3 (1 offscreen start), rammen 0.95 s ×4 (1 offscreen start), zuklappen 0.85 s ×3 | 13/13 (3) | 325 |

Notes per fight:

- **1-2 Nebellinge (prologue).** Fair (0.75 s lunge, caption on the first one), but readability is poor
  in the forest (F-04) and the fight reset on one dodge (F-05). Whiffs at 3.2-3.4 m (F-06).
- **3 Streuner on the slope.** The one hit the report flags as unfair ("offscreen") is exactly the one I
  could not see: the camera had lost the player after a dodge (F-07), and a Streuner ran through the camera
  (F-08). The report's `seen 0.41 s` for `streuner.sprung` matches my feeling: barely visible. Exhaustion
  (F-12) cost me the other two hits.
- **4 Grube.** 0 damage, but the trunks hid enemies after most dodges (F-21) and the reform rule (F-22)
  dragged it out. 1 "noThreat" dodge = me dodging a lunge I could not see behind a trunk.
- **5 Streuner in 1789 / 6 Irrlichter.** Both clean and readable. Irrlichter suspect (invisible hits,
  reed camera) **not reproduced**: the funke projectile is visible, 0.8 s windup, the Bannlicht drop teaches
  itself.
- **7 Mahnbriefe.** The richest fight and the best taught: every new threat got a caption
  ("Der Pfändungsbefehl schleudert sein Siegel", "Da kommen mehr - von der Seite!", the Foliant lines).
  13/13 dodges, 3 perfect. The single hit (Siegelwurf, 11.7) came from behind the camera while I ran
  away exhausted; the report counts it fair (`seen 0.4 s`), and I agree it was my fault, though I only knew a
  throw was coming from the JSON. Problems were camera-in-stairs (F-35), the flyer inside the building
  (F-36), reform (F-34) and reach on the big Foliant (F-37). The Foliant needs 4-5 good windows (70 HP,
  bounce from the front, hits land during its windups or from the flank); fine for an optional escort.

Not reached: Schuldbuch boss, any boss ("stiff bosses" suspect untested).

## 4. Scores

**Looks: 7/10.** The 1789 Schloss is the star: the time switch (point cloud, scanlines, the huge Bussole)
and the reveal of the Ehrenhof and the Küchenhof at sunset are genuinely beautiful, and the Altkarte,
Lageskizzen, cards and the Feldstation hub have a coherent, handsome paper-and-ink style. The prologue forest
is pretty in stills. What pulls it down is the camera: trunks filling a third of the frame (F-03, F-21),
the camera inside the head indoors (F-31), inside stairs (F-35), a black cone (F-15), floating slabs (F-14),
a wolf across the whole screen (F-08). A player sees these every few minutes. Fix the camera and this is an 8.

**Fun: 6/10.** The combat kit is good: fair windups (0.5-0.95 s), strong hit feedback, Bannlicht and the
Foliant's "from the side or heavy" rule add real choices, and the Mahnbriefe fight in the open courtyard
was fun from start to end. The 1789 scenes and Soll's dry lines are a pleasure. It loses points on pacing
and friction: 430 m and 860 m + 500 m walks with nothing on the way (F-10, F-25), swallowed inputs and
whiffs (F-23, F-06, F-37), harsh exhaustion (F-12), resets and reforms that feel like punishment (F-05,
F-22, F-34), and forest fights I fought against the camera rather than the enemies.

**Clarity: 5/10.** Moment-to-moment combat is very clear (captions are excellent). Navigation and quest
state are not: the main quest disappeared from tracker and journal twice (F-30, F-41), markers point
through walls and to the wrong door (F-40), the Heft/grey-book mix-up (F-32), listening only works in an
unmarked radius (F-29), the reform rule is never explained (F-22, F-34), the radio lags minutes behind
events (F-28). I never got truly stuck, but three times I only got on by trying things.

## 5. Tooling notes (bullet-time pilot)

- The radio (`.kqs-dlg` box) is not in the observation; I read it from the DOM. Its lag (F-28) makes it
  hard to match lines to events.
- The bullet-time strip sits at the bottom centre and covers the radio box/prompt area in screenshots.
- `turnDeg` is spread over the whole act: with `left:'click'` in the same act the swing goes out before the
  turn is done. Turn in a short act first, then click.
- Enter does not skip the radio, in pilot or by a real key.
- `hud.prompt` in the observation is stale (e.g. "E Feldstation" 120 m away, "Lampenöl: voll" for minutes).
- Time switch, fast travel and some cards run on wall-clock time while bullet time is paused: I had to wait
  2-3 real seconds.
- A pause menu popped up once mid-fight without input (focus/pointer lock?); `choose(1)` ("Weiter") fixed it.
- `choose(a); choose(b)` in one call fires the second before the next modal renders.
- Dropped clicks (combo window) are hard to tell apart from tooling problems; an event like
  `{type:'inputDropped', reason}` would help.
- `mouse:{left:'hold'}` during a running combo came out as a light swing, so I could not test the heavy attack
  cleanly.
- Bullet time probably triggered the auto-quality drop (F-38).
- Enemy objects use `d`, not `dist` (my own helper bug, cost a few steps).
