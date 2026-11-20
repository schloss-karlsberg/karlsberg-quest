/**
 * The Bleiche (docs/IDEAS-ROUND11.md §2; layout and positions in src/systems/bleiche/layout.ts):
 * Liese's laundry green by the Karlsbergbach, summer 1789 only.
 *
 *  - Kit (one merged mesh): forked posts of weathered wood, two hemp drying lines with guy ropes, a
 *    coopered wash tub on a low stand with soapy water and a sheet over its rim, the beating board
 *    leaning into it, the washing bench with a paddle and folded linen, a bucket, stones on the
 *    corners of the linen laid out to bleach, the long-handled sprinkling scoop. The laundry basket
 *    is the CC0 wicker basket (high; procedural on medium / low) with linen heaped in it.
 *  - Linen (one more mesh, its own small shader): sheets folded over the rope, shirts threaded on by
 *    their sleeves, an apron, cloths, linen laid flat on the grass, and Kaspar's dark-blue coat. The
 *    hanging pieces sway in a gentle wind (vertex shader, weighted by how far below the rope a
 *    vertex hangs), part when the player walks into them, and let the sun shine through from behind.
 *    The coat is part of that mesh and can be hidden (`setCoatVisible(false)` once it is taken).
 *
 * Everything is original procedural carpentry and cloth; colours of the kit pieces are a step
 * lighter than their target (the kit linearises twice, docs/ART-DIRECTION.md §19), the linen shader
 * converts once and uses the target colours directly.
 */
import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Matrix4, Mesh, ShaderMaterial, Vector4 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { SURF } from '../../world/surfaces';
import { BLEICHE, COAT, COAT_ITEM, COAT_REACH, type HangItem, ITEMS, LIESE, LIESE_FREE, LINES, PIECES, ROPE, TUB_SPOT, coatWorld, groundLocal, ropeWorld, toWorld } from '../bleiche/layout';
import { type SetBuilder, face } from './builder';
import { type Hex, rng, tint } from './kit';
import type { SetDef } from './sets';

// kit colours (one step lighter than the look: the kit's double linearisation darkens them)
const POST: Hex = 0xb9a385;
const POST_DARK: Hex = 0x9e8a70;
const ROPE_C: Hex = 0xc2b292;
const STAVE: Hex = 0xc09a6c;
const HOOP: Hex = 0x6e6a64;
const SOAPY: Hex = 0xa9bcb8;
const SUDS: Hex = 0xf3f0e8;
const LINEN: Hex = 0xf4f1e8;
const LINEN_RAW: Hex = 0xe3d9c2;
const BENCH: Hex = 0xb59472;
const STONE: Hex = 0xb6ac9e;
const WICKER: Hex = 0xd0ab70;

// ---------------------------------------------------------------------------------------------
// shared state: the coat on the line, the player pushing through the linen
// ---------------------------------------------------------------------------------------------

/** 1 = the coat hangs on the line, 0 = taken (shared by every built linen material). */
const COAT_ON = { value: 1 };
/** The player's feet (xyz) and the radius (w, m) within which the linen gives way. */
const PUSH = { value: new Vector4(0, -1e5, 0, 1.15) };

/** Show or hide Kaspar's coat on the line (persists across rebuilds of the set). */
export function setCoatVisible(visible: boolean): void {
  COAT_ON.value = visible ? 1 : 0;
}

/** Is the coat hanging on the line? */
export function coatVisible(): boolean {
  return COAT_ON.value > 0.5;
}

/** Where the player's feet are (call per update while the set stands; the linen parts around them). */
export function bleichePlayer(x: number, y: number, z: number): void {
  PUSH.value.set(x, y, z, PUSH.value.w);
}

/** The coat's middle in the world (re-export for the story / court systems). */
export { coatWorld };

// ---------------------------------------------------------------------------------------------
// the linen shader
// ---------------------------------------------------------------------------------------------

