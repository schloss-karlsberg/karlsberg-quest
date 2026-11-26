/**
 * The 24 Fläschchen (docs/IDEAS-ROUND11.md §4.5): hand-placed, one table, pure data (no three.js).
 *
 * Each bottle hangs on a named anchor (a POI of public/data/pois.json, a survey point, a scenery
 * set, or the Karlsbergquelle) and lies within 40 m of it; it keeps ≥ 6 m from every clue, NPC talk
 * circle and quest pickup of its era, and never lies in a memorial (tests/flaschen.test.ts checks
 * all of it). Positions were walked on the terrain and looked at in the game (e2e/flaschen.spec.ts).
 *
 * Height: `base` says what the bottle stands on — the terrain (default) or a piece of the spring's
 * stonework (src/systems/quelle/layout.ts) — and `dy` lifts it above that (a ledge).
 * `verb` is how it is found (§4.4 rule 2). `wucht`: it hangs at `hang` (in a tree, in the ice) until
 * a Wuchthieb within reach shakes it down to x/z; `lantern`: only seen in lantern light or by day;
 * `dark`: only seen with the lantern OFF (the fire's reflection on the water).
 */
import type { Era } from '../../core/era';
import { stringList } from '../../core/saved';
import { toWorld } from '../quelle/layout';

export type FlaschenVerb = 'walk' | 'crouch' | 'look' | 'wucht' | 'lantern' | 'dark' | 'unseen' | 'relief' | 'open';
export type FlaschenBase = 'terrain' | 'quelle-wall' | 'quelle-basin';
/** A small cover prop the bottle hides behind / in (built by the flaschen system). */
export type FlaschenCover = 'log' | 'stone' | 'barrel' | 'box' | 'woodpile' | 'stump' | 'tub';

export interface FlaschenSpot {
  id: string;
  era: Era;
  /** What it hangs on (docs; never shown in the game). */
  anchor: string;
  /** The anchor's position (the 40 m rule). */
  ax: number;
  az: number;
  /** Where it rests (for `wucht` spots: where it lands). */
  x: number;
  z: number;
  base?: FlaschenBase;
  /** Metres above the base. */
  dy?: number;
  /** Lying on its side (in grass, a gap), else standing. */
  lie?: boolean;
  /** Yaw of the bottle (degrees), for variety. */
  yaw?: number;
  /** `wucht` spots: where it hangs until shaken down (world x/z, metres above `base`). */
  hang?: { x: number; z: number; dy: number; base?: FlaschenBase };
  verb: FlaschenVerb;
  cover?: { kind: FlaschenCover; x: number; z: number; yaw?: number };
  /** Where it is, in words (docs, tests). */
  spot: string;
}

/** The spring's local frame (u right, w towards the viewer) → world. */
const q = (u: number, w: number): { x: number; z: number } => {
  const [x, z] = toWorld(u, w);
  return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
};
const QX = 1061.0;
const QZ = -834.5;

