# Stimmen

> **Tour-Konzept (Stand 2026-11-23):** Gerold Imhoff (Platzhaltername), die Doppelgänger, Marlene als Försterin unterwegs (persönlich/Handy statt Funk/Bauwagen) und die neuen Barks stehen in [`docs/design/tour/bible/08-stimmen.md`](../../docs/design/tour/bible/08-stimmen.md); wo sich beide widersprechen, gilt die Tour. Zusammenführung: TASK-007.

Dieses Dokument legt festDieses Dokument legt fest, **wie** die Figuren sprechen, und enthält alle Zeilen, die nicht an einen Ort gebunden sind (Barks). Die ortsgebundenen Dialoge stehen in den Kapiteldateien.

In v1.0 sind alle Stimmen **Text** (Untertitel und Sprechblasen; PRD D-007: Audio prozedural). Wenn später Sprachaufnahmen dazukommen, gelten die Sprechhinweise unten.

**Für alle Figuren gilt (PRD §4.4):**
- Opfer sind nie Monster und nie Rätsel. Über die Toten von 1785 und über Matthes wird nicht gewitzelt.
- Historische Personen sagen nur, was eine Quelle überliefert ([Z] wörtlich mit Seite, [P] Paraphrase mit Seite).
- Humor zielt nach oben (Hof, Pracht, Bürokratie), nie auf die Armen, die Plünderer oder die Tiere.
- Keine Blutbeschreibungen, kein Gore. Die Meute „stellt“, sie „reißt“ nicht.
- Kein Figurentext gibt Hinweise, wo man im echten Wald graben könnte. „Schauen, nicht graben.“
- Gendern: Der Spieler wird von Laub gesiezt, von Marlene geduzt, von Jost geduzt, von Soll in umständlichem Sie angeredet („mein Herr, meine Dame, mein … Sie“). Der Spielername erscheint als `{Name}`.

---

## 1. Quirin Laub (FIKTION)

**Wer.** Königlich bayerischer Geometer, abgeordnet zur Landesaufnahme im Rheinkreis, seit November 1840 „verwaltungstechnisch verschollen“. Spricht aus der Messing-Bussole. Etwa 33 Jahre alt gestorben, klingt älter.

**Wie.** Höflich, pedantisch, trocken, schnell beleidigt, wenn es um seine Messungen geht. Kurze Sätze, Beamtendeutsch als Witz („verwaltungstechnisch“, „Tagegeld“, „Dienstreglement“), keine modernen Wörter außer, wenn er sie absichtlich falsch benutzt. Wird gesprächig, wenn er Angst hat. **Schweigt an Gedenkorten** (Rondell 1785, Festsaal während W5, Finale bis zu `laub.k4.finale_2`).

**Ticks.** Rechnet Längen nach („Fünf Meter dreißig. Für Orangen.“). Verteidigt die 50 m Versatz seiner Karte. Erwähnt sein nie gezahltes Tagegeld (höchstens einmal pro Kapitel).

**Tabu.** Laub erklärt keine Lösung. Er sagt nie „richtig“ oder „falsch“ zu einem Eintrag vor der Bestätigung. Er lügt nie über Fakten, er verschweigt nur (bis Kapitel 4).

**Sprechhinweis.** Mittlere Stimme, leicht nasal, bayerisch-pfälzische Färbung nur in den Vokalen, keine Mundart.

### 1.1 Barks

Jede Gruppe wird zufällig gezogen, jede Zeile frühestens nach 10 min wieder. Höchstens ein Bark pro 45 s. Keine Barks während Echos, Dialogen und an Gedenkorten.

**Leerlauf** (`laub.bark.idle.*`, nach 60 s ohne Bewegung oder Eingabe)
1. „Ich messe gerade, wie lange Sie stillstehen. Es ist eine sehr genaue Messung.“
2. „Wenn Sie nichts tun, tue ich auch nichts. Das hat beim Staat jahrelang funktioniert.“
3. „Der Berg wartet seit 1793. Auf Sie kommt es jetzt auch nicht mehr an. Aber bitte.“
4. „Haben Sie schon die Karte verglichen? M. Ich frage nur.“

