/**
 * Sculpted shapes of the creature bodies (creature pass, 2026-11): instead of every solid part being
 * a box, a part names a shape — a hooded shroud with a tattered hem, a bone-white mask, a trailing
 * wisp tail, faceted rocks and crystals, bound straw sheaves, chamfered sandstone blocks, curled
 * pages, folded paper wings, flame tongues, rings, spikes. Every shape is fitted into the unit box
 * (−0.5 … 0.5 on each axis), so a part's size / sy / sz are its real extents as before, and the
 * template frame is kept: forward = −z (bodies.ts `f`), up = +y.
 *
 * Each geometry carries two extra attributes for the instanced solid shader (visuals.ts):
 *  - `aSeam` 1 on boxy shapes (mortar seams, straw strands along the face), 0 on the rest;
 *  - `aOut` the outline push direction: the averaged normal of coincident vertices (a closed
 *    inverted hull on faceted shapes), ±1 per axis on a plain box (each face moves out evenly).
 *
 * Pure geometry, no assets; deterministic (fixed seeds), built once per pool.
 */
import { BoxGeometry, BufferGeometry, ConeGeometry, Float32BufferAttribute, IcosahedronGeometry, SphereGeometry, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Shape = 'box' | 'block' | 'rock' | 'rock2' | 'crystal' | 'spike' | 'orb' | 'drop' | 'flame' | 'shroud' | 'mask' | 'tail' | 'limb' | 'sheaf' | 'torus' | 'page' | 'wing';

export const SHAPES: readonly Shape[] = ['box', 'block', 'rock', 'rock2', 'crystal', 'spike', 'orb', 'drop', 'flame', 'shroud', 'mask', 'tail', 'limb', 'sheaf', 'torus', 'page', 'wing'];

/** Thin, open sheets: drawn from both sides and without an inverted-hull outline. */
export const SHEETS: ReadonlySet<Shape> = new Set<Shape>(['page', 'wing', 'mask']);

/** Open or soft shapes drawn from both sides (the shroud's hem, the tail's tip). */
export const DOUBLE: ReadonlySet<Shape> = new Set<Shape>(['page', 'wing', 'mask', 'shroud', 'tail']);

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Centre the geometry and scale each axis so it fills the unit box. */
function fit(g: BufferGeometry, normals = true): BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  g.translate(-cx, -cy, -cz);
  g.scale(1 / Math.max(1e-4, b.max.x - b.min.x), 1 / Math.max(1e-4, b.max.y - b.min.y), 1 / Math.max(1e-4, b.max.z - b.min.z));
  if (normals) g.computeVertexNormals();
  return g;
}

/** Add aSeam and aOut (averaged normals of coincident vertices). */
function finish(g: BufferGeometry, seam: number, boxOut = false): BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const n = pos.count;
  const out = new Float32Array(n * 3);
  if (boxOut) {
    for (let i = 0; i < n; i++) {
      out[i * 3] = Math.sign(pos.getX(i));
      out[i * 3 + 1] = Math.sign(pos.getY(i));
      out[i * 3 + 2] = Math.sign(pos.getZ(i));
    }
  } else {
    const acc = new Map<string, [number, number, number]>();
    const key = (i: number) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    for (let i = 0; i < n; i++) {
      const k = key(i);
      const a = acc.get(k) ?? [0, 0, 0];
      a[0] += nor.getX(i);
      a[1] += nor.getY(i);
      a[2] += nor.getZ(i);
      acc.set(k, a);
    }
    for (let i = 0; i < n; i++) {
      const a = acc.get(key(i))!;
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      out[i * 3] = a[0] / l;
      out[i * 3 + 1] = a[1] / l;
      out[i * 3 + 2] = a[2] / l;
    }
  }
  g.setAttribute('aOut', new Float32BufferAttribute(out, 3));
  g.setAttribute('aSeam', new Float32BufferAttribute(new Float32Array(n).fill(seam), 1));
  return g;
}

/**
 * A surface of revolution about y from a profile of rings [radius, y], with an optional
 * per-vertex radius / height modulation (folds, strands, a tattered hem). Caps close the ends
 * whose radius is above zero when `caps` is set.
 */
