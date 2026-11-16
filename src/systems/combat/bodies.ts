/**
 * Procedural body templates of the spectral enemies (D-007: no assets). A body is a list of parts in
 * the enemy's local frame (r = right, y = up, f = forward): drifting smoke / mist puffs, additive
 * glows (eyes, cores, cracks) and a few solid pieces (paper, straw bundles, sandstone blocks, the
 * ledger's covers). Every silhouette is invented and faceless; nothing human, no uniforms, no
 * symbols. Pure data — the renderer (visuals.ts) animates and draws them.
 */

export type PartKind = 'puff' | 'glow' | 'solid';

/** Animation channel a part follows. */
export type Bone = 'body' | 'head' | 'armL' | 'armR' | 'legs' | 'tail' | 'core' | 'flap' | 'seal' | 'rider';

export interface BodyPart {
  kind: PartKind;
  bone: Bone;
  r: number;
  y: number;
  f: number;
  /** puff / glow: size (m); solid: x/y/z size. */
  size: number;
  sy?: number;
  sz?: number;
  /** Albedo (puff, solid) or colour (glow). */
  col: [number, number, number];
  /** Emissive colour × amount (puff heat, solid glow). */
  em?: [number, number, number];
  /** puff: 0 dark smoke, 1 pale mist; glow: min pixel size (eyes stay readable far away). */
  style?: number;
  alpha?: number;
  /** solid: rotation (radians) about local x / y / z. */
  rx?: number;
  ry?: number;
  rz?: number;
  seed: number;
}

/** Look of a kind: where its "eyes" are (telegraph flare) and its glow colour. */
export interface BodyTemplate {
  parts: BodyPart[];
  /** Telegraph glow colour (pose + glow). */
  tell: [number, number, number];
  /** Height of the health pips / labels above ground (m). */
  top: number;
  /** Shoulder pivot height for arm swings. */
  shoulder: number;
}

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];

class B {
  readonly parts: BodyPart[] = [];
  private readonly R: () => number;
  constructor(seed: number) {
    this.R = rng(seed);
  }
  /** n puffs scattered in an ellipsoid. */
  blob(c: V3, rad: V3, n: number, size: number, col: V3, o: { bone?: Bone; style?: number; em?: V3; alpha?: number } = {}): this {
    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 12; k++) {
        x = this.R() * 2 - 1;
        y = this.R() * 2 - 1;
        z = this.R() * 2 - 1;
        if (x * x + y * y + z * z <= 1) break;
      }
      this.parts.push({ kind: 'puff', bone: o.bone ?? 'body', r: c[0] + x * rad[0], y: c[1] + y * rad[1], f: c[2] + z * rad[2], size: size * (0.8 + this.R() * 0.4), col, em: o.em, style: o.style ?? 0, alpha: o.alpha ?? 1, seed: this.R() });
    }
    return this;
  }
  line(a: V3, b: V3, n: number, s0: number, s1: number, col: V3, o: { bone?: Bone; style?: number; em?: V3; alpha?: number } = {}): this {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.parts.push({ kind: 'puff', bone: o.bone ?? 'body', r: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, f: a[2] + (b[2] - a[2]) * t, size: s0 + (s1 - s0) * t, col, em: o.em, style: o.style ?? 0, alpha: o.alpha ?? 1, seed: this.R() });
    }
    return this;
  }
  glow(p: V3, size: number, col: V3, o: { bone?: Bone; minPx?: number; alpha?: number } = {}): this {
    this.parts.push({ kind: 'glow', bone: o.bone ?? 'head', r: p[0], y: p[1], f: p[2], size, col, style: o.minPx ?? 0, alpha: o.alpha ?? 1, seed: this.R() });
    return this;
  }
  /** Two ember eyes. */
  eyes(y: number, f: number, w: number, size: number, col: V3 = [1, 0.5, 0.14], bone: Bone = 'head'): this {
    return this.glow([-w, y, f], size, col, { bone, minPx: 4.5 }).glow([w, y, f], size, col, { bone, minPx: 4.5 });
  }
  solid(p: V3, s: V3, col: V3, o: { bone?: Bone; em?: V3; rx?: number; ry?: number; rz?: number } = {}): this {
    this.parts.push({ kind: 'solid', bone: o.bone ?? 'body', r: p[0], y: p[1], f: p[2], size: s[0], sy: s[1], sz: s[2], col, em: o.em, rx: o.rx, ry: o.ry, rz: o.rz, seed: this.R() });
    return this;
  }
}

