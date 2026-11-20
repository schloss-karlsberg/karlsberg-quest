# Prolog „Die Führung“ (Ersatzentwurf)

> **ENTWURF für das Release nach 0.5.0.** Ersetzt nach Freigabe `content/bible/01-prolog.md`. Die Kapitel-ID bleibt `prolog` (Schlüssel `p`), damit `chapterKey`, die Chronik-Sperre und `rpg-contracts` gültig bleiben. Die Beats heißen neu `t1` … `t15`. Prosa Englisch wie in der übrigen Bibel, alle Spielertexte (Dialoge, Stationstexte, Ziele) Deutsch.
>
> **Gerold Imhoff** ist ein **Platzhaltername**. Die Figur ist einem echten, lebenden Führer nachempfunden, dessen schriftliche Einwilligung noch fehlt. Der Tausch ist ein Name; nirgends steht ein echter Name oder ein persönliches Detail.

| | |
| --- | --- |
| Ära | `heute`, Mitte November, ein Nachmittag: goldenes Laub, tief stehende Sonne, leicht dämmrig (Look `tour`, siehe §9). Danach `1789-07` (Sommermorgen) für das Training |
| Dauer | 18–22 min (Führung 13–15 min, 1789-Training 3–4 min, Pause an der Quelle 1–2 min) |
| Lernziele | Gehen, Kamera, Sprechen (E), Karte, Codex, Fotomodus (Smartphone), Schleichen (C), Relief 1–3, Karte von 1840 (M), Zeitwechsel an der Quelle, Q halten. **In 1789:** Hieb, Ausweichen, Wuchthieb, Bannlicht |
| Kampf | **Keiner während der Führung** (`combat.disabled` von t1 bis t11). Der erste Kampf ist ein kurzes, angeleitetes Training in 1789 (t12) |
| Ende | Training geschafft, zurück im Heute an der Quelle, Pause-Hub einmal geöffnet → `unlock k1` |
| Stimmung | Warm, neugierig, ein bisschen Klassenfahrt. Unbehagen nur zweimal: der Wind und die Hunde (t5), das Heulen in 1789 (t13) |

**Prämisse.** Du bist ein ganz normaler Besucher (das Aussehen ist der Avatar des Owners) auf einer öffentlichen Führung über den Karlsberg. Führer ist **Gerold Imhoff** (FIKTION, Platzhalter): groß, hager, kahl. Die Gruppe hat 15 Leute, du eingeschlossen; sieben davon sind die **heutigen Doppelgänger** der Figuren, denen du in 1789 begegnest (`08-stimmen.md` §2). An der Karlsbergquelle machst du kurz Pause, die Gruppe geht schon zum Plateau weiter. Im Wasser liegt eine Messing-Bussole. Sie redet. **Die ganze Zeitreise des Spiels passiert in dieser Pause** (§9). Am Ende holst du die Gruppe auf dem Plateau ein, und dort ist das Fest (`06-enden.md`).

---

## 1. Ablauf (Beats)

Koordinaten lokal (x = E − 381000, z = −(N − 5465000); z < 0 ist Norden), aus `tour-route-research` (OSM, in `paths.json` geprüft). **(prüfen)** = neuer Punkt, im Gelände mit `scripts/content-build/probe.mjs` prüfen.

### t0 – Vor dem Spiel

Titel → Inhaltshinweis (16+) → Name → statt der Streichholzschachtel ein **Ticket** auf schwarzem Grund:
„Öffentliche Führung · Schloss Karlsberg – was vom Märchenschloss blieb · Treffpunkt: Wanderparkplatz am Karlsberg, am Waldrand · Sa., 14:30 Uhr · festes Schuhwerk“.
Der Klick „Ticket abreißen“ startet den Ton (wie bisher das Streichholz; Ablauf in `src/systems/story/title/flow.ts` bleibt, nur das Motiv wechselt). Kein Logo, kein Werbetext.

### t1 – Treffpunkt (Bewegung, Kamera)

**Ort:** Wanderparkplatz am Waldrand, **522 / −766** (OSM-Knoten 778169747). Kapitel-Checkpoint `{x 524, z −770, yaw 200, era today}` (prüfen: Blick nach Süden über den Parkplatz, Richtung 519/−813, wo hinter den Bäumen das alte Gebäude steht).
Du stehst am Rand der Gruppe. Gerold hebt einen zusammengeklappten Schirm wie ein Zeigestock. Erste Steuerung ab Sekunde 0: W/A/S/D (`ui.tut.move`), Maus schauen. Ziel: „Zur Gruppe“ (6 m).
- `imhoff.t.01`: „So. Fünfzehn. Dann sind wir komplett. Ich bin Gerold Imhoff, und ich bin heute zwei Stunden lang euer Mann für das Schloss, das nicht mehr da ist.“
- Herr Soll (Doppelgänger) zählt halblaut mit: „… dreizehn, vierzehn, fünfzehn. Stimmt.“
- `imhoff.t.02` (Kamera-Tutorial: „Schau nach oben“): „Guckt mal hoch, da oben auf dem Berg. Nichts zu sehen, oder? Nur Wald. Genau da stand es.“ → Ziel „Schau zum Berg“ (Blickrichtung Ost, Toleranz 30°).

### t2 – Station 1: am Wanderparkplatz (Sprechen, Codex)

> **Q2 entschieden (Owner, 2026-11-20).** Es gibt kein detailliertes Modell des heutigen Gebäudes (nur das hypothetische 1789-Baumagazin KB-B29 in `public/data/palace/buildings.glb`, nicht CC0, und die amtliche LoD2-Kubatur, dl-de/by-2-0). Darum: Die Führung beginnt am **Wanderparkplatz**. Das Gebäude wird im Heute **nicht** modelliert (höchstens Gelände und Wald an seiner Stelle, kein neues Mesh). Der Name „Karlsberger Hof“ steht nur, wo er natürlich vorkommt (Adresse, Straßenname: OSM-Weg 29272436 heißt so), und es gilt die Regel „nur als Ort“. Gerold zeigt in **einem** Satz in die Richtung (ein FAKT, der schon im Codex steht). Nicht verwechseln mit KB-B30 „Carlsberger Hof (Meierei)“, einem anderen Hof von 1789 rund 120 m südlich.

