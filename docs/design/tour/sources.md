# Guided tour narration and sources

TASK-010. The German lines below are the reviewed script integrated into the tour in slice 2. Each row is a skippable subtitle and a line in the recording batch. **FAKT** marks a sourced statement, **OFFEN** a question Gerold leaves open aloud, and **FIKTION** dialogue or staging written for the game. Gerold Imhoff is the fictional guide’s placeholder name.

## Route and cues

The coordinates are game coordinates in metres (x / z). Beat IDs come from the [live tour story](../../../content/story/00-tour.story.json), and the stops from [p-fuehrung](../../../content/routes/p-fuehrung.json). The three parking-lot conversation lines and the waiting barks are in the [tour pack](../../../content/packs/tour.pack.json). The scripted route, group, animal actions and transition to the past are **FIKTION**.

| Beat | Route stop or cue | Guide and listening space |
| --- | --- | --- |
| `t1` | `parkplatz` 524 / −770 | Approach the group. Gerold’s `imhoff.t.01` is delayed 1.5 s and followed by `imhoff.t.01b`. Soll and Mats have short lines. After these lines, being within 7 m or waiting 25 s advances to `t2`. |
| `t2` | `parkplatz`, station 1 | `imhoff.t.02` turns attention to the ridge. After Jost’s dog line, speaking to Gerold opens the once-only `npc:talk` greeting in three steps. Closing the conversation completes the beat. There is a 60 s fallback for players who do not start the conversation. |
| `t3` | Walk to `abzweig` 515.2 / −729.9 | Keep `imhoff.t.los` as a brief departure cue, with the waiting bark for stragglers. Arrival advances the beat. |
| `t4` | `abzweig` → fade and warp to `einstieg` 623.4 / −485.9 | `imhoff.t.abkuerzen` is a short cue before the cut. The guide is sent toward `felsen`. |
| `t5` | Walk from `einstieg` to `felsen` | Leave the walking and sprint prompt clear. Arrival opens station 2. |
| `t6` | `felsen` 682.9 / −596.1, station 2 | Gather for all four station lines and the player’s response. The group moves on after the response finishes or is skipped. |
| `t7` | Walk to `wind` 676.1 / −635.7 | Leave the slope quiet apart from the waiting bark if triggered. Arrival opens the dog scene. |
| `t8` | `wind`, dogs and wind | Leave wind, barking, the cinematic and Jost’s call room to be heard. Gerold’s `imhoff.t.wind` is an exit line after the dog scene, a **FIKTION** guess about what startled them. |
| `t9` | Walk to `reh` 727.4 / −751.5 | The deer spawn as the guide walks. Leave their approach clear apart from the waiting bark if triggered. |
| `t10` | `reh`, photo cue | Open with `imhoff.t.reh1` and `imhoff.t.reh2` quietly. Leave the stalk and photo quiet. Gerold reacts with `imhoff.t.reh.alert`, `imhoff.t.reh3`, or `imhoff.t.reh.schnell` on the corresponding outcome. |
| `t11` | Fade and warp to `damm` 837 / −839.5 | `imhoff.t.weiter` is a delayed departure cue. The guide is sent toward `weiher`. Leave the cut clear of new history. |
| `t12` | `damm` → `weiher` | The **FIKTION** meeting uses `marlene.t.cameo` and Gerold’s `imhoff.t.marlene`. Leave that exchange clear. Arrival opens station 3. |
| `t13` | `weiher` 897.2 / −845.3, station 3 | Gather for all four station lines. The group stays through the last line or until it is skipped. |
| `t14` | Walk to `quelle` 1062 / −836.7 | Leave the uphill walk clear apart from the waiting bark if triggered. Arrival opens station 4. |
| `t15` | `quelle`, station 4 | Gather for all four station lines and `imhoff.t.pause`. After the farewell finishes or is skipped, the group continues via `p-aufstieg` and the pause timer starts. |
| `t16` | Trough 1059.3 / −833.1 | Gerold falls silent. Give the trough its pause. At 9 s the player notices the glint. After 10 s, entering the 1.6 m radius (or already standing there) advances to the compass. |
| `t17` | Trough, handoff to Laub | The group and dogs despawn. The compass clink is captioned, then Laub speaks. The player touches the water to trigger the shift. Keep Gerold silent. |
| `t18` | Spring in 1789, then handover | The player and Laub react while the player is free to look around; „Der Hof“ begins there (no fade, no return). Keep Gerold silent. |

## Station 1 · Wanderparkplatz (`t1`–`t2`)

Play the welcome as the player reaches the group. Give it time to finish or be skipped before the camera cue and the other speakers. Use the first `t2` line for the camera cue and the remaining lines for the greeting sequence. Keep the group at the parking lot through the conversation.

