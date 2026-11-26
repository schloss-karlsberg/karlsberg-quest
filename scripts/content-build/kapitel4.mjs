import { clue, noun, say, seq, hints, src, write } from './common.mjs';

const ch = 'k4';
const E = '1796';
// Marlene's notes at home: since the tour bridge (WP-01) at the Karlsbergquelle, across the trail
// south-west of the trough (quelle/layout.ts local u 0, w 12), r 8: the spawn (1059.3/−833.1) and
// the trough's E zone stay outside the clue radius. The story also grants the clues.
const QUELLE_NOTES = [1051.3, -827.4];
// Marlene's note lies on the mossy edge block by the steps at the spring (local u −3.4, w 3.2),
// 3.7 m from the wake spot: reachable, and its 1.2 m circle stays clear of the trough's E zone
const STUFE = [1056.4, -835.4];
const TAL = [497, -900];
const WEST = [200, -905];
const BAU = [503, -836];
// the yard WEST of the long Baumagazin (KB-B29): the bible's 509/-830 and 516/-822 lie inside the
// building's footprint, so table, cart and wood stack stand in the open yard in front of it
const TISCH = [495, -845];
const SOLL = [496, -842];
const KARREN = [496.5, -822];
const PETER = [494, -826];
const HOLZ = [490, -834];
// the southern brow of the Westblick knoll (look south to the Merburg)
const SUEDBLICK = [198, -884];
const EH = [1216, -1114];
const GRAEBEN = [1240, -1193];
const BRUNNEN = [1386, -1477];
const ZW = [1216, -1571];

