import {
  BufferAttribute,
  type BufferGeometry,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  type Object3D,
  ShaderMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Footprint } from '../data/types';
import { ATMOS_GLSL, atmosphere } from './atmosphere';
import type { Solid } from './collision';
import { SURF, SURF_GLSL, planarUv, surfaces } from './surfaces';

const PALACE_VERT = /* glsl */ `
attribute vec3 color;
attribute float aBase;
attribute float aConf;
attribute float aBld;
attribute float aSurf;
attribute vec2 aUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vBase;
varying float vConf;
varying float vBld;
varying float vSurf;
varying vec2 vUv;
void main() {
  vSurf = aSurf;
  vUv = aUv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vBase = aBase;
  vConf = aConf;
  vBld = aBld;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PALACE_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${SURF_GLSL}
uniform float uRuin;       // 0 intact .. 1 ruin (walls cut down to stubs)
uniform float uChar;       // 0 .. 1 soot/charring (fire)
uniform float uConfMix;    // 0 material colours .. 1 confidence colours
uniform float uOpacity;    // dissolve (era shift); 1 = solid
uniform float uKeep[4];    // building indices that stay standing in the ruin (RUIN_KEEP)
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vBase;
varying float vConf;
varying float vBld;
varying float vSurf;
varying vec2 vUv;
void main() {
  float n = kqFbm(vWorld.xz * 0.35 + vWorld.y * 0.21 + vBld * 3.1);
  bool kept = false;
  for (int i = 0; i < 4; i++) if (abs(vBld - uKeep[i]) < 0.5) kept = true;
  // kept buildings stand through the ruin and the Steinfraß (uRuin ≤ 1.05); only a shift that
  // grows the world out of the ground (uRuin ≈ 1.14 → 1) cuts them like the rest
  if (uRuin > 0.0 && (!kept || uRuin > 1.08)) {
    float stub = vBase + mix(40.0, 0.8 + 3.2 * n, uRuin);
    if (vWorld.y > stub) discard;
  }
  if (uOpacity < 1.0 && kqHash12(gl_FragCoord.xy + floor(uTime * 30.0)) > uOpacity) discard;
  // the inside of the shell (seen through an upper-floor window with no room behind it): a dim
  // warm interior instead of the sky showing through a hollow facade (playtest)
  if (!gl_FrontFacing && uRuin < 0.5) {
    float lamp = 0.6 + 0.4 * kqNoise(vWorld.xz * 0.15 + vWorld.y * 0.5);
    vec3 inner = vec3(0.075, 0.058, 0.044) * lamp * mix(0.6, 1.0, smoothstep(vBase, vBase + 8.0, vWorld.y));
    gl_FragColor = vec4(kqFog(inner, vWorld), 1.0);
    return;
  }
  vec3 alb = vColor;
  // weathering: slight streaks and darker plinths
  alb *= 0.9 + 0.18 * n;
  alb *= mix(0.78, 1.0, smoothstep(vBase, vBase + 1.6, vWorld.y));
  vec3 conf = vConf < 0.5 ? vec3(0.62, 0.1, 0.32) : vConf < 1.5 ? vec3(0.79, 0.37, 0.0) : vec3(0.0, 0.37, 0.24);
  vec3 nn = normalize(vNormal);
  if (!gl_FrontFacing) nn = -nn;
  float ao = mix(0.7, 1.0, smoothstep(vBase - 0.5, vBase + 4.0, vWorld.y));
  vec3 col;
  if (uSurfOn > 0.5 && uConfMix < 0.5) {
    // textured (medium / high): CC0 stone, plaster, tiles, slate, painted wood, glass
    float rough = 0.85;
    float metal = 0.0;
    bool glass = vSurf > 19.5;
    if (glass) {
      alb = vec3(0.012, 0.016, 0.02);
      rough = 0.08;
      // old crown glass: a faint waviness in the reflection
      vec2 wv = vec2(kqNoise(vWorld.xz * 3.0 + vWorld.y * 2.0), kqNoise(vWorld.zy * 3.0 + 7.0)) - 0.5;
      nn = normalize(nn + vec3(wv.x, wv.y * 0.5, wv.y) * 0.08);
    } else {
      kqSurface(vSurf, vUv, vWorld, alb, nn, rough, metal);
      // rain streaks below sills and cornices, moss-green damp at the foot of the walls
      float streak = kqNoise(vec2(vUv.x * 1.3, vWorld.y * 0.12)) * kqNoise(vec2(vUv.x * 4.0, vWorld.y * 0.3));
      if (abs(nn.y) < 0.5) alb *= 1.0 - 0.1 * smoothstep(0.3, 0.65, streak);
      alb = mix(alb, alb * vec3(0.72, 0.8, 0.62), (1.0 - smoothstep(vBase, vBase + 0.9, vWorld.y)) * 0.6 * (1.0 - uSnow));
    }
    // soot rises from the windows and roof edges
    float soot = uChar * smoothstep(0.25, 0.75, n + (vWorld.y - vBase) * 0.04);
    alb = mix(alb, vec3(0.02, 0.018, 0.016), soot);
    rough = mix(rough, 0.95, soot);
    // snow on roofs, sills and cornices (1793-02)
    float snow = uSnow * smoothstep(0.35, 0.75, nn.y) * smoothstep(0.3, 0.55, kqNoise(vWorld.xz * 1.3) * 0.6 + 0.45);
    alb = mix(alb, vec3(0.8, 0.84, 0.92), snow);
    rough = mix(rough, 0.55, snow);
    col = kqLightPbr(alb, nn, vWorld, ao, rough, metal * (1.0 - snow));
  } else {
    alb = mix(alb, conf, uConfMix);
    // soot rises from the windows and roof edges
    float soot = uChar * smoothstep(0.25, 0.75, n + (vWorld.y - vBase) * 0.04);
    alb = mix(alb, vec3(0.02, 0.018, 0.016), soot);
    col = kqLight(alb, nn, vWorld, ao, 1.0);
  }
  gl_FragColor = vec4(kqFog(col, vWorld), 1.0);
}
`;

