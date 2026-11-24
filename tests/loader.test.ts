import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../src/assets/loader';
import type { AssetEntry } from '../src/assets/types';
import { loadGameData } from '../src/data/loader';
import { LoadingRequests, loadPercent } from '../src/ui/loader';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function requests() {
  vi.useFakeTimers();
  const view = { show: vi.fn(), hide: vi.fn() };
  const loading = new LoadingRequests(view);
  loading.setEnabled(true);
  return { loading, view };
}

describe('Bussole loader', () => {
  it('embeds first-paint markup and reduced-motion styles within the inline budget', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0];
    const markup = html.slice(html.indexOf('<div id="boot-loader"'), html.indexOf('<script type="module"'));
    expect(style).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{[^}]+animation: none/);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Lädt …"');
    expect(markup).not.toContain('aria-valuenow');
    expect(Buffer.byteLength((style ?? '') + markup)).toBeLessThan(3000);
  });

  it('clamps measured progress and leaves zero and unknown totals indeterminate', () => {
    expect(loadPercent(2, 3)).toBe(67);
    expect(loadPercent(105, 100)).toBe(100);
    expect(loadPercent(-1, 100)).toBe(0);
    expect(loadPercent(0, 0)).toBeUndefined();
    expect(loadPercent(1, Number.NaN)).toBeUndefined();
  });

  it('delays each request and skips one that finishes before 300 ms', () => {
    const { loading, view } = requests();
    const quick = loading.begin('cache');
    vi.advanceTimersByTime(299);
    expect(view.show).not.toHaveBeenCalled();
    quick.finish();
    vi.advanceTimersByTime(1);
    expect(view.show).not.toHaveBeenCalled();

    const slow = loading.begin('terrain');
    slow.progress(30, 100);
    vi.advanceTimersByTime(300);
    expect(view.show).toHaveBeenLastCalledWith('terrain', 30);
    slow.progress(10, 100);
    expect(view.show).toHaveBeenLastCalledWith('terrain', 30);
    slow.finish();
    expect(view.hide).toHaveBeenCalledOnce();
  });

  it('prioritises an active tool over background requests and isolates their completion', () => {
    const { loading, view } = requests();
    const oldArea = loading.begin('first scenery set');
    const xray = loading.begin('point cloud', 2);
    const newArea = loading.begin('second scenery set');
    vi.advanceTimersByTime(300);
    expect(view.show).toHaveBeenLastCalledWith('point cloud', undefined);
    oldArea.finish();
    oldArea.progress(100, 100);
    expect(view.show).toHaveBeenLastCalledWith('point cloud', undefined);
    expect(view.hide).not.toHaveBeenCalled();
    xray.finish();
    expect(view.show).toHaveBeenLastCalledWith('second scenery set', undefined);
    loading.setEnabled(false);
    expect(view.hide).toHaveBeenCalledOnce();
    newArea.finish();
    loading.setEnabled(true);
    expect(view.show).toHaveBeenLastCalledWith('second scenery set', undefined);
  });
});

describe('loading progress', () => {
  const meta = {
    cols: 1, rows: 1, hMin: 300, heightScale: 0.01,
    files: {
      h2025: { path: 'h2025.deflate' }, h1789: { path: 'h1789.deflate' },
      ground: { path: 'ground.deflate' }, canopy: { path: 'canopy.deflate' },
    },
  };
  function terrainResponse(url: string): Response {
    if (url.endsWith('meta.json')) return Response.json(meta);
    if (url.endsWith('.deflate')) return new Response(Uint8Array.from(deflateSync(new Uint8Array(2))));
    return Response.json({ rooms: [], pois: [] });
  }

  it('counts all terrain requests when the responses carry no Content-Length', async () => {
    const fetch = vi.fn(async (url: string) => terrainResponse(url));
    vi.stubGlobal('fetch', fetch);
    const progress = vi.fn();
    await expect(loadGameData('/data/', progress)).resolves.toMatchObject({ meta });
    const total = fetch.mock.calls.length - 1;
    expect(progress.mock.calls).toEqual(Array.from({ length: total + 1 }, (_, done) => [done, total]));
  });

  it('stops reporting progress after a terrain request fails', async () => {
    let releasePaths!: (response: Response) => void;
    const paths = new Promise<Response>((resolve) => { releasePaths = resolve; });
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('paths.json')) return paths;
      if (url.endsWith('pois.json')) return new Response(null, { status: 503 });
      return terrainResponse(url);
    });
    const progress = vi.fn();
    await expect(loadGameData('/data/', progress)).rejects.toThrow('HTTP 503');
    progress.mockClear();
    releasePaths(Response.json({}));
    await setImmediate();
    expect(progress).not.toHaveBeenCalled();
  });

  it('accounts for cached and failed entries while streaming an explicit area', async () => {
    const entries: AssetEntry[] = ['cached', 'stream', 'failed'].map((id) => ({
      id, kind: 'model', url: id + '.glb', area: 'forest', bytes: 100, licence: 'test',
    }));
    const assets = new AssetLoader(null, '/', new Map(entries.map((entry) => [entry.id, entry])));
    let finishStream!: () => void;
    let failModel!: (err: Error) => void;
    const streamed = new Promise<void>((resolve) => { finishStream = resolve; });
    const failed = new Promise<void>((_, reject) => { failModel = reject; });
    vi.spyOn(assets, 'load').mockImplementation((id, onBytes) => {
      if (id === 'cached') return Promise.resolve();
      if (id === 'stream') {
        onBytes?.(25);
        return streamed;
      }
      return failed;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feedback = { progress: vi.fn(), finish: vi.fn() };
    const callback = vi.fn();
    assets.onAreaLoad = () => feedback;

    const load = assets.loadArea('forest', callback);
    await Promise.resolve();
    expect(callback).toHaveBeenLastCalledWith(125, 300);
    expect(feedback.finish).not.toHaveBeenCalled();
    finishStream();
    failModel(new Error('missing model'));
    await expect(load).resolves.toEqual(['failed']);
    expect(callback).toHaveBeenLastCalledWith(300, 300);
    expect(callback.mock.calls).toEqual(feedback.progress.mock.calls);
    expect(callback.mock.calls.map(([done]) => done)).toEqual([0, 25, 125, 200, 300, 300]);
    expect(feedback.finish).toHaveBeenCalledOnce();
  });
});
