/**
 * Procedural low-poly animals (no model files): flat-shaded primitives merged per animated part
 * (body, neck/head, legs, tail), vertex colours, one shared ShaderMaterial lit with the world's
 * moon / lantern / fire-glow light and fog (kqLight / kqFog). Each rig exposes pivots the system
 * rotates for a simple gait, the cassowary's display, the dromedaries' chewing, the jaguar's
 * crouch. The jaguar's eyes are additive sprites that catch the lantern (eyeshine) and stay
 * visible in the dark, beyond the light.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { AnimalKind } from './logic';

const VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uFade;
uniform float uRim;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vN);
  vec3 col = kqLight(vColor, n, vWorld, 1.0, 1.0);
  // a faint cool rim so a dark shape still reads against the night (silhouette)
  vec3 v = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += (uSkyAmbient * 0.6 + uGlowColor * 0.1) * rim * uRim;
  col = kqFog(col, vWorld);
  gl_FragColor = vec4(col, uFade);
}
`;

export function animalMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...atmosphere, uFade: { value: 1 }, uRim: { value: 0.35 } },
  });
}

const EYE_VERT = /* glsl */ `
uniform float uSize;
uniform float uMinPx;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // a minimum on-screen size: eyes stay readable far beyond the light
  float s = max(uSize, -mv.z * uMinPx);
  mv.xy += position.xy * s;
  // pulled towards the camera so the animal's own head never cuts the sprite
  mv.z += 0.25;
  vUv = position.xy;
  gl_Position = projectionMatrix * mv;
}
`;

