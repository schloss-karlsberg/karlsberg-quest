# Die Enden und das Abschlussfest (Ersatzentwurf)

> **ENTWURF für das Release nach 0.5.0.** Ersetzt nach Freigabe die Abschnitte 1, 2, 3–5 („Szene“, „Marlene“), 7 von `content/bible/06-enden.md` und fügt §8 „Das Fest“ hinzu. **Was bleibt:** die drei Enden (Museum / Verbrennen / Behalten), alle Laub-Zeilen der Enden, der Epilog aus Bausteinen (§6) mit den Lesart-Sätzen und dem Gegenstand, die Errungenschaften, „Ende noch einmal wählen“, `combat.disabled` vom Finale bis zum Abspann. Alles ist FIKTION außer den markierten Sätzen. Gerold Imhoff ist ein Platzhaltername.

| | |
| --- | --- |
| Ära | `heute`, Dämmerung (Look `dusk`, ≈ 16:45–17:00, Handy-Uhr) |
| Ort | Zwinger (Ende des Finales) → Karlsbergquelle (Aufwachen) → Rand des Plateaus (Wahl) → Plateau, Ehrenhof-Lichtung 1216/−1114 (Fest) |
| Dauer | 6–8 min (Wahl 1, Inszenierung 0,3, Epilog 2–3, Fest mit Abspann 3–4) |
| Voraussetzung | Finale gespielt (`flag.k4_finale`), Horn genommen |

---

## 1. Übergang (ersetzt)

Nach dem Finale (W8) wird es nicht hell, sondern das Licht kehrt zurück in den Novembernachmittag: Du wachst an der **Karlsbergquelle** auf, auf der Stufe, wo du dich hingesetzt hast. Das Horn liegt in deiner Hand, kalt und echt. Die Handy-Uhr zeigt 16:44. Es ist dieselbe Pause.
- Drei Nachrichten: Gerold („Wir sind oben. Glühwein ist heiß.“), Herr Soll („Kuchenkasse: noch 4,50 € offen“), Marlene („Hast du meinen Stab noch?“).
- `laub.end.morgen` → `laub.end.quelle`: „Sagen Sie denen oben nichts. Oder alles. Ihre Försterin wird es ohnehin aufschreiben.“
- Ziel: „Hinauf zum Plateau.“ Der Weg (≈ 400 m an der Orangerie vorbei; Karte oder Geisterblick erlaubt) endet am **Rand der Lichtung**, ≈ 1200/−1095 (prüfen). Von dort sieht man das Fest schon: Lichterketten zwischen zwei Buchen, ein Biertisch-Satz mit Kuchen, ein Glühweintopf auf einem Gaskocher, eine Feuerschale, die gerade angezündet wird, Leute in Jacken.

Am Rand, auf einem Baumstumpf, legst du ab, was du trägst: die Chronik (jetzt vollständig, mit Laubs Kurrent und Solls Spalten), das Horn, die Bussole und den Gegenstand aus dem Festsaal (`flag.k3_objekt`). Wenn eine LESART leer ist: Laubs Satz bleibt („Sie haben noch Lücken gelassen …“).

## 2. Die Wahl (ersetzt: Ort und Gegenstände)

Die Wahl geschieht am Rand des Plateaus, mit Blick aufs Fest. E halten (3 s), Bestätigung „Bist du sicher? Das lässt sich nicht ändern.“

| id | Handlung | Objekt | Horn | `flag.end` |
| --- | --- | --- | --- | --- |
| `end.museum` | Die Chronik in Marlenes graue Archivschachtel legen (sie steht unter dem Biertisch, „Forstamt – Belege“) | Schachtel | Du bläst es einmal, lang und fallend: abgeblasen | `museum` |
| `end.verbrennen` | Die Chronik mitnehmen zur Feuerschale | Feuerschale | Du legst es auf den Baumstumpf am Rand der Lichtung | `verbrennen` |
| `end.behalten` | Die Chronik zur Bussole in den Rucksack stecken | Rucksack | Du hängst es dir um | `behalten` |

Laub vor der Wahl, unverändert: „Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.“

Danach läuft die bestehende Folge: **Inszenierung** (`endings/stage.ts`, spielerrelativ, nicht ortsgebunden) → **Szenenkarte** (Laub) → **Epilog** (§6 der alten Datei, Bausteine) → **das Fest** (§8, neu) → **Abspann über dem Fest** → frei begehbar.

## 3.–5. Die drei Szenen (Änderungen)

