# Die Enden

> **Action-RPG-Umbau (2026-11, docs/ACTION-RPG.md §11.5).** Die Enden bleiben, wie sie sind: Wahl am Tisch (Museum / Feuer / Behalten), Epilog aus den Haltungen und `flag.k3_objekt`, Abspann, „Ende noch einmal wählen“. Die Haltungen kommen jetzt aus den Abgaben der Aufträge (Hanne, Laub, Peter, Jost) und tragen die Werte der Enden-Datei (`herzog_selbst`, `lohn_steine`, `herr_suchen`, `chronik_bewachen` …); der Ersatz-Epilog in der Story-Datei kennt beide Schreibweisen. Vom Finale (W8) bis zum Abspann ist der Kampf aus (`combat.disabled`): Hier gewinnt niemand etwas mit einem Stab.

Alles in dieser Datei ist **FIKTION**, außer den ausdrücklich markierten Sätzen. Kein Ende ist richtig oder falsch. Es gibt keine Wertung, keine Punkte, keinen „wahren“ Schluss.

| | |
| --- | --- |
| Ära | `heute`, Morgengrauen nach dem Finale |
| Ort | Zwinger (Ende des Finales) → Feldstation (760/−930) |
| Dauer | ≈ 5 min, davon 2–3 min Epilog zum Lesen |
| Voraussetzung | Finale gespielt (`flag.k4_finale`), Horn genommen |

---

## 1. Übergang

Nach dem Finale (W8) wird es hell. Die Hunde sind fort, nur ihre Abdrücke liegen im Raureif, im Kreis um die Stelle, an der du gelegen hast. Du stehst auf. Das Horn liegt in deiner Hand, kalt und echt.

Abblende. Feldstation. Marlene sitzt auf der Stufe des Bauwagens, zwei Becher Kaffee neben sich.

- `marlene.end.morgen`: „Da bist du ja. Ich hab die ganze Nacht Licht gesehen da oben am alten Zwinger. Erst dachte ich, Kalköfen.“ (Pause.) „Das war ein Witz. Kalköfen gibt's hier keine mehr.“
- `laub.end.morgen`: „Sagen Sie ihr nichts. Oder alles. Sie wird es ohnehin aufschreiben.“

Auf dem Tisch im Bauwagen liegt die Chronik, jetzt vollständig: die Fallseiten aller Kapitel, mit Laubs Kurrent zwischen den Zeilen und Solls Spalten „Wem – Was – Wann – Wo“. Daneben das Horn, die Bussole und der Gegenstand aus dem Festsaal (`flag.k3_objekt`; wenn „nichts“, liegt dort nichts).

Wenn noch eine LESART leer ist, sagt Laub: „Sie haben noch Lücken gelassen. Das darf man. Aber man muss es wollen.“ Der Spieler kann sie füllen oder mit „Leer lassen“ bestätigen (`flag = offen`).

---

## 2. Die Wahl

Drei Handlungen, alle am Tisch. Interaktion: E auf den jeweiligen Gegenstand halten (3 s), dann eine Bestätigung „Bist du sicher? Das lässt sich nicht ändern.“ Danach gibt es kein Zurück, außer einem neuen Spiel (der Spielstand bleibt; im Hauptmenü „Ende noch einmal wählen“ für alle, die alle drei sehen wollen).

| id | Handlung | Taste/Objekt | Was mit dem Horn geschieht | `flag.end` |
| --- | --- | --- | --- | --- |
| `end.museum` | Die Chronik in die graue Archivschachtel legen, die Marlene mitgebracht hat | Schachtel | Du bläst es einmal, lang und fallend: abgeblasen | `museum` |
| `end.verbrennen` | Die Chronik in den Ofen des Bauwagens legen | Ofen | Du legst es zurück auf die Mauer am Zwinger | `verbrennen` |
| `end.behalten` | Die Chronik zur Bussole in die Schublade legen | Schublade | Du hängst es an den Haken neben der Tür | `behalten` |

Laub sagt vor der Wahl genau einen Satz (`laub.end.vorher`): „Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.“

---

## 3. Ende A: Ins Museum (`end.museum`)

**Szene.** Du legst die Seiten in die Schachtel. Marlene schreibt mit Filzstift „Karlsberg, Funde ohne Fundort“ darauf und streicht „Funde“ wieder durch. Draußen auf der Lichtung setzt du das Horn an. Kein schöner Ton, ein fallender, kratziger. Im Wald antwortet nichts. Dann, sehr weit weg, legt sich etwas hin. Man hört es nicht, man weiß es.

