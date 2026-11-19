/**
 * Procedural body templates of the spectral enemies (D-007: no downloads for them). A body is a list
 * of parts in the enemy's local frame (r = right, y = up, f = forward): drifting smoke / mist puffs,
 * additive glows (eyes, cores, cracks) and solid pieces. Since the creature pass (2026-11) a solid
 * names a sculpted shape (visuals-shapes.ts: shroud, mask, wisp tail, rock, crystal, sheaf, block,
 * page, wing, flame …) and a surface: the spectral surface (mat 4) is a dark translucent-looking
 * body with a family-coloured rim and the creature's heart glowing through it (`core`), so a
 * creature reads by day and by night without being a white blob. Parts animate on channels (bones),
 * hinges (wings, page feathers), sway (tails, ribbons) and orbits. Every silhouette is invented;
 * nothing human, no uniforms, no symbols. Pure data — the renderer (visuals.ts) animates and draws.
 */
import type { Shape } from './visuals-shapes';


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
  /** solid: surface (0 plain with edge seams, 1 dressed stone, 2 straw, 3 smooth: no seams). */
  mat?: number;
  /** Still drawn when the kind is a rigged model (combat/rigged.ts): the Pikeur's rider. */
  onRig?: boolean;
  /** solid: sculpted shape (visuals-shapes.ts); default a box. */
  shape?: Shape;
  /** solid: mirrored left / right (a left wing from the right wing's shape). */
  mx?: boolean;
  /** solid: the hem tatters into drifting rags (0..1; spectral shrouds and tails). */
  fray?: number;
  /** Swings about a hinge: [axis (0 x: pitch, 1 y: yaw, 2 z: roll), rate (rad/s), amplitude (rad), phase, pivot r, pivot y, pivot f]. */
  hinge?: [number, number, number, number, number, number, number];
  /** Sways sideways (tails, ribbons, flames): [amplitude (m), rate (rad/s), phase]. */
  sway?: [number, number, number];
}

/** Where the creature's heart sits (seen through its spectral body) and how big its glow is. */
export interface BodyCore {
  y: number;
  f: number;
  /** Glow radius (m). */
  rad: number;
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
  /** The heart seen through the spectral pieces (rides the `core` channel). */
  core?: BodyCore;
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

interface SolidOpts {
  bone?: Bone;
  em?: V3;
  rx?: number;
  ry?: number;
  rz?: number;
  mat?: number;
  fray?: number;
  hinge?: [number, number, number, number, number, number, number];
  sway?: [number, number, number];
  mx?: boolean;
}

/** Surfaces of the solid shader (visuals.ts). */
export const MAT = { plain: 0, stone: 1, straw: 2, smooth: 3, spectral: 4, paper: 5, mask: 6, flame: 7, crystal: 8, rock: 9 } as const;

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
    // round 6: a little larger at range (two clear embers at 30 m, not one smudge)
    return this.glow([-w, y, f], size, col, { bone, minPx: 5.5 }).glow([w, y, f], size, col, { bone, minPx: 5.5 });
  }
  solid(p: V3, s: V3, col: V3, o: { bone?: Bone; em?: V3; rx?: number; ry?: number; rz?: number; mat?: number } = {}): this {
    this.parts.push({ kind: 'solid', bone: o.bone ?? 'body', r: p[0], y: p[1], f: p[2], size: s[0], sy: s[1], sz: s[2], col, em: o.em, rx: o.rx, ry: o.ry, rz: o.rz, seed: this.R(), ...(o.mat ? { mat: o.mat } : {}) });
    return this;
  }
  /** A sculpted solid (see visuals-shapes.ts). */
  shape(sh: Shape, p: V3, s: V3, col: V3, o: SolidOpts = {}): this {
    const { bone, mat, ...rest } = o;
    this.parts.push({ kind: 'solid', bone: bone ?? 'body', r: p[0], y: p[1], f: p[2], size: s[0], sy: s[1], sz: s[2], col, seed: this.R(), shape: sh, ...(mat ? { mat } : {}), ...rest });
    return this;
  }
  /** A spectral piece: a dark body (`ink`) with a rim and inner light in the family `tint`. */
  spec(sh: Shape, p: V3, s: V3, tint: V3, ink: V3, o: SolidOpts = {}): this {
    return this.shape(sh, p, s, ink, { ...o, mat: MAT.spectral, em: tint });
  }
  /** Set the surface of the last `n` parts. */
  mat(n: number, mat: number): this {
    return this.last(n, { mat });
  }
  rand(): number {
    return this.R();
  }
}

const SMOKE: V3 = [0.05, 0.05, 0.06];
const EMBER: V3 = [1, 0.42, 0.1];
const COLD: V3 = [0.62, 0.86, 1.0];
const PAPER: V3 = [0.86, 0.8, 0.66];
/** The Steinfresser's sooty grey rock (it must not melt into the 1796 sand). */
const STONE_DARK: V3 = [0.2, 0.2, 0.22];
const STONE_DARK2: V3 = [0.15, 0.15, 0.17];
/** Oxblood calf (a lighter brown read as an orange crate under the warm 1789 light). */
const LEATHER: V3 = [0.13, 0.045, 0.035];
const SEAL: V3 = [0.55, 0.06, 0.04];
/** Spectral bodies: ink-dark mist with a pale-blue rim (mist family), dark smoke with an ember rim. */
const MIST_INK: V3 = [0.03, 0.04, 0.065];
const MIST_RIM: V3 = [0.36, 0.56, 0.95];
const SMOKE_INK: V3 = [0.035, 0.03, 0.03];
/** Bone-white masks, dark claws, coal. */
const BONE: V3 = [0.78, 0.75, 0.69];
const CLAW: V3 = [0.1, 0.11, 0.15];
const COAL: V3 = [0.035, 0.028, 0.025];

/**
 * Nebelling: a mist wraith — a hooded shroud of ink-dark mist with a tattered hem, a bone-white
 * mask in the hood (two slanted hollows, cold eyes deep inside), long arms that end in claws, the
 * lower body trailing behind it as a wisp. A small cold heart glows through the mist; the rim is
 * pale blue, so it reads on day grass and in the night snow alike. Sizes vary a little.
 */
export function nebelling(seed: number): BodyTemplate {
  const R = rng(seed + 21);
  const k = 0.9 + R() * 0.25;
  const tilt = (R() - 0.5) * 0.12;
  const b = new B(seed)
    .spec('shroud', [0, 0.8, 0], [0.64, 1.24, 0.5], MIST_RIM, MIST_INK, { fray: 1, rz: tilt, rx: -0.14 })
    .spec('tail', [0, 0.3, -0.3], [0.38, 0.58, 0.66], MIST_RIM, MIST_INK, { bone: 'tail', fray: 0.8, sway: [0.07, 2.3, 0] })
    .shape('mask', [0, 1.2, 0.18], [0.2, 0.26, 0.07], BONE, { bone: 'head', mat: MAT.mask, em: [0.3, 0.5, 0.95], rx: -0.12 })
    // arms reaching forward from the shoulders, rags hanging from them, three claws each
    .spec('limb', [0.25, 0.875, 0.21], [0.085, 0.5, 0.095], MIST_RIM, MIST_INK, { bone: 'armR', rx: 1.03, rz: 0.2 })
    .spec('limb', [-0.25, 0.875, 0.21], [0.085, 0.5, 0.095], MIST_RIM, MIST_INK, { bone: 'armL', rx: 1.03, rz: -0.2 })
    .spec('tail', [0.27, 0.74, 0.18], [0.13, 0.34, 0.2], MIST_RIM, MIST_INK, { bone: 'armR', fray: 0.9, sway: [0.03, 3.1, 1] })
    .spec('tail', [-0.27, 0.74, 0.18], [0.13, 0.34, 0.2], MIST_RIM, MIST_INK, { bone: 'armL', fray: 0.9, sway: [0.03, 2.9, 2] });
  for (const side of [-1, 1]) {
    const bone: Bone = side > 0 ? 'armR' : 'armL';
    for (let i = 0; i < 3; i++) b.shape('spike', [side * (0.27 + i * 0.03), 0.74, 0.47 - i * 0.015], [0.025, 0.15, 0.025], CLAW, { bone, mat: MAT.smooth, em: [0.04, 0.07, 0.14], rx: -1.9, rz: side * (i - 1) * 0.3 });
  }
  // a little mist frays off the hem (dark: a white blob under bloom was the old look)
  b.blob([0, 0.24, -0.12], [0.3, 0.1, 0.3], 4, 0.38, [0.14, 0.17, 0.24], { style: 1, alpha: 0.32, bone: 'legs' })
    // the cold heart (spectral = light from within, §6): seen through the shroud, a spark on its front
    .glow([0, 0.86, 0.2], 0.04, [0.55, 0.78, 1], { bone: 'core', minPx: 2, alpha: 0.35 })
    .glow([0, 0.86, 0.2], 0.26, [0.3, 0.5, 0.8], { bone: 'core', alpha: 0.08 })
    .eyes(1.21, 0.225, 0.036, 0.03, [0.8, 0.94, 1]);
  return scaleTemplate({ parts: b.parts, tell: [1, 0.55, 0.2], top: 1.45, shoulder: 0.98, core: { y: 0.86, f: 0.04, rad: 0.12 } }, k);
}