/**
 * Buildings that still stand in the 1796 ruin (bible 05-kapitel-4: the Baumagazin is the only
 * building that survives, FAKT; the two guard houses at the valley entrance still stand).
 */
export const RUIN_KEEP = ['KB-B29', 'KB-B63', 'KB-B64'];

/**
 * Footprints that are open ground with free-standing parts, so their outline must not block:
 * - the menagerie terraces KL-B43 (research-wave model: six rows of animal houses with their runs,
 *   no wall round the plot); their rows are solids of the menagerie set (scenery/worldsets.ts
 *   `TERRACE_ROWS`);
 * - the Altan KB-B02a in front of the south wing's Durchfahrt (garden side): a balcony on two free
 *   pillars and two pilasters, open beneath from the ground to its beams (350.5), so the carriage
 *   way into the Durchfahrt runs under it; its pillars are `OPEN_SOLIDS`.
 * The collider leaves their outlines out.
 */
export const OPEN_GROUND: readonly string[] = ['KL-B43', 'KB-B02a'];

/** Wing axis of the south wing KB-B02 (west → east) in the local frame. */
const B02_U = { x: 0.9863, z: -0.1655 };

/**
 * The standing parts of the open-ground footprints that belong to the palace itself (solid while the
 * palace is intact): the Altan KB-B02a's pillar pedestals as the model draws them (343.8 … 346.2,
 * pillars on top up to the beams), the two free ones 0.91 m square, the pilasters 0.67 × 0.19 m
 * against the wing's wall. Between them the way into the Durchfahrt is 4.4 m wide.
 */
export const OPEN_SOLIDS: readonly Solid[] = [
  { x: 1232.675, z: -1083.21, hu: 0.335, hv: 0.1 }, // pilaster west
  { x: 1237.75, z: -1084.055, hu: 0.335, hv: 0.1 }, // pilaster east
  { x: 1233.275, z: -1079.555, hu: 0.46, hv: 0.46 }, // pillar south-west
  { x: 1238.365, z: -1080.4, hu: 0.46, hv: 0.46 }, // pillar south-east
].map((p) => ({ kind: 'box', ux: B02_U.x, uz: B02_U.z, ...p }) as Solid);

export interface PalaceBuilding {
  id: string;
  index: number;
  baseH: number;
}

