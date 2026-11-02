/**
 * A ghostly NPC: a translucent 18th-century silhouette built procedurally (no models). Costume
 * shapes per outfit (roster.ts): justaucorps with flared, pleated skirts open at the front over a
 * long buttoned waistcoat, turned-back cuffs, jabot, tricorn, powdered wig with side rolls and a
 * queue; Hanne's bodice, fichu, full skirt, linen apron and mob cap; hunting livery with
 * cross-belt, Parforcehorn and riding boots; a carter's short jacket and slouch hat; a mason's
 * leather apron. The face stays blank, with two dark hollows where the eyes should be.
 *
 * Cheap by design: every piece is merged into ONE geometry (attributes aPart / aPivot / aShade)
 * and shaded by ONE material (premultiplied: dark smoke body + fresnel rim glow in the mood tint).
 * A depth-only pre-pass with the same shader keeps only the front-most surface, so overlapping
 * pieces never double up. The vertex shader adds the idle motion per part (breath, sway, head
 * turn, coat skirts swinging, an eerie figure's slice "glitch"); the lower body dissolves into
 * mist that pools around the feet. Smoke motes rise around the figure.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { ERA_TINT, type NpcLook } from './roster';

/** sRGB hex → linear colour (the world renders linear HDR before tone mapping). */
function lin(hex: number, k = 1): Color {
  return new Color(hex).convertSRGBToLinear().multiplyScalar(k);
}

/**
 * Parts: 0 head + hair, 1 torso (coat above the waist, waistcoat, belt), 2 arm L, 3 arm R,
 * 4 legs, 5 hat, 6 prop, 7 skirts below the waist (coat skirts, skirt, aprons: they swing).
 * `part: -1` = split by height at the waist (1 above, 7 below).
 */
interface Piece {
  geo: BufferGeometry;
  part: number;
  pivot: [number, number, number];
  /** 0 dark cloth … 1 linen / powdered hair / brass: brighter inside the smoke. */
  shade: number;
}

type Prof = [number, number][]; // [radius, y]

interface RevolveOpts {
  sx?: number;
  sz?: number;
  /** Half-angle (rad) of the opening at the front (+z) for a height y. */
  open?: (y: number) => number;
  /** Relative radius change (folds, pleats) for a height and angle (0 = front, π = back). */
  folds?: (y: number, phi: number) => number;
  /** Angle range (default full circle). */
  phi0?: number;
  phi1?: number;
  zoff?: number;
}