/**
 * Irrlicht (round 9 rework — "a street lantern on a post"): a floating will-o'-wisp. A hot white
 * heart inside a tall cold flame, two dark hollows for eyes in the flame, a halo, five motes that
 * circle it and a long frayed wisp that trails behind and below. No iron, no cage: only light and
 * mist, big enough to read at 20 m by day (the halo) and by night (the heart).
 */
export function irrlicht(seed: number): BodyTemplate {
  const R = rng(seed + 4);
  const k = 0.95 + R() * 0.2;
  const PALE: V3 = [0.7, 1, 0.92];
  const b = new B(seed)
    // the heart and the flame round it
    .shape('orb', [0, 0, 0], [0.13, 0.13, 0.13], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [0.9, 1, 0.95] })
    .glow([0, 0, 0], 0.2, PALE, { bone: 'core', minPx: 8 })
    .shape('drop', [0, 0.1, 0], [0.3, 0.56, 0.3], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [0.35, 0.8, 0.75], sway: [0.03, 5, 0] })
    .shape('flame', [0, 0.36, 0], [0.16, 0.34, 0.16], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: COLD, sway: [0.05, 7, 1] })
    .glow([0, 0.05, 0], 0.95, [0.22, 0.55, 0.5], { bone: 'core', alpha: 0.42 })
    // two dark hollows in the flame: it looks at you
    .shape('orb', [-0.065, 0.12, 0.12], [0.045, 0.06, 0.03], [0.02, 0.03, 0.04], { bone: 'core', mat: MAT.smooth })
    .shape('orb', [0.065, 0.12, 0.12], [0.045, 0.06, 0.03], [0.02, 0.03, 0.04], { bone: 'core', mat: MAT.smooth });
  // motes circling it
  for (let i = 0; i < 5; i++) {
    const y = -0.15 + i * 0.1;
    const r = 0.36 + (i % 2) * 0.12;
    b.glow([r, y, 0], 0.05, PALE, { minPx: 2.5 }).last(1, { bone: 'orbit', orbit: [1.8 + i * 0.4, i * 1.26] });
  }
  // the long wisp it trails
  b.spec('tail', [0, -0.42, -0.18], [0.2, 0.62, 0.5], [0.4, 0.95, 0.85], MIST_INK, { bone: 'core', fray: 1, sway: [0.07, 2.6, 0] })
    .blob([0, -0.55, -0.3], [0.14, 0.16, 0.2], 3, 0.32, [0.3, 0.5, 0.5], { style: 1, alpha: 0.2, bone: 'core', em: [0.05, 0.16, 0.15] });
  return scaleTemplate({ parts: b.parts, tell: [0.7, 1, 0.9], top: 0.85, shoulder: 0, core: { y: 0, f: 0, rad: 0.14 } }, k);
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

/**
 * Mahnbrief: a dunning letter folded into a paper bird — a creased body, a neck and a beak, a tail,
 * two folded wings that beat, the red seal on its back glowing. Ink scrawl on the parchment.
 */
export function mahnbrief(seed: number): BodyTemplate {
  const R = rng(seed + 9);
  const k = (0.92 + R() * 0.22) * 2.1; // round 9: x1.45 was too small to read at combat range
  const P2: V3 = [0.8, 0.74, 0.6];
  const beat = 8 + R() * 2;
  const b = new B(seed)
    .shape('crystal', [0, 0, 0], [0.13, 0.44, 0.12], PAPER, { mat: MAT.paper, rx: Math.PI / 2 })
    .shape('spike', [0, 0.08, 0.27], [0.045, 0.3, 0.05], P2, { mat: MAT.paper, rx: -1.0 })
    .shape('spike', [0, 0.16, 0.42], [0.04, 0.1, 0.04], P2, { mat: MAT.paper, rx: -2.3 })
    .shape('spike', [0, 0.07, -0.27], [0.05, 0.32, 0.06], P2, { mat: MAT.paper, rx: 1.15 })
    .shape('wing', [0.27, 0.1, -0.02], [0.56, 0.12, 0.44], PAPER, { mat: MAT.paper, rz: 0.35, hinge: [2, beat, 0.7, 0, 0, 0.02, 0] })
    .shape('wing', [-0.27, 0.1, -0.02], [0.56, 0.12, 0.44], P2, { mat: MAT.paper, mx: true, rz: -0.35, hinge: [2, beat, -0.7, 0, 0, 0.02, 0] })
    .shape('orb', [0, 0.075, -0.03], [0.1, 0.04, 0.1], SEAL, { bone: 'seal', mat: MAT.smooth, em: [0.4, 0.03, 0.01] })
    .glow([0, 0.1, -0.03], 0.1, [1, 0.2, 0.08], { bone: 'seal', minPx: 3.5 })
    .eyes(0.19, 0.41, 0.025, 0.028, [1, 0.35, 0.1]);
  return scaleTemplate({ parts: b.parts, tell: [1, 0.25, 0.1], top: 0.55, shoulder: 0 }, k);
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
    .glow([0.0, 0.8, 0.15], 0.05, [1, 0.8, 0.3], { bone: 'flap', minPx: 2 })
    // the stolen coins glint on the rigged body too
    .last(3, { onRig: true });
  return { parts: b.parts, tell: [1, 0.75, 0.25], top: 2.1, shoulder: 1.45 };
}

export function glutling(seed: number): BodyTemplate {
  // a sooty, nearly black lump of coal with glowing veins, a crown of flame and a white-hot heart:
  // it has to read against a burning room, so the silhouette is dark and the halo small
  const R = rng(seed + 2);
  const k = 0.9 + R() * 0.25;
  const HOT: V3 = [1, 0.42, 0.08];
  const b = new B(seed)
    .shape('rock', [0, 0.4, 0], [0.5, 0.46, 0.48], COAL, { bone: 'core', mat: MAT.rock, em: HOT, ry: R() * 3 })
    .shape('rock2', [0.15, 0.5, -0.1], [0.26, 0.24, 0.26], COAL, { bone: 'core', mat: MAT.rock, em: HOT, ry: 1 })
    .shape('flame', [0, 0.76, -0.03], [0.26, 0.48, 0.26], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [1, 0.45, 0.08], sway: [0.035, 5, 0] })
    .shape('flame', [0.15, 0.68, 0.03], [0.15, 0.3, 0.15], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [1, 0.38, 0.06], rz: -0.45, sway: [0.025, 6, 1] })
    .shape('flame', [-0.16, 0.66, 0], [0.14, 0.28, 0.14], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [1, 0.38, 0.06], rz: 0.5, sway: [0.025, 5.5, 2] })
    .glow([0, 0.4, 0.27], 0.12, [1, 0.95, 0.75], { bone: 'core', minPx: 4 })
    .glow([0, 0.4, 0.1], 0.55, [0.8, 0.25, 0.05], { bone: 'core', alpha: 0.3 })
    .eyes(0.47, 0.29, 0.09, 0.05, [1, 0.97, 0.8], 'core');
  for (let i = 0; i < 3; i++) b.shape('rock2', [0.42, 0.3 + i * 0.12, 0], [0.09, 0.08, 0.09], COAL, { mat: MAT.rock, em: HOT, rx: i }).last(1, { bone: 'orbit', orbit: [1.8 + i * 0.4, i * 2.1] });
  return scaleTemplate({ parts: b.parts, tell: [1, 0.6, 0.15], top: 0.95, shoulder: 0, core: { y: 0.4, f: 0, rad: 0.1 } }, k);
}

