import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { PostFX } from '../src/render/post';
import { QUALITY_PRESETS, QualityManager } from '../src/render/quality';
import type { World } from '../src/world/world';

function graphics(storage = new MemoryStorage()) {
  const settings = new SettingsStore(storage);
  let ratio = 1;
  const renderer = { setPixelRatio(r: number) { ratio = r; }, getPixelRatio: () => ratio };
  const post = new PostFX();
  const world = { terrain: { lodScale: 0 }, forest: { setDistances: vi.fn() }, water: { reflections: false } };
  const resize = vi.fn();
  const notify = vi.fn();
  const quality = new QualityManager({ renderer, world: world as unknown as World, post, settings, resize, notify });
  return { quality, settings, renderer, post, world, resize, notify };
}

afterEach(() => vi.unstubAllGlobals());

describe('runtime graphics presets', () => {
  it('applies a session tier, power saving and a reload using the persisted shadow preset', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const storage = new MemoryStorage();
    const { quality, settings, post, world, renderer, resize } = graphics(storage);
    quality.fallback = 'medium';
    expect(quality.level).toBe('medium');
    settings.update(s => { s.graphics = 'medium'; s.resolutionScale = 0.8; });
    quality.override = 'high';
    const applied = vi.fn();
    quality.listeners.push(applied);
    quality.apply();
    expect(applied).toHaveBeenLastCalledWith(expect.objectContaining({ shadowSize: 2048, shadowRange: 75, shadowTaps: 9 }), 'high');
    expect(post.features).toEqual({ ao: true, bloom: true, grade: true });
    expect(renderer.getPixelRatio()).toBe(1);
    expect(resize).not.toHaveBeenCalled();
    settings.update(s => { s.powerSave = true; });
    quality.apply();
    expect(renderer.getPixelRatio()).toBe(0.8);
    expect(world.water.reflections).toBe(false);
    expect(post.features).toEqual({ ao: false, bloom: true, grade: true });
    expect(post.samples).toBe(4);
    expect(resize).toHaveBeenCalledTimes(1);
    const reload = graphics(storage);
    expect(reload.quality.preset).toMatchObject({ shadowSize: 1024, shadowRange: 55, shadowTaps: 4 });
    reload.quality.apply();
    expect(reload.post.samples).toBe(2);
    expect(reload.renderer.getPixelRatio()).toBe(0.8);
    settings.update(s => { s.powerSave = false; });
    quality.override = 'low';
    quality.apply();
    expect(world.water.reflections).toBe(true);
    expect(world.terrain.lodScale).toBe(QUALITY_PRESETS.low.lodScale);
    expect(world.forest.setDistances).toHaveBeenLastCalledWith(110, 480);
    expect(post.features).toEqual({ ao: false, bloom: false, grade: false });
    expect(post.samples).toBe(0);
    expect(applied).toHaveBeenLastCalledWith(expect.objectContaining({ shadowSize: 0 }), 'low');
  });

  it('keeps forced MSAA off across an upgrade', () => {
    const { quality, post } = graphics();
    quality.noMsaa = true;
    for (const tier of ['low', 'high'] as const) {
      quality.override = tier;
      quality.apply();
      expect(post.samples).toBe(0);
      expect(post.features.ao).toBe(QUALITY_PRESETS[tier].ao);
    }
  });

  it('requires six consecutive slow seconds of active play after a pause', () => {
    const storage = new MemoryStorage();
    const { quality, notify } = graphics(storage);
    quality.override = 'high';
    const slowSeconds = (seconds: number) => {
      for (let frame = 0; frame < seconds * 20; frame++) quality.frame(50, true);
    };
    slowSeconds(9); // four seconds of startup grace, five seconds of slow play
    quality.frame(50, false);
    slowSeconds(5);
    expect(notify).not.toHaveBeenCalled();
    slowSeconds(1);
    expect(notify).toHaveBeenCalledExactlyOnceWith('medium', 1);
    expect(quality.override).toBeNull();
    expect(graphics(storage).quality.level).toBe('medium');
  });
});
