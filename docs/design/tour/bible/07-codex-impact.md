# Codex: neue, geänderte und entfallende Karten (Entwurf)

> **ENTWURF für das Release nach 0.5.0.** Ändert `content/bible/07-codex.md` und `scripts/content-build/codex.mjs` erst nach Freigabe. **IDs:** `cx.T1`–`cx.T4` sind Arbeits-IDs. Beim Bau bekommen sie die nächsten freien Nummern (cx.43–cx.46 sind durch IDEAS-ROUND11 §2.8 vorgemerkt, cx.47 durch §4; also voraussichtlich ab cx.48). Nur Fakten aus `tour-route-research` und dem bestehenden Codex; keine neuen Quellen erfunden. Was nicht belegt ist, steht als **offen** im Text, nie als FAKT.

## Neue Quellenkürzel

| Kürzel | Quelle | URL |
| --- | --- | --- |
| HOM-HF17 | Kreisstadt Homburg, Historischer Führer Nr. 17 „Karlsberger Hof“ (2005), archiviert | https://web.archive.org/web/20080123101148/http://www.homburg.de/content/pages/1071.htm |
| SPT-KR | Saarpfalz-Touristik: Karlsberg-Runde | https://www.saarpfalz-touristik.de/touren/karlsberg-runde-838271451c |
| OSM-KW | OpenStreetMap: Karlsbergweiher (Relation 17145701) | https://www.openstreetmap.org/relation/17145701 |
| WD-KW | Wikidata Q71702316 (Karlsbergweiher) | https://www.wikidata.org/wiki/Q71702316 |
| OSM-KQ | OpenStreetMap: Karlsbergquelle (Knoten 368031320), Karlsbergbach (Relation 10294956) | https://www.openstreetmap.org/node/368031320 · https://www.openstreetmap.org/relation/10294956 |
| WB-REH | Wochenblatt, 24.07.2026: Rekord bei Saar-Jägern | https://www.wochenblatt-reporter.de/saarland/c-lokales/rekord-bei-saar-jaegern-so-viel-rehwild-wie-nie-erlegt_a834005 |
| DWS-REH | Deutsche Wildtier Stiftung: Reh | https://www.deutschewildtierstiftung.de/wildtiere/reh |
| WP-REH | de.wikipedia: Reh | https://de.wikipedia.org/wiki/Reh |

(SBT, SKD, EN-KC, EN-HB, BW, LIDAR stehen schon im Codex.)

---

## 1. Neue Karten

### cx.T1 – Das Gebäude, das blieb
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Station 1 (`q.p.fuehrung`)
- **Text:** Am Fuß des Karlsbergs steht der Karlsberger Hof, das einzige noch erhaltene Gebäude der Schlossanlage. Er entstand zur Bauzeit des Schlosses als Vorrats- und Wohngebäude, als Lager für Baumaterial mit Wohnungen. Nach 1804 wurde er versteigert und als Hofgut bewirtschaftet; 1830 lief darin eine Zuckerraffinerie, 1850 kaufte ihn der bayerische Staat, ab 1866 war er Forsthaus. Heute ist er Privatbesitz und nur von außen zu sehen.
- **Streitpunkt:** Die Stadt Homburg nennt 1776–85 als Bauzeit; 1776 liegt vor dem Kauf des Louisenhofs (1777, `cx.02`). Darum steht im Text nur „zur Bauzeit des Schlosses“.
- **Quellen:** HOM-HF17; SKD
- **Lizenz:** eigener Text
- **Hinweis:** Keine Eigentümer- oder Markennennung. Der Ortsname „Karlsberger Hof“ ist erlaubt (Owner, 2026-11-20).

### cx.T2 – Der Felsenpfad
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Station 2
- **Text:** Der Felsenpfad führt vom Feldweg am Karlsberger Hof hinauf zum Karlsbergweiher und gehört zum WaldPark Schloss Karlsberg. Er führt an kleinen Felsen aus Buntsandstein vorbei, dem roten Stein der Gegend, der am Schlossberg in Homburg rund 250 Millionen Jahre alt ist. Die Felsköpfe darf man aus Sicherheitsgründen nicht betreten. Ob hier für das Schloss Stein gebrochen wurde, ist **nicht belegt**; belegt ist, dass die Trümmer der Hohenburg dem Herzog als Steinbruch dienten (`cx.31`).
- **Quellen:** SBT; SPT-KR; EN-HB; BW
- **Lizenz:** eigener Text
- **Hinweis:** OSM hat keinen Namen für den Weg; „Felsenpfad“ stammt aus dem Faltblatt (SBT). Die genaue Wegführung ist aus der Schlossberg-Tour erschlossen (`tour-route-research` §2).