/** Wet mortar: dark grey-brown, so a Grusling reads on pale 1796 sand (playtest round 2). */
const MORTAR: V3 = [0.2, 0.17, 0.15];
const MORTAR2: V3 = [0.27, 0.23, 0.2];

export function grusling(seed: number): BodyTemplate {
  const R = rng(seed + 7);
  const b = new B(seed);
  // a dark shadow blob under it (it never floats), then a hunched heap of wet mortar lumps on two
  // stubby feet
  b.blob([0, 0.03, 0], [0.22, 0.02, 0.22], 3, 0.42, [0.04, 0.035, 0.03], { alpha: 0.7, bone: 'legs' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.shape(i % 2 ? 'rock' : 'rock2', [Math.cos(a) * 0.15, 0.15 + (i % 2) * 0.1, Math.sin(a) * 0.15], [0.17 + R() * 0.07, 0.15 + R() * 0.06, 0.17 + R() * 0.06], i % 2 ? MORTAR : MORTAR2, { bone: i % 3 ? 'body' : 'legs', ry: R() * 3, rx: R(), mat: MAT.stone });
  }
  for (const side of [-1, 1]) b.shape('rock2', [side * 0.09, 0.04, 0.06], [0.1, 0.08, 0.13], MORTAR, { bone: 'legs', mat: MAT.stone, ry: side }).last(1, { gait: [0.1, 0.06, side > 0 ? 0 : Math.PI, 0.5] });
  b.shape('rock', [0, 0.34, 0.03], [0.22, 0.17, 0.21], [0.24, 0.2, 0.17], { bone: 'head', ry: 0.6, mat: MAT.stone })
    .shape('rock2', [0, 0.4, 0.07], [0.2, 0.06, 0.1], MORTAR, { bone: 'head', mat: MAT.stone })
    .blob([0, 0.12, -0.15], [0.12, 0.08, 0.18], 3, 0.28, [0.5, 0.46, 0.4], { style: 1, alpha: 0.4, bone: 'tail' })
    .eyes(0.37, 0.14, 0.06, 0.05, [1, 0.62, 0.2]);
  // half again as big as at first: in first person a knee-high heap at 1.5 m is below the view
  const k = 1.5 * (0.92 + R() * 0.18);
  return scaleTemplate({ parts: b.parts, tell: [1, 0.7, 0.4], top: 0.55, shoulder: 0.25 }, k);
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
    if (p.hinge) p.hinge = [p.hinge[0], p.hinge[1], p.hinge[2], p.hinge[3], p.hinge[4] * k, p.hinge[5] * k, p.hinge[6] * k];
    if (p.sway) p.sway = [p.sway[0] * k, p.sway[1], p.sway[2]];
    if (p.gait) p.gait = [p.gait[0] * k, p.gait[1] * k, p.gait[2], p.gait[3]];
    if (p.turn) p.turn = [p.turn[0], p.turn[1], p.turn[2], p.turn[3] * k, p.turn[4] * k];
  }
  return { ...t, top: t.top * k, shoulder: t.shoulder * k, ...(t.core ? { core: { y: t.core.y * k, f: t.core.f * k, rad: t.core.rad * k } } : {}) };
}

export function steinfresser(seed: number): BodyTemplate {
  // a hunched brute of sooty rock with ember veins, a crystal heart growing out of its chest and
  // crystals out of its back; each one a little different in size and tint
  const R = rng(seed + 5);
  const k = 0.85 + R() * 0.3;
  const tintOf = (c: V3): V3 => [c[0] * k, c[1] * (0.9 + R() * 0.2) * k, c[2] * (0.85 + R() * 0.3) * k];
  // round 6 readability: dark, sooty, cold-grey rock (value and hue both away from the beige ground)
  const A = tintOf(STONE_DARK);
  const A2 = tintOf(STONE_DARK2);
  const VEIN: V3 = [0.85, 0.32, 0.06];
  const HOTC: V3 = [1, 0.45, 0.12];
  const b = new B(seed);
  const rk = (sh: Shape, p: V3, s: V3, c: V3, bone: Bone = 'body', o: SolidOpts = {}) => b.shape(sh, p, s, c, { bone, mat: MAT.rock, em: VEIN, ...o });
  for (const side of [-1, 1]) rk('rock2', [side * 0.32, 0.3, 0], [0.44, 0.58, 0.48], A2, 'legs', { ry: side }).last(1, { gait: [0.6, 0, side > 0 ? 0 : Math.PI, 0.35] });
  rk('rock', [0, 0.68, -0.02], [0.84, 0.44, 0.6], A2);
  rk('rock', [0, 1.18, -0.05], [1.1, 0.94, 0.8], A, 'body', { rx: 0.12 });
  rk('rock2', [0, 0.92, 0.17], [0.72, 0.5, 0.5], A);
  for (const side of [-1, 1]) {
    const arm: Bone = side > 0 ? 'armR' : 'armL';
    rk('rock2', [side * 0.62, 1.5, -0.02], [0.6, 0.54, 0.58], A2, 'body', { ry: side * 0.5 });
    rk('rock', [side * 0.78, 1.08, 0.12], [0.36, 0.62, 0.38], A, arm, { rz: side * 0.15 });
    rk('rock2', [side * 0.82, 0.62, 0.28], [0.48, 0.44, 0.48], A2, arm, { ry: side * 0.7 });
  }
  rk('rock', [0, 1.62, 0.3], [0.46, 0.38, 0.44], [0.26, 0.25, 0.27], 'head');
  rk('rock2', [0, 1.75, 0.42], [0.52, 0.14, 0.18], A2, 'head');
  // the crystal heart in the chest (the weak point glows harder once the armour breaks)
  b.shape('crystal', [0, 1.18, 0.36], [0.22, 0.46, 0.2], [0.2, 0.08, 0.03], { bone: 'seal', mat: MAT.crystal, em: HOTC, rz: 0.15 })
    .shape('crystal', [0.15, 1.04, 0.33], [0.1, 0.26, 0.1], [0.2, 0.08, 0.03], { bone: 'seal', mat: MAT.crystal, em: HOTC, rz: -0.6 })
    .shape('crystal', [-0.13, 1.3, 0.32], [0.09, 0.22, 0.09], [0.2, 0.08, 0.03], { bone: 'seal', mat: MAT.crystal, em: HOTC, rz: 0.7 });
  for (const [x, y, z, rz] of [
    [0.28, 1.45, -0.42, -0.35],
    [-0.24, 1.55, -0.4, 0.3],
    [0.02, 1.22, -0.48, 0.05],
    [0.68, 1.6, -0.25, -0.9],
    [-0.66, 1.56, -0.26, 0.9],
  ] as const)
    b.shape('crystal', [x, y, z], [0.13, 0.4 + R() * 0.14, 0.13], [0.2, 0.08, 0.03], { mat: MAT.crystal, em: [0.75, 0.3, 0.08], rx: 0.9, rz });
  b.glow([0, 1.18, 0.5], 0.36, [0.9, 0.35, 0.08], { bone: 'seal', alpha: 0.5 })
    .eyes(1.63, 0.53, 0.1, 0.06, [1, 0.55, 0.15])
    .glow([0, 1.64, 0.55], 0.3, [1, 0.45, 0.1], { bone: 'head', alpha: 0.45 })
    .blob([0, 0.12, 0], [0.6, 0.08, 0.5], 4, 0.5, [0.3, 0.28, 0.27], { style: 0, alpha: 0.3, bone: 'legs' });
  return { parts: b.parts, tell: [1, 0.5, 0.15], top: 2.2, shoulder: 1.4, core: { y: 1.18, f: 0.3, rad: 0.15 } };
}

/**
 * Das Schuldbuch: a ledger as tall as a door that floats a man's height above the ground. Its
 * leather covers spread like wings and the pages fan out from their edges like pinions, beating;
 * between them the open pages, ruled and scrawled, pages that turn by themselves, red ribbons, and
 * for a heart the ducal seal as an eye — red wax round a glowing iris and a slit pupil (the
 * Bannlicht breaks it). Scraps of paper circle it.
 */
