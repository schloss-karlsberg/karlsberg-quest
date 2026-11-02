import { clue, noun, say, seq, hints, src, write, Z, P } from './common.mjs';

const ch = 'k1';
const E = '1789';
const REG = 'B03.1.eg-registratur';
const PFS = 'B10.1.s-pfeilersaal';
const ZW = [1177, -1571]; // west side of the Zwinger (KB-B23 is a solid walled court), on the Allee
const AMPH = [1935, 87];
const RONDELL = [1815, 348];

/**
 * Placement inside the rooms and props (k1 wiring, story 01-kapitel-1.story.json): the room clues
 * sit on their own spot of the room (desk, shelf, drawer) instead of the room centre, far enough
 * from Soll (≥ 4.3 m) that E never means both "talk" and "examine". `prop` picks the 3D object.
 */
// (the Mannlich echoes stand by the east windows: the Pfeiler run down the middle of the hall)
const at = (c, x, z, r, extra = {}) => ({ ...c, ...extra, where: { ...c.where, x, z, radius: r } });

const PROPS = { 'clue.k1.baerenkaesten': 'chest', 'clue.k1.seite': 'paper' };

const clues = [
  // Teil A – am Schloss
  at(clue('clue.k1.wache', {
    title: 'Erinnerung: Die Wache am Gitter', kind: 'echo', at: [1199, -1115], r: 12, era: E, anchor: 'KB-B39', chapter: ch, fiction: true,
    text: 'Die Wache am Ehrenhofgitter, automatisch beim Betreten.', nouns: ['n.herzog'],
  }), 1201, -1115, 12, { auto: true }),
  clue('clue.k1.fluegel', {
    title: 'Blick auf die Flügel', kind: 'dialogue', at: [1222, -1116], r: 20, era: E, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Vom Ehrenhof nach Osten: rechts der Südflügel der Herzogin, links der Nordflügel des Herzogs, dazwischen der Hof.',
    nouns: ['n.herzogin'],
  }),
  at(clue('clue.k1.rechenbrett', {
    title: 'Das Rechenbrett', kind: 'object', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Eine Schiefertafel mit drei Zahlen in Kreide, ohne Beschriftung: „35 000“, „800 000“, „14 000 000“. Beim dritten steht ein Fragezeichen.',
    nouns: ['n.zahl_35000', 'n.zahl_800000', 'n.zahl_14mio'],
  }), 1204.1, -1155, 1.3, { prop: 'tablet' }),
  at(clue('clue.k1.kaufbrief', {
    title: 'Abschrift eines Kaufbriefs', kind: 'document', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: '„Abschrift. Kauf des Louisenhofes auf dem Buchenberg, den 27. Julii 1777: fünfunddreißigtausend Gulden und sechzig neue Louis d’or.“ (Wortlaut erfunden, Inhalt nach de.wikipedia und homburg-im-bild.)',
    nouns: ['n.zahl_35000', 'n.louisdor'], facts: ['cx.02'],
  }), 1205.4, -1151.5, 1.4, { prop: 'paper' }),
  clue('clue.k1.soll_einnahmen', {
    title: 'Die mittlere Zahl', kind: 'dialogue', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Soll erklärt die mittlere Zahl auf dem Rechenbrett.', nouns: ['n.zahl_800000'], req: { clues: ['clue.k1.rechenbrett'] },
  }),
  at(clue('clue.k1.schloezer', {
    title: 'Ein beschlagnahmtes Heft', kind: 'document', room: REG, r: 6, era: E, chapter: ch, fiction: false,
    text: 'Ein Heft der Stats-Anzeigen von 1782. Unterstrichen: „ganz und gar gleichsam ein einziges JagdRevier“ und „ganze Regimenter JagdHunde“.',
    nouns: ['n.jagdrevier'],
  }), 1201.6, -1155.8, 1.2, { prop: 'book' }),
  at(clue('clue.k1.gegenbuch', {
    title: 'Das graue Buch', kind: 'object', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Ein dünnes Buch in grauem Pappband unter dem Hauptbuch. Auf der ersten Seite steht „Was der Hof schuldig blieb“, dieselbe Überschrift wie auf der Seite in der Bussole. Soll klappt es zu: „Das ist privat.“',
    flags: ['flag.k1_gegenbuch_gesehen'],
  }), 1202.9, -1155.7, 1.2, { prop: 'book' }),
  clue('clue.k1.soll', {
    title: 'Gespräch mit dem Kanzlisten', kind: 'dialogue', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Kanzlist Gottlob Soll zwischen Regalen, Ärmelschoner, zählt.', nouns: ['n.minister', 'n.r_creuzer'],
  }),
  clue('clue.k1.hanne', {
    title: 'Gespräch mit Hanne', kind: 'dialogue', at: [1287, -1228], r: 20, era: E, anchor: 'KB-B07', chapter: ch, fiction: true,
    text: 'Am Ostende der neuen Galerie wird gebaut: Bauhütte, Steinstaub, Gerüst. Hanne steht hier jeden Morgen.',
    nouns: ['n.zwei_tage', 'n.eine_woche', 'n.r_will_nicht', 'n.gulden'], facts: ['cx.09'],
  }),
  at(clue('clue.k1.zeichen', {
    title: 'Ein Steinmetzzeichen', kind: 'object', at: [1262, -1218], r: 3, era: E, anchor: 'KB-B06', chapter: ch, fiction: true,
    text: 'An einem Quader am Fuß der Galerie ein eingehauenes Zeichen: offener Winkel, darunter drei Punkte. (Erfundenes Steinmetzzeichen.) Wandernde Steine 1/4.',
    flags: ['flag.stein_1'],
  }), 1262, -1218.5, 2.5, { prop: 'stone' }),
  at(clue('clue.k1.festplan', {
    title: 'Mannlichs Festpläne von 1785', kind: 'document', room: PFS, r: 10, era: E, chapter: ch, fiction: false,
    text: 'Drei Blätter: „Plan d[e] la foire executé au d[ecem]bre 1785 au Carlsberg / Mannlich“. Ein Blatt zeigt den Orangeriehof mit Buden im Kreis („Jahrmarkt in Venedig“). Das zweite zeigt die Karlslust oberhalb der Großen Kaskade, mit einem Vulkan hinter der Kaskade, dem Hymentempel und dem Volk auf Stufen am Hang. Das dritte zeigt den Hofgarten in Zweibrücken. Am Rand des zweiten Blattes: „Feuerwerk in drei Abteilungen, durch Zwischenräume getrennt.“',
    nouns: ['n.orangeriehof', 'n.karlslust', 'n.zweibruecken', 'n.drei_abteilungen', 'n.vulkan', 'n.kaskade'], facts: ['cx.15'],
  }), 1243.6, -970.5, 1.6, { prop: 'scroll' }),
  clue('clue.k1.feenschloss', {
    title: 'Ein „Feen-Schloß“', kind: 'dialogue', room: PFS, r: 10, era: E, chapter: ch, fiction: false,
    text: 'Laub beim Blick in den Pfeilersaal.', nouns: ['n.feenschloss'],
  }),
  at(clue('clue.k1.mannlich', {
    title: 'Erinnerung: Mannlichs Bauliste', kind: 'echo', room: PFS, r: 10, era: E, chapter: ch, fiction: true,
    text: 'E halten. Mannlich als Silhouette am Fenster, ruhig, ein wenig müde. Zitate aus seinen Lebenserinnerungen.',
    nouns: ['n.baudirektor', 'n.tausend', 'n.sechshundert'], facts: ['cx.04'],
  }), 1245.4, -958.5, 3.5),
  at(clue('clue.k1.mannlich_lohn', {
    title: 'Erinnerung: Der unbezahlte Lohn', kind: 'echo', room: PFS, r: 10, era: E, chapter: ch, fiction: true,
    text: 'Zweites E halten. Mannlich über den Herzog und die Untergebenen, „denen man ihren Lohn nicht bezahlte“.',
    nouns: ['n.r_getaeuscht'], req: { clues: ['clue.k1.mannlich'] },
  }), 1245.4, -958.5, 3.5),
  clue('clue.k1.jost', {
    title: 'Gespräch mit Jost', kind: 'dialogue', at: ZW, r: 12, era: E, anchor: 'KB-B23', chapter: ch, fiction: true,
    text: 'Hinter dem Marstall bellt es aus einem ummauerten Hof. Der Hundejunge Jost füttert.',
    nouns: ['n.tausend', 'n.zweihundert', 'n.ein_tag', 'n.r_hunde_bilder'],
  }),
  clue('clue.k1.gagern', {
    title: 'Gagern über den Zwinger', kind: 'dialogue', at: ZW, r: 12, era: E, anchor: 'KB-B23', chapter: ch, fiction: false,
    text: 'Laub zitiert Hans Christoph von Gagern.', nouns: ['n.thiergarten'], facts: ['cx.37'],
  }),
  // Teil B – Karlslust
  clue('echo.k1.mannlich_menagerie', {
    title: 'Erinnerung: Die Menagerie', kind: 'echo', at: AMPH, r: 42, era: E, anchor: 'KL-B40', chapter: ch, fiction: true,
    text: 'E halten am Amphitheater. Mannlich erinnert sich an einen Rundgang mit dem Herzog.', nouns: ['n.amphitheater'],
  }),
  // counted on a walk around the Rund (story k1_9): Laub keeps the tally, so it is his line
  clue('clue.k1.amphitheater', {
    title: 'Die Häuschen im Rund', kind: 'dialogue', at: AMPH, r: 42, era: E, anchor: 'KL-B40', chapter: ch, fiction: false,
    text: 'Häuschen zählen: Neunzehn kleine Häuser mit Schieferdach im Kreis um einen Wassergraben, in der Mitte eine Insel mit Pavillon. (19 Häuser nach Saarpfalz-Touristik; Form nach Katalog KL-B40, Hypothese.)',
    nouns: ['n.neunzehn', 'n.amphitheater'],
  }),
  clue('clue.k1.insel', {
    title: 'Die Insel', kind: 'dialogue', at: AMPH, r: 42, era: E, anchor: 'KL-B41', chapter: ch, fiction: false,
    text: 'Blick zur Insel mit dem Pavillon.', nouns: ['n.insel'],
  }),
  // at the foot of the lowest terrace wall (the terraces KL-B43 are one solid block in the model)
  clue('clue.k1.baerenkaesten', {
    title: 'Die Bären-Kästen', kind: 'object', at: [1958, 146], r: 4, era: E, anchor: 'KL-B43', chapter: ch, fiction: false,
    text: 'Am Fuß der Terrassenmauer, hinaufgezogen auf die erste Stufe: mehrere Kästen aus Eisen mit Gittertür. An der Außenseite jedes Kastens sitzt eine kleine Feuerluke. (Eiserne „Bären-Kästen“, 1786, von außen beheizt; nach Saarpfalz-Touristik.)',
    nouns: ['n.herzogsterrassen'],
  }),
  clue('clue.k1.kasuar', {
    title: 'Der Kasuar', kind: 'object', at: [1966, 92], r: 8, era: E, anchor: 'KL-B40', chapter: ch, fiction: false,
    text: 'Ein großer schwarzer Vogel mit blauem Hals und einem Helm auf dem Kopf starrt dich an und weicht keinen Schritt. (Optional; Sammlung „Tiere der Menagerie“.)',
    flags: ['flag.tier_kasuar'],
  }),
  clue('clue.k1.feuerwerk', {
    title: 'Erinnerung: Das Feuerwerk', kind: 'echo', at: RONDELL, r: 20, era: E, anchor: 'TF-36', chapter: ch, fiction: true,
    echoDate: '19. Dezember 1785',
    text: 'E halten am Rondell. Der Sommer wird zu Winter, Lämpchen am Hang, eine Menge ist zu hören, aber nicht zu sehen. Keine Bilder von Verletzten, keine Stimme der Opfer. Gedenkort: sichere Zone, solange das Echo läuft. (Enthält auch clue.k1.kanonen.)',
    nouns: ['n.einziges_geruest', 'n.karlslust', 'n.zwoelf'], facts: ['entry.k1.gedenk'],
  }),
  clue('clue.k1.seite', {
    title: 'Eine Chronikseite auf den Stufen', kind: 'document', at: [1811, 363], r: 4, era: E, anchor: 'KL-B49', chapter: ch, fiction: true, lantern: true,
    text: 'Eine Chronikseite. Oben in großer, ungelenker Schrift: „Diane. Sultan. Fanfare. Rauhreif. Bijou.“ Darunter in feiner Kanzleischrift: „Hanne, Witwe des Steinhauers Matthes. Lohn: offen.“ Sobald man sie aufhebt, bläst das Horn zweimal kurz.',
    flags: ['flag.k1_seite'], req: { clues: ['clue.k1.feuerwerk'] },
  }),
].map((c) => (PROPS[c.id] ? { ...c, prop: PROPS[c.id] } : c));