**Ort:** derselbe Platz; Gerold zeigt Richtung **519 / −813** (OSM-Grundriss x 503–535, z −837…−788). Dort stehen im Spiel nur Wald und Gelände; kein Gebäude-Mesh, keine Schilder, keine Beschriftung.
E „Zuhören“ bei Gerold (Sprech-Tutorial; der Gesprächsradius ist eine sichere Zone wie bei jedem NPC). Stationstext (FAKT, Quellen in `07-codex-impact.md` `cx.T1`):
- `imhoff.t.station1`: „Willkommen am Fuß des Karlsbergs. Da hinten, hinter den Bäumen, steht noch ein einziges Gebäude der ganzen Schlossanlage des Herzogs Karl II. August: das alte Baumagazin. Heute ist es Privatbesitz, da gehen wir nicht hin.“ (FAKT, `cx.32`, `cx.T1`; die ganze Geschichte des Gebäudes steht im Codex, nicht in Gerolds Mund.)
- `imhoff.t.station1b`: „Und das Schloss selbst? Ab 1778 gebaut, 1793 abgebrannt. Fünfzehn Jahre. Kürzer als so mancher Kredit.“ (FAKT: Baubeginn 1778, Brand 28. Juli 1793; `cx.22`, `cx.03`.)
- Codex-Tutorial: Nach der Station erscheint die Karte `cx.T1` „Das Gebäude, das blieb“, Hinweis „Neue Karte im Codex. [J] → Codex“ (`ui.tut.codex`, neu).
- Karten-Tutorial: Gerold zeigt auf die Infotafel (470/−793, OSM 5768687206): „Wer sich verläuft: Die Runde ist auf der Tafel.“ → die Route `p-fuehrung` wird auf der Karte gezeichnet, Ziel „Öffne die Karte“ (Reisekarte). Die Tafel im Spiel trägt **unseren** Text (Route, vier Stationen), nicht den der echten Tafel.
- Doppelgänger-Haken (optional, E): der ältere Herr Carl Herzog fragt Gerold „Kann man da nicht hochfahren?“ — Gerold: „Hochfahren durfte hier oben noch nie jeder.“ (Anspielung auf `cx.11`, keine Erklärung.)

### t3 – Der Weg zum Felsenpfad (Fotomodus)

**Weg:** Abzweig am Parkplatz **515 / −730** → Feldweg (OSM 29272437) nach Südosten, 269 m, 254 → 268 m, bis zum Einstieg **623,5 / −486**. Die Gruppe folgt Gerold (System `tour-group`, `systems.md` §3); wer zurückbleibt, hört „Kommst du? Wir warten vorne.“
Unterwegs, nach ≈ 80 m: das Handy brummt. Nachricht „Willkommen im WaldPark Schloss Karlsberg“ (erfundener Netzgruß, kein Anbieter). **Foto-Tutorial** (`photo`, Taste N): „Halte [N]: Handy-Kamera. Klick: Foto.“ Erstes Ziel: ein goldenes Buchenblatt im Gegenlicht. Ein gutes Foto landet im **Album** und zeigt, wie Fotokarten freigeschaltet werden (`systems.md` §1).

### t4 – Station 2: Felsenpfad

**Ort:** Felsenpfad, Halt an den Felsen bei der kleinen Holzbrücke **683 / −596** (Fels 694/−599, Höhe 271 m).
- `imhoff.t.station2`: „Ab hier sind wir auf dem Felsenpfad, und der gehört schon zum WaldPark Schloss Karlsberg. Die Felsen hier sind Buntsandstein, gut 250 Millionen Jahre alt, der rote Stein, aus dem in der Gegend fast alles ist. Bitte nicht auf die Felsköpfe klettern, das ist aus Sicherheitsgründen nicht erlaubt.“ (FAKT, `cx.T2`.)
- `imhoff.t.station2b` (Frage aus der Gruppe, Christian Mann skizziert schon): „Ob der Herzog hier Steine brechen ließ? Ehrlich: Das weiß man nicht. Dafür gibt es keinen Beleg. Belegt ist was anderes: Die Trümmer der Hohenburg über Homburg hat er als Steinbruch benutzt.“ (OFFEN / FAKT `cx.31`.)
- Fotoziel: „Buntsandstein“ (Felswand im Bildausschnitt, ≥ 25 % der Fläche).

### t5 – Wind im Wald (der Hunde-Moment)

**Ort:** Felsenpfad zwischen Einstieg und Brücke, **650 / −540** (Hang und Felsen geben Deckung). Ausgelöst, wenn die Gruppe den Punkt passiert (vor oder nach t4, je nachdem, wo der Weg den Trigger kreuzt; beim Bau so legen, dass er nach der Station kommt: Trigger auf dem Rückweg-Abschnitt 700/−640 r 12, prüfen).
Szene (≈ 20 s, In-Game-Kamera, kein Schnitt): Der Wind frischt laut auf, das goldene Laub fährt waagrecht über den Pfad, die Kronen rauschen. Josts zwei Hunde, **Diane** und **Bijou**, reißen die Köpfe herum, bellen und rennen hangaufwärts in den Wald, als hätten sie etwas gesehen. Jost Fendel rennt drei Schritte hinterher, pfeift zweimal. Stille. Nach ein paar Sekunden kommen beide zurück, Rute zwischen den Beinen.
- `jostd.t.hunde`: „Diane! Bijou! … Was habt ihr denn? Da ist doch nix.“
- `imhoff.t.wind`: „Wildschweine, wahrscheinlich. Oder Rehe. Kommt, weiter.“
- Ein Kind aus der Gruppe (Extra, Mats): „Da war wer. Mit Lampen.“ — niemand reagiert.
Keine Erklärung, keine Karte. Es ist die Vorahnung der Meute (FIKTION); die Verbindung zu `cx.06` bleibt unausgesprochen. Kein Kampf, keine Gefahr, kein Ziel.

