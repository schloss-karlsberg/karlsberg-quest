import { describe, expect, it } from 'vitest';
import { compassWord, TrackField } from '../src/systems/hunt/tracks';

const path = [{ x: 0, z: 0 }, { x: 0, z: -7 }];

describe('snow tracks at the margins', () => {
  it('does not count faded hoofprints in a still-readable paw trail before the next prune', () => {
    const field = new TrackField({ life: 10 });
    field.addPack('hoof', 0, 0, 0, Math.PI, 0, 1, 1);
    field.tick(10);
    expect(field.readPack(0, 0, 1, field.now)).toMatchObject({ hasPikeur: true, age: 10 });
    field.addPack('paw', 1, 1, 0, 0, field.now, 1, 1);
    field.tick(1);
    const reading = field.readPack(0, 0, 1, field.now);
    expect(reading).toMatchObject({ kind: 'paw', age: 1, hasPikeur: false });
    expect(compassWord(reading!.heading)).toBe('Norden');
  });

  it('ages ordinary prints independently of an earlier, long-held story trail', () => {
    const field = new TrackField({ life: 10 });
    field.addTrail(path, 0, 1.4, 1, 60);
    const story = field.prints.slice();
    field.addPack('hoof', 0, 0, 0, Math.PI, 0, 1, 1);
    field.addPlayer(0, 0, 0, 0, 1, 1, null);
    field.tick(10);
    field.addPack('paw', 1, 1, 0, 0, field.now, 1, 1);
    field.tick(7);
    expect(field.prints.map((print) => print.agent)).toEqual([...story.map(() => -2), 1]);
    expect(field.segmentEnd(0)).toBeNull();
    field.tick(60);
    expect(field.prints).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity])('falls back to the standard stride for an invalid trail cue stride (%s)', (stride) => {
    const field = new TrackField();
    const reference = new TrackField();
    const expected = reference.addTrail(path, 0);
    let sampled = 0;
    const count = field.addTrail(path, 0, stride, 1, 0, () => {
      if (++sampled > expected) throw new Error('exceeded the default stride sample count');
      return true;
    });
    expect(count).toBe(expected);
    expect(field.prints).toEqual(reference.prints);
  });

  it('bounds sampling across the full segment for a tiny finite cue stride, even when terrain rejects prints', () => {
    const field = new TrackField({ max: 2 });
    let sampled = 0;
    const count = field.addTrail(path, 0, 1e-308, 1, 0, (_x, z) => {
      if (++sampled > 1800) throw new Error('exceeded the segment sample limit');
      return z === 0 || z === -7;
    });
    expect(sampled).toBeGreaterThan(2);
    expect(count).toBe(2);
    expect(field.prints.map((print) => print.z)).toEqual([0, -7]);
  });

  it('evicts in insertion order, respects the radius edge and clears segment ownership', () => {
    const field = new TrackField({ max: 2 });
    const first = field.addPlayer(0, 0, 0, 0, 1, 1, null)!;
    field.addPlayer(1, 0, 0, 1, -1, 1, 'road');
    const newer = field.addPlayer(3, 4, 0, 2, 1, 1, null)!;
    field.addPack('paw', 1, 1, 1, 0, 3, 1, 1);
    expect(field.segmentEnd(first.seg)).toBeNull();
    expect(field.playerPrintNear(0, 0, 5, 4)).toBe(newer);
    expect(field.playerPrintNear(0, 0, 4.9, 4)).toBeNull();
    field.clear();
    expect(field.segmentEnded(newer.seg)).toBe(true);
    expect(field.lastBreak).toBeNull();
    expect(field.readPack(1, 1, 1, 4)).toBeNull();
  });
});
