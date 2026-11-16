/**
 * Procedural body templates of the spectral enemies (D-007: no assets). A body is a list of parts in
 * the enemy's local frame (r = right, y = up, f = forward): drifting smoke / mist puffs, additive
 * glows (eyes, cores, cracks) and a few solid pieces (paper, straw bundles, sandstone blocks, the
 * ledger's covers). Every silhouette is invented and faceless; nothing human, no uniforms, no
 * symbols. Pure data — the renderer (visuals.ts) animates and draws them.
 */

export type PartKind = 'puff' | 'glow' | 'solid';

/** Animation channel a part follows. */
export type Bone = 'body' | 'head' | 'armL' | 'armR' | 'legs' | 'tail' | 'core' | 'flap' | 'seal' | 'rider' | 'hound' | 'orbit';

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
  /** Walking legs: swings about the hip [pivot y, pivot f, phase (rad), amplitude (rad)] while it moves. */
  gait?: [number, number, number, number];
  /** Turning pages: rotates about a vertical axis at [pivot r, pivot f]: [rate, amplitude, phase, pivotR, pivotF]. */
  turn?: [number, number, number, number, number];
  /** Circles round the body's axis: [rate (rad/s), phase]. */
  orbit?: [number, number];
  /** Burns: flame particles per second from this point. */
  fire?: number;
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
  /** Patch the last `n` parts (gait, turn, orbit, fire). */
  last(n: number, patch: Partial<BodyPart>): this {
    for (let i = Math.max(0, this.parts.length - n); i < this.parts.length; i++) Object.assign(this.parts[i]!, patch);
    return this;
  }
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

/**
 * Das Schuldbuch: a ledger as tall as a door that floats a man's height above the ground. Leather
 * covers with brass corners open like a gate, the page block between, pages that turn by themselves,
 * red ribbons, a clasp and the ducal seal for a heart (red wax, glowing: the Bannlicht breaks it).
 * Scraps of paper circle it.
 */