const clues = [
  clue('clue.k4.marlene', {
    title: 'Marlenes Zettel', kind: 'document', at: STUFE, r: 1.2, era: 'today', anchor: 'loc.quelle', chapter: ch, fiction: true,
    text: '„Bin heim. Hab dir Suppe hingestellt. Mein Schwager sagt, in Homburg stecken überall Steine vom Karlsberg drin, in halb der Altstadt. Er sagt auch, in seinem Keller. Er sagt viel. Gute Nacht. M.“ Auf der Rückseite ein PS. (Belegt: Steine der Ruine stecken in Homburger Häusern.)',
    nouns: ['n.r_neuanfang'],
  }),
  clue('clue.k4.karren', {
    title: 'Erinnerung: Die Karren', kind: 'echo', at: TAL, r: 25, era: E, anchor: 'KB-B63', chapter: ch, fiction: true,
    text: 'Die Wachhäuser am Taleingang stehen noch, ohne Wache. Auf der Straße rollen Karren nach Westen, beladen mit behauenen Steinen. Automatisch.',
    nouns: ['n.homburg', 'n.r_steintraeger'],
  }),
  clue('clue.k4.hohenburg', {
    title: 'Blick zur Hohenburg', kind: 'dialogue', at: WEST, r: 20, era: E, anchor: 'loc.k4.westblick', chapter: ch, fiction: false,
    text: 'Im Südwesten, etwa zwei Kilometer weit, ein Berg mit Mauerresten über einer kleinen Stadt.',
    nouns: ['n.hohenburg'],
  }),
  clue('clue.k4.jaegersburg', {
    title: 'Holz aus Jägersburg', kind: 'dialogue', at: HOLZ, r: 4, era: E, anchor: 'KB-B29', chapter: ch, fiction: false,
    text: 'Laub am Holzstapel im Hof des Baumagazins, nach dem Blick zur Hohenburg.', nouns: ['n.jaegersburg'], req: { clues: ['clue.k4.hohenburg'] },
  }),
  clue('clue.k4.merburg', {
    title: 'Die Merburg im Süden', kind: 'dialogue', at: SUEDBLICK, r: 8, era: E, anchor: 'loc.k4.westblick', chapter: ch, fiction: false,
    text: 'Laub, wenn man vom Westrand nach Süden schaut.', nouns: ['n.merburg'],
  }),
  clue('echo.k4.rueckwaerts', {
    title: 'Erinnerung: Rückwärts', kind: 'echo', at: WEST, r: 20, era: E, anchor: 'loc.k4.westblick', chapter: ch, fiction: true,
    echoDate: '1796 → 1789',
    text: 'E halten. Die Karren auf der Straße rollen rückwärts, die Steine fahren bergauf, die Jahre laufen zurück bis etwa 1780. Ganz kurz der Karlsberg mit Gerüsten. Auf dem vordersten Karren ein Quader, dessen Zeichen immer blasser wird, bis es fehlt. Dann wieder vorwärts. Wandernde Steine 3/4.',
    flags: ['flag.stein_3'], req: { clues: ['clue.k4.hohenburg'] },
  }),
  clue('clue.k4.baumagazin', {
    title: 'Das Baumagazin', kind: 'dialogue', at: BAU, r: 25, era: E, anchor: 'KB-B29', chapter: ch, fiction: false,
    text: 'Das einzige Gebäude, das ganz steht. Im Hof Steinhaufen, Holzstapel, eine Waage. (Heute Karlsberger Hof, privat: im Heute kein Trigger, nur der Blick von der Straße.)',
    nouns: ['n.baumagazin', 'n.eiskeller'], facts: ['cx.32'],
  }),
  clue('clue.k4.pacht', {
    title: 'Der Pachtbrief', kind: 'document', at: TISCH, r: 3.5, era: E, anchor: 'KB-B29', chapter: ch, fiction: true,
    text: '„Pacht über Holz und Steine der Brandstätte Carlsberg. 1796.“ Darunter vierzehn Unterschriften und Hauszeichen, keine davon lesbar. (Wortlaut erfunden; der Inhalt ist belegt.)',
    nouns: ['n.vierzehn'],
  }),
  clue('clue.k4.soll', {
    title: 'Soll führt Buch für die Pächter', kind: 'dialogue', at: SOLL, r: 6, era: E, anchor: 'KB-B29', chapter: ch, fiction: true,
    text: 'Soll sitzt an einem Tisch im Tor, alt geworden, die Ärmelschoner abgewetzt.',
    nouns: ['n.vierzehn', 'n.r_raub', 'n.r_chronik_bewachen', 'n.r_franzosen'],
  }),
  clue('clue.k4.peter', {
    title: 'Peter, der Fuhrmann', kind: 'dialogue', at: PETER, r: 8, era: E, anchor: 'KB-B29', chapter: ch, fiction: true,
    text: 'Peter, Hannes Sohn, fünfzehn, lädt Steine auf seinen Karren.', nouns: ['n.r_herzog_selbst'],
  }),
  clue('clue.k4.stein_karren', {
    title: 'Ein Quader auf Peters Karren', kind: 'object', at: KARREN, r: 3.5, era: E, anchor: 'KB-B29', chapter: ch, fiction: true,
    text: 'Das Zeichen von Matthes: offener Winkel, drei Punkte. Wandernde Steine 2/4.',
    nouns: ['n.r_lohn_steine'], flags: ['flag.stein_2'],
  }),
  clue('clue.k4.anschlag', {
    title: 'Ein Anschlag am Pfeiler', kind: 'document', at: [1195, -1112], r: 3, era: E, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Ein angeschlagenes Blatt, vom Regen halb gelöst: „Nachdem Seine Hochfürstliche Durchlaucht Herzog Carl August am 1. April 1795 verstorben, werden alle, so Forderungen an die herzogliche Cammer haben, aufgefordert …“ Darunter mit Kohle: „über 9 Millionen. Viel Glück.“ (Wortlaut erfunden; Datum und Summe sind belegt.)',
    nouns: ['n.9_millionen'],
  }),
  clue('clue.k4.napoleon', {
    title: 'Die Bedingung', kind: 'dialogue', at: EH, r: 35, era: E, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Laub im Ehrenhof, nach dem ersten Steinfraß.', nouns: ['n.abreissen', 'n.wiederaufbauen', 'n.verkaufen', 'n.aufforsten'],
  }),
  clue('clue.k4.graben', {
    title: 'Ein Ausbruchgraben', kind: 'object', at: GRAEBEN, r: 20, era: E, anchor: 'KB-06', chapter: ch, fiction: false,
    text: 'Ein langer Graben, wo eben noch eine Mauer stand. Unten Mörtelbrocken und Splitter, die keiner haben will.',
    nouns: ['n.ausbruchgraben'],
  }),
  clue('clue.k4.graben_heute', {
    title: 'Die Rinne im Relief', kind: 'relief', at: GRAEBEN, r: 20, era: 'today', anchor: 'KB-06', chapter: ch, fiction: false,
    text: 'Relief-Blick 3: eine schmale Rinne mit zwei kleinen Wällen daneben, genau dort, wo 1796 der Graben war. (LIDAR-Auswertung KB-06.)',
    nouns: ['n.ausbruchgraben', 'n.hohlweg', 'n.meilerplatz', 'n.wassergraben'], facts: ['rm.05'], req: { scanMode: 3 },
  }),
  clue('clue.k4.laub_1840', {
    title: 'Erinnerung: Standpunkt siebzehn', kind: 'echo', at: BRUNNEN, r: 12, era: E, anchor: 'KB-51', chapter: ch, fiction: true,
    echoDate: 'November 1840',
    text: 'E halten. Nacht, Wald, Novemberregen. Ein Mann im Mantel, ein Theodolit auf dem Stativ, eine Laterne auf dem Brunnenrand. (Ganz erfunden.)',
    nouns: ['n.r_herr_suchen', 'n.r_nie_abgeblasen'], flags: ['flag.k4_kein_verlust'],
  }),
  clue('clue.k4.zwingerhaus', {
    title: 'Was vom Zwinger blieb', kind: 'dialogue', at: [1216, -1556], r: 15, era: 'today', anchor: 'KB-B23', chapter: ch, fiction: false,
    text: 'Auf dem Weg zum Zwinger, heute, Nacht, Nebel.', nouns: ['n.zwingerhaus'],
  }),
  clue('clue.k4.jost', {
    title: 'Der Pikeur', kind: 'dialogue', at: ZW, r: 20, era: 'today', anchor: 'KB-B23', chapter: ch, fiction: true,
    text: 'Finale (nur nach der 2. Bestätigung). X (hinlegen) und L (Laterne an), in beliebiger Reihenfolge, kein Zeitdruck. Der Pikeur steigt ab und nimmt den Hut ab: Jost, alt. Bodendenkmal: keine Grab- oder Suchhandlung.',
    nouns: ['n.r_heimtreiben', 'n.r_vergessen'], flags: ['flag.horn'], req: { flags: ['flag.k4_finale'] },
  }),
  clue('clue.k4.nur_steine', {
    title: 'Nur Steine', kind: 'dialogue', at: QUELLE_NOTES, r: 8, era: 'today', anchor: 'loc.quelle', chapter: ch, fiction: true,
    text: 'An der Quelle, nach dem Finale, vor der Wahl.', nouns: ['n.r_nur_steine'], req: { clues: ['clue.k4.jost'] },
  }),
  clue('clue.k4.foto', {
    title: 'Ein Foto auf Marlenes Handy', kind: 'object', at: QUELLE_NOTES, r: 8, era: 'today', anchor: 'loc.quelle', chapter: ch, fiction: true,
    text: 'Der Stein über der Kellertür von Marlenes Schwager in der Homburger Altstadt: ein Winkel mit drei Punkten. (FIKTION: Kein echtes Haus ist gemeint.) Wandernde Steine 4/4.',
    flags: ['flag.stein_4'], req: { clues: ['clue.k4.jost'] },
  }),
];