**Laterne fast leer** (`laub.bark.lantern_low.*`, bei 20 % Öl)
1. „Ihr Öl geht zur Neige. Meines ist 1840 ausgegangen. Ich empfehle, nicht meinem Beispiel zu folgen.“
2. „Die Flamme wird klein. Zurück zur Station wäre jetzt keine Feigheit, sondern Verwaltung.“
3. „Nur noch Sekunden Licht. Q halten, wenn Sie heim wollen.“

**Hunde in der Nähe** (`laub.bark.hounds_near.*`, ein Hund < 30 m, nicht entdeckt)
1. „Hören Sie das? Atmen Sie leiser. Ich tue es auch.“
2. „Licht aus. Jetzt.“
3. „Hinlegen ist keine Schande. Ich sage das aus Erfahrung.“
4. „Wasser. Stein. Hohlweg. Irgendetwas davon ist in der Nähe.“

**Hund hat dich verloren** (`laub.bark.hound_lost.*`, nach dem Horn „Verloren“)
1. „Sie haben Sie verloren. Fürs Erste. Hunde sind geduldiger als Herzöge.“
2. „Ein fallender Ton. Das heißt: Sie suchen da, wo Sie eben waren. Seien Sie nicht mehr da.“
3. „Gut gemacht. Ich hätte es nicht gekonnt. Das ist belegt.“

**Scan-Modus gewechselt** (`laub.bark.scan.*`, Taste 1–3; höchstens einmal je Modus und Kapitel)
1. (Hillshade) „Die Schummerung. Wie ein Kupferstich bei tiefem Licht. Altmodisch und zuverlässig, wie ich.“
2. (Lokales Relief) „Lokales Relief. Jetzt sehen Sie, was nur eine Handbreit höher oder tiefer ist. Gestern noch ein Waldboden, heute ein Grundriss.“
3. (VAT) „Alles auf einmal. Kanten, Gruben, Rinnen. Sehr schön. Sehr unübersichtlich. Wie ein Hofstaat.“
4. (beliebig, später) „Wechseln Sie ruhig. Der Boden ändert sich nicht, nur Ihre Meinung über ihn.“

**Falsche Dreiergruppe** (`laub.bark.wrong_batch.*`, drei Einträge eingetragen, mindestens einer falsch; Laub sagt nicht, welcher)
1. „Nicht alle drei. Mehr verrate ich nicht. Das hätte mir auch keiner verraten.“
2. „Eine Zahl ist nicht falsch, nur weil sie groß ist. Aber eine ist falsch.“
3. „Sie haben es gut gemeint. Das steht in vielen Akten, die schlecht ausgegangen sind.“
4. „Prüfen Sie die Quelle, nicht das Gefühl.“

**Richtige Dreiergruppe** (`laub.bark.correct_batch.*`, drei Einträge bestätigt)
1. „Bestätigt. Drei Zeilen, die stimmen. Mehr hat der Hof in zwanzig Jahren nicht geschafft.“
2. „Schön. Ich trage es ein. In Kurrent, damit es keiner lesen kann.“
3. „Das hält. Darauf kann man einen Standpunkt setzen.“
4. „Merken Sie, wie das Papier schwerer wird? Das sind die Namen.“

**Eintritt nach 1789** (`laub.bark.enter_1789.*`, jeder Wechsel in `1789-07`)
1. „1789. Atmen Sie ein. Es riecht nach Kalk und Geld.“
2. „Kein Wald. Den hat man erst hinterher gepflanzt.“
3. „Der Hof. Gehen Sie zu Fuß. Wir dürfen hier nicht fahren.“

**Eintritt ins Feuer** (`laub.bark.enter_fire.*`, Teil B Kapitel 3 und jeder Raum, der brennt)
1. „Geduckt. Rauch geht nach oben, Sie gehen nach unten.“
2. „Nicht da lang. Da ist Stroh.“
3. „Das Feuer hat einen Plan. Wir haben einen besseren. Hoffe ich.“