**Laub.**
- `laub.end.museum_1`: „Abgeblasen. Nach zweihundertdreiunddreißig Jahren. Ich werde das als Überstunden einreichen.“ (1793 bis 2026; wenn das Spiel das Jahr nicht kennt, ohne Zahl: „Nach über zweihundert Jahren.“)
- `laub.end.museum_2`: „Eine Akte, die geschlossen wird, ist eine Akte, die man lesen kann. Bringen Sie sie dahin, wo man nachschaut, bevor man glaubt. Mit Quellen. Auch die, die mir nicht gefallen.“
- `laub.end.museum_3`: „Und schreiben Sie auf das Schild, dass ich die fünfzig Meter nicht verschuldet habe.“
- (Die Nadel der Bussole dreht sich zum ersten Mal im Spiel ruhig nach Norden und bleibt dort. Laub ist still. Er ist nicht fort, er ist pensioniert.)

**Marlene.**
- `marlene.end.museum`: „Ich fahr's nächste Woche hin. Und dem Forstamt sag ich, sie sollen die Gräben dem Denkmalamt melden. Gucken ja, graben nein. Das hast du mir beigebracht.“ (FAKT im Kern: Bodendenkmäler sind im Saarland geschützt, Fundmeldepflicht nach SDschG; `cx.35`.)

**Bild zum Schluss.** Eine Vitrine in einem Museum, nicht näher benannt. Darin der Gegenstand aus dem Festsaal (siehe Abschnitt 6) und eine einzelne Chronikseite unter Glas. Das Schild davor ist der Epilog (Abschnitt 6).

---

## 4. Ende B: Verbrennen (`end.verbrennen`)

**Szene.** Du öffnest die Ofenklappe. Die Seiten brennen nicht schnell, sie rollen sich ein und werden durchsichtig, und für einen Atemzug sieht man durch jede eine Erinnerung: den Ehrenhof im Abendlicht von 1789, ein Feuerwerk über den Dächern, die Meute im Nebel der Apfelallee. Dann ist es Asche. Du gehst zum Zwinger und legst das Horn auf den Mauerrest. Kein Horn mehr in der Nacht.

**Laub.**
- `laub.end.verbrennen_1`: „Gut. Sie haben lange genug gesucht. Die Hunde und ich.“
- `laub.end.verbrennen_2`: „Was im Buch stand, steht auch woanders. Bei Mannlich, in den Akten, im Boden. Nur die Namen nicht. Die Namen tragen jetzt Sie.“
- `laub.end.verbrennen_3`: „Machen Sie das Licht aus, wenn Sie gehen. Das habe ich nie gelernt.“
- (Seine Stimme wird leiser, nicht abrupt. Die Bussole ist danach eine gewöhnliche Bussole. Ihre Nadel zeigt nach Norden, ein wenig zittrig, wie alle Nadeln.)

**Marlene.**
- `marlene.end.verbrennen`: „Riecht nach Herbstfeuer. Komisch. Riecht gar nicht nach Papier.“ (Pause.) „Hast du gut gemacht. Ich weiß nicht, was, aber gut.“

**Bild zum Schluss.** Der Zwinger im Morgenlicht, Raureif, das Horn auf der Mauer. Kein Abdruck im Raureif außer deinem eigenen.

---

## 5. Ende C: Behalten (`end.behalten`)

**Szene.** Du legst die Chronik in die Schublade zur Bussole und schiebst sie zu. Das Horn hängst du an den Haken neben der Tür. Marlene sieht es an und sagt nichts. Am Abend, als du den Bauwagen abschließt, liegen fünf Abdrücke im Raureif vor der Stufe. Sie führen nicht weg.

**Laub.**
- `laub.end.behalten_1`: „Sie behalten uns. Das ist unvernünftig. Ich bin sehr gerührt.“
- `laub.end.behalten_2`: „Dann bleibt die Jagd offen. Die Hunde laufen weiter, aber jetzt hinter Ihnen her, nicht vor Ihnen weg. Das ist ein Unterschied, den man spürt, wenn es dunkel wird.“
- `laub.end.behalten_3`: „Und ich bleibe im Dienst. Ohne Tagegeld. Wie gehabt.“

**Marlene.**
- `marlene.end.behalten`: „Lass das Horn da hängen. Das passt zum Bauwagen. Aber blas nicht drauf, wenn ich schlafe.“

**Bild zum Schluss.** Nacht. Von der Kuppe über dem Tal sieht man die Lichter von Homburg und darüber den dunklen Schlossberg. Ganz leise, aus der Richtung der Hohenburg, ein Horn, falsch und zu hoch. Jost hat nie richtig blasen gelernt.

**Spielfolge:** Im freien Spiel nach dem Ende C (falls gebaut) erscheinen nachts fünf Hunde in 20 m Abstand hinter dem Spieler und bleiben stehen, wenn er stehen bleibt. Sie stellen niemanden mehr.

---

## 6. Der Epilog (Text, aus Bausteinen)