function lathe(rings: [number, number][], seg: number, mod?: (ring: number, j: number, a: number) => { r?: number; y?: number }, caps = false): BufferGeometry {
  const P: number[] = [];
  const I: number[] = [];
  const R = rings.length;
  for (let i = 0; i < R; i++) {
    const [r0, y0] = rings[i]!;
    for (let j = 0; j <= seg; j++) {
      const jj = j % seg;
      const a = (jj / seg) * Math.PI * 2;
      const m = mod ? mod(i, jj, a) : {};
      const r = r0 * (m.r ?? 1);
      P.push(Math.sin(a) * r, y0 + (m.y ?? 0), Math.cos(a) * r);
    }
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      I.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (caps) {
    for (const [ring, up] of [
      [0, true],
      [R - 1, false],
    ] as const) {
      if (rings[ring]![0] <= 1e-4) continue;
      const c = P.length / 3;
      let cy = 0;
      for (let j = 0; j < seg; j++) cy += P[(ring * (seg + 1) + j) * 3 + 1]!;
      cy /= seg;
      P.push(0, cy, 0);
      for (let j = 0; j < seg; j++) {
        const a = ring * (seg + 1) + j;
        // ring 0 is the top when the profile runs downward
        if (up) I.push(c, a, a + 1);
        else I.push(c, a + 1, a);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}

/** A tube along a sampled curve with a radius per ring (tails, wisps). */
function tube(path: (t: number) => [number, number, number], radius: (t: number, a: number) => number, rings: number, seg: number): BufferGeometry {
  const P: number[] = [];
  const I: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = path(t);
    const q = path(Math.min(1, t + 0.01));
    const o = path(Math.max(0, t - 0.01));
    let tx = q[0] - o[0];
    let ty = q[1] - o[1];
    let tz = q[2] - o[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // frame: X stays sideways (the curves bend in the y-z plane), N = T × X
    const nx = 0;
    const ny = tz;
    const nz = -ty;
    for (let j = 0; j <= seg; j++) {
      const a = ((j % seg) / seg) * Math.PI * 2;
      const r = radius(t, a);
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      P.push(p[0] + c * 1 + s * nx, p[1] + s * ny, p[2] + s * nz);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      I.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}

/** Hooded shroud: a dome of a hood, a narrow neck, shoulders, folds that widen to a tattered hem. */
function shroud(): BufferGeometry {
  const prof: [number, number][] = [
    [0.0, 1.08],
    [0.06, 1.03],
    [0.13, 0.96],
    [0.19, 0.88],
    [0.21, 0.8],
    [0.19, 0.72],
    [0.16, 0.66],
    [0.22, 0.6],
    [0.28, 0.54],
    [0.3, 0.44],
    [0.3, 0.32],
    [0.33, 0.18],
    [0.38, 0.04],
    [0.45, -0.1],
    [0.54, -0.24],
  ];
  const seg = 22;
  return lathe(prof, seg, (i, j, a) => {
    const k = Math.max(0, (0.6 - prof[i]![1]) / 0.82);
    // folds deepen towards the hem; the hood's front sits a little open (flattened)
    const fold = 1 + Math.sin(a * 7 + 0.6) * 0.07 * k + Math.sin(a * 3 + 1.3) * 0.05 * k;
    const front = prof[i]![1] > 0.62 ? 1 - 0.18 * Math.max(0, -Math.cos(a)) : 1;
    // a tattered hem: long rags and short ones
    const rag = hash(j * 3.1);
    const hem = i === prof.length - 1 ? -0.06 - rag * rag * 0.34 + Math.sin(a * 5) * 0.03 : i === prof.length - 2 ? -rag * 0.07 : 0;
    return { r: fold * front, y: hem };
  });
}

/** A mask: a gently domed face plate, narrower towards the chin, facing −z. */
function mask(): BufferGeometry {
  const P: number[] = [];
  const I: number[] = [];
  const RINGS = 6;
  const SEG = 18;
  P.push(0, 0, -0.42);
  for (let i = 1; i <= RINGS; i++) {
    const rho = i / RINGS;
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      let x = Math.cos(a) * rho * 0.5;
      const y = Math.sin(a) * rho * 0.5;
      // narrower chin, a slight brow
      x *= 1 - 0.3 * Math.max(0, -y / 0.5) ** 1.4;
      const z = -0.42 * Math.sqrt(Math.max(0, 1 - rho * rho * 0.92)) + (y > 0.08 ? -0.04 * Math.sin(((y - 0.08) / 0.42) * Math.PI) : 0);
      P.push(x, y, z);
    }
  }
  for (let j = 0; j < SEG; j++) I.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = 1 + (i - 1) * SEG + j;
      const b = 1 + (i - 1) * SEG + ((j + 1) % SEG);
      const c = a + SEG;
      const d = b + SEG;
      I.push(a, b, d, a, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}

/** A trailing wisp: from the top it sweeps down and back (+z), thinning to a ragged point. */
function tailShape(): BufferGeometry {
  return tube(
    (t) => [Math.sin(t * 3.2) * 0.06 * t, -t * 0.85, t * 0.25 + t * t * 0.75],
    (t, a) => (0.42 * (1 - t) ** 0.85 + 0.015) * (1 + Math.sin(a * 4 + t * 9) * 0.1 * t),
    12,
    12,
  );
}

/** A straw sheaf: flared, cut ends, bound at the waist, the outline ridged with stalks. */
function sheaf(): BufferGeometry {
  const prof: [number, number][] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const y = 0.5 - i / N;
    const e = Math.abs(y) / 0.5;
    let r = 0.3 + 0.22 * e ** 2.6;
    if (Math.abs(Math.abs(y) - 0.24) < 0.045) r *= 0.9;
    prof.push([r, y]);
  }
  const seg = 20;
  const g = lathe(
    prof,
    seg,
    (i, j) => {
      const end = i === 0 || i === N;
      return { r: 1 + (hash(j * 5.3) - 0.5) * 0.12, y: end ? (i === 0 ? 1 : -1) * (hash(j * 9.7 + i) * 0.06) : 0 };
    },
    true,
  );
  return g;
}

/** A flame tongue: a bulb that twists up into a point, with three licks round it. */
function flame(): BufferGeometry {
  const prof: [number, number][] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const s = 1 - i / N;
    const r = 0.5 * Math.sin(Math.PI * Math.min(1, s ** 0.55 * 1.0)) * (1 - s) ** 0.15;
    prof.push([Math.max(0, i === 0 ? 0 : r), s - 0.5]);
  }
  return lathe(prof, 12, (i, _j, a) => {
    const s = 1 - i / N;
    return { r: 1 + Math.sin(a * 3 + s * 5) * 0.22 * s };
  });
}

/** A drop: a round bottom drawn up into a soft point (wisps, wax, buds). */
function drop(): BufferGeometry {
  const prof: [number, number][] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const s = 1 - i / N;
    const r = 0.5 * Math.sin(Math.PI * Math.min(1, s ** 0.6)) * (1 - s) ** 0.1;
    prof.push([i === 0 || i === N ? 0 : r, s - 0.5]);
  }
  return lathe(prof, 14);
}

/** A tapered limb: a rounded upper end, a thinner rounded lower end. */
function limb(): BufferGeometry {
  const prof: [number, number][] = [
    [0, 0.5],
    [0.3, 0.47],
    [0.45, 0.38],
    [0.5, 0.25],
    [0.45, 0.0],
    [0.36, -0.28],
    [0.3, -0.4],
    [0.2, -0.47],
    [0, -0.5],
  ];
  return lathe(prof, 12);
}

/** A faceted rock: an icosahedron pushed about by a fixed noise, flat-bottomed a little. */
function rock(seed: number): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 1).toNonIndexed();
  const p = g.getAttribute('position');
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let s = cache.get(k);
    if (s === undefined) {
      s = 0.78 + hash(x * 13.1 + y * 7.7 + z * 3.3 + seed) * 0.42;
      cache.set(k, s);
    }
    p.setXYZ(i, x * s, Math.max(y * s, -0.36), z * s);
  }
  return g;
}