export function schuldbuch(seed: number): BodyTemplate {
  const R = rng(seed + 13);
  const BRASS: V3 = [0.55, 0.42, 0.16];
  const GILT: V3 = [0.62, 0.48, 0.18];
  const Y = 2.15;
  const b = new B(seed);
  for (const side of [-1, 1]) {
    const bone: Bone = side < 0 ? 'armL' : 'armR';
    // the covers open towards the player (the pages and the seal between them)
    const ry = side * 0.38;
    const cx = side * 0.78;
    // a point on the cover: u along its width, n off its face (the cover turns by ry about y; the
    // template's forward f is −z)
    const at = (u: number, y: number, n: number): V3 => [cx + u * Math.cos(ry) + n * Math.sin(ry), y, u * Math.sin(ry) - n * Math.cos(ry)];
    b.shape('block', [cx, Y, 0], [1.45, 2.3, 0.12], LEATHER, { bone, ry, mat: MAT.smooth });
    for (const [u, y] of [
      [0.6, 1.04],
      [0.6, -1.04],
    ] as const)
      b.shape('block', at(side * u, Y + y, -0.02), [0.26, 0.2, 0.16], BRASS, { bone, ry, em: [0.12, 0.08, 0.02], mat: MAT.smooth });
    const o = { bone, ry, em: [0.16, 0.11, 0.03] as V3 };
    for (const n of [-0.07, 0.07]) {
      b.solid(at(0, Y + 1.0, n), [1.25, 0.05, 0.02], GILT, o)
        .solid(at(0, Y - 1.0, n), [1.25, 0.05, 0.02], GILT, o)
        .solid(at(-0.6, Y, n), [0.05, 2.0, 0.02], GILT, o)
        .solid(at(0.6, Y, n), [0.05, 2.0, 0.02], GILT, o)
        .solid(at(0, Y, n), [0.42, 0.42, 0.02], GILT, { ...o, rz: 0.785 })
        .solid(at(0, Y, n * 1.25), [0.3, 0.3, 0.02], [0.2, 0.06, 0.04], { bone, ry, rz: 0.785 });
    }
    // the pinions: pages fanning out from the cover's outer edge and sweeping back, beating one
    // after another
    const pry = side * -0.45;
    for (let i = 0; i < 6; i++) {
      const a = 0.55 - i * 0.3;
      const L = 1.25 + Math.sin((i / 5) * Math.PI) * 0.5 + R() * 0.15;
      const ey = Y + 0.85 - i * 0.34;
      const e = at(side * 0.66, ey, 0.03 + i * 0.012);
      const dr = side * Math.cos(a) * Math.cos(pry);
      const dy = Math.sin(a);
      const df = side * Math.cos(a) * Math.sin(pry);
      const c: V3 = i % 2 ? PAPER : [0.8, 0.74, 0.6];
      b.shape('page', [e[0] + dr * L * 0.5, e[1] + dy * L * 0.5, e[2] + df * L * 0.5], [L, 0.52, 0.14], c, { bone, ry: pry, rz: side * a, mat: MAT.paper, mx: side < 0, hinge: [2, 1.7, side * 0.16, -i * 0.55, e[0], e[1], e[2]] });
    }
  }
  // the spine (ridged), the page block, the open pages
  b.shape('block', [0, Y, -0.32], [0.34, 2.36, 0.22], [0.16, 0.08, 0.05], { mat: MAT.smooth });
  for (let i = 0; i < 5; i++) b.solid([0, Y - 0.9 + i * 0.45, -0.45], [0.4, 0.07, 0.06], [0.22, 0.1, 0.06], { em: [0.05, 0.02, 0.01] });
  b.shape('block', [0, Y, -0.16], [0.62, 2.12, 0.4], PAPER, { mat: MAT.paper });
  for (const side of [-1, 1]) b.shape('page', [side * 0.44, Y, 0.23], [0.88, 2.02, 0.12], side < 0 ? [0.84, 0.78, 0.63] : [0.8, 0.74, 0.59], { bone: 'flap', ry: side * 0.3, mat: MAT.paper, mx: side < 0 });
  // pages that turn by themselves, each at its own pace (the ledger keeps counting)
  for (let i = 0; i < 4; i++) {
    const ph = R() * 6.28;
    b.shape('page', [0.42, Y + (R() - 0.5) * 0.1, 0.16 + i * 0.012], [0.82, 1.94, 0.1], [0.88, 0.83, 0.69], { mat: MAT.paper }).last(1, { turn: [1.3 + R() * 0.9, 1.35, ph, 0, 0.1] });
  }
  // ribbons hanging and swaying, the clasp
  b.shape('page', [-0.08, Y - 1.45, 0.08], [0.07, 0.8, 0.03], [0.6, 0.06, 0.05], { mat: MAT.smooth, sway: [0.06, 1.8, 0] })
    .shape('page', [0.1, Y - 1.35, 0.08], [0.06, 0.6, 0.03], [0.45, 0.05, 0.12], { mat: MAT.smooth, sway: [0.06, 2.1, 1] })
    .shape('block', [0, Y - 0.62, 0.24], [0.5, 0.09, 0.06], BRASS, { em: [0.15, 0.1, 0.03], mat: MAT.smooth });
  // the seal: an eye of red wax — scalloped rim, a glowing amber iris, a slit pupil
  b.shape('orb', [0, Y + 0.05, 0.24], [0.64, 0.64, 0.16], SEAL, { bone: 'seal', mat: MAT.smooth, em: [0.3, 0.025, 0.015] })
    .shape('torus', [0, Y + 0.05, 0.28], [0.68, 0.1, 0.68], [0.36, 0.035, 0.025], { bone: 'seal', rx: Math.PI / 2, mat: MAT.smooth, em: [0.2, 0.015, 0.01] })
    .shape('orb', [0, Y + 0.05, 0.31], [0.36, 0.36, 0.07], [0.3, 0.12, 0.02], { bone: 'seal', mat: MAT.crystal, em: [1, 0.42, 0.08] })
    .shape('box', [0, Y + 0.05, 0.352], [0.07, 0.3, 0.02], [0.01, 0.005, 0.005], { bone: 'seal', mat: MAT.smooth })
    .glow([0, Y + 0.05, 0.42], 0.3, [1, 0.3, 0.08], { bone: 'seal', minPx: 6, alpha: 0.7 })
    .glow([0, Y + 0.05, 0.42], 1.6, [0.8, 0.12, 0.04], { bone: 'seal', alpha: 0.3 });
  // scraps circling it at different heights (the unpaid)
  for (let i = 0; i < 9; i++) b.shape('page', [1.9 + R() * 0.6, Y - 1 + R() * 2.4, 0], [0.24, 0.32, 0.06], PAPER, { mat: MAT.paper, rx: R(), rz: R() }).last(1, { bone: 'orbit', orbit: [0.7 + R() * 0.6, (i / 9) * 6.283] });
  // a dark draught under it (it never touches the ground)
  b.blob([0, 0.5, 0], [0.8, 0.25, 0.5], 9, 0.8, [0.12, 0.1, 0.1], { alpha: 0.45, bone: 'legs' })
    .glow([0, 0.4, 0], 2.2, [0.5, 0.1, 0.05], { bone: 'legs', alpha: 0.25 });
  // door-sized: a ledger taller than a man (it read as a box at reveal distance)
  return scaleTemplate({ parts: b.parts, tell: [1, 0.3, 0.1], top: 3.9, shoulder: Y }, 1.3);
}

/**
 * Der Pikeur: a faceless huntsman in a long dark coat and a three-cornered hat on a horse of smoke.
 * Cold eyes under the hat, the brass horn across the chest, the whip; the horse's mane and tail are
 * pale ghost-fire, its hooves strike mist; two hounds trot at its heels.
 */
