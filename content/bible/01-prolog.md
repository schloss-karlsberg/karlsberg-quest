# Prolog „Vermessung“

| | |
| --- | --- |
| Ära | `heute` (ein Novembernachmittag, Nebel in den Senken, 8 °C); kurzer Wechsel nach `1789-07` |
| Dauer | 15–20 min |
| Lernziele | Gehen, Untersuchen (Klick), Relief-Blick 1–3, Karte vergleichen (M), Geisterblick (F), Chronik (Tab), Zeitwechsel (Q) |
| Ende | Fallseite „Vermessung“ ganz bestätigt → Kapitel 1 offen |
| Stimmung | Klar, kühl, neugierig. Unbehagen nur am Rand: ein Hund, wo keiner sein kann |

> **Brücke (2026-11-20, Tour-WP-01/03):** Zuhause ist jetzt die **Karlsbergquelle** (`HOME`, 1061/−834.5), nicht mehr die Feldstation. Den Bauwagen gibt es nicht mehr; Pinnwand, Funkgerät, Regal, Schublade und Feldbett sind die Kacheln der Pause an der Quelle (Chronik, Handy, Mauerkante, Mauernische, Karte, Bank). Wer gestellt wird, wacht an der Quelle auf (1059.3/−833.1). Bis die Führung (Tour, `docs/design/tour`) diesen Prolog ersetzt, **beginnt** er noch am alten Platz am Waldweg (760/−902: Messstab, erster Kampf am Damm); P10 führt in der Dämmerung zur Quelle zurück (zu Fuß, Dreibein Karlsbergquelle oder noch Feldstation), P11 endet auf der Bank. Die Texte unten beschreiben weiter den alten Ablauf; die Neufassung kommt mit der Tour.

---

## 1. Ablauf (Beats in Reihenfolge)

**P0 – Vor dem Spiel.** Titel → Inhaltshinweis (16+) → Namenseingabe → schwarzer Bildschirm mit einer Streichholzschachtel: „Laterne anzünden“ (Klick startet den Ton, siehe `09-ui-texte.md`).

**P1 – Die Feldstation.** Du stehst im Bauwagen. Regen tickt aufs Dach, das Funkgerät rauscht. Marlene meldet sich (`marlene.p.01`). Du lernst zu gehen und Dinge anzuklicken: die Pinnwand mit dem Lageplan (`clue.p.lageplan`), das Messtischblatt daneben (`clue.p.messtischblatt`), das Regal mit dem Reliefmuster-Handbuch (`clue.p.handbuch`) und die Schublade. In der Schublade liegen eine Messing-Bussole und ein vergilbter Kartendruck mit Bleistiftnotizen (`clue.p.laubblatt`). Die Bussole ist kalt und still. Mit dem Kartendruck wird **M (Karte vergleichen)** freigeschaltet.

**P2 – Der Damm.** Draußen, 60 m zum Damm des Karlsbergweihers. Tutorial Relief-Blick 1 (Hillshade): Wasserfläche und Damm. Marlene: „Schalt mal auf Lokales Relief.“ → **Relief-Blick 2** wird freigeschaltet. Neben dem Damm erscheint ein kleines Rechteck aus Kanten (`clue.p.mauerrest`), und die Karte `rm.07` „Fundament und Mauerzug“ geht ins Handbuch.

**P3 – Der Weg nach oben.** Der Waldweg führt nach Osten bergauf (≈ 480 m). Am Fuß der Orangerie steht eine gerade, hohe Stufe im Wald. Tutorial **Relief-Blick 3 (VAT)**: Die Kante wird scharf, 81 m lang (`clue.p.orangeriemauer`). **Die Bussole zittert.** Eine trockene Stimme sagt: „Fünf Meter dreißig. Für Orangen.“ Das ist Laubs Einführung (`laub.p.intro`).
*Tempo (Playtest Runde 10):* Sobald der Nebelling aus der Mauer vertrieben ist, sagt Marlene, dass F (Geisterblick) über den Wald fliegt (`marlene.p.flug`); das Ziel nennt „F: darüber fliegen“, solange der Weg läuft. Auf halber Höhe (≈ 1000/−905) meldet sie sich noch einmal: die runden, flachen Stellen am Hang (`marlene.p.halbweg`), die oben zum Auftrag „Kohlplatten“ werden. Kein Kampf auf dem Weg (EP-Budget des Prologs).

