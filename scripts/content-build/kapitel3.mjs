import { clue, noun, say, seq, hints, src, write, Z, P } from './common.mjs';

const ch = 'k3';
const E = '1793-07';
const STATION = [760, -930];
const EH = [1210, -1114];
const REG = 'B03.1.eg-registratur';
const NAT = 'B04.2.og-naturalienkabinett';
const GAL = 'B06.1.bildergalerie';
// west end of the gallery, under the hanging wall (north), near the Vorraum door; inside B06.1.bildergalerie, above KB-B40
const FALLTUER = [1201.5, -1216.6];
// east side of the Zwinger (KB-B23), between the kennel wall and the peat sheds: where the escape route from the garden arrives
const ZW = [1258, -1566];
// the gate of the walled Holländische Gärtnerei (east wall, KB-B27): the safe place of part B
const PFORTE = [1267, -1290];

const clues = [
  clue('clue.k3.marlene', {
    title: 'Marlene erzählt von einer Ausstellung', kind: 'dialogue', at: STATION, r: 30, era: 'today', anchor: 'loc.p.station', chapter: ch, fiction: false,
    text: 'Marlene erzählt von der Ausstellung „Steinerne Macht“ (2018).', flags: ['flag.k3_ausstellung'],
  }),
  // Teil A
  clue('clue.k3.stroh', {
    title: 'Erinnerung: Stroh aus Metz', kind: 'echo', at: EH, r: 35, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Sommer, später Nachmittag, Staub. Im Hof stehen Karren voller Stroh, Soldaten in blauen Röcken laden ab und tragen Bündel ins Erdgeschoss.',
    nouns: ['n.lothringen', 'n.metz', 'n.28_juli', 'n.dachstuhl'],
  }),
  clue('clue.k3.horstmann', {
    title: 'Horstmann notiert', kind: 'dialogue', at: EH, r: 35, era: E, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Laub kennt die Akten: Regierungsrat Horstmann hat den Tag notiert, und den Brand vier Tage vorher gleich mit.', nouns: ['n.28_juli', 'n.24_juli'], req: { clues: ['clue.k3.stroh'] },
  }),
  clue('clue.k3.lehnstuhl', {
    title: 'Der Mann mit dem Lehnstuhl', kind: 'object', at: [1205, -1110], r: 15, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Ein vergoldeter Lehnstuhl mit grünem Damastbezug und Goldfransen auf dem Kopf eines Mannes, der barfuß geht.',
    nouns: ['n.dorfbewohner'],
  }),
  clue('clue.k3.kuechenhof', {
    title: 'Erinnerung: Freigegeben', kind: 'echo', at: [1212, -1180], r: 25, era: E, anchor: 'TF-02', chapter: ch, fiction: true,
    text: 'Im Küchenhof wird geplündert: Kupferkessel, Vorhänge, Fensterblei. Mehrere Stimmen, keine Gesichter scharf.',
    nouns: ['n.dorfbewohner', 'n.homburg', 'n.keller', 'n.mundkoch', 'n.freiheit', 'n.r_retteten'],
  }),
  clue('clue.k3.hanne', {
    title: 'Hanne mit dem leeren Korb', kind: 'dialogue', at: [1215, -1185], r: 8, era: E, anchor: 'TF-02', chapter: ch, fiction: true,
    text: 'Hanne steht im Küchenhof, mit einem leeren Korb.', nouns: ['n.hofbediente', 'n.r_schuld'],
  }),
  clue('clue.k3.soll', {
    title: 'Soll in der leeren Registratur', kind: 'dialogue', room: REG, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Die Regale sind leer. Soll sitzt auf dem Boden zwischen losen Blättern und zählt, was fehlt.',
    nouns: ['n.buechsenmacher', 'n.preussen', 'n.republik', 'n.r_stahlen'],
  }),
  clue('clue.k3.waffen', {
    title: 'Die leere Waffensammlung', kind: 'object', room: 'B04.1.eg-waffensammlung', r: 6, era: E, chapter: ch, fiction: false,
    text: 'Leere Haken in Reihen, auf dem Boden die Abdrücke von Gewehrkolben im Staub, eine einzelne Schraube.',
    flags: ['flag.k3_waffen_gesehen'],
  }),
  clue('clue.k3.kisten', {
    title: 'Gepackte Kisten', kind: 'object', at: [1188.6, -1178.2], anchor: NAT, r: 3.2, era: E, chapter: ch, fiction: true,
    text: 'Zwölf große Kisten, vernagelt, mit Kreide beschriftet: „Naturalien-Cabinet. Nach Kaiserslautern.“ Darunter, mit anderer Kreide durchgestrichen und überschrieben: „Abbestellt.“ (Wortlaut erfunden; der Inhalt folgt Mannlichs Lebenserinnerungen.)',
    nouns: ['n.kaiserslautern', 'n.naturalienkabinett'],
  }),
  clue('clue.k3.holandre', {
    title: 'Holandres Vogelkatalog', kind: 'document', at: [1192.4, -1176.4], anchor: NAT, r: 2.2, era: E, chapter: ch, fiction: false,
    text: '„Catalogue des oiseaux … des Deux-Ponts, 1785“. Jemand hat am Rand gezählt: 1187. (Holandre 1785, 1 187 Vögel, nach Schwan 2012 Anm. 30.)',
    flags: ['flag.k3_holandre_gesehen'],
  }),
  clue('clue.k3.koenig', {
    title: 'Erinnerung: Der König verspricht', kind: 'echo', at: [1184.6, -1177.3], anchor: NAT, r: 2.8, era: E, chapter: ch, fiction: true,
    text: 'Zwei Herren gehen schnell durch den Raum, ohne stehen zu bleiben. Man sieht nur ihre Rücken.',
    nouns: ['n.koenig_preussen', 'n.kaiser'],
  }),
  clue('clue.k3.galerie', {
    title: 'Erinnerung: Die Galerie', kind: 'echo', room: GAL, r: 40, era: E, chapter: ch, fiction: true,
    text: 'Für die Dauer der Erinnerung hängen die Bilder wieder. Ein Mann im Schlafrock geht mit einem Leuchter die Wand entlang und bleibt vor jedem Bild stehen.',
    nouns: ['n.hundert_fuss', 'n.fachwerk'],
  }),
  clue('clue.k3.messen', {
    title: 'Die Galerie messen', kind: 'object', room: GAL, r: 40, era: E, chapter: ch, fiction: false,
    text: 'Die Messlinie von einem Ende der Galerie zum anderen. Rund achtzig Meter, im Modell gemessen.',
    nouns: ['n.hundert_schritt', 'n.hundert_klafter'], req: { skill: 'kartograf:3' },
  }),
  clue('clue.k3.falltuer', {
    title: 'Ein loses Brett', kind: 'object', at: FALLTUER, r: 2, era: E, anchor: GAL, chapter: ch, fiction: false,
    text: 'Am Westende der Galerie gibt ein Brett im Parkett nach. Darunter eine Klappe mit Eisenring, darunter Dunkelheit und der Geruch von Öl und Eisen. (Die Falltür ist belegt, ihr genauer Ort nicht.)',
    nouns: ['n.buechsenmacher'], facts: ['cx.26'],
  }),
  clue('clue.k3.chronik', {
    title: 'Das graue Buch', kind: 'document', at: FALLTUER, r: 2, era: E, anchor: GAL, chapter: ch, fiction: true,
    text: 'Das graue Buch. Beim Berühren fliegen die Seiten davon, wie Asche durch die Galerie, zu den Fenstern hinaus. Eine bleibt: die Fallseite „Die Nacht“. Auf ihrer Rückseite in Solls Schrift: „Was der Hof schuldig blieb. Fortsetzung folgt nicht.“',
    flags: ['flag.k3_chronik_zerstreut'], req: { clues: ['clue.k3.falltuer'] },
  }),
  clue('clue.k3.papier', {
    title: 'Marmor aus Papier', kind: 'object', room: 'B06.1.kabinett-ost', r: 5, era: E, chapter: ch, fiction: false,
    text: 'Marmor, der unter dem Fingerknöchel hohl klingt. Eine Ecke des Papiers hat sich gelöst. (Papierimitation von Marmor und Granit ab 1789, Schwan 2012 nach dem Schadensetat.) Glastüren, drei Stufen in den Garten: der Notausgang für Teil B.',
    flags: ['flag.k3_papier'],
  }),
  clue('clue.k3.gaertner', {
    title: 'Das Schild an der Pforte', kind: 'document', at: PFORTE, r: 3, era: E, anchor: 'KB-B27', chapter: ch, fiction: true,
    text: 'Ein Schild an der Pforte der Holländischen Gärtnerei: „Hof-Gärtnerey. Eintritt nur mit Erlaubnis des Hofgärtners.“ (Der Wortlaut ist erfunden.)',
    nouns: ['n.hofgaertner'],
  }),
  // Teil B
  clue('clue.k3.fackel', {
    title: 'Erinnerung: Im Namen der Nation', kind: 'echo', at: [1225, -1118], r: 5, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Abenddämmerung, eine dichte Menge, ein Mann mit Schärpe und brennender Fackel auf einem Karren. Die Fackel fliegt durch ein offenes Fenster ins Erdgeschoss. Mannlich war nicht dabei; er schreibt nach Berichten.',
    nouns: ['n.nation', 'n.kommissaer', 'n.erdgeschoss'], req: { flags: ['flag.k3_teil_b'] },
  }),
  clue('clue.k3.feuer', {
    title: 'Von unten nach oben', kind: 'dialogue', at: [1263, -1126], r: 30, era: E, anchor: 'KB-B01', chapter: ch, fiction: true,
    text: 'Laub hustet, obwohl er nicht atmen muss. Das Feuer steigt von unten nach oben: erst das Stroh im Erdgeschoss, dann die Treppen, dann der Saal.', nouns: ['n.erdgeschoss', 'n.gewoelbe'], req: { clues: ['clue.k3.fackel'] },
  }),
  clue('clue.k3.festsaal', {
    title: 'Der Festsaal', kind: 'dialogue', room: 'B01.2.og-festsaal', r: 6, era: E, chapter: ch, fiction: true,
    text: 'Die Wände sind halb leer: Wo Täfelungen schon abgenommen und fortgebracht wurden, sind hellere Flächen. Rauch unter der Decke, der letzte Kronleuchter klirrt.',
    nouns: ['n.festsaal'], req: { clues: ['clue.k3.fackel'] },
  }),
  clue('clue.k3.retten', {
    title: 'Eines retten', kind: 'object', room: 'B01.2.og-festsaal', r: 6, era: E, chapter: ch, fiction: true,
    text: 'Hanne steht in der Mitte mit einem Türgriff in der Hand. Drei Dinge sind zu retten, und man kann nur eines tragen: den Türgriff aus Hannes Hand, einen Dukaten mit dem Bild des Schlosses im Fensterbrett, eine vergoldete Uhr mit Alabaster auf einer Konsole, die noch tickt. Wer zu lange wählt, den nimmt Hanne am Arm.',
    facts: ['cx.27'], req: { clues: ['clue.k3.festsaal'] },
  }),
  clue('clue.k3.wirtschaft', {
    title: 'Was morgen noch steht', kind: 'dialogue', at: [1275, -1306], r: 9, era: E, anchor: 'KB-B27', chapter: ch, fiction: false,
    text: 'Von der Pforte der Gärtnerei der Blick nach Norden: Marstall, Reithalle, Ställe. Dunkle Dächer vor dem Feuerschein.', nouns: ['n.wirtschaftsgebaeude'],
  }),
  clue('clue.k3.jost', {
    title: 'Jost öffnet den Zwinger', kind: 'dialogue', at: ZW, r: 14, era: E, anchor: 'KB-B23', chapter: ch, fiction: true,
    text: 'Jost reißt die Gittertüren auf. Echte Hunde, nicht aus Rauch, laufen an dir vorbei in die Nacht. Jost nimmt das Horn vom Haken und rennt ihnen nach.',
    nouns: ['n.r_alle'], req: { clues: ['clue.k3.fackel'] },
  }),
];

