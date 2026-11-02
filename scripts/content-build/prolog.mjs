import { clue, noun, say, seq, hints, src, write } from './common.mjs';

const ch = 'p';
const E = '1789';
const T = 'today';
const EH = [1216, -1114]; // Ehrenhof (TF-01)
// Inside the field station's trailer (story/hub/station.ts STATION, 760/−915): the hub items and
// the tablet / compass page. The walls keep the player > 1.35 m from the centre, so these never
// become world markers or E targets — the story grants them with a card (hub items, P7).
const BAUWAGEN = [760, -915];
// What the printouts at the station show in their card sketch: the palace site (Corps de logis)
const PALAST = [1195, -1095];
const clues = [
  clue('clue.p.lageplan', {
    title: 'Lageplan an der Pinnwand', kind: 'document', at: BAUWAGEN, r: 1, era: T, anchor: 'loc.p.station', chapter: ch, fiction: false, sketch: [...PALAST, 260],
    text: 'Ein großer Ausdruck „Lageplan Schloss Karlsberg, Forschungsstand 2006 (Nachzeichnung)“, darunter klein: „Grundlage: schloss-carlsberg.de, CC BY-SA 2.0 DE“. Die Legende nennt Ehrenhof, Corps de logis, Galerie, Orangerie, Marstall, Reithalle, Exerzierplatz, Zwinger, Eiskeller. Den Ehrenhof umschließen drei Flügel. Reithalle und Exerzierplatz liegen weit im Norden. Der Titelstempel lautet „Rekonstruktion Sommer 1789 – Hypothese“.',
    nouns: ['n.ehrenhof', 'n.exerzierplatz', 'n.reitbahn', 'n.orangerie', 'n.galerie', 'n.marstall', 'n.eiskeller', 'n.jahr_1789'],
  }),
  clue('clue.p.messtischblatt', {
    title: 'Messtischblatt an der Pinnwand', kind: 'map', at: BAUWAGEN, r: 1, era: T, anchor: 'loc.p.station', chapter: ch, fiction: false, sketch: [...PALAST, 320],
    text: 'Fotokopie eines Messtischblatts. Bleistift von Marlene: „1935 – liegt nur 10–15 m daneben, gut brauchbar.“',
    nouns: ['n.jahr_1935', 'n.versatz_15'],
  }),
  clue('clue.p.handbuch', {
    title: 'Reliefmuster-Handbuch des Forstamts', kind: 'document', at: BAUWAGEN, r: 1, era: T, anchor: 'loc.p.station', chapter: ch, fiction: false,
    text: 'Das Reliefmuster-Handbuch des Forstamts im Regal, acht Karten. Die Karten stehen ab jetzt im Codex.',
    nouns: ['n.hohlweg', 'n.wassergraben', 'n.ausbruchgraben', 'n.bombentrichter', 'n.meilerplatz'],
    facts: ['rm.01', 'rm.02', 'rm.03', 'rm.04', 'rm.05', 'rm.06', 'rm.07', 'rm.08'],
  }),
  clue('clue.p.laubblatt', {
    title: 'Kartendruck in der Schublade', kind: 'map', at: BAUWAGEN, r: 1, era: T, anchor: 'loc.p.station', chapter: ch, fiction: true, sketch: [...PALAST, 320],
    text: 'Druck eines bayerischen Positionsblatts mit gestochener Schrift „Ruine Carlsberg“, „Carlsbergerhof“, „Sanddorf“. Am Rand steht in Bleistift und sehr ordentlicher Kurrentschrift: „Aufgen. Nov. 1840. Q. L. – Standpunkt 17 am alten Forsthaus.“ Daneben liegt eine Messing-Bussole, kalt und still.',
    nouns: ['n.jahr_1840'], flags: ['flag.tool_map'],
  }),
  clue('clue.p.mauerrest', {
    title: 'Mauerrest am Weiher', kind: 'relief', at: [813, -903], r: 15, era: T, anchor: 'r03-03', chapter: ch, fiction: false,
    text: 'Ein kleines Rechteck aus geraden Kanten neben dem Damm.',
    facts: ['rm.07'], req: { scanMode: 2 },
  }),
  clue('clue.p.orangeriemauer', {
    title: 'Stützmauer der Orangerie', kind: 'relief', at: [1237, -966], r: 40, era: T, anchor: 'KB-30', chapter: ch, fiction: false,
    text: 'Eine schnurgerade Kante, 81 m lang, darunter eine Bank, die 5,3 m tiefer liegt. Darüber eine ebene Fläche.',
    nouns: ['n.orangerie'], req: { scanMode: 3 },
  }),
  clue('clue.p.ehrenhof', {
    title: 'Die ebene Lichtung', kind: 'relief', at: EH, r: 35, era: T, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Eine ebene Fläche auf 344,8 m Höhe. Im Süden, Osten und Norden ziehen flache Mauerzüge herum, nach Westen ist sie offen.',
    facts: ['rm.01'], req: { scanMode: 2 },
  }),
  clue('clue.p.nordterrasse', {
    title: 'Die Nordterrasse', kind: 'relief', at: [1227, -1466], r: 60, era: T, anchor: 'KB-20', chapter: ch, fiction: false,
    text: 'Eine zweite, noch größere ebene Fläche, 190 × 95 m, auf fast derselben Höhe (344,1 m). Steile Kanten im Süden und Osten, keine Flügel.',
    nouns: ['n.reitbahn'],
  }),
  clue('clue.p.kartenvergleich', {
    title: 'Laubs Karte über dem Relief', kind: 'map', at: EH, r: 35, era: T, anchor: 'TF-01', chapter: ch, fiction: false,
    text: 'Laubs Karte über dem Relief. Die roten Gebäudezeichen sitzen ein Stück östlich der Mauerzüge. Ein Messlineal erscheint automatisch: rund 50 m.',
    nouns: ['n.versatz_50', 'n.versatz_500'], req: { clues: ['clue.p.laubblatt', 'clue.p.ehrenhof'] },
  }),
  clue('clue.p.hohlweg', {
    title: 'Der Hohlweg', kind: 'relief', at: [1172, -1238], r: 22, era: T, anchor: 'KB-10', chapter: ch, fiction: false,
    text: 'Ein Weg, 2 bis 3 m tief eingeschnitten, schnurgerade nach Norden. Er folgt keinem Bach.',
    nouns: ['n.hohlweg'], facts: ['rm.04'], req: { scanMode: 2 },
  }),
  clue('clue.p.eiskeller', {
    title: 'Die Grube mit Ringwall', kind: 'relief', at: [1508, -1296], r: 15, era: T, anchor: 'KB-50', chapter: ch, fiction: false,
    text: 'Eine runde Grube, 10 m breit, 1,8 m tief, mit einem Ringwall darum. Sie liegt einzeln, ohne Nachbarn.',
    nouns: ['n.eiskeller'], facts: ['rm.02'], req: { scanMode: 3 },
  }),
  clue('clue.p.punktwolke', {
    title: 'Ausschnitt aus der Punktwolke', kind: 'object', at: BAUWAGEN, r: 1, era: T, anchor: 'portable', chapter: ch, fiction: true, sketch: [...EH, 80],
    text: 'Bodenpunkte unter dem Kronendach. Quer über den Ehrenhof eine Reihe von Abdrücken, etwa 8 cm groß, paarweise, im Abstand eines Trabs.',
    nouns: ['n.hunde', 'n.wild', 'n.messfehler'], req: { clues: ['clue.p.ehrenhof'] },
  }),
  clue('clue.p.seite_eins', {
    title: 'Eine Seite im Deckel der Bussole', kind: 'document', at: BAUWAGEN, r: 1, era: T, anchor: 'portable', chapter: ch, fiction: true, sketch: [...EH, 80],
    text: 'Ein angesengtes Blatt, Handschrift des 18. Jahrhunderts, Überschrift: „Was der Hof schuldig blieb“. Darunter nur Spalten: „Wem – Was – Wann – Wo“. Unten ein Satz, in anderer Tinte und in Laubs Kurrent: „Fortgesetzt Nov. 1840. Nicht vollendet.“',
    flags: ['flag.chronik_offen'], req: { clues: ['clue.p.punktwolke'] },
  }),
  clue('echo.p.diener', {
    title: 'Erinnerung: Zu Fuß, Monsieur!', kind: 'echo', at: EH, r: 35, era: E, anchor: 'TF-01', chapter: ch, fiction: true,
    text: 'Beim ersten Wechsel automatisch. Ein Diener ruft über den Hof, ein Gärtner summt, ein zweiter zischt ihn an. Fern im Norden heult ein einzelner Hund.',
    facts: ['cx.03'], flags: ['flag.p_erster_wechsel'], req: { clues: ['clue.p.seite_eins'] },
  }),
];

