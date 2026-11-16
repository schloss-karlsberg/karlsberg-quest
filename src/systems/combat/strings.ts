/** German strings of the combat system (captions for every telegraph, info lines, settings). */
import { addStrings } from '../../i18n';

/** Telegraph caption per `<kind>.<attack>` (pose + glow + sound + caption, docs §4.4). */
export const TELL: Record<string, string> = {
  'nebelling.lunge': 'Nebelling duckt sich – Ausfall!',
  'irrlicht.funke': 'Irrlicht sammelt Funken',
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

addStrings('de', {
  'combat.immune': 'Der Stab geht hindurch – erst das Bannlicht ({key}).',
  'combat.tut.dodge': 'Er duckt sich, gleich springt er. Leertaste – zur Seite!',
  'combat.tut.dodge.hint': 'Er holt aus – [Leertaste]: zur Seite ausweichen!',
  'combat.safe': 'Hier wird nicht gekämpft.',
  'combat.lowered': 'Du hebst den Stab nicht.',
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
  'settings.damageNumbers': 'Schadenszahlen',
  'settings.damageNumbers.help': 'Kleine handgeschriebene Zahlen zeigen, wie hart ein Treffer war.',
});