export const FLASCHEN: readonly FlaschenSpot[] = [
  // ---- today (6) ------------------------------------------------------------------------------
  { id: 'fl.heute.quelle', era: 'today', anchor: 'Karlsbergquelle', ax: QX, az: QZ, ...q(2.3, -5.4), lie: true, yaw: 40, verb: 'walk', spot: 'behind the spring house up the slope, in the leaves' },
  { id: 'fl.heute.eiskeller', era: 'today', anchor: 'Eiskeller r03-05', ax: 1519.67, az: -1333.05, x: 1520, z: -1342.5, lie: true, yaw: 100, verb: 'crouch', cover: { kind: 'log', x: 1520.4, z: -1342.9, yaw: 80 }, spot: 'under a fallen trunk on the ring wall’s north side' },
  { id: 'fl.heute.gipfel', era: 'today', anchor: 'Gipfelplateau r03-07', ax: 1555.53, az: -631.62, x: 1557, z: -628, dy: 0.1, verb: 'walk', cover: { kind: 'stump', x: 1557, z: -628 }, spot: 'in a hollow stump on the summit' },
  { id: 'fl.heute.grenzstein', era: 'today', anchor: 'Grenzstein r03-16b', ax: 993.54, az: -1199.77, x: 995, z: -1202, lie: true, yaw: 200, verb: 'look', spot: 'in the grass behind the boundary stone' },
  { id: 'fl.heute.westblick', era: 'today', anchor: 'survey point westblick', ax: 214, az: -899, x: 207.58, z: -893.15, lie: true, yaw: 300, verb: 'crouch', cover: { kind: 'stone', x: 208.3, z: -893.3, yaw: 20 }, spot: 'at the forest edge, under a sandstone block' },
  { id: 'fl.heute.tschifflik', era: 'today', anchor: 'Tschifflik ruin r03-12', ax: 1616.89, az: 237.17, x: 1612, z: 240, lie: true, yaw: 10, verb: 'relief', cover: { kind: 'stone', x: 1612.4, z: 240.3, yaw: 60 }, spot: 'in a gap of the ruin wall' },
  // ---- 1789 (6) -------------------------------------------------------------------------------
  { id: 'fl.1789.quelle', era: '1789', anchor: 'Brunnenstube', ax: QX, az: QZ, ...q(-0.27, 0.19), base: 'quelle-wall', dy: 0.425, yaw: 30, verb: 'look', spot: 'on the niche sill beside the bronze spout, behind the basin rim' },
  { id: 'fl.1789.orangerie', era: '1789', anchor: 'Orangerie KB-B10', ax: 1241.9, az: -967.0, x: 1230.6, z: -972.4, lie: true, yaw: 70, verb: 'unseen', cover: { kind: 'tub', x: 1230.0, z: -972.0 }, spot: 'behind an orange tub on the terrace' },
  { id: 'fl.1789.gitter', era: '1789', anchor: 'ehrenhof-gitter / Wachhaus Süd KB-B37', ax: 1192.45, az: -1114.55, x: 1171.15, z: -1099.3, dy: 1.04, verb: 'unseen', spot: 'on the window ledge of the Wachhaus Süd' },
  { id: 'fl.1789.bauplatz', era: '1789', anchor: 'k1-bauplatz', ax: 1288, az: -1230, x: 1293.2, z: -1217.4, lie: true, yaw: 15, verb: 'walk', spot: 'between the ashlar blocks of the stack' },
  { id: 'fl.1789.rund', era: '1789', anchor: 'k1-rund KL-B40', ax: 1935, az: 87, x: 1964.98, z: 82.0, verb: 'walk', spot: 'behind a cage house, round the outside' },
  { id: 'fl.1789.allee', era: '1789', anchor: 'apfelallee (tree 100)', ax: 1373.08, az: -815.85, x: 1373.7, z: -815.3, lie: true, hang: { x: 1373.25, z: -815.85, dy: 1.9 }, verb: 'wucht', spot: 'in the fork of an apple tree, upper rows' },
  // ---- 1793-02 (4) ----------------------------------------------------------------------------
  { id: 'fl.179302.quelle', era: '1793-02', anchor: 'Karlsbergquelle (winter)', ax: QX, az: QZ, ...q(1.25, 0.75), lie: true, hang: { ...q(1.15, 0.29), dy: 1.8, base: 'quelle-wall' }, verb: 'wucht', spot: 'frozen into the icicles under the cornice' },
  { id: 'fl.179302.torhaus', era: '1793-02', anchor: 'parkzaun (barrier)', ax: 1650, az: -415, x: 1622.85, z: -407.6, lie: true, yaw: 30, verb: 'lantern', spot: 'at the foot of the barrier post by the Torhaus' },
  { id: 'fl.179302.allee', era: '1793-02', anchor: 'apfelallee (tree 37)', ax: 1518.87, az: -566.59, x: 1519.5, z: -566.0, lie: true, hang: { x: 1519.05, z: -566.59, dy: 1.6 }, verb: 'wucht', spot: 'up a snow-laden apple tree' },
  { id: 'fl.179302.wachhaus', era: '1793-02', anchor: 'Wachhaus Nord KB-B38', ax: 1171.25, az: -1122.7, x: 1164.5, z: -1122.6, lie: true, yaw: 80, verb: 'walk', cover: { kind: 'woodpile', x: 1165.4, z: -1122.6, yaw: 90 }, spot: 'behind the woodpile at the Wachhaus Nord' },
  // ---- 1793-07 (3) ----------------------------------------------------------------------------
  { id: 'fl.179307.gaertnerei', era: '1793-07', anchor: 'Gärtnerei gate KB-B27', ax: 1263, az: -1298, x: 1282, z: -1312, dy: 0.58, verb: 'lantern', cover: { kind: 'barrel', x: 1282, z: -1312 }, spot: 'in the gardener’s rain barrel outside the gate' },
  { id: 'fl.179307.zwinger', era: '1793-07', anchor: 'zwinger (west kennel row)', ax: 1181, az: -1552, x: 1180.3, z: -1550.9, lie: true, yaw: 90, verb: 'crouch', spot: 'beside the opened door of the last kennel in the west lane' },
  { id: 'fl.179307.quelle', era: '1793-07', anchor: 'Karlsbergquelle (fire)', ax: QX, az: QZ, ...q(0.88, 1.33), base: 'quelle-basin', dy: 0.62, verb: 'dark', spot: 'on the basin’s rim, seen in the reflected firelight' },
  // ---- 1796 (5) -------------------------------------------------------------------------------
  { id: 'fl.1796.baumagazin', era: '1796', anchor: 'k4-baumagazin', ax: 485, az: -850, x: 483.1, z: -861.5, lie: true, yaw: 160, verb: 'relief', spot: 'in a gap of the stone stockpile' },
  { id: 'fl.1796.taleingang', era: '1796', anchor: 'k4-taleingang', ax: 470, az: -896, x: 475.6, z: -894.9, verb: 'open', cover: { kind: 'box', x: 475.6, z: -894.9, yaw: 85 }, spot: 'in the toolbox by the abandoned cart' },
  { id: 'fl.1796.steinplatz', era: '1796', anchor: 'k4-ehrenhof', ax: 1225, az: -1115, x: 1248.4, z: -1134.6, lie: true, yaw: 20, verb: 'crouch', cover: { kind: 'stone', x: 1248.1, z: -1134.1, yaw: 200 }, spot: 'in a hollow north of the highest heap, outside the Steinbrecher’s ground' },
  { id: 'fl.1796.westblick', era: '1796', anchor: 'survey point westblick', ax: 214, az: -899, x: 218, z: -905, lie: true, verb: 'walk', spot: 'in the hedge at the forest edge' },
  { id: 'fl.1796.quelle', era: '1796', anchor: 'Karlsbergquelle (ruin)', ax: QX, az: QZ, ...q(1.3, 0.5), lie: true, yaw: 54, verb: 'look', spot: 'under the torn-out spout, behind a fallen cornice stone' },
];