**P3Q – Die Quelle.** Kaum ist Laub wach, hört er etwas: „Wasser. Unten im Hang, wo der Bach anfängt. Es erinnert sich an etwas.“ (`laub.p.quelle`). Die Nadel ruckt den Hang hinunter. Lichtpünktchen treiben den Bach hinab, über dem Wasser steht ein weicher Lichtschein. In einer kleinen Rinne zwischen Orangerie und Weiher liegt die **Karlsbergquelle**: eine niedrige Trockenmauer aus rotem Sandstein mit einem Schildchen, ein Rohr, ein ausgehöhlter Stamm als Trog auf zwei Stümpfen, links Sandsteinstufen, hangaufwärts eine kleine gewölbte Brunnenstube, halb im Boden. Laub: „Halten Sie die Hand hinein. Nein, das ist nicht hygienisch. Tun Sie es trotzdem.“ Am Trog: **E „Wasser berühren“**. Die Hand taucht ein, ein Ring läuft übers Wasser und bleibt stehen. Der Ton bricht weg, der Strahl aus dem Rohr hängt in der Luft, dann läuft der Bach rückwärts den Hang hinauf. Der Boden kippt: **1789**.
*FAKT:* die Quelle selbst (OSM-Knoten 368031320, Beginn des Karlsbergbachs, rund 60 m unter der Orangerie-Terrasse), die heutige Fassung mit Trog, Mauer, Rohr und Brunnenstube, die Infotafel daneben (`cx.41`). Wann sie gefasst wurde und ob sie das Schloss versorgte, ist **nicht belegt**.
*FIKTION:* dass das Wasser sich erinnert und wer es berührt, in ein anderes Jahr gerät (`cx.42`, `cx.38`).

**P3R – Die Brunnenstube.** Dieselbe Stelle, zweihundert Jahre jünger. Statt der Trockenmauer steht eine barocke Brunnenstube: eine Front aus Quadern, eine Rundbogennische, ein Speier aus Bronze, ein Steinbecken, davor Steinplatten. Das Wasser ist zuerst noch starr und taut dann auf. Laub erklärt die Regel: Ein Tropfen des Wassers sitzt jetzt in der Bussole. Wo der Boden sich genauso gut erinnert, nimmt er uns mit (`laub.p.quelle.regel`). Zurück geht es immer: **Q halten**. Wieder im Heute: „Merken Sie sich die Stelle.“
*FIKTION:* die ganze Brunnenstube von 1789 bis 1796. Wie die Quelle im 18. Jahrhundert gefasst war, ist nicht überliefert (`cx.42`).

**Die Quelle in den Ären.** Heute der Trog. 1789 die neue Brunnenstube. Februar 1793 Eiszapfen, das Wasser gefroren. Juli 1793 die Brunnenstube im Feuerschein. 1796 geplündert: der Speier herausgerissen, das Becken gesprungen, die Tür der Brunnenstube fort.

**P4 – Der Ehrenhof.** Eine Lichtung auf einer ebenen Terrasse, umgeben von flachen Mauerzügen (`clue.p.ehrenhof`). Taste M legt Laubs Karte darüber. Die rote Signatur „Ruine Carlsberg“ sitzt deutlich östlich der Mauern (`clue.p.kartenvergleich`). Laub ist beleidigt (`laub.p.versatz`). Optional: Geisterblick F → Überflug. Von oben sieht man die Nordterrasse als zweite große ebene Fläche (`clue.p.nordterrasse`).

**P5 – Der Hohlweg.** Westlich des Schlosses läuft ein Weg tief im Boden, 249 m nach Norden (`clue.p.hohlweg`). Marlene erklärt, wie Hohlwege entstehen.

**P6 – Die Grube.** Östlich des Schlosses liegt an einer Wegkreuzung eine runde Grube mit Ringwall, etwa 10 m breit (`clue.p.eiskeller`).

**P7 – Die Punktwolke.** Das Tablet piept: Marlene hat einen Ausschnitt aus der Punktwolke geschickt (`clue.p.punktwolke`, sofort im Feldbuch, erst danach ihr Funkspruch; so zeigt die Bussole nie zurück zur Feldstation). Quer über den Ehrenhof läuft eine Reihe kleiner Abdrücke im Boden, in Pfotengröße, im Trab. Das Forstamt sagt, der Wald war beim Flug leer. Laub sagt nur: „Hunde.“

**P8 – Die Chronik öffnet sich.** Tab öffnet die Fallseite „Vermessung“. Sie kommt aus Laubs Bussole: Beim Öffnen des Deckels liegt eine angesengte Seite darin, die vorher nicht da war (`clue.p.seite_eins`). Der Spieler füllt die Einträge. **Bestätigt wird nur im Heute.** Der erste Satz von drei richtigen FAKT-Einträgen schaltet den **Zeitwechsel (Q)** am Anker Ehrenhof frei. Laub erklärt die Regeln (`laub.p.regeln`).

