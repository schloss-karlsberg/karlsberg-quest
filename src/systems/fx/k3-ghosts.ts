/**
 * K3 set piece (28 July 1793): the ghostly crowd of the Ehrenhof as instanced smoke silhouettes —
 * French soldiers with bicorne and musket, soldiers with straw bales on the shoulder, villagers
 * carrying paintings, chairs and bundles out of the palace, onlookers who raise their fists, the
 * commissioner with his torch, Jost running with a lantern, and straw carts with their horse.
 *
 * One InstancedMesh per kind (one draw call each). Every vertex knows its part and a local pivot;
 * the vertex shader swings legs and arms with the instance's walk phase, raises an arm, turns the
 * wheels and shrinks a cart's load. The look follows the other memories (scenery workers, NPCs):
 * sepia ink, screen-space hatching, a warm rim, feet dissolving into smoke. Not solid.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

export type GhostKind = 'soldier' | 'bale' | 'painting' | 'chair' | 'bundle' | 'onlooker' | 'woman' | 'commissioner' | 'runner' | 'cart';

export const GHOST_KINDS: readonly GhostKind[] = ['soldier', 'bale', 'painting', 'chair', 'bundle', 'onlooker', 'woman', 'commissioner', 'runner', 'cart'];

/**
 * Parts (aPart): 0 rigid · 1/2 leg L/R · 3/4 arm L/R (swing) · 5 raised arm R (iB.x: 0 down … 1
 * up) · 6 wheel (turns with iB.z) · 7 load (scaled by iB.y) · 8/9 horse legs (diagonal pairs).
 * Shade (aShade): 0 ink · 1 metal / gilt (bright rim) · 2 straw (golden).
 */
interface Piece {
  g: BufferGeometry;
  part: number;
  pivot: Vector3;
  shade?: number;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const O = v(0, 0, 0);

function capsule(r: number, a: Vector3, b: Vector3): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 3, 7);
  const q = new Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1)));
  return g;
}

function box(w: number, h: number, d: number, at: Vector3, rotX = 0, rotY = 0, rotZ = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  if (rotY) g.rotateY(rotY);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(at.x, at.y, at.z);
  return g;
}

function stick(r: number, a: Vector3, b: Vector3, seg = 5): BufferGeometry {
  const g = new CylinderGeometry(r, r, a.distanceTo(b), seg);
  const q = new Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v(1, 1, 1)));
  return g;
}

const HIP_L = v(-0.09, 0.95, 0);
const HIP_R = v(0.09, 0.95, 0);
const SH_L = v(-0.21, 1.39, 0);
const SH_R = v(0.21, 1.39, 0);

type Hat = 'bicorne' | 'tricorn' | 'cap' | 'bonnet' | 'none';