const nouns = [
  noun('n.ehrenhof', 'Ehrenhof', 'place'),
  noun('n.exerzierplatz', 'Exerzierplatz', 'place'),
  noun('n.reitbahn', 'Reitbahn', 'place'),
  noun('n.orangerie', 'Orangerie', 'place'),
  noun('n.galerie', 'Galerie', 'place'),
  noun('n.marstall', 'Marstall', 'place'),
  noun('n.hohlweg', 'Hohlweg', 'object', 'Hohlwege'),
  noun('n.wassergraben', 'Wassergraben', 'object', 'Wassergräben'),
  noun('n.ausbruchgraben', 'Ausbruchgraben', 'object', 'Ausbruchgräben'),
  noun('n.eiskeller', 'Eiskeller', 'object', 'Eiskeller'),
  noun('n.bombentrichter', 'Bombentrichter', 'object', 'Bombentrichter'),
  noun('n.meilerplatz', 'Meilerplatz', 'object', 'Meilerplätze'),
  noun('n.jahr_1840', '1840', 'time'),
  noun('n.jahr_1789', '1789', 'time'),
  noun('n.jahr_1935', '1935', 'time'),
  noun('n.versatz_50', '50', 'other'),
  noun('n.versatz_15', '15', 'other'),
  noun('n.versatz_500', '500', 'other'),
  noun('n.hunde', 'Hunde', 'group'),
  noun('n.wild', 'Wild', 'group'),
  noun('n.messfehler', 'einen Messfehler', 'other'),
];

