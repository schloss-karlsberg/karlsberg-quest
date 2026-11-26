import { GROUND, type PathGraphFile } from '../../data/types';
import type { GridDesc } from '../../world/heightfield';
import type { MapView } from '../travel/map-art';

/** Draw only the walk graph edges visible in the local window. */
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

const GRAVEL = [228, 191, 121, 232];
const COBBLES = [117, 99, 85, 224];
const SAND = [221, 197, 147, 208];

/** A transparent texel per terrain cell, with ink on the historical path surfaces. */
export function paintHistoricPaths(g: CanvasRenderingContext2D, ground: Uint8Array, grid: GridDesc): void {
  const layer = g.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < ground.length; i++) {
    const surface = ground[i];
    if (surface === GROUND.gravel) layer.data.set(GRAVEL, i * 4);
    else if (surface === GROUND.cobbles) layer.data.set(COBBLES, i * 4);
    else if (surface === GROUND.sand || surface === GROUND.parterre_sand) layer.data.set(SAND, i * 4);
  }
  g.putImageData(layer, 0, 0);
}

/** Align the image's top-left edge half a cell northwest of the first sample centre. */
export function drawHistoricPaths(g: CanvasRenderingContext2D, layer: HTMLCanvasElement, grid: GridDesc, view: MapView): void {
  const sw = view.width * view.mpp / grid.cell;
  const sh = view.height * view.mpp / grid.cell;
  const sx = (view.cx - grid.x0) / grid.cell + 0.5 - sw / 2;
  const sy = (view.cz - grid.z0) / grid.cell + 0.5 - sh / 2;
  g.drawImage(layer, sx, sy, sw, sh, 0, 0, view.width, view.height);
}
