/** Shapes of the generated files in public/data (written by scripts/prepare-data.ts). */

export interface TerrainMeta {
  format: 'kq-terrain-v1';
  crs: string;
  frame: { E0: number; N0: number; rule: string };
  extentEN: { west: number; north: number; east: number; south: number };
  extentLocal: { x0: number; x1: number; z0: number; z1: number };
  cell: number;
  cols: number;
  rows: number;
  origin: { x: number; z: number };
  hMin: number;
  hMax: number;
  heightScale: number;
  files: {
    h2025: { path: string };
    h1789: { path: string };
    ground: { path: string; classes: Record<string, { name: string; label_de: string }> };
    canopy: { path: string };
  };
  /** Optional DGM1 surface shading for the present-day tour and palace. */
  surface2025?: TerrainSurfaceMeta;
  /** Optional DGM1 mesh offsets for the present-day tour and palace. */
  relief2025?: TerrainReliefMeta;
  hist1840: { path: string; covered: number };
  /** TK25 1935–40 (Kartograf 2), same crop as hist1840. */
  hist1935?: { path: string; covered: number };
  /** ALS 2025 ground points around the palace (Röntgenblick), format kq-pts-v1 (scripts/prepare-data.ts). */
  pointcloud?: PointCloudMeta;
}

export interface TerrainSurfaceMeta {
  path: string;
  /** North-west pixel edge in local metres. The texel centres are offset by half a metre. */
  x0: number;
  z0: number;
  /** Pixel dimensions at 1 m per texel. */
  cols: number;
  rows: number;
}

export interface TerrainReliefMeta {
  path: string;
  /** Position of the first vertex, on the 2 m terrain lattice. Samples are 1 m apart. */
  x0: number;
  z0: number;
  cols: number;
  rows: number;
}

export const RELIEF_TILE_M = 32;

export interface PointCloudMeta {
  format: 'kq-pts-v1';
  path: string;
  count: number;
  /** Local x/z of the north-west corner; cells of `cell` m, `cols` × `rows`, row 0 = north. */
  x0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  xyScale: number;
  resScale: number;
}

/** Land-cover classes of ground.u8 (catalogue classes). */
export const GROUND = {
  meadow: 0,
  lawn: 1,
  gravel: 2,
  cobbles: 3,
  sand: 4,
  water: 5,
  forest: 6,
  building: 7,
  // 1789 land cover (research/11, prepare-data since round 2)
  field: 8,
  vineyard: 9,
  kitchen_garden: 10,
  hay: 11,
  parterre_sand: 12,
} as const;
/**
 * Surface name per class for footsteps, tracks and hunt rules. The 1789 farm classes walk like
 * meadow / lawn / sand, so systems keep one small vocabulary.
 */
export const GROUND_NAMES = ['meadow', 'lawn', 'gravel', 'cobbles', 'sand', 'water', 'forest', 'building', 'meadow', 'meadow', 'lawn', 'meadow', 'sand'] as const;

export interface Footprint {
  id: string;
  name_de: string;
  confidence: 'high' | 'med' | 'low';
  base_h: number | null;
  eaves_h: number | null;
  ridge_h: number | null;
  cls: string | null;
  interior: string | null;
  /** Open ring of local [x, z]. */
  ring: [number, number][];
}

export interface Room {
  id: string;
  roomId: string;
  building: string;
  name_de: string;
  function: string;
  storey: number;
  storey_de: string | null;
  floor_h: number;
  ceiling_h: number;
  evidence: string;
  tag: string;
  polygon: [number, number][];
}

export interface Poi {
  id: string;
  name_de: string;
  type: string;
  confidence: string;
  x: number;
  z: number;
  y: number | null;
  inArea: boolean;
  source: string;
  sources: string[];
  note: string;
}

export interface PathGraphFile {
  format: 'kq-paths-v1';
  kinds: string[];
  nodes: number[];
  edges: number[];
  lines: { kind: string; name?: string; pts: number[] }[];
}

export interface AttributionItem {
  id: string;
  label_de: string;
  text: string;
  licence?: string;
  url?: string;
  source?: string;
  disclaimer_de?: string;
  /** Shipped files (below public/) this item's licence covers, e.g. the CC BY-SA palace data. */
  files?: string[];
}

export interface GameData {
  meta: TerrainMeta;
  /** Heights (m) per terrain dataset, row-major, row 0 = north. */
  heights: { '2025': Float32Array; '1789': Float32Array };
  ground: Uint8Array;
  /** Canopy height today, metres. */
  canopy: Float32Array;
  footprints: { disclaimer_de: string; anchor: { x: number; z: number }; buildings: Footprint[] };
  rooms: Room[];
  pois: Poi[];
  paths: PathGraphFile;
  attribution: { items: AttributionItem[] };
  /** Base URL of the data folder (ends with '/'). */
  baseUrl: string;
}
