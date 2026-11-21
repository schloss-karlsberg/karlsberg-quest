import { writeFileSync } from 'node:fs';
import { clue, noun, say, seq, hints, src, write, Z, P, ROOT } from './common.mjs';

const ch = 'k2';
const E = '1793-02';
const KAB = 'B01.1.eg-kabinett';
// Marlene's notes at home: since the tour bridge (WP-01) at the Karlsbergquelle, across the trail
// south-west of the trough (quelle/layout.ts local u 0, w 12), r 8: the spawn (1059.3/−833.1) and
// the trough's E zone (HOME.troughR) stay outside, the story grants them anyway
const STATION = [1051.3, -827.4];
const ORANG = [1275, -960]; // Orangeriehof / -parterre (TF-06, TF-15)
const EH = [1205, -1115];
const WACHE = [1180, -1120]; // east side of Wachhaus Nord (KB-B38), at the gate
const WACHBUCH = [1179.5, -1123.5];
const ABFAHRT = [1212, -1117]; // inside the court, behind the gate

const clues = [
  clue('clue.k2.marlene', {
    title: 'Marlene erzählt vom Warner', kind: 'dialogue', at: STATION, r: 8, era: 'today', anchor: 'loc.quelle', chapter: ch, fiction: false,
    text: 'Marlene bringt Kaffee und erzählt von einem Bauern aus Rohrbach.', nouns: ['n.pfeiffer', 'n.3_februar'],
  }),
  clue('clue.k2.zaun', {
    title: 'Ein Fetzen am Parkzaun', kind: 'object', at: [1672, -408], r: 5, era: E, anchor: 'KB-B84', chapter: ch, fiction: true, lantern: true,
    text: 'Ein Fetzen graubrauner Wolle an einer Zaunlatte. Auf der Parkseite Fußspuren im Raureif, tief und weit auseinander: Da ist jemand gerannt. Kein Tor in der Nähe. (Die Spur leuchtet schwach im Relief-Blick; ihr Laufweg ist erfunden.)',
    nouns: ['n.parkzaun'],
  }),
  clue('clue.k2.orangerie', {
    title: 'Erinnerung: Gepackte Wagen', kind: 'echo', at: ORANG, r: 30, era: E, anchor: 'TF-15', chapter: ch, fiction: true,
    text: 'In Mannlichs Fenstern brennt Licht. Unten im Hof werden Kisten auf einen Wagen geladen. Automatisch auf dem Hinweg.',
    nouns: ['n.mannheim'],
  }),
  // the guardhouse KB-B38 is solid: the fire pan and the table stand at its east side, at the mouth of the court
  clue('clue.k2.wache', {
    title: 'Erinnerung: Die Wache am Feuer', kind: 'echo', at: WACHE, r: 8, era: E, anchor: 'KB-B38', chapter: ch, fiction: true,
    text: 'Ein Wachfeuer in einer Eisenpfanne am nördlichen Wachhaus. Hinter dem Gitter steht der Hof voller Wagen.',
    nouns: ['n.ehrenhofgitter', 'n.wachfeuer'],
    // the echo only exists once the Irrlichter are banned (story rule k2_4-frei sets the flag)
    req: { flags: ['k2.wache_frei'] },
  }),
  clue('clue.k2.wachbuch', {
    title: 'Das Wachbuch', kind: 'document', at: WACHBUCH, r: 4, era: E, anchor: 'KB-B38', chapter: ch, fiction: true,
    text: 'Ein aufgeschlagenes Wachbuch. Die letzte Zeile in einer zittrigen Hand: „Sambstag d. 9ten Febr. 1793. Gegen 8 Uhr ein Bauer, außer Athem, wollte zu Serenissimo. Dem Leibjäger übergeben.“ (Wortlaut erfunden; das Datum notierte Regierungsrat Horstmann.)',
    nouns: ['n.9_februar', 'n.schuegens'],
  }),
  clue('clue.k2.horstmann', {
    title: 'Der Regierungsrat Horstmann', kind: 'dialogue', at: WACHBUCH, r: 4, era: E, anchor: 'KB-B38', chapter: ch, fiction: false,
    text: 'Laub beim Lesen des Wachbuchs.', nouns: ['n.9_februar'], req: { clues: ['clue.k2.wachbuch'] },
  }),
  clue('clue.k2.gaertnerei', {
    title: 'Die Mauer der Gärtnerei', kind: 'object', at: [1266, -1320], r: 8, era: E, anchor: 'KB-B27', chapter: ch, fiction: true,
    text: 'Eine mannshohe Mauer, oben glatt und vereist. Keine Spuren davor. (Nur, wenn man von der Spur abweicht.)',
    nouns: ['n.gartenmauer'],
  }),
  clue('clue.k2.soll', {
    title: 'Kerzenlicht in der Galerie', kind: 'object', at: [1205, -1207], r: 6, era: E, anchor: 'KB-B06', chapter: ch, fiction: true,
    text: 'Durch die Fenster der Bildergalerie fällt ein einzelnes Kerzenlicht. Drinnen kniet Gottlob Soll am Westende und hebt ein Bodenbrett neben der Falltür des Büchsenmachers an. Er legt ein graues Buch hinein und klopft das Brett mit dem Handballen fest. Er sieht dich nicht. (Optional.)',
    flags: ['flag.k2_versteck_gesehen'],
  }),
  clue('clue.k2.warnung', {
    title: 'Erinnerung: Die Warnung', kind: 'echo', room: KAB, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Durch den Türspalt des Schreibkabinetts, bei einer Kerze: Der Herzog sitzt am Schreibtisch und hustet. Hofrat Schügens meldet einen Bauern, der durch den Wald gekommen ist: Französische Kavallerie sucht einen Führer, auf Umwegen, nachts wollen sie am Karlsberg sein. Der Herzog hält es für unglaubwürdig, der Mann wolle ein paar Taler verdienen, man gebe ihm einen Dukaten. Der Leibarzt Rose empfiehlt Bett und Tee. Dann Pfeffel: Es sei nur zu wahr, ein Anschlag gegen die Person des Herzogs, er beschwöre ihn, abzufahren. Der Herzog: Da wir abreisen müssen, so wollen wir es tun. Abbé Salabert soll mit. Nikel Pfeiffer ist nicht im Raum, er wartet unten.',
    nouns: ['n.unglaubwuerdig', 'n.nur_zu_wahr', 'n.anschlag', 'n.dukaten', 'n.taler', 'n.pfeffel', 'n.salabert', 'n.r_lohn', 'n.schuegens', 'n.parkzaun'],
  }),
  clue('clue.k2.abschied', {
    title: 'Erinnerung: Der Abschied', kind: 'echo', room: KAB, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Durch den anderen Türspalt: Der Herzog steht auf, nimmt etwas vom Tisch und sagt zu Mannlich, er lasse ihn hier, um über die Galerie zu wachen, das Naturalienkabinett, die Bibliothek. „Adieu, mein lieber Mannlich, ich hoffe Ihn bald wiederzusehen.“ Schritte, dann ist der Raum leer.',
    nouns: ['n.galerie_sammlung', 'n.naturalienkabinett', 'n.bibliothek', 'n.ende_februar'], req: { clues: ['clue.k2.warnung'] },
  }),
  clue('clue.k2.jagdmesser', {
    title: 'Ein leerer Umriss im Staub', kind: 'object', room: KAB, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Ein Tisch, auf dem ein Gegenstand fehlt: ein heller Umriss im Staub, schmal und gebogen. Daneben ein Stapel Papiere, aus dem die obersten fehlen.',
    flags: ['flag.k2_jagdmesser_gesehen'], req: { clues: ['clue.k2.abschied'] },
  }),
  clue('clue.k2.fackeln', {
    title: 'Erinnerung: Fackeln bei der Abfahrt', kind: 'echo', at: ABFAHRT, r: 30, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Diener mit Fackeln laufen neben den ersten Wagen her, bis zur Allee, und kommen ohne sie zurück. (Erfunden; angeregt von einer unbelegten Lokalüberlieferung.)',
    nouns: ['n.fackeln'], req: { clues: ['clue.k2.abschied'] },
  }),
  clue('clue.k2.esebeck', {
    title: 'Der Minister bleibt', kind: 'dialogue', at: EH, r: 30, era: E, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Laub nach der Abfahrt.', nouns: ['n.25_februar'], req: { clues: ['clue.k2.fackeln'] },
  }),
  clue('clue.k2.hanne', {
    title: 'Hanne am Gitter', kind: 'dialogue', at: [1198, -1112], r: 8, era: E, anchor: 'KB-B39', chapter: ch, fiction: true,
    text: 'Hanne steht am Gitter und sieht den Wagen nach.', nouns: ['n.r_geschwiegen', 'n.r_dorf'], req: { clues: ['clue.k2.abschied'] },
  }),
  clue('clue.k2.jost', {
    title: 'Jost kommt vom Zwinger', kind: 'dialogue', at: [1205, -1125], r: 8, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Jost, jetzt siebzehn, kommt vom Zwinger gelaufen.', nouns: ['n.r_angst', 'n.r_gefuehrt'], req: { clues: ['clue.k2.abschied'] },
  }),
  clue('clue.k2.landremont', {
    title: 'Erinnerung: „Das sind Kalköfen“', kind: 'echo', at: ORANG, r: 30, era: E, anchor: 'TF-15', chapter: ch, fiction: true,
    text: 'Während der Jagd, am Orangerie-Parterre (8 s, die Meute hält inne). Ein Reiter mit gezogenem Säbel, weitere Reiter hinter ihm. Ein Mann mit einem Werkzeugsack geht ruhig vorbei. Die Kamera schwenkt den Hang hinab: Zwischen den Bäumen schwanken Lichter.',
    nouns: ['n.kalkoefen'], req: { clues: ['clue.k2.fackeln'] },
  }),
  clue('clue.k2.laterne', {
    title: 'Eines der Lichter', kind: 'dialogue', at: ORANG, r: 30, era: E, anchor: 'portable', chapter: ch, fiction: true,
    text: 'Eines der Lichter unten im Wald ist deine Laterne von vorhin, oder, wenn du am Tor geleuchtet hast, die Laternen der Wagen im Nebel. (Automatisch nach dem Echo.)',
    nouns: ['n.r_laterne'], req: { clues: ['clue.k2.landremont'] },
  }),
  clue('clue.k2.koehler', {
    title: 'Ein Köhlerplatz am Hang', kind: 'relief', at: [1150, -935], r: 15, era: E, anchor: 'rm.03', chapter: ch, fiction: true,
    text: 'Am Hang unterhalb der Orangerie eine runde, ebene Fläche mit schwarzer Erde. (Motiv; ein bestimmter Meilerplatz ist nicht belegt.)',
    nouns: ['n.koehlermeiler'], facts: ['rm.03'],
  }),
  clue('clue.k2.laub_treue', {
    title: 'Laub über den Warner', kind: 'dialogue', at: STATION, r: 8, era: 'today', anchor: 'loc.quelle', chapter: ch, fiction: true,
    text: 'Laub an der Quelle, nach dem ersten Wechsel.', nouns: ['n.r_treu', 'n.r_gewarnt'], req: { clues: ['clue.k2.warnung'] },
  }),
];

