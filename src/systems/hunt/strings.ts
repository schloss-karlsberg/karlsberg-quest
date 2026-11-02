import { addStrings } from '../../i18n';

/** German strings of the hunt + lantern (texts from content/bible/09-ui-texte.md §5–7). */
addStrings('de', {
  // horn calls: plain description / with Spurenleser 1 (meaning)
  'hunt.horn.search': '[Horn: ein langer Ton]',
  'hunt.horn.search.meaning': '[Horn: ein langer Ton – die Jagd beginnt]',
  'hunt.horn.found': '[Horn: zwei kurze Töne]',
  'hunt.horn.found.meaning': '[Horn: zwei kurze Töne – Fährte aufgenommen]',
  'hunt.horn.lost': '[Horn: ein fallender Ton]',
  'hunt.horn.lost.meaning': '[Horn: ein fallender Ton – sie haben dich verloren und suchen, wo du warst]',
  'hunt.horn.call-off': '[Horn: drei lange Töne]',
  'hunt.horn.call-off.meaning': '[Horn: drei lange Töne – sie sammeln sich]',
  // hound / rider sounds
  'hunt.sound.pant': '[Hecheln, nah]',
  'hunt.sound.paws': '[Pfoten im Gras]',
  'hunt.sound.paws.frost': '[Pfoten im Raureif]',
  'hunt.sound.bark.near': '[Bellen, nah]',
  'hunt.sound.bark.far': '[Bellen, fern]',
  'hunt.sound.howl': '[Heulen, fern]',
  'hunt.sound.growl': '[Knurren]',
  'hunt.sound.hooves': '[Hufschlag]',
  'hunt.sound.rush': '[Die Meute stürzt heran]',
  'hunt.arrow.horn': 'Horn',
  'hunt.arrow.hound': 'Hund',
  'hunt.arrow.hooves': 'Hufe',
  // caught
  'hunt.caught.title': 'Die Meute hat dich gestellt …',
  'hunt.caught.sub': 'Gestellt ist nicht gerissen.',
  // states (debug / screen readers)
  'hunt.state.calm': 'ruhig',
  'hunt.state.suspicious': 'wittert',
  'hunt.state.searching': 'sucht',
  'hunt.state.chasing': 'hetzt',
  // lantern
  'lantern.on': 'Laterne an',
  'lantern.off': 'Laterne aus',
  'lantern.empty': 'Die Laterne ist erloschen.',
  'lantern.noOil': 'Kein Öl mehr in der Laterne.',
  'lantern.refilled': 'Laterne nachgefüllt.',
  'lantern.low': 'Das Öl geht zur Neige.',
});