/** A crystal: a hexagonal prism with pointed ends. */
function crystal(): BufferGeometry {
  return lathe(
    [
      [0, 0.5],
      [0.24, 0.24],
      [0.25, -0.22],
      [0, -0.5],
    ],
    6,
  ).toNonIndexed();
}

/** A page: a sheet curled about its spine edge (x = −0.5), the free edge lifting toward −z. */
function page(): BufferGeometry {
  const P: number[] = [];
  const I: number[] = [];
  const NX = 8;
  const NY = 3;
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      const v = j / NY;
      P.push(u - 0.5, v - 0.5, -0.5 * u * u + Math.sin(v * Math.PI) * 0.08 * u);
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + NX + 1;
      I.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}

/** A folded paper wing: root along z at x = −0.5, tip at x = +0.5, a raised crease to the tip. */
function wing(): BufferGeometry {
  // A root-front, M crease root, B root-back, C tip, D trailing notch
  const A = [-0.5, 0, -0.5];
  const M = [-0.5, 0.5, 0.05];
  const B = [-0.5, 0, 0.5];
  const C = [0.5, 0.05, 0.42];
  const D = [0.0, 0.02, 0.5];
  const P = [...A, ...M, ...C, ...M, ...D, ...C, ...M, ...B, ...D];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  return g;
}

/** Build one shape's geometry (fitted, with aSeam / aOut). */
export function shapeGeometry(s: Shape): BufferGeometry {
  switch (s) {
    case 'box':
      return finish(new BoxGeometry(1, 1, 1), 1, true);
    case 'block':
      return finish(new RoundedBoxGeometry(1, 1, 1, 2, 0.09), 1);
    case 'rock':
      return finish(fit(rock(1.7)), 0);
    case 'rock2':
      return finish(fit(rock(8.3)), 0);
    case 'crystal':
      return finish(fit(crystal()), 0);
    case 'spike':
      return finish(fit(new ConeGeometry(0.5, 1, 7, 1)), 0);
    case 'orb':
      return finish(new SphereGeometry(0.5, 18, 12), 0);
    case 'drop':
      return finish(fit(drop()), 0);
    case 'flame':
      return finish(fit(flame()), 0);
    case 'shroud':
      return finish(fit(shroud()), 0);
    case 'mask':
      return finish(fit(mask()), 0);
    case 'tail':
      return finish(fit(tailShape()), 0);
    case 'limb':
      return finish(fit(limb()), 0);
    case 'sheaf':
      return finish(fit(sheaf()), 0);
    case 'torus': {
      const g = new TorusGeometry(0.38, 0.12, 8, 22);
      g.rotateX(Math.PI / 2);
      return finish(fit(g), 0);
    }
    case 'page':
      return finish(fit(page()), 0);
    case 'wing':
      return finish(fit(wing()), 0);
  }
}