const MIST: V3 = [0.44, 0.48, 0.57];
const SMOKE: V3 = [0.05, 0.05, 0.06];
const EMBER: V3 = [1, 0.42, 0.1];
const COLD: V3 = [0.62, 0.86, 1.0];
const PAPER: V3 = [0.86, 0.8, 0.66];
const STONE: V3 = [0.5, 0.4, 0.33];
const STONE2: V3 = [0.42, 0.34, 0.29];
const STRAW: V3 = [0.62, 0.5, 0.24];
const LEATHER: V3 = [0.2, 0.1, 0.06];
const SEAL: V3 = [0.55, 0.06, 0.04];

export function nebelling(seed: number): BodyTemplate {
  const b = new B(seed)
    .blob([0, 0.45, 0], [0.32, 0.26, 0.3], 14, 0.42, MIST, { style: 1, alpha: 0.75 })
    .blob([0, 0.2, -0.1], [0.4, 0.1, 0.4], 6, 0.4, MIST, { style: 1, alpha: 0.6, bone: 'legs' })
    .blob([0, 0.62, 0.12], [0.18, 0.12, 0.12], 4, 0.3, [0.4, 0.43, 0.5], { style: 1, alpha: 0.9, bone: 'head' })
    .eyes(0.64, 0.3, 0.1, 0.07);
  return { parts: b.parts, tell: [1, 0.55, 0.2], top: 1.1, shoulder: 0.5 };
}

export function irrlicht(seed: number): BodyTemplate {
  const b = new B(seed)
    .glow([0, 0, 0], 0.32, COLD, { bone: 'core', minPx: 6 })
    .glow([0, 0, 0], 1.1, [0.25, 0.45, 0.7], { bone: 'core', alpha: 0.55 })
    .glow([0.25, 0.1, 0], 0.08, COLD, { bone: 'flap', minPx: 2 })
    .glow([-0.2, -0.12, 0.1], 0.07, COLD, { bone: 'flap', minPx: 2 })
    .glow([0.05, 0.22, -0.2], 0.06, COLD, { bone: 'flap', minPx: 2 })
    .blob([0, 0, 0], [0.15, 0.15, 0.15], 4, 0.4, [0.5, 0.65, 0.8], { style: 1, alpha: 0.35, bone: 'core', em: [0.1, 0.25, 0.4] });
  return { parts: b.parts, tell: [0.7, 0.9, 1], top: 0.7, shoulder: 0 };
}

export function streuner(seed: number): BodyTemplate {
  const b = new B(seed)
    .blob([0, 0.62, 0], [0.13, 0.13, 0.4], 18, 0.24, SMOKE)
    .blob([0, 0.6, 0.36], [0.13, 0.16, 0.12], 6, 0.24, SMOKE)
    .line([0, 0.72, 0.46], [0, 0.88, 0.62], 3, 0.2, 0.17, SMOKE, { bone: 'head' })
    .blob([0, 0.9, 0.72], [0.07, 0.07, 0.1], 4, 0.15, SMOKE, { bone: 'head' })
    .line([0.1, 0.5, 0.3], [0.1, 0.06, 0.32], 4, 0.13, 0.08, SMOKE, { bone: 'legs' })
    .line([-0.1, 0.5, 0.3], [-0.1, 0.06, 0.28], 4, 0.13, 0.08, SMOKE, { bone: 'legs' })
    .line([0.1, 0.5, -0.32], [0.1, 0.06, -0.34], 4, 0.13, 0.08, SMOKE, { bone: 'legs' })
    .line([-0.1, 0.5, -0.32], [-0.1, 0.06, -0.3], 4, 0.13, 0.08, SMOKE, { bone: 'legs' })
    .line([0, 0.7, -0.5], [0, 0.9, -0.82], 3, 0.11, 0.06, SMOKE, { bone: 'tail' })
    .eyes(0.94, 0.8, 0.06, 0.06);
  return { parts: b.parts, tell: [1, 0.45, 0.1], top: 1.35, shoulder: 0.7 };
}

