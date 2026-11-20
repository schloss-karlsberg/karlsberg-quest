/**
 * The ghostly people of the story (bible 03-figuren): how each one looks as a silhouette of smoke
 * and light, how warm or eerie the figure feels, and the German labels of their topics.
 * Most of them are fiction (speakers pack: historical false); the label in the conversation says so.
 * Two are real people, the "historical twins" (`historical: true`, docs/ART-DIRECTION.md §21):
 * Johann Christian von Mannlich (1741–1822), court painter and Baudirektor of the Karlsberg, and
 * Duke Karl II. August of Pfalz-Zweibrücken (1746–1795), who built it. For now they wear the
 * generic official's look; their own appearance is being rebuilt as authored models.
 */

export type Mood = 'warm' | 'eerie' | 'neutral';

/**
 * Period costume, built procedurally in `figure.ts` (fiction; shapes after 18th-century dress):
 * - `maid`     bodice, fichu over the shoulders, full skirt with folds, linen apron, mob cap
 * - `official` justaucorps with flared, pleated skirts open at the front, long waistcoat with a
 *              button row, turned-back cuffs, jabot, breeches and stockings
 * - `livery`   hunting livery: shorter coat, cross-belt with the Parforcehorn, riding boots
 * - `carter`   short open jacket over a shirt, neckerchief, breeches
 * - `mason`    shirt with rolled sleeves, leather apron to the knee
 */
export type Outfit = 'maid' | 'official' | 'livery' | 'carter' | 'mason';

export interface NpcLook {
  id: string;
  /** Fallback display name (the speakers pack wins). */
  name: string;
  mood: Mood;
  /** Body height (m) and build (shoulder width factor). */
  height: number;
  build: number;
  outfit: Outfit;
  /** Headwear: tricorn, hunting cap with a peak, mob cap (Hanne), slouch hat, bare head. */
  hat: 'none' | 'tricorn' | 'huntcap' | 'mobcap' | 'slouch';
  /** Hair under / instead of the hat: powdered wig with side rolls and a queue, a plain queue, short hair. */
  hair: 'wig' | 'queue' | 'short' | 'none';
  /** Holds something: ledger (Soll), basket (Hanne), stick (Jost), horn (the Pikeur). */
  prop: 'ledger' | 'basket' | 'stick' | 'none';
  /** sRGB tint of the light inside the smoke. */
  tint: number;
  /** Seed for the idle motion (no two figures breathe in step). */
  seed: number;
  /** A real person (speakers pack `historical: true`); everyone else is fiction. */
  historical?: true;
}

export const ROSTER: Record<string, NpcLook> = {
  hanne: { id: 'hanne', name: 'Hanne', mood: 'warm', height: 1.62, build: 0.92, outfit: 'maid', hat: 'mobcap', hair: 'none', prop: 'basket', tint: 0xffc477, seed: 3 },
  soll: { id: 'soll', name: 'Kanzlist Gottlob Soll', mood: 'eerie', height: 1.7, build: 0.95, outfit: 'official', hat: 'tricorn', hair: 'wig', prop: 'ledger', tint: 0xa9c8de, seed: 7 },
  jost: { id: 'jost', name: 'Jost', mood: 'eerie', height: 1.5, build: 0.84, outfit: 'livery', hat: 'huntcap', hair: 'queue', prop: 'stick', tint: 0xb7d3c4, seed: 11 },
  pikeur: { id: 'pikeur', name: 'Der Pikeur', mood: 'eerie', height: 1.76, build: 1.02, outfit: 'livery', hat: 'tricorn', hair: 'queue', prop: 'none', tint: 0xc9d6e0, seed: 13 },
  peter: { id: 'peter', name: 'Peter', mood: 'eerie', height: 1.68, build: 0.94, outfit: 'carter', hat: 'slouch', hair: 'short', prop: 'none', tint: 0xc3b7dc, seed: 17 },
  matthes: { id: 'matthes', name: 'Matthes', mood: 'eerie', height: 1.78, build: 1.08, outfit: 'mason', hat: 'none', hair: 'short', prop: 'none', tint: 0xb9c4cf, seed: 23 },
  // Side-quest givers (fiction): a Karlslust gardener, a palace servant, a villager from the road.
  gaertner: { id: 'gaertner', name: 'Der Gärtner', mood: 'warm', height: 1.66, build: 0.98, outfit: 'carter', hat: 'slouch', hair: 'queue', prop: 'basket', tint: 0xc8d9a8, seed: 31 },
  diener: { id: 'diener', name: 'Ein Diener', mood: 'neutral', height: 1.72, build: 0.9, outfit: 'livery', hat: 'none', hair: 'wig', prop: 'none', tint: 0xd9cdb4, seed: 37 },
  mann: { id: 'mann', name: 'Ein Mann aus dem Dorf', mood: 'neutral', height: 1.74, build: 1.0, outfit: 'carter', hat: 'slouch', hair: 'short', prop: 'stick', tint: 0xc4c0b2, seed: 41 },
  // The historical twins (real people, ART-DIRECTION §21): heights and build from the portraits,
  // for now the generic official in a powdered wig, bareheaded (authored models pending).
  mannlich: { id: 'mannlich', name: 'Johann Christian von Mannlich', mood: 'warm', height: 1.76, build: 0.88, outfit: 'official', hat: 'none', hair: 'wig', prop: 'none', tint: 0xffd6a0, seed: 43, historical: true },
  herzog: { id: 'herzog', name: 'Herzog Karl II. August', mood: 'neutral', height: 1.8, build: 1.14, outfit: 'official', hat: 'none', hair: 'wig', prop: 'none', tint: 0xe6d6b4, seed: 47, historical: true },
};