### t6 – Das Reh und das Kitz (erster Wow-Moment, Schleich-Tutorial)

**Ort:** Gebüschfläche südöstlich des Felsenpfads, **817 / −704** (OSM-Fläche 288047167, Näherung; prüfen). Der Pfad läuft ≈ 50 m westlich vorbei.
1. Gerold bleibt stehen, Hand hoch, flüstert: `imhoff.t.reh1`: „Pssst. Da vorn. Nicht bewegen.“ Die Gruppe bleibt stehen (Gruppen-Op `hold`).
2. Zwischen den Stämmen: eine **Ricke** und ihr **Kitz**. Beide im grauen Winterfell, das Kitz ohne Flecken, fast so groß wie die Mutter, und es folgt ihr dicht (FAKT, `cx.T4`).
3. `imhoff.t.reh2` (leise): „Wer ein gutes Foto will: ganz langsam. Geduckt. Gegen den Wind.“ → **Schleich-Tutorial**: „[C]: Schleichen. Langsam heranpirschen.“ Ein Ring zeigt die Fluchtdistanz (Start 30 m; geduckt und langsam schrumpft die Wahrnehmung, aufrecht oder rennend wächst sie; das Rauschen des Laubs hilft).
4. Ziel: Foto auf **≤ 14 m** mit beiden Tieren im Bild („gutes Foto“: beide Tiere im mittleren Drittel, keines halb verdeckt). Wenn die Ricke sichert, Kopf hoch: stillhalten (Tell, 1,5 s Vorwarnung). Rennen oder aufrecht unter 20 m → beide springen ab und bleiben 25 m weiter wieder stehen (kein Scheitern, nur ein neuer Anlauf).
5. Beim guten Foto: **kurze Filmsequenz** (≈ 6 s, `cinematic` aus `systems.md` §2, überspringbar): die Kamera geht in den Sucher, das Kitz hebt den Kopf, schaut direkt ins Objektiv, dann ziehen beide ruhig in den Wald. Auslöser-Geräusch, das Foto rahmt sich im Album.
- `imhoff.t.reh3`: „Das. Das ist besser als jedes Schloss.“ (Pause.) „Fast.“
- Codex `cx.T4` „Rehe im November“ (freigeschaltet durch das Foto).
- Alternative für schwächere Spieler: nach 90 s ohne gutes Foto genügt eins auf ≤ 22 m (Karte gleich, Album-Rahmen „unscharf“).

### t7 – Station 3: Am Karlsbergweiher, und Marlene

**Weg:** Ende des Felsenpfads am Westende des Damms **837 / −840**, dann ≈ 60 m zum Nordufer.
**Marlene** (Försterin, FIKTION) steht mit Stativ und Messstab auf dem Damm, **826 / −866** (prüfen; Damm 819/−875). Gerold kennt sie: „Das ist Marlene vom Forstamt. Die misst den Wald.“

**Station 3** (Bänke am Nordufer, **898 / −840**; Weiher-Mitte 877/−871, Insel 891/−869):
- `imhoff.t.station3`: „Der Karlsbergweiher. Auch er ist ein Überbleibsel vom Schloss: ein Rest der Wasserbecken im Schlosspark. Wann genau man ihn angelegt hat und ob er Zierteich oder Fischweiher war, das weiß man nicht sicher. Steht so auch nirgends belegt. Seht ihr den geraden Damm im Westen und die kleine Insel? Beides sieht man sogar im Laserscan.“ (FAKT: Relikt des Schlossparks, SBT/EN-KC/Wikidata; OFFEN: Baujahr und Zweck. `cx.T3`.)
- Fotoziel: „Die Insel im Weiher“.

**Marlenes Pflichtgespräch** (≤ 60 s; Hauptweg, Quest `q.p.marlene`):
- `marlene.t.01`: „Hallo! Bist du mit Gerolds Gruppe? Gut, dann halt mal kurz.“ Sie drückt dir den **Messstab** in die Hand (`item.stab.esche`; die zwei Kräuterbalsam der ersten Aufnahme bleiben). „Da hin, an den Pflock. Gerade halten. Danke.“
- `marlene.t.02` (Relief 1): „Wir haben den Wald im Winter mit Laser vermessen, aus der Luft. Ich schick dir das mal, guck aufs Handy.“ → **Relief-Blick 1** (`skill relief 1`), `ui.tut.scan1`. „Siehst du? Der Wald ist weg, der Boden bleibt.“
- `marlene.t.03` (Relief 2 am Mauerrest 813/−903): „Und jetzt die zweite Ansicht. Da unten, neben dem Damm.“ → **Relief-Blick 2**, `clue.p.mauerrest`, `rm.07`. „Gerade Linien und rechte Winkel macht der Wald nicht. Das war mal eine Mauer.“
- `marlene.t.04` (Relief 3 als Auftrag für die Quelle): „Die dritte Ansicht zeigt Rinnen und Kanten. Probier sie oben an der Quelle aus, da läuft eine Rinne bis hierher.“ (Schaltet **Relief 3** frei, das Tutorial selbst kommt in t10.)
- `marlene.t.05`: „Den Stab bringst du mir nachher aufs Plateau, ja? Ich hab noch einen im Auto. Und: Wir schauen, wir graben nicht.“ (`cx.35`.)
- Danach bietet Marlene ihre **optionalen** Aufträge an (§5). Die Gruppe wartet nicht darauf; Gerold: „Marlene, du hältst mir die Leute auf!“