const nouns = [
  noun('n.9_februar', '9. Februar', 'time'),
  noun('n.3_februar', '3. Februar', 'time'),
  noun('n.ende_februar', 'Ende Februar', 'time'),
  noun('n.25_februar', '25. Februar', 'time'),
  noun('n.pfeiffer', 'Nikel Pfeiffer', 'person'),
  noun('n.schuegens', 'Schügens, der Leibjäger', 'person'),
  noun('n.pfeffel', 'Pfeffel', 'person'),
  noun('n.salabert', 'Abbé Salabert', 'person'),
  noun('n.parkzaun', 'den Parkzaun', 'place'),
  noun('n.ehrenhofgitter', 'das Ehrenhofgitter', 'place'),
  noun('n.gartenmauer', 'die Gartenmauer', 'place'),
  noun('n.unglaubwuerdig', 'unglaubwürdig', 'action'),
  noun('n.nur_zu_wahr', 'nur zu wahr', 'action'),
  noun('n.anschlag', 'einen perfiden Anschlag', 'action'),
  noun('n.dukaten', 'Dukaten', 'object'),
  noun('n.taler', 'Taler', 'object'),
  noun('n.galerie_sammlung', 'Galerie', 'object'),
  noun('n.naturalienkabinett', 'Naturalienkabinett', 'object'),
  noun('n.bibliothek', 'Bibliothek', 'object'),
  noun('n.kalkoefen', 'Kalköfen', 'object'),
  noun('n.fackeln', 'Fackeln', 'object'),
  noun('n.wachfeuer', 'Wachfeuer', 'object'),
  noun('n.koehlermeiler', 'Köhlermeiler', 'object'),
  noun('n.r_laterne', 'meine Laterne', 'object'),
  noun('n.mannheim', 'Mannheim', 'place'),
  noun('n.r_treu', 'er dem Herzog treu war', 'cause'),
  noun('n.r_dorf', 'er sein Dorf schützen wollte', 'cause'),
  noun('n.r_lohn', 'er auf Lohn hoffte', 'cause'),
  noun('n.r_angst', 'er Angst hatte', 'cause'),
  noun('n.r_gewarnt', 'ihn auch gewarnt', 'action'),
  noun('n.r_geschwiegen', 'geschwiegen', 'action'),
  noun('n.r_gefuehrt', 'die Reiter geführt', 'action'),
];

