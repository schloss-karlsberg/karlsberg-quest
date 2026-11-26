import { decodeCanopy, decodeH1789, decodeH2025, decodeSurface, inflate, quantToMetres } from './decode';
import type { GameData, PathGraphFile, Poi, Room, TerrainMeta, TerrainReliefMeta, TerrainSurfaceMeta } from './types';

/** Base URL of the prepared data (Vite `public/data`, works under any sub-path). */
export const DATA_URL = `${import.meta.env.BASE_URL}data/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res;
}
const json = async <T>(url: string): Promise<T> => (await fetchOk(url)).json() as Promise<T>;

/** Byte progress of the bulk downloads (Content-Length where the server sends it). */
interface ByteTracker {
  add(): { total(n: number): void; got(n: number): void };
}

/** Read a body in chunks so the loading screen can show real progress. */
async function readBytes(res: Response, slot: ReturnType<ByteTracker['add']> | null): Promise<ArrayBuffer> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (!slot || !res.body || !len || res.headers.get('content-encoding')) return res.arrayBuffer();
  slot.total(len);
  const reader = res.body.getReader();
  const out = new Uint8Array(len);
  let off = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (off + value.length > out.length) return concatRest(out.subarray(0, off), value, reader);
    out.set(value, off);
    off += value.length;
    slot.got(value.length);
  }
  return out.buffer.slice(0, off);
}

async function concatRest(head: Uint8Array, value: Uint8Array, reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = [head, value];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    parts.push(r.value);
  }
  return new Blob(parts as BlobPart[]).arrayBuffer();
}

const bin = async (url: string, slot: ReturnType<ByteTracker['add']> | null = null): Promise<Uint8Array> => inflate(await readBytes(await fetchOk(url), slot));

/** Optional post-start raster, outside the critical terrain fetches. */
export async function loadTerrainSurface(baseUrl: string, meta: TerrainSurfaceMeta): Promise<Uint8Array> {
  return decodeSurface(await bin(`${baseUrl}${meta.path}`), meta);
}

export async function loadTerrainRelief(baseUrl: string, meta: TerrainReliefMeta): Promise<Uint8Array> {
  const data = await bin(`${baseUrl}${meta.path}`);
  if (data.length !== meta.cols * meta.rows) throw new Error('terrain relief: size mismatch');
  return data;
}

export async function loadGameData(baseUrl = DATA_URL, onProgress?: (done: number, total: number) => void): Promise<GameData> {
  const meta = await json<TerrainMeta>(`${baseUrl}terrain/meta.json`);
  let done = 0;
  const total = 9;
  // progress: finished files, refined by the bytes of the four big rasters as they stream in
  let bytesGot = 0;
  let bytesTotal = 0;
  let sized = 0;
  const report = () => {
    const files = done / total;
    const bytes = sized === 4 && bytesTotal > 0 ? bytesGot / bytesTotal : 0;
    onProgress?.(Math.max(files, bytes * 0.95) * total, total);
  };
  const tracker: ByteTracker = {
    add: () => ({
      total: (n) => {
        bytesTotal += n;
        sized++;
      },
      got: (n) => {
        bytesGot += n;
        report();
      },
    }),
  };
  const tick = <T>(p: Promise<T>) =>
    p.then((v) => {
      done++;
      report();
      return v;
    });
  report();
  const [b2025, b1789, ground, canopy, footprints, rooms, pois, paths, attribution] = await Promise.all([
    tick(bin(`${baseUrl}${meta.files.h2025.path}`, tracker.add())),
    tick(bin(`${baseUrl}${meta.files.h1789.path}`, tracker.add())),
    tick(bin(`${baseUrl}${meta.files.ground.path}`, tracker.add())),
    tick(bin(`${baseUrl}${meta.files.canopy.path}`, tracker.add())),
    tick(json<GameData['footprints']>(`${baseUrl}palace/footprints.json`)),
    tick(json<{ rooms: Room[] }>(`${baseUrl}palace/rooms.json`)),
    tick(json<{ pois: Poi[] }>(`${baseUrl}pois.json`)),
    tick(json<PathGraphFile>(`${baseUrl}paths.json`)),
    tick(json<GameData['attribution']>(`${baseUrl}attribution.json`)),
  ]).catch((err: unknown) => {
    // Sibling requests can still report bytes after the boot error is on screen.
    onProgress = undefined;
    throw err;
  });
  const cells = meta.cols * meta.rows;
  if (ground.length !== cells) throw new Error(`ground: expected ${cells} cells, got ${ground.length}`);
  if (canopy.length !== cells) throw new Error(`canopy: expected ${cells} cells, got ${canopy.length}`);
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
