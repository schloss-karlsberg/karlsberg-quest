/**
 * Points of interest along the chapters' main routes (playtest round 2: "long empty walks"). Every
 * ~120 m beside a route lies something optional: a glowing cache guarded by two to four spectral
 * things, a Fundstück (letter, note, token; lore.ts), or a Wegstein that heals. Generated
 * deterministically from the route polylines below (taken from the story's and the quests'
 * coordinates); pure, unit-tested in tests/travel.test.ts (spacing, keeping clear of the story's
 * places, every Fundstück used once).
 */
import { LORE } from './lore';

export type PoiKind = 'cache' | 'lore' | 'shrine';
export type PoiEra = 'today' | '1789' | '1793-02' | '1793-07' | '1796';

export interface Route {
  id: string;
  /** The chapter whose walk this is (tier of the guards). */
  chapter: 'prolog' | 'k1' | 'k2' | 'k3' | 'k4';
  era: PoiEra;
  pts: readonly (readonly [number, number])[];
  /** Arc length (m) of the first POI (default: 0.6 × the spacing). */
  start?: number;
  /** Least distance (m) to the POIs of the same era (default: 0.55 × the spacing). */
  gap?: number;
}

export interface Poi {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  era: PoiEra;
  chapter: Route['chapter'];
  /** cache: enemy kind and count of its guards. */
  enemy?: string;
  count?: number;
  /** lore: the Fundstück. */
  lore?: string;
}

/** The walks (local frame), per chapter and era. */
export const ROUTES: readonly Route[] = [
  // Present-day dam, Orangerie and Ehrenhof paths. Keep the route IDs stable for saved POIs.
  { id: 'p-hang', chapter: 'prolog', era: 'today', pts: [[790, -905], [880, -880], [1040, -905], [1138, -931], [1237, -966], [1232, -1060], [1218, -1118]] },
  { id: 'p-garten', chapter: 'prolog', era: 'today', pts: [[1240, -1250], [1330, -1270], [1420, -1285], [1508, -1296]] },
  // K1 (1789): the Ehrenhof → the garden → the Zwinger; the Karlslust at night
  { id: 'k1-garten', chapter: 'k1', era: '1789', pts: [[1300, -1270], [1264, -1330], [1250, -1400], [1227, -1466], [1205, -1520]] },
  { id: 'k1-karlslust', chapter: 'k1', era: '1789', pts: [[1822, 95], [1830, 160], [1852, 248], [1830, 330], [1790, 420]] },
  { id: 'k1-westweg', chapter: 'k1', era: '1789', pts: [[1175, -1250], [1150, -1330], [1140, -1420], [1150, -1520]] },
  { id: 'k1-orangerie', chapter: 'k1', era: '1789', pts: [[1300, -1060], [1330, -1000], [1350, -930], [1330, -860], [1290, -800]] },
  { id: 'k1-terrasse', chapter: 'k1', era: '1789', pts: [[1780, 60], [1700, 40], [1640, -20], [1600, -120]] },
  // K1 (today): from the Zwinger over the hill to the Karlslust
  { id: 'k1-heute', chapter: 'k1', era: 'today', pts: [[1200, -1520], [1330, -1420], [1480, -1180], [1600, -900], [1660, -600], [1700, -330], [1760, -120], [1815, 40]] },
  // K2 (1793-02): the Torhaus → the Apfelallee → the Orangerie → the Wachhaus; the slope to the dam
  { id: 'k2-allee', chapter: 'k2', era: '1793-02', pts: [[1660, -430], [1600, -470], [1533, -600], [1443, -800], [1380, -900], [1275, -960]] },
  { id: 'k2-hang', chapter: 'k2', era: '1793-02', pts: [[1188, -1070], [1100, -1010], [1000, -960], [880, -900], [830, -880]] },
  // K2 (today): the path to the Torhaus
  { id: 'k2-heute', chapter: 'k2', era: 'today', pts: [[1250, -915], [1380, -880], [1460, -760], [1533, -600], [1600, -470], [1660, -420]] },
  // K3 (1793-07): the garden behind the burning palace, down to the Zwinger
  { id: 'k3-garten', chapter: 'k3', era: '1793-07', pts: [[1300, -1250], [1272, -1330], [1276, -1418], [1263, -1500]] },
  { id: 'k3-westweg', chapter: 'k3', era: '1793-07', pts: [[1175, -1250], [1150, -1330], [1140, -1420], [1150, -1520], [1190, -1610]] },
  { id: 'k3-orangerie', chapter: 'k3', era: '1793-07', pts: [[1300, -1060], [1330, -1000], [1350, -930], [1330, -860], [1290, -800]] },
  // K4 (1796): the valley road west, the way up to the ruin, the ruin to the Standpunkt
  { id: 'k4-west', chapter: 'k4', era: '1796', pts: [[470, -905], [380, -905], [300, -903], [220, -903]] },
  { id: 'k4-hinauf', chapter: 'k4', era: '1796', pts: [[530, -910], [650, -930], [800, -960], [1000, -1000], [1130, -1060], [1200, -1100]] },
  { id: 'k4-standpunkt', chapter: 'k4', era: '1796', pts: [[1260, -1240], [1300, -1320], [1340, -1400], [1386, -1460]] },
  // prologue (today), playtest round 10 (F-10): the Waldweg round the Weiher's north shore (OSM
  // walk graph, public/data/paths.json) from the Damm to where it turns south for the spring, then
  // up the slope to the hohe Stufe. LAST in the list on purpose: POIs are generated route by route
  // and share the per-era spacing and Fundstück pools, so a route added earlier would move or
  // re-kind the POIs of the routes after it, and their ids (`poi.<route>.<n>`) sit in saves.
  { id: 'p-weiher', chapter: 'prolog', era: 'today', pts: [[816, -896], [830, -909], [861, -908], [898, -908], [938, -909], [963, -901], [1010, -912], [1080, -935], [1160, -950], [1225, -968]], start: 110, gap: 62 },
  // Reserved for POIs along the guided tour. The tour currently generates none. Append new
  // routes after the shipped ones to preserve existing POI IDs and placements.
  { id: 'p-fuehrung', chapter: 'prolog', era: 'today', pts: [] },
];

