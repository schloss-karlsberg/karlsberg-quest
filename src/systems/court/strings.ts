import { addStrings } from '../../i18n';

/**
 * German strings of "Unauffällig" (docs/IDEAS-ROUND11.md §2.6). Content may override any id with a
 * later `addStrings('de', {...})` (the last one wins), e.g. the guard lines per zone:
 *  - `court.eject.<zone>.1…4` (zone = 'court.ehrenhof' / 'court.orangerie'; fallback `court.eject.1…4`),
 *  - `court.refused.letter.1…2`, `court.inspect.coat`, `court.inspect.ok`,
 *  - `court.bark.1…4` (Misstrauen), `court.who` (the default watcher noun).
 * Variants are numbered from 1; the system takes every id that exists (up to 8).
 */
addStrings('de', {
  'court.who': 'Eine Wache',
  'court.speaker': 'Wache',
  'court.meter': 'Aufmerksamkeit',
  // what gave you away (the caption names it)
  'court.tell.hivis': 'die Warnweste',
  'court.tell.running': 'du rennst',
  'court.tell.staff': 'der Stab in deiner Hand',
  'court.tell.take': 'du nimmst etwas',
  'court.tell.throw': 'du wirfst mit Kastanien',
  'court.tell.dodge': 'du springst zur Seite',
  'court.tell.lantern': 'die Laterne am Tag',
  'court.tell.lawn': 'du gehst übers Beet',
  'court.tell.place': 'hier hast du nichts verloren',
  'court.tell.crouch': 'du schleichst',
  'court.tell.tape': 'das Maßband',
  'court.tell.linger': 'du stehst zu lange herum',
  // captions per stage
  'court.cap.blick': '[{who} sieht herüber – {tell}]',
  'court.cap.misstrauen': '[{who} wird misstrauisch – {tell}]',
  'court.cap.aufgefallen': '[{who} kommt auf dich zu – {tell}]',
  // a noise that is not you (a thrown chestnut lands): the watcher goes to look, or only glances
  'court.cap.noise': '[{who} horcht auf und geht nachsehen]',
  'court.cap.glance': '[{who} dreht nur kurz den Kopf]',
  'court.cap.struck': '[Getroffen! {who} sucht, wer geworfen hat]',
  'court.cap.back': '[{who} geht zurück auf den Posten]',
  'court.noise.bark.1': 'Was war das?',
  'court.noise.bark.2': 'Wer da?',
  'court.noise.bark.3': 'Hm. Da hinten.',
  'court.struck.bark.1': 'He! Wer wirft da?',
  'court.struck.bark.2': 'Au! Zeig Er sich!',
  // Misstrauen: a barked line
  'court.bark.1': 'He, Er da!',
  'court.bark.2': 'Moment mal …',
  'court.bark.3': 'Kenn ich Ihn?',
  'court.bark.4': 'Was treibt Er hier?',
  // escorted out (Hinausbegleitet)
  'court.eject.title': 'Hinausbegleitet',
  'court.eject.1': 'Hinaus mit Ihm. Und komm Er nicht wieder so daher.',
  'court.eject.2': 'Der Herr hat sich wohl verlaufen. Hier entlang.',
  'court.eject.3': 'Schon wieder Er? Ich bring Ihn raus, ich kenn den Weg.',
  'court.eject.4': 'Fremde warten draußen. So ist das hier.',
  // the first ejection explains itself (one card, then never again)
  'court.hint.title': 'Aufgefallen!',
  'court.hint.why': 'Verraten hat dich: {tell}.',
  'court.hint.rules': 'Am Hof fällt auf, wer rennt, den Stab zieht oder wie ein Fremder aussieht. Geh ruhig, Stab weg, und meide die Blickfächer der Wachen am Boden.',
  'court.hint.lossless': 'Du verlierst nichts – nur ein bisschen Zeit.',
  'court.hint.ok': 'Verstanden',
  'court.hint.how.hivis': 'Ohne Rock bist du sofort ein Fremder: Besorg dir Kleidung, die an den Hof passt.',
  'court.hint.how.running': 'Geh langsam: Umschalttaste loslassen, wenn dich jemand sieht.',
  'court.hint.how.running.touch': 'Geh langsam: Schieb den Bewegungsregler nicht ganz nach vorn, wenn dich jemand sieht.',
  'court.hint.how.staff': 'Kein Stab, kein Zielen, kein Schlag, wo eine Wache hinsieht.',
  'court.hint.how.throw': 'Wirf nur, wenn dich keine Wache sieht, und nie auf die Wache selbst. Eine Kastanie, die abseits aufschlägt, lockt sie weg.',
  'court.hint.how.take': 'Nimm nichts, solange dich jemand sieht: Warte, bis der Blick wegschwenkt.',
  // inspection (Musterung)
  'court.inspect.prompt': 'Brief vorzeigen (halten)',
  'court.inspect.ring': '[Die Wache mustert dich – jetzt ganz ruhig]',
  'court.refused.letter.1': 'Ohne Schreiben kommt hier keiner rein.',
  'court.refused.letter.2': 'Kein Brief, kein Hof. Geh Er.',
  'court.inspect.coat': 'In dem Aufzug? Hinaus!',
  'court.inspect.ok': 'So, so. Dann geh Er durch.',
  'court.admitted': 'Eingelassen.',
  // fast travel while not admitted
  'court.travel.outside': 'Ohne Erlaubnis kein Ehrenhof – du stehst vor dem Gitter.',
});
