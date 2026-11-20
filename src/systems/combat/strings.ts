/** German strings of the combat system (captions for every telegraph, info lines, settings). */
import { addStrings } from '../../i18n';

/** Telegraph caption per `<kind>.<attack>` (pose + glow + sound + caption, docs §4.4). */
export const TELL: Record<string, string> = {
  'nebelling.lunge': 'Nebelling duckt sich – Ausfall!',
  'irrlicht.funke': 'Irrlicht sammelt Funken – ausweichen!',
  'streuner.sprung': 'Streuner duckt sich – Sprung!',
  'streuner.biss': 'Streuner schnappt',
  'mahnbrief.schnitt': 'Mahnbrief zuckt – Schnitt!',
  'raffschatten.schlag': 'Raffschatten holt aus',
  'glutling.zerplatzen': 'Glutling bläht sich auf – weg da!',
  'grusling.kratzen': 'Grusling kratzt',
  'steinfresser.hieb': 'Steinfresser hebt die Faust',
  'steinfresser.stampfen': 'Steinfresser stampft – raus aus dem Kreis!',
  'schuldbuch.seitenschlag': 'Das Schuldbuch schlägt die Seiten zu – raus aus dem Kreis!',
  'schuldbuch.mahnung': 'Das Schuldbuch mahnt: Mahnbriefe!',
  'schuldbuch.siegel': 'Das Siegel glüht – Siegelfeuer!',
  'pikeur.anreiten': 'Das Pferd steigt, das Horn – er reitet an!',
  'pikeur.peitsche': 'Der Pikeur hebt die Peitsche',
  'pikeur.anblasen': 'Der Pikeur bläst an: Streuner!',
  'strohmann.garbe': 'Der Strohmann holt mit den Garben aus',
  'strohmann.funkenregen': 'Funkenregen – raus aus den Kreisen!',
  'strohmann.glut': 'Der Strohmann glimmt: Glutlinge!',
  'steinbrecher.quaderwurf': 'Der Steinbrecher hebt einen Quader – Wurf!',
  'steinbrecher.beben': 'Der Steinbrecher stampft – Beben!',
  'steinbrecher.gruslinge': 'Grus rieselt aus den Fugen: Gruslinge!',
};

/** Telegraphs of the caster and the elites' own moves (fun pass). */
Object.assign(TELL, {
  'nebelweber.frostkugel': 'Nebelweber spinnt Frost – weg von der Stelle!',
  'nebelweber.eisnadel': 'Nebelweber zielt – Eisnadel!',
  'nebelweber.frostkranz': 'Die Nebelspinnerin zieht den Frost zusammen – raus!',
  'nebelling.frosthauch': 'Die Nebelmutter atmet Frost – raus aus dem Kreis!',
  'irrlicht.funkenfaecher': 'Das Sumpflicht fächert Funken auf',
  'streuner.hetzjagd': 'Der Leithund senkt den Kopf – er hetzt!',
  'mahnbrief.siegelwurf': 'Der Pfändungsbefehl schleudert sein Siegel',
  'raffschatten.goldwirbel': 'Der Goldraffer wirbelt – raus aus dem Kreis!',
  'glutling.funkenspei': 'Der Glutkern speit Funken',
  'grusling.grusstoss': 'Der Grusvater stößt Grus aus – raus!',
  'steinfresser.brocken': 'Der Mauerbrecher reißt einen Brocken los – Wurf!',
});

/** Combat variety pass: the shield, the mirror, the caller, the veil. */
Object.assign(TELL, {
  'foliant.zuklappen': 'Der Foliant klappt den Deckel auf – gleich schlägt er zu!',
  'foliant.rammen': 'Der Foliant senkt den Deckel – er rammt!',
  'scherbling.scherbenfaecher': 'Der Scherbling fächert Splitter auf',
  'scherbling.splitter': 'Der Scherbling zittert – Splitter, raus!',
  'rufer.ruf': 'Der Rufer ruft in den Nebel – unterbrich ihn!',
  'rufer.stoss': 'Der Rufer stößt zu',
  'nebelweber.schleier': 'Die Nebelweberin spinnt einen Schleier',
});

/** The boss's title card when it reveals itself (name, epithet). */
export const BOSS_TITLE: Record<string, [string, string]> = {
  schuldbuch: ['Das Schuldbuch', 'Was niemand bezahlt hat'],
  pikeur: ['Der Pikeur', 'Herr der Meute'],
  strohmann: ['Der Strohmann', 'Das Feuer, das noch kommt'],
  steinbrecher: ['Der Steinbrecher', 'Was von den Mauern blieb'],
};

/** Boss bar hint (the mechanic to learn) by kind. */
export const BOSS_HINT: Record<string, string> = {
  schuldbuch: 'Das Bannlicht bricht das Siegel.',
  pikeur: 'Er kann nicht über fließendes Wasser.',
  strohmann: 'Weich am Rücken, wo die Garben gebunden sind.',
  steinbrecher: 'Triff die Fugen – von der Seite, von hinten.',
};

/**
 * What a boss's armour or seal says after `BOSS_BOUNCE_AFTER` bounces in a row (balance round
 * 2026-11-20, docs/BALANCE.md): per boss and true to its rule — the Schuldbuch's seal holds from
 * every side (no "front"), the Strohmann and the Steinbrecher are hard in front only. The Pikeur
 * has no armour and never bounces.
 */
export const BOSS_BOUNCE: Record<string, string> = {
  schuldbuch: 'Das Siegel hält jeden Schlag ab – Bannlicht!',
  strohmann: 'Vorne ist das Stroh zu dicht. Geh ihm in den Rücken, wo die Garben gebunden sind.',
  steinbrecher: 'Vorne prallt alles ab. Triff die Fugen – von der Seite, von hinten.',
};

