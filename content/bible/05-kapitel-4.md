# Kapitel 4 „Der Steinbruch“

> The chapter outline retains the original case-page and surveyor-era staging. Mentions of the
> Feldstation, old opening and confirmed sentences are historical. For the playable progression,
> use the [chapter files](../story/README.md) and the [quest catalogue](../../docs/ACTION-RPG.md#11-quest-catalogue).

> **Action-RPG-Umbau (2026-11, docs/ACTION-RPG.md §11.4).** Hauptaufträge: `q.k4.zettel` (Marlenes Zettel, Q am Taleingang), `q.k4.karren` (Karren-Echo, drei **Steinfresser** an den Wachhäusern, Westblick, rückwärts nach 1789), `q.k4.baumagazin` (Soll: Pachtbrief, Peters Karren, fünf Steinfresser am Lager), `q.k4.steinplatz` (Anschlag am Pfeiler, **Der Steinbrecher** im Ehrenhof, *danach* der Steinfraß W7, der Ausbruchgraben und seine Seite: **Messstab V, Laubs Lot**), `q.k4.standpunkt` (Brunnen 1840, die Meute treibt, Laubs Frage `flag.k4_zerstoerer`), `q.k4.stellen` (W8: hinlegen, Laterne, **kein Kampf**, `combat.disabled`; Jost, seine Frage `flag.k4_meute`, das Horn). Nebenaufträge: `q.k4.zeichen` (Peter: Matthes’ vier Steine, der vierte heute nur von der Straße vor dem Karlsberger Hof – Privatgrund, nie betreten; `flag.k4_steine`, Talisman „Matthes’ Zeichen“), `q.k4.graeben` (Gruslinge in drei Gräben, Relief 3 heute), `q.k4.pacht` (Pachtzettel aus Steinfresser-Löchern am Hang). „Noch nicht“ wartet nicht mehr auf Bestätigungen, sondern auf Laubs Frage; „Lücken“ füllt offene Haltungen still mit „offen“.

| | |
| --- | --- |
| Ära | `1796` (Herbst, eine zerfallende Erinnerung) → Echo `1840-11` → `heute` (November, Nebel, Nacht) |
| Dauer | 25–30 min, davon ≈ 5 min Finale |
| Anker | A: Wachhäuser am Taleingang 1796 (497/−900). B: Ehrenhof 1796 (1216/−1114), frei nach dem Baumagazin |
| Ölvorrat | 1796: 6 min. Stattdessen droht der **Steinfraß** (Abschnitt 9) |
| Ziel | Dem markierten Stein folgen; Laubs Geschichte hören; verstehen, was die Meute ist; am Zwinger die Jagd beenden |
| Ende | Nach der 2. Bestätigung (alle 6 FAKT) öffnet sich das Finale am Zwinger (Wow W8). Danach die Wahl des Endes (`06-enden.md`) |

**Ton.** Grau, leise, fast zärtlich. Keine Feinde mehr, nur Vergessen. Die Komik ist bitter und kommt fast ganz von Soll und Laub: Das Schloss wird stückweise verkauft, und der Kanzlist führt jetzt Buch über die Steine. Am Ende ist es still.

**Was belegt ist.** Schulden von über 9 Millionen Gulden beim Tod des Herzogs am 1. April 1795 (WP-K2A; Sterbeort STRITTIG). 1796 pachten 14 Homburger Bürger das Recht, Holz und Steine zu verkaufen (HIB, über Schwester-Recherche; nur eine Quelle, Hobbyseite). Unter Napoleon geht die Ruine an die Witwe zurück, unter der Bedingung, sie abzureißen (RLS). Die Ruine als „preisgünstige Baustoffhandlung“ (RLS). Das Baumagazin als einziges erhaltenes Gebäude (WP-SK, SKD). Die Hohenburg als Steinbruch für den Karlsberg, Holzwerk und ein ganzer Stall aus Jägersburg (BW, EN-HB, WP-JB, SKD). Ausbruchgräben im LiDAR (LIDAR). **Erfunden** sind Laubs Tod, der Steinfraß, Jost als Pikeur, Peter als Fuhrmann und der Weg des markierten Steins.

---

## 1. Ablauf

**4.0 – Feldstation: das Geständnis, Teil 1.** Nacht. Marlene ist nach Hause gegangen und hat einen Zettel dagelassen (`marlene.k4.zettel`). Laub erzählt, ohne dass man fragt (`laub.k4.gestaendnis_1`): Wie er im November 1840 in einem ausgebrochenen Mauergraben eine Seite fand und den Rest vermessen wollte.

**4.1 – Der Taleingang.** Wechsel nach 1796. Die beiden Wachhäuser am Taleingang stehen noch, ohne Wache. Auf der Straße rollen Karren nach Westen, beladen mit behauenen Steinen. Echo `echo.k4.karren`.

**4.2 – Der Blick nach Westen.** Am westlichen Rand des Spielbereichs (≈ 200/−905) steht man auf einer Kuppe. Im Südwesten, etwa zwei Kilometer weit, liegt ein Berg mit Mauerresten über einer kleinen Stadt: die Hohenburg über Homburg. Laub (`clue.k4.hohenburg`): Von dort kamen die Steine für den Karlsberg. Halte E: Die Karren auf der Straße fahren für zehn Sekunden **rückwärts**, mit den Steinen bergauf, zurück in die Jahre um 1780, dann wieder vorwärts (`echo.k4.rueckwaerts`). Die Hohenburg ist außerhalb des Spielbereichs und nur als Silhouette zu sehen.

**4.3 – Das Baumagazin.** Das einzige Gebäude, das ganz steht (FAKT). Im Hof Steinhaufen, Holzstapel, eine Waage. **Soll** sitzt an einem Tisch im Tor und führt Buch, jetzt für die Pächter (`soll.k4.*`). **Peter**, Hannes Sohn, fünfzehn, lädt Steine auf seinen Karren (`peter.k4.*`). Auf einem Quader auf Peters Karren: das Zeichen von Matthes, offener Winkel mit drei Punkten (`clue.k4.stein_karren`, Stein 2/4). Danach ist Anker B frei.

**4.4 – Der Ehrenhof (Wow W7).** Wechsel oder Weg hinauf. Eine dachlose Ruine, Fensterhöhlen, Brandspuren. Im Ehrenhof stehen Karren, Männer schlagen mit Brecheisen Steine aus den Mauern. Während du suchst, beginnt der **Steinfraß**: Steine lösen sich aus den Mauern, fallen aber nicht, sie steigen als graue Körner auf wie Asche, die zurück in den Himmel fällt. Dahinter erscheint das LiDAR-Relief von 2025. Die Karte im HUD bröselt an den Rändern. Jemand ruft deinen Namen von weit weg: Marlene (`marlene.k4.ruf`). An einem Pfeiler am Hofeingang ist ein Zettel angeschlagen (`clue.k4.anschlag`).

**4.5 – Die Gräben.** Nördlich des Corps de logis, zum Küchenhof hin: Männer graben die Grundmauern aus und lassen nur einen Graben zurück, in dem noch Mörtelbrocken liegen (`clue.k4.graben`). Vergleich mit dem Relief von heute (Relief-Blick 3): Genau diese Gräben sind die „Mauerzüge“ aus dem Prolog. Hier hat Laub 1840 die Seite gefunden.

**4.6 – Der Forsthausbrunnen (Echo 1840).** Nach Südosten zum Brunnen am alten Forsthaus (Standpunkt 17). E halten: `echo.k4.laub_1840`. Laubs letzte Nacht, aus seiner Sicht, in Fiktion: Theodolit, Laterne, das Horn, die Augen. Er bleibt stehen. Er legt sich nicht hin. Er rennt. Das Echo bricht ab, bevor man sieht, was danach kommt. Laub erzählt den Rest (`laub.k4.gestaendnis_2`). **Ab hier verliert man beim Gestelltwerden nichts mehr** (siehe Abschnitt 9).

**4.7 – Die Meute treibt.** Der Steinfraß wird stärker, die Ära 1796 löst sich um dich herum auf und kippt ins Heute (automatisch, nicht per Q). Nacht, Nebel, Wald. Die Meute kommt, aber sie stellt dich nicht: Sie erscheint immer **zwischen dir und dem Grau**, und wo du hingehst, wenn du ihr ausweichst, ist der Hohlweg und dann die Allee nach Norden. Wer genau hinschaut (Spurenleser 2), sieht: Die Fährtenlinien laufen alle zum Zwinger.

**4.8 – Feldstation (optional).** Die Fallseite. Wer die 2. Bestätigung schon hat, kann direkt zum Zwinger gehen. Ohne sie zeigt die Bussole nur Nebel, und Laub sagt: „Noch nicht. Wir wissen noch nicht genug, um uns hinzulegen.“

**4.9 – Der Zwinger: Finale (Wow W8).** Heute, Nacht, Nebel. Vom Zwinger ist nur ein Rechteck im Relief und ein Stück Mauer übrig. Die Meute steht im Kreis um dich. Das Horn: drei lange Töne (Sammeln). Laub (`laub.k4.finale_1`): „Jetzt. Hinlegen.“ Der Spieler muss **X** (hinlegen) **und** **L** (Laterne an) drücken. Bis dahin passiert nichts, kein Zeitdruck. Dann: Ein Hund nach dem anderen legt sich, und ihre Augen gehen aus wie Lampen in einem Haus. Hufschlag, dann Stille. Der Pikeur steigt ab und nimmt den Hut ab: ein alter Mann mit dem Gesicht des Jungen aus Kapitel 1. **Jost** (`jost.k4.*`). Er hält dir das Horn hin, das Mundstück zuerst. Mit dem Horn ist die Chronik vollständig. Danach: die Wahl des Endes.

---

## 2. Orte und Trigger

| id | Ort | Bezug | x | z | r | Ära | Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loc.k4.taleingang` | Wachhäuser am Taleingang | KB-B63, KB-B64 | 497 | −900 | 25 | 1796 | Anker A; `echo.k4.karren` |
| `loc.k4.westblick` | Kuppe am Westrand, Blick zur Hohenburg | Rand des Spielbereichs | 200 | −905 | 20 | 1796 | `clue.k4.hohenburg`, `echo.k4.rueckwaerts` |
| `loc.k4.baumagazin` | Baumagazin (heute Karlsberger Hof, privat) | KB-B29 | 511 | −827 | 25 | 1796 | Soll, Peter; `clue.k4.pacht`, `clue.k4.stein_karren`; schaltet Anker B frei |
| `loc.k4.ehrenhof` | Ehrenhof als Steinplatz | TF-01 | 1216 | −1114 | 35 | 1796 | Anker B; W7; `clue.k4.anschlag` (Pfeiler 1195/−1112, r 3) |
| `loc.k4.graeben` | Ausbruchgräben am Küchenhof | LiDAR KB-06 | 1240 | −1193 | 20 | 1796 / heute | `clue.k4.graben` |
| `loc.k4.brunnen` | Brunnen am alten Forsthaus, „Standpunkt 17“ | LiDAR KB-51, TF-41 | 1386 | −1477 | 12 | 1796 → 1840-11 | `echo.k4.laub_1840` |
| `loc.k4.hohlweg` | Hohlweg | LiDAR KB-10, TF-10 | 1172 | −1238 | 20 | heute | Treiben der Meute |
| `loc.k4.allee` | Allee nach Norden | LiDAR KB-11, TF-10 | 1181 | −1614 | 15 | heute | Treiben der Meute |
| `loc.k4.zwinger` | Zwinger, Finale | KB-B23, KB-B35 | 1216 | −1571 | 20 | heute | W8; nur mit 2. Bestätigung |

**Hinweise für Engineers:**
- **Privatgrund:** Das Baumagazin ist heute der Karlsberger Hof. In 1796 ist es frei begehbar (Erinnerung). Im Heute ist der Trigger gesperrt, und es gibt nur den Blick von der Straße.
- **Hohenburg:** liegt außerhalb des Spielbereichs (lokal etwa x −1320 / z 585, Peilung ≈ 226°, ≈ 2,1 km von der Kuppe). Ob man sie von dort wirklich sieht, ist **nicht geprüft**. Im Spiel ist sie eine stilisierte Silhouette im Echo, nicht Gelände.
- **Zwinger heute:** Der Spieler liegt im Wald auf einem Bodendenkmal. Das Finale darf keine Grab- oder Suchhandlung zeigen („Schauen, nicht graben“).

---

## 3. Hinweise (Clues)

**`clue.k4.marlene`** – Feldstation, Zettel.
*Sieht:* „Bin heim. Hab dir Suppe hingestellt. Mein Schwager sagt, in Homburg stecken überall Steine vom Karlsberg drin, in halb der Altstadt. Er sagt auch, in seinem Keller. Er sagt viel. Gute Nacht. M.“ [FAKT im Kern: Steine der Ruine in Homburger Häusern, RLS]
*Gibt:* `n.r_neuanfang` (über den Nachsatz `marlene.k4.zettel_2`, siehe Stimmen).

**`clue.k4.karren`** – Taleingang, Echo `echo.k4.karren`.
*Gibt:* `n.homburg` (falls noch nicht), `n.r_steintraeger`.

**`clue.k4.hohenburg`** – Westblick, Laub.
*Hört (Laub):* „Sehen Sie den Berg da im Südwesten, über der Stadt? Die Hohenburg. Die Festung hat man 1714 geschleift, und der Herzog hat ihre Trümmer als Steinbruch benutzt. Die Steine sind zweimal umgezogen: von der Burg aufs Schloss, vom Schloss in die Stadt. Steine haben kein Zuhause. Nur eine Adresse auf Zeit.“ [P nach EN-HB, BW]
*Gibt:* `n.hohenburg`.

**`clue.k4.jaegersburg`** – Westblick oder Baumagazin, Laub (nach `clue.k4.hohenburg`).
*Hört (Laub):* „Und das Holz kam aus Jägersburg, dem alten Jagdschloss. Täfelungen, Möbel, angeblich ein ganzer Stall. Der Herzog hat sich auch bei sich selbst bedient.“ [P nach SKD, WP-JB]
*Gibt:* `n.jaegersburg`.

**`clue.k4.merburg`** – Westblick, Laub (wenn man nach Süden schaut).
*Hört (Laub):* „Im Süden, da hinten, die Merburg. Auch eine Ruine, aber eine ehrliche. Die ist von allein alt geworden.“
*Gibt:* `n.merburg`.

**`clue.k4.pacht`** – Baumagazin, Soll (siehe `soll.k4.*`) und ein Blatt auf seinem Tisch.
*Sieht:* „Pacht über Holz und Steine der Brandstätte Carlsberg. 1796.“ Darunter vierzehn Unterschriften und Hauszeichen, keine davon lesbar. (Wortlaut FIKTION; Inhalt nach HIB.)
*Gibt:* `n.vierzehn`.

**`clue.k4.baumagazin`** – Baumagazin, Laub beim Betreten des Hofs.
*Hört (Laub):* „Das Baumagazin. Das Lager für Baumaterial. Das einzige Haus, das stehen bleibt. Alles andere wird selbst zu Baumaterial. Man hat später gesagt, das Schloss sei eine Baustoffhandlung geworden. Die Verwaltung nennt so etwas Kreislauf.“ [P nach RLS, WP-SK]
*Gibt:* `n.baumagazin`.

**`clue.k4.stein_karren`** – Baumagazin, Quader auf Peters Karren.
*Sieht:* Das Zeichen von Matthes: offener Winkel, drei Punkte.
*Hört (Peter):* siehe `peter.k4.03`.
*Gibt:* Sammlung „Wandernde Steine“, Stein 2/4. `n.r_lohn_steine`.

**`clue.k4.anschlag`** – Ehrenhof, Pfeiler.
*Sieht:* Ein angeschlagenes Blatt, vom Regen halb gelöst: „Nachdem Seine Hochfürstliche Durchlaucht Herzog Carl August am 1. April 1795 verstorben, werden alle, so Forderungen an die herzogliche Cammer haben, aufgefordert …“ Darunter in einer anderen Hand mit Kohle: „über 9 Millionen. Viel Glück.“ (Wortlaut FIKTION; Datum und Summe FAKT nach WP-K2A.)
*Gibt:* `n.9_millionen`.

**`clue.k4.graben`** – Ausbruchgräben.
*Sieht (1796):* Ein langer Graben, wo eben noch eine Mauer stand. Unten Mörtelbrocken und Splitter, die keiner haben will.
*Sieht (heute, Relief-Blick 3):* Eine schmale Rinne mit zwei kleinen Wällen daneben, genau dort, wo 1796 der Graben war.
*Hört (Laub):* „Ein Ausbruchgraben. Wenn man eine Mauer bis auf den letzten Stein herausholt, bleibt ein Graben in ihrer Form. Die ‚Mauerzüge‘, die Sie im Scan sehen, sind keine Mauern. Es sind die Löcher, in denen Mauern waren. Ich habe hier die Seite gefunden. In so einem Loch.“ (FAKT: Ausbruchgräben, LIDAR-Auswertung KB-06, `rm.05`.)
*Gibt:* bestätigt `n.ausbruchgraben` (aus dem Prolog).

**`clue.k4.napoleon`** – Ehrenhof, Laub nach W7.
*Hört (Laub):* „Ein paar Jahre später, unter Napoleon, bekommt die Witwe des Herzogs die Ruine zurück. Unter einer Bedingung: abreißen, bis auf den Grund. Wieder aufbauen wollte niemand. Verkauft wurde ohnehin schon. Und aufgeforstet hat man erst, als nichts mehr zu sehen war.“ [P nach RLS; Aufforstung nach Prolog]
*Gibt:* `n.abreissen`, `n.wiederaufbauen`, `n.verkaufen`, `n.aufforsten`.

**`clue.k4.zwingerhaus`** – auf dem Weg zum Zwinger (heute), Laub.
*Hört (Laub):* „Vom Zwingerhaus steht heute ein Rest im Relief, ein Rechteck, eine Kante. Kein Haus. Der Eiskeller ist ein Loch mit einem Ring. Stehen geblieben ist nur das Lager.“
*Gibt:* `n.zwingerhaus`.

**`clue.k4.laub_1840`** – Brunnen, Echo und Geständnis.
*Gibt:* `n.r_herr_suchen`, `n.r_nie_abgeblasen`.

**`clue.k4.soll`** – Baumagazin.
*Gibt:* `n.r_raub`, `n.r_chronik_bewachen`, `n.r_franzosen`.

**`clue.k4.peter`** – Baumagazin.
*Gibt:* `n.r_herzog_selbst`, `n.r_lohn_steine`.

**`clue.k4.jost`** – Finale.
*Gibt:* `n.r_heimtreiben`, `n.r_vergessen`.

**`clue.k4.nur_steine`** – Feldstation nach dem Finale, Laub.
*Gibt:* `n.r_nur_steine`.

---

## 4. Echos

**`echo.k4.karren`** – Taleingang, automatisch. Erinnerung (Fiktion).
- FUHRMANN 1: „Hü! Für das Fenstergewände da kriegt der Bäcker in Homburg eine neue Haustür.“
- FUHRMANN 2: „Und der Schmied einen Kamin. Und ich krieg zwei Kreuzer.“
- FUHRMANN 1: „Mehr als der Herzog je gezahlt hat.“
- FUHRMANN 2: „Wir tragen das Schloss halt nach Haus. Stein für Stein. Einer muss es ja tun.“ → `n.r_steintraeger`

**`echo.k4.rueckwaerts`** – Westblick, E halten. Erinnerung (Fiktion). Bild ohne Worte: Die Karren auf der Straße rollen rückwärts, die Steine fahren bergauf, die Jahre laufen rückwärts von 1796 bis etwa 1780. Am Ende ganz kurz der Karlsberg mit Gerüsten. Auf dem vordersten Karren liegt ein Quader. Je weiter er zur Hohenburg zurückfährt, desto blasser wird das Zeichen darauf, bis es ganz fehlt: Da war er noch keiner von uns (Sammlung „Wandernde Steine“, Stein 3/4). Dann wieder vorwärts. Die Bussole tickt wie eine Uhr.

**`echo.k4.laub_1840`** – Brunnen am alten Forsthaus, E halten. Ära `1840-11`. Erinnerung (Fiktion, ganz erfunden). Nacht, Wald, Novemberregen. Ein Mann im Mantel mit einem Theodolit auf dem Stativ und einer Laterne auf dem Brunnenrand.
- LAUB 1840 (schreibt, murmelt): „Standpunkt siebzehn. Richtung Ruine, hundertneunundneunzig Grad und …“
- (Ein Horn, ein langer Ton. Laub 1840 hebt den Kopf.)
- LAUB 1840: „Jäger? Um die Zeit? Es ist keine Jagd angesagt. Ich hätte das wissen müssen, ich habe die Liste.“
- (Augen gehen im Nebel an, zwölf Stück, in Kniehöhe.)
- EINE STIMME AUS DEM NEBEL (jung und alt zugleich): „Leg dich hin.“
- LAUB 1840: „Ich bin königlich bayerischer Geometer. Ich lege mich nicht in den Dreck.“
- STIMME: „Leg dich hin. Bitte.“
- (Laub 1840 nimmt die Laterne und rennt. Die Augen folgen. Das Bild bricht ab. Nur der Theodolit bleibt stehen.)

---

## 5. Gesprochene Zeilen

**Quirin Laub (Kapitel 4)**

- `laub.k4.gestaendnis_1` (Feldstation, 4.0): „Ich habe Ihnen etwas verschwiegen. Ich bin nicht verschollen, weil ich mich verlaufen habe. Ich war am alten Forsthaus, Standpunkt siebzehn. Am Tag vorher hatte ich in einem Graben eine Seite gefunden, alt, angesengt, mit Namen drauf. ‚Was der Hof schuldig blieb.‘ Ich dachte, wenn ich vermesse, wo die Seiten liegen, finde ich den Rest. Ein Geometer findet alles, wenn man ihm genug Standpunkte gibt.“
- `laub.k4.taleingang`: „1796. Das Schloss ist drei Jahre tot, und die Leute holen sich ihr Geld zurück. In Steinen.“
- `laub.k4.westblick`: siehe `clue.k4.hohenburg`.
- `laub.k4.baumagazin`: siehe `clue.k4.baumagazin`.
- `laub.k4.steinfrass` (beim ersten Steinfraß, W7): „Das ist nicht das Feuer. Das ist schlimmer. Das ist, wenn keiner mehr weiß, wo etwas stand. Dann frisst es der Berg.“
- `laub.k4.gestaendnis_2` (nach dem Echo am Brunnen): „Sie haben es gesehen. Ich habe mich nicht hingelegt. Ich dachte, sie reißen mich. Sie wollten mich stellen, und ich bin gerannt, in den Nebel hinein, zu weit, bis dahin, wo nichts mehr ist. Seitdem bin ich in diesem Messing. Mein Tagegeld für den letzten Tag ist übrigens auch noch offen.“
- `laub.k4.erkenntnis` (in 4.7, wenn die Meute zum ersten Mal zwischen dir und dem Grau steht): „Sehen Sie, wo sie stehen? Nicht vor Ihnen. Zwischen Ihnen und dem Grau. Die jagen Sie nicht. Die treiben Sie.“
- `laub.k4.herr`: „Vielleicht suchen sie nur ihren Herrn. Der ist nach Mannheim gefahren und hat keinem gesagt, dass die Jagd vorbei ist.“ → gibt `n.r_herr_suchen`
- `laub.k4.abgeblasen`: „Eine Jagd, die keiner abbläst, hört nicht auf. Das steht in keinem Reglement. Aber es steht in jeder Sage.“ → gibt `n.r_nie_abgeblasen`
- `laub.k4.noch_nicht` (4.8, ohne 2. Bestätigung): „Noch nicht. Wir wissen noch nicht genug, um uns hinzulegen.“
- `laub.k4.finale_1` (W8): „Jetzt. Hinlegen. Und machen Sie das Licht an. Die sollen sehen, dass wir nicht weglaufen.“
- `laub.k4.finale_2` (nachdem sich die Hunde gelegt haben, sehr leise): „Dann leg ich mich auch hin. Hundertfünfundachtzig Jahre zu spät. Oder sechsundachtzig, je nachdem, welches Jahr Sie haben. Pünktlich ist auch nur ein Wort.“
- `laub.k4.nur_steine` (Feldstation, nach dem Finale, vor der Wahl): „Die Steine in Homburg? Das sind nur Steine. Was daran hängt, hängen wir dran.“ → gibt `n.r_nur_steine`

**Gottlob Soll (Kapitel 4, alt geworden, Ärmelschoner abgewetzt)**

- `soll.k4.01`: „Ah. Sie. Sie sind auch nicht jünger geworden. Doch, Sie schon.“
- `soll.k4.02`: „Ich führe jetzt Buch für die Pächter. Vierzehn Bürger aus Homburg haben das Recht gepachtet, Holz und Steine zu verkaufen. Vierzehn. Ich habe nachgezählt. Ein Fenstergewände zwölf Kreuzer, ein Treppenstein zwanzig, ein Wappen gar nichts, das will keiner.“ [Zahl FAKT nach HIB; Preise FIKTION] → gibt `n.vierzehn`
- `soll.k4.03`: „Zum ersten Mal in meinem Leben wird am Karlsberg alles bezahlt. Bar. Sofort. Es ist entsetzlich.“
- `soll.k4.04`: „Raub ist das. Erst haben sie dem Land das Geld genommen und Steine draus gemacht, jetzt nimmt das Land die Steine zurück. Ein Raub am Raub. Ob das wieder gerade wird, weiß ich nicht. Buchhalterisch ist es eine Null.“ → gibt `n.r_raub`
- `soll.k4.05`: „Die Franzosen haben ihn angezündet. Aber abgerissen haben ihn wir. Das schreib ich auch auf.“ → gibt `n.r_franzosen`
- `soll.k4.06` (nach dem Buch gefragt): „Mein Buch? Die Seiten sind verweht. Manchmal denke ich, die Hunde passen drauf auf. Die laufen immer da, wo eine liegt.“ → gibt `n.r_chronik_bewachen`
- `soll.k4.07` (Abschied): „Wenn Sie die Seiten finden: Tragen Sie die Summe nicht zusammen. Die Summe ist nicht wichtig. Die Namen sind wichtig.“

**Peter (FIKTION; Hannes Sohn, 15, Fuhrmann, wortkarg)**

- `peter.k4.01`: „Platz da. Der Karren ist voll.“
- `peter.k4.02` (nach Hanne gefragt): „Mutter? Die wohnt jetzt in Homburg. Sie sagt, ich soll was Gescheites fahren. Keine Steine. Ich fahr Steine.“
- `peter.k4.03` (beim Quader mit dem Zeichen): „Das ist von meinem Vater. Den hab ich extra rausgesucht. Der kommt nach Homburg, über unsere Tür. Er hat ihn gehauen. Bezahlt hat ihn keiner. Jetzt gehört er uns. Das ist der Lohn.“ → gibt `n.r_lohn_steine`
- `peter.k4.04`: „Wer das Schloss kaputt gemacht hat? Der Herzog. Wer so baut, muss sich nicht wundern.“ → gibt `n.r_herzog_selbst`
- `peter.k4.05` (Abschied): „Hü.“

**Jost (Kapitel 4, alt, als Pikeur)**

- `jost.k4.01` (steigt ab, nimmt den Hut ab): „Du riechst immer noch nach Regen von morgen. Jetzt weiß ich, warum. Du kommst von morgen.“
- `jost.k4.02`: „Die Meute reißt nicht. Sie stellt. Das hab ich dir gesagt, da war ich dreizehn.“
- `jost.k4.03`: „Ich hab sie rausgelassen, in der Nacht vom Feuer. Dann bin ich ihnen nach. Ich hab sie nie wieder eingefangen. Wer nicht abgeblasen wird, läuft weiter. Und ich bin mitgelaufen.“
- `jost.k4.04`: „Was keiner mehr weiß, frisst der Berg. Wer zu lang drin ist in dem, was keiner mehr weiß, den frisst er mit. Wir haben jeden heimgetrieben, bevor es so weit war. Jeden.“ → gibt `n.r_heimtreiben`, `n.r_vergessen`
- `jost.k4.05` (zur Bussole): „Nur den Geometer nicht. Der hat sich nicht hingelegt.“
- `jost.k4.06`: „Jetzt hat er's. Gut.“ (Er krault den Hund, der ihm am nächsten liegt.) „Diane. Sultan. Fanfare. Rauhreif. Bijou. Jetzt hat sie einer beim Namen genannt, der nicht ich bin.“
- `jost.k4.07` (hält das Horn hin, Mundstück zuerst): „Da. Abblasen musst du. Ich kann's nicht. Ich hab's nie gelernt, ich kann nur anblasen.“
- `jost.k4.08` (wenn der Spieler das Horn nimmt): „Die Chronik ist voll, glaub ich. Was du damit machst, ist deine Sache. Ich hab nur aufgepasst.“

**Marlene (Kapitel 4)**

- `marlene.k4.zettel`: siehe `clue.k4.marlene`.
- `marlene.k4.zettel_2` (Rückseite des Zettels): „PS: Wenn ein altes Schloss in Homburg in hundert Häusern steckt, ist es dann weg oder überall? Frag ich mich nur so.“ → gibt `n.r_neuanfang`
- `marlene.k4.ruf` (W7, von weit weg): „{Name}? {Name}! Die Suppe wird kalt!“
- `marlene.k4.foto` (Feldstation, nach dem Finale, ein Foto auf dem Handy): „Guck. Mein Schwager hat mir das geschickt. Der Stein über seiner Kellertür in der Altstadt. Da ist so ein komisches Zeichen drauf. Ein Winkel mit drei Punkten. Sagt dir das was?“ (FIKTION: Kein echtes Haus ist gemeint. Sammlung „Wandernde Steine“, Stein 4/4.)

---

## 6. Substantive

| id | Anzeige | Kategorie | gefunden in | verwendet als |
| --- | --- | --- | --- | --- |
| `n.vierzehn` | 14 | Wie viel | `clue.k4.pacht`, `soll.k4.02` | richtig 4-1 |
| `n.neunzehn` | 19 | Wie viel | Kap. 1 | Köder 4-1 |
| `n.tausend` | tausend | Wie viel | Kap. 1 | Köder 4-1 |
| `n.zwoelf` | zwölf | Wie viel | Kap. 1 | Köder 4-1 |
| `n.9_millionen` | 9 Millionen | Wie viel | `clue.k4.anschlag` | richtig 4-2 |
| `n.zahl_14mio` | 14 Millionen | Wie viel | Kap. 1 | Köder 4-2 |
| `n.zahl_800000` | 800 000 | Wie viel | Kap. 1 | Köder 4-2 |
| `n.zahl_35000` | 35 000 | Wie viel | Kap. 1 | Köder 4-2 |
| `n.abreissen` | abzureißen | Wie | `clue.k4.napoleon` | richtig 4-3 |
| `n.wiederaufbauen` | wieder aufzubauen | Wie | `clue.k4.napoleon` | Köder 4-3 |
| `n.verkaufen` | zu verkaufen | Wie | `clue.k4.napoleon` | Köder 4-3 |
| `n.aufforsten` | aufzuforsten | Wie | `clue.k4.napoleon` | Köder 4-3 |
| `n.hohenburg` | Hohenburg | Wo | `clue.k4.hohenburg` | richtig 4-4 |
| `n.jaegersburg` | Jägersburg | Wo | `clue.k4.jaegersburg` | Köder 4-4 |
| `n.merburg` | Merburg | Wo | `clue.k4.merburg` | Köder 4-4 |
| `n.baumagazin` | Baumagazin | Was | `clue.k4.baumagazin` | richtig 4-5 |
| `n.eiskeller` | Eiskeller | Was | Prolog | Köder 4-5 |
| `n.zwingerhaus` | Zwingerhaus | Was | `clue.k4.zwingerhaus` | Köder 4-5 |
| `n.ausbruchgraben` | Ausbruchgräben | Was | Prolog, `clue.k4.graben` | richtig 4-6 |
| `n.hohlweg` | Hohlwege | Was | Prolog | Köder 4-6 |
| `n.meilerplatz` | Meilerplätze | Was | Prolog | Köder 4-6 |
| `n.wassergraben` | Wassergräben | Was | Prolog | Köder 4-6 |
| `n.r_franzosen` | die Franzosen | Wer | `soll.k4.05` | LESART 4-7 |
| `n.r_herzog_selbst` | der Herzog selbst | Wer | `peter.k4.04` | LESART 4-7 |
| `n.r_steintraeger` | die Steinträger aus Homburg | Wer | `echo.k4.karren` | LESART 4-7 |
| `n.r_vergessen` | das Vergessen | Wer | `jost.k4.04` | LESART 4-7 |
| `n.r_herr_suchen` | sie ihren Herrn sucht | Warum | `laub.k4.herr` | LESART 4-8 |
| `n.r_chronik_bewachen` | sie die Chronik bewacht | Warum | `soll.k4.06` | LESART 4-8 |
| `n.r_heimtreiben` | sie uns heimtreibt | Warum | `jost.k4.04` | LESART 4-8 |
| `n.r_nie_abgeblasen` | sie nie abgeblasen wurde | Warum | `laub.k4.abgeblasen` | LESART 4-8 |
| `n.r_raub` | Raub | Was | `soll.k4.04` | LESART 4-9 |
| `n.r_lohn_steine` | Lohn | Was | `peter.k4.03` | LESART 4-9 |
| `n.r_neuanfang` | ein Neuanfang | Was | `marlene.k4.zettel_2` | LESART 4-9 |
| `n.r_nur_steine` | nur Steine | Was | `laub.k4.nur_steine` | LESART 4-9 |

Anzeige-Hinweis: Substantive aus dem Prolog (`n.hohlweg`, `n.meilerplatz`, `n.wassergraben`, `n.ausbruchgraben`) erscheinen hier im Plural. Engineers: Jedes Substantiv braucht ein Feld `display_plural` oder einen eigenen Anzeigetext je Eintrag.

---

## 7. Fallseite „Der Steinbruch“

6 FAKT + 3 LESART. Zwei Bestätigungen zu je drei Einträgen. Die 2. Bestätigung öffnet das Finale.

| id | Typ | Satz | richtig (auch richtig) | Köder | Beleg / Codex |
| --- | --- | --- | --- | --- | --- |
| `entry.k4.1` | FAKT | „1796 pachteten **___** Bürger aus Homburg das Recht, Holz und Steine der Ruine zu verkaufen.“ | 14 (vierzehn) | 19, tausend, zwölf | HIB (eine Quelle, Hobbyseite) · `cx.30` |
| `entry.k4.2` | FAKT | „Als der Herzog am 1. April 1795 starb, hinterließ er über **___** Gulden Schulden.“ | 9 Millionen | 14 Millionen, 800 000, 35 000 | WP-K2A · `cx.29` |
| `entry.k4.3` | FAKT | „Unter Napoleon erhielt die Witwe des Herzogs die Ruine zurück, unter der Bedingung, sie **___**.“ | abzureißen | wieder aufzubauen, zu verkaufen, aufzuforsten | RLS · `cx.30` |
| `entry.k4.4` | FAKT | „Schon für den Bau des Schlosses hatte man Steine von der **___** geholt.“ | Hohenburg | Jägersburg, Merburg | EN-HB; BW · `cx.31` |
| `entry.k4.5` | FAKT | „Das einzige Gebäude des Karlsbergs, das bis heute steht, ist das **___**.“ | Baumagazin | Eiskeller, Zwingerhaus | WP-SK; SKD · `cx.32` |
| `entry.k4.6` | FAKT | „Wo man die Grundmauern herausholte, sieht man im Laserscan heute **___**.“ | Ausbruchgräben | Hohlwege, Meilerplätze, Wassergräben | LIDAR KB-06 · `rm.05`, `cx.34` |
| `entry.k4.7` | LESART | „Den Karlsberg zerstörten am Ende **___**.“ | – | – | `flag.k4_zerstoerer` = franzosen / herzog / steintraeger / vergessen |
| `entry.k4.8` | LESART | „Die Meute jagte, weil **___**.“ | – | – | `flag.k4_meute` = herr / chronik / heimtreiben / nie_abgeblasen |
| `entry.k4.9` | LESART | „Die Karlsberg-Steine in den Homburger Häusern sind **___**.“ | – | – | `flag.k4_steine` = raub / lohn / neuanfang / nur_steine |

**Freischaltungen:** 1. Satz → nichts Neues (Laub: „Weiter.“). 2. Satz → Finale am Zwinger.

**Hinweis:** `entry.k4.8` und `entry.k4.9` können erst nach dem Finale vollständig gefüllt werden (zwei der vier Antworten kommen aus `jost.k4.04` und `laub.k4.nur_steine`). Die Wahl des Endes wartet, bis alle drei LESARTEN gesetzt sind, oder der Spieler wählt „Leer lassen“ (dann `flag = offen`).

---

## 8. Hinweisleiter (Laub)

1. „Zahlen. Die Pächter zählt der Kanzlist am Baumagazin, die Schulden stehen am Pfeiler im Ehrenhof. Verwechseln Sie nicht, was gebaut, was eingenommen und was geschuldet wurde. Das waren drei verschiedene Unglücke.“
2. „Woher kamen die Steine? Schauen Sie vom Westrand aus nach Südwesten. Das Holz kam aus einem anderen Schloss, die Steine von einer Burg. Und was heute noch steht, sehen Sie unten im Tal, wenn Sie den Leuten mit den Karren zusehen.“
3. „Die Mauerzüge im Scan. Gehen Sie zu den Gräben am Küchenhof, einmal 1796 und einmal heute. Was die Männer dort zurücklassen, haben Sie im Prolog schon im Handbuch gesehen.“

---

## 9. Bedrohung (Notizen für Designer)

**Der Steinfraß** (nur in der Ära 1796 und in 4.7):
- Eine graue Zone wächst vom Rand des Sichtfelds und vom Rand der Karte nach innen. In ihr lösen sich Gebäude in aufsteigende Körner auf und das LiDAR-Relief von heute wird sichtbar (W7).
- **Vergessen-Anzeige** statt Ölvorrat: Sie füllt sich langsam, schneller, wenn man still steht. Sie sinkt, wenn man einen Clue untersucht, ein Echo hört oder einen markierten Stein findet. Erinnern hält das Vergessen auf.
- Ist sie voll: Text „Das Vergessen hat dich eingeholt …“, du wachst in der Feldstation auf.
- Die HUD-Karte bröselt an den Rändern synchron mit der Anzeige (rein visuell).

**Die Meute treibt** (ab 4.6):
- 5 Hunde, Pikeur zu Pferd. Sie stehen immer zwischen dem Spieler und der nächsten grauen Zone, Abstand 12–20 m, Augen an.
- Wer auf sie zugeht, wird nicht gestellt. Sie weichen 5 m zurück und schließen die Lücke zum Grau. Wer an ihnen vorbei ins Grau rennt, wird sanft gestellt: Text „Die Meute hat dich heimgebracht …“ (statt „gestellt“). **Ab 4.6 verliert man dabei keine Substantive** (auch nicht im normalen Modus). Das ist Teil der Enthüllung: Laub kommentiert es beim ersten Mal („Sehen Sie? Nichts verloren. Nie gewesen, wenn man's genau nimmt. Nur zurückgebracht.“).
- Die Fährtenlinien (Spurenleser 2) laufen über Hohlweg KB-10 und Allee KB-11 zum Zwinger.

**Das Finale** (W8):
- Kein Zeitdruck, keine Gefahr. Die Hunde stehen im Kreis (Radius 6 m) und warten, bis X und L gedrückt sind. In beliebiger Reihenfolge.
- Barrierefreiheit: Im sanften Modus und mit „Eine Taste für Aktionen“ (Einstellungen) reicht X allein, die Laterne geht automatisch an.
- Wer stattdessen rennt, wird nach 10 m sanft zurück in den Kreis gebracht (Abblende, kein Laden), und Laub sagt: „Nicht noch einmal. Bitte.“
