/**
 * Readable boards and framed pictures for the set dressing: every set's signs share ONE canvas
 * atlas texture and ONE merged mesh (one draw call). A sign is lettered on the canvas (painted
 * boards: "Menagerie", "Bären", the Rund's house numbers); a painting is a procedural varnished
 * canvas (a dark landscape or a portrait silhouette) in a gilt frame (the frame is kit geometry).
 * Lit by the world's light and fog like the props.
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LinearFilter, Mesh, ShaderMaterial, SRGBColorSpace } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { rng } from './kit';

export interface SignSpec {
  /** Centre of the face (world). */
  x: number;
  y: number;
  z: number;
  /** Facing (radians, kit yaw: local +z = the face's normal). */
  yaw: number;
  w: number;
  h: number;
  /** Lettering, or a painting (`paint: seed`). */
  text?: string;
  paint?: number;
  /** Board colours. */
  style?: 'board' | 'plate' | 'chalk';
  /** Tilt back (radians; a painting leaning on a wall). */
  lean?: number;
}

const TILE_W = 256;
const TILE_H = 128;
const COLS = 4;

function letter(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: SignSpec): void {
  const style = s.style ?? 'board';
  if (style === 'board') {
    g.fillStyle = '#3d2a1a';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 5;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = '#efe0b8';
  } else if (style === 'plate') {
    g.fillStyle = '#e8dcc0';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#2a2118';
    g.lineWidth = 4;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#2a2118';
  } else {
    g.fillStyle = '#2d2a26';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#ece6d8';
  }
  const text = s.text ?? '';
  const lines = text.split('\n');
  let size = Math.min(64, h / (lines.length * 1.25));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (;;) {
    g.font = `600 ${size}px "IM Fell English", Georgia, serif`;
    if (lines.every((l) => g.measureText(l).width < w - 24) || size < 14) break;
    size -= 2;
  }
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
}

function painting(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const r = rng(seed);
  const portrait = r() < 0.45;
  const grd = g.createLinearGradient(x, y, x, y + h);
  if (portrait) {
    grd.addColorStop(0, '#2a2016');
    grd.addColorStop(1, '#140e09');
  } else {
    grd.addColorStop(0, `hsl(${30 + r() * 30}, 35%, ${38 + r() * 14}%)`);
    grd.addColorStop(0.55, `hsl(${40 + r() * 20}, 30%, ${30 + r() * 10}%)`);
    grd.addColorStop(1, `hsl(${80 + r() * 40}, 25%, ${16 + r() * 8}%)`);
  }
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  if (portrait) {
    // a sitter in a dark coat, a pale face, a wig
    g.fillStyle = `hsl(${r() * 40}, 30%, ${18 + r() * 12}%)`;
    g.beginPath();
    g.ellipse(x + w / 2, y + h * 1.02, w * 0.36, h * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9c2a2';
    g.beginPath();
    g.ellipse(x + w / 2, y + h * 0.4, w * 0.12, h * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e6e0d4';
    g.beginPath();
    g.ellipse(x + w / 2, y + h * 0.3, w * 0.15, h * 0.13, 0, Math.PI, Math.PI * 2);
    g.fill();
  } else {
    // a pastoral: trees, a hill, a bright sky gap
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `hsla(${70 + r() * 50}, 30%, ${12 + r() * 14}%, 0.9)`;
      g.beginPath();
      g.ellipse(x + r() * w, y + h * (0.45 + r() * 0.3), w * (0.08 + r() * 0.12), h * (0.12 + r() * 0.15), 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(240, 220, 170, 0.35)';
    g.beginPath();
    g.ellipse(x + w * (0.3 + r() * 0.4), y + h * 0.22, w * 0.18, h * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  // varnish and craquelure
  g.fillStyle = 'rgba(80, 50, 10, 0.25)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.moveTo(x + r() * w, y + r() * h);
    g.lineTo(x + r() * w, y + r() * h);
    g.stroke();
  }
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec3 alb = texture2D(uAtlas, vUv).rgb;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  // a little self light so the lettering reads in shade and at dusk
  vec3 col = kqLight(alb, n, vWp, 1.0, 1.0) + alb * 0.12;
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

/** One mesh for a list of signs (null if empty). */
export function signMesh(list: SignSpec[]): Mesh | null {
  if (!list.length || typeof document === 'undefined') return null;
  const n = list.length;
  const rows = Math.ceil(n / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = TILE_W * COLS;
  canvas.height = TILE_H * rows;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  list.forEach((s, i) => {
    const tx = (i % COLS) * TILE_W;
    const ty = Math.floor(i / COLS) * TILE_H;
    // the tile keeps the sign's aspect inside 256 × 128
    const aspect = s.w / s.h;
    let tw = TILE_W;
    let th = TILE_W / aspect;
    if (th > TILE_H) {
      th = TILE_H;
      tw = TILE_H * aspect;
    }
    if (s.paint !== undefined) painting(g, tx, ty, tw, th, s.paint);
    else letter(g, tx, ty, tw, th, s);
    const u0 = tx / canvas.width;
    const u1 = (tx + tw) / canvas.width;
    const v1 = 1 - ty / canvas.height;
    const v0 = 1 - (ty + th) / canvas.height;
    // corners in the sign's frame (x right, y up), facing +z
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    const lean = s.lean ?? 0;
    const cl = Math.cos(lean);
    const sl = Math.sin(lean);
    const nl = [sy * cl, sl, cy * cl];
    const corner = (lx: number, ly: number): [number, number, number] => {
      // lean: rotate about local x (top goes back, −z)
      const yy = ly * cl;
      const zz = -ly * sl;
      return [s.x + lx * cy + zz * sy, s.y + yy, s.z - lx * sy + zz * cy];
    };
    const a = corner(-s.w / 2, -s.h / 2);
    const b = corner(s.w / 2, -s.h / 2);
    const c = corner(s.w / 2, s.h / 2);
    const d = corner(-s.w / 2, s.h / 2);
    for (const [p, t] of [
      [a, [u0, v0]],
      [b, [u1, v0]],
      [c, [u1, v1]],
      [a, [u0, v0]],
      [c, [u1, v1]],
      [d, [u0, v1]],
    ] as const) {
      pos.push(...p);
      nor.push(...nl);
      uv.push(t[0], t[1]);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.computeBoundingSphere();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...atmosphere, uAtlas: { value: tex } }, side: DoubleSide });
  mat.userData.atlas = tex;
  const mesh = new Mesh(geo, mat);
  mesh.name = 'scenery-signs';
  return mesh;
}
