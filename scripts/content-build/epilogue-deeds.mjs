/*
 * The epilogue told from DEEDS (docs/ACTION-RPG.md §8.6, playtest round 3: the stance cards read
 * like a quiz, the epilogue like a list of flags). One slot per chapter, one sentence each: the
 * first deed that holds tells it (quest deeds read the mirrored quest state `quest.<id>` = "done"),
 * else the slot's `offen` sentence (empty = nothing is added). Order = priority.
 *
 * Used by enden.mjs (the endings pack: lines with trigger { event: 'epilog:line', block, flag,
 * value }) and copied into content/story/05-enden.story.json → epilogue.readings[].deeds (the
 * fallback) by `node scripts/content-build/enden.mjs --story`.
 */
const done = (id) => ({ flag: `quest.${id}`, eq: 'done' });

export const DEED_SLOTS = [
  {
    id: 'vermessung',
    deeds: [
      [done('q.p.trichter'), 'Im November vermaß ich für Marlene den Wald über dem Schloss. Einen Trichter im Westen habe ich vom Rand aus gemeldet und nicht angefasst, das Klügste, was ich in jenem Herbst getan habe.'],
      [done('q.p.meiler'), 'Im November vermaß ich für Marlene den Wald über dem Schloss. An drei Kohlplatten setzte ich Messpunkte: Dort hatten Köhler wochenlang gewohnt, für ein Schloss, das sie nie betreten haben.'],
      [done('q.p.irrlichter'), 'Im November vermaß ich für Marlene den Wald über dem Schloss. Über dem Weiherdamm löschte ich die ersten Lichter, bevor ich wusste, was sie waren.'],
    ],
    offen: 'Im November vermaß ich für Marlene den Wald über dem Schloss. In der Punktwolke liefen Spuren quer über den Hof, und ich hielt sie für einen Messfehler.',
  },
  {
    id: 'hof',
    deeds: [
      [done('q.k1.hundenamen'), 'Im Sommer 1789 bekam Hanne den Lohnzettel ihres Mannes zurück, angewiesen, nicht ausgezahlt. Jost brachte ich fünf Hundemarken, und er schrieb die Namen dorthin, wo sie keiner verbrennt.'],
      [done('q.k1.kasuar'), 'Im Sommer 1789 bekam Hanne den Lohnzettel ihres Mannes zurück, angewiesen, nicht ausgezahlt. Den entlaufenen Kasuar ließ ich laufen, bis er müde war, und führte ihn heim, ohne einen Hieb.'],
      [done('q.k1.festplaene'), 'Im Sommer 1789 bekam Hanne den Lohnzettel ihres Mannes zurück, angewiesen, nicht ausgezahlt. Die Festpläne des Baudirektors holte ich aus dem Wind; er hat es nie erfahren.'],
    ],
    offen: 'Im Sommer 1789 bekam Hanne den Lohnzettel ihres Mannes zurück, angewiesen, nicht ausgezahlt. Der Hof fütterte tausend Hunde und hatte keinen Kreuzer für einen Steinhauer.',
  },
  {
    // the disguise opening (k1_0b, docs/IDEAS-ROUND11.md §2.7): how Kaspar's coat came to you (add-on slot)
    id: 'kleid',
    deeds: [
      [{ flag: 'flag.k1_kleid', eq: 'geliehen' }, 'Den Rock, in dem ich an den Hof kam, hatte mir die Wäscherin Liese geliehen, für drei Zettel aus ihrer Wäsche. Er gehörte einem kranken Lakaien namens Kaspar.'],
      [{ flag: 'flag.k1_kleid', eq: 'genommen' }, 'Den Rock, in dem ich an den Hof kam, hatte ich der Wäscherin Liese von der Leine genommen, als sie zum Weg schaute. Er gehörte einem kranken Lakaien namens Kaspar.'],
    ],
    offen: '',
  },
  {
    id: 'flucht',
    deeds: [
      [{ flag: 'flag.k2_tor', eq: 'leuchten' }, 'In der Februarnacht 1793 rannte Nikel Pfeiffer aus Rohrbach durch den Wald, um den Herzog zu warnen. Als die Wagen abfuhren, habe ich ihnen geleuchtet.'],
      [{ flag: 'flag.k2_tor', eq: 'dunkel' }, 'In der Februarnacht 1793 rannte Nikel Pfeiffer aus Rohrbach durch den Wald, um den Herzog zu warnen. Als die Wagen abfuhren, stand ich mit gelöschter Laterne im Dunkeln und sah nur ihre Fackeln.'],
    ],
    offen: 'In der Februarnacht 1793 rannte Nikel Pfeiffer aus Rohrbach durch den Wald, um den Herzog zu warnen. Der Herzog fuhr noch in derselben Nacht.',
  },
  {
    id: 'flucht-tat',
    deeds: [
      [done('q.k2.kisten'), 'Vier Bilderkisten hob ich einem Diener auf den Wagen nach Mannheim. Der Baudirektor wird gesagt haben, er habe es allein geschafft.'],
      [done('q.k2.bodenbrett'), 'Unter einem Brett in der Bildergalerie lag Solls graues Buch, und ich ließ es dort liegen, wo er es versteckt hatte.'],
      [done('q.k2.lichter'), 'Die Lichter im Wald waren ein glimmender Meiler und drei andere, die keine Kohle brauchten. Bei Mannlich steht davon nichts.'],
    ],
    offen: '',
  },
  {
    id: 'brand',
    deeds: [
      [done('q.k3.lehnstuhl'), 'Am 28. Juli 1793 brannte das Schloss. Ich half Peter, einen vergoldeten Lehnstuhl durchs Tor zu bringen, für seine Mutter; vielleicht steht er heute noch in einer Stube.'],
      [done('q.k3.jaguar'), 'Am 28. Juli 1793 brannte das Schloss. Den Jaguar der Menagerie schickte ich mit Licht heim, nicht mit dem Stab.'],
      [done('q.k3.kabinett'), 'Am 28. Juli 1793 brannte das Schloss. Für Soll holte ich die Etiketten des Naturalienkabinetts zurück: Die Vögel verbrannten, die Liste überlebte.'],
    ],
    offen: 'Am 28. Juli 1793 brannte das Schloss, und die Leute aus den Dörfern holten sich, was der Hof ihnen schuldig geblieben war.',
  },
  {
    id: 'steine',
    deeds: [
      [done('q.k4.zeichen'), 'Drei Jahre später trugen die Homburger den Karlsberg ab, Stein für Stein. Einer trägt Matthes’ Zeichen, einen offenen Winkel und drei Punkte, und liegt heute über einer Tür in der Stadt. Er ist der Lohn.'],
      [done('q.k4.pacht'), 'Drei Jahre später trugen die Homburger den Karlsberg ab, Stein für Stein. Soll bekam von mir drei angenagte Pachtzettel zurück und trug sie ein, weil Ordnung ist, wenn man trotzdem einträgt.'],
      [done('q.k4.graeben'), 'Drei Jahre später trugen die Homburger den Karlsberg ab, Stein für Stein. Was sie übrig ließen, sind Rinnen im Boden, die man im Relief für Mauern hält.'],
    ],
    offen: 'Drei Jahre später trugen die Homburger den Karlsberg ab, Stein für Stein. Angezündet hatten ihn die Franzosen, vergessen haben ihn alle.',
  },
  {
    id: 'meute',
    deeds: [[done('q.k4.stellen'), 'Am Ende legte ich mich am Zwinger in den Nebel und machte das Licht an, und Jost nahm den Hut ab.']],
    offen: 'Am Ende stand ich am Zwinger im Nebel, und die Hunde liefen nicht mehr.',
  },
  {
    id: 'meute-namen',
    deeds: [[done('q.k1.hundenamen'), 'Die Hunde hießen Diane, Sultan, Fanfare, Rauhreif und Bijou.']],
    offen: 'Wie die Hunde hießen, weiß nur Jost.',
  },
];

