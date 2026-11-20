import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { DEFAULT_BINDINGS, REBINDABLE, bindKey, diffBindings, effectiveBindings } from '../src/player/input';
import { frameStats } from '../src/render/perf';
import { AUTO_QUALITY, AutoQuality, QUALITY_PRESETS, pixelRatioFor, slowMsFor, suggestLevel } from '../src/render/quality';
import { ShadowReuse } from '../src/render/shadows';

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
    // retina caps (fan round 2026-11-20): Hoch 1.25, Mittel 1, Niedrig 1
    expect(pixelRatioFor('high', 1, 2)).toBe(1.25);
    expect(pixelRatioFor('high', 1, 1)).toBe(1);
    expect(pixelRatioFor('medium', 1, 2)).toBe(1);
    expect(pixelRatioFor('low', 1, 2)).toBe(1);
    expect(pixelRatioFor('medium', 0.5, 2)).toBeCloseTo(0.5);
    expect(pixelRatioFor('high', 0.1, 1)).toBe(0.5); // slider floor 50 %
    for (const p of Object.values(QUALITY_PRESETS)) expect(p.maxDpr).toBeLessThanOrEqual(1.25);
  });

  it('Energiesparen caps the pixel ratio at 1 on every tier', () => {
    expect(pixelRatioFor('high', 1, 2, true)).toBe(1);
    expect(pixelRatioFor('high', 0.8, 2, true)).toBeCloseTo(0.8);
    expect(pixelRatioFor('low', 1, 1, true)).toBe(1);
  });

  it('shadow maps may be re-used every 2nd frame on every tier', () => {
    for (const p of Object.values(QUALITY_PRESETS)) expect(p.shadowEvery).toBe(2);
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

  it('auto-downgrade under a 30 fps cap: its 33 ms frames are not slow', () => {
    expect(slowMsFor(60)).toBe(AUTO_QUALITY.slowMs);
    expect(slowMsFor(Infinity)).toBe(AUTO_QUALITY.slowMs);
    expect(slowMsFor(30)).toBeCloseTo(41.7, 1);
    const a = new AutoQuality();
    a.hold(0);
    for (let i = 0; i < 60; i++) expect(a.sample(33.4, 'high', 1, slowMsFor(30))).toBeNull();
    // really slow (20 fps) still steps down
    let r = null;
    for (let i = 0; i < AUTO_QUALITY.seconds && !r; i++) r = a.sample(50, 'high', 1, slowMsFor(30));
    expect(r).toEqual({ level: 'medium', resolutionScale: 1 });
  });
});

describe('sun shadow re-use (every 2nd frame without swimming)', () => {
  const sun = new Vector3(0.3, 0.8, 0.5).normalize();
  const texel = 110 / 1024; // Mittel: 55 m half extent on 1024 px ≈ 0.107 m
  const run = (fps: number, speed: number, frames = 60) => {
    const r = new ShadowReuse();
    r.every = 2;
    const f = new Vector3();
    let drawn = 0;
    for (let i = 0; i < frames; i++) {
      f.set((i * speed) / fps, 0, 0);
      if (!r.reuse(f, sun, 1 / fps, texel)) drawn++;
    }
    return drawn;
  };

  it('standing or walking slowly at 60 fps: every 2nd frame', () => {
    expect(run(60, 0)).toBe(30);
    expect(run(60, 3.2)).toBe(30); // walking: 5.3 cm a frame < ¾ texel
  });

  it('sprinting (6.2 m/s, more than ¾ texel a frame), 30 fps (map would be 33 ms old) or bullet time: every frame', () => {
    expect(run(60, 6.2)).toBe(60);
    expect(run(60, 7.5)).toBe(60);
    expect(run(30, 0, 30)).toBe(30);
    const r = new ShadowReuse();
    r.every = 2;
    const f = new Vector3();
    expect(r.reuse(f, sun, Infinity, texel)).toBe(false);
    expect(r.reuse(f, sun, Infinity, texel)).toBe(false);
  });

  it('120 fps uncapped: every 2nd frame; every = 1 never re-uses; a turning sun or invalidate() re-renders', () => {
    expect(run(120, 4, 120)).toBe(60);
    const r = new ShadowReuse();
    const f = new Vector3();
    expect(r.reuse(f, sun, 1 / 60, texel)).toBe(false);
    expect(r.reuse(f, sun, 1 / 60, texel)).toBe(false);
    r.every = 2;
    expect(r.reuse(f, sun, 1 / 60, texel)).toBe(true);
    expect(r.reuse(f, sun, 1 / 60, texel)).toBe(false);
    expect(r.reuse(f, new Vector3(0.31, 0.8, 0.5).normalize(), 1 / 60, texel)).toBe(false);
    r.invalidate();
    expect(r.reuse(f, sun, 1 / 60, texel)).toBe(false);
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
    // no key drives two actions except the allowed pairs (C crouch/down, LMB interact/attack, Space up/dodge)
    const owner = new Map<string, string[]>();
    for (const [a, codes] of Object.entries(eff)) for (const k of codes) owner.set(k, [...(owner.get(k) ?? []), a]);
    expect([...owner].filter(([, a]) => a.length > 1).map(([k]) => k).sort()).toEqual(['KeyC', 'Mouse0', 'Space']);
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
    expect(s.fpsCap).toBe(60);
    expect(s.powerSave).toBe(false);
    expect(s.bindings).toEqual({});
    expect(typeof s.reducedFlash).toBe('boolean');
    expect(s.subtitleBg).toBeGreaterThan(0);
  });
});

describe('Bildrate / Energiesparen settings', () => {
  it('default 60 fps, saved and read back like every setting', () => {
    const storage = new MemoryStorage();
    const a = new SettingsStore(storage);
    expect(a.state.fpsCap).toBe(60);
    expect(a.state.powerSave).toBe(false);
    a.update((d) => {
      d.fpsCap = 30;
      d.powerSave = true;
    }, 'fpsCap');
    const b = new SettingsStore(storage).state;
    expect(b.fpsCap).toBe(30);
    expect(b.powerSave).toBe(true);
    a.update((d) => (d.fpsCap = 0), 'fpsCap');
    expect(new SettingsStore(storage).state.fpsCap).toBe(0);
  });
});
