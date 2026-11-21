import { writeFileSync } from 'node:fs';
import { clue, noun, say, seq, hints, src, write, Z, P, ROOT } from './common.mjs';

const ch = 'k1';
const E = '1789';
const REG = 'B03.1.eg-registratur';
const PFS = 'B10.1.s-pfeilersaal';
const ZW = [1177, -1571]; // west side of the Zwinger (KB-B23 is a solid walled court), on the Allee
const AMPH = [1935, 87];

/**
 * The disguise opening (docs/IDEAS-ROUND11.md §2, story k1_0b / k1_0c): Liese's Bleiche by the
 * Karlsbergbach (src/systems/bleiche/layout.ts: LIESE, COAT_REACH), the Hofgärtner on the lawn in
 * front of the Orangerie's west front (inside the teaching zone court.orangerie, 1260/−985 r 45;
 * the lawn 1214–1230/−1004…−986 lies at 335.2 m) and his table at its north end (11 m from him, so
 * E there never means "talk").
 */
export const DISGUISE = {
  bleiche: [1001.5, -876.5],
  liese: [1004.85, -870.3],
  coatReach: [1001.08, -880.9],
  // the Mahnbriefe blown out of Liese's linen (the favour): on the meadow north of the green, 21 m
  // from her (her talk bubble must not touch the fight, quests validator ≥ 19.4 m)
  zettel: [998, -890],
  hofgaertner: [1221, -993],
  tisch: [1226, -1003],
};
const DZ = DISGUISE;
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
  // the disguise opening (k1_0b): the coat, the paper, the letter
  clue('clue.k1.rock', {
    title: 'Kaspars Rock', kind: 'object', at: DZ.coatReach, r: 1.4, era: E, chapter: ch, fiction: true,
    text: 'Auf der hinteren Leine, zwischen Laken und Hemden, hängt ein dunkelblauer Rock mit Messingknöpfen, an den Ärmeln etwas zu lang. Liese schaut zum Weg. Hinter der zweiten Leine sieht sie dich nicht. (Fiktion: Liese, Kaspar und sein Rock sind erfunden.)',
    facts: ['cx.46'],
  }),
  clue('clue.k1.papier', {
    title: 'Papier vom Hofgärtner', kind: 'dialogue', at: DZ.hofgaertner, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Der Hofgärtner schreibt Schildchen für die Kübelpflanzen. Papier und Siegellack liegen auf seinem Tisch, und er hat nichts gesehen.',
    facts: ['cx.46'],
  }),
  at(clue('clue.k1.brief', {
    title: 'Ein Brief in fremdem Namen', kind: 'document', at: DZ.tisch, r: 2.5, era: E, chapter: ch, fiction: true,
    text: '„Hochwohlgeborener Herr! Der Hofrat Justus Amsel aus Celle, Verfasser des Werkes ‚Vom Betragen bei Hofe‘, bittet unterthänigst, den Carlsberg besehen zu dürfen, und schickt seinen Sekretär voraus, welcher hiermit namentlich genannt sey.“ Gesiegelt mit grünem Gärtnerwachs. (Wortlaut erfunden, der Hofrat und sein Buch auch. Echt ist die Regel: ohne ausdrückliche Erlaubnis niemand auf den Berg, jeder Begleiter mit Namen; Knigge (Hg.) 1793, S. 26 f.)',
    facts: ['cx.44'], req: { clues: ['clue.k1.papier'] },
  }), ...DZ.tisch, 2.5, { prop: 'paper' }),
  // inside the gitter only (x ≥ 1195 at the gate; the gitter line is at x ≈ 1192.4): the echo never
  // talks over the Musterung outside the gate (k1_0c)
  at(clue('clue.k1.wache', {
    title: 'Erinnerung: Die Wache am Gitter', kind: 'echo', at: [1199, -1115], r: 12, era: E, anchor: 'KB-B39', chapter: ch, fiction: true,
    text: 'Die Wache am Ehrenhofgitter, automatisch beim Betreten.', nouns: ['n.herzog'],
  }), 1203, -1115, 8, { auto: true }),
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
    text: 'Blick zur Insel mit dem Pavillon. (Seine Form folgt den 2016 gefundenen Grundmauern; Hypothese.)', nouns: ['n.insel'],
  }),
  // at the upper edge of the terraces KL-B43 (six rows of animal houses on open ground, no wall)
  clue('clue.k1.baerenkaesten', {
    title: 'Die Bären-Kästen', kind: 'object', at: [1958, 146], r: 4, era: E, anchor: 'KL-B43', chapter: ch, fiction: false,
    text: 'Am oberen Rand der Terrassen, vor der ersten Reihe Tierhäuser: mehrere Kästen aus Eisen mit Gittertür. An der Außenseite jedes Kastens sitzt eine kleine Feuerluke. (Eiserne „Bären-Kästen“, 1786, von außen beheizt; nach Saarpfalz-Touristik.)',
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
    title: 'Eine Chronikseite auf den Stufen', kind: 'document', at: [1811, 363], r: 4, era: E, anchor: 'TF-36', chapter: ch, fiction: true, lantern: true,
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
    ['echo.k1.wache.01', 'wache', 'Absteigen! Ab dem Gitter geht jeder zu Fuß.', [src('RLS', 'P')]],
    ['echo.k1.wache.02', 'wache', 'Und der fährt auch nur, wenn er nicht gerade jagt.'],
  ]),
  // Soll
  say('soll.k1.01', 'soll', 'Nicht stören. Ich bin bei den Millionen.', talk('soll', 'greet'), { once: true }),
  say('soll.k1.02', 'soll', 'Matthes, Steinhauer, Galerieflügel. Lohnrest: angewiesen. Nicht ausgezahlt. Das ist ein großer Unterschied, mein Herr, meine Dame, mein … Sie. Angewiesen heißt, dass jemand will. Ausgezahlt heißt, dass jemand kann.', talk('soll', 'matthes')),
  ...seq(talk('soll', 'warum'), [
    ['soll.k1.03', 'soll', 'Weil die Kasse leer ist. Alle Kassen. Auch die der Witwen und Waisen. Die hat der Herr Präsident Creuzer geleert, um Bilder und Vögel zu kaufen, und als das nicht reichte, hat er die einen mit Versprechungen bezahlt.', [P('S. 377')]],
    ['soll.k1.04', 'soll', 'Und dann ist er bei Nacht verreist. Vorher hat er ein paar Stöße Papier verbrannt und beinahe das Haus angesteckt. Andere hat er in sichere Hände gegeben. Welche Hände, steht nirgends.', [P('S. 396 f.')]],
  ], { once: false }),
  say('soll.k1.05', 'soll', 'Der Herr Minister fährt auch nicht hinauf. Der wird gefahren. Das ist etwas völlig anderes.', talk('soll', 'minister')),
  say('soll.k1.06', 'soll', 'Nicht anfassen. Die Große ist noch nicht fertig.', found('clue.k1.rechenbrett')),
  say('soll.k1.07', 'soll', 'Achthunderttausend im Jahr. Das ganze Herzogtum. Jedes Dorf, jede Mühle, jeder Zoll. Achthunderttausend.', { ...talk('soll', 'zahl'), hasClue: 'clue.k1.rechenbrett' }, { src: [P('Einl. S. XXXIV (Stollreither)')] }),
  say('soll.k1.schloezer', 'soll', 'Beschlagnahmt. Lesen verboten. Ich lese es jeden Tag, damit ich weiß, was verboten ist.', found('clue.k1.schloezer'), { once: true }),
  say('soll.k1.08', 'soll', 'Das ist privat. … Jemand muss ja aufschreiben, was nicht bezahlt wird. Sonst war es nie.', { ...talk('soll', 'graues_buch'), hasClue: 'clue.k1.gegenbuch' }),
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
  say('hanne.k1.09', 'hanne', 'Angewiesen. Dann warte ich halt weiter. Warten kann ich. Das zahlt mir auch keiner.', { ...talk('hanne', 'greet'), flag: 'quest.q.k1.lohn.soll' }, { once: true, priority: 5 }),
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
  // Liese (the Bleiche, k1_0b): the coat by asking, the favour, the coat by taking
  say('liese.k1.01', 'liese', 'Jesses, wie sieht Er denn aus? Wie ein Feuersalamander.', talk('liese', 'greet'), { once: true }),
  say('liese.k1.dank.greet', 'liese', 'Steht Ihm besser als Kaspar. Sag Er keinem, woher.', { ...talk('liese', 'greet'), flag: 'flag.k1_kleid', value: 'geliehen' }, { priority: 5 }),
  say('liese.k1.weg.greet', 'liese', 'Kaspars Rock ist weg. Der Wind war’s, sagt der Wind. Ich sag nichts. Ich wasch.', { ...talk('liese', 'greet'), flag: 'flag.k1_kleid', value: 'genommen' }, { priority: 5 }),
  ...seq(talk('liese', 'rock'), [
    ['liese.k1.02', 'liese', 'Einen Rock? Auf der hinteren Leine hängt Kaspars. Der Lakai liegt seit drei Wochen mit Fieber, der braucht ihn grad nicht.'],
    ['liese.k1.03', 'liese', 'Aber erst helf Er mir. Die Zettel da fliegen mir in die Wäsche, und sie beißen. Wäschelohn: angewiesen. Steht auf allen.'],
  ], { once: false }),
  say('liese.k1.04', 'liese', 'Gebleicht wird in der Sonne. Gießen, wenden, gießen. Für den Hof muss es weißer sein als weiß. Der Herzog sieht’s nicht, aber der Kammerdiener.', talk('liese', 'waesche')),
  say('liese.k1.05', 'liese', 'Kaspar trägt die Schüsseln von der Küche hinauf ins Schloss. Seit er krank ist, trägt sie ein anderer. Den Rock wasch ich ihm, bis er wiederkommt.', talk('liese', 'kaspar')),
  say('liese.k1.bye', 'liese', 'Und tret Er mir nicht aufs Laken.', talk('liese', 'bye')),
  // the Hofgärtner (the Orangerie lawn, the teaching zone): paper and seal wax, no questions
  say('hofgaertner.k1.01', 'hofgaertner', 'Sieh an, Kaspars Rock. Und wer steckt drin? Sag Er’s nicht. Ich will’s nicht wissen.', { ...talk('hofgaertner', 'greet'), flag: 'disguise.coat' }, { once: true }),
  say('hofgaertner.k1.02', 'hofgaertner', 'Er gehört nicht hierher. Das sieht man bis zur Kaskade.', talk('hofgaertner', 'greet'), { priority: -1 }),
  ...seq(talk('hofgaertner', 'papier'), [
    ['hofgaertner.k1.03', 'hofgaertner', 'Papier? Wozu braucht ein Lakai Papier? … Gut. Ich frag nicht.'],
    ['hofgaertner.k1.04', 'hofgaertner', 'Am Tisch da hinten liegt meins, für die Schildchen an den Kübeln. Siegellack auch. Nehm Er sich, was Er braucht. Ich hab nichts gesehen. Ich hab Rasen.'],
  ], { once: false }),
  say('hofgaertner.k1.05', 'hofgaertner', 'Den Rasen betritt der Gärtner. Sonst keiner. Man sieht jeden Fußtritt bis zum Abend.', talk('hofgaertner', 'rasen')),
  say('hofgaertner.k1.bye', 'hofgaertner', 'Und schreib Er schön.', talk('hofgaertner', 'bye')),
  // the watchers at the gitter (after the Musterung they may be talked to; before it, E is the letter)
  say('gardist-tor.k1.01', 'gardist-tor', 'Weiter. Zu Fuß, wenn’s beliebt.', talk('gardist-tor', 'greet'), { once: false }),
  say('gardist.k1.01', 'gardist', 'Nicht stehen bleiben. Hier wird nicht gestanden, hier wird gewacht.', talk('gardist', 'greet'), { once: false }),
  say('lakai.k1.01', 'lakai', 'Ich trag nur. Fragen Sie wen, der was weiß.', talk('lakai', 'greet'), { once: false }),
  // Laub
  say('laub.k1.morgen.quelle', 'laub', 'Sie sind vor Sonnenaufgang los. Ich habe Sie nicht aufgehalten. Der Tropfen von gestern ist über Nacht in der Bussole eingetrocknet, die Nadel zeigt aufs Wasser, nicht auf den Ehrenhof. Ein zweites Mal also. Sie wissen, wie es geht.', beat('1.0'), { once: true }),
  // the disguise opening (k1_0b / k1_0c): spoken by the story (inline say actions with these ids)
  say('laub.k1.brunnenstube', 'laub', 'Sommer 1789. Kies, Hunde, irgendwo eine Geige. Und mittendrin Sie. In Orange.', beat('1.0b'), { once: true }),
  say('laub.k1.fremde', 'laub', 'Der Herzog lässt keine Fremden auf den Berg. Hundert Gardisten an den Türen, schreibt man. Wir brauchen zwei Dinge: einen Rock, der nicht leuchtet, und ein Papier, das jemand anders geschrieben hat. Unten an der Bleiche hängt Wäsche.', beat('1.0b'), { once: true, src: [P('Einl. S. XXXIII (Stollreither: 100 Gardisten)')] }),
  say('laub.k1.bleiche', 'laub', 'Die Bleiche. Die Wäscherin schaut zum Weg, nicht auf die Leine. Hinten herum, hinter der zweiten Leine, sieht sie Sie nicht. Oder Sie fragen sie. Fragen soll auch eine Methode sein.', beat('1.0b-bleiche'), { once: true }),
  say('laub.k1.rock.genommen', 'laub', 'Genommen. Im Dienst der Wissenschaft. Ich trage es ein, unter „geliehen, ohne zu fragen“.', beat('1.0b-rock'), { once: true }),
  say('liese.k1.dank', 'liese', 'Da, nimm Er ihn. Steht Ihm besser als Kaspar. Sag Er keinem, woher, und bring Er ihn mir sauber wieder.', beat('1.0b-rock'), { once: true }),
  say('laub.k1.rock.geliehen', 'laub', 'Ehrlich erworben. Das wird der Hof nie begreifen.', beat('1.0b-rock'), { once: true }),
  say('laub.k1.papier', 'laub', 'Einen Rock haben wir. Jetzt Papier und Siegel. Vor der Orangerie schneidet der Hofgärtner Rasen. Ab da schaut der Hof: langsam gehen, Stab weg. Die hellen Fächer am Boden, das sind Blicke.', beat('1.0b-papier'), { once: true }),
  say('laub.k1.brief', 'laub', 'Wir schreiben im Namen des Hofrats Justus Amsel aus Celle. Er reist, er schreibt Bücher, eins heißt ‚Vom Betragen bei Hofe‘. Sie sind sein Sekretär, vorausgeschickt. Den Hofrat gibt es nicht. Das weiß die Wache nicht. Ich weiß es. Ich sage es nur Ihnen.', beat('1.0b-brief'), { once: true }),
  say('laub.k1.erlaubnis', 'laub', 'Ohne ausdrückliche Erlaubnis des Herzogs kommt keiner hier herauf. Und jeder, der mitkommt, muss mit Namen drinstehen. Also schreiben wir Sie hinein.', beat('1.0b-brief'), { once: true, src: [src('KNIGGE-BRIEFE', 'P · S. 26 f.'), P('S. 355')] }),
  say('laub.k1.umgang', 'laub', 'Ein echtes Buch über den Umgang mit Menschen gibt es schon, vom Freiherrn Knigge, letztes Jahr erschienen. Seinen Namen leihen wir uns nicht.', beat('1.0b-brief'), { once: true, src: [src('ADB-KNIGGE', 'Umgang 1788')] }),
  say('laub.k1.musterung', 'laub', 'Jetzt ruhig. Stab weg, Laterne aus, und stehen bleiben, wenn er schaut. Die Wache liest nicht. Sie schaut aufs Wachs.', beat('1.0c'), { once: true }),
  say('laub.k1.wahrhaftig', 'laub', 'Knigge schreibt, in einer späteren Auflage: ‚Sey ernsthaft, bescheiden, höflich, ruhig, wahrhaftig!‘ Vier von fünf haben wir geschafft.', beat('1.0c-drin'), { once: true, src: [src('KNIGGE-UMGANG-1790', 'Z · Teil 3, Kap. 3, Abschn. 3, S. 53 f.; ob schon in der Ausgabe von 1788: nicht geprüft')] }),
  say('laub.k1.start', 'laub', '1789. Der Hof auf seiner Höhe. Genießen Sie die Aussicht, sie ist bezahlt. Nicht vom Herzog, aber bezahlt.', beat('1.1'), { once: true, priority: 10 }),
  say('laub.k1.fluegel', 'laub', 'Rechts der Flügel der Herzogin, links der des Herzogs. Dazwischen ein Hof, damit sie sich nicht zufällig begegnen.', found('clue.k1.fluegel'), { once: true }),
  say('laub.k1.registratur', 'laub', 'Eine Registratur. Mein natürlicher Lebensraum. Halten Sie sich an den Mann mit den Ärmelschonern.', beat('1.2'), { once: true }),
  say('laub.k1.gegenbuch', 'laub', 'Haben Sie die Überschrift gesehen? … Ich auch.', found('clue.k1.gegenbuch'), { once: true }),
  say('laub.k1.bauplatz', 'laub', 'Die Galerie ist nagelneu und schon wird angebaut. Ein Schloss, das nie fertig wird, ist die teuerste Art, eines zu haben.', beat('1.3'), { once: true, src: [src('SKD', 'Das Schloss wurde nie fertig')] }),
  say('laub.k1.orangerie', 'laub', 'Hier hat der Baudirektor gewohnt. Über den Orangen. Ein Maler, der Ställe bauen musste. Ich mag ihn. Er hat auch nie bekommen, was ihm zustand.', beat('1.4'), { once: true, src: [src('M1910', 'S. 421: Leibrente ab 1791 nicht gezahlt')] }),
  say('laub.k1.feenschloss', 'laub', 'Ein Reisender nennt das alles 1792 ein ‚Feen-Schloß‘. Er hat die Rechnungen nicht gesehen.', found('clue.k1.feenschloss'), { once: true, src: [src('KNIGGE-BRIEFE', 'Z · S. 28 f.; Brief vom 11. Mai [1792], Schreiber ungenannt, Knigge als Herausgeber'), Z('Einl. S. XXXIV (zitiert den Brief)')] }),
  say('laub.k1.gagern', 'laub', 'Ein Herr von Gagern hat es später so aufgeschrieben: ‚tausend Pferde im Marstall, noch mehr Hunde in den Zwingern, das ganze Land ein Thiergarten zum Verderben der Unterthanen!‘ Er war Diplomat. Das ist für einen Diplomaten sehr deutlich.', found('clue.k1.gagern'), { once: true, src: [Z('Einl. S. XXXV (Gagern)')] }),
  // spoken by the story on the way home after the Zwinger (k1_6); the Chronik batches are gone
  ...seq(beat('1.5-flug'), [
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
  // spoken by the story at the spring (k1_0, inline say actions with these ids; the '1.x' beat triggers never fire, as for laub.k1.start)
  say('marlene.k1.morgen.quelle', 'marlene', 'Morgen, {Name}! Du bist ja schon weg. Die Brötchen liegen auf der Stufe. Ich ess deins, wenn du nicht bald zurück bist.', beat('1.0'), { once: true }),
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
    ['echo.k1.feuerwerk.05', 'geraeusch', '[Kanonendonner, Raketen]', [P('S. 391')]],
    ['echo.k1.feuerwerk.06', 'geraeusch', '[Stille]'],
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

// =====================================================================================================
// Quests (docs/ACTION-RPG.md §11.1) → content/quests/01-kapitel-1.quests.json
// Day → dusk → night: the court at its height, the unpaid wage (and the Schuldbuch at dusk), the kennel,
// the Karlslust by night with the quiet memorial at the Rondell. The history is told at the turn-ins.
// =====================================================================================================
const ln = (speaker, text, o = {}) => ({ speaker, text, ...(o.fact ? { fact: o.fact } : {}), ...(o.src ? { sources: o.src } : {}) });
const place = (x, z, r, era = E) => ({ x, z, ...(r ? { r } : {}), era });
const spawn = (kind, [x, z], count, radius, extra = {}) => ({ kind, x, z, era: E, count, radius, ...extra });

// Terrain-checked spots (probe.mjs / terrain.mjs, 2026-11-16): dry, walkable in 1789, outside the
// 1789 footprints, inside the playable area. The Schuldbuch arena moved 18 m east of the catalogue
// value (1276/−1228 lies inside the rotunda KB-B07) onto the open Bauplatz lawn.
export const K1_SPOTS = {
  kuechenhof: [1212, -1180], // Küchenhof (TF-02), cobbles, behind the north wing
  // the Bauplatz lawn north-east of the rotunda KB-B07, 29 m from Hanne (1287/−1228): her 6 m talk
  // bubble must not overlap the boss's arena (playtest round 2: the book healed when you stepped near her)
  bauplatz: [1300, -1254],
  fleisch: [[1212, -1626], [1206, -1630], [1216, -1618], [1208, -1612], [1214, -1634]], // the Jägerhaus yard (east of KB-B24)
  allee: [1169, -1636], // the Allee north of the Jägerhaus
  schwanufer: [1852, 248], // the north shore of the Schwanenweiher (the water itself is at 1854/214)
  gaertner: [1903, 87], // west of the Rund KL-B40 (1940/80 is the moat)
  kasuar: [1966, 92],
  festgarten: [1274, -986], // the Orangerie garden south of the Pfeilersaal
  festplaene: [[1282, -971], [1286, -958], [1272, -988]],
  marken: { diane: [1169, -1636], sultan: [1227, -1466], fanfare: [1264, -1302], rauhreif: [1298, -1016], bijou: [1268, -950] },
};
const KS = K1_SPOTS;
const DOG = { diane: 'Diane', sultan: 'Sultan', fanfare: 'Fanfare', rauhreif: 'Rauhreif', bijou: 'Bijou' };
const DOG_WHERE = { diane: 'an der Allee', sultan: 'auf der Nordterrasse', fanfare: 'bei der Gärtnerei', rauhreif: 'an der Orangeriemauer', bijou: 'im Orangerie-Parterre' };
const DOG_TEXT = {
  diane: 'Die führt. Wenn Diane steht, steht die Meute.',
  sultan: 'Dumm, aber laut. Bellt, bevor er weiß, warum.',
  fanfare: 'Hat die schönste Stimme. Der Pikeur hört sie über den halben Berg.',
  rauhreif: 'Die Weiße. Im Schnee sieht man sie nicht, nur ihren Atem.',
  bijou: 'Der Kleine. Glaubt, er sei ein Hirsch.',
};
const PLAN = {
  jahrmarkt: ['Festplan: Der Jahrmarkt', 'Ein Blatt mit Buden im Kreis im Orangeriehof, „Jahrmarkt in Venedig“. In der Mitte eine Rotunde aus Holz und Leinwand. (Nach dem Blatt in der ULB Darmstadt.)'],
  karlslust: ['Festplan: Die Karlslust', 'Die Karlslust oberhalb der Großen Kaskade: hinter der Kaskade ein Vulkan, der Hymentempel, das Volk auf Stufen am Hang. Am Rand: „Feuerwerk in drei Abteilungen, durch Zwischenräume getrennt.“'],
  hofgarten: ['Festplan: Der Hofgarten', 'Der Hofgarten in Zweibrücken, Wege und Lampenreihen. Ein Fleck, wo jemand Kaffee abgestellt hat.'],
};

const k1Quests = {
  chapter: 'k1',
  items: [
    { id: 'item.k1.rock', kind: 'quest', fiction: true, name_de: 'Kaspars Rock', text_de: 'Dunkelblaue Wolle, Messingknöpfe, an den Ärmeln etwas zu lang. Er gehört Kaspar, dem Lakaien, der seit drei Wochen mit Fieber liegt. (Fiktion)' },
    { id: 'item.k1.empfehlung', kind: 'quest', fiction: true, name_de: 'Ein Empfehlungsschreiben', text_de: 'Im Namen des Hofrats Justus Amsel aus Celle: Sein Sekretär reise voraus und bitte, den Berg besehen zu dürfen. Gesiegelt mit grünem Gärtnerwachs. Den Hofrat gibt es nicht. (Fiktion)' },
    { id: 'item.k1.lohnzettel', kind: 'quest', fiction: true, name_de: 'Matthes’ Lohnzettel', text_de: '„Matthes, Steinhauer, Galerieflügel. Lohnrest: 1 fl. 30 kr. Angewiesen.“ Darunter kein Stempel „ausgezahlt“. (Fiktion)' },
    { id: 'item.k1.fleisch', kind: 'quest', fiction: true, name_de: 'Fleisch für den Zwinger', text_de: 'Ein Stück Pansen aus der Hundemetzgerei am Jägerhaus. Die Hunde fressen vor den Steinhauern.' },
    { id: 'item.k1.zeichen', kind: 'lore', set: 'steinzeichen', fiction: true, name_de: 'Matthes’ Zeichen I: der Abrieb', text_de: 'Ein Abrieb mit Kohle auf Papier vom Quader am Fuß der Galerie: offener Winkel, darunter drei Punkte. Der Stein bleibt, wo er ist. (Erfundenes Steinmetzzeichen)' },
    { id: 'item.k1.seite', kind: 'lore', set: 'chronikseiten', fiction: true, name_de: 'Chronikseite: Die Namen', text_de: 'Oben in großer, ungelenker Schrift: „Diane. Sultan. Fanfare. Rauhreif. Bijou.“ Darunter in feiner Kanzleischrift: „Hanne, Witwe des Steinhauers Matthes. Lohn: offen.“ (Fiktion)' },
    ...Object.entries(PLAN).map(([k, [name, text]]) => ({ id: `item.k1.festplan_${k}`, kind: 'lore', set: 'festplaene', name_de: name, text_de: text, fact: 'cx.15' })),
    ...Object.keys(DOG).map((k) => ({ id: `item.k1.marke_${k}`, kind: 'lore', set: 'hundemarken', fiction: true, name_de: `Hundemarke „${DOG[k]}“`, text_de: `Eine Blechmarke mit eingeschlagenem Namen: ${DOG[k]}. Jost: „${DOG_TEXT[k]}“ (Fiktion: Die Namen der Hunde sind erfunden.)` })),
  ],
  quests: [
    {
      id: 'q.k1.ankunft', kind: 'main', era: E,
      title_de: 'Zu Fuß, außer einem',
      summary_de: 'Die Bussole ist über Nacht trocken geworden. Ein neuer Tropfen aus der Karlsbergquelle bringt dich in den Sommer 1789. Von dort gehst du zum Hof wie alle anderen: zu Fuß, am Gitter vorbei, an dem eine Wache sehr genau weiß, wer fahren darf.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Erst die Quelle, dann gehen wir hinein. Zu Fuß, wie alle. Am Gitter steht eine Wache, die sehr genau weiß, wer fahren darf und wer nicht.')],
      turnin_lines: [ln('laub', 'Merken Sie sich die Wache. Die schreibt Sie auf, wenn Sie rennen.')],
      history: [ln('laub', 'Nur der Herzog durfte zum Schloss hinauffahren. Alle anderen gingen zu Fuß, und Singen war verboten. Ein Zeitgenosse fand die ganze Gegend „wie betäubt“.', { fact: 'cx.11', src: [src('RLS', 'P')] })],
      objectives: [
        // the chapter opens at the Karlsbergquelle (story k1_0 → k1_0b → k1_1): touch, then walk up in 1789.
        // `wechsel` keeps its id (saves and tests count it), only its text and place changed
        { id: 'quelle', type: 'event', event: 'quelle:touch', text_de: 'An der Quelle: das Wasser berühren',
          hint_de: 'Die Karlsbergquelle liegt im Hang westlich der Orangerie. Vor den Holztrog stellen, zum Wasser schauen und E drücken.' },
        { id: 'wechsel', type: 'reach', after: ['quelle'], text_de: 'Hinauf zum Ehrenhof, zu Fuß', where: place(1200, -1116, 14) },
        { id: 'wache', type: 'examine', clue: 'clue.k1.wache', text_de: 'Am Gitter: der Wache zuhören' },
        { id: 'fluegel', type: 'examine', clue: 'clue.k1.fluegel', text_de: 'Die beiden Flügel ansehen' },
      ],
      rewards: { xp: 60 },
    },
    // ---- the disguise opening (docs/IDEAS-ROUND11.md §2; story k1_0b / k1_0c): the coat, then the letter
    {
      id: 'q.k1.kleider', kind: 'main', era: E,
      title_de: 'Kleider machen Leute',
      summary_de: 'In Orange kommt niemand an den Hof. Unten am Karlsbergbach bleicht die Wäscherin Liese die Wäsche des Hofes, und auf ihrer hinteren Leine hängt der Rock eines kranken Lakaien. Man kann ihn nehmen, solange sie zum Weg schaut. Oder man fragt.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Ein Rock, der nicht leuchtet. Unten an der Bleiche hängt einer. Fragen oder nehmen, das überlasse ich Ihnen. Ich bin nur eine Stimme.')],
      turnin_lines: [ln('laub', 'Dunkelblau. Das Orange ist darunter, aber das weiß nur ich.')],
      history: [ln('laub', 'Fußnote: Wie man sich bei Hof zu kleiden hatte und wie die Wache am Gitter prüfte, steht nirgends. Liese, Kaspar und sein Rock sind erfunden. Die Wäsche, die irgendwer für den Hof gebleicht hat, nicht.', { fact: 'cx.46' })],
      objectives: [
        // set by the story (k1_0b): the coat taken from the line (clue.k1.rock) or Liese's favour done
        { id: 'rock', type: 'manual', text_de: 'Ein Rock, der nicht leuchtet: Kaspars Rock auf Lieses Bleiche', where: place(...DZ.bleiche, 12),
          hint_de: 'Die Bleiche liegt unten am Bach, westlich der Quelle. Hinter der zweiten Leine stehen und E drücken, solange Liese zum Weg schaut. Oder mit ihr reden.' },
        { id: 'bitte', type: 'talk', npc: 'liese', topic: 'rock', optional: true, noMarker: true, text_de: 'Oder: Liese nach dem Rock fragen' },
        {
          id: 'zettel', type: 'kill', enemy: 'mahnbrief', count: 3, optional: true, after: ['bitte'],
          text_de: 'Für Liese: die Zettel aus der Wäsche jagen',
          where: place(...DZ.zettel, 10),
          spawn: [spawn('mahnbrief', DZ.zettel, 3, 3, { leash: 22, escorts: [], wave: [] })],
        },
      ],
      rewards: { xp: 60, items: [{ item: 'item.k1.rock' }] },
    },
    {
      id: 'q.k1.brief', kind: 'main', era: E,
      title_de: 'Ein Brief in fremdem Namen',
      summary_de: 'Ohne Erlaubnis kommt niemand auf den Berg, und jeder Begleiter muss mit Namen im Schreiben stehen. Laub erfindet einen Reisenden, den Hofrat Justus Amsel aus Celle, und schreibt dich als seinen Sekretär hinein. Papier und Siegellack hat der Hofgärtner vor der Orangerie.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Papier, Siegel, ein Name. Den Namen erfinde ich. Das Papier hat der Hofgärtner.')],
      turnin_lines: [ln('laub', 'Gesiegelt. Grünes Wachs, für Kübelpflanzen. Die Wache wird es für Celler Mode halten.')],
      history: [
        ln('laub', 'Den Karlsberg sah kaum ein Fremder von innen. Niemand wagte sich zu zeigen, ohne gerufen zu sein, schreibt Mannlich. Ein Reisender, der 1792 hinauf wollte, brauchte eine ausdrückliche Erlaubnis des Herzogs, und darin musste jeder Begleiter mit Namen stehen.', { fact: 'cx.44', src: [P('S. 355'), src('KNIGGE-BRIEFE', 'P · S. 26 f.')] }),
        ln('laub', 'Der Reisende steht in einem Buch, das Knigge 1793 herausgab. Ob Knigge selbst der Reisende war, ist nicht sicher; er nennt sich nicht. Den Herzog hat er nicht getroffen. Der war gerade abwesend.', { fact: 'cx.43', src: [src('KNIGGE-BRIEFE', 'P · S. 26 f.; Titel: „herausgegeben von“'), src('LITSAAR-KNIGGE')] }),
        ln('laub', 'Einen falschen Prinzen hat der Hof schon gehabt, Ende 1777 in Zweibrücken, mit einem Empfehlungsbrief aus Straßburg. Der Hof sah ihm heimlich hinter den Jalousien zu und lachte. Danach wurde er verhaftet. Wir sind bescheidener: Wir wollen nur hinein.', { fact: 'cx.45', src: [P('S. 346–349, 356–358')] }),
      ],
      objectives: [
        { id: 'papier', type: 'talk', npc: 'hofgaertner', topic: 'papier', text_de: 'Papier und Siegellack: den Hofgärtner vor der Orangerie fragen',
          hint_de: 'Der Hofgärtner steht auf dem Rasen vor der Westseite der Orangerie. Im Rock hingehen, langsam, den Stab weg, und mit ihm reden (E).' },
        { id: 'schreiben', type: 'examine', clue: 'clue.k1.brief', after: ['papier'], text_de: 'Am Tisch des Hofgärtners: Laub schreibt den Brief (E)' },
      ],
      rewards: { xp: 70, items: [{ item: 'item.k1.empfehlung' }] },
    },
    {
      id: 'q.k1.registratur', kind: 'main', era: E,
      title_de: 'Der Kanzlist zählt',
      summary_de: 'Kanzlist Gottlob Soll zählt in der Registratur, was der Hof hat und was er ausgibt. Er will, dass jemand seine Zahlen liest. Und dann fliegen ihm die Mahnbriefe durchs offene Fenster davon, in Richtung Herzog.',
      giver: { npc: 'soll' }, turnin: 'giver',
      topic_de: 'Die Zahlen', accept_de: 'Zeigen Sie mir Ihre Zahlen.',
      offer: [
        ln('soll', 'Sie stehen im Licht. Wenn Sie schon hier sind: Ich zähle. Was der Hof hat, was er ausgibt, was er schuldig bleibt. Das Letzte ist das Längste.'),
        ln('soll', 'Lesen Sie die Tafel, den Kaufbrief und das Heft im Regal. Dann wissen Sie, warum ich Ärmelschoner trage.'),
      ],
      progress: [
        ln('soll', 'Die Briefe! Sie flattern im Küchenhof herum, hinter dem Nordflügel. Wenn einer davon beim Herzog ankommt, bin ich die längste Zeit Kanzlist gewesen.'),
      ],
      turnin_lines: [
        ln('soll', 'Alle sechs? Zerrissen? Gut. Unbezahlt bleiben sie trotzdem. Aber wenigstens liest sie keiner, der sich darüber ärgern könnte.'),
        ln('soll', 'Nehmen Sie den Pfennig vom Rechenbrett. Ausgezahlt. Im übertragenen Sinn.'),
      ],
      history: [
        ln('soll', 'Bau und Betrieb, alles zusammen: Am Ende werden es fast vierzehn Millionen Gulden sein. Das ganze Herzogtum nimmt im Jahr etwa achthunderttausend ein. Rechnen Sie. Ich habe es getan. Mehrmals.', { fact: 'cx.07', src: [src('ADB'), P('Einl. S. XXXIV (Stollreither)')] }),
        ln('soll', 'Das Heft ist beschlagnahmt: Schlözers Stats-Anzeigen von 1782. Ein Land, steht da, „ganz und gar gleichsam ein einziges JagdRevier“, mit ganzen Regimentern Jagdhunden. Gemeint sind wir.', { fact: 'cx.05', src: [src('WP-K2A'), src('RLS')] }),
        ln('soll', 'Und der Kaufbrief: Am 27. Juli 1777 kaufte Serenissimus den Louisenhof auf dem Buchenberg. Aus dem Hofgut wurde das hier. Warum er kaufte, darüber redet man bei Hof. Ich schreibe nur auf, was es kostete.', { fact: 'cx.02', src: [src('WP-SK'), src('EN-KC'), src('HIB')] }),
      ],
      objectives: [
        { id: 'rechenbrett', type: 'examine', clue: 'clue.k1.rechenbrett', text_de: 'Das Rechenbrett lesen' },
        { id: 'kaufbrief', type: 'examine', clue: 'clue.k1.kaufbrief', text_de: 'Den Kaufbrief lesen' },
        { id: 'heft', type: 'examine', clue: 'clue.k1.schloezer', text_de: 'Das beschlagnahmte Heft lesen' },
        {
          id: 'briefe', type: 'kill', enemy: 'mahnbrief', count: 6, after: ['rechenbrett', 'kaufbrief', 'heft'],
          text_de: 'Die entflogenen Mahnbriefe im Küchenhof zerreißen',
          where: place(...KS.kuechenhof, 18),
          spawn: [spawn('mahnbrief', KS.kuechenhof, 6, 7, { leash: 35, escorts: [{ kind: 'foliant', n: 1 }], wave: [{ kind: 'mahnbrief', n: 2 }] })],
        },
      ],
      rewards: { xp: 100, items: [{ item: 'item.charm.rechenpfennig' }] },
      next: 'q.k1.lohn',
    },
    {
      id: 'q.k1.lohn', kind: 'main', era: E,
      title_de: 'Matthes’ Lohn',
      summary_de: 'Hanne, Witwe des Steinhauers Matthes, wartet seit einer Woche am Bauplatz auf seinen letzten Lohn. „Angewiesen“, sagt der Kanzlist. Bei Einbruch der Dämmerung steht am Bauplatz etwas auf, das aussieht wie ein Hauptbuch.',
      giver: { npc: 'hanne' }, turnin: 'giver',
      topic_de: 'Matthes’ Lohn', accept_de: 'Ich frage nach.',
      offer: [
        ln('hanne', 'Sie kommen vom Kanzlisten? Dann fragen Sie ihn, wo der Lohn von meinem Matthes ist. Eine Woche steh ich hier. Mir sagt er nichts.'),
        ln('hanne', 'Und schauen Sie sich den Quader unten an der Galerie an. Da ist sein Zeichen drauf. Damit Sie wissen, dass es ihn gegeben hat.'),
      ],
      progress: [ln('hanne', 'Hat er was gesagt? Angewiesen, ja? Das sagt er immer. Angewiesen kann ich nicht essen.')],
      turnin_lines: [
        ln('hanne', 'Das ist sein Zettel. Angewiesen. Nicht ausgezahlt. Ein Zettel, sonst nichts.'),
        ln('hanne', 'Geben Sie mir den Stab. Matthes hätte den Schuh neu beschlagen. Ich kenn den Schmied, der schuldet mir was.'),
      ],
      history: [
        ln('hanne', 'Zwei Tage arbeitet ein Geselle für einen Gulden. Und hier sind sechs, acht, zehn Baustellen zugleich offen, jahrelang. Wer zählt da die Gesellen? Keiner. Wie viele es waren, weiß heute niemand.', { fact: 'cx.08', src: [src('EN-KC'), src('M1910', 'S. 369'), src('SKD')] }),
        ln('hanne', 'Der Präsident Creuzer, sagen die Leute, hat alle Kassen geleert, sogar die der Witwen und Waisen. Und die einen bezahlt er mit Versprechungen. So steht es später auch beim Baudirektor.', { fact: 'cx.10', src: [P('S. 377, 396 f.'), src('NDB')] }),
        ln('hanne', 'Die Leute sagen Tränenberg zu dem Berg hier. Ob das so heißt, weiß ich nicht. Geweint wird jedenfalls.', { fact: 'cx.09', src: [src('HIB', 'Hobbyseite, Legende, unbelegt')] }),
      ],
      objectives: [
        { id: 'soll', type: 'talk', npc: 'soll', topic: 'matthes', text_de: 'Den Kanzlisten nach Matthes fragen' },
        { id: 'zeichen', type: 'examine', clue: 'clue.k1.zeichen', text_de: 'Matthes’ Zeichen am Quader unten an der Galerie' },
        {
          id: 'buch', type: 'kill', enemy: 'schuldbuch', count: 1, after: ['soll', 'zeichen'],
          text_de: 'In der Dämmerung am Bauplatz: das Schuldbuch bezwingen (Bannlicht bricht das Siegel)',
          where: place(1297, -1247, 32),
          spawn: [spawn('schuldbuch', KS.bauplatz, 1, 0, { boss: true, leash: 45 })],
        },
        { id: 'zettel', type: 'collect', item: 'item.k1.lohnzettel', after: ['buch'], text_de: 'Matthes’ Lohnzettel aus den Seiten aufheben', drop: { enemy: 'schuldbuch', chance: 1 } },
      ],
      rewards: { xp: 260, items: [{ item: 'item.stab.eisen' }] },
    },
    {
      id: 'q.k1.zwinger', kind: 'main', era: E,
      title_de: 'Tausend Hunde',
      summary_de: 'Hinter dem Marstall bellt es aus einem ummauerten Hof. Der Hundejunge Jost füttert die Meute, und er braucht Hände. Er weiß auch, wie man sich vor Hunden versteckt. In der Dämmerung schleichen sich Streuner die Allee hinauf.',
      giver: { npc: 'jost' }, turnin: 'giver',
      topic_de: 'Die Meute', accept_de: 'Ich trag mit.',
      offer: [
        ln('jost', 'Du willst zum Zwinger? Dann trag was. Fleisch liegt drüben am Jägerhaus, fünf Stück. Die Hunde fressen vor uns.'),
        ln('jost', 'Und frag mich, wie man sich versteckt. Das brauchst du heut Nacht. Glaub mir.'),
      ],
      progress: [ln('jost', 'Das Fleisch, zum Zwinger. Und dann hör hin. Drei sind draußen, die gehören nicht dazu.')],
      turnin_lines: [
        ln('jost', 'Alle drei liegen? Dann hat’s keiner gehört. Gut.'),
        ln('jost', 'Nimm die Marke. Die ist für den Hund, den keiner gezählt hat.'),
      ],
      history: [
        ln('jost', 'Einen Zwinger für tausend Hunde, hat der Baudirektor bauen sollen. Hirschmeute, Saumeute, Hühnerhunde, Spürhunde. „Für die Hunde aller Erdteile“, sagt er. Gezählt hab ich nie über zweihundert.', { fact: 'cx.06', src: [Z('S. 365'), src('WP-K2A')] }),
        ln('laub', 'Fußnote: „Hundskarl“ hat man den Herzog erst 1923 genannt, nach einem Heimatforscher. Die Geschichte, die man dazu erzählt, ist nicht belegt. Ich erzähle sie nicht.', { fact: 'cx.37', src: [src('WP-K2A'), src('RLS')] }),
      ],
      objectives: [
        { id: 'lehre', type: 'talk', npc: 'jost', topic: 'verstecken', text_de: 'Jost fragen, wie man sich versteckt' },
        { id: 'fleisch', type: 'collect', item: 'item.k1.fleisch', count: 5, text_de: 'Fleisch vom Jägerhaus holen', place: KS.fleisch.map(([x, z]) => place(x, z)) },
        { id: 'bringen', type: 'reach', after: ['fleisch'], text_de: 'Das Fleisch zum Zwinger bringen', where: place(1177, -1571, 9) },
        {
          id: 'streuner', type: 'kill', enemy: 'streuner', count: 4, after: ['bringen'],
          text_de: 'Vier Streuner an der Allee, bevor die Meute sie hört',
          where: place(...KS.allee, 26),
          spawn: [spawn('streuner', KS.allee, 4, 6, { leash: 40, escorts: [], wave: [{ kind: 'streuner', n: 1 }] })],
        },
      ],
      rewards: { xp: 120, items: [{ item: 'item.charm.hundemarke' }], skills: [{ id: 'spurenleser', tier: 1 }] },
    },
    {
      id: 'q.k1.karlslust', kind: 'main', era: E,
      title_de: 'Die Karlslust bei Nacht',
      summary_de: 'In der Karlslust, eine gute Stunde zu Fuß im Süden, standen die Tiere des Herzogs, die Bären-Kästen, die Kaskade. Und oberhalb der Kaskade ein stiller Ort: das Rondell, wo im Dezember 1785 ein Feuerwerk explodierte. Heute Nacht laufen dort die Hunde.',
      giver: { voice: 'laub' }, turnin: 'auto', quiet: true,
      offer: [
        ln('laub', 'Die Karlslust. Der Teil des Tages, den der Hof nicht bezahlt hat. Wir gehen hin, solange es dämmert.'),
        ln('laub', 'Oben am Rondell ist ein Ort, an dem man leise ist. Auch Sie. Vor allem Sie.'),
      ],
      progress: [ln('laub', 'Am Wasser bleiben. Hunde verlieren dort die Spur, und Geometer die Nerven.')],
      turnin_lines: [ln('laub', 'Sie sind nass bis an die Knie. Das Wasser hat Sie gerettet. Und eine Seite haben Sie mitgebracht.')],
      history: [
        ln('laub', 'Neunzehn Häuschen mit Schieferdach im Kreis um einen Wassergraben, in der Mitte eine Insel mit Pavillon. Papageien, Pelikane, Kasuare, Affen, Wölfe, zwei Dromedare. Die Tiere hatten Schieferdächer. Die Steinhauer nicht.', { fact: 'cx.12', src: [src('SPT'), src('US'), Z('S. 384')] }),
        ln('laub', '„Bärenzwinger“, sagen die Leute heute zum Rund. Wahrscheinlich war es eine Voliere. Die eisernen Bären-Kästen von 1786 standen oben auf den Terrassen. Ob je ein Bär darin saß, ist nicht sicher belegt.', { fact: 'cx.13', src: [src('SPT'), src('SKD')] }),
        ln('laub', 'Am 19. Dezember 1785, zur Hochzeit des Prinzen Max, explodierte oberhalb der Kaskade das Feuerwerk. Alle Raketen lagen auf einem einzigen Gerüst, gegen den Rat des Feuerwerkers. Es traf Major Magnier und elf seiner Arbeiter. Der Major starb. Die Namen der Arbeiter hat niemand aufgeschrieben.', { fact: 'cx.14', src: [src('M1910', 'S. 386–392'), src('WP-SK')] }),
        ln('laub', 'Mannlichs Festpläne liegen heute in Darmstadt, frei für jeden. Auf einem Blatt steht am Rand: Feuerwerk in drei Abteilungen. So war es geplant.', { fact: 'cx.15', src: [src('DA85'), src('M1910', 'S. 386–391')] }),
      ],
      objectives: [
        { id: 'terrasse', type: 'reach', text_de: 'Auf der Tschifflik-Terrasse: Q – die Karlslust 1789', where: place(1822, 70, 16) },
        { id: 'rund', type: 'examine', clue: 'clue.k1.amphitheater', text_de: 'Einmal um das Rund: die Häuschen zählen' },
        { id: 'baeren', type: 'examine', clue: 'clue.k1.baerenkaesten', text_de: 'Oben an den Terrassen: die Bären-Kästen' },
        {
          id: 'lichter', type: 'kill', enemy: 'irrlicht', count: 5, after: ['baeren'],
          text_de: 'Irrlichter über dem Schwanenweiher bannen',
          where: place(...KS.schwanufer, 30),
          spawn: [spawn('irrlicht', KS.schwanufer, 5, 9, { leash: 40 })],
        },
        { id: 'rondell', type: 'examine', clue: 'clue.k1.feuerwerk', text_de: 'Das Rondell, wo die Kaskade beginnt: still sein und zuhören' },
        { id: 'seite', type: 'examine', clue: 'clue.k1.seite', text_de: 'Auf den Stufen des Tempelplatzes liegt etwas (Laterne an)' },
        { id: 'flucht', type: 'reach', after: ['seite'], text_de: 'Hinunter zum Tosbecken! Wasser verwischt die Spur', where: place(1812, 203, 12) },
        { id: 'heim', type: 'event', event: 'era:change', match: { to: 'today' }, after: ['flucht'], text_de: 'Q halten: zurück ins Heute' },
      ],
      rewards: { xp: 180, skills: [{ id: 'kartograf', tier: 2 }] },
    },
    // ---- side quests ------------------------------------------------------------------------------
    {
      id: 'q.k1.kasuar', kind: 'side', era: E,
      title_de: 'Der Kasuar ist los',
      summary_de: 'Ein Gärtner der Menagerie flüstert: Der Kasuar ist ausgebrochen. Schlagen darf ihn keiner. Man lässt ihn anrennen, bis er müde ist, und dann führt man ihn heim.',
      giver: { npc: 'gaertner' }, turnin: 'giver',
      topic_de: 'Der Kasuar', accept_de: 'Ich hole ihn zurück.',
      offer: [
        ln('gaertner', 'Pst. Der Kasuar ist raus. Wenn der Herzog das erfährt, gibt’s Prügel, für mich und für den Vogel.'),
        ln('gaertner', 'Schlagen darfst du ihn nicht, nicht mal anfassen, der tritt wie ein Pferd. Lass ihn anrennen und spring zur Seite, bis er müde ist. Dann geht er von selbst heim.'),
      ],
      progress: [ln('gaertner', 'Zur Seite springen, nicht zurückschlagen. Er ist schneller wütend als müde, aber müde wird er.')],
      turnin_lines: [ln('gaertner', 'Er frisst wieder. Und er hat dir eine Feder gelassen. Freiwillig, glaub ich.')],
      history: [ln('gaertner', 'Kasuare, Papageien, Pelikane, Affen, Stachelschweine. Aus aller Welt hat der Herzog sie kommen lassen. Neunzehn Häuschen, und jedes hat ein Schieferdach.', { fact: 'cx.12', src: [src('SPT'), Z('S. 384')] })],
      objectives: [{ id: 'beruhigen', type: 'calm', animal: 'cassowary', text_de: 'Den Kasuar beruhigen: ausweichen, bis er müde ist', where: place(...KS.kasuar, 24) }],
      rewards: { xp: 90, items: [{ item: 'item.charm.feder' }] },
      available: { after: ['q.k1.lohn'] },
    },
    {
      id: 'q.k1.festplaene', kind: 'side', era: E,
      title_de: 'Mannlichs Festpläne',
      summary_de: 'Ein Diener in der Orangerie ist verzweifelt: Der Wind hat die Festpläne des Baudirektors durchs Fenster getragen, und zwischen den Blättern flattern Mahnbriefe, die beißen.',
      giver: { npc: 'diener' }, turnin: 'giver',
      topic_de: 'Die Festpläne', accept_de: 'Ich sammle sie ein.',
      offer: [
        ln('diener', 'Sie da! Die Pläne des Herrn Baudirektors! Das Fenster stand offen, und jetzt liegen sie im Garten verstreut.'),
        ln('diener', 'Und dazwischen fliegen Briefe herum, die beißen. Ich gehe da nicht hin. Ich bin Diener, nicht Soldat.'),
      ],
      progress: [ln('diener', 'Drei Blätter. Und am Fenster drinnen steht der Herr Baudirektor manchmal. Man hört ihn, wenn man lange genug still ist.')],
      turnin_lines: [ln('diener', 'Alle drei! Der Herr Baudirektor wird es nie erfahren. Das ist das Schönste an meiner Arbeit.')],
      history: [
        ln('diener', 'Das eine Blatt zeigt den Jahrmarkt im Orangeriehof, Buden im Kreis und eine Rotunde aus Leinwand. Das andere die Karlslust mit einem Vulkan. Er schickt die Blätter an den Landgrafen nach Darmstadt.', { fact: 'cx.15', src: [src('DA85'), src('M1910', 'S. 386–391')] }),
        ln('laub', 'Mannlich, Hofmaler, Baudirektor wider Willen. Fast jedes Zitat, das Sie hier hören, stammt aus seinen Erinnerungen. Er verehrte den Herzog. Lesen Sie ihn mit Vorsicht.', { fact: 'cx.04', src: [src('M1910'), src('SCHWAN12')] }),
        ln('laub', 'Die Orangerie war vorher eine Schweizerei. Im Winter stehen im Pfeilersaal die Kübelpflanzen, oben wohnt Mannlich. Ihre Stützmauer haben Sie im Wald gefunden: einundachtzig Meter.', { fact: 'cx.40', src: [src('SBT'), src('WP-SK'), src('LIDAR', 'Merkmal KB-30')] }),
      ],
      objectives: [
        {
          id: 'briefe', type: 'kill', enemy: 'mahnbrief', count: 6,
          text_de: 'Die Mahnbriefe im Orangeriegarten zerreißen',
          where: place(...KS.festgarten, 20),
          spawn: [spawn('mahnbrief', KS.festgarten, 6, 7, { leash: 30, escorts: [{ kind: 'foliant', n: 1 }, { kind: 'nebelweber', n: 1 }], wave: [] })],
        },
        ...Object.keys(PLAN).map((k, i) => ({ id: k, type: 'collect', item: `item.k1.festplan_${k}`, text_de: `${PLAN[k][0]} aufheben`, place: [place(...KS.festplaene[i])] })),
        { id: 'mannlich', type: 'examine', clue: 'clue.k1.mannlich', text_de: 'Im Pfeilersaal am Fenster: Mannlich zuhören (E halten)' },
        { id: 'lohn', type: 'examine', clue: 'clue.k1.mannlich_lohn', text_de: 'Noch einmal am Fenster: was Mannlich über den Lohn sagt (E halten)' },
      ],
      rewards: { xp: 100 },
      available: { after: ['q.k1.registratur'] },
    },
    {
      id: 'q.k1.hundenamen', kind: 'side', era: E,
      title_de: 'Die Namen der Hunde',
      summary_de: 'Fünf von Josts Hunden sind weg, ihre Marken liegen irgendwo am Berg. Wo eine Marke liegt, schnüffelt ein Streuner. Jost will die Namen aufschreiben, weil es sonst keiner tut.',
      giver: { npc: 'jost' }, turnin: 'giver',
      topic_de: 'Fünf Marken', accept_de: 'Ich bring sie dir.',
      offer: [
        ln('jost', 'Fünf von meinen sind weg. Diane, Sultan, Fanfare, Rauhreif, Bijou. Die Marken liegen irgendwo, das spür ich.'),
        ln('jost', 'Und wo eine Marke liegt, schnüffelt ein Streuner. Bring mir die Marken. Die Namen schreibt sonst keiner auf.'),
      ],
      progress: [ln('jost', 'An der Allee, auf der Nordterrasse, bei der Gärtnerei, an der Orangerie. Die laufen weit, wenn keiner pfeift.')],
      turnin_lines: [ln('jost', 'Diane. Sultan. Fanfare. Rauhreif. Bijou. Die schreib ich auf. Irgendwo, wo es keiner verbrennt.')],
      history: [
        ln('jost', 'Die Bauern müssen die Wildzäune halten und das Futter für die Meuten liefern. Und wenn die Parforcejagd durchs Feld geht, ist das Feld hin. Ein einziges Jagdrevier, hat einer geschrieben.', { fact: 'cx.05', src: [src('WP-K2A'), src('RLS')] }),
        ln('laub', 'Fußnote: Die Namen der Hunde sind erfunden. Die Hunde nicht.', { fact: 'cx.38' }),
      ],
      objectives: Object.keys(DOG).map((k) => ({
        id: k, type: 'collect', item: `item.k1.marke_${k}`, text_de: `${DOG[k]}s Marke (${DOG_WHERE[k]})`,
        place: [place(...KS.marken[k])],
        spawn: [spawn('streuner', KS.marken[k], 1, 3, { leash: 30 })],
      })),
      rewards: { xp: 130 },
      available: { after: ['q.k1.zwinger'] },
    },
  ],
};

writeFileSync(`${ROOT}/content/quests/01-kapitel-1.quests.json`, JSON.stringify({ $schema: '../schema/quests.schema.json', ...k1Quests }, null, 2) + '\n');
console.log('wrote 01-kapitel-1.quests.json');