/** A surface of revolution around +y (an open, elliptical lathe; 0 rad = front, +z). */
function revolve(prof: Prof, segs: number, o: RevolveOpts = {}): BufferGeometry {
  const rows = prof.length;
  const cols = segs + 1;
  const pos = new Float32Array(rows * cols * 3);
  const sx = o.sx ?? 1;
  const sz = o.sz ?? 1;
  for (let j = 0; j < rows; j++) {
    const [r, y] = prof[j]!;
    const op = o.open?.(y) ?? 0;
    const a0 = (o.phi0 ?? 0) + op;
    const a1 = (o.phi1 ?? Math.PI * 2) - op;
    for (let i = 0; i < cols; i++) {
      const phi = a0 + ((a1 - a0) * i) / segs;
      const rr = r * (1 + (o.folds?.(y, phi) ?? 0));
      const k = (j * cols + i) * 3;
      pos[k] = Math.sin(phi) * rr * sx;
      pos[k + 1] = y;
      pos[k + 2] = Math.cos(phi) * rr * sz + (o.zoff ?? 0);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const c = a + cols;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Radius of a profile at height y (linear between rows, clamped). */
function radiusAt(prof: Prof, y: number): number {
  const sorted = [...prof].sort((a, b) => a[1] - b[1]);
  if (y <= sorted[0]![1]) return sorted[0]![0];
  for (let i = 1; i < sorted.length; i++) {
    const [r1, y1] = sorted[i]!;
    const [r0, y0] = sorted[i - 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return sorted[sorted.length - 1]![0];
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

function capsule(r: number, a: Vector3, b: Vector3, sx = 1, sz = 1, radial = 10): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 4, radial);
  g.scale(sx, 1, sz);
  const dir = b.clone().sub(a).normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}

/** An open tube (cuff, boot top) from a to b, radius r0 at a and r1 at b. */
function tube(r0: number, r1: number, a: Vector3, b: Vector3, radial = 10): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CylinderGeometry(r1, r0, Math.max(0.001, len), radial, 1, true);
  const dir = b.clone().sub(a).normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}

/** The tricorn: a crown and a brim cocked up on three sides into a rounded triangle, point forward. */
function tricorn(scale: number): BufferGeometry {
  const ri = 0.1 * scale;
  const rin = 0.165 * scale; // in-radius of the triangle
  const segs = 36;
  const rings = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      // rounded triangle, corners at 0 (front), 120°, 240°
      const u = ((((th - Math.PI / 3) % ((2 * Math.PI) / 3)) + (2 * Math.PI) / 3) % ((2 * Math.PI) / 3)) - Math.PI / 3;
      const R = rin * (1 + 0.62 * (1 / Math.cos(u) - 1));
      const corner = Math.abs(u) / (Math.PI / 3); // 0 side centre … 1 corner
      // flat inner brim, then the cocked-up wall (slightly leaning out)
      const wall = Math.max(0, (t - 0.45) / 0.55);
      const r = ri + (R - ri) * Math.min(1, t / 0.45) * (1 - 0.18 * wall) + (R - ri) * 0.18 * wall;
      const y = (0.075 + 0.012 * corner) * scale * Math.pow(wall, 0.8);
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const c = a + segs + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const brim = new BufferGeometry();
  brim.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  brim.setIndex(idx);
  brim.computeVertexNormals();
  const crown = new SphereGeometry(0.108 * scale, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(1, 0.95, 1);
  return mergeAll([brim, crown]);
}

function mergeAll(gs: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
    }
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  return out;
}

/** Head centre in the figure's local frame (eyes, wig and hats are placed around it). */
export function headCentre(look: NpcLook): Vector3 {
  return new Vector3(0, 1.6 * (look.height / 1.7), 0.012);
}

export function figurePieces(look: NpcLook): Piece[] {
  const H = look.height / 1.7;
  const W = look.build;
  const s = (y: number) => y * H;
  const p: Piece[] = [];
  const add = (geo: BufferGeometry, part: number, pivot: [number, number, number], shade = 0.3) => p.push({ geo, part, pivot, shade });
  const neckPivot: [number, number, number] = [0, s(1.47), 0];
  const hip: [number, number, number] = [0, s(1.0), 0];
  const hc = headCentre(look);
  const HR = 0.1 * Math.sqrt(H);
  const sx = 1.12 * W;
  const sz = 0.68;
  const maid = look.outfit === 'maid';
  const prof = (pts: Prof): Prof => pts.map(([r, y]) => [r, s(y)]);
  /** Surface z of an elliptical profile at (x, y) (front), + offset: belts, buttons. */
  const frontZ = (pr: Prof, x: number, y: number, k: number, kz: number, off: number) => {
    const r = radiusAt(pr, y);
    return kz * Math.sqrt(Math.max(0, r * r - (x / k) * (x / k))) + off;
  };

  // ---- head, neck, hands ----------------------------------------------------------------------
  const head = new SphereGeometry(HR, 16, 12);
  head.scale(0.9, 1.1, 1);
  head.translate(hc.x, hc.y, hc.z);
  add(head, 0, neckPivot, 0.45);
  add(capsule(0.046, v(0, s(1.42), 0), v(0, s(1.52), 0.005)), 0, neckPivot, 0.4);

  // ---- torso ----------------------------------------------------------------------------------
  const torso = maid
    ? prof([[0.12, 0.95], [0.118, 1.02], [0.15, 1.16], [0.163, 1.26], [0.15, 1.34], [0.11, 1.405], [0.055, 1.44]])
    : prof([[0.14, 0.9], [0.15, 1.0], [0.165, 1.14], [0.175, 1.26], [0.168, 1.34], [0.13, 1.405], [0.06, 1.44]]);
  add(revolve(torso, 18, { sx, sz }), 1, hip, maid ? 0.35 : look.outfit === 'mason' || look.outfit === 'carter' ? 0.75 : 0.3);
  // shoulder line
  add(capsule(0.052, v(-0.16 * W, s(1.375), -0.005), v(0.16 * W, s(1.375), -0.005), 1, 0.9), 1, hip, 0.3);

  // ---- arms -----------------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const part = side < 0 ? 2 : 3;
    const sh = v(side * 0.2 * W, s(1.37), -0.005);
    const el = v(side * 0.245 * W, s(1.1), 0.02);
    const wr = v(side * 0.245 * W, s(0.87), 0.1);
    const piv: [number, number, number] = [sh.x, sh.y, sh.z];
    const bare = maid || look.outfit === 'mason';
    add(capsule(maid ? 0.048 : 0.058, sh, el), part, piv, look.outfit === 'mason' ? 0.8 : 0.3);
    add(capsule(bare ? 0.037 : 0.051, el, wr), part, piv, bare ? 0.45 : 0.3);
    const dir = wr.clone().sub(el).normalize();
    if (look.outfit === 'official' || look.outfit === 'livery') {
      // big turned-back cuff, lace below it
      add(tube(0.066, 0.08, wr.clone().addScaledVector(dir, -0.15), wr.clone().addScaledVector(dir, -0.02)), part, piv, 0.55);
      if (look.outfit === 'official') add(tube(0.045, 0.06, wr.clone().addScaledVector(dir, -0.02), wr.clone().addScaledVector(dir, 0.04), 8), part, piv, 1);
    } else if (maid) {
      // elbow frill of the short sleeve
      add(tube(0.05, 0.075, el.clone().addScaledVector(dir, -0.02), el.clone().addScaledVector(dir, 0.07), 10), part, piv, 0.9);
    } else if (look.outfit === 'mason') {
      add(capsule(0.06, el.clone().addScaledVector(dir, -0.03), el.clone().addScaledVector(dir, 0.03)), part, piv, 0.85); // rolled sleeve
    }
    const hand = new SphereGeometry(0.042, 10, 8);
    hand.scale(0.75, 1.25, 0.55);
    hand.translate(wr.x + dir.x * 0.06, wr.y + dir.y * 0.06, wr.z + dir.z * 0.06);
    add(hand, part, piv, 0.5);
  }

  // ---- legs (men) -----------------------------------------------------------------------------
  if (!maid) {
    for (const side of [-1, 1]) {
      const x0 = side * 0.085 * W;
      const x1 = side * 0.095 * W;
      add(capsule(0.072, v(x0, s(0.95), 0), v(x1, s(0.53), 0.01)), 4, [0, s(1.0), 0], 0.3);
      if (look.outfit === 'livery') {
        // riding boots to above the knee, the top turned down
        add(tube(0.058, 0.062, v(x1, s(0.04), 0.02), v(x1, s(0.5), 0.01), 10), 4, [0, s(1.0), 0], 0.15);
        add(tube(0.068, 0.074, v(x1, s(0.47), 0.01), v(x1, s(0.58), 0.01), 10), 4, [0, s(1.0), 0], 0.6);
      } else {
        add(capsule(0.05, v(x1, s(0.5), 0.01), v(x1 * 1.04, s(0.09), 0.02)), 4, [0, s(1.0), 0], 0.75); // stockings
        add(tube(0.074, 0.074, v(x1, s(0.51), 0.01), v(x1, s(0.555), 0.01), 10), 4, [0, s(1.0), 0], 0.4); // knee band
      }
      const shoe = capsule(0.036, v(x1, s(0.04), -0.03), v(x1, s(0.04), 0.13), 1.15, 1);
      shoe.scale(1, 0.7, 1);
      add(shoe, 4, [0, s(1.0), 0], 0.1);
    }
  }

  // ---- costume --------------------------------------------------------------------------------
  const backPleats = (n: number, amp: number, top: number, bottom: number) => (y: number, phi: number) =>
    amp * Math.sin(phi * n) * (0.5 - 0.5 * Math.cos(phi)) * Math.max(0, Math.min(1, (s(top) - y) / Math.max(1e-3, s(top) - s(bottom))));

  if (look.outfit === 'official' || look.outfit === 'livery') {
    const hem = look.outfit === 'official' ? 0.5 : 0.64;
    // long waistcoat with a button row
    const wc = prof([[0.152, 0.8], [0.16, 0.9], [0.158, 1.0], [0.172, 1.14], [0.182, 1.26], [0.172, 1.35]]);
    add(revolve(wc, 18, { sx, sz, open: (y) => (y > s(1.33) ? 0.3 : 0) }), -1, hip, look.outfit === 'official' ? 0.55 : 0.4);
    for (let i = 0; i < 7; i++) {
      const y = s(0.88 + i * 0.065);
      const b = new SphereGeometry(0.011, 6, 4);
      b.translate(0, y, frontZ(wc, 0, y, sx, sz, 0.004));
      add(b, 1, hip, 1);
    }
    // the coat: fitted above the waist, flared skirts below, open at the front, pleated behind
    const cp: Prof = [[0.075, 1.45], [0.15, 1.415], [0.19, 1.345], [0.195, 1.22], [0.18, 1.08], [0.172, 1.0], [0.205, 0.92], [0.25, 0.81], [0.3, 0.68]];
    if (hem < 0.6) cp.push([0.34, 0.56], [0.355, 0.5]);
    else cp.push([0.315, hem]);
    const coat = prof(cp);
    add(
      revolve(coat, 26, {
        sx,
        sz: 0.74,
        open: (y) => (y > s(1.3) ? 0.55 : y > s(1.0) ? 0.34 : 0.34 + ((s(1.0) - y) / H) * 1.5),
        folds: backPleats(10, 0.075, 0.98, hem),
      }),
      -1,
      hip,
      0.12,
    );
    // stand-up collar at the back of the neck
    add(revolve(prof([[0.085, 1.43], [0.078, 1.5]]), 12, { sx: 1, sz: 0.9, phi0: Math.PI * 0.45, phi1: Math.PI * 1.55 }), 1, hip, 0.2);
    // jabot / neck stock
    add(tube(0.05, 0.05, v(0, s(1.41), 0.005), v(0, s(1.47), 0.005), 10), 0, neckPivot, 1);
    const jab = new ConeGeometry(0.042, 0.13, 8, 1, true);
    jab.rotateX(Math.PI);
    jab.translate(0, s(1.36), frontZ(torso, 0, s(1.36), sx, sz, 0.02));
    add(jab, 1, hip, 1);
    if (look.outfit === 'livery') {
      // cross-belt over the left shoulder to the right hip, the horn hanging there
      const pts: Vector3[] = [];
      for (let i = 0; i <= 4; i++) {
        const f = i / 4;
        const x = (-0.15 + 0.32 * f) * W;
        const y = s(1.39 - 0.42 * f);
        pts.push(v(x, y, frontZ(coat, x, y, sx, 0.74, 0.012)));
      }
      for (let i = 0; i < 4; i++) add(capsule(0.016, pts[i]!, pts[i + 1]!, 1.6, 0.6, 6), 1, hip, 0.85);
      const horn = new TorusGeometry(0.115, 0.011, 6, 28);
      horn.rotateY(Math.PI / 2);
      horn.translate(0.25 * W, s(0.98), -0.02);
      const bell = new ConeGeometry(0.045, 0.12, 12, 1, true);
      bell.rotateX(Math.PI / 2);
      bell.translate(0.25 * W, s(0.98) - 0.1, 0.06);
      add(horn, 1, hip, 1);
      add(bell, 1, hip, 1);
    }
  } else if (look.outfit === 'carter') {
    // short open jacket over the shirt, neckerchief
    const jk = prof([[0.075, 1.45], [0.155, 1.415], [0.19, 1.345], [0.192, 1.2], [0.18, 1.04], [0.19, 0.9], [0.198, 0.85]]);
    add(revolve(jk, 22, { sx, sz: 0.74, open: (y) => (y > s(1.25) ? 0.5 : 0.42) }), -1, hip, 0.15);
    for (const side of [-1, 1]) {
      const sh = v(side * 0.2 * W, s(1.37), -0.005);
      const el = v(side * 0.245 * W, s(1.1), 0.02);
      add(capsule(0.064, sh, el), side < 0 ? 2 : 3, [sh.x, sh.y, sh.z], 0.15);
    }
    add(tube(0.055, 0.055, v(0, s(1.41), 0.005), v(0, s(1.46), 0.005), 10), 0, neckPivot, 0.7);
    const knot = new ConeGeometry(0.035, 0.1, 6, 1, true);
    knot.rotateX(Math.PI);
    knot.translate(0.01, s(1.37), frontZ(torso, 0, s(1.37), sx, sz, 0.02));
    add(knot, 1, hip, 0.7);
  } else if (look.outfit === 'mason') {
    // leather apron from the chest to below the knee
    const ap = prof([[0.17, 1.3], [0.177, 1.16], [0.168, 1.0], [0.19, 0.85], [0.205, 0.5]]);
    add(revolve(ap, 14, { sx, sz: 0.74, phi0: -1.15, phi1: 1.15, zoff: 0.012 }), -1, hip, 0.2);
    add(tube(0.055, 0.055, v(0, s(1.41), 0.005), v(0, s(1.46), 0.005), 10), 0, neckPivot, 0.6);
  } else if (maid) {
    // fichu over the shoulders
    const fi = prof([[0.065, 1.455], [0.15, 1.41], [0.185, 1.34], [0.178, 1.25]]);
    add(revolve(fi, 20, { sx: 1.12 * W, sz: 0.76 }), 1, hip, 0.95);
    const tip = new ConeGeometry(0.06, 0.12, 6, 1, true);
    tip.rotateX(Math.PI);
    tip.translate(0, s(1.2), frontZ(torso, 0, s(1.2), sx, sz, 0.025));
    add(tip, 1, hip, 0.95);
    // full skirt with soft folds
    const sk = prof([[0.122, 1.0], [0.2, 0.95], [0.28, 0.85], [0.33, 0.62], [0.37, 0.32], [0.415, 0.02]]);
    add(
      revolve(sk, 30, { sx: W, sz: 0.86, folds: (y, phi) => 0.06 * Math.sin(phi * 11 + y * 2.5) * Math.max(0, Math.min(1, (s(0.95) - y) / s(0.7))) }),
      7,
      hip,
      0.25,
    );
    // linen apron in front, its waist band
    const apr = prof([[0.13, 1.0], [0.21, 0.95], [0.29, 0.85], [0.335, 0.62], [0.36, 0.3], [0.38, 0.16]]);
    add(revolve(apr, 14, { sx: W, sz: 0.86, phi0: -0.95, phi1: 0.95, zoff: 0.018, folds: (_y, phi) => 0.025 * Math.sin(phi * 7) }), 7, hip, 1);
    add(tube(0.125 * 1.05, 0.125 * 1.05, v(0, s(0.985), 0), v(0, s(1.02), 0), 18), 1, hip, 0.9);
  }

  // ---- hair -------------------------------------------------------------------------------------
  if (look.hair !== 'none') {
    const gap = look.hair === 'short' ? 1.05 : 0.95;
    const cap = new SphereGeometry(HR * (look.hair === 'wig' ? 1.1 : 1.05), 16, 8, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, Math.PI * (look.hair === 'short' ? 0.52 : 0.6));
    cap.scale(0.92, 1.08, 1.02);
    cap.translate(hc.x, hc.y + 0.008, hc.z - 0.008);
    add(cap, 0, neckPivot, look.hair === 'wig' ? 1 : 0.4);
    if (look.hair === 'wig') {
      // powdered side rolls above the ears
      for (const side of [-1, 1]) {
        add(capsule(0.024, v(side * HR * 0.98, hc.y - 0.005, hc.z - 0.045), v(side * HR * 0.98, hc.y - 0.005, hc.z + 0.03), 1, 1, 8), 0, neckPivot, 1);
        add(capsule(0.02, v(side * HR * 0.95, hc.y - 0.05, hc.z - 0.04), v(side * HR * 0.95, hc.y - 0.05, hc.z + 0.02), 1, 1, 8), 0, neckPivot, 1);
      }
    }
    if (look.hair === 'wig' || look.hair === 'queue') {
      // the queue down the back with a black silk bow
      add(capsule(0.019, v(0, hc.y - 0.03, hc.z - HR * 0.95), v(0, hc.y - 0.22, hc.z - HR * 1.25), 1, 1, 8), 0, neckPivot, look.hair === 'wig' ? 0.9 : 0.4);
      for (const side of [-1, 1]) {
        const bow = new SphereGeometry(0.03, 8, 6);
        bow.scale(1, 0.55, 0.35);
        bow.translate(side * 0.026, hc.y - 0.07, hc.z - HR * 1.08);
        add(bow, 0, neckPivot, 0);
      }
    }
  }

  // ---- headwear -------------------------------------------------------------------------------
  const top = hc.y + HR * 1.02;
  if (look.hat === 'tricorn') {
    const t = tricorn(Math.sqrt(H));
    t.rotateX(-0.12);
    t.translate(0, top - 0.062, hc.z - 0.005);
    add(t, 5, neckPivot, 0.08);
  } else if (look.hat === 'huntcap') {
    const dome = new SphereGeometry(HR * 1.12, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.9, 1.05);
    dome.translate(0, hc.y + 0.01, hc.z);
    const peak = new CylinderGeometry(HR * 1.15, HR * 1.15, 0.008, 14, 1, false, -0.85, 1.7);
    peak.scale(1, 1, 1.25);
    peak.rotateX(0.18);
    peak.translate(0, hc.y + 0.015, hc.z + 0.012);
    add(dome, 5, neckPivot, 0.1);
    add(peak, 5, neckPivot, 0.1);
  } else if (look.hat === 'slouch') {
    const crown = new CylinderGeometry(0.088, 0.104, 0.085, 14, 1);
    crown.translate(0, top + 0.01, hc.z);
    const brim = revolve([[0.1, 0], [0.18, -0.008], [0.23, -0.04]], 22, { folds: (_y, phi) => 0.06 * Math.sin(phi * 3 + 0.7) });
    brim.translate(0, top - 0.03, hc.z);
    add(crown, 5, neckPivot, 0.1);
    add(brim, 5, neckPivot, 0.1);
  } else if (look.hat === 'mobcap') {
    // a puffy linen cap, a ruffle framing the face
    const cap = new SphereGeometry(HR * 1.32, 16, 8, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.62);
    cap.scale(1, 0.82, 1.05);
    cap.translate(hc.x, hc.y + 0.03, hc.z - 0.02);
    add(cap, 5, neckPivot, 1);
    const ruffle = revolve([[HR * 1.1, 0], [HR * 1.42, -0.006]], 30, { folds: (_y, phi) => 0.1 * Math.sin(phi * 20) });
    ruffle.rotateX(-1.12);
    ruffle.translate(hc.x, hc.y + 0.035, hc.z + 0.02);
    add(ruffle, 5, neckPivot, 1);
  }

  // ---- props ----------------------------------------------------------------------------------
  if (look.prop === 'ledger') {
    const b = new PlaneGeometry(0.22, 0.3);
    b.rotateX(-1.1);
    b.translate(-0.06, s(1.06), 0.24);
    add(b, 6, [0, s(1.1), 0], 1);
    const cover = new PlaneGeometry(0.235, 0.315);
    cover.rotateX(-1.1);
    cover.translate(-0.06, s(1.05), 0.235);
    add(cover, 6, [0, s(1.1), 0], 0.1);
  } else if (look.prop === 'basket') {
    const bk = revolve([[0.11, 0], [0.15, 0.14]], 14, { folds: (y, phi) => 0.03 * Math.sin(phi * 14 + y * 60) });
    bk.translate(0.3 * W, s(0.8), 0.08);
    const handle = new TorusGeometry(0.13, 0.009, 5, 18, Math.PI);
    handle.translate(0.3 * W, s(0.8) + 0.14, 0.08);
    add(bk, 6, [0.2 * W, s(1.37), 0], 0.6);
    add(handle, 6, [0.2 * W, s(1.37), 0], 0.6);
  } else if (look.prop === 'stick') {
    const st = new CylinderGeometry(0.012, 0.017, s(1.25), 6);
    st.translate(0.27 * W, s(0.66), 0.14);
    add(st, 6, [0.2 * W, s(1.37), 0], 0.4);
  }
  return p;
}

/** Merge pieces into one non-indexed geometry with aPart / aPivot / aShade attributes. */
export function figureGeometry(look: NpcLook): BufferGeometry {
  const pieces = figurePieces(look);
  const waist = 1.0 * (look.height / 1.7);
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const pivot: number[] = [];
  const shade: number[] = [];
  for (const pc of pieces) {
    const g = pc.geo.index ? pc.geo.toNonIndexed() : pc.geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      pos.push(P.getX(i), y, P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      part.push(pc.part < 0 ? (y < waist - 0.02 ? 7 : 1) : pc.part);
      pivot.push(...pc.pivot);
      shade.push(pc.shade);
    }
    if (g !== pc.geo) g.dispose();
    pc.geo.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  out.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  out.setAttribute('aPivot', new BufferAttribute(new Float32Array(pivot), 3));
  out.setAttribute('aShade', new BufferAttribute(new Float32Array(shade), 1));
  out.computeBoundingSphere();
  return out;
}

const FIG_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uSeed;
uniform float uTalk;
uniform float uHeight;
uniform float uFace;
uniform float uEerie;
uniform vec3 uHeadC;
attribute float aPart;
attribute vec3 aPivot;
attribute float aShade;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vPart;
varying float vShade;
varying vec3 vHead;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float t = uTime * uMotion + uSeed * 7.31;
  vec3 p = position;
  vec3 n = normal;
  vHead = position - uHeadC;
  float breath = sin(t * 1.35);
  // breathing: the chest swells, everything above rises a little
  if (abs(aPart - 1.0) < 0.5) {
    float chest = smoothstep(uHeight * 0.55, uHeight * 0.75, p.y);
    p.x *= 1.0 + 0.016 * breath * chest;
    p.z *= 1.0 + 0.03 * breath * chest;
  }
  if (p.y > uHeight * 0.8) p.y += 0.006 * breath;
  // head (+ hair, hat): slow look-around, a nod while talking
  if (aPart < 0.5 || abs(aPart - 5.0) < 0.5) {
    float yaw = 0.22 * sin(t * 0.31) * uMotion + uFace;
    vec3 q = p - aPivot;
    q = rotY(q, yaw);
    q = rotX(q, 0.05 * sin(t * 0.7) + 0.04 + uTalk * 0.08 * sin(uTime * 7.0));
    p = aPivot + q;
    n = rotY(n, yaw);
  }
  // arms hang and drift; the talking hand lifts
  if (abs(aPart - 2.0) < 0.5 || abs(aPart - 3.0) < 0.5 || abs(aPart - 6.0) < 0.5) {
    float side = aPivot.x < 0.0 ? -1.0 : 1.0;
    vec3 q = p - aPivot;
    float a = 0.05 * sin(t * 0.9 + side) + (side > 0.0 ? uTalk * 0.25 * (0.6 + 0.4 * sin(uTime * 2.1)) : 0.0);
    q = rotX(q, -a);
    q = rotZ(q, side * 0.03 * sin(t * 0.55));
    p = aPivot + q;
  }
  // skirts swing a little behind the body, like cloth in a slow draught
  if (abs(aPart - 7.0) < 0.5) {
    vec3 q = p - aPivot;
    float d = clamp(-q.y / (uHeight * 0.6), 0.0, 1.0);
    q = rotZ(q, 0.035 * sin(t * 0.47 - 0.6) * d);
    q = rotX(q, 0.03 * sin(t * 0.38 + 0.7) * d);
    q.xz *= 1.0 + 0.02 * breath * d;
    p = aPivot + q;
  }
  // the whole figure sways like smoke in a slow draught
  float h = clamp(p.y / uHeight, 0.0, 1.0);
  p.x += (0.022 * sin(t * 0.47) + 0.01 * sin(t * 1.7 + p.y * 3.0)) * h;
  p.z += 0.014 * sin(t * 0.38 + 1.3) * h;
  // an eerie figure stutters: thin slices jump sideways for a frame, like a bad memory
  float slice = floor(p.y * 14.0);
  float g = step(0.985 - 0.02 * uEerie, vh(vec2(floor(uTime * 7.0), slice + uSeed))) * uEerie * uMotion;
  p.x += g * 0.035 * (vh(vec2(slice, floor(uTime * 7.0))) - 0.5) * 2.0;
  // the feet are already mist: they curl and spread
  float foot = 1.0 - smoothstep(0.0, 0.32, p.y / uHeight);
  p.x += foot * 0.06 * sin(t * 1.3 + p.z * 9.0);
  p.z += foot * 0.06 * cos(t * 1.1 + p.x * 9.0);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vY = p.y / uHeight;
  vPart = aPart;
  vShade = aShade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FIG_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uTint;
uniform float uAlpha;
uniform float uEerie;
uniform float uSeed;
uniform float uMotion;
uniform float uPrepass;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vPart;
varying float vShade;
varying vec3 vHead;

float smokeMask() {
  float t = uTime * uMotion;
  // dissolve from the feet up: wisps of noise eat into the lower third
  float n = kqFbm(vec2(vWp.x * 3.1 + vWp.z * 2.3, vY * 5.0 - t * 0.6 + uSeed));
  float m = smoothstep(0.02, 0.44, vY + (n - 0.5) * 0.42);
  // drifting holes in the smoke; head and shoulders stay clearest
  float holes = kqFbm(vec2(vWp.x * 5.0 - t * 0.21, vWp.y * 4.0 + vWp.z * 3.0 - t * 0.33) + uSeed);
  return m * mix(0.62 + 0.5 * holes, 1.0, smoothstep(0.55, 0.85, vY));
}
float fogKeep() {
  float d = length(vWp - uCamPos);
  return exp(-d * (uFogDensity * 1.6 + 0.004));
}
float flicker() {
  float t = uTime * uMotion;
  float f = 0.86 + 0.14 * sin(t * 1.9 + uSeed);
  // eerie figures stutter like a bad memory
  float s = step(0.93, kqHash12(vec2(floor(t * 9.0), uSeed)));
  return mix(1.0, f * (1.0 - 0.45 * s), uEerie) * (0.92 + 0.08 * sin(t * 0.8));
}

void main() {
  float t = uTime * uMotion;
  float m = smokeMask();
  float A = uAlpha * fogKeep();
  if (uPrepass > 0.5) {
    // depth only, where the figure is dense: the colour pass then lights the front-most skin
    if (m * A < 0.3) discard;
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(n, v) < 0.0) n = -n;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.3);
  float lamb = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  // smoke flowing upwards inside the figure, faint bands of light drifting through it
  float flow = kqFbm(vec2(vWp.x * 3.0 + vWp.z * 2.0 + uSeed, vWp.y * 2.6 - t * 0.45));
  float bands = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(vWp.y * 30.0 - t * 1.6 + flow * 4.0));
  // a blank face; two dark hollows where the eyes should be
  float eyes = 0.0;
  if (vPart < 0.5) {
    vec2 e = vec2(abs(vHead.x) - 0.036, vHead.y + 0.004);
    eyes = smoothstep(0.03, 0.08, vHead.z) * exp(-(e.x * e.x) / 0.00035 - (e.y * e.y) / 0.00018);
  }
  float fl = flicker();
  float glow = rim * 1.4 + 0.06 + 0.2 * vShade + 0.1 * flow + 0.1 * bands;
  // a soft heart light at the chest
  glow += exp(-pow((vY - 0.74) * 4.0, 2.0)) * 0.14 * (1.0 - rim);
  glow *= (1.0 - 0.95 * eyes) * fl;
  // dark cloth is denser smoke than linen; the silhouette edge densest
  float a = (0.28 + 0.34 * rim + 0.16 * (1.0 - lamb) + 0.2 * (1.0 - vShade)) * m * A;
  a = clamp(a + eyes * 0.55 * m * A, 0.0, 0.95);
  if (a < 0.004 && glow * m * A < 0.004) discard;
  // ink: near-black wool … pale linen lit from inside
  vec3 ink = mix(mix(vec3(0.03, 0.027, 0.025), uTint * 0.04, 0.4), uTint * 0.2 + vec3(0.03), vShade * vShade) * (1.0 - 0.7 * eyes) * (0.75 + 0.5 * lamb);
  // premultiplied: dark smoke over the scene + the figure's own light
  gl_FragColor = vec4(ink * a + uTint * glow * m * A, a);
}
`;

export function figureMaterials(look: NpcLook): { body: ShaderMaterial; depth: ShaderMaterial } {
  const shared = {
    uTint: { value: lin(look.tint, look.mood === 'warm' ? 2.0 : 1.6) },
    uAlpha: { value: 0 },
    uEerie: { value: look.mood === 'eerie' ? 1 : look.mood === 'neutral' ? 0.4 : 0 },
    uSeed: { value: look.seed },
    uMotion: { value: 1 },
    uTalk: { value: 0 },
    uHeight: { value: look.height },
    uFace: { value: 0 },
    uHeadC: { value: headCentre(look) },
  };
  const body = new ShaderMaterial({
    vertexShader: FIG_VERT,
    fragmentShader: FIG_FRAG,
    uniforms: { ...atmosphere, ...shared, uPrepass: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  // the same shader, depth only (shares every uniform object with the colour pass)
  const depth = new ShaderMaterial({
    vertexShader: FIG_VERT,
    fragmentShader: FIG_FRAG,
    uniforms: { ...body.uniforms, uPrepass: { value: 1 } },
    transparent: true,
    depthWrite: true,
    colorWrite: false,
    side: DoubleSide,
  });
  return { body, depth };
}

// ---- smoke motes and the mist pool at the feet -------------------------------------------------

const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uHeight;
uniform float uAlpha;
uniform float uPix;
attribute vec4 aSeed;
varying float vA;
void main() {
  float t = uTime * uMotion;
  float life = fract(t * (0.05 + aSeed.x * 0.06) + aSeed.y);
  float ang = aSeed.z * 6.2831853 + t * 0.3 * (aSeed.w - 0.5);
  float r = 0.12 + 0.3 * aSeed.w + life * 0.25;
  vec3 p = vec3(cos(ang) * r, life * uHeight * 1.25, sin(ang) * r * 0.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = uAlpha * smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.5, 1.0, life));
  gl_PointSize = clamp(uPix * (0.035 + 0.05 * aSeed.x) / max(-mv.z, 0.5), 1.0, 28.0);
}
`;
const MOTE_FRAG = /* glsl */ `
uniform vec3 uTint;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = vA * exp(-d * 3.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uTint * a, a);
}
`;

/** Mist puffs at the feet: camera-facing quads (soft on sloping ground, unlike a flat disc). */
const POOL_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
attribute vec4 aPuff; // angle, radius, size, seed
varying vec2 vUv;
varying float vSeed;
varying float vNear;
void main() {
  float t = uTime * uMotion;
  float ang = aPuff.x + t * (0.05 + 0.06 * aPuff.w);
  vec3 c = vec3(cos(ang) * aPuff.y, 0.12 + 0.18 * aPuff.w + 0.05 * sin(t * 0.4 + aPuff.w * 9.0), sin(ang) * aPuff.y);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * aPuff.z * vec2(1.6, 0.7);
  vUv = position.xy;
  vSeed = aPuff.w;
  // puffs right at the camera thin out (no flat sprite edge cutting the view or the ground)
  vNear = smoothstep(1.0, 4.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const POOL_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uFogColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph(i), ph(i + vec2(1.0, 0.0)), f.x), mix(ph(i + vec2(0.0, 1.0)), ph(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float t = uTime * uMotion;
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = 0.6 * pn(vUv * 2.2 + vec2(vSeed * 17.0 + t * 0.12, -t * 0.05)) + 0.4 * pn(vUv * 4.7 + vSeed * 5.0 - t * 0.09);
  float a = uAlpha * 0.2 * smoothstep(1.0, 0.2, r + (n - 0.5) * 0.5) * smoothstep(-1.0, 0.2, vUv.y) * vNear;
  if (a < 0.003) discard;
  vec3 mist = uFogColor * 0.85 + uTint * 0.12;
  gl_FragColor = vec4((mist + uTint * 0.25 * (1.0 - r)) * a, a);
}
`;

/** A ghost figure in the world. */
export class GhostFigure {
  readonly object = new Group();
  readonly look: NpcLook;
  private readonly mats: ShaderMaterial[];
  private readonly body: ShaderMaterial;
  private readonly motes: ShaderMaterial;
  private readonly pool: ShaderMaterial;
  private readonly geos: BufferGeometry[] = [];
  /** Current and target opacity (fade in / out). */
  alpha = 0;
  target = 1;
  talk = 0;

  constructor(look: NpcLook, era: string) {
    this.look = look;
    const geo = figureGeometry(look);
    this.geos.push(geo);
    const { body, depth } = figureMaterials(look);
    this.body = body;
    const tint = this.tintFor(era);
    body.uniforms.uTint!.value = tint;
    const depthMesh = new Mesh(geo, depth);
    const bodyMesh = new Mesh(geo, body);
    depthMesh.renderOrder = 6;
    bodyMesh.renderOrder = 7;
    depthMesh.frustumCulled = bodyMesh.frustumCulled = false;
    // motes
    const n = 70;
    const seeds = new Float32Array(n * 4);
    let s = look.seed * 9973 + 1;
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    mg.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    this.geos.push(mg);
    this.motes = new ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: { uTime: atmosphere.uTime, uMotion: body.uniforms.uMotion!, uHeight: { value: look.height }, uAlpha: { value: 0 }, uPix: { value: 600 }, uTint: { value: tint } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const motes = new Points(mg, this.motes);
    motes.frustumCulled = false;
    motes.renderOrder = 8;
    // mist pooling around the feet: a ring of soft puffs
    const NP = 9;
    const pg = new BufferGeometry();
    const corner = new Float32Array(NP * 4 * 3);
    const puff = new Float32Array(NP * 4 * 4);
    const pidx: number[] = [];
    for (let i = 0; i < NP; i++) {
      const pz = [rnd() * Math.PI * 2, 0.15 + rnd() * 0.6, 0.55 + rnd() * 0.45, rnd()];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], k) => {
        corner.set([x!, y!, 0], (i * 4 + k) * 3);
        puff.set(pz, (i * 4 + k) * 4);
      });
      pidx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    pg.setAttribute('position', new BufferAttribute(corner, 3));
    pg.setAttribute('aPuff', new BufferAttribute(puff, 4));
    pg.setIndex(pidx);
    this.geos.push(pg);
    this.pool = new ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: {
        uTint: { value: tint },
        uAlpha: { value: 0 },
        uTime: atmosphere.uTime,
        uFogColor: atmosphere.uFogColor,
        uMotion: body.uniforms.uMotion!,
      },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    const pool = new Mesh(pg, this.pool);
    pool.renderOrder = 8;
    pool.frustumCulled = false;
    this.object.add(pool, depthMesh, bodyMesh, motes);
    this.object.name = `npc-${look.id}`;
    this.mats = [body, depth, this.motes, this.pool];
  }

  private tintFor(era: string): Color {
    const base = lin(this.look.tint, this.look.mood === 'warm' ? 2.0 : 1.6);
    const e = lin(ERA_TINT[era] ?? 0xffffff);
    return base.multiply(e);
  }

  setEra(era: string): void {
    const c = this.tintFor(era);
    for (const m of this.mats) (m.uniforms.uTint?.value as Color | undefined)?.copy(c);
  }

  /**
   * Per frame: fade, talking gesture, reduced motion, face the player (yaw radians in world).
   * `px` = pixels per metre at distance 1 (point sizes).
   */
  frame(dt: number, o: { reducedMotion: boolean; px: number; face: number }): void {
    const k = Math.min(1, dt * 1.6);
    this.alpha += (this.target - this.alpha) * k;
    if (Math.abs(this.target - this.alpha) < 0.002) this.alpha = this.target;
    const motion = o.reducedMotion ? 0.15 : 1;
    const u = this.body.uniforms;
    u.uAlpha!.value = this.alpha;
    u.uMotion!.value = motion;
    u.uTalk!.value += ((this.talk ? 1 : 0) - (u.uTalk!.value as number)) * Math.min(1, dt * 3);
    u.uFace!.value = o.face;
    this.motes.uniforms.uAlpha!.value = this.alpha * 0.55;
    this.motes.uniforms.uPix!.value = o.px;
    this.pool.uniforms.uAlpha!.value = this.alpha * (this.look.mood === 'warm' ? 1 : 0.75);
    this.object.visible = this.alpha > 0.01;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
