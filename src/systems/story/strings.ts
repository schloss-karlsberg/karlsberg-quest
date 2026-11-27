import { addStrings } from '../../i18n';
import { DEFAULT_VISITOR_NAME } from './engine';

addStrings('de', {
  'story.name.default': DEFAULT_VISITOR_NAME,
  'story.dialogue.next': 'weiter',
  'story.dialogue.tap': 'Tippen: weiter',
  'story.tag.historical': 'historisch · nach Quelle',
  'story.tag.echo': 'Erinnerung (Fiktion)',
  'story.echo.date': 'Erinnerung · {when}',
  'story.tag.fiction': 'Fiktion',
  'story.source': 'Quelle',
  'story.placeholder': 'Platzhalter',

  'story.home.enterToast': 'Quelle – hier ist es sicher.',
  'story.chapter.title': 'Kapitel',
  'story.chapter.locked': 'Noch verborgen',
  'story.chapter.current': 'Jetzt',
  'story.chapter.done': 'Abgeschlossen',
  'story.chapter.confirm': '„{title}“ (neu) beginnen? Deine Stufe, Ausrüstung und Codex-Einträge bleiben erhalten.',

  // objectives
  'story.objective': 'Ziel',

  // caught
  'story.caught.pack': 'Die Meute hat dich gestellt.',
  'story.caught.fire': 'Das Feuer hat dich zurückgeworfen.',
  'story.caught.oblivion': 'Der Berg hat dich beinahe vergessen.',
  'story.caught.combat': 'Der Nebel hat dich niedergeworfen.',
  'story.caught.combat.mist': 'Der Nebel hat dich niedergeworfen.',
  'story.caught.combat.light': 'Die Irrlichter haben dich geblendet.',
  'story.caught.combat.hound': 'Die Streuner haben dich umgerissen.',
  'story.caught.combat.paper': 'Die Mahnungen haben dich begraben.',
  'story.caught.combat.ember': 'Die Glut hat dich zu Boden geworfen.',
  'story.caught.combat.stone': 'Der Stein hat dich niedergeworfen.',
  'story.caught.combat.shade': 'Die Schatten haben dich zu Boden gezogen.',
  'story.caught.sub': 'Gestellt. Nicht gerissen.',
  'story.caught.sub.combat': 'Niedergeworfen. Nicht verloren.',
  'story.caught.wake': 'Du wachst an der Quelle auf. Was bestätigt ist, bleibt.',
  'story.meter.return': 'Die Erinnerung lässt dich los.',
  'story.caught.wakePoint': 'Du kommst am Reisepunkt {name} in der Gegenwart zu dir. Nichts ist verloren.',
  'story.caught.wakeAnchor': 'Du kommst in der Gegenwart dort zu dir, wo der Zeitsprung begann. Nichts ist verloren.',
  'story.caught.backQ': 'Hier ging es hinüber: Q – zurück in die Erinnerung',
  'story.oil.half': 'Die Hälfte vom Öl ist fort. Behalten Sie das im Auge.',
  'story.oil.low': 'Das Öl wird knapp. Nur noch Sekunden, dann lässt uns die Erinnerung los. Lampenöl, falls Sie welches haben.',
  'story.meter.returnSub': 'Das Licht reicht nicht weiter.',

  // shift fallback (when no era-shift feature is installed)
  'story.shift.notHere': 'Die Nadel steht nicht hier.',

  // choices
  'story.choice.timer': 'Noch {s} s',

  // title flow
  'story.warning.title': 'Bevor du anfängst',
  'story.warning.age': '16+',
  'story.warning.body1': 'Das Action-Rollenspiel ab 16 Jahren beginnt mit einer Führung über den Karlsberg. Im weiteren Spielverlauf gibt es Schreckmomente, Kämpfe gegen erfundene Spukgestalten, die Verfolgung durch eine geisterhafte Meute und eine Szene in einem brennenden Gebäude. Belastende Themen sind Armut, unbezahlte Arbeit, ein tödlicher Unfall (1785), Plünderung und Zerstörung. Gewalt gegen Menschen wird angedeutet. Blut ist nicht zu sehen.',
  'story.warning.body2': 'Das Spiel erzählt von echten Orten und echten Ereignissen. Was belegt ist, steht mit Quelle im Codex. Was erfunden ist, ist als „Fiktion“ gekennzeichnet.',
  'story.warning.body3': 'Der Karlsberg bei Homburg ist ein geschütztes Bodendenkmal. Schauen, nicht graben. Dieses Spiel zeigt keine Fundstellen und gibt keine Grabtipps.',
  'story.warning.gentle': 'Sanfter Modus – wenn dir Kämpfe oder Jagd zu viel werden: Gegner halten weniger aus, treffen nur halb so hart und kündigen ihre Angriffe länger an; die Meute ist langsamer. (Jederzeit änderbar.)',
  'story.warning.accept': 'Verstanden',
  'story.warning.back': 'Zurück',
  'story.name.title': 'Dein Name',
  'story.name.confirm': 'Weiter',
  'story.tourMap.title': 'Die Route der Führung',
  'story.tourMap.stop.hof': 'Karlsberger Hof',
  'story.tourMap.stop.felsenpfad': 'Felsenpfad',
  'story.tourMap.stop.weiher': 'Weiher',
  'story.tourMap.stop.quelle': 'Karlsbergquelle',
  'story.tourMap.start': 'Tour starten',

  // endings
  'story.end.title': 'Was das Feuer nicht fraß',
  'story.end.intro': 'Vor dir liegt die Chronik, jetzt vollständig: die Seiten aus allen Kapiteln, die Namen, die Beträge, mit Laubs Kurrent zwischen den Zeilen. Daneben das Horn und die Bussole.',
  'story.end.museum': 'Ins Museum',
  'story.end.museum.obj': 'Die graue Archivschachtel, die Marlene mitgebracht hat',
  'story.end.museum.hint': 'Die Wahrheit, mit Quellen. Die Jagd wird abgeblasen.',
  'story.end.burn': 'Verbrennen',
  'story.end.burn.obj': 'Die Chronik dem Feuer übergeben',
  'story.end.burn.hint': 'Ruhe für die Hunde. Stille für die Stimmen.',
  'story.end.keep': 'Behalten',
  'story.end.keep.obj': 'Chronik und Bussole einpacken',
  'story.end.keep.hint': 'Das Land erinnert sich weiter. Die Meute folgt dir.',
  'story.end.confirm': 'Bist du sicher? Das lässt sich nicht ändern.',
  'story.end.next': 'Weiter',
  'story.end.credits': 'Abspann',
  'story.end.skip': 'Überspringen',
  'story.end.epilogue': 'Epilog',
});
