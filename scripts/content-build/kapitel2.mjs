import { clue, noun, say, seq, hints, src, write, Z, P } from './common.mjs';

const ch = 'k2';
const E = '1793-02';
const KAB = 'B01.1.eg-kabinett';
const STATION = [760, -930];
const ORANG = [1275, -960]; // Orangeriehof / -parterre (TF-06, TF-15)
const EH = [1205, -1115];
const WACHE = [1180, -1120]; // east side of Wachhaus Nord (KB-B38), at the gate
const WACHBUCH = [1179.5, -1123.5];
const ABFAHRT = [1212, -1117]; // inside the court, behind the gate

const clues = [
  clue('clue.k2.marlene', {
    title: 'Marlene erzählt vom Warner', kind: 'dialogue', at: STATION, r: 30, era: 'today', anchor: 'loc.p.station', chapter: ch, fiction: false,
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
  }),
  clue('clue.k2.wachbuch', {
    title: 'Das Wachbuch', kind: 'document', at: WACHBUCH, r: 4, era: E, anchor: 'KB-B38', chapter: ch, fiction: true,
    text: 'Ein aufgeschlagenes Wachbuch. Die letzte Zeile in einer zittrigen Hand: „Sambstag d. 9ten Febr. 1793. Gegen 8 Uhr ein Bauer, außer Athem, wollte zu Serenissimo. Dem Leibjäger übergeben.“ (Wortlaut erfunden; Datum nach Horstmann, M1910 S. 427 Anm. 1.)',
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
    text: 'E halten an der Tür zum Schreibkabinett. Man hört nur Stimmen; durch den Türspalt Schatten an der Wand: ein sitzender Mann, der hustet, und mehrere stehende. Nikel Pfeiffer ist nicht im Raum, er wartet unten.',
    nouns: ['n.unglaubwuerdig', 'n.nur_zu_wahr', 'n.anschlag', 'n.dukaten', 'n.taler', 'n.pfeffel', 'n.salabert', 'n.r_lohn', 'n.schuegens', 'n.parkzaun'],
  }),
  clue('clue.k2.abschied', {
    title: 'Erinnerung: Der Abschied', kind: 'echo', room: KAB, r: 6, era: E, chapter: ch, fiction: true,
    text: 'Zweites E halten. Ein Schatten öffnet einen Schreibtisch, steckt Papiere ein und setzt sich. Lange Stille.',
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
    title: 'Laub über den Warner', kind: 'dialogue', at: STATION, r: 30, era: 'today', anchor: 'loc.p.station', chapter: ch, fiction: true,
    text: 'Laub in der Feldstation, nach dem ersten Wechsel.', nouns: ['n.r_treu', 'n.r_gewarnt'], req: { clues: ['clue.k2.zaun'] },
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
  say('laub.k2.horstmann', 'laub', 'Ein Regierungsrat namens Horstmann hat sich das Datum notiert, Tag für Tag, wie ein ordentlicher Mensch. Der neunte. Mannlich schreibt in seinen Erinnerungen ‚gegen Ende Februar‘. Mannlich hat Jahre später geschrieben und schöner. Ich glaube dem Regierungsrat.', found('clue.k2.horstmann'), { once: true, src: [src('M1910', 'S. 422 und S. 427 Anm. 1')] }),
  say('laub.k2.gaertnerei', 'laub', 'Hier ist er nicht drüber. Zu glatt, zu hoch. Gärtner bauen bessere Mauern als Herzöge Zäune.', found('clue.k2.gaertnerei'), { once: true }),
  // Schreibkabinett: Warnung (historische Personen: nur M1910)
  ...seq(echo('clue.k2.warnung'), [
    ['echo.k2.warnung.01', 'schuegens', 'Durchlaucht, ein Bauer ist atemlos angelangt. Die französische Kavallerie ist durch die Wälder in sein Dorf gekommen, ohne der Landstraße zu folgen. Sie lassen dort ihre Pferde rasten und verlangen einen Führer, der sie auf Umwegen zum Karlsberg bringt. Erst nachts wollen sie ankommen. Er hat sich durch seinen Garten in den Wald geschlichen und ist über den Zaun des Parkes geklettert.', [P('S. 422 f.')]],
    ['herzog.01', 'herzog', 'Diese Nachricht scheint mir unglaubwürdig; der gute Mann will einige Taler verdienen, das ist alles. Gib ihm einen Dukaten, und er ziehe in Frieden!', [Z('S. 423')]],
    ['echo.k2.warnung.03', 'geraeusch', '(Eine Tür. Schritte. Pause. Ein langer Husten.)'],
    ['echo.k2.warnung.04', 'rose', 'Durchlaucht sollten zu Bett gehen und Tee trinken.', [P('S. 423')]],
    ['echo.k2.warnung.05', 'pfeffel', 'Ich beschwöre Durchlaucht, auf der Stelle abzufahren. Es ist nur zu wahr. Diese Schurken haben einen perfiden Anschlag gegen die Person des Herzogs geplant.', [P('S. 423')]],
    ['echo.k2.warnung.06', 'rose', 'Bett. Und Tee.', [P('S. 423: „der noch beim Weggehen Bett und Tee empfahl“')]],
    ['herzog.02', 'herzog', 'Da wir abreisen müssen, so wollen wir es tun! Aber, Abbé, Ihn nehme ich mit mir.', [Z('S. 423')]],
    ['echo.k2.warnung.08', 'salabert', 'Das ist ein neuer Beweis von Güte, Durchlaucht. Aber ich habe nur bei mir, was ich am Leibe trage. Ich sollte wenigstens Wäsche holen und mein Geld, das ich den Sansculottes nicht gerne überlassen möchte.', [P('S. 423')]],
    ['herzog.03', 'herzog', 'Hole Er sich Hemden, da Er sie nun einmal braucht; ich gebe Ihm eine halbe Stunde Zeit dazu. Gehe Er!', [Z('S. 423')]],
  ]),
  ...seq(found('clue.k2.warnung'), [
    ['laub.k2.schnupfen', 'laub', 'Bett und Tee. Die Kavallerie kommt durch den Wald, und der Leibarzt verschreibt Bett und Tee. Er hätte es weit gebracht in der Landesaufnahme.'],
    ['laub.k2.dukat', 'laub', 'Einen Dukaten für den Mann, der ihm das Leben rettet. Hanne hat für den Lohn ihres Mannes nicht mal einen Gulden bekommen. Sie sehen, der Herzog konnte großzügig sein.'],
  ]),
  // Schreibkabinett: Abschied
  ...seq(echo('clue.k2.abschied'), [
    ['herzog.04', 'herzog', 'Ich lasse Ihn hier, mein lieber Mannlich, um über meine Galerie zu wachen und sie zu retten, wenn es Ihm möglich ist. Ich weiß, wem ich sie anvertraue; desgleichen empfehle ich Ihm mein Naturalienkabinett, meine Bibliothek und alles, was ich nicht habe mit mir nehmen können.', [Z('S. 423')]],
    ['echo.k2.abschied.02', 'geraeusch', '(Stille. Ein Gegenstand wird vom Tisch genommen.)'],
    ['herzog.05', 'herzog', 'Adieu, mein lieber Mannlich, ich hoffe Ihn bald wiederzusehen. Bleibe Er stets mein Freund!', [Z('S. 424')]],
    ['echo.k2.abschied.04', 'geraeusch', '(Schritte entfernen sich.)'],
    ['mannlich.09', 'mannlich', 'Wenn ich mich recht entsinne, gelangte zu uns gegen Ende Februar 1793 die Nachricht …', [Z('S. 422, gekürzt')]],
    ['laub.k2.entsinnt', 'laub', 'Er entsinnt sich nicht recht. Merken Sie sich trotzdem, was er sagt.'],
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
    ['echo.k2.fackeln.01', 'geraeusch', '(Räder knirschen im Raureif. Pferde schnauben.)'],
    ['echo.k2.fackeln.02', 'diener', 'Fackeln an die ersten Wagen! Bis zur Allee, dann zurück.'],
    ['echo.k2.fackeln.03', 'diener2', 'Und die Fackeln?'],
    ['echo.k2.fackeln.04', 'diener', 'Die nimmt er mit. Wir bleiben.'],
    ['echo.k2.fackeln.05', 'geraeusch', '(Hufschlag nach Norden, immer leiser.)'],
  ]),
  say('laub.k2.esebeck', 'laub', 'Der Minister Esebeck bleibt. Am 25. Februar holen sie ihn ab, die Sansculotten vorn und hinten als Eskorte. Er kommt im September zurück.', found('clue.k2.esebeck'), { once: true, src: [P('S. 437 mit Anm. 10')] }),
  // Die Parforcejagd (2.8)
  ...seq(beat('2.8'), [
    ['jost.k2.04', 'jost', 'Und die Hunde? Hat er was von den Hunden gesagt?'],
    ['jost.k2.05', 'jost', 'Wer bläst ab, wenn er nicht da ist?'],
    ['beat.k2.horn', 'geraeusch', '(Horn vom Zwinger: zwei kurze Töne.)'],
    ['jost.k2.06', 'jost', 'Das bin nicht ich. Lauf.'],
    ['laub.k2.pikeur', 'laub', 'Ein Pikeur. Der führt die Meute. Er hat kein Gesicht, oder er zeigt es nicht. Laufen Sie trotzdem.'],
  ]),
  // W4
  ...seq(echo('clue.k2.landremont'), [
    ['echo.k2.landremont.01', 'landremont', 'Was bedeuten denn die Feuer, die ich dort unten im Walde habe leuchten sehen?', [Z('S. 427 f.')]],
    ['echo.k2.landremont.02', 'handwerker', 'Das sind Kalköfen.', [Z('S. 428')]],
    ['echo.k2.landremont.03', 'geraeusch', '(Die Reiter sprengen zum Schloss.)'],
  ]),
  say('laub.k2.koehler', 'laub', 'Ein Köhlermeiler. Die gibt es hier überall im Wald. Ein Meiler glimmt, er leuchtet nicht. Aber der General kommt aus Saarbrücken, was weiß der.', found('clue.k2.koehler'), { once: true }),
  say('laub.k2.keller', 'laub', 'Hier unten bleibt man, bis man vergessen wird. Raus.', beat('2.10-keller'), { once: true }),
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
  say('laub.k2.weg', 'laub', 'Weg. Die suchen jetzt etwas, das leuchtet. Bleiben Sie dunkel, bis die Allee zu Ende ist.', beat('2.2-weg'), { once: true }),
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
  // Feldstation: was fehlt (Laub)
  say('laub.k2.fehlt.warnung', 'laub', 'Was der Herzog über den Bauern gesagt hat, fehlt Ihnen noch. Das hört man nur an der Tür des Kabinetts. Anker B bringt Sie in den Ehrenhof.', beat('2.11-fehlt-warnung'), { once: true }),
  say('laub.k2.fehlt.abschied', 'laub', 'Was er Mannlich anvertraut hat, wissen Sie noch nicht. Hören Sie im Kabinett ein zweites Mal hin.', beat('2.11-fehlt-abschied'), { once: true }),
  say('laub.k2.fehlt.kalkoefen', 'laub', 'Die Antwort des Handwerkers fehlt. Am Orangerie-Parterre hängt sie noch in der Luft, im Februar 1793. Ohne Hunde diesmal.', beat('2.11-fehlt-kalkoefen'), { once: true }),
  say('laub.k2.fehlt.datum', 'laub', 'Das Datum steht im Wachbuch, am Wachhaus vor dem Gitter. Der Regierungsrat schreibt ordentlich.', beat('2.11-fehlt-datum'), { once: true }),
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
