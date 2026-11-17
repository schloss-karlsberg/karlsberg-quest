/**
 * The three endings (bible 06-enden.md §2–5): the closing scene, Laub's and Marlene's last lines
 * and the final picture. All of it is fiction (labelled as such on the page).
 */
import type { EndingId } from '../types';

export interface EndingScene {
  id: EndingId;
  /** Value of `flag.end` (bible ids). */
  flag: 'museum' | 'verbrennen' | 'behalten';
  scene: string;
  laub: string[];
  marlene: string;
  picture: string;
}

/** Years since 1793, spelled out for Laub (bible: without a known year "über zweihundert"). */
export function yearsSpelled(year = new Date().getFullYear()): string {
  return year === 2026 ? 'Nach zweihundertdreiunddreißig Jahren.' : 'Nach über zweihundert Jahren.';
}

export const ENDING_BEFORE = 'Es ist Ihr Buch jetzt. Soll hätte gesagt: Hauptsache, die Namen stimmen.';

export function endingScenes(year?: number): Record<EndingId, EndingScene> {
  return {
    museum: {
      id: 'museum',
      flag: 'museum',
      scene:
        'Du legst die Seiten in die Schachtel. Marlene schreibt mit Filzstift „Karlsberg, Funde ohne Fundort“ darauf und streicht „Funde“ wieder durch. Draußen auf der Lichtung setzt du das Horn an. Kein schöner Ton, ein fallender, kratziger. Im Wald antwortet nichts. Dann, sehr weit weg, legt sich etwas hin. Man hört es nicht, man weiß es.',
      laub: [
        `Abgeblasen. ${yearsSpelled(year)} Ich werde das als Überstunden einreichen.`,
        'Eine Akte, die geschlossen wird, ist eine Akte, die man lesen kann. Bringen Sie sie dahin, wo man nachschaut, bevor man glaubt. Mit Quellen. Auch die, die mir nicht gefallen.',
        'Und schreiben Sie auf das Schild, dass ich die fünfzig Meter nicht verschuldet habe.',
      ],
      marlene: 'Ich fahr’s nächste Woche hin. Und dem Forstamt sag ich, sie sollen die Gräben dem Denkmalamt melden. Gucken ja, graben nein. Das hast du mir beigebracht.',
      picture: 'Die Nadel der Bussole dreht sich zum ersten Mal ruhig nach Norden und bleibt dort. Laub ist still. Er ist nicht fort, er ist pensioniert.',
    },
    burn: {
      id: 'burn',
      flag: 'verbrennen',
      scene:
        'Du öffnest die Ofenklappe. Die Seiten brennen nicht schnell, sie rollen sich ein und werden durchsichtig, und für einen Atemzug sieht man durch jede eine Erinnerung: den Ehrenhof im Abendlicht von 1789, ein Feuerwerk über den Dächern, die Meute im Nebel der Apfelallee. Dann ist es Asche. Du gehst zum Zwinger und legst das Horn auf den Mauerrest. Kein Horn mehr in der Nacht.',
      laub: [
        'Gut. Sie haben lange genug gesucht. Die Hunde und ich.',
        'Was im Buch stand, steht auch woanders. Bei Mannlich, in den Akten, im Boden. Nur die Namen nicht. Die Namen tragen jetzt Sie.',
        'Machen Sie das Licht aus, wenn Sie gehen. Das habe ich nie gelernt.',
      ],
      marlene: 'Riecht nach Herbstfeuer. Komisch. Riecht gar nicht nach Papier. … Hast du gut gemacht. Ich weiß nicht, was, aber gut.',
      picture: 'Der Zwinger im Morgenlicht, Raureif, das Horn auf der Mauer. Kein Abdruck im Raureif außer deinem eigenen.',
    },
    keep: {
      id: 'keep',
      flag: 'behalten',
      scene:
        'Du legst die Chronik in die Schublade zur Bussole und schiebst sie zu. Das Horn hängst du an den Haken neben der Tür. Marlene sieht es an und sagt nichts. Am Abend, als du den Bauwagen abschließt, liegen fünf Abdrücke im Raureif vor der Stufe. Sie führen nicht weg.',
      laub: [
        'Sie behalten uns. Das ist unvernünftig. Ich bin sehr gerührt.',
        'Dann bleibt die Jagd offen. Die Hunde laufen weiter, aber jetzt hinter Ihnen her, nicht vor Ihnen weg. Das ist ein Unterschied, den man spürt, wenn es dunkel wird.',
        'Und ich bleibe im Dienst. Ohne Tagegeld. Wie gehabt.',
      ],
      marlene: 'Lass das Horn da hängen. Das passt zum Bauwagen. Aber blas nicht drauf, wenn ich schlafe.',
      picture: 'Nacht. Von der Kuppe über dem Tal sieht man die Lichter von Homburg und darüber den dunklen Schlossberg. Ganz leise, aus der Richtung der Hohenburg, ein Horn, falsch und zu hoch. Jost hat nie richtig blasen gelernt.',
    },
  };
}