export function schuldbuch(seed: number): BodyTemplate {
  const R = rng(seed + 13);
  const BRASS: V3 = [0.55, 0.42, 0.16];
  const INK: V3 = [0.09, 0.07, 0.06];
  const Y = 2.15;
  const b = new B(seed)
    // the covers (they swing like wings with the arms channel), brass corners and the spine
    .solid([-0.78, Y, 0], [1.45, 2.3, 0.1], LEATHER, { bone: 'armL', ry: 0.5 })
    .solid([0.78, Y, 0], [1.45, 2.3, 0.1], LEATHER, { bone: 'armR', ry: -0.5 })
    .solid([-1.36, Y + 1.04, -0.3], [0.26, 0.2, 0.13], BRASS, { bone: 'armL', ry: 0.5, em: [0.12, 0.08, 0.02] })
    .solid([-1.36, Y - 1.04, -0.3], [0.26, 0.2, 0.13], BRASS, { bone: 'armL', ry: 0.5, em: [0.12, 0.08, 0.02] })
    .solid([1.36, Y + 1.04, -0.3], [0.26, 0.2, 0.13], BRASS, { bone: 'armR', ry: -0.5, em: [0.12, 0.08, 0.02] })
    .solid([1.36, Y - 1.04, -0.3], [0.26, 0.2, 0.13], BRASS, { bone: 'armR', ry: -0.5, em: [0.12, 0.08, 0.02] })
    .solid([0, Y, -0.32], [0.34, 2.36, 0.22], [0.16, 0.08, 0.05])
    // the page block and its edge lines
    .solid([0, Y, -0.16], [0.62, 2.12, 0.4], PAPER)
    .solid([0, Y + 0.7, 0.05], [0.56, 0.02, 0.03], [0.62, 0.56, 0.44])
    .solid([0, Y - 0.7, 0.05], [0.56, 0.02, 0.03], [0.62, 0.56, 0.44]);
  // two open pages, ruled in ink (debts, columns, sums)
  for (const side of [-1, 1]) {
    b.solid([side * 0.46, Y, 0.06], [0.88, 2.02, 0.03], side < 0 ? [0.84, 0.78, 0.63] : [0.8, 0.74, 0.59], { bone: 'flap', ry: side * -0.28 });
    for (let i = 0; i < 7; i++) b.solid([side * 0.46, Y + 0.75 - i * 0.24, 0.085], [0.66 - (i % 3) * 0.12, 0.022, 0.01], INK, { bone: 'flap', ry: side * -0.28 });
    b.solid([side * 0.62, Y + 0.1, 0.085], [0.02, 1.6, 0.01], INK, { bone: 'flap', ry: side * -0.28 });
  }
  // pages that turn by themselves, each at its own pace (the ledger keeps counting)
  for (let i = 0; i < 5; i++) {
    const ph = R() * 6.28;
    b.solid([0.42, Y + (R() - 0.5) * 0.1, 0.12 + i * 0.012], [0.82, 1.94, 0.012], [0.88, 0.83, 0.69]).last(1, { turn: [1.3 + R() * 0.9, 1.35, ph, 0, 0.1] });
    b.solid([0.42, Y + 0.4, 0.13 + i * 0.012], [0.55, 0.02, 0.012], INK).last(1, { turn: [1.3 + R() * 0.9, 1.35, ph, 0, 0.1] });
  }
  // ribbons, clasp, the seal (red wax, an octagon of two squares) for a heart
  b.solid([-0.08, Y - 1.45, 0.06], [0.07, 0.75, 0.01], [0.6, 0.06, 0.05], { bone: 'flap' })
    .solid([0.1, Y - 1.35, 0.06], [0.06, 0.55, 0.01], [0.45, 0.05, 0.12], { bone: 'flap' })
    .solid([0, Y - 0.62, 0.24], [0.5, 0.09, 0.06], BRASS, { em: [0.15, 0.1, 0.03] })
    .solid([0, Y + 0.05, 0.24], [0.56, 0.56, 0.1], SEAL, { bone: 'seal', em: [0.45, 0.04, 0.02] })
    .solid([0, Y + 0.05, 0.25], [0.56, 0.56, 0.1], SEAL, { bone: 'seal', em: [0.45, 0.04, 0.02], rz: 0.785 })
    .solid([0, Y + 0.05, 0.31], [0.24, 0.24, 0.04], [0.32, 0.03, 0.02], { bone: 'seal', em: [0.3, 0.02, 0.01], rz: 0.785 })
    .glow([0, Y + 0.05, 0.38], 0.75, [1, 0.25, 0.08], { bone: 'seal', minPx: 7 })
    .glow([0, Y + 0.05, 0.38], 1.8, [0.8, 0.12, 0.04], { bone: 'seal', alpha: 0.35 });
  // scraps circling it at different heights (the unpaid)
  for (let i = 0; i < 9; i++) b.solid([1.8 + R() * 0.6, Y - 1 + R() * 2.4, 0], [0.22, 0.003, 0.3], PAPER, { rx: R(), rz: R() }).last(1, { bone: 'orbit', orbit: [0.7 + R() * 0.6, (i / 9) * 6.283] });
  // a dark draught under it (it never touches the ground)
  b.blob([0, 0.5, 0], [0.8, 0.25, 0.5], 9, 0.8, [0.12, 0.1, 0.1], { alpha: 0.45, bone: 'legs' })
    .glow([0, 0.4, 0], 2.2, [0.5, 0.1, 0.05], { bone: 'legs', alpha: 0.25 });
  return { parts: b.parts, tell: [1, 0.3, 0.1], top: 3.9, shoulder: Y };
}

/**
 * Der Pikeur: a faceless huntsman in a long dark coat and a three-cornered hat on a horse of smoke.
 * Cold eyes under the hat, the brass horn across the chest, the whip; the horse's mane and tail are
 * pale ghost-fire, its hooves strike mist; two hounds trot at its heels.
 */