/**
 * Places the story and the quests use (anchors, NPCs, clues, objectives): POIs keep clear of them.
 * A third entry limits a place to one era (a set that only stands then); without it, every era.
 */
export const KEEP_CLEAR: readonly (readonly [number, number] | readonly [number, number, PoiEra])[] = [
  [763, -912], [819, -875], [1237, -966], [1508, -1296], [1218, -1118], [1206, -1113], [1138, -931], [1040, -902], [1232, -872], [990, -1044],
  [1212, -1180], [1297, -1247], [1212, -1626], [1208, -1612], [1177, -1571], [1169, -1636], [1822, 70], [1852, 248], [1812, 203], [1966, 92],
  [1274, -986], [1282, -971], [1286, -958], [1227, -1466], [1264, -1302], [1298, -1016], [1268, -950], [1680, -400], [1500, -542], [1347, -817],
  [1182, -1122], [1205, -1205], [1304, -992], [1320, -984], [1201, -1163], [1185, -1197], [1189, -1178], [1215, -1216], [1202, -1217], [1258, -1138],
  [1266, -1127], [1263, -1520], [1258, -1566], [1276, -1418], [1222, -1172], [1195, -1097], [1192, -1113], [497, -900], [200, -905], [495, -845],
  [497, -822], [478, -852], [1240, -1193], [1386, -1477], [1216, -1571], [1241, -1103], [483, -839], [1236, -1180], [1226, -1194], [650, -930],
  [800, -960], [1000, -1000], [813, -903], [819, -890], [1172, -1238], [1216, -1150], [1216, -1290], [760, -915], [1903, 87], [1287, -1228],
  [1202, -1150], [1262, -1218], [1165, -1571], [1935, 87], [1935, 50], [1935, 124], [1958, 146], [1910, 215], [1920, 205], [1815, 348],
  [1811, 363], [1815, 290], [1826, 394], [1460, -260], [1560, -470], [1526, -557], [1235, -1084], [1269, -1110], [1222, -1135], [1188, -1070],
  [1050, -1000], [1237, -1066], [1320, -940], [1250, -915], [790, -905], [1285, -1150], [1300, -1170], [1232, -1165], [1302, -1262], [1268, -1470],
  [1232, -1572], [1150, -1700], [1420, -1440], [1300, -1520], [1300, -1472], [1240, -1494], [1200, -1530],
  [1061, -834.5], // the Karlsbergquelle (src/systems/quelle/layout.ts)
  [1001.5, -876.5, '1789'], // the Bleiche by the brook, 1789 only (Unauffällig: Liese, the coat; src/systems/bleiche/layout.ts)
];

/** Distance POIs keep from the places above (m). */
export const KEEP_CLEAR_R = 28;
/** Spacing along a route (m). */
export const POI_SPACING = 120;

/** Guards per era (no bosses; kinds that live in that era, docs/ACTION-RPG.md §5.1). */
const GUARDS: Record<PoiEra, readonly [string, number][]> = {
  today: [['nebelling', 3], ['irrlicht', 2], ['streuner', 2]],
  '1789': [['streuner', 3], ['mahnbrief', 4], ['nebelling', 3]],
  '1793-02': [['streuner', 3], ['nebelling', 3], ['irrlicht', 2]],
  '1793-07': [['raffschatten', 2], ['glutling', 3], ['streuner', 3]],
  '1796': [['grusling', 4], ['steinfresser', 2], ['streuner', 3]],
};

/** Kinds a prologue route never fields (they need the Bannlicht, taught at the prologue's end). */
const PROLOG_BANNED = new Set(['irrlicht']);