### cx.T3 – Der Karlsbergweiher
- **Label:** FAKT (mit offenem Teil) · **Sicherheit:** D (Relikt) / U (Baujahr, Zweck) · **fiction:** nein · **frei durch:** Station 3
- **Text:** Der Karlsbergweiher ist ein Überbleibsel der Schlossanlage, ein Rest der Wasserbecken im Schlosspark. Im Laserscan sind der gerade Damm im Westen und die kleine Insel deutlich zu sehen. **Offen ist**, wann er angelegt wurde und ob er als Zierteich oder als Fischweiher diente; dafür gibt es keine Quelle.
- **Streitpunkt:** Baujahr und Zweck unbekannt (keine Quelle; Schwan 2012 und Weber 1987 wären zu prüfen).
- **Quellen:** SBT; EN-KC; WD-KW; OSM-KW; LIDAR (KB-40, KB-42)
- **Lizenz:** eigener Text
- **Hinweis:** Die Fläche (≈ 0,54 ha) ist aus dem OSM-Umriss gemessen, kein veröffentlichter Wert; nicht in den Kartentext.

### cx.T4 – Rehe im November
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** das gute Foto von Ricke und Kitz (`q.p.reh`)
- **Text:** Rehe sind im Saarland häufig: Im Jagdjahr bis März 2026 wurden gut 12.500 erlegt, Rotwild dagegen nur 170 Tiere. Die Kitze kommen im Mai und Juni zur Welt; ihre Flecken sind nach etwa zwei Monaten verschwunden. Im November sind sie fünf bis sechs Monate alt, tragen schon das graue Winterfell und folgen noch der Ricke. Erst zwischen Mitte März und Mitte Mai lösen sich die Mutterfamilien auf. Zur Zeit des Herzogs war dieser Wald Jagdrevier (→ `cx.05`, `cx.06`).
- **Quellen:** WB-REH; DWS-REH; WP-REH; für den letzten Satz die Quellen von cx.05/cx.06 (WP-K2A, M1910)
- **Lizenz:** eigener Text
- **Hinweis:** Zahlen gelten für das Saarland, nicht für den Karlsberg. Rothirsche nicht zeigen.

### Fotokarten (ohne EP, Album)

Fotokarten sind kurze Kartenrückseiten, die ein gutes Foto freischaltet. Sie verweisen auf eine bestehende Karte und geben **keine** EP (`01-prolog.md` §7).

| Arbeits-ID | Titel | Freigeschaltet durch | Inhalt | Verweist auf |
| --- | --- | --- | --- | --- |
| `ph.hof` | Von außen | Foto des Gebäudes am Parkplatz | „Nur von außen. Privatbesitz.“ + Bild | cx.T1 |
| `ph.sandstein` | Roter Stein | Foto Buntsandstein | ein Satz zum Buntsandstein | cx.T2 |
| `ph.insel` | Die Insel | Foto der Insel | „Im Laserscan sieht man sie auch.“ | cx.T3, rm.08 |
| `ph.tafel` | Was auf der Tafel steht | Foto der Infotafel an der Quelle | Kurzfassung von cx.41 (unser Text, nicht der der echten Tafel) | cx.41 |
| `ph.orangerie` | Die Stufe | Foto der Orangerie-Stützmauer (später) | „81 m, 5,3 m tief.“ | cx.40 |
| `ph.rund` | Neunzehn Häuser | Foto des Bärenzwinger-Runds (später) | | cx.12, cx.13 |
| `ph.eiskeller` | Die Grube | Foto der Eiskeller-Grube (später) | | rm.02 |
| `ph.ehrenhof` | Die Lichtung | Foto der Ehrenhof-Lichtung (später) | | cx.01 |

---

## 2. Geänderte Karten