const cases = [{
  id: 'case.p',
  title_de: 'Vermessung',
  intro_de: 'Was der Hof schuldig blieb. Wem – Was – Wann – Wo. Fortgesetzt Nov. 1840. Nicht vollendet.',
  entries: [
    { id: 'entry.p.1', kind: 'fact', factId: 'cx.01', text_de: 'Die eingeebnete Fläche zwischen den drei Mauerzügen ist {wo} des Schlosses.',
      blanks: [{ id: 'wo', category: 'place', correct: 'n.ehrenhof', accepts: ['n.ehrenhof', 'n.exerzierplatz', 'n.reitbahn'],
        labels_de: { 'n.ehrenhof': 'der Ehrenhof', 'n.exerzierplatz': 'der Exerzierplatz', 'n.reitbahn': 'die Reitbahn' } }] },
    { id: 'entry.p.2', kind: 'fact', factId: 'cx.40', text_de: 'Die über fünf Meter hohe Stufe südlich des Schlosses ist die Stützmauer {wo}.',
      blanks: [{ id: 'wo', category: 'place', correct: 'n.orangerie', accepts: ['n.orangerie', 'n.galerie', 'n.marstall'],
        labels_de: { 'n.orangerie': 'der Orangerie', 'n.galerie': 'der Galerie', 'n.marstall': 'des Marstalls' } }] },
    { id: 'entry.p.3', kind: 'fact', factId: 'rm.04', text_de: 'Der tief eingeschnittene Weg westlich des Schlosses ist ein {was}.',
      blanks: [{ id: 'was', category: 'object', correct: 'n.hohlweg', accepts: ['n.hohlweg', 'n.wassergraben', 'n.ausbruchgraben'] }] },
    { id: 'entry.p.4', kind: 'fact', factId: 'rm.02', text_de: 'Die runde Grube mit Ringwall östlich des Schlosses war ein {was}.',
      blanks: [{ id: 'was', category: 'object', correct: 'n.eiskeller', accepts: ['n.eiskeller', 'n.bombentrichter', 'n.meilerplatz'] }] },
    { id: 'entry.p.5', kind: 'fact', factId: 'cx.33', text_de: 'Auf der bayerischen Karte von {wann} heißt der Ort ‚Ruine Carlsberg‘.',
      blanks: [{ id: 'wann', category: 'time', correct: 'n.jahr_1840', accepts: ['n.jahr_1840', 'n.jahr_1789', 'n.jahr_1935'] }] },
    { id: 'entry.p.6', kind: 'fact', factId: 'cx.33', text_de: 'Auf der heutigen Fassung dieser Karte liegt das Schloss rund {wieviel} Meter zu weit im Osten.',
      blanks: [{ id: 'wieviel', category: 'other', correct: 'n.versatz_50', accepts: ['n.versatz_50', 'n.versatz_15', 'n.versatz_500'] }] },
    { id: 'entry.p.7', kind: 'reading', flag: 'flag.p_spuren', text_de: 'Die Spuren in der Punktwolke stammen von {wer}.',
      blanks: [{ id: 'wer', accepts: ['n.hunde', 'n.wild', 'n.messfehler'], labels_de: { 'n.hunde': 'Hunden', 'n.messfehler': 'einem Messfehler' } }] },
  ],
}];