export function pikeur(seed: number): BodyTemplate {
  const HS: V3 = [0.035, 0.035, 0.045];
  const COLDEM: V3 = [0.03, 0.06, 0.1];
  const GHOST: V3 = [0.62, 0.74, 0.86];
  const BRASS: V3 = [0.6, 0.46, 0.18];
  const b = new B(seed)
    // the horse: barrel, chest, quarters, an arched neck, a long head with the muzzle down
    .blob([0, 1.6, 0], [0.36, 0.36, 0.86], 30, 0.5, HS, { em: COLDEM })
    .blob([0, 1.66, 0.85], [0.32, 0.4, 0.24], 10, 0.46, HS, { em: COLDEM })
    .blob([0, 1.7, -0.8], [0.38, 0.38, 0.3], 12, 0.48, HS, { em: COLDEM })
    .line([0, 1.95, 1.0], [0, 2.62, 1.42], 7, 0.44, 0.3, HS, { bone: 'head', em: COLDEM })
    .line([0, 2.68, 1.48], [0, 2.25, 2.02], 6, 0.3, 0.2, HS, { bone: 'head', em: COLDEM })
    .solid([-0.11, 2.92, 1.44], [0.06, 0.22, 0.08], [0.02, 0.02, 0.03], { bone: 'head', rx: -0.3 })
    .solid([0.11, 2.92, 1.44], [0.06, 0.22, 0.08], [0.02, 0.02, 0.03], { bone: 'head', rx: -0.3 })
    // pale ghost-fire: the mane along the neck, the tail
    .line([0, 2.2, 0.92], [0, 2.86, 1.34], 7, 0.3, 0.22, GHOST, { bone: 'flap', style: 1, alpha: 0.55, em: [0.1, 0.16, 0.22] })
    .line([0, 1.85, -1.08], [0, 0.95, -1.6], 6, 0.34, 0.2, GHOST, { bone: 'tail', style: 1, alpha: 0.6, em: [0.1, 0.16, 0.22] })
    .glow([-0.15, 2.48, 1.78], 0.08, [0.75, 0.92, 1], { bone: 'head', minPx: 4 })
    .glow([0.15, 2.48, 1.78], 0.08, [0.75, 0.92, 1], { bone: 'head', minPx: 4 })
    .glow([0, 2.2, 2.08], 0.3, [0.5, 0.7, 0.9], { bone: 'head', alpha: 0.4 });
  // four legs that trot (diagonal pairs), mist at the hooves
  for (const [r, f, ph] of [
    [0.22, 0.72, 0],
    [-0.22, 0.72, Math.PI],
    [0.22, -0.7, Math.PI],
    [-0.22, -0.7, 0],
  ] as const) {
    b.line([r, 1.4, f], [r, 0.75, f + 0.04], 4, 0.2, 0.14, HS, { bone: 'legs', em: COLDEM })
      .line([r, 0.7, f + 0.04], [r, 0.12, f - 0.03], 4, 0.13, 0.1, HS, { bone: 'legs', em: COLDEM })
      .blob([r, 0.1, f], [0.08, 0.05, 0.08], 2, 0.26, GHOST, { bone: 'legs', style: 1, alpha: 0.55, em: [0.12, 0.18, 0.24] })
      .last(11, { gait: [1.4, f, ph, 0.55] });
  }
  // the rider: legs in the stirrups, a long coat, the faceless head under the hat
  b.line([0.3, 2.05, 0.08], [0.34, 1.35, 0.28], 4, 0.22, 0.16, SMOKE, { bone: 'rider' })
    .line([-0.3, 2.05, 0.08], [-0.34, 1.35, 0.28], 4, 0.22, 0.16, SMOKE, { bone: 'rider' })
    .line([0, 2.1, 0], [0, 2.95, 0.05], 8, 0.42, 0.34, SMOKE, { bone: 'rider' })
    .solid([0, 2.45, -0.36], [0.85, 1.35, 0.05], [0.05, 0.045, 0.06], { bone: 'flap', rx: 0.42 })
    .line([0.2, 2.9, -0.2], [0.35, 1.7, -1.05], 6, 0.3, 0.38, SMOKE, { bone: 'flap', alpha: 0.85 })
    .line([-0.2, 2.9, -0.2], [-0.35, 1.7, -1.05], 6, 0.3, 0.38, SMOKE, { bone: 'flap', alpha: 0.85 })
    .blob([0, 3.25, 0.05], [0.1, 0.13, 0.1], 5, 0.26, [0.01, 0.01, 0.012], { bone: 'rider' })
    .solid([0, 3.47, 0.04], [0.82, 0.06, 0.66], [0.02, 0.02, 0.025], { bone: 'rider' })
    .solid([0, 3.6, 0.02], [0.42, 0.24, 0.4], [0.02, 0.02, 0.025], { bone: 'rider' })
    .solid([0, 3.46, 0.38], [0.66, 0.035, 0.035], BRASS, { bone: 'rider', em: [0.14, 0.1, 0.03] })
    .eyes(3.24, 0.18, 0.08, 0.09, [1, 0.62, 0.18], 'rider');
  // the horn: a brass loop across the chest with its bell
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.solid([0.05 + Math.cos(a) * 0.24, 2.55 + Math.sin(a) * 0.24, 0.28], [0.1, 0.07, 0.07], BRASS, { bone: 'rider', rz: a + 1.57, em: [0.18, 0.12, 0.04] });
  }
  b.solid([0.36, 2.36, 0.34], [0.2, 0.2, 0.12], BRASS, { bone: 'rider', em: [0.2, 0.14, 0.04] })
    .glow([0.3, 2.45, 0.32], 0.35, [1, 0.72, 0.3], { bone: 'rider', alpha: 0.55 })
    // the whip arm and the lash
    .line([0.28, 2.85, 0.05], [0.55, 2.5, 0.48], 4, 0.16, 0.12, SMOKE, { bone: 'armR' })
    .line([0.56, 2.48, 0.5], [0.95, 1.5, 1.5], 7, 0.07, 0.04, [0.08, 0.06, 0.05], { bone: 'armR' });
  // two hounds at heel, trotting
  for (const side of [-1, 1]) {
    const r = side * 1.55;
    const f = -0.5;
    b.blob([r, 0.62, f], [0.13, 0.13, 0.38], 12, 0.24, SMOKE, { bone: 'hound', em: COLDEM })
      .line([r, 0.75, f + 0.42], [r, 0.92, f + 0.62], 3, 0.2, 0.16, SMOKE, { bone: 'hound' })
      .glow([r - 0.06, 0.95, f + 0.74], 0.05, [1, 0.5, 0.12], { bone: 'hound', minPx: 3.5 })
      .glow([r + 0.06, 0.95, f + 0.74], 0.05, [1, 0.5, 0.12], { bone: 'hound', minPx: 3.5 })
      .line([r + 0.08, 0.5, f + 0.3], [r + 0.08, 0.06, f + 0.3], 3, 0.11, 0.08, SMOKE, { bone: 'hound' })
      .last(3, { gait: [0.5, f + 0.3, side > 0 ? 0 : Math.PI, 0.6] })
      .line([r - 0.08, 0.5, f - 0.3], [r - 0.08, 0.06, f - 0.3], 3, 0.11, 0.08, SMOKE, { bone: 'hound' })
      .last(3, { gait: [0.5, f - 0.3, side > 0 ? Math.PI : 0, 0.6] })
      .line([r, 0.7, f - 0.45], [r, 0.92, f - 0.75], 3, 0.1, 0.06, SMOKE, { bone: 'tail' });
  }
  return scaleTemplate({ parts: b.parts, tell: [1, 0.65, 0.25], top: 3.75, shoulder: 2.75 }, 1.12);
}

