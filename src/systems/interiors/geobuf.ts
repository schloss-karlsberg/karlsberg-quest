/** Growable vertex buffers for the interior meshes (positions, normals, colours, material ids, room, uv, aux). */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';

export type V3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

export interface Surf {
  col: RGB;
  mat: number;
  room: number;
  aux?: readonly [number, number, number, number];
}

export class GeoBuf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  room: number[] = [];
  uv: number[] = [];
  aux: number[] = [];
  idx: number[] = [];

  get vertices(): number {
    return this.pos.length / 3;
  }

  private vert(p: V3, n: V3, uv: readonly [number, number], s: Surf): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(s.col[0], s.col[1], s.col[2]);
    this.mat.push(s.mat);
    this.room.push(s.room);
    this.uv.push(uv[0], uv[1]);
    const a = s.aux ?? [0, 0, 0, 0];
    this.aux.push(a[0], a[1], a[2], a[3]);
  }

  /** Quad a→b→c→d (counter-clockwise seen from the normal side). */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, s: Surf, uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]] = [[0, 0], [1, 0], [1, 1], [0, 1]]): void {
    const i = this.vertices;
    this.vert(a, n, uv[0], s);
    this.vert(b, n, uv[1], s);
    this.vert(c, n, uv[2], s);
    this.vert(d, n, uv[3], s);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a: V3, b: V3, c: V3, n: V3, s: Surf): void {
    const i = this.vertices;
    this.vert(a, n, [0, 0], s);
    this.vert(b, n, [1, 0], s);
    this.vert(c, n, [0, 1], s);
    this.idx.push(i, i + 1, i + 2);
  }

  /**
   * Oriented box: centre x/z, bottom y, size along a horizontal axis (ux, uz) and across it, height.
   * uv on each face in metres. `faces` skips the bottom by default.
   */
  box(cx: number, y0: number, cz: number, ux: number, uz: number, su: number, sv: number, h: number, s: Surf, bottom = false): void {
    const vx = -uz;
    const vz = ux;
    const hu = su / 2;
    const hv = sv / 2;
    const P = (a: number, b: number, y: number): V3 => [cx + ux * a + vx * b, y, cz + uz * a + vz * b];
    const y1 = y0 + h;
    // top
    this.quad(P(-hu, -hv, y1), P(-hu, hv, y1), P(hu, hv, y1), P(hu, -hv, y1), [0, 1, 0], s, [[0, 0], [0, sv], [su, sv], [su, 0]]);
    if (bottom) this.quad(P(-hu, -hv, y0), P(hu, -hv, y0), P(hu, hv, y0), P(-hu, hv, y0), [0, -1, 0], s, [[0, 0], [su, 0], [su, sv], [0, sv]]);
    // sides (+u, −u, +v, −v)
    this.quad(P(hu, -hv, y0), P(hu, hv, y0), P(hu, hv, y1), P(hu, -hv, y1), [ux, 0, uz], s, [[0, 0], [sv, 0], [sv, h], [0, h]]);
    this.quad(P(-hu, hv, y0), P(-hu, -hv, y0), P(-hu, -hv, y1), P(-hu, hv, y1), [-ux, 0, -uz], s, [[0, 0], [sv, 0], [sv, h], [0, h]]);
    this.quad(P(hu, hv, y0), P(-hu, hv, y0), P(-hu, hv, y1), P(hu, hv, y1), [vx, 0, vz], s, [[0, 0], [su, 0], [su, h], [0, h]]);
    this.quad(P(-hu, -hv, y0), P(hu, -hv, y0), P(hu, -hv, y1), P(-hu, -hv, y1), [-vx, 0, -vz], s, [[0, 0], [su, 0], [su, h], [0, h]]);
  }

  /** Square-section beam between two points (rails, fallen rafters), w wide and h high. */
  beam(a: V3, b: V3, w: number, h: number, s: Surf): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return;
    const d: V3 = [dx / L, dy / L, dz / L];
    // side vector: horizontal, perpendicular to d (or x if d is vertical)
    let sx = -d[2];
    let sz = d[0];
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-4) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    const side: V3 = [sx, 0, sz];
    // up = side × d
    const up: V3 = [side[1] * d[2] - side[2] * d[1], side[2] * d[0] - side[0] * d[2], side[0] * d[1] - side[1] * d[0]];
    const hw = w / 2;
    const hh = h / 2;
    const P = (p: V3, a1: number, a2: number): V3 => [p[0] + side[0] * a1 + up[0] * a2, p[1] + side[1] * a1 + up[1] * a2, p[2] + side[2] * a1 + up[2] * a2];
    const faces: [number, number, number, number, V3][] = [
      [hw, -hh, hw, hh, side],
      [-hw, hh, -hw, -hh, [-side[0], -side[1], -side[2]]],
      [hw, hh, -hw, hh, up],
      [-hw, -hh, hw, -hh, [-up[0], -up[1], -up[2]]],
    ];
    for (const [a1, a2, b1, b2, n] of faces) this.quad(P(a, a1, a2), P(a, b1, b2), P(b, b1, b2), P(b, a1, a2), n, s, [[0, 0], [w, 0], [w, L], [0, L]]);
  }

  /** Flat convex polygon (x, z) at height y (fan), uv from a mapping function. */
  poly(pts: readonly (readonly [number, number])[], y: number, up: boolean, s: Surf, uvOf: (x: number, z: number) => readonly [number, number]): void {
    if (pts.length < 3) return;
    const i0 = this.vertices;
    const n: V3 = up ? [0, 1, 0] : [0, -1, 0];
    for (const [x, z] of pts) this.vert([x, y, z], n, uvOf(x, z), s);
    for (let k = 1; k < pts.length - 1; k++) this.idx.push(i0, i0 + k, i0 + k + 1);
  }

  /** Vertical n-sided prism (columns, tubs, candles), radius r0 at the bottom and r1 at the top. */
  prism(cx: number, y0: number, cz: number, r0: number, h: number, sides: number, s: Surf, r1 = r0, top = true): void {
    const y1 = y0 + h;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const n: V3 = [Math.cos(am), (r0 - r1) / Math.max(h, 1e-3), Math.sin(am)];
      const l = Math.hypot(n[0], n[1], n[2]);
      const nn: V3 = [n[0] / l, n[1] / l, n[2] / l];
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const arc = ((Math.PI * 2) / sides) * r0;
      this.quad([cx + c1 * r0, y0, cz + s1 * r0], [cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], nn, s, [
        [k * arc, 0],
        [(k + 1) * arc, 0],
        [(k + 1) * arc, h],
        [k * arc, h],
      ]);
      if (top && r1 > 0.001) this.tri([cx, y1, cz], [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1], [0, 1, 0], s);
    }
  }

  /** Rough sphere-ish blob (foliage, rubble lumps): an octahedron subdivided once, jittered. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, s: Surf, jitter = 0.15, seed = 1): void {
    const base: V3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const faces = [
      [0, 2, 4],
      [4, 2, 1],
      [1, 2, 5],
      [5, 2, 0],
      [4, 3, 0],
      [1, 3, 4],
      [5, 3, 1],
      [0, 3, 5],
    ];
    const norm = (p: V3): V3 => {
      const l = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / l, p[1] / l, p[2] / l];
    };
    const jit = (p: V3): V3 => {
      const h = Math.sin(p[0] * 12.9898 * seed + p[1] * 78.233 + p[2] * 37.719) * 43758.5453;
      const f = 1 + (h - Math.floor(h) - 0.5) * 2 * jitter;
      return [cx + p[0] * rx * f, cy + p[1] * ry * f, cz + p[2] * rz * f];
    };
    for (const [a, b, c] of faces) {
      const A = base[a!]!;
      const B = base[b!]!;
      const C = base[c!]!;
      const ab = norm([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]);
      const bc = norm([(B[0] + C[0]) / 2, (B[1] + C[1]) / 2, (B[2] + C[2]) / 2]);
      const ca = norm([(C[0] + A[0]) / 2, (C[1] + A[1]) / 2, (C[2] + A[2]) / 2]);
      for (const [p, q, r] of [
        [A, ab, ca],
        [ab, B, bc],
        [ca, bc, C],
        [ab, bc, ca],
      ] as V3[][]) {
        const n = norm([(p![0] + q![0] + r![0]) / 3, (p![1] + q![1] + r![1]) / 3, (p![2] + q![2] + r![2]) / 3]);
        this.tri(jit(p!), jit(q!), jit(r!), n, s);
      }
    }
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new Float32BufferAttribute(this.mat, 1));
    g.setAttribute('aRoom', new Float32BufferAttribute(this.room, 1));
    g.setAttribute('aUv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aAux', new Float32BufferAttribute(this.aux, 4));
    g.setIndex(this.vertices > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}