const cases = [{
  id: 'case.k2',
  title_de: 'Die Flucht',
  intro_de: 'Nacht vom 9. auf den 10. Februar 1793. Wer hat gewarnt, und wem hat es genützt?',
  entries: [
    { id: 'entry.k2.1', kind: 'fact', factId: 'cx.17', text_de: 'Nach den Notizen des Regierungsrats Horstmann floh der Herzog in der Nacht {wann} 1793.',
      blanks: [{ id: 'wann', category: 'time', correct: 'n.9_februar', accepts: ['n.9_februar', 'n.3_februar', 'n.ende_februar', 'n.25_februar'],
        labels_de: { 'n.9_februar': 'des 9. Februar', 'n.3_februar': 'des 3. Februar', 'n.ende_februar': 'gegen Ende Februar', 'n.25_februar': 'des 25. Februar' } }] },
    { id: 'entry.k2.2', kind: 'fact', factId: 'cx.16', text_de: 'Gewarnt wurde der Herzog von einem Bauern aus Rohrbach: {wer}.',
      blanks: [{ id: 'wer', category: 'person', correct: 'n.pfeiffer', accepts: ['n.pfeiffer', 'n.schuegens', 'n.pfeffel', 'n.salabert'] }] },
    { id: 'entry.k2.3', kind: 'fact', factId: 'cx.16', text_de: 'Um schneller ans Ziel zu kommen, kletterte der Bauer über {wo}.',
      blanks: [{ id: 'wo', category: 'place', correct: 'n.parkzaun', accepts: ['n.parkzaun', 'n.ehrenhofgitter', 'n.gartenmauer'] }] },
    { id: 'entry.k2.4', kind: 'fact', factId: 'cx.16', text_de: 'Der Herzog nannte die Nachricht zuerst {wie} und wollte dem Bauern einen {was} geben.',
      blanks: [
        { id: 'wie', category: 'action', correct: 'n.unglaubwuerdig', accepts: ['n.unglaubwuerdig', 'n.nur_zu_wahr', 'n.anschlag'] },
        { id: 'was', category: 'object', correct: 'n.dukaten', accepts: ['n.dukaten', 'n.taler', 'n.gulden', 'n.louisdor'] },
      ] },
    { id: 'entry.k2.5', kind: 'fact', factId: 'cx.18', text_de: 'Beim Abschied ließ der Herzog Mannlich zurück, um vor allem über {was} zu wachen.',
      blanks: [{ id: 'was', category: 'object', correct: 'n.galerie_sammlung', accepts: ['n.galerie_sammlung', 'n.naturalienkabinett', 'n.bibliothek'],
        labels_de: { 'n.galerie_sammlung': 'seine Galerie', 'n.naturalienkabinett': 'sein Naturalienkabinett', 'n.bibliothek': 'seine Bibliothek' } }] },
    { id: 'entry.k2.6', kind: 'fact', factId: 'cx.19', text_de: 'Als der General nach den Feuern im Wald fragte, antwortete ein Handwerker: ‚Das sind {was}.‘',
      blanks: [{ id: 'was', category: 'object', correct: 'n.kalkoefen', accepts: ['n.kalkoefen', 'n.fackeln', 'n.wachfeuer', 'n.koehlermeiler'] }] },
    { id: 'entry.k2.7', kind: 'reading', flag: 'flag.k2_lichter', text_de: 'Die Lichter im Wald waren in Wahrheit {was}.',
      blanks: [{ id: 'was', accepts: ['n.kalkoefen', 'n.fackeln', 'n.wachfeuer', 'n.r_laterne'] }] },
    { id: 'entry.k2.8', kind: 'reading', flag: 'flag.k2_pfeiffer', text_de: 'Nikel Pfeiffer rannte durch die Nacht, weil {warum}.',
      blanks: [{ id: 'warum', accepts: ['n.r_treu', 'n.r_dorf', 'n.r_lohn', 'n.r_angst'] }] },
    { id: 'entry.k2.9', kind: 'reading', flag: 'flag.k2_stelle', text_de: 'An seiner Stelle hätte ich {wie}.',
      blanks: [{ id: 'wie', accepts: ['n.r_gewarnt', 'n.r_geschwiegen', 'n.r_gefuehrt'] }] },
  ],
}];

const beat = (b, x = {}) => ({ event: 'story:beat', chapter: ch, beat: b, ...x });
const found = (id, x = {}) => ({ event: 'clue:found', id, ...x });
const talk = (npc, topic, x = {}) => ({ event: 'npc:talk', npc, chapter: ch, topic, ...x });
const echo = (id) => ({ event: 'echo:start', id });

