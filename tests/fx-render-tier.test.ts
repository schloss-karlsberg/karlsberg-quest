import { Mesh, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { type GraphicsLevel, MemoryStorage, SettingsStore } from '../src/core/save';
import fx from '../src/systems/fx';
import { PULSE_RADIUS } from '../src/systems/fx/scan/pulse';
import { eraPrewarm } from '../src/systems/fx/shift/prewarm';

vi.mock('../src/systems/fx/ui', () => ({ FxUI: class { dispose() {} } }));

function setup(saved: GraphicsLevel | undefined, override: GraphicsLevel | null, params = '', fallback: GraphicsLevel = 'high') {
  const scene = new Scene();
  const events = new EventBus();
  const settings = new SettingsStore(new MemoryStorage());
  settings.update(s => { s.graphics = saved; });
  const quality = { override, get level() { return this.override ?? settings.state.graphics ?? fallback; } };
  const ctx = {
    params: new URLSearchParams(params), events, settings, quality, scene,
    renderer: { getContext: () => ({ getExtension: () => null, getParameter: () => 'software' }) },
    data: { footprints: { buildings: [] } }, world: { heightfield: { heightAt: () => 0 } },
    state: { slice: () => ({ fire: null, oblivion: null }) },
    audio: { bus: () => null }, player: { position: new Vector3() },
  };
  fx.init(ctx as unknown as GameContext);
  function scan() {
    events.emit('scan:mode', { mode: 2 });
    const pulse = scene.children.find((m): m is Mesh => m instanceof Mesh && m.geometry.hasAttribute('aRelief'));
    return pulse?.geometry.getAttribute('position').count;
  }
  return { settings, events, quality, scan };
}

afterEach(() => {
  fx.dispose();
  eraPrewarm.remove('fx.ambient');
});

describe('scan density follows the effective graphics tier', () => {
  const coarseCount = (Math.ceil(PULSE_RADIUS * 2 / 3) + 1) ** 2;
  const fullCount = (PULSE_RADIUS + 1) ** 2;

  it('uses a low session override over saved high and switches back after an explicit graphics choice', () => {
    const { quality, scan, events, settings } = setup('high', 'low');
    expect(scan()).toBe(coarseCount);
    expect(settings.state.graphics).toBe('high');
    quality.override = null;
    settings.update(s => { s.graphics = 'medium'; });
    events.emit('settings:change', { key: 'graphics' });
    expect(scan()).toBe(fullCount);
    settings.update(s => { s.graphics = 'low'; });
    events.emit('settings:change', { key: 'graphics' });
    expect(scan()).toBe(coarseCount);
  });

  it('honours an explicit FX tier at startup', () => {
    expect(setup('low', 'low', 'fxq=high').scan()).toBe(fullCount);
  });

  it('uses the low device fallback when there are no saved settings', () => {
    expect(setup(undefined, null, '', 'low').scan()).toBe(coarseCount);
  });
});
