# Tour slice v0 (playable test of the guided-tour opening)

**The tour is the start of the game** (owner, 2026-11-22: „Everything new should be standard“): the
chapter `tour` (`content/story/00-tour.story.json`, order −1, `next: k1`) opens every new game; no URL
switch. Its end hands over into chapter 1 with the state the old prologue left (relief 3, Kartograf 1,
the Bussole, the „Seite im Deckel der Bussole“, the main path's balms / oil, its XP → level 3; diffed in
`tests/tour-handover.test.ts`). The tour also offers the deer photo. In v0.7–v0.8,
`?classic` selected the old surveyor prologue and saves could resume there. Old bookmarks now
open the tour. Saves in „Vermessung“ continue in „Der Hof“ at the Karlsbergquelle with the tour
handover and their earned progress (TASK-007). The beats are described in the tour bible
(`bible/01-prolog.md`). Gerold Imhoff is a placeholder name.

**Start:** `pnpm dev` → „Neues Spiel“. Tests: `?notitle`, then `kq.story.start('Name')`; e2e fast
path to chapter 1: `throughTour(page)` (`e2e/helpers/tour.ts`).

## What is in

| Beat | What happens |
| --- | --- |
| t1 Treffpunkt | Car park 524/−770 (checkpoint 529/−777). Gerold + 14 members (`double.*`, `child.compass`, `extra.1…6`) gathered, Diane and Bijou at Jost's heels. Lines `imhoff.t.01`, Herr Soll counts, Mats' compass. Prompt WASD. |
| t2 Station 1 | Camera prompt; E talks to Gerold (his people body is bound to the `imhoff` placement): `imhoff.t.station1/1b` (the Baumagazin as „ein einziges Gebäude“, Privatbesitz; 1778/1793). Timer fallback 60 s. |
| t3 | The group walks to `abzweig` (1.9 m/s, leash 25 m, barks `imhoff.bark.wait.01–03`). |
| t4 fade 1 | „Kommt, wir kürzen ab.“ → fade → `warp` to `einstieg` → player teleported behind the group → fade in. |
| t5–t6 Felsenpfad | Station 2: Buntsandstein, no climbing; quarrying by the duke: **offen** („Ehrlich: Das weiß man nicht.“), Hohenburg as quarry (cx.31). `player.t.fuehrer`. |
| t7–t8 Wind | At `wind`: gust (synth wind, caption), both dogs bolt barking uphill and come back (`animal:run` with `back`), a 6 s skippable cinematic on the dogs, `player.t.wind`, Jost, `player.t.hunde`, Gerold „Wildschweine, wahrscheinlich. Oder Rehe.“ |
| t9–t10 Reh | New route stop `reh` (727.4/−751.5). Ricke + Kitz at 704/−779, 36 m down the slope in forest (terrain line of sight from the stop checked). Sneak prompt [C], photo prompt [N]. Good photo → praise; good photo after `animal:alert` → „Sie hat dich angesehen. Gutes Bild.“; flight within 16 m → „Und weg.“ / „Zu schnell.“, the tour goes on 45 s later; hard fallback 180 s. Never a fail state. |
| t11 fade 2 | „Weiter zum Weiher.“ → fade → `warp` to `damm`, deer despawned, player behind the group. |
| t12–t13 | Marlene speaks one line at the dam. Station 3 at the Weiher: date and purpose **offen**. |
| t14–t15 Quelle | Station 4: Quelle, Bach, Wassertretbecken „in der Nähe“; supply / Fassung **offen**. „Ruh dich kurz aus, wir sind oben am Plateau.“ The group walks off on `p-aufstieg`. |
| t16–t17 | Alone: `player.q.fund`, step into the trough → `item.bussole`, `story.compass`, `story.laub`; `laub.t.intro`, `player.q.laub`, `laub.t.intro.b`, `laub.t.quelle`, `laub.t.trog`; `quelle.call` → the Quelle's own E „Wasser berühren“ → shift to 1789 (reason `quelle`). |
| t18 Sommer 1789 | `player.q.wo`, `laub.t.1789`, `laub.t.seite`; fade out. Exit: the hand-over grants (relief 3, Kartograf 1, Messstab, „Seite im Deckel der Bussole“, 4 balms, 1 oil, 549 XP), k1 unlocked; the chapter's `leave` lifts `combat.disabled` / `laub.silent` / `tour.slice` and despawns the group and animals; chapter 1 (k1_0, at the Quelle in the present) follows. |

