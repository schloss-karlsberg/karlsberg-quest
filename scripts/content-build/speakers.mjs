import { write } from './common.mjs';

/**
 * `dative`: the name after a dative preposition, as in the talk prompt „Mit {name} sprechen“
 * (TASK-078). Required when the name starts with an article (Der, Die, Das, Ein, Eine, Zweite,
 * Zweiter; checked by tests/npc-prompt-name.test.ts) and for a placed bare noun like „Diener“.
 */
const sp = (id, name, historical, dative) => ({ id, name_de: name, ...(dative ? { dative_de: dative } : {}), historical });
write('speakers', {
  pack: 'speakers',
  speakers: [
    // fiction (08-stimmen.md)
    sp('laub', 'Quirin Laub', false),
    sp('marlene', 'Marlene', false),
    sp('soll', 'Kanzlist Gottlob Soll', false),
    sp('hanne', 'Hanne', false),
    sp('jost', 'Jost', false),
    sp('peter', 'Peter', false),
    sp('kollege', 'Ein Kollege (Funk)', false, 'einem Kollegen (Funk)'),
    sp('stimme', 'Eine Stimme aus dem Nebel', false, 'einer Stimme aus dem Nebel'),
    // 1789, the disguise opening (k1_0b / k1_0c; IDEAS-ROUND11 §2): fiction
    sp('liese', 'Liese, Wäscherin', false),
    sp('hofgaertner', 'Der Hofgärtner', false, 'dem Hofgärtner'),
    sp('gardist', 'Ein Gardist', false, 'einem Gardisten'),
    sp('gardist-tor', 'Ein Gardist', false, 'einem Gardisten'),
    sp('lakai', 'Ein Lakai', false, 'einem Lakaien'),
    // nameless extras in echoes (fiction)
    sp('diener', 'Diener', false, 'dem Diener'),
    sp('diener2', 'Zweiter Diener', false, 'dem zweiten Diener'),
    sp('gaertner', 'Zweiter Gärtner', false, 'dem zweiten Gärtner'),
    sp('wache', 'Wache', false),
    sp('wache2', 'Zweite Wache', false, 'der zweiten Wache'),
    sp('soldat', 'Soldat', false),
    sp('soldat2', 'Zweiter Soldat', false, 'dem zweiten Soldaten'),
    sp('frau', 'Eine Frau', false, 'einer Frau'),
    sp('mann', 'Ein Mann', false, 'einem Mann'),
    sp('junge', 'Ein Junge', false, 'einem Jungen'),
    sp('fuhrmann', 'Fuhrmann', false),
    sp('fuhrmann2', 'Zweiter Fuhrmann', false, 'dem zweiten Fuhrmann'),
    sp('menge', 'Die Menge', false, 'der Menge'),
    sp('epilog', 'Epilog', false),
    /** Sound / stage cues as subtitles ([…]); never speech. */
    sp('geraeusch', 'Geräusch', false),
    // historical persons: every line needs a source (M1910 page, Z = wörtlich, P = Paraphrase)
    sp('mannlich', 'Johann Christian von Mannlich', true),
    sp('herzog', 'Herzog Karl II. August', true),
    sp('schuegens', 'Schügens, der Leibjäger', true),
    sp('pfeffel', 'Pfeffel', true),
    sp('rose', 'Rosé, der Leibarzt', true),
    sp('salabert', 'Abbé Salabert', true),
    sp('esebeck', 'Freiherr von Esebeck', true),
    sp('feuerwerker', 'Ein Feuerwerker aus Straßburg', true, 'einem Feuerwerker aus Straßburg'),
    sp('landremont', 'General Landremont', true),
    sp('handwerker', 'Ein Handwerker', true, 'einem Handwerker'),
    sp('kommissaer', 'Der Kommissär', true, 'dem Kommissär'),
    sp('hoefling', 'Ein Höfling', true, 'einem Höfling'),
  ],
});