/**
 * Der Strohmann: a giant of bound sheaves, taller than the carts it rose from, burning — flames lick
 * from its head, shoulders and flails. The front is hard bound straw; at the back, where the sheaves
 * are tied, it is soft: loose straw that glows from within (the weak point).
 */
export function strohmann(seed: number): BodyTemplate {
  const R = rng(seed + 3);
  const DARK: V3 = [0.38, 0.28, 0.12];
  const CORD: V3 = [0.12, 0.08, 0.05];
  const b = new B(seed);
  // legs: two thick sheaves that stride
  for (const side of [-1, 1]) {
    b.solid([side * 0.4, 0.85, 0], [0.42, 1.7, 0.42], side < 0 ? STRAW : DARK, { rz: side * 0.04 })
      .solid([side * 0.4, 0.95, 0], [0.48, 0.1, 0.48], CORD)
      .solid([side * 0.4, 0.1, 0.08], [0.5, 0.2, 0.6], DARK)
      .last(3, { gait: [1.75, 0, side > 0 ? 0 : Math.PI, 0.32] });
  }
  // the torso: a ring of tall sheaves, bound twice
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.solid([Math.cos(a) * 0.42, 2.55 + R() * 0.22, Math.sin(a) * 0.34], [0.32, 1.85, 0.32], i % 2 ? STRAW : [0.55, 0.43, 0.2], { rx: (R() - 0.5) * 0.2, rz: (R() - 0.5) * 0.25 });
  }
  b.solid([0, 1.75, 0.0], [1.15, 0.5, 0.95], DARK)
    .solid([0, 2.25, 0.02], [1.08, 0.12, 0.92], CORD)
    .solid([0, 3.05, 0.02], [1.08, 0.12, 0.92], CORD)
    // shoulders: sheaves laid across
    .solid([0, 3.45, 0], [2.0, 0.42, 0.5], STRAW, { rz: 0.04 })
    // the soft back: loose straw that glows from within, the cords hot
    .solid([0, 2.25, -0.52], [0.9, 0.1, 0.1], CORD, { em: [0.7, 0.25, 0.04] })
    .solid([0, 3.05, -0.52], [0.9, 0.1, 0.1], CORD, { em: [0.7, 0.25, 0.04] })
    .blob([0, 2.65, -0.5], [0.42, 0.55, 0.12], 10, 0.34, [0.75, 0.6, 0.3], { style: 1, alpha: 0.75, em: [0.7, 0.32, 0.06] })
    .glow([0, 2.65, -0.62], 1.15, [1, 0.62, 0.2], { bone: 'seal', alpha: 0.8, minPx: 6 })
    .glow([0, 2.65, -0.66], 0.4, [1, 0.92, 0.6], { bone: 'seal', alpha: 0.9, minPx: 3 })
    // the head: a sheaf with a spiky crown, eyes deep inside, burning
    .solid([0, 4.05, 0.05], [0.66, 0.75, 0.6], STRAW, { bone: 'head', rz: 0.12 })
    .solid([0, 3.7, 0.05], [0.7, 0.1, 0.64], CORD, { bone: 'head' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.solid([Math.cos(a) * 0.22, 4.55, Math.sin(a) * 0.2], [0.07, 0.5, 0.07], STRAW, { bone: 'head', rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 });
  }
  b.eyes(4.05, 0.36, 0.14, 0.11, [1, 0.62, 0.15])
    .glow([0, 4.6, 0], 0.5, EMBER, { bone: 'head', alpha: 0.9 })
    .last(1, { fire: 9 })
    // flails: long sheaves for arms, burning at the ends
    .solid([1.15, 2.45, 0.3], [0.36, 2.2, 0.36], STRAW, { bone: 'armR', rz: -0.42 })
    .solid([1.6, 1.4, 0.32], [0.46, 0.1, 0.46], CORD, { bone: 'armR', rz: -0.42 })
    .glow([1.75, 1.15, 0.35], 0.4, EMBER, { bone: 'armR', alpha: 0.9 })
    .last(1, { fire: 7 })
    .solid([-1.15, 2.45, 0.3], [0.36, 2.2, 0.36], [0.58, 0.46, 0.22], { bone: 'armL', rz: 0.42 })
    .solid([-1.6, 1.4, 0.32], [0.46, 0.1, 0.46], CORD, { bone: 'armL', rz: 0.42 })
    .glow([-1.75, 1.15, 0.35], 0.4, EMBER, { bone: 'armL', alpha: 0.9 })
    .last(1, { fire: 7 })
    // smouldering spots in front, fire on the shoulders
    .glow([0.15, 2.7, 0.42], 0.32, EMBER, { bone: 'seal', alpha: 0.8 })
    .glow([-0.25, 2.1, 0.4], 0.24, EMBER, { bone: 'seal', alpha: 0.7 })
    .glow([0.3, 1.8, 0.38], 0.22, EMBER, { bone: 'seal', alpha: 0.7 })
    .glow([0.85, 3.6, 0], 0.3, EMBER, { alpha: 0.7 })
    .last(1, { fire: 5 })
    .glow([-0.85, 3.6, 0], 0.3, EMBER, { alpha: 0.7 })
    .last(1, { fire: 5 })
    .glow([0, 2.9, -0.55], 0.3, EMBER, { alpha: 0.6 })
    .last(1, { fire: 4 })
    .blob([0, 5.0, 0], [0.5, 0.5, 0.5], 6, 0.75, [0.08, 0.07, 0.07], { bone: 'head', alpha: 0.55, em: [0.35, 0.12, 0.02] });
  return scaleTemplate({ parts: b.parts, tell: [1, 0.55, 0.15], top: 5.1, shoulder: 3.4 }, 1.12);
}