Laubs Zeilen bleiben wörtlich. Geändert wird nur, was am Bauwagen hing:
- **A Museum.** Statt am Bauwagentisch: Marlene schreibt mit Filzstift „Karlsberg, Funde ohne Fundort“ auf die Schachtel und streicht „Funde“ wieder durch (bleibt). Das Horn bläst du am Rand der Lichtung; das Fest wird kurz still, jemand lacht unsicher, Gerold: „Na, das war ja stilecht.“ `marlene.end.museum` bleibt (Denkmalamt-Satz, `cx.35`).
- **B Verbrennen.** Statt Ofenklappe: die Feuerschale am Fest. Die Seiten rollen sich ein und werden durchsichtig, für einen Atemzug sieht man in jeder eine Erinnerung (bleibt). Niemand am Fest merkt mehr als „Papier?“ — Herr Soll: „Hoffentlich keine Quittungen.“ `marlene.end.verbrennen` bleibt („Riecht nach Herbstfeuer …“).
- **C Behalten.** Statt Schublade und Haken im Bauwagen: Rucksack und Horn um den Hals. `marlene.end.behalten` → „Lass das Horn um. Steht dir. Aber blas nicht drauf, wenn Gerold redet.“ Die fünf Abdrücke im Raureif vor der Stufe werden fünf Abdrücke im Laub am Rand der Lichtung; sie führen nicht weg.
- Epilog-Bausteine mit Bauwagen-Bezug (`enden.pack.json` :565, :604, :630, :643, :682; `05-enden.story.json:308–323`): „Schublade bei der Bussole“ → „im Rucksack bei der Bussole“; „Die Uhr steht im Bauwagen“ → „Die Uhr steht bei mir auf dem Regal“; Dukat „Marlene gegeben“ bleibt.

### 6a. Neuer Epilog-Platz „Führung“ (ersetzt „Vermessung“)

Der Platz las bisher `q.p.trichter`, `q.p.meiler`, `q.p.irrlichter`. Jetzt sind Marlenes Aufträge freiwillig. Neuer Platz `fuehrung` (Generator `scripts/content-build/epilogue-deeds.mjs`), ein Satz, in dieser Rangfolge:
1. Alle sechs Aufträge Marlenes erledigt: „Für Marlene habe ich den halben Wald nachgemessen. Sie sagt, ich darf wiederkommen, ohne Führung.“
2. Mindestens einer: „Für Marlene habe ich ein paar Stellen im Wald nachgemessen. Gegraben habe ich nicht.“
3. Keiner (**Standard**): „Ich war auf einer Führung. Das Reh habe ich fotografiert, den Rest habe ich mir gemerkt.“
Zusatz nach `q.p.irrlichter` erledigt: „Über dem Weiher waren Lichter. Ich habe sie nicht gefragt, woher.“
Zusatz nach Album (alle sieben Prolog-Fotoziele): „Im Telefon habe ich sieben Bilder, und auf keinem ist ein Schloss.“
Der Lesart-Satz „Spuren“ (`flag.p_spuren`) bleibt; ohne `q.p.punktwolke` gilt der vorhandene `offen`-Satz.

## 7. Nach dem Epilog (ersetzt)

1. **Das Fest** (§8) mit dem Abspann darüber.
2. Danach das Plateau im Heute, frei begehbar; das Fest bleibt in der Dämmerung stehen, Gruppe und Gerold bleiben ansprechbar (je eine Nachspielzeile). Alle Werkzeuge bleiben. Kein Zeitwechsel mehr, außer bei Ende C (unverändert).
3. Hauptmenü „Ende noch einmal wählen“ lädt den Stand vor der Wahl (unverändert).
4. Codex vollständig (unverändert).

---

## 8. Das Fest (neu)

**Ort:** Plateau, die Ehrenhof-Lichtung von heute (TF-01, 1216/−1114, eben, r ≈ 35). Wichtig: das Plateau **heute** (Wald, Lichtung, flache Mauerzüge im Boden), nicht 1789. Neue Inhalte auf den Modell-Umbau-Stellen (KB-B07, Karlslust-Insel, Terrassen) vermeiden (`brief-common-rules`).
**Licht:** Dämmerung, letzter roter Streifen im Westen, Lichterketten warmweiß, Feuerschale, Laternen der Gruppe (Gerold hat sie in t1 ausgeteilt). Kein Feuerwerk (kein Echo-Thema am Gedenkort; Feuerwerk gehört zu 1785, `cx.14`).
**Ton:** leises Stimmengewirr, ein Kind, Hunde, Gläserklirren, kein Musikstück mit Text.

