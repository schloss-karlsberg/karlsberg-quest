import { addStrings } from '../../i18n';

/**
 * Skills: unlock cards, Laub's lines (FIKTION, his voice per bible 08-stimmen §1), locked-tool
 * notes, settings rows and the extra key-help rows. Names/tiers follow bible 00-overview §4.
 */
addStrings('de', {
  'skills.card.kicker': 'Neue Fähigkeit',
  'skills.card.stamp': 'Freigeschaltet',
  'skills.card.tier': 'Stufe {n}',
  'skills.card.aria': '{Name} {Stufe} freigeschaltet',

  'skills.name.relief': 'Relief-Blick',
  'skills.name.kartograf': 'Kartograf',
  'skills.name.baumeister': 'Baumeister',
  'skills.name.roentgen': 'Röntgenblick',
  'skills.name.spurenleser': 'Spurenleser',

  'skills.tier.relief.1': 'Schummerung',
  'skills.tier.relief.2': 'Lokales Relief',
  'skills.tier.relief.3': 'VAT',
  'skills.tier.kartograf.1': 'Karte 1836–41',
  'skills.tier.kartograf.2': 'Messtischblatt 1935',
  'skills.tier.kartograf.3': 'Messen',
  'skills.tier.baumeister.1': 'Planblatt',
  'skills.tier.baumeister.2': 'Konfidenzansicht',
  'skills.tier.baumeister.3': 'Raumfolge',
  'skills.tier.roentgen.1': 'Punktwolke',
  'skills.tier.spurenleser.1': 'Hornrufe',
  'skills.tier.spurenleser.2': 'Fährtenlinien',

  'skills.desc.relief.1': 'Der Boden ohne Wald, im Streiflicht.',
  'skills.desc.relief.2': 'Eine Handbreit höher wird rot, tiefer wird blau.',
  'skills.desc.relief.3': 'Kanten, Gruben und Rinnen auf einmal.',
  'skills.desc.kartograf.1': 'Laubs Karte von 1840 über das Gelände legen.',
  'skills.desc.kartograf.2': '[M] wechselt jetzt zwischen 1840 und 1935.',
  'skills.desc.kartograf.3': 'Strecke und Höhenprofil. Klicke Anfang und Ende.',
  'skills.desc.baumeister.1': 'Die Grundrisse von 1789 liegen auf dem Boden. Räume sind beschriftet.',
  'skills.desc.baumeister.2': 'Was ist belegt, was erschlossen, was vermutet?',
  'skills.desc.baumeister.3': 'Die Räume im Planblatt, mit Namen.',
  'skills.desc.roentgen.1': 'Die Bodenpunkte von 2025, unter den Bäumen hindurch.',
  'skills.desc.spurenleser.1': 'Untertitel sagen, was ein Hornruf bedeutet.',
  'skills.desc.spurenleser.2': 'Die Wege der Meute schimmern im Boden.',

  'skills.key.relief.1': '[2]',
  'skills.key.relief.2': '[2]',
  'skills.key.relief.3': '[2]',
  'skills.key.kartograf.1': '[M]',
  'skills.key.kartograf.2': '[M]',
  'skills.key.kartograf.3': '[3]',
  'skills.key.baumeister.1': '[5]',
  'skills.key.baumeister.2': '[5]',
  'skills.key.baumeister.3': '[5]',
  'skills.key.roentgen.1': '[4]',
  'skills.key.spurenleser.1': '',
  'skills.key.spurenleser.2': '',

  // Laub (FIKTION) – one line per new tier; silent before he has spoken in the story
  'skills.laub.relief.1': 'Schummerung. Licht von Nordwesten, wie es sich gehört. Ich habe dafür 1840 noch Kerzen gebraucht.',
  'skills.laub.relief.2': 'Lokales Relief. Rot ist höher, Blau ist tiefer. Politisch ist das nicht gemeint.',
  'skills.laub.relief.3': 'VAT. Alles auf einmal sehen ist eine Kunst. Alles auf einmal verstehen ist eine andere.',
  'skills.laub.kartograf.1': 'Meine Karte. Fünfzig Meter Versatz am Schloss. Ich bestehe darauf, dass sich der Berg bewegt hat.',
  'skills.laub.kartograf.2': 'Das Messtischblatt. Zehn bis fünfzehn Meter daneben. Mit hundert Jahren Vorsprung ist das keine Kunst.',
  'skills.laub.kartograf.3': 'Messen. Endlich eine Tätigkeit, die ich anerkenne. Anfang, Ende, und dann glauben Sie der Zahl, nicht dem Herzog.',
  'skills.laub.baumeister.1': 'Die Pläne. Wer hier was gebaut hat, steht darin. Wer es bezahlt hat, nicht.',
  'skills.laub.baumeister.2': 'Grün ist belegt, Orange erschlossen, Rosa vermutet. Seien Sie mit Rosa so streng wie mit Herzögen.',
  'skills.laub.baumeister.3': 'Die Raumfolge. Jetzt wissen Sie, wo die Türen waren. Das Feuer wusste es auch.',
  'skills.laub.roentgen.1': 'Unter die Bäume schauen, ohne einen Spaten anzufassen. Schauen, nicht graben. Das hätte mir 1840 gefallen.',
  'skills.laub.spurenleser.1': 'Ein langer Ton, zwei kurze, ein fallender, drei lange. Jetzt hören Sie nicht nur das Horn, sondern auch, was es will.',
  'skills.laub.spurenleser.2': 'Die Fährten. Hunde laufen, wo sie immer gelaufen sind. Darin sind sie wie Beamte.',

  // locked tools (field-book note, no spoilers)
  'skills.locked.scan': 'Relief-Blick {n} kennst du noch nicht.',
  'skills.locked.map': 'Noch keine Karte zum Vergleichen.',
  'skills.locked.measure': 'Messen lernst du noch (Kartograf 3).',
  'skills.locked.xray': 'Den Röntgenblick hast du noch nicht.',
  'skills.locked.plans': 'Noch keine Pläne (Baumeister).',

  // maps
  'map.1840': 'Karte 1836–41 eingeblendet',
  'map.1935': 'Messtischblatt 1935–40 eingeblendet',
  'map.status.1840': 'Karte 1836–41',
  'map.status.1935': 'Messtischblatt 1935',

  // settings rows
  'settings.rauhnacht': 'Rauhnacht (schwer: schnellere Meute, weniger Öl, der Pikeur reitet früher)',
  'settings.subtitlesOn': 'Untertitel für Geräusche (Horn, Hunde, Umgebung)',
  'settings.soundIndicators': 'Richtungspfeile für Geräusche am Bildrand',

  // key help: tools added by this round (bible style)
  'ui.keys.xray': 'Röntgenblick: Bodenpunkte unter den Bäumen (Röntgenblick)',
  'ui.keys.plans': 'Planblatt / Konfidenzansicht der Rekonstruktion (Baumeister)',
  'ui.keys.relief_off': 'Relief-Blick aus',
});
