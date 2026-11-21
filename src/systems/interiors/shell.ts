/**
 * The palace model (world/palace.ts) as the interiors' shell:
 * - `extractOpenings` finds the windows (near-black glass panes) and door leaves (dark brown) of
 *   the detailed buildings in the merged palace geometry, so the interior walls get their window
 *   holes exactly where the facade has them.
 * - `ShellCut` patches the palace shader at runtime (world/palace.ts stays untouched, like the fx
 *   fire glow): for buildings whose interior is built, the glass of the walkable storeys is cut
 *   away (real see-through windows), door boxes are cut through the wall, and in the ruin era the
 *   whole shell dissolves in favour of the interior's own broken walls.
 */
import { type BufferGeometry, type Mesh, type ShaderMaterial, Vector2, Vector4 } from 'three';
import type { ShellOpening } from './types';

export const MAX_OPEN = 8;
export const MAX_CUTS = 24;
/** Room boxes of built interiors: any other palace geometry poking into them is clipped. */
export const MAX_CLIPS = 48;

const isGlass = (r: number, g: number, b: number) => Math.max(r, g, b) < 0.06;

/**
 * Door leaves: dark brown to red-brown paint (linear vertex colour). Matched by hue and luminance,
 * not one exact colour: the research-wave model shades its leaves 0.12–0.20 red (0.145 before) and
 * gives some a darker underside. The luminance cap (≈ 0.095) keeps the red sandstone plinth
 * (≥ 0.10) and the tiles out; small sills of the same hue are dropped by the opening size check.
 */
export function isDoor(r: number, g: number, b: number): boolean {
  if (r < 0.09 || r < g * 1.8 || g < b || r < b * 3) return false;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.05 && lum < 0.095;
}

interface Tri {
  bld: number;
  kind: 'window' | 'door';
  /** Horizontal unit normal of the pane plane (xz). */
  nx: number;
  nz: number;
  off: number;
  /** Triangle area (m²). */
  area: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/**
 * A door leaf is a slab: its front, back and edge faces have different normals. Measure it on its
 * broadest plane only (front + back), so the edges' offsets do not pull the opening off the facade.
 */
function broadestPlane(tris: readonly Tri[], g: readonly number[]): number[] {
  const area = new Map<string, number>();
  const members = new Map<string, number[]>();
  for (const i of g) {
    const t = tris[i]!;
    const key = `${Math.round(t.nx * 20)}|${Math.round(t.nz * 20)}`;
    area.set(key, (area.get(key) ?? 0) + t.area);
    let l = members.get(key);
    if (!l) members.set(key, (l = []));
    l.push(i);
  }
  let best = '';
  for (const [k, a] of area) if (!best || a > area.get(best)!) best = k;
  return members.get(best) ?? [];
}

/** Door leaves need a front and a back (≥ 4 triangles on their plane); a lone painted reveal is no door. */
const MIN_DOOR_TRIS = 4;

/** Windows and doors of the given buildings (by palace building index) found in the merged model. */
export function extractOpenings(geo: BufferGeometry, buildings: ReadonlyMap<number, string>): ShellOpening[] {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const bld = geo.getAttribute('aBld');
  if (!pos || !col || !bld) return [];
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const tris: Tri[] = [];
  const vi = [0, 0, 0];
  for (let t = 0; t < n; t += 3) {
    for (let k = 0; k < 3; k++) vi[k] = idx ? idx.getX(t + k) : t + k;
    const b = Math.round(bld.getX(vi[0]!));
    if (!buildings.has(b)) continue;
    const r = col.getX(vi[0]!);
    const g = col.getY(vi[0]!);
    const bl = col.getZ(vi[0]!);
    const kind = isGlass(r, g, bl) ? 'window' : isDoor(r, g, bl) ? 'door' : null;
    if (!kind) continue;
    const ax = pos.getX(vi[0]!);
    const ay = pos.getY(vi[0]!);
    const az = pos.getZ(vi[0]!);
    const bx = pos.getX(vi[1]!);
    const by = pos.getY(vi[1]!);
    const bz = pos.getZ(vi[1]!);
    const cx = pos.getX(vi[2]!);
    const cy = pos.getY(vi[2]!);
    const cz = pos.getZ(vi[2]!);
    // plane normal; keep vertical panes only
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;
    let nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) continue;
    if (Math.abs(ny / nl) > 0.2) continue;
    const hl = Math.hypot(nx, nz);
    nx /= hl;
    nz /= hl;
    // canonical orientation
    if (nx < -1e-6 || (Math.abs(nx) <= 1e-6 && nz < 0)) {
      nx = -nx;
      nz = -nz;
    }
    tris.push({
      bld: b,
      kind,
      nx,
      nz,
      off: ax * nx + az * nz,
      area: nl / 2,
      x0: Math.min(ax, bx, cx),
      y0: Math.min(ay, by, cy),
      z0: Math.min(az, bz, cz),
      x1: Math.max(ax, bx, cx),
      y1: Math.max(ay, by, cy),
      z1: Math.max(az, bz, cz),
    });
  }
  // cluster: same building/kind, (windows: same plane), touching boxes
  const parent = tris.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const tol = 0.04;
  const byKey = new Map<string, number[]>();
  tris.forEach((t, i) => {
    // windows: one pane plane; door leaves: one facing (front and back of the slab, 0.5 m bins),
    // so a leaf never chains into painted reveals, sills or plinth bands of the same hue
    const key = t.kind === 'window' ? `${t.bld}|w|${Math.round(t.nx * 20)}|${Math.round(t.nz * 20)}|${Math.round(t.off * 20)}` : `${t.bld}|d|${Math.round(t.nx * 10)}|${Math.round(t.nz * 10)}|${Math.round(t.off * 2)}`;
    let l = byKey.get(key);
    if (!l) byKey.set(key, (l = []));
    l.push(i);
  });
  for (const list of byKey.values()) {
    list.sort((a, b) => tris[a]!.x0 - tris[b]!.x0);
    for (let i = 0; i < list.length; i++) {
      const a = tris[list[i]!]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = tris[list[j]!]!;
        if (b.x0 > a.x1 + tol) break;
        if (b.z0 > a.z1 + tol || a.z0 > b.z1 + tol || b.y0 > a.y1 + tol || a.y0 > b.y1 + tol) continue;
        parent[find(list[i]!)] = find(list[j]!);
      }
    }
  }
  const groups = new Map<number, number[]>();
  tris.forEach((_, i) => {
    const r = find(i);
    let l = groups.get(r);
    if (!l) groups.set(r, (l = []));
    l.push(i);
  });
  const out: ShellOpening[] = [];
  for (const all of groups.values()) {
    const g = tris[all[0]!]!.kind === 'door' ? broadestPlane(tris, all) : all;
    if (tris[all[0]!]!.kind === 'door' && g.length < MIN_DOOR_TRIS) continue;
    const t0 = tris[g[0]!]!;
    // tangent along the facade (horizontal, perpendicular to the normal)
    const tx = -t0.nz;
    const tz = t0.nx;
    let s0 = Infinity;
    let s1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let off = 0;
    for (const i of g) {
      const t = tris[i]!;
      for (const [x, z] of [
        [t.x0, t.z0],
        [t.x1, t.z1],
        [t.x0, t.z1],
        [t.x1, t.z0],
      ] as const) {
        // only corners on the plane count (boxes of slanted panes would overshoot)
        if (Math.abs(x * t0.nx + z * t0.nz - t.off) > 0.25) continue;
        const s = x * tx + z * tz;
        s0 = Math.min(s0, s);
        s1 = Math.max(s1, s);
      }
      y0 = Math.min(y0, t.y0);
      y1 = Math.max(y1, t.y1);
      off += t.off;
    }
    off /= g.length;
    if (!Number.isFinite(s0) || s1 - s0 < 0.3 || y1 - y0 < (t0.kind === 'door' ? 1.6 : 0.8)) continue;
    out.push({
      building: buildings.get(t0.bld)!,
      kind: t0.kind,
      ax: tx * s0 + t0.nx * off,
      az: tz * s0 + t0.nz * off,
      bx: tx * s1 + t0.nx * off,
      bz: tz * s1 + t0.nz * off,
      y0,
      y1,
    });
  }
  return out;
}

