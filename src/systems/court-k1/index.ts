import { defineSystem } from '../../core/systems';
import { addStrings } from '../../i18n';
// the court's placeholders first, so the chapter's lines below win (i18n: the last addStrings wins)
import '../court/strings';

/**
 * Content, not mechanics: chapter 1's lines for "Unauffällig" (src/systems/court, story k1_0b /
 * k1_0c, docs/IDEAS-ROUND11.md §2.5, voices content/bible/08-stimmen.md). The court system reads
 * them through t() / hasString() when it needs them; this module only has to load after
 * court/strings.ts (its import above, and its place after `court` in src/systems/index.ts).
 *
 * The Gardisten speak "Er" to strangers (like the old guard `wache.k1.rennen`); the escort lines
 * per zone are a running joke (variant n = the n-th ejection, `court.ejected`).
 */
export const COURT_K1_DE: Record<string, string> = {
  // the Musterung at the gitter (the Gardist at the gate, `gardist-tor`)
  'court.inspect.coat': 'In dem Aufzug? Der Herr ist wohl vom Theater. Hinaus.',
  'court.inspect.ok': 'Der Herr Sekretär vom Herrn Hofrat Amsel. Steht drin. Zu Fuß, wenn’s beliebt.',
  'court.refused.letter.1': 'Ohne Papier kommt hier keiner durch. Auch nicht im schönen Rock.',
  'court.refused.letter.2': 'Kein Schreiben, kein Berg. So will’s Serenissimus.',
  // Misstrauen (any watcher)
  'court.bark.1': 'He, Er da!',
  'court.bark.2': 'Moment. Kenn ich Ihn?',
  'court.bark.3': 'Was treibt Er hier?',
  'court.bark.4': 'Langsam, der Herr. Ganz langsam.',
  'court.bark.5': 'Wo will Er denn so eilig hin?',
  'court.bark.6': 'Halt Er mal still.',
  // Hinausbegleitet: the Ehrenhof (to the forecourt outside the gitter)
  'court.eject.court.ehrenhof.1': 'Raus. Und komm Er mir nicht wieder.',
  'court.eject.court.ehrenhof.2': 'Schon wieder Er? Ich schreib Ihn auf.',
  'court.eject.court.ehrenhof.3': 'Ich begleite Ihn gern. Ich hab ja sonst nichts zu tun.',
  'court.eject.court.ehrenhof.4': 'Hier entlang, der Herr. Der Weg hinaus ist der kürzeste am ganzen Hof.',
  'court.eject.court.ehrenhof.5': 'Fremde warten draußen. Das war schon so, bevor Er kam.',
  'court.eject.court.ehrenhof.6': 'Noch einmal, und ich trag Ihn ins Wachbuch ein. Mit Datum.',
  'court.eject.court.ehrenhof.7': 'Er schon wieder. Allmählich kenn ich Ihn besser als den Herzog.',
  'court.eject.court.ehrenhof.8': 'Raus. Ich zähl nicht mehr mit. Das soll der Kanzlist machen.',
  // Hinausbegleitet: the Orangerie (the teaching zone; down to the trail below the terrace)
  'court.eject.court.orangerie.1': 'Vom Rasen runter, und dann weiter. Da hinunter.',
  'court.eject.court.orangerie.2': 'Hier wird gegossen, nicht geguckt. Hinaus mit Ihm.',
  'court.eject.court.orangerie.3': 'Schon wieder? Die Orangen wachsen langsamer, wenn Er zuschaut.',
  'court.eject.court.orangerie.4': 'Wer hier rennt, rennt am besten gleich den Hang hinunter.',
  'court.eject.court.orangerie.5': 'Ich hab Ihn nicht gesehen. Gehen muss Er trotzdem.',
  'court.eject.court.orangerie.6': 'Oben wohnt der Herr Baudirektor. Der will seine Ruhe. Ich auch.',
  'court.eject.court.orangerie.7': 'Nochmal von vorn. Langsam. Ein Gärtner rennt nie.',
  'court.eject.court.orangerie.8': 'Raus aus meinem Beet.',
};

addStrings('de', COURT_K1_DE);

export default defineSystem({ id: 'court-k1' });