const nouns = [
  noun('n.herzog', 'der Herzog', 'person'),
  noun('n.minister', 'der Minister', 'person'),
  noun('n.herzogin', 'die Herzogin', 'person'),
  noun('n.baudirektor', 'der Baudirektor', 'person'),
  noun('n.zwei_tage', 'zwei Tage', 'time'),
  noun('n.eine_woche', 'eine Woche', 'time'),
  noun('n.ein_tag', 'einen Tag', 'time'),
  noun('n.zahl_14mio', '14 Millionen', 'other'),
  noun('n.zahl_35000', '35 000', 'other'),
  noun('n.zahl_800000', '800 000', 'other'),
  noun('n.tausend', 'tausend', 'other'),
  noun('n.sechshundert', 'sechshundert', 'other'),
  noun('n.zweihundert', 'zweihundert', 'other'),
  noun('n.jagdrevier', 'JagdRevier', 'object'),
  noun('n.thiergarten', 'Thiergarten', 'object'),
  noun('n.feenschloss', 'Feen-Schloß', 'object'),
  noun('n.neunzehn', '19', 'other'),
  noun('n.zwoelf', 'zwölf', 'other'),
  noun('n.herzogsterrassen', 'den Herzogsterrassen', 'place'),
  noun('n.amphitheater', 'dem Amphitheater', 'place'),
  noun('n.insel', 'der Insel', 'place'),
  noun('n.karlslust', 'Karlslust', 'place'),
  noun('n.orangeriehof', 'Orangeriehof', 'place'),
  noun('n.zweibruecken', 'Zweibrücken', 'place'),
  noun('n.einziges_geruest', 'ein einziges Gerüst', 'action'),
  noun('n.drei_abteilungen', 'drei getrennte Abteilungen', 'action'),
  noun('n.vulkan', 'den Vulkan', 'action'),
  noun('n.kaskade', 'die Kaskade', 'action'),
  noun('n.r_will_nicht', 'der Herzog nicht zahlen will', 'cause'),
  noun('n.r_creuzer', 'der Präsident die Kassen geleert hat', 'cause'),
  noun('n.r_hunde_bilder', 'das Geld in Hunde und Bilder geht', 'cause'),
  noun('n.r_getaeuscht', 'man den Herzog täuschte', 'cause'),
  noun('n.gulden', 'Gulden', 'object'),
  noun('n.louisdor', 'Louis d’or', 'object'),
];