const nouns = [
  noun('n.28_juli', '28. Juli', 'time'),
  noun('n.24_juli', '24. Juli', 'time'),
  noun('n.lothringen', 'Lothringen', 'place'),
  noun('n.metz', 'Metz', 'place'),
  noun('n.kaiserslautern', 'Kaiserslautern', 'place'),
  noun('n.homburg', 'Homburg', 'place'),
  noun('n.erdgeschoss', 'Erdgeschoss', 'place'),
  noun('n.dachstuhl', 'Dachstuhl', 'place'),
  noun('n.keller', 'Keller', 'place'),
  noun('n.festsaal', 'Festsaal', 'place'),
  noun('n.nation', 'Nation', 'object'),
  noun('n.republik', 'Republik', 'object'),
  noun('n.freiheit', 'Freiheit', 'object'),
  noun('n.dorfbewohner', 'Dorfbewohner', 'group'),
  noun('n.preussen', 'preußischen Soldaten', 'group'),
  noun('n.hofbediente', 'Hofbedienten', 'group'),
  noun('n.koenig_preussen', 'König von Preußen', 'person'),
  noun('n.kaiser', 'Kaiser', 'person'),
  noun('n.kommissaer', 'Kommissär', 'person'),
  noun('n.buechsenmacher', 'Büchsenmachers', 'person'),
  noun('n.mundkoch', 'Mundkochs', 'person'),
  noun('n.hofgaertner', 'Hofgärtners', 'person'),
  noun('n.fachwerk', 'Fachwerkbauten', 'object'),
  noun('n.wirtschaftsgebaeude', 'Wirtschaftsgebäude', 'object'),
  noun('n.gewoelbe', 'Gewölbe', 'object'),
  noun('n.hundert_schritt', 'hundert Schritt', 'other'),
  noun('n.hundert_fuss', 'hundert Fuß', 'other'),
  noun('n.hundert_klafter', 'hundert Klafter', 'other'),
  noun('n.r_schuld', 'nahmen sich, was man ihnen schuldete', 'action'),
  noun('n.r_stahlen', 'stahlen', 'action'),
  noun('n.r_retteten', 'retteten, was zu retten war', 'action'),
  noun('n.r_alle', 'taten, was alle taten', 'action'),
];