Der Epilog ist ein Text auf einer Seite, wie das Schild im Museum (A), eine letzte Notiz im Ofenlicht (B) oder ein Eintrag in Laubs Kurrent auf der letzten Seite (C). Er besteht aus: **Einleitung je Ende** → **sechs Lesart-Sätze** (in dieser Reihenfolge) → **Gegenstand** → **Schluss je Ende**. Jeder Baustein ist ein Satz. Fehlende Flags (`offen`) nehmen den Satz „offen“.

### 6.1 Einleitung

- **A (Museum):** „Karlsberg bei Homburg, 1777–1793. Was das Feuer nicht fraß. Diese Seiten führte ein Kanzlist neben den Rechnungen des Hofes. Er schrieb auf, was der Hof schuldig blieb.“
- **B (Verbrennen):** „Was ich weiß, schreibe ich hier einmal hin, und dann nicht wieder.“
- **C (Behalten):** „Fortgesetzt im November, wie das letzte Mal. Q. L. und ich.“

### 6.2 Lesart-Sätze

**Spuren (Prolog, `flag.p_spuren`)**
- hunde: „In der Punktwolke von 2025 liefen Spuren durch den Wald, und ich habe sie für Hunde gehalten.“
- wild: „In der Punktwolke von 2025 liefen Spuren durch den Wald. Wild, dachte ich zuerst.“
- messfehler: „In der Punktwolke von 2025 liefen Spuren durch den Wald. Ein Messfehler, dachte ich zuerst. Das denkt man immer zuerst.“
- offen: „Was die Spuren in der Punktwolke waren, habe ich nicht entschieden.“

**Hannes Lohn (Kapitel 1, `flag.k1_lohn`)**
- will_nicht: „Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil der Herzog nicht zahlen wollte.“
- creuzer: „Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil ein Präsident die Kassen geleert hatte, auch die der Witwen und Waisen.“
- hunde_bilder: „Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil das Geld in tausend Hunde und tausend Bilder ging.“
- getaeuscht: „Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht. Man sagt, der Herzog sei getäuscht worden. Bezahlt hat er trotzdem nicht.“
- offen: „Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht. Warum, ist eine Frage, die ich offenlasse.“

**Der Warner (Kapitel 2, `flag.k2_pfeiffer` + `flag.k2_stelle`)**
- treu: „Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald und kletterte über den Zaun, aus Treue.“
- dorf: „Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald, damit die Reiter sein Dorf schneller wieder verließen.“
- lohn: „Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald. Der Herzog glaubte, für Geld. Er bekam einen Dukaten.“
- angst: „Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald, weil er Angst hatte. Angst ist auch ein Grund, das Richtige zu tun.“
- offen: „Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald. Warum, hat er niemandem aufgeschrieben.“
- Zusatz nach `flag.k2_stelle`: gewarnt → „Ich hätte es auch getan.“ · geschwiegen → „Ich hätte geschwiegen, und ich weiß nicht, ob ich mich dafür schäme.“ · gefuehrt → „Ich hätte die Reiter geführt. Das schreibe ich hier auf, damit es wenigstens einer weiß.“ · offen → kein Zusatz.
- Zusatz nach `flag.k2_tor`: leuchten → „Als die Wagen abfuhren, habe ich ihnen geleuchtet.“ · dunkel → „Als die Wagen abfuhren, stand ich im Dunkeln.“

**Die Plünderer (Kapitel 3, `flag.k3_pluenderer`)**
- schuld: „Am 28. Juli 1793 nahmen die Leute aus den Dörfern sich, was man ihnen schuldete.“
- stahlen: „Am 28. Juli 1793 stahlen die Leute aus den Dörfern, was nicht niet- und nagelfest war, und dann die Nägel.“
- retteten: „Am 28. Juli 1793 retteten die Leute aus den Dörfern, was zu retten war. Ein Stuhl steht heute vielleicht noch in einer Stube.“
- alle: „Am 28. Juli 1793 taten die Leute aus den Dörfern, was alle taten.“
- offen: „Was die Leute aus den Dörfern am 28. Juli 1793 taten, mag ich nicht in ein Wort fassen.“

**Die Zerstörung (Kapitel 4, `flag.k4_zerstoerer` + `flag.k4_steine`)**
- franzosen: „Angezündet haben ihn die Franzosen.“
- herzog: „Zerstört hat ihn am Ende der, der ihn so gebaut hat.“
- steintraeger: „Abgetragen haben ihn die Leute aus Homburg, Stein für Stein.“
- vergessen: „Zerstört hat ihn am Ende das Vergessen. Dagegen hilft nur Aufschreiben.“
- offen: „Wer ihn zerstört hat, weiß jeder anders.“
- Zusatz nach `flag.k4_steine`: raub → „Die Steine in Homburg sind Raub am Raub.“ · lohn → „Über einer Tür in Homburg liegt ein Stein mit einem Winkel und drei Punkten. Er ist der Lohn.“ · neuanfang → „Das Schloss steckt in hundert Häusern. Es ist nicht weg, es ist überall.“ · nur_steine → „Es sind nur Steine. Was daran hängt, hängen wir dran.“ · offen → kein Zusatz.

