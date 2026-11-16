# Kapitel 2 „Die Flucht“

| | |
| --- | --- |
| Ära | `1793-02`: Nacht vom 9. auf den 10. Februar 1793 (ein Samstag), Frost, Bodennebel, Raureif |
| Dauer | 25–30 min |
| Anker | A: Parkzaun am Carlsluster Torhaus (1680/−400). B: Ehrenhof 1793-02 (1192/−1115), frei, sobald man `echo.k2.warnung` gehört hat |
| Ölvorrat | 7 min je Wechsel (Nebel schluckt Licht; sanfter Modus +50 %) |
| Ziel | Der Spur des Warners folgen, die Warnung hören, die Abfahrt sehen und der Jagd entkommen, die niemand abgeblasen hat |
| Ende | Fallseite „Die Flucht“ ganz bestätigt (alle 6 FAKT) → Kapitel 3 offen |

**Ton.** Kalt, leise, gehetzt. Kein Musikteppich, nur Atem, Schritte im Raureif, ein Hund in der Ferne. Die Komik liegt beim Hof: Der Herzog hat Schnupfen, der Leibarzt verschreibt Bett und Tee, während die Kavallerie durch den Wald kommt. Nikel Pfeiffer ist nie lächerlich. Er spricht nicht, man sieht nur seine Spur.

**Was belegt ist.** Die Warnung durch einen Bauern, der über den Parkzaun kletterte, die Worte des Herzogs, die Abfahrt gegen 10 Uhr, die Frage des Generals und die Antwort „Das sind Kalköfen“ (alles M1910 S. 422–428). Das Datum stammt aus den Notizen des Regierungsrats Horstmann (M1910 S. 427, Anm. 1). Der Name Nikel Pfeiffer aus Rohrbach steht in WP-K2A. **Erfunden** sind der Laufweg der Spur, alle Figuren außer den genannten historischen Personen, die Meute und der Pikeur.

---

## 1. Ablauf

**2.0 – Feldstation.** Der Deckel der Bussole ist von innen beschlagen, darauf Eisblumen. Marlene bringt Kaffee und erzählt vom Warner aus Rohrbach (`marlene.k2.pfeiffer`). Laub ist ungewöhnlich still (`laub.k2.start`).

**Unterwegs (2.0, der Kilometer zum Parkzaun).** Etwa 380 m hinter der Station schlägt fern im Tal ein Hofhund an, ein Hund von heute (Untertitel), und Laub: „Nur ein Hofhund, einer von heute. Merk dir trotzdem, wie das klingt. Drüben, im Februar dreiundneunzig, sind es andere, und die schlagen nicht bloß an.“ (`laub.k2.weg1`). Rund 260 m vor dem Zaun: „Wenn wir drüben sind: schau auf den Boden. Raureif verrät jeden Schritt. Seine. Und deine auch.“ (`laub.k2.weg2`).

**2.1 – Der Parkzaun.** Wechsel am Carlsluster Torhaus. Nacht, Frost, Nebel bis zur Hüfte. Ein Lattenzaun mit Pfählen, dahinter das Wachhäuschen an der Parkschranke (FAKT: Wachhäuser an den Parkschranken, Pleine vue 1791). Am Zaun hängt ein Fetzen grober Wolle, und auf der Innenseite führen Fußspuren durch den Raureif hangaufwärts (`clue.k2.zaun`). Sie leuchten schwach, solange man den Relief-Blick an hat. Laub wundert sich über die Richtung (`laub.k2.richtung`).

**2.2 – Die Apfelallee (Wow W3).** Die Spur folgt der Allee hinauf nach Nordwesten. Nach etwa 200 m: das Horn, ein langer Ton. Rechts im Nebel gehen Augen an, zwei, dann sechs, dann zwölf. Sie bewegen sich nicht, bis du dich bewegst. **Schleich-Abschnitt** (siehe Abschnitt 9): Laterne aus, schleichen, dann verschwinden die Augen. Wer rennt, löst eine kurze Hatz aus, die an der Orangerie-Stützmauer endet.

**2.3 – Die Orangerie.** In Mannlichs Fenstern brennt Licht. Unten im Hof werden Kisten auf einen Wagen geladen. Ein Diener-Echo (`echo.k2.orangerie`): Die Reisewagen stehen seit Tagen bepackt, und Relais sind nach Mannheim vorausgeschickt (FAKT, M1910 S. 422). Die Spur biegt hier nach Norden zum Schloss ab.

**2.4 – Das Wachhaus.** Die Spur endet am nördlichen Wachhaus an der Mündung des Ehrenhofs. Ein Wachfeuer in einer Eisenpfanne. Auf dem Tisch liegt das Wachbuch (`clue.k2.wachbuch`), und die Wache redet (`echo.k2.wache`). Hinter dem Gitter steht der Hof voller Wagen.

**2.5 – Optional: die Galerie.** Durch die Fenster der Bildergalerie fällt ein einzelnes Kerzenlicht. Drinnen kniet Gottlob Soll am Westende der Galerie und hebt ein Bodenbrett neben der Falltür des Büchsenmachers an (`clue.k2.soll`). Er sieht dich nicht. Er legt ein graues Buch hinein und klopft das Brett mit dem Handballen fest. Setzt `flag.k2_versteck_gesehen`. Kein Fallsubstantiv; Kapitel 3 wird dadurch leichter (Laub weiß dann, wo man suchen muss).

