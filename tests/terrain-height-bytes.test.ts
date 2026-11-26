import { describe, expect, it } from 'vitest';
import { decodeH1789, decodeH2025 } from '../src/data/decode';

describe('terrain height bytes', () => {
  it('decodes a view starting at an odd offset and keeps the present intact across era changes', () => {
    // Ignore the padding bytes around the little-endian residuals -1 and +1.
    const view = Uint8Array.of(42, 255, 255, 1, 0, 42).subarray(1, 5);
    const today = decodeH2025(view, { cols: 2, rows: 1 });
    expect([...today]).toEqual([65535, 0]);
    const past = decodeH1789(Uint8Array.of(1, 0, 255, 255), today);
    expect([...past]).toEqual([0, 65535]);
    expect([...today]).toEqual([65535, 0]);
  });

  it('rejects a partial sample after the expected present-day grid', () => {
    expect(() => decodeH2025(Uint8Array.of(1, 0, 42), { cols: 1, rows: 1 })).toThrow();
  });

  it('rejects a partial sample after the expected historical differences', () => {
    expect(() => decodeH1789(Uint8Array.of(1, 0, 42), Uint16Array.of(200))).toThrow();
  });
});