export function pikeur(seed: number): BodyTemplate {
  const HS: V3 = [0.035, 0.035, 0.045];
  const HB: V3 = [0.012, 0.012, 0.016];
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
    // ember eyes and hot breath (round 4: the cold eyes vanished in the snow light)
    .glow([-0.15, 2.48, 1.78], 0.1, [1, 0.5, 0.12], { bone: 'head', minPx: 4.5 })
    .glow([0.15, 2.48, 1.78], 0.1, [1, 0.5, 0.12], { bone: 'head', minPx: 4.5 })
    .glow([0, 2.2, 2.08], 0.3, [0.8, 0.35, 0.1], { bone: 'head', alpha: 0.35 })
    // a solid black horse inside the smoke (playtest round 4: "a grey mass of puffs, no horse
    // reads"): barrel, chest, quarters, neck and head as dark masses with a fog-lit rim; the puffs
    // fray their edges
    .solid([0, 1.62, 0], [0.56, 0.62, 1.55], HB, { mat: 3 })
    .solid([0, 1.7, 0.82], [0.5, 0.7, 0.42], HB, { mat: 3, rx: -0.2 })
    .solid([0, 1.72, -0.78], [0.62, 0.62, 0.5], HB, { mat: 3 })
    .solid([0, 2.28, 1.21], [0.3, 0.9, 0.36], HB, { mat: 3, rx: 0.56, bone: 'head' })
    .solid([0, 2.46, 1.75], [0.24, 0.26, 0.74], HB, { mat: 3, rx: 0.67, bone: 'head' });
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
      .solid([r, 0.8, f], [0.13, 1.25, 0.16], HB, { bone: 'legs', mat: 3 })
      .last(12, { gait: [1.4, f, ph, 0.55] });
  }
  // the rider: legs in the stirrups, a long coat, the faceless head under the hat
  b.line([0.3, 2.05, 0.08], [0.34, 1.35, 0.28], 4, 0.22, 0.16, SMOKE, { bone: 'rider' })
    .line([-0.3, 2.05, 0.08], [-0.34, 1.35, 0.28], 4, 0.22, 0.16, SMOKE, { bone: 'rider' })
    .line([0, 2.1, 0], [0, 2.95, 0.05], 8, 0.42, 0.34, SMOKE, { bone: 'rider' })
    .solid([0, 2.55, 0.02], [0.46, 0.85, 0.32], HB, { bone: 'rider', mat: 3 })
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
  // on the rigs (medium / high quality) nothing of this stays: the horse, the hounds and the rider
  // in the saddle are models (combat/rigged.ts); this procedural Pikeur is the low tier's
  return scaleTemplate({ parts: b.parts, tell: [1, 0.65, 0.25], top: 3.75, shoulder: 2.75 }, 1.12);
}

/**
 * Der Strohmann: a giant of bound sheaves, taller than the carts it rose from, burning — flames lick
 * from its head, shoulders and flails. Every limb is a sheaf tied with cord, stalks bristle out of
 * it; the front is hard bound straw, at the back, where the sheaves are tied, it is soft: loose straw
 * that glows from within (the weak point).
 */
export function strohmann(seed: number): BodyTemplate {
  const R = rng(seed + 3);
  const S1: V3 = [0.78, 0.56, 0.18];
  const S2: V3 = [0.66, 0.47, 0.15];
  const S3: V3 = [0.5, 0.33, 0.09];
  const CORD: V3 = [0.12, 0.08, 0.05];
  const SM: V3 = [0.05, 0.018, 0.002];
  const b = new B(seed);
  const sheaf = (p: V3, s: V3, c: V3, o: SolidOpts = {}) => b.shape('sheaf', p, s, c, { mat: MAT.straw, em: SM, ...o });
  // a fire: three tongues of different size and lean licking up from one spot
  const fire = (p: V3, h: number, bone: Bone = 'body') => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + R();
      const sz = h * (i === 0 ? 1 : 0.55 + R() * 0.25);
      const x = i === 0 ? 0 : Math.cos(a) * h * 0.22;
      const z = i === 0 ? 0 : Math.sin(a) * h * 0.22;
      b.shape('flame', [p[0] + x, p[1] + sz * 0.35, p[2] + z], [sz * 0.5, sz, sz * 0.5], [1, 1, 1], { bone, mat: MAT.flame, em: i === 0 ? EMBER : [1, 0.3, 0.05], rz: i === 0 ? 0 : Math.cos(a) * -0.4, rx: i === 0 ? 0 : Math.sin(a) * 0.4, sway: [h * 0.05, 4 + i * 1.3, i * 2 + p[0]] });
    }
  };
  const tie = (p: V3, w: number, d: number, o: SolidOpts = {}) => b.shape('torus', p, [w, 0.11, d], CORD, { mat: MAT.smooth, ...o });
  // legs: two thick sheaves that stride, bound at the knee, a sheaf laid flat for a foot
  for (const side of [-1, 1]) {
    sheaf([side * 0.4, 0.88, 0], [0.48, 1.7, 0.48], side < 0 ? S1 : S2, { rz: side * 0.04 });
    tie([side * 0.4, 0.95, 0], 0.5, 0.5);
    tie([side * 0.4, 0.45, 0], 0.5, 0.5);
    sheaf([side * 0.4, 0.12, 0.08], [0.44, 0.66, 0.3], S3, { rx: Math.PI / 2 });
    b.last(4, { gait: [1.75, 0, side > 0 ? 0 : Math.PI, 0.32] });
  }
  // the torso: a ring of tall sheaves leaning out at the top, bound twice, a squat bundle for hips
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    sheaf([Math.cos(a) * 0.42, 2.58 + R() * 0.2, Math.sin(a) * 0.34], [0.36, 1.9, 0.36], i % 2 ? S1 : S2, { rx: Math.sin(a) * -0.14 + (R() - 0.5) * 0.12, rz: Math.cos(a) * -0.16 + (R() - 0.5) * 0.12, ry: R() * 3 });
  }
  sheaf([0, 1.75, 0], [1.15, 0.55, 0.95], S3);
  tie([0, 2.25, 0.02], 1.16, 0.98);
  tie([0, 3.05, 0.02], 1.2, 1.02);
  // shoulders: a sheaf laid across
  sheaf([0, 3.45, 0], [0.5, 2.1, 0.5], S1, { rz: Math.PI / 2 + 0.04 });
  tie([0.6, 3.45, 0], 0.54, 0.54, { rz: Math.PI / 2 });
  tie([-0.6, 3.45, 0], 0.54, 0.54, { rz: Math.PI / 2 });
  // the soft back: loose straw that glows from within, the cords hot
  b.solid([0, 2.25, -0.55], [0.9, 0.1, 0.1], CORD, { em: [0.7, 0.25, 0.04] })
    .solid([0, 3.05, -0.55], [0.9, 0.1, 0.1], CORD, { em: [0.7, 0.25, 0.04] })
    .blob([0, 2.65, -0.52], [0.42, 0.55, 0.12], 10, 0.34, [0.75, 0.6, 0.3], { style: 1, alpha: 0.75, em: [0.7, 0.32, 0.06] })
    .glow([0, 2.65, -0.64], 1.15, [1, 0.62, 0.2], { bone: 'seal', alpha: 0.8, minPx: 6 })
    .glow([0, 2.65, -0.68], 0.4, [1, 0.92, 0.6], { bone: 'seal', alpha: 0.9, minPx: 3 });
  // the head: a sheaf tied at the neck, a spiky crown of stalks, eyes deep inside, burning
  sheaf([0, 4.08, 0.05], [0.7, 0.85, 0.62], S1, { bone: 'head', rz: 0.1 });
  tie([0, 3.74, 0.05], 0.7, 0.64, { bone: 'head' });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.shape('spike', [Math.cos(a) * 0.22, 4.62, Math.sin(a) * 0.2], [0.08, 0.55 + R() * 0.2, 0.08], S2, { bone: 'head', mat: MAT.straw, em: SM, rx: Math.sin(a) * 0.45, rz: -Math.cos(a) * 0.45 });
  }
  b.eyes(4.05, 0.38, 0.14, 0.11, [1, 0.62, 0.15])
    .glow([0, 4.6, 0], 0.5, EMBER, { bone: 'head', alpha: 0.9 })
    .last(1, { fire: 9 });
  fire([0, 4.6, 0], 1.0, 'head');
  // flails: long sheaves for arms, bound, burning at the ends
  for (const side of [-1, 1]) {
    const bone: Bone = side > 0 ? 'armR' : 'armL';
    sheaf([side * 1.15, 2.45, 0.3], [0.4, 2.2, 0.4], side > 0 ? S1 : S2, { bone, rz: -side * 0.42 });
    tie([side * 1.42, 1.85, 0.31], 0.44, 0.44, { bone, rz: -side * 0.42 });
    tie([side * 0.95, 2.9, 0.29], 0.44, 0.44, { bone, rz: -side * 0.42 });
    fire([side * 1.72, 1.1, 0.34], 0.7, bone);
    fire([side * 0.85, 3.62, 0], 0.62);
    b.glow([side * 1.75, 1.15, 0.35], 0.4, EMBER, { bone, alpha: 0.9 })
      .last(1, { fire: 7 })
      .glow([side * 0.85, 3.6, 0], 0.3, EMBER, { alpha: 0.7 })
      .last(1, { fire: 5 });
  }
  // smouldering spots in front
  b.glow([0.15, 2.7, 0.44], 0.32, EMBER, { bone: 'seal', alpha: 0.8 })
    .glow([-0.25, 2.1, 0.42], 0.24, EMBER, { bone: 'seal', alpha: 0.7 })
    .glow([0.3, 1.8, 0.4], 0.22, EMBER, { bone: 'seal', alpha: 0.7 })
    .glow([0, 2.9, -0.55], 0.3, EMBER, { alpha: 0.6 })
    .last(1, { fire: 4 })
    .blob([0, 5.1, 0], [0.5, 0.5, 0.5], 6, 0.75, [0.08, 0.07, 0.07], { bone: 'head', alpha: 0.55, em: [0.35, 0.12, 0.02] });
  // loose stalks bristle out of every sheaf so the outline is ragged
  const sheaves = b.parts.filter((q) => q.shape === 'sheaf');
  for (const q of sheaves) {
    const n = Math.round(Math.min(8, 2 + ((q.sy ?? q.size) * (q.size + (q.sz ?? q.size))) * 4));
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const h = (R() - 0.5) * (q.sy ?? q.size) * 0.85;
      const rr = Math.max(q.size, q.sz ?? q.size) * 0.45;
      const len = 0.35 + R() * 0.45;
      b.shape('spike', [q.r + Math.cos(a) * rr, q.y + h, q.f + Math.sin(a) * rr], [0.035, len, 0.035], R() > 0.4 ? [0.85, 0.66, 0.26] : [0.6, 0.42, 0.15], {
        bone: q.bone,
        rx: Math.sin(a) * (0.6 + R() * 0.7),
        rz: -Math.cos(a) * (0.6 + R() * 0.7),
        em: [0.06, 0.025, 0.003],
        mat: MAT.straw,
      });
      if (q.gait) b.last(1, { gait: q.gait });
    }
  }
  // taller and leaner: a sheaf giant, not a crate
  for (const q of b.parts) {
    q.r *= 0.86;
    q.f *= 0.86;
    q.y *= 1.12;
    if (q.kind === 'solid') {
      q.size *= 0.86;
      if (q.sz !== undefined) q.sz *= 0.86;
      if (q.sy !== undefined) q.sy *= 1.12;
    }
  }
  return scaleTemplate({ parts: b.parts, tell: [1, 0.55, 0.15], top: 5.1 * 1.12, shoulder: 3.4 * 1.12 }, 1.12);
}

