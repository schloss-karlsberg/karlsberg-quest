import type { Era } from '../../core/era';
import type { MapView } from '../travel/map-art';

export const MAP_SIZE = 144;
export const MAP_MPP = 1.25;

/** Both eras use the same grid so places stay put across a shift. */
export const mapStyle = (era: Era) => era === 'today' ? TODAY : PAST;

const TODAY = { sheetAlpha: 0.34, footprintAlpha: 0.48, modernPaths: true };
const PAST = { sheetAlpha: 0.92, footprintAlpha: 1, modernPaths: false };

export interface MarkerPixel {
  x: number;
  y: number;
}

/** Project into the inset rectangle, preserving the bearing of off-screen markers. */
export function projectMarker(out: MarkerPixel, view: MapView, x: number, z: number, inset: number): void {
  const dx = (x - view.cx) / view.mpp;
  const dy = (z - view.cz) / view.mpp;
  const halfW = view.width / 2;
  const halfH = view.height / 2;
  const scale = Math.max(1, Math.abs(dx) / (halfW - inset), Math.abs(dy) / (halfH - inset));
  out.x = halfW + dx / scale;
  out.y = halfH + dy / scale;
}

export function playerHeading(yaw: number, reducedMotion: boolean): number {
  const heading = -yaw;
  const step = Math.PI / 4;
  return reducedMotion ? Math.round(heading / step) * step : heading;
}