### t8 – Der Weg zur Quelle

**Weg:** Nordufer → OSM 565125312 → 402180074 → 154916693, ≈ 185 m, 278 → 285 m, die Rinne des Karlsbergbachs bergauf.
Optional: Marlenes Kohlplatten-Auftrag zeigt am Hang runde, flache Stellen (Kohlplatten-Punkt 1040/−902 liegt ≈ 70 m von der Quelle).
Unterwegs Gruppengespräche (Barks, `08-stimmen.md` §2.9): Hanne Matz bleibt an einem Sandsteinblock stehen und streicht über eine Kante; Herr Soll fragt Gerold nach dem Kuchenbudget; Liese sagt zu dir: „Schöne Jacke. Leuchtet ja.“

### t9 – Station 4: An der Karlsbergquelle

**Ort:** Karlsbergquelle **1061 / −834,5** (OSM 368031320), Trog-Standplatz 1059,3 / −833,1 (Blick 50°, geprüft), Infotafel 1063,5 / −839,5.
- `imhoff.t.station4`: „Und hier oben entspringt die Karlsbergquelle. Aus ihr wird der Karlsbergbach, der durch die kleine Rinne zum Weiher hinunterläuft. Irgendwo hier in der Nähe gibt's ein Wassertretbecken zum Kneippen, im November eher was für Mutige. Ob die Quelle früher das Schloss mit Wasser versorgt hat und wann man sie gefasst hat: weiß man nicht. Belegt ist das nicht.“ (FAKT: Quelle, Bach, Becken in der Nähe; OFFEN: Fassung, Schlossversorgung. `cx.41`.)
- `imhoff.t.weiter`: „So. Wer verschnaufen will, verschnauft. Wir gehen schon mal hoch zum Plateau, da wo das Schloss stand. Da gibt's nachher Kuchen. Und Glühwein. Kommst du nach?“
- Spieler-Antwort (eine Wahl, beide führen weiter): „Ich komm gleich nach.“ / „Fünf Minuten.“
- Die Gruppe zieht den Hang hinauf Richtung Orangerie (Gruppen-Op `walk` zum Plateau, dann `despawn` außer Sicht, ≈ 120 m). Josts Hunde schauen sich noch einmal nach dir um.

### t10 – Die Pause, die Bussole

Allein an der Quelle. Das Licht wird eine Spur goldener. Der Ton: Wasser, ein Specht, die Gruppe fern.
1. Ziel: „Setz dich einen Moment.“ E „Auf die Stufe setzen“ (Sitz-Pose; das ist später die Rast-Funktion des Hubs).
2. Ziel: „Probier Marlenes dritte Ansicht.“ **Relief-Blick 3** (`ui.tut.scan3`): Die Rinne leuchtet als Kante vom Trog bis hinunter zum Weiher. Im Trog, unter dem Strahl, blitzt etwas, das im Relief nicht zu sehen ist (FIKTION: ein Glanz, wo kein Boden ist).
3. E „Ins Wasser greifen“: Du ziehst eine **Messing-Bussole** aus dem Trog. Kalt, grün angelaufen, der Deckel klemmt. `give item.bussole`, Flag `story.compass`.
4. Die Nadel dreht sich, aber nicht nach Norden. Dann zittert sie, und eine trockene Stimme sagt etwas. **Laubs Erwachen** (`laub.t.intro`, unten) → Flag `story.laub`.
5. Im Deckel klemmt ein gefalteter Kartendruck (`clue.p.laubblatt`, unverändert: „Aufgen. Nov. 1840. Q. L. – Standpunkt 17 am alten Forsthaus.“) → **Kartograf 1**, `flag.tool_map`, M schaltet frei: `ui.tut.map` „[M]: Lege die Karte von 1840 über das Gelände.“ (Der 50-m-Versatz wird erst am Ehrenhof wichtig: Marlenes optionaler Auftrag „Der Grundriss im Wald“.)
6. Laub hört das Wasser (`laub.t.quelle`), die Lichtpünktchen (`quelle.guide`) treiben über den Trog. Ziel: **E „Wasser berühren“** (`quelle.call`; das gebaute 2,7-s-Ereignis aus `src/systems/quelle/`). Der Ring bleibt stehen, der Strahl hängt in der Luft, der Bach läuft rückwärts den Hang hinauf. **1789.**

### t11 – Sommer 1789: die Brunnenstube

Dieselbe Stelle, ein warmer Sommermorgen 1789. Die barocke Brunnenstube (FIKTION, `cx.42`). Kein Wald: der Berg ist offen (FAKT, Pleine vue 1791). Oben am Hang die Orangerie, dahinter Dächer.
- `laub.t.1789`: „Siebzehnhundertneunundachtzig. Dieselbe Quelle, zweihundert Jahre jünger. Ob sie wirklich so aussah? Mein Blatt sagt nichts dazu. Das Wasser schon.“
- `laub.t.regel`: „Das Wasser erinnert sich. Ein Tropfen davon sitzt jetzt in der Bussole. Wo der Boden sich genauso gut erinnert, nimmt er uns mit.“
- Das Handy: „Kein Netz.“ (Running Gag, §8.) `laub.t.handy`: „Was immer das Kästchen sucht, es ist noch nicht erfunden.“
`combat.disabled` wird hier gelöscht.

### t12 – Das Training (der erste Kampf, angeleitet)