const dialogue = [
  // Feldstation
  say('marlene.k2.morgen', 'marlene', 'Morgen. Frost heute Nacht, die Pfützen sind zu. Deine Bussole war beschlagen, von innen. Das geht doch gar nicht.', { event: 'story:chapter', id: ch }, { once: true }),
  ...seq(found('clue.k2.marlene'), [
    ['marlene.k2.pfeiffer', 'marlene', 'Rohrbach? Da kommt mein Schwager her. Die haben da einen Nikel Pfeiffer, Bauer und Postbote, der den Herzog gewarnt haben soll. Im Internet steht einmal der neunte Februar und einmal der dritte. Such dir einen aus.', [src('WP-K2A', 'P'), src('ADB', 'P')]],
    ['marlene.k2.rohrbach', 'marlene', 'In Rohrbach gibt’s, glaub ich, eine Straße, die nach ihm heißt. Ich müsste meinen Schwager fragen. Der weiß auch nicht alles, sagt aber alles.'],
  ]),
  say('laub.k2.start', 'laub', 'Februar. Ich mag den Februar nicht. Im November geht man verloren, im Februar wird man gesucht.', beat('2.0'), { once: true }),
  // Parkzaun, Allee
  say('laub.k2.zaun', 'laub', 'Über den Zaun. Nicht durchs Tor. Wer durchs Tor geht, muss erklären, wer er ist.', found('clue.k2.zaun'), { once: true }),
  say('laub.k2.richtung', 'laub', 'Rohrbach liegt im Südwesten. Die Spur kommt aus dem Südosten. Entweder hat er einen Umweg gemacht, oder die Erinnerung. Erinnerungen nehmen gern den schönen Weg.', beat('2.1'), { once: true }),
  say('laub.k2.augen', 'laub', 'Nicht bewegen. Licht aus. Die sehen das Licht, nicht Sie.', beat('2.2'), { once: true, priority: 10 }),
  // Orangerie
  ...seq(echo('clue.k2.orangerie'), [
    ['echo.k2.orangerie.01', 'diener', 'Die Wagen sind gepackt, seit drei Tagen schon. Und Pferde zum Wechseln stehen auf dem ganzen Weg nach Mannheim.', [P('S. 422')]],
    ['echo.k2.orangerie.02', 'diener2', 'Und der Herzog?'],
    ['echo.k2.orangerie.03', 'diener', 'Hat Schnupfen.', [P('S. 422: „starkem Schnupfen mit etwas Fieber“')]],
  ]),
  // Wachhaus
  ...seq(echo('clue.k2.wache'), [
    ['echo.k2.wache.01', 'wache', 'Ein Bauer, ganz außer Atem. Kam nicht durchs Gitter, kam von hinten aus dem Park.'],
    ['echo.k2.wache.02', 'wache2', 'Und?'],
    ['echo.k2.wache.03', 'wache', 'Der Leibjäger hat ihn hinaufgebracht. Wenn’s ein Spinner ist, kriegt er einen Tritt. Wenn’s keiner ist, kriegen wir einen.'],
    ['echo.k2.wache.04', 'wache2', 'Leg Holz nach. Das Wachfeuer sieht man bis Homburg, dann wissen die wenigstens, dass wir wach sind.'],
  ]),
  say('laub.k2.wache', 'laub', 'Ein Wachfeuer im Ehrenhof. Damit der Feind weiß, wo er hinmuss.', found('clue.k2.wache'), { once: true }),
  say('laub.k2.horstmann', 'laub', 'Horstmann schreibt am selben Abend, Mannlich Jahre später und schöner. Ich glaube dem, der am selben Abend schreibt.', found('clue.k2.horstmann'), { once: true, src: [src('M1910', 'S. 422 und S. 427 Anm. 1')] }),
  say('laub.k2.gaertnerei', 'laub', 'Hier ist er nicht drüber. Zu glatt, zu hoch. Gärtner bauen bessere Mauern als Herzöge Zäune.', found('clue.k2.gaertnerei'), { once: true }),
  // Schreibkabinett: Warnung und Abschied in einem Blick durch den Türspalt (playtest round 4:
  // 68 s Zuhören an der Tür → unter 20 s; die ganze Stelle steht auf der Karte und im Codex).
  // Historische Personen: nur M1910, gekürzt.
  ...seq(echo('clue.k2.warnung'), [
    ['echo.k2.warnung.01', 'schuegens', 'Ein Bauer, Durchlaucht. Französische Reiter im Wald, nachts sind sie hier.', [P('S. 422 f., gekürzt')]],
    ['herzog.01', 'herzog', 'Unglaubwürdig. Gib ihm einen Dukaten!', [Z('S. 423, gekürzt')]],
    ['echo.k2.warnung.05', 'pfeffel', 'Es ist nur zu wahr! Abfahren, Durchlaucht, sofort!', [P('S. 423, gekürzt')]],
  ]),
  ...seq(found('clue.k2.warnung'), [
    ['laub.k2.schnupfen', 'laub', 'Der Leibarzt hat ihm übrigens Bett und Tee verschrieben. Die Kavallerie kommt durch den Wald, und der Arzt verschreibt Bett und Tee.', [P('S. 423: „der noch beim Weggehen Bett und Tee empfahl“')]],
    ['laub.k2.dukat', 'laub', 'Einen Dukaten für den Mann, der ihm das Leben rettet. Hanne hat für den Lohn ihres Mannes nicht mal einen Gulden bekommen. Sie sehen, der Herzog konnte großzügig sein.'],
  ]),
  // Schreibkabinett: Abschied (der andere Türspalt)
  ...seq(echo('clue.k2.abschied'), [
    ['herzog.05', 'herzog', 'Adieu, mein lieber Mannlich. Er wache über meine Galerie.', [Z('S. 423 f., gekürzt')]],
  ]),
  say('laub.k2.sichern', 'laub', 'Wenn Sie jetzt zurückgehen, behalten Sie, was Sie gefunden haben. Wenn Sie bleiben, sehen Sie die Abfahrt. Ich würde zurückgehen. Ich bin damals geblieben.', found('clue.k2.abschied'), { once: true }),
  ...seq(found('clue.k2.jagdmesser'), [
    ['laub.k2.jagdmesser', 'laub', 'Er hat ein kleines Jagdmesser mitgenommen. Für die Reise.', [P('S. 423 f.')]],
    ['laub.k2.jagdmesser.b', 'laub', 'Von seinen tausend Hunden hat er keinen mitgenommen.'],
  ]),
  // Abfahrt: Hanne, Jost
  say('hanne.k2.01', 'hanne', 'Da fährt er. Mit Schnupfen, hab ich gehört. Wir bleiben mit allem anderen hier.', talk('hanne', 'greet'), { once: true }),
  say('hanne.k2.02', 'hanne', 'Der Bauer, der ihn gewarnt hat, sitzt unten in der Küche und kriegt eine Suppe. Einen Dukaten soll er kriegen. Ob er den kriegt, wird man sehen.', talk('hanne', 'bauer')),
  say('hanne.k2.03', 'hanne', 'Ich hätt geschwiegen. Was hat der für uns getan? Aber ich bin auch nicht durch den Wald gerannt. Wer rennt, entscheidet.', talk('hanne', 'warnen')),
  say('hanne.k2.04', 'hanne', 'Die aus Rohrbach haben Angst gehabt, dass die Reiter durchs Dorf kommen und alles mitnehmen. Ich glaub, der ist gerannt, damit sie schneller wieder weg sind.', talk('hanne', 'rohrbach')),
  say('hanne.k2.05', 'hanne', 'Mein Peter schläft. Gut so. Der soll sich das nicht merken.', talk('hanne', 'peter')),
  say('hanne.k2.06', 'hanne', 'Der Kanzlist war vorhin in der Galerie. Mit einer Kerze, um die Zeit. Der hat was versteckt. Ich frag nicht, was.', talk('hanne', 'galerie', { flag: 'flag.k2_versteck_gesehen' })),
  say('jost.k2.01', 'jost', 'Du schon wieder. Du riechst immer noch nach Regen von morgen.', talk('jost', 'greet'), { once: true }),
  say('jost.k2.02', 'jost', 'Der Bauer? Der hatte Angst, das hab ich gesehen. Wer Angst hat, rennt schneller als einer, der treu ist.', talk('jost', 'bauer')),
  say('jost.k2.03', 'jost', 'Die Reiter wollten einen aus dem Dorf, der sie führt. Hätte er ja machen können. Für Geld. Hat er nicht.', talk('jost', 'fuehrer'), { src: [P('S. 423: „einen Führer verlangt“')] }),
  // Abfahrt: Fackeln (Erinnerung, erfunden)
  ...seq(echo('clue.k2.fackeln'), [
    ['echo.k2.fackeln.01', 'geraeusch', '[Räder im Raureif]'],
    ['echo.k2.fackeln.02', 'diener', 'Fackeln an die ersten Wagen! Bis zur Allee, dann zurück.'],
    ['echo.k2.fackeln.03', 'diener2', 'Und die Fackeln?'],
    ['echo.k2.fackeln.04', 'diener', 'Die nimmt er mit. Wir bleiben.'],
    ['echo.k2.fackeln.05', 'geraeusch', '[Hufschlag, leiser]'],
  ]),
  say('laub.k2.esebeck', 'laub', 'Der Minister Esebeck bleibt. Am 25. Februar holen sie ihn ab, die Sansculotten vorn und hinten als Eskorte. Er kommt im September zurück.', found('clue.k2.esebeck'), { once: true, src: [P('S. 437 mit Anm. 10')] }),
  // Die Parforcejagd (2.8)
  ...seq(beat('2.8'), [
    ['jost.k2.04', 'jost', 'Und die Hunde? Hat er was von den Hunden gesagt?'],
    ['jost.k2.05', 'jost', 'Wer bläst ab, wenn er nicht da ist?'],
    ['jost.k2.06', 'jost', 'Das bin nicht ich. Lauf.'],
    ['laub.k2.pikeur', 'laub', 'Ein Pikeur. Der führt die Meute. Er hat kein Gesicht, oder er zeigt es nicht. Laufen Sie trotzdem.'],
  ]),
  // W4
  ...seq(echo('clue.k2.landremont'), [
    ['echo.k2.landremont.01', 'landremont', 'Was bedeuten denn die Feuer, die ich dort unten im Walde habe leuchten sehen?', [Z('S. 427 f.')]],
    ['echo.k2.landremont.02', 'handwerker', 'Das sind Kalköfen.', [Z('S. 428')]],
    ['echo.k2.landremont.03', 'geraeusch', '[Galopp]'],
  ]),
  say('laub.k2.koehler', 'laub', 'Ein Köhlermeiler. Die gibt es hier überall im Wald. Ein Meiler glimmt, er leuchtet nicht. Aber der General kommt aus Saarbrücken, was weiß der.', found('clue.k2.koehler'), { once: true }),
  say('laub.k2.keller', 'laub', 'Hier unten bleibt man, bis man vergessen wird. Raus.', beat('2.10-keller'), { once: true }),
  // Am Damm: the Pikeur stands in the way (Action-RPG); he does not fall, he rides off
  ...seq(beat('2.10-pikeur'), [
    ['laub.k2.damm', 'laub', 'Er ist vor Ihnen da. Natürlich. Der Pikeur kennt den Weg zum Wasser besser als Sie.'],
    ['laub.k2.damm.b', 'laub', 'Bannlicht ins Gesicht, das er nicht zeigt. Dann der Stab. Und bleiben Sie auf dem Damm: Das Wasser ist auf Ihrer Seite.'],
  ]),
  say('laub.k2.damm.weg', 'laub', 'Er reitet. Nicht weg, nur fort. Merken Sie sich den Unterschied, er wird ihn auch nicht vergessen.', beat('2.10-weg'), { once: true }),
  // Am Damm (2.10)
  ...seq(beat('2.10'), [
    ['laub.k2.wasser', 'laub', 'Fließendes Wasser. Darüber kommt er nicht. Das steht in jeder Sage und in keinem Dienstreglement. Heute gilt die Sage.'],
    ['laub.k2.kalkoefen', 'laub', 'Mannlich schreibt, die Antwort habe ihn gefreut. Mich auch.', [P('S. 428')]],
  ]),
  say('laub.k2.tor_licht', 'laub', 'Sie haben ihm heimgeleuchtet. Das war freundlich. Sie wissen, wem.', beat('2.10', { step: 3, flag: 'flag.k2_tor', value: 'leuchten' }), { once: true }),
  say('laub.k2.tor_dunkel', 'laub', 'Sie haben im Dunkeln gestanden. Die Pferde haben Sie trotzdem gesehen. Pferde sehen alles.', beat('2.10', { step: 3, flag: 'flag.k2_tor', value: 'dunkel' }), { once: true }),
  // Feldstation
  say('laub.k2.treue', 'laub', 'Man wird später sagen, er war treu. Vielleicht. Er hätte auch schweigen können. Er hat gewarnt. Mehr wissen wir nicht.', found('clue.k2.laub_treue'), { once: true }),
  say('marlene.k2.abend', 'marlene', 'Du bist ja ganz durchgefroren. Und du riechst nach Pferd. Ich frag nicht.', beat('2.10-zurueck'), { once: true }),
  ...seq(beat('2.11'), [
    ['laub.k2.ende', 'laub', 'Vierundzwanzig Wochen und einen Tag später.'],
    ['laub.k2.ende.b', 'laub', 'Im Juli brennt Stroh am besten.'],
  ]),
  // Laub, Wegweisung (erfunden, für den Spielfluss; gesprochen von der Story-Datei, beat-Trigger sind tot)
  say('laub.k2.weg', 'laub', 'So. Die suchen etwas, das leuchtet. Sehen Sie den hellen Fächer vor jedem Hund? Da hinein nicht. Unten durch, bis zur Hecke.', beat('2.2-weg'), { once: true }),
  say('laub.k2.aufstehen', 'laub', 'Jetzt. Stehen Sie auf, die sind abgezogen. Sie müssen nicht bis Zweibrücken kriechen.', beat('2.2-sicher'), { once: true, priority: 10 }),
  say('laub.k2.lauf', 'laub', 'Gut, dann laufen Sie. Aber richtig. Bis zur Mauer der Orangerie, da kommen sie nicht hinauf.', beat('2.2-lauf'), { once: true }),
  say('laub.k2.gitter', 'laub', 'Zu. Nachts ist das Gitter immer zu, deshalb ist er ja über den Zaun. In den Hof kommt man durch die Flügel. Der Südflügel hat eine Durchfahrt, von der Terrasse aus.', beat('2.5-gitter'), { once: true }),
  say('laub.k2.vestibuel', 'laub', 'Durchs Vestibül, dann durch die Zimmer, bis eine Tür nur angelehnt ist. Leise. Heute Nacht ist hier jeder wach.', beat('2.6'), { once: true }),
  say('laub.k2.tor', 'laub', 'Die Wagen kommen. Sie stehen im Licht oder im Dunkeln, das entscheiden Sie. Ich sage nichts. Noch nicht.', beat('2.7-tor'), { once: true }),
  say('laub.k2.durchfahrt', 'laub', 'Durch die Durchfahrt, auf die Terrasse, dann hinunter. Nicht nach Norden, da kommen sie her.', beat('2.8-durchfahrt'), { once: true }),
  say('laub.k2.hang', 'laub', 'Den Hang hinunter, nach Westen, zum Weiher. Auf dem Damm rauscht der Überlauf.', beat('2.10-hang'), { once: true }),
  say('laub.k2.lichter_licht', 'laub', 'Da unten im Nebel, das sind die Wagenlaternen. Denen haben Sie am Tor geleuchtet. Der General sieht Feuer. Jeder sieht, was er sucht.', found('clue.k2.laterne', { flag: 'flag.k2_tor', value: 'leuchten' }), { once: true }),
  say('laub.k2.lichter_dunkel', 'laub', 'Das Licht da unten, das schwankt: Das ist Ihre Laterne. Die von vorhin, aus der Allee. Fragen Sie nicht, wie. Erinnerungen räumen nicht auf.', found('clue.k2.laterne', { flag: 'flag.k2_tor', value: 'dunkel' }), { once: true }),
  say('laub.k2.spur_ende', 'laub', 'Hier hört seine Spur auf. Ab hier hat ihn jemand geführt.', beat('2.4'), { once: true }),
  say('laub.k2.sicher', 'laub', 'Sie sind drüben. Halten Sie Q, bevor er es sich anders überlegt.', beat('2.10-q'), { once: true }),
  say('hanne.k2.07', 'hanne', 'Gehen Sie. Und stellen Sie sich nicht vor die Wagen. Die halten heute für keinen.', talk('hanne', 'bye')),
  say('jost.k2.07', 'jost', 'Ich muss zum Zwinger. Die Hunde sind unruhig, seit die Wagen stehen.', talk('jost', 'bye')),
];

