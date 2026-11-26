# Tour slice v0 (playable test of the guided-tour opening)

**The tour is the start of the game** (owner, 2026-11-22: „Everything new should be standard“): the
chapter `tour` (`content/story/00-tour.story.json`, order −1, `next: k1`) opens every new game; no URL
switch. Its end hands over into chapter 1 with the state the old prologue left (relief 3, Kartograf 1,
the Bussole, the „Seite im Deckel der Bussole“, the main path's balms / oil, its XP → level 3; diffed in
`tests/tour-handover.test.ts`). The tour also offers the deer photo. In v0.7–v0.8,
`?classic` selected the old surveyor prologue and saves could resume there. Old bookmarks now
open the tour. Saves in „Vermessung“ continue in „Der Hof“ at the Karlsbergquelle with the tour
handover and their earned progress (TASK-007). The beats are described in the tour bible
([Prolog „Die Führung“](../../../content/bible/01-prolog.md)). Gerold Imhoff is a placeholder name.

**Start:** `pnpm dev` → „Neues Spiel“. Tests: `?notitle`, then `kq.story.start('Name')`; e2e fast
path to chapter 1: `throughTour(page)` (`e2e/helpers/tour.ts`).

## What is in

| Beat | What happens |
| --- | --- |
| t1 Treffpunkt | Car park 524/−770 (checkpoint 529/−777). Gerold + 14 members (`double.*`, `child.compass`, `extra.1…6`) gathered, Diane and Bijou at Jost's heels. Lines `imhoff.t.01`, Herr Soll counts, Mats' compass. Prompt WASD. |
| t2 Station 1 | Camera prompt; E talks to Gerold (his people body is bound to the `imhoff` placement): `imhoff.t.station1/1b` (the Baumagazin as „ein einziges Gebäude“, Privatbesitz; 1778/1793). Timer fallback 60 s. |
| t3 | The group walks to `abzweig` (1.9 m/s, leash 25 m, barks `imhoff.bark.wait.01–03`). The first three chestnuts lie by the path; t5, t7, t9, t12 and t14 place the rest of the 24 (see „Chestnuts along the way“). |
| t4 fade 1 | „Kommt, wir kürzen ab.“ → fade → `warp` to `einstieg` → player teleported behind the group → fade in. |
| t5–t6 Felsenpfad | Station 2: Buntsandstein, no climbing; quarrying by the duke: **offen** („Ehrlich: Das weiß man nicht.“), Hohenburg as quarry (cx.31). `player.t.fuehrer`. |
| t7–t8 Wind | At `wind`: gust (synth wind, caption), both dogs bolt barking uphill and come back (`animal:run` with `back`), a 6 s skippable cinematic on the dogs, `player.t.wind`, Jost, `player.t.hunde`, Gerold „Wildschweine, wahrscheinlich. Oder Rehe.“ |
| t9–t10 Reh | The `reh` stop is at 727.4/−751.5. Ricke and Kitz graze 36 m down the slope at 698/−773 (FIKTION). t10 opens with the skippable `reh` shot (`content/cinematics/reh.json`, camera 2.5 m ahead of the stop, fov 40 → 18 on Kitz, then Ricke, 6 s). The sneak prompt uses the current crouch binding or touch button label. The prompt and objective appear after the cinematic, including after a skip or reduced-motion stills, and immediately on Continue. Photo prompt [N]. A good photo gets praise, and Gerold says „Sie hat dich angesehen. Gutes Bild.“ when the doe is alert in the shot. Flight within 16 m triggers „Und weg.“ / „Zu schnell.“ and the tour continues after 45 s. The beat advances after 180 s anyway. |
| t11 fade 2 | „Weiter zum Weiher.“ → fade → `warp` to `damm`, deer despawned, player behind the group. |
| t12–t13 | Marlene calls out at the dam and lends the Messstab at the Weiher in t13. The pickup feed confirms the loan and the staff is visible once equipped. Station 3: date and purpose **offen**. |
| t14–t15 Quelle | Station 4: Quelle, Bach, Wassertretbecken „in der Nähe“; supply / Fassung **offen**. „Ruh dich kurz aus, wir sind oben am Plateau.“ The group walks off on `p-aufstieg`. |
| t16–t17 | Alone: `player.q.fund`, step into the trough → `item.bussole`, `story.compass`, `story.laub`; `laub.t.intro`, `player.q.laub`, `laub.t.intro.b`, `laub.t.quelle`, `laub.t.trog`; `quelle.call` → the Quelle's own E „Wasser berühren“ → shift to 1789 (reason `quelle`). |
| t18 Sommer 1789 | `player.q.wo`, `laub.t.1789`, `laub.t.seite`; fade out. Exit: the hand-over grants (relief 3, Kartograf 1, „Seite im Deckel der Bussole“, 4 balms, 1 oil, 549 XP), k1 unlocked; the chapter's `leave` lifts `combat.disabled` / `laub.silent` / `tour.slice` and despawns the group and animals; chapter 1 (k1_0, at the Quelle in the present) follows. |