/** Bounces in a row before the boss's way in is said (was 4). */
export const BOSS_BOUNCE_AFTER = 2;

/**
 * A blow during a boss's reveal or phase roar (`bossGuard`): it cannot be hurt for that moment.
 * Not the Bannlicht's line — the flare has nothing to do with it.
 */
export const BOSS_GUARD: Record<string, string> = {
  schuldbuch: 'Die Seiten wirbeln auf – warte, bis es sich gesammelt hat.',
  pikeur: 'Der Pikeur bäumt sich auf – warte.',
  strohmann: 'Der Strohmann richtet sich auf – warte.',
  steinbrecher: 'Der Steinbrecher türmt sich auf – warte.',
};

addStrings('de', {
  'combat.bossGuard': 'Er sammelt sich – warte.',
  'combat.immune': 'Der Stab geht hindurch – erst das Bannlicht ({key}).',
  'combat.bounce': 'Abgeprallt',
  'combat.bossWayFirst': 'Der Weg hinein: {hint}',
  'combat.tut.dodge': 'Er duckt sich, gleich springt er. Leertaste – zur Seite!',
  'combat.tut.dodge.hint': 'Er holt aus – [Leertaste]: zur Seite ausweichen!',
  'combat.safe': 'Hier wird nicht gekämpft.',
  'combat.lowered': 'Du hebst den Stab nicht.',
  'combat.immuneHint': 'Ungreifbar – erst Bannlicht (RMB / {key}), dann zuschlagen.',
  'combat.immuneRefill': 'Die Laterne gibt noch einen Funken her.',
  'combat.reform': 'Formt sich neu!',
  'combat.reform.tag': 'formt sich neu',
  'combat.reform.first.nebelling': 'Nebel formt sich einmal neu – der dritte Hieb, ein Wuchthieb oder das Bannlicht lösen ihn ganz auf.',
  'combat.reform.first.mahnbrief': 'Papier faltet sich einmal neu – der dritte Hieb, ein Wuchthieb oder das Bannlicht zerreißen es ganz.',
  'combat.stumble': 'Kein Atem – du stolperst nur zur Seite.',
  'combat.resist': '{name} schüttelt das Licht ab – noch nicht!',
  'combat.noBann': 'Kein Bannlicht – es lädt nach.',
  'combat.tired': 'Kein Atem.',
  'combat.perfect': 'Im letzten Moment!',
  'combat.seal': 'Das Siegel ist aufgebrochen!',
  'combat.seal.sub': 'Das Siegel ist offen – jetzt!',
  'combat.balk': 'Der Pikeur scheut vor dem Wasser!',
  'combat.leave': 'Der Pikeur bläst „verloren“ und reitet in den Nebel.',
  'combat.block': 'Ein Quader fliegt nach Westen – nach Homburg.',
  'combat.back': 'Am Rücken ist er weich.',
  'combat.phase': '{name} – Phase {n}',
  'combat.hounds': 'Die Meute schlägt man nicht. Man entkommt ihr.',
  'combat.animals': 'Der Stab geht an den Tieren vorbei. Sie sind nicht der Feind.',
  'combat.burst': 'Kalkstaub!',
  'combat.elite': '{name} führt sie an!',
  'combat.enrage': '{name} rast!',
  'combat.finishable': '{name} wankt – jetzt ein Wuchthieb!',
  'combat.finisher': 'Gnadenstoß!',
  'combat.bossDown': '{name} – bezwungen.',
  // combat variety pass
  'combat.blocked': 'Der Deckel hält – Wuchthieb (halten) oder von der Seite!',
  'combat.guardBreak': 'Deckung gebrochen!',
  'combat.flank': 'Von der Seite!',
  'combat.ward': 'Ein Schleier liegt um sie – das Bannlicht ({key}) zerreißt ihn.',
  'combat.wardBreak': 'Der Schleier reißt.',
  'combat.warded': 'Der Schleier dämpft den Schlag.',
  'combat.reflect': 'Der Scherbling wirft das Licht zurück! Erst ein Wuchthieb, der ihn sprengt.',
  'combat.crack': 'Der Spiegel springt.',
  'combat.dazzled': 'Geblendet – das Licht will nicht.',
  'combat.call': 'Der Rufer holt {n} aus dem Nebel!',
  'combat.callBroken': 'Ruf unterbrochen!',
  'combat.wave': 'Da kommen mehr – von hinten!',
  'combat.wave.side': 'Da kommen mehr – von der Seite!',
  'combat.hazard.fire': 'Glut fällt – raus aus dem Kreis!',
  'combat.hazard.stone': 'Steine lösen sich – raus aus dem Kreis!',
  'combat.skill.cooldown': '{name} – noch {s} s.',
  'combat.skill.tired': 'Zu wenig Atem für {name}.',
  'combat.skill.unlock': 'Neue Fähigkeit: {name} ({key}). {desc}',
  'combat.skill.ausfall': 'Ausfall',
  'combat.skill.erdstoss': 'Erdstoß',
  'combat.skill.wirbel': 'Wirbel',
  'combat.skill.ausfall.desc': 'Ein Sprung nach vorn mit dem Stab voran – durch die Reihe, an den Rufer, um den Deckel herum.',
  'combat.skill.erdstoss.desc': 'Den Stab in den Boden: ein Stoßring wirft alles um dich zurück und bricht jede Deckung.',
  'combat.skill.wirbel.desc': 'Drei Schläge rundum, du bleibst in Bewegung; Geschosse prallen ab.',
  'settings.damageNumbers': 'Schadenszahlen',
  'settings.damageNumbers.help': 'Kleine handgeschriebene Zahlen zeigen, wie hart ein Treffer war.',
});
