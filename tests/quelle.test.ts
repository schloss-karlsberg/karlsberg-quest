/**
 * The Karlsbergquelle's pure layout (src/systems/quelle/layout.ts): the local frame, where the
 * water lies in each era, the jet from the pipe, who may touch the water, the brook line and the
 * clearings. Two synthetic heightfields stand in for the LiDAR: a flat plane and a slope that
 * rises ~0.5 m per m towards −w (into the hillside behind the wall), as at the real spring.
 */
import { describe, expect, it } from 'vitest';
import { ERAS, type Era } from '../src/core/era';
import {
  BROOK_LEN,
  PIECES,
  QUELLE,
  REACH,
  TROUGH_CUT,
  basinBase,
  brookLine,
  canTouch,
  clearings,
  lookFor,
  outlet,
  toLocal,
  toWorld,
  touchLocal,
  troughFrame,
  waterSpec,
  yawToWater,
} from '../src/systems/quelle/layout';

type HeightAt = (x: number, z: number) => number;

const H0 = 290;
const plane: HeightAt = () => H0;
/** Rises 0.5 m per m towards −w (uphill behind the wall), flat along u. */
const slope: HeightAt = (x, z) => H0 - 0.5 * toLocal(x, z)[1];
const FIELDS: [string, HeightAt][] = [
  ['plane', plane],
  ['slope', slope],
];

/** three.js yaw from a compass heading (as kq.teleport: yaw = −deg). */
const yawOf = (deg: number) => (-deg * Math.PI) / 180;

describe('Karlsbergquelle: local frame', () => {
  it('toWorld / toLocal round-trip, and the origin is the spring', () => {
    for (const [u, w] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-3.35, 1.1],
      [12.5, -7.25],
      [-40, 33],
    ] as const) {
      const [x, z] = toWorld(u, w);
      const [u2, w2] = toLocal(x, z);
      expect(u2).toBeCloseTo(u, 9);
      expect(w2).toBeCloseTo(w, 9);
    }
    for (const [x, z] of [
      [1061, -834.5],
      [1059.3, -833.1],
      [1000, -900],
    ] as const) {
      const [u, w] = toLocal(x, z);
      const [x2, z2] = toWorld(u, w);
      expect(x2).toBeCloseTo(x, 9);
      expect(z2).toBeCloseTo(z, 9);
    }
    expect(toWorld(0, 0)).toEqual([QUELLE.x, QUELLE.z]);
  });

  it('the frame is a rotation (unit axes, at right angles) and +w points the way the spring faces', () => {
    const [ux, uz] = toWorld(1, 0).map((v, i) => v - [QUELLE.x, QUELLE.z][i]!);
    const [wx, wz] = toWorld(0, 1).map((v, i) => v - [QUELLE.x, QUELLE.z][i]!);
    expect(Math.hypot(ux!, uz!)).toBeCloseTo(1, 9);
    expect(Math.hypot(wx!, wz!)).toBeCloseTo(1, 9);
    expect(ux! * wx! + uz! * wz!).toBeCloseTo(0, 9);
    // compass of +w (0 = north = −z, 90 = east = +x) is the facing (234°, south-west)
    const compass = ((Math.atan2(wx!, -wz!) * 180) / Math.PI + 360) % 360;
    expect(compass).toBeCloseTo(QUELLE.facing, 6);
    // u is to the right of a viewer who faces the spring (i.e. looks along −w)
    const fx = -wx!;
    const fz = -wz!;
    // right of forward (x east, z south): (−fz, fx)
    expect(ux!).toBeCloseTo(-fz, 9);
    expect(uz!).toBeCloseTo(fx, 9);
  });

  it('the synthetic slope really rises towards −w', () => {
    const [ax, az] = toWorld(0, 2);
    const [bx, bz] = toWorld(0, -2);
    expect(slope(bx, bz) - slope(ax, az)).toBeCloseTo(2, 9);
    const [cx, cz] = toWorld(5, 2);
    expect(slope(cx, cz)).toBeCloseTo(slope(ax, az), 9);
  });
});

describe('Karlsbergquelle: looks per era', () => {
  it('lookFor covers every era', () => {
    const want: Record<Era, string> = { today: 'today', '1789': 'baroque', '1793-02': 'winter', '1793-07': 'fire', '1796': 'ruin' };
    for (const e of ERAS) expect(lookFor(e)).toBe(want[e]);
  });

  it('the touch point is the log today and the basin in every past era', () => {
    expect(touchLocal('today')).toEqual([PIECES.trough.u, PIECES.trough.w]);
    for (const e of ERAS.filter((e) => e !== 'today')) expect(touchLocal(e)).toEqual([PIECES.basin.u, PIECES.basin.w]);
  });
});

