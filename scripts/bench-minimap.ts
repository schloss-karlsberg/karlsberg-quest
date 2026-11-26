import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { GameData, PathGraphFile, TerrainMeta } from '../src/data/types';
import { drawModernPaths, paintHistoricPaths } from '../src/systems/minimap/paths';
import { MAP_MPP, MAP_SIZE, mapStyle } from '../src/systems/minimap/projection';
import { drawMapFootprints, drawMapGoal, drawMapPaper, drawMapPlayer } from '../src/systems/travel/map-art';

const graph = JSON.parse(readFileSync('public/data/paths.json', 'utf8')) as PathGraphFile;
const { buildings } = JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as GameData['footprints'];
const { cols, rows, cell, origin, files } = JSON.parse(readFileSync('public/data/terrain/meta.json', 'utf8')) as TerrainMeta;
const ground = inflateSync(readFileSync(`public/data/${files.ground.path}`));
const sheet = { complete: true, naturalWidth: cols } as HTMLImageElement;
const noop = () => {};
const g = {
  fillRect: noop, drawImage: noop, strokeRect: noop, beginPath: noop, closePath: noop,
  moveTo: noop, lineTo: noop, fill: noop, stroke: noop, save: noop, restore: noop, translate: noop, rotate: noop,
  createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  putImageData: noop,
} as unknown as CanvasRenderingContext2D;

const prepareStart = performance.now();
paintHistoricPaths(g, ground, { cols, rows, cell, x0: origin.x, z0: origin.z });
console.info(`Historical layer buffer allocation and painting: ${(performance.now() - prepareStart).toFixed(3)} ms (${ground.length} cells)`);

const view = { cx: 1000, cz: -1000, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
const style = mapStyle('today');
function draw(i: number): void {
  view.cx = 800 + i % 850;
  drawMapPaper(g, sheet, view, style.sheetAlpha);
  drawModernPaths(g, graph, view);
  drawMapFootprints(g, buildings, view, style.footprintAlpha);
  drawMapGoal(g, 80, 50, 9);
  drawMapPlayer(g, 72, 72, i / 20);
}

for (let i = 0; i < 500; i++) draw(i);
const start = performance.now();
for (let i = 0; i < 1000; i++) draw(i);
console.info(`Present-day minimap CPU with a stub canvas: ${((performance.now() - start) / 1000).toFixed(3)} ms/redraw`);
