import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { GROUND, type GameData, type PathGraphFile } from '../src/data/types';
import minimap from '../src/systems/minimap';
import { drawHistoricPaths, drawModernPaths, paintHistoricPaths } from '../src/systems/minimap/paths';
import { MAP_MPP, MAP_SIZE, mapStyle, playerHeading, projectMarker } from '../src/systems/minimap/projection';
import { drawMapFootprints, drawMapGoal, drawMapPaper, drawMapPlayer } from '../src/systems/travel/map-art';
import { Hud } from '../src/ui/hud';

describe('minimap projection', () => {
  const view = { cx: 100, cz: -300, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
  const pixel = { x: 0, y: 0 };

  it('centres the player and projects east right and north up', () => {
    projectMarker(pixel, view, 100, -300, 9);
    expect(pixel).toEqual({ x: 72, y: 72 });
    projectMarker(pixel, view, 125, -350, 9);
    expect(pixel).toEqual({ x: 92, y: 32 });
    projectMarker(pixel, { ...view, cx: 125, cz: -350 }, 125, -350, 9);
    expect(pixel).toEqual({ x: 72, y: 72 });
  });

  it('clamps distant markers to the inset edge along their bearing', () => {
    projectMarker(pixel, view, -1100, -300, 9);
    expect(pixel).toEqual({ x: 9, y: 72 });
    projectMarker(pixel, view, 100, 900, 9);
    expect(pixel).toEqual({ x: 72, y: 135 });
    projectMarker(pixel, view, 1300, -900, 9);
    expect(pixel).toEqual({ x: 135, y: 40.5 });
  });

  it('switches from the walk graph to historical paths and back on the same grid', () => {
    const today = mapStyle('today');
    expect(today.modernPaths).toBe(true);
    const past = mapStyle('1789');
    expect(past.modernPaths).toBe(false);
    expect(past.sheetAlpha).toBeGreaterThan(today.sheetAlpha);
    expect(mapStyle('1796')).toBe(past);
    expect(mapStyle('today')).toBe(today);
  });

  it('uses the full clockwise heading or snaps in 45-degree steps', () => {
    expect(playerHeading(-Math.PI / 3, false)).toBe(Math.PI / 3);
    expect(playerHeading(-Math.PI / 3, true)).toBe(Math.PI / 4);
    expect(playerHeading(Math.PI / 3, true)).toBe(-Math.PI / 4);
  });

  it('defaults on for old settings and persists the off switch', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ subtitleSize: 'l' }));
    const settings = new SettingsStore(storage);
    expect(settings.state.minimap).toBe(true);
    settings.update((s) => (s.minimap = false), 'minimap');
    const restored = new SettingsStore(storage);
    expect(restored.state.minimap).toBe(false);
    expect(restored.state.subtitleSize).toBe('l');
  });
});