**2.6 – Das Schreibkabinett.** Durch das Vestibül, die Antichambre, den Gelben Salon und das Schlafzimmer des Herzogs. Die Tür zum Schreibkabinett ist angelehnt, Licht fällt in einem Streifen heraus. Man sieht Schatten, aber nie den Herzog. E halten an der Tür: `echo.k2.warnung` (Wow-Moment ohne Bild: nur Stimmen). Danach: `echo.k2.abschied`. Mit dem ersten Echo wird der Anker B (Ehrenhof 1793-02) frei. Laub schlägt vor, jetzt zurückzugehen und zu sichern (`laub.k2.sichern`), denn danach wird es laut.

**2.7 – Die Abfahrt.** Ehrenhof, kurz vor 10 Uhr. Wagen, Pferde, Diener mit Laternen. Hanne steht am Gitter (`hanne.k2.*`), Jost kommt vom Zwinger gelaufen (`jost.k2.*`). **Die Wahl am Tor** (`flag.k2_tor`): Wenn die Wagen an dir vorbeifahren, kannst du die Laterne heben und ihnen leuchten (L an) oder sie löschen und im Dunkeln stehen bleiben (L aus). Beides ist erlaubt, keines wird kommentiert, außer von Laub, und erst später (`laub.k2.tor_*`). Die Wagen fahren nach Norden die Allee hinunter (TF-10) und verschwinden im Nebel.

**2.8 – Die Parforcejagd.** Jost: „Und die Hunde? Hat er was von den Hunden gesagt?“ Keiner antwortet. Dann kommt vom Zwinger im Norden das Horn: zwei kurze Töne. Fünf Hunde aus Rauch und zum ersten Mal der **Pikeur**, ein Reiter ohne Gesicht mit einem Horn um die Brust. Sie kommen die Allee herauf, auf der die Wagen gerade weggefahren sind. Der Weg nach Norden ist zu. Fluchtweg: durch die Durchfahrt des Südflügels auf die Schloßterrasse, dann hinunter zur Orangerie.

**2.9 – „Das sind Kalköfen“ (Wow W4).** Sobald du das Orangerie-Parterre erreichst, läuft eine kurze Sequenz (8 s, Spieler behält die Kontrolle, die Meute hält inne): Ein General galoppiert mit gezogenem Säbel heran und fragt einen Handwerker nach den Feuern unten im Wald (`echo.k2.landremont`). Die Kamera schwenkt den Hang hinab. Zwischen den Bäumen schwanken Lichter. Eines davon ist deine Laterne von vorhin, oder, wenn du am Tor geleuchtet hast, die Laternen der Wagen im Nebel. Dann geht die Jagd weiter.

**2.10 – Der Hang.** Durch das südliche Treppenhaus der Orangerie hinunter auf die untere Terrasse (KB-32), dann gut 400 m den Hang hinab nach Westen bis zum Damm des Karlsbergweihers. Am Überlauf rauscht Wasser. Der Pikeur kann nicht über fließendes Wasser (Regel der Fiktion). Wer über den Damm ist, ist sicher. Q halten.

**2.11 – Feldstation, Cliffhanger.** Wenn die Seite ganz bestätigt ist, taut der Deckel der Bussole. Darunter riecht es nach Rauch. Laub (`laub.k2.ende`): „Vierundzwanzig Wochen und einen Tag später.“ Pause. „Im Juli brennt Stroh am besten.“

---

## 2. Orte und Trigger