**Ort:** die Wiese unterhalb der Brunnenstube, **1030 / −852** (prüfen: offene Fläche 1789, ≥ 25 m von der Quelle, ≥ 25 m von Lieses Bleiche 1004/−857 und außerhalb ihres Gesprächsradius; Gedenkort-Regel: weit weg von jedem Gedenkort).
Aus dem Dunst über dem Bach steigen **drei Nebelinge** (Stufe 0), einer nach dem anderen. Laub erklärt Schritt für Schritt; jeder Schritt ist eine angepinnte Lehrzeile, die erst weicht, wenn man ihn gemacht hat:
1. „Klick: Hieb.“ — `laub.t.hieb`: „Sie haben einen Stab. Benutzen Sie ihn. Nicht so. Ja, so.“
2. „[Leertaste]: Ausweichen.“ — der zweite Nebelling holt deutlich sichtbar aus (lange Vorwarnung, nur im Training).
3. „Klick halten: Wuchthieb.“ — der dritte ist zäher („formt sich neu“ nach einem einzelnen Hieb, die bestehende Regel).
Dann wehen **zwei Mahnbriefe** von der Bleiche herüber (unbezahlte Erlasse, `mahnbrief`): **Bannlicht-Tutorial** (`Rechtsklick / G`: „Die Laterne flackert auf. Papier mag kein Licht.“). Die Laterne stammt von Gerold (t1: „Wir kommen im Dunkeln zurück, jeder kriegt eine Laterne.“); Laub: „Ihre Laterne brennt hier drüben auf Kosten Ihrer Zeit.“ Das Ölmaß startet erst in K1 (`k1.vorspiel`-Regel bleibt).
Keine Niederlage möglich: Im Training sinkt die Gesundheit nicht unter 30 % (Training-Flag, `systems.md` §7). Dauer ≈ 60–90 s. Kein Streuner, keine Meute: Das Jagd-Tutorial bleibt bei Jost in K1 (1.5) und die erste Meute in K1 (1.10).

### t13 – Das Heulen, Q halten

Fern im Norden heult ein einzelner Hund (Richtung Zwinger 1216/−1571). Die Nadel ruckt.
- `laub.t.zurueck`: „Zurück geht es immer: Q gedrückt halten. Jetzt bitte. Mir bekommt das achtzehnte Jahrhundert nicht.“
**Q halten** (`ui.tut.return`, neuer Text: „Halte [Q] 3 Sekunden, um zur Quelle zurückzukehren.“) → das Heute.

### t14 – Die Pause, Teil zwei (der Hub)

Zurück an der Quelle, im Heute. **Es sind kaum fünf Minuten vergangen** (§9). Von oben, schwach, Gerolds Stimme und Gelächter.
- Handy: Nachricht von Gerold: „Wir sind oben an der Orangerie. Lass dir Zeit, der Kuchen wartet.“
- `laub.t.heute`: „Da sind wir wieder. Merken Sie sich die Stelle. Hier wachen Sie ab jetzt auf, wenn etwas schiefgeht. Und hier können Sie in Ruhe nachsehen, was Sie gefunden haben.“
- Hub-Tutorial: Die Quelle ist jetzt der **Pausenplatz** (`systems.md` §5): E (niedriger Hinweis „Pause an der Quelle“) öffnet die Kacheln **Chronik** (in der Bussole), **Handy** (Nachrichten, Album, Karte und Kapitelwahl), **Mauerkante** (das frühere Regal: gefundene Dinge), **Mauernische** (die frühere Schublade), **Stufe** (Rasten, Speichern). Ziel: „Öffne die Chronik.“ → `clue.p.seite_eins` liegt im Deckel (unverändert: „Was der Hof schuldig blieb“, Laubs „Fortgesetzt Nov. 1840. Nicht vollendet.“).

### t15 – Laubs Bitte (Kapitelende)

- `laub.t.ende`: „Der Hof hat Schulden, die keiner aufgeschrieben hat. Fast keiner. Ich will die Seiten. Und Sie wollen wissen, was mit dem Schloss war. Das trifft sich. Hand ins Wasser, wenn Sie bereit sind.“
→ `unlock k1`. K1 beginnt mit `k1_0` (Hand ins Wasser, heute, derselbe Nachmittag; §11).

---

## 2. Orte und Trigger