**Rückkehr zur Station** (`laub.bark.return.*`, nach Q halten)
1. „Wieder im November. Ich mag den November. Im November ist alles, was passieren konnte, schon passiert.“
2. „Zurück. Schreiben Sie auf, bevor Sie vergessen. Vergessen geht schneller, als man denkt.“
3. „Willkommen in der Gegenwart. Sie ist kleiner, als man sie sich vorstellt.“
4. (nach Gestelltwerden) „Gestellt. Nicht gerissen. Merken Sie sich den Unterschied.“

**Reliefmerkmal gefunden** (`laub.bark.relief.*`, Reliefmuster-Karte erkannt)
1. „Ein gerader Strich, wo der Wald keine geraden Striche macht. Das war einmal Absicht.“
2. „Notieren Sie es. Mit Ort und Datum. Und dann lassen Sie es liegen, wo es liegt.“
3. „Schauen, nicht graben. Ich sage es nur, weil Sie gerade so aussehen.“
4. „Das hätte ich 1840 gern gehabt. Ich hatte nur Schritte und eine Kette.“

(Gesamt: 41 Barks.)

### 1.2 Hornruf-Kommentare (nur einmal, beim ersten Hören jedes Rufs)

- Anblasen: „Ein langer Ton. Die Jagd beginnt.“
- Fährte: „Zwei kurze. Die haben etwas gefunden. Vermutlich uns.“
- Verloren: „Ein fallender Ton. Sie wissen nicht mehr, wo wir sind. Ich auch nicht, aber ich gebe es nicht zu.“
- Sammeln: „Drei lange. Sie gehen zurück. Diesmal.“

---

## 2. Marlene (FIKTION)

**Wer.** Vorarbeiterin im Forstbetrieb, Anfang fünfzig, aus der Gegend (Schwager in Rohrbach, später Homburg). Bringt Brötchen und Kaffee. Weiß viel aus dem Dorf und manches aus dem Internet und sagt dazu, woher.

**Wie.** Herzlich, praktisch, leise Saarpfälzer Färbung in Wortwahl („Guck mal“, „gell“ höchstens einmal pro Kapitel), keine Mundart-Schreibung. Duzt. Glaubt nicht an Geister und fragt nicht nach, wenn der Spieler nach Rauch riecht. Erklärt Werkzeuge (Relief, Karte) ohne Fachjargon.

**Funktion.** Tutorial, Ortskenntnis, Quellen von heute (Internet, Ausstellung, Schwager) und Verankerung im Jetzt. Sie ist die Stimme, die am Ende den Namen ruft (W7).

**Tabu.** Marlene erfindet keine Fakten. Wenn sie etwas nicht genau weiß, sagt sie es („Ich müsste meinen Schwager fragen“).

### 2.1 Allgemeine Zeilen (`marlene.gen.*`, Feldstation, zufällig, höchstens eine pro Rückkehr)

1. „Kaffee steht da. Er ist nicht gut, aber heiß.“
2. „Hast du die Nordseite schon gemacht? Das Forstamt will den Bericht bis Freitag.“
3. „Die Bussole hat heut Nacht getickt. Ich hab sie in die Schublade gelegt. Hat nicht geholfen.“
4. „Im Relief sieht man mehr als im Wald. Im Wald sieht man dafür, wo man hintritt.“
5. „Pass auf die Gräben auf. Nicht reinfallen und nicht reingraben, das gibt Ärger mit dem Denkmalamt.“
6. „Mein Schwager sagt, auf dem Karlsberg spukt's. Mein Schwager sagt auch, er kann Skat.“
7. „Wenn du die alte Karte drüberlegst, verrutscht alles um ein Stück. Ich glaub, die waren damals einfach müde.“
8. „Es wird früh dunkel. Nimm die Lampe mit. Und Öl.“
9. „Die Wildschweine waren wieder am Weiher. Die graben, das dürfen die.“
10. „Brauchst du was? Ich fahr nachher nach Homburg.“
11. „Du redest im Schlaf. Gestern hast du ‚Bijou‘ gesagt. Ist das ein Hund?“
12. „Schreib's auf, sonst vergisst du's. Hat meine Oma immer gesagt. Sie hat alles vergessen, aber aufgeschrieben.“
13. „Ich mag den Nebel hier oben. Da sieht der Wald aus, als würd er sich an was erinnern.“
14. „Der Laserscan ist ja neu. Zweitausendfünfundzwanzig geflogen, im Winter, ohne Laub. Sonst sieht man nix.“
15. „Wenn's dir zu viel wird, mach eine Pause. Der Berg läuft nicht weg. Der ist schon weggelaufen, vor zweihundert Jahren.“

