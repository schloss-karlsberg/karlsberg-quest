import {
  BufferAttribute,
  type BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  type Object3D,
  ShaderMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Footprint } from '../data/types';
import { ATMOS_GLSL, atmosphere } from './atmosphere';

const PALACE_VERT = /* glsl */ `
attribute vec3 color;
attribute float aBase;
attribute float aConf;
attribute float aBld;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vBase;
varying float vConf;
varying float vBld;
void main() {
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
  vec3 alb = vColor;
  // weathering: slight streaks and darker plinths
  alb *= 0.9 + 0.18 * n;
  alb *= mix(0.78, 1.0, smoothstep(vBase, vBase + 1.6, vWorld.y));
  vec3 conf = vConf < 0.5 ? vec3(0.62, 0.1, 0.32) : vConf < 1.5 ? vec3(0.79, 0.37, 0.0) : vec3(0.0, 0.37, 0.24);
  alb = mix(alb, conf, uConfMix);
  // soot rises from the windows and roof edges
  float soot = uChar * smoothstep(0.25, 0.75, n + (vWorld.y - vBase) * 0.04);
  alb = mix(alb, vec3(0.02, 0.018, 0.016), soot);
  vec3 nn = normalize(vNormal);
  if (!gl_FrontFacing) nn = -nn;
  float ao = mix(0.7, 1.0, smoothstep(vBase - 0.5, vBase + 4.0, vWorld.y));
  vec3 col = kqLight(alb, nn, vWorld, ao, 1.0);
  gl_FragColor = vec4(kqFog(col, vWorld), 1.0);
}
`;

/**
 * Buildings that still stand in the 1796 ruin (bible 05-kapitel-4: the Baumagazin is the only
 * building that survives, FAKT; the two guard houses at the valley entrance still stand).
 */
export const RUIN_KEEP = ['KB-B29', 'KB-B63', 'KB-B64'];

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

/**
 * The 1789 light model (91 buildings + site features), merged into a single draw call with a
 * custom shader (vertex colours, shared lighting/fog, ruin cut-off, charring, confidence colours).
 */
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
      uniforms: {
        ...atmosphere,
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
    const mesh = new Mesh(merged, this.material);
    mesh.name = 'palace-merged';
    mesh.matrixAutoUpdate = false;
    this.object.add(mesh);
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
