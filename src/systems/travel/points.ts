/**
 * Vermessungspunkte (survey markers): Laub's tripods across the land. Walk up to one and it is
 * "eingemessen" (a beam rises, rings run over the ground); after that the map (M) or the Journal's
 * "Karte" tab takes you there in a breath. Pure data and rules (no three.js, no DOM), unit-tested in
 * tests/travel.test.ts.
 *
 * Placement rules (checked in the tests): outside every palace footprint, inside the story's time
 * anchor where there is one (a traveller lands where Q works), ≥ 4 m from anchor centres and NPC
 * places, inside the terrain.
 */
import { lineFree } from '../../world/route';

export interface SurveyPoint {
  id: string;
  /** Name on the map and in the toasts. */
  name: string;
  x: number;
  z: number;
  /** One line under the name on the map (what is here). */
  note: string;
  /** Known from the start (the field station). */
  known?: boolean;
}

export const SURVEY_POINTS: readonly SurveyPoint[] = [
  { id: 'feldstation', name: 'Feldstation', x: 776, z: -902, note: 'Marlenes Tisch, die Bussole, der Heimweg', known: true },
  { id: 'ehrenhof', name: 'Ehrenhof', x: 1230, z: -1127, note: 'Der Hof vor dem Corps de logis. Hier geht es hinüber' },
  { id: 'galerie', name: 'Galerie, Ostende', x: 1300, z: -1192, note: 'Bauplatz, Hanne, der Garten hinter dem Schloss' },
  { id: 'orangerie', name: 'Orangerie', x: 1322, z: -906, note: 'Mannlichs Fenster, der Ladehof' },
  { id: 'zwinger', name: 'Zwinger', x: 1158, z: -1561, note: 'Die Hundeställe, Josts Platz' },
  { id: 'standpunkt', name: 'Standpunkt über dem Zwinger', x: 1394, z: -1469, note: 'Die Kuppe, von der man alles sieht' },
  { id: 'torhaus', name: 'Carlsluster Torhaus', x: 1690, z: -392, note: 'Der Parkzaun, das Tor, die Apfelallee' },
  { id: 'apfelallee', name: 'Apfelallee', x: 1550, z: -603, note: 'Halbe Höhe zwischen Torhaus und Orangerie' },
  { id: 'karlslust', name: 'Karlslust', x: 1831, z: 79, note: 'Die Terrasse, das Rund, die Menagerie' },
  { id: 'taleingang', name: 'Taleingang', x: 509, z: -893, note: 'Das Baumagazin, die Wachhäuser, der Steinbruch' },
  { id: 'westblick', name: 'Westblick', x: 214, z: -899, note: 'Der Waldrand. Im Westen die Hohenburg' },
];

export function pointById(id: string): SurveyPoint | undefined {
  return SURVEY_POINTS.find((p) => p.id === id);
}

/** Within this distance a tripod is eingemessen (m). */
export const ACTIVATE_RADIUS = 7;

/**
 * Points that count as known: walked up to (`activated`) or pre-surveyed (`known`, e.g. the field
 * station, or one Laub announced because the next goal lies beside it).
 */
export function knownPoints(activated: readonly string[], announced: readonly string[]): SurveyPoint[] {
  const set = new Set([...activated, ...announced]);
  return SURVEY_POINTS.filter((p) => p.known || set.has(p.id));
}

export function nearestPoint(x: number, z: number, among: readonly SurveyPoint[]): { point: SurveyPoint; d: number } | null {
  let best: { point: SurveyPoint; d: number } | null = null;
  for (const p of among) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { point: p, d };
  }
  return best;
}

/** Everything that decides whether a journey may start now. */
export interface TravelWorld {
  era: string;
  inCombat: boolean;
  /** hunt alert state ('calm' … 'chasing'). */
  hunt: string;
  /** A story threat (pack, fire, oblivion) or a story meter is running. */
  threat: boolean;
  /** The story locks journeys (`flags['travel.locked']`). */
  locked: boolean;
  /** The caught curtain, a shift, a conversation: anything that holds the player. */
  busy: boolean;
  /** Flying in spirit view. */
  flying: boolean;
}

export type TravelBlock = 'combat' | 'hunt' | 'threat' | 'locked' | 'busy' | null;

/**
 * Why a journey cannot start now (null: it can). In the present day the map is free; in the past it
 * works too, as long as nothing holds the player there (no fight, no pack, no fire, no story lock).
 */
export function travelBlock(w: TravelWorld): TravelBlock {
  if (w.busy) return 'busy';
  if (w.inCombat) return 'combat';
  if (w.hunt === 'chasing' || w.hunt === 'searching') return 'hunt';
  if (w.locked) return 'locked';
  if (w.era !== 'today' && w.threat) return 'threat';
  return null;
}

/**
 * Laub "announces" a point when the goal lies beside it and the player is far away: the point is
 * then known without the walk (so a chapter never starts with a 1.8 km march). Returns the point to
 * announce, or null.
 */
export function announceFor(goal: { x: number; z: number } | null, player: { x: number; z: number }, known: readonly string[]): SurveyPoint | null {
  if (!goal) return null;
  if (Math.hypot(goal.x - player.x, goal.z - player.z) < 600) return null;
  const near = nearestPoint(goal.x, goal.z, SURVEY_POINTS);
  if (!near || near.d > 140) return null;
  if (near.point.known || known.includes(near.point.id)) return null;
  return near.point;
}

/**
 * The Wegweiser's "straight line blocked" check (the compass "Weg" marker and the motes). In the
 * past it counts everything that stops the player (walls, wings, set dressing, water). In the
 * present day (`palace === 'hidden'`) only water counts: the forest's trunks and the ruins' stones
 * would fire it every few steps, but the lake must (playtest round 10, F-10: the Wegweiser never
 * showed the way round the Weiher today).
 */
export function wayLineBlocked(
  palaceHidden: boolean,
  from: { x: number; z: number },
  to: { x: number; z: number },
  blocked: (x: number, z: number) => boolean,
  water: (x: number, z: number) => boolean,
): boolean {
  return !lineFree(from.x, from.z, to.x, to.z, palaceHidden ? water : blocked, 0.5);
}