### 2.2 Tutorial-Zeilen (Prolog, siehe `01-prolog.md`)

Die Tutorial-Zeilen (Relief 1–3, M, F) stehen im Prolog. Wiederholt man ein Tutorial (Menü „Hilfe“), spricht Marlene dieselben Zeilen.

---

## 3. Kanzlist Gottlob Soll (FIKTION)

**Wer.** Kanzlist der Hofkammer, Registratur im Nordflügel. 1789 Mitte vierzig, 1796 über fünfzig. Führt neben den Hofrechnungen heimlich das Gegenbuch „Was der Hof schuldig blieb“.

**Wie.** Nervös, genau, umständlich höflich, komisch durch Ernst. Lange Sätze mit Einschüben, die er selbst abbricht. Liebt Unterscheidungen („angewiesen“ gegen „ausgezahlt“). Nie grausam, nie zynisch gegenüber den Armen, nur gegenüber Kassen. Sein Mut ist leise: Er schreibt auf.

**Wortschatz.** angewiesen, ausgezahlt, Rest, Posten, Kasse, Vermerk, mit Verlaub, buchhalterisch.

**Sprechhinweis.** Hoch, schnell, mit Pausen, in denen er nachrechnet.

**Zeilen:** `soll.k1.*` (02-kapitel-1), `soll.k3.*` (04-kapitel-3), `soll.k4.*` (05-kapitel-4).

**Barks** (`soll.bark.*`, wenn der Spieler in seiner Nähe herumsteht)
1. „Sie stehen in meinem Licht. Nein, bleiben Sie. Es ist ohnehin nicht meins.“
2. „Neunzehn, zwanzig … nein. Noch einmal.“
3. „Bitte nichts anfassen, was nicht bezahlt ist. Also bitte nichts anfassen.“

---

## 4. Hanne (FIKTION)

**Wer.** Witwe des Steinhauers Matthes (gefallen vom Gerüst der Galerie, Herbst 1788; FIKTION). Mitte dreißig. Sohn Peter. Steht jeden Morgen am Bauplatz und wartet auf den Lohn.

**Wie.** Gerade, müde, mit trockenem Witz, nie weinerlich. Kurze Sätze. Sie ist kein Opfer, das man rettet, sondern eine Zeugin, die man anhört. Sie bittet nie den Spieler um Hilfe. Leichte Pfälzer Färbung („kriegt“, „gucken“), keine Mundart-Schreibung.

**Tabu.** Keine Tränen im Bild. Matthes' Tod wird nie gezeigt und nie beschrieben, nur benannt.

**Zeilen:** `hanne.k1.*`, `hanne.k2.*`, `hanne.k3.*`.

**Barks** (`hanne.bark.*`)
1. „Angewiesen. Hm.“
2. „Wenn Sie zum Schreiber gehen: Matthes. Mit zwei T.“
3. „Ich steh hier nicht zum Vergnügen. Obwohl die Aussicht schön ist. Bezahlt ist die auch nicht.“

---

## 5. Jost (FIKTION)

