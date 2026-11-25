# Codex

The [Codex builder](../../scripts/content-build/codex.mjs) defines the shipped cards and sources.
The [tour cards and photo cards](#tour-karten-und-fotokarten) collect drafts for the four stations
and the deer scene. Their working IDs reserve no runtime entries.

Der Codex enthältDer Codex enthält **47 Karten** (`cx.01`–`cx.47`; `cx.41`/`cx.42` stehen in `docs/IDEAS-ROUND11.md` §1, `cx.43`–`cx.46` unten, `cx.47` „Treibgut“ gehört zu den Fläschchen, `src/systems/flaschen`) und **8 Reliefmuster-Karten** (`rm.01`–`rm.08`). Eine Karte wird freigeschaltet, wenn der zugehörige FAKT-Eintrag bestätigt ist, oder wie in der Spalte „frei durch“ angegeben. Nach dem Ende ist der ganze Codex offen.

**Felder** (passend zu `content/schema/pack.schema.json`, Typ `fact`): `id`, Titel (`title_de`), Text (`text_de`, 2–5 Sätze), Sicherheit (`confidence`: D belegt, I erschlossen, N Zeitnorm, U unbekannt), Label (FAKT / STRITTIG / LEGENDE / FIKTION), `fiction` (ja/nein), Quellen (URL + Kürzel), Streitpunkt (`contested_de`, falls vorhanden), Lizenz (`licence`).

**Lizenz der Texte:** Alle Kartentexte sind eigene Texte dieses Projekts. Kurze wörtliche Zitate nennen ihre Quelle (Zitatrecht).

> **Offene Rechtsfrage zu M1910 (vor dem Release klären):** Mannlich starb 1822, sein französischer Text ist gemeinfrei. Die deutsche Ausgabe von 1910 ist aber eine **Übersetzung** von Eugen Stollreither. Ihr Schutz hängt an seinem Todesjahr (70 Jahre). Das Todesjahr habe ich **nicht geprüft**. Ist die Übersetzung noch geschützt, bleiben die kurzen Zitate als Zitate zulässig, aber längere Echos (`echo.k2.warnung`, `echo.k3.koenig`, `echo.k3.galerie`) sollten dann gekürzt oder neu aus dem Französischen übersetzt werden. archive.org allein ist kein Beleg für Gemeinfreiheit.

## Quellen (volle URLs)

| Kürzel | Quelle | URL |
| --- | --- | --- |
| M1910 | J. C. von Mannlich, *Ein deutscher Maler und Hofmann. Lebenserinnerungen 1741–1822*, hg. E. Stollreither, Berlin 1910 | https://archive.org/details/eindeutschermale00mann |
| WP-SK | de.wikipedia: Schloss Karlsberg | https://de.wikipedia.org/wiki/Schloss_Karlsberg |
| WP-K2A | de.wikipedia: Karl II. August | https://de.wikipedia.org/wiki/Karl_II._August |
| ADB | Allgemeine Deutsche Biographie: Karl II. (Herzog von Pfalz-Zweibrücken) | https://de.wikisource.org/wiki/ADB:Karl_II._(Herzog_von_Pfalz-Zweibr%C3%BCcken) |
| RLS | Rosa-Luxemburg-Stiftung 2015: „Der Karlsberg – von barocker Pracht zur Baustoffhandlung“ | https://www.rosalux.de/news/id/692/der-karlsberg-von-barocker-pracht-zur-baustoffhandlung |
| HOM | Stadt Homburg: Schloss Karlsberg | https://www.homburg.de/leben-in-homburg/touristisches/sehenswertes/schloss-karlsberg/ |
| SBT | Stadt Homburg: Faltblatt Schlossbergtour | https://www.homburg.de/media/scllyew0/schlossbergtour.pdf |
| SPT | Saarpfalz-Touristik: Bärenzwinger | https://www.saarpfalz-touristik.de/attraktionen/baerenzwinger-b8c8db2c7d |
| US | urlaub.saarland: Bärenzwinger | https://www.urlaub.saarland/attraktion/baerenzwinger-1986e52928 |
| EN-KC | en.wikipedia: Karlsberg Castle | https://en.wikipedia.org/wiki/Karlsberg_Castle |
| SKD | schloss-karlsberg.de (Dr. Jutta Schwan) | https://schloss-karlsberg.de/schloss-karlsberg-3/ |
| HIB | homburg-im-bild (Hobbyseite), Chronologie und Vita | http://nhp-2000.de/homburg-im-bild/html/body_-_chronologie_schloss_karlsber.html · http://nhp-2000.de/homburg-im-bild/html/body_-_vita_karl_ii_august_christia.html |
| RP18 | Die Rheinpfalz 2018: „Zerstörte Pracht jetzt wieder sichtbar“ | https://www.rheinpfalz.de/lokal/kreis-suedwestpfalz_artikel,-zerst%C3%B6rte-pracht-jetzt-wieder-sichtbar-_arid,1312894.html |
| HMS | Historisches Museum Saar: Steinerne Macht | https://www.historisches-museum.org/steinerne-macht |
| SCHWAN12 | J. Schwan, „Schloss Carlsberg bei Homburg-Saar“, *Burgen und Schlösser* 53 (2012) 4, 241–250 | https://journals.ub.uni-heidelberg.de/index.php/bus/article/download/53625/47240 |
| DA85 | ULB Darmstadt: Mannlich, „Plan d[e] la foire … 1785“ (CC0) | https://nbn-resolving.org/urn:nbn:de:tuda-tudigit-84275 |
| NDB | Deutsche Biographie: Christian Ludwig Hautt | https://www.deutsche-biographie.de/sfz28384.html |
| LIT | Literaturland Saar: Homburg | https://www.literaturland-saar.de/orte/homburg/ |
| EN-HB | en.wikipedia: Hohenburg Castle (Homburg) | https://en.wikipedia.org/wiki/Hohenburg_Castle_(Homburg) |
| BW | Burgenwelt: Hohenburg | https://www.burgenwelt.org/deutschland/hohenburg/burgenwelt-hohenburg-objektseite.pdf |
| WP-JB | de.wikipedia: Schloss Jägersburg | https://de.wikipedia.org/wiki/Schloss_J%C3%A4gersburg |
| WP-WJ | de.wikipedia: Wilde Jagd | https://de.wikipedia.org/wiki/Wilde_Jagd |
| HIST | Geoportal Saarland, WMS Historische Karten (Metadaten, dl-de/by-2-0) | https://geoportal.saarland.de/mapbender/php/mod_showMetadata.php?languageCode=de&resource=wms&id=2597 |
| LVGL | LVGL Saarland, Geobasisdaten (DGM1 2025, Open Data) | https://www.shop.lvgl.saarland.de/ |
| SDSCHG | Saarländisches Denkmalschutzgesetz | https://umwelt-online.de/recht/bau/laender/saarland/dschg18.htm |
| HE-BW | Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald | https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf |
| HP | Hörpfad Schloss Karlsberg | https://schloss-karlsberg.de/hoerpfad-schloss-karlsberg/ |
| WPK | WaldPark Schloss Karlsberg (outdooractive) | https://www.outdooractive.com/de/poi/saarpfalz-kreis/waldpark-schloss-karlsberg/61542782/ |
| KNIGGE-BRIEFE | Knigge (Hg.): Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben (Hannover 1793) | https://www.digitale-sammlungen.de/en/view/bsb10467161 |
| KNIGGE-UMGANG-1790 | Knigge: Ueber den Umgang mit Menschen, 3. Aufl., Teil 3 (Hannover 1790) | https://www.digitale-sammlungen.de/en/view/bsb10041018 |
| ADB-KNIGGE | ADB: Knigge, Adolph Freiherr (Erich Schmidt, 1882) | https://de.wikisource.org/wiki/ADB:Knigge,_Adolph_Freiherr |
| WP-KNIGGE | de.wikipedia: Adolph Freiherr Knigge | https://de.wikipedia.org/wiki/Adolph_Freiherr_Knigge |
| LITSAAR-KNIGGE | Literaturland Saar: Adolph Freiherr Knigge | https://www.literaturland-saar.de/personen/adolph-freiherr-knigge/ |
| SMZW | Stadtmuseum Zweibrücken: Das Tablett „Le Château de Carlsberg“ | https://www.zweibruecken.de/de/kultur-tourismus/kultur-erleben/kulturelle-einrichtungen/stadtmuseum/neuigkeiten/ |
| LIDAR | Eigene Auswertung im Schwesterprojekt: `saar-lidar-explorer/schloss-karlsberg/research/03-lidar-site-analysis.md`, `lidar_features.geojson` | (lokal, nicht öffentlich) |
| HOM-HF17 | Kreisstadt Homburg, Historischer Führer Nr. 17 „Karlsberger Hof“ (2005), archiviert | https://web.archive.org/web/20080123101148/http://www.homburg.de/content/pages/1071.htm |
| SPT-KR | Saarpfalz-Touristik: Karlsberg-Runde | https://www.saarpfalz-touristik.de/touren/karlsberg-runde-838271451c |
| OSM-KW | OpenStreetMap: Karlsbergweiher (Relation 17145701) | https://www.openstreetmap.org/relation/17145701 |
| WD-KW | Wikidata Q71702316 (Karlsbergweiher) | https://www.wikidata.org/wiki/Q71702316 |
| OSM-KQ | OpenStreetMap: Karlsbergquelle (Knoten 368031320), Karlsbergbach (Relation 10294956) | https://www.openstreetmap.org/node/368031320 · https://www.openstreetmap.org/relation/10294956 |
| KOMOOT-KQ | Fotos der heutigen Fassung | Quellenregister des [Codex-Builders](../../scripts/content-build/common.mjs) |
| WB-REH | Wochenblatt, 24.07.2026: Rekord bei Saar-Jägern | https://www.wochenblatt-reporter.de/saarland/c-lokales/rekord-bei-saar-jaegern-so-viel-rehwild-wie-nie-erlegt_a834005 |
| DWS-REH | Deutsche Wildtier Stiftung: Reh | https://www.deutschewildtierstiftung.de/wildtiere/reh |
| WP-REH | de.wikipedia: Reh | https://de.wikipedia.org/wiki/Reh |

---

## Karten

### cx.01 – Der Ehrenhof
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frühere Freischaltung:** `entry.p.1`
- **Text:** Die große, ebene Lichtung im Wald ist der Ehrenhof des Schlosses. Im Laserscan liegt sie auf rund 344,8 m, eine in den Hang geschnittene Terrasse, an drei Seiten von geraden Kanten begrenzt: Dort standen das Corps de logis und die beiden Flügel. Heute ist nur die Fläche geblieben, und wer sie kennt, sieht das Schloss darin.
- **Quellen:** SBT; WP-SK; LIDAR (KB-01)
- **Lizenz:** eigener Text

### cx.02 – Der Louisenhof
- **Label:** STRITTIG · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.3`
- **Text:** Am 27. Juli 1777 kaufte Herzog Karl II. August den Louisenhof auf dem Buchenberg. Aus dem Hofgut wurde in wenigen Jahren das Schloss Karlsberg. Nach Mannlich drängte die Mätresse des Herzogs, Caroline von Esebeck, eine Cousine des Besitzers, auf den Kauf.
- **Streitpunkt:** Kaufpreis 35 000 Gulden und 60 Louis d'or (WP-SK, HIB) oder 23 000 Gulden (EN-KC).
- **Quellen:** WP-SK; EN-KC; HIB
- **Lizenz:** eigener Text

### cx.03 – Karl II. August
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Prolog, erster Zeitwechsel
- **Text:** Karl II. August (1746–1795) regierte Pfalz-Zweibrücken von 1775 bis 1795. Der Diplomat Hans Christoph von Gagern nannte ihn „ein finsterer, wollüstiger, zur Härte geneigter eigensinniger Mann“, gestand ihm aber Sinn für Rang und Pflicht zu. Die ADB sieht eine „merkwürdige Mischung von Esprit und bizarrer Pedanterie“. Im Spiel ist er nie zu sehen, nur zu hören, und er sagt nur, was Mannlich überliefert.
- **Quellen:** WP-K2A; ADB; RLS
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.04 – Johann Christian von Mannlich
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.4`
- **Text:** Mannlich (1741–1822) war Hofmaler und musste als Baudirektor Ställe, Kasernen und einen Zwinger bauen. Er schrieb seine Lebenserinnerungen auf Französisch; die deutsche Ausgabe von 1910 ist gekürzt und übersetzt. Fast jedes Zitat in diesem Spiel stammt aus ihr. Er war kein neutraler Zeuge: Er verehrte den Herzog, und er erinnerte sich Jahre später, manchmal ungenau.
- **Quellen:** M1910; SCHWAN12
- **Lizenz:** eigener Text

### cx.05 – „Ein einziges JagdRevier“
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.5`
- **Text:** 1782 erschien in August Ludwig Schlözers *Stats-Anzeigen* ein bissiger Text über ein Land, das „ganz und gar gleichsam ein einziges JagdRevier“ sei, mit „ganze[n] Regimenter[n] JagdHunde“. Gemeint war Pfalz-Zweibrücken. Die Untertanen trugen die Last: Wildzäune, Parforcejagden und das Futter für die Meuten.
- **Quellen:** WP-K2A; RLS
- **Lizenz:** eigener Text; kurzes Zitat nach Quelle

### cx.06 – Der Zwinger für tausend Hunde
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.4`
- **Text:** Mannlich sollte „einen Zwinger für tausend Hunde (von den Wölfen abgesehen)“ bauen, für Hirsch- und Saumeute, Hühner- und Spürhunde, „für die Hunde aller Erdteile“. Der Hundezwinger entstand 1780–83 nördlich des Marstalls. Gagern schrieb später von „tausend Pferde[n] im Marstall, noch mehr Hunde[n] in den Zwingern“. Die Namen der Hunde sind nicht überliefert; die im Spiel sind erfunden.
- **Quellen:** M1910 S. 365 und Einl. S. XXXV; WP-K2A
- **Lizenz:** eigener Text; Zitat nach M1910

### cx.07 – Vierzehn Millionen
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.3`
- **Text:** Bau und Betrieb des Karlsbergs kosteten nach der ADB fast 14 Millionen Gulden. Das ganze Herzogtum nahm im Jahr etwa 800 000 Gulden ein. In Knigges Reisebriefen (1793) heißt das Ganze ein „Feen-Schloß“.
- **Quellen:** ADB; M1910 Einl. S. XXXIV; LIT; Knigge (Hg.), *Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben*, Hannover 1793, S. 28 f. (https://www.digitale-sammlungen.de/en/view/bsb10467161)
- **Korrektur 2026-11-20:** Der Brief (datiert Zweybrücken, 11. Mai [1792]) nennt seinen Schreiber nicht; Knigge steht nur als Herausgeber auf dem Titel. Dass Knigge selbst 1792 am Karlsberg war, ist nicht belegt (siehe `docs/IDEAS-ROUND11.md` §2.2). Der Code (`scripts/content-build/codex.mjs`, cx.07) hat die neue Fassung.
- **Lizenz:** eigener Text

### cx.08 – Zwei Tage für einen Gulden
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.2`
- **Text:** Ein Geselle musste zwei Tage arbeiten, um einen Gulden zu verdienen. Am Karlsberg waren über Jahre sechs bis zehn Baustellen gleichzeitig offen. Mannlich schreibt selbst von Untergebenen, „denen man ihren Lohn nicht bezahlte“. Wie viele Arbeiter es waren und wie viel ihnen geschuldet blieb, ist nicht bekannt.
- **Quellen:** EN-KC; M1910 S. 369; SKD
- **Lizenz:** eigener Text; kurzes Zitat nach Quelle

### cx.09 – Der Tränenberg
- **Label:** LEGENDE · **Sicherheit:** U · **fiction:** nein · **frei durch:** Gespräch `hanne.k1.05`
- **Text:** Eine Hobbyseite erzählt, die Arbeiter und die Homburger hätten den Karlsberg „Tränenberg“ genannt, weil die Löhne spät oder gar nicht kamen. Die Erben hätten die Schulden bis etwa 1850 abgezahlt. Beides ist nicht belegt. Im Spiel sagt Hanne darum: „Ob das so heißt, weiß ich nicht.“
- **Quellen:** HIB (Hobbyseite, ohne Beleg)
- **Lizenz:** eigener Text

### cx.10 – Leere Kassen
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.10` (LESART gesetzt)
- **Text:** Nach Mannlich leerte der Finanzpräsident Creuzer „alle Kassen, sogar die der Witwen und Waisen“, und bezahlte „die einen mit Versprechungen“. Vor seiner Flucht verbrannte er Papiere und gab andere in „sichere Hände“. Schon 1785 hatte Baudirektor Hautt in einem vernichtenden Gutachten über die Baustelle dem Bauverwalter Schäfer und Creuzer Misswirtschaft vorgeworfen. Aus den „sicheren Händen“ macht das Spiel den Kanzlisten Soll, und der ist erfunden.
- **Quellen:** M1910 S. 377, 396 f.; NDB
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.11 – Zu Fuß, außer einem
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.1`
- **Text:** Nur der Herzog durfte zum Schloss hinauffahren, alle anderen gingen zu Fuß. Singen war streng verboten. Ein Zeitgenosse fand die Gegend „wie betäubt“. So berichtet es ein Artikel der Rosa-Luxemburg-Stiftung von 2015.
- **Quellen:** RLS
- **Lizenz:** eigener Text

### cx.12 – Die Menagerie im Rund
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.6`
- **Text:** In der Karlslust standen 19 kleine Häuser mit Schieferdach im Kreis um einen Wassergraben, in der Mitte eine Insel mit Pavillon; dessen Grundmauern wurden 2016 wiedergefunden. Dort lebten nach den Quellen unter anderem Papageien, Pelikane, Kasuare, Affen, Wölfe, kanadische Füchse, zwei Dromedare und Stachelschweine. Mannlich beschreibt ein Gebäude „wie ein antikes Amphitheater“ für „Vierfüßler und Raubvögel“.
- **Quellen:** SPT; US; M1910 S. 384; HIB
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.13 – Bärenzwinger oder nicht?
- **Label:** STRITTIG · **Sicherheit:** I · **fiction:** nein · **frei durch:** `entry.k1.7`
- **Text:** Das Rund in der Karlslust heißt heute „Bärenzwinger“. Wahrscheinlich war es eher eine Voliere und Menagerie für kleinere Tiere. Die eisernen „Bären-Kästen“ von 1786, von außen beheizt, standen auf den Herzogsterrassen. Ob dort je Bären lebten, ist nicht sicher belegt.
- **Streitpunkt:** Nutzung des Runds (Bären oder Vögel); Zweck des 1780–83 gebauten „Zwingers“ (Hunde oder Bären).
- **Quellen:** SPT; US; WP-SK; SKD
- **Lizenz:** eigener Text

### cx.14 – Der 19. Dezember 1785
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.8` und `entry.k1.9`
- **Text:** Zur Hochzeit des Pfalzgrafen Maximilian Joseph, des späteren Königs Max I. von Bayern, gab es im Dezember 1785 Feste am Karlsberg. In der Karlslust oberhalb der Großen Kaskade explodierte das Feuerwerk. Gegen den Rat eines Feuerwerkers aus Straßburg lagen alle Raketen auf einem einzigen Gerüst statt auf drei getrennten. Nach Mannlich traf es Major Magnier und elf seiner Arbeiter; der Major starb, mehrere Arbeiter wurden schwer verbrannt. Die Namen der Arbeiter sind nicht überliefert.
- **Quellen:** M1910 S. 386–392; WP-SK
- **Lizenz:** eigener Text

### cx.15 – Der Festplan von 1785
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `clue.k1.festplan`
- **Text:** Mannlich schickte Blätter seiner Festbauten an den Landgrafen von Hessen-Darmstadt; sie liegen heute in der ULB Darmstadt und sind frei (CC0). Im Orangeriehof stand ein „Jahrmarkt“ aus Buden im Kreis und eine Rotunde aus Holz und Leinwand, die nach der Hochzeit wieder abgerissen wurde. Gezeigt wurden auch ein künstlicher Vulkan und ein Tempel des Hymenaios.
- **Quellen:** DA85; M1910 S. 386–391; SCHWAN12
- **Lizenz:** eigener Text; Bild (falls genutzt) CC0

### cx.16 – Die Warnung
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k2.2`, `entry.k2.3`, `entry.k2.4`
- **Text:** Ein Bauer kam atemlos auf den Karlsberg: Französische Reiter seien durch die Wälder in sein Dorf gekommen und suchten einen Führer, um nachts auf Umwegen zum Schloss zu gelangen. Er hatte sich durch seinen Garten in den Wald geschlichen und war über den Parkzaun geklettert. Der Herzog hielt die Nachricht zuerst für „unglaubwürdig“ und wollte ihm einen Dukaten geben. Wikipedia nennt den Bauern Nikel (Nicolaus) Pfeiffer, Bauer und Postbote aus Rohrbach, heute St. Ingbert. Von ihm selbst sind keine Worte überliefert.
- **Quellen:** M1910 S. 422 f.; WP-K2A
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.17 – Wann war die Flucht?
- **Label:** STRITTIG · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k2.1`
- **Text:** Der Zweibrücker Regierungsrat Ludwig Philipp Horstmann notierte Flucht und Ankunft General Landremonts in der Nacht des 9. Februar 1793. Die ADB nennt den 3. Februar. Mannlich erinnerte sich an „gegen Ende Februar“. Das Spiel folgt Horstmann, weil er zeitnah schrieb.
- **Streitpunkt:** 9. Februar (Horstmann, WP-K2A) / 3. Februar (ADB) / Ende Februar (Mannlich).
- **Quellen:** M1910 S. 422 und S. 427 Anm. 1; WP-K2A; ADB
- **Lizenz:** eigener Text

### cx.18 – „Über meine Galerie zu wachen“
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k2.5`
- **Text:** Vor der Abfahrt ließ der Herzog Mannlich zurück, „um über meine Galerie zu wachen und sie zu retten, wenn es Ihm möglich ist“, und empfahl ihm danach das Naturalienkabinett und die Bibliothek. Er nahm ein kleines Jagdmesser vom Tisch. Gegen 10 Uhr abends fuhr er ab.
- **Quellen:** M1910 S. 423 f.
- **Lizenz:** eigener Text; Zitat nach M1910

### cx.19 – „Das sind Kalköfen“
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k2.6`
- **Text:** Kurz nach der Abfahrt sprengte General Landremont mit seinen Jägern heran und fragte: „Was bedeuten denn die Feuer, die ich dort unten im Walde habe leuchten sehen?“ Ein Handwerker antwortete, ohne stehenzubleiben: „Das sind Kalköfen.“ Was die Lichter wirklich waren, schreibt Mannlich nicht. Eine Lokalüberlieferung erzählt von Fackelträgern, die den Herzog begleitet hätten; das ist nicht belegt.
- **Quellen:** M1910 S. 427 f.; HIB (Überlieferung)
- **Lizenz:** eigener Text; Zitat nach M1910

### cx.20 – Die Rettung der Sammlungen
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.7`
- **Text:** Während der französischen Besetzung trug Mannlich mit dem alten Diener Burger die schönsten Bilder durch eine geheime Falltür in die Werkstatt des Büchsenmachers und versteckte sie dort. Später ließen er und dreißig Handwerker die Galerie, die Bibliothek, Möbel und Wandverkleidungen verpacken und über Kaiserslautern nach Mannheim bringen. Die Bilder wurden ein Grundstock der Alten Pinakothek in München; die Bibliothek liegt heute in Bamberg.
- **Quellen:** M1910 S. 431 f., 437; WP-SK; WP-K2A
- **Lizenz:** eigener Text

### cx.21 – Das abbestellte Naturalienkabinett
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.6`
- **Text:** Die Kisten mit dem Naturalienkabinett standen gepackt, die Wagen waren in Kaiserslautern bestellt. Dann versicherte der König von Preußen dem Herzog, die Franzosen würden den Karlsberg nicht mehr betreten, und der Herzog gab Gegenbefehl. Die Sammlung verbrannte im Juli 1793, darunter nach einem Katalog von 1785 1 187 Vögel.
- **Quellen:** M1910 S. 437, 454 f., 461 f.; SCHWAN12 (Holandre 1785)
- **Lizenz:** eigener Text

### cx.22 – Der Brand
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.1` bis `entry.k3.4`
- **Text:** Am Sonntag, dem 28. Juli 1793, zündeten abziehende französische Truppen den Karlsberg an. Nach Mannlich hatte man Stroh „bis von Lothringen“ herangeschafft (andere Quellen: bis zu 100 Wagen aus der Gegend von Metz), um alle Räume im Erdgeschoss damit zu füllen. Ein Kommissär setzte es „im Namen der Nation mit brennender Fackel“ in Brand, und die Menge sang „Ça ira“. Mannlich war nicht dabei und schreibt nach Berichten.
- **Quellen:** M1910 S. 461 f. mit Anm. 39; WP-SK; SCHWAN12 (Remling)
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.23 – Die Plünderung
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.5`
- **Text:** Die abziehenden Franzosen gaben das Schloss zur allgemeinen Plünderung frei, auch für die Leute aus den umliegenden Dörfern. Am Morgen nach dem Brand plünderten Einheimische, was übrig war. Eine literaturgeschichtliche Quelle spricht von „breite[r] Unterstützung bei der heimischen Bevölkerung“. Wer was nahm und warum, bleibt im Spiel eine LESART.
- **Quellen:** WP-SK; EN-KC; LIT
- **Lizenz:** eigener Text

### cx.24 – Wo lag die Bibliothek?
- **Label:** STRITTIG · **Sicherheit:** I · **fiction:** nein · **frei durch:** Baumeister 1
- **Text:** Der Sammlungsflügel westlich des Küchenhofs enthielt Bibliothek, Naturalienkabinett und Waffensammlung. Nach Schwan (2012) lag die Bibliothek im Erdgeschoss, vier Räume in einer Reihe, und Naturalienkabinett und Waffensammlung im Obergeschoss. Das Modell, auf dem dieses Spiel steht, hat die Waffensammlung im Erdgeschoss und die Bibliothek oben. Das Spiel folgt dem Modell, damit die Räume zusammenpassen.
- **Streitpunkt:** Geschossverteilung im Sammlungsflügel.
- **Quellen:** SCHWAN12; Katalog `schloss-karlsberg/model/catalogue.json` (v2)
- **Lizenz:** eigener Text

### cx.25 – Die Bildergalerie
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.9`
- **Text:** Mannlich baute die Galerie 1788 von Mitte Februar bis August, aus einem hölzernen Verbindungsgang heraus. Die Wände waren mit Brettern verschalt und mit grünem Damast aus Lyon bespannt; zwanzig Kristalllüster hingen von der Decke, und 104 vergoldete Lehnstühle standen darin. Mannlich nannte sie „cent pas“ lang, hundert Schritt; die deutsche Ausgabe von 1910 übersetzt falsch „hundert Fuß“. Vorher hingen die Bilder in allen Vorzimmern, und wer seinen Stuhl zu nah an die Wand rückte, hörte: „Obacht auf die Bilder!“
- **Quellen:** M1910 S. 374 f.; SCHWAN12 (Anm. 47, Bauakten)
- **Lizenz:** eigener Text; kurze Zitate nach Quelle

### cx.26 – Die Falltür
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `clue.k3.falltuer`
- **Text:** Mannlich und der Diener Burger wussten von einer „geheimen Falltür, die aus der Bildergalerie in die Werkstätte des herzoglichen Büchsenmachers führte“. Durch sie retteten sie Bilder. Wo genau sie lag, ist nicht bekannt. Dass der Kanzlist Soll dort ein Buch versteckte, ist erfunden.
- **Quellen:** M1910 S. 431 f.; SCHWAN12 Anm. 62
- **Lizenz:** eigener Text; Zitat nach M1910

### cx.27 – Ein Türgriff, ein Dukat, eine Uhr
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Wahl im Festsaal (`flag.k3_objekt`)
- **Text:** In der Ausstellung „Steinerne Macht“ im Historischen Museum Saar (17. November 2018 bis 23. Juni 2019) lagen vom Karlsberg unter anderem eine vergoldete Uhr mit Alabaster, ein Dukat mit Schlossansicht, eine Pistole, ein Jagdmesser und ein Türgriff. Ob der Gegenstand, den du im Spiel gerettet hast, „dieser“ war, weiß niemand.
- **Quellen:** RP18; HMS
- **Lizenz:** eigener Text

### cx.28 – Was schnell gebaut wurde
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k3.8`
- **Text:** Das Feuer zerstörte vor allem die Residenz des Herzogs und die Fachwerkbauten. Viele Bauten waren verputztes Fachwerk, schnell und billig errichtet. Die meisten Wirtschafts- und Hofgebäude überstanden den Brand. Noch im November 1793 wurden auf dem Karlsberg Kinder geboren, und Hofrechnungen laufen bis 1797.
- **Quellen:** WP-SK; EN-KC
- **Lizenz:** eigener Text

### cx.29 – Tod und Schulden
- **Label:** STRITTIG · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k4.2`
- **Text:** Karl II. August starb am 1. April 1795 im Exil nach einem Schlaganfall. Er hinterließ seinem Bruder Maximilian über 9 Millionen Gulden Schulden. Sein Sarkophag steht in der Wittelsbacher Gruft von St. Michael in München.
- **Streitpunkt:** Sterbeort Mannheim (ADB, WP) oder Rohrbach bei Heidelberg (HIB).
- **Quellen:** WP-K2A; ADB; HIB
- **Lizenz:** eigener Text

### cx.30 – Pacht und Abriss
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k4.1`, `entry.k4.3`
- **Text:** 1796 pachteten 14 Homburger Bürger das Recht, Holz und Steine der Ruine zu verkaufen. Unter Napoleon erhielt die Witwe des Herzogs die Ruine zurück, mit der Bedingung, sie bis auf den Grund abzureißen. Anfang des 19. Jahrhunderts war das Schloss bis auf die Fundamente abgetragen.
- **Streitpunkt:** Die Zahl 14 stammt nur von einer Hobbyseite (HIB).
- **Quellen:** HIB; RLS; WP-SK
- **Lizenz:** eigener Text

### cx.31 – Steine auf Wanderschaft
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k4.4`
- **Text:** Die Hohenburg über Homburg, eine Burg des 12. Jahrhunderts und später eine Festung, wurde 1714 geschleift. Ihre Trümmer dienten dem Herzog als Steinbruch für den Karlsberg. Aus dem Jagdschloss Jägersburg kamen Täfelungen, Möbel und angeblich ein ganzer Stall. Nach 1793 wanderten die Steine weiter, in die Häuser von Homburg. Das Steinmetzzeichen im Spiel ist erfunden.
- **Quellen:** EN-HB; BW; WP-JB; SKD; RLS
- **Lizenz:** eigener Text

### cx.32 – Das Baumagazin
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Kapitel 4, Baumagazin
- **Text:** Vom ganzen Karlsberg steht nur noch ein Gebäude: das ehemalige Baumagazin am Fuß des Berges, das Lager für Baumaterial. Es wurde später als Forsthaus genutzt und heißt heute Karlsberger Hof. Es ist Privatbesitz und nur von der Straße aus zu sehen. Der Rest des Schlosses wurde selbst zur „Baustoffhandlung“.
- **Quellen:** WP-SK; SKD; RLS
- **Lizenz:** eigener Text

### cx.33 – Die Karte von 1836–41
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Kapitel 4, Kartenvergleich
- **Text:** Seit 1816 gehörte die Gegend als Rheinkreis zu Bayern. Die Bayerischen Originalpositionsblätter 1:25 000 von 1836–41 zeigen „Ruine Carlsberg“, „Carlsbergerhof“ und „Sanddorf“. In der heutigen georeferenzierten Fassung liegt das Schloss rund 50 m zu weit im Osten, mit örtlichen Abweichungen bis etwa 30 m. Den Geometer Laub, der behauptet, er habe die Karte aufgenommen, gab es nicht.
- **Quellen:** HIST; LIDAR (Abschnitt 1 Nr. 8)
- **Lizenz:** eigener Text; Kartenbild dl-de/by-2-0, © GeoBasis-DE/LVGL-SL

### cx.34 – Der Laserscan von 2025
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frühere Freischaltung:** `entry.p.1`
- **Text:** 2025 hat das Saarland aus der Luft mit Laser vermessen, im Winter ohne Laub. Seit Januar 2026 sind die Daten frei. Rechnet man Bäume und Häuser heraus, bleibt das Gelände: das Geländemodell DGM1 mit einem Messpunkt pro Meter. Relief-Ansichten wie Schummerung, Lokales Relief und VAT machen sichtbar, was unter dem Wald liegt: Terrassen, Gruben, Hohlwege, Ausbruchgräben.
- **Quellen:** LVGL; LIDAR
- **Lizenz:** eigener Text; Daten dl-de/by-2-0, © GeoBasis-DE/LVGL-SL

### cx.35 – Schauen, nicht graben
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Prolog (immer offen)
- **Text:** Der Karlsberg ist ein Bodendenkmal. Was im Boden liegt, ist geschützt: Graben, Sondeln und Mitnehmen sind ohne Genehmigung verboten, und Funde müssen der Denkmalbehörde gemeldet werden. Der Laserscan ist dafür da, dass man schauen kann, ohne zu graben. Dieses Spiel zeigt keine Fundstellen und keine Grabtipps.
- **Quellen:** SDSCHG; HE-BW
- **Lizenz:** eigener Text

### cx.36 – Die Wilde Jagd
- **Label:** LEGENDE · **Sicherheit:** U · **fiction:** nein · **frei durch:** erste Begegnung mit der Meute
- **Text:** In vielen deutschen Sagen reitet in den Rauhnächten eine geisterhafte Jagd über den Himmel; wer sie sieht, soll sich zu Boden werfen. Eine saarländische Fassung nennt einen „wilden Jäger“ Maltitz, verdammt, weil er an Karfreitag jagte. Keine Quelle verbindet Karl II. August mit der Wilden Jagd. Die Meute im Spiel ist erfunden.
- **Quellen:** WP-WJ
- **Lizenz:** eigener Text

### cx.37 – „Hundskarl“
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.k1.4`
- **Text:** Der Spitzname „Hundskarl“ wurde 1923 durch den Heimatforscher Fritz Schunck bekannt, nach dem Ende der bayerischen Monarchie. Eine Hobbyseite erzählt dazu eine Geschichte von einem Hund, einem Jungen und einem herzoglichen Satz; sie ist nicht belegt, und das Spiel erzählt sie nicht nach.
- **Quellen:** WP-K2A; RLS; HIB (unbelegte Anekdote)
- **Lizenz:** eigener Text

### cx.38 – Was in diesem Spiel erfunden ist
- **Label:** FIKTION · **Sicherheit:** – · **fiction:** ja · **frei durch:** Prolog (immer offen)
- **Text:** Erfunden sind: Geometer Quirin Laub und seine Bussole, Marlene, der Kanzlist Gottlob Soll, Hanne, Matthes und Peter, der Hundejunge Jost und der Pikeur, die Namen der Hunde, die Chronik „Was der Hof schuldig blieb“, die Meute als Spuk, der Steinfraß, das Steinmetzzeichen, alle Laufwege, alle Dialoge außer den markierten Zitaten. Historische Personen sagen nur, was Mannlich überliefert. Die „Erinnerungen“ im Spiel sind keine Rekonstruktion, sondern Vorstellung.
- **Quellen:** –
- **Lizenz:** eigener Text

### cx.39 – Der Karlsberg heute
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Ende
- **Text:** Seit 2008 ist der Karlsberg ein WaldPark, seit 2007 führt ein Hörpfad von 5,5 km durch das Gelände, und 2009–2013 wurden die Ruinen gesichert. Sichtbar sind die Reste der Orangerie, die Lichtung des Ehrenhofs, Weiher, Brunnen und das Rund des „Bärenzwingers“. Die „Herzogskastanien“ gelten als über 200 Jahre alte Naturdenkmale; ob sie den Sturm Wiebke 1990 überstanden, ist widersprüchlich überliefert.
- **Streitpunkt:** Zustand der Herzogskastanien.
- **Quellen:** SBT; HP; WPK; SKD
- **Lizenz:** eigener Text

### cx.40 – Die Orangerie
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `entry.p.2`
- **Text:** Die Orangerie entstand ab 1780 aus der früheren Schweizerei; im Pfeilersaal standen im Winter die Kübelpflanzen, und Mannlich wohnte im Obergeschoss. Im Laserscan ist ihre Stützmauer eine schnurgerade Kante von rund 81 m mit einer Stufe von 5,3 m. Ihre Reste gehören heute zu den wenigen sichtbaren Mauern am Karlsberg.
- **Quellen:** SBT; WP-SK; M1910; LIDAR (KB-30)
- **Lizenz:** eigener Text

### cx.41 – Die Karlsbergquelle
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein
- **Text:** In einer Rinne zwischen Weiher und Orangerie entspringt der Karlsbergbach. Am Trog führt ein Rohr das Wasser in einen ausgehöhlten Stamm. Hangaufwärts liegt eine kleine gewölbte Brunnenstube. Wann die Quelle gefasst wurde und ob sie das Schloss versorgte, bleibt offen.
- **Quellen:** OSM-KQ; KOMOOT-KQ; LIDAR (Quellmulde 1061/−835)

### cx.42 – Das Wasser erinnert sich
- **Label:** FIKTION · **Sicherheit:** – · **fiction:** ja
- **Text:** Das Wasser bewahrt Erinnerungen und kann den Besucher in ein anderes Jahr führen. Ein Tropfen in der Bussole hält den Weg eine Weile offen. Auch die barocke Brunnenstube mit Steinbecken und Bronzespeier ist für das Spiel erfunden.
- **Quellen:** –

### cx.43 – Knigges Reisebriefe
- **Label:** STRITTIG · **Sicherheit:** D · **fiction:** nein · **frei durch:** `q.k1.brief`
- **Text:** wie `scripts/content-build/codex.mjs` (Knigge, „Über den Umgang mit Menschen“ 1788 kein Benimmbuch; die „Briefe, auf einer Reise aus Lothringen nach Niedersachsen“ 1793, Brief vom 11. Mai 1792: Erlaubnis des Herzogs, Stühle, Federtapeten, Pfeifenköpfe, „Feen-Schloß“).
- **Strittig:** Der Briefschreiber nennt keinen Namen; Knigge steht nur als Herausgeber auf dem Titel. M1910 und das Stadtmuseum Zweibrücken lesen den Brief als Knigges eigenen Besuch, Literaturland Saar nennt die Briefe „auf 1792 vordatiert“.
- **Quellen:** KNIGGE-BRIEFE S. 26–29; M1910 Einl. S. XXXIII f.; ADB-KNIGGE; WP-KNIGGE; LITSAAR-KNIGGE; SMZW
- **Lizenz:** eigener Text, Zitat gemeinfrei

### cx.44 – Wer hinauf durfte
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `q.k1.brief`
- **Text:** Niemand ungerufen auf den Berg (Mannlich); 1792 eine ausdrückliche Erlaubnis mit jedem Begleiter namentlich; nur der Herzog fuhr; hundert Gardisten an den Eingängen (Text des Herausgebers 1910, ohne Beleg).
- **Quellen:** M1910 S. 355, Einl. S. XXXIII; KNIGGE-BRIEFE S. 26 f.; RLS
- **Lizenz:** eigener Text, Zitat gemeinfrei

### cx.45 – Der Prinz von Albanien
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** `q.k1.brief`
- **Text:** Ende 1777 der falsche „Prinz Castrioto von Albanien“ in Zweibrücken: Empfehlungsbrief aus Straßburg, Mannlichs Zweifel, der Hof hinter den Jalousien, die abgeschriebene Ode, Verhaftung und Ausweisung. Nach Mannlich; in Zweibrücken, vor dem Karlsberg.
- **Quellen:** M1910 S. 345–349, 356–358
- **Lizenz:** eigener Text

### cx.46 – Ein Brief in fremdem Namen
- **Label:** FIKTION · **Sicherheit:** D · **fiction:** ja · **frei durch:** `clue.k1.brief`
- **Text:** Erfunden: Liese und Kaspars Rock, Hofrat Justus Amsel aus Celle und „Vom Betragen bei Hofe“, der Brief, die Musterung, die Wachen, die hinausbegleiten. Wie die Wache prüfte, eine Kleiderordnung, Livreefarben: nicht überliefert. Echt ist nur die Regel aus `cx.44`.
- **Lizenz:** eigener Text

---

## Reliefmuster-Karten (Handbuch des Forstamts)

Diese Karten stehen ab dem Prolog im Codex (`clue.p.handbuch`). Jede Karte hat: wie das Muster im Relief aussieht, womit man es verwechselt, und ein Beispiel am Karlsberg. **Keine Karte nennt Fundstellen außerhalb des Spielgebiets, und keine sagt, wo man graben soll.**

### rm.01 – Terrasse und Planie
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR (KB-01, KB-07)
- **Im Relief:** Eine auffällig ebene Fläche mit geraden Kanten, an einer Seite in den Hang geschnitten, an der anderen aufgeschüttet. Im Lokalen Relief hell an der Böschungsoberkante, dunkel am Fuß.
- **Verwechslung:** Forstwege-Kehren, Holzlagerplätze (meist jünger, ohne rechte Winkel).
- **Am Karlsberg:** der Ehrenhof auf 344,8 m und die Stufe zum Nordplateau (Spielorte 1216/−1114 und 1250/−1200).

### rm.02 – Grube mit Ringwall (Eiskeller)
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR (KB-50)
- **Im Relief:** Eine runde Grube, ein bis zwei Meter tief, mit einem flachen Wall rundherum: ein eingestürzter Keller, dessen Gewölbe nachgegeben hat.
- **Verwechslung:** Bombentrichter (`rm.06`, kein sauberer Ring), Meilerplatz (`rm.03`, flach statt tief).
- **Am Karlsberg:** der Eiskeller östlich des Schlosses (1508/−1296), 10 × 10 m, 1,8 m tief.

### rm.03 – Meilerplatz (Kohlplatte)
- **Sicherheit:** D · **Quellen:** HE-BW
- **Im Relief:** Eine kreisrunde, fast ebene Plattform von 8–15 m Durchmesser, am Hang oft mit einer kleinen Stufe hangabwärts. Dort brannten Köhler Holzkohle. Im Boden ist die Erde schwarz.
- **Verwechslung:** Eiskeller (tief, nicht flach), Wegekehren.
- **Am Karlsberg:** im Spiel nur als Motiv am Hang unter der Orangerie (`clue.k2.koehler`); ein bestimmter Meilerplatz ist nicht belegt.

### rm.04 – Hohlweg
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR (KB-10, KB-11)
- **Im Relief:** Ein Weg, der sich durch Räder, Hufe und Regen über Jahrhunderte in den Boden gegraben hat: eine Rinne mit steilen Seiten, oft mehrere nebeneinander (Fächer).
- **Verwechslung:** Wassergraben (gerader, gleichmäßiger), Ausbruchgraben (`rm.05`, kurz und eckig).
- **Am Karlsberg:** der Hohlweg westlich des Schlosses (1172/−1238), 249 m lang, genau dort, wo die Karte von 1836–41 eine gerade Straße zeigt.

### rm.05 – Ausbruchgraben
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR (KB-06)
- **Im Relief:** Ein schmaler, gerader Graben in der Form einer Mauer, oft als geschlossenes Rechteck, manchmal mit einem leicht erhöhten Kern aus Schutt in der Mitte. Hier wurde eine Mauer bis auf den letzten Stein ausgebrochen; was man im Scan als „Mauerzug“ sieht, ist das Loch.
- **Verwechslung:** Fundament (`rm.07`, erhöht statt vertieft), Hohlweg.
- **Am Karlsberg:** am Küchenhof (1240/−1193), ein Rechteck von 28 × 13 m.

### rm.06 – Bombentrichter
- **Sicherheit:** D · **Quellen:** HE-BW
- **Im Relief:** Runde Trichter mit unregelmäßigem Auswurfwall, oft in Reihen oder Gruppen, selten allein. Aus dem 20. Jahrhundert.
- **Verwechslung:** Eiskeller (sauberer Ringwall, Einzelstück), Pingen (Bergbau).
- **Am Karlsberg:** im Spiel nur als Köder. Achtung: Wo Trichter sind, kann Munition liegen. Nicht betreten, nicht graben, melden.

### rm.07 – Fundament und Mauerzug
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR
- **Im Relief:** Gerade Kanten, rechte Winkel, schmale Rücken, die sich nicht nach dem Gelände richten. Der Wald macht keine rechten Winkel.
- **Verwechslung:** Ausbruchgraben (`rm.05`), alte Flurgrenzen, Forstzäune.
- **Am Karlsberg:** das kleine Rechteck neben dem Damm des Karlsbergweihers (Tutorial, `clue.p.mauerrest`) und die Orangerie-Stützmauer (KB-30).

### rm.08 – Weiher und Damm
- **Sicherheit:** D · **Quellen:** HE-BW; LIDAR (KB-40, KB-42)
- **Im Relief:** Eine glatte, völlig ebene Fläche (Wasser liefert im Laserscan oft keine Punkte und wird flach gefüllt), an einer Seite ein gerader Damm quer zum Tal.
- **Verwechslung:** Wiesen in Talauen, trockengefallene Teiche (dann sieht man den Damm ohne Wasser).
- **Am Karlsberg:** der Karlsbergweiher mit Damm an der Westseite (819/−875), die Schwanenweiher und das Tosbecken in der Karlslust.

## Tour-Karten und Fotokarten

**Entwürfe.** `cx.T1`–`cx.T4` und die Fotokarten sind Arbeits-IDs. Die geplanten Auslöser
unten gehören zum Entwurf. Die gespielte Führung nutzt die Stationstexte in der Story-Datei.

### cx.T1 – Das Gebäude, das blieb
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Station 1 (Entwurf)
- **Text:** Am Fuß des Karlsbergs steht der Karlsberger Hof, das einzige noch erhaltene Gebäude der Schlossanlage. Er entstand zur Bauzeit des Schlosses als Vorrats- und Wohngebäude, als Lager für Baumaterial mit Wohnungen. Nach 1804 wurde er versteigert und als Hofgut bewirtschaftet; 1830 lief darin eine Zuckerraffinerie, 1850 kaufte ihn der bayerische Staat, ab 1866 war er Forsthaus. Heute ist er Privatbesitz und nur von außen zu sehen.
- **Streitpunkt:** Die Stadt Homburg nennt 1776–85 als Bauzeit; 1776 liegt vor dem Kauf des Louisenhofs (1777, `cx.02`). Darum steht im Text nur „zur Bauzeit des Schlosses“.
- **Quellen:** HOM-HF17; SKD
- **Lizenz:** eigener Text
- **Hinweis:** Keine Eigentümer- oder Markennennung. Der Name „Karlsberger Hof“ steht hier als Name des Ortes (Adresse, Quellentitel), nur als Ort (Q2 entschieden). Das Gebäude wird im Heute nicht modelliert.
- **Zusatz (optional, Quelle nachtragen):** Das Gebäude ist heute verändert: kürzer als das Baumagazin, mit neuem Dach und einem zusätzlichen Geschoss (Ergebnis der Schwester-Repo-Prüfung, 2026-11-20). Dass es heute noch steht, sagen schon cx.32 und [Kapitel 4](../quests/04-kapitel-4.quests.json); für „verändert“ vor dem Einbau die Quelle nennen, sonst weglassen.
- **Nicht verwechseln:** KB-B30 „Carlsberger Hof (Meierei)“ ist ein anderer Hof von 1789, rund 120 m südlich; das Baumagazin ist KB-B29.

### cx.T2 – Der Felsenpfad
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** Station 2
- **Text:** Der Felsenpfad führt vom Feldweg am Karlsberger Hof hinauf zum Karlsbergweiher und gehört zum WaldPark Schloss Karlsberg. Er führt an kleinen Felsen aus Buntsandstein vorbei, dem roten Stein der Gegend, der am Schlossberg in Homburg rund 250 Millionen Jahre alt ist. Die Felsköpfe darf man aus Sicherheitsgründen nicht betreten. Ob hier für das Schloss Stein gebrochen wurde, ist **nicht belegt**; belegt ist, dass die Trümmer der Hohenburg dem Herzog als Steinbruch dienten (`cx.31`).
- **Quellen:** SBT; SPT-KR; EN-HB; BW
- **Lizenz:** eigener Text
- **Hinweis:** OSM hat keinen Namen für den Weg; „Felsenpfad“ stammt aus dem Faltblatt (SBT). Die genaue Wegführung ist aus der Schlossberg-Tour erschlossen ([Quellen zur Führung](../../docs/design/tour/sources.md)).

### cx.T3 – Der Karlsbergweiher
- **Label:** FAKT (mit offenem Teil) · **Sicherheit:** D (Relikt) / U (Baujahr, Zweck) · **fiction:** nein · **frei durch:** Station 3
- **Text:** Der Karlsbergweiher ist ein Überbleibsel der Schlossanlage, ein Rest der Wasserbecken im Schlosspark. Im Laserscan sind der gerade Damm im Westen und die kleine Insel deutlich zu sehen. **Offen ist**, wann er angelegt wurde und ob er als Zierteich oder als Fischweiher diente; dafür gibt es keine Quelle.
- **Streitpunkt:** Baujahr und Zweck unbekannt (keine Quelle; Schwan 2012 und Weber 1987 wären zu prüfen).
- **Quellen:** SBT; EN-KC; WD-KW; OSM-KW; LIDAR (KB-40, KB-42)
- **Lizenz:** eigener Text
- **Hinweis:** Die Fläche (≈ 0,54 ha) ist aus dem OSM-Umriss gemessen, kein veröffentlichter Wert; nicht in den Kartentext.

### cx.T4 – Rehe im November
- **Label:** FAKT · **Sicherheit:** D · **fiction:** nein · **frei durch:** das gute Foto von Ricke und Kitz (Entwurf)
- **Text:** Rehe sind im Saarland häufig: Im Jagdjahr bis März 2026 wurden gut 12.500 erlegt, Rotwild dagegen nur 170 Tiere. Die Kitze kommen im Mai und Juni zur Welt; ihre Flecken sind nach etwa zwei Monaten verschwunden. Im November sind sie fünf bis sechs Monate alt, tragen schon das graue Winterfell und folgen noch der Ricke. Erst zwischen Mitte März und Mitte Mai lösen sich die Mutterfamilien auf. Zur Zeit des Herzogs war dieser Wald Jagdrevier (→ `cx.05`, `cx.06`).
- **Quellen:** WB-REH; DWS-REH; WP-REH; für den letzten Satz die Quellen von cx.05/cx.06 (WP-K2A, M1910)
- **Lizenz:** eigener Text
- **Hinweis:** Zahlen gelten für das Saarland, nicht für den Karlsberg. Rothirsche nicht zeigen.

### Fotokarten (ohne EP, Album)

Fotokarten sind kurze Kartenrückseiten, die ein gutes Foto freischaltet. Sie verweisen auf eine bestehende Karte und geben **keine** EP ([Prolog](01-prolog.md#5-übergabe-und-ep)).

| Arbeits-ID | Titel | Freigeschaltet durch | Inhalt | Verweist auf |
| --- | --- | --- | --- | --- |
| `ph.sandstein` | Roter Stein | Foto Buntsandstein | ein Satz zum Buntsandstein | cx.T2 |
| `ph.insel` | Die Insel | Foto der Insel | „Im Laserscan sieht man sie auch.“ | cx.T3, rm.08 |
| `ph.tafel` | Was auf der Tafel steht | Foto der Infotafel an der Quelle | Kurzfassung von cx.41 (unser Text, nicht der der echten Tafel) | cx.41 |
| `ph.orangerie` | Die Stufe | Foto der Orangerie-Stützmauer (später) | „81 m, 5,3 m tief.“ | cx.40 |
| `ph.rund` | Neunzehn Häuser | Foto des Bärenzwinger-Runds (später) | | cx.12, cx.13 |
| `ph.eiskeller` | Die Grube | Foto der Eiskeller-Grube (später) | | rm.02 |
| `ph.ehrenhof` | Die Lichtung | Foto der Ehrenhof-Lichtung (später) | | cx.01 |

---

### Vorgesehene Codex-Anpassungen

| Karten | Vorschlag |
| --- | --- |
| `cx.03` | Am Treffpunkt freischalten. |
| `cx.32` | Karte zum Baumagazin von 1796 behalten, für die spätere Geschichte auf die Hof-Karte verweisen. |
| `cx.33`–`cx.35` | Den Kartenvergleich in Marlenes vorgeschlagenen Messauftrag einbinden. Laserscan und Denkmalschutz am Weiher erklären. |
| `cx.36` | Die erste Meute bleibt der spielbare Auslöser. Der Entwurf sieht einen früheren Zugang über die Punktwolke vor. |
| `cx.38` | Gerold, die Doppelgänger, die Hunde von heute, den Fund im Trog und das Fest in die Fiktionsliste aufnehmen. |
| `cx.41`, `cx.42` | Die Quelle an Station 4 vorstellen. Das Wassertretbecken liegt in der Nähe, seine genaue Lage bleibt offen. Den Fund der Bussole als FIKTION kennzeichnen. |
| `rm.01`–`rm.08` | Das Reliefmuster-Handbuch über Marlenes App zugänglich machen. |

Die alten Station-Clues `clue.p.lageplan` und `clue.p.messtischblatt` wurden mit „Vermessung“ aus
dem spielbaren Prolog entfernt. Laminatkarte am Treffpunkt und Marlenes Tablet waren vorgeschlagene
neue Orte für die Motive.

### Offene Quellenfragen

- **Baumagazin (`cx.32`).** Für die Nutzungen nach 1804 nennt HOM-HF17 ein Hofgut, eine
  Zuckerraffinerie und ein Forsthaus. Die Entscheidung vom 20.11.2026 streicht die umstrittene
  Formulierung zur weiteren Nutzung. Der bestehende Builder enthält noch die frühere Fassung.
- **Weiher, Quelle und Felsenpfad.** Baujahr und Zweck des Weihers, Fassung und Schlossversorgung
  der Quelle sowie der vermutete Steinbruch am Pfad bleiben offen. Zur weiteren Prüfung führen
  SCHWAN12 und W. Weber, *Schloss Karlsberg* (1987).
