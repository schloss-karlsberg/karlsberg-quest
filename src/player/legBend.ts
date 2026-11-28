/**
 * Bending a leg under a lowered hip (the avatar's crouch, src/player/avatar.ts): two-bone inverse
 * kinematics. The hip joint sinks, the ankle stays where the clip put it, and the knee goes where
 * the two bone lengths allow, forward of the leg. Pure maths on world-space points
 * (tests/leg-bend.test.ts), so the clip keeps every foot plant, step height and stride.
 */
import { Quaternion, Vector3 } from 'three';

/** World-space turns for one leg, to be applied in this order (each on top of its parent's). */
export interface LegTurns {
  /** Turns the thigh so the knee reaches its new place. */
  thigh: Quaternion;
  /** Then turns the shin (already carried by the thigh) so the ankle is back on its target. */
  calf: Quaternion;
  /** Then turns the foot back to the orientation the clip gave it. */
  foot: Quaternion;
}

export function legTurns(): LegTurns {
  return { thigh: new Quaternion(), calf: new Quaternion(), foot: new Quaternion() };
}

const _hip = new Vector3();
const _dir = new Vector3();
const _pole = new Vector3();
const _clip = new Vector3();
const _knee = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/**
 * The turns that keep `foot` (the ankle) in place when the hip joint sinks by `drop` (m).
 * `hip`, `knee`, `foot`: the joints as the clip posed them (world); `forward`: the body's facing
 * (unit, world), the side the knee bends to when the clip's leg is straight. A clip that already
 * bends the knee (a swinging leg) keeps its own bend direction. Returns false (and leaves `out`)
 * for a degenerate leg.
 */
export function bendLeg(hip: Vector3, knee: Vector3, foot: Vector3, drop: number, forward: Vector3, out: LegTurns): boolean {
  const lt = hip.distanceTo(knee);
  const lc = knee.distanceTo(foot);
  if (!(lt > 1e-4) || !(lc > 1e-4) || !Number.isFinite(drop)) return false;
  _hip.copy(hip);
  _hip.y -= drop;
  _dir.copy(foot).sub(_hip);
  const reach = _dir.length();
  if (!(reach > 1e-5)) return false;
  _dir.multiplyScalar(1 / reach);
  // the ankle's distance from the new hip, within what the two bones can span
  const d = Math.min((lt + lc) * 0.999, Math.max(Math.abs(lt - lc) + 1e-3, reach));
  const along = (lt * lt - lc * lc + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, lt * lt - along * along));
  // where the knee points: the clip's own bend (strong when the knee is bent), else forward
  _clip.copy(knee).sub(hip);
  _clip.addScaledVector(_dir, -_clip.dot(_dir));
  _pole.copy(forward).addScaledVector(_dir, -forward.dot(_dir)).multiplyScalar(lt * 0.6).add(_clip);
  if (_pole.lengthSq() < 1e-10) _pole.copy(forward).addScaledVector(_dir, -forward.dot(_dir));
  if (_pole.lengthSq() < 1e-10) return false;
  _pole.normalize();
  _knee.copy(_hip).addScaledVector(_dir, along).addScaledVector(_pole, off);
  // thigh: from the clip's hip → knee to the new one
  _a.copy(knee).sub(hip).normalize();
  _b.copy(_knee).sub(_hip).normalize();
  out.thigh.setFromUnitVectors(_a, _b);
  // shin: carried by the thigh's turn, then onto the knee → ankle line
  _a.copy(foot).sub(knee).normalize().applyQuaternion(out.thigh);
  _b.copy(_hip).addScaledVector(_dir, d).sub(_knee).normalize();
  out.calf.setFromUnitVectors(_a, _b);
  // foot: undo both, so the sole lies as the clip laid it
  out.foot.copy(out.calf).multiply(out.thigh).invert();
  return true;
}
