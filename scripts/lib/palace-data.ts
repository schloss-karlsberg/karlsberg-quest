/**
 * Palace part of the data prep: the 1789 light model (glb, copied verbatim), its footprints and the
 * room programme, read READ-ONLY from the sister project's published reconstruction.
 *
 * Rooms are pinned by default: `public/data/palace/rooms.json` is the game's own copy of the room
 * programme (catalogue v2 as of the 2026-11-01 export). The quests, the interiors and chapter 3 name
 * these rooms (B04.1.eg-waffensammlung, B04.2.og-bibliothek, the Naturalienkabinett's place …); the
 * sister catalogue's later research waves moved and dropped some of them. A refresh therefore keeps
 * rooms.json and only checks that every room still fits its building's new footprint. Set
 * `rooms: 'catalogue'` (KQ_ROOMS=catalogue) to regenerate it from the catalogue deliberately.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type P2, centroid, nearestOnLine, openRing, planFrame, stToEN } from './frame.ts';

export interface PalaceInputs {
  /** Sister `app/public/data/shared/karlsberg1789` (index.json, buildings.glb, footprints.geojson). */
  recon: string;
  /** Sister `schloss-karlsberg/model/catalogue.json`. */
  catalogue: string;
  /** Output root (`public/data`). */
  out: string;
  rooms: 'pinned' | 'catalogue';
  E0: number;
  N0: number;
  log: (...a: unknown[]) => void;
}

export interface PalaceResult {
  footprints: number;
  rooms: number;
  /** The reconstruction's index.json (attribution, disclaimer, anchor). */
  reconIndex: { attribution: string; disclaimer_de: string; anchor: { E: number; N: number } };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const readJson = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));