Story schema additions (kq-story): look `tour`; `StoryFile.dev`; actions `{do:'npc', op: walk|group|follow|gather|hold|release|warp}` and `{do:'npc', op:'despawn', group}` → `npc:walk` (C2), `{do:'cinematic', …}` → `cinematic:play` (C1), `{do:'animal', …}` → `animal:request` (C5), `{do:'fade', to, seconds}`; sounds `wind`, `bark`; validator cases incl. route / stop checks against `content/routes/*.json`. Tests: `tests/tour-slice.test.ts` (headless beat-by-beat run), `e2e/tour-slice.spec.ts`.

## Finding the group (round 2)

Owner playtest: „lost the group and couldn't find it again“. The walk system now helps (src/systems/walk/find.ts, thresholds in `FIND`): Gerold shows on the compass („Gruppe · 45 m“) beyond 24 m or when out of view; once per stray episode he calls „Hier drüben!“ (`imhoff.bark.hier.01/02`, this pack); after a minute apart or beyond 80 m the prompt „Gedrückt halten: zur Gruppe“ (Q, touch: the Epoche button) fades the player onto the path just behind the group. The leash (wait r 25 m) is unchanged; the e2e strays on the way to the Quelle and checks wait, marker, call-out and the hold. The call-out goes through the barks system, so its 45 s gap and quiet rules can swallow it (the marker and the prompt do not depend on it).

## What is faked (placeholders)

- Bodies: the people stand-ins (guide and members) and the fauna stand-ins (deer, dogs) from the WIP `tour/animals-system` / `chars/fauna-api` branches.
- The barks have no `{Name}`.
- The Bussole pickup: stepping right up to the trough picks it up (no E interaction, no glint effect).
- The wind: a synthesised gust plus a caption; leaves and crowns do not react.
- Dog barks: a short synth placeholder.
- Marlene speaks off screen with subtitles.
- „Schau zum Berg“ (camera tutorial) is a prompt only; no look-direction check.

## Known issues

- „Sie hat dich angesehen“ fires when the doe sounded the alert at any time before the good photo (no `state` on `photo:good` yet).
- The group despawns in t17 at most ~20–40 m up the slope; it may vanish in view.
- A good photo needs doe and fawn in the frame (`needAll` of the placeholder targets).
- A save made in the tour resumes only with `?tour`.
- The chapter title card „Die Führung“ stays up through the first ~100 s (cards wait while someone talks, and Gerold talks a lot).
- At the Quelle the base game's own layer shows through: the „E Pause an der Quelle“ prompt and Marlene's radio lines play during station 4, the break and the Laub scene.
- The 15 walkers look dithered/see-through at ~10 m at the car park (people LOD fade).
- Barks never fired in the e2e (it keeps up with the group); untested in a run.

## Timings

Estimate from the route lengths at 1.9 m/s plus the line times (a player who keeps up): deer stop ≈ 5:50, deer photo ≈ 7–8 min, the touch ≈ 12 min.

Measured (e2e 2026-11-21, game time, a scripted player who keeps up, snaps the photo at once and walks straight to the trough): deer stop 4:39, deer photo 4:41, the touch 8:17, 1789 at 8:20. A real player who sneaks and frames the shot adds 1–3 min at the deer and some at the break, so the slice runs short of the 8 / 12 min targets: lengthen the walks (or the station lines) before the next round. The e2e writes these to `test-results/tour/timings.json`.