const nouns = [
  noun('n.hohlweg', 'Hohlweg', 'object', 'Hohlwege'),
  noun('n.wassergraben', 'Wassergraben', 'object', 'Wassergräben'),
  noun('n.ausbruchgraben', 'Ausbruchgraben', 'object', 'Ausbruchgräben'),
  noun('n.eiskeller', 'Eiskeller', 'object', 'Eiskeller'),
  noun('n.meilerplatz', 'Meilerplatz', 'object', 'Meilerplätze'),
  noun('n.vierzehn', '14', 'other'),
  noun('n.9_millionen', '9 Millionen', 'other'),
  noun('n.abreissen', 'abzureißen', 'action'),
  noun('n.wiederaufbauen', 'wieder aufzubauen', 'action'),
  noun('n.verkaufen', 'zu verkaufen', 'action'),
  noun('n.aufforsten', 'aufzuforsten', 'action'),
  noun('n.hohenburg', 'Hohenburg', 'place'),
  noun('n.jaegersburg', 'Jägersburg', 'place'),
  noun('n.merburg', 'Merburg', 'place'),
  noun('n.baumagazin', 'Baumagazin', 'object'),
  noun('n.zwingerhaus', 'Zwingerhaus', 'object'),
  noun('n.r_franzosen', 'die Franzosen', 'group'),
  noun('n.r_herzog_selbst', 'der Herzog selbst', 'person'),
  noun('n.r_steintraeger', 'die Steinträger aus Homburg', 'group'),
  noun('n.r_vergessen', 'das Vergessen', 'cause'),
  noun('n.r_herr_suchen', 'sie ihren Herrn sucht', 'cause'),
  noun('n.r_chronik_bewachen', 'sie die Chronik bewacht', 'cause'),
  noun('n.r_heimtreiben', 'sie uns heimtreibt', 'cause'),
  noun('n.r_nie_abgeblasen', 'sie nie abgeblasen wurde', 'cause'),
  noun('n.r_raub', 'Raub', 'object'),
  noun('n.r_lohn_steine', 'Lohn', 'object'),
  noun('n.r_neuanfang', 'ein Neuanfang', 'object'),
  noun('n.r_nur_steine', 'nur Steine', 'object'),
];