it('projects the Registratur entrance rather than its room from the Küchenhof before quest acceptance', () => {
  const hud = Object.create(Hud.prototype) as Hud;
  const player = { x: 1212, z: -1166 };
  const room = { x: 1202, z: -1153 };
  const door = { x: 1218, z: -1161 };
  hud.storyTarget = room;
  hud.questLead = { story: room, target: door };
  expect(hud.objectiveTarget).toBe(door);
  const pixel = { x: 0, y: 0 };
  const view = { cx: player.x, cz: player.z, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
  projectMarker(pixel, view, hud.objectiveTarget!.x!, hud.objectiveTarget!.z!, 9);
  expect(pixel).toEqual({ x: 76.8, y: 76 });

  // A different lead must not override a visible story objective, even at the same coordinates.
  hud.questLead = { target: door };
  expect(hud.objectiveTarget).toBe(room);
  hud.questLead = { story: room, target: door };
  hud.storyTarget = { ...room };
  expect(hud.objectiveTarget).toBe(hud.storyTarget);
  hud.storyTarget = { x: room.x };
  expect(hud.objectiveTarget).toBe(door);
});

it('submits nearby path edges, including a segment that crosses the viewport', () => {
  const segments: number[][] = [];
  const g = {
    beginPath() {},
    moveTo(x: number, y: number) { segments.push([x, y]); },
    lineTo(x: number, y: number) { segments.at(-1)!.push(x, y); },
    stroke() {},
  } as unknown as CanvasRenderingContext2D;
  const graph: PathGraphFile = {
    format: 'kq-paths-v1', kinds: ['path'], lines: [],
    nodes: [-100, 0, 0, 100, 0, 0, -100, 0, 100, 100, 0, 100],
    edges: [0, 1, 0, 0, 2, 3, 0, 0],
  };
  drawModernPaths(g, graph, { cx: 0, cz: 0, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP });
  expect(segments).toEqual([[-8, 72, 152, 72]]);
});

it('inks the historical terrain path cells and centres their pixels on the terrain samples', () => {
  const grid = { cols: 3, rows: 2, cell: 2, x0: 151, z0: -2149 };
  const data = new Uint8ClampedArray(grid.cols * grid.rows * 4);
  const createImageData = vi.fn(() => ({ data }));
  const putImageData = vi.fn();
  const drawImage = vi.fn();
  const g = { createImageData, putImageData, drawImage } as unknown as CanvasRenderingContext2D;
  const ground = Uint8Array.of(GROUND.forest, GROUND.gravel, GROUND.building, GROUND.cobbles, GROUND.sand, GROUND.parterre_sand);
  paintHistoricPaths(g, ground, grid);
  expect(createImageData).toHaveBeenCalledWith(3, 2);
  expect(putImageData).toHaveBeenCalledWith({ data }, 0, 0);
  expect([data[3], data[7], data[11], data[15], data[19], data[23]]).toEqual([0, 232, 0, 224, 208, 208]);

  const layer = {} as HTMLCanvasElement;
  // The view starts at the north-west edge of the gravel cell and reaches the east edge of the grid.
  drawHistoricPaths(g, layer, grid, { cx: 154, cz: -2148, width: 4, height: 4, mpp: 1 });
  expect(drawImage).toHaveBeenCalledWith(layer, 1, 0, 2, 2, 0, 0, 4, 4);
});

it('keeps the staged and survey visibility rules on the canvas', () => {
  const css = readFileSync('src/systems/minimap/minimap.css', 'utf8');
  expect(css).toMatch(/\.kq-hud:is\([^)]*\[data-kq-mode='staged'\][^)]*\)\)\s*> \.kq-minimap,[^{]*\{\s*display: none;/);
  expect(css).toMatch(/survey\[aria-expanded='true'\]\)\s+\.kq-minimap\s*\{\s*display: none;/);
});

it('skips canvas commands while CSS hides the minimap and resumes when visible', () => {
  const fillRect = vi.fn();
  const noop = () => {};
  const g = { fillRect, beginPath: noop, stroke: noop, save: noop, translate: noop, rotate: noop,
    moveTo: noop, lineTo: noop, closePath: noop, fill: noop, restore: noop, strokeText: noop, fillText: noop };
  const canvas = { hidden: true, offsetWidth: 0, getContext: () => g, setAttribute: noop, remove: noop };
  const hud = { staged: false };
  vi.stubGlobal('Node', class {});
  vi.stubGlobal('document', { documentElement: { hasAttribute: () => false }, createElement: () => canvas });
  vi.stubGlobal('Image', class {
    complete = true;
    removeEventListener() {}
  });
  const ctx = {
    t: (key: string) => key,
    settings: new SettingsStore(new MemoryStorage()),
    events: new EventBus(),
    pause: { paused: false },
    loop: { requestRender: noop },
    ui: { add: noop, hud },
    player: { position: { x: 0, z: 0 }, yaw: 0 },
    era: { current: 'today' },
    data: { baseUrl: '/', meta: { hist1840: { path: 'historic.png' } }, paths: { nodes: [], edges: [] }, footprints: { buildings: [] } },
  } as unknown as GameContext;
  try {
    minimap.init(ctx);
    expect(canvas.hidden).toBe(false);
    minimap.frame(0.1);
    expect(fillRect).not.toHaveBeenCalled();
    canvas.offsetWidth = MAP_SIZE;
    hud.staged = true;
    minimap.frame(0.1);
    expect(fillRect).not.toHaveBeenCalled();
    hud.staged = false;
    minimap.frame(0.1);
    expect(fillRect).toHaveBeenCalledTimes(2);
    canvas.offsetWidth = 0;
    minimap.frame(0.1);
    expect(fillRect).toHaveBeenCalledTimes(2);
  } finally {
    minimap.dispose();
    vi.unstubAllGlobals();
  }
});

