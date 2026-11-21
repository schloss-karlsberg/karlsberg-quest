import { describe, expect, it } from 'vitest';
import { type Env, type Snapshot, lerpAngle, normalize, poseAt, stillsAt, stillsSeconds } from '../src/systems/cinematic/keys';
import type { CinematicFile } from '../src/systems/cinematic/types';
import reh from '../content/cinematics/reh.json';

const snap: Snapshot = { x: 100, y: 10, z: 200, yaw: 0, pitch: -0.1, eye: 1.6, cam: { x: 100, y: 12, z: 204, fov: 70 } };
const flat = (h = 10, targets: Record<string, { x: number; y: number; z: number }> = {}): Env => ({ ground: () => h, target: (t) => targets[t] ?? null });
const hold = () => ({ yaw: 0.3, pitch: 0.05 });
const plan = (raw: unknown, files?: Record<string, CinematicFile>) => {
  const n = normalize(raw, files);
  if (!n.ok) throw new Error(n.error);
  return n.plan;
};

describe('cinematic keys: normalize', () => {
  it('fills defaults and carries fields over from the key before', () => {
    const p = plan({ id: 'a', keys: [{ t: 0, eye: { x: 1, z: 2 }, fov: 40, fade: 1 }, { t: 1, look: { pitch: 10 } }, { t: 3, fov: 20, ease: 'linear' }] });
    expect(p.skippable).toBe(true);
    expect(p.lockInput).toBe(true);
    expect(p.reduced).toBe('stills');
    expect(p.seconds).toBe(3);
    const k = p.keys!;
    expect(k[1]!.eye).toEqual({ x: 1, z: 2 });
    expect(k[1]!.fov).toBe(40);
    expect(k[1]!.fade).toBe(1);
    expect(k[2]!.look).toEqual({ pitch: 10 });
    expect(k[2]!.eye).toEqual({ x: 1, z: 2 });
    // easing is per move, not carried
    expect(k[1]!.ease).toBe('smooth');
    expect(k[2]!.ease).toBe('linear');
  });

  it('resolves a ref and lets the request override its flags', () => {
    const files = { reh: reh as CinematicFile };
    const p = plan({ id: 'reh', ref: 'reh', skippable: false }, files);
    expect(p.seconds).toBe(6);
    expect(p.skippable).toBe(false);
    expect(p.keys![1]!.fov).toBe(18);
    expect(p.keys![1]!.look).toEqual({ target: 'animal:kitz' });
  });

  it.each([
    ['no object', 42],
    ['bad id', { id: 'a b', keys: [{ t: 0 }, { t: 1 }] }],
    ['none of keys/ref/orbit', { id: 'a' }],
    ['two of keys/ref/orbit', { id: 'a', keys: [{ t: 0 }, { t: 1 }], orbit: { x: 0, z: 0, r: 1, period: 1, seconds: 2 } }],
    ['one key', { id: 'a', keys: [{ t: 0 }] }],
    ['first t not 0', { id: 'a', keys: [{ t: 0.1 }, { t: 1 }] }],
    ['t not increasing', { id: 'a', keys: [{ t: 0 }, { t: 2 }, { t: 2 }] }],
    ['too short', { id: 'a', keys: [{ t: 0 }, { t: 0.2 }] }],
    ['too long', { id: 'a', keys: [{ t: 0 }, { t: 61 }] }],
    ['fov out of range', { id: 'a', keys: [{ t: 0, fov: 10 }, { t: 1 }] }],
    ['look key out of range', { id: 'a', keys: [{ t: 0, fade: 2 }, { t: 1 }] }],
    ['bad target', { id: 'a', keys: [{ t: 0, look: { target: 'tree:1' } }, { t: 1 }] }],
    ['NaN eye', { id: 'a', keys: [{ t: 0, eye: { x: NaN, z: 0 } }, { t: 1 }] }],
    ['bad ease', { id: 'a', keys: [{ t: 0 }, { t: 1, ease: 'bounce' }] }],
    ['unknown ref', { id: 'a', ref: 'nope' }],
    ['orbit seconds', { id: 'a', orbit: { x: 0, z: 0, r: 5, period: 10, seconds: 0.5 } }],
    ['orbit radius', { id: 'a', orbit: { x: 0, z: 0, r: -1, period: 10, seconds: 5 } }],
    ['bad reduced', { id: 'a', keys: [{ t: 0 }, { t: 1 }], reduced: 'slow' }],
  ])('rejects a bad spec: %s', (_name, raw) => {
    const n = normalize(raw, {});
    expect(n.ok).toBe(false);
    if (!n.ok) expect(n.error.length).toBeGreaterThan(3);
  });

  it('the shipped example (content/cinematics/reh.json) is valid', () => {
    expect(normalize({ id: 'reh', ref: 'reh' }, { reh: reh as CinematicFile }).ok).toBe(true);
  });
});