| id | Ort | Bezug | x | z | r (m) | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.p.treffpunkt` | Wanderparkplatz am Waldrand (Treffpunkt) | OSM node 778169747; Infotafel 5768687206 | 522 | −766 | 12 | heute | Kapitel-Checkpoint (524/−770, prüfen); t1/t2 |
| `loc.p.hof` | Richtung des alten Baumagazins (Adresse Karlsberger Hof 1) | OSM way 279751239 | 519 | −813 | – | heute | nur Zeigerichtung für Gerold; **kein Mesh** (Q2) |
| `loc.p.abzweig` | Abzweig des Feldwegs | OSM 29272437 / 1319570396 | 515 | −730 | 8 | heute | Gruppe setzt sich in Bewegung |
| `loc.p.felsen_ein` | Einstieg Felsenpfad | Ende von 29272437 = Beginn 32707898 | 623,5 | −486 | 10 | heute | Gruppen-Wegpunkt |
| `loc.p.wind` | Wind und Hunde | Felsenpfad, Hang | 650 (bzw. 700) | −540 (bzw. −640) | 12 | heute | t5 (Lage prüfen, nach Station 2) |
| `loc.p.felsen` | Felsen an der Holzbrücke | Brücke 283882237, Fels 283882238 | 683 | −596 | 10 | heute | Station 2 |
| `loc.p.reh` | Gebüsch SO des Felsenpfads | OSM 288047167 (Näherung) | 817 | −704 | 40 | heute | t6 Reh-Szene (prüfen) |
| `loc.p.felsen_aus` | Ende Felsenpfad, Westende Damm | 283882236; Wegweiser 5443496505 | 837 | −840 | 8 | heute | Gruppen-Wegpunkt |
| `loc.p.marlene` | Marlenes Messpunkt auf dem Damm | Damm TF-22, LiDAR KB-42 | 826 | −866 | 6 | heute | Marlene (NPC, prüfen) |
| `loc.p.mauerrest` | Mauerrest am Weiher | POI r03-03 (OSM 8859603676) | 813 | −903 | 15 | heute | Relief 2 → `clue.p.mauerrest` |
| `loc.p.weiher` | Nordufer, Bänke | OSM 5762379226/-27; Weiher rel. 17145701 | 898 | −840 | 10 | heute | Station 3 |
| `loc.p.quelle` | Karlsbergquelle (Pausenplatz) | OSM 368031320; `cx.41` | 1061 | −834,5 | 12 (Hub), 7 (Trog) | alle | Station 4, t10 Bussole, Berührung, Aufwachort, Hub |
| `loc.p.training` | Wiese unter der Brunnenstube | – | 1030 | −852 | 18 | 1789-07 | t12 (prüfen) |
| `loc.p.plateau` | Plateau (Ehrenhof-Lichtung heute) | TF-01, LiDAR KB-01 | 1216 | −1114 | 35 | heute | Ziel der Gruppe; Fest (`06-enden.md`) |

Gesamtweg Treffpunkt → Quelle ≈ 1,14 km, +30 m (`tour-route-research` §Walking legs). Bei Gehtempo 3,2 m/s (`STANCES.stand.speed`) ≈ 6 min reine Gehzeit.

---

## 3. Fotoziele (Heute)

Ein **gutes Foto** = Ziel im mittleren Drittel, ≥ Mindestgröße im Bild, nicht verdeckt (Strahltest), Mindestabstand eingehalten (Tiere). Die Prüfung ist rein geometrisch (`systems.md` §1). Fotos in der Vergangenheit: „Kein Netz“, das Bild wird weiß (§8).

| id | Motiv | Ort (x/z) | Bedingung | Belohnung |
| --- | --- | --- | --- | --- |
| `photo.p.blatt` | goldenes Buchenblatt im Gegenlicht | überall auf t3 | Sonne im Bild | Album; t3-Tutorial |
| `photo.p.sandstein` | Buntsandstein am Felsenpfad | 694/−599 | ≥ 25 % Fläche | Album; Fotokarte `cx.T2`-Zusatz (ohne XP) |
| `photo.p.reh` | Ricke und Kitz | 817/−704 (wandert) | ≤ 14 m (Fallback 22 m), beide im Bild | **`cx.T4`** (Quest `q.p.reh`) |
| `photo.p.insel` | die Insel im Weiher | 891/−869 | ganz im Bild | Album |
| `photo.p.tafel` | Infotafel an der Quelle (unser Text) | 1063,5/−839,5 | Text lesbar (≤ 4 m) | Album; Fotokarte „Was auf der Tafel steht“ (unser Text = `cx.41` kurz) |
| `photo.p.stab` | Marlenes Stativ am Damm | 826/−866 | Marlene im Bild | Album; Marlene-Zeile |
| `photo.p.diane_bijou` | Josts Hunde | wandert | beide Hunde im Bild | Album; Jost-Zeile „Die sind fotogener als ich.“ |

Später im Heute (offen nach dem Prolog, ohne XP, Album und Fotokarten): Orangerie-Stützmauer, Ehrenhof-Lichtung, Eiskeller-Grube, Bärenzwinger-Rund, Hohlweg, Kohlplatte. Wer die heutige Gruppe fotografiert, findet das Bild später neben der 1789-Begegnung im Album wieder („Kommt dir bekannt vor?“, §6).

---

## 4. Dialog-Skizzen: Laub

- `laub.t.intro` (t10, die Nadel zittert): „Nicht fallen lassen. Ich bin schon einmal gefallen, das genügt.
  Laub, Quirin, königlich bayerischer Geometer, abgeordnet zur Landesaufnahme im Rheinkreis. Seit November 1840 verwaltungstechnisch verschollen. Meine letzten Tagegelder hat man mir übrigens nie ausgezahlt.
  Sie haben mich aus dem Wasser gezogen. Danke. Es war kalt, und es war lang.“
- `laub.t.intro2`: „Sie sind keine Vermesserin, kein Vermesser. Sie haben ein Telefon und Turnschuhe. Gut. Dann sind wir zu zweit, und ich bin der Kleinere.“
- `laub.t.quelle`: „Hören Sie das? Nein, natürlich nicht. Das Wasser. Es erinnert sich an etwas.“
- `laub.t.trog`: „Halten Sie die Hand hinein. Nein, das ist nicht hygienisch. Tun Sie es trotzdem.“
- `laub.t.gruppe` (wenn man nach der Gruppe schaut): „Ihre Gesellschaft ist schon oben. Die laufen nicht weg. Das Schloss schon, seit zweihundert Jahren.“
- „Fünf Meter dreißig. Für Orangen.“ zieht in K1 `k1_0b` um (Weg an der Orangerie vorbei, 1789: „Fünf Meter dreißig hoch, diese Mauer. Für Orangen. Im Laserscan sieht man sie auch noch.“).

---

## 5. Marlenes optionale Aufträge (Messen)

Marlene ist **Försterin im Forstamt** (FIKTION) und misst den Laserscan im Gelände nach. Ihre Aufträge sind **freiwillig**: während der Führung (wer trödelt, verliert die Gruppe nicht, sie wartet an der nächsten Station) und **später im Heute** (jede Rückkehr an die Quelle). Sie stehen in `00-prolog.quests.json` (für das EP-Budget gezählt, §7) und bleiben in jedem Kapitel offen (die Regel `quests/index.ts:305–307` gilt weiter, Begründung neu: „die Quelle besucht man in jedem Kapitel“). IDs bleiben erhalten (Spielstände).

| Id (bleibt) | Titel neu | Angebot | Ziele | Kampf | EP | Codex |
| --- | --- | --- | --- | --- | --- | --- |
| `q.p.relief` | „Was der Wald verbirgt“ | Marlene, nach `q.p.marlene` | Damm mit Relief (819/−875); Orangerie-Stufe mit Relief 3 (1237/−966) | – | 25 | rm.08, cx.40 |
| `q.p.meiler` | „Kohlplatten“ | Marlene, nach `q.p.marlene` | 3 Kohlplatten mit Relief finden (eine bei 1040/−902) | – | 25 | rm.03 |
| `q.p.bussole` | „Der Grundriss im Wald“ (früher „Die Bussole spricht“) | Marlene, erst nach dem Prolog (Flag `tour.done`) | Ehrenhof (1216/−1114), Kartenvergleich M (50 m Versatz, `laub.p.versatz` bleibt), Hohlweg (1172/−1238), Eiskeller (1508/−1296) | – (die vier Nebelinge entfallen) | 30 | cx.01, rm.01, cx.33, rm.04, rm.02 |
| `q.p.trichter` | „Nicht anfassen“ | Marlene, nach `q.p.bussole` | Bombentrichter finden, nicht berühren, Marlene per Handy melden | – | 20 | rm.06 (cx.35 schon im Hauptweg) |
| `q.p.punktwolke` | „Spuren in der Punktwolke“ | Marlene (Handy), nach `tour.done` | Punktwolke ansehen (Ehrenhof); Haltung `flag.p_spuren` | – (der Streuner entfällt) | 25 | cx.36 |
| `q.p.irrlichter` | „Lichter am Weiher“ | **Laub**, nach dem Training (Bannlicht gelernt), Heute ab Look `dusk` | 3 Irrlichter über dem Weiher bannen (820/−869) | irrlicht ×3 | 25 | (rm.08 schon gezählt) |
| `q.p.feldstation` | **entfällt** (ersetzt durch `q.p.marlene`) | – | – | – | – | – |

Marlenes Messstab-Faden: Sie leiht dir den Stab in t7 und will ihn auf dem Plateau zurück. Beim Fest gibst du ihn ab (alle Enden; `06-enden.md` §1).

---

## 6. Die Doppelgänger in der Gruppe

Sieben der 15 sind heutige Menschen, die ihren Figuren von 1789 ähneln (Namen, Berufe, Erkennungszeichen in `08-stimmen.md` §2). Der Spieler erkennt sie in 1789 wieder, das Spiel sagt es nie laut. Mittel:
- **Gleiche Silhouette, andere Zeit:** Haltung, Größe, Haar; die Charaktere kommen aus derselben Blender-Pipeline (CC0-Basis), heute `look: solid`, modern gekleidet.
- **Ein Satz, der zurückkommt:** Herr Soll zählt „… vierzehn, fünfzehn. Stimmt.“ Kanzlist Soll in 1789: „Neunzehn, zwanzig … nein. Noch einmal.“
- **Album:** Wer den Doppelgänger heute fotografiert hat, sieht beim ersten Gespräch mit der Figur in 1789 ein kleines Album-Signal „Kommt dir bekannt vor?“ (das alte Foto neben einem leeren Rahmen; in 1789 gibt es kein Bild).
- Laub merkt es (einmal pro Figur, höchstens drei im ganzen Spiel): „Sie schauen den Mann an, als kennten Sie ihn. Das ist unhöflich. Und interessant.“
- **Schluss:** beim Fest stehen alle als heutige Menschen da (`06-enden.md`).

Tabu: Kein Doppelgänger ist Witzfigur. Matthes hat keinen Doppelgänger (er ist tot, man spielt nicht mit ihm). Der Herzog ist in 1789 weiterhin nur zu hören; sein Doppelgänger ist heute ein freundlicher älterer Herr.

---

## 7. EP-Budget (Prolog endet auf Stufe 3)

Stufe 3 = 400 EP, Stufe 4 = 750 EP (`LEVEL_XP`). `tests/quests-content-a.test.ts` zählt alle Quests der Datei (Haupt und Neben), Kills und einmalige Codex-Fakten (10 EP, `CODEX_XP`). Die Führung hat keine Kills; die EP kommen aus den Stationen (Codex), den Hauptquests und dem Training.

| Quest | Art | EP | Kills | Codex (neu, je 10) | Summe |
| --- | --- | --- | --- | --- | --- |
| `q.p.fuehrung` „Die Führung“ (Stationen 1–4) | Haupt | 110 | – | cx.T1, cx.T2, cx.T3, cx.41, cx.03 | 160 |
| `q.p.marlene` „Das Forstamt misst“ | Haupt | 30 | – | cx.34, cx.35, rm.07 | 60 |
| `q.p.reh` „Ganz leise“ | Haupt | 50 | – | cx.T4 | 60 |
| `q.p.quelle` „Wasser, das sich erinnert“ (Bussole, Berührung) | Haupt | 50 | – | cx.42 | 60 |
| `q.p.training` „Ein Stab und eine Laterne“ (1789) | Haupt | 40 | nebelling ×3 (24), mahnbrief ×2 (12) | cx.38 | 86 |
| **Hauptweg** | | **280** | **36** | **11 Karten = 110** | **426 → Stufe 3** ✓ |
| `q.p.relief` | Neben | 25 | – | rm.08, cx.40 | 45 |
| `q.p.meiler` | Neben | 25 | – | rm.03 | 35 |
| `q.p.bussole` | Neben | 30 | – | cx.01, rm.01, cx.33, rm.04, rm.02 | 80 |
| `q.p.trichter` | Neben | 20 | – | rm.06 | 30 |
| `q.p.punktwolke` | Neben | 25 | – | cx.36 | 35 |
| `q.p.irrlichter` | Neben | 25 | irrlicht ×3 (36) | – | 61 |
| **Alles** | | | | | **712 → Stufe 3** ✓ (38 EP Luft bis 750; heute 4) |

Regeln: Fotokarten außerhalb von Quests geben **keine** EP (Album-Belohnung, kosmetisch), damit das Budget nicht kippt. Die Reliefmuster-Karten des Handbuchs (Marlenes App, `clue.p.handbuch`) werden wie bisher zur Laufzeit gewährt; `rm.05` (einzige nicht von Quests gezählte) kostet höchstens 10 EP. `cx.03` (Karl II. August) wandert aus `q.p.punktwolke` in Station 1. Die Zahlen sind Startwerte; das Gate ist der Test.

---

## 8. Running Gag: kein Netz

- In jeder Vergangenheit zeigt das Handy oben „Kein Netz“. Die Kamera öffnet, das Foto wird weiß. Laub kommentiert höchstens einmal pro Kapitel (`laub.bark.netz.*`, `08-stimmen.md` §1.3).
- Im Heute kommen die Nachrichten an, oft gebündelt („3 neue Nachrichten“): Gerold, Marlene, Herr Soll in der Gruppen-Nachricht „Kuchenkasse: bitte 4,50 €“. Sie zeigen, wie wenig Zeit im Heute vergeht (§9).

---

## 9. Die Zeit im Heute: „die Pause“

Die ganze Zeitreise des Spiels liegt in der Pause an der Quelle. Wer ins Heute zurückkehrt, findet denselben Nachmittag ein paar Minuten später.
- **Look-Leiter** (neue Looks für `lookFor()`, `story/index.ts:129–169`): `tour` (Prolog, 14:30–15:15, goldenes Gegenlicht) → `pause` (K1/K2, 15:20–15:45, Sonne tiefer) → `spaet` (K3, ≈ 16:00, erstes Blau im Schatten) → `dusk` (K4 und Enden, ≈ 16:45, Dämmerung, Lichterketten oben sichtbar). Mitte November geht die Sonne in Homburg kurz vor 17 Uhr unter (Größenordnung, nicht als FAKT im Spiel).
- **Handy-Uhr** zeigt die Zeit (14:31 beim Start, 16:52 beim Fest).
- Folge für K1–K4: Alle heutigen Beats mit „Morgen“, „Abend“, „Nacht“ oder Marlene mit Brötchen werden umgeschrieben (`impact.md` WP-12). Marlenes Kapitel-Zeilen kommen persönlich oder aufs Handy, nicht mehr per Funk.

---

## 10. Alte Spielstände (Migration)

- Story-Datei bekommt `"migrate": { "p1": "t1", "p2": "t1", "p3": "t1", "p3q": "t14", "p3r": "t14", "p4": "t14", "p5": "t14", "p6": "t14", "p7": "t14", "p8": "t14", "p9": "t14", "p9b": "t14", "p10": "t14", "p11": "t15" }` (Engine: `engine.resume` liest das vor `beat()`, statt still nichts zu tun).
- Wer bei `t14/t15` landet, bekommt beim Laden, was die Führung gibt, falls es fehlt: Relief 1–3, Kartograf 1, `item.bussole`, `story.compass`, `story.laub`, `item.stab.esche`, Flag `tour.done`, Flag `training.done` (der alte Prolog hat den Kampf schon gelehrt). EP werden nicht neu vergeben und nicht abgezogen.
- Quests: `q.p.feldstation` → still abgeschlossen. Behaltene IDs (`relief`, `meiler`, `trichter`, `irrlichter`, `bussole`, `punktwolke`, `quelle`) behalten „erledigt“; laufende mit geänderten Zielen werden auf „angeboten“ zurückgesetzt.
- POI-Routen: `p-hang`, `p-garten`, `p-weiher` bleiben **in Reihenfolge** in `travel/pois.ts` (sonst verschieben sich gespeicherte `poi.<route>.<n>`); die neue Route `p-fuehrung` wird **hinten angehängt**. Alte Routen dürfen ausgeblendet, aber nicht gelöscht werden.
- Ein Stand an der alten Feldstation (760/−915) wird beim Laden an die Quelle gesetzt (1059,3/−833,1, Blick 50), wie heute schon `k1_0`-Stände.

---

## 11. Übergabe an Kapitel 1

- K1 `k1_0` bleibt der Einstieg: heute, an der Quelle, **derselbe Nachmittag** (Look `pause` statt `dawn`), E „Wasser berühren“ → 1789. Marlenes Funkzeile („Die Brötchen liegen auf der Stufe“) wird eine Handy-Nachricht von Gerold („Kuchen ist angeschnitten. Wir heben dir ein Stück auf.“). Laubs Satz vom eingetrockneten Tropfen bleibt (`cx.42`).
- `k1_0b` (der Weg hinauf in 1789) und die Verkleidung (IDEAS-ROUND11 §2: Liese, Rock, Brief, Gitter) bleiben, wie sie sind. Änderung: Der Spieler ist kein Vermesser in Warnweste mehr, sondern Besucher in einer leuchtenden Outdoorjacke. „In Orange“ und Lieses „Feuersalamander“ bleiben als Witz: Der Owner-Avatar trägt eine helle Outdoorjacke in Orange oder Rot. (entschieden, Q13: helle Outdoorjacke in Orange oder Rot; Kostüm kq-characters, WP-13).
- **Keine Doppelung:** Das Training (t12) lehrt Hieb, Ausweichen, Wuchthieb, Bannlicht. K1 lehrt nichts davon neu. Die Mahnbriefe in Lieses Wäsche (`q.k1.kleider`, Weg „verdienen“) sind die erste **Anwendung**, nicht ein zweites Tutorial. Jost (1.5) lehrt weiter Verstecken vor der Meute (C/X/L/Wasser/Hohlweg/Sandstein), die erste Meute kommt in 1.10. Der alte p9b-Streuner und die drei Hunde aus p9b entfallen ersatzlos (K1 hat beides).
- Das Schleichen der Rehszene (C, langsam) ist die Grundlage für Josts Lektion; Jost greift es auf: „Du kannst ja schon schleichen. Wer hat dir das beigebracht? Ein Reh?“