function pointInRing(pt: P2, ring: readonly P2[]): boolean {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function distToRing(pt: P2, ring: readonly P2[]): number {
  const q = nearestOnLine([...ring, ring[0]!], pt);
  return Math.hypot(q[0] - pt[0], q[1] - pt[1]);
}

/** Rooms of the catalogue in local x/z (the frame rules of research/05 via scripts/lib/frame.ts). */
function catalogueRooms(catalogue: any, toLocal: (E: number, N: number) => P2): any[] {
  const catById = new Map<string, any>(catalogue.buildings.map((b: any) => [b.id, b]));
  function courtTowardEN(b: any, from: P2): P2 {
    const v = b.court_toward;
    if (Array.isArray(v)) return v as P2;
    if (typeof v === 'string') {
      const f = catalogue.terrain_features.find((x: any) => x.id === v);
      if (f) {
        const gg = f.geometry;
        if (gg.type === 'LineString') return nearestOnLine(gg.coordinates, from);
        if (gg.type === 'Polygon') return centroid(gg.coordinates[0]);
        if (gg.type === 'Point') return [gg.coordinates[0], gg.coordinates[1]];
        if (gg.type === 'MultiPoint') {
          const n = gg.coordinates.length;
          return [gg.coordinates.reduce((s: number, p: P2) => s + p[0], 0) / n, gg.coordinates.reduce((s: number, p: P2) => s + p[1], 0) / n];
        }
      }
      const ob = catById.get(v);
      if (ob?.footprint) return centroid(ob.footprint);
    }
    return catalogue.palace_grid.origin_EN as P2;
  }
  const evidenceOf = (tag: string | undefined): string => {
    const m = /^\s*(HMS|D->|D|I|N|U)\b/.exec(tag ?? '');
    return m ? m[1]! : 'U';
  };
  const rooms: any[] = [];
  for (const b of catalogue.buildings) {
    if (!b.rooms?.length || !b.footprint) continue;
    const ring = b.footprint as P2[];
    const frame = planFrame(ring, courtTowardEN(b, centroid(ring)));
    for (const room of b.rooms) {
      const poly = (room.polygon as P2[]).map((p) => {
        const [E, N] = stToEN(frame, p);
        return toLocal(E, N).map(r2);
      });
      const storey = b.storeys[room.storey];
      rooms.push({
        id: `${b.id}/${room.id}`,
        roomId: room.id,
        building: b.id,
        name_de: room.name_de,
        function: room.function,
        storey: room.storey,
        storey_de: storey?.name ?? null,
        floor_h: room.floor_h,
        ceiling_h: room.ceiling_h,
        evidence: evidenceOf(room.tag),
        tag: room.tag,
        polygon: poly,
      });
    }
  }
  return rooms;
}

export function preparePalace(inp: PalaceInputs): PalaceResult {
  const { recon, out, E0, N0, log } = inp;
  const toLocal = (E: number, N: number): P2 => [E - E0, -(N - N0)];
  const write = (rel: string, data: string) => {
    const p = join(out, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  };
  mkdirSync(join(out, 'palace'), { recursive: true });
  copyFileSync(join(recon, 'buildings.glb'), join(out, 'palace/buildings.glb'));
  const reconIndex = readJson(join(recon, 'index.json'));
  const catalogue = readJson(inp.catalogue);
  const catById = new Map<string, any>(catalogue.buildings.map((b: any) => [b.id, b]));
  const reconById = new Map<string, any>(reconIndex.buildings.map((b: any) => [b.id, b]));
  const fpGeo = readJson(join(recon, 'footprints.geojson'));
  const footprints = fpGeo.features.map((f: any) => {
    const id = f.properties.id as string;
    const cat = catById.get(id);
    const rec = reconById.get(id);
    const ring = openRing(f.geometry.coordinates[0]).map(([E, N]: P2) => toLocal(E, N).map(r2));
    return {
      id,
      name_de: f.properties.name_de,
      confidence: f.properties.confidence,
      base_h: cat?.base_h ?? null,
      eaves_h: rec?.eaves_h ?? null,
      ridge_h: rec?.ridge_h ?? null,
      cls: cat?.cls ?? rec?.cls ?? null,
      interior: cat?.interior ?? null,
      ring,
    };
  });

  const fromCatalogue = catalogueRooms(catalogue, toLocal);
  const roomsPath = join(out, 'palace/rooms.json');
  let roomsDoc: any;
  if (inp.rooms === 'catalogue' || !existsSync(roomsPath)) {
    roomsDoc = { format: 'kq-rooms-v1', catalogueVersion: catalogue.version, note: 'polygon = room outline in local x/z (open ring); floor_h/ceiling_h absolute heights; evidence = leading tag D/D->/I/N/U/HMS', rooms: fromCatalogue };
  } else {
    roomsDoc = readJson(roomsPath);
    // what the catalogue would change (information only: the game keeps its programme)
    const pinned = new Map<string, any>(roomsDoc.rooms.map((r: any) => [r.id, r]));
    const fresh = new Map<string, any>(fromCatalogue.map((r: any) => [r.id, r]));
    const dropped = [...pinned.keys()].filter((id) => !fresh.has(id));
    const added = [...fresh.keys()].filter((id) => !pinned.has(id));
    const moved = [...pinned.values()]
      .filter((r) => fresh.has(r.id))
      .map((r) => {
        const c = (p: P2[]) => p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]);
        const a = c(r.polygon);
        const b = c(fresh.get(r.id).polygon);
        return [r.id, Math.hypot(a[0] - b[0], a[1] - b[1])] as const;
      })
      .filter(([, d]) => d > 1);
    log(`rooms: pinned (${pinned.size}); catalogue v${catalogue.version} would drop ${dropped.length} [${dropped.join(', ')}], add ${added.length}, move ${moved.length} by > 1 m [${moved.map(([id, d]) => `${id} ${d.toFixed(1)} m`).join(', ')}]`);
  }
  const rooms = roomsDoc.rooms as any[];

  // Self-check: every room vertex must lie inside (or within 1 m of) its building footprint, and
  // every building with rooms must still be in the export.
  {
    const fpById = new Map<string, P2[]>(footprints.map((f: any) => [f.id, f.ring]));
    let bad = 0;
    let worst = 0;
    const missing = new Set<string>();
    for (const r of rooms) {
      const ring = fpById.get(r.building);
      if (!ring) {
        missing.add(r.building);
        continue;
      }
      for (const v of r.polygon as P2[]) {
        if (pointInRing(v, ring)) continue;
        const d = distToRing(v, ring);
        worst = Math.max(worst, d);
        if (d > 1) bad++;
      }
    }
    log(`rooms: ${rooms.length}; vertices outside footprint by > 1 m: ${bad} (worst ${worst.toFixed(2)} m)`);
    if (missing.size) throw new Error(`rooms of buildings missing from the 1789 export: ${[...missing].join(', ')}`);
    if (bad > 0) throw new Error('rooms no longer fit the footprints - did the catalogue frame rules or a wing change?');
  }

  write('palace/footprints.json', JSON.stringify({ format: 'kq-footprints-v1', disclaimer_de: reconIndex.disclaimer_de, anchor: { x: r2(reconIndex.anchor.E - E0), z: r2(-(reconIndex.anchor.N - N0)) }, buildings: footprints }));
  if (inp.rooms === 'catalogue' || !existsSync(roomsPath)) write('palace/rooms.json', JSON.stringify(roomsDoc));
  log(`palace: ${footprints.length} footprints, ${rooms.length} rooms (${inp.rooms === 'catalogue' ? 'from the catalogue' : 'pinned'})`);
  return { footprints: footprints.length, rooms: rooms.length, reconIndex };
}
