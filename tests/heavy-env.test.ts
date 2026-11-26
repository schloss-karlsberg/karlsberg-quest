import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heavyMode, heavySlot, otherBusySlots, requireExclusive, slotDir, slotPort, warnIfShared } from '../scripts/dev/heavy-env.mjs';

// scripts/dev/heavy-env.mjs: what scripts/dev/heavy.sh exports to its child (slot, mode, lock).
// A private lock path only; the real /tmp/kq-heavy.lock is never looked at.
describe('heavy-env', () => {
  const dirs: string[] = [];
  const lockDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'kq-heavy-env-'));
    dirs.push(d);
    return join(d, 'lock');
  };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('slot and mode: 0 / undefined outside heavy.sh, junk ignored', () => {
    expect(heavySlot({})).toBe(0);
    expect(heavySlot({ KQ_HEAVY_SLOT: '2' })).toBe(2);
    expect(heavySlot({ KQ_HEAVY_SLOT: 'x' })).toBe(0);
    expect(heavyMode({})).toBeUndefined();
    expect(heavyMode({ KQ_HEAVY_MODE: 'normal' })).toBe('normal');
    expect(heavyMode({ KQ_HEAVY_MODE: 'exclusive' })).toBe('exclusive');
    expect(heavyMode({ KQ_HEAVY_MODE: 'other' })).toBeUndefined();
  });

  it('ports: an explicit env port wins, else base + slot', () => {
    expect(slotPort(5340, 'KQ_MOBILE_PORT', {})).toBe(5340);
    expect(slotPort(5340, 'KQ_MOBILE_PORT', { KQ_HEAVY_SLOT: '2' })).toBe(5342);
    expect(slotPort(5340, 'KQ_MOBILE_PORT', { KQ_HEAVY_SLOT: '2', KQ_MOBILE_PORT: '6000' })).toBe(6000);
  });

  it('dirs: slot 0 keeps the plain path, slot k gets -slot<k>', () => {
    expect(slotDir('test-results/screens', {})).toBe('test-results/screens');
    expect(slotDir('test-results/screens', { KQ_HEAVY_SLOT: '0' })).toBe('test-results/screens');
    expect(slotDir('test-results/artifacts', { KQ_HEAVY_SLOT: '1' })).toBe('test-results/artifacts-slot1');
  });

  it('warnIfShared: only in a normal slot while another slot is busy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lock = lockDir();
    const env = { KQ_HEAVY_LOCK: lock, KQ_HEAVY_SLOT: '1', KQ_HEAVY_MODE: 'normal' };
    mkdirSync(`${lock}.slot1`); // our own slot
    expect(otherBusySlots(env)).toEqual([]);
    expect(warnIfShared('walk (d) perf', env)).toBe('');
    mkdirSync(lock);
    mkdirSync(`${lock}.slot2`);
    expect(otherBusySlots(env)).toEqual([0, 2]);
    expect(warnIfShared('walk (d) perf', env)).toMatch(/walk \(d\) perf .* normal slot 1 while slot\(s\) 0, 2 are busy.*--exclusive/);
    expect(warnIfShared('x', { ...env, KQ_HEAVY_MODE: 'exclusive' })).toBe('');
    expect(warnIfShared('x', { KQ_HEAVY_LOCK: lock, KQ_HEAVY_SLOT: '1' })).toBe(''); // an older heavy.sh: mode unknown
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('requireExclusive: refuses a normal slot, warns outside heavy.sh, quiet when exclusive', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    requireExclusive('storyboard', 'heavy.sh --exclusive', { KQ_HEAVY_HELD: '1', KQ_HEAVY_MODE: 'normal' });
    expect(exit).toHaveBeenCalledWith(2);
    expect(err.mock.calls[0]?.[0]).toMatch(/storyboard: needs a quiet machine/);
    requireExclusive('storyboard', 'heavy.sh --exclusive', { KQ_HEAVY_HELD: '1', KQ_HEAVY_MODE: 'exclusive' });
    requireExclusive('storyboard', 'heavy.sh --exclusive', { KQ_HEAVY_HELD: '1' }); // older heavy.sh
    expect(warn).not.toHaveBeenCalled();
    requireExclusive('storyboard', 'heavy.sh --exclusive', {});
    expect(warn.mock.calls[0]?.[0]).toMatch(/not run through heavy.sh/);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