const LINEN_VERT = /* glsl */ `
attribute vec3 color;
attribute vec4 aCloth; // sway weight (0 at the rope), phase, coat (1), across (m)
uniform float uTime;
uniform float uMotion;
uniform float uCoat;
uniform vec4 uPush;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
varying float vThin;
void main() {
  if (aCloth.z > 0.5 && uCoat < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // taken: outside the clip volume
    return;
  }
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  float s = aCloth.x;
  vec3 nn = n;
  if (s > 0.0) {
    // wind: a slow gust envelope, a wave running along the line, the hem swinging most
    float t = uTime * uMotion;
    float ph = aCloth.y;
    float gust = 0.55 + 0.45 * sin(t * 0.29 + ph * 0.37) * sin(t * 0.13 + 2.1);
    float wave = sin(t * 1.55 + ph + aCloth.w * 1.9 - wp.y * 0.9) * 0.65 + sin(t * 2.6 + ph * 1.7 + aCloth.w * 3.3) * 0.3;
    float a = s * s * uMotion;
    vec3 off = n * a * (wave * 0.075 + gust * 0.085);
    // the linen gives way when the player walks into it (pushed along its normal, away from them)
    vec2 d = wp.xz - uPush.xz;
    float dl = length(d);
    float near = (1.0 - smoothstep(0.25, uPush.w, dl)) * (1.0 - smoothstep(0.9, 1.6, abs(wp.y - uPush.y - 0.9)));
    float side = dot(d, n.xz) >= 0.0 ? 1.0 : -1.0;
    off += n * side * near * (0.12 + 0.6 * min(s, 1.0)) * 0.6;
    wp += off;
    // soft vertical folds turn the normal a little (more towards the hem)
    vec3 along = cross(vec3(0.0, 1.0, 0.0), n);
    nn = normalize(n + along * sin(aCloth.w * 7.0 + ph * 3.0 + t * 0.7 * s) * 0.3 * min(1.0, 0.3 + s * 2.5));
  }
  vWp = wp;
  vN = nn;
  vCol = color;
  vThin = 1.0 - 0.85 * aCloth.z; // wool lets less light through than linen
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const LINEN_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
varying float vThin;
void main() {
  if (uShadowPass > 0.5) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(n, v) < 0.0) n = -n; // the side we look at
  vec3 alb = vCol * (0.9 + 0.12 * kqNoise(vWp.xz * 2.3 + vWp.y * 3.1));
  vec3 col = kqLight(alb, n, vWp, 1.0, 1.0);
  // the sun shining through thin linen from behind (the shadow looked up a little towards the sun,
  // past the cloth's own back fold: only other things shade it)
  float back = clamp(-dot(n, uSunDir), 0.0, 1.0);
  if (back > 0.0) col += alb * uSunColor * back * vThin * 0.45 * kqShadow(vWp + uSunDir * 0.35, uSunDir);
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

function linenMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: LINEN_VERT,
    fragmentShader: LINEN_FRAG,
    uniforms: { ...atmosphere, uMotion: { value: 1 }, uCoat: COAT_ON, uPush: PUSH },
    side: DoubleSide,
  });
}

// ---------------------------------------------------------------------------------------------
// linen geometry
// ---------------------------------------------------------------------------------------------

interface ClothBuf {
  pos: number[];
  nor: number[];
  col: number[];
  cloth: number[];
  idx: number[];
}

const _c = new Color();

/** One column of a hanging panel: rope u, drop of its top and of its hem below the rope, and how far its hem spreads along u. */
interface Col {
  u: number;
  top: number;
  bottom: number;
  spread?: number;
}

interface PanelOpts {
  line: number;
  /** Offset along the span normal at the top / the hem (m; + front, − back). */
  gap0: number;
  gap1: number;
  color: number;
  rows: number;
  /** Sway scale (stiff wool < 1). */
  stiff: number;
  phase: number;
  coat: boolean;
}

/** A panel hanging from a line: rows × columns, positions in the world. */
function panel(b: SetBuilder, buf: ClothBuf, cols: readonly Col[], o: PanelOpts): void {
  const base = buf.pos.length / 3;
  _c.setHex(o.color).convertSRGBToLinear();
  for (const c of cols) {
    for (let j = 0; j <= o.rows; j++) {
      const f = j / o.rows;
      const u = c.u + (c.spread ?? 0) * f;
      const r = ropeWorld(b.heightAt, o.line, Math.max(-50, u)) ?? ropeWorld(b.heightAt, o.line, c.u)!;
      const drop = c.top + (c.bottom - c.top) * f;
      const gap = o.gap0 + (o.gap1 - o.gap0) * f;
      buf.pos.push(r.x + r.nx * gap, r.y - drop, r.z + r.nz * gap);
      // every layer carries the span's normal: the wind moves front and back folds together
      buf.nor.push(r.nx, 0, r.nz);
      buf.col.push(_c.r, _c.g, _c.b);
      // sway weight: how far below the rope (a 1.3 m sheet's hem = 1), scaled by stiffness
      buf.cloth.push(Math.min(1.25, (drop / 1.3) * o.stiff), o.phase, o.coat ? 1 : 0, u);
    }
  }
  const ny = o.rows + 1;
  for (let i = 0; i + 1 < cols.length; i++)
    for (let j = 0; j < o.rows; j++) {
      const a = base + i * ny + j;
      const c = a + ny;
      buf.idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
}

/** Evenly spaced columns from u0 to u1 with a (slightly ragged) hem drop. */
function cols(u0: number, u1: number, top: number, bottom: number, step: number, seed: number, ragged = 0.03): Col[] {
  const n = Math.max(2, Math.ceil((u1 - u0) / step));
  const r = rng(seed);
  const out: Col[] = [];
  for (let i = 0; i <= n; i++) out.push({ u: u0 + ((u1 - u0) * i) / n, top, bottom: bottom + (i > 0 && i < n ? (r() - 0.5) * 2 * ragged : 0) });
  return out;
}

/** A sheet / cloth folded over the rope: a longer front fold and a shorter back fold. */
function folded(b: SetBuilder, buf: ClothBuf, it: HangItem, phase: number, seed: number): void {
  const u0 = it.u0;
  const u1 = it.u0 + it.width;
  const step = it.width > 1 ? 0.3 : 0.18;
  const rows = it.drop > 1 ? 5 : 3;
  const front = it.line === 0 ? 1 : -1; // the longer fold faces out of the green
  panel(b, buf, cols(u0, u1, 0, it.drop, step, seed), { line: it.line, gap0: 0.014 * front, gap1: 0.05 * front, color: it.color, rows, stiff: 1, phase, coat: false });
  panel(b, buf, cols(u0 + 0.02, u1 - 0.02, 0, it.drop * 0.68, step, seed + 1), { line: it.line, gap0: -0.014 * front, gap1: -0.04 * front, color: it.color, rows, stiff: 1, phase, coat: false });
}

/** Columns of a garment threaded on by its sleeves: sleeves along the rope, the body hanging in the middle. */
function garment(it: HangItem, body: number, sleeve: number, flare: number, cuff: number): { left: Col[]; body: Col[]; right: Col[] } {
  const c = it.u0 + it.width / 2;
  const half = body / 2;
  const left: Col[] = [];
  const right: Col[] = [];
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // from the cuff (outer end) to the shoulder, the sleeve a little deeper at the shoulder
    left.push({ u: it.u0 + cuff + (c - half - it.u0 - cuff) * t, top: 0, bottom: sleeve * (0.82 + 0.18 * t) });
    right.push({ u: c + half + (it.u0 + it.width - cuff - c - half) * (1 - t), top: 0, bottom: sleeve * (0.82 + 0.18 * (1 - t)) });
  }
  right.reverse();
  const bodyCols: Col[] = [];
  const nb = 4;
  for (let i = 0; i <= nb; i++) {
    const t = i / nb;
    const x = -half + body * t;
    bodyCols.push({ u: c + x, top: 0, bottom: it.drop, spread: (x / half) * flare });
  }
  return { left, body: bodyCols, right };
}

/** A shirt threaded on by its sleeves (front and back). */
function shirt(b: SetBuilder, buf: ClothBuf, it: HangItem, phase: number): void {
  const g = garment(it, 0.5, 0.2, 0.04, 0);
  for (const s of [1, -1]) {
    const o = { line: it.line, gap0: 0.012 * s, gap1: 0.03 * s, color: it.color, rows: 3, stiff: 0.9, phase, coat: false };
    panel(b, buf, g.left, { ...o, rows: 1 });
    panel(b, buf, g.body, o);
    panel(b, buf, g.right, { ...o, rows: 1 });
  }
}

/** An apron folded over its waistband, its two ties hanging down. */
function apron(b: SetBuilder, buf: ClothBuf, it: HangItem, phase: number, seed: number): void {
  const u0 = it.u0 + 0.06;
  const u1 = it.u0 + it.width - 0.06;
  panel(b, buf, cols(u0, u1, 0, it.drop, 0.2, seed, 0.015), { line: it.line, gap0: 0.012, gap1: 0.04, color: it.color, rows: 3, stiff: 1, phase, coat: false });
  panel(b, buf, cols(u0, u1, 0, 0.09, 0.2, seed + 1, 0), { line: it.line, gap0: -0.012, gap1: -0.016, color: it.color, rows: 1, stiff: 1, phase, coat: false });
  for (const u of [it.u0, it.u0 + it.width - 0.035])
    panel(b, buf, [{ u, top: 0, bottom: 0.48 }, { u: u + 0.035, top: 0, bottom: 0.46 }], { line: it.line, gap0: 0.01, gap1: 0.02, color: it.color, rows: 3, stiff: 1.2, phase: phase + 0.7, coat: false });
}

const COAT_CUFF = 0x3b5290;
const BRASS = 0xc9a240;
const LINING = 0xd9cfb4;

/** Kaspar's coat threaded on by its sleeves: flared skirts open at the front, cuffs, collar, brass buttons. */
function coat(b: SetBuilder, buf: ClothBuf, it: HangItem, phase: number): void {
  const L = it.line;
  const cuff = 0.13;
  const g = garment(it, 0.52, 0.23, 0.15, cuff);
  const c = it.u0 + it.width / 2;
  const base = { line: L, rows: 4, stiff: 0.55, phase, coat: true };
  // the back panel and both sleeves (front and back layers)
  panel(b, buf, g.body, { ...base, gap0: -0.016, gap1: -0.035, color: it.color });
  for (const s of [1, -1]) {
    panel(b, buf, g.left, { ...base, rows: 1, gap0: 0.016 * s, gap1: 0.03 * s, color: it.color });
    panel(b, buf, g.right, { ...base, rows: 1, gap0: 0.016 * s, gap1: 0.03 * s, color: it.color });
  }
  // turned-back cuffs at the sleeve ends, a shade lighter
  for (const [u0, u1] of [
    [it.u0, it.u0 + cuff],
    [it.u0 + it.width - cuff, it.u0 + it.width],
  ] as const) {
    for (const s of [1, -1]) panel(b, buf, [{ u: u0, top: 0, bottom: 0.24 }, { u: u1, top: 0, bottom: 0.25 }], { ...base, rows: 1, gap0: 0.026 * s, gap1: 0.04 * s, color: COAT_CUFF });
  }
  // the two fronts: their inner edges part below the waist (the skirts open), the lining shows there
  const half = 0.26;
  const fl = 0.15;
  for (const s of [-1, 1]) {
    const outer = c + s * half;
    const inner = c + s * 0.012;
    const front: Col[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const u = inner + (outer - inner) * t;
      const x = u - c;
      front.push({ u, top: 0, bottom: it.drop, spread: (x / half) * fl + s * (1 - t) * 0.1 });
    }
    if (s < 0) front.reverse();
    panel(b, buf, front, { ...base, gap0: 0.02, gap1: 0.045, color: it.color });
    // a strip of cream lining along the opening, lower half
    panel(b, buf, [{ u: inner, top: it.drop * 0.5, bottom: it.drop, spread: s * 0.1 }, { u: inner + s * 0.035, top: it.drop * 0.5, bottom: it.drop, spread: s * 0.105 }].sort((p, q) => p.u - q.u), { ...base, rows: 2, gap0: 0.04, gap1: 0.056, color: LINING });
    // pocket flap
    const pu = c + s * 0.16;
    panel(b, buf, [{ u: pu - 0.08, top: 0.55, bottom: 0.62, spread: s * 0.02 }, { u: pu + 0.08, top: 0.55, bottom: 0.62, spread: s * 0.03 }], { ...base, rows: 1, gap0: 0.046, gap1: 0.049, color: COAT_CUFF });
  }
  // the collar
  panel(b, buf, [{ u: c - 0.15, top: 0, bottom: 0.075 }, { u: c, top: 0, bottom: 0.09 }, { u: c + 0.15, top: 0, bottom: 0.075 }], { ...base, rows: 1, gap0: 0.03, gap1: 0.034, color: COAT_CUFF });
  // brass buttons down the left front's edge and on the cuffs
  const btn = (u: number, d: number, gap: number) => panel(b, buf, [{ u: u - 0.016, top: d - 0.016, bottom: d + 0.016 }, { u: u + 0.016, top: d - 0.016, bottom: d + 0.016 }], { ...base, rows: 1, gap0: gap, gap1: gap + 0.001, color: BRASS });
  for (let i = 0; i < 6; i++) {
    const d = 0.13 + i * 0.075;
    btn(c - 0.045 - Math.max(0, d - 0.5) * 0.2, d, 0.031 + d * 0.025);
  }
  for (const u of [it.u0 + 0.065, it.u0 + it.width - 0.065]) btn(u, 0.12, 0.043);
}

/** Linen laid flat on the grass, draped on the ground (static). */
function flatSheet(b: SetBuilder, buf: ClothBuf, f: (typeof PIECES.flat)[number], color: number): void {
  const base = buf.pos.length / 3;
  _c.setHex(color).convertSRGBToLinear();
  const nx = 6;
  const nz = 4;
  const a = (f.yaw * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const lu = (i / nx - 0.5) * f.lu;
      const lw = (j / nz - 0.5) * f.lw;
      const u = f.u + lu * ca - lw * sa;
      const w = f.w + lu * sa + lw * ca;
      const [x, z] = toWorld(u, w);
      buf.pos.push(x, b.heightAt(x, z) + 0.04 + 0.012 * Math.sin(i * 1.7 + j * 2.3), z);
      buf.nor.push(0, 1, 0);
      buf.col.push(_c.r, _c.g, _c.b);
      buf.cloth.push(0, 0, 0, 0);
    }
  const ny = nz + 1;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const p = base + i * ny + j;
      const q = p + ny;
      buf.idx.push(p, p + 1, q, q, p + 1, q + 1);
    }
}

function linenMesh(b: SetBuilder): Mesh {
  const buf: ClothBuf = { pos: [], nor: [], col: [], cloth: [], idx: [] };
  ITEMS.forEach((it, i) => {
    const phase = i * 1.37;
    if (it.kind === 'sheet' || it.kind === 'cloth') folded(b, buf, it, phase, 300 + i);
    else if (it.kind === 'shirt') shirt(b, buf, it, phase);
    else if (it.kind === 'apron') apron(b, buf, it, phase, 300 + i);
    else coat(b, buf, it, phase);
  });
  // bleaching linen: a cool white against the warm light (the old washers blued it too)
  const colors = [0xf2f3f1, 0xe6e4dc, 0xf4f4f0, 0xeae8e0];
  PIECES.flat.forEach((f, i) => flatSheet(b, buf, f, colors[i % colors.length]!));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(buf.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(buf.nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(buf.col), 3));
  g.setAttribute('aCloth', new BufferAttribute(new Float32Array(buf.cloth), 4));
  g.setIndex(buf.idx);
  g.computeBoundingSphere();
  // the sway and the push move vertices up to ~0.8 m: keep the culling sphere generous
  if (g.boundingSphere) g.boundingSphere.radius += 1;
  const mesh = new Mesh(g, linenMaterial());
  mesh.name = 'scenery-bleiche-linen';
  mesh.userData.measurable = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// the kit: posts, ropes, tub, bench, board, bucket, basket, stones, scoop
// ---------------------------------------------------------------------------------------------

const gl = (b: SetBuilder, u: number, w: number) => groundLocal(b.heightAt, u, w);

/** Lowest ground around local u/w (spread m), for things that stand on several feet. */
function lowGround(b: SetBuilder, u: number, w: number, spread: number): number {
  let y = Infinity;
  for (const [du, dw] of [[0, 0], [spread, 0], [-spread, 0], [0, spread], [0, -spread]] as const) y = Math.min(y, gl(b, u + du, w + dw));
  return y;
}

/** Back to the green's frame (prop space x = u, z = w, y absolute). */
function frame(b: SetBuilder): void {
  b.kit.place(BLEICHE.x, 0, BLEICHE.z, face(BLEICHE.facing));
}

function postsAndRopes(b: SetBuilder): void {
  const k = b.kit;
  const r = rng(1789);
  LINES.forEach((line, li) => {
    const posts = line.posts;
    posts.forEach(([u, w], pi) => {
      const g0 = gl(b, u, w);
      const top = g0 + ROPE.top;
      k.surface = SURF.PLANKS;
      const lean = (r() - 0.5) * 0.06;
      k.pole(u, g0 - 0.3, w, u + lean, top + 0.02, w + (r() - 0.5) * 0.04, 0.055, tint(POST, r, 0.08), 7);
      // the fork the rope rests in
      for (const s of [-1, 1]) k.pole(u + lean, top - 0.1, w, u + lean + s * 0.07, top + 0.12, w, 0.024, tint(POST_DARK, r, 0.08), 5);
      b.circle(...toWorld(u, w), 0.12);
      // guy ropes at the end posts, out along the line to a peg
      const end = pi === 0 ? -1 : pi === posts.length - 1 ? 1 : 0;
      if (end) {
        const [nu, nw] = posts[pi - end]!;
        const du = u - nu;
        const dw = w - nw;
        const l = Math.hypot(du, dw);
        const pu = u + (du / l) * 1.25;
        const pw = w + (dw / l) * 1.25;
        const pg = gl(b, pu, pw);
        k.surface = SURF.NONE;
        k.pole(u + lean, top - 0.02, w, pu, pg + 0.12, pw, 0.009, ROPE_C, 4);
        k.surface = SURF.PLANKS;
        k.box(0.05, 0.22, 0.05, pu, pg - 0.08, pw, POST_DARK, [(dw / l) * 0.3, 0, (-du / l) * 0.3]);
      }
    });
    // the rope, span by span, with its sag
    k.surface = SURF.NONE;
    for (let i = 0; i + 1 < posts.length; i++) {
      const [u0] = posts[i]!;
      const [u1] = posts[i + 1]!;
      const n = 8;
      let prev: [number, number, number] | null = null;
      for (let s = 0; s <= n; s++) {
        const u = u0 + ((u1 - u0) * s) / n;
        const rw = ropeWorld(b.heightAt, li, Math.min(u1 - 1e-4, Math.max(u0 + 1e-4, u)))!;
        // back into prop space: the kit's frame is the green's (x = u, z = w)
        const p: [number, number, number] = [u, rw.y + 0.012, ropeLocalW(li, u)];
        if (prev) k.pole(prev[0], prev[1], prev[2], p[0], p[1], p[2], 0.011, ROPE_C, 4);
        prev = p;
      }
    }
  });
  k.surface = null;
}

/** Local w of a line's rope at u (linear between posts). */
function ropeLocalW(line: number, u: number): number {
  const posts = LINES[line]!.posts;
  for (let i = 0; i + 1 < posts.length; i++) {
    const [u0, w0] = posts[i]!;
    const [u1, w1] = posts[i + 1]!;
    if (u >= u0 - 1e-6 && u <= u1 + 1e-6) return w0 + ((w1 - w0) * (u - u0)) / (u1 - u0);
  }
  return posts[posts.length - 1]![1];
}

/** An open cylinder (a tub's or bucket's wall). */
function openCyl(rt: number, rb: number, h: number, seg: number): CylinderGeometry {
  const g = new CylinderGeometry(rt, rb, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

function washCorner(b: SetBuilder): void {
  const k = b.kit;
  const r = rng(1004);
  const T = PIECES.tub;
  // the stand: two squared beams on the ground
  const g0 = lowGround(b, T.u, T.w, T.r);
  k.surface = SURF.PLANKS;
  for (const s of [-1, 1]) k.box(1.05, 0.12, 0.13, T.u, g0 - 0.03, T.w + s * 0.24, tint(POST_DARK, r, 0.06));
  // the tub: staves in a ring (flaring out a little), two iron hoops, two taller handle staves
  const y0 = g0 + 0.09;
  const h = T.h - 0.09;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ear = i === 0 || i === n / 2;
    const hh = ear ? h + 0.13 : h;
    k.push(T.u + Math.cos(a) * (T.r - 0.04), y0, T.w + Math.sin(a) * (T.r - 0.04), 0, -a + Math.PI / 2, 0);
    k.box(((2 * Math.PI * T.r) / n) * 1.04, hh, 0.035, 0, 0, 0, tint(STAVE, r, 0.07), [0.08, 0, 0]);
    if (ear) k.box(0.07, 0.05, 0.05, 0, hh - 0.09, 0.01, 0x2a2420);
    k.pop();
  }
  k.add(new CylinderGeometry(T.r - 0.07, T.r - 0.07, 0.03, 18), STAVE, 0, translate(T.u, y0 + 0.015, T.w));
  k.surface = SURF.IRON;
  for (const yy of [0.1, h - 0.12]) k.add(openCyl(T.r - 0.012 + (yy + 0.035) * 0.08, T.r - 0.012 + yy * 0.08, 0.035, 20), HOOP, 0, translate(T.u, y0 + yy, T.w));
  // soapy water, suds, a sheet over the rim hanging into it
  k.surface = SURF.NONE;
  k.add(new CylinderGeometry(T.r - 0.02, T.r - 0.02, 0.01, 20), SOAPY, 0, translate(T.u, y0 + h - 0.12, T.w));
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * (T.r - 0.12);
    k.rock(0.05 + r() * 0.05, T.u + Math.cos(a) * rr, y0 + h - 0.13, T.w + Math.sin(a) * rr, SUDS, 40 + i, 0.25);
  }
  k.surface = SURF.FABRIC;
  k.push(T.u, y0 + h, T.w, 0, 0.6, 0);
  k.box(0.42, 0.012, 0.16, 0, 0.0, -T.r + 0.06, LINEN, [0.12, 0, 0]);
  k.box(0.4, 0.3, 0.012, 0, -0.29, -T.r - 0.02, LINEN, [-0.05, 0, 0]);
  k.box(0.38, 0.012, 0.3, 0.02, -0.11, -T.r + 0.22, LINEN, [0.25, 0, 0.05]);
  k.pop();
  b.circle(...toWorld(T.u, T.w), T.r + 0.08);

  // the beating board leaning into the tub: a ribbed plank on the ground at the brook side
  const B = PIECES.board;
  const bg = gl(b, B.u, B.w);
  const du = T.u - B.u;
  const dw = T.w - B.w;
  const yaw = Math.atan2(du, dw);
  k.surface = SURF.PLANKS;
  k.push(B.u, bg - 0.02, B.w, -0.95, yaw, 0);
  k.box(0.34, 0.035, 0.95, 0, 0, 0.47, tint(BENCH, r, 0.05));
  for (let i = 0; i < 8; i++) k.box(0.3, 0.018, 0.025, 0, 0.03, 0.18 + i * 0.075, tint(POST_DARK, r, 0.05));
  k.pop();

  // the washing bench with a paddle and folded linen
  const Bn = PIECES.bench;
  const bnG = lowGround(b, Bn.u, Bn.w, 0.9);
  const seat = bnG + Bn.h;
  k.surface = SURF.PLANKS;
  k.box(0.34, 0.07, Bn.len, Bn.u, seat, Bn.w, tint(BENCH, r, 0.05));
  for (const s of [-1, 1])
    for (const t of [-1, 1]) k.pole(Bn.u + t * 0.11, seat, Bn.w + s * (Bn.len / 2 - 0.18), Bn.u + t * 0.17, bnG - 0.05, Bn.w + s * (Bn.len / 2 - 0.08), 0.03, tint(POST_DARK, r, 0.06), 6);
  // the paddle (Wäschebleuel): flat blade and a round grip
  k.push(Bn.u + 0.02, seat + 0.07, Bn.w + 0.45, 0, 0.25, 0);
  k.box(0.12, 0.03, 0.34, 0, 0, 0, tint(STAVE, r, 0.05));
  k.cyl(0.018, 0.022, 0.24, 0, 0.015, -0.17, tint(STAVE, r, 0.05), [-Math.PI / 2, 0, 0], 6);
  k.pop();
  k.surface = SURF.FABRIC;
  for (let i = 0; i < 3; i++) k.box(0.3, 0.07, 0.36, Bn.u + (r() - 0.5) * 0.03, seat + 0.07 + i * 0.07, Bn.w - 0.4 + (r() - 0.5) * 0.03, i === 1 ? LINEN_RAW : LINEN, [0, (r() - 0.5) * 0.2, 0]);
  b.box(...toWorld(Bn.u, Bn.w), BLEICHE.facing, 0.2, Bn.len / 2);

  // the bucket: coopered, two hoops, a rope handle, water inside
  const Bk = PIECES.bucket;
  const bkG = gl(b, Bk.u, Bk.w) - 0.02;
  k.surface = SURF.PLANKS;
  k.add(openCyl(0.18, 0.15, 0.34, 12), STAVE, 0, translate(Bk.u, bkG, Bk.w));
  k.add(new CylinderGeometry(0.15, 0.15, 0.02, 12), STAVE, 0, translate(Bk.u, bkG + 0.01, Bk.w));
  k.surface = SURF.IRON;
  for (const yy of [0.06, 0.27]) k.add(openCyl(0.185 - (0.27 - yy) * 0.08, 0.183 - (0.27 - yy) * 0.08, 0.03, 12), HOOP, 0, translate(Bk.u, bkG + yy, Bk.w));
  k.surface = SURF.NONE;
  k.add(new CylinderGeometry(0.165, 0.165, 0.01, 12), SOAPY, 0, translate(Bk.u, bkG + 0.27, Bk.w));
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI;
    const a1 = ((i + 1) / 6) * Math.PI;
    k.pole(Bk.u + Math.cos(a0) * 0.18, bkG + 0.34 + Math.sin(a0) * 0.16, Bk.w, Bk.u + Math.cos(a1) * 0.18, bkG + 0.34 + Math.sin(a1) * 0.16, Bk.w, 0.008, ROPE_C, 4);
  }
  b.circle(...toWorld(Bk.u, Bk.w), 0.2);
  k.surface = null;
}

function basket(b: SetBuilder): void {
  const k = b.kit;
  const P = PIECES.basket;
  const [x, z] = toWorld(P.u, P.w);
  const y = lowGround(b, P.u, P.w, 0.3) - 0.01;
  k.place(x, y, z, face(BLEICHE.facing + 20));
  // the Poly Haven basket is ~16.6k triangles (four times the rest of the green): high tier only
  b.model(
    'architecture.basket',
    () => {
      // low / medium tier: an oval wicker basket of rings
      k.surface = SURF.STRAW;
      const g = openCyl(0.36, 0.3, 0.24, 14);
      g.scale(1, 1, 0.78);
      k.add(g, WICKER);
      const bottom = new CylinderGeometry(0.3, 0.3, 0.02, 14);
      bottom.scale(1, 1, 0.78);
      k.add(bottom, WICKER, 0, translate(0, 0.01, 0));
      const rim = openCyl(0.375, 0.375, 0.035, 14);
      rim.scale(1, 1, 0.78);
      k.add(rim, tint(WICKER, rng(5), 0.1), 0, translate(0, 0.23, 0));
    },
    { scale: 1.9, high: true },
  );
  // linen heaped in it
  k.surface = SURF.FABRIC;
  k.rock(0.27, -0.05, 0.08, 0.0, LINEN, 61, 0.42);
  k.rock(0.2, 0.12, 0.13, 0.05, LINEN_RAW, 62, 0.4);
  k.rock(0.17, -0.14, 0.12, -0.06, LINEN, 63, 0.38);
  k.surface = null;
  b.circle(x, z, 0.38);
  frame(b);
}

function stonesAndScoop(b: SetBuilder): void {
  const k = b.kit;
  const r = rng(2025);
  k.surface = SURF.RUBBLE;
  // a stone on each corner of the linen laid out to bleach
  for (const f of PIECES.flat) {
    const a = (f.yaw * Math.PI) / 180;
    for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const lu = su * (f.lu / 2 - 0.05);
      const lw = sw * (f.lw / 2 - 0.05);
      const u = f.u + lu * Math.cos(a) - lw * Math.sin(a);
      const w = f.w + lu * Math.sin(a) + lw * Math.cos(a);
      k.rock(0.07 + r() * 0.04, u, gl(b, u, w) + 0.0, w, tint(STONE, r, 0.1), 700 + Math.round(u * 10 + w * 100), 0.6);
    }
  }
  // the sprinkling scoop lying in the grass: a long handle and a small wooden trough
  const S = PIECES.scoop;
  const sg = gl(b, S.u, S.w);
  k.surface = SURF.PLANKS;
  k.push(S.u, sg + 0.03, S.w, 0, 0.9, 0);
  k.pole(0, 0.0, -0.9, 0, 0.04, 0.55, 0.02, tint(POST, r, 0.06), 6);
  k.box(0.16, 0.012, 0.24, 0, 0.0, 0.66, STAVE);
  for (const s of [-1, 1]) k.box(0.012, 0.07, 0.24, s * 0.08, 0.0, 0.66, STAVE);
  k.box(0.16, 0.07, 0.012, 0, 0.0, 0.78, STAVE);
  k.pop();
  k.surface = null;
}

function translate(x: number, y: number, z: number): Matrix4 {
  return new Matrix4().makeTranslation(x, y, z);
}

/** The set's build: posts and ropes, the wash corner, basket, stones, the linen. */
export function buildBleiche(b: SetBuilder): void {
  frame(b);
  postsAndRopes(b);
  frame(b);
  washCorner(b);
  frame(b);
  basket(b);
  stonesAndScoop(b);
  b.extras.push(linenMesh(b));
}

/** The set: 1789 only (the green is gone in the later eras). */
export const bleicheSet: SetDef = {
  id: 'bleiche',
  eras: ['1789'],
  x: BLEICHE.x,
  z: BLEICHE.z,
  range: 170,
  keepFree: [
    [LIESE.x, LIESE.z, LIESE_FREE],
    [TUB_SPOT.x, TUB_SPOT.z, 0.3],
    [COAT_REACH.x, COAT_REACH.z, 0.4],
  ],
  build(b) {
    buildBleiche(b);
  },
};

export { COAT, COAT_ITEM };