export function mahnbrief(seed: number): BodyTemplate {
  const b = new B(seed)
    .solid([-0.17, 0, 0], [0.34, 0.012, 0.5], PAPER, { bone: 'flap', rz: 0.3 })
    .solid([0.17, 0, 0], [0.34, 0.012, 0.5], [0.8, 0.74, 0.6], { bone: 'flap', rz: -0.3 })
    .solid([0, 0.02, 0.05], [0.09, 0.03, 0.09], SEAL, { bone: 'seal', em: [0.35, 0.03, 0.01] })
    .glow([0, 0.05, 0.05], 0.1, [1, 0.2, 0.08], { bone: 'seal', minPx: 3.5 })
    .blob([0, 0, 0], [0.2, 0.08, 0.2], 3, 0.32, [0.2, 0.18, 0.18], { alpha: 0.35 });
  return { parts: b.parts, tell: [1, 0.25, 0.1], top: 0.6, shoulder: 0 };
}

export function raffschatten(seed: number): BodyTemplate {
  const b = new B(seed)
    .blob([0, 1.05, 0], [0.24, 0.45, 0.18], 22, 0.36, SMOKE)
    .blob([0, 0.4, 0], [0.2, 0.35, 0.16], 10, 0.34, SMOKE, { bone: 'legs' })
    .blob([0, 1.62, 0.12], [0.13, 0.13, 0.13], 6, 0.3, SMOKE, { bone: 'head' })
    .line([0.3, 1.45, 0.05], [0.42, 0.85, 0.35], 5, 0.18, 0.13, SMOKE, { bone: 'armR' })
    .line([-0.3, 1.45, 0.05], [-0.42, 0.85, 0.3], 5, 0.18, 0.13, SMOKE, { bone: 'armL' })
    .solid([0.05, 1.2, -0.32], [0.42, 0.5, 0.32], [0.24, 0.18, 0.11], { bone: 'body', rz: 0.2 })
    .glow([0, 1.2, 0.15], 0.5, [0.6, 0.45, 0.12], { bone: 'body', alpha: 0.5 })
    .glow([0.1, 1.0, 0.18], 0.05, [1, 0.8, 0.3], { bone: 'flap', minPx: 2 })
    .glow([-0.12, 1.3, 0.12], 0.05, [1, 0.8, 0.3], { bone: 'flap', minPx: 2 })
    .glow([0.0, 0.8, 0.15], 0.05, [1, 0.8, 0.3], { bone: 'flap', minPx: 2 });
  return { parts: b.parts, tell: [1, 0.75, 0.25], top: 2.1, shoulder: 1.45 };
}

export function glutling(seed: number): BodyTemplate {
  // a sooty, nearly black shell with a white-hot heart: it has to read against a burning room,
  // so the silhouette is dark and the halo small (an ember-coloured body vanishes into the fire)
  const b = new B(seed)
    .glow([0, 0.4, 0], 0.16, [1, 0.95, 0.75], { bone: 'core', minPx: 4 })
    .glow([0, 0.38, 0], 0.55, [0.8, 0.25, 0.05], { bone: 'core', alpha: 0.35 })
    .blob([0, 0.4, 0], [0.27, 0.25, 0.27], 9, 0.24, [0.025, 0.02, 0.02], { bone: 'core', em: [0.45, 0.12, 0.02] })
    .eyes(0.5, 0.22, 0.09, 0.06, [1, 0.97, 0.8], 'core');
  return { parts: b.parts, tell: [1, 0.6, 0.15], top: 0.9, shoulder: 0 };
}

