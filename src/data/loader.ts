import { decodeCanopy, decodeH1789, decodeH2025, inflate, quantToMetres } from './decode';
import type { GameData, PathGraphFile, Poi, Room, TerrainMeta } from './types';

/** Base URL of the prepared data (Vite `public/data`, works under any sub-path). */
export const DATA_URL = `${import.meta.env.BASE_URL}data/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res;
}
const json = async <T>(url: string): Promise<T> => (await fetchOk(url)).json() as Promise<T>;
const bin = async (url: string): Promise<Uint8Array> => inflate(await (await fetchOk(url)).arrayBuffer());

export async function loadGameData(baseUrl = DATA_URL, onProgress?: (done: number, total: number) => void): Promise<GameData> {
  const meta = await json<TerrainMeta>(`${baseUrl}terrain/meta.json`);
  let done = 0;
  const total = 8;
  const tick = <T>(p: Promise<T>) =>
    p.then((v) => {
      onProgress?.(++done, total);
      return v;
    });
  const [b2025, b1789, ground, canopy, footprints, rooms, pois, paths, attribution] = await Promise.all([
    tick(bin(`${baseUrl}${meta.files.h2025.path}`)),
    tick(bin(`${baseUrl}${meta.files.h1789.path}`)),
    tick(bin(`${baseUrl}${meta.files.ground.path}`)),
    tick(bin(`${baseUrl}${meta.files.canopy.path}`)),
    tick(json<GameData['footprints']>(`${baseUrl}palace/footprints.json`)),
    tick(json<{ rooms: Room[] }>(`${baseUrl}palace/rooms.json`)),
    tick(json<{ pois: Poi[] }>(`${baseUrl}pois.json`)),
    json<PathGraphFile>(`${baseUrl}paths.json`),
    json<GameData['attribution']>(`${baseUrl}attribution.json`),
  ]);
  const q2025 = decodeH2025(b2025, meta);
  const q1789 = decodeH1789(b1789, q2025);
  return {
    meta,
    heights: { '2025': quantToMetres(q2025, meta), '1789': quantToMetres(q1789, meta) },
    ground,
    canopy: decodeCanopy(canopy),
    footprints,
    rooms: rooms.rooms,
    pois: pois.pois,
    paths,
    attribution,
    baseUrl,
  };
}
