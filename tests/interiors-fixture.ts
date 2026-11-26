/** Real palace data for the interiors tests: rooms, footprints and the 1789 / 2025 terrain. */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeH1789, decodeH2025, quantToMetres } from '../src/data/decode';
import type { Footprint, Room, TerrainMeta } from '../src/data/types';
import { Heightfield } from '../src/world/heightfield';

const dir = new URL('../public/data/', import.meta.url);

export function loadPalaceFootprints(): Footprint[] {
  return (JSON.parse(readFileSync(new URL('palace/footprints.json', dir), 'utf8')) as { buildings: Footprint[] }).buildings;
}

export function loadPalaceData(): { rooms: Room[]; footprints: Footprint[]; h1789: Heightfield; h2025: Heightfield } {
  const rooms = (JSON.parse(readFileSync(new URL('palace/rooms.json', dir), 'utf8')) as { rooms: Room[] }).rooms;
  const footprints = loadPalaceFootprints();
  const meta = JSON.parse(readFileSync(new URL('terrain/meta.json', dir), 'utf8')) as TerrainMeta;
  const q25 = decodeH2025(new Uint8Array(inflateSync(readFileSync(new URL('terrain/h2025.u16.deflate', dir)))), meta);
  const q89 = decodeH1789(new Uint8Array(inflateSync(readFileSync(new URL('terrain/h1789.u16.deflate', dir)))), q25);
  const grid = { cols: meta.cols, rows: meta.rows, cell: meta.cell, x0: meta.origin.x, z0: meta.origin.z };
  return {
    rooms,
    footprints,
    h1789: new Heightfield(grid, quantToMetres(q89, meta)),
    h2025: new Heightfield(grid, quantToMetres(q25, meta)),
  };
}
