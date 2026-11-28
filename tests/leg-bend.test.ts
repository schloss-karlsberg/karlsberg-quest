import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bendLeg, legTurns } from '../src/player/legBend';

/** Apply the turns to a leg given by its joints: the knee and the ankle after the hip sank by `drop`. */
function bent(hip: Vector3, knee: Vector3, foot: Vector3, drop: number, forward: Vector3) {
  const t = legTurns();
  const ok = bendLeg(hip, knee, foot, drop, forward, t);
  const h = hip.clone();
  h.y -= drop;
  const thigh = knee.clone().sub(hip).applyQuaternion(t.thigh);
  const k = h.clone().add(thigh);
  const shin = foot.clone().sub(knee).applyQuaternion(t.thigh).applyQuaternion(t.calf);
  const f = k.clone().add(shin);
  return { ok, t, hip: h, knee: k, foot: f };
}

const FWD = new Vector3(0, 0, -1);

describe('bendLeg: a knee bent under a lowered hip', () => {
  it('keeps the ankle in place and the bone lengths, the knee forward', () => {
    const hip = new Vector3(0.1, 0.9, 0);
    const knee = new Vector3(0.1, 0.5, -0.02);
    const foot = new Vector3(0.1, 0.1, 0.02);
    const r = bent(hip, knee, foot, 0.25, FWD);
    expect(r.ok).toBe(true);
    expect(r.foot.distanceTo(foot)).toBeLessThan(1e-6);
    expect(r.hip.distanceTo(r.knee)).toBeCloseTo(hip.distanceTo(knee), 6);
    expect(r.knee.distanceTo(r.foot)).toBeCloseTo(knee.distanceTo(foot), 6);
    // forward is −z: the knee goes ahead of the hip–ankle line
    expect(r.knee.z).toBeLessThan(-0.2);
    expect(Math.abs(r.knee.x - 0.1)).toBeLessThan(0.02);
  });

  it('no drop leaves the leg as the clip posed it', () => {
    const hip = new Vector3(0, 0.9, 0);
    const knee = new Vector3(0, 0.52, -0.12);
    const foot = new Vector3(0, 0.12, 0.05);
    const r = bent(hip, knee, foot, 0, FWD);
    expect(r.ok).toBe(true);
    expect(r.knee.distanceTo(knee)).toBeLessThan(1e-3);
    expect(r.foot.distanceTo(foot)).toBeLessThan(1e-6);
  });

  it('a swinging leg keeps its lifted foot and its own bend direction', () => {
    // mid-swing: the thigh forward, the shin folded back, the foot off the ground
    const hip = new Vector3(0, 0.92, 0);
    const knee = new Vector3(0.03, 0.6, -0.26);
    const foot = new Vector3(0.03, 0.3, 0.02);
    const r = bent(hip, knee, foot, 0.22, FWD);
    expect(r.ok).toBe(true);
    expect(r.foot.distanceTo(foot)).toBeLessThan(1e-6);
    expect(r.knee.z).toBeLessThan(knee.z);
  });

  it('the foot turn undoes the leg turns: the sole lies as the clip laid it', () => {
    const t = legTurns();
    expect(bendLeg(new Vector3(0, 0.9, 0), new Vector3(0, 0.5, -0.02), new Vector3(0, 0.1, 0.02), 0.25, FWD, t)).toBe(true);
    const sole = new Vector3(0, 0, -1).applyQuaternion(t.thigh).applyQuaternion(t.calf).applyQuaternion(t.foot);
    expect(sole.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6);
  });

  it('a target out of reach stretches the leg straight at it instead of breaking', () => {
    const hip = new Vector3(0, 0.9, 0);
    const knee = new Vector3(0, 0.5, 0);
    const foot = new Vector3(0, 0.1, 0);
    // a negative drop raises the hip beyond the leg's length
    const r = bent(hip, knee, foot, -0.3, FWD);
    expect(r.ok).toBe(true);
    expect(r.hip.distanceTo(r.foot)).toBeLessThanOrEqual(0.8);
    for (const v of [r.knee, r.foot]) expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
  });

  it('rejects a degenerate leg', () => {
    const p = new Vector3(0, 1, 0);
    expect(bendLeg(p, p.clone(), new Vector3(0, 0, 0), 0.2, FWD, legTurns())).toBe(false);
    expect(bendLeg(p, new Vector3(0, 0.5, 0), new Vector3(0, 0, 0), Number.NaN, FWD, legTurns())).toBe(false);
  });
});
