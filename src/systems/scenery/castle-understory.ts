import { Color, Group, IcosahedronGeometry, InstancedMesh, Object3D } from 'three';
import type { Era } from '../../core/era';
import type { GraphicsLevel } from '../../core/save';
import { rasterAt } from '../../world/rasters';
import { SURF } from '../../world/surfaces';
import { hash2, valueNoise } from '../../world/vegetation/scatter';
import { BROOK_HALF, brookLine, QUELLE, TRAIL, trailLine } from '../quelle/layout';
import { BAUWAGEN_SITE } from './bauwagen';
import { Kit } from './kit';
import { propMaterial } from './material';
import { type PlateauSource, placePlateauProps, vergeHeight } from './palace-plateau';

const SITES = {
  weiher: { x: 897.2, z: -845.3 },
  quelle: QUELLE,
  plateau: { x: 1216, z: -1114 },
} as const;
export type UnderstorySite = keyof typeof SITES;
const SITE_IDS = Object.keys(SITES) as UnderstorySite[];
const PATCH_RADIUS = 28;
const VIEW_RANGE = 55;
const CELL = 2.5;
const CANOPY_OFFSETS = [-4, 0, 4];
type Circle = { x: number; z: number; radius: number };

// Extra buffers for the present-day fittings. vergeHeight also protects the tour stops,
// plateau arrival and the spring's furnished hollow.
const CLEAR: readonly Circle[] = [
  { ...BAUWAGEN_SITE, radius: BAUWAGEN_SITE.clearing },
  { x: 896.3, z: -850.3, radius: 2.2 }, // Weiher bench
  { x: 903.1, z: -850.3, radius: 2.2 }, // Weiher wayfinder
];
const SPRING_TRAIL = TRAIL.flatMap((strand) => trailLine(strand)).map(({ x, z, half }) => ({ x, z, radius: half + 0.3 }));

const PLANTS = {
  shrub: { radius: 1.08, slope: 28, spacing: 3.5, low: 5, full: 10 },
  seedHeads: { radius: 0.52, slope: 20, spacing: 1.4, low: 6, full: 14 },
} as const;
type PlantKind = keyof typeof PLANTS;

export interface UnderstorySource extends PlateauSource {
  canopy: Float32Array;
}

interface Plant extends Circle {
  kind: PlantKind;
  y: number;
  yaw: number;
  scale: number;
  low: boolean;
}

/** FIKTION. Select dry canopy edges for shrubs and canopy gaps for dry flower seed heads. */
export function placeUnderstory(source: UnderstorySource, site: UnderstorySite): Plant[] {
  const centre = SITES[site];
  const exclusions = [...CLEAR];
  if (site === 'plateau') exclusions.push(...placePlateauProps(source));
  if (site === 'quelle') {
    const brook = brookLine((x, z) => source.terrain.heightAt(x, z), 'today');
    exclusions.push(...SPRING_TRAIL, ...brook.map(([x, z]) => ({ x, z, radius: BROOK_HALF + 0.5 })));
  }

  const candidates: Record<PlantKind, (Omit<Plant, 'low'> & { score: number })[]> = { shrub: [], seedHeads: [] };
  const { terrain, canopy } = source;
  for (let gz = Math.floor((centre.z - PATCH_RADIUS) / CELL); gz * CELL <= centre.z + PATCH_RADIUS; gz++) {
    for (let gx = Math.floor((centre.x - PATCH_RADIUS) / CELL); gx * CELL <= centre.x + PATCH_RADIUS; gx++) {
      const x = (gx + hash2(gx, gz, 251)) * CELL;
      const z = (gz + hash2(gx, gz, 257)) * CELL;
      const distance = Math.hypot(x - centre.x, z - centre.z);
      if (distance > PATCH_RADIUS || !terrain.inBounds(x, z, 4)) continue;

      let shortest = Infinity;
      let tallest = 0;
      let trees = 0;
      for (const dx of CANOPY_OFFSETS) {
        for (const dz of CANOPY_OFFSETS) {
          const height = rasterAt(terrain, canopy, x + dx, z + dz);
          shortest = Math.min(shortest, height);
          tallest = Math.max(tallest, height);
          if (height >= 4) trees++;
        }
      }
      const overhead = rasterAt(terrain, canopy, x, z);
      // The wooded sites can have continuous canopy. A dip in canopy height still indicates
      // an opening below the surrounding crowns, even when there is no bare CHM cell.
      const gap = (overhead < 4 && trees <= 4) || (overhead <= 18 && tallest - overhead >= 9);
      const edge = tallest >= 8 && tallest - shortest >= 7 && tallest - overhead >= 3;
      const kind = gap ? 'seedHeads' : edge ? 'shrub' : null;
      if (kind === null) continue;

      const rule = PLANTS[kind];
      const scale = 0.8 + hash2(gx, gz, 263) * 0.4;
      const radius = rule.radius * scale;
      if (exclusions.some((q) => Math.hypot(x - q.x, z - q.z) < q.radius + radius)) continue;
      const slope = terrain.slopeDeg(x, z);
      if (slope > rule.slope || vergeHeight(source, x, z, radius, radius) === null) continue;

      // Prefer nearby clearings and keep the seed heads in loose patches.
      const patch = valueNoise(x * 0.22, z * 0.22, 271);
      const score = patch - distance / PATCH_RADIUS - 0.3 * slope / rule.slope;
      candidates[kind].push({ x, y: terrain.heightAt(x, z), z, radius, kind, scale, yaw: hash2(gx, gz, 269) * Math.PI * 2, score });
    }
  }

  const placed: Plant[] = [];
  for (const kind of ['shrub', 'seedHeads'] as const) {
    const rule = PLANTS[kind];
    let count = 0;
    for (const { score: _score, ...p } of candidates[kind].sort((a, b) => b.score - a.score)) {
      if (placed.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < Math.max(p.radius + q.radius, q.kind === kind ? rule.spacing : 0))) continue;
      placed.push({ ...p, low: count < rule.low });
      if (++count === rule.full) break;
    }
  }
  return placed;
}

