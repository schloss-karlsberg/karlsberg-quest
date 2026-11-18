import { readFileSync, writeFileSync } from 'node:fs';
import { ROOT, say, seq, src, write } from './common.mjs';
import { DEED_SLOTS, EPILOGUE_FRAME } from './epilogue-deeds.mjs';

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
  // 1. Übergang (der Morgen und die Abdrücke im Raureif: k4_14, cue end-prints)
  ...seq(beat('end.morgen'), [
    ['marlene.end.morgen', 'marlene', 'Da bist du ja. Ich hab die ganze Nacht Licht gesehen da oben am alten Zwinger. Erst dachte ich, Kalköfen. … Das war ein Witz. Kalköfen gibt’s hier keine mehr.'],
    ['laub.end.morgen', 'laub', 'Sagen Sie ihr nichts. Oder alles. Sie wird es ohnehin aufschreiben.'],
  ]),
  say('laub.end.luecken', 'laub', 'Sie haben noch Lücken gelassen. Das darf man. Aber man muss es wollen.', beat('end.luecken'), { once: true }),
  say('laub.end.vorher', 'laub', 'Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.', beat('end.wahl'), { once: true, priority: 10 }),
  // 3. Ende A: Museum (die Nadel nach Norden: im Bild des Endes, endings/stage.ts)
  ...seq(ending(E.museum), [
    ['laub.end.museum_1', 'laub', 'Abgeblasen. Nach {jahre:1793} Jahren. Ich werde das als Überstunden einreichen.'],
    ['laub.end.museum_2', 'laub', 'Eine Akte, die geschlossen wird, ist eine Akte, die man lesen kann. Bringen Sie sie dahin, wo man nachschaut, bevor man glaubt. Mit Quellen. Auch die, die mir nicht gefallen.'],
    ['laub.end.museum_3', 'laub', 'Und schreiben Sie auf das Schild, dass ich die fünfzig Meter nicht verschuldet habe.'],
    ['marlene.end.museum', 'marlene', 'Ich fahr’s nächste Woche hin. Und dem Forstamt sag ich, sie sollen die Gräben dem Denkmalamt melden. Gucken ja, graben nein. Das hast du mir beigebracht.', [src('SDSCHG', 'P: Fundmeldepflicht; cx.35')]],
  ]),
  // 4. Ende B: Verbrennen
  ...seq(ending(E.burn), [
    ['laub.end.verbrennen_1', 'laub', 'Gut. Sie haben lange genug gesucht. Die Hunde und ich.'],
    ['laub.end.verbrennen_2', 'laub', 'Was im Buch stand, steht auch woanders. Bei Mannlich, in den Akten, im Boden. Nur die Namen nicht. Die Namen tragen jetzt Sie.'],
    ['laub.end.verbrennen_3', 'laub', 'Machen Sie das Licht aus, wenn Sie gehen. Das habe ich nie gelernt.'],
    ['marlene.end.verbrennen', 'marlene', 'Riecht nach Herbstfeuer. Komisch. Riecht gar nicht nach Papier. … Hast du gut gemacht. Ich weiß nicht, was, aber gut.'],
  ]),
  // 5. Ende C: Behalten
  ...seq(ending(E.keep), [
    ['laub.end.behalten_1', 'laub', 'Sie behalten uns. Das ist unvernünftig. Ich bin sehr gerührt.'],
    ['laub.end.behalten_2', 'laub', 'Dann bleibt die Jagd offen. Die Hunde laufen weiter, aber jetzt hinter Ihnen her, nicht vor Ihnen weg. Das ist ein Unterschied, den man spürt, wenn es dunkel wird.'],
    ['laub.end.behalten_3', 'laub', 'Und ich bleibe im Dienst. Ohne Tagegeld. Wie gehabt.'],
    ['marlene.end.behalten', 'marlene', 'Lass das Horn da hängen. Das passt zum Bauwagen. Aber blas nicht drauf, wenn ich schlafe.'],
  ]),

  // 6. Epilog — 6.1 Einleitung (told as a story: epilogue-deeds.mjs)
  ...Object.entries(EPILOGUE_FRAME.intro).map(([k, t]) => line(`epilog.intro.${k}`, 'intro', t, { ending: k })),
  // 6.2 What you did, chapter by chapter (deeds, docs/ACTION-RPG.md §8.6; no stance answers)
  ...DEED_SLOTS.flatMap((slot) => [
    ...slot.deeds.map(([d, t], i) => line(`epilog.${slot.id}.${i + 1}`, slot.id, t, { flag: d.flag, value: d.eq })),
    ...(slot.offen ? [line(`epilog.${slot.id}.offen`, slot.id, slot.offen, { flag: slot.deeds[0][0].flag, value: 'offen' })] : []),
  ]),
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
  ...Object.entries(EPILOGUE_FRAME.outro).map(([k, t]) => line(`epilog.schluss.${k}`, 'schluss', t, { ending: k })),
  say('laub.end.museum_4', 'laub', EPILOGUE_FRAME.coda.museum, ep('schluss-nachsatz', { ending: E.museum }), { once: false }),
  say('jost.end.keep', 'jost', EPILOGUE_FRAME.coda.keep, ep('schluss-nachsatz', { ending: E.keep }), { once: false }),
];

write('enden', { pack: 'enden', dialogue });

// --story: copy the deeds and the frame into the fallback epilogue of 05-enden.story.json (its
// other keys and the rest of the file stay as they are)
if (process.argv.includes('--story')) {
  const file = `${ROOT}/content/story/05-enden.story.json`;
  const story = JSON.parse(readFileSync(file, 'utf8'));
  const e = story.epilogue;
  e.intro = { ...EPILOGUE_FRAME.intro };
  e.outro = { ...EPILOGUE_FRAME.outro };
  e.coda = { ...EPILOGUE_FRAME.coda };
  e.readings = DEED_SLOTS.map((slot) => ({
    id: slot.id,
    deeds: slot.deeds.map(([d, text]) => ({ flag: d.flag, eq: d.eq, text })),
    text: { offen: slot.offen },
  }));
  writeFileSync(file, JSON.stringify(story, null, 2) + '\n');
  console.log('wrote 05-enden.story.json epilogue');
}