| id | Ort | Bezug | x | z | r | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.k2.parkzaun` | Parkzaun mit Wachhäuschen an der Parkschranke | nahe KB-B84 | 1680 | −400 | 30 | 1793-02 | Anker A; `clue.k2.zaun` (Fetzen an 1672/−408, r 3) |
| `loc.k2.apfelallee` | Apfelallee, Augen im Nebel | TF-14, LiDAR KB-14 | Linie 1575/−408 → 1271/−953 | | 10 | 1793-02 | W3 bei 1500/−520 (r 15) |
| `loc.k2.orangerie` | Orangeriehof und -parterre | KB-B10, TF-06, TF-15 | 1275 | −960 | 30 | 1793-02 | `echo.k2.orangerie` (Hinweg), W4 (Jagd) |
| `loc.k2.wachhaus` | Wachhaus Nord an der Ehrenhofmündung | KB-B38 | 1171 | −1123 | 8 | 1793-02 | Wachbuch, `echo.k2.wache` |
| `loc.k2.galerie` | Bildergalerie (optional) | B06.1.bildergalerie (KB-B06) | 1230 | −1220 | Raumpolygon | 1793-02 | Soll am Bodenbrett am Westende, bei der Falltür (1200/−1218, r 2) |
| `loc.k2.kabinett` | Schreibkabinett des Herzogs (Tür vom Schlafzimmer aus) | B01.1.eg-kabinett, B01.1.eg-schlafzimmer | 1269 / 1268 | −1110 / −1115 | Raumpolygon | 1793-02 | `echo.k2.warnung`, `echo.k2.abschied`; schaltet Anker B frei |
| `loc.k2.ehrenhof` | Ehrenhof mit Wagen, Gitter | TF-01, KB-B39 | 1192 | −1115 | 35 | 1793-02 | Anker B; Abfahrt; Wahl am Tor (Gitter 1192/−1115, r 6) |
| `loc.k2.durchfahrt` | Durchfahrt im Südflügel | B02.1.eg-durchfahrt | 1234 | −1092 | Raumpolygon | 1793-02 | Fluchtweg |
| `loc.k2.terrasse` | Schloßterrasse | TF-08 | 1237 | −1071 | 20 | 1793-02 | Fluchtweg |
| `loc.k2.treppe` | Orangerie, Treppenhaus Süd (Keller bis Saal) | B10.0.k-treppe-sued, B10.1.s-treppe-sued | 1250 | −930 | Raumpolygon | 1793-02 | Fluchtweg; Keller sichere Tasche |
| `loc.k2.unterterrasse` | Untere Orangerie-Terrasse | TF-07, LiDAR KB-32 | 1226 | −954 | 15 | 1793-02 | Fluchtweg |
| `loc.k2.damm` | Damm des Karlsbergweihers mit Überlauf | TF-22, TF-20 | 819 | −875 | 25 | 1793-02 | Ziel der Jagd; sicher hinter dem Überlauf |
| `loc.k2.aquaedukt` | Becken der Wasserleitung am Marstall (Alternativziel nach Norden) | KB-B20 | 1190 | −1462 | 12 | 1793-02 | wie Damm |

**Hinweis für Engineers:** Mannlich schreibt, der Herzog sei nach dem Abschied „in das Gemach der Fürstin hinab“ gegangen (S. 424). Nach Katalog v2 liegen die Räume der Herzogin im Obergeschoss des Südflügels. Danach hätte das Kabinett im Obergeschoss gelegen (B01.2.og-kabinett). Die Bibel nutzt das Schreibkabinett im EG, weil es so im Katalog heißt und weil der Spieler es ohne Treppe erreicht. Beides ist vertretbar.

---

## 3. Hinweise (Clues)

**`clue.k2.marlene`** – Feldstation, Gespräch.
*Hört (Marlene):* „Rohrbach? Da kommt mein Schwager her. Die haben da einen Nikel Pfeiffer, Bauer und Postbote, der den Herzog gewarnt haben soll. Im Internet steht einmal der neunte Februar und einmal der dritte. Such dir einen aus.“ [P nach WP-K2A und ADB]
*Gibt:* `n.pfeiffer`, `n.3_februar`.

**`clue.k2.zaun`** – Parkzaun, Fetzen und Spur.
*Sieht:* Ein Fetzen graubrauner Wolle an einer Zaunlatte. Auf der Parkseite Fußspuren im Raureif, tief und weit auseinander: Da ist jemand gerannt. Kein Tor in der Nähe.
*Hört (Laub):* „Über den Zaun. Nicht durchs Tor. Wer durchs Tor geht, muss erklären, wer er ist.“
*Gibt:* `n.parkzaun`.

**`clue.k2.wachbuch`** – Wachhaus Nord, Tisch.
*Sieht:* Ein aufgeschlagenes Wachbuch. Die letzte Zeile in einer zittrigen Hand: „Sambstag d. 9ten Febr. 1793. Gegen 8 Uhr ein Bauer, außer Athem, wollte zu Serenissimo. Dem Leibjäger übergeben.“ (Wortlaut FIKTION. Datum FAKT nach Horstmann, M1910 S. 427 Anm. 1.)
*Gibt:* `n.9_februar`, `n.schuegens` (Leibjäger).

**`clue.k2.horstmann`** – Wachhaus, Laub beim Lesen des Wachbuchs.
*Hört (Laub):* „Ein Regierungsrat namens Horstmann hat sich das Datum notiert, Tag für Tag, wie ein ordentlicher Mensch. Der neunte. Mannlich schreibt in seinen Erinnerungen ‚gegen Ende Februar‘. Mannlich hat Jahre später geschrieben und schöner. Ich glaube dem Regierungsrat.“
*Gibt:* bestätigt `n.9_februar` als Datum der Flucht.

**`clue.k2.wache`** – Wachhaus, Echo `echo.k2.wache`.
*Gibt:* `n.ehrenhofgitter`, `n.wachfeuer`.

**`clue.k2.gaertnerei`** – Mauer der Holländischen Gärtnerei (KB-B27, 1221/−1296), nur wenn man von der Spur abweicht.
*Sieht:* Eine mannshohe Mauer, oben glatt und vereist. Keine Spuren davor.
*Hört (Laub):* „Hier ist er nicht drüber. Zu glatt, zu hoch. Gärtner bauen bessere Mauern als Herzöge Zäune.“
*Gibt:* `n.gartenmauer`.

**`clue.k2.warnung`** – Schreibkabinett, Echo `echo.k2.warnung`.
*Gibt:* `n.unglaubwuerdig`, `n.nur_zu_wahr`, `n.anschlag`, `n.dukaten`, `n.taler`, `n.pfeffel`, `n.salabert`, `n.r_lohn`.

**`clue.k2.abschied`** – Schreibkabinett, Echo `echo.k2.abschied`.
*Gibt:* `n.galerie_sammlung`, `n.naturalienkabinett`, `n.bibliothek`, `n.ende_februar`.

**`clue.k2.jagdmesser`** – Schreibkabinett, nach dem Abschied betretbar.
*Sieht:* Ein Tisch, auf dem ein Gegenstand fehlt: ein heller Umriss im Staub, schmal und gebogen. Daneben ein Stapel Papiere, aus dem die obersten fehlen.
*Hört (Laub):* „Er hat ein kleines Jagdmesser mitgenommen. Für die Reise.“ (Pause.) „Von seinen tausend Hunden hat er keinen mitgenommen.“ [P nach M1910 S. 423 f.]
*Gibt:* keine Fallsubstantive.

**`clue.k2.orangerie`** – Orangeriehof, Echo `echo.k2.orangerie`.
*Gibt:* `n.mannheim` (Kategorie Wo, nur als Köder in Kapitel 3).

**`clue.k2.fackeln`** – Ehrenhof, Abfahrt.
*Sieht:* Diener mit Fackeln laufen neben den ersten Wagen her, bis zur Allee, und kommen ohne sie zurück. (FIKTION; angeregt von einer unbelegten Lokalüberlieferung, nach der der Herzog mit Fackelträgern abfuhr.)
*Gibt:* `n.fackeln`.

**`clue.k2.esebeck`** – Ehrenhof, Laub nach der Abfahrt.
*Hört (Laub):* „Der Minister Esebeck bleibt. Am 25. Februar holen sie ihn ab, die Sansculotten vorn und hinten als Eskorte. Er kommt im September zurück.“ [P nach M1910 S. 437 mit Anm. 10]
*Gibt:* `n.25_februar`.

**`clue.k2.landremont`** – Orangerieparterre, Echo `echo.k2.landremont` (W4).
*Gibt:* `n.kalkoefen`.

**`clue.k2.koehler`** – Hang unterhalb der Orangerie, eine runde, ebene Fläche mit schwarzer Erde (ein Meilerplatz im Relief, `rm.03`).
*Hört (Laub):* „Ein Köhlermeiler. Die gibt es hier überall im Wald. Ein Meiler glimmt, er leuchtet nicht. Aber der General kommt aus Saarbrücken, was weiß der.“
*Gibt:* `n.koehlermeiler`.

**`clue.k2.hanne`** – Ehrenhof, Gespräch mit Hanne (siehe `hanne.k2.*`).
*Gibt:* `n.r_geschwiegen`, `n.r_dorf`.

**`clue.k2.jost`** – Ehrenhof, Gespräch mit Jost.
*Gibt:* `n.r_angst`, `n.r_gefuehrt`.

**`clue.k2.laub_treue`** – Feldstation, Laub nach dem ersten Wechsel.
*Gibt:* `n.r_treu`, `n.r_gewarnt`.

**`clue.k2.laterne`** – automatisch nach W4.
*Gibt:* `n.r_laterne` („meine Laterne“).

---

## 4. Echos

**`echo.k2.orangerie`** – Orangeriehof, Hinweg, automatisch. Erinnerung (Fiktion).
- DIENER 1: „Die Wagen sind gepackt, seit drei Tagen schon. Und Pferde zum Wechseln stehen auf dem ganzen Weg nach Mannheim.“ [P nach M1910 S. 422]
- DIENER 2: „Und der Herzog?“
- DIENER 1: „Hat Schnupfen.“ [P nach S. 422: „starkem Schnupfen mit etwas Fieber“]

**`echo.k2.wache`** – Wachhaus Nord, automatisch. Erinnerung (Fiktion).
- WACHE 1 (an der Feuerpfanne): „Ein Bauer, ganz außer Atem. Kam nicht durchs Gitter, kam von hinten aus dem Park.“
- WACHE 2: „Und?“
- WACHE 1: „Der Leibjäger hat ihn hinaufgebracht. Wenn's ein Spinner ist, kriegt er einen Tritt. Wenn's keiner ist, kriegen wir einen.“
- WACHE 2: „Leg Holz nach. Das Wachfeuer sieht man bis Homburg, dann wissen die wenigstens, dass wir wach sind.“

**`echo.k2.warnung`** – Schreibkabinett, E halten an der Tür. Erinnerung (Fiktion) mit Zitaten aus Mannlichs Lebenserinnerungen. Man hört nur Stimmen. Durch den Türspalt sieht man Schatten an der Wand: einen sitzenden Mann, der hustet, und mehrere stehende. Nikel Pfeiffer ist nicht im Raum. Er wartet unten.

- SCHÜGENS (Leibjäger): [P S. 422 f.] „Durchlaucht, ein Bauer ist atemlos angelangt. Die französische Kavallerie ist durch die Wälder in sein Dorf gekommen, ohne der Landstraße zu folgen. Sie lassen dort ihre Pferde rasten und verlangen einen Führer, der sie auf Umwegen zum Karlsberg bringt. Erst nachts wollen sie ankommen. Er hat sich durch seinen Garten in den Wald geschlichen und ist über den Zaun des Parkes geklettert.“
- HERZOG: „Diese Nachricht scheint mir unglaubwürdig; der gute Mann will einige Taler verdienen, das ist alles. Gib ihm einen Dukaten, und er ziehe in Frieden!“ [Z S. 423]
- (Eine Tür. Schritte. Pause. Ein langer Husten.)
- ROSÉ (Leibarzt): „Durchlaucht sollten zu Bett gehen und Tee trinken.“ [P S. 423]
- PFEFFEL (kommt zurück): [P S. 423] „Ich beschwöre Durchlaucht, auf der Stelle abzufahren. Es ist nur zu wahr. Diese Schurken haben einen perfiden Anschlag gegen die Person des Herzogs geplant.“
- ROSÉ (beim Hinausgehen): „Bett. Und Tee.“ [P S. 423: „der noch beim Weggehen Bett und Tee empfahl“]
- HERZOG: „Da wir abreisen müssen, so wollen wir es tun! Aber, Abbé, Ihn nehme ich mit mir.“ [Z S. 423]
- SALABERT: „Das ist ein neuer Beweis von Güte, Durchlaucht. Aber ich habe nur bei mir, was ich am Leibe trage. Ich sollte wenigstens Wäsche holen und mein Geld, das ich den Sansculottes nicht gerne überlassen möchte.“ [P S. 423]
- HERZOG: „Hole Er sich Hemden, da Er sie nun einmal braucht; ich gebe Ihm eine halbe Stunde Zeit dazu. Gehe Er!“ [Z S. 423]

**`echo.k2.abschied`** – Schreibkabinett, zweites E halten. Erinnerung (Fiktion) mit Zitaten. Ein Schatten öffnet einen Schreibtisch, steckt Papiere ein und setzt sich. Lange Stille. Dann:

- HERZOG: „Ich lasse Ihn hier, mein lieber Mannlich, um über meine Galerie zu wachen und sie zu retten, wenn es Ihm möglich ist. Ich weiß, wem ich sie anvertraue; desgleichen empfehle ich Ihm mein Naturalienkabinett, meine Bibliothek und alles, was ich nicht habe mit mir nehmen können.“ [Z S. 423]
- (Stille. Ein Gegenstand wird vom Tisch genommen.)
- HERZOG: „Adieu, mein lieber Mannlich, ich hoffe Ihn bald wiederzusehen. Bleibe Er stets mein Freund!“ [Z S. 424]
- (Schritte entfernen sich.)
- MANNLICH (Stimme, ohne Figur, wie viel später erzählt): „Wenn ich mich recht entsinne, gelangte zu uns gegen Ende Februar 1793 die Nachricht …“ [Z S. 422, gekürzt]
- LAUB (sofort danach): „Er entsinnt sich nicht recht. Merken Sie sich trotzdem, was er sagt.“

**`echo.k2.landremont`** – Orangerieparterre, während der Jagd (W4). Erinnerung (Fiktion) mit Zitat. Ein Reiter mit gezogenem Säbel, weitere Reiter hinter ihm. Ein Mann mit einem Werkzeugsack geht ruhig vorbei.
- GENERAL LANDREMONT: „Was bedeuten denn die Feuer, die ich dort unten im Walde habe leuchten sehen?“ [Z S. 427 f.]
- HANDWERKER (ruhig, ohne stehenzubleiben): „Das sind Kalköfen.“ [Z S. 428]
- (Die Reiter sprengen zum Schloss. Mannlich hat nach eigener Aussage das Schlossgebäude im Rücken und hört zu. Er erscheint nicht.)
- LAUB (später, beim Damm): „Mannlich schreibt, die Antwort habe ihn gefreut. Mich auch.“ [P S. 428]

---

## 5. Gesprochene Zeilen

**Hanne (Kapitel 2)**

- `hanne.k2.01`: „Da fährt er. Mit Schnupfen, hab ich gehört. Wir bleiben mit allem anderen hier.“
- `hanne.k2.02`: „Der Bauer, der ihn gewarnt hat, sitzt unten in der Küche und kriegt eine Suppe. Einen Dukaten soll er kriegen. Ob er den kriegt, wird man sehen.“
- `hanne.k2.03`: „Ich hätt geschwiegen. Was hat der für uns getan? Aber ich bin auch nicht durch den Wald gerannt. Wer rennt, entscheidet.“ → gibt `n.r_geschwiegen`
- `hanne.k2.04`: „Die aus Rohrbach haben Angst gehabt, dass die Reiter durchs Dorf kommen und alles mitnehmen. Ich glaub, der ist gerannt, damit sie schneller wieder weg sind.“ → gibt `n.r_dorf`
- `hanne.k2.05`: „Mein Peter schläft. Gut so. Der soll sich das nicht merken.“
- `hanne.k2.06` (wenn `flag.k2_versteck_gesehen`): „Der Kanzlist war vorhin in der Galerie. Mit einer Kerze, um die Zeit. Der hat was versteckt. Ich frag nicht, was.“

**Jost (Kapitel 2, jetzt 17)**

- `jost.k2.01`: „Du schon wieder. Du riechst immer noch nach Regen von morgen.“
- `jost.k2.02`: „Der Bauer? Der hatte Angst, das hab ich gesehen. Wer Angst hat, rennt schneller als einer, der treu ist.“ → gibt `n.r_angst`
- `jost.k2.03`: „Die Reiter wollten einen aus dem Dorf, der sie führt. Hätte er ja machen können. Für Geld. Hat er nicht.“ [P nach M1910 S. 423, „einen Führer verlangt“] → gibt `n.r_gefuehrt`
- `jost.k2.04` (wenn die Wagen weg sind): „Und die Hunde? Hat er was von den Hunden gesagt?“
- `jost.k2.05` (keiner antwortet): „Wer bläst ab, wenn er nicht da ist?“
- `jost.k2.06` (Horn vom Zwinger, er dreht sich um): „Das bin nicht ich. Lauf.“

**Laub (Kapitel 2)**

- `laub.k2.start`: „Februar. Ich mag den Februar nicht. Im November geht man verloren, im Februar wird man gesucht.“
- `laub.k2.richtung` (am Zaun): „Rohrbach liegt im Südwesten. Die Spur kommt aus dem Südosten. Entweder hat er einen Umweg gemacht, oder die Erinnerung. Erinnerungen nehmen gern den schönen Weg.“ (Hinweis auf FIKTION: Der Laufweg ist erfunden.)
- `laub.k2.augen` (W3, flüsternd): „Nicht bewegen. Licht aus. Die sehen das Licht, nicht Sie.“
- `laub.k2.wache`: „Ein Wachfeuer im Ehrenhof. Damit der Feind weiß, wo er hinmuss.“
- `laub.k2.schnupfen` (nach dem Leibarzt): „Bett und Tee. Die Kavallerie kommt durch den Wald, und der Leibarzt verschreibt Bett und Tee. Er hätte es weit gebracht in der Landesaufnahme.“
- `laub.k2.dukat`: „Einen Dukaten für den Mann, der ihm das Leben rettet. Hanne hat für den Lohn ihres Mannes nicht mal einen Gulden bekommen. Sie sehen, der Herzog konnte großzügig sein.“
- `laub.k2.sichern` (nach dem Abschied): „Wenn Sie jetzt zurückgehen, behalten Sie, was Sie gefunden haben. Wenn Sie bleiben, sehen Sie die Abfahrt. Ich würde zurückgehen. Ich bin damals geblieben.“
- `laub.k2.tor_licht` (nur wenn `flag.k2_tor = leuchten`, erst am Damm): „Sie haben ihm heimgeleuchtet. Das war freundlich. Sie wissen, wem.“
- `laub.k2.tor_dunkel` (nur wenn `flag.k2_tor = dunkel`, erst am Damm): „Sie haben im Dunkeln gestanden. Die Pferde haben Sie trotzdem gesehen. Pferde sehen alles.“
- `laub.k2.pikeur` (beim ersten Anblick): „Ein Pikeur. Der führt die Meute. Er hat kein Gesicht, oder er zeigt es nicht. Laufen Sie trotzdem.“
- `laub.k2.wasser` (am Damm): „Fließendes Wasser. Darüber kommt er nicht. Das steht in jeder Sage und in keinem Dienstreglement. Heute gilt die Sage.“
- `laub.k2.treue` (Feldstation, nach dem ersten Wechsel): „Man wird später sagen, er war treu. Vielleicht. Er hätte auch schweigen können. Er hat gewarnt. Mehr wissen wir nicht.“ → gibt `n.r_treu`, `n.r_gewarnt`
- `laub.k2.ende`: „Vierundzwanzig Wochen und einen Tag später.“ (Pause.) „Im Juli brennt Stroh am besten.“

**Marlene (Kapitel 2)**

- `marlene.k2.morgen`: „Morgen. Frost heute Nacht, die Pfützen sind zu. Deine Bussole war beschlagen, von innen. Das geht doch gar nicht.“
- `marlene.k2.pfeiffer`: siehe `clue.k2.marlene`.
- `marlene.k2.rohrbach`: „In Rohrbach gibt's, glaub ich, eine Straße, die nach ihm heißt. Ich müsste meinen Schwager fragen. Der weiß auch nicht alles, sagt aber alles.“ (Vorsicht: Straßenname nicht geprüft; die Zeile bleibt bewusst unsicher.)
- `marlene.k2.abend` (nach der Jagd): „Du bist ja ganz durchgefroren. Und du riechst nach Pferd. Ich frag nicht.“

---

## 6. Substantive

| id | Anzeige | Kategorie | gefunden in | verwendet als |
| --- | --- | --- | --- | --- |
| `n.9_februar` | 9. Februar | Wann | `clue.k2.wachbuch`, `clue.k2.horstmann` | richtig 2-1 |
| `n.3_februar` | 3. Februar | Wann | `clue.k2.marlene` | Köder 2-1 |
| `n.ende_februar` | Ende Februar | Wann | `clue.k2.abschied` | Köder 2-1 |
| `n.25_februar` | 25. Februar | Wann | `clue.k2.esebeck` | Köder 2-1 |
| `n.pfeiffer` | Nikel Pfeiffer | Wer | `clue.k2.marlene` | richtig 2-2 |
| `n.schuegens` | Schügens, der Leibjäger | Wer | `clue.k2.wachbuch`, `clue.k2.warnung` | Köder 2-2 |
| `n.pfeffel` | Pfeffel | Wer | `clue.k2.warnung` | Köder 2-2 |
| `n.salabert` | Abbé Salabert | Wer | `clue.k2.warnung` | Köder 2-2 |
| `n.parkzaun` | den Parkzaun | Wo | `clue.k2.zaun`, `clue.k2.warnung` | richtig 2-3 |
| `n.ehrenhofgitter` | das Ehrenhofgitter | Wo | `clue.k2.wache` | Köder 2-3 |
| `n.gartenmauer` | die Gartenmauer | Wo | `clue.k2.gaertnerei` | Köder 2-3 |
| `n.unglaubwuerdig` | unglaubwürdig | Wie | `clue.k2.warnung` | richtig 2-4 (Lücke 1) |
| `n.nur_zu_wahr` | nur zu wahr | Wie | `clue.k2.warnung` | Köder 2-4 |
| `n.anschlag` | einen perfiden Anschlag | Wie | `clue.k2.warnung` | Köder 2-4 |
| `n.dukaten` | Dukaten | Was | `clue.k2.warnung` | richtig 2-4 (Lücke 2) |
| `n.taler` | Taler | Was | `clue.k2.warnung` | Köder 2-4 |
| `n.galerie_sammlung` | Galerie | Was | `clue.k2.abschied` | richtig 2-5 |
| `n.naturalienkabinett` | Naturalienkabinett | Was | `clue.k2.abschied` | Köder 2-5; richtig 3-6 |
| `n.bibliothek` | Bibliothek | Was | `clue.k2.abschied` | Köder 2-5 |
| `n.kalkoefen` | Kalköfen | Was | `clue.k2.landremont` | richtig 2-6; LESART 2-7 |
| `n.fackeln` | Fackeln | Was | `clue.k2.fackeln` | Köder 2-6; LESART 2-7 |
| `n.wachfeuer` | Wachfeuer | Was | `clue.k2.wache` | Köder 2-6; LESART 2-7 |
| `n.koehlermeiler` | Köhlermeiler | Was | `clue.k2.koehler` | Köder 2-6 |
| `n.r_laterne` | meine Laterne | Was | `clue.k2.laterne` | LESART 2-7 |
| `n.mannheim` | Mannheim | Wo | `clue.k2.orangerie` | Köder in Kap. 3 |
| `n.r_treu` | er dem Herzog treu war | Warum | `clue.k2.laub_treue` | LESART 2-8 |
| `n.r_dorf` | er sein Dorf schützen wollte | Warum | `clue.k2.hanne` | LESART 2-8 |
| `n.r_lohn` | er auf Lohn hoffte | Warum | `clue.k2.warnung` | LESART 2-8 |
| `n.r_angst` | er Angst hatte | Warum | `clue.k2.jost` | LESART 2-8 |
| `n.r_gewarnt` | ihn auch gewarnt | Wie | `clue.k2.laub_treue` | LESART 2-9 |
| `n.r_geschwiegen` | geschwiegen | Wie | `clue.k2.hanne` | LESART 2-9 |
| `n.r_gefuehrt` | die Reiter geführt | Wie | `clue.k2.jost` | LESART 2-9 |

Hinweis: `n.r_lohn` ist die Lesart des Herzogs („der gute Mann will einige Taler verdienen“). Sie wird angeboten, weil der Spieler sie gehört hat, nicht weil sie stimmt.

---

## 7. Fallseite „Die Flucht“

6 FAKT + 3 LESART. Zwei Bestätigungen zu je drei Einträgen.

| id | Typ | Satz | richtig (auch richtig) | Köder | Beleg / Codex |
| --- | --- | --- | --- | --- | --- |
| `entry.k2.1` | FAKT | „Nach den Notizen des Regierungsrats Horstmann floh der Herzog in der Nacht des **___** 1793.“ | 9. Februar | 3. Februar, Ende Februar, 25. Februar | M1910 S. 427 Anm. 1; WP-K2A · `cx.17` (STRITTIG: ADB 3. Februar, Mannlich „Ende Februar“) |
| `entry.k2.2` | FAKT | „Gewarnt wurde der Herzog von einem Bauern aus Rohrbach: **___**.“ | Nikel Pfeiffer (Nicolaus Pfeiffer) | Schügens, Pfeffel, Abbé Salabert | WP-K2A; M1910 S. 422 (dort „ein Bauer“) · `cx.16` |
| `entry.k2.3` | FAKT | „Um schneller ans Ziel zu kommen, kletterte der Bauer über **___**.“ | den Parkzaun | das Ehrenhofgitter, die Gartenmauer | M1910 S. 423 · `cx.16` |
| `entry.k2.4` | FAKT | „Der Herzog nannte die Nachricht zuerst **___** und wollte dem Bauern einen **___** geben.“ | unglaubwürdig · Dukaten | nur zu wahr, einen perfiden Anschlag · Taler, Gulden, Louis d'or | M1910 S. 423 · `cx.16` |
| `entry.k2.5` | FAKT | „Beim Abschied ließ der Herzog Mannlich zurück, um vor allem über seine **___** zu wachen.“ | Galerie | Naturalienkabinett, Bibliothek | M1910 S. 423 · `cx.18` |
| `entry.k2.6` | FAKT | „Als der General nach den Feuern im Wald fragte, antwortete ein Handwerker: ‚Das sind **___**.‘“ | Kalköfen | Fackeln, Wachfeuer, Köhlermeiler | M1910 S. 427 f. · `cx.19` |
| `entry.k2.7` | LESART | „Die Lichter im Wald waren in Wahrheit **___**.“ | – | – | `flag.k2_lichter` = kalkoefen / fackeln / wachfeuer / laterne |
| `entry.k2.8` | LESART | „Nikel Pfeiffer rannte durch die Nacht, weil **___**.“ | – | – | `flag.k2_pfeiffer` = treu / dorf / lohn / angst |
| `entry.k2.9` | LESART | „An seiner Stelle hätte ich **___**.“ | – | – | `flag.k2_stelle` = gewarnt / geschwiegen / gefuehrt |

Die Köder „Gulden“ und „Louis d'or“ in 2-4 sind Substantive aus Kapitel 1 (`n.gulden` aus `clue.k1.hanne`, `n.louisdor` aus `clue.k1.kaufbrief`; dort in der Substantivtabelle eingetragen).

**Weitere Flags aus diesem Kapitel:** `flag.k2_tor` = leuchten / dunkel (Wahl am Tor, 2.7). `flag.k2_versteck_gesehen` (2.5). Alle werden im Epilog genutzt (siehe `06-enden.md`).

**Freischaltungen:** 1. Satz → Spurenleser 2 (Fährtenlinien der Meute im Relief). 2. Satz → Kartograf 3 (Messen, R), Anker Ehrenhof 1793-07, Kapitel 3 offen.

---

## 8. Hinweisleiter (Laub)

1. „Ein Datum, ein Name, ein Zaun. Das Datum steht im Wachbuch, der Name nicht. Den Namen kennt man in Rohrbach. Fragen Sie jemanden, der Schwäger hat.“
2. „Hören Sie an der Tür des Kabinetts genau hin. Drei Leute reden, aber nur einer davon ist der Herzog. Was die anderen sagen, ist nicht, was er sagt. Und was er zuerst nennt, ist ihm am liebsten.“
3. „Der General kommt nach der Abfahrt, nicht vorher. Bleiben Sie im Ehrenhof, bis die Wagen weg sind, und laufen Sie dann zur Orangerie. Sie werden sowieso laufen.“

---

## 9. Bedrohung (Notizen für Designer)

**Die Meute in diesem Kapitel:** 5 Hunde (Diane, Sultan, Fanfare, Rauhreif, Bijou) und ab 2.8 der **Pikeur**.

**Nebel und Frost:**
- Sicht nachts im Nebel: 15 m. Mit Laterne sieht man selbst 7 m weit (Lichtkegel, W3), wird aber auf 80 m gesehen.
- Gehör: Rennen 30 m, Gehen 15 m, Schleichen 8 m (Raureif knirscht), Liegen 0 m, Waten 40 m.
- **Spur im Raureif:** Wer läuft, hinterlässt Fußspuren, und die Hunde folgen ihnen genau. Eine Spur endet nur an Wasser, Stein (Treppen, Terrassenbeläge) oder im Inneren eines Gebäudes. Spurenleser 2 zeigt die Fährtenlinien der Hunde im Relief.

**Abschnitt A, Apfelallee (2.2):** Schleich-Lehrstück. Die Augen (3 Hunde) stehen 12–18 m rechts der Allee und warten. Bewegung mit Laterne an oder Rennen → sie folgen in 20 m Abstand (kein Stellen). Laterne aus und 10 s schleichen → sie verlieren das Interesse und verschwinden. Wer rennt, wird bis zur Orangerie-Stützmauer (KB-30) verfolgt. Dort bleiben sie stehen, weil die Mauer ihnen „gehört“ (sichtbarer Grund: sie können nicht hinauf).

**Abschnitt B, die Parforcejagd (2.8–2.10):** Gescriptete Hatz, aber mit Spielraum.
- Start: Hunde und Pikeur kommen von Norden über die Allee TF-10. Sie geben dem Spieler 6 s Vorsprung (Horn: zwei kurze Töne).
- Der Pikeur reitet auf den Wegen und sucht immer am letzten bekannten Ort. Die Hunde nehmen auch Abkürzungen über Wiese und Hang.
- Sichere Taschen auf dem Weg:
  - Durchfahrt des Südflügels: Wer stehen bleibt, ist im Schatten 4 s unsichtbar (Atempause, kein Ende der Jagd).
  - Orangerie-Keller (über das Treppenhaus Süd): Die Hunde schnüffeln an der Tür, der Pikeur bläst „Verloren“ und sie suchen 25 s außen herum. Dann geht es weiter. Man kann im Keller bleiben, bis das Öl ausgeht. Das ist eine Falle, und Laub sagt das auch: „Hier unten bleibt man, bis man vergessen wird. Raus.“
  - Fuß der Orangerie-Stützmauer (KB-30): Liegen (X) im Mauerschatten = unsichtbar auf mehr als 6 m.
  - Hohlweg KB-10 (1172/−1238), falls man nach Norden flieht: Die Luft steht, Gehör der Hunde halbiert. Danach das Becken am Marstall als Wasserziel.
- **Fließendes Wasser:** Der Überlauf am Damm des Karlsbergweihers und das Becken am Marstall. Der Pikeur kommt nicht hinüber, die Hunde verlieren die Spur. Das ist das Ende der Jagd.
- **Gestellt:** Ein Hund hat 2 s Sicht auf dich und ist näher als 4 m, oder der Pikeur ist näher als 6 m. Text: „Die Meute hat dich gestellt …“ Du wachst nicht in der Feldstation auf, sondern am Anker des Abschnitts, im Heute (Beat-Feld `wake`): bis zum Wachbuch (2.1–2.4) am Parkzaun, ab dann (2.5–2.10) am Ehrenhof, direkt an Anker B. Q bringt dich sofort zurück.
- **Nochmal (zweiter Versuch):** Hanne und Jost stehen wieder am Gitter und sind ansprechbar (Reaktion `k2_10-wieder`). Das Horn wartet, bis das Gespräch mit Jost endet, bis du zur Durchfahrt gehst oder höchstens 20 s (Flag `k2.jagd_los`). Jost wiederholt seine Ansage nicht (Zeilen mit id fallen weg und kosten keine Lesezeit). Wer ins Heute geht, setzt den Versuch zurück (`k2-jagd-aus`).
- Die W4-Sequenz (8 s) friert die Meute ein. Sie darf nie direkt vor einem Stellen ausgelöst werden (Mindestabstand 15 m zum nächsten Hund, sonst 2 s verzögern).

**Tuning-Ziel:** Die Jagd dauert 60–90 s. Ein Spieler, der zur Orangerie und dann zum Damm rennt und einmal im Mauerschatten liegt, kommt beim ersten oder zweiten Versuch durch. Im sanften Modus sind Hunde und Pikeur 30 % langsamer, und die Jagd endet schon am Fuß der Orangerie.

**Rauhnacht-Modus:** Pikeur von Anfang an dabei (auch in der Apfelallee), Sicht im Nebel 20 m, keine Keller-Tasche.


## Action-RPG-Umbau (Quests statt Fallakte)

Kapitel 2 läuft jetzt als Questkette (`content/quests/02-kapitel-2.quests.json`, Katalog in `docs/ACTION-RPG.md` §11.2). Die zwei Bestätigungsrunden im Chronik-Brett sind entfallen. Spurenleser 2 und Kartograf 3 sind jetzt Questbelohnungen.

- **Die Spur im Raureif** (Laub): Q am Parkzaun, der Wollfetzen, die Apfelallee (Augen im Nebel: schleichen), die Orangerie und ihr Echo. Als Bonus warten **drei Streuner** auf der Spur.
- **Das Wachbuch**: **Vier Irrlichter** tanzen um die Feuerpfanne der Wache. Erst wenn sie fort sind, kommt die Erinnerung, danach das Buch.
- **Hinter der Tür**: durch den Südflügel zur Kabinettstür, dann Warnung und Abschied. Im Schloss wird nicht gekämpft. Die Haltung „Warum hat er gewarnt?“ steht in `flag.k2_pfeiffer`.
- **Die Parforcejagd** (Jost gibt sie am Tor):
  - Die Jagd wird **gelaufen**, nicht gekämpft. Unterwegs kommt W4 „Das sind Kalköfen“.
  - Am Damm steht **der Pikeur** (Boss). Man schlägt ihn zurück, bis er „verloren“ bläst und davonreitet. Er stirbt nie.
  - Zu Hause fragt die Haltung „An seiner Stelle?“; die Antwort steht in `flag.k2_stelle`.
  - Belohnung: Messstab III, Kartograf 3.
- Nebenquests:
  - **Das Bodenbrett**: zwei Irrlichter in der Galerie, Solls Kerze.
  - **Lichter im Wald**: drei Lichter am Hang und die Köhlerstelle; Haltung in `flag.k2_lichter`.
  - **Bepackte Wagen** (der Diener): vier Kisten für Mannheim, vier Streuner.
- Nikel Pfeiffer, Landremont und der Herzog bleiben Erinnerungen und Echos. Sie geben nie Quests und sind nie Gegner.
