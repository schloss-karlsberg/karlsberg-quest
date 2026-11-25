/**
 * Real world rasters for the travel tests (public/data): the land cover (water), the OSM path
 * raster exactly as src/world/world.ts builds it, the 1789 heightfield (the POI slope filter) and
 * the palace footprints. Loaded once per test file.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeH1789, decodeH2025, quantToMetres } from '../src/data/decode';
import { GROUND, type Footprint, type PathGraphFile, type TerrainMeta } from '../src/data/types';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { Heightfield, classAt, type GridDesc } from '../src/world/heightfield';
import { buildPathRaster, rasterAt } from '../src/world/rasters';

const dir = new URL('../public/data/', import.meta.url);

export interface WorldData {
  grid: GridDesc;
  ground: Uint8Array;
  paths: Float32Array;
  h2025: Heightfield;
  h1789: Heightfield;
  footprints: FootprintCollider;
  /** Land cover is water (today). */
  water(x: number, z: number): boolean;
  /** OSM path coverage 0..1 (today). */
  pathAt(x: number, z: number): number;
}

let cached: WorldData | null = null;

export function loadWorldData(): WorldData {
  if (cached) return cached;
  const meta = JSON.parse(readFileSync(new URL('terrain/meta.json', dir), 'utf8')) as TerrainMeta;
  const grid: GridDesc = { cols: meta.cols, rows: meta.rows, cell: meta.cell, x0: meta.origin.x, z0: meta.origin.z };
  const ground = new Uint8Array(inflateSync(readFileSync(new URL('terrain/ground.u8.deflate', dir))));
  const q25 = decodeH2025(new Uint8Array(inflateSync(readFileSync(new URL('terrain/h2025.u16.deflate', dir)))), meta);
  const q89 = decodeH1789(new Uint8Array(inflateSync(readFileSync(new URL('terrain/h1789.u16.deflate', dir)))), q25);
  const graph = JSON.parse(readFileSync(new URL('paths.json', dir), 'utf8')) as PathGraphFile;
  const paths = buildPathRaster(grid, graph);
  const fps = (JSON.parse(readFileSync(new URL('palace/footprints.json', dir), 'utf8')) as { buildings: Footprint[] }).buildings;
  cached = {
    grid,
    ground,
    paths,
    h2025: new Heightfield(grid, quantToMetres(q25, meta)),
    h1789: new Heightfield(grid, quantToMetres(q89, meta)),
    footprints: new FootprintCollider(fps.map((f) => f.ring as Ring)),
    water: (x, z) => classAt(grid, ground, x, z) === GROUND.water,
    pathAt: (x, z) => rasterAt(grid, paths, x, z),
  };
  return cached;
}
