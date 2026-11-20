# Storyboard beats: the tour, the training and the parties (draft)

> Draft for the release after 0.5.0. One sentence per beat, with place, era/light and a shot hint, so each beat maps onto one entry in the `SHOTS` array of `scripts/dev/storyboard.mjs` (`{ id, ui?, run: (k, h) => { k.story.goto(...); h.place({ era, x, z, tx, tz, pitch, zoom, fly }); h.look(...); … } }`) and one `<article class="card">` in `docs/storyboard/index.html` (`data-cap="Title — Era · light. Text"`). Coordinates are local x / z; `tx/tz` is the look-at point. **(prüfen)** = check on the terrain first. Gerold Imhoff is a placeholder name.

New looks needed by `h.look()`: `tour` (golden afternoon, low sun), `pause` (lower sun), `dusk` (exists).

## A. The tour (today, mid-November afternoon)

| # | Shot id | Beat (one sentence) | Place (x / z) | Era · light | Shot hint |
|---|---|---|---|---|---|
| 1 | `t0-ticket` | A paper ticket on black: "Öffentliche Führung, Treffpunkt Karlsberger Hof, 14:30". | title screen | — · — | UI shot, `ui: '.kqs-title'`; no world |
| 2 | `t1-treffpunkt` | The group of fifteen gathers at the forest-edge car park while a tall, bald guide raises a folded umbrella. | 522 / −766 | today · tour | `place({x:530,z:-760,tx:520,tz:-772,pitch:-4,zoom:5})`, group spawned in a half circle |
| 3 | `t2-gebaeude` | Across the car park stands the long old building, the only one left of the palace, plain and without any sign. | 519 / −813 | today · tour | over the group's shoulders, `tx:519,tz:-813`; building fills the right third; **no lettering on it** |
| 4 | `t3-handy` | On the farm track the phone buzzes and the first photo frames a golden beech leaf against the sun. | ≈ 560 / −650 | today · tour, backlight | first-person phone UI, `ui: '.kq-photo'`; sun in frame |
| 5 | `t4-felsenpfad` | At the little wooden bridge the guide points at red sandstone rocks while a man sketches them. | 683 / −596 | today · tour | `place({x:672,z:-584,tx:694,tz:-599,pitch:2,zoom:4.5})` |
| 6 | `t5-wind` | The wind tears the gold leaves sideways and two dogs bolt barking up the slope into the trees. | 700 / −640 (prüfen) | today · tour, darker under the crowns | low camera, dogs mid-run, leaves streaking; a hint of lamplight far up the slope, barely there |
| 7 | `t6-reh-sicht` | The guide's raised hand freezes the group: a grey roe doe and her spotless fawn stand between the beeches. | 817 / −704 (prüfen) | today · tour | long lens from the path ≈ 770/−715 to the deer; group silhouettes in the foreground |
| 8 | `t6-reh-pirsch` | Crouched in the rustling leaves, the player creeps closer as the doe lifts her head. | ≈ 805 / −708 | today · tour | over-the-shoulder, crouch stance, the flight ring on the ground |
| 9 | `t6-reh-foto` | Through the phone's viewfinder the fawn looks straight into the lens. | 817 / −704 | today · tour | cinematic close shot in the phone frame, `ui: '.kq-photo'` |
| 10 | `t7-marlene` | On the dam a forester with a tripod hands the player her measuring staff. | 826 / −866 (prüfen) | today · tour | two-shot, `tx:826,tz:-866`; the pond behind |
| 11 | `t7-relief` | On the phone the forest falls away and a straight wall line appears beside the dam. | 813 / −903 | today · tour | `k.setScanMode(2)`, `place({x:798,z:-896,tx:813,tz:-903,pitch:-14,zoom:6,fly:4})` |
| 12 | `t7-weiher` | The guide talks at the north-shore benches; the islet sits in the still water. | 898 / −840 | today · tour | `tx:891,tz:-869`; group on the benches |
| 13 | `t9-quelle-gruppe` | At the spring the guide waves the group on uphill: "Kommst du nach?" | 1061 / −834.5 | today · pause | from the trough stand 1059.3/−833.1, yaw 50, group walking away up the slope |
| 14 | `t10-allein` | Alone on the stone step, the player watches the water while distant voices fade. | 1059 / −833 | today · pause, warmer gold | wide, low; empty trail uphill |
| 15 | `t10-bussole` | A green-tarnished brass compass glints in the log trough and comes up dripping. | 1059.3 / −833.1 | today · pause | close on the trough; `story.compass` true; `ui: '.kqs-bussole'` |
| 16 | `t10-laub` | The needle trembles and a dry voice says: "Nicht fallen lassen." | same | today · pause | `h.say('laub', 'Nicht fallen lassen. Ich bin schon einmal gefallen, das genügt.')`, `ui: '.kqs-dlg, .kqs-bussole'` |
| 17 | `t10-touch` | The hand dips, a ring stops on the water and the brook runs back uphill. | same | today → 1789 | reuse the `p3q-touch` staging (`kq.quelle.hold(t)`) |