Story schema additions (kq-story): look `tour`; `StoryFile.dev`; actions `{do:'npc', op: walk|group|follow|gather|hold|release|warp}` and `{do:'npc', op:'despawn', group}` → `npc:walk` (C2), `{do:'cinematic', …}` → `cinematic:play` (C1), `{do:'animal', …}` → `animal:request` (C5), `{do:'fade', to, seconds}`; sounds `wind`, `bark`; validator cases incl. route / stop checks against `content/routes/*.json`. Tests: `tests/tour-slice.test.ts` (headless beat-by-beat run), `e2e/tour-slice.spec.ts`.

## Deer photo and sneak tuning (TASK-017)

- The phone hides gameplay overlays and world markers on desktop and touch, including the
  measuring tape, reticle, sheet and quest giver glyphs. Touch shows the camera toggle, shutter
  and zoom controls. Measuring taps pause and survey banners wait until the phone closes.
- With 2× zoom, a steady shot of both animals in the middle third works from about 20–25 m. The
  doe's sphere must cover at least 5.5% of frame height and the fawn's at least 4.4%. Each needs
  three clear samples out of five (top, left, right, centre, bottom). Range is 27 m per target,
  or 32 m for a two-star fallback after 90 s nearby. The fallback lowers the minimum frame
  height to 4.5% for the doe and 3.6% for the fawn so both can pass at 95° FOV and 2× zoom.
- In line of sight, deer notice an upright player within 30 m. Crouching or going prone at up to
  1.7 m/s reduces that to 15 m. Inside 20 m, standing still adds 0.75 meter units/s and walking
  upright adds 1.5/s. Running above 3.7 m/s adds 1.5/s, and sprinting above 5.2 m/s adds 2.5/s
  within the notice radius. Moving at crouch speed at 13 m adds about 0.14/s. Holding still while
  crouched in range drains 0.5/s. The head-up tell starts at 0.5 and lasts at least 1.5 s before a
  full meter can trigger a 25 m flight.
- The phone stays down through Gerold's stalking instructions and the good-photo reaction. The
  first good shot's doe state determines one reply and is saved immediately. Continue replays an
  unfinished reaction and the tour waits for it to finish. The phone prompt comes up within 26 m
  horizontally of the spawn or after 20 s while awaiting a good shot. On Continue, the objective
  points to the doe's restored position, including in saves with the old clearing.

## Chestnuts along the way (TASK-002)

Owner feedback: just following the group is boring. 24 chestnuts (`item.kastanie`, „Kastanie“) now
lie along the walked sections:

| Section | Beat | Chestnuts |
| --- | --- | --- |
| parkplatz → abzweig | t3 | 3 |
| einstieg → felsen | t5 | 6 |
| felsen → wind | t7 | 3 |
| wind → reh | t9 | 6 |
| damm → weiher | t12 | 2 |
| weiher → quelle | t14 | 4 |

Placement:
- Each beat places its section's chestnuts with story `loot` (group `tour.kastanien`, era `today`).
- They lie in clusters of two or three, mostly 1.5–4 m off the path; six are 6–10 m off.
- None are within 8 m of a stop, none within 40 m of the doe, none on the last ~90 m before the deer, and none within 6 m of a Fläschchen.
- Spots were checked against the heightfield, water and solids; the steepest is a slope of 0.44, on the Felsenpfad climb.