write('kapitel-2', {
  pack: 'kapitel-2',
  nouns,
  clues,
  cases,
  dialogue,
  hints: hints('case.k2', ch, [
    'Ein Datum, ein Name, ein Zaun. Das Datum steht im Wachbuch, der Name nicht. Den Namen kennt man in Rohrbach. Fragen Sie jemanden, der Schwäger hat.',
    'Hören Sie an der Tür des Kabinetts genau hin. Drei Leute reden, aber nur einer davon ist der Herzog. Was die anderen sagen, ist nicht, was er sagt. Und was er zuerst nennt, ist ihm am liebsten.',
    'Der General kommt nach der Abfahrt, nicht vorher. Bleiben Sie im Ehrenhof, bis die Wagen weg sind, und laufen Sie dann zur Orangerie. Sie werden sowieso laufen.',
  ]),
});

// =====================================================================================================
// Quests (docs/ACTION-RPG.md §11.2) → content/quests/02-kapitel-2.quests.json
// February 1793, one night: follow the runner's trail, the guardhouse, the warning, the departure, the
// parforce hunt. The hunt is a threat (run, hide, water); the Pikeur stands at the dam and rides off.
// =====================================================================================================
const ln = (speaker, text, o = {}) => ({ speaker, text, ...(o.fact ? { fact: o.fact } : {}), ...(o.src ? { sources: o.src } : {}) });
const place = (x, z, r, era = E) => ({ x, z, ...(r ? { r } : {}), era });
const spawn = (kind, [x, z], count, radius, extra = {}) => ({ kind, x, z, era: E, count, radius, ...extra });

