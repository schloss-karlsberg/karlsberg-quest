import { Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EraPrewarmRegistry } from '../src/systems/fx/shift/prewarm';

describe('era prewarm registry (M-17 follow-up)', () => {
  it('returns the samples registered for an era, and "*" for every era', () => {
    const r = new EraPrewarmRegistry();
    const a = new Group();
    const b = new Group();
    const c = new Group();
    r.register('a', '1789', a);
    r.register('b', ['today', '1796'], [b]);
    r.register('c', '*', c);
    expect(r.objects('1789')).toEqual([a, c]);
    expect(r.objects('today')).toEqual([b, c]);
    expect(r.objects('1793-02')).toEqual([c]);
  });

  it('wraps a bare material in a small mesh', () => {
    const r = new EraPrewarmRegistry();
    const m = new MeshBasicMaterial();
    r.register('m', '*', m);
    const [o] = r.objects('today') as Mesh[];
    expect(o!.isMesh).toBe(true);
    expect(o!.material).toBe(m);
    expect(o!.geometry.getAttribute('position').count).toBe(3);
  });

  it('calls a factory lazily, once per era, and keeps its result', () => {
    const r = new EraPrewarmRegistry();
    const f = vi.fn((era: string) => {
      const g = new Group();
      g.name = era;
      return g;
    });
    r.register('f', '*', f);
    expect(f).not.toHaveBeenCalled();
    const first = r.objects('1789');
    expect(r.objects('1789')).toEqual(first);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.objects('today')[0]!.name).toBe('today');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('replaces an entry by key and survives a throwing factory', () => {
    const r = new EraPrewarmRegistry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    r.register('k', '*', new Group());
    r.register('k', '*', () => {
      throw new Error('no');
    });
    expect(r.size).toBe(1);
    expect(r.objects('today')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dispose: removing an entry hands its factory output to the dispose option; stale removers do nothing', () => {
    const r = new EraPrewarmRegistry();
    const disposed: Object3D[][] = [];
    const off = r.register('d', '*', () => new Mesh(), { dispose: (items) => disposed.push(items) });
    r.objects('today');
    r.objects('1789');
    off();
    expect(r.has('d')).toBe(false);
    expect(disposed).toHaveLength(1);
    expect(disposed[0]).toHaveLength(2);
    // a remover of a replaced entry leaves the new one alone
    const old = r.register('e', '*', new Group());
    r.register('e', '*', new Group());
    old();
    expect(r.has('e')).toBe(true);
    r.clear();
    expect(r.size).toBe(0);
  });
});