/** A box cut through the shell: centre/axis (x, z, ux, uz), half extents, height range. */
export interface CutBox {
  x: number;
  z: number;
  ux: number;
  uz: number;
  /** Half extent across the wall (along u) and along the wall. */
  hu: number;
  hv: number;
  y0: number;
  y1: number;
}

const DECL = /* glsl */ `
uniform float uKqIntBld[${MAX_OPEN}];
uniform float uKqIntFade[${MAX_OPEN}];
uniform vec2 uKqIntY[${MAX_OPEN}];
uniform float uKqIntRuin;
uniform vec4 uKqCutA[${MAX_CUTS}];
uniform vec4 uKqCutB[${MAX_CUTS}];
uniform vec4 uKqClipA[${MAX_CLIPS}];
uniform vec4 uKqClipB[${MAX_CLIPS}];
uniform int uKqClipN;
`;

const CUT = /* glsl */ `
  {
    // overlapping model parts (neighbouring wings, terraces) inside a built room
    for (int i = 0; i < ${MAX_CLIPS}; i++) {
      if (i >= uKqClipN) break;
      vec4 a = uKqClipA[i];
      vec4 b = uKqClipB[i];
      vec2 d = vWorld.xz - a.xy;
      if (abs(dot(d, a.zw)) < b.x && abs(dot(d, vec2(-a.w, a.z))) < b.y && vWorld.y > b.z && vWorld.y < b.w) discard;
    }
    float kqOpen = -1.0;
    vec2 kqY = vec2(0.0);
    for (int i = 0; i < ${MAX_OPEN}; i++) {
      if (abs(vBld - uKqIntBld[i]) < 0.5) { kqOpen = uKqIntFade[i]; kqY = uKqIntY[i]; }
    }
    if (kqOpen > 0.0) {
      if (uKqIntRuin > 0.5) {
        // the interior's own broken walls replace the shell (dithered cross-fade)
        if (kqHash12(gl_FragCoord.xy) < kqOpen) discard;
      } else {
        float kqGlass = 1.0 - step(0.06, max(vColor.r, max(vColor.g, vColor.b)));
        if (kqGlass > 0.5 && vWorld.y > kqY.x && vWorld.y < kqY.y && kqHash12(gl_FragCoord.xy + 7.0) < kqOpen) discard;
        for (int i = 0; i < ${MAX_CUTS}; i++) {
          vec4 a = uKqCutA[i];
          vec4 b = uKqCutB[i];
          if (b.x <= 0.0) continue;
          vec2 d = vWorld.xz - a.xy;
          if (abs(dot(d, a.zw)) < b.x && abs(dot(d, vec2(-a.w, a.z))) < b.y && vWorld.y > b.z && vWorld.y < b.w) discard;
        }
      }
    }
  }
`;