| Beat | Line ID | German voice and subtitle | Claim and source |
| --- | --- | --- | --- |
| `t1` | `imhoff.t.01` | So. Treffpunkt am Karlsberger Hof. Schön, dass ihr da seid. | **FAKT** Place name in [Straßenverzeichnis, Bruchhof-Sanddorf][street]. **FIKTION** The meeting and welcome. |
| `t1` | `imhoff.t.01b` | Ich bin Gerold Imhoff. Kommt mal näher, dann hört ihr mich besser. | **FIKTION** Introduction and direction to the group. |
| `t2` | `imhoff.t.02` | Guckt mal hoch. Da oben stand das Schloss. | **FAKT** Palace site on the Buchenberg in [Schloss Karlsberg, first paragraph][city-palace]. **FIKTION** The guide points from the parking lot. |
| `t2` | `imhoff.t.station1` | Der Karlsberger Hof hier unten war das Baumagazin des Schlosses. | **FAKT** Site at the foot of the hill and former Baumagazin in [Schloss Karlsberg, closing paragraph][palace-history]. See [cx.32][cx32]. |
| `t2` | `imhoff.t.station1a` | Da lagerte man Baumaterial. Im selben Gebäude gab es auch Wohnungen. | **FAKT** Building material in [Schloss Karlsberg, closing paragraph][palace-history]. Accommodation in [Historischer Führer Nr. 17, entry for 1776–85][old-guide] and [Historische Stadt, entry 26][city-guide]. See [cx.32][cx32]. |
| `t2` | `imhoff.t.station1b` | Und das Schloss da oben? Am 28. Juli 1793 ist es abgebrannt. | **FAKT** Day and fire in [Schloss Karlsberg, „Das Ende des Schlosses“][palace-history]. See [cx.22][cx22]. |

The [archived Historischer Führer Nr. 17][old-guide] and the city’s current guide [Historische Stadt, entry 26][city-guide] agree on the identity and original uses of the building. The audition preserves the live greeting’s 1778 construction date, which appears in the [museum reconstruction description][museum-date]. The [city’s Schloss Karlsberg page][city-palace] gives 1776 as the start of its construction chronology. The recording script uses the agreed fire date.

## Station 2 · Felsenpfad (`t6`)

| Line ID | German voice and subtitle | Claim and source |
| --- | --- | --- |
| `imhoff.t.station2` | So. Seht ihr den Buntsandstein neben dem Weg? Das hier ist der Felsenpfad. | **FAKT** Named path and Buntsandstein formations in [Schlossbergtour, station 3][trail]. |
| `imhoff.t.station2a` | Bleibt bitte auf dem Weg. | **FIKTION** Gerold’s direction to the group. |
| `imhoff.t.station2b` | Hat man hier Steine fürs Schloss gebrochen? Ehrlich, das weiß man nicht. | **OFFEN** The [trail description][trail] identifies the rock. The site of documented stone reuse is the Hohenburg in [Grafenburg, Renaissanceschloß, Festung, pp. 98–99][hohenburg]. |
| `imhoff.t.station2c` | Für den Schlossbau hat man Steine aus den Trümmern der Hohenburg geholt. | **FAKT** Stone reuse in [Stefan Ulrich, Grafenburg, Renaissanceschloß, Festung, pp. 98–99][hohenburg]. See [cx.31][cx31]. |

The path and rock name are documented at this stop. In the recording script, the age and climbing restriction from the live line give way to a direct observation and a request to stay on the path.

## Station 3 · Karlsbergweiher (`t13`)

| Line ID | German voice and subtitle | Claim and source |
| --- | --- | --- |
| `imhoff.t.station3` | So. Der Karlsbergweiher hier ist von der Schlossanlage geblieben. | **FAKT** Identified as a surviving feature in [Schlossbergtour, station 3][trail]. |
| `imhoff.t.station3a` | Seht ihr die kleine Insel? Der Damm liegt am Westende. | **FAKT** The island is inner way 653208018 in the [Karlsbergweiher map data][pond]. The western dam is the ridge near x 819 / z −875 in the [2025 terrain grid][terrain] (KB-42). See [rm.08][rm08]. |
| `imhoff.t.station3b` | Wann genau man den Weiher angelegt hat? Das ist offen. | **OFFEN** Exact construction date. The [walking leaflet][trail] identifies the surviving pond and the [mapped outline][pond] records its present extent. |
| `imhoff.t.station3c` | War er zum Anschauen da oder hat man hier Fische gehalten? Das weiß man nicht. | **OFFEN** Original function of this specific pond. [Schloss Karlsberg, opening paragraphs][city-palace] describes ponds among the gardens. [Schlossbergtour, stations 3 and 7][trail] identifies this pond as a remnant and describes fishing at the separate Merwog. |