const f1 = (id, factId, text, b) => ({ id, kind: 'fact', factId, text_de: text, blanks: Array.isArray(b) ? b : [b] });
const cases = [{
  id: 'case.k3',
  title_de: 'Die Nacht',
  intro_de: 'Sonntag, 28. Juli 1793. Was geschah mit dem Schloss und seinen Sammlungen?',
  entries: [
    f1('entry.k3.1', 'cx.22', 'Der Karlsberg wurde am Sonntag, dem {wann} 1793, angezündet.',
      { id: 'wann', category: 'time', correct: 'n.28_juli', accepts: ['n.28_juli', 'n.24_juli', 'n.9_februar', 'n.25_februar'] }),
    f1('entry.k3.2', 'cx.22', 'Das Stroh für den Brand ließ man bis aus {wo} herbeischaffen.',
      { id: 'wo', category: 'place', correct: 'n.lothringen', alsoCorrect: ['n.metz'], accepts: ['n.lothringen', 'n.metz', 'n.kaiserslautern', 'n.mannheim', 'n.homburg'] }),
    f1('entry.k3.3', 'cx.22', 'Mit dem Stroh stopfte man alle Gemächer im {wo} aus.',
      { id: 'wo', category: 'place', correct: 'n.erdgeschoss', accepts: ['n.erdgeschoss', 'n.dachstuhl', 'n.keller', 'n.festsaal'] }),
    f1('entry.k3.4', 'cx.22', 'Der Kommissär setzte das Schloss ‚im Namen der {was}‘ in Brand.',
      { id: 'was', category: 'object', correct: 'n.nation', accepts: ['n.nation', 'n.republik', 'n.freiheit'] }),
    f1('entry.k3.5', 'cx.23', 'Die abziehenden Franzosen gaben das Schloss zur Plünderung frei, auch für die {wer} der Umgebung.',
      { id: 'wer', category: 'group', correct: 'n.dorfbewohner', accepts: ['n.dorfbewohner', 'n.preussen', 'n.hofbediente'] }),
    f1('entry.k3.6', 'cx.21', 'Die Kisten mit {was} standen gepackt; der Herzog bestellte die Wagen ab, weil der {wer} ihm versicherte, die Franzosen kämen nicht wieder.', [
      { id: 'was', category: 'object', correct: 'n.naturalienkabinett', accepts: ['n.naturalienkabinett', 'n.galerie_sammlung', 'n.bibliothek'],
        labels_de: { 'n.naturalienkabinett': 'dem Naturalienkabinett', 'n.galerie_sammlung': 'der Galerie', 'n.bibliothek': 'der Bibliothek' } },
      { id: 'wer', category: 'person', correct: 'n.koenig_preussen', accepts: ['n.koenig_preussen', 'n.kaiser', 'n.kommissaer'] },
    ]),
    f1('entry.k3.7', 'cx.20', 'Vor dem Abtransport versteckte Mannlich die schönsten Bilder durch eine geheime Falltür in der Werkstatt des {wer}.',
      { id: 'wer', category: 'person', correct: 'n.buechsenmacher', accepts: ['n.buechsenmacher', 'n.mundkoch', 'n.hofgaertner'] }),
    f1('entry.k3.8', 'cx.28', 'Das Feuer zerstörte vor allem die Residenz des Herzogs und die {was}.',
      { id: 'was', category: 'object', correct: 'n.fachwerk', accepts: ['n.fachwerk', 'n.wirtschaftsgebaeude', 'n.gewoelbe'] }),
    f1('entry.k3.9', 'cx.25', 'Mannlich schrieb, die Galerie sei ‚cent pas‘ lang gewesen: {wieviel}.',
      { id: 'wieviel', category: 'other', correct: 'n.hundert_schritt', accepts: ['n.hundert_schritt', 'n.hundert_fuss', 'n.hundert_klafter'] }),
    { id: 'entry.k3.10', kind: 'reading', flag: 'flag.k3_pluenderer', text_de: 'Die Leute aus den Dörfern {wie}.',
      blanks: [{ id: 'wie', accepts: ['n.r_schuld', 'n.r_stahlen', 'n.r_retteten', 'n.r_alle'] }] },
  ],
}];