/** The epilogue frame per ending (intro, outro, coda): written as a story, not as a list. */
export const EPILOGUE_FRAME = {
  intro: {
    museum: 'Karlsberg bei Homburg, 1777–1793. Was das Feuer nicht fraß. Diese Seiten führte ein Kanzlist neben den Rechnungen des Hofes; ich habe aufgeschrieben, was ich selbst gesehen habe.',
    burn: 'Was ich weiß, schreibe ich hier einmal hin, und dann nicht wieder.',
    keep: 'Dieses Feldbuch hat 1840 ein Geometer namens Laub begonnen. Ich schreibe darin weiter, und er liest mit.',
  },
  outro: {
    museum: 'Quellen: Mannlich, Lebenserinnerungen. Die Akten. Der Boden. Und ein Geometer, der auf seinen fünfzig Metern besteht.',
    burn: 'Jetzt ist es still. Gute Nacht, Laub. Gute Nacht, Diane, Sultan, Fanfare, Rauhreif, Bijou.',
    keep: 'Das Buch bleibt offen. Wenn es dunkel wird, laufen fünf Hunde hinter mir her, nicht vor mir weg.',
  },
  coda: {
    museum: 'Ich bestehe darauf. — Q. L.',
    keep: 'Einer muss sie ja füttern. — Jost',
  },
};
