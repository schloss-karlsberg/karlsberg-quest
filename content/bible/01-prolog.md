# Prolog „Die Führung“

The opening follows an ordinary visitor on a November afternoon. Gerold Imhoff (FIKTION, placeholder
name) leads the group from the Wanderparkplatz by the Karlsberger Hof to the Felsenpfad, the
Karlsbergweiher and the Karlsbergquelle. Seven people resemble figures the player will meet in the
past. The group goes ahead to the plateau while the visitor pauses at the spring. There the visitor
finds Laub’s brass Bussole and touches the water. That touch is the journey: the visitor stays in
1789 and „Der Hof“ begins there. The story returns to the same afternoon at the end and rejoins the
group at the [party](06-enden.md#8-das-fest).

[The story file](../story/00-tour.story.json) defines the shipped beats and dialogue.
[The guide script](../../docs/design/tour/sources.md) records sources and future narration.
The chapter ID is `tour`, the runtime eras are `today` and `1789`, and the next chapter is `k1`.

## 1. Ablauf

| Beat | Geschehen |
| --- | --- |
| Vor dem Spiel | „Neues Spiel“, Inhaltshinweis, Name, illustrierte Routenkarte. „Tour starten“ startet die Führung und gibt den Ton frei. |
| `t1` Treffpunkt | WASD / Touch-Stick und Kamera. Gerold sammelt die Gruppe am Parkplatz. Herr Soll zählt mit. Mats hat einen Spielzeugkompass. |
| `t2` Station 1 | E / Antippen bei Gerold. Er erklärt den Blick zum Berg und zeigt in Richtung des alten Baumagazins. „Karlsberger Hof“ dient als Ortsname. |
| `t3–t5` Zum Felsenpfad | Die Gruppe wartet bei 25 m Abstand. Am Feldweg blendet die Abkürzung zum Einstieg. Wer zurückbleibt, findet die Gruppe über den Kompass oder durch Halten der Epochentaste (Q auf Desktop). |
| `t6` Station 2 | Buntsandstein, Felsköpfe und die belegte Nutzung der Hohenburg als Steinbruch. Ob hier am Pfad für das Schloss Steine gebrochen wurden, bleibt offen. |
| `t7–t8` Wind im Wald | Diane und Bijou rennen bellend in den Wald und kommen zurück. Eine überspringbare Kamerasequenz zeigt die Vorahnung der Meute (FIKTION). |
| `t9–t10` Ricke und Kitz | Beide Tiere tragen graues Winterfell. Geduckt und langsam heranpirschen. Ein gutes Handyfoto zeigt beide Tiere. Gerold reagiert auf das Foto oder die Flucht. Die Führung geht auch ohne Aufnahme weiter. |
| `t11–t12` Weg zum Weiher | Die zweite Abkürzung führt zum Damm und Marlene ruft der Gruppe zu. |
| `t13` Station 3 | Marlene erscheint am Ufer und leiht den Eschenstab (`item.stab.esche`, `marlene.t.messstab`). Der Fund erscheint im HUD. Am Weiher bleiben Baujahr und Zweck offen. |
| `t14–t15` Station 4 | Gerold spricht an der Quelle über den Karlsbergbach und das Wassertretbecken in der Nähe. Fassung und Schlossversorgung bleiben offen. Die Gruppe geht über `p-aufstieg` zum Plateau. |
| `t16–t17` Pause und Bussole | Am Trog findet der Besucher die Bussole (`item.bussole`, `story.compass`, `story.laub`). Laub stellt sich vor und bittet darum, die Hand ins Wasser zu halten. „Wasser berühren“ löst `quelle:touch` aus und wechselt nach 1789. |
| `t18` Sommer 1789 | Ankunft: der Zeitwechsel, dann „Wo sind die alle hin?“, Laub erklärt das Jahr und verweist auf das Blatt im Deckel (`laub.t.seite`). Der Besucher kann sich bewegen. Keine Abblende, keine Rückkehr: „Der Hof“ beginnt an Ort und Stelle. |

The tour has combat disabled. The closing scene in 1789 is the arrival, not a glimpse: the visitor
stays, and K1 goes on where they stand with the route past Liese and the Orangerie (TASK-089; until
2026-11-28 the scene faded back to the present and K1 asked for a second touch the next morning).
The spring is still the wake point, the home target for a held Q and the rest-stop overlay.
The overlay placement remains part of TASK-007.

## 2. Orte und Route

Local coordinates use `x = E − 381000` and `z = −(N − 5465000)`. The
[built route](../routes/p-fuehrung.json) holds the group’s stops. The table also gives the player’s
positions after both shortcuts and at the trough.
See the [guide sources](../../docs/design/tour/sources.md) for historical claims.

| Ort | x / z | Bezug |
| --- | --- | --- |
| Start und Treffpunkt | 529 / −777 → 524 / −770 | Wanderparkplatz, OSM 778169747 |
| Altes Baumagazin | ≈ 519 / −813 | Karlsberger Hof, Privatbesitz. Der Startpunkt liegt am Parkplatz. Der historische Hof KB-B30 war ein eigener Standort. |
| Abzweig und Einstieg | 515,2 / −729,9 → 622,4 / −479 | Spielerposition nach der ersten Abkürzung |
| Felsenpfad | 682,9 / −596,1 | Station 2 an der Holzbrücke |
| Wind | 676,1 / −635,7 | Hang nach dem Felsenpfad |
| Rehhalt und Tiere | 727,4 / −751,5 → 698 / −773 | Die Tiere stehen unterhalb des Wegs. |
| Damm und Weiher | 829,5 / −838,7 → 897,2 / −845,3 | Spielerposition nach der zweiten Abkürzung und Station 3 |
| Trog | 1059,3 / −833,1, Blick 50° | Station 4, die Zeitreise, Ankunft 1789, K1-Checkpoint (heute) und Heimkehr |
| Plateau | 1216 / −1114 | Ehrenhof-Lichtung und Abschlussfest |

## 3. Foto und Doppelgänger

In the present, photo mode uses the phone (N on desktop). On touch, the deer prompt reads
„Fotomodus öffnen“ and highlights the camera button. Opening the camera moves the highlight to
the shutter. A good deer photo needs doe and fawn in frame. If the animals flee nearby the group
can move on after 45 seconds, with a 180-second fallback.
The [photo system notes](../../docs/design/tour/systems.md) describe the framing rules and album.
The [Codex](07-codex.md#tour-karten-und-fotokarten) records additional photo-card ideas.

Keep the doubles recognizable by silhouette, gesture and phrasing. Herr Soll counts twice, Christian
Mann sketches, and Liese comments on the jacket. The [voice bible](08-stimmen.md#2-die-doppelgänger-fiktion)
contains the roster and draft lines. The album callback „Kommt dir bekannt vor?“ is a design idea.
Matthes and the Pikeur have no modern double. Mats’s toy compass is the nod to Laub.

## 4. Zeit und offene Entwürfe

The present-day framing is a single November afternoon, from the tour through the pause at the spring
to the dusk party. The original lighting plan was `tour` → `pause` → `spaet` → `dusk`. The
[design decisions](../../docs/design/tour/README.md) and [work packages](../../docs/design/tour/impact.md)
record the proposals for adapting later scenes and phone messages. „Kein Netz“ and the bundled group
messages are writing ideas for those scenes.

The optional survey jobs for Marlene and a separate 1789 training scene are design proposals:

| Entwurf | Idee |
| --- | --- |
| „Was der Wald verbirgt“ | Damm und Orangerie-Stützmauer mit dem Relief betrachten. |
| „Kohlplatten“ | Drei Kohlplatten mit dem Relief finden. |
| „Der Grundriss im Wald“ | Ehrenhof vermessen, Laubs Karte vergleichen, Hohlweg und Eiskeller finden. |
| „Nicht anfassen“ | Einen Trichter vom Rand aus sichten und Marlene melden. |
| „Spuren in der Punktwolke“ | Spuren am Ehrenhof ansehen und die Deutung offenlassen. |
| „Lichter am Weiher“ | Drei Irrlichter bannen, sobald Laub das Bannlicht erklärt hat. |
| Training in 1789 | Auf der Wiese unterhalb der Quelle Nebelinge und Mahnbriefe für Hieb, Ausweichen, Wuchthieb und Bannlicht einsetzen. |

The retired surveyor quests survive as save history. The existing K1 disguise, fights and tutorials
are described in [Der Hof](02-kapitel-1.md) and the [quest catalogue](../../docs/ACTION-RPG.md#11-quest-catalogue).

## 5. Übergabe und EP

The tour grants **549 EP** at `t18`, which reaches level 3 (400 EP, level 4 at 750). The same exit
grants Relief 3, Kartograf 1, `item.p.seite` („Seite im Deckel der Bussole“), four Balsam and one
Lampenöl, and unlocks `k1`. The Bussole and Messstab already belong to the player at that point.
The chapter cleans up the group, animals and its combat lock when it leaves. The headless handover
and budget tests check the shipped grants. The work-package table’s 426 / 712 EP values were
planning estimates for the optional-quest version.

## 6. Alte Spielstände

[The migration](../../src/core/legacy-prologue.ts) resumes any saved `prolog` beat in `k1/k1_0`
at the spring in `1789` and marks the tour complete. It preserves earned XP, quest history and
deeds, pays earned pending quest rewards once, clears retired objectives, spawns and pickups, and
fills in missing handover skills and items. The tour’s 549 EP and item counts are minimums.
Older slots on `tour/t13` through `t18` get the staff if their inventory lacks it.
A slot on `tour/t18` finishes the shift on Continue. A slot on `k1/k1_0` that waited in the present
for the old second touch loads in 1789 at the spring (`migrateFirstJump`); should such a player
stand in the present anyway, Q at the spring leads back. No save needs a touch that is not offered.
The original „Vermessung“ design and content remain available in the release history.
