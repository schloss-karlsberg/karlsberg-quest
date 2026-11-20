# Tour slice v0 (playable test of the guided-tour opening)

A separate dev chapter `tour` (`content/story/00-tour.story.json`, `"dev": "tour"`): loaded only with
the URL switch `?tour`, and then a new game starts in it instead of the prologue. The prologue, the
campaign, the XP bands and the save migration are unchanged. Design: `docs/design/tour/` (MR 4),
bible `01-prolog.md` t1–t10. Gerold Imhoff is a placeholder name.

**Start:** `pnpm dev`, open `http://localhost:5280/?tour` → „Neues Spiel“. Tests: `?notitle&tour`,
then `kq.story.start('Name')`.

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
| t12–t13 | Marlene's one cameo line at the dam (text only, no body). Station 3 at the Weiher: date and purpose **offen**. |
| t14–t15 Quelle | Station 4: Quelle, Bach, Wassertretbecken „in der Nähe“; supply / Fassung **offen**. „Ruh dich kurz aus, wir sind oben am Plateau.“ The group walks off on `p-aufstieg`. |
| t16–t17 | Alone: `player.q.fund`, step into the trough → `item.bussole`, `story.compass`, `story.laub`; `laub.t.intro`, `player.q.laub`, `laub.t.intro.b`, `laub.t.quelle`, `laub.t.trog`; `quelle.call` → the Quelle's own E „Wasser berühren“ → shift to 1789 (reason `quelle`). |
| t18 | Card „Fortsetzung folgt“. Stop. |

Story schema additions (kq-story): look `tour`; `StoryFile.dev`; actions `{do:'npc', op: walk|group|follow|gather|hold|release|warp}` and `{do:'npc', op:'despawn', group}` → `npc:walk` (C2), `{do:'cinematic', …}` → `cinematic:play` (C1), `{do:'animal', …}` → `animal:request` (C5), `{do:'fade', to, seconds}`; sounds `wind`, `bark`; validator cases incl. route / stop checks against `content/routes/*.json`. Tests: `tests/tour-slice.test.ts` (headless beat-by-beat run), `e2e/tour-slice.spec.ts`.

## What is faked (placeholders)

- Bodies: the people stand-ins (guide and members) and the fauna stand-ins (deer, dogs) from the WIP `tour/animals-system` / `chars/fauna-api` branches.
- All lines are text only (no voice). The barks have no `{Name}`.
- The Bussole pickup: stepping right up to the trough picks it up (no E interaction, no glint effect).
- The wind: a synthesised gust plus a caption; leaves and crowns do not react.
- Dog barks: a short synth placeholder.
- Marlene: one subtitle line, no figure.
- „Schau zum Berg“ (camera tutorial) is a prompt only; no look-direction check.

## Known issues

- „Sie hat dich angesehen“ fires when the doe sounded the alert at any time before the good photo (no `state` on `photo:good` yet).
- The group despawns in t17 at most ~20–40 m up the slope; it may vanish in view.
- A good photo needs doe and fawn in the frame (`needAll` of the placeholder targets).
- A save made in the tour resumes only with `?tour`.
- Pacing not yet measured in a real run (see below).

## Timings

Estimate from the route lengths at 1.9 m/s plus the line times (a player who keeps up): deer stop ≈ 5:50, deer photo ≈ 7–8 min, the touch ≈ 12 min. The e2e writes measured game seconds to `test-results/tour/timings.json`.
