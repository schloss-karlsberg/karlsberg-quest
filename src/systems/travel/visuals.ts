/**
 * Travel visuals: Laub's survey tripods with their light beams (a landmark you see from afar once
 * a point is eingemessen), the activation burst (beam shoots up, rings run over the ground), and
 * the route POIs: a glowing cache with a lid that opens, a Wegstein with a blue notch, a letter
 * that hovers. Built with the scenery kit (vertex colours, one prop material) plus a few additive
 * shaders that spread the shared atmosphere uniforms (fog, time).
 */
import {
  AdditiveBlending,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RingGeometry,
  ShaderMaterial,
} from 'three';
import { atmosphere } from '../../world/atmosphere';
import { Kit, rng, tint } from '../scenery/kit';
import { glowMaterial, propMaterial } from '../scenery/material';
import { C } from '../scenery/props';
import { instancedQuad } from '../scenery/smoke';

/** Brass and chalk-blue: the colours of Laub's instruments. */
export const BEAM_BLUE = new Color(0.8, 1.15, 1.9);
export const BRASS = new Color(1.8, 1.25, 0.5);

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  float v = vUv.y;
  float bands = 0.65 + 0.35 * sin(v * 60.0 - uTime * 3.0);
  float edge = pow(sin(vUv.x * 3.14159), 0.6);
  float a = pow(1.0 - v, 1.4) * bands * uAlpha * (0.35 + 0.65 * edge);
  // never fill the screen when standing in it
  float d = distance(uCamPos.xz, vWp.xz);
  a *= smoothstep(1.2, 5.0, d);
  if (a < 0.003) discard;
  // premultiplied: adds light and dims what is behind a little, so the beam reads on a pale sky too
  gl_FragColor = vec4(uColor * a, a * 0.45);
}
`;

function beamMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 }, uTime: atmosphere.uTime, uCamPos: atmosphere.uCamPos },
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
  });
}

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  // RingGeometry uv: radial position in uv.x (0 inner … 1 outer) after our remap
  float r = vUv.x;
  float a = smoothstep(0.0, 0.35, r) * (1.0 - smoothstep(0.55, 1.0, r)) * uAlpha;
  a *= 0.8 + 0.2 * sin(atan(vWp.z, vWp.x) * 24.0 + uTime * 2.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** A flat ring on the ground (radial uv in x). */
export function groundRing(inner: number, outer: number, color: Color): Mesh {
  const g = new RingGeometry(inner, outer, 64, 1);
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0);
  }
  g.rotateX(-Math.PI / 2);
  const m = new ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: RING_FRAG,
    uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 }, uTime: atmosphere.uTime },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  return mesh;
}

/** Soft camera-facing glows at WORLD positions (the sprite shader ignores the object transform). */
export function glows(list: { x: number; y: number; z: number; size: number; color: Color }[]): Mesh {
  const g = instancedQuad();
  const a = new Float32Array(list.length * 4);
  const t = new Float32Array(list.length * 4);
  list.forEach((s, i) => {
    a.set([s.x, s.y, s.z, s.size], i * 4);
    t.set([s.color.r, s.color.g, s.color.b, i * 0.37], i * 4);
  });
  g.setAttribute('aSprite', new InstancedBufferAttribute(a, 4));
  g.setAttribute('aTint', new InstancedBufferAttribute(t, 4));
  g.instanceCount = list.length;
  const mesh = new Mesh(g, glowMaterial(0.3));
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

function disposeTree(o: Group): void {
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mat = m.material as ShaderMaterial | ShaderMaterial[];
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat.dispose();
  });
}

// ---------------------------------------------------------------------------------------------
// The tripod
// ---------------------------------------------------------------------------------------------

/** Laub's survey tripod in prop space (origin on the ground). */
function tripodKit(k: Kit, seed: number): void {
  const r = rng(seed);
  // the stone marker with a brass bolt
  k.box(0.5, 0.32, 0.5, 0, -0.05, 0, tint(C.sandstonePale, r, 0.08));
  k.cyl(0.06, 0.06, 0.04, 0, 0.27, 0, 0xc9a24a, undefined, 10, 0.6);
  // three legs, red/white striped like the Messstab
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const fx = Math.cos(a) * 0.75;
    const fz = Math.sin(a) * 0.75;
    for (let s = 0; s < 4; s++) {
      const t0 = s / 4;
      const t1 = (s + 1) / 4;
      k.beam(fx * (1 - t0), 1.45 * t0, fz * (1 - t0), fx * (1 - t1), 1.45 * t1, fz * (1 - t1), 0.05, s % 2 ? 0xe8e2d6 : 0xa8322a);
    }
  }
  // head plate and the instrument
  k.cyl(0.16, 0.16, 0.05, 0, 1.45, 0, 0x6b4a2a, undefined, 10);
  k.cyl(0.07, 0.09, 0.2, 0, 1.5, 0, 0x9a7a32, undefined, 10);
  k.push(0, 1.72, 0, 0, 0.6, 0);
  k.box(0.1, 0.16, 0.12, 0, 0, 0, 0xb08a3a);
  k.cyl(0.045, 0.045, 0.34, 0, 0.1, -0.17, 0x8a6a2a, [Math.PI / 2, 0, 0], 8);
  k.cyl(0.05, 0.05, 0.02, 0, 0.1, 0.17, 0xe6f0ff, [Math.PI / 2, 0, 0], 8, 1.2);
  k.pop();
  // a pennant
  k.beam(0.05, 1.5, 0.05, 0.05, 2.35, 0.05, 0.02, C.woodDark);
  k.box(0.02, 0.18, 0.3, 0.05, 2.15, 0.2, 0xa8322a);
}

export interface TripodVisual {
  group: Group;
  beam: Mesh;
  ring: Mesh;
  glow: Mesh;
  /** 0 not found … 1 eingemessen; the burst runs from `burst` (seconds since activation). */
  lit: number;
  burst: number;
}

export function buildTripod(x: number, y: number, z: number, seed: number): TripodVisual {
  const group = new Group();
  group.name = 'travel-tripod';
  const k = new Kit();
  k.place(0, 0, 0, seed * 0.7);
  tripodKit(k, seed);
  const mat = propMaterial();
  (mat.uniforms.uEmissive!.value as Color).copy(BEAM_BLUE).multiplyScalar(0.8);
  const body = new Mesh(k.build(), mat);
  body.name = 'travel-tripod-body';
  body.userData.measurable = true;
  group.add(body);
  const bg = new CylinderGeometry(0.22, 0.32, 1, 12, 1, true);
  bg.translate(0, 0.5, 0);
  const beam = new Mesh(bg, beamMaterial(BEAM_BLUE));
  beam.position.y = 1.8;
  beam.frustumCulled = false;
  beam.renderOrder = 9;
  group.add(beam);
  const ring = groundRing(0.2, 1, BEAM_BLUE);
  ring.position.y = 0.06;
  ring.visible = false;
  group.add(ring);
  const glow = glows([{ x, y: y + 1.82, z, size: 1.6, color: BEAM_BLUE.clone().multiplyScalar(0.8) }]);
  group.add(glow);
  group.position.set(x, y, z);
  return { group, beam, ring, glow, lit: 0, burst: -1 };
}

/**
 * Per frame: a found point shows a tall thin beam (seen from far away), an unknown one a short
 * pulsing glimmer; the burst after activation shoots the beam up and runs two rings out.
 */
export function animateTripod(t: TripodVisual, dt: number, time: number, reducedFlash: boolean, camDist = 0): void {
  const bm = t.beam.material as ShaderMaterial;
  let h: number;
  let alpha: number;
  if (t.lit > 0.5) {
    h = 46;
    alpha = 0.75;
  } else {
    h = 5 + Math.sin(time * 2.2) * 1.2;
    alpha = 0.35 + 0.15 * Math.sin(time * 3.1);
  }
  if (t.burst >= 0) {
    t.burst += dt;
    const b = t.burst;
    h = 46 + 80 * Math.exp(-b * 1.5) * Math.min(1, b * 6);
    alpha = 0.75 + (reducedFlash ? 0.15 : 0.9) * Math.exp(-b * 1.2);
    t.ring.visible = true;
    (t.glow.material as ShaderMaterial).uniforms.uAlpha!.value = 1 + (reducedFlash ? 1 : 5) * Math.exp(-b * 2.5);
    const rr = 1 + b * 16;
    t.ring.scale.set(rr, 1, rr);
    (t.ring.material as ShaderMaterial).uniforms.uAlpha!.value = Math.max(0, 1 - b / 1.8) * (reducedFlash ? 0.5 : 1);
    if (b > 2.2) {
      t.burst = -1;
      t.ring.visible = false;
      (t.glow.material as ShaderMaterial).uniforms.uAlpha!.value = 1;
    }
  }
  // a found beam stays a few pixels wide from far away (a landmark, not a hair)
  const w = t.lit > 0.5 ? Math.max(1, camDist / 50) : 1;
  t.beam.scale.set(w, h, w);
  bm.uniforms.uAlpha!.value = alpha;
}

export function disposeGroup(g: Group): void {
  g.removeFromParent();
  disposeTree(g);
}

// ---------------------------------------------------------------------------------------------
// POIs
// ---------------------------------------------------------------------------------------------

export interface PoiVisual {
  group: Group;
  /** Cache lid (pivot at the back edge), null for other kinds. */
  lid: Group | null;
  /** The bobbing part (letter), null for other kinds. */
  bob: Group | null;
  glow: Mesh;
  ring: Mesh | null;
  material: ShaderMaterial;
  /** Lid opening 0..1 (cache), pulse (shrine). */
  open: number;
  pulse: number;
}

/** Era tint of the POI glows (a cache in the fire night glows hotter). */
export function poiTint(era: string): Color {
  if (era === '1793-07') return new Color(1.8, 0.9, 0.4);
  if (era === '1793-02') return new Color(0.7, 0.95, 1.6);
  if (era === '1796') return new Color(1.5, 1.2, 0.7);
  return new Color(1.5, 1.15, 0.55);
}

export function buildCache(x: number, y: number, z: number, yaw: number, era: string, seed: number, opened: boolean): PoiVisual {
  const group = new Group();
  group.name = 'travel-cache';
  const r = rng(seed);
  const k = new Kit();
  k.place(0, 0, 0, 0);
  const wood = tint(0x5c3d24, r, 0.1);
  // the chest body: planks, iron bands, corner fittings, a glowing seam under the lid
  k.box(1.0, 0.5, 0.62, 0, 0, 0, wood);
  for (const sx of [-0.36, 0.36]) k.box(0.06, 0.52, 0.64, sx, 0, 0, C.iron);
  k.box(1.02, 0.03, 0.64, 0, 0.47, 0, 0xffd27a, undefined, 2.4);
  k.box(0.14, 0.16, 0.04, 0, 0.28, 0.32, 0x8a6a2a);
  // stones round it, a toppled lantern
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    k.rock(0.18 + r() * 0.16, Math.cos(a) * (0.9 + r() * 0.5), -0.05, Math.sin(a) * (0.9 + r() * 0.5), tint(C.rubble, r, 0.2), seed * 13 + i);
  }
  k.cyl(0.08, 0.1, 0.26, 0.75, 0, 0.35, C.iron, [0, 0, 1.2], 6);
  const mat = propMaterial();
  (mat.uniforms.uEmissive!.value as Color).copy(poiTint(era));
  const body = new Mesh(k.build(), mat);
  body.name = 'travel-cache-body';
  group.add(body);
  // the lid on its hinge (back edge, z = −0.31)
  const lid = new Group();
  lid.position.set(0, 0.5, -0.31);
  const lk = new Kit();
  lk.place(0, 0, 0.31, 0);
  lk.box(1.02, 0.08, 0.64, 0, 0, 0, tint(wood, r, 0.05));
  lk.cyl(0.32, 0.32, 1.0, 0, 0.0, 0, tint(wood, r, 0.05), [0, 0, Math.PI / 2], 10);
  for (const sx of [-0.36, 0.36]) lk.cyl(0.335, 0.335, 0.06, sx, 0, 0, C.iron, [0, 0, Math.PI / 2], 10);
  const lidMesh = new Mesh(lk.build(), mat);
  // only the upper half of the barrel lid shows above the plank
  lidMesh.scale.set(1, 0.55, 1);
  lid.add(lidMesh);
  group.add(lid);
  const glow = glows([
    { x, y: y + 0.75, z, size: 2.4, color: poiTint(era).multiplyScalar(0.55) },
    { x, y: y + 2.6, z, size: 1.1, color: poiTint(era).multiplyScalar(0.3) },
  ]);
  group.add(glow);
  const ring = groundRing(0.6, 2.6, poiTint(era).multiplyScalar(0.5));
  ring.position.y = 0.05;
  group.add(ring);
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  const v: PoiVisual = { group, lid, bob: null, glow, ring, material: mat, open: opened ? 1 : 0, pulse: 0 };
  setCacheOpen(v, v.open);
  return v;
}

export function setCacheOpen(v: PoiVisual, open: number): void {
  v.open = open;
  if (v.lid) v.lid.rotation.x = -open * 1.9;
  const gm = v.glow.material as ShaderMaterial;
  gm.uniforms.uAlpha!.value = open >= 1 ? 0.15 : 1;
  if (v.ring) (v.ring.material as ShaderMaterial).uniforms.uAlpha!.value = open >= 1 ? 0 : 0.7;
}

export function buildShrine(x: number, y: number, z: number, yaw: number, seed: number): PoiVisual {
  const group = new Group();
  group.name = 'travel-shrine';
  const r = rng(seed);
  const k = new Kit();
  k.place(0, 0, 0, 0);
  const stone = tint(0xb3a48c, r, 0.1);
  k.box(0.9, 0.18, 0.7, 0, -0.05, 0, tint(C.rubble, r, 0.1));
  k.box(0.52, 1.25, 0.34, 0, 0.1, 0, stone);
  k.box(0.6, 0.12, 0.4, 0, 1.33, 0, tint(stone, r, 0.08));
  // the carved survey mark: a triangle with a bolt, glowing blue in its groove
  k.box(0.3, 0.025, 0.02, 0, 0.82, 0.175, 0x9fd8ff, undefined, 1.6);
  k.box(0.025, 0.3, 0.02, -0.08, 0.84, 0.175, 0x9fd8ff, [0, 0, -0.5], 1.6);
  k.box(0.025, 0.3, 0.02, 0.08, 0.84, 0.175, 0x9fd8ff, [0, 0, 0.5], 1.6);
  k.cyl(0.03, 0.03, 0.03, 0, 0.94, 0.17, 0xc9a24a, [Math.PI / 2, 0, 0], 8, 0.5);
  // moss and a few offered pebbles
  for (let i = 0; i < 6; i++) k.rock(0.06 + r() * 0.05, (r() - 0.5) * 0.7, 0.13, 0.25 + r() * 0.12, tint(0x8a8478, r, 0.2), seed + i * 3);
  const mat = propMaterial();
  (mat.uniforms.uEmissive!.value as Color).set(0.5, 0.95, 1.8);
  const body = new Mesh(k.build(), mat);
  body.name = 'travel-shrine-body';
  group.add(body);
  const glow = glows([{ x, y: y + 0.9, z, size: 1.5, color: new Color(0.35, 0.65, 1.2) }]);
  group.add(glow);
  const ring = groundRing(1.2, 2.6, new Color(0.4, 0.75, 1.4));
  ring.position.y = 0.05;
  group.add(ring);
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  return { group, lid: null, bob: null, glow, ring, material: mat, open: 0, pulse: 0 };
}

export function buildLetter(x: number, y: number, z: number, kind: string, era: string, seed: number): PoiVisual {
  const group = new Group();
  group.name = 'travel-letter';
  const r = rng(seed);
  const bob = new Group();
  const k = new Kit();
  k.place(0, 0, 0, 0);
  if (kind === 'marke' || kind === 'muenze') {
    k.cyl(0.11, 0.11, 0.025, 0, 0, 0, 0xc9a24a, [Math.PI / 2, 0, 0], 14, 0.4);
    k.cyl(0.07, 0.07, 0.03, 0, 0, 0, 0xe0c070, [Math.PI / 2, 0, 0], 10, 0.6);
  } else {
    // a folded letter with a red wax seal
    k.box(0.34, 0.012, 0.24, 0, 0, 0, tint(C.ledger, r, 0.05), [0.25, 0, 0.1]);
    k.box(0.33, 0.012, 0.12, 0, 0.012, -0.04, tint(C.ledger, r, 0.05), [0.6, 0, 0.1]);
    k.cyl(0.035, 0.035, 0.02, 0, 0.03, 0.02, 0x9a1f1a, [0.25, 0, 0.1], 10);
  }
  const mat = propMaterial();
  (mat.uniforms.uEmissive!.value as Color).copy(poiTint(era));
  const m = new Mesh(k.build(), mat);
  bob.add(m);
  bob.position.y = 0.75;
  group.add(bob);
  const glow = glows([
    { x, y: y + 0.75, z, size: 1.2, color: poiTint(era).multiplyScalar(0.6) },
    { x, y: y + 0.1, z, size: 1.6, color: poiTint(era).multiplyScalar(0.18) },
  ]);
  group.add(glow);
  group.position.set(x, y, z);
  return { group, lid: null, bob, glow, ring: null, material: mat, open: 0, pulse: 0 };
}

export function animatePoi(v: PoiVisual, dt: number, time: number, reducedMotion: boolean): void {
  if (v.bob) {
    v.bob.position.y = 0.75 + (reducedMotion ? 0 : Math.sin(time * 1.8) * 0.08);
    v.bob.rotation.y += dt * (reducedMotion ? 0.3 : 0.9);
  }
  if (v.pulse > 0) {
    v.pulse = Math.max(0, v.pulse - dt * 0.6);
    if (v.ring) {
      const s = 1 + (1 - v.pulse) * 2.5;
      v.ring.scale.set(s, 1, s);
      (v.ring.material as ShaderMaterial).uniforms.uAlpha!.value = 0.4 + v.pulse;
    }
  }
}