describe.each(FIELDS)('Karlsbergquelle water on the %s', (_name, h) => {
  it('today: the water lies inside the log, below its cut, as wide as the hollow allows', () => {
    const T = PIECES.trough;
    const s = waterSpec(h, 'today');
    const { axisY, gl, gr } = troughFrame(h);
    expect(s.look).toBe('today');
    // centred on the log
    const [cu, cw] = toLocal(s.x, s.z);
    expect(cu).toBeCloseTo(T.u, 6);
    expect(cw).toBeCloseTo(T.w, 6);
    // above the bottom of the hollow, below the flat cut (and so below the rim)
    expect(s.y).toBeGreaterThan(axisY - T.inner);
    expect(s.y).toBeLessThan(axisY + TROUGH_CUT);
    // the log stands on its stumps above the ground
    expect(axisY - T.r).toBeGreaterThan(Math.max(gl, gr));
    // across (w): within the chord of the inner radius at that height
    const dy = s.y - axisY;
    const chord = 2 * Math.sqrt(T.inner * T.inner - dy * dy);
    expect(s.wid).toBeGreaterThan(0.2);
    expect(s.wid).toBeLessThanOrEqual(chord);
    expect(s.wid).toBeLessThan(2 * T.inner);
    // along (u): shorter than the log (its closed ends)
    expect(s.len).toBeGreaterThan(1);
    expect(s.len).toBeLessThan(T.len);
  });

  it.each(['1789', '1793-02', '1793-07'] as const)('%s: the water lies inside the stone basin, under its rim', (era) => {
    const B = PIECES.basin;
    const s = waterSpec(h, era);
    const base = basinBase(h);
    expect(s.look).toBe(lookFor(era));
    const [cu, cw] = toLocal(s.x, s.z);
    expect(cu).toBeCloseTo(B.u, 6);
    expect(cw).toBeCloseTo(B.w, 6);
    expect(s.y).toBeGreaterThan(base);
    expect(s.y).toBeLessThan(base + B.h);
    expect(s.len).toBeGreaterThan(0);
    expect(s.wid).toBeGreaterThan(0);
    expect(s.len).toBeLessThanOrEqual(B.len - 2 * B.wall + 1e-9);
    expect(s.wid).toBeLessThanOrEqual(B.depth - 2 * B.wall + 1e-9);
    // the basin's floor stands on (or just in) the ground under both of its ends
    const [lx, lz] = toWorld(B.u - B.len / 2, B.w);
    const [rx, rz] = toWorld(B.u + B.len / 2, B.w);
    expect(base).toBeLessThanOrEqual(Math.max(h(lx, lz), h(rx, rz)));
  });

  it('1796: the plundered basin still holds a little water, low under the rim', () => {
    const s = waterSpec(h, '1796');
    const base = basinBase(h);
    expect(s.look).toBe('ruin');
    expect(s.y).toBeGreaterThan(base);
    expect(s.y).toBeLessThan(waterSpec(h, '1789').y);
  });

  it('the outlet is above the water today and in 1789 (and the winter / fire nights), and gone in 1796', () => {
    for (const era of ['today', '1789', '1793-02', '1793-07'] as const) {
      const o = outlet(h, era);
      const s = waterSpec(h, era);
      expect(o, era).not.toBeNull();
      expect(o!.y, era).toBeGreaterThan(s.y + 0.1);
      // it leaves the wall in front of its face, behind the middle of the water
      expect(o!.w, era).toBeGreaterThan(PIECES.wall.w);
      expect(o!.w, era).toBeLessThan(touchLocal(era)[1]);
      const [ou, ow] = toLocal(o!.x, o!.z);
      expect(ou).toBeCloseTo(o!.u, 6);
      expect(ow).toBeCloseTo(o!.w, 6);
    }
    expect(outlet(h, '1796')).toBeNull();
  });

  it('the jet aimed in index.ts build() lands inside the water and clears the back rim', () => {
    for (const era of ['today', '1789', '1793-02', '1793-07'] as const) {
      const s = waterSpec(h, era);
      const o = outlet(h, era)!;
      // ---- re-derived from src/systems/quelle/index.ts build() ----
      const [, tw] = touchLocal(era);
      const drop = o.y - s.y;
      const tAim = Math.sqrt((2 * Math.max(0.02, drop)) / 9.81);
      const wTarget = tw - 0.05;
      const speed = Math.min(2, Math.max(0.25, (wTarget - o.w) / tAim));
      // ---- and the trajectory streamMesh (water.ts) draws: horizontal `speed`, g = 9.81 ----
      expect(drop, era).toBeGreaterThan(0.02); // else streamMesh draws no jet at all
      const tLand = Math.sqrt((2 * drop) / 9.81);
      const wLand = o.w + speed * tLand;
      const [cu, cw] = toLocal(s.x, s.z);
      // along w the water spans `wid`, along u `len` (the jet keeps the pipe's u)
      expect(Math.abs(wLand - cw), `${era}: lands at w ${wLand.toFixed(3)}`).toBeLessThan(s.wid / 2 - 0.03);
      expect(Math.abs(o.u - cu), era).toBeLessThan(s.len / 2 - 0.05);
      // the speed was not clamped (the aim decides it)
      expect(speed, era).toBeGreaterThan(0.25);
      expect(speed, era).toBeLessThan(2);
      // over the back rim: the log's flat cut today, the basin's wall top before
      const rim =
        lookFor(era) === 'today'
          ? { w: PIECES.trough.w - Math.sqrt(PIECES.trough.r ** 2 - TROUGH_CUT ** 2), y: troughFrame(h).axisY + TROUGH_CUT }
          : { w: PIECES.basin.w - PIECES.basin.depth / 2, y: basinBase(h) + PIECES.basin.h };
      expect(rim.w, era).toBeGreaterThan(o.w);
      const tRim = (rim.w - o.w) / speed;
      const yRim = o.y - 4.905 * tRim * tRim;
      expect(yRim, `${era}: jet over the rim`).toBeGreaterThan(rim.y + 0.02);
    }
  });

  it('brookLine: ~BROOK_LEN long, runs on along its way, starts at the overflow, never runs uphill much', () => {
    for (const era of ERAS) {
      const line = brookLine(h, era);
      expect(line.length, era).toBeGreaterThan(30);
      // the first point is the overflow at the low end of the log / basin (pinned by the smoothing)
      const want =
        lookFor(era) === 'today'
          ? toWorld(PIECES.trough.u - PIECES.trough.len / 2 - 0.15, PIECES.trough.w + 0.1)
          : toWorld(PIECES.basin.u - PIECES.basin.len / 2 - 0.2, PIECES.basin.w + 0.1);
      expect(line[0]![0]).toBeCloseTo(want[0], 9);
      expect(line[0]![1]).toBeCloseTo(want[1], 9);
      // length
      let len = 0;
      for (let i = 1; i < line.length; i++) len += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
      expect(len, era).toBeGreaterThan(BROOK_LEN * 0.85);
      expect(len, era).toBeLessThan(BROOK_LEN * 1.15);
      // monotone along: every step moves on (away from the start, along the overall direction)
      const [x0, z0] = line[0]!;
      const [xn, zn] = line[line.length - 1]!;
      const dl = Math.hypot(xn - x0, zn - z0);
      const dir = [(xn - x0) / dl, (zn - z0) / dl] as const;
      let far = 0;
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1]!;
        const [bx, bz] = line[i]!;
        const stepLen = Math.hypot(bx - ax, bz - az);
        expect(stepLen, `${era} step ${i}`).toBeGreaterThan(0.2);
        expect(stepLen, `${era} step ${i}`).toBeLessThan(2.5);
        expect((bx - ax) * dir[0] + (bz - az) * dir[1], `${era} step ${i}`).toBeGreaterThan(0);
        const d = Math.hypot(bx - x0, bz - z0);
        expect(d, `${era} step ${i}`).toBeGreaterThan(far);
        far = d;
      }
      // downhill: never more than a few centimetres up between samples, and lower at the end
      for (let i = 1; i < line.length; i++) {
        const rise = h(line[i]![0], line[i]![1]) - h(line[i - 1]![0], line[i - 1]![1]);
        expect(rise, `${era} step ${i}`).toBeLessThan(0.05);
      }
      if (h === slope) expect(h(xn, zn)).toBeLessThan(h(x0, z0) - 5);
      // it leaves the hollow in front of the wall (never into the slope behind it)
      for (const [x, z] of line) expect(toLocal(x, z)[1]).toBeGreaterThan(PIECES.wall.w);
    }
  });
});

