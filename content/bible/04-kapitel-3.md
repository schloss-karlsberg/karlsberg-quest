# Kapitel 3 „Die Nacht“

> **Action-RPG-Umbau (2026-11, docs/ACTION-RPG.md §11.3).** Das Kapitel ist jetzt eine Kette von Aufträgen statt einer Fallseite. Hauptaufträge: `q.k3.nachmittag` (Laub → Hanne: Stroh-Echo, der Lehnstuhl, fünf **Raffschatten** mit Hannes Korb; ihre Frage schreibt `flag.k3_pluenderer`), `q.k3.buch` (Soll: Waffensammlung, Naturalienkabinett, Galerie, Falltür, das graue Buch, **die eine Seite** als Sammelstück; Baumeister 1+2), `q.k3.strohmann` (Dämmerung: das Stroh der hundert Wagen steht als **Strohmann** auf, *danach* die Fackel), `q.k3.festsaal` (Glutlinge auf der Prunktreppe, nie im Festsaal; die W5-Wahl gibt den Gegenstand als Talisman; Abgabe bei Hanne an der Pforte), `q.k3.hunde` (Streuner, Zwinger, Jost kerbt den Stab: **Messstab IV**, Röntgenblick). Nebenaufträge: `q.k3.lehnstuhl` (Peter trägt einen der 104 Stühle für seine Mutter; Begleitung zum Hoftor), `q.k3.kabinett` (Solls Etiketten), `q.k3.jaguar` (beruhigen mit Licht, nie schlagen). Raffschatten sind Gier mit Schultern, keine Menschen: Laub sagt es. Keine Pinnwand, kein Ausfüllen; das Kapitel endet mit dem Gegenstand auf dem Tisch. Die Abschnitte unten beschreiben Ton und Fakten; Fallseite und Hinweisleiter liegen nicht mehr auf dem Weg des Spielers.

| | |
| --- | --- |
| Ära | `1793-07`: Sonntag, 28. Juli 1793. Teil A Nachmittag (Plünderung), Teil B Abend und Nacht (Brand) |
| Dauer | 30–35 min |
| Anker | Ehrenhof 1793-07 (1192/−1115). Ab Teil B zusätzlich: Holländische Gärtnerei (1221/−1296), außerhalb der Brandzone |
| Ölvorrat | Teil A 7 min. Teil B: Die Laterne braucht man nicht, das Feuer gibt Licht. Statt des Öls zählt der **Rauch** (siehe Abschnitt 9) |
| Ziel | Herausfinden, was mit dem Schloss und seinen Sammlungen geschah, die Chronik in ihrem Versteck finden, einen einzigen Gegenstand retten und lebend aus dem Feuer kommen |
| Ende | Fallseite „Die Nacht“ ganz bestätigt (alle 9 FAKT) → Kapitel 4 offen |

**Ton.** Teil A ist laut und verwirrend: Soldaten, Leute aus den Dörfern, Karren, Gelächter, zerbrochenes Glas. Niemand ist hier nur Täter oder nur Opfer. Teil B ist das Feuer: Hitze, Knacken, Glas, das springt, Rauch unter den Decken. **Keine Toten, keine Verletzten im Bild.** Es sind keine Opfer des Brandes überliefert, also gibt es im Spiel auch keine. Die Komik liegt bei der Pracht: 104 vergoldete Lehnstühle werden einzeln durch den Ehrenhof getragen.

**Was belegt ist.** Datum (Horstmann, nach M1910 S. 461 Anm. 39; Wochentag Sonntag nach Remling über SCHWAN12), Stroh „bis von Lothringen“, Gemächer „zu ebener Erde“, der Kommissär „im Namen der Nation mit brennender Fackel“, „Ça ira“ (M1910 S. 461). Freigabe zur Plünderung, auch für Dorfbewohner, bis zu 100 Wagen Stroh aus der Gegend von Metz, vor allem Residenz und Fachwerkbauten zerstört (WP-SK, EN-KC). Die gepackten und abbestellten Kisten des Naturalienkabinetts (M1910 S. 437, 454 f.). Die leere Galerie, ihr Damast, ihre Lüster und Lehnstühle (M1910 S. 374 f.). Die geheime Falltür aus der Galerie in die Werkstatt des Büchsenmachers (M1910 S. 431). Türgriff, Dukat und Uhr (Ausstellung „Steinerne Macht“ 2018, RP18). **Mannlich war beim Brand nicht dabei.** Er beschreibt ihn nach Berichten, und das Spiel sagt das auch.

---

## 1. Ablauf

### Teil A – Der Nachmittag

**3.0 – Feldstation.** Marlene erzählt von einer Ausstellung in Saarbrücken (`marlene.k3.ausstellung`): ein Türgriff, ein Dukat, eine Uhr, das ist alles, was man von drinnen noch hat. Laub wird gesprächig, wie immer, wenn er Angst hat (`laub.k3.start`).

**3.1 – Der Ehrenhof.** Wechsel. Sommer, später Nachmittag, Staub. Im Hof stehen Karren voller Stroh, Soldaten in blauen Röcken laden ab und tragen Bündel ins Erdgeschoss. Echo `echo.k3.stroh`. Durch das Gitter strömen Leute aus den Dörfern mit Körben und Säcken. Ein Mann trägt einen vergoldeten Lehnstuhl auf dem Kopf (`clue.k3.lehnstuhl`).

**3.2 – Der Küchenhof.** Zwischen Nordflügel, Küchenbau und Galerie. Hier wird geplündert: Kupferkessel, Vorhänge, Fensterblei. Echo `echo.k3.kuechenhof`. **Hanne** ist auch da, mit einem leeren Korb (`hanne.k3.*`). Ein Junge hält einen Spiegel und sieht sich darin zum ersten Mal ganz.

**3.3 – Die Registratur.** Die Regale sind leer. **Soll** sitzt auf dem Boden zwischen losen Blättern und zählt, was fehlt (`soll.k3.*`). Er sagt, wo das graue Buch liegt: unter dem Boden der Galerie, bei der Falltür des Büchsenmachers. Wenn `flag.k2_versteck_gesehen` gesetzt ist, sagt Laub: „Wissen wir.“ und Soll ist beleidigt.