/** A standing person: head, torso, legs (swinging), coat or dress, a hat. Arms are added per kind. */
function body(p: Piece[], hat: Hat, dress = false): void {
  const head = new SphereGeometry(0.105, 9, 7);
  head.scale(0.92, 1.08, 1);
  head.translate(0, 1.6, 0.02);
  p.push({ g: head, part: 0, pivot: O });
  p.push({ g: capsule(0.17, v(0, 1.02, 0), v(0, 1.36, 0.01)).scale(1.08, 1, 0.68), part: 0, pivot: O });
  for (const [side, hip, part] of [[-1, HIP_L, 1], [1, HIP_R, 2]] as const) {
    p.push({ g: capsule(0.068, hip, v(side * 0.1, 0.5, 0)), part, pivot: hip });
    p.push({ g: capsule(0.055, v(side * 0.1, 0.5, 0), v(side * 0.1, 0.06, 0.04)), part, pivot: hip });
  }
  if (dress) {
    const skirt = new CylinderGeometry(0.17, 0.36, 0.86, 9, 1, true);
    skirt.translate(0, 0.56, 0);
    p.push({ g: skirt, part: 0, pivot: O });
  } else {
    // coat tails
    const tails = new CylinderGeometry(0.18, 0.25, 0.46, 8, 1, true);
    tails.translate(0, 0.8, -0.02);
    p.push({ g: tails, part: 0, pivot: O });
  }
  if (hat === 'bicorne') {
    // worn athwart (revolutionary infantry): a wide flat crescent with a cockade
    const h = new SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    h.scale(1.55, 0.95, 0.55);
    h.translate(0, 1.66, 0.01);
    p.push({ g: h, part: 0, pivot: O });
    p.push({ g: box(0.06, 0.06, 0.03, v(-0.12, 1.79, 0.1)), part: 0, pivot: O, shade: 1 });
  } else if (hat === 'tricorn') {
    const h = new CylinderGeometry(0.2, 0.22, 0.09, 3);
    h.translate(0, 1.72, 0);
    p.push({ g: h, part: 0, pivot: O });
  } else if (hat === 'cap') {
    const h = new SphereGeometry(0.12, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    h.scale(1, 0.75, 1.1);
    h.translate(0, 1.66, 0.02);
    p.push({ g: h, part: 0, pivot: O });
  } else if (hat === 'bonnet') {
    const h = new SphereGeometry(0.135, 9, 6);
    h.scale(1, 0.85, 1.05);
    h.translate(0, 1.66, -0.02);
    p.push({ g: h, part: 0, pivot: O });
  }
}

function armsHanging(p: Piece[], swing = true): void {
  p.push({ g: capsule(0.045, SH_L, v(-0.25, 0.88, 0.05)), part: swing ? 3 : 0, pivot: SH_L });
  p.push({ g: capsule(0.045, SH_R, v(0.25, 0.88, 0.05)), part: swing ? 4 : 0, pivot: SH_R });
}

/** Both hands up at the given point (carrying something in front / overhead). */
function armsTo(p: Piece[], hl: Vector3, hr: Vector3): void {
  p.push({ g: capsule(0.045, SH_L, hl), part: 0, pivot: SH_L });
  p.push({ g: capsule(0.045, SH_R, hr), part: 0, pivot: SH_R });
}

function pieces(kind: GhostKind): Piece[] {
  const p: Piece[] = [];
  switch (kind) {
    case 'soldier': {
      body(p, 'bicorne');
      // musket on the left shoulder, bayonet up; the right arm swings
      p.push({ g: capsule(0.045, SH_L, v(-0.24, 1.12, 0.16)), part: 0, pivot: O });
      p.push({ g: capsule(0.04, v(-0.24, 1.12, 0.16), v(-0.2, 1.45, 0.12)), part: 0, pivot: O });
      p.push({ g: stick(0.022, v(-0.2, 1.05, 0.2), v(-0.24, 2.3, -0.22)), part: 0, pivot: O });
      p.push({ g: stick(0.008, v(-0.24, 2.3, -0.22), v(-0.25, 2.68, -0.36), 3), part: 0, pivot: O, shade: 1 });
      p.push({ g: capsule(0.045, SH_R, v(0.25, 0.88, 0.05)), part: 4, pivot: SH_R });
      // cross belts read as a pale X on the chest
      p.push({ g: box(0.05, 0.5, 0.02, v(0, 1.2, 0.12), 0, 0, 0.62), part: 0, pivot: O, shade: 1 });
      p.push({ g: box(0.05, 0.5, 0.02, v(0, 1.2, 0.12), 0, 0, -0.62), part: 0, pivot: O, shade: 1 });
      break;
    }
    case 'bale': {
      body(p, 'bicorne');
      // a straw bale on the right shoulder, the right hand up to hold it, the left arm swings
      p.push({ g: capsule(0.045, SH_R, v(0.3, 1.66, 0.04)), part: 0, pivot: O });
      p.push({ g: capsule(0.045, SH_L, v(-0.25, 0.88, 0.05)), part: 3, pivot: SH_L });
      p.push({ g: box(0.5, 0.42, 0.95, v(0.22, 1.7, 0)), part: 0, pivot: O, shade: 2 });
      p.push({ g: box(0.62, 0.12, 0.7, v(0.22, 1.95, 0.05), 0.3, 0.2, 0.1), part: 0, pivot: O, shade: 2 });
      break;
    }
    case 'painting': {
      body(p, 'tricorn');
      // a big gilt frame held up in front, at the height of the face
      armsTo(p, v(-0.42, 1.62, 0.32), v(0.42, 1.62, 0.32));
      p.push({ g: box(1.25, 0.92, 0.06, v(0, 1.62, 0.36)), part: 0, pivot: O, shade: 1 });
      p.push({ g: box(1.05, 0.72, 0.07, v(0, 1.62, 0.37)), part: 0, pivot: O });
      break;
    }
    case 'chair': {
      body(p, 'cap');
      // one of the gilded chairs, upside down on the shoulders
      armsTo(p, v(-0.26, 1.82, 0.05), v(0.26, 1.82, 0.05));
      p.push({ g: box(0.62, 0.07, 0.58, v(0, 1.82, 0)), part: 0, pivot: O, shade: 1 });
      p.push({ g: box(0.62, 0.62, 0.06, v(0, 1.55, -0.28)), part: 0, pivot: O, shade: 1 });
      for (const [x, z] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]] as const) {
        p.push({ g: stick(0.025, v(x, 1.84, z), v(x * 1.08, 2.3, z * 1.1), 4), part: 0, pivot: O, shade: 1 });
      }
      break;
    }
    case 'bundle': {
      body(p, 'cap');
      // a clock or a box in the arms, a sack on the back
      armsTo(p, v(-0.2, 1.08, 0.34), v(0.2, 1.08, 0.34));
      p.push({ g: box(0.42, 0.5, 0.3, v(0, 1.2, 0.36)), part: 0, pivot: O, shade: 1 });
      const sack = new SphereGeometry(0.28, 8, 6);
      sack.scale(1, 1.25, 0.8);
      sack.translate(0, 1.25, -0.3);
      p.push({ g: sack, part: 0, pivot: O });
      break;
    }
    case 'onlooker': {
      body(p, 'tricorn');
      p.push({ g: capsule(0.045, SH_L, v(-0.25, 0.88, 0.05)), part: 3, pivot: SH_L });
      // the right arm is modelled down; the shader raises it (a fist, a hat waved)
      p.push({ g: capsule(0.045, SH_R, v(0.25, 0.9, 0.08)), part: 5, pivot: SH_R });
      p.push({ g: new SphereGeometry(0.06, 6, 5).translate(0.25, 0.86, 0.08), part: 5, pivot: SH_R });
      break;
    }
    case 'woman': {
      body(p, 'bonnet', true);
      p.push({ g: capsule(0.042, SH_L, v(-0.24, 0.9, 0.06)), part: 3, pivot: SH_L });
      p.push({ g: capsule(0.042, SH_R, v(0.24, 0.92, 0.08)), part: 5, pivot: SH_R });
      // a basket on the hip
      const b = new CylinderGeometry(0.2, 0.16, 0.22, 8, 1, true);
      b.translate(-0.34, 0.98, 0.06);
      p.push({ g: b, part: 0, pivot: O });
      break;
    }
    case 'commissioner': {
      body(p, 'bicorne');
      // the sash (tricolore, read as a pale band) and the torch arm (raised by the shader)
      p.push({ g: box(0.4, 0.09, 0.36, v(0, 1.02, 0.01)), part: 0, pivot: O, shade: 1 });
      p.push({ g: capsule(0.045, SH_L, v(-0.3, 1.0, 0.18)), part: 0, pivot: O });
      p.push({ g: capsule(0.046, SH_R, v(0.26, 0.9, 0.1)), part: 5, pivot: SH_R });
      p.push({ g: stick(0.03, v(0.25, 0.94, 0.08), v(0.27, 0.4, 0.14), 5), part: 5, pivot: SH_R });
      break;
    }
    case 'runner': {
      body(p, 'cap');
      armsHanging(p, true);
      // a horn over the shoulder (Jost)
      const horn = new CylinderGeometry(0.03, 0.09, 0.4, 7, 1, true);
      horn.rotateZ(1.2);
      horn.translate(0.08, 1.2, -0.17);
      p.push({ g: horn, part: 0, pivot: O, shade: 1 });
      break;
    }
    case 'cart': {
      // the horse in front (+z), the cart behind; wheel radius 0.62 at z = -1.0
      const hip = v(0, 1.05, 1.15);
      const sh = v(0, 1.12, 2.35);
      p.push({ g: capsule(0.36, v(0, 1.25, 1.05), v(0, 1.3, 2.45)).scale(0.82, 1, 1), part: 0, pivot: O });
      p.push({ g: capsule(0.17, v(0, 1.45, 2.5), v(0, 2.0, 2.9)), part: 0, pivot: O });
      p.push({ g: capsule(0.12, v(0, 2.0, 2.92), v(0, 1.7, 3.4)).scale(0.8, 1, 1), part: 0, pivot: O });
      p.push({ g: capsule(0.04, v(0, 1.35, 0.82), v(0, 0.75, 0.62)), part: 0, pivot: O });
      for (const [x, z, part, piv] of [[-0.2, 2.35, 8, sh], [0.2, 2.35, 9, sh], [-0.2, 1.15, 9, hip], [0.2, 1.15, 8, hip]] as const) {
        p.push({ g: capsule(0.07, v(x, 1.1, z), v(x, 0.08, z + 0.05)), part, pivot: v(x, piv.y, piv.z) });
      }
      // shafts and the bed
      for (const x of [-0.55, 0.55]) p.push({ g: stick(0.035, v(x, 1.0, 0.0), v(x * 0.75, 1.15, 1.9), 4), part: 0, pivot: O });
      p.push({ g: box(1.5, 0.12, 2.6, v(0, 0.98, -1.0)), part: 0, pivot: O });
      for (const x of [-0.72, 0.72]) p.push({ g: box(0.06, 0.38, 2.6, v(x, 1.22, -1.0)), part: 0, pivot: O });
      p.push({ g: box(1.5, 0.38, 0.06, v(0, 1.22, -2.28)), part: 0, pivot: O });
      // wheels: rim, hub, four spokes, one axle (turn about it)
      const axle = v(0, 0.62, -1.0);
      for (const x of [-0.84, 0.84]) {
        const rim = new CylinderGeometry(0.62, 0.62, 0.07, 14, 1, true);
        rim.rotateZ(Math.PI / 2);
        rim.translate(x, axle.y, axle.z);
        p.push({ g: rim, part: 6, pivot: axle });
        for (let s = 0; s < 4; s++) {
          const a = (s / 4) * Math.PI;
          const d = v(0, Math.cos(a) * 0.6, Math.sin(a) * 0.6);
          p.push({ g: stick(0.025, axle.clone().setX(x).sub(d), axle.clone().setX(x).add(d), 4), part: 6, pivot: axle });
        }
      }
      p.push({ g: stick(0.05, v(-0.9, axle.y, axle.z), v(0.9, axle.y, axle.z), 5), part: 6, pivot: axle });
      // the straw load: a heap that shrinks as it is unloaded (and goes when the Strohmann rises)
      const heap = new SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      heap.scale(0.95, 1.05, 1.5);
      heap.translate(0, 1.04, -1.0);
      p.push({ g: heap, part: 7, pivot: v(0, 1.04, -1.0), shade: 2 });
      p.push({ g: box(1.4, 0.5, 2.5, v(0, 1.3, -1.0)), part: 7, pivot: v(0, 1.04, -1.0), shade: 2 });
      break;
    }
  }
  return p;
}