function toFloat(g: BufferGeometry, name: string, itemSize: number): void {
  const a = g.getAttribute(name);
  if (!a) return;
  const out = new Float32Array(a.count * itemSize);
  for (let k = 0; k < a.count; k++) {
    out[k * itemSize] = a.getX(k);
    if (itemSize > 1) out[k * itemSize + 1] = a.getY(k);
    if (itemSize > 2) out[k * itemSize + 2] = a.getZ(k);
  }
  g.setAttribute(name, new Float32BufferAttribute(out, itemSize));
}

function nodeIdOf(o: Object3D, root: Object3D): string {
  let cur: Object3D | null = o;
  while (cur && cur !== root) {
    const id = (cur.userData as { id?: string }).id;
    if (typeof id === 'string') return id;
    cur = cur.parent;
  }
  return o.name || 'unknown';
}

/** Glass panes (near-black vertex colour): layer id the palace shader treats as glass. */
export const SURF_GLASS = 20;

/**
 * Surface layer of a palace face from its vertex colour (linear) and normal: the model's palette
 * is a handful of material colours (cream / white plaster, red and grey sandstone, red tiles,
 * dark slate, green- and blue-grey-painted shutters and doors, brown door leaves, green copper, glass).
 */
export function palaceSurface(r: number, g: number, b: number, ny: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const ay = Math.abs(ny);
  const slope = ay > 0.15 && ay < 0.95;
  if (mx < 0.06) return SURF_GLASS;
  if (g > r * 1.6 && b > r * 1.4) return SURF.IRON; // green copper (domes, lanterns)
  if (r > g * 2.5 && slope) return SURF.TILES; // red tiles
  if (mx < 0.13 && mx - mn < 0.04 && slope) return SURF.SLATE;
  if (r > g * 2.5) return SURF.ASHLAR; // red sandstone dressings
  if (g >= r && g >= b && mx < 0.32) return SURF.PAINTED; // green shutters, doors
  // blue-grey louvred shutters of the research-wave model (#5F6F7A, research/09 §3.2); darker
  // than 0.13 is slate seen side-on, not paint
  if (b >= g && g >= r && b > r * 1.3 && mx >= 0.13 && mx < 0.32) return SURF.PAINTED;
  if (r > g * 1.6 && mx < 0.21) return SURF.PLANKS; // brown and red-brown door leaves
  if (r > b * 3 && r > 0.5) return SURF.IRON; // gilt
  if (mx - mn < 0.08 && mx < 0.6) return SURF.ASHLAR; // grey stone dressings
  if (mx < 0.13) return SURF.SLATE;
  return SURF.PLASTER;
}

/** aSurf (layer) + aUv (planar metres) for a palace geometry in world space. */
function surfaceAttributes(g: BufferGeometry): void {
  const P = g.getAttribute('position');
  const N = g.getAttribute('normal');
  const C = g.getAttribute('color');
  const surf = new Float32Array(P.count);
  const uv = new Float32Array(P.count * 2);
  const o: [number, number] = [0, 0];
  for (let i = 0; i < P.count; i++) {
    surf[i] = palaceSurface(C.getX(i), C.getY(i), C.getZ(i), N.getY(i));
    planarUv(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), o);
    uv[i * 2] = o[0];
    uv[i * 2 + 1] = o[1];
  }
  g.setAttribute('aSurf', new BufferAttribute(surf, 1));
  g.setAttribute('aUv', new BufferAttribute(uv, 2));
}

/**
 * The 1789 light model (91 buildings + site features), merged into a single draw call with a
 * custom shader (vertex colours, shared lighting/fog, ruin cut-off, charring, confidence colours).
 */
/** Edge of the palace's draw cells (m). */
const PALACE_CELL = 48;

export class Palace {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  buildings: PalaceBuilding[] = [];
  triangles = 0;

  constructor() {
    this.object.name = 'palace1789';
    this.material = new ShaderMaterial({
      vertexShader: PALACE_VERT,
      fragmentShader: PALACE_FRAG,
      // both sides: the shell's inner faces fill the window holes of storeys without rooms
      side: DoubleSide,
      shadowSide: FrontSide,
      uniforms: {
        ...atmosphere,
        ...surfaces,
        uRuin: { value: 0 },
        uChar: { value: 0 },
        uConfMix: { value: 0 },
        uOpacity: { value: 1 },
        uKeep: { value: [-1, -1, -1, -1] },
      },
    });
  }

