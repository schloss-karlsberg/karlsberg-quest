# Die Enden und das Abschlussfest

Die drei Enden führen über die Wahl, Laubs Szene und den Epilog zum Fest auf dem heutigen
Schlossplateau. Die [Enden-Datei](../story/05-enden.story.json) und das
[Party-Pack](../packs/party.pack.json) enthalten die gespielten Szenen und Zeilen.
Die Szenen sind **FIKTION**. Alle drei Entscheidungen schließen die Geschichte ab.

## 1. Übergang

Nach dem Finale am Zwinger beginnt `enden/e1` im Heute. Der Checkpoint des Kapitels liegt an der
Karlsbergquelle. Der Kampf bleibt bis zum Abschluss gesperrt. Der Entwurf für die Verlegung der
Wahl an den Rand des Plateaus sieht Laubs letzten Rat an der Quelle und Nachrichten von Gerold,
Marlene und Soll vor.

## 2. Die Wahl

Laub sagt vor der Wahl: „Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.“
Der Spieler wählt im Dialog und bestätigt die Entscheidung. Die Objekte in der letzten Spalte
gehören zur geplanten Inszenierung am Plateaurand.

| Runtime-ID | Entscheidung | Entwurf am Plateau |
| --- | --- | --- |
| `museum` | Ins Museum | Graue Archivschachtel von Marlene. Das Horn bläst die Jagd ab. |
| `burn` | Verbrennen | Feuerschale. Das Horn bleibt auf einem Baumstumpf am Rand der Lichtung. |
| `keep` | Behalten | Chronik und Bussole im Rucksack. Das Horn bleibt um den Hals. |

## 3. Ende A: Ins Museum

Marlene legt die Chronik in die Archivschachtel. Die Jagd wird abgeblasen und Laubs Nadel richtet
sich nach Norden. Die Museumsfassung des Epilogs betont Namen, Belege und Quellen.

- `laub.end.museum_1`: „Abgeblasen. Nach {jahre:1793} Jahren. Ich werde das als Überstunden einreichen.“
- `laub.end.museum_2`: „Eine Akte, die geschlossen wird, ist eine Akte, die man lesen kann. Bringen Sie sie dahin, wo man nachschaut, bevor man glaubt. Mit Quellen. Auch die, die mir nicht gefallen.“
- `laub.end.museum_3`: „Und schreiben Sie auf das Schild, dass ich die fünfzig Meter nicht verschuldet habe.“
- `marlene.end.museum`: „Ich fahr’s nächste Woche hin. Und dem Forstamt sag ich, sie sollen die Gräben dem Denkmalamt melden. Gucken ja, graben nein. Das hast du mir beigebracht.“ (Denkmalschutz: `cx.35`.)

## 4. Ende B: Verbrennen

In den einrollenden Seiten blitzen letzte Erinnerungen auf, bis die Schrift zu Asche wird.
Laubs Stimme wird leiser. Der Festentwurf greift das Bild mit einer Feuerschale auf.

- `laub.end.verbrennen_1`: „Gut. Sie haben lange genug gesucht. Die Hunde und ich.“
- `laub.end.verbrennen_2`: „Was im Buch stand, steht auch woanders. Bei Mannlich, in den Akten, im Boden. Nur die Namen nicht. Die Namen tragen jetzt Sie.“
- `laub.end.verbrennen_3`: „Machen Sie das Licht aus, wenn Sie gehen. Das habe ich nie gelernt.“
- `marlene.end.verbrennen`: „Riecht nach Herbstfeuer. Komisch. Riecht gar nicht nach Papier. … Hast du gut gemacht. Ich weiß nicht, was, aber gut.“

## 5. Ende C: Behalten

Laub bleibt im Dienst. Die Jagd bleibt offen und die Hunde folgen dem Spieler. Im Festmotiv liegen
Diane und Bijou zu seinen Füßen. Der Entwurf verlegt die fünf Abdrücke aus dem Raureif ins Laub
am Rand der Lichtung.

- `laub.end.behalten_1`: „Sie behalten uns. Das ist unvernünftig. Ich bin sehr gerührt.“
- `laub.end.behalten_2`: „Dann bleibt die Jagd offen. Die Hunde laufen weiter, aber jetzt hinter Ihnen her, nicht vor Ihnen weg. Das ist ein Unterschied, den man spürt, wenn es dunkel wird.“
- `laub.end.behalten_3`: „Und ich bleibe im Dienst. Ohne Tagegeld. Wie gehabt.“
- `marlene.end.behalten` (Entwurf am Plateau): „Lass das Horn um. Steht dir. Aber blas nicht drauf, wenn Gerold redet.“

## 6. Der Epilog (Text, aus Bausteinen)

Der [Generator](../../scripts/content-build/epilogue-deeds.mjs) enthält die gespielte Fassung.
Nach der Einleitung je Ende folgt pro Abschnitt der erste zutreffende Taten-Satz oder die
Ersatzzeile. Der optionale Gegenstand aus dem Festsaal (`flag.k3_objekt`) und der Schluss hängen
vom Ende ab. Die drei Taten aus „Vermessung“ können aus alten Spielständen stammen.
Die Umschreibung von Ofen- und Schubladenbildern auf Feuerschale und Rucksack gehört zur
geplanten Anpassung der Enden.

### Entwurf für den Abschnitt „Führung“

- Alle Messaufträge erledigt – „Für Marlene habe ich den halben Wald nachgemessen. Sie sagt, ich darf wiederkommen, ohne Führung.“
- Einzelne Messaufträge erledigt – „Für Marlene habe ich ein paar Stellen im Wald nachgemessen. Gegraben habe ich nicht.“
- Standard – „Ich war auf einer Führung. Das Reh habe ich fotografiert, den Rest habe ich mir gemerkt.“
- Irrlichter gebannt – „Über dem Weiher waren Lichter. Ich habe sie nicht gefragt, woher.“
- Alle vorgesehenen Motive im Album – „Im Telefon habe ich sieben Bilder, und auf keinem ist ein Schloss.“

