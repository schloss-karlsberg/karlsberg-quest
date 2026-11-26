import { afterEach, describe, expect, it, vi } from 'vitest';
import { stepsDriveVisualsNow } from '../src/core/bullet';
import { isEra } from '../src/core/era';
import { spawnFromParams } from '../src/debug/spawn';

afterEach(() => { vi.unstubAllGlobals(); });

describe('position overrides in shared URLs', () => {
  it('accepts zero and fractional local coordinates, with an optional yaw in degrees', () => {
    expect(spawnFromParams(new URLSearchParams('x=0&z=-83.75'))).toEqual({ x: 0, z: -83.75, yaw: undefined });
    expect(spawnFromParams(new URLSearchParams('x=-4&z=0&yaw=-90'))).toEqual({ x: -4, z: 0, yaw: -Math.PI / 2 });
    expect(spawnFromParams(new URLSearchParams('x=4&z=5&yaw=0'))?.yaw).toBe(0);
  });

  it.each([['1e308', 296], ['-450', -90]])('wraps a finite yaw of %s degrees before converting to radians', (yaw, degrees) => {
    const spawn = spawnFromParams(new URLSearchParams({ x: '1138', z: '-1120', yaw }));
    expect(spawn?.yaw).toBeCloseTo(degrees * Math.PI / 180, 12);
  });

  it.each(['x=17', 'z=17', 'x=&z=1', 'x=4&z=%20', 'x=north&z=5', 'x=1&z=-Infinity', 'x=1e999&z=0'])(
    'keeps the current pose if the coordinate pair is unusable (%s)', (query) => {
      expect(spawnFromParams(new URLSearchParams(query))).toBeNull();
    },
  );

  it.each(['?', 'Infinity', '', ' '])('keeps a valid position and omits an invalid yaw (%j)', (yaw) => {
    expect(spawnFromParams(new URLSearchParams({ x: '1', z: '-1', yaw }))).toEqual({ x: 1, z: -1, yaw: undefined });
  });
});

describe('era and clock flags', () => {
  it('accepts complete era identifiers and ignores ambiguous or empty bookmarks', () => {
    for (const era of ['today', '1789', '1793-02', '1793-07', '1796']) expect(isEra(era), era).toBe(true);
    for (const era of [null, '', '1793', '1793-7', '1840']) expect(isEra(era), String(era)).toBe(false);
  });

  it('only opts WebDriver into stepped visual clocks with the idle flag in manual mode', () => {
    vi.stubGlobal('navigator', { webdriver: true });
    expect(stepsDriveVisualsNow(true, new URLSearchParams('manual'))).toBe(false);
    expect(stepsDriveVisualsNow(true, new URLSearchParams('manual&idle'))).toBe(true);
    expect(stepsDriveVisualsNow(false, new URLSearchParams('idle'))).toBe(false);
    vi.stubGlobal('navigator', { webdriver: false });
    expect(stepsDriveVisualsNow(true, new URLSearchParams())).toBe(true);
  });
});