**3.4 – Der Sammlungsflügel.** Durch die Durchfahrt in den Westflügel. Im Erdgeschoss die **Waffensammlung**: leere Haken, leere Gestelle, Staubränder (FAKT: Mannlich ließ die Waffensammlung fortbringen). Die Treppe hinauf (Treppenhaus Nord). Im Obergeschoss das **Naturalienkabinett**: weiße Glasschränke, zur Hälfte leer, und in der Mitte Kisten, gepackt, vernagelt, beschriftet (`clue.k3.kisten`). Auf einem Pult liegt Holandres Vogelkatalog (`clue.k3.holandre`). E halten: `echo.k3.koenig`.

**3.5 – Die Galerie (Wow W6).** Vom Treppenabsatz durch den Vorraum in die Galerie. Ein sehr langer Raum, grüner Damast mit Arabesken, darauf hellere Rechtecke, wo Bilder hingen. Die Lüster sind fort, nur die Haken hängen noch. Deine Schritte hallen. E halten: `echo.k3.galerie` (Mannlichs Beschreibung). R (Messen, Kartograf 3): Länge der Galerie messen (`clue.k3.messen`).
Am Westende, nahe beim Vorraum, ist ein Brett im Parkett lose (`clue.k3.falltuer`). Darunter liegt das graue Buch. **Wenn man es berührt**, schlagen die Seiten auf, lösen sich und fliegen wie Asche durch die Galerie, zu den Fenstern hinaus, in die Dämmerung. Eine einzige Seite bleibt liegen: die Fallseite dieses Kapitels (`clue.k3.chronik`). Laub sagt sehr leise: „So war das also.“

**3.6 – Das Tempelzimmer.** Am Ostende der Galerie: ein runder Raum, Marmor und Granit aus bemaltem Papier, Säulen mit ionischen Kapitellen, große Glastüren, drei Stufen in den Garten (FAKT nach SCHWAN12). Laub klopft an eine Säule (`clue.k3.papier`). Das ist der Notausgang für Teil B.

### Teil B – Der Abend

**3.7 – Die Fackel.** Teil B beginnt, wenn der Spieler im Ehrenhof beim Kommissär E hält. Das geht, sobald er mindestens sechs Substantive dieses Kapitels gefunden hat (oder nach dem ersten Bestätigen). Kein Zeitdruck, bis der Spieler bereit ist. Echo `echo.k3.fackel`: Der Kommissär hebt die Fackel, „im Namen der Nation“, und die Menge singt „Ça ira“. Die Fackel fliegt durch ein offenes Fenster ins Erdgeschoss.

**3.8 – Das Feuer.** Der Spieler ist im Ehrenhof oder geht hinein. Das Feuer läuft nach einem Zeitplan durch die Räume (Abschnitt 9). Ziel ist der **Festsaal** im Obergeschoss des Corps de logis, über die Prunktreppe, solange sie noch begehbar ist (Laub: „Hinauf. Jetzt, nicht gleich.“).

**3.9 – Der Festsaal (Wow W5).** Die Wände sind halb leer: Wo Täfelungen schon abgenommen und fortgebracht wurden, sind hellere Flächen (FAKT: Mannlich ließ auch Wandverkleidungen retten). Rauch unter der Decke, der letzte Kronleuchter klirrt. Hanne steht in der Mitte mit einem Türgriff in der Hand. Drei Dinge sind zu retten, und man kann nur **eines** tragen (`clue.k3.retten`, `flag.k3_objekt`):
- den **Türgriff** aus Hannes Hand („Der war an der Tür zum Saal. Matthes hat die Wand drumrum gemacht.“),
- einen **Dukaten** mit dem Bild des Schlosses, der im Fensterbrett liegt,
- eine **vergoldete Uhr mit Alabaster** auf einer Konsole, die noch tickt.
Nach der Wahl sagt Hanne „Raus jetzt“ und geht voran. **Hanne kommt in jedem Fall heil hinaus**, auch wenn der Spieler nichts nimmt. Nach 40 s ohne Wahl nimmt sie dich am Arm, und du hast nichts gerettet (`flag.k3_objekt = nichts`). Das ist kein Scheitern.

**3.10 – Hinaus.** Die Prunktreppe brennt. Wege hinaus: (a) die Dienertreppe Süd, schmal, voller Rauch, 15 s; (b) durch den Durchgang zum Nordflügel, das Obergeschoss des Herzogsflügels, Treppenhaus West; (c) für wer schon in Teil A dort war: zurück durch die Galerie bis zum Tempelzimmer und durch die Glastüren in den Garten. (c) ist der längste und sicherste Weg, die Galerie brennt als Letztes (Fachwerk, aber weit vom Stroh).

**3.11 – Der Garten.** Draußen ist es taghell vom Feuer. Die Meute ist da, angelockt vom Lärm. Im Feuerschein ist deine Laterne nur ein Licht unter vielen, die Hunde jagen jetzt nach **Gehör** (Abschnitt 9). Ziel: die ummauerte Holländische Gärtnerei, dann weiter nach Norden zum Zwinger.

**3.12 – Der Zwinger.** Jost reißt die Gittertüren auf. Echte Hunde, nicht aus Rauch, laufen an dir vorbei in die Nacht (`jost.k3.*`). Jost nimmt das Horn vom Haken im Zwingerhaus und rennt ihnen nach. Laub sagt nichts.

**3.13 – Feldstation, Cliffhanger.** Wenn die Seite ganz bestätigt ist: Die Bussole riecht nach kaltem Rauch. Laub (`laub.k3.ende`): „Danach kommt nicht mehr viel. Danach kommen nur die Karren. Ich muss Ihnen etwas sagen, aber nicht heute.“

---

## 2. Orte und Trigger

