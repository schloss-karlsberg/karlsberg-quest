import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import type { GameData, PathGraphFile } from '../src/data/types';
import { drawModernPaths } from '../src/systems/minimap/paths';
import { MAP_MPP, MAP_SIZE, mapStyle, playerHeading, projectMarker } from '../src/systems/minimap/projection';
import { drawMapFootprints, drawMapGoal, drawMapPaper, drawMapPlayer } from '../src/systems/travel/map-art';

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

  it('switches from modern paths to the historic sheet and back on the same grid', () => {
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

it('measures minimap CPU work with the shipped map data', () => {
  const graph = JSON.parse(readFileSync('public/data/paths.json', 'utf8')) as PathGraphFile;
  const { buildings } = JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as GameData['footprints'];
  const sheet = { complete: true, naturalWidth: 1075 } as HTMLImageElement;
  let commands = 0;
  const count = () => { commands++; };
  const g = {
    fillRect: count, drawImage: count, strokeRect: count, beginPath: count, closePath: count,
    moveTo: count, lineTo: count, fill: count, stroke: count, save: count, restore: count,
    translate: count, rotate: count,
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
  console.info(`minimap CPU with a counting canvas: ${ms.toFixed(3)} ms/redraw`);
  expect(commands).toBeGreaterThan(1500);
});
