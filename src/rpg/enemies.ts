/**
 * The enemy roster (docs/ACTION-RPG.md §5). Pure data — the combat track owns the numbers and the
 * behaviour behind them; the ids are a CONTRACT (content refers to them; never rename, only add).
 *
 * Everything here is FICTION and spectral: nothing bleeds, everything dissolves (mist, sparks,
 * smoke, ash, paper, rising grit). No enemy stands for a real person or a real victim. The
 * menagerie animals are not enemies (they are calmed, never hurt) and the hunt's pack is a threat,
 * not a target (the Bannlicht scatters it).
 */
import type { EnemyDef } from './types';

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'nebelling',
    name_de: 'Nebelling',
    plural_de: 'Nebelinge',
    family: 'mist',
    eras: ['today', '1789', '1793-02', '1796'],
    // fun pass 2026-11-16: two taps undid one before it ever lunged; now it takes a combo
    hp: 30,
    speed: 2.9,
    bannStun: 1.8,
    attacks: [{ id: 'lunge', telegraph: 0.75, damage: 9, range: 2.6, kind: 'lunge', cooldown: 1.9 }],
    xp: 8,
    loot: 'loot.klein',
    dissolve: 'mist',
    note_de: 'Kniehoher Nebelballen mit zwei Glutaugen. Kriecht aus Senken, wenn das Land sich erinnert. Ungefährlich, solange man ihn kommen sieht. Leert ihn ein einfacher Hieb, formt er sich einmal neu; der dritte Hieb einer Kette, ein Wuchthieb oder das Bannlicht lösen ihn ganz auf. (Fiktion)',
  },
  {
    id: 'irrlicht',
    name_de: 'Irrlicht',
    plural_de: 'Irrlichter',
    family: 'light',
    eras: ['today', '1789', '1793-02'],
    hp: 16,
    speed: 3.4,
    needsBann: true,
    bannStun: 4,
    attacks: [{ id: 'funke', telegraph: 0.8, damage: 9, range: 14, kind: 'ranged', cooldown: 3 }],
    xp: 12,
    loot: 'loot.licht',
    dissolve: 'sparks',
    note_de: 'Ein kaltes Licht über Wasser und Senken. Stöcke gehen hindurch, bis das Bannlicht es zu Boden drückt. (Fiktion)',
  },
  {
    id: 'streuner',
    name_de: 'Streuner',
    plural_de: 'Streuner',
    family: 'hound',
    eras: ['1789', '1793-02', '1793-07', '1796', 'today'],
    hp: 36,
    speed: 6.4,
    bannStun: 2,
    attacks: [
      { id: 'sprung', telegraph: 0.6, damage: 12, range: 5, kind: 'lunge', cooldown: 2.6 },
      { id: 'biss', telegraph: 0.5, damage: 7, range: 1.8, kind: 'melee', cooldown: 1.4 },
    ],
    xp: 15,
    loot: 'loot.klein',
    dissolve: 'smoke',
    note_de: 'Ein Hund der Meute, der den Anschluss verloren hat. Rauch mit Augen. Wer ihn bezwingt, sieht ihn sich hinlegen; dann gehen die Augen aus. (Fiktion)',
  },
  {
    id: 'mahnbrief',
    name_de: 'Mahnbrief',
    plural_de: 'Mahnbriefe',
    family: 'paper',
    eras: ['1789', '1793-02'],
    hp: 14,
    speed: 4.2,
    bannStun: 2,
    attacks: [{ id: 'schnitt', telegraph: 0.55, damage: 6, range: 2, kind: 'lunge', cooldown: 1.8 }],
    xp: 6,
    loot: 'loot.klein',
    dissolve: 'paper',
    note_de: 'Ein herzogliches Schreiben, das niemand bezahlt hat und das deshalb nie zur Ruhe kommt. Flattert, schneidet, mahnt. Zerreißt ihn ein einfacher Hieb, faltet er sich einmal neu; der dritte Hieb einer Kette, ein Wuchthieb oder das Bannlicht machen ihn endgültig zu Fetzen. (Fiktion)',
  },
  {
    id: 'raffschatten',
    name_de: 'Raffschatten',
    plural_de: 'Raffschatten',
    family: 'shade',
    eras: ['1793-07'],
    // playtest round 4: 80 HP at tier 3 fell to one Messstab-III swing
    hp: 72,
    speed: 3.6,
    bannStun: 2.5,
    attacks: [{ id: 'schlag', telegraph: 0.8, damage: 11, range: 2.4, kind: 'melee', cooldown: 2 }],
    xp: 18,
    loot: 'loot.raff',
    dissolve: 'ash',
    note_de: 'Kein Mensch: ein Schatten aus Goldstaub und Rauch, der nur noch rafft. Laub: „Das ist, was übrig bleibt, wenn man nur noch Gold sieht.“ (Fiktion)',
  },
  {
    id: 'glutling',
    name_de: 'Glutling',
    plural_de: 'Glutlinge',
    family: 'ember',
    eras: ['1793-07'],
    hp: 22,
    speed: 4.8,
    bannStun: 1.5,
    attacks: [{ id: 'zerplatzen', telegraph: 0.6, damage: 11, range: 2.6, kind: 'area', cooldown: 99 }],
    xp: 10,
    loot: 'loot.klein',
    dissolve: 'sparks',
    note_de: 'Ein springender Funke, der sich zu viel vorgenommen hat. Bläht sich auf, bevor er platzt. (Fiktion)',
  },
  {
    id: 'grusling',
    name_de: 'Grusling',
    plural_de: 'Gruslinge',
    family: 'stone',
    eras: ['1796'],
    hp: 8,
    speed: 3.8,
    bannStun: 2,
    // range 1.9: it scratches from where it can be seen (first person: closer is under the view)
    attacks: [{ id: 'kratzen', telegraph: 0.55, damage: 4, range: 1.9, kind: 'melee', cooldown: 1.2 }],
    xp: 4,
    dissolve: 'grit-rising',
    note_de: 'Ein Häufchen Mörtelgrus, das läuft. Kommt in Schwärmen aus ausgebrochenen Mauergräben. (Fiktion)',
  },
  {
    id: 'steinfresser',
    name_de: 'Steinfresser',
    plural_de: 'Steinfresser',
    family: 'stone',
    eras: ['1796'],
    hp: 85,
    speed: 2.2,
    armor: 0.35,
    armorFrontal: true,
    bannStun: 1.5,
    attacks: [
      { id: 'hieb', telegraph: 0.9, damage: 16, range: 2.6, kind: 'melee', cooldown: 2.4 },
      { id: 'stampfen', telegraph: 1.1, damage: 15, range: 4.5, kind: 'area', cooldown: 6 },
    ],
    xp: 30,
    loot: 'loot.stein',
    dissolve: 'grit-rising',
    note_de: 'Der Steinfraß mit Schultern. Nagt an Mauern; vorne hart wie Sandstein, hinten nur Mörtel. Ein Wuchthieb bricht die Kruste. (Fiktion)',
  },
  {
    // the caster (fun pass 2026-11-16): it never closes in. It keeps nine to twelve metres, lobs
    // frost that lands where you stood (a ring on the ground) and flicks needles of ice; come close
    // and it slips back into the fog. The Bannlicht pulls it down. Content does not place it: it
    // walks with the bigger packs as an escort (combat/packs.ts).
    id: 'nebelweber',
    name_de: 'Nebelweber',
    plural_de: 'Nebelweber',
    family: 'mist',
    eras: ['1789', '1793-02', '1793-07', '1796'],
    hp: 30,
    speed: 3.0,
    bannStun: 3,
    attacks: [
      { id: 'frostkugel', telegraph: 0.95, damage: 13, range: 16, kind: 'ranged', cooldown: 3.4 },
      { id: 'eisnadel', telegraph: 0.6, damage: 8, range: 14, kind: 'ranged', cooldown: 2.4 },
      // combat variety pass: a veil of mist round up to three of its pack (staff blows glance off)
      { id: 'schleier', telegraph: 1.1, damage: 0, range: 12, kind: 'summon', cooldown: 9 },
    ],
    xp: 14,
    loot: 'loot.licht',
    dissolve: 'mist',
    note_de: 'Ein hohes, dünnes Nebelgespinst mit einem kalten Licht im Innern. Hält Abstand, wirft Frost dorthin, wo man eben stand, und weicht zurück, wenn man ihm nahe kommt. Webt den anderen einen Schleier, an dem der Stab abgleitet – das Bannlicht zerreißt ihn. (Fiktion)',
  },
  // ---- combat variety pass (2026-11-17): enemies that ask for a tool, not more swings --------
  {
    // the shield: an upright folio as tall as a man that holds its covers in front like a door.
    // Hit it from the front and the staff bounces off; a Wuchthieb (or the Erdstoß) knocks the
    // covers open, or you get round it (a roll, the Ausfall) and strike the spine. It opens itself
    // only to strike — the recovery is the moment. Walks with the court's papers (1789, 1793-02).
    id: 'foliant',
    name_de: 'Foliant',
    plural_de: 'Folianten',
    family: 'paper',
    eras: ['1789', '1793-02'],
    hp: 70,
    speed: 2.1,
    guard: 'front',
    bannStun: 1.6,
    attacks: [
      { id: 'zuklappen', telegraph: 0.85, damage: 14, range: 2.6, kind: 'melee', cooldown: 2.6 },
      { id: 'rammen', telegraph: 0.95, damage: 11, range: 5, kind: 'lunge', cooldown: 5.5 },
    ],
    xp: 22,
    loot: 'loot.klein',
    dissolve: 'paper',
    note_de: 'Ein Folioband, mannshoch, der seine Deckel wie ein Tor vor sich hält. Von vorn prallt der Stab ab. Ein Wuchthieb schlägt die Deckel auf; wer um ihn herumkommt, trifft den Rücken. (Fiktion)',
  },
  {
    // the mirror: shards of the palace's looking glasses that hang together in the air. The
    // Bannlicht comes back off them into your eyes; the glass gives under the staff; a heavy blow
    // cracks it — then it is only glass. With the fire and the plunder (1793-07, 1796).
    id: 'scherbling',
    name_de: 'Scherbling',
    plural_de: 'Scherblinge',
    family: 'light',
    eras: ['1793-07', '1796'],
    hp: 36,
    speed: 3.1,
    reflectsBann: true,
    bannStun: 2,
    attacks: [
      { id: 'scherbenfaecher', telegraph: 0.9, damage: 7, range: 13, kind: 'ranged', cooldown: 3.2 },
      { id: 'splitter', telegraph: 0.8, damage: 10, range: 3.2, kind: 'area', cooldown: 4.5 },
    ],
    xp: 18,
    loot: 'loot.licht',
    dissolve: 'sparks',
    note_de: 'Spiegelscherben aus den Sälen, die in der Luft zusammenhalten. Wirft das Bannlicht zurück, dem Werfer in die Augen. Ein Wuchthieb lässt das Glas springen; dann ist es nur noch Glas. (Fiktion)',
  },
  {
    // the summoner: a stooped shade with a horn of smoke that stands back and calls more of its
    // pack out of the fog until it is undone. Any blow (or the Bannlicht) during the call breaks it.
    id: 'rufer',
    name_de: 'Rufer',
    plural_de: 'Rufer',
    family: 'shade',
    eras: ['1793-02', '1796'],
    hp: 42,
    speed: 3.0,
    bannStun: 2.5,
    attacks: [
      { id: 'ruf', telegraph: 1.5, damage: 0, range: 18, kind: 'summon', cooldown: 8 },
      { id: 'stoss', telegraph: 0.6, damage: 8, range: 2.2, kind: 'melee', cooldown: 2.2 },
    ],
    xp: 20,
    loot: 'loot.klein',
    dissolve: 'smoke',
    note_de: 'Ein gebeugter Schatten mit einem Horn aus Rauch. Bleibt hinten und ruft, und aus dem Nebel kommen mehr. Ein Schlag in den Ruf hinein bricht ihn ab. Zuerst den Rufer. (Fiktion)',
  },
  // ---- bosses (one per chapter 1–4; the finale W8 is deliberately NOT a fight) ----------------
  {
    id: 'schuldbuch',
    name_de: 'Das Schuldbuch',
    plural_de: 'Schuldbücher',
    family: 'paper',
    eras: ['1789'],
    hp: 420,
    speed: 2.4,
    bannStun: 4,
    attacks: [
      { id: 'seitenschlag', telegraph: 1.0, damage: 16, range: 6, kind: 'area', cooldown: 4 },
      { id: 'mahnung', telegraph: 1.2, damage: 0, range: 12, kind: 'summon', cooldown: 10 },
      { id: 'siegel', telegraph: 0.9, damage: 14, range: 16, kind: 'ranged', cooldown: 3.5 },
    ],
    xp: 200,
    loot: 'loot.boss',
    dissolve: 'paper',
    boss: true,
    phases: [0.66, 0.33],
    note_de: 'Ein Hauptbuch, so dick wie eine Tür, mit dem herzoglichen Siegel als Herz. Zahlt niemanden. Das Bannlicht bricht das Siegel auf. (Fiktion)',
  },
  {
    id: 'pikeur',
    name_de: 'Der Pikeur',
    plural_de: 'Pikeure',
    family: 'hound',
    eras: ['1793-02', '1789', '1796', 'today'],
    hp: 520,
    speed: 7,
    bannStun: 2,
    attacks: [
      { id: 'anreiten', telegraph: 1.0, damage: 20, range: 22, kind: 'charge', cooldown: 6 },
      { id: 'peitsche', telegraph: 0.7, damage: 12, range: 4, kind: 'melee', cooldown: 2.2 },
      { id: 'anblasen', telegraph: 1.2, damage: 0, range: 30, kind: 'summon', cooldown: 14 },
    ],
    xp: 300,
    loot: 'loot.boss',
    dissolve: 'fade',
    boss: true,
    phases: [0.6, 0.3],
    note_de: 'Ein Reiter ohne Gesicht, das Horn um die Brust. Er kann nicht über fließendes Wasser. Man besiegt ihn nicht: Man hält stand, bis er „verloren“ bläst und in den Nebel reitet. (Fiktion)',
  },
  {
    id: 'strohmann',
    name_de: 'Der Strohmann',
    plural_de: 'Strohmänner',
    family: 'ember',
    eras: ['1793-07'],
    hp: 560,
    speed: 2.8,
    armor: 0.3,
    bannStun: 1,
    attacks: [
      { id: 'garbe', telegraph: 1.0, damage: 18, range: 5, kind: 'melee', cooldown: 3 },
      { id: 'funkenregen', telegraph: 1.2, damage: 12, range: 7, kind: 'area', cooldown: 7 },
      { id: 'glut', telegraph: 1.3, damage: 0, range: 10, kind: 'summon', cooldown: 12 },
    ],
    xp: 350,
    loot: 'loot.boss',
    dissolve: 'ash',
    boss: true,
    phases: [0.6, 0.3],
    note_de: 'Aus den Strohkarren im Ehrenhof aufgestanden, bevor jemand die Fackel warf. Das Feuer, das noch kommt, mit Armen. Am Rücken, wo die Garben gebunden sind, ist er weich. (Fiktion)',
  },
  {
    id: 'steinbrecher',
    name_de: 'Der Steinbrecher',
    plural_de: 'Steinbrecher',
    family: 'stone',
    eras: ['1796'],
    hp: 950,
    speed: 2,
    armor: 0.45,
    armorFrontal: true,
    bannStun: 1,
    attacks: [
      { id: 'quaderwurf', telegraph: 1.1, damage: 16, range: 18, kind: 'ranged', cooldown: 4 },
      { id: 'beben', telegraph: 1.3, damage: 20, range: 6, kind: 'area', cooldown: 6 },
      { id: 'gruslinge', telegraph: 1.0, damage: 0, range: 10, kind: 'summon', cooldown: 11 },
    ],
    xp: 400,
    loot: 'loot.boss',
    dissolve: 'grit-rising',
    boss: true,
    phases: [0.66, 0.33],
    note_de: 'Ein Riese aus ausgebrochenen Quadern im Ehrenhof von 1796. Jeder Treffer an den Fugen löst Steine, die nach Westen davonfliegen, nach Homburg. (Fiktion)',
  },
];