**Die Meute (Kapitel 4, `flag.k4_meute`)**
- herr: „Die Hunde suchten ihren Herrn, der nach Mannheim gefahren war, ohne abzublasen.“
- chronik: „Die Hunde liefen dort, wo eine Seite lag.“
- heimtreiben: „Die Hunde haben jeden heimgetrieben, der sich zu lange im Vergessen aufhielt. Fast jeden.“
- nie_abgeblasen: „Die Jagd wurde nie abgeblasen. So einfach war das.“
- offen: „Warum die Hunde liefen, weiß Jost. Ich habe ihn nicht gefragt.“
- Danach immer: „Sie hießen Diane, Sultan, Fanfare, Rauhreif und Bijou.“

### 6.3 Der Gegenstand (`flag.k3_objekt`)

| Wert | A (Museum) | B (Verbrennen) | C (Behalten) |
| --- | --- | --- | --- |
| tuergriff | „Daneben: ein Türgriff. Er war an der Tür zum Festsaal. Die Wand dahinter hat Matthes gemauert.“ | „Den Türgriff habe ich behalten. Eine Tür, die es nicht mehr gibt, braucht trotzdem einen Griff.“ | „Der Türgriff liegt in der Schublade bei der Bussole. Manchmal fasse ich ihn an, bevor ich hinausgehe.“ |
| dukat | „Daneben: ein Dukat mit dem Bild des Schlosses. Einen solchen bekam ein Bauer aus Rohrbach, oder auch nicht.“ | „Den Dukaten habe ich Marlene gegeben. Sie sagt, sie kauft sich nichts davon.“ | „Der Dukat liegt in der Schublade. Er ist das einzige Geld, das der Hof je zurückgezahlt hat, und auch nur an mich.“ |
| uhr | „Daneben: eine vergoldete Uhr mit Alabaster. Sie geht noch. Sie weiß nicht, was passiert ist.“ | „Die Uhr steht im Bauwagen und geht. Ich ziehe sie jeden Sonntag auf.“ | „Die Uhr tickt in der Schublade, neben der Bussole. Laub sagt, sie geht vor.“ |
| nichts | „Daneben: nichts. Das Fach ist leer, und auf dem Schild steht: ‚Was nicht gerettet wurde.‘“ | „Gerettet habe ich nichts. Das ist auch eine Antwort.“ | „In der Schublade ist Platz für etwas, das ich nicht genommen habe.“ |

FAKT-Hinweis für den Codex: Ein Türgriff, ein Dukat mit Schlossansicht und eine vergoldete Uhr mit Alabaster vom Karlsberg wurden 2018 in der Ausstellung „Steinerne Macht“ gezeigt (RP18, `cx.27`). Ob der im Spiel gerettete Gegenstand „dieser“ war, weiß niemand. Im Spiel steht kein echtes Museum.

### 6.4 Schluss

- **A (Museum):** „Quellen: Mannlich, Lebenserinnerungen. Die Akten. Der Boden. Und ein Geometer, der auf seinen fünfzig Metern besteht.“ Danach Laub, nur als Untertitel: „Ich bestehe darauf.“
- **B (Verbrennen):** „Jetzt ist es still. Gute Nacht, Laub. Gute Nacht, Diane, Sultan, Fanfare, Rauhreif, Bijou.“
- **C (Behalten):** „Wird fortgesetzt.“ Darunter, in Josts ungelenker Schrift, die beim Lesen erscheint: „Jost war auch da.“

---

## 7. Nach dem Epilog

1. Abspann (Credits, Quellen und Lizenzen, siehe `09-ui-texte.md`).
2. Danach die Feldstation im Heute, frei begehbar. Alle Werkzeuge bleiben. Kein Zeitwechsel mehr möglich, außer bei Ende C (dort ist Q an allen Ankern weiter offen, ohne Meute).
3. Hauptmenü: Eintrag „Ende noch einmal wählen“ lädt den Stand vor 6.2.
4. Codex vollständig freigeschaltet.

**Errungenschaften (optional, keine Wertung):** „Abgeblasen“ (A), „Ruhe“ (B), „Fortgesetzt“ (C), „Alle Steine“ (Wandernde Steine 4/4), „Nichts genommen“ (`flag.k3_objekt = nichts`), „Leer gelassen“ (mindestens eine LESART offen). Keine Errungenschaft für Tempo oder fürs Gestelltwerden.