const f1 = (id, factId, text, b) => ({ id, kind: 'fact', factId, text_de: text, blanks: Array.isArray(b) ? b : [b] });
const reading = (id, flag, text, blankId, accepts) => ({ id, kind: 'reading', flag, text_de: text, blanks: [{ id: blankId, accepts }] });
const cases = [{
  id: 'case.k4',
  title_de: 'Der Steinbruch',
  intro_de: '1796. Das Schloss ist drei Jahre tot. Wohin gingen seine Steine, und was blieb?',
  entries: [
    f1('entry.k4.1', 'cx.30', '1796 pachteten {wieviel} Bürger aus Homburg das Recht, Holz und Steine der Ruine zu verkaufen.',
      { id: 'wieviel', category: 'other', correct: 'n.vierzehn', accepts: ['n.vierzehn', 'n.neunzehn', 'n.tausend', 'n.zwoelf'] }),
    f1('entry.k4.2', 'cx.29', 'Als der Herzog am 1. April 1795 starb, hinterließ er über {wieviel} Gulden Schulden.',
      { id: 'wieviel', category: 'other', correct: 'n.9_millionen', accepts: ['n.9_millionen', 'n.zahl_14mio', 'n.zahl_800000', 'n.zahl_35000'] }),
    f1('entry.k4.3', 'cx.30', 'Unter Napoleon erhielt die Witwe des Herzogs die Ruine zurück, unter der Bedingung, sie {wie}.',
      { id: 'wie', category: 'action', correct: 'n.abreissen', accepts: ['n.abreissen', 'n.wiederaufbauen', 'n.verkaufen', 'n.aufforsten'] }),
    f1('entry.k4.4', 'cx.31', 'Schon für den Bau des Schlosses hatte man Steine von der {wo} geholt.',
      { id: 'wo', category: 'place', correct: 'n.hohenburg', accepts: ['n.hohenburg', 'n.jaegersburg', 'n.merburg'] }),
    f1('entry.k4.5', 'cx.32', 'Das einzige Gebäude des Karlsbergs, das bis heute steht, ist {was}.',
      { id: 'was', category: 'object', correct: 'n.baumagazin', accepts: ['n.baumagazin', 'n.eiskeller', 'n.zwingerhaus'],
        labels_de: { 'n.baumagazin': 'das Baumagazin', 'n.eiskeller': 'der Eiskeller', 'n.zwingerhaus': 'das Zwingerhaus' } }),
    f1('entry.k4.6', 'cx.34', 'Wo man die Grundmauern herausholte, sieht man im Laserscan heute {was}.',
      { id: 'was', category: 'object', correct: 'n.ausbruchgraben', plural: true, accepts: ['n.ausbruchgraben', 'n.hohlweg', 'n.meilerplatz', 'n.wassergraben'] }),
    reading('entry.k4.7', 'flag.k4_zerstoerer', 'Den Karlsberg zerstörten am Ende {wer}.', 'wer',
      ['n.r_franzosen', 'n.r_herzog_selbst', 'n.r_steintraeger', 'n.r_vergessen']),
    reading('entry.k4.8', 'flag.k4_meute', 'Die Meute jagte, weil {warum}.', 'warum',
      ['n.r_herr_suchen', 'n.r_chronik_bewachen', 'n.r_heimtreiben', 'n.r_nie_abgeblasen']),
    reading('entry.k4.9', 'flag.k4_steine', 'Die Karlsberg-Steine in den Homburger Häusern sind {was}.', 'was',
      ['n.r_raub', 'n.r_lohn_steine', 'n.r_neuanfang', 'n.r_nur_steine']),
  ],
}];