/** Merge a kind's pieces into one geometry with aPart, aPivot and aShade (local space). */
export function ghostGeometry(kind: GhostKind): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const piv: number[] = [];
  const shade: number[] = [];
  for (const pc of pieces(kind)) {
    const g = pc.g.index ? pc.g.toNonIndexed() : pc.g;
    g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      part.push(pc.part);
      piv.push(pc.pivot.x, pc.pivot.y, pc.pivot.z);
      shade.push(pc.shade ?? 0);
    }
    if (g !== pc.g) g.dispose();
    pc.g.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  g.setAttribute('aPivot', new BufferAttribute(new Float32Array(piv), 3));
  g.setAttribute('aShade', new BufferAttribute(new Float32Array(shade), 1));
  g.computeBoundingSphere();
  return g;
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
attribute float aPart;
attribute vec3 aPivot;
attribute float aShade;
attribute vec4 iA; // walk phase (rad), walk amount 0..1, fade 0..1, seed
attribute vec4 iB; // raise 0..1, load 0..1, wheel angle (rad), height (m, 0 = from the matrix)
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vSeed;
varying float vFade;
varying float vShade;

vec3 rotX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

void main() {
  vec3 p = position;
  vec3 n = normal;
  float w = iA.x;
  float amt = iA.y * uMotion;
  float a = 0.0;
  if (aPart > 0.5 && aPart < 2.5) a = sin(w + (aPart > 1.5 ? 3.14159 : 0.0)) * 0.5 * amt;
  else if (aPart > 2.5 && aPart < 4.5) a = sin(w + (aPart > 3.5 ? 0.0 : 3.14159)) * 0.42 * amt;
  else if (aPart > 4.5 && aPart < 5.5) a = -2.75 * iB.x + sin(w) * 0.3 * amt * (1.0 - iB.x);
  else if (aPart > 5.5 && aPart < 6.5) a = iB.z;
  else if (aPart > 7.5) a = sin(w + (aPart > 8.5 ? 3.14159 : 0.0)) * 0.45 * amt;
  if (abs(a) > 1e-4) {
    p = aPivot + rotX(p - aPivot, a);
    n = rotX(n, a);
  }
  if (aPart > 6.5 && aPart < 7.5) {
    // the load: a shaggy heap (stalks sticking out), squashed down onto the bed, gone at 0
    float sh = sin(dot(position, vec3(41.3, 57.7, 33.1))) * 0.5 + 0.5;
    p += normal * (sh * sh * 0.22 - 0.04) * step(aPivot.y + 0.05, position.y);
    p.y = aPivot.y + (p.y - aPivot.y) * iB.y;
    p.xz = aPivot.xz + (p.xz - aPivot.xz) * mix(0.6, 1.0, iB.y);
  }
  // a slow sway like smoke in a draught, stronger higher up; the feet dissolve
  float h = clamp(p.y / 1.8, 0.0, 1.0);
  float t = uTime * uMotion;
  p.x += (0.02 * sin(t * 0.47 + iA.w * 7.0) + 0.01 * sin(t * 1.7 + p.y * 3.0)) * h;
  p.z += 0.014 * sin(t * 0.38 + 1.3 + iA.w * 5.0) * h;
  float foot = 1.0 - smoothstep(0.0, 0.25, h);
  p.x += foot * 0.04 * sin(t * 1.3 + p.z * 9.0 + iA.w);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vY = h;
  vSeed = iA.w;
  vFade = iA.z;
  vShade = aShade;
  gl_Position = iA.z < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uTint;
uniform float uAlpha;
uniform float uMotion;
uniform float uWarm;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vSeed;
varying float vFade;
varying float vShade;
void main() {
  float t = uTime * uMotion;
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(n, v) < 0.0) n = -n;
  float nm = kqFbm(vec2(vWp.x * 3.1 + vWp.z * 2.3, vY * 5.0 - t * 0.6 + vSeed * 3.0));
  float smoke = smoothstep(0.02, 0.4, vY + (nm - 0.5) * 0.4);
  float holes = kqFbm(vec2(vWp.x * 4.0 - t * 0.21, vWp.y * 3.0 + vWp.z * 2.5 - t * 0.33) + vSeed);
  smoke *= mix(0.62 + 0.5 * holes, 1.0, smoothstep(0.6, 0.85, vY));
  float lamb = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec2 fc = gl_FragCoord.xy;
  float h1 = abs(fract((fc.x + fc.y) * 0.17) - 0.5);
  float h2 = abs(fract((fc.x - fc.y) * 0.17) - 0.5);
  float dark = 1.0 - lamb;
  float hatch = smoothstep(0.32, 0.2, h1) * step(0.35, dark) + smoothstep(0.32, 0.2, h2) * step(0.62, dark);
  float rim = pow(1.0 - abs(dot(n, v)), 1.5);
  float d = length(vWp - uCamPos);
  float keep = exp(-d * (uFogDensity * 1.2 + 0.0025));
  // never a smoke wall in the lens: thin out close to the camera
  float near = smoothstep(0.9, 2.6, d);
  float flick = 0.9 + 0.1 * sin(t * 1.9 + vSeed * 9.0);
  // a dark smoke body that reads against the bright court, a pale warm rim, hatching in the shade
  float body = 0.5 + 0.22 * hatch + 0.38 * rim;
  if (vShade > 1.5) body = 0.72 + 0.15 * rim;
  float a = min(0.92, uAlpha * vFade * smoke * keep * near * body * flick);
  if (a < 0.004) discard;
  vec3 ink = vec3(0.045, 0.035, 0.028) + uSunColor * 0.03 * lamb;
  vec3 col = mix(ink, uTint * 0.9, clamp(pow(rim, 3.0) * 1.2, 0.0, 1.0));
  if (vShade > 0.5 && vShade < 1.5) col = mix(col, uTint * vec3(1.0, 0.85, 0.55), 0.5);
  if (vShade > 1.5) {
    // straw: golden stalks, darker in the shade, streaked
    float streak = kqNoise(vec2(vWp.x * 9.0 + vWp.z * 9.0, vWp.y * 38.0));
    vec3 lo = vec3(0.09, 0.055, 0.02);
    vec3 hi = vec3(0.38, 0.25, 0.08);
    col = mix(lo, hi, clamp(0.25 + 0.6 * lamb + 0.35 * rim + (streak - 0.5) * 0.7, 0.0, 1.0));
  }
  // the fire behind them warms the edges
  col += uGlowColor * uWarm * rim * 0.25;
  gl_FragColor = vec4(col, a);
}
`;

export function ghostMaterial(tint = new Color(0.95, 0.82, 0.62)): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...atmosphere, uTint: { value: tint }, uAlpha: { value: 1 }, uMotion: { value: 1 }, uWarm: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
  });
}

/** Per-instance pose written by the crowd every frame. */
export interface GhostPose {
  x: number;
  y: number;
  z: number;
  /** Facing (radians; 0 = local +z = south; the figure walks along +z). */
  yaw: number;
  walk: number;
  walkAmt: number;
  fade: number;
  seed: number;
  raise: number;
  load: number;
  wheel: number;
  scale: number;
}

/** One InstancedMesh per kind, sized for `max` instances. */
export class GhostBatch {
  readonly mesh: InstancedMesh;
  private readonly a: InstancedBufferAttribute;
  private readonly b: InstancedBufferAttribute;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly t = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  count = 0;

  constructor(
    readonly kind: GhostKind,
    readonly max: number,
    material: ShaderMaterial,
  ) {
    const g = ghostGeometry(kind);
    this.a = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.b = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.a.setUsage(DynamicDrawUsage);
    this.b.setUsage(DynamicDrawUsage);
    g.setAttribute('iA', this.a);
    g.setAttribute('iB', this.b);
    this.mesh = new InstancedMesh(g, material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = `k3-ghosts-${kind}`;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  push(p: GhostPose): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.q.setFromAxisAngle(this.up, p.yaw);
    this.s.setScalar(p.scale);
    this.t.set(p.x, p.y, p.z);
    this.m.compose(this.t, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.a.setXYZW(i, p.walk, p.walkAmt, p.fade, p.seed);
    this.b.setXYZW(i, p.raise, p.load, p.wheel, 0);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.a.needsUpdate = true;
    this.b.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