## Station 4 · Karlsbergquelle (`t15`)

| Line ID | German voice and subtitle | Claim and source |
| --- | --- | --- |
| `imhoff.t.station4` | So. Hier beginnt der Karlsbergbach. Von der Quelle läuft er hinunter zum Karlsbergweiher. | **FAKT** The [spring node][spring] starts the [first mapped stream segment][headwater]. The [stream relation][stream] includes way 401951440 at the east shore of the [pond][pond]. The [walking leaflet][trail] describes the uphill path from the pond to the spring. See [cx.41][cx41]. |
| `imhoff.t.station4a` | Hört ihr das Wasser am Trog? | **FIKTION** Listening cue for the game’s spring scene. See the [live story’s trough interaction][story]. |
| `imhoff.t.station4b` | Wann man die Quelle gefasst hat? Das ist offen. | **OFFEN** Date of the water-catchment structure. The [spring node][spring] identifies the spring and a [2016 photograph][spring-photo] shows the modern trough. See [cx.41][cx41]. |
| `imhoff.t.station4c` | Hat genau diese Quelle früher das Schloss versorgt? Ehrlich, das weiß man nicht. | **OFFEN** A supply link from this specific spring. [Biotope und Schutzgebiete, p. 7][biotopes] identifies the spring area and its habitat. The [mapped stream][stream] shows the present course. See [cx.41][cx41]. |
| `imhoff.t.pause` | Ruh dich hier kurz aus. Wir gehen schon mal zum Plateau. | **FIKTION** Gerold’s farewell before the [handoff at the trough][story]. Water memory and time travel belong to [cx.42][cx42]. |

At the trough, the story has room for quiet before the compass clink. Give Laub the first voice after the clink.

## Timing and recording

A temporary German text-to-speech read-through at 145 words per minute gave about 10 s for the welcome, 21 s for the parking-lot lines, 18 s at the Felsenpfad, 18 s at the pond and 22 s at the spring. These totals cover Gerold's words only. The longest subtitle is 89 characters. Allow time for the other speakers and the group to settle, then use the selected recordings to verify the cue timing on keyboard and touch.

The owner selected D, deep documentary, from synthetic design `kq010-guide-d-design-s6301`. The line batch uses German and seed 6301. In the tour, the group waits for the last line to finish or be skipped before the next cue. The parking-lot greeting uses the conversation panel and retains its timeout path.

[street]: https://www.homburg.de/media/s0toikxj/strassenverzeichnis.pdf
[city-palace]: https://www.homburg.de/leben-in-homburg/touristisches/sehenswertes/schloss-karlsberg/
[palace-history]: https://schloss-karlsberg.de/schloss-karlsberg-3/
[city-guide]: https://www.homburg.de/media/5hfft4lb/historischer-stadtfuehrer.pdf
[old-guide]: https://web.archive.org/web/20080123101148/http://www.homburg.de/content/pages/1071.htm
[museum-date]: https://www.youtube.com/watch?v=kfnE6HdXmVo
[trail]: https://www.homburg.de/media/scllyew0/schlossbergtour.pdf#page=1
[hohenburg]: https://scidok.sulb.uni-saarland.de/bitstream/20.500.11880/23766/1/Beitraege_zum_1.Burgensymposion_59.pdf
[pond]: https://api.openstreetmap.org/api/0.6/relation/17145701/full.json
[terrain]: ../../../public/data/terrain/meta.json
[stream]: https://api.openstreetmap.org/api/0.6/relation/10294956/full.json
[headwater]: https://api.openstreetmap.org/api/0.6/way/286984273/full.json
[spring]: https://api.openstreetmap.org/api/0.6/node/368031320.json
[spring-photo]: https://commons.wikimedia.org/wiki/File:Karlsbergquelle.jpg
[biotopes]: https://www.homburg.de/media/vqbfvo1u/broschuere_dr_dorda.pdf#page=7
[cx22]: ../../../content/bible/07-codex.md#cx22--der-brand
[cx31]: ../../../content/bible/07-codex.md#cx31--steine-auf-wanderschaft
[cx32]: ../../../content/bible/07-codex.md#cx32--das-baumagazin
[rm08]: ../../../content/bible/07-codex.md#rm08--weiher-und-damm
[cx41]: ../../../scripts/content-build/codex.mjs#L140
[cx42]: ../../../scripts/content-build/codex.mjs#L143
[story]: ../../../content/story/00-tour.story.json