/** Credits: sources (bible 07-codex.md, 09-ui-texte.md §13). */
export const CREDIT_SOURCES: { label: string; url: string }[] = [
  { label: 'Johann Christian von Mannlich, Ein deutscher Maler und Hofmann. Lebenserinnerungen 1741–1822, hg. Eugen Stollreither, Berlin 1910', url: 'https://archive.org/details/eindeutschermale00mann' },
  { label: 'Jutta Schwan, „Schloss Carlsberg bei Homburg-Saar“, Burgen und Schlösser 53 (2012) 4', url: 'https://journals.ub.uni-heidelberg.de/index.php/bus/article/download/53625/47240' },
  { label: 'Allgemeine Deutsche Biographie: Karl II. (Herzog von Pfalz-Zweibrücken)', url: 'https://de.wikisource.org/wiki/ADB:Karl_II._(Herzog_von_Pfalz-Zweibr%C3%BCcken)' },
  { label: 'Wikipedia: Schloss Karlsberg · Karl II. August · Karlsberg Castle · Wilde Jagd', url: 'https://de.wikipedia.org/wiki/Schloss_Karlsberg' },
  { label: 'Stadt Homburg: Schloss Karlsberg · Faltblatt Schlossbergtour', url: 'https://www.homburg.de/leben-in-homburg/touristisches/sehenswertes/schloss-karlsberg/' },
  { label: 'Saarpfalz-Touristik und urlaub.saarland: Bärenzwinger', url: 'https://www.saarpfalz-touristik.de/attraktionen/baerenzwinger-b8c8db2c7d' },
  { label: 'schloss-karlsberg.de (Dr. Jutta Schwan) · Hörpfad Schloss Karlsberg', url: 'https://schloss-karlsberg.de/schloss-karlsberg-3/' },
  { label: 'Rosa-Luxemburg-Stiftung 2015: „Der Karlsberg – von barocker Pracht zur Baustoffhandlung“', url: 'https://www.rosalux.de/news/id/692/der-karlsberg-von-barocker-pracht-zur-baustoffhandlung' },
  { label: 'Die Rheinpfalz 2018: „Zerstörte Pracht jetzt wieder sichtbar“', url: 'https://www.rheinpfalz.de/' },
  { label: 'Historisches Museum Saar: Steinerne Macht', url: 'https://www.historisches-museum.org/steinerne-macht' },
  { label: 'ULB Darmstadt: Mannlich, „Plan de la foire … 1785“ (CC0)', url: 'https://nbn-resolving.org/urn:nbn:de:tuda-tudigit-84275' },
  { label: 'Deutsche Biographie: Christian Ludwig Hautt · Literaturland Saar: Homburg', url: 'https://www.deutsche-biographie.de/sfz28384.html' },
  { label: 'Saarländisches Denkmalschutzgesetz · LfD Hessen: Bodendenkmäler unter Wald', url: 'https://umwelt-online.de/recht/bau/laender/saarland/dschg18.htm' },
];