describe('cinematic keys: poseAt', () => {
  it('interpolates eye and fov with smooth and linear easing', () => {
    const lin = plan({ id: 'a', keys: [{ t: 0, eye: { x: 0, z: 0, y: 2 }, look: { pitch: 0, yaw: 0 }, fov: 60 }, { t: 2, eye: { x: 10, z: 0, y: 2 }, fov: 20, ease: 'linear' }] });
    const sm = plan({ id: 'a', keys: [{ t: 0, eye: { x: 0, z: 0, y: 2 }, look: { pitch: 0, yaw: 0 }, fov: 60 }, { t: 2, eye: { x: 10, z: 0, y: 2 }, fov: 20 }] });
    const env = flat(5);
    const a = poseAt(lin, 0.5, snap, env, hold());
    expect(a.x).toBeCloseTo(2.5);
    expect(a.fov).toBeCloseTo(50);
    expect(a.y).toBeCloseTo(7); // 2 m over the ground at 5
    const b = poseAt(sm, 0.5, snap, env, hold());
    expect(b.x).toBeCloseTo(10 * (0.25 * 0.25 * (3 - 0.5)));
    expect(poseAt(sm, 1, snap, env, hold()).x).toBeCloseTo(5);
    // clamped after the end
    expect(poseAt(sm, 99, snap, env, hold()).x).toBeCloseTo(10);
    // look yaw compass 0 = north = player yaw 0
    expect(a.yaw).toBeCloseTo(0);
    expect(a.pitch).toBeCloseTo(0);
  });

  it('carries look keys over and lerps fade', () => {
    const p = plan({ id: 'a', keys: [{ t: 0, fade: 1 }, { t: 1, fade: 0 }, { t: 2 }] });
    expect(poseAt(p, 0, snap, flat(), hold()).fade).toBeCloseTo(1);
    expect(poseAt(p, 0.5, snap, flat(), hold()).fade).toBeCloseTo(0.5);
    expect(poseAt(p, 1.5, snap, flat(), hold()).fade).toBeCloseTo(0);
  });

  it('defaults: no eye = the camera at the start, no look = the player view', () => {
    const p = plan({ id: 'a', keys: [{ t: 0 }, { t: 1 }] });
    const q = poseAt(p, 0.5, snap, flat(), hold());
    expect([q.x, q.y, q.z]).toEqual([100, 12, 204]);
    expect(q.yaw).toBeCloseTo(0);
    expect(q.pitch).toBeCloseTo(-0.1);
    expect(q.fov).toBe(70);
  });

  it('player-relative eye uses the snapshot at the start (the shot does not swim)', () => {
    const p = plan({ id: 'a', keys: [{ t: 0, eye: { rel: 'player', back: 2, up: 1.5, right: 1 } }, { t: 1 }] });
    // yaw 0 looks north (−z): back is +z, right is +x
    const q = poseAt(p, 0.5, snap, flat(), hold());
    expect(q.x).toBeCloseTo(101);
    expect(q.z).toBeCloseTo(202);
    expect(q.y).toBeCloseTo(11.5);
    // the player moving afterwards does not matter: the snapshot is what counts
    const moved = { ...snap };
    const q2 = poseAt(p, 0.5, snap, flat(), hold());
    moved.x = 500;
    expect(q2.x).toBeCloseTo(101);
    // turn 90° (left): back now points +x … offsets turn with it, so does the default view
    const t = plan({ id: 'a', keys: [{ t: 0, eye: { rel: 'player', back: 2, turn: 90 } }, { t: 1 }] });
    const q3 = poseAt(t, 0, snap, flat(), hold());
    expect(q3.x).toBeCloseTo(102);
    expect(q3.z).toBeCloseTo(200);
    expect(q3.yaw).toBeCloseTo(Math.PI / 2);
    // never under the ground
    const low = plan({ id: 'a', keys: [{ t: 0, eye: { rel: 'player', up: -5 } }, { t: 1 }] });
    expect(poseAt(low, 0, snap, flat(10), hold()).y).toBeGreaterThanOrEqual(10.25);
  });

  it('looks at a target and holds the last view when it cannot be found', () => {
    const p = plan({ id: 'a', keys: [{ t: 0, eye: { x: 0, z: 0, y: 0 }, look: { target: 'npc:soll' } }, { t: 2 }] });
    const env = flat(0, { 'npc:soll': { x: 10, y: 0.25, z: 0 } }); // the eye sits 0.25 m over the ground (clearance)
    const q = poseAt(p, 1, snap, env, hold());
    // east of the eye: yaw −90° (turning right)
    expect(q.yaw).toBeCloseTo(-Math.PI / 2);
    expect(q.pitch).toBeCloseTo(0, 5);
    const lost = poseAt(p, 1, snap, flat(0), { yaw: 0.7, pitch: 0.2 });
    expect(lost.yaw).toBeCloseTo(0.7);
    expect(lost.pitch).toBeCloseTo(0.2);
  });

  it('orbits around x / z at radius r with the period, looking at the centre', () => {
    const p = plan({ id: 'o', orbit: { x: 0, z: 0, r: 10, period: 8, seconds: 16 } });
    const s0 = { ...snap, x: 0, z: 30 };
    const env = flat(2);
    const a = poseAt(p, 0, s0, env, hold());
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(10); // starts on the player's side
    expect(a.y).toBeCloseTo(5); // 3 m over the ground at 2
    const b = poseAt(p, 2, s0, env, hold()); // a quarter turn
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(10);
    expect(b.x).toBeCloseTo(10);
    expect(b.z).toBeCloseTo(0, 5);
    // looking at the centre: from +x the view is west (yaw +90°)
    expect(b.yaw).toBeCloseTo(Math.PI / 2);
    expect(poseAt(p, 8, s0, env, hold()).z).toBeCloseTo(10); // a full turn
    expect(p.seconds).toBe(16);
  });

  it('lerps yaw the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
  });

  it('reduced motion: two stills with a dip through black, ≤ 3 s', () => {
    const p = plan({ id: 'a', keys: [{ t: 0 }, { t: 10 }] });
    expect(stillsSeconds(p)).toBe(3);
    expect(stillsAt(p, 0.2)).toEqual({ src: 0, dip: 0 });
    expect(stillsAt(p, 2.9).src).toBe(10);
    expect(stillsAt(p, 1.5).dip).toBeCloseTo(1);
    const short = plan({ id: 'b', keys: [{ t: 0 }, { t: 1 }] });
    expect(stillsSeconds(short)).toBe(1);
  });
});