const fact = (id, factId, text, b) => ({ id, kind: 'fact', factId, text_de: text, blanks: [b] });
const cases = [{
  id: 'case.k1',
  title_de: 'Der Hof',
  intro_de: 'Warum bekommt Hanne den Lohn ihres Mannes nicht?',
  entries: [
    fact('entry.k1.1', 'cx.11', 'Nur {wer} durfte zum Schloss hinauffahren; alle anderen gingen zu Fuß.',
      { id: 'wer', category: 'person', correct: 'n.herzog', accepts: ['n.herzog', 'n.minister', 'n.herzogin', 'n.baudirektor'] }),
    fact('entry.k1.2', 'cx.08', 'Ein Geselle musste {wielange} arbeiten, um einen Gulden zu verdienen.',
      { id: 'wielange', category: 'time', correct: 'n.zwei_tage', accepts: ['n.zwei_tage', 'n.eine_woche', 'n.ein_tag'] }),
    fact('entry.k1.3', 'cx.07', 'Bau und Betrieb des Karlsbergs kosteten fast {wieviel} Gulden; das ganze Land nahm im Jahr etwa 800 000 ein.',
      { id: 'wieviel', category: 'other', correct: 'n.zahl_14mio', accepts: ['n.zahl_14mio', 'n.zahl_35000', 'n.zahl_800000'] }),
    fact('entry.k1.4', 'cx.06', 'Mannlich sollte einen Zwinger für {wieviel} Hunde bauen.',
      { id: 'wieviel', category: 'other', correct: 'n.tausend', accepts: ['n.tausend', 'n.sechshundert', 'n.zweihundert'] }),
    fact('entry.k1.5', 'cx.05', 'Eine Zeitschrift nannte das Land 1782 ‚{was}‘.',
      { id: 'was', category: 'object', correct: 'n.jagdrevier', accepts: ['n.jagdrevier', 'n.thiergarten', 'n.feenschloss'],
        labels_de: { 'n.jagdrevier': 'ein einziges JagdRevier', 'n.thiergarten': 'ein einziger Thiergarten', 'n.feenschloss': 'ein einziges Feen-Schloß' } }),
    fact('entry.k1.6', 'cx.12', 'Die Tiere der Menagerie lebten in {wieviel} kleinen Häusern im Kreis um einen Wassergraben.',
      { id: 'wieviel', category: 'other', correct: 'n.neunzehn', accepts: ['n.neunzehn', 'n.zwoelf', 'n.tausend'] }),
    fact('entry.k1.7', 'cx.13', 'Die eisernen Bären-Kästen von 1786 standen auf {wo}.',
      { id: 'wo', category: 'place', correct: 'n.herzogsterrassen', accepts: ['n.herzogsterrassen', 'n.amphitheater', 'n.insel'] }),
    fact('entry.k1.8', 'cx.14', 'Im Dezember 1785 explodierte das Feuerwerk {wo}.',
      { id: 'wo', category: 'place', correct: 'n.karlslust', accepts: ['n.karlslust', 'n.orangeriehof', 'n.zweibruecken'],
        labels_de: { 'n.karlslust': 'in der Karlslust', 'n.orangeriehof': 'im Orangeriehof', 'n.zweibruecken': 'in Zweibrücken' } }),
    fact('entry.k1.9', 'cx.14', 'Gegen den Rat des Feuerwerkers lagen alle Raketen auf {wie}.',
      { id: 'wie', category: 'action', correct: 'n.einziges_geruest', accepts: ['n.einziges_geruest', 'n.drei_abteilungen', 'n.vulkan', 'n.kaskade'],
        labels_de: { 'n.einziges_geruest': 'einem einzigen Gerüst', 'n.drei_abteilungen': 'drei getrennten Abteilungen', 'n.vulkan': 'dem Vulkan', 'n.kaskade': 'der Kaskade' } }),
    { id: 'entry.k1.10', kind: 'reading', flag: 'flag.k1_lohn', text_de: 'Hanne bekommt den Lohn ihres Mannes nicht, weil {warum}.',
      blanks: [{ id: 'warum', accepts: ['n.r_will_nicht', 'n.r_creuzer', 'n.r_hunde_bilder', 'n.r_getaeuscht'] }] },
  ],
}];

