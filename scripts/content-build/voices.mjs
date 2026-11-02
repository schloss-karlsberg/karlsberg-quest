import { say, write } from './common.mjs';

/*
 * Barks (08-stimmen.md §1.1). Scheduling rules are NOT encoded in data (no schema field):
 *  - one random line per group; a line repeats at the earliest after 10 min; max 1 bark / 45 s;
 *  - no barks during echoes, dialogues and at memorial places.
 * Triggers use contract/core events where they exist, otherwise custom 'bark:<situation>'.
 */
const group = (prefix, speaker, trigger, lines, o = {}) =>
  lines.map((text, i) => say(`${prefix}.${String(i + 1).padStart(2, '0')}`, speaker, text, trigger, { once: false, ...o }));

const dialogue = [
  ...group('laub.bark.idle', 'laub', { event: 'bark:idle' }, [
    'Ich messe gerade, wie lange Sie stillstehen. Es ist eine sehr genaue Messung.',
    'Wenn Sie nichts tun, tue ich auch nichts. Das hat beim Staat jahrelang funktioniert.',
    'Der Berg wartet seit 1793. Auf Sie kommt es jetzt auch nicht mehr an. Aber bitte.',
    'Haben Sie schon die Karte verglichen? M. Ich frage nur.',
  ]),
  ...group('laub.bark.lantern_low', 'laub', { event: 'lantern:oil', below: 0.2 }, [
    'Ihr Öl geht zur Neige. Meines ist 1840 ausgegangen. Ich empfehle, nicht meinem Beispiel zu folgen.',
    'Die Flamme wird klein. Zurück zur Station wäre jetzt keine Feigheit, sondern Verwaltung.',
    'Noch ein paar Minuten Licht. Q halten, wenn Sie heim wollen.',
  ]),
  ...group('laub.bark.hounds_near', 'laub', { event: 'hunt:alert', state: 'suspicious' }, [
    'Hören Sie das? Atmen Sie leiser. Ich tue es auch.',
    'Licht aus. Jetzt.',
    'Hinlegen ist keine Schande. Ich sage das aus Erfahrung.',
    'Wasser. Stein. Hohlweg. Irgendetwas davon ist in der Nähe.',
  ]),
  ...group('laub.bark.hound_lost', 'laub', { event: 'hunt:horn', signal: 'lost' }, [
    'Sie haben Sie verloren. Fürs Erste. Hunde sind geduldiger als Herzöge.',
    'Ein fallender Ton. Das heißt: Sie suchen da, wo Sie eben waren. Seien Sie nicht mehr da.',
    'Gut gemacht. Ich hätte es nicht gekonnt. Das ist belegt.',
  ]),
  // scan: max once per mode and chapter (once:true per mode; the 4th line is the generic later one)
  say('laub.bark.scan.01', 'laub', 'Die Schummerung. Wie ein Kupferstich bei tiefem Licht. Altmodisch und zuverlässig, wie ich.', { event: 'scan:mode', mode: 1 }, { once: false }),
  say('laub.bark.scan.02', 'laub', 'Lokales Relief. Jetzt sehen Sie, was nur eine Handbreit höher oder tiefer ist. Gestern noch ein Waldboden, heute ein Grundriss.', { event: 'scan:mode', mode: 2 }, { once: false }),
  say('laub.bark.scan.03', 'laub', 'Alles auf einmal. Kanten, Gruben, Rinnen. Sehr schön. Sehr unübersichtlich. Wie ein Hofstaat.', { event: 'scan:mode', mode: 3 }, { once: false }),
  say('laub.bark.scan.04', 'laub', 'Wechseln Sie ruhig. Der Boden ändert sich nicht, nur Ihre Meinung über ihn.', { event: 'scan:mode' }, { once: false, priority: -1 }),
  ...group('laub.bark.wrong_batch', 'laub', { event: 'chronik:batch', correct: false }, [
    'Nicht alle drei. Mehr verrate ich nicht. Das hätte mir auch keiner verraten.',
    'Eine Zahl ist nicht falsch, nur weil sie groß ist. Aber eine ist falsch.',
    'Sie haben es gut gemeint. Das steht in vielen Akten, die schlecht ausgegangen sind.',
    'Prüfen Sie die Quelle, nicht das Gefühl.',
  ]),
  ...group('laub.bark.correct_batch', 'laub', { event: 'chronik:batch', correct: true }, [
    'Bestätigt. Drei Zeilen, die stimmen. Mehr hat der Hof in zwanzig Jahren nicht geschafft.',
    'Schön. Ich trage es ein. In Kurrent, damit es keiner lesen kann.',
    'Das hält. Darauf kann man einen Standpunkt setzen.',
    'Merken Sie, wie das Papier schwerer wird? Das sind die Namen.',
  ]),
  ...group('laub.bark.enter_1789', 'laub', { event: 'era:change', to: '1789' }, [
    '1789. Atmen Sie ein. Es riecht nach Kalk und Geld.',
    'Kein Wald. Den hat man erst hinterher gepflanzt.',
    'Der Hof. Gehen Sie zu Fuß. Wir dürfen hier nicht fahren.',
  ]),
  ...group('laub.bark.enter_fire', 'laub', { event: 'bark:enter-fire' }, [
    'Geduckt. Rauch geht nach oben, Sie gehen nach unten.',
    'Nicht da lang. Da ist Stroh.',
    'Das Feuer hat einen Plan. Wir haben einen besseren. Hoffe ich.',
  ]),
  ...group('laub.bark.return', 'laub', { event: 'hub:enter' }, [
    'Wieder im November. Ich mag den November. Im November ist alles, was passieren konnte, schon passiert.',
    'Zurück. Schreiben Sie auf, bevor Sie vergessen. Vergessen geht schneller, als man denkt.',
    'Willkommen in der Gegenwart. Sie ist kleiner, als man sie sich vorstellt.',
  ]),
  say('laub.bark.return.04', 'laub', 'Gestellt. Nicht gerissen. Merken Sie sich den Unterschied.', { event: 'player:caught', by: 'pack' }, { once: false, priority: 1 }),
  ...group('laub.bark.relief', 'laub', { event: 'clue:found', kind: 'relief' }, [
    'Ein gerader Strich, wo der Wald keine geraden Striche macht. Das war einmal Absicht.',
    'Notieren Sie es. Mit Ort und Datum. Und dann lassen Sie es liegen, wo es liegt.',
    'Schauen, nicht graben. Ich sage es nur, weil Sie gerade so aussehen.',
    'Das hätte ich 1840 gern gehabt. Ich hatte nur Schritte und eine Kette.',
  ]),
  // Horn comments (§1.2): once, at the first time each call is heard.
  say('laub.horn.search', 'laub', 'Ein langer Ton. Die Jagd beginnt.', { event: 'hunt:horn', signal: 'search' }, { once: true, priority: 5 }),
  say('laub.horn.found', 'laub', 'Zwei kurze. Die haben etwas gefunden. Vermutlich uns.', { event: 'hunt:horn', signal: 'found' }, { once: true, priority: 5 }),
  say('laub.horn.lost', 'laub', 'Ein fallender Ton. Sie wissen nicht mehr, wo wir sind. Ich auch nicht, aber ich gebe es nicht zu.', { event: 'hunt:horn', signal: 'lost' }, { once: true, priority: 5 }),
  say('laub.horn.call_off', 'laub', 'Drei lange. Sie gehen zurück. Diesmal.', { event: 'hunt:horn', signal: 'call-off' }, { once: true, priority: 5 }),
  // Marlene, general lines at the field station (random, max one per return)
  ...group('marlene.gen', 'marlene', { event: 'hub:enter' }, [
    'Kaffee steht da. Er ist nicht gut, aber heiß.',
    'Hast du die Nordseite schon gemacht? Das Forstamt will den Bericht bis Freitag.',
    'Die Bussole hat heut Nacht getickt. Ich hab sie in die Schublade gelegt. Hat nicht geholfen.',
    'Im Relief sieht man mehr als im Wald. Im Wald sieht man dafür, wo man hintritt.',
    'Pass auf die Gräben auf. Nicht reinfallen und nicht reingraben, das gibt Ärger mit dem Denkmalamt.',
    'Mein Schwager sagt, auf dem Karlsberg spukt’s. Mein Schwager sagt auch, er kann Skat.',
    'Wenn du die alte Karte drüberlegst, verrutscht alles um ein Stück. Ich glaub, die waren damals einfach müde.',
    'Es wird früh dunkel. Nimm die Lampe mit. Und Öl.',
    'Die Wildschweine waren wieder am Weiher. Die graben, das dürfen die.',
    'Brauchst du was? Ich fahr nachher nach Homburg.',
    'Du redest im Schlaf. Gestern hast du ‚Bijou‘ gesagt. Ist das ein Hund?',
    'Schreib’s auf, sonst vergisst du’s. Hat meine Oma immer gesagt. Sie hat alles vergessen, aber aufgeschrieben.',
    'Ich mag den Nebel hier oben. Da sieht der Wald aus, als würd er sich an was erinnern.',
    'Der Laserscan ist ja neu. Zweitausendfünfundzwanzig geflogen, im Winter, ohne Laub. Sonst sieht man nix.',
    'Wenn’s dir zu viel wird, mach eine Pause. Der Berg läuft nicht weg. Der ist schon weggelaufen, vor zweihundert Jahren.',
  ], { priority: -1 }),
  ...group('soll.bark', 'soll', { event: 'bark:npc-near', npc: 'soll' }, [
    'Sie stehen in meinem Licht. Nein, bleiben Sie. Es ist ohnehin nicht meins.',
    'Neunzehn, zwanzig … nein. Noch einmal.',
    'Bitte nichts anfassen, was nicht bezahlt ist. Also bitte nichts anfassen.',
  ]),
  ...group('hanne.bark', 'hanne', { event: 'bark:npc-near', npc: 'hanne' }, [
    'Angewiesen. Hm.',
    'Wenn Sie zum Schreiber gehen: Matthes. Mit zwei T.',
    'Ich steh hier nicht zum Vergnügen. Obwohl die Aussicht schön ist. Bezahlt ist die auch nicht.',
  ]),
  ...group('jost.bark', 'jost', { event: 'bark:npc-near', npc: 'jost', era: '1789' }, [
    'Sultan, aus! Nicht du, der Hund.',
    'Wenn du dich vor denen fürchtest, bist du nicht dumm.',
    'Die riechen, wo du warst. Nicht, wo du bist. Das ist dein Glück.',
  ]),
];

write('voices', { pack: 'voices', dialogue });
