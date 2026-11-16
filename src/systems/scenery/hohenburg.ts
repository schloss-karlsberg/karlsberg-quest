/**
 * The Hohenburg over Homburg (bible 4.2): outside the playable terrain, about 2–3 km south-west
 * of the palace hill (local ≈ −1320 / 585). A stylised silhouette — the wooded Schlossberg with
 * the slighted fortress on top (broken curtain walls, a tower stump, a gate), the little town at
 * its foot and a low band of hills behind — at its real bearing and distance, its height a little
 * exaggerated so it reads against the sky. Drawn with its own thin aerial perspective so it
 * stands out at dawn and dusk and melts into fog and night.
 *
 * It lies beyond the terrain data, where the mirrored apron (world/terrain.ts) would hide it, so
 * it is drawn scaled towards the camera (`uPull`, which keeps its on-screen shape exactly) to just
 * past the edge of the real terrain in its direction: in front of the fogged apron, behind all
 * real ground. Lighting and haze use the true position.
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { Kit, rng } from './kit';

export const HOHENBURG = { x: -1320, z: 585, base: 228, top: 312 };
/**
 * Playtest round 2: from the Westblick the Hohenburg was a smudge on the horizon (it is 2–3 km
 * away and only ~80 m above its foot). There the castle hill is drawn larger — wider by
 * `MAG_ACROSS`, taller by `MAG_HEIGHT`, about its foot — like a painter would: the view the
 * chapter is about. Elsewhere it keeps its real size.
 */
export const MAG_ACROSS = 1.8;
export const MAG_HEIGHT = 3.0;
/** How far the (magnified) hill reaches from its centre towards the eye (for the pull). */
export const HILL_REACH = 420;

/** A radial hill: rings of vertices, height by a smooth profile + noise, elongated along `axis`. */
function hill(cx: number, cz: number, base: number, top: number, rx: number, rz: number, axis: number, seed: number, plateau = 0.18): BufferGeometry {
  const r = rng(seed);
  const rings = 14;
  const seg = 48;
  const noise = Array.from({ length: seg }, () => r());
  const pos: number[] = [];
  const col: number[] = [];
  const ca = Math.cos(axis);
  const sa = Math.sin(axis);
  const pt = (i: number, j: number): [number, number, number, number] => {
    const t = i / rings; // 0 centre … 1 foot
    const a = (j / seg) * Math.PI * 2;
    const n = 0.85 + 0.3 * (noise[j % seg]! * 0.6 + noise[(j + 7) % seg]! * 0.4);
    const lx = Math.cos(a) * rx * t * n;
    const lz = Math.sin(a) * rz * t * n;
    const x = cx + lx * ca - lz * sa;
    const z = cz + lx * sa + lz * ca;
    const u = Math.max(0, (t - plateau) / (1 - plateau));
    const prof = 1 - u * u * (3 - 2 * u);
    const y = base + (top - base) * prof - (t > 0.98 ? 30 : 0);
    return [x, y, z, t];
  };
  const green = new Color(0x2f3a2a).convertSRGBToLinear();
  const rock = new Color(0x6a5a4e).convertSRGBToLinear();
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p[0], p[1], p[2]);
        const k = p[3] < plateau + 0.05 ? 0.6 : 0;
        col.push(green.r + (rock.r - green.r) * k, green.g + (rock.g - green.g) * k, green.b + (rock.b - green.b) * k);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** Merge the parts; `mag` per part: 1 = grows with the Westblick magnification (the castle hill). */
