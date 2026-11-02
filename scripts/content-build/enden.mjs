import { say, seq, src, write } from './common.mjs';

/*
 * Endings (06-enden.md). All FIKTION except marked sentences.
 * Ending ids follow the contract: story:ending { id: 'museum' | 'burn' | 'keep' } (bible: museum / verbrennen / behalten).
 * Epilogue = text blocks with custom trigger { event: 'epilog:line', ending?, block, flag?, value? }.
 * Reading-flag values are the chosen noun id, or 'offen' if the reading was left empty.
 */
const beat = (b, x = {}) => ({ event: 'story:beat', chapter: 'end', beat: b, ...x });
const ending = (id) => ({ event: 'story:ending', id });
const ep = (block, x = {}) => ({ event: 'epilog:line', block, ...x });
const E = { museum: 'museum', burn: 'burn', keep: 'keep' };

const line = (id, block, text, cond) => say(id, 'epilog', text, ep(block, cond), { once: false });

const dialogue = [
  // 1. Übergang
  ...seq(beat('end.morgen'), [
    ['geraeusch.end.morgen', 'geraeusch', '[Es wird hell. Die Hunde sind fort, nur ihre Abdrücke liegen im Raureif, im Kreis um die Stelle, an der du gelegen hast.]'],
    ['marlene.end.morgen', 'marlene', 'Da bist du ja. Ich hab die ganze Nacht Licht gesehen da oben am alten Zwinger. Erst dachte ich, Kalköfen. (Pause.) Das war ein Witz. Kalköfen gibt’s hier keine mehr.'],
    ['laub.end.morgen', 'laub', 'Sagen Sie ihr nichts. Oder alles. Sie wird es ohnehin aufschreiben.'],
  ]),
  say('laub.end.luecken', 'laub', 'Sie haben noch Lücken gelassen. Das darf man. Aber man muss es wollen.', beat('end.luecken'), { once: true }),
  say('laub.end.vorher', 'laub', 'Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.', beat('end.wahl'), { once: true, priority: 10 }),
  // 3. Ende A: Museum
  ...seq(ending(E.museum), [
    ['laub.end.museum_1', 'laub', 'Abgeblasen. Nach {jahre:1793} Jahren. Ich werde das als Überstunden einreichen.'],
    ['laub.end.museum_2', 'laub', 'Eine Akte, die geschlossen wird, ist eine Akte, die man lesen kann. Bringen Sie sie dahin, wo man nachschaut, bevor man glaubt. Mit Quellen. Auch die, die mir nicht gefallen.'],
    ['laub.end.museum_3', 'laub', 'Und schreiben Sie auf das Schild, dass ich die fünfzig Meter nicht verschuldet habe.'],
    ['geraeusch.end.museum', 'geraeusch', '[Die Nadel der Bussole dreht sich ruhig nach Norden und bleibt dort.]'],
    ['marlene.end.museum', 'marlene', 'Ich fahr’s nächste Woche hin. Und dem Forstamt sag ich, sie sollen die Gräben dem Denkmalamt melden. Gucken ja, graben nein. Das hast du mir beigebracht.', [src('SDSCHG', 'P: Fundmeldepflicht; cx.35')]],
  ]),
  // 4. Ende B: Verbrennen
  ...seq(ending(E.burn), [
    ['laub.end.verbrennen_1', 'laub', 'Gut. Sie haben lange genug gesucht. Die Hunde und ich.'],
    ['laub.end.verbrennen_2', 'laub', 'Was im Buch stand, steht auch woanders. Bei Mannlich, in den Akten, im Boden. Nur die Namen nicht. Die Namen tragen jetzt Sie.'],
    ['laub.end.verbrennen_3', 'laub', 'Machen Sie das Licht aus, wenn Sie gehen. Das habe ich nie gelernt.'],
    ['marlene.end.verbrennen', 'marlene', 'Riecht nach Herbstfeuer. Komisch. Riecht gar nicht nach Papier. (Pause.) Hast du gut gemacht. Ich weiß nicht, was, aber gut.'],
  ]),
  // 5. Ende C: Behalten
  ...seq(ending(E.keep), [
    ['laub.end.behalten_1', 'laub', 'Sie behalten uns. Das ist unvernünftig. Ich bin sehr gerührt.'],
    ['laub.end.behalten_2', 'laub', 'Dann bleibt die Jagd offen. Die Hunde laufen weiter, aber jetzt hinter Ihnen her, nicht vor Ihnen weg. Das ist ein Unterschied, den man spürt, wenn es dunkel wird.'],
    ['laub.end.behalten_3', 'laub', 'Und ich bleibe im Dienst. Ohne Tagegeld. Wie gehabt.'],
    ['marlene.end.behalten', 'marlene', 'Lass das Horn da hängen. Das passt zum Bauwagen. Aber blas nicht drauf, wenn ich schlafe.'],
  ]),

  // 6. Epilog — 6.1 Einleitung
  line('epilog.intro.museum', 'intro', 'Karlsberg bei Homburg, 1777–1793. Was das Feuer nicht fraß. Diese Seiten führte ein Kanzlist neben den Rechnungen des Hofes. Er schrieb auf, was der Hof schuldig blieb.', { ending: E.museum }),
  line('epilog.intro.burn', 'intro', 'Was ich weiß, schreibe ich hier einmal hin, und dann nicht wieder.', { ending: E.burn }),
  line('epilog.intro.keep', 'intro', 'Fortgesetzt im November, wie das letzte Mal. Q. L. und ich.', { ending: E.keep }),
  // 6.2 Lesart-Sätze (any ending)
  ...[
    ['n.hunde', 'In der Punktwolke von 2025 liefen Spuren durch den Wald, und ich habe sie für Hunde gehalten.'],
    ['n.wild', 'In der Punktwolke von 2025 liefen Spuren durch den Wald. Wild, dachte ich zuerst.'],
    ['n.messfehler', 'In der Punktwolke von 2025 liefen Spuren durch den Wald. Ein Messfehler, dachte ich zuerst. Das denkt man immer zuerst.'],
    ['offen', 'Was die Spuren in der Punktwolke waren, habe ich nicht entschieden.'],
  ].map(([v, t]) => line(`epilog.spuren.${v.replace(/^n\./, '')}`, 'spuren', t, { flag: 'flag.p_spuren', value: v })),
  ...[
    ['n.r_will_nicht', 'Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil der Herzog nicht zahlen wollte.'],
    ['n.r_creuzer', 'Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil ein Präsident die Kassen geleert hatte, auch die der Witwen und Waisen.'],
    ['n.r_hunde_bilder', 'Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht, weil das Geld in tausend Hunde und tausend Bilder ging.'],
    ['n.r_getaeuscht', 'Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht. Man sagt, der Herzog sei getäuscht worden. Bezahlt hat er trotzdem nicht.'],
    ['offen', 'Hanne, Witwe des Steinhauers Matthes, bekam seinen Lohn nicht. Warum, ist eine Frage, die ich offenlasse.'],
  ].map(([v, t]) => line(`epilog.lohn.${v.replace(/^n\.r_/, '')}`, 'lohn', t, { flag: 'flag.k1_lohn', value: v })),
  ...[
    ['n.r_treu', 'Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald und kletterte über den Zaun, aus Treue.'],
    ['n.r_dorf', 'Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald, damit die Reiter sein Dorf schneller wieder verließen.'],
    ['n.r_lohn', 'Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald. Der Herzog glaubte, für Geld. Er bekam einen Dukaten.'],
    ['n.r_angst', 'Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald, weil er Angst hatte. Angst ist auch ein Grund, das Richtige zu tun.'],
    ['offen', 'Nikel Pfeiffer aus Rohrbach rannte in der Nacht durch den Wald. Warum, hat er niemandem aufgeschrieben.'],
  ].map(([v, t]) => line(`epilog.warner.${v.replace(/^n\.r_/, '')}`, 'warner', t, { flag: 'flag.k2_pfeiffer', value: v })),
  ...[
    ['n.r_gewarnt', 'Ich hätte es auch getan.'],
    ['n.r_geschwiegen', 'Ich hätte geschwiegen, und ich weiß nicht, ob ich mich dafür schäme.'],
    ['n.r_gefuehrt', 'Ich hätte die Reiter geführt. Das schreibe ich hier auf, damit es wenigstens einer weiß.'],
  ].map(([v, t]) => line(`epilog.stelle.${v.replace(/^n\.r_/, '')}`, 'warner-stelle', t, { flag: 'flag.k2_stelle', value: v })),
  line('epilog.tor.leuchten', 'warner-tor', 'Als die Wagen abfuhren, habe ich ihnen geleuchtet.', { flag: 'flag.k2_tor', value: 'leuchten' }),
  line('epilog.tor.dunkel', 'warner-tor', 'Als die Wagen abfuhren, stand ich im Dunkeln.', { flag: 'flag.k2_tor', value: 'dunkel' }),
  ...[
    ['n.r_schuld', 'Am 28. Juli 1793 nahmen die Leute aus den Dörfern sich, was man ihnen schuldete.'],
    ['n.r_stahlen', 'Am 28. Juli 1793 stahlen die Leute aus den Dörfern, was nicht niet- und nagelfest war, und dann die Nägel.'],
    ['n.r_retteten', 'Am 28. Juli 1793 retteten die Leute aus den Dörfern, was zu retten war. Ein Stuhl steht heute vielleicht noch in einer Stube.'],
    ['n.r_alle', 'Am 28. Juli 1793 taten die Leute aus den Dörfern, was alle taten.'],
    ['offen', 'Was die Leute aus den Dörfern am 28. Juli 1793 taten, mag ich nicht in ein Wort fassen.'],
  ].map(([v, t]) => line(`epilog.pluenderer.${v.replace(/^n\.r_/, '')}`, 'pluenderer', t, { flag: 'flag.k3_pluenderer', value: v })),
  ...[
    ['n.r_franzosen', 'Angezündet haben ihn die Franzosen.'],
    ['n.r_herzog_selbst', 'Zerstört hat ihn am Ende der, der ihn so gebaut hat.'],
    ['n.r_steintraeger', 'Abgetragen haben ihn die Leute aus Homburg, Stein für Stein.'],
    ['n.r_vergessen', 'Zerstört hat ihn am Ende das Vergessen. Dagegen hilft nur Aufschreiben.'],
    ['offen', 'Wer ihn zerstört hat, weiß jeder anders.'],
  ].map(([v, t]) => line(`epilog.zerstoerer.${v.replace(/^n\.r_/, '')}`, 'zerstoerer', t, { flag: 'flag.k4_zerstoerer', value: v })),
  ...[
    ['n.r_raub', 'Die Steine in Homburg sind Raub am Raub.'],
    ['n.r_lohn_steine', 'Über einer Tür in Homburg liegt ein Stein mit einem Winkel und drei Punkten. Er ist der Lohn.'],
    ['n.r_neuanfang', 'Das Schloss steckt in hundert Häusern. Es ist nicht weg, es ist überall.'],
    ['n.r_nur_steine', 'Es sind nur Steine. Was daran hängt, hängen wir dran.'],
  ].map(([v, t]) => line(`epilog.steine.${v.replace(/^n\.r_/, '')}`, 'zerstoerer-steine', t, { flag: 'flag.k4_steine', value: v })),
  ...[
    ['n.r_herr_suchen', 'Die Hunde suchten ihren Herrn, der nach Mannheim gefahren war, ohne abzublasen.'],
    ['n.r_chronik_bewachen', 'Die Hunde liefen dort, wo eine Seite lag.'],
    ['n.r_heimtreiben', 'Die Hunde haben jeden heimgetrieben, der sich zu lange im Vergessen aufhielt. Fast jeden.'],
    ['n.r_nie_abgeblasen', 'Die Jagd wurde nie abgeblasen. So einfach war das.'],
    ['offen', 'Warum die Hunde liefen, weiß Jost. Ich habe ihn nicht gefragt.'],
  ].map(([v, t]) => line(`epilog.meute.${v.replace(/^n\.r_/, '')}`, 'meute', t, { flag: 'flag.k4_meute', value: v })),
  line('epilog.meute.namen', 'meute-namen', 'Sie hießen Diane, Sultan, Fanfare, Rauhreif und Bijou.', {}),
  // 6.3 Gegenstand (flag.k3_objekt) per ending
  ...[
    ['tuergriff', 'Daneben: ein Türgriff. Er war an der Tür zum Festsaal. Die Wand dahinter hat Matthes gemauert.', 'Den Türgriff habe ich behalten. Eine Tür, die es nicht mehr gibt, braucht trotzdem einen Griff.', 'Der Türgriff liegt in der Schublade bei der Bussole. Manchmal fasse ich ihn an, bevor ich hinausgehe.'],
    ['dukat', 'Daneben: ein Dukat mit dem Bild des Schlosses. Einen solchen bekam ein Bauer aus Rohrbach, oder auch nicht.', 'Den Dukaten habe ich Marlene gegeben. Sie sagt, sie kauft sich nichts davon.', 'Der Dukat liegt in der Schublade. Er ist das einzige Geld, das der Hof je zurückgezahlt hat, und auch nur an mich.'],
    ['uhr', 'Daneben: eine vergoldete Uhr mit Alabaster. Sie geht noch. Sie weiß nicht, was passiert ist.', 'Die Uhr steht im Bauwagen und geht. Ich ziehe sie jeden Sonntag auf.', 'Die Uhr tickt in der Schublade, neben der Bussole. Laub sagt, sie geht vor.'],
    ['nichts', 'Daneben: nichts. Das Fach ist leer, und auf dem Schild steht: ‚Was nicht gerettet wurde.‘', 'Gerettet habe ich nichts. Das ist auch eine Antwort.', 'In der Schublade ist Platz für etwas, das ich nicht genommen habe.'],
  ].flatMap(([v, a, b, c]) => [
    line(`epilog.objekt.${v}.museum`, 'objekt', a, { ending: E.museum, flag: 'flag.k3_objekt', value: v }),
    line(`epilog.objekt.${v}.burn`, 'objekt', b, { ending: E.burn, flag: 'flag.k3_objekt', value: v }),
    line(`epilog.objekt.${v}.keep`, 'objekt', c, { ending: E.keep, flag: 'flag.k3_objekt', value: v }),
  ]),
  // 6.4 Schluss
  line('epilog.schluss.museum', 'schluss', 'Quellen: Mannlich, Lebenserinnerungen. Die Akten. Der Boden. Und ein Geometer, der auf seinen fünfzig Metern besteht.', { ending: E.museum }),
  say('laub.end.museum_4', 'laub', 'Ich bestehe darauf.', ep('schluss-nachsatz', { ending: E.museum }), { once: false }),
  line('epilog.schluss.burn', 'schluss', 'Jetzt ist es still. Gute Nacht, Laub. Gute Nacht, Diane, Sultan, Fanfare, Rauhreif, Bijou.', { ending: E.burn }),
  line('epilog.schluss.keep', 'schluss', 'Wird fortgesetzt.', { ending: E.keep }),
  say('jost.end.keep', 'jost', 'Jost war auch da.', ep('schluss-nachsatz', { ending: E.keep }), { once: false }),
];

write('enden', { pack: 'enden', dialogue });