### Historische Lesart-Fassung

Die folgenden Textbausteine stammen aus dem Fallseiten-Entwurf. Sie halten frühere Varianten fest.
Die aktuelle Auswahl beruht auf den Taten im Spiel.

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
| uhr | „Daneben: eine vergoldete Uhr mit Alabaster. Sie geht noch. Sie weiß nicht, was passiert ist.“ | „Die Uhr steht bei mir zu Hause. Ich ziehe sie jeden Sonntag auf.“ | „Die Uhr tickt in der Schublade, neben der Bussole. Laub sagt, sie geht vor.“ |
| nichts | „Daneben: nichts. Das Fach ist leer, und auf dem Schild steht: ‚Was nicht gerettet wurde.‘“ | „Gerettet habe ich nichts. Das ist auch eine Antwort.“ | „In der Schublade ist Platz für etwas, das ich nicht genommen habe.“ |

FAKT-Hinweis für den Codex: Ein Türgriff, ein Dukat mit Schlossansicht und eine vergoldete Uhr mit Alabaster vom Karlsberg wurden 2018 in der Ausstellung „Steinerne Macht“ gezeigt (RP18, `cx.27`). Ob der im Spiel gerettete Gegenstand „dieser“ war, weiß niemand. Im Spiel steht kein echtes Museum.

### 6.4 Schluss

- **A (Museum):** „Quellen: Mannlich, Lebenserinnerungen. Die Akten. Der Boden. Und ein Geometer, der auf seinen fünfzig Metern besteht.“ Danach Laub, nur als Untertitel: „Ich bestehe darauf.“
- **B (Verbrennen):** „Jetzt ist es still. Gute Nacht, Laub. Gute Nacht, Diane, Sultan, Fanfare, Rauhreif, Bijou.“
- **C (Behalten):** „Wird fortgesetzt.“ Darunter, in Josts ungelenker Schrift, die beim Lesen erscheint: „Jost war auch da.“

---

## 7. Nach dem Epilog

Der Beat `e3` setzt das Fest in der Dämmerung am Rand des Plateaus an. Gerolds Rede, die
Kamerafahrt mit Abspann und das anschließende freie Spiel schließen die Tour ab.
„Ende noch einmal wählen“ in der Pause lädt die Wahl erneut.

Als optionale Errungenschaften waren „Abgeblasen“, „Ruhe“, „Fortgesetzt“, „Alle Steine“ und
„Nichts genommen“ vorgesehen. Zum Fallseiten-Entwurf gehörte außerdem „Leer gelassen“.

## 8. Das Fest

**Szenenentwurf.** Die folgenden Orts-, Figuren- und Dialogskizzen geben die Richtung vor. Den gespielten Ablauf und die kurzen Zeilen definiert der Beat `e3`.

**Ort.** Plateau, die heutige Ehrenhof-Lichtung (TF-01, 1216/−1114, eben, r ≈ 35), mit Wald und flachen Mauerzügen.
**Licht.** Dämmerung, letzter roter Streifen im Westen, warmweiße Lichterketten, Feuerschale und Laternen der Gruppe. Das Feuerwerk gehört zur Erinnerung an 1785 (`cx.14`).
**Ton:** leises Stimmengewirr, ein Kind, Hunde, Gläserklirren, kein Musikstück mit Text.

### 8.1 Wer da ist

| Person (heute) | Figur 1789 | Ort beim Fest (x/z, prüfen) | Tun |
| --- | --- | --- | --- |
| Gerold Imhoff | – | 1214/−1112, am Tisch | schenkt Glühwein aus, hält die Abschlussrede |
| Marlene | (sie selbst) | 1220/−1118 | Stativ zusammengeklappt, „Ach, behalt ihn“ zur Leihgabe |
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
Marlene hat die Archivschachtel auf den Tisch gestellt. Gerold hebt die oberste Seite vorsichtig ins Licht der Lichterkette.
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

**Im Spiel (05-enden.story.json, Beat e3):** jede Halt-Einstellung dauert ≈ 2,2 s, darum sind die Zeilen dort auf höchstens 46 Zeichen gekürzt (z. B. Carl Herzog: „Nächstes Mal fahr ich aber hoch.“, Gerold: „Danke fürs Mitkommen. Gucken ja, graben nein.“). Die langen Fassungen oben leben teils in den Nachspielzeilen beim Ansprechen nach dem Abspann (`content/packs/party.pack.json`). Gerolds Rede (§8.3) läuft vor dem Abspann; Der Stab-Dialog (Schritt 2) und die letzten Bilder (Schritt 5) sind Entwürfe.

Laub ist beim Fest **nur Stimme** in der Bussole (A: schweigt, „pensioniert“; B: wird leiser, wie im alten Ende; C: ein Satz, nur für dich: „Gute Gesellschaft. Ich bleibe im Dienst.“).

### 8.5 Regeln

- Kein Alkohol im Bild trinken; Glühwein steht da, Becher in der Hand ist in Ordnung, niemand wird betrunken. Ein Kinderpunsch-Topf daneben. Keine Marke an Bechern, Töpfen, Tisch.
- Die Doppelgänger werden nie aufgeklärt („Ich bin der Herzog von früher“ gibt es nicht). Nur Echos.
- Keine Fanfare, kein Feuerwerk, keine Wertung des Endes.
- `combat.disabled` bleibt bis nach dem Fest gesetzt; Ende C schaltet danach die Folge-Meute (5 Hunde in 20 m) wie bisher.
