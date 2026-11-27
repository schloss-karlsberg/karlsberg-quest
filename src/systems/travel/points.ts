/**
 * Vermessungspunkte (survey markers): Laub's tripods across the land. Walk up to one and it is
 * "eingemessen" (a beam rises, rings run over the ground). The map (M or Pause → Karte) then takes
 * you there in a breath. Pure data and rules (no three.js, no DOM), unit-tested in
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
  /** Known from the start (the home base, the Karlsbergquelle). */
  known?: boolean;
  /** Activation radius (m) when it is not ACTIVATE_RADIUS. */
  r?: number;
}

export const SURVEY_POINTS: readonly SurveyPoint[] = [
  { id: 'ehrenhof', name: 'Ehrenhof', x: 1230, z: -1127, note: 'Der Hof vor dem Corps de logis. Hier geht es hinüber', r: 16 },
  { id: 'galerie', name: 'Galerie, Ostende', x: 1300, z: -1192, note: 'Bauplatz, Hanne, der Garten hinter dem Schloss' },
  { id: 'orangerie', name: 'Orangerie', x: 1322, z: -906, note: 'Mannlichs Fenster, der Ladehof' },
  { id: 'zwinger', name: 'Zwinger', x: 1158, z: -1561, note: 'Die Hundeställe, Josts Platz' },
  { id: 'standpunkt', name: 'Standpunkt über dem Zwinger', x: 1394, z: -1469, note: 'Die Kuppe, von der man alles sieht' },
  { id: 'torhaus', name: 'Carlsluster Torhaus', x: 1690, z: -392, note: 'Der Parkzaun, das Tor, die Apfelallee' },
  { id: 'apfelallee', name: 'Apfelallee', x: 1550, z: -603, note: 'Halbe Höhe zwischen Torhaus und Orangerie' },
  { id: 'karlslust', name: 'Karlslust', x: 1831, z: 79, note: 'Die Terrasse, das Rund, die Menagerie' },
  { id: 'taleingang', name: 'Taleingang', x: 509, z: -893, note: 'Das Baumagazin, die Wachhäuser, der Steinbruch' },
  { id: 'westblick', name: 'Westblick', x: 214, z: -899, note: 'Der Waldrand. Im Westen die Hohenburg' },
  // playtest round 10 (A4): on the small bench east of the Karlsbergquelle, 5 m off the path,
  // 14.7 m from the trough's water. Its 7 m circle never reaches the trough's E zone
  // (quelle/layout.ts REACH) nor the story's 5 m step zone at the spring, so the tripod's card can
  // never be up because you stand at the trough. Last in the list: the index seeds the tripod look
  // (TRIPOD_SEED_BASE). Known from the start since the tour redesign (WP-05): the spring is home.
  { id: 'karlsbergquelle', name: 'Karlsbergquelle', x: 1072, z: -825, note: 'Der Trog im Hang, der Bach, der Weg hinauf zum Schloss', known: true },
];

/** Keep only live survey point IDs from a saved list, in order and without duplicates. */
export function livePointIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && pointById(id) !== undefined))];
}

/** Offset the list index to preserve tripod appearances after removing the original first point. */
export const TRIPOD_SEED_BASE = 4;

export function pointById(id: string): SurveyPoint | undefined {
  return SURVEY_POINTS.find((p) => p.id === id);
}

/** Within this distance a tripod is eingemessen (m). */
export const ACTIVATE_RADIUS = 7;

/**
 * A point's own activation radius. The Ehrenhof tripod stands 11 m from the Ehrenhof time anchor
 * (1222, -1119) and 15 m from the prologue's "Q in der Mitte des Ehrenhofs" spot (1218, -1118).
 * Give this tripod a 16 m radius so a player who walks straight to either Q spot activates it.
 */
export function activateRadius(p: SurveyPoint): number {
  return p.r ?? ACTIVATE_RADIUS;
}

/**
 * Does standing `d` m from the point eingemessen it now? Not twice, not while flying, not while the
 * world is quiet ('world:quiet', the party): the point waits and activates on the next step after.
 */
export function mayActivate(p: SurveyPoint, d: number, activated: readonly string[], o: { flying: boolean; quiet: boolean }): boolean {
  return d < activateRadius(p) && !activated.includes(p.id) && !o.flying && !o.quiet;
}

/**
 * May the travel card take E (close on E)? Not while something else owns E: the spring's
 * "Wasser berühren" (`e.owner` = quelle), a door or gate, an NPC in talk range (`npc.near`).
 * Otherwise one E press at the Karlsbergquelle would both close the card and touch the water.
 */
export function cardMayTakeE(flags: Readonly<Record<string, unknown>>): boolean {
  return !flags['e.owner'] && !flags['npc.near'];
}

/**
 * Points that count as known: walked up to (`activated`) or pre-surveyed (`known`, e.g. the
 * Karlsbergquelle, or one Laub announced because the next goal lies beside it).
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

/** Minimum distance (m) to a goal before Laub announces the point beside it. */
export const ANNOUNCE_MIN = 400;

/** Find a point Laub can announce near a distant goal, making it known without the walk. */
export function announceFor(goal: { x: number; z: number } | null, player: { x: number; z: number }, known: readonly string[]): SurveyPoint | null {
  if (!goal) return null;
  if (Math.hypot(goal.x - player.x, goal.z - player.z) < ANNOUNCE_MIN) return null;
  const near = nearestPoint(goal.x, goal.z, SURVEY_POINTS);
  if (!near || near.d > 140) return null;
  if (near.point.known || known.includes(near.point.id)) return null;
  return near.point;
}

/**
 * Open water for the Wegweiser (route search, "Weg" marker, motes): water the player cannot walk
 * on. Frozen water (February 1793) carries the player like land (`Water.depthInside`, the
 * movement rule), so the trail leads across the ice instead of hiding there (TASK-071). The
 * frozen state is read on every call, so a thaw (era change or load) restores the water.
 */
export function isOpenWater(surface: string, frozen: boolean): boolean {
  return !frozen && surface === 'water';
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

/** How far under the walking radius the Wegweiser probes the player's own spot (m). */
export const WAY_START_SLACK = 0.05;

/**
 * The Wegweiser's probe at the player's own spot and on a route's first step (`findRoute`'s
 * `startBlocked`). Walls count at the walking radius less `WAY_START_SLACK`: pushed against a wall
 * the player sits exactly one radius from it, and rounding (or a corner's leftover overlap) reads
 * that spot as blocked, which hid the trail at the very wall it should lead round. Water counts
 * only past the wading limit, so a player in the shallows still sees the way out.
 */
export function wayStartBlocked(
  walls: (x: number, z: number, radius: number) => boolean,
  depth: (x: number, z: number) => number,
  playerRadius: number,
  wadeLimit: number,
): (x: number, z: number) => boolean {
  const radius = playerRadius - WAY_START_SLACK;
  return (x, z) => walls(x, z, radius) || depth(x, z) > wadeLimit;
}