**P9 – Der eigene Wechsel (Wow W1).** (Früher „Der erste Wechsel“. Seit der Quelle ist es der zweite, aber der erste, den man selbst macht.) Am Ehrenhof Q drücken. Das Schloss steigt aus dem Boden (siehe `00-overview.md` W1). 90 Sekunden Laternenöl. Echo `echo.p.diener` (Diener und Gärtner). Danach heult im Norden ein einzelner Hund (Richtung Zwinger, 1216/−1571). Die Bussole ruckt. Laub: „Zurück. Jetzt.“ Prompt: Q halten.

**P10 – Zurück.** Feldstation, Abend. Das Ziel bietet sofort die Karte an (M: die Feldstation ist eingemessen, hinreisen; oder F: fliegen); die Ankunft per Karte zählt als „daheim“, niemand muss 470 m zum Feldbett laufen. Der zweite bestätigte Satz schaltet Kapitel 1 frei.

**P11 – Cliffhanger.** Der Laptop piept. Die Punktwolke hat neue Punkte, obwohl die Datei vom Februar 2025 ist. Die Spur läuft jetzt vom Ehrenhof den Hang herunter, über den Damm, bis an die Tür des Bauwagens und hört dort auf. Am Fenster bildet sich Reif, obwohl es draußen acht Grad hat. Ganz fern ein Horn, ein langer Ton. Laub (`laub.p.ende`): „Machen Sie die Laterne aus. Und dann schlafen Sie. Morgen ist 1789.“

---

## 2. Orte und Trigger

