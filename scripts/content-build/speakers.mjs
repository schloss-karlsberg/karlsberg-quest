import { write } from './common.mjs';

const sp = (id, name, historical) => ({ id, name_de: name, historical });
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
    sp('kollege', 'Ein Kollege (Funk)', false),
    sp('stimme', 'Eine Stimme aus dem Nebel', false),
    // nameless extras in echoes (fiction)
    sp('diener', 'Diener', false),
    sp('diener2', 'Zweiter Diener', false),
    sp('gaertner', 'Zweiter Gärtner', false),
    sp('wache', 'Wache', false),
    sp('wache2', 'Zweite Wache', false),
    sp('soldat', 'Soldat', false),
    sp('soldat2', 'Zweiter Soldat', false),
    sp('frau', 'Eine Frau', false),
    sp('mann', 'Ein Mann', false),
    sp('junge', 'Ein Junge', false),
    sp('fuhrmann', 'Fuhrmann', false),
    sp('fuhrmann2', 'Zweiter Fuhrmann', false),
    sp('menge', 'Die Menge', false),
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
    sp('feuerwerker', 'Ein Feuerwerker aus Straßburg', true),
    sp('landremont', 'General Landremont', true),
    sp('handwerker', 'Ein Handwerker', true),
    sp('kommissaer', 'Der Kommissär', true),
    sp('hoefling', 'Ein Höfling', true),
  ],
});
