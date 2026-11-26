import type { QuestDefIn } from '../systems/quests/logic';

// Save compatibility for the retired surveyor chapter. Keep the original payout inputs and
// completed quest-log text. Live quests, world placements and dialogue use the content catalog.
export const legacyPrologueQuests: readonly QuestDefIn[] = [
  {
    chapter: 'prolog',
    id: 'q.p.feldstation',
    kind: 'main',
    era: 'today',
    title_de: 'Der Messstab',
    summary_de: 'Marlene schickt dich in den Wald, aber nicht ohne den Messstab, der am Wegrand lehnt. Unten am Damm steigt Nebel auf, der dich ansieht.',
    giver: { voice: 'marlene' },
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'stab', type: 'collect', text_de: 'Den Messstab nehmen: er lehnt am Wegrand (hingehen, E)' },
      { id: 'nebel', type: 'kill', count: 3, text_de: 'Unten am Damm: drei Nebelinge vertreiben (Klick oder K)' },
    ],
    history: [
      {
        speaker: 'marlene',
        text: 'Der Laserscan ist vom Winter 2025, ohne Laub an den Bäumen. Seit Januar sind die Daten frei. Ein Punkt pro Meter, und unter den Bäumen liegt der Boden wie ein Abdruck.',
        fact: 'cx.34',
        sources: [
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LVGL Saarland: Geobasisdaten (DGM1 2025, Open Data)' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht)' },
        ],
      },
      {
        speaker: 'marlene',
        text: 'Und die eine Regel: Wir schauen, wir graben nicht. Der Karlsberg ist ein Bodendenkmal. Wer etwas findet, meldet es.',
        fact: 'cx.35',
        sources: [
          { url: 'https://umwelt-online.de/recht/bau/laender/saarland/dschg18.htm', label: 'Saarländisches Denkmalschutzgesetz' },
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
        ],
      },
    ],
    rewards: { xp: 20, skills: [{ id: 'kartograf', tier: 1 }] },
  },
  {
    chapter: 'prolog',
    id: 'q.p.relief',
    kind: 'main',
    era: 'today',
    title_de: 'Was der Wald verbirgt',
    summary_de: 'Marlene will wissen, was unter dem Wald liegt. Erst der Damm am Weiher, dann der Weg hinauf bis zur großen Stufe im Wald. Der Laserscan zeigt, was die Bäume verdecken.',
    giver: { voice: 'marlene' },
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'damm', type: 'reach', text_de: 'Zum Damm am Karlsbergweiher' },
      { id: 'mauer', type: 'examine', text_de: 'Am Damm: Taste 2 (Lokales Relief) drücken, dann zur Markierung gehen' },
      { id: 'nebel', type: 'kill', count: 1, text_de: 'Aus der Mauer kriecht Nebel: mit dem Stab vertreiben (Klick oder K)' },
      { id: 'stufe', type: 'reach', text_de: 'Den Waldweg hinauf nach Osten: die hohe Stufe im Wald (dort Taste 3)' },
    ],
    history: [
      {
        speaker: 'marlene',
        text: 'Gerade Kanten, rechte Winkel, schmale Rücken, die sich nicht nach dem Gelände richten: Das sind Fundamente. Der Wald wächst drüber, aber er biegt sie nicht.',
        fact: 'rm.07',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht)' },
        ],
      },
      {
        speaker: 'marlene',
        text: 'Und der Weiher ist kein Naturteich. Ein gerader Damm quer zum Tal, dahinter eine glatte Fläche: Der Scan findet auf Wasser keine Punkte und füllt es flach.',
        fact: 'rm.08',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht)' },
        ],
      },
    ],
    rewards: { xp: 80, items: [{ item: 'item.balsam', count: 2 }] },
  },
  {
    chapter: 'prolog',
    id: 'q.p.quelle',
    kind: 'main',
    era: 'today',
    title_de: 'Wasser, das sich erinnert',
    summary_de: 'Laub hört Wasser, das sich erinnert. Unten im Hang, wo der Karlsbergbach entspringt, liegt die Karlsbergquelle. Er will, dass du die Hand hineinhältst. Was dann passiert, sagt er nicht.',
    giver: { voice: 'laub'},
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'quelle', type: 'reach', text_de: 'Den Hang hinunter zur Karlsbergquelle' },
      { id: 'beruehren', type: 'event', text_de: 'Am Trog: E – das Wasser berühren' },
      { id: 'heim', type: 'event', text_de: 'Q gedrückt halten: zurück ins Heute' },
    ],
    history: [
      {
        speaker: 'laub',
        text: 'Die Karlsbergquelle liegt am Fuß eines Hangs, in einer kleinen Rinne zwischen Orangerie und Weiher. Hier beginnt der Karlsbergbach. Wer sie gefasst hat und wann, weiß ich nicht. Ich habe nur die Höhe gemessen.',
        fact: 'cx.41',
        sources: [
          { url: 'https://www.openstreetmap.org/node/368031320', label: 'OpenStreetMap: Karlsbergquelle (natural=spring) und Karlsbergbach' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Quellmulde bei 1061/−835' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Dass Wasser sich erinnert, steht in keinem Handbuch. Und die Brunnenstube von 1789, die Sie gesehen haben, die hat sich das Spiel ausgedacht. Im Codex steht es.',
        fact: 'cx.42',
      },
    ],
    rewards: { xp: 30 },
  },
  {
    chapter: 'prolog',
    id: 'q.p.bussole',
    kind: 'main',
    era: 'today',
    title_de: 'Die Bussole spricht',
    summary_de: 'Laub, verschollen seit 1840 und neuerdings in einer Bussole, will seine alten Messpunkte noch einmal ablaufen: den Ehrenhof, den Hohlweg, die runde Grube im Osten. Er zeigt, du läufst.',
    giver: { voice: 'laub'},
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'ehrenhof', type: 'examine', text_de: 'Zum Ehrenhof, in die Mitte der Lichtung: dort Taste 2 (Lokales Relief)' },
      { id: 'karte', type: 'examine', text_de: 'M: Laubs Karte von 1840 über den Ehrenhof legen' },
      { id: 'hohlweg', type: 'examine', text_de: 'Zum Hohlweg westlich des Schlosses: dort Taste 2 (Lokales Relief)' },
      { id: 'grube', type: 'examine', text_de: 'Zur runden Grube östlich des Schlosses: dort Taste 3 (VAT)' },
      { id: 'nebel', type: 'kill', count: 4, text_de: 'Nebelinge aus der Grube zurückschlagen' },
    ],
    history: [
      {
        speaker: 'laub',
        text: 'Der Ehrenhof liegt auf 344,8 Metern, in den Hang geschnitten, an drei Seiten gerade Kanten. Dort standen das Corps de logis und die beiden Flügel. Geblieben ist die Fläche.',
        fact: 'cx.01',
        sources: [
          { url: 'https://www.homburg.de/media/scllyew0/schlossbergtour.pdf', label: 'Stadt Homburg: Faltblatt Schlossbergtour' },
          { url: 'https://de.wikipedia.org/wiki/Schloss_Karlsberg', label: 'de.wikipedia: Schloss Karlsberg' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Merkmal KB-01' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Merken Sie sich das Muster: eine ebene Fläche mit geraden Kanten, an einer Seite in den Hang geschnitten, an der anderen aufgeschüttet. Eine Terrasse. Forstwege machen Kehren, keine rechten Winkel.',
        fact: 'rm.01',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht)' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Mein Blatt ist ein bayerisches Positionsblatt von 1836 bis 41, „Ruine Carlsberg“ steht darauf. Auf der heutigen Fassung liegt das Schloss fünfzig Meter zu weit im Osten. Ich lege Wert auf die Feststellung: nicht meinetwegen.',
        fact: 'cx.33',
        sources: [
          { url: 'https://geoportal.saarland.de/mapbender/php/mod_showMetadata.php?languageCode=de&resource=wms&id=2597', label: 'Geoportal Saarland: WMS Historische Karten (dl-de/by-2-0)' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Abschnitt 1 Nr. 8' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Der Hohlweg: Karren, Hufe, Regen, ein paar Jahrhunderte. Zweihundertneunundvierzig Meter, schnurgerade nach Norden, keinem Bach nach.',
        fact: 'rm.04',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Merkmale KB-10, KB-11' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Und die Grube mit dem Ringwall war ein Keller, dessen Gewölbe nachgegeben hat. Der Lageplan schreibt Eiskeller. Zehn mal zehn Meter, einsfünfundachtzig tief.',
        fact: 'rm.02',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Merkmal KB-50' },
        ],
      },
    ],
    rewards: { xp: 95, items: [{ item: 'item.balsam', count: 2 }] },
  },
  {
    chapter: 'prolog',
    id: 'q.p.punktwolke',
    kind: 'main',
    era: '1789',
    title_de: 'Spuren in der Punktwolke',
    summary_de: 'In der Punktwolke vom Februar laufen Abdrücke quer über den Ehrenhof. Der Wald war gesperrt. Marlene will wissen, was da gelaufen ist; Laub weiß es und sagt es nicht. Am Ehrenhof erinnert sich das Land, wenn man Q drückt.',
    giver: { voice: 'marlene' },
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'wolke', type: 'examine', text_de: 'Die Punktwolke auf dem Tablet ansehen' },
      { id: 'wechsel', type: 'reach', text_de: 'In der Mitte des Ehrenhofs: Q – Zeitsprung in den Sommer 1789' },
      { id: 'echo', type: 'echo', text_de: 'Zuhören: der Hof von 1789' },
      { id: 'streuner', type: 'kill', count: 1, text_de: 'Den Streuner bannen (Bannlicht: rechte Maustaste / G) und zurückschlagen' },
      { id: 'heim', type: 'event', text_de: 'Q halten: zurück ins Heute' },
    ],
    history: [
      {
        speaker: 'laub',
        text: 'Das Schloss, das Sie gesehen haben, gehörte Karl dem Zweiten August. Er regierte Pfalz-Zweibrücken von 1775 bis 1795. Ein Diplomat nannte ihn finster und eigensinnig und gestand ihm Sinn für Rang und Pflicht zu.',
        fact: 'cx.03',
        sources: [
          { url: 'https://de.wikipedia.org/wiki/Karl_II._August', label: 'de.wikipedia: Karl II. August' },
          { url: 'https://de.wikisource.org/wiki/ADB:Karl_II._(Herzog_von_Pfalz-Zweibr%C3%BCcken)', label: 'ADB: Karl II. (Herzog von Pfalz-Zweibrücken)' },
        ],
      },
      {
        speaker: 'laub',
        text: 'In den Dörfern erzählt man von einer Wilden Jagd, die in den Rauhnächten über den Himmel reitet. Mit dem Herzog verbindet sie keine Quelle. Die Hunde, die Sie hören, sind meine Sorge, nicht die der Historiker.',
        fact: 'cx.36',
        sources: [
          { url: 'https://de.wikipedia.org/wiki/Wilde_Jagd', label: 'de.wikipedia: Wilde Jagd' },
        ],
      },
      {
        speaker: 'laub',
        text: 'Damit wir uns verstehen: Mich gibt es nicht, die Meute nicht und die Nebelinge auch nicht. Den Herzog, das Schloss und die Schulden gab es. Im Codex steht, was erfunden ist.',
        fact: 'cx.38',
      },
    ],
    rewards: { xp: 105, items: [{ item: 'item.lampenoel' }] },
  },
  {
    chapter: 'prolog',
    id: 'q.p.meiler',
    kind: 'side',
    era: 'today',
    title_de: 'Kohlplatten',
    summary_de: 'Unterhalb der Orangerie haben Köhler gearbeitet. Ihre Kohlplatten sind im Relief runde, flache Teller am Hang. Marlene will an dreien einen Messpunkt. Anfassen, mitnehmen: nein.',
    giver: { voice: 'marlene' },
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'platte1', type: 'reach', text_de: 'Kohlplatte 1 von 3: Messpunkt setzen (VAT)' },
      { id: 'platte2', type: 'reach', text_de: 'Kohlplatte 2 von 3: Messpunkt setzen (VAT)' },
      { id: 'platte3', type: 'reach', text_de: 'Kohlplatte 3 von 3: Messpunkt setzen (VAT)' },
    ],
    history: [
      {
        speaker: 'marlene',
        text: 'Ein Meilerplatz ist ein runder, fast ebener Teller am Hang, acht bis fünfzehn Meter breit, mit einer kleinen Stufe nach unten. Gräbt man, ist die Erde schwarz. Graben tun wir aber nicht.',
        fact: 'rm.03',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
        ],
      },
    ],
    rewards: { xp: 50, items: [{ item: 'item.lampenoel' }] },
  },
  {
    chapter: 'prolog',
    id: 'q.p.trichter',
    kind: 'side',
    era: 'today',
    title_de: 'Nicht anfassen',
    summary_de: 'Westlich des Schlosses ist im Scan ein Trichter, der da nicht hingehört. Marlene will wissen, wo genau. Vom Rand aus. Nicht hineingehen, nichts anfassen, melden.',
    giver: { voice: 'marlene' },
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'finden', type: 'reach', text_de: 'Den Trichter im Wald finden (nur bis zum Rand)' },
      { id: 'melden', type: 'manual', text_de: 'Marlene über Funk Bescheid geben' },
    ],
    history: [
      {
        speaker: 'marlene',
        text: 'Bombentrichter sind rund, mit einem unregelmäßigen Wall, meist in Gruppen. Aus dem letzten Krieg. Wo Trichter sind, kann noch Munition liegen.',
        fact: 'rm.06',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
        ],
      },
      {
        speaker: 'marlene',
        text: 'Darum: nicht betreten, nicht graben, melden. Das gilt für Munition und für Mauern. Beides gehört nicht dir.',
        fact: 'cx.35',
        sources: [
          { url: 'https://umwelt-online.de/recht/bau/laender/saarland/dschg18.htm', label: 'Saarländisches Denkmalschutzgesetz' },
        ],
      },
    ],
    rewards: { xp: 40 },
  },
  {
    chapter: 'prolog',
    id: 'q.p.irrlichter',
    kind: 'side',
    era: 'today',
    title_de: 'Lichter am Weiher',
    summary_de: 'Über dem Damm des Karlsbergweihers schweben Lichter, im November. Laub sagt: erst das Bannlicht drauf, dann der Stab. In dieser Reihenfolge.',
    giver: { voice: 'laub'},
    turnin: 'auto',
    offer: [],
    objectives: [
      { id: 'lichter', type: 'kill', count: 3, text_de: 'Irrlichter am Damm: erst Bannlicht (Rechtsklick oder G), dann zuschlagen' },
    ],
    history: [
      {
        speaker: 'laub',
        text: 'Den Weiher hat man aufgestaut, mit einem geraden Damm quer zum Tal. Ein Naturteich hätte keine Kante. Dieser hat eine, und ich habe sie 1840 vermessen.',
        fact: 'rm.08',
        sources: [
          { url: 'https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', label: 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald' },
          { url: 'https://www.shop.lvgl.saarland.de/', label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht); Merkmale KB-40, KB-42' },
        ],
      },
    ],
    rewards: { xp: 50, items: [{ item: 'item.lampenoel', count: 2 }] },
  },
];