// A common faceted primitive forms low, overlapping shrub lobes and thin stalks with papery heads.
type Part = readonly [x: number, y: number, z: number, w: number, h: number, d: number, color: number];
const PARTS: Record<PlantKind, { core: readonly Part[]; detail: readonly Part[] }> = {
  shrub: {
    core: [
      [-0.27, 0.24, 0, 0.49, 0.38, 0.43, 0x737141],
      [0.32, 0.31, 0.06, 0.49, 0.40, 0.39, 0x8a6745],
      [0.02, 0.5, -0.17, 0.47, 0.46, 0.48, 0x9e7a43],
    ],
    detail: [[-0.25, 0.63, 0.09, 0.28, 0.28, 0.30, 0xa18254], [0.21, 0.24, 0.42, 0.35, 0.32, 0.26, 0x62673e]],
  },
  seedHeads: {
    core: [
      [-0.17, 0.23, 0.04, 0.018, 0.28, 0.02, 0x90784c],
      [-0.17, 0.49, 0.04, 0.095, 0.043, 0.085, 0xcfb586],
      [0.17, 0.32, -0.09, 0.02, 0.37, 0.02, 0x9a8354],
      [0.17, 0.66, -0.09, 0.11, 0.047, 0.09, 0xe0c7a3],
    ],
    detail: [[-0.02, 0.17, 0.25, 0.02, 0.22, 0.02, 0xa08859], [-0.02, 0.37, 0.25, 0.083, 0.034, 0.08, 0xc9af84]],
  },
};

export function createCastleUnderstory(source: UnderstorySource) {
  const object = new Group();
  object.name = 'scenery-castle-understory';
  object.userData.noShadow = true;
  const geometry = new Kit().add(new IcosahedronGeometry(1), 0xffffff, 0, undefined, SURF.NONE).build();
  const material = propMaterial();
  const batches = new Map<UnderstorySite, { mesh: InstancedMesh; lowCount: number; fullCount: number }>();
  let active: UnderstorySite | undefined;
  let profile: GraphicsLevel | undefined;

  function build(site: UnderstorySite) {
    const plants = placeUnderstory(source, site);
    const core = plants.filter((p) => p.low).flatMap((p) => PARTS[p.kind].core.map((part) => ({ p, part })));
    const detail = plants.flatMap((p) => [...(p.low ? [] : PARTS[p.kind].core), ...PARTS[p.kind].detail].map((part) => ({ p, part })));
    const parts = [...core, ...detail];
    const mesh = new InstancedMesh(geometry, material, parts.length);
    mesh.name = `castle-understory-${site}`;
    mesh.userData.noShadow = true;
    const pose = new Object3D();
    const color = new Color();
    for (const [i, { p, part }] of parts.entries()) {
      const [x, y, z, w, h, d, hex] = part;
      const sin = Math.sin(p.yaw);
      const cos = Math.cos(p.yaw);
      pose.position.set(p.x + (x * cos + z * sin) * p.scale, p.y + y * p.scale, p.z + (z * cos - x * sin) * p.scale);
      pose.rotation.y = p.yaw;
      pose.scale.set(w * p.scale, h * p.scale, d * p.scale);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, color.setHex(hex));
    }
    if (parts.length) mesh.computeBoundingSphere();
    object.add(mesh);
    const batch = { mesh, lowCount: core.length, fullCount: parts.length };
    batches.set(site, batch);
    return batch;
  }

  return {
    object,
    update(playing: boolean, era: Era, level: GraphicsLevel, x: number, z: number) {
      const site = playing && era === 'today' ? SITE_IDS.find((id) => Math.hypot(SITES[id].x - x, SITES[id].z - z) < VIEW_RANGE) : undefined;
      if (site === active && level === profile) return;
      if (active) batches.get(active)!.mesh.visible = false;
      active = site;
      profile = level;
      if (!site) return;
      const { mesh, lowCount, fullCount } = batches.get(site) ?? build(site);
      mesh.count = level === 'low' ? lowCount : fullCount;
      mesh.visible = mesh.count > 0;
    },
    dispose() {
      object.removeFromParent();
      for (const { mesh } of batches.values()) mesh.dispose();
      object.clear();
      batches.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