const DECL_ANCHOR = 'varying vec3 vWorld;';
const CUT_ANCHOR = 'if (uOpacity < 1.0';

/** Runtime cut of the palace shell around built interiors. */
export class ShellCut {
  readonly ok: boolean;
  private readonly u: Record<string, { value: unknown }>;

  constructor(material: ShaderMaterial) {
    const u = material.uniforms;
    u.uKqIntBld = { value: new Array<number>(MAX_OPEN).fill(-10) };
    u.uKqIntFade = { value: new Array<number>(MAX_OPEN).fill(0) };
    u.uKqIntY = { value: Array.from({ length: MAX_OPEN }, () => new Vector2()) };
    u.uKqIntRuin = { value: 0 };
    u.uKqCutA = { value: Array.from({ length: MAX_CUTS }, () => new Vector4()) };
    u.uKqCutB = { value: Array.from({ length: MAX_CUTS }, () => new Vector4()) };
    u.uKqClipA = { value: Array.from({ length: MAX_CLIPS }, () => new Vector4()) };
    u.uKqClipB = { value: Array.from({ length: MAX_CLIPS }, () => new Vector4()) };
    u.uKqClipN = { value: 0 };
    this.u = u as Record<string, { value: unknown }>;
    let fs = material.fragmentShader;
    if (fs.includes('uKqIntBld')) {
      this.ok = true;
      return;
    }
    if (!fs.includes(DECL_ANCHOR) || !fs.includes(CUT_ANCHOR)) {
      this.ok = false;
      return;
    }
    fs = fs.replace(DECL_ANCHOR, `${DECL_ANCHOR}\n${DECL}`);
    fs = fs.replace(CUT_ANCHOR, `${CUT}\n  ${CUT_ANCHOR}`);
    material.fragmentShader = fs;
    material.needsUpdate = true;
    this.ok = true;
  }

  /** Open buildings: palace index, fade 0..1 and the glass height range that is cut. */
  setOpen(list: { index: number; fade: number; y0: number; y1: number }[], ruin: boolean): void {
    const b = this.u.uKqIntBld!.value as number[];
    const f = this.u.uKqIntFade!.value as number[];
    const y = this.u.uKqIntY!.value as Vector2[];
    for (let i = 0; i < MAX_OPEN; i++) {
      const o = list[i];
      b[i] = o ? o.index : -10;
      f[i] = o ? o.fade : 0;
      y[i]!.set(o?.y0 ?? 0, o?.y1 ?? 0);
    }
    this.u.uKqIntRuin!.value = ruin ? 1 : 0;
  }

  setCuts(boxes: CutBox[]): void {
    const A = this.u.uKqCutA!.value as Vector4[];
    const B = this.u.uKqCutB!.value as Vector4[];
    for (let i = 0; i < MAX_CUTS; i++) {
      const c = boxes[i];
      if (!c) {
        B[i]!.set(0, 0, 0, 0);
        continue;
      }
      A[i]!.set(c.x, c.z, c.ux, c.uz);
      B[i]!.set(c.hu, c.hv, c.y0, c.y1);
    }
  }

  /** Room boxes (same layout as CutBox: u along the room's long side). */
  setClips(boxes: CutBox[]): void {
    const A = this.u.uKqClipA!.value as Vector4[];
    const B = this.u.uKqClipB!.value as Vector4[];
    const n = Math.min(MAX_CLIPS, boxes.length);
    for (let i = 0; i < n; i++) {
      const c = boxes[i]!;
      A[i]!.set(c.x, c.z, c.ux, c.uz);
      B[i]!.set(c.hu, c.hv, c.y0, c.y1);
    }
    this.u.uKqClipN!.value = n;
  }

  dispose(): void {
    this.setOpen([], false);
    this.setCuts([]);
    this.setClips([]);
  }
}

/** The merged palace mesh, once loaded. */
export function palaceMesh(object: { children: unknown[] }): Mesh | null {
  for (const c of object.children) if ((c as Mesh).isMesh) return c as Mesh;
  return null;
}
