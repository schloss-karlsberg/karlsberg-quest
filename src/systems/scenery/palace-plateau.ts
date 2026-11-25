import { Color, InstancedMesh, Object3D } from 'three';
import tour from '../../../content/routes/p-fuehrung.json';
import type { GraphicsLevel } from '../../core/save';
import { GROUND, type PathGraphFile } from '../../data/types';
import type { Solid } from '../../world/collision';
import type { Heightfield } from '../../world/heightfield';
import { clearings, QUELLE } from '../quelle/layout';
import { Polyline } from '../walk/route';
import type { Route } from '../walk/types';
import { Kit } from './kit';
import { propMaterial } from './material';
import { C } from './props';

const GROUP_ROUTE = new Polyline((tour as Route).points);
const KEEP_CLEAR: readonly (readonly [number, number, number])[] = [
  ...clearings(),
  [QUELLE.x, QUELLE.z, 12],
  ...tour.stops.map(({ x, z }) => [x, z, 4] as const),
  [1216, -1114, 3], // plateau arrival
];
const VERGE = {
  bench: { radius: 1.05, offset: 3.8, relief: 0.24 },
  wall: { radius: 1.5, offset: 4.8, relief: 0.36 },
  edge: { radius: 0.48, offset: 2.75, relief: 0.17 },
} as const;
type PropKind = keyof typeof VERGE;

// FIKTION. Approximate stations along the track through the former Ehrenhof, in metres.
// Snap to the shipped track before trying dry, level ground on the requested verge.
const STATIONS = [
  ['bench', 1204, -1116, -1, true],
  ['wall', 1224, -1120, 1, true],
  ['bench', 1235, -1122.5, -1, true],
  ['wall', 1241, -1124, 1, true],
  ['edge', 1209, -1117, 1, true],
  ['edge', 1212, -1118, 1, false],
  ['edge', 1215, -1118.5, 1, true],
  ['edge', 1218, -1119, 1, false],
  ['edge', 1228, -1121, -1, true],
  ['edge', 1231, -1121.5, -1, false],
  ['edge', 1244, -1124.5, -1, true],
  ['edge', 1247, -1125, -1, false],
] as const satisfies readonly (readonly [PropKind, number, number, -1 | 1, boolean])[];

export interface PlateauSource {
  terrain: Heightfield;
  ground: Uint8Array;
  paths: Float32Array;
  graph: PathGraphFile;
  footprintAt: (x: number, z: number) => number;
}

interface PropPlacement {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  radius: number;
  low: boolean;
}

/** Height for a prop's footprint on an open, dry verge; null rejects the entire candidate. */
export function vergeHeight(source: PlateauSource, x: number, z: number, radius: number, relief: number): number | null {
  const { terrain, ground, paths } = source;
  if (!terrain.inBounds(x, z, radius)) return null;
  if (GROUP_ROUTE.project(x, z).dist < 2 + radius) return null;
  if (KEEP_CLEAR.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + radius)) return null;

  // Check every nearest-neighbour raster cell touched by the footprint's bounding square.
  const col = (px: number) => Math.round((px - terrain.x0) / terrain.cell);
  const row = (pz: number) => Math.round((pz - terrain.z0) / terrain.cell);
  for (let r = row(z - radius); r <= row(z + radius); r++) {
    for (let c = col(x - radius); c <= col(x + radius); c++) {
      const i = r * terrain.cols + c;
      if (ground[i] === GROUND.water || paths[i]! >= 0.2) return null;
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const dx of [-radius, 0, radius]) {
    for (const dz of [-radius, 0, radius]) {
      if (source.footprintAt(x + dx, z + dz) >= 0) return null;
      const h = terrain.heightAt(x + dx, z + dz);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }
  return max - min <= relief ? min : null;
}

/** Snap each station to the nearest OSM track, with a consistent west-to-east tangent. */
function trackAt({ kinds, nodes, edges }: PathGraphFile, x: number, z: number) {
  const track = kinds.indexOf('track');
  let best = 4;
  let point: { x: number; z: number; dx: number; dz: number } | null = null;
  for (let i = 0; i < edges.length; i += 4) {
    if (edges[i + 2] !== track) continue;
    const a = edges[i]! * 3;
    const b = edges[i + 1]! * 3;
    const ax = nodes[a]!;
    const az = nodes[a + 2]!;
    const dx = nodes[b]! - ax;
    const dz = nodes[b + 2]! - az;
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length * length)));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const dist = Math.hypot(px - x, pz - z);
    if (dist >= best) continue;
    const sign = dx < 0 ? -1 : 1;
    best = dist;
    point = { x: px, z: pz, dx: dx * sign / length, dz: dz * sign / length };
  }
  return point;
}

