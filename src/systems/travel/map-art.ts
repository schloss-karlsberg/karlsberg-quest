import type { Footprint, GameData } from '../../data/types';

export interface MapView {
  cx: number;
  cz: number;
  /** Metres per canvas pixel. Grid north (−z) is up. */
  mpp: number;
  width: number;
  height: number;
}

const SHEET_X = 150;
const SHEET_Z = -2150;
const SHEET_MPP = 2;
const INK = '#2a2118';

let image: HTMLImageElement | null = null;

export function mapImage(data: GameData): HTMLImageElement {
  if (!image) {
    image = new Image();
    image.src = `${data.baseUrl}${data.meta.hist1840.path}`;
  }
  return image;
}

export function drawMapPaper(g: CanvasRenderingContext2D, sheet: HTMLImageElement | null, view: MapView, sheetAlpha = 0.92): void {
  const { cx, cz, mpp, width, height } = view;
  g.fillStyle = '#e8dcc0';
  g.fillRect(0, 0, width, height);
  if (sheet?.complete && sheet.naturalWidth) {
    const sw = width * mpp / SHEET_MPP;
    const sh = height * mpp / SHEET_MPP;
    const sx = (cx - SHEET_X) / SHEET_MPP - sw / 2;
    const sy = (cz - SHEET_Z) / SHEET_MPP - sh / 2;
    g.globalAlpha = sheetAlpha;
    g.drawImage(sheet, sx, sy, sw, sh, 0, 0, width, height);
    g.globalAlpha = 1;
  }
  g.fillStyle = 'rgba(232, 214, 176, 0.22)';
  g.fillRect(0, 0, width, height);
}

interface MapFootprint {
  ring: Footprint['ring'];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

const footprintCache = new WeakMap<readonly Footprint[], MapFootprint[]>();

function mapFootprints(buildings: readonly Footprint[]): MapFootprint[] {
  let footprints = footprintCache.get(buildings);
  if (!footprints) {
    footprints = [];
    for (const { ring } of buildings) {
      if (!ring.length) continue;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const [x, z] of ring) {
        minX = Math.min(minX, x);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxZ = Math.max(maxZ, z);
      }
      footprints.push({ ring, minX, minZ, maxX, maxZ });
    }
    footprintCache.set(buildings, footprints);
  }
  return footprints;
}

export function drawMapFootprints(g: CanvasRenderingContext2D, buildings: readonly Footprint[], view: MapView, alpha = 1): void {
  const { cx, cz, mpp, width, height } = view;
  const reachX = (width / 2 + 1) * mpp;
  const reachZ = (height / 2 + 1) * mpp;
  const footprints = mapFootprints(buildings);
  g.lineWidth = 1;
  g.fillStyle = 'rgba(140, 47, 31, 0.16)';
  g.strokeStyle = 'rgba(42, 33, 24, 0.7)';
  g.globalAlpha = alpha;
  for (let b = 0; b < footprints.length; b++) {
    const { ring, minX, minZ, maxX, maxZ } = footprints[b]!;
    if (maxX < cx - reachX || minX > cx + reachX || maxZ < cz - reachZ || minZ > cz + reachZ) continue;
    g.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const point = ring[i]!;
      const px = (point[0] - cx) / mpp + width / 2;
      const py = (point[1] - cz) / mpp + height / 2;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.globalAlpha = 1;
}

export function drawMapGoal(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI / 4);
  g.fillStyle = 'rgba(181, 139, 61, 0.9)';
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.fillRect(-size / 2, -size / 2, size, size);
  g.strokeRect(-size / 2, -size / 2, size, size);
  g.restore();
}

/** Heading in clockwise radians, with zero pointing up the map. */
export function drawMapPlayer(g: CanvasRenderingContext2D, x: number, y: number, heading: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(heading);
  g.fillStyle = '#8c2f1f';
  g.strokeStyle = '#f3ead6';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -10);
  g.lineTo(6, 7);
  g.lineTo(0, 3);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
