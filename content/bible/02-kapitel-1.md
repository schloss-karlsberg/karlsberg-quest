# Kapitel 1 „Der Hof“

> The chapter outline retains the original case-page and surveyor-era staging. Mentions of the
> Feldstation, old opening and confirmed sentences are historical. For the playable progression,
> use the [chapter files](../story/README.md) and the [quest catalogue](../../docs/ACTION-RPG.md#11-quest-catalogue).

| | |
| --- | --- |
| Ära | `1789-07` (ein Sommertag; Teil A Vormittag bis Nachmittag am Schloss, Teil B Abend und Nacht in der Karlslust). Echo `1785-12` am Rondell |
| Dauer | 30–35 min |
| Anker | A: Ehrenhof (1216/−1114). B: Tschifflik-Terrasse (KL-B46, 1822/49), frei ab dem 1. bestätigten Satz |
| Ölvorrat | A: 6 min je Wechsel; B: 7 min je Wechsel (sanfter Modus +50 %, Rauhnacht −30 %) |
| Ziel | Hannes Frage beantworten: Warum bekommt sie den Lohn ihres Mannes nicht? Dabei lernt man den Hof, seine Kosten, seine Hunde und seine Tiere kennen und findet den Ort von 1785 |
| Ende | Fallseite „Der Hof“ ganz bestätigt → Kapitel 2 offen |

**Ton.** Teil A ist hell, voll, laut: Baustelle, Kies, Musik aus einem Fenster, Hunde hinter Mauern. Humor gegen Pracht und Bürokratie. Teil B ist Dämmerung, Tiere, Wasser und dann Stille. Am Rondell gibt es keine Witze.

---

## 1. Ablauf

### Teil A – Am Schloss (Tag)

**1.1 – Ankunft.** Das Kapitel beginnt nicht in der Feldstation, sondern **an der Karlsbergquelle im Morgengrauen** (`loc.k1.quelle`, Kapitel-Checkpoint 1059,3/−833,1, Blick zum Trog). Marlene funkt („Du bist ja schon weg“, `marlene.k1.morgen.quelle`), Laub erklärt in einem Satz, warum es ein zweites Mal sein muss: Der Tropfen von gestern ist über Nacht in der Bussole eingetrocknet (`laub.k1.morgen.quelle`, FIKTION `cx.42`). E „Wasser berühren“ wie im Prolog (p3q): der Bach läuft zurück, der graue Novembermorgen wird ein warmer Sommermorgen 1789 (Beat `k1_0`). In der Brunnenstube ein Satz von Laub (`laub.k1.brunnenstube`), dann geht man **zu Fuß** den Hang hinauf, an der Orangerie vorbei, zum Ehrenhofgitter, wie alle außer dem Herzog (FAKT, `cx.11`; Beat `k1_0b` „Die Brunnenstube, Sommer“, rund 380 m). Die Laterne brennt auf diesem Weg noch nicht (Flag `k1.vorspiel`). **Unauffällig (Beat `k1_0b`/`k1_0c`, `docs/IDEAS-ROUND11.md` §2):** In Orange kommt man nicht durchs Gitter. Unter der Quelle liegt Lieses Bleiche (FIKTION `cx.46`): Man nimmt Kaspars Rock hinter der zweiten Leine von der Leine, während Liese zum Weg schaut, oder man fragt sie und jagt drei Mahnbriefe aus ihrer Wäsche (`q.k1.kleider`; Flag `flag.k1_kleid` geliehen / genommen, der Epilog erinnert sich). Auf dem Rasen der Orangerie gibt der Hofgärtner, der jeden im Auge hat, Papier und Siegellack, an seinem Tisch schreibt Laub einen Brief im Namen des erfundenen Hofrats Justus Amsel aus Celle (`q.k1.brief`, `cx.44`, `cx.43` STRITTIG, `cx.45`). Am Gitter mustert ein Gardist den Brief (Beat `k1_0c` „Die Musterung“): E halten, still stehen, das Tor geht auf (Flag `court.admitted`). Wer auffällt, wird ohne Verlust hinausbegleitet. Wer unterwegs ins Heute fällt, wacht an der Quelle auf und kehrt dort mit Q zurück. Q bringt einen erst in den Ehrenhof, wenn der Hof einen hereingelassen hat (Flag `court.admitted`, gesetzt bei der Musterung; `k1_1` setzt es für alte Spielstände nach). Am Gitter: eine Kutsche fährt bis vor das Corps de logis, die Wache (`echo.k1.wache`), Laub kommentiert die Flügel (`laub.k1.fluegel`).

**1.2 – Die Registratur.** Im Erdgeschoss des Nordflügels sitzt Kanzlist **Gottlob Soll** (FIKTION) zwischen Regalen und zählt. Gespräch `soll.k1.*`. Auf seinem Pult liegt das Rechenbrett mit drei Zahlen (`clue.k1.rechenbrett`), im Regal die Abschrift eines Kaufbriefs (`clue.k1.kaufbrief`), in einer Schublade ein beschlagnahmtes Zeitschriftenheft (`clue.k1.schloezer`). Unter dem Hauptbuch liegt ein zweites, dünneres Buch. Soll klappt es zu, bevor man lesen kann (`clue.k1.gegenbuch`): „Das ist privat.“

**1.3 – Der Bauplatz.** Am Ostende der neuen Galerie wird gebaut (FAKT: 1789 entstand neben der Galerie von 1788 eine Rotunde mit Kolonnade). Bauhütte, Steinstaub, Gerüst. **Hanne** (FIKTION) steht jeden Morgen hier (`hanne.k1.*`, `clue.k1.hanne`). An einem Quader am Fuß der Galerie ist ein Steinmetzzeichen zu sehen: ein offener Winkel mit drei Punkten darunter (`clue.k1.zeichen`, FIKTION, wird in Kapitel 4 wichtig).

**1.4 – Die Orangerie.** Im Pfeilersaal der Orangerie (Mannlich hatte im Obergeschoss eine Wohnung, FAKT). Auf einem Tisch liegen Mannlichs Festpläne von 1785 (`clue.k1.festplan`). E halten: zwei Echos aus Mannlichs Erinnerungen (`echo.k1.mannlich_bauliste`, `echo.k1.mannlich_lohn`).

**1.5 – Der Zwinger.** Hinter dem Marstall bellt es aus einem ummauerten Hof. Der Hundejunge **Jost** (FIKTION, 13) füttert. Er bringt dir bei, wie man sich vor einer Meute versteckt (`jost.k1.*`, Tutorial C/X/L/Wasser/Hohlweg/Sandstein). Laub zitiert Gagern (`clue.k1.gagern`). Jost sagt: „Heut Nacht laufen sie in der Karlslust.“ Das ist die Verbindung zu Teil B.

**1.6 – Zurück.** Q halten → Feldstation. Chronik ausfüllen. Der 1. bestätigte Satz schaltet den Anker Karlslust frei. Marlene schlägt den Geisterblick als Weg dorthin vor (`marlene.k1.flug`).

### Teil B – Die Karlslust (Abend und Nacht)

**1.7 – Die Tschifflik-Terrasse.** Wechsel in die Dämmerung. Vom Pavillon auf der Terrasse sieht man gegenüber die Kaskade, das Tosbecken und die Schwanenweiher. Laub: „Von hier hat der Hof zugesehen. Im Dezember 1785.“ (FAKT nach Mannlich: Der Hof sah „von dem gegenüberliegenden Pavillon auf dem Berge“ zu.)

**1.8 – Das Amphitheater.** Ein Rund aus kleinen Häusern mit Schieferdach um einen Wassergraben, in der Mitte eine Insel mit Pavillon. Tierlaute: Papageien, ein Affe, irgendwo ein Fauchen. Echo `echo.k1.mannlich_menagerie`. Man kann die Häuschen zählen (`clue.k1.amphitheater`). Optional: der Kasuar (`clue.k1.kasuar`, Nebenbeat).

**1.9 – Die Terrassen.** Südöstlich des Runds stufen sich die Menagerie-Terrassen ab, sechs Reihen Tierhäuser ohne Mauer. Am oberen Rand, vor der ersten Reihe, stehen eiserne Kästen mit einer Feuerluke an der Außenseite (`clue.k1.baerenkaesten`).

**1.10 – Die Nacht kommt.** Die Sonne ist weg. Das erste Horn: ein langer Ton (Anblasen). Drei Hunde aus Rauch kommen die Apfelallee herunter. Erste echte Begegnung mit der Meute, Teil 1 des Jagd-Tutorials (Abschnitt 9).

**1.11 – Das Rondell (Wow W2).** Oben, wo die Große Kaskade beginnt, liegt ein rundes Plateau, daneben der Platz des Hymenäostempels. Mit E: Echo `echo.k1.feuerwerk` (Ära `1785-12`). Danach erscheint in der Chronik die **Gedenkzeile** (kein Rätsel, siehe Abschnitt 7). Die Meute kommt nicht ins Rondell, solange das Echo läuft (Designregel: Gedenkort ist sichere Zone).

**1.12 – Die Seite.** Auf den Stufen des Tempelplatzes liegt eine Chronikseite in Josts ungelenker Schrift: fünf Hundenamen und darunter „Hanne – Matthes – Lohn offen“ in Solls Hand (`clue.k1.seite`). Sobald man sie aufhebt, bläst das Horn zweimal kurz: Die Meute hat die Fährte.

**1.13 – Flucht.** Zum Tosbecken hinunter (≈ 160 m), durchs flache Wasser am Rand, die Meute verliert die Spur, Q halten.

**1.14 – Feldstation, Cliffhanger.** Chronik. Wenn die Seite ganz bestätigt ist: Die Nadel der Bussole dreht sich nach Südosten zum Carlsluster Torhaus und bleibt dort stehen. Auf dem Deckel bildet sich Raureif. Laub (`laub.k1.ende`): „Februar dreiundneunzig. Da rennt einer durch die Nacht. Und hinter ihm bläst jemand zur Jagd.“

---

## 2. Orte und Trigger

| id | Ort | Bezug | x | z | r | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.k1.quelle` | Karlsbergquelle mit Trog (heute) und Brunnenstube (1789, FIKTION `cx.42`) | OSM-KQ, LiDAR Quellmulde 1061/−835, `cx.41` | 1061 | −834,5 | 10 | heute (Morgengrauen) → 1789-07 | Kapitelstart (Checkpoint 1059,3/−833,1); E „Wasser berühren“ (`quelle:touch`); Q-Anker zurück nach 1789, solange `court.admitted` fehlt; Aufwachort in `k1_0b` |
| `loc.k1.ehrenhof` | Ehrenhof mit Gitter und Wachhäusern | TF-01, KB-B37, KB-B38, KB-B39 | 1192 | −1115 | 40 | 1789-07 | Anker A; `echo.k1.wache` beim Betreten |
| `loc.k1.registratur` | Registratur, Nordflügel EG | B03.1.eg-registratur (KB-B03) | 1202 | −1153 | 6 (Raumpolygon) | 1789-07 | Soll |
| `loc.k1.bauplatz` | Bauplatz am Galerie-Ostende | KB-B07 (Rotunde, 1789 im Bau), KB-B06 | 1276 | −1228 | 25 | 1789-07 | Hanne; Zeichen am Quader (1262/−1224, r 3) |
| `loc.k1.pfeilersaal` | Pfeilersaal der Orangerie | B10.1.s-pfeilersaal (KB-B10) | 1242 | −967 | 10 (Raumpolygon) | 1789-07 | Festplan; Mannlich-Echos |
| `loc.k1.zwinger` | Hundezwinger und Zwingerhaus | KB-B23, KB-B35; Jägerhaus KB-B24 | 1216 | −1571 | 35 | 1789-07 | Jost; Tutorial |
| `loc.k1.tschifflik` | Tschifflik-Pavillon auf der Terrasse gegenüber der Kaskade | KL-B46, TF-35 | 1822 | 49 | 20 | 1789-07 | Anker B |
| `loc.k1.amphitheater` | Amphitheater („Bärenzwinger“), Graben, Insel | KL-B40, KL-B41, TF-37, LiDAR KL-01, POI r03-08 | 1935 | 87 | 30 | 1789-07 | Echo; Zählen |
| `loc.k1.terrassen` | Menagerie-Terrassen mit Bären-Kästen | KL-B43, TF-38, POI r03-09 (Lage ungefähr) | 2037 | 164 | 60 | 1789-07 | `clue.k1.baerenkaesten` |
| `loc.k1.tosbecken` | Tosbecken | TF-31, LiDAR KL-04, POI r03-11 | 1807 | 189 | 30 | 1789-07 | Wasser, sicher |
| `loc.k1.schwanenweiher` | Schwanenweiher 1–3 | TF-32, TF-33, TF-34 | 1854 / 1877 / 1914 | 214 / 284 / 310 | 30 / 30 / 12 | 1789-07 | Wasser, sicher |
| `loc.k1.rondell` | Rondell am Kopf der Großen Kaskade, Hymenäostempel | TF-36, KL-B49, TF-30 | 1815 | 348 | 20 | 1789-07 / 1785-12 | Gedenkort, sicher während des Echos |
| `loc.k1.apfelallee` | Apfelallee (Orangerie → Torhaus) | TF-14, LiDAR KB-14 | Linie 1271/−953 → 1575/−408 | | 8 | 1789-07 | Patrouille der Meute (B) |

---

## 3. Hinweise (Clues)

**`clue.k1.wache`** – Ehrenhofgitter. Echo, automatisch.
*Hört:* „Absteigen! Hinauf fährt nur Serenissimus.“ [P nach RLS]
*Gibt:* `n.herzog`.

**`clue.k1.fluegel`** – Ehrenhof, Blick auf die Flügel. Laub erklärt: „Rechts der Flügel der Herzogin, links der des Herzogs. Zwischen beiden ein Hof, damit sie sich nicht zufällig begegnen.“ (FAKT: Blick vom Ehrenhof nach Osten; Südflügel = Herzogin, Nordflügel = Herzog, nach Katalog KB-B02/KB-B03. Der zweite Satz ist Laubs Spott.)
*Gibt:* `n.herzogin`.

**`clue.k1.rechenbrett`** – Registratur, Pult.
*Sieht:* Eine Schiefertafel mit drei Zahlen in Kreide, ohne Beschriftung: „35 000“, „800 000“, „14 000 000“. Beim dritten steht ein Fragezeichen.
*Hört (Soll):* „Nicht anfassen. Die Große ist noch nicht fertig.“
*Gibt:* `n.zahl_35000`, `n.zahl_800000`, `n.zahl_14mio`.

**`clue.k1.kaufbrief`** – Registratur, Regal.
*Sieht:* „Abschrift. Kauf des Louisenhofes auf dem Buchenberg, den 27. Julii 1777: fünfunddreißigtausend Gulden und sechzig neue Louis d'or.“ (Wortlaut FIKTION, Inhalt FAKT nach WP-SK und HIB; en.wikipedia nennt 23 000 Gulden, siehe `cx.02`.)
*Gibt:* bindet `n.zahl_35000` an „Kaufpreis“; außerdem `n.louisdor`.

**`clue.k1.soll_einnahmen`** – Registratur, Gespräch (Frage „Was ist die mittlere Zahl?“).
*Hört (Soll):* „Achthunderttausend im Jahr. Das ganze Herzogtum. Jedes Dorf, jede Mühle, jeder Zoll. Achthunderttausend.“ [P nach Stollreither, M1910 Einleitung S. XXXIV]
*Gibt:* bindet `n.zahl_800000` an „Einnahmen“. Damit bleibt `n.zahl_14mio` für den Karlsberg übrig.

**`clue.k1.schloezer`** – Registratur, Schublade.
*Sieht:* Ein Heft der *Stats-Anzeigen* von 1782. Unterstrichen: „ganz und gar gleichsam ein einziges JagdRevier“ und „ganze Regimenter JagdHunde“. [Z nach WP-K2A]
*Hört (Soll):* „Beschlagnahmt. Lesen verboten. Ich lese es jeden Tag, damit ich weiß, was verboten ist.“
*Gibt:* `n.jagdrevier`.

**`clue.k1.gegenbuch`** – Registratur, unter dem Hauptbuch.
*Sieht:* Ein dünnes Buch in grauem Pappband. Auf der ersten Seite steht „Was der Hof schuldig blieb“, dieselbe Überschrift wie auf der Seite in der Bussole. Soll klappt es zu.
*Gibt:* keine Substantive. Setzt `flag.k1_gegenbuch_gesehen` (Laub reagiert in Kapitel 3).

**`clue.k1.hanne`** – Bauplatz, Gespräch (siehe `hanne.k1.*`).
*Gibt:* `n.zwei_tage`, `n.eine_woche`, `n.r_will_nicht`, `n.gulden`.

**`clue.k1.zeichen`** – Bauplatz, Quader am Fuß der Galerie (1262/−1224).
*Sieht:* Ein eingehauenes Zeichen: offener Winkel, darunter drei Punkte. (FIKTION, erfundenes Steinmetzzeichen.)
*Hört (Hanne, wenn sie in der Nähe ist):* „Das ist seins. Das hat er in jeden Stein gehauen, damit man weiß, wer ihn gemacht hat.“
*Gibt:* keine Fallsubstantive. Sammlung „Wandernde Steine“, Stein 1/4.

**`clue.k1.festplan`** – Pfeilersaal, Tisch.
*Sieht:* Drei Blätter mit dem Titel „Plan d[e] la foire executé au d[ecem]bre 1785 au Carlsberg / Mannlich“ (Titel FAKT nach dem Darmstädter Blatt, `cx.15`). Ein Blatt zeigt den Orangeriehof mit Buden im Kreis („Jahrmarkt in Venedig“). Das zweite zeigt die Karlslust oberhalb der Großen Kaskade, mit einem Vulkan hinter der Kaskade, dem Hymentempel und dem Volk auf Stufen am Hang. Das dritte zeigt den Hofgarten in Zweibrücken. Am Rand des zweiten Blattes steht: „Feuerwerk in drei Abteilungen, durch Zwischenräume getrennt.“ [P nach M1910 S. 386 f., 391]
*Gibt:* `n.orangeriehof`, `n.karlslust`, `n.zweibruecken`, `n.drei_abteilungen`, `n.vulkan`, `n.kaskade`.

**`clue.k1.feenschloss`** – Pfeilersaal, Laub beim Blick in den Saal.
*Hört (Laub):* „Ein Reisender nennt das alles 1792 ein ‚Feen-Schloß‘. Er hat die Rechnungen nicht gesehen.“ [Z Reisebrief vom 11. Mai 1792, in: Knigge (Hg.), *Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben*, 1793, S. 28 f.; nach M1910 Einl. S. XXXIV. Der Schreiber ist ungenannt; nicht als Knigges eigenen Besuch ausgeben]
*Gibt:* `n.feenschloss`.

**`clue.k1.jost`** – Zwinger, Gespräch.
*Gibt:* `n.tausend`, `n.zweihundert`, `n.ein_tag`, `n.r_hunde_bilder`.

**`clue.k1.gagern`** – Zwinger, Laub.
*Hört (Laub):* „Ein Herr von Gagern hat es später so aufgeschrieben: ‚tausend Pferde im Marstall, noch mehr Hunde in den Zwingern, das ganze Land ein Thiergarten zum Verderben der Unterthanen!‘ Er war Diplomat. Das ist für einen Diplomaten sehr deutlich.“ [Z M1910 Einl. S. XXXV]
*Gibt:* `n.thiergarten`.

**`clue.k1.amphitheater`** – Amphitheater. Interaktion „Häuschen zählen“: Jedes Häuschen leuchtet auf, wenn man es ansieht, und ein Zähler läuft mit.
*Sieht:* Neunzehn kleine Häuser mit Schieferdach im Kreis um einen Wassergraben, in der Mitte eine Insel mit Pavillon. (FAKT nach SPT: 19 Häuser; Form nach Katalog KL-B40 Hypothese.)
*Gibt:* `n.neunzehn`, `n.amphitheater`.

**`clue.k1.insel`** – Amphitheater, Blick zur Insel.
*Hört (Laub):* „Auf der Insel stand ein Pavillon. Seine Grundmauern hat man 2016 wiedergefunden. Ich hätte ihn 1840 finden können, wenn man mich gelassen hätte.“ (FAKT: SPT, Fund 2016.)
*Gibt:* `n.insel`.

**`clue.k1.baerenkaesten`** – Menagerie-Terrassen.
*Sieht:* Mehrere Kästen aus Eisen mit Gittertür. An der Außenseite jedes Kastens sitzt eine kleine Feuerluke. (FAKT nach SPT: eiserne „Bären-Kästen“, 1786, von außen beheizt.)
*Hört (Laub):* „Bären-Kästen. Geheizt von außen, damit der Bär nicht friert und der Heizer nicht gefressen wird. Das ist die einzige Stelle am Hof, an der jemand an alle gedacht hat.“
*Gibt:* `n.herzogsterrassen`.

**`clue.k1.kanonen`** – Rondell, Teil des Echos.
*Hört:* Mannlichs Stimme: „Dicht dabei standen nicht weniger als zehn bis zwölf Kanonen.“ [Z M1910 S. 390]
*Gibt:* `n.zwoelf`.

**`clue.k1.feuerwerk`** – Rondell, Echo `echo.k1.feuerwerk`.
*Gibt:* `n.einziges_geruest`, bestätigt `n.karlslust` als Ort des Unglücks.

**`clue.k1.mannlich`** – Orangerie, Echos `echo.k1.mannlich_bauliste` und `echo.k1.mannlich_lohn`.
*Gibt:* `n.baudirektor`, `n.tausend`, `n.sechshundert`, `n.r_getaeuscht`.

**`clue.k1.soll`** – Registratur, Gespräch.
*Gibt:* `n.minister`, `n.r_creuzer`.

**`clue.k1.seite`** – Rondell, Stufen des Tempelplatzes.
*Sieht:* Eine Chronikseite. Oben in großer, ungelenker Schrift: „Diane. Sultan. Fanfare. Rauhreif. Bijou.“ Darunter in feiner Kanzleischrift: „Hanne, Witwe des Steinhauers Matthes. Lohn: offen.“
*Gibt:* keine neuen Substantive. Löst die Jagd aus.

**`clue.k1.kasuar`** (optional) – Rand des Amphitheaters.
*Sieht:* Ein großer schwarzer Vogel mit blauem Hals und einem Helm auf dem Kopf starrt dich an und weicht keinen Schritt.
*Hört (Laub):* „Der Kasuar. Das einzige Lebewesen am Hof, das dem Herzog nicht gehorcht hat. Vermutlich.“ (FAKT: Kasuare in der Menagerie, SPT.)
*Gibt:* Sammlung „Tiere der Menagerie“.

---

## 4. Echos

**`echo.k1.wache`** – Ehrenhofgitter, `1789-07`, automatisch. Erinnerung (Fiktion).
- WACHE: „Absteigen! Hinauf fährt nur Serenissimus.“ [P nach RLS]
- WACHE (leiser, zum Kameraden): „Und der fährt auch nur, wenn er nicht gerade jagt.“

**`echo.k1.mannlich_bauliste`** – Pfeilersaal, E halten. Erinnerung (Fiktion) mit Zitaten aus Mannlichs Lebenserinnerungen. Mannlich ist eine Silhouette am Fenster, die Stimme ist ruhig, ein wenig müde.
- MANNLICH: „Ich hatte also einen Stall für tausend Pferde und eine ungeheure Reitbahn zu ihrer Dressur und Bewegung zu bauen.“ [Z M1910 S. 365]
- MANNLICH: „Ich wiegte mich in der Hoffnung, daß der Herzog des Bauens endlich überdrüssig werden würde. Wie sah ich mich aber in meiner Rechnung betrogen!“ [Z S. 365, gekürzt]
- MANNLICH: „Kasernen für sechshundert Gardisten und Wohnungen für die Offiziere mußten errichtet werden; ein Zwinger für tausend Hunde (von den Wölfen abgesehen), die Hirsch- und Wildschweinmeute, Hühner- und Spürhunde, kurz – ohne Übertreibung – für die Hunde aller Erdteile.“ [Z S. 365]

**`echo.k1.mannlich_lohn`** – Pfeilersaal, zweites E halten. Erinnerung (Fiktion) mit Zitat.
- MANNLICH: „Man urteile indes nicht zu ungünstig über den Charakter des Herzogs und lege die Unbesonnenheit, mit der er sich seinen Liebhabereien hingab, nicht als Gefühllosigkeit, Leichtsinn und Grausamkeit gegen seine Untergebenen aus, denen man ihren Lohn nicht bezahlte. Man schmeichelte ihm und täuschte ihn.“ [Z M1910 S. 369, gekürzt]
- LAUB (danach, trocken): „Merken Sie sich das. Der Baudirektor findet, der Herzog sei getäuscht worden. Der Baudirektor wurde vom Herzog bezahlt. Meistens.“

**`echo.k1.mannlich_menagerie`** – Amphitheater, E halten. Erinnerung (Fiktion) mit Zitat.
- MANNLICH: „Unweit davon erhob sich ein Gebäude, das wie ein antikes Amphitheater aussah und die Vierfüßler und Raubvögel beherbergte.“ [Z M1910 S. 384]
- MANNLICH: „Der Herzog führte uns flüchtig an allen Einzelkäfigen vorüber, nur jener mit den Affen hielt uns länger zurück.“ [Z S. 384]

**`echo.k1.feuerwerk`** – Rondell, E halten. Ära `1785-12`. Erinnerung (Fiktion) mit Zitaten aus Mannlichs Bericht. **Keine Bilder von Verletzten. Keine Stimme der Opfer.** Der Sommer wird zu Winter, Lämpchen am Hang, eine Menge ist zu hören, aber nicht zu sehen.
- MANNLICH (Stimme, ohne Figur): „Der Major brachte alle Feuerwerkskörper auf einem einzigen, und zwar dem höchsten Gerüste unter, anstatt sie auf drei zu verteilen.“ [P M1910 S. 389]
- FEUERWERKER AUS STRASSBURG (eine Gestalt neben einem dunklen Gerüst): „Ich möchte nicht dreißig Schritt von diesem Gerüst entfernt sein und es nicht um alles Gold der Welt besteigen.“ [Z S. 389]
- MANNLICH: „Dicht dabei standen nicht weniger als zehn bis zwölf Kanonen.“ [Z S. 390]
- ESEBECK (zieht eine zweite Gestalt am Arm ins Gehölz): „Bleiben Sie ferne! Ich beschwöre Sie.“ [Z S. 390]
- (Stille. Dann, wie von weit unten am Berg gehört: Kanonenschüsse, ein Licht, das den ganzen Himmel aufflammen lässt, das Knattern von Raketen.) [P S. 391]
- (Das Licht erlischt. Schnee fällt rückwärts nach oben. Der Sommer kehrt zurück.)
- Danach erscheint die Gedenkzeile in der Chronik. **Laub sagt hier nichts.**

---

## 5. Gesprochene Zeilen

**Kanzlist Gottlob Soll (FIKTION; nervös, pedantisch, komisch, nie grausam)**

- `soll.k1.01` (beim Eintreten): „Nicht stören. Ich bin bei den Millionen.“
- `soll.k1.02` (Frage nach Matthes): „Matthes, Steinhauer, Galerieflügel. Lohnrest: angewiesen. Nicht ausgezahlt. Das ist ein großer Unterschied, mein Herr, meine Dame, mein … Sie. Angewiesen heißt, dass jemand will. Ausgezahlt heißt, dass jemand kann.“
- `soll.k1.03` (Nachfrage „Warum kann keiner?“): „Weil die Kasse leer ist. Alle Kassen. Auch die der Witwen und Waisen. Die hat der Herr Präsident Creuzer geleert, um Bilder und Vögel zu kaufen, und als das nicht reichte, hat er die einen mit Versprechungen bezahlt.“ [P nach M1910 S. 377] → gibt `n.r_creuzer`
- `soll.k1.04`: „Und dann ist er bei Nacht verreist. Vorher hat er ein paar Stöße Papier verbrannt und beinahe das Haus angesteckt. Andere hat er in sichere Hände gegeben.“ [P nach M1910 S. 396 f.] (Pause. Soll sieht auf seine eigenen Hände.) „Welche Hände, steht nirgends.“
- `soll.k1.05` (Frage nach dem Minister): „Der Herr Minister fährt auch nicht hinauf. Der wird gefahren. Das ist etwas völlig anderes.“ → gibt `n.minister`
- `soll.k1.06` (Frage nach dem Rechenbrett): „Nicht anfassen. Die Große ist noch nicht fertig.“
- `soll.k1.07` (Frage nach der mittleren Zahl): „Achthunderttausend im Jahr. Das ganze Herzogtum. Jedes Dorf, jede Mühle, jeder Zoll. Achthunderttausend.“ [P nach Stollreither, M1910 Einl. S. XXXIV]
- `soll.k1.08` (Frage nach dem grauen Buch): „Das ist privat.“ (Pause.) „Jemand muss ja aufschreiben, was nicht bezahlt wird. Sonst war es nie.“
- `soll.k1.09` (Abschied): „Wenn Sie die Witwe sehen: Sagen Sie ihr, es ist angewiesen. Nein. Sagen Sie ihr nichts. Sie weiß es ja.“

**Hanne (FIKTION; Steinhauerwitwe, Mitte dreißig, gerade, müde, mit trockenem Witz)**

- `hanne.k1.01`: „Sie sind nicht vom Hof. Sie gucken nicht über mich weg.“
- `hanne.k1.02`: „Mein Mann war Steinhauer. Matthes. Er hat die Quader für die Galerie gehauen, letzten Herbst. Dann ist er vom Gerüst gefallen.“ (Sie sieht zum Gerüst und nicht zu dir.)
- `hanne.k1.03`: „Zwei Tage hat ein Geselle für einen Gulden geschafft. Zwei Tage.“ [P nach EN-KC] „Und den letzten Gulden hat er nie gekriegt.“ → gibt `n.zwei_tage`
- `hanne.k1.04`: „Seit einer Woche steh ich hier jeden Morgen. Der Schreiber sagt, es ist angewiesen. Ich sag ihm, ‚angewiesen‘ kann ich nicht essen.“ → gibt `n.eine_woche`
- `hanne.k1.05`: „Die Leute nennen den Berg den Tränenberg. Ob das so heißt, weiß ich nicht. Geweint wird jedenfalls.“ [LEGENDE nach HIB, `cx.09`]
- `hanne.k1.06` (Frage „Warum zahlt keiner?“): „Weil der Herzog nicht will. Wer tausend Hunde füttern kann, kann einen Steinhauer bezahlen.“ → gibt `n.r_will_nicht`
- `hanne.k1.07`: „Wenn Sie in die Schreibstube kommen, fragen Sie nach Matthes. Und schauen Sie, ob da einer Namen aufschreibt. Bei unsereins schreibt keiner was auf.“
- `hanne.k1.08` (beim Zeichen): „Das ist seins. Das hat er in jeden Stein gehauen, damit man weiß, wer ihn gemacht hat.“
- `hanne.k1.09` (wenn man zurückkommt und Soll gesprochen hat): „Angewiesen. Dann warte ich halt weiter. Warten kann ich. Das zahlt mir auch keiner.“

**Jost, der Hundejunge (FIKTION; 13 Jahre, schnell, frech, liebt die Hunde, fürchtet sie nicht)**

- `jost.k1.01`: „Du bist nicht von hier. Du riechst nach Regen von morgen.“
- `jost.k1.02`: „Die da drin sind keine Schoßhunde, das ist die Meute. Hirschmeute, Saumeute, Hühnerhunde, Spürhunde. Tausend, sagt der Herr Baudirektor.“ [P nach M1910 S. 365] „Ich hab nie über zweihundert gezählt, weil ich bei zweihundert immer Hunger krieg.“ → gibt `n.tausend`, `n.zweihundert`
- `jost.k1.03`: „Im Hof vom Jägerhaus gibt's eine Bäckerei und eine Metzgerei, nur für die Hunde.“ [P nach Molitor, M1910 Einl. S. XXXIII f.] „Die Steinhauer kriegen Versprechen. Die Hunde kriegen Fleisch. Und die Bilder kriegen Gold drumrum.“ → gibt `n.r_hunde_bilder`
- `jost.k1.04`: „Lass die einen Tag hungern, und sie fressen dir den Zwinger auf.“ → gibt `n.ein_tag`
- `jost.k1.05` (Tutorial, Horn): „Wenn du das Horn hörst, legst du dich hin. Ganz flach.“ → Steuerhinweis X
- `jost.k1.06` (Tutorial, Schleichen): „Nicht rennen. Rennen hören die über den halben Berg. Schleich.“ → Steuerhinweis C
- `jost.k1.07` (Tutorial, Laterne): „Und mach dein Licht aus. Ein Licht im Dunkeln ist für die wie eine Glocke.“ → Steuerhinweis L
- `jost.k1.08` (Tutorial, Wasser): „Durch Wasser verlieren sie dich. Im Hohlweg auch, da liegt die Luft still. Hinter den großen Sandsteinbrocken an den Dämmen sehen sie dich nicht.“
- `jost.k1.09` (die Namen): „Das ist Diane, die führt. Sultan, der ist dumm, aber laut. Fanfare. Rauhreif, die Weiße. Und Bijou, der Kleine, der glaubt, er ist ein Hirsch.“
- `jost.k1.10`: „Der Herzog kennt keinen von denen beim Namen. Er kennt die Zahl. Ich schreib die Namen auf. Der Kanzlist hat mir das Schreiben beigebracht.“
- `jost.k1.11` (Vorahnung): „Die Meute reißt nicht. Sie stellt. Reißen tut, was danach kommt.“
- `jost.k1.12` (Abschied): „Heut Nacht laufen sie in der Karlslust. Wenn du dahin gehst: Bleib am Wasser.“

**Quirin Laub (Kapitel 1)**

- `laub.k1.morgen.quelle` (an der Quelle, Kapitelstart): „Sie sind vor Sonnenaufgang los. Ich habe Sie nicht aufgehalten. Der Tropfen von gestern ist über Nacht in der Bussole eingetrocknet, die Nadel zeigt aufs Wasser, nicht auf den Ehrenhof. Ein zweites Mal also. Sie wissen, wie es geht.“
- `laub.k1.brunnenstube` (1789, nach der Berührung): „Sommer 1789. Die Bussole ist wieder nass. Zum Schloss geht es zu Fuß, den Hang hinauf, an der Orangerie vorbei. Wie alle.“
- `laub.k1.start` (Ankunft am Ehrenhof): „1789. Der Hof auf seiner Höhe. Genießen Sie die Aussicht, sie ist bezahlt. Nicht vom Herzog, aber bezahlt.“
- `laub.k1.fluegel`: „Rechts der Flügel der Herzogin, links der des Herzogs. Dazwischen ein Hof, damit sie sich nicht zufällig begegnen.“
- `laub.k1.registratur`: „Eine Registratur. Mein natürlicher Lebensraum. Halten Sie sich an den Mann mit den Ärmelschonern.“
- `laub.k1.gegenbuch` (nachdem Soll das Buch zuklappt): „Haben Sie die Überschrift gesehen?“ (Pause.) „Ich auch.“
- `laub.k1.bauplatz`: „Die Galerie ist nagelneu und schon wird angebaut. Ein Schloss, das nie fertig wird, ist die teuerste Art, eines zu haben.“ (FAKT: Das Schloss wurde nie fertig, SKD.)
- `laub.k1.orangerie`: „Hier hat der Baudirektor gewohnt. Über den Orangen. Ein Maler, der Ställe bauen musste. Ich mag ihn. Er hat auch nie bekommen, was ihm zustand.“ (FAKT: Mannlichs Leibrente wurde ab 1791 nicht mehr gezahlt, M1910 S. 421.)
- `laub.k1.zwinger`: Gagern-Zitat (siehe `clue.k1.gagern`).
- `laub.k1.flug` (Feldstation, nach dem 1. Satz): „Die Karlslust liegt eine gute Stunde zu Fuß im Süden. Im Heute fliegen Sie. Taste F. Ich hasse es.“
- `laub.k1.karlslust`: „Von hier hat der Hof zugesehen. Im Dezember 1785.“
- `laub.k1.nach_rondell` (erst, wenn man den Gedenkort verlassen hat, leise): „Mannlich war schon am Fuß des Berges, als es geschah. Er hat das Licht gesehen und es schön gefunden. So steht es bei ihm. Das ist das Schlimmste daran.“ [P nach M1910 S. 391]
- `laub.k1.ende`: „Februar dreiundneunzig. Da rennt einer durch die Nacht. Und hinter ihm bläst jemand zur Jagd.“

**Marlene (Kapitel 1)**

- `marlene.k1.morgen.quelle` (Funk, an der Quelle, Kapitelstart; ersetzt `marlene.k1.morgen`): „Morgen, {Name}! Du bist ja schon weg. Die Brötchen liegen auf der Stufe. Ich ess deins, wenn du nicht bald zurück bist.“
- `marlene.k1.flug`: „Die Karlslust? Das ist da, wo heute der Bärenzwinger ist und die Schwanenweiher. Schöne Ecke. Nimm den Überflug, zu Fuß bist du ewig unterwegs.“
- `marlene.k1.bärenzwinger`: „Die Leute sagen Bärenzwinger. Ob da je Bären drin waren, weiß keiner so genau.“ (STRITTIG, `cx.13`.)
- `marlene.k1.abend` (nach Rückkehr aus Teil B): „Du hast ja nasse Füße. Im November. Vom Weiher? Erzähl's mir morgen.“

---

## 6. Substantive

| id | Anzeige | Kategorie | gefunden in | verwendet als |
| --- | --- | --- | --- | --- |
| `n.herzog` | der Herzog | Wer | `clue.k1.wache` | richtig 1-1 |
| `n.minister` | der Minister | Wer | `clue.k1.soll` | Köder 1-1 |
| `n.herzogin` | die Herzogin | Wer | `clue.k1.fluegel` | Köder 1-1 |
| `n.baudirektor` | der Baudirektor | Wer | `clue.k1.mannlich` | Köder 1-1 |
| `n.zwei_tage` | zwei Tage | Wie lange | `clue.k1.hanne` | richtig 1-2 |
| `n.eine_woche` | eine Woche | Wie lange | `clue.k1.hanne` | Köder 1-2 |
| `n.ein_tag` | einen Tag | Wie lange | `clue.k1.jost` | Köder 1-2 |
| `n.zahl_14mio` | 14 Millionen | Wie viel | `clue.k1.rechenbrett` | richtig 1-3 |
| `n.zahl_35000` | 35 000 | Wie viel | `clue.k1.rechenbrett`, `clue.k1.kaufbrief` | Köder 1-3 |
| `n.zahl_800000` | 800 000 | Wie viel | `clue.k1.rechenbrett`, `clue.k1.soll_einnahmen` | Köder 1-3 |
| `n.tausend` | tausend | Wie viel | `clue.k1.mannlich`, `clue.k1.jost` | richtig 1-4, Köder 1-6 |
| `n.sechshundert` | sechshundert | Wie viel | `clue.k1.mannlich` | Köder 1-4 |
| `n.zweihundert` | zweihundert | Wie viel | `clue.k1.jost` | Köder 1-4 |
| `n.jagdrevier` | JagdRevier | Was | `clue.k1.schloezer` | richtig 1-5 |
| `n.thiergarten` | Thiergarten | Was | `clue.k1.gagern` | Köder 1-5 |
| `n.feenschloss` | Feen-Schloß | Was | `clue.k1.feenschloss` | Köder 1-5 |
| `n.neunzehn` | 19 | Wie viel | `clue.k1.amphitheater` | richtig 1-6 |
| `n.zwoelf` | zwölf | Wie viel | `clue.k1.kanonen` | Köder 1-6 |
| `n.herzogsterrassen` | den Herzogsterrassen | Wo | `clue.k1.baerenkaesten` | richtig 1-7 |
| `n.amphitheater` | dem Amphitheater | Wo | `clue.k1.amphitheater` | Köder 1-7 |
| `n.insel` | der Insel | Wo | `clue.k1.insel` | Köder 1-7 |
| `n.karlslust` | Karlslust | Wo | `clue.k1.festplan`, `clue.k1.feuerwerk` | richtig 1-8 |
| `n.orangeriehof` | Orangeriehof | Wo | `clue.k1.festplan` | Köder 1-8 |
| `n.zweibruecken` | Zweibrücken | Wo | `clue.k1.festplan` | Köder 1-8 |
| `n.einziges_geruest` | ein einziges Gerüst | Wie | `clue.k1.feuerwerk` | richtig 1-9 |
| `n.drei_abteilungen` | drei getrennte Abteilungen | Wie | `clue.k1.festplan` | Köder 1-9 |
| `n.vulkan` | den Vulkan | Wie | `clue.k1.festplan` | Köder 1-9 |
| `n.kaskade` | die Kaskade | Wie | `clue.k1.festplan` | Köder 1-9 |
| `n.r_will_nicht` | der Herzog nicht zahlen will | Warum | `clue.k1.hanne` | LESART 1-10 |
| `n.r_creuzer` | der Präsident die Kassen geleert hat | Warum | `clue.k1.soll` | LESART 1-10 |
| `n.r_hunde_bilder` | das Geld in Hunde und Bilder geht | Warum | `clue.k1.jost` | LESART 1-10 |
| `n.r_getaeuscht` | man den Herzog täuschte | Warum | `clue.k1.mannlich` | LESART 1-10 |
| `n.gulden` | Gulden | Was | `clue.k1.hanne` | Köder 2-4 (Kapitel 2) |
| `n.louisdor` | Louis d'or | Was | `clue.k1.kaufbrief` | Köder 2-4 (Kapitel 2) |

---

## 7. Fallseite „Der Hof“

9 FAKT + 1 LESART. Drei Bestätigungen zu je drei Einträgen.

| id | Typ | Satz | richtig (auch richtig) | Köder | Beleg / Codex |
| --- | --- | --- | --- | --- | --- |
| `entry.k1.1` | FAKT | „Nur **___** durfte zum Schloss hinauffahren; alle anderen gingen zu Fuß.“ | der Herzog (Serenissimus) | der Minister, die Herzogin, der Baudirektor | RLS · `cx.11` |
| `entry.k1.2` | FAKT | „Ein Geselle musste **___** arbeiten, um einen Gulden zu verdienen.“ | zwei Tage | eine Woche, einen Tag | EN-KC · `cx.08` |
| `entry.k1.3` | FAKT | „Bau und Betrieb des Karlsbergs kosteten fast **___** Gulden; das ganze Land nahm im Jahr etwa 800 000 ein.“ | 14 Millionen | 35 000, 800 000 | ADB; M1910 Einl. S. XXXIV · `cx.07` |
| `entry.k1.4` | FAKT | „Mannlich sollte einen Zwinger für **___** Hunde bauen.“ | tausend | sechshundert, zweihundert | M1910 S. 365 · `cx.06` |
| `entry.k1.5` | FAKT | „Eine Zeitschrift nannte das Land 1782 ‚ein einziges **___**‘.“ | JagdRevier (Jagdrevier) | Thiergarten, Feen-Schloß | WP-K2A · `cx.05` |
| `entry.k1.6` | FAKT | „Die Tiere der Menagerie lebten in **___** kleinen Häusern im Kreis um einen Wassergraben.“ | 19 | zwölf, tausend | SPT · `cx.12` |
| `entry.k1.7` | FAKT | „Die eisernen Bären-Kästen von 1786 standen auf **___**.“ | den Herzogsterrassen | dem Amphitheater, der Insel | SPT, US · `cx.13` (STRITTIG, ob dort je Bären lebten) |
| `entry.k1.8` | FAKT | „Im Dezember 1785 explodierte das Feuerwerk in der **___**.“ | Karlslust | Orangeriehof, Zweibrücken | WP-SK; M1910 S. 386–392 · `cx.14` |
| `entry.k1.9` | FAKT | „Gegen den Rat des Feuerwerkers lagen alle Raketen auf **___**.“ | ein einziges Gerüst | drei getrennte Abteilungen, den Vulkan, die Kaskade | M1910 S. 389 · `cx.14` |
| `entry.k1.10` | LESART | „Hanne bekommt den Lohn ihres Mannes nicht, weil **___**.“ | – | – | `flag.k1_lohn` = will_nicht / creuzer / hunde_bilder / getaeuscht |

**Gedenkzeile** (`entry.k1.gedenk`, kein Rätsel, wird beim Echo am Rondell automatisch eingetragen und ist nicht auswählbar oder veränderbar):
> „Am 19. Dezember 1785 explodierte in der Karlslust das Feuerwerk zur Hochzeit des Prinzen Max. Nach Mannlichs Bericht traf es Major Magnier und elf seiner Arbeiter. Der Major starb; von den Arbeitern lebten zwei schwer verbrannt, für zwei weitere bestand keine Hoffnung. Die Namen der Arbeiter sind nicht überliefert.“
> Quelle: M1910 S. 391 f.; WP-SK („mehrere Menschen“). Codex `cx.14`.

**Freischaltungen:** 1. Satz → Anker Karlslust. 2. Satz → Spurenleser 1. 3. Satz → Kapitel 2 (Anker Torhaus 1793-02) und Kartograf 2 (Messtischblatt 1935 als Überlagerung).

---

## 8. Hinweisleiter (Laub)

1. „Zahlen lügen nicht, sie sind nur schlecht beschriftet. Wenn Sie drei Zahlen haben und für zwei davon einen Namen, dann gehört die dritte zum Rest. Das ist keine Mathematik, das ist Verwaltung.“
2. „Mannlich hat drei Feste geplant, und nur eines ist explodiert. Seine Pläne liegen in der Orangerie. Was in der Karlslust geschah, hören Sie dort, wo die Kaskade oben endet. Gehen Sie leise hin.“
3. „Zählen Sie die Häuschen im Rund selbst. Wo die Bären wohnten, sieht man nicht im Rund, sondern weiter oben auf den Terrassen. Und das Jagdrevier steht in einem Zeitschriftenheft von 1782, das der Kanzlist in der Schublade hat. Der Thiergarten ist von Gagern, und der kam später.“

---

## 9. Bedrohung (Notizen für Designer)

**Teil A (Tag):** keine Meute. Druck entsteht nur durch den Ölvorrat. Hofleute sind Echos und sehen dich nicht. Einzige Regel mit Humor: Wer im Ehrenhof rennt (Shift), wird von der Wache mit „Langsam! Hier rennt nur das Geld davon.“ angerufen, aber nicht aufgehalten. Das ist ein Running Gag (Reaktion `wache-rennen`, Zeile `wache.k1.rennen`, höchstens alle 30 s), der beim wiederholten Rennen eskaliert und nach der vierten Zeile verstummt:
  1. „Langsam! Hier rennt nur das Geld davon.“
  2. „Schon wieder? Dem Geld läuft Er so nicht hinterher. Das ist längst über alle Berge.“
  3. „Ich schreib Ihn auf. Gleich hinter die Baurechnung, da ist noch Platz.“
  4. „Renn Er nur. Ich steh hier seit sechs Uhr, ich hab Zeit.“

**Teil B (Nacht, Karlslust):** Erste Jagd mit **3 Hunden** (Diane, Sultan, Bijou), **ohne Pikeur**.
- **Patrouille:** Vom unteren Ende der Apfelallee (≈ 1575/−408) über das Torhaus (1643/−425) zum Weg oberhalb der Schwanenweiher, dann im Kreis um das Amphitheater (Radius ≈ 45 m) und zurück. Auf dem OSM-Wegegraph die nächsten Wege zu diesen Punkten nehmen.
- **Sicht:** 30 m nachts, mit Laterne 70 m. **Gehör:** Rennen 30 m, Gehen 15 m, Schleichen 6 m, Liegen 0 m, Waten 20 m.
- **Sichere Zonen:**
  - Wasser: Tosbecken und Schwanenweiher. Wer im flachen Randwasser steht oder watet, verliert die Spur nach 3 s. Tiefes Wasser betreten die Hunde nicht.
  - Der Wassergraben des Amphitheaters (TF-37): wie Wasser.
  - Die Stufen der Terrassentreppe (TF-35): Wer flach hinter einer Stufenkante liegt, ist auf mehr als 8 m unsichtbar.
  - Sandsteinbrocken an den Dämmen (FAKT: Tumulus und Dämme waren mit Findlingen verkleidet): Sichtschutz.
  - Das Rondell während des Echos.
- **Telegraf:** Ein langer Hornton = die Meute ist los. Zwei kurze = sie hat deine Fährte. Ein fallender Ton = sie hat dich verloren und sucht am letzten Ort. Drei lange = sammeln, die Patrouille geht weiter. Jeder Ruf hat einen Untertitel (siehe `09-ui-texte.md`). Mit Spurenleser 1 sagt der Untertitel auch, was der Ruf bedeutet.
- **Gestellt:** Wenn ein Hund 2 s lang Sicht auf dich hat und weniger als 4 m entfernt ist. Dann Abblende und Text „Die Meute hat dich gestellt …“. Du wachst nicht in der Feldstation auf, sondern am Anker des Kapitelteils, im Heute (Beat-Feld `wake`): in Teil B an der Tschifflik-Terrasse („Du kommst an der Tschifflik-Terrasse zu dir, im Heute. Was bestätigt ist, bleibt.“), in Teil A (leeres Öl) am Ehrenhof, beim Zwinger (1.5) am Zwinger; auf dem Heimweg (1.6) in der Station. Q bringt dich sofort zurück; der Kilometer von der Station entfällt.
- **Die Flucht (1.14):** Parforce ohne Reiter, 5 s Vorsprung. Die Hunde kommen hart aus dem Start (`burst` 1.3), bis sie etwa 9 m hinter dir sind (`heel`), und halten dann dein Tempo (`keepPace`): wer weiterrennt, wird nicht gestellt, sieht sie aber dicht hinter sich. Wer stehen bleibt, sieht sie kurz zögern und anschlagen; wer trödelt oder geht, wird gestellt. Gestellt (oder mit Q ins Heute geflohen) ist die Flucht nicht vorbei: Du kommst an der Tschifflik-Terrasse zu dir, Q bringt dich zurück in die Nacht, und die Meute setzt wieder an; erst das Tosbecken beendet 1.14. Geprüft in `tests/hunt-k1.test.ts`.
- **Tuning-Ziel:** Ein aufmerksamer Spieler wird beim ersten Mal höchstens einmal gestellt. Die Seite am Rondell (1.12) ist der einzige Moment echter Verfolgung, und das Tosbecken ist nur 160 m entfernt.


## Action-RPG-Umbau (Quests statt Fallakte)

Kapitel 1 läuft jetzt als Questkette (`content/quests/01-kapitel-1.quests.json`, Katalog in `docs/ACTION-RPG.md` §11.1). Die Sätze 1–3 und die Lesarten sind entfallen. Die Beats warten auf Quests.

- **Zu Fuß, außer einem** (Laub): Q am Ehrenhof, das Echo der Wache, die Flügel.
- **Der Kanzlist zählt** (Soll gibt die Quest, über seinem Kopf steht eine Glyphe): Rechenbrett, Kaufbrief, Schlözer-Heft. Danach flattern **sechs Mahnbriefe** in den Küchenhof; das ist komisch, nicht grausam. Bei der Abgabe an Soll kommen die Zahlen als Geschichtszeile mit Quelle. Belohnung: Solls Rechenpfennig.
- **Matthes' Lohn** (Hanne): Soll nach Matthes fragen, das Steinmetzzeichen ansehen. Bei Dämmerung steigt auf dem Bauplatz **das Schuldbuch** auf (Boss, 1300/−1254). Aus seinen Seiten fällt der **Lohnzettel**. Die Haltung bei Hanne steht in `flag.k1_lohn`. Belohnung: Messstab II.
- **Tausend Hunde** (Jost): Josts Lehre vom Verstecken, fünf Stück Fleisch zum Zwinger bringen, **drei Streuner**. Belohnung: Hundemarke, Spurenleser 1.
- **Die Karlslust bei Nacht** (Laub):
  - die Terrasse, das Rund zählen, die Bärenkästen
  - **fünf Irrlichter** über dem Schwanenweiher; die Patrouille geht erst danach
  - das **Rondell** als stiller Ort: keine Gegner, nur das Echo und eine Gedenkzeile
  - die Chronikseite, dann die Flucht zum Tosbecken
- Nebenquests:
  - **Der Kasuar ist los** (der Gärtner): den Kasuar beruhigen, nie bekämpfen.
  - **Mannlichs Festpläne** (der Diener): vier Mahnbriefe, drei Planblätter, Mannlichs Echos.
  - **Die Namen der Hunde** (Jost): fünf Marken, jede von einem Streuner bewacht.
- Historische Personen geben keine Quests. Matthes ist eine Erinnerung und nie ein Gegner.