/**
 * Der Steinbrecher: a giant of robbed-out sandstone blocks, twice a man's height and more — legs of
 * stacked quaders that stride, a chest like a wall with a dark plate, arms with elbows and fists of
 * block. The joints glow only at the back and the sides (where it can be broken), never in front.
 */
export function steinbrecher(seed: number): BodyTemplate {
  const R = rng(seed + 11);
  const b = new B(seed);
  const SB: V3[] = [
    [0.27, 0.2, 0.15],
    [0.33, 0.25, 0.18],
    [0.23, 0.18, 0.14],
    [0.3, 0.22, 0.16],
  ];
  const JOINT: V3 = [0.06, 0.045, 0.04];
  const HOT: V3 = [1, 0.42, 0.08];
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, bone: Bone = 'body') => b.solid([x, y, z], [w, h, d], SB[Math.floor(R() * SB.length)]!, { bone, ry: (R() - 0.5) * 0.16, rz: (R() - 0.5) * 0.1 });
  // legs: thigh, a dark knee, shin, a foot block; they stride
  for (const side of [-1, 1]) {
    const x = side * 0.62;
    const ph = side > 0 ? 0 : Math.PI;
    block(x, 1.62, 0, 0.8, 0.95, 0.85, 'legs');
    b.solid([x, 1.08, 0], [0.62, 0.16, 0.66], JOINT, { bone: 'legs' })
      .glow([x, 1.08, -0.38], 0.3, HOT, { bone: 'seal', alpha: 0.8, minPx: 2.5 })
      .glow([x + side * 0.36, 1.08, 0], 0.26, HOT, { bone: 'seal', alpha: 0.7, minPx: 2.5 });
    block(x, 0.58, 0.04, 0.74, 0.95, 0.8, 'legs');
    block(x, 0.1, 0.16, 0.9, 0.22, 1.05, 'legs');
    b.last(6, { gait: [2.1, 0, ph, 0.26] });
  }
  // pelvis, belly, chest; mortar joints between them
  block(0, 2.25, 0, 1.75, 0.55, 1.05);
  b.solid([0, 2.55, 0.01], [1.6, 0.08, 0.98], JOINT);
  block(0, 2.95, 0, 1.75, 0.75, 1.1);
  b.solid([0, 3.36, 0.01], [2.0, 0.08, 1.1], JOINT);
  block(0, 3.8, 0.02, 2.35, 0.9, 1.25);
  // the front: a dark plate with a lintel, the head with a brow
  b.solid([0, 3.4, 0.62], [1.45, 1.4, 0.1], [0.16, 0.12, 0.1], { rx: -0.04 })
    .solid([0, 4.08, 0.68], [1.2, 0.07, 0.05], [0.48, 0.38, 0.28])
    .solid([0, 2.88, 0.66], [0.9, 0.05, 0.04], [0.4, 0.31, 0.24]);
  block(0, 4.65, 0.12, 0.95, 0.8, 0.85, 'head');
  b.solid([0, 4.9, 0.55], [0.75, 0.12, 0.14], [0.14, 0.11, 0.09], { bone: 'head' })
    .solid([0, 4.6, 0.56], [0.55, 0.28, 0.05], [0.05, 0.04, 0.035], { bone: 'head' })
    .eyes(4.68, 0.6, 0.17, 0.12, [1, 0.72, 0.2]);
  // shoulders, upper arms, a dark elbow, forearms, fists
  for (const side of [-1, 1]) {
    const bone: Bone = side > 0 ? 'armR' : 'armL';
    block(side * 1.45, 4.0, 0.05, 0.95, 0.85, 0.95);
    block(side * 1.62, 3.15, 0.1, 0.62, 1.05, 0.62, bone);
    b.solid([side * 1.62, 2.55, 0.15], [0.5, 0.16, 0.52], JOINT, { bone })
      .glow([side * 1.95, 2.55, 0.1], 0.3, HOT, { bone: 'seal', alpha: 0.85, minPx: 2.5 })
      .last(1, { bone });
    block(side * 1.65, 1.95, 0.25, 0.7, 1.05, 0.7, bone);
    block(side * 1.68, 1.15, 0.38, 0.92, 0.72, 0.92, bone);
    // the shoulder joint glows at the side
    b.glow([side * 1.98, 4.0, -0.05], 0.4, HOT, { bone: 'seal', alpha: 0.9, minPx: 3 });
  }
  // the back: a seam of hot joints down the spine, cracks across
  for (const [x, y] of [
    [0, 2.55],
    [0, 3.36],
    [0, 4.2],
    [0.45, 3.0],
    [-0.45, 3.7],
    [0.5, 2.25],
    [-0.5, 2.25],
  ] as const)
    b.glow([x, y, -0.66], 0.38, HOT, { bone: 'seal', alpha: 0.9, minPx: 3 });
  b.solid([0, 3.3, -0.64], [0.08, 1.9, 0.04], [0.2, 0.06, 0.01], { em: [0.8, 0.28, 0.04] })
    .solid([0, 3.0, -0.65], [1.3, 0.06, 0.04], [0.2, 0.06, 0.01], { em: [0.7, 0.24, 0.03] })
    // flank joints at the hips
    .glow([0.92, 2.25, 0], 0.32, HOT, { bone: 'seal', alpha: 0.8, minPx: 2.5 })
    .glow([-0.92, 2.25, 0], 0.32, HOT, { bone: 'seal', alpha: 0.8, minPx: 2.5 })
    // dust at its feet
    .blob([0, 0.2, 0], [1.2, 0.12, 0.9], 6, 0.85, [0.55, 0.5, 0.44], { style: 1, alpha: 0.45, bone: 'legs' });
  return scaleTemplate({ parts: b.parts, tell: [1, 0.45, 0.1], top: 5.3, shoulder: 4.0 }, 1.05);
}