describe('Karlsbergquelle: the touch', () => {
  const front = (era: Era, w = 2.2): [number, number] => {
    const [tu] = touchLocal(era);
    return toWorld(tu, w);
  };

  it.each(ERAS)('%s: true in front of the water, facing it', (era) => {
    const [x, z] = front(era);
    expect(canTouch(x, z, yawToWater(x, z, era), era)).toBe(true);
    // facing the spring square on (compass 234 − 180 = 54) is just as good
    expect(canTouch(x, z, yawOf(QUELLE.facing - 180), era)).toBe(true);
    // a little to the side, still turned to the water
    const [tu, tw] = touchLocal(era);
    const [sx, sz] = toWorld(tu + 0.9, tw + 1.0);
    expect(canTouch(sx, sz, yawToWater(sx, sz, era), era)).toBe(true);
  });

  it.each(ERAS)('%s: false facing away, or turned sideways', (era) => {
    const [x, z] = front(era);
    expect(canTouch(x, z, yawOf(QUELLE.facing), era)).toBe(false);
    expect(canTouch(x, z, yawToWater(x, z, era) + Math.PI / 2, era)).toBe(false);
    expect(canTouch(x, z, yawToWater(x, z, era) - Math.PI / 2, era)).toBe(false);
  });

  it.each(ERAS)('%s: false beyond REACH, even facing the water', (era) => {
    const [tu, tw] = touchLocal(era);
    for (const [u, w] of [
      [tu, tw + REACH + 0.2],
      [tu + REACH + 0.3, tw + 0.5],
      [tu - REACH - 0.3, tw + 0.5],
    ] as const) {
      const [x, z] = toWorld(u, w);
      expect(canTouch(x, z, yawToWater(x, z, era), era)).toBe(false);
    }
    // and just inside it, true
    const [x, z] = toWorld(tu, tw + REACH - 0.1);
    expect(canTouch(x, z, yawToWater(x, z, era), era)).toBe(true);
  });

  it.each(ERAS)('%s: false from behind the wall (up the slope), even within reach and facing the water', (era) => {
    const [tu, tw] = touchLocal(era);
    const W = PIECES.wall;
    // on the slope just behind the wall's back face (thick 0.55 m), within REACH of the water
    for (const [u, w] of [
      [tu, W.w - W.thick - 0.1],
      [tu + 0.6, W.w - W.thick - 0.2],
      [tu - 0.8, W.w - 0.3],
    ] as const) {
      const [x, z] = toWorld(u, w);
      expect(Math.hypot(u - tu, w - tw)).toBeLessThan(REACH);
      expect(canTouch(x, z, yawToWater(x, z, era), era), `u ${u} w ${w}`).toBe(false);
    }
  });

  it('the prologue objective point (P_SPOTS.quelle, 1059.3/−833.1) is a place to touch the water from', () => {
    const [x, z] = [1059.3, -833.1];
    const [, w] = toLocal(x, z);
    expect(w).toBeGreaterThan(PIECES.trough.w + PIECES.trough.r);
    expect(canTouch(x, z, yawToWater(x, z, 'today'), 'today')).toBe(true);
  });
});