/**
 * Der Steinbrecher: a giant of robbed-out palace sandstone, twice a man's height and more — legs of
 * stacked, chamfered quaders that stride, a chest like a wall with a dark plate, carved scrolls on
 * its shoulders and a cornice for a brow, arms with elbows and fists of block. Hot seams run between
 * the blocks; the joints glow at the back and the sides (where it can be broken), never in front.
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
  // hunched: the upper body leans forward over the legs (rx), the blocks dressed, chamfered stone
  // the big blocks are cracked through, the cracks glowing (the fire that broke the palace in it)
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, bone: Bone = 'body', rx = 0) => {
    const cracked = w * h * d > 0.45;
    const c = SB[Math.floor(R() * SB.length)]!;
    // cracked blocks are drawn as rock (no chisel darkening there): a darker, redder stone
    const col: V3 = cracked ? [c[0] * 0.72, c[1] * 0.62, c[2] * 0.58] : c;
    return b.shape('block', [x, y, z], [w, h, d], col, { bone, ry: (R() - 0.5) * 0.3, rz: (R() - 0.5) * 0.18, rx: rx + (R() - 0.5) * 0.08, mat: cracked ? MAT.rock : MAT.stone, ...(cracked ? { em: [0.95, 0.34, 0.05] as V3 } : {}) });
  };
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
  block(0, 2.95, 0.12, 1.75, 0.75, 1.1, 'body', 0.12);
  b.solid([0, 3.36, 0.2], [2.0, 0.08, 1.1], JOINT, { rx: 0.15 });
  block(0, 3.8, 0.38, 2.35, 0.9, 1.25, 'body', 0.22);
  // the front: a dark plate with a lintel, the head with a cornice for a brow
  b.solid([0, 3.4, 0.62], [1.45, 1.4, 0.1], [0.16, 0.12, 0.1], { rx: -0.04 })
    .shape('block', [0, 4.08, 0.68], [1.25, 0.1, 0.08], [0.48, 0.38, 0.28], { mat: MAT.stone })
    .solid([0, 2.88, 0.66], [0.9, 0.05, 0.04], [0.4, 0.31, 0.24]);
  // the head sits low and forward between the shoulders (a brute, not a golem standing to attention)
  block(0.08, 4.45, 0.7, 0.95, 0.8, 0.85, 'head', 0.1);
  b.shape('block', [0.08, 4.74, 1.12], [1.05, 0.16, 0.26], [0.3, 0.23, 0.17], { bone: 'head', mat: MAT.stone })
    .shape('block', [0.08, 4.85, 1.05], [1.15, 0.08, 0.3], [0.36, 0.27, 0.2], { bone: 'head', mat: MAT.stone })
    .solid([0.08, 4.42, 1.14], [0.55, 0.26, 0.05], [0.05, 0.04, 0.035], { bone: 'head', mat: 3 })
    .solid([0.08, 4.12, 0.95], [0.7, 0.07, 0.6], [0.1, 0.03, 0.01], { em: [0.8, 0.28, 0.04], bone: 'head' })
    .eyes(4.48, 1.18, 0.17, 0.13, [1, 0.72, 0.2])
    .glow([0.08, 4.48, 1.2], 0.6, [1, 0.45, 0.1], { bone: 'head', alpha: 0.5 });
  // shoulders (with carved scrolls), upper arms, a dark elbow, forearms, fists with knuckles
  for (const side of [-1, 1]) {
    const bone: Bone = side > 0 ? 'armR' : 'armL';
    // asymmetric: the right arm a wall-breaker (bigger fist, higher shoulder), the left a stump
    const k = side > 0 ? 1.18 : 0.92;
    const sy = 4.0 + (side > 0 ? 0.18 : -0.05);
    block(side * 1.45, sy, 0.35, 0.95 * k, 0.85 * k, 0.95 * k);
    b.shape('torus', [side * (1.45 + 0.49 * k), sy, 0.35], [0.62 * k, 0.16, 0.62 * k], SB[1]!, { rz: Math.PI / 2, mat: MAT.stone })
      .shape('orb', [side * (1.45 + 0.5 * k), sy, 0.35], [0.12, 0.24 * k, 0.24 * k], SB[0]!, { mat: MAT.stone });
    block(side * 1.62, 3.15, 0.4, 0.62 * k, 1.05, 0.62 * k, bone);
    b.solid([side * 1.62, 2.55, 0.45], [0.5 * k, 0.16, 0.52 * k], JOINT, { bone })
      .glow([side * 1.95, 2.55, 0.4], 0.3, HOT, { bone: 'seal', alpha: 0.85, minPx: 2.5 })
      .last(1, { bone });
    block(side * 1.65, 1.95, 0.55, 0.7 * k, 1.05, 0.7 * k, bone);
    block(side * 1.68, 1.05, 0.68, 0.92 * k * k, 0.78 * k, 0.92 * k * k, bone);
    for (let i = 0; i < 3; i++) b.shape('block', [side * 1.68 + (i - 1) * 0.26 * k, 0.62, 0.68 + 0.36 * k], [0.22 * k, 0.24 * k, 0.26 * k], SB[(i + 1) % 4]!, { bone, mat: MAT.stone });
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
  // thin hot seams between the stacked blocks, seen from the front too (it reads as one thing, not
  // a pile of crates), without the weak-point glow (those stay at the back and the sides)
  for (const [x, y, z, w] of [
    [0, 2.55, 0.55, 1.5],
    [0, 3.36, 0.72, 1.8],
    [-0.62, 1.08, 0.4, 0.5],
    [0.62, 1.08, 0.4, 0.5],
  ] as const)
    b.solid([x, y, z], [w, 0.035, 0.03], [0.1, 0.03, 0.01], { em: [0.75, 0.26, 0.04] });
  return scaleTemplate({ parts: b.parts, tell: [1, 0.45, 0.1], top: 5.6, shoulder: 4.0 }, 1.22);
}

/**
 * Nebelweber: a tall, thin spindle of a wraith — a long hooded shroud of ink mist with a pale mask,
 * a cold light inside, two long arms that reach forward and spin threads of frost between the
 * hands; frost shards circle it; it hovers and its hem trails.
 */