Picking up:
- E (or the touch interact button) picks one up within 2.7 m, „Kastanie aufheben“; walking over one (1.3 m) picks it up too.
- The feed counts them („+ Kastanie ×1 (7)“), and the count is part of the inventory and the save.
- The saved count is visible under Ausrüstung → Fundstücke. When a present-day tour save predates
  TASK-002, Continue places any missing chestnuts from the walking beats already completed.

Lines (fictional dialogue on `item:pickup`, with the voice fallback):
- 1st, Gerold mentions the Herzogskastanien and their reported age. [Codex cx.39](../../../content/bible/07-codex.md#cx39--der-karlsberg-heute) records the sources and the uncertainty about which trees survived the 1990 storm.
- 12th, Herr Soll: „Zwölf Kastanien. Ich zähl ja sowieso.“
- 24th, Gerold: „Alle vierundzwanzig? Die Eichhörnchen werden sich beschweren.“

Limits:
- No XP and no reward item, so the handover and the prologue's level margin are unchanged.
- The tour's `leave` clears chestnuts left lying.
- There is no row in Pause → Sammlungen yet (a possible follow-up).

Tests: `tests/tour-kastanien.test.ts`, `e2e/kastanien.spec.ts`.

## Finding the group (round 2)

Owner playtest: „lost the group and couldn't find it again“. The walk system now helps (src/systems/walk/find.ts, thresholds in `FIND`): Gerold shows on the compass („Gruppe · 45 m“) beyond 24 m or when out of view; once per stray episode he calls „Hier drüben!“ (`imhoff.bark.hier.01/02`, this pack); after a minute apart or beyond 80 m the prompt „Gedrückt halten: zur Gruppe“ (Q, touch: the Epoche button) fades the player onto the path just behind the group. The leash (wait r 25 m) is unchanged; the e2e strays on the way to the Quelle and checks wait, marker, call-out and the hold. The call-out goes through the barks system, so its 45 s gap and quiet rules can swallow it (the marker and the prompt do not depend on it).

## What is faked (placeholders)

- Bodies: the people stand-ins (guide and members) and the fauna stand-ins (deer, dogs) from the WIP `tour/animals-system` / `chars/fauna-api` branches.
- The barks have no `{Name}`.
- The Bussole pickup: stepping right up to the trough picks it up (no E interaction, no glint effect).
- The wind: a synthesised gust plus a caption; leaves and crowns do not react.
- Dog barks: a short synth placeholder.
- Marlene calls out from off screen at the dam and appears at the Weiher for the loan. The new loan line uses the dialogue fallback.
- „Schau zum Berg“ (camera tutorial) is a prompt only; no look-direction check.

## Known issues

- The group despawns in t17 at most ~20–40 m up the slope; it may vanish in view.
- A good photo needs doe and fawn in the frame (`needAll` of the placeholder targets).
- The chapter title card „Die Führung“ stays up through the first ~100 s (cards wait while someone talks, and Gerold talks a lot).
- At the Quelle the base game's own layer shows through: the „E Pause an der Quelle“ prompt and Marlene's radio lines play during station 4, the break and the Laub scene.
- The 15 walkers look dithered/see-through at ~10 m at the car park (people LOD fade).
- Barks never fired in the e2e (it keeps up with the group); untested in a run.

## Timings

Estimate from the route lengths at 1.9 m/s plus the line times (a player who keeps up): deer stop ≈ 5:50, deer photo ≈ 7–8 min, the touch ≈ 12 min.

Measured (e2e 2026-11-21, game time, a scripted player who keeps up, snaps the photo at once and walks straight to the trough): deer stop 4:39, deer photo 4:41, the touch 8:17, 1789 at 8:20. A real player who sneaks and frames the shot adds 1–3 min at the deer and some at the break, so the slice runs short of the 8 / 12 min targets: lengthen the walks (or the station lines) before the next round. The e2e writes these to `test-results/tour/timings.json`.