// Terrain-checked spots (probe.mjs / terrain.mjs, 2026-11-16), all walkable in 1793-02 and outside
// every footprint of that era.
export const K2_SPOTS = {
  allee: [1347, -817], // the Apfelallee on the runner's trail
  wachhaus: [1182, -1122], // in front of the north guardhouse KB-B38
  galerie: [1205, -1205], // under the gallery windows (KB-B06)
  lichter: [[1138, -931], [1040, -902], [1232, -872]], // the lights on the slope below the Orangerie
  kisten: [[1304, -992], [1312, -1000], [1292, -1006], [1320, -984]], // Orangeriehof, the loading yard
  kistenhof: [1310, -995],
  damm: [819, -875], // the dam of the Karlsbergweiher
};
const KS2 = K2_SPOTS;
const LICHT = ['Das erste Licht', 'Das zweite Licht', 'Das dritte Licht'];

const k2Quests = {
  chapter: 'k2',
  items: [
    { id: 'item.k2.kiste', kind: 'quest', name_de: 'Bilderkiste', text_de: 'Eine flache Kiste aus Fichtenholz, mit Stroh ausgeschlagen, oben mit Kreide: „Gal. No.“ und eine Zahl. Schwerer, als sie aussieht.', fact: 'cx.20' },
  ],
  quests: [
    {
      id: 'q.k2.spur', kind: 'main', era: E,
      title_de: 'Die Spur im Raureif',
      summary_de: 'Februar 1793, Nacht. Am Parkzaun hängt ein Fetzen Wolle, und im Raureif läuft eine Spur bergauf: Da ist einer gerannt. Laub will wissen, wohin. Auf halbem Weg hat die Nacht Augen.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [
        ln('laub', 'Zum Parkzaun am Carlsluster Torhaus. Dort Q. Ich will sehen, wer im Februar über einen Zaun klettert.'),
      ],
      progress: [ln('laub', 'Der Spur nach. Wenn Sie ein Horn hören: Licht aus, ducken. Sie kennen das.')],
      turnin_lines: [ln('laub', 'Die Spur geht weiter, zum Wachhaus. Und Mannlich packt. Wer packt, weiß etwas, das die anderen noch nicht wissen.')],
      history: [
        ln('laub', 'Ein Bauer kam atemlos auf den Berg: Französische Reiter suchten in seinem Dorf einen Führer zum Schloss. Er schlich durch seinen Garten in den Wald und kletterte über den Parkzaun. Die Ortsgeschichte nennt ihn Nikel Pfeiffer, aus Rohrbach. Von ihm selbst ist kein Wort überliefert.', { fact: 'cx.16', src: [P('S. 425–427'), src('WP-K2A')] }),
      ],
      objectives: [
        { id: 'zaun', type: 'reach', text_de: 'Am Parkzaun beim Carlsluster Torhaus: Q – Februar 1793', where: place(1680, -400, 30) },
        { id: 'fetzen', type: 'examine', clue: 'clue.k2.zaun', text_de: 'Am Zaun hängt etwas (L: Laterne, E)' },
        { id: 'allee', type: 'reach', after: ['fetzen'], text_de: 'Der Spur im Raureif folgen, die Apfelallee hinauf', where: place(1500, -542, 18) },
        { id: 'orangerie', type: 'reach', after: ['allee'], text_de: 'Leise weiter, bis zur Orangerie', where: place(1275, -960, 34) },
        { id: 'wagen', type: 'echo', clue: 'clue.k2.orangerie', text_de: 'In Mannlichs Fenstern brennt Licht: zuhören' },
        {
          id: 'streuner', type: 'kill', enemy: 'streuner', group: 'k2.spur', count: 3, optional: true, bonus_xp: 40, after: ['fetzen'],
          text_de: 'Bonus: drei Streuner auf der Spur zurückschlagen',
          where: place(...KS2.allee, 26),
          spawn: [spawn('streuner', KS2.allee, 3, 6, { leash: 40, group: 'k2.spur', escorts: [{ kind: 'nebelling', n: 1 }], wave: [{ kind: 'nebelling', n: 2 }] })],
        },
      ],
      rewards: { xp: 200, skills: [{ id: 'spurenleser', tier: 2 }] },
      next: 'q.k2.wachbuch',
    },
    {
      id: 'q.k2.wachbuch', kind: 'main', era: E,
      title_de: 'Das Wachbuch',
      summary_de: 'Am Wachhaus vor dem Gitter endet die Spur. Um das Wachfeuer tanzen Irrlichter, und solange sie da sind, erinnert sich niemand. Im Wachbuch steht, wer heute Abend gekommen ist.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Das Wachhaus. Da hört seine Spur auf. Aber um das Feuer tanzt etwas, das kein Funke ist.')],
      turnin_lines: [ln('laub', 'Dem Leibjäger übergeben. Ab hier hat ihn jemand geführt. Ins Schloss.')],
      history: [
        ln('laub', 'Der Regierungsrat Horstmann hat Flucht und Ankunft notiert, in der Nacht des 9. Februar 1793. Die ADB sagt der dritte, Mannlich erinnert sich an Ende Februar. Wir folgen Horstmann. Er schrieb, als es geschah.', { fact: 'cx.17', src: [src('M1910', 'S. 427 Anm. 1'), src('ADB')] }),
      ],
      objectives: [
        { id: 'wachhaus', type: 'reach', text_de: 'Die Spur biegt nach Norden ab: zum Wachhaus am Ehrenhof', where: place(...KS2.wachhaus, 14) },
        {
          id: 'lichter', type: 'kill', enemy: 'irrlicht', count: 4, group: 'k2.wache', after: ['wachhaus'],
          text_de: 'Die Irrlichter am Wachfeuer bannen',
          where: place(...KS2.wachhaus, 22),
          spawn: [spawn('irrlicht', KS2.wachhaus, 4, 7, { leash: 30, group: 'k2.wache' })],
        },
        { id: 'feuer', type: 'echo', clue: 'clue.k2.wache', after: ['lichter'], text_de: 'Die Wache am Feuer: zuhören' },
        { id: 'buch', type: 'examine', clue: 'clue.k2.wachbuch', text_de: 'Das Wachbuch auf dem Tisch am Wachhaus (E)' },
      ],
      rewards: { xp: 170 },
      next: 'q.k2.warnung',
    },
    {
      id: 'q.k2.warnung', kind: 'main', era: E,
      title_de: 'Die Warnung',
      summary_de: 'Der Bauer ist im Schloss, und hinter der angelehnten Tür des Schreibkabinetts wird geredet. Laub will sehen, was der Herzog tut, wenn er die Warnung hört.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Ins Schloss. Durch die Durchfahrt, durchs Vestibül, bis an die Tür des Kabinetts. Dort hören Sie hin. Anklopfen ist nicht vorgesehen.')],
      progress: [ln('laub', 'An die Tür. Durch den Spalt sieht man mehr, als einem lieb ist.')],
      turnin_lines: [ln('laub', 'Ein kleines Jagdmesser. Mehr hat er nicht selbst mitgenommen. Die Galerie lässt er einem Maler.')],
      history: [
        ln('laub', 'Der Herzog hielt die Nachricht zuerst für unglaubwürdig und wollte dem Bauern einen Dukaten geben. Dann kam die Bestätigung, und es wurde gepackt.', { fact: 'cx.16', src: [P('S. 425–427')] }),
        ln('laub', 'Mannlich blieb zurück, um über die Galerie zu wachen und sie zu retten, wenn es ihm möglich sei. Gegen zehn Uhr abends fuhr der Herzog ab.', { fact: 'cx.18', src: [Z('S. 426'), P('S. 427')] }),
      ],
      objectives: [
        { id: 'hof', type: 'reach', text_de: 'In den Ehrenhof, durch die Durchfahrt im Südflügel', where: place(1222, -1118, 22) },
        { id: 'tuer', type: 'examine', clue: 'clue.k2.warnung', text_de: 'Durch den Türspalt des Kabinetts sehen (E halten, A/D: anderer Spalt)' },
        { id: 'abschied', type: 'examine', clue: 'clue.k2.abschied', text_de: 'Durch den anderen Spalt: der Abschied (E halten)' },
      ],
      rewards: { xp: 200 },
    },
    {
      id: 'q.k2.parforce', kind: 'main', era: E,
      title_de: 'Die Parforcejagd',
      summary_de: 'Die Wagen sind fort, und vom Zwinger bläst einer zur Jagd, der nicht Jost ist. Die Meute ist los, und sie jagt dich. Lauf zur Orangerie, den Hang hinab, zum Wasser. Am Damm wartet der Pikeur.',
      giver: { npc: 'jost' }, turnin: 'auto',
      topic_de: 'Das Horn', accept_de: 'Ich lauf.',
      offer: [
        ln('jost', 'Wenn die Meute heut Nacht losgeht, gibt’s nur eins: Wasser. Den Hang runter zum Weiher.'),
        ln('jost', 'Über Wasser kommt der Pikeur nicht. Aber am Damm wartet er. Der weiß das auch.'),
      ],
      progress: [ln('laub', 'Laufen! Die Orangerie, dann den Hang hinab nach Westen. Zum Damm.')],
      turnin_lines: [
        ln('laub', 'Feldstation. Heute. Sie atmen, ich höre es bis hier drinnen.'),
        ln('laub', 'Wollen Sie wissen, was die Lichter im Wald waren? Mannlich weiß es nicht. Ich auch nicht. Und das sage ich ungern.'),
      ],
      history: [
        ln('laub', 'Kurz nach der Abfahrt sprengte General Landremont heran und fragte nach den Feuern im Wald. Ein Handwerker antwortete im Gehen: Das sind Kalköfen. Was die Lichter waren, schreibt Mannlich nicht. Die Fackelträger der Lokalüberlieferung sind nicht belegt.', { fact: 'cx.19', src: [Z('S. 427 f.'), P('S. 428')] }),
      ],
      objectives: [
        { id: 'kalk', type: 'echo', clue: 'clue.k2.landremont', text_de: 'Am Orangerie-Parterre: der General und die Lichter' },
        {
          id: 'pikeur', type: 'kill', enemy: 'pikeur', group: 'k2.pikeur', count: 1, after: ['kalk'],
          text_de: 'Am Damm: den Pikeur zurückschlagen, bis er abdreht',
          where: place(...KS2.damm, 30),
        },
        { id: 'heim', type: 'event', event: 'era:change', match: { to: 'today' }, after: ['pikeur'], text_de: 'Q halten: zurück zur Quelle' },
      ],
      rewards: { xp: 420, items: [{ item: 'item.stab.silber' }], skills: [{ id: 'kartograf', tier: 3 }] },
    },
    // ---- side quests ------------------------------------------------------------------------------
    {
      id: 'q.k2.bodenbrett', kind: 'side', era: E,
      title_de: 'Das Bodenbrett',
      summary_de: 'Hinter den Fenstern der Bildergalerie brennt eine einzelne Kerze, und davor schweben Irrlichter, die das Licht anziehen. Laub will wissen, wer um diese Zeit noch in der Galerie ist.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'In der Galerie brennt eine Kerze. Um diese Zeit. Sehen Sie nach, aber leise. Vor den Fenstern ist etwas, das Licht mag.')],
      turnin_lines: [ln('laub', 'Der Kanzlist. Ein graues Buch unter einem Brett. Ich hätte es auch versteckt. Fragen Sie mich nicht, was drinsteht. Noch nicht.')],
      history: [
        ln('laub', 'Die Galerie hat Mannlich 1788 gebaut, in einem halben Jahr: grüner Damast aus Lyon, zwanzig Kristalllüster, hundert Schritt lang. Die Übersetzung von 1910 sagt hundert Fuß. Sie irrt.', { fact: 'cx.25', src: [src('M1910', 'S. 380 f.'), src('SCHWAN12')] }),
        ln('laub', 'Und es gab eine geheime Falltür von der Galerie in die Werkstatt des Büchsenmachers. Wo genau, weiß niemand. Dass Soll dort ein Buch versteckt, ist erfunden. Von mir. Im Voraus.', { fact: 'cx.26', src: [Z('S. 432')] }),
      ],
      objectives: [
        {
          id: 'lichter', type: 'kill', enemy: 'irrlicht', count: 2, group: 'k2.galerie',
          text_de: 'Die Irrlichter vor den Galeriefenstern bannen',
          where: place(...KS2.galerie, 20),
          spawn: [spawn('irrlicht', KS2.galerie, 2, 5, { leash: 25, group: 'k2.galerie', escorts: [{ kind: 'nebelling', n: 1 }], wave: [{ kind: 'nebelling', n: 2 }] })],
        },
        { id: 'kerze', type: 'examine', clue: 'clue.k2.soll', text_de: 'Durchs Fenster: wer kniet da bei der Kerze?' },
      ],
      rewards: { xp: 80 },
      available: { after: ['q.k2.wachbuch'] },
    },
    {
      id: 'q.k2.lichter', kind: 'side', era: E,
      title_de: 'Lichter im Wald',
      summary_de: 'Am Hang unterhalb der Orangerie schwanken Lichter zwischen den Bäumen. Kalköfen, wird ein Handwerker später sagen. Laub will es selbst sehen. An jedem Licht wartet etwas, das nicht nach Kalk riecht.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Da unten am Hang. Drei Lichter. Ich will wissen, was sie sind, bevor es mir jemand erklärt. Gehen Sie hin, alle drei.')],
      turnin_lines: [ln('laub', 'Ein Meiler, der glimmt. Und drei Lichter, die keine Kohle brauchten. Was wir gesehen haben, steht nicht bei Mannlich.')],
      history: [
        ln('laub', 'Köhlerplätze: runde, ebene Teller am Hang, schwarze Erde. Ein Meiler glimmt unter Erde und Laub, er leuchtet nicht weit.', { fact: 'rm.03', src: [src('HE-BW')] }),
        ln('laub', 'Das sind Kalköfen, hat der Handwerker dem General gesagt, im Gehen. Was die Lichter wirklich waren, schreibt Mannlich nicht.', { fact: 'cx.19', src: [Z('S. 428')] }),
      ],
      objectives: [
        ...KS2.lichter.map(([x, z], i) => ({
          id: `licht${i + 1}`, type: 'kill', enemy: 'irrlicht', count: 2, group: `k2.lichter.${i + 1}`,
          text_de: `${LICHT[i]} am Hang: die Irrlichter bannen`,
          where: place(x, z, 18),
          // playtest round 5: three 3-second pairs; now each light brings its own company and a
          // second wave, and the last one a weaver (an escalating walk down the slope)
          spawn: [spawn('irrlicht', [x, z], 2, 4, { leash: 25, group: `k2.lichter.${i + 1}`, escorts: [{ kind: i === 2 ? 'nebelweber' : 'nebelling', n: 1 }], wave: i === 0 ? [{ kind: 'nebelling', n: 2 }] : [{ kind: 'nebelling', n: 2 }, { kind: 'irrlicht', n: 1 }] })],
        })),
        { id: 'meiler', type: 'examine', clue: 'clue.k2.koehler', text_de: 'Ein Köhlerplatz am Hang (Relief-Blick)' },
      ],
      rewards: { xp: 120, items: [{ item: 'item.kalkstaub', count: 3 }] },
      available: { after: ['q.k2.wachbuch'] },
    },
    {
      id: 'q.k2.kisten', kind: 'side', era: E,
      title_de: 'Kisten für Mannheim',
      summary_de: 'Im Orangeriehof wird gepackt. Ein Diener des Baudirektors braucht Hände: Vier Bilderkisten müssen auf den Wagen, und zwischen den Kisten streunen Hunde, die nicht in den Zwinger gehören.',
      giver: { npc: 'diener' }, turnin: 'giver',
      topic_de: 'Die Kisten', accept_de: 'Abgemacht.',
      offer: [
        ln('diener', 'Sie kommen wie gerufen. Der Herr Baudirektor sagt, die Bilder müssen fort, bevor die Franzosen kommen. Vier Kisten noch.'),
        ln('diener', 'Und zwischen den Kisten schnüffeln Hunde herum. Nicht unsere. Ich trage, Sie verscheuchen. Oder umgekehrt, aber ich trage lieber.'),
      ],
      progress: [ln('diener', 'Vier Kisten. Vorsichtig, da ist ein Rubens drin. Oder ein Rahmen. Ich verwechsle das.')],
      turnin_lines: [ln('diener', 'Alle vier auf dem Wagen. Der Herr Baudirektor wird sagen, er hat es allein geschafft. Das ist in Ordnung. Ich weiß es.')],
      history: [
        ln('diener', 'Mit dem alten Burger trägt der Herr Baudirektor die schönsten Bilder durch eine Falltür in die Werkstatt des Büchsenmachers. Später geht alles über Kaiserslautern nach Mannheim. Die Bilder, sagt man, kommen einmal nach München.', { fact: 'cx.20', src: [Z('S. 432'), src('WP-SK')] }),
      ],
      objectives: [
        { id: 'kisten', type: 'collect', item: 'item.k2.kiste', count: 4, text_de: 'Bilderkisten im Orangeriehof aufheben', place: KS2.kisten.map(([x, z]) => place(x, z)) },
        {
          id: 'hunde', type: 'kill', enemy: 'streuner', count: 4, group: 'k2.kisten',
          text_de: 'Die Streuner zwischen den Kisten verscheuchen',
          where: place(...KS2.kistenhof, 22),
          spawn: [spawn('streuner', KS2.kistenhof, 4, 8, { leash: 35, group: 'k2.kisten', escorts: [{ kind: 'nebelling', n: 1 }, { kind: 'rufer', n: 1 }], wave: [{ kind: 'streuner', n: 1 }] })],
        },
      ],
      rewards: { xp: 110, items: [{ item: 'item.riechsalz', count: 2 }] },
      available: { after: ['q.k2.spur'] },
    },
  ],
};

writeFileSync(`${ROOT}/content/quests/02-kapitel-2.quests.json`, JSON.stringify({ $schema: '../schema/quests.schema.json', ...k2Quests }, null, 2) + '\n');
console.log('wrote 02-kapitel-2.quests.json');