// Gedenkzeile: not a puzzle; a fact shown as a fixed line on the k1 case page (revealed by the echo).
const facts = [{
  id: 'entry.k1.gedenk',
  title_de: 'Gedenkzeile: 19. Dezember 1785',
  text_de: 'Am 19. Dezember 1785 explodierte in der Karlslust das Feuerwerk zur Hochzeit des Prinzen Max. Nach Mannlichs Bericht traf es Major Magnier und elf seiner Arbeiter. Der Major starb; von den Arbeitern lebten zwei schwer verbrannt, für zwei weitere bestand keine Hoffnung. Die Namen der Arbeiter sind nicht überliefert.',
  confidence: 'D', fiction: false,
  sources: [src('M1910', 'S. 391 f.'), src('WP-SK', '„mehrere Menschen“')],
  tags: ['gedenkzeile', 'case:case.k1', 'label:FAKT', 'see:cx.14'],
  licence: 'eigener Text',
}];

const beat = (b, x = {}) => ({ event: 'story:beat', chapter: ch, beat: b, ...x });
const found = (id, x = {}) => ({ event: 'clue:found', id, ...x });
const talk = (npc, topic) => ({ event: 'npc:talk', npc, chapter: ch, topic });
const echo = (id) => ({ event: 'echo:start', id });

