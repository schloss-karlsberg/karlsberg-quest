import { describe, expect, it } from 'vitest';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { DEFAULT_BINDINGS, REBINDABLE, bindKey, diffBindings, effectiveBindings } from '../src/player/input';
import { frameStats } from '../src/render/perf';
import { AUTO_QUALITY, AutoQuality, QUALITY_PRESETS, pixelRatioFor, suggestLevel } from '../src/render/quality';

describe('quality presets', () => {
  it('cost goes down from Hoch to Niedrig', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(low.msaa).toBeLessThan(medium.msaa);
    expect(medium.msaa).toBeLessThan(high.msaa);
    expect(low.treeFar).toBeLessThan(high.treeFar);
    expect(low.lodScale).toBeLessThan(high.lodScale);
    expect(low.maxDpr).toBe(1);
  });

  it('pixel ratio: capped by the preset, scaled by the resolution slider', () => {
    expect(pixelRatioFor('high', 1, 2)).toBe(1.5);
    expect(pixelRatioFor('high', 1, 1)).toBe(1);
    expect(pixelRatioFor('low', 1, 2)).toBe(1);
    expect(pixelRatioFor('medium', 0.5, 2)).toBeCloseTo(0.625);
    expect(pixelRatioFor('high', 0.1, 1)).toBe(0.5); // slider floor 50 %
  });

  it('first-run guess from the GPU name', () => {
    expect(suggestLevel('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))', false, 8)).toBe('low');
    expect(suggestLevel('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', false, 8)).toBe('medium');
    expect(suggestLevel('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11)', false, 16)).toBe('high');
    expect(suggestLevel('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', false, 8)).toBe('high');
    expect(suggestLevel('Adreno (TM) 740', true, 8)).toBe('low');
    expect(suggestLevel('', false, 4)).toBe('medium');
  });

  it('auto-downgrade: only after sustained slow seconds, one step at a time, then resolution', () => {
    const a = new AutoQuality();
    const slow = AUTO_QUALITY.slowMs + 10;
    let level: 'low' | 'medium' | 'high' = 'high';
    let res = 1;
    const run = (ms: number, seconds: number) => {
      const changes: string[] = [];
      for (let i = 0; i < seconds; i++) {
        const r = a.sample(ms, level, res);
        if (r) {
          level = r.level;
          res = r.resolutionScale;
          changes.push(`${level}@${res}`);
        }
      }
      return changes;
    };
    // grace period after start, then fast frames: nothing happens
    expect(run(10, 30)).toEqual([]);
    // a short hitch does not count
    expect(run(slow, AUTO_QUALITY.seconds - 1)).toEqual([]);
    expect(run(10, 1)).toEqual([]);
    // sustained: high → medium, (grace) → low → resolution 75 %, then nothing more
    expect(run(slow, AUTO_QUALITY.graceSeconds + AUTO_QUALITY.seconds)).toEqual(['medium@1']);
    expect(run(slow, 2 * (AUTO_QUALITY.graceSeconds + AUTO_QUALITY.seconds))).toEqual(['low@1', 'low@0.75']);
    expect(run(slow, 60)).toEqual([]);
    // hold() resets the slow streak
    a.hold(1);
    expect(a.sample(slow, 'high', 1)).toBeNull();
  });
});

describe('frame statistics', () => {
  it('avg, percentiles, max', () => {
    const s = frameStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(s.avg).toBe(55);
    expect(s.p50).toBe(60);
    expect(s.p95).toBe(100);
    expect(s.max).toBe(100);
    expect(frameStats([]).n).toBe(0);
  });
});

describe('key remapping', () => {
  it('overrides replace an action’s keys; diff keeps only changes', () => {
    expect(effectiveBindings({}).forward).toEqual(DEFAULT_BINDINGS.forward);
    const eff = effectiveBindings({ forward: ['KeyZ'] });
    expect(eff.forward).toEqual(['KeyZ']);
    expect(diffBindings(eff)).toEqual({ forward: ['KeyZ'] });
    expect(diffBindings(effectiveBindings({}))).toEqual({});
  });

  it('binding a key takes it away from other actions (not from the shared C pair)', () => {
    // E (listen) onto forward: listen loses it
    const o = bindKey({}, 'forward', 'KeyE');
    const eff = effectiveBindings(o);
    expect(eff.forward).toContain('KeyE');
    expect(eff.listen).not.toContain('KeyE');
    // C onto crouch again keeps 'down' (flying) on C
    const c = effectiveBindings(bindKey({}, 'crouch', 'KeyC'));
    expect(c.down).toContain('KeyC');
    // no key drives two actions except the allowed pair
    const owner = new Map<string, string[]>();
    for (const [a, codes] of Object.entries(eff)) for (const k of codes) owner.set(k, [...(owner.get(k) ?? []), a]);
    expect([...owner].filter(([, a]) => a.length > 1).map(([k]) => k)).toEqual(['KeyC']);
  });

  it('every rebindable action has a default and keyboard look exists', () => {
    for (const a of REBINDABLE) expect(DEFAULT_BINDINGS[a].length).toBeGreaterThan(0);
    expect(DEFAULT_BINDINGS.lookLeft).toContain('Comma');
    expect(DEFAULT_BINDINGS.lookRight).toContain('Period');
  });
});

describe('settings store', () => {
  it('older saved settings gain the new fields (voice volume, accessibility, quality)', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ mouseSensitivity: 1.4, volume: { master: 0.5, music: 0.1, sfx: 0.9, ambience: 0.8 }, graphics: 'low' }));
    const s = new SettingsStore(storage).state;
    expect(s.mouseSensitivity).toBe(1.4);
    expect(s.volume.master).toBe(0.5);
    expect(s.volume.voice).toBe(0.9);
    expect(s.graphics).toBe('low');
    expect(s.resolutionScale).toBe(1);
    expect(s.autoQuality).toBe(true);
    expect(s.bindings).toEqual({});
    expect(typeof s.reducedFlash).toBe('boolean');
    expect(s.subtitleBg).toBeGreaterThan(0);
  });
});