export const FLASCHEN_TOTAL = FLASCHEN.length;

/**
 * The known bottle ids of a saved list, each once. Retired ids and duplicates must not count towards
 * the collection or its milestones (`hanging`: only bottles that hang, for `dropped`).
 */
export function liveBottleIds(ids: unknown, hanging = false): string[] {
  return [...new Set(stringList(ids).filter((id) => FLASCHEN.some((spot) => spot.id === id && (!hanging || spot.hang))))];
}

/** The collection slice as the system restores it from a save (older, sparse or corrupt). */
export function readBottleSlice(s: { found?: unknown; dropped?: unknown; said?: unknown }): { found: string[]; dropped: string[]; said: string[] } {
  return { found: liveBottleIds(s.found), dropped: liveBottleIds(s.dropped, true), said: stringList(s.said) };
}

/** Era order of the Journal row. */
export const FLASCHEN_ERAS: readonly Era[] = ['today', '1789', '1793-02', '1793-07', '1796'];

/** Found bottles per era, in Journal order. */
export function countByEra(found: readonly string[]): { era: Era; found: number; total: number }[] {
  const have = new Set(found);
  return FLASCHEN_ERAS.map((era) => {
    const all = FLASCHEN.filter((s) => s.era === era);
    return { era, found: all.filter((s) => have.has(s.id)).length, total: all.length };
  });
}

/** Milestones (§4.6): found count → what happens. */
export const MILESTONES = { marlene: 8, laub: 16, all: 24 } as const;