/** Other ids for roster figures (the reference folders name the Duke `karl-ii-august`). */
export const ALIASES: Record<string, string> = {
  'karl-ii-august': 'herzog',
};

/** The roster id for an id or alias (unknown ids pass through). */
export function rosterId(id: string): string {
  return ALIASES[id] ?? id;
}

/** The historical twins' roster ids. */
export const TWINS = ['mannlich', 'herzog'] as const;
export type TwinId = (typeof TWINS)[number];

/** Is this id (or alias) one of the historical twins? */
export function isTwin(id: string): boolean {
  return (TWINS as readonly string[]).includes(rosterId(id));
}

export function lookFor(id: string, mood?: Mood): NpcLook {
  const base = ROSTER[rosterId(id)] ?? { id, name: id, mood: 'neutral' as Mood, height: 1.7, build: 1, outfit: 'official' as const, hat: 'tricorn' as const, hair: 'queue' as const, prop: 'none' as const, tint: 0xd8d2c4, seed: 29 };
  return mood ? { ...base, mood } : base;
}

/** Era tint multiplied into the figure light (sepia past, cold Steinfraß, fire glow). */
export const ERA_TINT: Record<string, number> = {
  '1789': 0xffe2b8,
  '1793-02': 0xc8d6ff,
  '1793-07': 0xffb48a,
  '1796': 0xd6dce6,
  '1815': 0xd6dce6,
  today: 0xe8eef2,
};

/** German topic labels (the player's question in the conversation menu). */
export const TOPIC_LABELS: Record<string, string> = {
  greet: 'Grüßen',
  bye: 'Auf Wiedersehen',
  matthes: 'Nach Matthes fragen',
  warum: 'Warum wird nicht bezahlt?',
  minister: 'Nach dem Minister fragen',
  graues_buch: 'Was steht im grauen Buch?',
  zahl: 'Was bedeutet die mittlere Zahl?',
  warten: 'Worauf wartest du?',
  berg: 'Nach dem Berg fragen',
  meute: 'Nach der Meute fragen',
  futter: 'Was fressen die Hunde?',
  hunger: 'Und wenn sie hungern?',
  verstecken: 'Wie versteckt man sich?',
  namen: 'Wie heißen die Hunde?',
  stellen: 'Was tun sie, wenn sie einen finden?',
  bauer: 'Nach dem Bauern fragen',
  warnen: 'Wer hat gewarnt?',
  rohrbach: 'Nach Rohrbach fragen',
  peter: 'Nach Peter fragen',
  galerie: 'Nach der Galerie fragen',
  fuehrer: 'Wer hat sie geführt?',
  pluenderung: 'Was ist hier geplündert worden?',
  siegel: 'Nach dem Siegel fragen',
  buch: 'Nach dem Buch fragen',
  pluenderer: 'Wer waren die Plünderer?',
  pacht: 'Nach der Pacht fragen',
  geld: 'Wohin ist das Geld gegangen?',
  raub: 'War das Raub?',
  schuld: 'Wer hat Schuld?',
  hanne: 'Nach Hanne fragen',
};

export function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? `Nach ${topic.replace(/_/g, ' ')} fragen`;
}