| id | Ort | Bezug | x | z | r | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.k3.ehrenhof` | Ehrenhof mit Strohkarren, Kommissär | TF-01, KB-B39 | 1210 | −1114 | 35 | 1793-07 | Anker; `echo.k3.stroh`; Kommissär (1225/−1118, r 4) startet Teil B |
| `loc.k3.kuechenhof` | Küchenhof | TF-02 | 1212 | −1180 | 25 | 1793-07 | `echo.k3.kuechenhof`, Hanne |
| `loc.k3.registratur` | Registratur, leer | B03.1.eg-registratur | 1202 | −1153 | Raumpolygon | 1793-07 | Soll |
| `loc.k3.durchfahrt` | Durchfahrt im Sammlungsflügel | B04.1.eg-durchfahrt | 1191 | −1162 | Raumpolygon | 1793-07 | Weg |
| `loc.k3.waffen` | Waffensammlung, leer | B04.1.eg-waffensammlung | 1185 | −1197 | Raumpolygon | 1793-07 | `clue.k3.waffen` |
| `loc.k3.treppe_nord` | Treppenhaus Nord, Absatz auf Galerieniveau | B04.1.eg-treppe-nord | 1183 | −1209 | Raumpolygon | 1793-07 | Weg; Absatz auf 347,6 m (Galerieboden) |
| `loc.k3.naturalien` | Naturalienkabinett mit Kisten | B04.2.og-naturalienkabinett | 1189 | −1178 | Raumpolygon | 1793-07 | `clue.k3.kisten`, `clue.k3.holandre`, `echo.k3.koenig` |
| `loc.k3.vorraum` | Vorraum der Galerie | B06.1.vorraum-west | 1194 | −1214 | Raumpolygon | 1793-07 | Weg |
| `loc.k3.galerie` | Bildergalerie, leer | B06.1.bildergalerie | 1230 | −1220 | Raumpolygon | 1793-07 | W6, `echo.k3.galerie`, Messen |
| `loc.k3.falltuer` | Loses Brett / Falltür am Westende der Galerie | B06.1.bildergalerie, darunter KB-B40 bzw. B04.1.eg-buechsenmacherei | 1200 | −1218 | 2 | 1793-07 | `clue.k3.falltuer`, `clue.k3.chronik` |
| `loc.k3.tempel` | Tempelzimmer am Ostende | B06.1.kabinett-ost (KB-B07 als Platzhalter für die Rotunde) | 1267 | −1226 | Raumpolygon | 1793-07 | `clue.k3.papier`; Notausgang Teil B (Glastüren 1272/−1228) |
| `loc.k3.prunktreppe` | Prunktreppenhaus | B01.1.eg-prunktreppe | 1261 | −1137 | Raumpolygon | 1793-07 | Weg zum Festsaal; brennt ab T+150 s |
| `loc.k3.festsaal` | Festsaal | B01.2.og-festsaal | 1266 | −1127 | Raumpolygon | 1793-07 | W5, Wahl des Gegenstands |
| `loc.k3.dienertreppe` | Dienertreppe Süd | B01.1.eg-dienertreppe-sued | 1260 | −1109 | Raumpolygon | 1793-07 | Fluchtweg (a) |
| `loc.k3.gaertnerei` | Holländische Gärtnerei | KB-B27 | 1221 | −1296 | 25 | 1793-07 | Anker B; sichere Zone |
| `loc.k3.zwinger` | Zwinger und Zwingerhaus | KB-B23, KB-B35 | 1216 | −1571 | 30 | 1793-07 | Jost, Ende des Kapitels |

**Hinweise für Engineers:**
- Die Falltür ist **FAKT** (M1910 S. 431). Ihr genauer Ort ist es nicht. Sie führte „aus der Bildergalerie in die Werkstätte des herzoglichen Büchsenmachers“. Der Katalog hat die Büchsenmacherei als Raum im EG des Sammlungsflügels (B04.1.eg-buechsenmacherei, 1188/−1184) und eine Waffenschmiede KB-B40 am Westende der Galerie (1189/−1227). Die Bibel legt die Falltür ans Westende der Galerie (1200/−1218), über KB-B40. Der Galerieboden liegt rund 2,8 m über dem Hof (347,6 m gegenüber 344,8 m), das passt.
- Die Galerie ist im Modell rund 80 m lang. Das Messen (R) muss diese Modelllänge liefern, nicht eine feste Zahl.

---

## 3. Hinweise (Clues)

**`clue.k3.marlene`** – Feldstation, Gespräch.
*Hört (Marlene):* „2018 war in Saarbrücken eine Ausstellung, ‚Steinerne Macht‘. Da lag vom Karlsberg fast nichts. Ein Türgriff, eine Uhr mit Alabaster, ein Dukat mit dem Schloss drauf, eine Pistole und ein Jagdmesser. Ein ganzes Schloss, und übrig bleibt ein Türgriff.“ [P nach RP18]
*Gibt:* keine Fallsubstantive. Bereitet die Wahl in 3.9 vor.

**`clue.k3.stroh`** – Ehrenhof, Echo `echo.k3.stroh`.
*Gibt:* `n.lothringen`, `n.metz`, `n.28_juli`, `n.dachstuhl`.

**`clue.k3.horstmann`** – Ehrenhof, Laub.
*Hört (Laub):* „Horstmann, unser Regierungsrat, schreibt den 28. Juli. Vier Tage vorher, am 24., haben sie Petersheim angezündet. Er notiert beides, als wäre es Wetter.“ [P nach M1910 S. 461 Anm. 39]
*Gibt:* bestätigt `n.28_juli`; `n.24_juli`.

**`clue.k3.lehnstuhl`** – Ehrenhof, der Mann mit dem Lehnstuhl.
*Sieht:* Ein vergoldeter Lehnstuhl mit grünem Damastbezug und Goldfransen auf dem Kopf eines Mannes, der barfuß geht.
*Hört (Laub):* „Einer von hundertvier aus der Galerie. Bleiben hundertdrei. Er wird darin sitzen, bis er hundert ist, und es wird der beste Stuhl im Dorf sein.“ [P nach M1910 S. 374]
*Gibt:* `n.dorfbewohner`.

**`clue.k3.kuechenhof`** – Küchenhof, Echo `echo.k3.kuechenhof`.
*Gibt:* `n.dorfbewohner`, `n.homburg`, `n.keller`, `n.mundkoch`, `n.freiheit`, `n.r_retteten`.

**`clue.k3.hanne`** – Küchenhof, Gespräch (siehe `hanne.k3.*`).
*Gibt:* `n.hofbediente`, `n.r_schuld`.

**`clue.k3.soll`** – Registratur, Gespräch (siehe `soll.k3.*`).
*Gibt:* `n.buechsenmacher`, `n.preussen`, `n.republik`, `n.r_stahlen`.

**`clue.k3.waffen`** – Waffensammlung.
*Sieht:* Leere Haken in Reihen, auf dem Boden die Abdrücke von Gewehrkolben im Staub, eine einzelne Schraube.
*Hört (Laub):* „Die Waffen hat Mannlich schon fortgebracht. Die Waffensammlung ist leer, das Naturalienkabinett nicht. Merken Sie sich, wer welche Zusage bekam.“
*Gibt:* keine Fallsubstantive.

**`clue.k3.kisten`** – Naturalienkabinett, Kisten.
*Sieht:* Zwölf große Kisten, vernagelt, mit Kreide beschriftet: „Naturalien-Cabinet. Nach Kaiserslautern.“ Darunter, mit anderer Kreide durchgestrichen und überschrieben: „Abbestellt.“ (Wortlaut FIKTION; Inhalt FAKT nach M1910 S. 454 f.: Die Wagen waren in Kaiserslautern bestellt, dann gab der Herzog Gegenbefehl.)
*Gibt:* `n.kaiserslautern`, `n.naturalienkabinett` (falls noch nicht aus Kap. 2).

**`clue.k3.holandre`** – Naturalienkabinett, Pult.
*Sieht:* „Catalogue des oiseaux … des Deux-Ponts, 1785“. Jemand hat am Rand gezählt: 1187. (FAKT: Holandre 1785, 1 187 Vögel, nach SCHWAN12 Anm. 30.)
*Hört (Laub):* „Tausendhundertsiebenundachtzig Vögel, jeder an seinen Zweig gebunden und geklebt. Mannlich sagt zwölfhundert Arten. Mannlich rundet gern auf.“ [P nach M1910 S. 437]
*Gibt:* keine Fallsubstantive.

**`clue.k3.koenig`** – Naturalienkabinett, Echo `echo.k3.koenig`.
*Gibt:* `n.koenig_preussen`, `n.kaiser`.

**`clue.k3.galerie`** – Galerie, Echo `echo.k3.galerie`.
*Gibt:* `n.hundert_fuss`, `n.fachwerk`.

**`clue.k3.messen`** – Galerie, Messen mit R von einem Ende zum anderen.
*Sieht:* Die Messlinie zeigt rund 80 m.
*Hört (Laub):* „Achtzig Meter. Hundert Fuß wären keine dreiunddreißig. Hundert Klafter wären fast zweihundert. Hundert Schritt, das kommt hin. Mannlich hat französisch geschrieben: ‚cent pas‘. Der Übersetzer von 1910 hat Fuß daraus gemacht.“ [P nach SCHWAN12 Anm. 47]
*Gibt:* `n.hundert_schritt`, `n.hundert_klafter`.

**`clue.k3.falltuer`** – Westende der Galerie, loses Brett.
*Sieht:* Ein Brett im Parkett, das nachgibt. Darunter eine Klappe mit Eisenring, darunter Dunkelheit und der Geruch von Öl und Eisen.
*Hört (Laub):* „Die Falltür in die Werkstatt des Büchsenmachers. Mannlich und ein alter Diener namens Burger haben hier die schönsten Bilder hinuntergetragen, am hellen Tag, in aller Stille, und hinter den leeren Schränken versteckt.“ [P nach M1910 S. 431 f.]
*Gibt:* bestätigt `n.buechsenmacher`.

**`clue.k3.chronik`** – unter dem Brett.
*Sieht:* Das graue Buch. Beim Berühren fliegen die Seiten davon. Eine bleibt: die Fallseite „Die Nacht“. Auf ihrer Rückseite in Solls Schrift: „Was der Hof schuldig blieb. Fortsetzung folgt nicht.“
*Gibt:* öffnet die Fallseite. Setzt `flag.k3_chronik_zerstreut`.

**`clue.k3.papier`** – Tempelzimmer, eine Säule.
*Sieht:* Marmor, der unter dem Fingerknöchel hohl klingt. Eine Ecke des Papiers hat sich gelöst.
*Hört (Laub):* „Papier. Marmor aus Papier, Granit aus Papier. Das ganze Zimmer wiegt weniger als ich.“ (FAKT: Papierimitation von Marmor und Granit ab 1789, SCHWAN12 nach dem Schadensetat.)
*Gibt:* keine Fallsubstantive. Sammlung „Wandernde Steine“: kein Stein, sondern ein Hinweis, dass hier nichts übrig bleiben wird.

**`clue.k3.fackel`** – Ehrenhof, Echo `echo.k3.fackel`.
*Gibt:* `n.nation`, `n.kommissaer`, `n.erdgeschoss`.

**`clue.k3.feuer`** – automatisch, sobald im Teil B das Obergeschoss brennt.
*Hört (Laub, hustend, obwohl er nicht atmen muss):* „Von unten nach oben. Erst das Stroh im Erdgeschoss, dann die Treppen, dann der Saal. Die gewölbte Küche brennt zuletzt. Gewölbe sind geduldig.“
*Gibt:* bestätigt `n.erdgeschoss`; `n.gewoelbe`.

**`clue.k3.festsaal`** – Festsaal, Laub beim Betreten.
*Hört (Laub):* „Der Festsaal. Hier oben liegt kein Stroh. Hier kommt das Feuer erst an, wenn unten nichts mehr übrig ist.“
*Gibt:* `n.festsaal`.

**`clue.k3.wirtschaft`** – Garten oder Gärtnerei, Blick nach Norden auf Marstall und Ställe.
*Hört (Laub):* „Die Wirtschaftsgebäude da drüben, Ställe, Remisen, die Kasernen: die stehen morgen noch fast alle. Was brennt, ist das, was schnell gebaut wurde.“ [P nach EN-KC]
*Gibt:* `n.wirtschaftsgebaeude`.

**`clue.k3.retten`** – Festsaal, die Wahl.
*Gibt:* `flag.k3_objekt` = tuergriff / dukat / uhr / nichts.

**`clue.k3.jost`** – Zwinger.
*Gibt:* keine Fallsubstantive. `n.r_alle` über Laubs Satz danach (`laub.k3.alle`).

---

## 4. Echos

**`echo.k3.stroh`** – Ehrenhof, automatisch. Erinnerung (Fiktion).
- SOLDAT 1 (wirft ein Bündel vom Karren): „Drei Tage von Metz hierher, mit Stroh! Wir hätten Wein fahren können.“ [P nach WP-SK: Stroh aus der Gegend von Metz]
- SOLDAT 2: „Lothringer Stroh brennt besser als Lothringer Wein.“
- SOLDAT 1: „Alles ins Erdgeschoss, sagt der Kommissär. Nicht unters Dach. Wenn's oben anfängt, geht's langsam.“
- SOLDAT 2: „Heut ist Sonntag. Am achtundzwanzigsten. Ich hätt mir einen anderen Sonntag gewünscht.“

**`echo.k3.kuechenhof`** – Küchenhof, E halten. Erinnerung (Fiktion). Mehrere Stimmen, keine Gesichter scharf.
- FRAU (mit Kupferkessel): „Freigegeben, hat der Offizier gesagt. Was frei ist, darf man nehmen.“ [P nach WP-SK und EN-KC: Freigabe zur Plünderung, auch für Dorfbewohner]
- MANN: „Wir sind aus Homburg, und die da aus dem Sanddorf. Die Keller sind schon leer, da waren die anderen schneller.“
- JUNGE (mit Spiegel): „Die Wohnung vom Mundkoch ist auch leer. Der hat seine Töpfe mitgenommen.“
- FRAU: „Besser bei uns als im Feuer.“
- EIN SOLDAT (im Vorbeigehen, lacht): „Freiheit, Bürger! Nimm, so viel du tragen kannst.“

**`echo.k3.koenig`** – Naturalienkabinett, E halten. Erinnerung (Fiktion) mit Zitat. Zwei Herren gehen schnell durch den Raum, ohne stehen zu bleiben. Man sieht nur ihre Rücken.
- MANNLICH (Stimme, ohne Figur): „Beim Durchschreiten der Gemächer des Schlosses bemerkten sie die reisefertigen Kisten mit unserem herrlichen Naturalienkabinett. Die Wagen, die sie fortschaffen sollten, waren bereits in Kaiserslautern bestellt; der König gab jedoch dem Herzog die bestimmtesten Versicherungen, daß die Franzosen den Karlsberg nicht mehr betreten würden, und dieser glaubte nun Gegenbefehl erteilen und unsere prachtvolle Sammlung den Zufällen der Ereignisse anheimstellen zu müssen.“ [Z M1910 S. 454 f.]
- LAUB (danach): „Der König von Preußen. Nicht der Kaiser, nicht der Herzog selbst. Ein König verspricht, und ein Herzog glaubt. Und die Vögel bleiben im Haus.“

**`echo.k3.galerie`** – Galerie, E halten. Erinnerung (Fiktion) mit Zitaten. Für die Dauer des Echos hängen die Bilder wieder. Ein Mann im Schlafrock geht mit einem Leuchter die Wand entlang und bleibt vor jedem Bild stehen.
- MANNLICH (Stimme): „Die Mauern waren mit Brettern verschalt, und diese mit grünem, von Arabesken durchzogenem Damast bespannt, der nach meinen Skizzen in Lyon angefertigt wurde. Zwanzig schöne Kristallüster hingen von der Decke hernieder.“ [Z M1910 S. 374]
- MANNLICH: „Hundertundvier Lehnstühle aus vergoldetem Holz, eine Art kurulischer Sessel, von dem gleichen Damast wie die Wände bezogen und mit Goldfransen behangen, bildeten die Einrichtung dieses geräumigen Saales, der, an hundert Fuß lang, in eine offene, durch eine Kolonnade abgeschlossene Rotunde auslief.“ [Z S. 374; zu „hundert Fuß“ siehe `clue.k3.messen`]
- MANNLICH: „Als man endlich so weit war, daß die Bilder angehängt werden konnten, verließ er kaum mehr den Saal, stand selbst während der Nacht drei- bis viermal auf und erschien im Schlafrock.“ [Z S. 374 f.]
- EIN HÖFLING (fern, aus einem anderen Jahr): „Obacht auf die Bilder!“ [Z S. 374]
- (Die Bilder verblassen. Der Mann im Schlafrock ist fort. Die Rechtecke bleiben.)
- LAUB: „Er hat die Galerie aus einem hölzernen Gang machen lassen. Bretter und Fachwerk, damit es schnell geht. Was schnell geht, brennt schnell.“ [P nach SCHWAN12: Die Galerie entstand 1788 aus einem hölzernen Verbindungsgang]

**`echo.k3.fackel`** – Ehrenhof, E halten beim Kommissär. Erinnerung (Fiktion) mit Zitat. Abenddämmerung. Eine dichte Menge. Ein Mann mit Schärpe und brennender Fackel auf einem Karren.
- MANNLICH (Stimme, ohne Figur; Untertitel: „Mannlich war nicht dabei. Er schreibt nach Berichten.“): „Man hatte bis von Lothringen Stroh herbeischleppen lassen, um damit alle seine Gemächer zu ebener Erde auszustopfen. Dann setzte es der Kommissär im Namen der Nation mit brennender Fackel in Flammen, unter dem Beifall einer tausendköpfigen Schar von Sansculottes und dem Gesange ihres schrecklichen: Ça ira!“ [Z M1910 S. 461]
- KOMMISSÄR: „Im Namen der Nation!“ [nach S. 461]
- MENGE (singt, französisch, Untertitel nur „Ça ira“): „Ah! ça ira, ça ira, ça ira …“ (Liedtext gemeinfrei, 1790)
- (Die Fackel fliegt. Ein Fenster im Erdgeschoss leuchtet auf, dann das nächste.)

---

## 5. Gesprochene Zeilen

**Hanne (Kapitel 3)**

- `hanne.k3.01`: „Gucken Sie nicht so. Ich nehm mir nur, was man uns schuldet. Fünf Jahre Zinsen auf einen Gulden.“ → gibt `n.r_schuld`
- `hanne.k3.02`: „Die vom Hof waren zuerst da. Die Hofbedienten wissen, wo das Silber stand. Wir kriegen die Vorhänge.“ → gibt `n.hofbediente`
- `hanne.k3.03`: „Peter ist jetzt zwölf. Er will Fuhrmann werden. Ich hab gesagt, dann fahr was Gescheites. Keine Steine.“
- `hanne.k3.04` (wenn man sie nach Matthes fragt): „Die Galerie da drüben, die Wand am Ende, das war er. Ob die steht, wenn's brennt? Steine brennen nicht. Sagt man.“
- `hanne.k3.05` (im Festsaal, mit dem Türgriff): „Der war an der Tür zum Saal. Matthes hat die Wand drumrum gemacht. Nimm, was du willst. Irgendwas soll übrig bleiben.“
- `hanne.k3.06` (nach der Wahl): „Raus jetzt.“
- `hanne.k3.07` (draußen, wenn man den Türgriff genommen hat): „Den behältst du. Ich hab die Wand im Kopf, das reicht mir.“
- `hanne.k3.08` (draußen, wenn man den Dukaten genommen hat): „Ein Dukat. Den hat der Bauer aus Rohrbach auch gekriegt. Hoffentlich.“
- `hanne.k3.09` (draußen, wenn man die Uhr genommen hat): „Die Uhr. Die geht noch. Die weiß nicht, was passiert ist.“
- `hanne.k3.10` (draußen, wenn man nichts genommen hat): „Nichts. Ist auch eine Antwort.“

**Gottlob Soll (Kapitel 3)**

- `soll.k3.01`: „Leer. Alles leer. Die Akten nach Mannheim, die Möbel nach Mannheim, die Bilder nach Mannheim. Mannheim muss sehr voll sein.“
- `soll.k3.02`: „Erst die Preußen, dann die Franzosen, dann wieder die Preußen. Alle haben etwas mitgenommen. Ich hab Buch geführt. Die preußischen Soldaten nehmen Uhren, die französischen nehmen Türen.“ → gibt `n.preussen`
- `soll.k3.03`: „Im März haben sie das Siegel der Republik an jede Tür geklebt. Ich habe gefragt, ob das Siegel auch auf die Löhne kommt. Man hat mich nicht verstanden.“ [P nach M1910 S. 431, 437: Türen versiegelt, „Siegel der Republik“] → gibt `n.republik`
- `soll.k3.04` (nach dem Buch gefragt): „Unter dem Boden der Galerie. Am Westende, wo der Büchsenmacher seine Falltür hat. Da hat Herr Mannlich die Bilder durchgetragen. Wo schon einmal etwas gerettet wurde, dachte ich, ist es vielleicht eine Gewohnheit.“ → gibt `n.buechsenmacher`
- `soll.k3.05` (wenn Laub „Wissen wir.“ sagt): „Ach. Wissen Sie. Natürlich. Die Herren von der Landesaufnahme wissen alles, nur nicht, wann man anklopft.“
- `soll.k3.06` (über die Plünderer): „Das ist Diebstahl, mit Verlaub. Auch wenn man den Diebstahl freigibt. Freigegebener Diebstahl ist immer noch Diebstahl, nur mit Stempel.“ → gibt `n.r_stahlen`
- `soll.k3.07` (Abschied): „Ich gehe jetzt. Ich habe alles aufgeschrieben, was der Hof schuldig blieb. Was das Land dem Hof schuldig bleibt, schreibt ein anderer.“

**Jost (Kapitel 3, jetzt 17)**

- `jost.k3.01` (am Zwinger, reißt die Gitter auf): „Raus! Lauft! Die Hunde verbrennen nicht. Nicht meine.“
- `jost.k3.02`: „Diane, du führst. Sultan, halt die Klappe und lauf. Bijou, das ist kein Hirsch, das ist Feuer!“
- `jost.k3.03` (zu dir): „Die finden den Weg allein. Bloß nicht zurück.“
- `jost.k3.04` (nimmt das Horn vom Haken): „Einer muss sie ja wieder heimholen.“ (Er rennt in die Nacht. Das Horn bläst einmal, weit weg, falsch und zu hoch.)

**Laub (Kapitel 3)**

- `laub.k3.start`: „Juli dreiundneunzig. Ich war nicht dabei. Ich bin erst vierzehn Jahre später geboren worden. Und trotzdem habe ich das Gefühl, ich sollte mich entschuldigen.“
- `laub.k3.ehrenhof`: „Das Stroh ist vom Feind, das Feuer ist vom Feind, und die Leute, die die Löffel heraustragen, sind von hier. Schreiben Sie das alles auf. Nicht nur das Bequeme.“
- `laub.k3.wissen` (bei Soll, wenn `flag.k2_versteck_gesehen`): „Wissen wir.“
- `laub.k3.galerie_leer` (beim Betreten der Galerie): „Hören Sie das? Das ist ein Raum, der für Bilder gebaut wurde und jetzt nur noch für Schritte da ist.“
- `laub.k3.chronik` (nach dem Zerfliegen der Seiten): „So war das also.“ (lange Pause) „Die Karren haben den Rest besorgt. Eine Seite hier, eine Seite dort. Ich habe 1840 eine davon gefunden. Im Graben. Fragen Sie mich nicht jetzt.“
- `laub.k3.hinauf` (Teil B): „Hinauf. Jetzt, nicht gleich.“
- `laub.k3.festsaal_wahl` (während der 40 s): „Eins. Nur eins. Nehmen Sie, was Sie tragen können, nicht, was am meisten wert ist.“
- `laub.k3.alle` (am Zwinger, nachdem Jost weg ist): „Die Franzosen, die Preußen, die Leute aus den Dörfern, der Hof selbst. Jeder hat etwas mitgenommen. Man könnte sagen, sie taten, was alle taten.“ → gibt `n.r_alle`
- `laub.k3.ende`: „Danach kommt nicht mehr viel. Danach kommen nur die Karren. Ich muss Ihnen etwas sagen, aber nicht heute.“

**Marlene (Kapitel 3)**

- `marlene.k3.morgen`: „Du siehst aus, als hättest du ein Feuer gelöscht. Hast du heut Nacht geträumt? Du hast im Schlaf ‚Obacht‘ gesagt.“
- `marlene.k3.ausstellung`: siehe `clue.k3.marlene`.
- `marlene.k3.abend` (nach der Rückkehr aus Teil B): „Du riechst nach Rauch. Hier hat niemand ein Feuer gemacht. Ich frag auch nicht.“ (Pause.) „Doch, ich frag. Morgen.“

---

## 6. Substantive

| id | Anzeige | Kategorie | gefunden in | verwendet als |
| --- | --- | --- | --- | --- |
| `n.28_juli` | 28. Juli | Wann | `clue.k3.stroh`, `clue.k3.horstmann` | richtig 3-1 |
| `n.24_juli` | 24. Juli | Wann | `clue.k3.horstmann` | Köder 3-1 |
| `n.9_februar` | 9. Februar | Wann | Kap. 2 | Köder 3-1 |
| `n.25_februar` | 25. Februar | Wann | Kap. 2 | Köder 3-1 |
| `n.lothringen` | Lothringen | Wo | `clue.k3.stroh` | richtig 3-2 |
| `n.metz` | Metz | Wo | `clue.k3.stroh` | auch richtig 3-2 |
| `n.kaiserslautern` | Kaiserslautern | Wo | `clue.k3.kisten` | Köder 3-2 |
| `n.mannheim` | Mannheim | Wo | Kap. 2 | Köder 3-2 |
| `n.homburg` | Homburg | Wo | `clue.k3.kuechenhof` | Köder 3-2 |
| `n.erdgeschoss` | Erdgeschoss | Wo | `clue.k3.fackel`, `clue.k3.feuer` | richtig 3-3 |
| `n.dachstuhl` | Dachstuhl | Wo | `clue.k3.stroh` | Köder 3-3 |
| `n.keller` | Keller | Wo | `clue.k3.kuechenhof` | Köder 3-3 |
| `n.festsaal` | Festsaal | Wo | `clue.k3.festsaal` | Köder 3-3 |
| `n.nation` | Nation | Was | `clue.k3.fackel` | richtig 3-4 |
| `n.republik` | Republik | Was | `clue.k3.soll` | Köder 3-4 |
| `n.freiheit` | Freiheit | Was | `clue.k3.kuechenhof` | Köder 3-4 |
| `n.dorfbewohner` | Dorfbewohner | Wer | `clue.k3.lehnstuhl`, `clue.k3.kuechenhof` | richtig 3-5 |
| `n.preussen` | preußischen Soldaten | Wer | `clue.k3.soll` | Köder 3-5 |
| `n.hofbediente` | Hofbedienten | Wer | `clue.k3.hanne` | Köder 3-5 |
| `n.naturalienkabinett` | Naturalienkabinett | Was | Kap. 2, `clue.k3.kisten` | richtig 3-6 (Lücke 1) |
| `n.galerie_sammlung` | Galerie | Was | Kap. 2 | Köder 3-6 |
| `n.bibliothek` | Bibliothek | Was | Kap. 2 | Köder 3-6 |
| `n.koenig_preussen` | König von Preußen | Wer | `clue.k3.koenig` | richtig 3-6 (Lücke 2) |
| `n.kaiser` | Kaiser | Wer | `clue.k3.koenig` | Köder 3-6 |
| `n.kommissaer` | Kommissär | Wer | `clue.k3.fackel` | Köder 3-6 |
| `n.buechsenmacher` | Büchsenmachers | Wer | `clue.k3.soll`, `clue.k3.falltuer` | richtig 3-7 |
| `n.mundkoch` | Mundkochs | Wer | `clue.k3.kuechenhof` | Köder 3-7 |
| `n.hofgaertner` | Hofgärtners | Wer | `clue.k3.gaertner` (siehe unten) | Köder 3-7 |
| `n.fachwerk` | Fachwerkbauten | Was | `clue.k3.galerie` | richtig 3-8 |
| `n.wirtschaftsgebaeude` | Wirtschaftsgebäude | Was | `clue.k3.wirtschaft` | Köder 3-8 |
| `n.gewoelbe` | Gewölbe | Was | `clue.k3.feuer` | Köder 3-8 |
| `n.hundert_schritt` | hundert Schritt | Wie viel | `clue.k3.messen` | richtig 3-9 |
| `n.hundert_fuss` | hundert Fuß | Wie viel | `clue.k3.galerie` | Köder 3-9 |
| `n.hundert_klafter` | hundert Klafter | Wie viel | `clue.k3.messen` | Köder 3-9 |
| `n.r_schuld` | nahmen sich, was man ihnen schuldete | Wie | `clue.k3.hanne` | LESART 3-10 |
| `n.r_stahlen` | stahlen | Wie | `clue.k3.soll` | LESART 3-10 |
| `n.r_retteten` | retteten, was zu retten war | Wie | `clue.k3.kuechenhof` | LESART 3-10 |
| `n.r_alle` | taten, was alle taten | Wie | `clue.k3.jost` / `laub.k3.alle` | LESART 3-10 |

**`clue.k3.gaertner`** – Holländische Gärtnerei, Teil A oder B. Ein Schild an der Pforte: „Hof-Gärtnerey. Eintritt nur mit Erlaubnis des Hofgärtners.“ (FIKTION.) Laub: „Der Hofgärtner Petri hat auch Notizen hinterlassen. Ein Gärtner, der aufschreibt, wie kalt es war, während um ihn herum alles brennt. Ich mag ihn.“ (FAKT: Hofgärtner August Petri schrieb Aufzeichnungen zu 1793/94, M1910 S. 427 Anm. 1.) → gibt `n.hofgaertner`.

---

## 7. Fallseite „Die Nacht“

9 FAKT + 1 LESART. Drei Bestätigungen zu je drei Einträgen.

| id | Typ | Satz | richtig (auch richtig) | Köder | Beleg / Codex |
| --- | --- | --- | --- | --- | --- |
| `entry.k3.1` | FAKT | „Der Karlsberg wurde am Sonntag, dem **___** 1793, angezündet.“ | 28. Juli | 24. Juli, 9. Februar, 25. Februar | M1910 S. 461 Anm. 39 (Horstmann); Remling nach SCHWAN12; WP-SK · `cx.22` |
| `entry.k3.2` | FAKT | „Das Stroh für den Brand ließ man bis aus **___** herbeischaffen.“ | Lothringen (Metz) | Kaiserslautern, Mannheim, Homburg | M1910 S. 461; WP-SK · `cx.22` |
| `entry.k3.3` | FAKT | „Mit dem Stroh stopfte man alle Gemächer im **___** aus.“ | Erdgeschoss | Dachstuhl, Keller, Festsaal | M1910 S. 461 („zu ebener Erde“) · `cx.22` |
| `entry.k3.4` | FAKT | „Der Kommissär setzte das Schloss ‚im Namen der **___**‘ in Brand.“ | Nation | Republik, Freiheit | M1910 S. 461 · `cx.22` |
| `entry.k3.5` | FAKT | „Die abziehenden Franzosen gaben das Schloss zur Plünderung frei, auch für die **___** der Umgebung.“ | Dorfbewohner | preußischen Soldaten, Hofbedienten | WP-SK; EN-KC · `cx.23` |
| `entry.k3.6` | FAKT | „Die Kisten mit dem **___** standen gepackt; der Herzog bestellte die Wagen ab, weil der **___** ihm versicherte, die Franzosen kämen nicht wieder.“ | Naturalienkabinett · König von Preußen | Galerie, Bibliothek · Kaiser, Kommissär | M1910 S. 454 f. · `cx.21` |
| `entry.k3.7` | FAKT | „Vor dem Abtransport versteckte Mannlich die schönsten Bilder durch eine geheime Falltür in der Werkstatt des **___**.“ | Büchsenmachers | Mundkochs, Hofgärtners | M1910 S. 431 f. · `cx.20`, `cx.26` |
| `entry.k3.8` | FAKT | „Das Feuer zerstörte vor allem die Residenz des Herzogs und die **___**.“ | Fachwerkbauten | Wirtschaftsgebäude, Gewölbe | WP-SK; EN-KC · `cx.28` |
| `entry.k3.9` | FAKT | „Mannlich schrieb, die Galerie sei ‚cent pas‘ lang gewesen: **___**.“ | hundert Schritt | hundert Fuß, hundert Klafter | SCHWAN12 Anm. 47; Messung im Modell · `cx.25` |
| `entry.k3.10` | LESART | „Die Leute aus den Dörfern **___**.“ | – | – | `flag.k3_pluenderer` = schuld / stahlen / retteten / alle |

**Weitere Flags aus diesem Kapitel:** `flag.k3_objekt` = tuergriff / dukat / uhr / nichts. `flag.k3_chronik_zerstreut` (immer gesetzt, wenn die Seite gefunden wurde). Beide werden im Epilog genutzt.

**Freischaltungen:** 1. Satz → Baumeister 1 (Raumnamen in Erinnerungen). 2. Satz → Baumeister 2 (Konfidenzansicht D/I/N/U). 3. Satz → Röntgenblick (Punktwolke), Anker Taleingang 1796, Kapitel 4 offen.

---

## 8. Hinweisleiter (Laub)

1. „Das Datum hat der Regierungsrat notiert. Die Soldaten sagen es auch, wenn man ihnen beim Abladen zuhört. Und der Kommissär sagt, in wessen Namen er anzündet, aber erst, wenn Sie ihn lassen.“
2. „Gehen Sie in den Sammlungsflügel hinauf. Die Kisten erzählen, wohin sie sollten, und das Echo dort, wer sie aufgehalten hat. Die Falltür kennt der Kanzlist. Er erzählt es gern, wenn man ihn nicht unterbricht.“
3. „Messen Sie die Galerie. Hundert Fuß sind keine dreiunddreißig Meter, hundert Klafter fast zweihundert. Und schauen Sie vom Garten aus nach Norden auf die Ställe: Was morgen noch steht, hat nicht gebrannt.“

---

## 9. Bedrohung (Notizen für Designer)

**Teil A:** keine Meute. Die Plünderer sind Echos und sehen dich nicht. Ölvorrat 7 min.

**Teil B, das Feuer** (Zeit T ab dem Wurf der Fackel; sanfter Modus: alle Zeiten × 1,5):

| T | Zustand |
| --- | --- |
| 0 s | Erste Räume im Erdgeschoss von Corps de logis und Nordflügel brennen (Stroh). |
| 30 s | Ganzes Erdgeschoss von KB-B01, KB-B02, KB-B03 brennt. Rauch in den Treppenhäusern. |
| 90 s | Feuer erreicht über die Prunktreppe das Obergeschoss. Festsaal: Rauch unter der Decke (W5 beginnt, wenn der Spieler da ist). |
| 150 s | Prunktreppe nicht mehr begehbar. Dienertreppe Süd noch 30 s begehbar. |
| 180 s | Sammlungsflügel (KB-B04) brennt im Erdgeschoss, Obergeschoss ab 210 s. |
| 240 s | Galerie (KB-B06) brennt vom Westende her. Tempelzimmer ab 270 s (Papier, sehr schnell). |
| 300 s | Küchenbau (KB-B05) brennt zuletzt, das Gewölbe der Hofküche hält. |

- Das Feuer breitet sich über den Raumgraph aus (Nachbarräume aus Katalog v2). Steintreppenhäuser und gewölbte Räume zünden später.
- **Rauch statt Öl:** Ein Rauchbalken füllt sich, solange man in einem Raum mit Rauch steht. Geduckt (C) halb so schnell. Ist er voll, wird man zurückgeworfen: Text „Der Rauch hat dich zurückgeworfen …“ Du wachst in der Feldstation auf und behältst die bestätigten Einträge. Die Wahl im Festsaal bleibt, wenn sie schon getroffen war.
- **W5-Fenster:** Der Spieler hat im Festsaal 40 s, bevor Hanne ihn mitnimmt. Diese 40 s laufen im Zeitplan nicht weiter (der Zeitplan steht still, solange W5 läuft). So kann niemand durch die Wahl im Feuer festsitzen.

**Teil B, draußen:**
- Die Meute (5 Hunde, ohne Pikeur; der Pikeur ist noch nicht da, Jost hat das Horn erst am Ende) streift durch den Garten zwischen Galerie, Gärtnerei und Marstall.
- **Gehör statt Sicht:** Im Feuerschein ist deine Laterne bedeutungslos, die Hunde jagen nach Geräusch. Rennen 40 m (Kies), Gehen 15 m, Schleichen 6 m, Liegen 0 m. Das Prasseln des Feuers überdeckt alles, was näher als 30 m an einem brennenden Gebäude ist: Dort hört dich niemand, aber dort ist Rauch.
- **Sichere Zonen:** Holländische Gärtnerei (ummauert; nur ein Tor, die Hunde gehen nicht hinein), Hohlweg KB-10 (1172/−1238), das Becken am Marstall (KB-B20).
- **Gestellt:** wie in Kapitel 2. Text „Die Meute hat dich gestellt …“.
- Am Zwinger (3.12) ist keine Gefahr: Die echten Hunde laufen an dir vorbei, die Meute aus Rauch zieht sich zurück, sobald Jost das Horn nimmt.

**Tuning-Ziel:** Ein Spieler, der in Teil A die Galerie und das Tempelzimmer gesehen hat, findet den sicheren Weg (c). Wer direkt zum Festsaal läuft, schafft es über (a) oder (b) mit etwas Rauch.