function merge(list: BufferGeometry[], mag: number[]): BufferGeometry {
  const n = list.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const mg = new Float32Array(n);
  let o = 0;
  list.forEach((g, i) => {
    const P = g.getAttribute('position');
    pos.set(P.array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    mg.fill(mag[i] ?? 0, o, o + P.count);
    o += P.count;
    g.dispose();
  });
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('color', new BufferAttribute(col, 3));
  out.setAttribute('aMag', new BufferAttribute(mg, 1));
  out.computeBoundingSphere();
  return out;
}

/** The ruin, the town and the hills behind as one geometry. */
export function hohenburgGeometry(): BufferGeometry {
  const H = HOHENBURG;
  const parts: BufferGeometry[] = [];
  // the Schlossberg: a ridge running NW–SE, steep on the town side
  parts.push(hill(H.x, H.z, H.base - 20, H.top, 330, 190, 0.5, 7, 0.16));
  // a lower shoulder to the south-west and the hills of the Saarpfalz behind
  parts.push(hill(H.x - 380, H.z + 260, H.base - 20, H.top - 34, 420, 260, 0.2, 8, 0.25));
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.32;
    const d = 1500 + (i % 3) * 300;
    parts.push(hill(H.x + Math.cos(a + Math.PI * 0.75) * d, H.z + Math.sin(a + Math.PI * 0.75) * d * 0.6, H.base - 30, H.top - 10 + (i % 2) * 26, 900, 380, a, 20 + i, 0.3));
  }
  // the fortress on the plateau (Kit builds in local metres; y = the plateau)
  const k = new Kit();
  const r = rng(91);
  const top = H.top;
  const stone = 0x6e625a;
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i < n; i++) {
      if (r() < 0.22) continue; // breaches
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const hh = h * (0.35 + r() * 0.75);
      const mx = x0 + (x1 - x0) * (t0 + t1) * 0.5;
      const mz = z0 + (z1 - z0) * (t0 + t1) * 0.5;
      k.box(len / n + 0.4, hh + 4, 2.6, mx, top - 4, mz, stone, [0, Math.atan2(-(z1 - z0), x1 - x0), 0]);
    }
  };
  k.place(0, 0, 0, 0);
  const cx = H.x;
  const cz = H.z;
  // curtain walls around an oval plateau
  const ring: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * 95 * Math.cos(0.5) - Math.sin(a) * 52 * Math.sin(0.5), cz + Math.cos(a) * 95 * Math.sin(0.5) + Math.sin(a) * 52 * Math.cos(0.5)]);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    wall(a[0], a[1], b[0], b[1], 14);
  }
  // the keep's stump, a gate tower, a broken hall gable
  k.cyl(11, 12, 34, cx + 18, top - 4, cz - 8, stone, undefined, 10);
  k.box(14, 26, 14, cx - 46, top - 4, cz + 22, stone, [0, 0.4, 0]);
  k.box(30, 22, 12, cx - 6, top - 4, cz + 14, 0x7a6c62, [0, 0.5, 0]);
  k.box(6, 10, 12, cx + 4, top + 18, cz + 10, 0x7a6c62, [0, 0.5, 0]);
  // bastion corners
  for (const [dx, dz] of [[70, 40], [-80, -36], [60, -50]] as const) k.box(22, 18, 22, cx + dx, top - 8, cz + dz, stone, [0, 0.8, 0]);
  // the town at the foot (north-east side, towards the Karlsberg): roofs, the church tower
  const tr = rng(17);
  for (let i = 0; i < 46; i++) {
    const a = 0.2 + tr() * 1.9;
    const d = 300 + tr() * 260;
    const x = cx + Math.cos(a) * d * 0.9 + 120;
    const z = cz - Math.sin(a) * d * 0.7 - 40;
    const w = 12 + tr() * 14;
    const y = H.base - 22;
    k.box(w, 10 + tr() * 6, 9 + tr() * 5, x, y, z, 0x8a7d70, [0, tr() * 3, 0]);
    k.box(w * 1.02, 6, 7, x, y + 14, z, 0x5a3a30, [0, tr() * 0.2, 0]);
  }
  k.box(9, 40, 9, cx + 420, H.base - 22, cz - 250, 0x8a7d70);
  k.cone(7, 22, cx + 420, H.base + 18, cz - 250, 0x3a4048, 8);
  const fort = k.build();
  // the kit's geometry carries colour + normals (+ aGlow, unused here)
  fort.deleteAttribute('aGlow');
  parts.push(fort);
  // the castle hill, its shoulder and the fortress grow at the Westblick; the far hills do not
  return merge(parts, parts.map((_, i) => (i < 2 || i === parts.length - 1 ? 1 : 0)));
}

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aMag;
uniform float uPull;
// Westblick magnification (x: across, y: height) about the hill's foot (uPivot)
uniform vec2 uMag;
uniform vec3 uPivot;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 m = mix(vec3(1.0), vec3(uMag.x, uMag.y, uMag.x), aMag);
  wp.xyz = uPivot + (wp.xyz - uPivot) * m;
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  // scaled about the eye: same silhouette on screen, nearer in depth
  vec3 drawn = cameraPosition + (wp.xyz - cameraPosition) * uPull;
  gl_Position = projectionMatrix * viewMatrix * vec4(drawn, 1.0);
}
`;

/** The terrain data's extent (x0, z0, x1, z1): beyond it only the apron. */
export type Extent = [number, number, number, number];

/**
 * How far to pull the Hohenburg towards the eye: to `margin` m past the point where the ray from
 * the camera towards it leaves the terrain extent (1 = not at all).
 */
export function pullFactor(camX: number, camZ: number, ext: Extent, margin = 25, reach = 0): number {
  const dx = HOHENBURG.x - camX;
  const dz = HOHENBURG.z - camZ;
  const d = Math.hypot(dx, dz);
  if (d < 1) return 1;
  const ux = dx / d;
  const uz = dz / d;
  let t = Infinity;
  if (ux < 0) t = Math.min(t, (ext[0] - camX) / ux);
  if (ux > 0) t = Math.min(t, (ext[2] - camX) / ux);
  if (uz < 0) t = Math.min(t, (ext[1] - camZ) / uz);
  if (uz > 0) t = Math.min(t, (ext[3] - camZ) / uz);
  if (!Number.isFinite(t) || t < 0) t = 0;
  // `reach`: how far the hill spreads towards the eye from its centre (its near foot stays beyond the edge)
  return Math.max(0.02, Math.min(1, (t + margin) / Math.max(1, d - reach)));
}

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform float uVis;
uniform float uLift;
uniform vec3 uHorizon;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  vec3 col = kqLight(vCol, n, vWp, 1.0, 1.0);
  // rim of light where the low sun grazes the ridge from behind
  vec3 v = normalize(uCamPos - vWp);
  float back = pow(max(dot(-v, uSunDir), 0.0), 4.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uSunColor * rim * back * (0.6 + 1.2 * uLift);
  // at the Westblick: the ruin's stone catches the light, the wooded slopes read darker
  col *= 1.0 + uLift * (0.35 * smoothstep(0.55, 0.9, dot(vCol, vec3(0.6))) - 0.15);
  // thin aerial perspective (the far haze is the sky's horizon colour)
  float d = length(vWp - uCamPos);
  float haze = (1.0 - exp(-d * (uFogDensity * 0.32 + 0.00009))) * (1.0 - 0.7 * uLift);
  vec3 air = mix(uHorizon, uFogColor, 0.5);
  float keep = clamp(uVis * (1.0 - haze), 0.0, 1.0);
  col = mix(air, col, keep);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Hohenburg {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...atmosphere,
        uVis: { value: 0.5 },
        uLift: { value: 0 },
        uHorizon: { value: new Color() },
        uPull: { value: 1 },
        uMag: { value: new Vector2(1, 1) },
        uPivot: { value: new Vector3(HOHENBURG.x, HOHENBURG.base - 40, HOHENBURG.z) },
      },
    });
    this.mesh = new Mesh(hohenburgGeometry(), this.material);
    this.mesh.name = 'scenery-hohenburg';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  /**
   * 0..1 how clearly it stands out; horizon = the sky's horizon colour (linear); `lift` 0..1 the
   * Westblick (less haze, the castle hill drawn larger: `MAG_*` at full lift).
   */
  set(vis: number, horizon: Color, pull = 1, lift = 0): void {
    this.material.uniforms.uPull!.value = pull;
    this.material.uniforms.uLift!.value = lift;
    (this.material.uniforms.uMag!.value as Vector2).set(1 + (MAG_ACROSS - 1) * lift, 1 + (MAG_HEIGHT - 1) * lift);
    this.material.uniforms.uVis!.value = vis;
    (this.material.uniforms.uHorizon!.value as Color).copy(horizon);
  }
}