it('reserves the full touch pill reach in the lit notice-dock rule', () => {
  // Check the stylesheet's shared geometry. The phone spec checks the resulting browser boxes.
  const touch = readFileSync('src/ui/touch.css', 'utf8');
  const css = readFileSync('src/systems/minimap/minimap.css', 'utf8');
  expect(touch).toMatch(/--kq-t-action-reach: calc\(var\(--kq-t-arc-inset\) \+ \(var\(--kq-t-action-right\) \+ var\(--kq-t-action-max-width\)\) \* var\(--kq-t-arc-scale\)\)/);
  const litDock = css.match(/\.interact\.lit\)[^{]*\.kq-toasts\s*\{([^}]+)\}/)?.[1];
  expect(litDock).toContain('var(--kq-safe-r) + var(--kq-t-action-reach) + 8px) / var(--kq-t-hud-zoom)');
  expect(litDock).toMatch(/^\s*right: var\(--kq-minimap-notice-right\);/m);
});

it('draws each layer at the tour car park and culls all but the nearby footprint', () => {
  const graph = JSON.parse(readFileSync('public/data/paths.json', 'utf8')) as PathGraphFile;
  const { buildings } = JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as GameData['footprints'];
  const ops = {
    fillRect: vi.fn(), drawImage: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(),
  };
  const g = ops as unknown as CanvasRenderingContext2D;
  const view = { cx: 524, cz: -770, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
  const style = mapStyle('today');
  const sheet = { complete: true, naturalWidth: 1075 } as HTMLImageElement;
  drawMapPaper(g, sheet, view, style.sheetAlpha);
  expect(ops.fillRect).toHaveBeenCalledTimes(2);
  expect(ops.drawImage).toHaveBeenCalledWith(sheet, 142, 645, 90, 90, 0, 0, 144, 144);
  drawModernPaths(g, graph, view);
  expect(ops.moveTo).toHaveBeenCalledTimes(36);
  expect(ops.lineTo).toHaveBeenCalledTimes(36);
  expect(ops.stroke).toHaveBeenCalledTimes(2);
  drawMapFootprints(g, buildings, view, style.footprintAlpha);
  expect(ops.beginPath).toHaveBeenCalledTimes(2);
  expect(ops.closePath).toHaveBeenCalledTimes(1);
  expect(ops.lineTo).toHaveBeenCalledTimes(39);
  expect(ops.fill).toHaveBeenCalledTimes(1);
  expect(ops.stroke).toHaveBeenCalledTimes(3);
  drawMapFootprints(g, buildings, { ...view, cx: 0, cz: 0 }, style.footprintAlpha);
  expect(ops.beginPath).toHaveBeenCalledTimes(2);
  expect(ops.fill).toHaveBeenCalledTimes(1);
  drawMapGoal(g, 80, 50, 9);
  expect(ops.translate).toHaveBeenNthCalledWith(1, 80, 50);
  expect(ops.rotate).toHaveBeenNthCalledWith(1, Math.PI / 4);
  expect(ops.fillRect).toHaveBeenLastCalledWith(-4.5, -4.5, 9, 9);
  expect(ops.strokeRect).toHaveBeenCalledWith(-4.5, -4.5, 9, 9);
  drawMapPlayer(g, 72, 72, Math.PI / 2);
  expect(ops.translate).toHaveBeenNthCalledWith(2, 72, 72);
  expect(ops.rotate).toHaveBeenNthCalledWith(2, Math.PI / 2);
  expect(ops.moveTo).toHaveBeenLastCalledWith(0, -10);
  expect(ops.lineTo).toHaveBeenLastCalledWith(-6, 7);
  expect(ops.fill).toHaveBeenCalledTimes(2);
  expect(ops.stroke).toHaveBeenCalledTimes(4);
});

it('reports informational minimap CPU time with the shipped map data', () => {
  const graph = JSON.parse(readFileSync('public/data/paths.json', 'utf8')) as PathGraphFile;
  const { buildings } = JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as GameData['footprints'];
  const sheet = { complete: true, naturalWidth: 1075 } as HTMLImageElement;
  const noop = () => {};
  const g = {
    fillRect: noop, drawImage: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop,
  } as unknown as CanvasRenderingContext2D;
  const view = { cx: 1000, cz: -1000, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
  const style = mapStyle('today');
  const draw = (i: number) => {
    view.cx = 800 + i % 850;
    drawMapPaper(g, sheet, view, style.sheetAlpha);
    drawModernPaths(g, graph, view);
    drawMapFootprints(g, buildings, view, style.footprintAlpha);
    drawMapGoal(g, 80, 50, 9);
    drawMapPlayer(g, 72, 72, i / 20);
  };
  for (let i = 0; i < 500; i++) draw(i);
  const start = performance.now();
  for (let i = 0; i < 1000; i++) draw(i);
  const ms = (performance.now() - start) / 1000;
  console.info(`minimap CPU with a stub canvas: ${ms.toFixed(3)} ms/redraw`);
});