**Wer.** Hundejunge im Zwinger. 1789 dreizehn, 1793 siebzehn. Liebt die Hunde, kennt alle beim Namen, hat beim Kanzlisten schreiben gelernt und schreibt die Namen der Hunde in die Chronik. Lässt in der Brandnacht die echten Hunde frei, nimmt das Horn und läuft ihnen nach. In der Erinnerung wird er der Pikeur, alt geworden, und treibt jeden heim, der sich im Vergessen verläuft.

**Wie.** Jung: schnell, frech, ehrlich, voller Bilder („Du riechst nach Regen von morgen“). Alt: dieselben Bilder, langsamer, leise, ohne Bitterkeit. Duzt alle, auch den Spieler, auch Laub.

**Die Hunde.** Diane (führt), Sultan (dumm, aber laut), Fanfare, Rauhreif (die Weiße), Bijou (der Kleine, der glaubt, er sei ein Hirsch). Alle Namen FIKTION, aber in der Art der Zeit (französische und deutsche Hundenamen).

**Tabu.** Jost verrät vor dem Finale nie, wer der Pikeur ist. Der Pikeur spricht vor dem Finale kein Wort.

**Zeilen:** `jost.k1.*`, `jost.k2.*`, `jost.k3.*`, `jost.k4.*`.

**Barks** (`jost.bark.*`, nur 1789)
1. „Sultan, aus! Nicht du, der Hund.“
2. „Wenn du dich vor denen fürchtest, bist du nicht dumm.“
3. „Die riechen, wo du warst. Nicht, wo du bist. Das ist dein Glück.“

---

## 6. Peter (FIKTION)

Hannes Sohn, 1796 fünfzehn, Fuhrmann. Wortkarg, trotzig, arbeitet. Spricht nur in Kapitel 4 (`peter.k4.*`). Seine wichtigste Zeile ist der Lohn-Satz über den Stein seines Vaters.

---

## 7. Historische Personen (nur belegte Worte)

**Regel:** Historische Personen erscheinen nur in Echos. Sie sagen ausschließlich Sätze aus Mannlichs Lebenserinnerungen (M1910), wörtlich [Z] oder als gekennzeichnete Paraphrase [P]. Jede Zeile trägt im Datenformat `quote: verbatim|paraphrase` und eine Seitenangabe. Keine erfundenen Sätze, auch keine kleinen Überleitungen. Wo eine Szene Ton braucht, gibt es Geräusche (Husten, Tür, Schritte), keine Worte.

### 7.1 Johann Christian von Mannlich

Erzählstimme in Echos, ohne Gesicht oder als Silhouette. Ruhig, etwas müde, ein alter Mann, der sich erinnert. Untertitel bei längeren Zitaten: „Aus Mannlichs Lebenserinnerungen“.

