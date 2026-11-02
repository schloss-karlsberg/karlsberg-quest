/**
 * The ghostly people of the story (bible 03-figuren): how each one looks as a silhouette of smoke
 * and light, how warm or eerie the figure feels, and the German labels of their topics.
 * All of them are fiction (speakers pack: historical false); the label in the conversation says so.
 */

export type Mood = 'warm' | 'eerie' | 'neutral';

export interface NpcLook {
  id: string;
  /** Fallback display name (the speakers pack wins). */
  name: string;
  mood: Mood;
  /** Body height (m) and build (shoulder width factor). */
  height: number;
  build: number;
  hat: 'none' | 'tricorn' | 'cap' | 'bonnet';
  /** Long skirt / apron (Hanne), coat tails, short jacket (boys). */
  dress: 'skirt' | 'coat' | 'jacket';
  /** Holds something: ledger (Soll), basket (Hanne), stick (Jost). */
  prop: 'ledger' | 'basket' | 'stick' | 'none';
  /** sRGB tint of the light inside the smoke. */
  tint: number;
  /** Seed for the idle motion (no two figures breathe in step). */
  seed: number;
}

export const ROSTER: Record<string, NpcLook> = {
  hanne: { id: 'hanne', name: 'Hanne', mood: 'warm', height: 1.62, build: 0.92, hat: 'bonnet', dress: 'skirt', prop: 'basket', tint: 0xffc477, seed: 3 },
  soll: { id: 'soll', name: 'Kanzlist Gottlob Soll', mood: 'eerie', height: 1.7, build: 0.95, hat: 'tricorn', dress: 'coat', prop: 'ledger', tint: 0xa9c8de, seed: 7 },
  jost: { id: 'jost', name: 'Jost', mood: 'eerie', height: 1.42, build: 0.82, hat: 'cap', dress: 'jacket', prop: 'stick', tint: 0xb7d3c4, seed: 11 },
  peter: { id: 'peter', name: 'Peter', mood: 'eerie', height: 1.74, build: 1.0, hat: 'cap', dress: 'jacket', prop: 'none', tint: 0xc3b7dc, seed: 17 },
  matthes: { id: 'matthes', name: 'Matthes', mood: 'eerie', height: 1.78, build: 1.08, hat: 'none', dress: 'jacket', prop: 'none', tint: 0xb9c4cf, seed: 23 },
};

export function lookFor(id: string, mood?: Mood): NpcLook {
  const base = ROSTER[id] ?? { id, name: id, mood: 'neutral' as Mood, height: 1.7, build: 1, hat: 'none' as const, dress: 'coat' as const, prop: 'none' as const, tint: 0xd8d2c4, seed: 29 };
  return mood ? { ...base, mood } : base;
}

/** Era tint multiplied into the figure light (sepia past, cold Steinfraß, fire glow). */
export const ERA_TINT: Record<string, number> = {
  '1789': 0xffe2b8,
  '1793-07': 0xffb48a,
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