/**
 * Elite variants (fun pass 2026-11-16): in a pack of three or more, one member is an elite — a
 * name, a glow, more Lebenskraft, a harder hand and one extra move of its own. Below a quarter of
 * its strength it can be finished with a Wuchthieb (the "Gnadenstoß"). Pure data; the simulation
 * builds the elite from its kind (combat/packs.ts).
 */
export interface EliteDef {
  kind: string;
  name_de: string;
  hpMul: number;
  dmgMul: number;
  /** Visual size. */
  size: number;
  /** Aura colour (glows, eyes). */
  aura: [number, number, number];
  extra: import('./types').EnemyAttackDef;
}

export const ELITES: Record<string, EliteDef> = {
  nebelling: { kind: 'nebelling', name_de: 'Nebelmutter', hpMul: 2.6, dmgMul: 1.3, size: 1.45, aura: [0.7, 0.9, 1], extra: { id: 'frosthauch', telegraph: 0.9, damage: 13, range: 3.4, kind: 'area', cooldown: 5 } },
  irrlicht: { kind: 'irrlicht', name_de: 'Sumpflicht', hpMul: 2.2, dmgMul: 1.2, size: 1.5, aura: [0.5, 1, 0.8], extra: { id: 'funkenfaecher', telegraph: 1.0, damage: 9, range: 15, kind: 'ranged', cooldown: 4 } },
  streuner: { kind: 'streuner', name_de: 'Leithund', hpMul: 2.1, dmgMul: 1.3, size: 1.35, aura: [1, 0.3, 0.1], extra: { id: 'hetzjagd', telegraph: 0.9, damage: 16, range: 15, kind: 'charge', cooldown: 6 } },
  mahnbrief: { kind: 'mahnbrief', name_de: 'Pfändungsbefehl', hpMul: 3, dmgMul: 1.3, size: 1.7, aura: [1, 0.2, 0.08], extra: { id: 'siegelwurf', telegraph: 0.8, damage: 9, range: 12, kind: 'ranged', cooldown: 3.2 } },
  raffschatten: { kind: 'raffschatten', name_de: 'Goldraffer', hpMul: 2.3, dmgMul: 1.25, size: 1.3, aura: [1, 0.78, 0.25], extra: { id: 'goldwirbel', telegraph: 1.0, damage: 16, range: 3.6, kind: 'area', cooldown: 5 } },
  glutling: { kind: 'glutling', name_de: 'Glutkern', hpMul: 3, dmgMul: 1.2, size: 1.6, aura: [1, 0.85, 0.4], extra: { id: 'funkenspei', telegraph: 0.7, damage: 8, range: 12, kind: 'ranged', cooldown: 2.6 } },
  grusling: { kind: 'grusling', name_de: 'Grusvater', hpMul: 4, dmgMul: 1.4, size: 1.6, aura: [1, 0.6, 0.25], extra: { id: 'grusstoss', telegraph: 0.8, damage: 10, range: 2.8, kind: 'area', cooldown: 4 } },
  steinfresser: { kind: 'steinfresser', name_de: 'Mauerbrecher', hpMul: 1.9, dmgMul: 1.2, size: 1.25, aura: [1, 0.5, 0.12], extra: { id: 'brocken', telegraph: 1.0, damage: 15, range: 16, kind: 'ranged', cooldown: 5 } },
  nebelweber: { kind: 'nebelweber', name_de: 'Nebelspinnerin', hpMul: 2.2, dmgMul: 1.2, size: 1.3, aura: [0.6, 0.9, 1], extra: { id: 'frostkranz', telegraph: 1.0, damage: 12, range: 4, kind: 'area', cooldown: 6 } },
};

export const ENEMY_IDS: ReadonlySet<string> = new Set(ENEMIES.map((e) => e.id));

export function enemyDef(id: string): EnemyDef | undefined {
  return ENEMIES.find((e) => e.id === id);
}