| id | Text | Art | Seite | Ort |
| --- | --- | --- | --- | --- |
| `mannlich.01` | „Ich hatte also einen Stall für tausend Pferde und eine ungeheure Reitbahn zu ihrer Dressur und Bewegung zu bauen.“ | Z | S. 365 | `echo.k1.mannlich_bauliste` |
| `mannlich.02` | „Ich wiegte mich in der Hoffnung, daß der Herzog des Bauens endlich überdrüssig werden würde. Wie sah ich mich aber in meiner Rechnung betrogen!“ | Z (gekürzt) | S. 365 | dto. |
| `mannlich.03` | „Kasernen für sechshundert Gardisten … ein Zwinger für tausend Hunde (von den Wölfen abgesehen) … für die Hunde aller Erdteile.“ | Z (gekürzt) | S. 365 | dto. |
| `mannlich.04` | „… denen man ihren Lohn nicht bezahlte. Man schmeichelte ihm und täuschte ihn.“ | Z (gekürzt) | S. 369 | `echo.k1.mannlich_lohn` |
| `mannlich.05` | „Unweit davon erhob sich ein Gebäude, das wie ein antikes Amphitheater aussah und die Vierfüßler und Raubvögel beherbergte.“ | Z | S. 384 | `echo.k1.mannlich_menagerie` |
| `mannlich.06` | „Der Herzog führte uns flüchtig an allen Einzelkäfigen vorüber, nur jener mit den Affen hielt uns länger zurück.“ | Z | S. 384 | dto. |
| `mannlich.07` | Der Major brachte alle Feuerwerkskörper auf einem einzigen, dem höchsten Gerüst unter, statt sie auf drei zu verteilen. | P | S. 389 | `echo.k1.feuerwerk` |
| `mannlich.08` | „Dicht dabei standen nicht weniger als zehn bis zwölf Kanonen.“ | Z | S. 390 | dto. |
| `mannlich.09` | „Wenn ich mich recht entsinne, gelangte zu uns gegen Ende Februar 1793 … die Nachricht …“ | Z (gekürzt) | S. 422 | `echo.k2.abschied` |
| `mannlich.10` | „Beim Durchschreiten der Gemächer des Schlosses bemerkten sie die reisefertigen Kisten mit unserem herrlichen Naturalienkabinett …“ (ganzer Satz siehe Kapitel 3) | Z | S. 454 f. | `echo.k3.koenig` |
| `mannlich.11` | „Die Mauern waren mit Brettern verschalt, und diese mit grünem, von Arabesken durchzogenem Damast bespannt …“ (siehe Kapitel 3) | Z | S. 374 | `echo.k3.galerie` |
| `mannlich.12` | „Hundertundvier Lehnstühle aus vergoldetem Holz …“ (siehe Kapitel 3) | Z | S. 374 | dto. |
| `mannlich.13` | „Als man endlich so weit war, daß die Bilder angehängt werden konnten, verließ er kaum mehr den Saal …“ | Z | S. 374 f. | dto. |
| `mannlich.14` | „Dann setzte es der Kommissär im Namen der Nation mit brennender Fackel in Flammen.“ (eine Zeile, nach der Fackel; siehe Kapitel 3) | Z | S. 461 | `echo.k3.fackel` |

Rechtschreibung: Zitate behalten die Schreibung von 1910 („daß“, „Gemächer zu ebener Erde“). Alles andere im Spiel folgt der heutigen Rechtschreibung.

### 7.2 Herzog Karl II. August

Nur Stimme, nie Gestalt. Heiser (Schnupfen, FAKT S. 422), ruhig, unentschlossen. Spricht Untergebene in der dritten Person an („Gib Er …“, „Hole Er …“).

| id | Text | Art | Seite |
| --- | --- | --- | --- |
| `herzog.01` | „Diese Nachricht scheint mir unglaubwürdig; der gute Mann will einige Taler verdienen, das ist alles. Gib ihm einen Dukaten, und er ziehe in Frieden!“ | Z | S. 423 |
| `herzog.02` | „Da wir abreisen müssen, so wollen wir es tun! Aber, Abbé, Ihn nehme ich mit mir.“ | Z | S. 423 |
| `herzog.03` | „Hole Er sich Hemden, da Er sie nun einmal braucht; ich gebe Ihm eine halbe Stunde Zeit dazu. Gehe Er!“ | Z | S. 423 |
| `herzog.04` | „Ich lasse Ihn hier, mein lieber Mannlich, um über meine Galerie zu wachen und sie zu retten, wenn es Ihm möglich ist. Ich weiß, wem ich sie anvertraue; desgleichen empfehle ich Ihm mein Naturalienkabinett, meine Bibliothek und alles, was ich nicht habe mit mir nehmen können.“ | Z | S. 423 |
| `herzog.05` | „Adieu, mein lieber Mannlich, ich hoffe Ihn bald wiederzusehen. Bleibe Er stets mein Freund!“ | Z | S. 424 |

Im Spiel (Playtest Runde 4: 68 s Lauschen an der Tür → unter 20 s Blick durch den Türspalt) spricht der Herzog nur noch `herzog.01` („Unglaubwürdig. Gib ihm einen Dukaten!“) und `herzog.05` („Adieu, mein lieber Mannlich. Er wache über meine Galerie.“), beide als gekürzte Zitate gekennzeichnet; der Inhalt von `herzog.02`–`.04` steht (teils wörtlich, teils nacherzählt) auf den Karten der Erinnerungen „Die Warnung“ und „Der Abschied“; `mannlich.09` entfällt.