// Lines the prologue's story file speaks itself (`{"do":"say","line":"…"}` in
// content/story/00-prolog.story.json, timed with sounds, cards and objectives) carry the bible's beat
// names as trigger (`story:beat` with chapter 'p' and beats 'P1' … 'P11'). The story emits its own
// ids ('prolog' / 'p1' …), so these triggers never fire by themselves: they document where a line
// belongs. Lines that simply answer a find stay live (`clue:found`, `player:caught`, `lantern:empty`).
const beat = (b, step) => ({ event: 'story:beat', chapter: ch, beat: b, ...(step ? { step } : {}) });
const found = (id, x = {}) => ({ event: 'clue:found', id, ...x });
const RLS = [src('RLS', 'P')];
const story = (b, lines) => lines.map(([id, speaker, text]) => say(id, speaker, text, beat(b), { once: true }));
const dialogue = [
  // ---- spoken by the story file (timed) --------------------------------------------------------
  ...story('P1', [
    ['marlene.p.01', 'marlene', '{Name}? Hier Marlene, Revier Karlsberg. Bist du gut angekommen? Gut. Der Auftrag ist einfach: Prüf mir die Laserdaten vom letzten Winter.'],
    ['marlene.p.01b', 'marlene', 'Wir wollen wissen, was unter dem Wald liegt, bevor wir dort Wege bauen. Und bevor du fragst: Ja, da oben war mal ein Schloss. Der Wald steht drauf.'],
    ['marlene.p.bauwagen', 'marlene', 'Im Wagen hängt alles, was du brauchst: Lageplan an der Pinnwand, das Handbuch im Regal. Und in der Schublade liegt noch Kram vom Vorbesitzer. Guck ruhig rein.'],
  ]),
  ...story('P2', [
    ['marlene.p.relief', 'marlene', 'Auf deinem Tablet ist der Laserscan. Drück mal die Eins. Dann siehst du den Boden, als hätte jemand den Wald weggeräumt.'],
    ['marlene.p.damm', 'marlene', 'Siehst du den Weiher? Das ist kein Naturteich, das ist Barock. Schalt mal auf Lokales Relief, dann siehst du mehr.'],
  ]),
  ...story('P3', [
    ['marlene.p.weg', 'marlene', 'Und, {Name}: Wir schauen, wir graben nicht. Nichts anfassen, nichts mitnehmen. Was da im Boden liegt, gehört dem Land, und es ist geschützt.'],
    ['marlene.p.flug', 'marlene', 'Der Weg nach oben ist steil. Wenn du’s eilig hast: Mit F fliegst du über die Daten wie mit der Drohne. Nur gucken. Landen nicht vergessen.'],
    ['laub.p.intro', 'laub', 'Fünf Meter dreißig. Für Orangen.'],
    ['laub.p.intro.b', 'laub', 'Erschrecken Sie nicht, das ist schlecht für die Messgenauigkeit. Laub, Quirin, königlich bayerischer Geometer, abgeordnet zur Landesaufnahme im Rheinkreis.'],
    ['laub.p.intro.c', 'laub', 'Seit November 1840 verwaltungstechnisch verschollen. Meine letzten Tagegelder hat man mir übrigens nie ausgezahlt.'],
    ['laub.p.intro.d', 'laub', 'Sie vermessen den Berg? Gut. Dann sind wir zu zweit. Ich bin der Kleinere.'],
  ]),
  ...story('P4', [
    ['laub.p.intro2', 'laub', 'Fragen Sie nicht, wie ich in das Messing gekommen bin. Später. Fragen Sie lieber, warum ein Herzog einen ganzen Berg umgraben lässt, damit der Hof eben liegt. Antwort: weil er es konnte. Fußnote: Bezahlt hat er es nicht.'],
    ['laub.p.versatz', 'laub', 'Fünfzig Meter. Ich sehe es selbst. Ich möchte festhalten, dass mein Blatt 1840 vollkommen in Ordnung war.'],
    ['laub.p.versatz.b', 'laub', 'Die Herrschaften, die es zweihundert Jahre später auf ihre Koordinaten genagelt haben, die hatten offenbar einen schlechten Tag.'],
    ['laub.p.versatz.c', 'laub', 'Fünfhundert hätte man gemerkt. Fünfzig merkt nur ein Geometer. Und ein Geometer merkt es ewig.'],
  ]),
  ...story('P7', [
    ['marlene.p.punkte', 'marlene', 'Ich schick dir was aufs Tablet. Das hat der Kollege in der Punktwolke gefunden, mitten auf der Lichtung. Sag mir, dass das Wildschweine sind.'],
    ['marlene.p.punktwolke', 'marlene', 'Wildschweine machen andere Spuren. Und Hunde waren da nicht, der Wald war gesperrt.'],
    ['kollege.p.punktwolke', 'kollege', 'Mehrfachreflexion. Ein Messfehler.'],
    ['laub.p.punktwolke', 'laub', 'Hunde.'],
    ['laub.p.punktwolke.b', 'laub', 'Fragen Sie nicht. Füllen Sie die Seite aus.'],
  ]),
  ...story('P8', [
    ['laub.p.regeln', 'laub', 'So. Der Berg glaubt Ihnen jetzt drei Dinge. Das reicht für einen Blick.'],
    ['laub.p.regeln.b', 'laub', 'Hören Sie gut zu, ich sage es nur einmal und dann noch ungefähr vierzigmal.'],
    ['laub.p.regeln.c', 'laub', 'Erstens: Sie können nur dort hinüber, wo die Nadel steht. Taste Q.'],
    ['laub.p.regeln.d', 'laub', 'Zweitens: Ihre Laterne brennt dort drüben auf Kosten Ihrer Zeit. Wenn das Öl aus ist, sind Sie wieder hier. Unsanft.'],
    ['laub.p.regeln.e', 'laub', 'Drittens: Wenn Sie ein Horn hören, legen Sie sich hin. Nicht diskutieren. Hinlegen.'],
    ['laub.p.regeln.f', 'laub', 'Viertens: Wenn Sie zurück wollen, halten Sie Q. Es geht nicht, solange Sie jemand ansieht.'],
  ]),
  ...story('P9', [
    ['laub.p.blick', 'laub', 'Stellen Sie sich so, dass Sie das Corps de logis vor sich haben. Also dort, wo heute die Buchen stehen. Ein Geometer wechselt nie mit dem Rücken zum Objekt.'],
    ['laub.p.1789', 'laub', 'Sehen Sie. Kein Wald. Den hat man erst hinterher gepflanzt, als es nichts mehr zu sehen gab.'],
    ['laub.p.schloss', 'laub', 'Gehen Sie ruhig hinein. Eingeladen hat man Sie nicht. Mich auch nicht, und ich habe das Haus später trotzdem vermessen. Was davon übrig war.'],
    ['laub.p.zurueck', 'laub', 'Zurück. Jetzt.'],
    ['laub.p.hinlegen', 'laub', 'Das Horn. Drittens, wie besprochen: Hinlegen, X. Licht aus, L. Oder Q halten, solange keiner herschaut.'],
  ]),
  ...story('P10', [
    ['marlene.p.abend', 'marlene', 'Du bist ja ganz blass. Mach dir einen Tee. Morgen früh komm ich mit Brötchen vorbei.'],
  ]),
  ...story('P11', [
    ['laub.p.ende', 'laub', 'Machen Sie die Laterne aus. Und dann schlafen Sie. Morgen ist 1789.'],
  ]),
  // ---- live: answers to a find -------------------------------------------------------------------
  say('marlene.p.02', 'marlene', 'Ach, die Bussole. Die lag schon im Wagen, als wir ihn gekauft haben. Die zeigt nicht nach Norden, hab ich festgestellt. Behalt sie trotzdem, sie bringt Glück, sagt der Kollege. Er hat sie nie angefasst.', found('clue.p.laubblatt'), { once: true }),
  say('marlene.p.mauerrest', 'marlene', 'Gerade Linien und rechte Winkel macht der Wald nicht. Das war mal eine Mauer.', found('clue.p.mauerrest'), { once: true }),
  say('marlene.p.hohlweg', 'marlene', 'Das ist ein Hohlweg. Karren, Hufe, Regen, ein paar hundert Jahre, und der Weg frisst sich in den Boden. Bei Nebel ist das der dunkelste Ort im ganzen Revier. Und der stillste.', found('clue.p.hohlweg'), { once: true }),
  say('laub.p.ehrenhof', 'laub', 'Drei Flügel, offen zur Straße. So baut man, wenn man gesehen werden will.', found('clue.p.ehrenhof', { hasClue: 'clue.p.lageplan' }), { once: true }),
  say('laub.p.nordterrasse', 'laub', 'Auch eben. Aber da haben keine Flügel gestanden, da sind Pferde im Kreis gelaufen. Vermutlich. Ich war nicht eingeladen.', found('clue.p.nordterrasse'), { once: true }),
  say('laub.p.eiskeller', 'laub', 'Bombentrichter kommen selten allein, sagt Ihr Handbuch. Und Köhler bauen ihre Meiler nicht in Löcher, sondern auf Platten.', found('clue.p.eiskeller', { hasClue: 'clue.p.handbuch' }), { once: true }),
  // the first time the pack gets you (spoken when the curtain lifts in the field station)
  ...seq({ event: 'player:caught', chapter: 'prolog' }, [
    ['laub.p.gestellt', 'laub', 'Da sind Sie ja wieder. Gestellt, nicht gerissen. Auf diesem Unterschied bestehe ich.'],
    ['laub.p.gestellt.b', 'laub', 'Was Sie drüben gefunden und noch nicht bestätigt hatten, darf die Meute behalten. Was bestätigt ist, nimmt Ihnen keiner.'],
    ['laub.p.gestellt.c', 'laub', 'Nächstes Mal: Horn, hinlegen, Licht aus. Oder rechtzeitig Q halten. Ich sage es ungern zweimal. Ich sage es vierzigmal.'],
  ]),
  say('laub.p.oel', 'laub', 'Das Öl. Zweitens, wie gesagt. Die Erinnerung hält so lange wie Ihr Licht. Löschen Sie es, wenn Sie es nicht brauchen. Das spart Öl und Hunde.', { event: 'lantern:empty', chapter: 'prolog', era: '1789' }, { once: true }),
  // Echo: Diener und Gärtner (1789)
  ...seq({ event: 'echo:start', id: 'echo.p.diener' }, [
    ['echo.p.diener.01', 'diener', 'Zu Fuß, Monsieur! Hinauf fährt nur Serenissimus.', RLS],
    ['echo.p.diener.02', 'geraeusch', '[Ein Gärtner an der Rabatte summt ein Lied.]'],
    ['echo.p.diener.03', 'gaertner', 'Pst. Willst du Prügel?', RLS],
    ['echo.p.diener.04', 'geraeusch', '[Das Summen bricht ab. Fern im Norden ein einzelnes langes Heulen.]'],
  ]),
];

write('prolog', {
  pack: 'prolog',
  nouns,
  clues,
  cases,
  dialogue,
  hints: hints('case.p', ch, [
    'Ein Geometer schaut zuerst, und erst dann liest er, was andere hingeschrieben haben. Gehen Sie zu den Stellen. Danach an die Pinnwand.',
    'Der Lageplan kennt die Namen, das Gelände kennt die Formen. Legen Sie beides übereinander. Die Taste M, falls Ihnen das Wort ‚Überlagerung‘ zu modern ist. Und lesen Sie das Handbuch. Ich habe es auch gelesen, heimlich, nachts.',
    'Die Grube mit dem Ringwall liegt dort, wo der Plan ‚Eiskeller‘ schreibt. Bomben fallen selten so ordentlich. Zu meiner Karte: Messen Sie vom Hof auf dem Papier bis zum Hof im Boden. Und dann entschuldigen Sie sich bei mir.',
  ]),
});