const beat = (b, x = {}) => ({ event: 'story:beat', chapter: ch, beat: b, ...x });
const found = (id, x = {}) => ({ event: 'clue:found', id, ...x });
const talk = (npc, topic, x = {}) => ({ event: 'npc:talk', npc, chapter: ch, topic, ...x });
const echo = (id) => ({ event: 'echo:start', id });

const dialogue = [
  // 4.0 At the spring
  say('marlene.k4.zettel', 'marlene', 'Bin heim. Hab dir Suppe hingestellt. Mein Schwager sagt, in Homburg stecken überall Steine vom Karlsberg drin, in halb der Altstadt. Er sagt auch, in seinem Keller. Er sagt viel. Gute Nacht. M.', found('clue.k4.marlene', { step: 1 }), { once: true, src: [src('RLS', 'P: Steine der Ruine in Homburger Häusern')] }),
  say('marlene.k4.zettel_2', 'marlene', 'PS: Wenn ein altes Schloss in Homburg in hundert Häusern steckt, ist es dann weg oder überall? Frag ich mich nur so.', found('clue.k4.marlene', { step: 2 }), { once: true }),
  say('laub.k4.gestaendnis_1', 'laub', 'Ich habe Ihnen etwas verschwiegen. Ich bin nicht verschollen, weil ich mich verlaufen habe. Ich war am alten Forsthaus, Standpunkt siebzehn. Am Tag vorher hatte ich in einem Graben eine Seite gefunden, alt, angesengt, mit Namen drauf. ‚Was der Hof schuldig blieb.‘ Ich dachte, wenn ich vermesse, wo die Seiten liegen, finde ich den Rest. Ein Geometer findet alles, wenn man ihm genug Standpunkte gibt.', beat('4.0'), { once: true, priority: 10 }),
  // 4.1 Taleingang
  say('laub.k4.taleingang', 'laub', 'Die Leute holen sich ihr Geld zurück. In Steinen.', beat('4.1'), { once: true }),
  ...seq(echo('clue.k4.karren'), [
    ['echo.k4.karren.01', 'fuhrmann', 'Hü! Für das Fenstergewände da kriegt der Bäcker in Homburg eine neue Haustür.'],
    ['echo.k4.karren.02', 'fuhrmann2', 'Und der Schmied einen Kamin. Und ich krieg zwei Kreuzer.'],
    ['echo.k4.karren.03', 'fuhrmann', 'Mehr als der Herzog je gezahlt hat.'],
    ['echo.k4.karren.04', 'fuhrmann2', 'Wir tragen das Schloss halt nach Haus. Stein für Stein. Einer muss es ja tun.'],
  ]),
  // 4.2 Westblick
  say('laub.k4.westblick', 'laub', 'Der Berg über der Stadt: die Hohenburg, 1714 geschleift. Der Herzog hat ihre Trümmer als Steinbruch benutzt. Steine haben kein Zuhause. Nur eine Adresse auf Zeit.', found('clue.k4.hohenburg'), { once: true, src: [src('EN-HB', 'P'), src('BW', 'P')] }),
  say('laub.k4.jaegersburg', 'laub', 'Und das Holz kam aus Jägersburg, dem alten Jagdschloss. Täfelungen, Möbel, angeblich ein ganzer Stall. Der Herzog hat sich auch bei sich selbst bedient.', found('clue.k4.jaegersburg'), { once: true, src: [src('SKD', 'P'), src('WP-JB', 'P')] }),
  say('laub.k4.merburg', 'laub', 'Im Süden, da hinten, die Merburg. Auch eine Ruine, aber eine ehrliche. Die ist von allein alt geworden.', found('clue.k4.merburg'), { once: true }),
  say('echo.k4.rueckwaerts.01', 'geraeusch', '[Die Bussole tickt rückwärts]', echo('echo.k4.rueckwaerts'), { once: true }),
  // 4.3 Baumagazin
  // after the fight and the turn-in, not on arrival over four Steinfresser (playtest round 5)
  say('laub.k4.baumagazin', 'laub', 'Das Baumagazin. Das Lager für Baumaterial. Das einzige Haus, das stehen bleibt. Alles andere wird selbst zu Baumaterial. Man hat später gesagt, das Schloss sei eine Baustoffhandlung geworden. Die Verwaltung nennt so etwas Kreislauf.', { event: 'quest:completed', id: 'q.k4.baumagazin' }, { once: true, src: [src('RLS', 'P'), src('WP-SK', 'P')] }),
  say('soll.k4.01', 'soll', 'Ah. Sie. Sie sind auch nicht jünger geworden. Doch, Sie schon.', talk('soll', 'greet'), { once: true }),
  say('soll.k4.02', 'soll', 'Ich führe jetzt Buch für die Pächter. Ein Fenstergewände zwölf Kreuzer, ein Treppenstein zwanzig, ein Wappen gar nichts, das will keiner.', talk('soll', 'pacht'), { src: [src('HIB', 'Pacht belegt; Preise erfunden')] }),
  say('soll.k4.03', 'soll', 'Zum ersten Mal in meinem Leben wird am Karlsberg alles bezahlt. Bar. Sofort. Es ist entsetzlich.', talk('soll', 'geld')),
  say('soll.k4.04', 'soll', 'Raub ist das. Erst haben sie dem Land das Geld genommen und Steine draus gemacht, jetzt nimmt das Land die Steine zurück. Ein Raub am Raub. Ob das wieder gerade wird, weiß ich nicht. Buchhalterisch ist es eine Null.', talk('soll', 'raub')),
  say('soll.k4.05', 'soll', 'Die Franzosen haben ihn angezündet. Aber abgerissen haben ihn wir. Das schreib ich auch auf.', talk('soll', 'schuld')),
  say('soll.k4.06', 'soll', 'Mein Buch? Die Seiten sind verweht. Manchmal denke ich, die Hunde passen drauf auf. Die laufen immer da, wo eine liegt.', talk('soll', 'buch')),
  say('soll.k4.07', 'soll', 'Wenn Sie die Seiten finden: Tragen Sie die Summe nicht zusammen. Die Summe ist nicht wichtig. Die Namen sind wichtig.', talk('soll', 'bye')),
  say('peter.k4.01', 'peter', 'Platz da. Der Karren ist voll.', talk('peter', 'greet'), { once: true }),
  say('peter.k4.02', 'peter', 'Mutter? Die wohnt jetzt in Homburg. Sie sagt, ich soll was Gescheites fahren. Keine Steine. Ich fahr Steine.', talk('peter', 'hanne')),
  say('peter.k4.03', 'peter', 'Das ist von meinem Vater. Den hab ich extra rausgesucht. Der kommt nach Homburg, über unsere Tür. Er hat ihn gehauen. Bezahlt hat ihn keiner. Jetzt gehört er uns. Das ist der Lohn.', found('clue.k4.stein_karren'), { once: true }),
  say('peter.k4.04', 'peter', 'Wer das Schloss kaputt gemacht hat? Der Herzog. Wer so baut, muss sich nicht wundern.', talk('peter', 'schuld')),
  say('peter.k4.05', 'peter', 'Hü.', talk('peter', 'bye')),
  // 4.4 Ehrenhof (W7)
  say('laub.k4.steinfrass', 'laub', 'Das ist nicht das Feuer. Das ist schlimmer. Das ist, wenn keiner mehr weiß, wo etwas stand. Dann frisst es der Berg.', beat('4.4'), { once: true, priority: 10 }),
  say('marlene.k4.ruf', 'marlene', '{name}? {name}! Die Suppe wird kalt!', beat('4.4-ruf'), { once: true }),
  say('laub.k4.napoleon', 'laub', 'Ein paar Jahre später, unter Napoleon, bekommt die Witwe des Herzogs die Ruine zurück. Unter einer Bedingung: abreißen, bis auf den Grund. Wieder aufbauen wollte niemand. Verkauft wurde ohnehin schon. Und aufgeforstet hat man erst, als nichts mehr zu sehen war.', found('clue.k4.napoleon'), { once: true, src: [src('RLS', 'P')] }),
  // 4.5 Gräben
  say('laub.k4.graben', 'laub', 'Ein Ausbruchgraben. Wenn man eine Mauer bis auf den letzten Stein herausholt, bleibt ein Graben in ihrer Form. Die ‚Mauerzüge‘, die Sie im Scan sehen, sind keine Mauern. Es sind die Löcher, in denen Mauern waren. Ich habe hier die Seite gefunden. In so einem Loch.', found('clue.k4.graben'), { once: true, src: [src('LIDAR', 'KB-06')] }),
  // 4.6 Brunnen, Echo 1840
  ...seq(echo('clue.k4.laub_1840'), [
    ['echo.k4.laub_1840.01', 'laub', 'Standpunkt siebzehn. Richtung Ruine, hundertneunundneunzig Grad und …'],
    ['echo.k4.laub_1840.02', 'geraeusch', '[Horn, fern: ein langer Ton]'],
    ['echo.k4.laub_1840.03', 'laub', 'Jäger? Um die Zeit? Es ist keine Jagd angesagt. Ich hätte das wissen müssen, ich habe die Liste.'],
    ['echo.k4.laub_1840.04', 'geraeusch', '[Knurren, ringsum]'],
    ['echo.k4.laub_1840.05', 'stimme', 'Leg dich hin.'],
    ['echo.k4.laub_1840.06', 'laub', 'Ich bin königlich bayerischer Geometer. Ich lege mich nicht in den Dreck.'],
    ['echo.k4.laub_1840.07', 'stimme', 'Leg dich hin. Bitte.'],
    ['echo.k4.laub_1840.08', 'geraeusch', '[Laufschritte, immer leiser]'],
  ]),
  say('laub.k4.gestaendnis_2', 'laub', 'Sie haben es gesehen. Ich habe mich nicht hingelegt. Ich dachte, sie reißen mich. Sie wollten mich stellen, und ich bin gerannt, in den Nebel hinein, zu weit, bis dahin, wo nichts mehr ist. Seitdem bin ich in diesem Messing. Mein Tagegeld für den letzten Tag ist übrigens auch noch offen.', beat('4.6'), { once: true, priority: 10 }),
  // 4.7 Die Meute treibt
  say('laub.k4.erkenntnis', 'laub', 'Sehen Sie, wo sie stehen? Nicht vor Ihnen. Zwischen Ihnen und dem Grau. Die jagen Sie nicht. Die treiben Sie.', beat('4.7'), { once: true, priority: 10 }),
  say('laub.k4.heimgebracht', 'laub', 'Sehen Sie? Nichts verloren. Nie gewesen, wenn man’s genau nimmt. Nur zurückgebracht.', { event: 'player:caught', by: 'pack', flag: 'flag.k4_kein_verlust' }, { once: true, priority: 10 }),
  say('laub.k4.herr', 'laub', 'Vielleicht suchen sie nur ihren Herrn. Der ist nach Mannheim gefahren und hat keinem gesagt, dass die Jagd vorbei ist.', beat('4.7', { step: 2 }), { once: true }),
  say('laub.k4.abgeblasen', 'laub', 'Eine Jagd, die keiner abbläst, hört nicht auf. Das steht in keinem Reglement. Aber es steht in jeder Sage.', beat('4.7', { step: 3 }), { once: true }),
  // 4.8 Optional visit to the spring
  say('laub.k4.noch_nicht', 'laub', 'Noch nicht. Wir wissen noch nicht genug, um uns hinzulegen.', beat('4.8-gesperrt'), { priority: 5 }),
  say('laub.k4.weiter', 'laub', 'Weiter.', beat('4.bestaetigt-1'), { once: true }),
  // 4.9 Zwinger: Finale (W8)
  say('laub.k4.zwingerhaus', 'laub', 'Vom Zwingerhaus steht heute ein Rest im Relief, ein Rechteck, eine Kante. Kein Haus. Der Eiskeller ist ein Loch mit einem Ring. Stehen geblieben ist nur das Lager.', found('clue.k4.zwingerhaus'), { once: true, src: [src('LIDAR', 'KB-B23/KB-B35'), src('WP-SK', 'P')] }),
  say('beat.k4.sammeln', 'geraeusch', '[Horn: Sammeln]', beat('4.9', { step: 1 }), { once: true }),
  say('laub.k4.finale_1', 'laub', 'Jetzt. Hinlegen. Und machen Sie das Licht an. Die sollen sehen, dass wir nicht weglaufen.', beat('4.9', { step: 2 }), { once: true, priority: 10 }),
  say('laub.k4.nicht_noch_einmal', 'laub', 'Nicht noch einmal. Bitte.', beat('4.9-weggerannt'), { priority: 10 }),
  say('beat.k4.hinlegen', 'geraeusch', '[Hufschlag, fern. Dann Stille]', beat('4.9-hingelegt', { step: 1 }), { once: true }),
  say('laub.k4.finale_2', 'laub', '… Dann leg ich mich auch hin. Hundertfünfundachtzig Jahre zu spät. Oder sechsundachtzig, je nachdem, welches Jahr Sie haben. Pünktlich ist auch nur ein Wort.', beat('4.9-hingelegt', { step: 2 }), { once: true }),
  // the old Pikeur (npc 'pikeur', ghost at the kennel after the finale): a conversation, the horn last
  say('jost.k4.01', 'jost', 'Du riechst immer noch nach Regen von morgen. Jetzt weiß ich, warum. Du kommst von morgen.', talk('pikeur', 'greet'), { once: true }),
  say('jost.k4.02', 'jost', 'Die Meute reißt nicht. Sie stellt. Das hab ich dir gesagt, da war ich dreizehn.', talk('pikeur', 'stellen')),
  say('jost.k4.03', 'jost', 'Ich hab sie rausgelassen, in der Nacht vom Feuer. Dann bin ich ihnen nach. Ich hab sie nie wieder eingefangen. Wer nicht abgeblasen wird, läuft weiter. Und ich bin mitgelaufen.', talk('pikeur', 'meute')),
  say('jost.k4.04', 'jost', 'Was keiner mehr weiß, frisst der Berg. Wer zu lang drin ist in dem, was keiner mehr weiß, den frisst er mit. Wir haben jeden heimgetrieben, bevor es so weit war. Jeden.', talk('pikeur', 'berg', { step: 1 })),
  say('jost.k4.05', 'jost', 'Nur den Geometer nicht. Der hat sich nicht hingelegt.', talk('pikeur', 'berg', { step: 2 })),
  say('jost.k4.06', 'jost', 'Jetzt haben sie Namen. Gut. Diane. Sultan. Fanfare. Rauhreif. Bijou. Jetzt hat sie einer beim Namen genannt, der nicht ich bin.', talk('pikeur', 'namen')),
  say('jost.k4.07', 'jost', 'Da. Abblasen musst du. Ich kann’s nicht. Ich hab’s nie gelernt, ich kann nur anblasen.', talk('pikeur', 'bye')),
  say('jost.k4.08', 'jost', 'Die Chronik ist voll, glaub ich. Was du damit machst, ist deine Sache. Ich hab nur aufgepasst.', beat('4.9-horn'), { once: true }),
  // After the finale, at the spring
  say('laub.k4.nur_steine', 'laub', 'Die Steine in Homburg? Das sind nur Steine. Was daran hängt, hängen wir dran.', found('clue.k4.nur_steine'), { once: true }),
  say('marlene.k4.foto', 'marlene', 'Guck. Mein Schwager hat mir das geschickt. Der Stein über seiner Kellertür in der Altstadt. Da ist so ein komisches Zeichen drauf. Ein Winkel mit drei Punkten. Sagt dir das was?', found('clue.k4.foto'), { once: true }),
];

write('kapitel-4', {
  pack: 'kapitel-4',
  // the Pikeur of the finale takes off his hat: Jost, old (npc 'pikeur', generic ghost without hat)
  speakers: [{ id: 'pikeur', name_de: 'Jost', historical: false }],
  nouns,
  clues,
  cases,
  dialogue,
  hints: hints('case.k4', ch, [
    'Zahlen. Die Pächter zählt der Kanzlist am Baumagazin, die Schulden stehen am Pfeiler im Ehrenhof. Verwechseln Sie nicht, was gebaut, was eingenommen und was geschuldet wurde. Das waren drei verschiedene Unglücke.',
    'Woher kamen die Steine? Schauen Sie vom Westrand aus nach Südwesten. Das Holz kam aus einem anderen Schloss, die Steine von einer Burg. Und was heute noch steht, sehen Sie unten im Tal, wenn Sie den Leuten mit den Karren zusehen.',
    'Die Mauerzüge im Scan. Gehen Sie zu den Gräben am Küchenhof, einmal 1796 und einmal heute. Was die Männer dort zurücklassen, haben Sie im Prolog schon im Handbuch gesehen.',
  ]),
});