### 7.3 Weitere historische Personen

| Person | Zeile | Art | Seite | Ort |
| --- | --- | --- | --- | --- |
| Schügens, Leibjäger | Bericht über den Bauern (siehe `echo.k2.warnung`) | P | S. 422 f. | Kap. 2 |
| Pfeffel | „… auf der Stelle abzufahren; es sei nur zu wahr … einen perfiden Anschlag …“ | P | S. 423 | Kap. 2 |
| Rosé, Leibarzt | Bett und Tee | P | S. 423 | Kap. 2 |
| Abbé Salabert | „Das ist ein neuer Beweis von Güte, Durchlaucht …“ | P | S. 423 | Kap. 2 |
| Freiherr von Esebeck | „Bleiben Sie ferne! Ich beschwöre Sie.“ | Z | S. 390 | Kap. 1 |
| Feuerwerker aus Straßburg | „Ich möchte nicht dreißig Schritt von diesem Gerüst entfernt sein und es nicht um alles Gold der Welt besteigen.“ | Z | S. 389 | Kap. 1 |
| General Landremont | „Was bedeuten denn die Feuer, die ich dort unten im Walde habe leuchten sehen?“ | Z | S. 427 f. | Kap. 2 |
| Handwerker (namenlos) | „Das sind Kalköfen.“ | Z | S. 428 | Kap. 2 |
| Kommissär (namenlos) | „Im Namen der Nation!“ | P (nach S. 461) | S. 461 | Kap. 3 |
| Höfling (namenlos) | „Obacht auf die Bilder!“ | Z | S. 374 | Kap. 3 |
| **Nikel Pfeiffer** | **spricht nicht** | – | – | Kap. 2 |

Alle [Z]-Zeilen dieses Abschnitts sind am OCR-Text des archive.org-Scans gegengelesen. Vor dem Einbau trotzdem einmal am Seitenbild prüfen (OCR-Fehler wie „feinen“ statt „seinen“).

---

## 8. Nebenfiguren (FIKTION, namenlos)

### 8.1 Unauffällig (Kapitel 1, `k1_0b`/`k1_0c`, FIKTION `cx.46`)

- **Liese, Wäscherin** (`liese`): warm, praktisch, redet in Arbeit und Wetter; sagt „Er“ zum Fremden. Leiht den Rock gegen einen Gefallen („Sag Er keinem, woher, und bring Er ihn mir sauber wieder.“). Kaspar ist ein kranker Lakai, sein Rock hängt auf ihrer Leine.
- **Der Hofgärtner** (`hofgaertner`): knapp, stolz auf seinen Rasen, misstrauisch gegen alles, was rennt („Ein Gärtner rennt nie.“). Gibt Papier und Siegellack, wenn man ordentlich aussieht.
- **Die Gardisten** (`gardist`, `gardist-tor`) und **der Lakai** (`lakai`): Dienst nach Vorschrift, trocken, nie grausam. Musterung: „Der Herr Sekretär vom Herrn Hofrat Amsel. Steht drin.“ Hinausbegleiten als Running Gag, acht Varianten je Zone (`court.eject.<zone>.1–8`, `src/systems/court-k1`).
- Keine 1789-Figur zitiert Knigges „Umgang“; nur Laub darf („Sey ernsthaft…“, `laub.k1.wahrhaftig`, Quelle KNIGGE-UMGANG-1790). Hofrat Amsel ist erfunden; kein Brief in Knigges Namen.

Wachen, Diener, Soldaten, Plünderer, Fuhrleute. Sie sprechen nur in ihren Echos (Kapiteldateien), immer mit Marke „Erinnerung (Fiktion)“. Regeln: kurze Sätze, Alltag, Arbeit, Geld, Wetter. Keine Gräuel, keine Beleidigungen von Gruppen. Französische Soldaten sprechen Deutsch mit einem einzelnen französischen Wort, nicht mit Akzent-Schreibung.
