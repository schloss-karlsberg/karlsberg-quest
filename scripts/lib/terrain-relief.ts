import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import tour from '../../content/routes/p-fuehrung.json';
import approach from '../../content/routes/p-aufstieg.json';
import { decodeCanopy, decodeH2025, quantToMetres } from '../../src/data/decode';
import { GROUND, RELIEF_TILE_M, type GameData, type TerrainMeta, type TerrainReliefMeta } from '../../src/data/types';
import { BROOK_HALF, QUELLE, TRAIL, brookLine, clearings, meshGround, trailLine } from '../../src/systems/quelle/layout';
import { BAUWAGEN_SITE } from '../../src/systems/scenery/bauwagen';
import { placeUnderstory } from '../../src/systems/scenery/castle-understory';
import { placePlateauProps } from '../../src/systems/scenery/palace-plateau';
import { TOUR_STOP_SETS } from '../../src/systems/scenery/tour';
import { FootprintCollider } from '../../src/world/collision';
import { Heightfield } from '../../src/world/heightfield';
import { OPEN_GROUND } from '../../src/world/palace';
import { buildPathRaster, rasterLines } from '../../src/world/rasters';

// Crop edges align with the 32 m render tiles measured from the 2 m terrain origin.
export const RELIEF_CROP = { path: 'terrain/relief2025.u8.deflate', x0: 471, z0: -1189, cols: 833, rows: 769 } satisfies TerrainReliefMeta;
const MAX_OFFSET_CM = 32;
const MAX_BYTES = 384 * 1024;
// Each offset vertex can affect the triangles in the surrounding square metre.
const PADDING = 2;

export type ReliefBakeMeta = Pick<TerrainMeta, 'cols' | 'rows' | 'cell' | 'origin' | 'hMin' | 'heightScale' | 'files'>;

export function bakeTerrainRelief(out: string, meta: ReliefBakeMeta, dgm: Heightfield): Buffer {
  const bytes = (path: string) => new Uint8Array(inflateSync(readFileSync(join(out, path))));
  const json = <T>(path: string): T => JSON.parse(readFileSync(join(out, path), 'utf-8')) as T;
  const grid = { cols: meta.cols, rows: meta.rows, cell: meta.cell, x0: meta.origin.x, z0: meta.origin.z };
  const terrain = new Heightfield(grid, quantToMetres(decodeH2025(bytes(meta.files.h2025.path), meta), meta));
  const ground = bytes(meta.files.ground.path);
  const canopy = decodeCanopy(bytes(meta.files.canopy.path));
  const graph = json<GameData['paths']>('paths.json');
  const paths = buildPathRaster(grid, graph);
  const footprints = json<GameData['footprints']>('palace/footprints.json');
  const collider = new FootprintCollider(footprints.buildings.map((b) => OPEN_GROUND.includes(b.id) ? [] : b.ring));
  const props = { terrain, ground, graph, paths, canopy, footprintAt: (x: number, z: number) => collider.footprintAt(x, z) };
  const baseHeight = (x: number, z: number) => terrain.heightAt(x, z);

  const { x0, z0, cols, rows } = RELIEF_CROP;
  const crop = { ...RELIEF_CROP, cell: 1 };
  if (!terrain.inBounds(x0, z0, PADDING) || !terrain.inBounds(x0 + cols - 1, z0 + rows - 1, PADDING)
    || !dgm.inBounds(x0, z0) || !dgm.inBounds(x0 + cols - 1, z0 + rows - 1)) {
    throw new Error('relief crop outside the terrain');
  }
  const lines = new Float32Array(cols * rows);
  rasterLines(lines, crop, tour.points.flat(), 2 + PADDING);
  rasterLines(lines, crop, approach.points.flat(), 2 + PADDING);
  rasterLines(lines, crop, brookLine(baseHeight, 'today').flat(), BROOK_HALF + PADDING);
  const circles: [number, number, number][] = [
    ...clearings(),
    [QUELLE.x, QUELLE.z, 12],
    [BAUWAGEN_SITE.x, BAUWAGEN_SITE.z, BAUWAGEN_SITE.clearing],
    [1216, -1114, 3],
    ...tour.stops.map(({ x, z }): [number, number, number] => [x, z, 4]),
    ...TOUR_STOP_SETS.map(({ x, z }): [number, number, number] => [x, z, 8]),
    ...TRAIL.flatMap((strand) => trailLine(strand)).map(({ x, z, half }): [number, number, number] => [x, z, half]),
    ...[
      ...placePlateauProps(props),
      ...(['weiher', 'quelle', 'plateau'] as const).flatMap((site) => placeUnderstory(props, site)),
    ].map(({ x, z, radius }): [number, number, number] => [x, z, radius]),
  ];
  for (const [x, z, radius] of circles) {
    const pad = radius + PADDING;
    for (let r = Math.max(0, Math.ceil(z - z0 - pad)); r <= Math.min(rows - 1, Math.floor(z - z0 + pad)); r++) {
      for (let c = Math.max(0, Math.ceil(x - x0 - pad)); c <= Math.min(cols - 1, Math.floor(x - x0 + pad)); c++) {
        if (Math.hypot(x0 + c - x, z0 + r - z) <= pad) lines[r * cols + c] = 1;
      }
    }
  }
  // Keep the 2 m water bed and walking corridors intact, including the cells next to them.
  const protectedCell = (x: number, z: number) => {
    const c = Math.round((x - terrain.x0) / terrain.cell);
    const r = Math.round((z - terrain.z0) / terrain.cell);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const i = (r + dr) * terrain.cols + c + dc;
        if (ground[i] === GROUND.water || ground[i] === GROUND.building || paths[i]! >= 0.2) return true;
      }
    }
    return false;
  };
  const offsets = new Uint8Array(cols * rows).fill(128);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const tc = c % RELIEF_TILE_M;
      const tr = r % RELIEF_TILE_M;
      // Refined and coarse tiles meet on the exact 2 m triangle edges.
      const edge = Math.min(tc, tr, RELIEF_TILE_M - tc, RELIEF_TILE_M - tr);
      if (edge === 0 || ((c | r) & 1) === 0) continue;
      const i = r * cols + c;
      const x = x0 + c;
      const z = z0 + r;
      if (lines[i]! > 0 || protectedCell(x, z)) continue;
      const delta = Math.round((dgm.heightAt(x, z) - meshGround(baseHeight, x, z, terrain)) * 100);
      if (!Number.isFinite(delta)) throw new Error('non-finite height in relief crop');
      const bounded = Math.max(-MAX_OFFSET_CM, Math.min(MAX_OFFSET_CM, delta));
      offsets[i] = 128 + Math.round(bounded * Math.min(1, edge / 2));
    }
  }
  const compressed = deflateSync(offsets, { level: 9 });
  if (compressed.length > MAX_BYTES) throw new Error('relief crop exceeds its 384 KiB compressed budget');
  return compressed;
}