/** Wet mortar: dark grey-brown, so a Grusling reads on pale 1796 sand (playtest round 2). */
const MORTAR: V3 = [0.2, 0.17, 0.15];
const MORTAR2: V3 = [0.27, 0.23, 0.2];

export function grusling(seed: number): BodyTemplate {
  const R = rng(seed + 7);
  const b = new B(seed);
  // a dark shadow blob under it (it never floats), then a hunched heap of wet mortar lumps
  b.blob([0, 0.03, 0], [0.22, 0.02, 0.22], 3, 0.42, [0.04, 0.035, 0.03], { alpha: 0.7, bone: 'legs' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.solid([Math.cos(a) * 0.16, 0.12 + (i % 2) * 0.1, Math.sin(a) * 0.16], [0.14 + R() * 0.07, 0.12 + R() * 0.06, 0.14 + R() * 0.06], i % 2 ? MORTAR : MORTAR2, { bone: i % 3 ? 'body' : 'legs', ry: R() * 3, rx: R() });
  }
  b.solid([0, 0.33, 0.02], [0.2, 0.16, 0.2], [0.24, 0.2, 0.17], { bone: 'head', ry: 0.6 })
    .blob([0, 0.12, -0.15], [0.12, 0.08, 0.18], 3, 0.28, [0.5, 0.46, 0.4], { style: 1, alpha: 0.4, bone: 'tail' })
    .eyes(0.38, 0.12, 0.06, 0.05, [1, 0.62, 0.2]);
  // half again as big as at first: in first person a knee-high heap at 1.5 m is below the view
  return scaleTemplate({ parts: b.parts, tell: [1, 0.7, 0.4], top: 0.55, shoulder: 0.25 }, 1.5);
}

/** Scale a template uniformly (positions, sizes, top, shoulder). */
function scaleTemplate(t: BodyTemplate, k: number): BodyTemplate {
  for (const p of t.parts) {
    p.r *= k;
    p.y *= k;
    p.f *= k;
    p.size *= k;
    if (p.sy !== undefined) p.sy *= k;
    if (p.sz !== undefined) p.sz *= k;
  }
  return { ...t, top: t.top * k, shoulder: t.shoulder * k };
}

export function steinfresser(seed: number): BodyTemplate {
  // each one a little different in size and tint (three of them read as one blob otherwise), with
  // a dark face plate under the eyes
  const R = rng(seed + 5);
  const k = 0.85 + R() * 0.3;
  const tintOf = (c: V3): V3 => [c[0] * k, c[1] * (0.9 + R() * 0.2) * k, c[2] * (0.85 + R() * 0.3) * k];
  const A = tintOf(STONE);
  const A2 = tintOf(STONE2);
  const b = new B(seed)
    .solid([0, 1.05, 0], [0.95, 0.85, 0.6], A, { ry: 0.05 })
    .solid([0, 0.45, 0], [0.7, 0.45, 0.5], A2, { bone: 'legs' })
    .solid([0.6, 1.4, 0.05], [0.42, 0.42, 0.45], A2, { rz: -0.2 })
    .solid([-0.6, 1.4, 0.05], [0.42, 0.42, 0.45], A2, { rz: 0.2 })
    .solid([0.72, 0.85, 0.25], [0.3, 0.75, 0.3], A, { bone: 'armR' })
    .solid([-0.72, 0.85, 0.25], [0.3, 0.75, 0.3], A, { bone: 'armL' })
    .solid([0, 1.62, 0.22], [0.4, 0.32, 0.36], [0.46, 0.37, 0.31], { bone: 'head' })
    .solid([0, 1.6, 0.41], [0.34, 0.2, 0.04], [0.08, 0.06, 0.05], { bone: 'head' })
    .glow([0, 1.05, 0.31], 0.4, [0.9, 0.35, 0.08], { bone: 'seal', alpha: 0.6 })
    .glow([0.25, 1.25, 0.31], 0.25, [0.9, 0.35, 0.08], { bone: 'seal', alpha: 0.5 })
    .eyes(1.64, 0.41, 0.1, 0.06, [1, 0.55, 0.15])
    .blob([0, 0.12, 0], [0.6, 0.08, 0.5], 4, 0.5, [0.55, 0.5, 0.44], { style: 1, alpha: 0.4, bone: 'legs' });
  return { parts: b.parts, tell: [1, 0.5, 0.15], top: 2.2, shoulder: 1.4 };
}

export function schuldbuch(seed: number): BodyTemplate {
  const b = new B(seed)
    // two covers opened like a gate, the page block between, the seal for a heart
    .solid([-0.75, 1.5, 0], [1.4, 2.2, 0.1], LEATHER, { bone: 'armL', ry: 0.45 })
    .solid([0.75, 1.5, 0], [1.4, 2.2, 0.1], LEATHER, { bone: 'armR', ry: -0.45 })
    .solid([0, 1.5, -0.25], [0.5, 2.1, 0.45], PAPER)
    .solid([-0.45, 1.5, 0.05], [0.9, 2.0, 0.03], [0.82, 0.76, 0.62], { bone: 'flap', ry: 0.3 })
    .solid([0.45, 1.5, 0.05], [0.9, 2.0, 0.03], [0.78, 0.72, 0.58], { bone: 'flap', ry: -0.3 })
    .solid([0, 1.55, 0.2], [0.42, 0.42, 0.1], SEAL, { bone: 'seal', em: [0.4, 0.04, 0.02], rz: 0.785 })
    .glow([0, 1.55, 0.3], 0.55, [1, 0.25, 0.08], { bone: 'seal', minPx: 6 })
    .solid([-0.75, 2.62, 0], [1.4, 0.06, 0.12], [0.45, 0.32, 0.12], { bone: 'armL', ry: 0.45 })
    .solid([0.75, 2.62, 0], [1.4, 0.06, 0.12], [0.45, 0.32, 0.12], { bone: 'armR', ry: -0.45 })
    .blob([0, 0.3, 0], [0.9, 0.2, 0.6], 8, 0.7, [0.2, 0.18, 0.18], { alpha: 0.5, bone: 'legs' });
  return { parts: b.parts, tell: [1, 0.3, 0.1], top: 3.1, shoulder: 1.6 };
}

export function pikeur(seed: number): BodyTemplate {
  const b = new B(seed)
    .blob([0, 1.35, 0], [0.27, 0.29, 0.74], 26, 0.42, SMOKE)
    .blob([0, 1.32, 0.72], [0.25, 0.31, 0.21], 8, 0.4, SMOKE)
    .line([0, 1.6, 0.9], [0, 2.12, 1.3], 6, 0.36, 0.26, SMOKE, { bone: 'head' })
    .blob([0, 2.08, 1.5], [0.09, 0.11, 0.22], 5, 0.24, SMOKE, { bone: 'head' })
    .line([0.18, 1.1, 0.6], [0.18, 0.1, 0.62], 6, 0.17, 0.1, SMOKE, { bone: 'legs' })
    .line([-0.18, 1.1, 0.6], [-0.18, 0.1, 0.58], 6, 0.17, 0.1, SMOKE, { bone: 'legs' })
    .line([0.18, 1.1, -0.6], [0.18, 0.1, -0.62], 6, 0.17, 0.1, SMOKE, { bone: 'legs' })
    .line([-0.18, 1.1, -0.6], [-0.18, 0.1, -0.58], 6, 0.17, 0.1, SMOKE, { bone: 'legs' })
    .line([0, 1.55, -0.98], [0, 0.85, -1.25], 5, 0.26, 0.18, SMOKE, { bone: 'tail' })
    // the faceless rider in a plain dark cloak and a three-cornered hat
    .line([0, 1.95, -0.02], [0, 2.62, 0.04], 8, 0.34, 0.3, SMOKE, { bone: 'rider' })
    .blob([0, 2.86, 0.05], [0.06, 0.07, 0.06], 3, 0.2, SMOKE, { bone: 'rider' })
    .blob([0, 3.02, 0.03], [0.26, 0.035, 0.22], 7, 0.14, SMOKE, { bone: 'rider' })
    .line([-0.22, 2.5, -0.1], [-0.26, 1.55, -0.45], 5, 0.3, 0.36, SMOKE, { bone: 'rider' })
    .line([0.22, 2.5, -0.1], [0.26, 1.55, -0.45], 5, 0.3, 0.36, SMOKE, { bone: 'rider' })
    .line([0.22, 2.5, 0.05], [0.5, 2.3, 0.4], 4, 0.15, 0.1, SMOKE, { bone: 'armR' })
    .glow([0.3, 2.4, 0.15], 0.22, [1, 0.68, 0.28], { bone: 'rider', alpha: 0.7 })
    .eyes(2.12, 1.62, 0.09, 0.07, [1, 0.5, 0.12]);
  return { parts: b.parts, tell: [1, 0.65, 0.25], top: 3.4, shoulder: 2.4 };
}

export function strohmann(seed: number): BodyTemplate {
  const R = rng(seed + 3);
  const b = new B(seed);
  // a torso of bound straw sheaves, a sheaf for a head, two long sheaves for flails
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.solid([Math.cos(a) * 0.32, 1.7 + R() * 0.2, Math.sin(a) * 0.26], [0.28, 1.5, 0.28], i % 2 ? STRAW : [0.55, 0.43, 0.2], { rx: (R() - 0.5) * 0.2, rz: (R() - 0.5) * 0.25 });
  }
  b.solid([0, 0.6, 0.1], [0.5, 1.2, 0.4], [0.5, 0.4, 0.18], { bone: 'legs' })
    // the bindings at the back: dark cords over soft, loose straw (the weak point)
    .solid([0, 1.95, -0.38], [0.8, 0.12, 0.12], [0.14, 0.1, 0.06])
    .solid([0, 1.45, -0.38], [0.8, 0.12, 0.12], [0.14, 0.1, 0.06])
    .glow([0, 1.7, -0.45], 0.6, [1, 0.7, 0.25], { bone: 'body', alpha: 0.35 })
    .solid([0, 2.85, 0.05], [0.55, 0.6, 0.5], STRAW, { bone: 'head', rz: 0.15 })
    .solid([0.85, 1.9, 0.3], [0.3, 1.9, 0.3], STRAW, { bone: 'armR', rz: -0.5 })
    .solid([-0.85, 1.9, 0.3], [0.3, 1.9, 0.3], [0.58, 0.46, 0.22], { bone: 'armL', rz: 0.5 })
    .glow([0.1, 2.0, 0.34], 0.3, EMBER, { bone: 'seal', alpha: 0.8 })
    .glow([-0.2, 1.5, 0.3], 0.22, EMBER, { bone: 'seal', alpha: 0.7 })
    .glow([0.2, 1.2, 0.3], 0.2, EMBER, { bone: 'seal', alpha: 0.7 })
    .eyes(2.88, 0.32, 0.12, 0.08, [1, 0.6, 0.15])
    .blob([0, 3.4, 0], [0.4, 0.4, 0.4], 6, 0.6, [0.08, 0.07, 0.07], { bone: 'head', alpha: 0.6, em: [0.3, 0.1, 0.02] });
  return { parts: b.parts, tell: [1, 0.55, 0.15], top: 3.9, shoulder: 2.4 };
}