const dialogue = [
  // Echo Wache
  ...seq(echo('clue.k1.wache'), [
    ['echo.k1.wache.01', 'wache', 'Absteigen! Hinauf fährt nur Serenissimus.', [src('RLS', 'P')]],
    ['echo.k1.wache.02', 'wache', 'Und der fährt auch nur, wenn er nicht gerade jagt.'],
  ]),
  // Soll
  say('soll.k1.01', 'soll', 'Nicht stören. Ich bin bei den Millionen.', talk('soll', 'greet'), { once: true }),
  say('soll.k1.02', 'soll', 'Matthes, Steinhauer, Galerieflügel. Lohnrest: angewiesen. Nicht ausgezahlt. Das ist ein großer Unterschied, mein Herr, meine Dame, mein … Sie. Angewiesen heißt, dass jemand will. Ausgezahlt heißt, dass jemand kann.', talk('soll', 'matthes')),
  ...seq(talk('soll', 'warum'), [
    ['soll.k1.03', 'soll', 'Weil die Kasse leer ist. Alle Kassen. Auch die der Witwen und Waisen. Die hat der Herr Präsident Creuzer geleert, um Bilder und Vögel zu kaufen, und als das nicht reichte, hat er die einen mit Versprechungen bezahlt.', [P('S. 377')]],
    ['soll.k1.04', 'soll', 'Und dann ist er bei Nacht verreist. Vorher hat er ein paar Stöße Papier verbrannt und beinahe das Haus angesteckt. Andere hat er in sichere Hände gegeben. (Er sieht auf seine eigenen Hände.) Welche Hände, steht nirgends.', [P('S. 396 f.')]],
  ], { once: false }),
  say('soll.k1.05', 'soll', 'Der Herr Minister fährt auch nicht hinauf. Der wird gefahren. Das ist etwas völlig anderes.', talk('soll', 'minister')),
  say('soll.k1.06', 'soll', 'Nicht anfassen. Die Große ist noch nicht fertig.', found('clue.k1.rechenbrett')),
  say('soll.k1.07', 'soll', 'Achthunderttausend im Jahr. Das ganze Herzogtum. Jedes Dorf, jede Mühle, jeder Zoll. Achthunderttausend.', { ...talk('soll', 'zahl'), hasClue: 'clue.k1.rechenbrett' }, { src: [P('Einl. S. XXXIV (Stollreither)')] }),
  say('soll.k1.schloezer', 'soll', 'Beschlagnahmt. Lesen verboten. Ich lese es jeden Tag, damit ich weiß, was verboten ist.', found('clue.k1.schloezer'), { once: true }),
  say('soll.k1.08', 'soll', 'Das ist privat. (Pause.) Jemand muss ja aufschreiben, was nicht bezahlt wird. Sonst war es nie.', { ...talk('soll', 'graues_buch'), hasClue: 'clue.k1.gegenbuch' }),
  say('soll.k1.09', 'soll', 'Wenn Sie die Witwe sehen: Sagen Sie ihr, es ist angewiesen. Nein. Sagen Sie ihr nichts. Sie weiß es ja.', talk('soll', 'bye')),
  // Hanne
  say('hanne.k1.01', 'hanne', 'Sie sind nicht vom Hof. Sie gucken nicht über mich weg.', talk('hanne', 'greet'), { once: true }),
  ...seq(talk('hanne', 'matthes'), [
    ['hanne.k1.02', 'hanne', 'Mein Mann war Steinhauer. Matthes. Er hat die Quader für die Galerie gehauen, letzten Herbst. Dann ist er vom Gerüst gefallen.'],
    ['hanne.k1.03', 'hanne', 'Zwei Tage hat ein Geselle für einen Gulden geschafft. Zwei Tage. Und den letzten Gulden hat er nie gekriegt.', [src('EN-KC', 'P')]],
  ], { once: false }),
  say('hanne.k1.04', 'hanne', 'Seit einer Woche steh ich hier jeden Morgen. Der Schreiber sagt, es ist angewiesen. Ich sag ihm, ‚angewiesen‘ kann ich nicht essen.', talk('hanne', 'warten')),
  say('hanne.k1.05', 'hanne', 'Die Leute nennen den Berg den Tränenberg. Ob das so heißt, weiß ich nicht. Geweint wird jedenfalls.', talk('hanne', 'berg'), { src: [src('HIB', 'Legende, unbelegt')] }),
  say('hanne.k1.06', 'hanne', 'Weil der Herzog nicht will. Wer tausend Hunde füttern kann, kann einen Steinhauer bezahlen.', talk('hanne', 'warum')),
  say('hanne.k1.07', 'hanne', 'Wenn Sie in die Schreibstube kommen, fragen Sie nach Matthes. Und schauen Sie, ob da einer Namen aufschreibt. Bei unsereins schreibt keiner was auf.', talk('hanne', 'bye')),
  say('hanne.k1.08', 'hanne', 'Das ist seins. Das hat er in jeden Stein gehauen, damit man weiß, wer ihn gemacht hat.', found('clue.k1.zeichen'), { once: true }),
  say('hanne.k1.09', 'hanne', 'Angewiesen. Dann warte ich halt weiter. Warten kann ich. Das zahlt mir auch keiner.', { ...talk('hanne', 'greet'), hasClue: 'clue.k1.soll' }, { once: true, priority: 5 }),
  // Jost
  say('jost.k1.01', 'jost', 'Du bist nicht von hier. Du riechst nach Regen von morgen.', talk('jost', 'greet'), { once: true }),
  say('jost.k1.02', 'jost', 'Die da drin sind keine Schoßhunde, das ist die Meute. Hirschmeute, Saumeute, Hühnerhunde, Spürhunde. Tausend, sagt der Herr Baudirektor. Ich hab nie über zweihundert gezählt, weil ich bei zweihundert immer Hunger krieg.', talk('jost', 'meute'), { src: [P('S. 365')] }),
  say('jost.k1.03', 'jost', 'Im Hof vom Jägerhaus gibt’s eine Bäckerei und eine Metzgerei, nur für die Hunde. Die Steinhauer kriegen Versprechen. Die Hunde kriegen Fleisch. Und die Bilder kriegen Gold drumrum.', talk('jost', 'futter'), { src: [P('Einl. S. XXXIII f. (Molitor)')] }),
  say('jost.k1.04', 'jost', 'Lass die einen Tag hungern, und sie fressen dir den Zwinger auf.', talk('jost', 'hunger')),
  ...seq(talk('jost', 'verstecken'), [
    ['jost.k1.05', 'jost', 'Wenn du das Horn hörst, legst du dich hin. Ganz flach.'],
    ['jost.k1.06', 'jost', 'Nicht rennen. Rennen hören die über den halben Berg. Schleich.'],
    ['jost.k1.07', 'jost', 'Und mach dein Licht aus. Ein Licht im Dunkeln ist für die wie eine Glocke.'],
    ['jost.k1.08', 'jost', 'Durch Wasser verlieren sie dich. Im Hohlweg auch, da liegt die Luft still. Hinter den großen Sandsteinbrocken an den Dämmen sehen sie dich nicht.'],
  ], { once: false }),
  ...seq(talk('jost', 'namen'), [
    ['jost.k1.09', 'jost', 'Das ist Diane, die führt. Sultan, der ist dumm, aber laut. Fanfare. Rauhreif, die Weiße. Und Bijou, der Kleine, der glaubt, er ist ein Hirsch.'],
    ['jost.k1.10', 'jost', 'Der Herzog kennt keinen von denen beim Namen. Er kennt die Zahl. Ich schreib die Namen auf. Der Kanzlist hat mir das Schreiben beigebracht.'],
  ], { once: false }),
  say('jost.k1.11', 'jost', 'Die Meute reißt nicht. Sie stellt. Reißen tut, was danach kommt.', talk('jost', 'stellen')),
  say('jost.k1.12', 'jost', 'Heut Nacht laufen sie in der Karlslust. Wenn du dahin gehst: Bleib am Wasser.', talk('jost', 'bye')),
  // Laub
  say('laub.k1.start', 'laub', '1789. Der Hof auf seiner Höhe. Genießen Sie die Aussicht, sie ist bezahlt. Nicht vom Herzog, aber bezahlt.', beat('1.1'), { once: true, priority: 10 }),
  say('laub.k1.fluegel', 'laub', 'Rechts der Flügel der Herzogin, links der des Herzogs. Dazwischen ein Hof, damit sie sich nicht zufällig begegnen.', found('clue.k1.fluegel'), { once: true }),
  say('laub.k1.registratur', 'laub', 'Eine Registratur. Mein natürlicher Lebensraum. Halten Sie sich an den Mann mit den Ärmelschonern.', beat('1.2'), { once: true }),
  say('laub.k1.gegenbuch', 'laub', 'Haben Sie die Überschrift gesehen? (Pause.) Ich auch.', found('clue.k1.gegenbuch'), { once: true }),
  say('laub.k1.bauplatz', 'laub', 'Die Galerie ist nagelneu und schon wird angebaut. Ein Schloss, das nie fertig wird, ist die teuerste Art, eines zu haben.', beat('1.3'), { once: true, src: [src('SKD', 'Das Schloss wurde nie fertig')] }),
  say('laub.k1.orangerie', 'laub', 'Hier hat der Baudirektor gewohnt. Über den Orangen. Ein Maler, der Ställe bauen musste. Ich mag ihn. Er hat auch nie bekommen, was ihm zustand.', beat('1.4'), { once: true, src: [src('M1910', 'S. 421: Leibrente ab 1791 nicht gezahlt')] }),
  say('laub.k1.feenschloss', 'laub', 'Ein Reisender nennt das alles 1792 ein ‚Feen-Schloß‘. Er hat die Rechnungen nicht gesehen.', found('clue.k1.feenschloss'), { once: true, src: [Z('Einl. S. XXXIV (Knigge)')] }),
  say('laub.k1.gagern', 'laub', 'Ein Herr von Gagern hat es später so aufgeschrieben: ‚tausend Pferde im Marstall, noch mehr Hunde in den Zwingern, das ganze Land ein Thiergarten zum Verderben der Unterthanen!‘ Er war Diplomat. Das ist für einen Diplomaten sehr deutlich.', found('clue.k1.gagern'), { once: true, src: [Z('Einl. S. XXXV (Gagern)')] }),
  ...seq({ event: 'chronik:batch', caseId: 'case.k1', correct: true }, [
    ['laub.k1.flug', 'laub', 'Die Karlslust liegt eine gute Stunde zu Fuß im Süden. Im Heute fliegen Sie. Taste F. Ich hasse es.'],
    ['marlene.k1.flug', 'marlene', 'Die Karlslust? Das ist da, wo heute der Bärenzwinger ist und die Schwanenweiher. Schöne Ecke. Nimm den Überflug, zu Fuß bist du ewig unterwegs.'],
  ]),
  say('marlene.k1.baerenzwinger', 'marlene', 'Die Leute sagen Bärenzwinger. Ob da je Bären drin waren, weiß keiner so genau.', beat('1.6'), { once: true }),
  say('laub.k1.karlslust', 'laub', 'Von hier hat der Hof zugesehen. Im Dezember 1785.', beat('1.7'), { once: true, src: [P('S. 389 ff.: „von dem gegenüberliegenden Pavillon auf dem Berge“')] }),
  say('laub.k1.insel', 'laub', 'Auf der Insel stand ein Pavillon. Seine Grundmauern hat man 2016 wiedergefunden. Ich hätte ihn 1840 finden können, wenn man mich gelassen hätte.', found('clue.k1.insel'), { once: true, src: [src('SPT', 'Fund 2016')] }),
  say('laub.k1.baerenkaesten', 'laub', 'Bären-Kästen. Geheizt von außen, damit der Bär nicht friert und der Heizer nicht gefressen wird. Das ist die einzige Stelle am Hof, an der jemand an alle gedacht hat.', found('clue.k1.baerenkaesten'), { once: true }),
  say('laub.k1.kasuar', 'laub', 'Der Kasuar. Das einzige Lebewesen am Hof, das dem Herzog nicht gehorcht hat. Vermutlich.', found('clue.k1.kasuar'), { once: true }),
  say('laub.k1.nach_rondell', 'laub', 'Mannlich war schon am Fuß des Berges, als es geschah. Er hat das Licht gesehen und es schön gefunden. So steht es bei ihm. Das ist das Schlimmste daran.', beat('1.11-nach'), { once: true, src: [P('S. 391')] }),
  say('laub.k1.ende', 'laub', 'Februar dreiundneunzig. Da rennt einer durch die Nacht. Und hinter ihm bläst jemand zur Jagd.', beat('1.14'), { once: true }),
  // Marlene
  say('marlene.k1.morgen', 'marlene', 'Morgen, {Name}! Brötchen liegen auf der Stufe. Hast du schlecht geschlafen? Du siehst aus, als hättest du die ganze Nacht Rechnungen gelesen.', beat('1.0'), { once: true }),
  say('marlene.k1.abend', 'marlene', 'Du hast ja nasse Füße. Im November. Vom Weiher? Erzähl’s mir morgen.', beat('B-zurueck'), { once: true }),
  // Echos mit Mannlich-Zitaten
  ...seq(echo('clue.k1.mannlich'), [
    ['mannlich.01', 'mannlich', 'Ich hatte also einen Stall für tausend Pferde und eine ungeheure Reitbahn zu ihrer Dressur und Bewegung zu bauen.', [Z('S. 365')]],
    ['mannlich.02', 'mannlich', 'Ich wiegte mich in der Hoffnung, daß der Herzog des Bauens endlich überdrüssig werden würde. Wie sah ich mich aber in meiner Rechnung betrogen!', [Z('S. 365, gekürzt')]],
    ['mannlich.03', 'mannlich', 'Kasernen für sechshundert Gardisten und Wohnungen für die Offiziere mußten errichtet werden; ein Zwinger für tausend Hunde (von den Wölfen abgesehen), die Hirsch- und Wildschweinmeute, Hühner- und Spürhunde, kurz – ohne Übertreibung – für die Hunde aller Erdteile.', [Z('S. 365')]],
  ]),
  ...seq(echo('clue.k1.mannlich_lohn'), [
    ['mannlich.04', 'mannlich', 'Man urteile indes nicht zu ungünstig über den Charakter des Herzogs und lege die Unbesonnenheit, mit der er sich seinen Liebhabereien hingab, nicht als Gefühllosigkeit, Leichtsinn und Grausamkeit gegen seine Untergebenen aus, denen man ihren Lohn nicht bezahlte. Man schmeichelte ihm und täuschte ihn.', [Z('S. 369, gekürzt')]],
    ['laub.k1.mannlich_lohn', 'laub', 'Merken Sie sich das. Der Baudirektor findet, der Herzog sei getäuscht worden. Der Baudirektor wurde vom Herzog bezahlt. Meistens.'],
  ]),
  ...seq(echo('echo.k1.mannlich_menagerie'), [
    ['mannlich.05', 'mannlich', 'Unweit davon erhob sich ein Gebäude, das wie ein antikes Amphitheater aussah und die Vierfüßler und Raubvögel beherbergte.', [Z('S. 384')]],
    ['mannlich.06', 'mannlich', 'Der Herzog führte uns flüchtig an allen Einzelkäfigen vorüber, nur jener mit den Affen hielt uns länger zurück.', [Z('S. 384')]],
  ]),
  ...seq(echo('clue.k1.feuerwerk'), [
    ['mannlich.07', 'mannlich', 'Der Major brachte alle Feuerwerkskörper auf einem einzigen, und zwar dem höchsten Gerüste unter, anstatt sie auf drei zu verteilen.', [P('S. 389')]],
    ['echo.k1.feuerwerk.02', 'feuerwerker', 'Ich möchte nicht dreißig Schritt von diesem Gerüst entfernt sein und es nicht um alles Gold der Welt besteigen.', [Z('S. 389')]],
    ['mannlich.08', 'mannlich', 'Dicht dabei standen nicht weniger als zehn bis zwölf Kanonen.', [Z('S. 390')]],
    ['echo.k1.feuerwerk.04', 'esebeck', 'Bleiben Sie ferne! Ich beschwöre Sie.', [Z('S. 390')]],
    ['echo.k1.feuerwerk.05', 'geraeusch', '[Stille. Dann, wie von weit unten am Berg: Kanonenschüsse, ein Licht, das den ganzen Himmel aufflammen lässt, das Knattern von Raketen.]', [P('S. 391')]],
    ['echo.k1.feuerwerk.06', 'geraeusch', '[Das Licht erlischt. Schnee fällt rückwärts nach oben. Der Sommer kehrt zurück.]'],
  ]),
];

write('kapitel-1', {
  pack: 'kapitel-1',
  facts,
  nouns,
  clues,
  cases,
  dialogue,
  hints: hints('case.k1', ch, [
    'Zahlen lügen nicht, sie sind nur schlecht beschriftet. Wenn Sie drei Zahlen haben und für zwei davon einen Namen, dann gehört die dritte zum Rest. Das ist keine Mathematik, das ist Verwaltung.',
    'Mannlich hat drei Feste geplant, und nur eines ist explodiert. Seine Pläne liegen in der Orangerie. Was in der Karlslust geschah, hören Sie dort, wo die Kaskade oben endet. Gehen Sie leise hin.',
    'Zählen Sie die Häuschen im Rund selbst. Wo die Bären wohnten, sieht man nicht im Rund, sondern weiter oben auf den Terrassen. Und das Jagdrevier steht in einem Zeitschriftenheft von 1782, das der Kanzlist in der Schublade hat. Der Thiergarten ist von Gagern, und der kam später.',
  ]),
});