export function nebelweber(seed: number): BodyTemplate {
  const R = rng(seed + 17);
  const k = 0.94 + R() * 0.14;
  const RIM: V3 = [0.45, 0.7, 1.0];
  const b = new B(seed)
    .spec('shroud', [0, 1.22, 0], [0.74, 2.1, 0.56], RIM, MIST_INK, { fray: 1 })
    .spec('tail', [0, 0.38, -0.34], [0.42, 0.72, 0.78], RIM, MIST_INK, { bone: 'tail', fray: 0.9, sway: [0.08, 2, 0] })
    .shape('mask', [0, 1.98, 0.11], [0.22, 0.3, 0.08], [0.6, 0.66, 0.74], { bone: 'head', mat: MAT.mask, em: [0.4, 0.65, 1] })
    .eyes(2.0, 0.16, 0.042, 0.035, [0.75, 0.93, 1])
    // (round 9: the arms were detached capsules) — wide sleeves grow out of the shroud's shoulders
    // and the arms come out of them, so shroud, sleeve and arm read as one spectral body
    .spec('shroud', [0, 1.78, 0.02], [0.92, 0.42, 0.6], RIM, MIST_INK, { fray: 0.6 })
    .spec('tail', [0.34, 1.62, 0.1], [0.26, 0.5, 0.3], RIM, MIST_INK, { bone: 'armR', fray: 0.9, rz: 0.3, sway: [0.03, 2.4, 1] })
    .spec('tail', [-0.34, 1.62, 0.1], [0.26, 0.5, 0.3], RIM, MIST_INK, { bone: 'armL', fray: 0.9, rz: -0.3, sway: [0.03, 2.2, 2] })
    .spec('limb', [0.33, 1.56, 0.2], [0.1, 0.74, 0.11], RIM, MIST_INK, { bone: 'armR', rx: 0.66, rz: 0.357 })
    .spec('limb', [-0.33, 1.56, 0.2], [0.1, 0.74, 0.11], RIM, MIST_INK, { bone: 'armL', rx: 0.66, rz: -0.357 })
    .shape('crystal', [0.5, 1.22, 0.44], [0.05, 0.16, 0.05], [0.1, 0.14, 0.2], { bone: 'armR', mat: MAT.crystal, em: COLD })
    .shape('crystal', [-0.5, 1.22, 0.44], [0.05, 0.16, 0.05], [0.1, 0.14, 0.2], { bone: 'armL', mat: MAT.crystal, em: COLD })
    .glow([0.5, 1.22, 0.44], 0.1, COLD, { bone: 'armR', minPx: 3 })
    .glow([-0.5, 1.22, 0.44], 0.1, COLD, { bone: 'armL', minPx: 3 })
    // the cold heart: seen through the shroud, a spark at its front
    .glow([0, 1.45, 0.24], 0.12, COLD, { bone: 'core', minPx: 4 })
    .glow([0, 1.45, 0.2], 0.6, [0.3, 0.5, 0.8], { bone: 'core', alpha: 0.3 });
  // threads of frost spun between the hands
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    b.glow([-0.48 + t * 0.96, 1.22 - Math.sin(t * Math.PI) * 0.12, 0.45], 0.025, COLD, { bone: 'armR', minPx: 1.5, alpha: 0.8 });
  }
  for (let i = 0; i < 4; i++) b.shape('crystal', [0.58, 1.35 + i * 0.18, 0], [0.06, 0.18, 0.06], [0.1, 0.14, 0.2], { mat: MAT.crystal, em: COLD, rz: 0.3 }).last(1, { bone: 'orbit', orbit: [2.2 + i * 0.3, i * 1.57] });
  b.blob([0, 0.3, -0.2], [0.3, 0.12, 0.3], 3, 0.42, [0.2, 0.24, 0.32], { style: 1, alpha: 0.3, bone: 'tail' });
  return scaleTemplate({ parts: b.parts, tell: [0.7, 0.9, 1], top: 2.7, shoulder: 1.85, core: { y: 1.45, f: 0.04, rad: 0.17 } }, k);
}

/**
 * Foliant (round 9 rework — "a flat green board on two sticks"): a book golem. A thick bound
 * volume for a torso (spine, boards and a block of yellowed leaves), a smaller book for a head with
 * the eyes in its gap, heavy legs of stacked quires, and the open tome it carries before it as a
 * shield (armL: it swings shut on the Zuklappen, hangs open while the guard is broken). Loose pages
 * fan out from its back like wings and flutter.
 */
export function foliant(seed: number): BodyTemplate {
  const BOARD: V3 = [0.13, 0.2, 0.13];
  const EDGE: V3 = [0.62, 0.5, 0.2];
  const LEAF: V3 = [0.78, 0.72, 0.58];
  const ROLL: V3 = [0.7, 0.64, 0.5];
  const b = new B(seed)
    // the torso: a bound volume standing on its tail, boards front and back, gilt bands on the spine
    .shape('block', [0, 1.1, -0.06], [0.74, 0.9, 0.46], LEAF, { mat: MAT.paper })
    .shape('block', [0, 1.1, 0.19], [0.8, 0.96, 0.06], BOARD, { mat: MAT.smooth })
    .shape('block', [0, 1.1, -0.31], [0.8, 0.96, 0.06], BOARD, { mat: MAT.smooth })
    .shape('block', [-0.4, 1.1, -0.06], [0.08, 0.96, 0.56], [0.1, 0.15, 0.1], { mat: MAT.smooth });
  for (const y of [0.78, 1.1, 1.42]) b.solid([-0.44, y, -0.06], [0.02, 0.05, 0.58], EDGE, { em: [0.12, 0.08, 0.02] });
  // the head: a smaller book lying across the shoulders, the eyes glowing out of its gap
  b.shape('block', [0, 1.73, -0.04], [0.56, 0.18, 0.42], BOARD, { bone: 'head', ry: 0.12, mat: MAT.smooth })
    .shape('block', [0, 1.86, -0.04], [0.52, 0.06, 0.38], LEAF, { bone: 'head', ry: 0.12, mat: MAT.paper })
    .shape('block', [0, 1.93, -0.04], [0.56, 0.08, 0.42], BOARD, { bone: 'head', ry: 0.12, mat: MAT.smooth })
    .eyes(1.86, 0.16, 0.12, 0.07, [1, 0.62, 0.22])
    // legs of stacked quires
    .shape('block', [0.2, 0.34, -0.05], [0.26, 0.68, 0.3], ROLL, { bone: 'legs', mat: MAT.paper })
    .last(1, { gait: [0.66, 0.05, 0, 0.4] })
    .shape('block', [-0.2, 0.34, -0.05], [0.26, 0.68, 0.3], ROLL, { bone: 'legs', mat: MAT.paper })
    .last(1, { gait: [0.66, 0.05, Math.PI, 0.4] })
    // the open tome before it: two boards in a shallow V with the leaves between, a brass edge
    .shape('block', [0.24, 1.15, 0.5], [0.5, 0.95, 0.07], BOARD, { bone: 'armL', mat: MAT.smooth, ry: -0.35 })
    .shape('block', [-0.24, 1.15, 0.5], [0.5, 0.95, 0.07], BOARD, { bone: 'armL', mat: MAT.smooth, ry: 0.35 })
    .shape('block', [0.18, 1.15, 0.45], [0.42, 0.86, 0.08], LEAF, { bone: 'armL', mat: MAT.paper, ry: -0.35 })
    .shape('block', [-0.18, 1.15, 0.45], [0.42, 0.86, 0.08], PAPER, { bone: 'armL', mat: MAT.paper, ry: 0.35 })
    .solid([0, 1.15, 0.43], [0.05, 0.96, 0.06], EDGE, { bone: 'armL', em: [0.12, 0.08, 0.02] })
    .solid([0.45, 1.15, 0.6], [0.04, 0.98, 0.09], EDGE, { bone: 'armL', ry: -0.35, em: [0.12, 0.08, 0.02] })
    .solid([-0.45, 1.15, 0.6], [0.04, 0.98, 0.09], EDGE, { bone: 'armL', ry: 0.35, em: [0.12, 0.08, 0.02] })
    // an ember sigil on the open pages (the guard reads as "up")
    .glow([0, 1.2, 0.52], 0.09, [1, 0.7, 0.3], { bone: 'armL', minPx: 2.5, alpha: 0.75 })
    // page wings fanning from its back
    .shape('wing', [0.34, 1.4, -0.38], [0.62, 0.1, 0.42], PAPER, { mat: MAT.paper, rz: 0.5, hinge: [2, 3.2, 0.25, 0, 0.05, 1.4, -0.36] })
    .shape('wing', [-0.34, 1.4, -0.38], [0.62, 0.1, 0.42], LEAF, { mat: MAT.paper, mx: true, rz: -0.5, hinge: [2, 3.2, -0.25, 0, -0.05, 1.4, -0.36] })
    .shape('page', [0.3, 0.95, -0.4], [0.3, 0.22, 0.05], PAPER, { mat: MAT.paper, rx: 1.4, sway: [0.04, 6, 0] })
    .shape('page', [-0.28, 0.85, -0.38], [0.28, 0.2, 0.05], PAPER, { mat: MAT.paper, rx: 1.6, mx: true, sway: [0.04, 7, 1] });
  return { parts: b.parts, tell: [1, 0.6, 0.2], top: 2.05, shoulder: 1.69 };
}

