import type { PathGraphFile } from '../../data/types';
import type { MapView } from '../travel/map-art';

/** Draw only the walk graph edges visible in the local window. The historic paths are on the sheet. */
export function drawModernPaths(g: CanvasRenderingContext2D, { nodes, edges }: PathGraphFile, view: MapView): void {
  const { cx, cz, mpp, width, height } = view;
  const halfW = width / 2;
  const halfH = height / 2;
  const reachX = (halfW + 1) * mpp;
  const reachZ = (halfH + 1) * mpp;
  g.beginPath();
  for (let i = 0; i < edges.length; i += 4) {
    const a = edges[i]! * 3;
    const b = edges[i + 1]! * 3;
    const ax = nodes[a]! - cx;
    const az = nodes[a + 2]! - cz;
    const bx = nodes[b]! - cx;
    const bz = nodes[b + 2]! - cz;
    if ((ax < -reachX && bx < -reachX) || (ax > reachX && bx > reachX) ||
        (az < -reachZ && bz < -reachZ) || (az > reachZ && bz > reachZ)) continue;
    g.moveTo(halfW + ax / mpp, halfH + az / mpp);
    g.lineTo(halfW + bx / mpp, halfH + bz / mpp);
  }
  g.strokeStyle = '#f3ead6';
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = '#69543d';
  g.lineWidth = 1.4;
  g.stroke();
}