| Karte | Änderung |
| --- | --- |
| **cx.32 Das Baumagazin** | Text an cx.T1 angleichen oder zusammenlegen (Empfehlung: cx.32 bleibt die K4-Karte über das Baumagazin 1796, verweist auf cx.T1 für die spätere Geschichte). Den Satz „Es war später Brauerei, Forsthaus und Villa eines Brauereidirektors“ **streichen**, bis die Quelle geprüft ist (§4). Neu: „Es steht als einziges Gebäude noch; heute heißt es Karlsberger Hof und ist Privatbesitz (→ cx.T1).“ |
| **cx.34 Der Laserscan von 2025** | „frei durch“: `entry.p.1` → `q.p.marlene` (Marlene am Weiher). Text unverändert. |
| **cx.35 Schauen, nicht graben** | „frei durch“: `q.p.marlene` (Marlenes Satz „Wir schauen, wir graben nicht“). Text unverändert. |
| **cx.38 Was in diesem Spiel erfunden ist** | + „Gerold Imhoff und seine Führungsgruppe, die Doppelgänger von heute, Josts Hunde Diane und Bijou von heute, die Bussole im Trog, das Abschlussfest“; − „die Feldstation“ (falls dort genannt; in `07-codex.md` nicht, wohl aber in der Fiktionsliste der Bibel und in `story.credits.fictionText`). |
| **cx.41 Die Karlsbergquelle** | „frei durch“: Station 4. Ergänzen: „In der Nähe liegt ein Wassertretbecken zum Kneippen (SBT, SPT-KR).“ Ob das OSM-Becken bei ≈ 958/−883 dieses Becken ist, ist nicht belegt; keine Lage nennen. Der Satz „Wann sie gefasst wurde und ob sie das Schloss versorgte, ist nicht belegt“ bleibt. |
| **cx.42 Das Wasser erinnert sich** (FIKTION) | + „Erfunden ist auch die Bussole, die im Trog liegt.“ Der Satz vom eingetrockneten Tropfen bleibt (K1 `k1_0`). |
| **cx.33 Die Karte von 1836–41** | „frei durch“: `q.p.bussole` (optional) statt `entry.p.5/6`. Laubs Kartendruck kommt jetzt aus dem Deckel der Bussole. Text unverändert. |
| **cx.03 Karl II. August** | „frei durch“: Station 1 statt `q.p.punktwolke`. |
| **cx.36 Die Wilde Jagd** | bleibt bei `q.p.punktwolke` (optional) und „erste Begegnung mit der Meute“ (K1 1.10) — wer den optionalen Auftrag nicht macht, bekommt sie dort. |
| **rm.01–rm.08** | Handbuch des Forstamts kommt aus Marlenes App (`clue.p.handbuch` am Weiher statt im Regal). Texte unverändert. |

## 3. Entfallende Karten und Freischalter

- **Keine Karte entfällt.** Es entfallen nur Freischalter: die Fallseiten-Einträge `entry.p.1–p.7` (schon durch den Quest-Umbau ohne Wirkung) und die Station-Clues `clue.p.lageplan`, `clue.p.messtischblatt` (Pinnwand im Bauwagen).
- `clue.p.lageplan` (Lageplan 2006, CC BY-SA) → zieht als Bild auf Gerolds Laminatkarten um (Station 1); er gibt dieselben Substantive. `clue.p.messtischblatt` → Marlenes Tablet (Weiher), optional.
- `lore.heute.marlene` („Marlenes Notiz“, `travel/lore.ts:26`) → „Marlenes Zettel am Stativ“ (Damm).

## 4. Offene Aufgabe: cx.32 nachprüfen (Quellenkonflikt)

- **Konflikt:** cx.32 sagt, das Baumagazin sei „später Brauerei, Forsthaus und Villa eines Brauereidirektors“ gewesen (Quellen: WP-SK, SKD, RLS). Die Chronologie der Stadt Homburg (HOM-HF17) nennt dagegen: 1804 Versteigerung und Hofgut, 1830 Zuckerraffinerie, 1850 bayerischer Staat, 1866 Forsthaus, 1975 Erwerb und Restaurierung durch einen privaten Eigentümer. Eine Nutzung als Brauerei oder Direktorenvilla steht dort nicht.
- **Aufgabe:** WP-SK, SKD und RLS auf genau diesen Satz prüfen; wenn keine Quelle ihn trägt, streichen. Bis dahin: nicht in neue Texte übernehmen, auch nicht in Gerolds Stationstext.
- **Markenregel:** Den Eigentümer von 1975 in keinem Spieltext nennen. Im Codex reicht „Privatbesitz“.
- **Zusätzlich offen** (nie FAKT, in keinem Text als Tatsache): Baujahr und Zweck des Weihers; Fassung und Schlossversorgung der Quelle; Steinbruch am Felsenpfad; Baujahr 1776 des Hofs. Nächster Schritt für alle: Schwan 2012 (SCHWAN12, PDF-Download war gesperrt) und W. Weber, *Schloss Karlsberg* (1987), von Hand prüfen.