export function placePlateauProps(source: PlateauSource): PropPlacement[] {
  const placed: PropPlacement[] = [];
  for (const [kind, sx, sz, side, low] of STATIONS) {
    const p = trackAt(source.graph, sx, sz);
    if (!p) continue;
    const { radius, offset, relief } = VERGE[kind];
    for (const extra of [0, 0.5, 1, 1.5]) {
      const x = p.x - p.dz * side * (offset + extra);
      const z = p.z + p.dx * side * (offset + extra);
      const y = vergeHeight(source, x, z, radius, relief);
      if (y === null || placed.some((other) => Math.hypot(other.x - x, other.z - z) < other.radius + radius)) continue;
      const yaw = Math.atan2(-p.dz, p.dx) + (side === 1 ? Math.PI : 0);
      placed.push({ kind, x, y, z, yaw, radius, low });
      break;
    }
  }
  return placed;
}

// Every visible piece instances the same unit box. Vary the dimensions and colours of the
// masonry, with open joints and an uneven crown. The core pieces also make the Niedrig layout.
type Block = readonly [width: number, height: number, depth: number, x: number, y: number, z: number, color: number, tilt?: number];
const BENCH: readonly Block[] = [
  [0.23, 0.64, 0.43, -0.64, -0.14, 0, C.sandstonePale],
  [0.23, 0.64, 0.43, 0.64, -0.14, 0, C.sandstone],
  [0.08, 0.43, 0.08, -0.64, 0.38, -0.21, C.iron, -0.12],
  [0.08, 0.43, 0.08, 0.64, 0.38, -0.21, C.iron, -0.12],
  [1.78, 0.08, 0.43, 0, 0.5, 0.01, C.woodGrey],
  [1.78, 0.18, 0.06, 0, 0.68, -0.23, C.woodGrey, -0.12],
];
const WALL: readonly Block[] = [
  [0.92, 0.44, 0.61, -0.77, -0.10, 0.02, C.sandstone],
  [0.53, 0.46, 0.65, 0, -0.10, 0.02, C.sandstoneRed],
  [0.89, 0.43, 0.60, 0.75, -0.10, 0, C.sandstone],
  [0.81, 0.25, 0.52, -0.82, 0.34, -0.01, C.sandstonePale],
  [0.47, 0.20, 0.48, -0.12, 0.36, 0, C.sandstone],
];
const EDGE: readonly Block[] = [[0.73, 0.24, 0.42, 0, -0.04, 0, C.sandstone]];

export function buildPlateauBatch(placements: readonly PropPlacement[]) {
  const core: { prop: PropPlacement; block: Block }[] = [];
  const detail: typeof core = [];
  const solids: Solid[] = [];
  for (const prop of placements) {
    const blocks = prop.kind === 'bench' ? BENCH : prop.kind === 'wall' ? WALL : EDGE;
    blocks.forEach((block) => (prop.low ? core : detail).push({ prop, block }));
    if (prop.kind === 'wall') {
      detail.push({ prop, block: [0.56, 0.23, 0.49, -0.64, 0.59, 0, C.rubble, 0.09] });
      detail.push({ prop, block: [0.39, 0.30, 0.46, 0.47, 0.32, -0.02, C.sandstonePale, -0.08] });
    }
    if (prop.kind !== 'edge') {
      solids.push({
        kind: 'box', x: prop.x, z: prop.z, ux: Math.cos(prop.yaw), uz: -Math.sin(prop.yaw),
        hu: prop.kind === 'bench' ? 0.89 : 1.23, hv: prop.kind === 'bench' ? 0.30 : 0.35,
      });
    }
  }

  const geometry = new Kit().box(1, 1, 1, 0, 0, 0, 0xffffff).build();
  const material = propMaterial();
  const parts = [...core, ...detail];
  const mesh = new InstancedMesh(geometry, material, parts.length);
  mesh.name = 'scenery-palace-plateau';
  const frame = new Object3D();
  const piece = new Object3D();
  const color = new Color();
  for (const [i, { prop, block }] of parts.entries()) {
    const [w, h, d, x, y, z, hex, tilt = 0] = block;
    frame.position.set(prop.x, prop.y, prop.z);
    frame.rotation.y = prop.yaw;
    frame.updateMatrix();
    piece.position.set(x, y, z);
    piece.rotation.x = tilt;
    piece.scale.set(w, h, d);
    piece.updateMatrix();
    mesh.setMatrixAt(i, frame.matrix.multiply(piece.matrix));
    mesh.setColorAt(i, color.setHex(hex));
  }
  if (parts.length) mesh.computeBoundingSphere();

  return {
    mesh,
    solids,
    setLevel(level: GraphicsLevel) {
      mesh.count = level === 'low' ? core.length : parts.length;
      mesh.visible = mesh.count > 0;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