### 8.1 Wer da ist

| Person (heute) | Figur 1789 | Ort beim Fest (x/z, prüfen) | Tun |
| --- | --- | --- | --- |
| Gerold Imhoff | – | 1214/−1112, am Biertisch | schenkt Glühwein aus, hält die Abschlussrede |
| Marlene | (sie selbst) | 1220/−1118 | Stativ zusammengeklappt, nimmt ihren Messstab zurück |
| Carl Herzog | Herzog Karl II. August | 1210/−1108, einziger Campingstuhl | sitzt, hat Schnupfen, hat sein Auto bis an die Schranke gefahren |
| Christian Mann | Mannlich | 1224/−1110 | zeichnet die Lichtung, zeigt dir die Skizze |
| Hanne Matz und Peter | Hanne, Peter | 1218/−1122 | Hanne isst Kuchen auf der Bank, Peter mit Kopfhörern |
| Jost Fendel, Diane, Bijou | Jost, die Meute | 1206/−1118 | wirft einen Stock; die Hunde |
| Herr Soll | Kanzlist Soll | 1213/−1115 | zählt die Kuchenkasse |
| Liese Wendling | Liese, Wäscherin | 1222/−1114 | flickt Bijous Halstuch, hat Nähzeug dabei |
| Extras (7) | – | verstreut | das Kind Mats mit dem Spielzeugkompass und seine Mutter; ein Paar aus Zweibrücken; zwei Wanderinnen; ein Student mit Thermoskanne |

### 8.2 Ablauf (gleich für alle Enden, ≈ 3–4 min, Abspann ab Schritt 4)

1. **Ankunft.** Du trittst in den Lichtkreis. Gerold: „Da ist ja unser Nachzügler! Fünfzehn. Jetzt stimmt's wieder.“ Herr Soll hakt etwas ab.
2. **Der Stab.** Marlene kommt dir entgegen, du gibst ihr den Messstab zurück (das Item verlässt das Inventar nur für die Szene; im freien Spiel danach ist er wieder da, Marlene: „Ach, behalt ihn. Ich hab ja noch einen.“).
   - `marlene.end.fest`: „Danke. Und? Hast du was gefunden da unten an der Quelle?“ — Antwort wählt der Spieler nicht; Laub antwortet leise für dich nur hörbar: „Sagen Sie: Wasser.“
3. **Gerolds Abschlussrede** (Variante je Ende, §8.3).
4. **Der Abspann beginnt** als Laufschrift am Bildrand; die Kamera geht in langsamen Kreisen über das Fest (Kameraweg aus `stage.ts`, spielerrelativ), bleibt bei jedem Doppelgänger zwei, drei Sekunden. Jeder sagt **eine** Zeile (§8.4). Der Spieler kann umhergehen; der Abspann läuft weiter, E spricht Leute an.
5. **Letztes Bild** (Variante je Ende), dann „Ende“ und der Hinweis „Frei weiterspielen“.

### 8.3 Varianten je Ende

**A – Museum: Gerold zeigt die Chronik.**
Marlene hat die Archivschachtel auf den Biertisch gestellt. Gerold hebt die oberste Seite vorsichtig ins Licht der Lichterkette.
- `imhoff.end.museum_1`: „Leute, guckt euch das an. Das hat unser Nachzügler da unten gefunden, sagt Marlene. Eine Liste. Wem der Hof was schuldig geblieben ist. Löhne. Namen.“
- `imhoff.end.museum_2`: „Ob das echt ist? Das sollen die im Museum prüfen. So macht man das: erst nachsehen, dann glauben.“
- Hanne Matz liest über seine Schulter und tippt auf eine Zeile: „Matthes. Mit zwei T.“ (Pause.) „Komisch. So schreibt man das bei uns in der Familie auch.“ (FIKTION; keine Behauptung einer Abstammung, nur ein Echo.)
- Mats' Spielzeugkompass zeigt zum ersten Mal brav nach Norden. Laubs Nadel auch.
- **Letztes Bild:** die Schachtel unter der Lichterkette, Gerolds Hand flach auf dem Deckel.