describe('Karlsbergquelle: clearings', () => {
  const inside = (x: number, z: number) => clearings().some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

  it('the touch point (every era), the place in front, the spring house and the steps keep clear of trees', () => {
    for (const e of ERAS) {
      const [x, z] = toWorld(...touchLocal(e));
      expect(inside(x, z), e).toBe(true);
    }
    // where the player stands to touch
    expect(inside(...toWorld(PIECES.trough.u, 2.2))).toBe(true);
    // the arched spring house up the slope (its middle and its front)
    expect(inside(...toWorld(PIECES.house.u, PIECES.house.w))).toBe(true);
    expect(inside(...toWorld(PIECES.house.u, PIECES.house.w + PIECES.house.depth / 2))).toBe(true);
    // the wall's middle, the pipe
    expect(inside(...toWorld(PIECES.pipe.u, PIECES.wall.w))).toBe(true);
    // the steps' foot
    expect(inside(...toWorld(PIECES.steps.u, PIECES.steps.w0))).toBe(true);
  });

  it('clearings are sane circles (positive radius, a few metres, near the spring)', () => {
    const cs = clearings();
    expect(cs.length).toBeGreaterThan(0);
    for (const [x, z, r] of cs) {
      expect(r).toBeGreaterThan(1);
      expect(r).toBeLessThan(10);
      expect(Math.hypot(x - QUELLE.x, z - QUELLE.z)).toBeLessThan(15);
    }
  });
});