| id | Ort | Bezug in den Quelldaten | x | z | r (m) | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.p.station` | Feldstation (Bauwagen am Waldweg unterhalb des Damms) | FIKTION; nahe POI r03-03 und TF-22 | 760 | −930 | 30 | heute | Hub, sichere Zone, Pinnwand = Chronik-Bestätigung |
| `loc.p.damm` | Damm des Karlsbergweihers | TF-22, LiDAR KB-42, POI r03-04 | 819 | −875 | 25 | heute | Tutorial Relief 1→2 |
| `loc.p.mauerrest` | Mauerrest am Weiher | POI r03-03 (OSM historic=ruins) | 813 | −903 | 15 | heute | `clue.p.mauerrest` bei aktivem Relief 2 |
| `loc.p.orangerie` | Westliche Stützmauer der Orangerie | LiDAR KB-30, Katalog KB-B10, TF-07 | 1237 | −966 | 40 | heute | Tutorial VAT; Laub erwacht |
| `loc.p.quelle` | Karlsbergquelle (Quellmulde am Fuß des Hangs, Beginn des Karlsbergbachs) | OSM-Knoten 368031320 (natural=spring), LiDAR-Rinne zum Weiher; die Brunnenstube 1789 ist FIKTION | 1061 | −834,5 | 7 (Trog: 1059,3 / −833,1) | alle | E „Wasser berühren“ (nur heute, P3Q) → erster Wechsel nach 1789 |
| `loc.p.ehrenhof` | Ehrenhof-Lichtung | TF-01, LiDAR KB-01, POI r03-01 | 1216 | −1114 | 35 | heute / 1789-07 | Anker; Kartenvergleich; erster Wechsel |
| `loc.p.nordterrasse` | Nordterrasse (Marstall-/Reitplatz?) | LiDAR KB-20, TF-05 | 1227 | −1466 | 60 | heute | Köder für P-1 (nur sichtbar im Überflug oder zu Fuß) |
| `loc.p.hohlweg` | Hohlweg westlich des Schlosses | LiDAR KB-10, TF-10 | 1172 | −1238 | 20 (Linie N–S, 249 m) | heute | `clue.p.hohlweg` bei Relief 2 oder 3 |
| `loc.p.eiskeller` | Eiskeller | LiDAR KB-50, Katalog KB-B28, POI r03-05 | 1508 | −1296 | 15 | heute | `clue.p.eiskeller` |

---

## 3. Hinweise (Clues)

**`clue.p.lageplan`** – Pinnwand, Feldstation.
*Sieht:* Ein großer Ausdruck „Lageplan Schloss Karlsberg, Forschungsstand 2006 (Nachzeichnung)“, darunter klein: „Grundlage: schloss-carlsberg.de, CC BY-SA 2.0 DE“. Die Legende nennt Ehrenhof, Corps de logis, Galerie, Orangerie, Marstall, Reithalle, Exerzierplatz, Zwinger, Eiskeller. Den Ehrenhof umschließen drei Flügel. Reithalle und Exerzierplatz liegen weit im Norden. Der Titelstempel lautet „Rekonstruktion Sommer 1789 – Hypothese“.
*Gibt:* `n.ehrenhof`, `n.exerzierplatz`, `n.reitbahn`, `n.orangerie`, `n.galerie`, `n.marstall`, `n.eiskeller`, `n.jahr_1789`.

**`clue.p.messtischblatt`** – Pinnwand, Feldstation.
*Sieht:* Fotokopie eines Messtischblatts. Bleistift von Marlene: „1935 – liegt nur 10–15 m daneben, gut brauchbar.“
*Gibt:* `n.jahr_1935`, `n.versatz_15`.

**`clue.p.handbuch`** – Regal, Feldstation. Das Reliefmuster-Handbuch des Forstamts, acht Karten (`rm.01`–`rm.08` in `07-codex.md`).
*Gibt:* `n.hohlweg`, `n.wassergraben`, `n.ausbruchgraben`, `n.bombentrichter`, `n.meilerplatz`. (Die Karten stehen ab jetzt im Codex.)

**`clue.p.laubblatt`** – Schublade, Feldstation.
*Sieht:* Druck eines bayerischen Positionsblatts mit gestochener Schrift „Ruine Carlsberg“, „Carlsbergerhof“, „Sanddorf“. Am Rand steht in Bleistift und sehr ordentlicher Kurrentschrift: „Aufgen. Nov. 1840. Q. L. – Standpunkt 17 am alten Forsthaus.“
*Gibt:* `n.jahr_1840`. Schaltet M frei.

**`clue.p.mauerrest`** – Damm, Relief 2.
*Sieht:* Ein kleines Rechteck aus geraden Kanten neben dem Damm.
*Hört (Marlene):* „Gerade Linien und rechte Winkel macht der Wald nicht. Das war mal eine Mauer.“
*Gibt:* keine Fallsubstantive, aber `rm.07` ist entdeckt (Tutorial).

**`clue.p.orangeriemauer`** – Orangerie, Relief 3 (VAT).
*Sieht:* Eine schnurgerade Kante, 81 m lang, darunter eine Bank, die 5,3 m tiefer liegt. Darüber eine ebene Fläche.
*Hört (Laub):* „Fünf Meter dreißig. Für Orangen.“
*Gibt:* `n.orangerie` (durch Abgleich mit dem Lageplan; der Clue setzt das Substantiv erst, wenn der Lageplan schon untersucht ist, sonst nur einen Merker „gerade Stufe“).

**`clue.p.ehrenhof`** – Ehrenhof, Relief 2/3.
*Sieht:* Eine ebene Fläche auf 344,8 m Höhe. Im Süden, Osten und Norden ziehen flache Mauerzüge herum, nach Westen ist sie offen.
*Hört (Laub, wenn der Lageplan schon untersucht ist):* „Drei Flügel, offen zur Straße. So baut man, wenn man gesehen werden will.“
*Gibt:* bestätigt die Form für P-1. Keine neuen Substantive.

**`clue.p.nordterrasse`** – Nordterrasse, im Überflug (F) oder zu Fuß.
*Sieht:* Eine zweite, noch größere ebene Fläche, 190 × 95 m, auf fast derselben Höhe (344,1 m). Steile Kanten im Süden und Osten, keine Flügel.
*Hört (Laub):* „Auch eben. Aber da haben keine Flügel gestanden, da sind Pferde im Kreis gelaufen. Vermutlich.“
*Gibt:* `n.reitbahn` (falls noch nicht da). Das ist der Köder für P-1.

**`clue.p.kartenvergleich`** – Ehrenhof, Taste M.
*Sieht:* Laubs Karte über dem Relief. Die roten Gebäudezeichen sitzen ein Stück östlich der Mauerzüge. Ein Messlineal erscheint automatisch: rund 50 m.
*Hört:* `laub.p.versatz` (siehe unten).
*Gibt:* `n.versatz_50`, `n.versatz_500`.

**`clue.p.hohlweg`** – Hohlweg, Relief 2 oder 3.
*Sieht:* Ein Weg, 2 bis 3 m tief eingeschnitten, schnurgerade nach Norden. Er folgt keinem Bach.
*Hört (Marlene):* `marlene.p.hohlweg`.
*Gibt:* `n.hohlweg`.

**`clue.p.eiskeller`** – Eiskeller, Relief 3.
*Sieht:* Eine runde Grube, 10 m breit, 1,8 m tief, mit einem Ringwall darum. Sie liegt einzeln, ohne Nachbarn.
*Hört (Laub, wenn das Handbuch gelesen ist):* „Bombentrichter kommen selten allein, sagt Ihr Handbuch. Und Köhler bauen ihre Meiler nicht in Löcher, sondern auf Platten.“
*Gibt:* `n.eiskeller` (mit Lageplan), Abgrenzung zu `n.bombentrichter` und `n.meilerplatz`.

**`clue.p.punktwolke`** – Tablet, ausgelöst nach P4 durch Marlenes Funkspruch (`marlene.p.punkte`).
*Sieht:* Bodenpunkte unter dem Kronendach. Quer über den Ehrenhof eine Reihe von Abdrücken, etwa 8 cm groß, paarweise, im Abstand eines Trabs.
*Hört:* Marlene: „Wildschweine machen andere Spuren. Und Hunde waren da nicht, der Wald war gesperrt.“ Ein Kollege im Funk, leise: „Mehrfachreflexion. Ein Messfehler.“ Laub: „Hunde.“
*Gibt:* `n.hunde`, `n.wild`, `n.messfehler` (nur für die LESART).

**`clue.p.seite_eins`** – Deckel der Bussole, sobald man sie zum ersten Mal öffnet (nach P7).
*Sieht:* Ein angesengtes Blatt, Handschrift des 18. Jahrhunderts, Überschrift: „Was der Hof schuldig blieb“. Darunter nur Spalten: „Wem – Was – Wann – Wo“. Unten ein Satz, in anderer Tinte und in Laubs Kurrent: „Fortgesetzt Nov. 1840. Nicht vollendet.“
*Gibt:* öffnet die Chronik (Tab). Keine Substantive.

---

## 4. Echos

**`echo.p.diener`** – Ehrenhof, Ära `1789-07`, beim ersten Wechsel automatisch (kein E nötig). Marke: Erinnerung (Fiktion).
- DIENER (ruft quer über den Hof, zu dir): „Zu Fuß, Monsieur! Hinauf fährt nur Serenissimus.“ [P nach RLS: Nur der Herzog durfte zum Schloss hinauffahren.]
- (Ein Gärtner an der Rabatte summt ein Lied.)
- ZWEITER GÄRTNER (zischt): „Pst. Willst du Prügel?“ [P nach RLS: Singen war streng verboten, im besten Fall drohten Stockschläge.]
- (Das Summen bricht ab. Dann, fern im Norden, ein einzelnes langes Heulen.)

---

## 5. Gesprochene Zeilen

**Marlene (Funk)**

- `marlene.p.01` (Start): „{Name}? Hier Marlene, Revier Karlsberg. Bist du gut angekommen? Gut. Der Auftrag ist einfach: Prüf mir die Laserdaten vom letzten Winter. Wir wollen wissen, was unter dem Wald liegt, bevor wir dort Wege bauen. Und bevor du fragst: Ja, da oben war mal ein Schloss. Der Wald steht drauf.“
- `marlene.p.02` (nach dem Untersuchen der Schublade): „Ach, die Bussole. Die lag schon im Wagen, als wir ihn gekauft haben. Die zeigt nicht nach Norden, hab ich festgestellt. Behalt sie trotzdem, sie bringt Glück, sagt der Kollege. Er hat sie nie angefasst.“
- `marlene.p.damm` (am Damm): „Siehst du den Weiher? Das ist kein Naturteich, das ist Barock. Schalt mal auf Lokales Relief, dann siehst du mehr.“
- `marlene.p.mauerrest`: „Gerade Linien und rechte Winkel macht der Wald nicht. Das war mal eine Mauer.“
- `marlene.p.weg` (auf dem Weg nach oben): „Und, {Name}: Wir schauen, wir graben nicht. Nichts anfassen, nichts mitnehmen. Was da im Boden liegt, gehört dem Land, und es ist geschützt.“
- `marlene.p.hohlweg`: „Das ist ein Hohlweg. Karren, Hufe, Regen, ein paar hundert Jahre, und der Weg frisst sich in den Boden. Bei Nebel ist das der dunkelste Ort im ganzen Revier. Und der stillste.“
- `marlene.p.halbweg` (P3, auf halber Höhe): „Halbe Höhe. Guck mal links und rechts am Hang: runde, flache Stellen, wie Teller. Merk sie dir. Die erklär ich dir, wenn du oben bist.“
- `marlene.p.punkte` (P7, nachdem die Datei da ist): „Hast du die Datei? Die hat der Kollege in der Punktwolke gefunden, mitten auf der Lichtung. Sag mir, dass das Wildschweine sind.“
- `marlene.p.abend` (P10): „Du bist ja ganz blass. Mach dir einen Tee. Morgen früh komm ich mit Brötchen vorbei.“

**Quirin Laub (Bussole)**

- `laub.p.intro` (an der Orangeriemauer; die Bussole zittert):
  „Fünf Meter dreißig. Für Orangen.
  Erschrecken Sie nicht, das ist schlecht für die Messgenauigkeit. Laub, Quirin, königlich bayerischer Geometer, abgeordnet zur Landesaufnahme im Rheinkreis. Seit November 1840 verwaltungstechnisch verschollen. Meine letzten Tagegelder hat man mir übrigens nie ausgezahlt.
  Sie vermessen den Berg? Gut. Dann sind wir zu zweit. Ich bin der Kleinere.“
- `laub.p.quelle` (P3Q, gleich nach dem Erwachen): „Hören Sie das? Nein, natürlich nicht. Wasser. Unten im Hang, wo der Bach anfängt. Es erinnert sich an etwas.“
- `laub.p.quelle.b`: „Gehen Sie hin. Die Nadel zeigt es Ihnen.“
- `laub.p.quelle.nah` (an der Quelle): „Da. Die Karlsbergquelle. Ein Trog, eine Mauer, ein Rohr. Das Wasser ist älter als alle drei.“
- `laub.p.quelle.trog`: „Halten Sie die Hand hinein. Nein, das ist nicht hygienisch. Tun Sie es trotzdem.“
- `laub.p.quelle.1789` (P3R): „Siebzehnhundertneunundachtzig. Dieselbe Quelle, zweihundert Jahre jünger. Gefasst in Stein, mit Bronze. Ob sie wirklich so aussah? Mein Blatt sagt nichts dazu. Das Wasser schon.“
- `laub.p.quelle.regel`: „Das Wasser erinnert sich. Ein Tropfen davon sitzt jetzt in der Bussole. Wo der Boden sich genauso gut erinnert, nimmt er uns mit. Mehr später.“
- `laub.p.quelle.zurueck`: „Zurück geht es immer: Q gedrückt halten. Jetzt bitte. Mir bekommt das achtzehnte Jahrhundert nicht.“
- `laub.p.quelle.heute` (wieder im Heute): „Da sind wir wieder. Merken Sie sich die Stelle. Und nun hinauf, ich habe am Ehrenhof etwas nachzumessen.“
- `laub.p.intro2` (wenn man weitergeht): „Fragen Sie nicht, wie ich in das Messing gekommen bin. Später. Fragen Sie lieber, warum ein Herzog einen ganzen Berg umgraben lässt, damit der Hof eben liegt. Antwort: weil er es konnte. Fußnote: Bezahlt hat er es nicht.“
- `laub.p.versatz` (Kartenvergleich am Ehrenhof): „Fünfzig Meter. Ich sehe es selbst. Ich möchte festhalten, dass mein Blatt 1840 vollkommen in Ordnung war. Die Herrschaften, die es zweihundert Jahre später auf ihre Koordinaten genagelt haben, die hatten offenbar einen schlechten Tag. Fünfhundert hätte man gemerkt. Fünfzig merkt nur ein Geometer. Und ein Geometer merkt es ewig.“
- `laub.p.ehrenhof`: „Drei Flügel, offen zur Straße. So baut man, wenn man gesehen werden will.“
- `laub.p.nordterrasse`: „Auch eben. Aber da haben keine Flügel gestanden, da sind Pferde im Kreis gelaufen. Vermutlich. Ich war nicht eingeladen.“
- `laub.p.punktwolke`: „Hunde.“ (Pause.) „Fragen Sie nicht. Füllen Sie die Seite aus.“
- `laub.p.regeln` (nach dem ersten bestätigten Satz; die Nadel schwingt zum Ehrenhof; im Spiel heute: „So. Das Wasser hat Sie einmal mitgenommen, und der Berg kennt Sie jetzt. Das reicht, um selbst zu gehen.“ und „Erstens: Sie können nur dort hinüber, wo die Nadel steht. Dort erinnert sich der Boden. Taste Q.“):
  „So. Der Berg glaubt Ihnen jetzt drei Dinge. Das reicht für einen Blick.
  Hören Sie gut zu, ich sage es nur einmal und dann noch ungefähr vierzigmal.
  Erstens: Sie können nur dort hinüber, wo die Nadel steht. Taste Q.
  Zweitens: Ihre Laterne brennt dort drüben auf Kosten Ihrer Zeit. Wenn das Öl aus ist, sind Sie wieder hier. Unsanft.
  Drittens: Wenn Sie ein Horn hören, legen Sie sich hin. Nicht diskutieren. Hinlegen.
  Viertens: Wenn Sie zurück wollen, halten Sie Q. Es geht nicht, solange Sie jemand ansieht.“
- `laub.p.1789` (während W1, leise): „Sehen Sie. Kein Wald. Den hat man erst hinterher gepflanzt, als es nichts mehr zu sehen gab.“
- `laub.p.zurueck` (nach dem Heulen): „Zurück. Jetzt.“
- `laub.p.ende` (P11): „Machen Sie die Laterne aus. Und dann schlafen Sie. Morgen ist 1789.“

---

## 6. Substantive (Eingabe für die Clue-Prüfung)

| id | Anzeige | Kategorie | gefunden in | verwendet als |
| --- | --- | --- | --- | --- |
| `n.ehrenhof` | Ehrenhof | Wo | `clue.p.lageplan` | richtig P-1 |
| `n.exerzierplatz` | Exerzierplatz | Wo | `clue.p.lageplan` | Köder P-1 |
| `n.reitbahn` | Reitbahn | Wo | `clue.p.lageplan`, `clue.p.nordterrasse` | Köder P-1 |
| `n.orangerie` | Orangerie | Wo | `clue.p.lageplan`, `clue.p.orangeriemauer` | richtig P-2 |
| `n.galerie` | Galerie | Wo | `clue.p.lageplan` | Köder P-2 |
| `n.marstall` | Marstall | Wo | `clue.p.lageplan` | Köder P-2 |
| `n.hohlweg` | Hohlweg | Was | `clue.p.handbuch`, `clue.p.hohlweg` | richtig P-3 |
| `n.wassergraben` | Wassergraben | Was | `clue.p.handbuch` | Köder P-3 |
| `n.ausbruchgraben` | Ausbruchgraben | Was | `clue.p.handbuch` | Köder P-3 (richtig in Kap. 4) |
| `n.eiskeller` | Eiskeller | Was | `clue.p.lageplan`, `clue.p.eiskeller` | richtig P-4 |
| `n.bombentrichter` | Bombentrichter | Was | `clue.p.handbuch` | Köder P-4 |
| `n.meilerplatz` | Meilerplatz | Was | `clue.p.handbuch` | Köder P-4 |
| `n.jahr_1840` | 1840 | Wann | `clue.p.laubblatt` | richtig P-5 |
| `n.jahr_1789` | 1789 | Wann | `clue.p.lageplan` | Köder P-5 |
| `n.jahr_1935` | 1935 | Wann | `clue.p.messtischblatt` | Köder P-5 |
| `n.versatz_50` | 50 | Wie viel | `clue.p.kartenvergleich` | richtig P-6 |
| `n.versatz_15` | 15 | Wie viel | `clue.p.messtischblatt` | Köder P-6 |
| `n.versatz_500` | 500 | Wie viel | `clue.p.kartenvergleich` (Laubs Satz) | Köder P-6 |
| `n.hunde` | Hunde | Wer | `clue.p.punktwolke` | LESART P-7 |
| `n.wild` | Wild | Wer | `clue.p.punktwolke` | LESART P-7 |
| `n.messfehler` | einen Messfehler | Wer | `clue.p.punktwolke` | LESART P-7 |

---

## 7. Fallseite „Vermessung“

6 FAKT + 1 LESART. Zwei Bestätigungen zu je drei Einträgen.

| id | Typ | Satz | richtig (auch richtig) | Köder | Beleg / Codex |
| --- | --- | --- | --- | --- | --- |
| `entry.p.1` | FAKT | „Die eingeebnete Fläche zwischen den drei Mauerzügen ist der **___** des Schlosses.“ | Ehrenhof | Exerzierplatz, Reitbahn | LIDAR KB-01, Katalog TF-01 · `cx.01`, `cx.34` |
| `entry.p.2` | FAKT | „Die über fünf Meter hohe Stufe südlich des Schlosses ist die Stützmauer der **___**.“ | Orangerie | Galerie, Marstall | LIDAR KB-30 · `cx.40` |
| `entry.p.3` | FAKT | „Der tief eingeschnittene Weg westlich des Schlosses ist ein **___**.“ | Hohlweg | Wassergraben, Ausbruchgraben | LIDAR KB-10 · `rm.04` |
| `entry.p.4` | FAKT | „Die runde Grube mit Ringwall östlich des Schlosses war ein **___**.“ | Eiskeller | Bombentrichter, Meilerplatz | LIDAR KB-50 · `rm.02` |
| `entry.p.5` | FAKT | „Auf der bayerischen Karte von **___** heißt der Ort ‚Ruine Carlsberg‘.“ | 1840 (1836–41) | 1789, 1935 | `cx.33` |
| `entry.p.6` | FAKT | „Auf der heutigen Fassung dieser Karte liegt das Schloss rund **___** Meter zu weit im Osten.“ | 50 | 15, 500 | LIDAR-Auswertung §1 Nr. 8 · `cx.33` |
| `entry.p.7` | LESART | „Die Spuren in der Punktwolke stammen von **___**.“ | – (Hunden / Wild / einem Messfehler) | – | `flag.p_spuren` = hunde / wild / messfehler |

**Freischaltungen:** 1. Satz → Zeitwechsel (Q) am Ehrenhof. 2. Satz → Kapitel 1 (Anker Ehrenhof 1789 dauerhaft).

---

## 8. Hinweisleiter (Laub)

1. „Ein Geometer schaut zuerst, und erst dann liest er, was andere hingeschrieben haben. Gehen Sie zu den Stellen. Danach an die Pinnwand.“
2. „Der Lageplan kennt die Namen, das Gelände kennt die Formen. Legen Sie beides übereinander. Die Taste M, falls Ihnen das Wort ‚Überlagerung‘ zu modern ist. Und lesen Sie das Handbuch. Ich habe es auch gelesen, heimlich, nachts.“
3. „Die Grube mit dem Ringwall liegt dort, wo der Plan ‚Eiskeller‘ schreibt. Bomben fallen selten so ordentlich. Zu meiner Karte: Messen Sie vom Hof auf dem Papier bis zum Hof im Boden. Und dann entschuldigen Sie sich bei mir.“

---

## 9. Bedrohung

Keine. Das Unbehagen kommt nur aus drei Signalen: die Pfotenspur in der Punktwolke, das Heulen im Jahr 1789 und das ferne Horn am Ende. Für Designer: Das Heulen kommt aus Richtung Zwinger (1216/−1571), das Horn aus Richtung Nordterrasse. Die Spuren zeigen auf den Ort, an dem das Spiel endet.


## Action-RPG-Umbau (Quests statt Fallakte)

Der Prolog läuft jetzt als Questkette (`content/quests/00-prolog.quests.json`, Katalog in `docs/ACTION-RPG.md` §11.0). Es gibt keine Lückentexte und keine Bestätigung im Chronik-Brett mehr. Was man findet, steht im Feldbuch (J). Die Geschichte kommt bei der Abgabe als Zeile mit Quelle und als Codex-Karte.

- **Die Feldstation** (Marlene): Lageplan, Handbuch, Schublade, dann den **Messstab** aufheben. Kartograf 1 ist jetzt die Belohnung dieser Quest.
- **Was der Wald verbirgt** (Marlene): Damm, Mauerrest und Orangerie-Stufe mit Relief.
- **Wasser, das sich erinnert** (Laub, `q.p.quelle`): den Hang hinunter zur Karlsbergquelle, am Trog das Wasser berühren, der erste Wechsel nach 1789, Q halten. Bei der Abgabe: was über die Quelle belegt ist (`cx.41`) und was erfunden ist (`cx.42`).
- **Die Bussole spricht** (Laub): Ehrenhof, Kartenvergleich, Hohlweg, Eiskeller. Aus der Grube steigen bei Dämmerung **vier Nebelinge** auf. Das ist das Kampf-Tutorial (Hieb, Ausweichen, Wuchthieb). Die Nebelinge lösen sich auf, es fließt kein Blut.
- **Spuren in der Punktwolke** (Marlene): Punktwolke, Q am Ehrenhof (der eigene Wechsel), das Echo des Dieners, **ein Streuner** (Bannlicht-Tutorial), Q halten. Am Ende fragt die Haltung „Was hat die Spuren gemacht?“ (Hunde / Wild / Messfehler / offen). Die Antwort steht in `flag.p_spuren`.
- Nebenquests:
  - **Kohlplatten**: drei Meilerplatten finden.
  - **Nicht anfassen**: den Bombentrichter melden, nie berühren.
  - **Lichter am Weiher**: drei Irrlichter.
- Die Meute bleibt eine Bedrohung und wird nie zum Gegner. Wer gestellt wird, verliert nichts: Die Quest behält ihre Zählung, und Laub sagt „Verloren haben Sie nichts.“