/**
 * Scherbling (combat variety pass): a hovering knot of mirror shards round a hard white core — the
 * shards turn slowly (orbit), cold-bright on their faces; it throws light back at you.
 */
export function scherbling(seed: number): BodyTemplate {
  const R = rng(seed + 3);
  const GLASS: V3 = [0.12, 0.14, 0.17];
  const b = new B(seed)
    .shape('orb', [0, 0, 0], [0.13, 0.13, 0.13], [1, 1, 1], { bone: 'core', mat: MAT.flame, em: [0.85, 0.92, 1] })
    .glow([0, 0, 0], 0.18, [1, 0.98, 0.92], { bone: 'core', minPx: 5 })
    .glow([0, 0, 0], 0.75, [0.55, 0.65, 0.8], { bone: 'core', alpha: 0.4 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const y = (R() - 0.5) * 0.5;
    b.shape('crystal', [Math.cos(a) * 0.32, y, Math.sin(a) * 0.32], [0.1 + R() * 0.06, 0.3 + R() * 0.22, 0.04], GLASS, { em: [0.45, 0.58, 0.75], rx: R() * 0.6, rz: (R() - 0.5) * 0.8, mat: MAT.crystal }).last(1, { bone: 'orbit', orbit: [0.9 + R() * 0.5, a] });
  }
  for (let i = 0; i < 4; i++) b.glow([0.45, (R() - 0.5) * 0.4, 0], 0.04, [1, 1, 1], { minPx: 2 }).last(1, { bone: 'orbit', orbit: [-1.8 - i * 0.2, i * 1.57] });
  b.eyes(0.08, 0.2, 0.07, 0.05, [0.85, 0.95, 1], 'core');
  return { parts: b.parts, tell: [0.85, 0.95, 1], top: 0.7, shoulder: 0 };
}

/**
 * Rufer (round 9 rework — "a cone on a cloak with two paddle arms"): a gaunt hooded caller of
 * smoke. A tall shroud with a deep hood over a bone mask whose mouth is a wide glowing ring (it
 * swells on the call), long arms out of the sleeves raised to the mouth, ragged sleeves, a
 * smouldering mantle on the shoulders and a trailing hem.
 */
export function rufer(seed: number): BodyTemplate {
  const RIM: V3 = [0.85, 0.38, 0.12];
  const b = new B(seed)
    .spec('shroud', [0, 0.95, 0], [0.62, 1.7, 0.5], RIM, SMOKE_INK, { fray: 1 })
    .spec('tail', [0, 0.3, -0.28], [0.36, 0.55, 0.6], RIM, SMOKE_INK, { bone: 'tail', fray: 0.8, sway: [0.05, 2.6, 0] })
    // the mantle over the shoulders and the deep hood
    .spec('shroud', [0, 1.62, -0.02], [0.78, 0.5, 0.56], RIM, SMOKE_INK, { fray: 0.7 })
    .spec('shroud', [0, 1.98, -0.04], [0.42, 0.56, 0.44], RIM, SMOKE_INK, { bone: 'head', fray: 0.4, rx: 0.18 })
    // the mask inside the hood: a bone face with a wide calling mouth that glows
    .shape('mask', [0, 1.94, 0.13], [0.22, 0.3, 0.07], BONE, { bone: 'head', mat: MAT.mask, em: [0.9, 0.35, 0.08], rx: -0.1 })
    .shape('torus', [0, 1.86, 0.19], [0.085, 0.03, 0.085], [0.1, 0.03, 0.01], { bone: 'head', mat: MAT.smooth, em: [1, 0.4, 0.06], rx: Math.PI / 2 })
    .glow([0, 1.86, 0.21], 0.11, EMBER, { bone: 'head', minPx: 5 })
    .glow([0, 1.86, 0.24], 0.45, [0.6, 0.2, 0.05], { bone: 'head', alpha: 0.45 })
    .eyes(2.0, 0.17, 0.05, 0.028, [1, 0.6, 0.2])
    // long arms out of ragged sleeves, the hands raised towards the mouth
    .spec('tail', [0.36, 1.5, 0.08], [0.2, 0.42, 0.24], RIM, SMOKE_INK, { bone: 'armR', fray: 0.9, rz: -0.35, sway: [0.03, 3, 1] })
    .spec('tail', [-0.36, 1.5, 0.08], [0.2, 0.42, 0.24], RIM, SMOKE_INK, { bone: 'armL', fray: 0.9, rz: 0.35, sway: [0.03, 3.2, 2] })
    .spec('limb', [0.3, 1.66, 0.2], [0.065, 0.5, 0.07], RIM, SMOKE_INK, { bone: 'armR', rx: 0.7, rz: -0.45 })
    .spec('limb', [-0.3, 1.66, 0.2], [0.065, 0.5, 0.07], RIM, SMOKE_INK, { bone: 'armL', rx: 0.7, rz: 0.45 });
  for (const side of [-1, 1]) {
    const bone: Bone = side > 0 ? 'armR' : 'armL';
    for (let i = 0; i < 3; i++) b.shape('spike', [side * (0.2 + i * 0.03), 1.86, 0.36 - i * 0.02], [0.022, 0.13, 0.022], CLAW, { bone, mat: MAT.smooth, em: [0.15, 0.05, 0.01], rx: -1.4, rz: side * (i - 1) * 0.3 });
  }
  b.glow([0, 1.25, 0.2], 0.05, EMBER, { bone: 'core', minPx: 2, alpha: 0.5 })
    .blob([0, 0.2, 0], [0.25, 0.12, 0.25], 3, 0.38, SMOKE, { bone: 'legs', alpha: 0.6 });
  return { parts: b.parts, tell: [1, 0.5, 0.15], top: 2.35, shoulder: 1.5, core: { y: 1.25, f: 0.05, rad: 0.12 } };
}

const MAKERS: Record<string, (seed: number) => BodyTemplate> = { nebelling, irrlicht, streuner, mahnbrief, raffschatten, glutling, grusling, steinfresser, schuldbuch, pikeur, strohmann, steinbrecher, nebelweber, foliant, scherbling, rufer };

/** The body of a kind (size > 1: an elite, bigger). */
export function bodyTemplate(kind: string, seed: number, size = 1): BodyTemplate {
  const t = (MAKERS[kind] ?? nebelling)(Math.floor(seed * 1e6));
  return size !== 1 ? scaleTemplate(t, size) : t;
}
