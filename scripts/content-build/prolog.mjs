import { writeFileSync } from 'node:fs';
import { clue, noun, say, seq, hints, src, write, ROOT } from './common.mjs';

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
    text: 'Im Regal: das Reliefmuster-Handbuch des Forstamts, acht Musterkarten. Die Karten stehen ab jetzt im Codex.',
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
    // halfway up the Waldweg (playtest round 10 F-10: 45–60 s of uphill with nothing on the way); the
    // Kohlplatten quest Marlene offers at the top picks the teaser up (no fact here, no source needed)
    ['marlene.p.halbweg', 'marlene', 'Halbe Höhe. Guck mal links und rechts am Hang: runde, flache Stellen, wie Teller. Merk sie dir. Die erklär ich dir, wenn du oben bist.'],
    ['laub.p.intro', 'laub', 'Fünf Meter dreißig. Für Orangen.'],
    ['laub.p.intro.b', 'laub', 'Erschrecken Sie nicht, das ist schlecht für die Messgenauigkeit. Laub, Quirin, königlich bayerischer Geometer, abgeordnet zur Landesaufnahme im Rheinkreis.'],
    ['laub.p.intro.c', 'laub', 'Seit November 1840 verwaltungstechnisch verschollen. Meine letzten Tagegelder hat man mir übrigens nie ausgezahlt.'],
    ['laub.p.intro.d', 'laub', 'Sie vermessen den Berg? Gut. Dann sind wir zu zweit. Ich bin der Kleinere.'],
  ]),
  ...story('P3Q', [
    ['laub.p.quelle', 'laub', 'Hören Sie das? Nein, natürlich nicht. Wasser. Unten im Hang, wo der Bach anfängt. Es erinnert sich an etwas.'],
    ['laub.p.quelle.b', 'laub', 'Gehen Sie hin. Die Nadel zeigt es Ihnen.'],
    ['laub.p.quelle.nah', 'laub', 'Da. Die Karlsbergquelle. Ein Trog, eine Mauer, ein Rohr. Das Wasser ist älter als alle drei.'],
    ['laub.p.quelle.trog', 'laub', 'Halten Sie die Hand hinein. Nein, das ist nicht hygienisch. Tun Sie es trotzdem.'],
  ]),
  ...story('P3R', [
    ['laub.p.quelle.1789', 'laub', 'Siebzehnhundertneunundachtzig. Dieselbe Quelle, zweihundert Jahre jünger. Gefasst in Stein, mit Bronze. Ob sie wirklich so aussah? Mein Blatt sagt nichts dazu. Das Wasser schon.'],
    ['laub.p.quelle.regel', 'laub', 'Das Wasser erinnert sich. Ein Tropfen davon sitzt jetzt in der Bussole. Wo der Boden sich genauso gut erinnert, nimmt er uns mit. Mehr später.'],
    ['laub.p.quelle.zurueck', 'laub', 'Zurück geht es immer: Q gedrückt halten. Jetzt bitte. Mir bekommt das achtzehnte Jahrhundert nicht.'],
    ['laub.p.quelle.heute', 'laub', 'Da sind wir wieder. Merken Sie sich die Stelle. Und nun hinauf, ich habe am Ehrenhof etwas nachzumessen.'],
  ]),
  ...story('P4', [
    ['laub.p.intro2', 'laub', 'Fragen Sie nicht, wie ich in das Messing gekommen bin. Später. Fragen Sie lieber, warum ein Herzog einen ganzen Berg umgraben lässt, damit der Hof eben liegt. Antwort: weil er es konnte. Fußnote: Bezahlt hat er es nicht.'],
    ['laub.p.versatz', 'laub', 'Fünfzig Meter. Ich sehe es selbst. Ich möchte festhalten, dass mein Blatt 1840 vollkommen in Ordnung war.'],
    ['laub.p.versatz.b', 'laub', 'Die Herrschaften, die es zweihundert Jahre später auf ihre Koordinaten genagelt haben, die hatten offenbar einen schlechten Tag.'],
    ['laub.p.versatz.c', 'laub', 'Fünfhundert hätte man gemerkt. Fünfzig merkt nur ein Geometer. Und ein Geometer merkt es ewig.'],
  ]),
  ...story('P7', [
    ['marlene.p.punkte', 'marlene', 'Hast du die Datei? Die hat der Kollege in der Punktwolke gefunden, mitten auf der Lichtung. Sag mir, dass das Wildschweine sind.'],
    ['marlene.p.punktwolke', 'marlene', 'Wildschweine machen andere Spuren. Und Hunde waren da nicht, der Wald war gesperrt.'],
    ['kollege.p.punktwolke', 'kollege', 'Mehrfachreflexion. Ein Messfehler.'],
    ['laub.p.punktwolke', 'laub', 'Hunde.'],
    ['laub.p.punktwolke.b', 'laub', 'Fragen Sie nicht. Gehen Sie hin und sehen Sie selbst.'],
  ]),
  ...story('P8', [
    ['laub.p.regeln', 'laub', 'So. Das Wasser hat Sie einmal mitgenommen, und der Berg kennt Sie jetzt. Das reicht, um selbst zu gehen.'],
    ['laub.p.regeln.b', 'laub', 'Hören Sie gut zu, ich sage es nur einmal und dann noch ungefähr vierzigmal.'],
    ['laub.p.regeln.c', 'laub', 'Erstens: Sie können nur dort hinüber, wo die Nadel steht. Dort erinnert sich der Boden. Taste Q.'],
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
  // (only once Laub is there, and only for the pack: after a fight lost to the mist in 2025 his
  // horn-and-lantern advice made no sense — playtest round 5)
  ...seq({ event: 'player:caught', chapter: 'prolog', by: 'pack', flag: 'story.laub' }, [
    ['laub.p.gestellt', 'laub', 'Da sind Sie ja wieder. Gestellt, nicht gerissen. Auf diesem Unterschied bestehe ich.'],
    ['laub.p.gestellt.b', 'laub', 'Verloren haben Sie nichts. Was Sie gefunden haben, steht im Feldbuch, und der Stab ist noch da. Nur den Weg gehen Sie noch einmal.'],
    ['laub.p.gestellt.c', 'laub', 'Nächstes Mal: Horn, hinlegen, Licht aus. Oder rechtzeitig Q halten. Ich sage es ungern zweimal. Ich sage es vierzigmal.'],
  ]),
  // a fight lost on the way: what helps against what you meet in the prologue
  ...seq({ event: 'player:caught', chapter: 'prolog', by: 'combat', flag: 'story.laub' }, [
    ['laub.p.umgeworfen', 'laub', 'Der Nebel hat Sie umgeworfen. Nicht gefressen. Stehen Sie auf, es ist nicht weit.'],
    ['laub.p.umgeworfen.b', 'laub', 'Wenn es leuchtet und ausholt: zur Seite, Leertaste. Und Ihr Balsam heilt, Taste H. Ich hatte damals nur Schnupftabak.'],
  ]),
  say('marlene.p.umgeworfen', 'marlene', '{Name}? Du bist auf einmal still. Alles gut? Trink was, und dann weiter. Der Balsam ist in der Tasche.', { event: 'player:caught', chapter: 'prolog', by: 'combat', beat: ['p1', 'p2', 'p3'] }, { once: true }),
  say('laub.p.oel', 'laub', 'Das Öl. Zweitens, wie gesagt. Die Erinnerung hält so lange wie Ihr Licht. Löschen Sie es, wenn Sie es nicht brauchen. Das spart Öl und Hunde.', { event: 'lantern:empty', chapter: 'prolog', era: '1789' }, { once: true }),
  // Echo: Diener und Gärtner (1789)
  ...seq({ event: 'echo:start', id: 'echo.p.diener' }, [
    ['echo.p.diener.01', 'diener', 'Zu Fuß, Monsieur! Hinauf fährt nur Serenissimus.', RLS],
    ['echo.p.diener.02', 'geraeusch', '[Summen]'],
    ['echo.p.diener.03', 'gaertner', 'Pst. Willst du Prügel?', RLS],
    ['echo.p.diener.04', 'geraeusch', '[Heulen, fern]'],
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

// =====================================================================================================
// Quests (docs/ACTION-RPG.md §11.0) → content/quests/00-prolog.quests.json
// Learning by doing: every objective is a verb (examine, reach, fight, echo); the history is told at
// the turn-in, with sources, and lands in the codex. No blanks, no word choices, no quizzes.
// =====================================================================================================
const T0 = 'today';
/** A spoken quest line; `fact` = the codex card it unlocks at the turn-in, `src` = its sources. */
const ln = (speaker, text, o = {}) => ({ speaker, text, ...(o.fact ? { fact: o.fact } : {}), ...(o.src ? { sources: o.src } : {}) });
const place = (x, z, r, era) => ({ x, z, ...(r ? { r } : {}), ...(era ? { era } : {}) });
const LIDAR = src('LIDAR');

// Terrain-checked spots (scripts/content-build/probe.mjs + terrain.mjs, 2026-11-16): dry, walkable,
// outside every footprint of their era, inside the playable area.
export const P_SPOTS = {
  stab: [762.2, -912.3], // right of the trailer door (playtest 1792841; the story's p1 objective and src/systems/story/hub/station.ts agree)
  quelle: [1059.3, -833.1], // in front of the Karlsbergquelle's trough (src/systems/quelle/layout.ts)
  eiskeller: [1508, -1296], // the pit (KB-50); in 1789 the Eiskeller house KB-B28 stands here — the fight is today
  streuner: [1206, -1113], // inside the Ehrenhof (gravel), not behind the closed gitter (playtest)
  irrlichter: [820, -869], // on the dam of the Karlsbergweiher (not over the water)
  meiler: [[1138, -931], [1040, -902], [1232, -872]], // the flattest spots on the slope below the Orangerie
  trichter: [990, -1044], // forest west of the palace terrace (fiction: a crater "in the scan")
};

const prologQuests = {
  chapter: 'prolog',
  items: [
    {
      id: 'item.p.seite', kind: 'lore', set: 'chronikseiten', fiction: true,
      name_de: 'Seite im Deckel der Bussole',
      text_de: 'Ein angesengtes Blatt, Handschrift des 18. Jahrhunderts: „Was der Hof schuldig blieb“. Darunter Spalten: Wem – Was – Wann – Wo. Unten in Laubs Kurrent: „Fortgesetzt Nov. 1840. Nicht vollendet.“ (Fiktion)',
    },
  ],
  quests: [
    {
      id: 'q.p.feldstation', kind: 'main', era: T0,
      // playtest round 4: in control and in a first small fight inside a minute; the station's
      // Pinnwand / Regal / Schublade are optional now (the hub grants their clues, no quest)
      title_de: 'Der Messstab',
      summary_de: 'Marlene schickt dich in den Wald, aber nicht ohne den Messstab, der draußen am Bauwagen lehnt. Unten am Damm steigt Nebel auf, der dich ansieht.',
      giver: { voice: 'marlene' }, turnin: 'auto',
      // the greeting is the first offer line: it comes before the request (playtest round 5: the order
      // was request first, then „Bist du gut angekommen?“), and the quest is active at once
      offer: [
        ln('marlene', '{Name}? Hier Marlene, Revier Karlsberg. Bist du gut angekommen? Gut. Der Auftrag ist einfach: Prüf mir die Laserdaten vom letzten Winter.'),
        ln('marlene', 'Nimm den Messstab mit, der lehnt draußen am Wagen. Ohne Stab gehst du mir nicht in den Wald. Dann runter zum Damm.'),
      ],
      turnin_lines: [ln('marlene', 'Du schnaufst ja. Was war da unten? … Egal. Der Stab ist zum Messen gebaut. Zum Gehen ist er auch nicht schlecht.')],
      history: [
        ln('marlene', 'Der Laserscan ist vom Winter 2025, ohne Laub an den Bäumen. Seit Januar sind die Daten frei. Ein Punkt pro Meter, und unter den Bäumen liegt der Boden wie ein Abdruck.', { fact: 'cx.34', src: [src('LVGL'), LIDAR] }),
        ln('marlene', 'Und die eine Regel: Wir schauen, wir graben nicht. Der Karlsberg ist ein Bodendenkmal. Wer etwas findet, meldet es.', { fact: 'cx.35', src: [src('SDSCHG'), src('HE-BW')] }),
      ],
      objectives: [
        { id: 'stab', type: 'collect', item: 'item.stab.esche', text_de: 'Den Messstab nehmen: er lehnt draußen am Bauwagen (hingehen, E)',
          hint_de: 'Der Messstab lehnt rechts neben der Wagentür, im goldenen Lichtstrahl: geradeaus zum Wagen, dann E drücken (oder einfach darüberlaufen).',
          place: [place(...P_SPOTS.stab, 0, T0)] },
        {
          id: 'nebel', type: 'kill', enemy: 'nebelling', count: 3, after: ['stab'],
          text_de: 'Unten am Damm: drei Nebelinge vertreiben (Klick oder K)',
          hint_de: 'Den Hang hinunter zur Markierung am Damm. Nebelinge mit dem Stab treffen: Klick oder K, gehalten ein Wuchthieb; holt einer aus, Leertaste: ausweichen.',
          // outside the station's safe ring (40 m round 760/−915), on the flat ground at the foot of
          // the slope (277 m): playtest round 10 F-04, at 803/−889 they sat 4.5 m below the convex crest
          // and the player saw only their HP bars; from 809/−890 the group is in view from x ≈ 790
          where: place(809, -890, 24, T0),
          spawn: [{ kind: 'nebelling', x: 809, z: -890, era: T0, count: 3, radius: 3.5, tier: 0, leash: 30 }],
        },
      ],
      rewards: { xp: 20, skills: [{ id: 'kartograf', tier: 1 }] },
    },
    {
      id: 'q.p.relief', kind: 'main', era: T0,
      title_de: 'Was der Wald verbirgt',
      summary_de: 'Marlene will wissen, was unter dem Wald liegt. Erst der Damm hinter dem Wagen, dann der Weg hinauf bis zur großen Stufe im Wald. Der Laserscan zeigt, was die Bäume verdecken.',
      giver: { voice: 'marlene' }, turnin: 'auto',
      offer: [ln('marlene', 'Erste Aufgabe: Geh zum Damm hinter dem Wagen und sag mir, was der Wald da versteckt. Dann den Weg hinauf nach Osten, bis zu der hohen Stufe im Wald.')],
      turnin_lines: [
        ln('marlene', 'Eine Mauer am Damm und eine Stufe, die keiner gepflanzt hat. Siehst du? Der Wald macht keine rechten Winkel.'),
        ln('marlene', 'Und das am Damm, das mit den Augen? Ich hab nichts gesehen. Schreib es trotzdem auf. Genau so, wie es war.'),
      ],
      history: [
        ln('marlene', 'Gerade Kanten, rechte Winkel, schmale Rücken, die sich nicht nach dem Gelände richten: Das sind Fundamente. Der Wald wächst drüber, aber er biegt sie nicht.', { fact: 'rm.07', src: [src('HE-BW'), LIDAR] }),
        ln('marlene', 'Und der Weiher ist kein Naturteich. Ein gerader Damm quer zum Tal, dahinter eine glatte Fläche: Der Scan findet auf Wasser keine Punkte und füllt es flach.', { fact: 'rm.08', src: [src('HE-BW'), LIDAR] }),
      ],
      objectives: [
        { id: 'damm', type: 'reach', text_de: 'Zum Damm am Karlsbergweiher, hinter dem Bauwagen', where: place(819, -875, 32, T0) },
        {
          id: 'mauer', type: 'examine', clue: 'clue.p.mauerrest',
          text_de: 'Am Damm: Taste 2 (Lokales Relief) drücken, dann zur Markierung gehen',
          // playtest 2026-11-19, „stuck at the lake“: the line said „untersuchen“ and there was no
          // marker; the wall shows itself once you stand on it in Relief 2 (no E needed)
          hint_de: 'Taste 2 schaltet das Lokale Relief ein. Dann zur Markierung am Damm gehen: auf der Stelle zeigt sich der Mauerrest von selbst, E ist nicht nötig. Taste 2 noch einmal: wieder die normale Sicht.',
        },
        // the first fight, small and safe (playtest: no enemy for the first 10–15 minutes): the scan
        // wakes something in the old wall; one weak Nebelling teaches the staff (Klick / K)
        {
          id: 'nebel', type: 'kill', enemy: 'nebelling', count: 1, after: ['mauer'],
          text_de: 'Aus der Mauer kriecht Nebel: mit dem Stab vertreiben (Klick oder K)',
          where: place(816, -884, 20, T0),
          spawn: [{ kind: 'nebelling', x: 815, z: -884, era: T0, count: 1, radius: 0, tier: 0, leash: 25 }],
        },
        { id: 'stufe', type: 'reach', after: ['mauer'], text_de: 'Den Waldweg hinauf nach Osten: die hohe Stufe im Wald (dort Taste 3)', hint_de: 'Der goldene Lichtstrahl im Osten zeigt die Stufe. Den Weg entlang hinauf (Shift: rennen, F: über den Wald fliegen); dort Taste 3 (VAT) drücken.', where: place(1237, -966, 70, T0) },
      ],
      // a balm before the Eiskeller (playtest round 5: the first balms were that fight's own reward)
      rewards: { xp: 80, items: [{ item: 'item.balsam', count: 2 }] },
    },
    {
      id: 'q.p.quelle', kind: 'main', era: T0,
      // NEXT-SESSION §3.6: the first time travel has a cause the player sees (and does): the spring's water
      title_de: 'Wasser, das sich erinnert',
      summary_de: 'Laub hört Wasser, das sich erinnert. Unten im Hang, wo der Karlsbergbach entspringt, liegt die Karlsbergquelle. Er will, dass du die Hand hineinhältst. Was dann passiert, sagt er nicht.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [ln('laub', 'Kommen Sie. Unten am Hang ist eine Quelle. Ich möchte, dass Sie sie anfassen.')],
      turnin_lines: [ln('laub', 'Das Wasser hat Sie mitgenommen und wieder hergegeben. Nicht jeder Ort ist so großzügig. Notieren Sie das.')],
      history: [
        ln('laub', 'Die Karlsbergquelle liegt am Fuß eines Hangs, in einer kleinen Rinne zwischen Orangerie und Weiher. Hier beginnt der Karlsbergbach. Wer sie gefasst hat und wann, weiß ich nicht. Ich habe nur die Höhe gemessen.', { fact: 'cx.41', src: [src('OSM-KQ'), src('LIDAR', 'Quellmulde bei 1061/−835')] }),
        ln('laub', 'Dass Wasser sich erinnert, steht in keinem Handbuch. Und die Brunnenstube von 1789, die Sie gesehen haben, die hat sich das Spiel ausgedacht. Im Codex steht es.', { fact: 'cx.42' }),
      ],
      objectives: [
        { id: 'quelle', type: 'reach', text_de: 'Den Hang hinunter zur Karlsbergquelle',
          hint_de: 'Der goldene Lichtstrahl steht an der Quelle: unten im Hang westlich der Orangerie, wo der Bach beginnt. Den Weg hinunter (oder mit F über den Wald).',
          where: place(...P_SPOTS.quelle, 7, T0) },
        { id: 'beruehren', type: 'event', event: 'quelle:touch', after: ['quelle'], text_de: 'Am Trog: E – das Wasser berühren',
          hint_de: 'Vor den Holztrog stellen, zum Wasser schauen und E drücken.' },
        { id: 'heim', type: 'event', event: 'era:change', match: { to: 'today' }, after: ['beruehren'], text_de: 'Q gedrückt halten: zurück ins Heute' },
      ],
      // the prologue's XP budget ends at level 3 (tests/quests-content-a.test.ts): Bussole and Punktwolke gave 25 each
      rewards: { xp: 30 },
    },
    {
      id: 'q.p.bussole', kind: 'main', era: T0,
      title_de: 'Die Bussole spricht',
      summary_de: 'Laub, verschollen seit 1840 und neuerdings in einer Bussole, will seine alten Messpunkte noch einmal ablaufen: den Ehrenhof, den Hohlweg, die runde Grube im Osten. Er zeigt, du läufst.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [
        ln('laub', 'Da Sie nun einmal hier sind: Ich habe diesen Berg 1840 aufgenommen. Gehen wir die Punkte ab. Ehrenhof, Hohlweg, die Grube im Osten.'),
        ln('laub', 'Ich zeige, Sie laufen. So war das schon immer.'),
      ],
      progress: [ln('laub', 'Weiter. Ein Geometer bleibt nicht stehen, er bleibt nur genau.')],
      turnin_lines: [
        ln('laub', 'Nebel mit Augen. Notieren Sie: kriecht aus Senken, scheut den Stab. Ich habe so etwas 1840 nicht gesehen. Ich hatte auch keinen Stab. Nur ein Lineal.'),
      ],
      history: [
        ln('laub', 'Der Ehrenhof liegt auf 344,8 Metern, in den Hang geschnitten, an drei Seiten gerade Kanten. Dort standen das Corps de logis und die beiden Flügel. Geblieben ist die Fläche.', { fact: 'cx.01', src: [src('SBT'), src('WP-SK'), src('LIDAR', 'Merkmal KB-01')] }),
        ln('laub', 'Merken Sie sich das Muster: eine ebene Fläche mit geraden Kanten, an einer Seite in den Hang geschnitten, an der anderen aufgeschüttet. Eine Terrasse. Forstwege machen Kehren, keine rechten Winkel.', { fact: 'rm.01', src: [src('HE-BW'), LIDAR] }),
        ln('laub', 'Mein Blatt ist ein bayerisches Positionsblatt von 1836 bis 41, „Ruine Carlsberg“ steht darauf. Auf der heutigen Fassung liegt das Schloss fünfzig Meter zu weit im Osten. Ich lege Wert auf die Feststellung: nicht meinetwegen.', { fact: 'cx.33', src: [src('HIST'), src('LIDAR', 'Abschnitt 1 Nr. 8')] }),
        ln('laub', 'Der Hohlweg: Karren, Hufe, Regen, ein paar Jahrhunderte. Zweihundertneunundvierzig Meter, schnurgerade nach Norden, keinem Bach nach.', { fact: 'rm.04', src: [src('HE-BW'), src('LIDAR', 'Merkmale KB-10, KB-11')] }),
        ln('laub', 'Und die Grube mit dem Ringwall war ein Keller, dessen Gewölbe nachgegeben hat. Der Lageplan schreibt Eiskeller. Zehn mal zehn Meter, einsfünfundachtzig tief.', { fact: 'rm.02', src: [src('HE-BW'), src('LIDAR', 'Merkmal KB-50')] }),
      ],
      objectives: [
        { id: 'ehrenhof', type: 'examine', clue: 'clue.p.ehrenhof', text_de: 'Zum Ehrenhof, in die Mitte der Lichtung: dort Taste 2 (Lokales Relief)', hint_de: 'Der Lichtstrahl steht in der Mitte des Ehrenhofs. Hingehen und Taste 2 (Lokales Relief) drücken: die Mauerzüge zeigen sich von selbst.' },
        { id: 'karte', type: 'examine', clue: 'clue.p.kartenvergleich', text_de: 'M: Laubs Karte von 1840 über den Ehrenhof legen' },
        { id: 'hohlweg', type: 'examine', clue: 'clue.p.hohlweg', text_de: 'Zum Hohlweg westlich des Schlosses: dort Taste 2 (Lokales Relief)', hint_de: 'Der Lichtstrahl steht im Hohlweg westlich des Schlosses. Hingehen und Taste 2 (Lokales Relief) drücken: der tiefe Weg zeigt sich von selbst.' },
        { id: 'grube', type: 'examine', clue: 'clue.p.eiskeller', text_de: 'Zur runden Grube östlich des Schlosses: dort Taste 3 (VAT)', hint_de: 'Der Lichtstrahl steht über der Grube an der Wegkreuzung. Hingehen und Taste 3 (VAT) drücken.' },
        {
          id: 'nebel', type: 'kill', enemy: 'nebelling', count: 4, after: ['grube'],
          text_de: 'Nebelinge aus der Grube zurückschlagen',
          where: place(...P_SPOTS.eiskeller, 22, T0),
          spawn: [{ kind: 'nebelling', x: P_SPOTS.eiskeller[0], z: P_SPOTS.eiskeller[1], era: T0, count: 4, radius: 7, leash: 30, escorts: [], wave: [{ kind: 'nebelling', n: 2 }] }],
        },
      ],
      rewards: { xp: 95, items: [{ item: 'item.balsam', count: 2 }] },
    },
    {
      id: 'q.p.punktwolke', kind: 'main', era: '1789',
      title_de: 'Spuren in der Punktwolke',
      summary_de: 'In der Punktwolke vom Februar laufen Abdrücke quer über den Ehrenhof. Der Wald war gesperrt. Marlene will wissen, was da gelaufen ist; Laub weiß es und sagt es nicht. Am Ehrenhof erinnert sich das Land, wenn man Q drückt.',
      giver: { voice: 'marlene' }, turnin: 'auto',
      offer: [ln('marlene', 'Schau dir die Datei an und geh dann noch mal zum Ehrenhof. Ich will wissen, was da gelaufen ist. Und komm vor der Dunkelheit zurück, ja?')],
      progress: [ln('laub', 'In die Mitte des Hofs. Mit dem Gesicht zum Schloss. Dann Q.')],
      turnin_lines: [
        ln('laub', 'Sie sind zurück. Mit allen Gliedmaßen, soweit ich das von hier drinnen beurteilen kann.'),
        ln('laub', 'Das war ein Streuner. Ein einzelner, verirrter Hund der Meute. Seien Sie froh, dass es nur einer war.'),
      ],
      history: [
        ln('laub', 'Das Schloss, das Sie gesehen haben, gehörte Karl dem Zweiten August. Er regierte Pfalz-Zweibrücken von 1775 bis 1795. Ein Diplomat nannte ihn finster und eigensinnig und gestand ihm Sinn für Rang und Pflicht zu.', { fact: 'cx.03', src: [src('WP-K2A'), src('ADB')] }),
        ln('laub', 'In den Dörfern erzählt man von einer Wilden Jagd, die in den Rauhnächten über den Himmel reitet. Mit dem Herzog verbindet sie keine Quelle. Die Hunde, die Sie hören, sind meine Sorge, nicht die der Historiker.', { fact: 'cx.36', src: [src('WP-WJ')] }),
        ln('laub', 'Damit wir uns verstehen: Mich gibt es nicht, die Meute nicht und die Nebelinge auch nicht. Den Herzog, das Schloss und die Schulden gab es. Im Codex steht, was erfunden ist.', { fact: 'cx.38' }),
      ],
      objectives: [
        { id: 'wolke', type: 'examine', clue: 'clue.p.punktwolke', text_de: 'Die Punktwolke auf dem Tablet ansehen' },
        { id: 'wechsel', type: 'reach', after: ['wolke'], text_de: 'In der Mitte des Ehrenhofs: Q – Zeitwechsel in den Sommer 1789', hint_de: 'Zur Markierung in der Mitte des Ehrenhofs gehen und Q drücken: der Zeitwechsel in den Sommer 1789.', where: place(1218, -1118, 30, '1789') },
        { id: 'echo', type: 'echo', clue: 'echo.p.diener', after: ['wechsel'], text_de: 'Zuhören: der Hof von 1789' },
        {
          id: 'streuner', type: 'kill', enemy: 'streuner', count: 1, after: ['echo'],
          text_de: 'Den Streuner bannen (Bannlicht: rechte Maustaste / G) und zurückschlagen',
          where: place(...P_SPOTS.streuner, 30, '1789'),
          spawn: [{ kind: 'streuner', x: P_SPOTS.streuner[0], z: P_SPOTS.streuner[1], era: '1789', count: 1, radius: 2, leash: 45, veiled: true }],
        },
        { id: 'heim', type: 'event', event: 'era:change', match: { to: 'today' }, after: ['streuner'], text_de: 'Q halten: zurück ins Heute' },
      ],
      rewards: { xp: 105, items: [{ item: 'item.lampenoel' }] },
    },
    // ---- side quests ------------------------------------------------------------------------------
    {
      id: 'q.p.meiler', kind: 'side', era: T0,
      title_de: 'Kohlplatten',
      summary_de: 'Unterhalb der Orangerie haben Köhler gearbeitet. Ihre Kohlplatten sind im Relief runde, flache Teller am Hang. Marlene will an dreien einen Messpunkt. Anfassen, mitnehmen: nein.',
      giver: { voice: 'marlene' }, turnin: 'auto',
      offer: [ln('marlene', 'Wenn du schon am Hang bist: Da unten haben Köhler gearbeitet. Ihre Kohlplatten sieht man mit dem VAT, runde flache Teller. Setz mir an dreien einen Messpunkt. Nur hinstellen, nicht buddeln.')],
      turnin_lines: [ln('marlene', 'Drei Kohlplatten. Da haben Leute im Wald gewohnt, wochenlang, neben einem rauchenden Haufen. Für die Schmieden, für die Kalköfen, fürs Schloss.')],
      history: [ln('marlene', 'Ein Meilerplatz ist ein runder, fast ebener Teller am Hang, acht bis fünfzehn Meter breit, mit einer kleinen Stufe nach unten. Gräbt man, ist die Erde schwarz. Graben tun wir aber nicht.', { fact: 'rm.03', src: [src('HE-BW')] })],
      objectives: P_SPOTS.meiler.map(([x, z], i) => ({ id: `platte${i + 1}`, type: 'reach', text_de: `Kohlplatte ${i + 1} von 3: Messpunkt setzen (VAT)`, where: place(x, z, 8, T0) })),
      rewards: { xp: 50, items: [{ item: 'item.lampenoel' }] },
      available: { after: ['q.p.relief'] },
    },
    {
      id: 'q.p.trichter', kind: 'side', era: T0,
      title_de: 'Nicht anfassen',
      summary_de: 'Westlich des Schlosses ist im Scan ein Trichter, der da nicht hingehört. Marlene will wissen, wo genau. Vom Rand aus. Nicht hineingehen, nichts anfassen, melden.',
      giver: { voice: 'marlene' }, turnin: 'auto',
      offer: [ln('marlene', 'Noch was. Westlich vom Schloss ist ein Trichter im Scan, der da nicht hingehört. Schau ihn dir an. Vom Rand. Nicht reingehen, nichts anfassen, und dann ruf mich.')],
      turnin_lines: [ln('marlene', 'Gut, dass du draußen geblieben bist. Ich ruf den Kampfmittelräumdienst. Die kommen gern, die sehen sonst nur Wiesen.')],
      history: [
        ln('marlene', 'Bombentrichter sind rund, mit einem unregelmäßigen Wall, meist in Gruppen. Aus dem letzten Krieg. Wo Trichter sind, kann noch Munition liegen.', { fact: 'rm.06', src: [src('HE-BW')] }),
        ln('marlene', 'Darum: nicht betreten, nicht graben, melden. Das gilt für Munition und für Mauern. Beides gehört nicht dir.', { fact: 'cx.35', src: [src('SDSCHG')] }),
      ],
      objectives: [
        { id: 'finden', type: 'reach', text_de: 'Den Trichter im Wald finden (nur bis zum Rand)', where: place(...P_SPOTS.trichter, 16, T0) },
        { id: 'melden', type: 'manual', after: ['finden'], text_de: 'Marlene über Funk Bescheid geben' },
      ],
      rewards: { xp: 40 },
      available: { after: ['q.p.bussole'] },
    },
    {
      id: 'q.p.irrlichter', kind: 'side', era: T0,
      title_de: 'Lichter am Weiher',
      summary_de: 'Über dem Damm des Karlsbergweihers schweben Lichter, im November. Laub sagt: erst das Bannlicht drauf, dann der Stab. In dieser Reihenfolge.',
      giver: { voice: 'laub' }, turnin: 'auto',
      offer: [
        ln('laub', 'Sehen Sie die Lichter über dem Damm? Glühwürmchen sind es nicht, es ist November.'),
        ln('laub', 'Erst das Bannlicht drauf, rechte Maustaste, dann der Stab. Andersherum ist es nur Gefuchtel.'),
      ],
      turnin_lines: [ln('laub', 'Gelöscht. Der Damm ist übrigens älter als der Wald drumherum. Er hat schon andere Lichter gesehen.')],
      history: [ln('laub', 'Den Weiher hat man aufgestaut, mit einem geraden Damm quer zum Tal. Ein Naturteich hätte keine Kante. Dieser hat eine, und ich habe sie 1840 vermessen.', { fact: 'rm.08', src: [src('HE-BW'), src('LIDAR', 'Merkmale KB-40, KB-42')] })],
      objectives: [
        {
          id: 'lichter', type: 'kill', enemy: 'irrlicht', count: 3,
          text_de: 'Irrlichter am Damm: erst Bannlicht (Rechtsklick oder G), dann zuschlagen',
          where: place(...P_SPOTS.irrlichter, 24, T0),
          spawn: [{ kind: 'irrlicht', x: P_SPOTS.irrlichter[0], z: P_SPOTS.irrlichter[1], era: T0, count: 3, radius: 5, leash: 30 }],
        },
      ],
      rewards: { xp: 50, items: [{ item: 'item.lampenoel', count: 2 }] },
      available: { after: ['q.p.punktwolke'] },
    },
  ],
};

writeFileSync(`${ROOT}/content/quests/00-prolog.quests.json`, JSON.stringify({ $schema: '../schema/quests.schema.json', ...prologQuests }, null, 2) + '\n');
console.log('wrote 00-prolog.quests.json');