**B – Verbrennen: die Feuerschale.**
Die Seiten sind schon Asche. Die Feuerschale brennt hoch; die Gruppe steht im Kreis darum und wärmt die Hände.
- `imhoff.end.verbrennen_1`: „Feuer zum Schluss. Passt ja irgendwie. Das Schloss ist auch so zu Ende gegangen.“ (Gerold spricht nur vom Gebäude; kein Witz über Menschen.)
- `imhoff.end.verbrennen_2`: „Und trotzdem ist nicht alles weg. Steht ja alles noch irgendwo: bei Mannlich, in den Akten, im Boden. Man muss nur hingucken.“
- Christian Mann hält seine Skizze kurz übers Feuer, nimmt sie dann zurück: „Nee. Die behalt ich.“
- Josts Hunde liegen weit weg vom Feuer und schlafen.
- **Letztes Bild:** Funken steigen in den dunkelblauen Himmel und verlöschen, einer nach dem anderen, wie Augen (das einzige Bild der Meute in diesem Ende).

**C – Behalten: zwei Hunde zu deinen Füßen.**
Kaum sitzt du auf der Bank, kommen Diane und Bijou, ohne dass Jost sie ruft, und legen sich dir zu Füßen, Köpfe auf den Pfoten. Die Augen spiegeln die Feuerschale, einen Moment zu hell.
- `jostd.end.behalten`: „Das machen die sonst nie. Bei keinem.“ (Pause.) „Die mögen dich. Oder sie passen auf dich auf.“
- `imhoff.end.behalten`: „Und die Führung ist zu Ende, aber der Berg nicht. Wer wiederkommen will: jeden zweiten Samstag, Treffpunkt wie immer.“
- Fern, aus der Richtung der Hohenburg, ein Horn, falsch und zu hoch (bleibt aus dem alten Ende C). Jost Fendel hebt den Kopf: „Hört ihr das?“ Gerold: „Jagdhornbläser. Üben wohl.“
- **Letztes Bild:** Nacht über dem Plateau, die zwei Hunde und deine Laterne; im Laub am Rand fünf Abdrücke, die nicht wegführen.

### 8.4 Eine Zeile je Doppelgänger (alle Enden, Abspann)

| Person | Zeile (Entwurf) | Echo zu |
| --- | --- | --- |
| Carl Herzog | „Schön war's. Nächstes Mal fahr ich aber hoch. Zu Fuß ist nichts für mich.“ | `cx.11` „Zu Fuß, außer einem“ |
| Christian Mann | „Ich zeichne das Schloss mal so, wie es war. Nach den Quellen natürlich. Den Rest erfind ich und schreib's dazu.“ | Mannlich, Baudirektor und Maler; FAKT/FIKTION-Regel |
| Hanne Matz | „Ich bin Steinmetzin. Da unten am Weg lag ein Quader mit einem Zeichen drauf. Ein Winkel und drei Punkte. Kennst du das?“ | `clue.k1.zeichen` (FIKTION) |
| Peter | (nimmt einen Kopfhörer raus) „Mama, können wir gehen?“ (setzt ihn wieder ein) | Peter, wortkarg |
| Jost Fendel | „Diane führt, Bijou glaubt, er wär ein Hirsch. Die Namen hat mein Opa ausgesucht. Keine Ahnung, woher.“ | Josts Hunde |
| Herr Soll | „Kuchenkasse stimmt. Bis auf einen. Den buch ich unter ‚offen‘.“ | Soll, „Was der Hof schuldig blieb“ |
| Liese Wendling | „Die Jacke hat jetzt einen Riss. Gib her, ich näh dir das schnell. Kleider machen Leute.“ | Liese, `q.k1.kleider` |
| Mats (Kind) | „Mein Kompass zeigt wieder komisch.“ (A: „… zeigt jetzt richtig!“) | Laub, ohne Doppelgänger |
| Gerold Imhoff | „Danke, dass ihr mitgekommen seid. Und denkt dran: gucken ja, graben nein.“ | `cx.35` |

Laub ist beim Fest **nur Stimme** in der Bussole (A: schweigt, „pensioniert“; B: wird leiser, wie im alten Ende; C: ein Satz, nur für dich: „Gute Gesellschaft. Ich bleibe im Dienst.“).

### 8.5 Regeln

- Kein Alkohol im Bild trinken; Glühwein steht da, Becher in der Hand ist in Ordnung, niemand wird betrunken. Ein Kinderpunsch-Topf daneben. Keine Marke an Bechern, Töpfen, Tisch.
- Die Doppelgänger werden nie aufgeklärt („Ich bin der Herzog von früher“ gibt es nicht). Nur Echos.
- Keine Fanfare, kein Feuerwerk, keine Wertung des Endes.
- `combat.disabled` bleibt bis nach dem Fest gesetzt; Ende C schaltet danach die Folge-Meute (5 Hunde in 20 m) wie bisher.