/**
 * Nebelweber: a tall, thin spindle of pale mist with a cold light inside, two long arms that spin
 * threads of frost; it hovers a little and never touches the ground.
 */
export function nebelweber(seed: number): BodyTemplate {
  const PALE: V3 = [0.52, 0.58, 0.68];
  const b = new B(seed)
    .line([0, 0.2, 0], [0, 2.0, 0.05], 9, 0.24, 0.38, PALE, { style: 1, alpha: 0.75, em: [0.04, 0.08, 0.12] })
    .blob([0, 1.4, 0], [0.22, 0.4, 0.18], 8, 0.36, [0.4, 0.46, 0.56], { style: 1, alpha: 0.65 })
    .blob([0, 2.25, 0.05], [0.14, 0.16, 0.13], 5, 0.3, [0.36, 0.42, 0.52], { bone: 'head', style: 1, alpha: 0.9 })
    // a hood of darker mist, the eyes deep inside it
    .blob([0, 2.35, -0.05], [0.18, 0.12, 0.14], 4, 0.3, [0.12, 0.13, 0.17], { bone: 'head', alpha: 0.85 })
    .eyes(2.24, 0.16, 0.07, 0.065, [0.7, 0.92, 1])
    // the cold heart
    .glow([0, 1.45, 0.12], 0.22, COLD, { bone: 'core', minPx: 5 })
    .glow([0, 1.45, 0.1], 0.9, [0.3, 0.5, 0.8], { bone: 'core', alpha: 0.5 })
    // long arms with threads of frost between the hands
    .line([0.2, 1.95, 0.05], [0.62, 1.45, 0.42], 5, 0.16, 0.1, PALE, { bone: 'armR', style: 1, alpha: 0.75 })
    .line([-0.2, 1.95, 0.05], [-0.62, 1.45, 0.42], 5, 0.16, 0.1, PALE, { bone: 'armL', style: 1, alpha: 0.75 })
    .glow([0.64, 1.42, 0.45], 0.1, COLD, { bone: 'armR', minPx: 3 })
    .glow([-0.64, 1.42, 0.45], 0.1, COLD, { bone: 'armL', minPx: 3 })
    // the trailing hem (it floats)
    .line([0, 0.6, -0.1], [0, 0.05, -0.45], 4, 0.3, 0.16, PALE, { bone: 'tail', style: 1, alpha: 0.5 });
  for (let i = 0; i < 4; i++) b.glow([0.45, 1.6 + i * 0.15, 0], 0.05, COLD, { minPx: 2 }).last(1, { bone: 'orbit', orbit: [2.2 + i * 0.3, i * 1.57] });
  return { parts: b.parts, tell: [0.7, 0.9, 1], top: 2.7, shoulder: 1.95 };
}

const MAKERS: Record<string, (seed: number) => BodyTemplate> = { nebelling, irrlicht, streuner, mahnbrief, raffschatten, glutling, grusling, steinfresser, schuldbuch, pikeur, strohmann, steinbrecher, nebelweber };

/** The body of a kind (size > 1: an elite, bigger). */
export function bodyTemplate(kind: string, seed: number, size = 1): BodyTemplate {
  const t = (MAKERS[kind] ?? nebelling)(Math.floor(seed * 1e6));
  return size !== 1 ? scaleTemplate(t, size) : t;
}