const EYE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
varying vec2 vUv;
void main() {
  float r = length(vUv * vec2(1.0, 1.6));
  float core = smoothstep(0.42, 0.0, r);
  float halo = smoothstep(1.0, 0.15, r) * 0.3;
  float a = (core + halo) * uGlow;
  if (a < 0.003) discard;
  // tapetum lucidum: a hard, bright reflection (tone mapping softens it)
  gl_FragColor = vec4(uColor * a * (1.0 + 2.0 * core), a);
}
`;

/** Eyeshine sprite: additive, a minimum pixel size, intensity per frame. */
export function eyeMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: EYE_VERT,
    fragmentShader: EYE_FRAG,
    uniforms: { uColor: { value: color }, uGlow: { value: 0 }, uSize: { value: 0.045 }, uMinPx: { value: 0.0085 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

// ---- geometry builder ------------------------------------------------------------------------

const tmpM = new Matrix4();
const tmpQ = new Quaternion();

/** Accumulates flat-shaded, vertex-coloured primitives into one geometry. */
class Builder {
  private pos: number[] = [];
  private col: number[] = [];

  add(g: BufferGeometry, color: number | Color, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1], jitter = 0, seed = 1): this {
    const geo = g.index ? g.toNonIndexed() : g;
    tmpQ.setFromEuler(new Euler(rot[0], rot[1], rot[2]));
    tmpM.compose(new Vector3(...at), tmpQ, new Vector3(...scale));
    geo.applyMatrix4(tmpM);
    const p = geo.getAttribute('position');
    const c = color instanceof Color ? color : new Color(color);
    let s = seed;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      // per-face colour variation (every 3 vertices)
      if (i % 3 === 0) s = (s * 16807) % 2147483647;
      const v = 1 + jitter * ((s / 2147483647) * 2 - 1);
      this.col.push(c.r * v, c.g * v, c.b * v);
    }
    if (geo !== g) geo.dispose();
    g.dispose();
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); // non-indexed → flat facets
    g.computeBoundingSphere();
    return g;
  }
}

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const ico = (r: number, detail = 0) => new IcosahedronGeometry(r, detail);
const cyl = (rt: number, rb: number, h: number, seg = 5) => new CylinderGeometry(rt, rb, h, seg, 1);
const cone = (r: number, h: number, seg = 5) => new ConeGeometry(r, h, seg, 1);

/** A rig: the root (position / heading) and named pivots the animation rotates. */
export interface AnimalRig {
  kind: AnimalKind;
  root: Group;
  body: Object3D;
  neck: Object3D;
  head: Object3D | null;
  legs: Object3D[];
  tail: Object3D | null;
  eyes: Mesh[];
  /** Height of the back above the ground (m). */
  height: number;
}

function part(parent: Object3D, geo: BufferGeometry, mat: ShaderMaterial, at: [number, number, number]): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(...at);
  parent.add(m);
  return m;
}

function pivot(parent: Object3D, at: [number, number, number]): Object3D {
  const o = new Object3D();
  o.position.set(...at);
  parent.add(o);
  return o;
}

/** Leg: thigh + shank + foot hanging down from the pivot (length l). */
function leg(b: Builder, l: number, top: number, low: number, col: number, footCol: number, hoof = false): Builder {
  b.add(cyl(top, top * 0.7, l * 0.48, 5), col, [0, -l * 0.24, 0], [0.08, 0, 0], [1, 1, 1], 0.06);
  b.add(cyl(low, low * 0.8, l * 0.52, 5), col, [0, -l * 0.74, 0.02], [-0.06, 0, 0], [1, 1, 1], 0.06);
  if (hoof) b.add(cyl(low * 1.25, low * 1.4, 0.08, 6), footCol, [0, -l + 0.04, 0]);
  else b.add(box(low * 2.6, 0.05, low * 3.4), footCol, [0, -l + 0.025, -low * 0.8]);
  return b;
}

// ---- cassowary ---------------------------------------------------------------------------------

/**
 * Southern cassowary: a shaggy black body like a haystack of hair-feathers, bare blue neck, two
 * red wattles, a horn-brown casque, heavy grey legs with the dagger toe. ~1.6 m tall.
 */
export function cassowary(mat: ShaderMaterial): AnimalRig {
  const root = new Group();
  root.name = 'menagerie-cassowary';
  const body = pivot(root, [0, 0.95, 0]);
  const black = 0x0b0a0a;
  const b = new Builder();
  b.add(ico(0.42, 1), black, [0, 0, 0.05], [0, 0, 0], [1, 0.82, 1.35], 0.25, 3);
  // hair-feathers: drooping spikes along the back and the flanks
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.add(cone(0.09, 0.5, 4), black, [Math.cos(a) * 0.34, -0.18, 0.1 + Math.sin(a) * 0.42], [Math.PI - Math.sin(a) * 0.5, 0, Math.cos(a) * 0.6], [1, 1, 1], 0.3, 7 + i);
  }
  b.add(cone(0.22, 0.5, 5), black, [0, -0.05, 0.6], [-1.9, 0, 0], [1, 1, 1], 0.2, 9); // rump fall
  part(body, b.build(), mat, [0, 0, 0]);
  // neck + head pivot at the front of the body
  const neck = pivot(body, [0, 0.12, -0.42]);
  const nb = new Builder();
  nb.add(cyl(0.06, 0.1, 0.62, 6), 0x2f5fb6, [0, 0.27, -0.06], [-0.18, 0, 0], [1, 1, 1], 0.12, 4); // blue neck
  nb.add(cyl(0.05, 0.065, 0.2, 6), 0x5a2a8c, [0, 0.52, -0.12], [-0.3, 0, 0], [1, 1, 1], 0.1, 5); // purple throat
  nb.add(ico(0.045, 0), 0xb3140f, [-0.035, 0.12, -0.12], [0, 0, 0], [0.8, 2.2, 0.8], 0.1, 6); // wattles
  nb.add(ico(0.045, 0), 0xb3140f, [0.035, 0.1, -0.11], [0, 0, 0], [0.8, 2.4, 0.8], 0.1, 8);
  part(neck, nb.build(), mat, [0, 0, 0]);
  const head = pivot(neck, [0, 0.64, -0.14]);
  const hb = new Builder();
  hb.add(ico(0.075, 0), 0x2a62c8, [0, 0, 0], [0, 0, 0], [0.9, 0.85, 1.2], 0.08, 2);
  hb.add(cone(0.035, 0.16, 4), 0x1e1b17, [0, -0.02, -0.13], [-Math.PI / 2, 0, 0]); // beak
  hb.add(box(0.03, 0.17, 0.15), 0x6b4f2a, [0, 0.11, 0.0], [0.3, 0, 0], [1, 1, 1], 0.1, 3); // casque
  hb.add(ico(0.014, 0), 0xc89a2a, [0.06, 0.02, -0.03]); // eyes
  hb.add(ico(0.014, 0), 0xc89a2a, [-0.06, 0.02, -0.03]);
  part(head, hb.build(), mat, [0, 0, 0]);
  const legs: Object3D[] = [];
  for (const s of [-1, 1]) {
    const lp = pivot(root, [s * 0.16, 0.9, 0.02]);
    const lb = leg(new Builder(), 0.9, 0.09, 0.05, 0x5b5d5f, 0x3b3c3d);
    lb.add(cone(0.02, 0.14, 3), 0x1b1a18, [s * 0.025, -0.88, -0.14], [-Math.PI / 2, 0, 0]); // the dagger claw
    part(lp, lb.build(), mat, [0, 0, 0]);
    legs.push(lp);
  }
  return { kind: 'cassowary', root, body, neck, head, legs, tail: null, eyes: [], height: 1.3 };
}

// ---- dromedary ---------------------------------------------------------------------------------

/** Dromedary: sand-coloured, one hump, long curved neck, thin legs with knobbly knees. ~2.1 m. */
export function dromedary(mat: ShaderMaterial, tint = 0): AnimalRig {
  const root = new Group();
  root.name = 'menagerie-dromedary';
  const sand = new Color(0xb08a5a).offsetHSL(0, -0.05 * tint, -0.06 * tint);
  const dark = sand.clone().multiplyScalar(0.72);
  const body = pivot(root, [0, 1.55, 0]);
  const b = new Builder();
  b.add(ico(0.5, 1), sand, [0, 0, 0], [0, 0, 0], [0.74, 0.92, 1.62], 0.07, 2);
  b.add(ico(0.36, 1), sand, [0, 0.46, 0.06], [0, 0, 0], [0.82, 1.15, 1.25], 0.08, 5); // hump
  b.add(ico(0.2, 0), dark, [0, -0.36, -0.42], [0, 0, 0], [1, 0.6, 1.2], 0.06, 7); // chest pad
  b.add(ico(0.3, 0), sand, [0, 0.12, -0.6], [0, 0, 0], [0.9, 1.1, 0.8], 0.06, 9); // withers
  part(body, b.build(), mat, [0, 0, 0]);
  const neck = pivot(body, [0, 0.05, -0.8]);
  const nb = new Builder();
  nb.add(cyl(0.13, 0.22, 0.9, 6), sand, [0, 0.1, -0.32], [-0.95, 0, 0], [1, 1, 1], 0.07, 3); // neck goes forward-up
  nb.add(cyl(0.11, 0.13, 0.55, 6), sand, [0, 0.58, -0.7], [0.15, 0, 0], [1, 1, 1], 0.07, 4);
  part(neck, nb.build(), mat, [0, 0, 0]);
  const head = pivot(neck, [0, 0.86, -0.72]);
  const hb = new Builder();
  hb.add(box(0.2, 0.2, 0.42), sand, [0, 0, -0.12], [0.12, 0, 0], [1, 1, 1], 0.07, 5);
  hb.add(box(0.16, 0.13, 0.12), dark, [0, -0.04, -0.36], [0.2, 0, 0], [1, 1, 1], 0.05, 6); // muzzle
  hb.add(cone(0.04, 0.1, 4), dark, [0.08, 0.13, 0.06]);
  hb.add(cone(0.04, 0.1, 4), dark, [-0.08, 0.13, 0.06]);
  hb.add(ico(0.022, 0), 0x150f0a, [0.1, 0.05, -0.08]);
  hb.add(ico(0.022, 0), 0x150f0a, [-0.1, 0.05, -0.08]);
  part(head, hb.build(), mat, [0, 0, 0]);
  const legs: Object3D[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const lp = pivot(root, [sx * 0.24, 1.4, sz * 0.62]);
    const lb = leg(new Builder(), 1.4, 0.1, 0.055, sand.getHex(), 0x3a2f24, true);
    lb.add(ico(0.075, 0), dark, [0, -0.72, 0.02]); // knee
    part(lp, lb.build(), mat, [0, 0, 0]);
    legs.push(lp);
  }
  const tail = pivot(body, [0, 0.08, 0.86]);
  part(tail, new Builder().add(cyl(0.025, 0.035, 0.6, 4), dark, [0, -0.3, 0.04]).build(), mat, [0, 0, 0]);
  return { kind: 'dromedary', root, body, neck, head, legs, tail, eyes: [], height: 2.0 };
}

// ---- jaguar ------------------------------------------------------------------------------------

/** Jaguar: long, low, heavy-shouldered; dark umber (a silhouette at night), eyes that catch light. */
export function jaguar(mat: ShaderMaterial, eyeMat: ShaderMaterial): AnimalRig {
  const root = new Group();
  root.name = 'menagerie-jaguar';
  const coat = 0x2c2013;
  const spot = 0x0e0905;
  const body = pivot(root, [0, 0.58, 0]);
  const b = new Builder();
  b.add(ico(0.3, 1), coat, [0, 0, 0], [0, 0, 0], [0.85, 0.85, 2.3], 0.1, 4);
  b.add(ico(0.26, 1), coat, [0, 0.03, -0.42], [0, 0, 0], [1.05, 1.08, 1.0], 0.1, 6); // shoulders
  b.add(ico(0.18, 0), 0x6e5a3e, [0, -0.17, -0.05], [0, 0, 0], [1.1, 0.5, 2.6], 0.1, 8); // pale belly
  // rosettes as dark facets
  for (let i = 0; i < 12; i++) {
    const a = (i * 2.4) % (Math.PI * 2);
    b.add(ico(0.06, 0), spot, [Math.cos(a) * 0.22, 0.05 + Math.sin(a) * 0.17, -0.55 + (i / 12) * 1.2], [0, 0, 0], [1, 1, 0.6], 0.2, 11 + i);
  }
  part(body, b.build(), mat, [0, 0, 0]);
  const neck = pivot(body, [0, 0.05, -0.62]);
  part(neck, new Builder().add(cyl(0.15, 0.2, 0.3, 6), coat, [0, 0.03, -0.12], [-1.2, 0, 0], [1, 1, 1], 0.08, 3).build(), mat, [0, 0, 0]);
  const head = pivot(neck, [0, 0.08, -0.3]);
  const hb = new Builder();
  hb.add(ico(0.16, 1), coat, [0, 0, 0], [0, 0, 0], [1.05, 0.85, 1.05], 0.1, 5);
  hb.add(box(0.15, 0.1, 0.14), 0x4a3820, [0, -0.04, -0.14], [0.1, 0, 0], [1, 1, 1], 0.08, 6); // muzzle
  hb.add(cone(0.05, 0.08, 3), coat, [0.1, 0.13, 0.03]);
  hb.add(cone(0.05, 0.08, 3), coat, [-0.1, 0.13, 0.03]);
  part(head, hb.build(), mat, [0, 0, 0]);
  const eyes: Mesh[] = [];
  const eg = new PlaneGeometry(2, 2);
  for (const s of [-1, 1]) {
    const e = new Mesh(eg, eyeMat);
    // just in front of the face (a camera-facing sprite inside the head would be hidden)
    e.position.set(s * 0.1, 0.04, -0.2);
    e.frustumCulled = false;
    e.renderOrder = 6;
    head.add(e);
    eyes.push(e);
  }
  const legs: Object3D[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const lp = pivot(root, [sx * 0.16, 0.52, sz * 0.48]);
    part(lp, leg(new Builder(), 0.52, sz < 0 ? 0.09 : 0.1, 0.055, coat, 0x2a1f12).build(), mat, [0, 0, 0]);
    legs.push(lp);
  }
  const tail = pivot(body, [0, 0.08, 0.66]);
  const tb = new Builder();
  tb.add(cyl(0.04, 0.05, 0.42, 4), coat, [0, -0.06, 0.2], [1.2, 0, 0]);
  tb.add(cyl(0.035, 0.04, 0.38, 4), spot, [0, -0.3, 0.42], [0.6, 0, 0]);
  part(tail, tb.build(), mat, [0, 0, 0]);
  return { kind: 'jaguar', root, body, neck, head, legs, tail, eyes, height: 0.8 };
}

/** Dispose all geometries of a rig (materials are shared). */
export function disposeRig(r: AnimalRig): void {
  const geos = new Set<BufferGeometry>();
  r.root.traverse((o) => {
    if (o instanceof Mesh) geos.add(o.geometry as BufferGeometry);
  });
  for (const g of geos) g.dispose();
}