/** Tier of a chapter's guards (docs/ACTION-RPG.md §5.4). */
export const CHAPTER_TIER: Record<Route['chapter'], number> = { prolog: 1, k1: 1, k2: 2, k3: 3, k4: 4 };

const PATTERN: readonly PoiKind[] = ['cache', 'lore', 'shrine', 'cache', 'lore', 'cache', 'lore', 'shrine'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point and unit direction at arc length s along a polyline. */
export function along(pts: readonly (readonly [number, number])[], s: number): { x: number; z: number; ux: number; uz: number } | null {
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= acc + len) {
      const t = (s - acc) / len;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / len, uz: (bz - az) / len };
    }
    acc += len;
  }
  return null;
}

export function routeLength(pts: readonly (readonly [number, number])[]): number {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  return L;
}

export interface PoiOptions {
  /** A place where nothing may stand (footprints, water, steep ground). */
  blocked?: (x: number, z: number) => boolean;
  spacing?: number;
}

/** All POIs of all routes (deterministic). */
export function generatePois(routes: readonly Route[] = ROUTES, opts: PoiOptions = {}): Poi[] {
  const spacing = opts.spacing ?? POI_SPACING;
  const out: Poi[] = [];
  const loreLeft = new Map<PoiEra, string[]>();
  const eraCount = new Map<PoiEra, number>();
  const cacheCount = new Map<PoiEra, number>();
  for (const l of LORE) {
    const list = loreLeft.get(l.era) ?? [];
    list.push(l.id);
    loreLeft.set(l.era, list);
  }
  const clear = (x: number, z: number, era: PoiEra, gap = spacing * 0.55): boolean => {
    for (const [kx, kz, ke] of KEEP_CLEAR) if ((!ke || ke === era) && Math.hypot(kx - x, kz - z) < KEEP_CLEAR_R) return false;
    for (const p of out) if (p.era === era && Math.hypot(p.x - x, p.z - z) < gap) return false;
    return !opts.blocked?.(x, z);
  };
  for (const route of routes) {
    const r = rand(hash(route.id));
    const L = routeLength(route.pts);
    let n = 0;
    for (let s = route.start ?? spacing * 0.6; s < L - 25; s += spacing) {
      const a = along(route.pts, s);
      if (!a) break;
      const side = n % 2 ? 1 : -1;
      let spot: [number, number] | null = null;
      for (const off of [12 + r() * 6, 8, 18, -(12 + r() * 4), -8, -18]) {
        const o = off * side;
        // normal to the route: (−uz, ux)
        const x = Math.round((a.x - a.uz * o) * 10) / 10;
        const z = Math.round((a.z + a.ux * o) * 10) / 10;
        if (clear(x, z, route.era, route.gap)) {
          spot = [x, z];
          break;
        }
      }
      n++;
      if (!spot) continue;
      // the mix rotates per era, so every era gets caches, Fundstücke and Wegsteine
      const k = eraCount.get(route.era) ?? 0;
      eraCount.set(route.era, k + 1);
      let kind = PATTERN[k % PATTERN.length]!;
      const lore = kind === 'lore' ? loreLeft.get(route.era)?.shift() : undefined;
      if (kind === 'lore' && !lore) kind = n % 2 ? 'cache' : 'shrine';
      const poi: Poi = { id: `poi.${route.id}.${n}`, kind, x: spot[0], z: spot[1], era: route.era, chapter: route.chapter };
      if (kind === 'cache') {
        // the prologue teaches the Bannlicht only at its end (the p9b Streuner): nothing on its routes
        // that only the Bannlicht undoes (playtest round 5: Irrlichter below the Orangerie killed a
        // level-2 player who had never been told what RMB does)
        const g = route.chapter === 'prolog' ? GUARDS[route.era].filter(([k]) => !PROLOG_BANNED.has(k)) : GUARDS[route.era];
        const c = cacheCount.get(route.era) ?? 0;
        cacheCount.set(route.era, c + 1);
        const [enemy, count] = g[c % g.length]!;
        poi.enemy = enemy;
        poi.count = count;
      }
      if (lore) poi.lore = lore;
      out.push(poi);
    }
  }
  return out;
}

/** What a cache holds (item ids), seeded by its id: one or two supplies. */
export function cacheLoot(id: string): string[] {
  const r = rand(hash(id) ^ 0x5bd1e995);
  const table = ['item.balsam', 'item.balsam', 'item.lampenoel', 'item.riechsalz', 'item.kalkstaub'];
  const out = [table[Math.floor(r() * table.length)]!];
  if (r() < 0.55) out.push(table[Math.floor(r() * table.length)]!);
  return out;
}

/** EP for opening a cache / reading a Fundstück, by chapter tier. */
export function poiXp(kind: PoiKind, tier: number): number {
  return kind === 'cache' ? 20 + 10 * tier : kind === 'lore' ? 10 + 5 * tier : 0;
}