export function steinbrecher(seed: number): BodyTemplate {
  const R = rng(seed + 11);
  const b = new B(seed);
  // stacked, robbed-out blocks in darker, uneven sandstone with dark mortar between them; the
  // joints glow only at the back and the sides (where it is soft), the front wears a plate and a
  // face (playtest round 2: up close it was a featureless white wall)
  const SB: V3[] = [
    [0.24, 0.18, 0.14],
    [0.31, 0.23, 0.17],
    [0.2, 0.16, 0.13],
    [0.28, 0.2, 0.15],
  ];
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, bone: Bone = 'body') => b.solid([x, y, z], [w, h, d], SB[Math.floor(R() * SB.length)]!, { bone, ry: (R() - 0.5) * 0.2, rz: (R() - 0.5) * 0.12 });
  const JOINT: V3 = [0.07, 0.055, 0.05];
  for (const [y, w, d] of [
    [1.07, 1.45, 0.95],
    [2.13, 1.75, 1.05],
    [3.16, 0.9, 0.8],
  ] as const)
    b.solid([0, y, 0.01], [w, 0.07, d], JOINT);
  // chest plate and brow: the facing reads at once
  b.solid([0, 2.6, 0.6], [1.35, 0.85, 0.1], [0.2, 0.16, 0.14], { rx: -0.05 })
    .solid([0, 2.6, 0.66], [1.1, 0.06, 0.04], [0.5, 0.4, 0.3])
    .solid([0, 3.72, 0.47], [0.62, 0.1, 0.12], [0.16, 0.13, 0.11], { bone: 'head' });
  block(0, 0.55, 0, 1.3, 1.0, 0.9, 'legs');
  block(0, 1.6, 0, 1.6, 1.05, 1.0);
  block(0, 2.65, 0.02, 1.9, 1.0, 1.1);
  block(0, 3.55, 0.1, 0.8, 0.7, 0.7, 'head');
  block(1.3, 2.75, 0.1, 0.8, 0.75, 0.8);
  block(-1.3, 2.75, 0.1, 0.8, 0.75, 0.8);
  block(1.45, 1.75, 0.3, 0.6, 1.2, 0.6, 'armR');
  block(-1.45, 1.75, 0.3, 0.6, 1.2, 0.6, 'armL');
  block(1.5, 0.9, 0.45, 0.7, 0.6, 0.7, 'armR');
  block(-1.5, 0.9, 0.45, 0.7, 0.6, 0.7, 'armL');
  for (const [x, y, f] of [
    [0, 1.08, -0.5],
    [0, 2.12, -0.55],
    [0.5, 1.6, -0.5],
    [-0.5, 2.6, -0.58],
    [0.82, 1.6, 0],
    [-0.82, 1.6, 0.05],
    [0.97, 2.4, -0.1],
    [-0.97, 2.4, -0.1],
    [0, 3.18, -0.42],
  ] as const)
    b.glow([x, y, f], 0.36, [1, 0.42, 0.08], { bone: 'seal', alpha: 0.85, minPx: 3 });
  b.eyes(3.6, 0.5, 0.17, 0.12, [1, 0.72, 0.2]).blob([0, 0.2, 0], [1.1, 0.12, 0.9], 6, 0.8, [0.55, 0.5, 0.44], { style: 1, alpha: 0.45, bone: 'legs' });
  return { parts: b.parts, tell: [1, 0.45, 0.1], top: 4.4, shoulder: 2.7 };
}

const MAKERS: Record<string, (seed: number) => BodyTemplate> = { nebelling, irrlicht, streuner, mahnbrief, raffschatten, glutling, grusling, steinfresser, schuldbuch, pikeur, strohmann, steinbrecher };

export function bodyTemplate(kind: string, seed: number): BodyTemplate {
  return (MAKERS[kind] ?? nebelling)(Math.floor(seed * 1e6));
}