const beat = (b, x = {}) => ({ event: 'story:beat', chapter: ch, beat: b, ...x });
const found = (id, x = {}) => ({ event: 'clue:found', id, ...x });
const talk = (npc, topic, x = {}) => ({ event: 'npc:talk', npc, chapter: ch, topic, ...x });
const echo = (id) => ({ event: 'echo:start', id });
const MANNLICH_NICHT_DABEI = 'Mannlich war nicht dabei. Er schreibt nach Berichten.';

const dialogue = [
  // Feldstation
  say('marlene.k3.morgen', 'marlene', 'Du siehst aus, als hättest du ein Feuer gelöscht. Hast du heut Nacht geträumt? Du hast im Schlaf ‚Obacht‘ gesagt.', beat('3.0'), { once: true }),
  say('marlene.k3.ausstellung', 'marlene', '2018 war in Saarbrücken eine Ausstellung, ‚Steinerne Macht‘. Da lag vom Karlsberg fast nichts. Ein Türgriff, eine Uhr mit Alabaster, ein Dukat mit dem Schloss drauf, eine Pistole und ein Jagdmesser. Ein ganzes Schloss, und übrig bleibt ein Türgriff.', found('clue.k3.marlene'), { once: true, src: [src('RP18', 'P')] }),
  say('laub.k3.start', 'laub', 'Juli dreiundneunzig. Ich war nicht dabei. Ich bin erst vierzehn Jahre später geboren worden. Und trotzdem habe ich das Gefühl, ich sollte mich entschuldigen.', beat('3.0'), { once: true }),
  // Ehrenhof
  ...seq(echo('clue.k3.stroh'), [
    ['echo.k3.stroh.01', 'soldat', 'Drei Tage von Metz hierher, mit Stroh! Wir hätten Wein fahren können.', [src('WP-SK', 'P: Stroh aus der Gegend von Metz')]],
    ['echo.k3.stroh.02', 'soldat2', 'Lothringer Stroh brennt besser als Lothringer Wein.'],
    ['echo.k3.stroh.03', 'soldat', 'Alles ins Erdgeschoss, sagt der Kommissär. Nicht unters Dach. Wenn’s oben anfängt, geht’s langsam.'],
    ['echo.k3.stroh.04', 'soldat2', 'Heut ist Sonntag. Am achtundzwanzigsten. Ich hätt mir einen anderen Sonntag gewünscht.'],
  ]),
  say('laub.k3.ehrenhof', 'laub', 'Das Stroh ist vom Feind, das Feuer ist vom Feind, und die Leute, die die Löffel heraustragen, sind von hier. Schreiben Sie das alles auf. Nicht nur das Bequeme.', beat('3.1'), { once: true }),
  say('laub.k3.horstmann', 'laub', 'Horstmann, unser Regierungsrat, schreibt den 28. Juli. Vier Tage vorher, am 24., haben sie Petersheim angezündet. Er notiert beides, als wäre es Wetter.', found('clue.k3.horstmann'), { once: true, src: [P('S. 461 Anm. 39')] }),
  say('laub.k3.lehnstuhl', 'laub', 'Einer von hundertvier aus der Galerie. Bleiben hundertdrei. Er wird darin sitzen, bis er hundert ist, und es wird der beste Stuhl im Dorf sein.', found('clue.k3.lehnstuhl'), { once: true, src: [P('S. 374')] }),
  // Küchenhof
  ...seq(echo('clue.k3.kuechenhof'), [
    ['echo.k3.kuechenhof.01', 'frau', 'Freigegeben, hat der Offizier gesagt. Was frei ist, darf man nehmen.', [src('WP-SK', 'P: Freigabe zur Plünderung'), src('EN-KC', 'P')]],
    ['echo.k3.kuechenhof.02', 'mann', 'Wir sind aus Homburg, und die da aus dem Sanddorf. Die Keller sind schon leer, da waren die anderen schneller.'],
    ['echo.k3.kuechenhof.03', 'junge', 'Die Wohnung vom Mundkoch ist auch leer. Der hat seine Töpfe mitgenommen.'],
    ['echo.k3.kuechenhof.04', 'frau', 'Besser bei uns als im Feuer.'],
    ['echo.k3.kuechenhof.05', 'soldat', 'Freiheit, Bürger! Nimm, so viel du tragen kannst.'],
  ]),
  // Hanne
  say('hanne.k3.01', 'hanne', 'Gucken Sie nicht so. Ich nehm mir nur, was man uns schuldet. Fünf Jahre Zinsen auf einen Gulden.', talk('hanne', 'greet'), { once: true }),
  say('hanne.k3.02', 'hanne', 'Die vom Hof waren zuerst da. Die Hofbedienten wissen, wo das Silber stand. Wir kriegen die Vorhänge.', talk('hanne', 'pluenderung')),
  say('hanne.k3.03', 'hanne', 'Peter ist jetzt zwölf. Er will Fuhrmann werden. Ich hab gesagt, dann fahr was Gescheites. Keine Steine.', talk('hanne', 'peter')),
  say('hanne.k3.04', 'hanne', 'Die Galerie da drüben, die Wand am Ende, das war er. Ob die steht, wenn’s brennt? Steine brennen nicht. Sagt man.', talk('hanne', 'matthes')),
  // Soll
  say('soll.k3.01', 'soll', 'Leer. Alles leer. Die Akten nach Mannheim, die Möbel nach Mannheim, die Bilder nach Mannheim. Mannheim muss sehr voll sein.', talk('soll', 'greet'), { once: true }),
  say('soll.k3.02', 'soll', 'Erst die Preußen, dann die Franzosen, dann wieder die Preußen. Alle haben etwas mitgenommen. Ich hab Buch geführt. Die preußischen Soldaten nehmen Uhren, die französischen nehmen Türen.', talk('soll', 'pluenderung')),
  say('soll.k3.03', 'soll', 'Im März haben sie das Siegel der Republik an jede Tür geklebt. Ich habe gefragt, ob das Siegel auch auf die Löhne kommt. Man hat mich nicht verstanden.', talk('soll', 'siegel'), { src: [P('S. 431, 437: Türen versiegelt, „Siegel der Republik“')] }),
  say('soll.k3.04', 'soll', 'Unter dem Boden der Galerie. Am Westende, wo der Büchsenmacher seine Falltür hat. Da hat Herr Mannlich die Bilder durchgetragen. Wo schon einmal etwas gerettet wurde, dachte ich, ist es vielleicht eine Gewohnheit.', talk('soll', 'buch'), { src: [P('S. 431')] }),
  say('laub.k3.wissen', 'laub', 'Wissen wir.', talk('soll', 'buch', { flag: 'flag.k2_versteck_gesehen', step: 2 }), { once: true }),
  say('soll.k3.05', 'soll', 'Ach. Wissen Sie. Natürlich. Die Herren von der Landesaufnahme wissen alles, nur nicht, wann man anklopft.', talk('soll', 'buch', { flag: 'flag.k2_versteck_gesehen', step: 3 }), { once: true }),
  say('soll.k3.06', 'soll', 'Das ist Diebstahl, mit Verlaub. Auch wenn man den Diebstahl freigibt. Freigegebener Diebstahl ist immer noch Diebstahl, nur mit Stempel.', talk('soll', 'pluenderer')),
  say('soll.k3.07', 'soll', 'Ich gehe jetzt. Ich habe alles aufgeschrieben, was der Hof schuldig blieb. Was das Land dem Hof schuldig bleibt, schreibt ein anderer.', talk('soll', 'bye')),
  // Sammlungsflügel
  say('laub.k3.waffen', 'laub', 'Die Waffen hat Mannlich schon fortgebracht. Die Waffensammlung ist leer, das Naturalienkabinett nicht. Merken Sie sich, wer welche Zusage bekam.', found('clue.k3.waffen'), { once: true }),
  say('laub.k3.holandre', 'laub', 'Tausendhundertsiebenundachtzig Vögel, jeder an seinen Zweig gebunden und geklebt. Mannlich sagt zwölfhundert Arten. Mannlich rundet gern auf.', found('clue.k3.holandre'), { once: true, src: [P('S. 437'), src('SCHWAN12', 'Anm. 30')] }),
  ...seq(echo('clue.k3.koenig'), [
    ['mannlich.10', 'mannlich', 'Beim Durchschreiten der Gemächer des Schlosses bemerkten sie die reisefertigen Kisten mit unserem herrlichen Naturalienkabinett. Die Wagen, die sie fortschaffen sollten, waren bereits in Kaiserslautern bestellt; der König gab jedoch dem Herzog die bestimmtesten Versicherungen, daß die Franzosen den Karlsberg nicht mehr betreten würden, und dieser glaubte nun Gegenbefehl erteilen und unsere prachtvolle Sammlung den Zufällen der Ereignisse anheimstellen zu müssen.', [Z('S. 454 f.')]],
    ['laub.k3.koenig', 'laub', 'Der König von Preußen. Nicht der Kaiser, nicht der Herzog selbst. Ein König verspricht, und ein Herzog glaubt. Und die Vögel bleiben im Haus.'],
  ]),
  // Galerie
  say('laub.k3.galerie_leer', 'laub', 'Hören Sie das? Das ist ein Raum, der für Bilder gebaut wurde und jetzt nur noch für Schritte da ist.', beat('3.5'), { once: true }),
  ...seq(echo('clue.k3.galerie'), [
    ['mannlich.11', 'mannlich', 'Die Mauern waren mit Brettern verschalt, und diese mit grünem, von Arabesken durchzogenem Damast bespannt, der nach meinen Skizzen in Lyon angefertigt wurde. Zwanzig schöne Kristallüster hingen von der Decke hernieder.', [Z('S. 374')]],
    ['mannlich.12', 'mannlich', 'Hundertundvier Lehnstühle aus vergoldetem Holz, eine Art kurulischer Sessel, von dem gleichen Damast wie die Wände bezogen und mit Goldfransen behangen, bildeten die Einrichtung dieses geräumigen Saales, der, an hundert Fuß lang, in eine offene, durch eine Kolonnade abgeschlossene Rotunde auslief.', [Z('S. 374')]],
    ['mannlich.13', 'mannlich', 'Als man endlich so weit war, daß die Bilder angehängt werden konnten, verließ er kaum mehr den Saal, stand selbst während der Nacht drei- bis viermal auf und erschien im Schlafrock.', [Z('S. 374 f.')]],
    ['echo.k3.galerie.04', 'hoefling', 'Obacht auf die Bilder!', [Z('S. 374')]],
    ['echo.k3.galerie.05', 'geraeusch', '[Die Bilder verblassen. Der Mann im Schlafrock ist fort. Die Rechtecke bleiben.]'],
    ['laub.k3.fachwerk', 'laub', 'Er hat die Galerie aus einem hölzernen Gang machen lassen. Bretter und Fachwerk, damit es schnell geht. Was schnell geht, brennt schnell.', [src('SCHWAN12', 'P: Galerie 1788 aus einem hölzernen Verbindungsgang')]],
  ]),
  say('laub.k3.messen', 'laub', 'Achtzig Meter. Hundert Fuß wären keine dreiunddreißig. Hundert Klafter wären fast zweihundert. Hundert Schritt, das kommt hin. Mannlich hat französisch geschrieben: ‚cent pas‘. Der Übersetzer von 1910 hat Fuß daraus gemacht.', found('clue.k3.messen'), { once: true, src: [src('SCHWAN12', 'P: Anm. 47')] }),
  say('laub.k3.falltuer', 'laub', 'Die Falltür in die Werkstatt des Büchsenmachers. Mannlich und ein alter Diener namens Burger haben hier die schönsten Bilder hinuntergetragen, am hellen Tag, in aller Stille, und hinter den leeren Schränken versteckt.', found('clue.k3.falltuer'), { once: true, src: [P('S. 431 f.')] }),
  say('laub.k3.chronik', 'laub', 'So war das also. (Lange Pause.) Die Karren haben den Rest besorgt. Eine Seite hier, eine Seite dort. Ich habe 1840 eine davon gefunden. Im Graben. Fragen Sie mich nicht jetzt.', found('clue.k3.chronik'), { once: true, priority: 10 }),
  ...seq(found('clue.k3.papier'), [
    ['laub.k3.papier', 'laub', 'Papier. Marmor aus Papier, Granit aus Papier. Das ganze Zimmer wiegt weniger als ich.', [src('SCHWAN12', 'Papierimitation nach dem Schadensetat')]],
    ['laub.k3.glastueren', 'laub', 'Und Glastüren. Dahinter steht der Pavillon, Wand an Wand: ein Notausgang ohne Ausgang. Merken Sie sich das, falls es heute Abend eng wird. Hinaus geht es durch die Dienertreppe oder die große Treppe.'],
  ]),
  say('laub.k3.gaertner', 'laub', 'Der Hofgärtner Petri hat auch Notizen hinterlassen. Ein Gärtner, der aufschreibt, wie kalt es war, während um ihn herum alles brennt. Ich mag ihn.', found('clue.k3.gaertner'), { once: true, src: [src('M1910', 'S. 427 Anm. 1 (Petri)')] }),
  // Teil B: Die Fackel
  ...seq(echo('clue.k3.fackel'), [
    ['mannlich.14', 'mannlich', `Man hatte bis von Lothringen Stroh herbeischleppen lassen, um damit alle seine Gemächer zu ebener Erde auszustopfen. Dann setzte es der Kommissär im Namen der Nation mit brennender Fackel in Flammen, unter dem Beifall einer tausendköpfigen Schar von Sansculottes und dem Gesange ihres schrecklichen: Ça ira! (${MANNLICH_NICHT_DABEI})`, [Z('S. 461')]],
    ['echo.k3.fackel.02', 'kommissaer', 'Im Namen der Nation!', [P('S. 461')]],
    ['echo.k3.fackel.03', 'menge', 'Ça ira', [src('M1910', 'S. 461; Liedtext „Ah! ça ira“ 1790, gemeinfrei')]],
    ['echo.k3.fackel.04', 'geraeusch', '[Die Fackel fliegt. Ein Fenster im Erdgeschoss leuchtet auf, dann das nächste.]'],
  ]),
  say('laub.k3.hinauf', 'laub', 'Hinauf. Jetzt, nicht gleich.', beat('3.8'), { once: true, priority: 10 }),
  say('laub.k3.feuer', 'laub', '(hustend) Von unten nach oben. Erst das Stroh im Erdgeschoss, dann die Treppen, dann der Saal. Die gewölbte Küche brennt zuletzt. Gewölbe sind geduldig.', found('clue.k3.feuer'), { once: true }),
  say('laub.k3.festsaal', 'laub', 'Der Festsaal. Hier oben liegt kein Stroh. Hier kommt das Feuer erst an, wenn unten nichts mehr übrig ist.', found('clue.k3.festsaal'), { once: true }),
  // W5: Hanne stands in the burning hall (npc chapter 'k3f'); the story speaks Laub's line before the choice
  say('hanne.k3.05', 'hanne', 'Der war an der Tür zum Saal. Matthes hat die Wand drumrum gemacht. Nimm, was du willst. Irgendwas soll übrig bleiben.', { event: 'npc:talk', npc: 'hanne', chapter: 'k3f', topic: 'greet' }),
  say('laub.k3.festsaal_wahl', 'laub', 'Eins. Nur eins. Nehmen Sie, was Sie tragen können, nicht, was am meisten wert ist.', beat('3.9'), { once: true }),
  say('hanne.k3.06', 'hanne', 'Raus jetzt.', beat('3.9-gewaehlt'), { once: true }),
  // outside (npc chapter 'k3g'): Hanne's answer depends on what was carried out of the Festsaal
  ...[
    ['hanne.k3.07', 'Den behältst du. Ich hab die Wand im Kopf, das reicht mir.', 'tuergriff'],
    ['hanne.k3.08', 'Ein Dukat. Den hat der Bauer aus Rohrbach auch gekriegt. Hoffentlich.', 'dukat'],
    ['hanne.k3.09', 'Die Uhr. Die geht noch. Die weiß nicht, was passiert ist.', 'uhr'],
    ['hanne.k3.10', 'Nichts. Ist auch eine Antwort.', 'nichts'],
  ].map(([id, text, value]) => say(id, 'hanne', text, { event: 'npc:talk', npc: 'hanne', chapter: 'k3g', topic: 'greet', flag: 'flag.k3_objekt', value })),
  say('laub.k3.wirtschaft', 'laub', 'Die Wirtschaftsgebäude da drüben, Ställe, Remisen, die Kasernen: die stehen morgen noch fast alle. Was brennt, ist das, was schnell gebaut wurde.', found('clue.k3.wirtschaft'), { once: true, src: [src('EN-KC', 'P')] }),
  // Zwinger
  ...seq(found('clue.k3.jost'), [
    ['jost.k3.01', 'jost', 'Raus! Lauft! Die Hunde verbrennen nicht. Nicht meine.'],
    ['jost.k3.02', 'jost', 'Diane, du führst. Sultan, halt die Klappe und lauf. Bijou, das ist kein Hirsch, das ist Feuer!'],
    ['jost.k3.03', 'jost', 'Die finden den Weg allein. Bloß nicht zurück.'],
    ['jost.k3.04', 'jost', 'Einer muss sie ja wieder heimholen.'],
    ['beat.k3.horn', 'geraeusch', '[Das Horn bläst einmal, weit weg, falsch und zu hoch.]'],
    ['laub.k3.alle', 'laub', 'Die Franzosen, die Preußen, die Leute aus den Dörfern, der Hof selbst. Jeder hat etwas mitgenommen. Man könnte sagen, sie taten, was alle taten.'],
  ]),
  say('marlene.k3.abend', 'marlene', 'Du riechst nach Rauch. Hier hat niemand ein Feuer gemacht. Ich frag auch nicht. (Pause.) Doch, ich frag. Morgen.', beat('3.12-zurueck'), { once: true }),
  say('laub.k3.ende', 'laub', 'Danach kommt nicht mehr viel. Danach kommen nur die Karren. Ich muss Ihnen etwas sagen, aber nicht heute.', beat('3.13'), { once: true }),
  // ---- Runde 3 (Verdrahtung): Zeilen, die die Bibel nicht ausschreibt. Fiktion, im Ton von 08-stimmen;
  // gesprochen von content/story/03-kapitel-3.story.json (Trigger '3.x' feuern nie von selbst).
  say('laub.k3.seite_offen', 'laub', 'Die Seite ist offen. Eintragen können Sie hier, bestätigen nur im Heute. Der Kommissär wartet im Ehrenhof. Er hat Zeit. Wir auch. Noch.', beat('3.5-seite'), { once: true }),
  say('laub.k3.kommissaer', 'laub', 'Der Kommissär ist da. Wenn Sie ihn lassen, sagt er, in wessen Namen. Danach brennt es. Gehen Sie hin, wenn Sie bereit sind, nicht vorher.', beat('3.7'), { once: true }),
  say('laub.k3.draussen', 'laub', 'Taghell. Und die Meute ist da, angelockt vom Lärm. Im Feuerschein sieht keiner Ihre Laterne. Aber jeder hört Ihre Schritte.', beat('3.11'), { once: true }),
  say('laub.k3.pforte', 'laub', 'Die Mauer hält sie ab. Hunde gehen nicht, wo Gärtner schimpfen. Atmen Sie. Dann nach Norden, zum Zwinger.', beat('3.11-pforte'), { once: true }),
  say('laub.k3.jaguar', 'laub', 'Augen. Gelb, auf Kniehöhe. Das ist kein Hund, das ist der Jaguar aus der Menagerie. Der Herzog hat ihn kommen lassen, damit man ihn ansieht. Jetzt sieht er uns an. Laterne an. Licht mag er nicht.', beat('3.11-jaguar'), { once: true }),
  say('laub.k3.jaguar_down', 'laub', 'Er wollte nur wissen, ob Sie echt sind. Sie sind es. Aufstehen. Leise.', beat('3.11-jaguar-down'), { once: true }),
  say('beat.k3.hunde', 'geraeusch', '[Echte Hunde, nicht aus Rauch, laufen an dir vorbei in die Nacht. Keiner sieht sich um.]', beat('3.12-hunde'), { once: true }),
  // 3.13: the rescued object, found again today in the field station (06-enden §6.3: it lies on the table next to the Bussole)
  say('laub.k3.heute.tuergriff', 'laub', 'Ein Türgriff. Messing, angelaufen, und er riecht nach Rauch. Fragen Sie mich nicht, wie er hierherkommt. Ich wohne in einer Bussole, ich stelle solche Fragen nicht mehr.', beat('3.13-objekt'), { once: true }),
  say('laub.k3.heute.dukat', 'laub', 'Ein Dukat mit dem Schloss darauf. Er ist noch warm. Fragen Sie mich nicht, wie er hierherkommt. Ausgeben würde ich ihn nicht.', beat('3.13-objekt'), { once: true }),
  say('laub.k3.heute.uhr', 'laub', 'Hören Sie das? Die Uhr mit dem Alabaster. Sie tickt. Sie geht nach, um ungefähr zweihundert Jahre, aber sie geht.', beat('3.13-objekt'), { once: true }),
  say('laub.k3.heute.nichts', 'laub', 'Der Tisch ist leer. Nichts, hat sie gesagt, ist auch eine Antwort. Ich trage es so ein.', beat('3.13-objekt'), { once: true }),
];

write('kapitel-3', {
  pack: 'kapitel-3',
  nouns,
  clues,
  cases,
  dialogue,
  hints: hints('case.k3', ch, [
    'Das Datum hat der Regierungsrat notiert. Die Soldaten sagen es auch, wenn man ihnen beim Abladen zuhört. Und der Kommissär sagt, in wessen Namen er anzündet, aber erst, wenn Sie ihn lassen.',
    'Gehen Sie in den Sammlungsflügel hinauf. Die Kisten erzählen, wohin sie sollten, und das Echo dort, wer sie aufgehalten hat. Die Falltür kennt der Kanzlist. Er erzählt es gern, wenn man ihn nicht unterbricht.',
    'Messen Sie die Galerie. Hundert Fuß sind keine dreiunddreißig Meter, hundert Klafter fast zweihundert. Und schauen Sie vom Garten aus nach Norden auf die Ställe: Was morgen noch steht, hat nicht gebrannt.',
  ]),
});