  get uniforms() {
    return this.material.uniforms;
  }

  async load(url: string, footprints: Footprint[]): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const baseById = new Map(footprints.map((f) => [f.id, f.base_h]));
    const geos: BufferGeometry[] = [];
    const ids: string[] = [];
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    const identity = new Matrix4();
    for (const m of meshes) {
      const id = nodeIdOf(m, root);
      const g = m.geometry.clone();
      toFloat(g, 'position', 3);
      toFloat(g, 'normal', 3);
      if (!m.matrixWorld.equals(identity)) g.applyMatrix4(m.matrixWorld);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const count = g.getAttribute('position').count;
      if (g.getAttribute('color')) {
        const c = g.getAttribute('color');
        const out = new Float32Array(count * 3);
        for (let k = 0; k < count; k++) {
          out[k * 3] = c.getX(k);
          out[k * 3 + 1] = c.getY(k);
          out[k * 3 + 2] = c.getZ(k);
        }
        g.setAttribute('color', new Float32BufferAttribute(out, 3));
      } else {
        g.setAttribute('color', new Float32BufferAttribute(new Float32Array(count * 3).fill(0.7), 3));
      }
      const confA = g.getAttribute('_conf');
      const conf = new Float32Array(count);
      for (let k = 0; k < count; k++) conf[k] = confA ? confA.getX(k) : 0;
      g.computeBoundingBox();
      const base = baseById.get(id) ?? g.boundingBox!.min.y;
      let idx = ids.indexOf(id);
      if (idx < 0) {
        idx = ids.length;
        ids.push(id);
        this.buildings.push({ id, index: idx, baseH: base });
      }
      // keep only the attributes the shader needs (merge requires identical sets)
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
      surfaceAttributes(g);
      g.setAttribute('aConf', new BufferAttribute(conf, 1));
      g.setAttribute('aBase', new BufferAttribute(new Float32Array(count).fill(base), 1));
      g.setAttribute('aBld', new BufferAttribute(new Float32Array(count).fill(idx), 1));
      g.morphAttributes = {};
      geos.push(g);
    }
    const allIndexed = geos.every((g) => g.index);
    const list = allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(list, false);
    if (!merged) throw new Error('palace: geometry merge failed');
    merged.computeBoundingSphere();
    this.triangles = (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
    // the whole model stays as one geometry for the systems that read it (openings, lit windows,
    // the point cloud, the picker) — but it is not drawn: it is never culled as one piece
    const mesh = new Mesh(merged, this.material);
    mesh.name = 'palace-merged';
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.layers.set(31);
    mesh.userData.noShadow = true;
    this.object.add(mesh);
    // what is drawn: the same pieces merged per 48 m cell (round 9, 52–62 fps with the 1789 palace
    // in view, > 5 M triangles): cells off screen or out of the shadow box are culled, so the
    // gallery interior no longer pays for the far wings and the shadow pass only for the near ones
    const cells = new Map<string, BufferGeometry[]>();
    const c = new Vector3();
    for (const g of list) {
      g.computeBoundingBox();
      g.boundingBox!.getCenter(c);
      const key = `${Math.floor(c.x / PALACE_CELL)},${Math.floor(c.z / PALACE_CELL)}`;
      let arr = cells.get(key);
      if (!arr) cells.set(key, (arr = []));
      arr.push(g);
    }
    for (const [key, arr] of cells) {
      const part = mergeGeometries(arr, false);
      if (!part) continue;
      part.computeBoundingSphere();
      part.computeBoundingBox();
      const m = new Mesh(part, this.material);
      m.name = `palace-cell:${key}`;
      m.matrixAutoUpdate = false;
      this.object.add(m);
    }
    for (const m of meshes) m.geometry.dispose();
  }

  /** 'hidden' | 'intact' | 'ruin' */
  setMode(mode: 'hidden' | 'intact' | 'ruin'): void {
    this.object.visible = mode !== 'hidden';
    this.uniforms.uRuin!.value = mode === 'ruin' ? 1 : 0;
    const keep = RUIN_KEEP.map((id) => this.buildings.find((b) => b.id === id)?.index ?? -1);
    this.uniforms.uKeep!.value = [...keep, -1, -1, -1, -1].slice(0, 4);
  }
}