## B. The first time travel and the 1789 training

| # | Shot id | Beat | Place | Era · light | Shot hint |
|---|---|---|---|---|---|
| 18 | `t11-brunnenstube` | Summer 1789: the baroque Brunnenstube, open meadows, and the phone says "Kein Netz". | 1061 / −834.5 | 1789 · day | reuse `p3r-brunnenstube` framing; phone corner `ui: '.kq-photo'` |
| 19 | `t12-training` | Three Nebelinge rise from the brook mist and Laub calls out each move. | 1030 / −852 (prüfen) | 1789 · morning | fight framing with the lesson caption pinned; spawn 3 `nebelling` tier 0 |
| 20 | `t12-bannlicht` | The lantern flares and two flying unpaid decrees drop like dead leaves. | 1030 / −852 | 1789 · morning | Bannlicht cone mid-flare, 2 `mahnbrief` |
| 21 | `t13-heulen` | A single hound howls far to the north and the needle jerks. | 1035 / −850 | 1789 · morning | camera turned north towards 1216/−1571, the palace roofs over the Orangerie |
| 22 | `t14-pause-hub` | Back in the present, five minutes later, the spring is the rest stop: Chronik, phone, wall ledge, niche, step. | 1059.3 / −833.1 | today · pause | hub overlay, `ui: '[data-testid="hub"]'` re-themed |

## C. The ending choice and the three parties (today, dusk)

| # | Shot id | Beat | Place | Era · light | Shot hint |
|---|---|---|---|---|---|
| 23 | `e0-erwachen` | After the finale the player wakes on the spring's step, horn in hand, phone at 16:44. | 1059 / −833 | today · dusk | wide, cold blue with the last warm light up the slope |
| 24 | `e1-wahl` | From the clearing's edge: a stump with the Chronik, the horn and the compass, the party's fairy lights beyond. | ≈ 1200 / −1095 (prüfen) | today · dusk | replaces `e1-wahl`; `tx:1216,tz:-1114`, choice UI |
| 25 | `e-museum-fest` | Under the fairy lights the guide lifts a page from the grey archive box and the group leans in. | 1214 / −1112 | today · dusk | replaces `e-museum`; party spawned, `k.story.ending('museum', true)` then the party stage |
| 26 | `e-burn-fest` | The group stands around the fire bowl and sparks rise into the dark blue like eyes going out. | 1216 / −1114 | today · dusk → night | replaces `e-burn`; low angle on the fire bowl, sparks |
| 27 | `e-keep-fest` | On the bench two dogs lie at the player's feet, eyes catching the fire a little too brightly. | 1206 / −1118 | today · night | replaces `e-keep`; `hunt:tableau` is not used, the two dogs are tour NPC animals |
| 28 | `e-fest-abspann` | The credits roll as the camera circles the party: the man in the camping chair, the sketcher, the stonemason, the counter. | 1216 / −1114 | today · dusk | slow orbit, credits strip, `ui: '.ending-credits'` |

## Existing shots replaced or retired

| Existing shot | Fate |
|---|---|
| `p1-feldstation`, `p2-damm`, `p3-orangeriemauer`, `p3q-quelle`, `p4-ehrenhof`, `p5-hohlweg`, `p6-eiskeller`, `p7-punktwolke`, `p8-regeln`, `p9-wechsel`, `p9b-sommer-1789`, `p10-abend`, `p11-nacht` | **retired** (13); replaced by #1–#16 and #21–#22 |
| `p3q-touch`, `p3r-brunnenstube` | **re-shot** as #17 and #18 (same staging, new beat ids `t10` / `t11`) |
| `c-marlene` (staged at the trailer) | **replaced** by #10 (`t7-marlene`) |
| `e1-wahl` | **replaced** by #24 (new place: the clearing's edge) |
| `e-museum`, `e-burn`, `e-keep` | **replaced** by #25–#27 (the staged ending moments stay inside `stage.ts`; the cards show the party) |
| `pl-quelle-1793-02`, `pl-quelle-1793-07`, `pl-quelle-1796`, `pl-orangerie-1789`, `pl-eiskeller-1789`, all `k1-…`–`k4-…`, `c-…` except `c-marlene` | unchanged |

**Budget:** 60 shots now; 20 retired or replaced, 28 new → **68**. Over the ~60-picture / 8 MB budget (6.4 MB used). Proposal: render #1, #4, #8, #22, #28 as UI-only crops at half size, and merge #15/#16 and #19/#20 into one card each → **66 pictures, ≈ 7.3 MB**; or raise the budget (open question Q11).

**index.html:** the `<section class="chapter" id="prolog">` gets the new kicker „Prolog · heute“, h3 „Die Führung“, `.era` „heute, Mitte November · 1789 (Training)“ and a new blurb; the endings section gets the three party cards after the staged ones.
