/**
 * Ghostly workers of a memory (the stonebreakers of 1796, the masons of 1789): static smoke
 * silhouettes in the NPC style (sepia, screen-space hatching, a fresnel rim, feet dissolving into
 * smoke), each repeating one motion on the GPU — a sledge raised and brought down, a pick, a
 * crowbar levered, a load carried on the shoulder. They do not talk and do not block; they are
 * set dressing. One merged mesh per set (one draw call); every vertex knows its worker's pivot,
 * swing axis and phase.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  NormalBlending,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  BoxGeometry,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

export type WorkerPose = 'sledge' | 'pick' | 'lever' | 'carry' | 'stand';

export interface WorkerSpec {
  x: number;
  z: number;
  /** Facing (radians; 0 = local +z = south). */
  yaw: number;
  pose: WorkerPose;
  /** Seconds offset of the motion. */
  phase?: number;
  /** Height in metres (default 1.72). */
  height?: number;
  /** Ground height override (a worker on a scaffold). */
  y?: number;
}

/** Strike period of a pose (s); 0 = no strike. */
export const STRIKE_PERIOD: Record<WorkerPose, number> = { sledge: 2.6, pick: 2.1, lever: 3.4, carry: 0, stand: 0 };

/** Seconds into the cycle at which the tool lands (for the clink). */
export const STRIKE_AT = 0.78;

interface Piece {
  g: BufferGeometry;
  /** 0 body, 1 swinging (arms + tool), 2 head */
  part: number;
}

function capsule(r: number, a: Vector3, b: Vector3): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 3, 8);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Figure pieces in figure space (feet at y = 0, facing +z). */
function pieces(pose: WorkerPose, H: number): Piece[] {
  const s = H / 1.72;
  const p: Piece[] = [];
  const head = new SphereGeometry(0.105 * s, 10, 8);
  head.scale(0.92, 1.08, 1);
  head.translate(0, 1.6 * s, 0.02);
  p.push({ g: head, part: 2 });
  // a worker's cap
  const cap = new SphereGeometry(0.115 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.62, 1.08);
  cap.translate(0, 1.66 * s, 0.02);
  p.push({ g: cap, part: 2 });
  const bend = pose === 'sledge' || pose === 'pick' || pose === 'lever' ? 0.12 : 0;
  // torso, leaning into the work
  p.push({ g: capsule(0.17 * s, v(0, 1.02 * s, 0), v(0, 1.36 * s, bend * s)).scale(1.08, 1, 0.66), part: 0 });
  // legs apart
  for (const side of [-1, 1]) {
    const stance = pose === 'carry' ? 0.1 : 0.16;
    p.push({ g: capsule(0.068 * s, v(side * 0.09 * s, 0.96 * s, 0), v(side * stance * s, 0.5 * s, side * 0.06 * s)), part: 0 });
    p.push({ g: capsule(0.055 * s, v(side * stance * s, 0.5 * s, side * 0.06 * s), v(side * (stance + 0.02) * s, 0.06 * s, side * 0.1 * s)), part: 0 });
  }
  // arms (+ tool) — modelled at the top of the swing for the tools (the shader swings them down)
  const sh = 1.39 * s;
  if (pose === 'carry') {
    // a block on the shoulder, one arm up to hold it, one hanging
    p.push({ g: capsule(0.045 * s, v(0.21 * s, sh, 0.02), v(0.26 * s, 1.62 * s, 0.05)), part: 0 });
    p.push({ g: capsule(0.045 * s, v(-0.21 * s, sh, 0), v(-0.25 * s, 0.9 * s, 0.08)), part: 0 });
    const blk = new BoxGeometry(0.42 * s, 0.3 * s, 0.6 * s);
    blk.translate(0.2 * s, 1.62 * s, 0);
    p.push({ g: blk, part: 0 });
  } else if (pose === 'stand') {
    for (const side of [-1, 1]) p.push({ g: capsule(0.045 * s, v(side * 0.21 * s, sh, 0), v(side * 0.24 * s, 0.88 * s, 0.1 * s)), part: 0 });
  } else {
    // both hands together on the handle, arms forward (part 1 swings about the shoulder axis)
    const hand = v(0, sh + 0.05 * s, 0.55 * s);
    for (const side of [-1, 1]) p.push({ g: capsule(0.044 * s, v(side * 0.2 * s, sh, 0.02), hand), part: 1 });
    const len = pose === 'lever' ? 1.5 : 0.95;
    const tipEnd = v(0, sh + 0.05 * s + len * 0.15, 0.55 * s + len * s);
    const handle = new CylinderGeometry(0.022 * s, 0.022 * s, len * s, 6);
    handle.applyMatrix4(new Matrix4().compose(hand.clone().add(tipEnd).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(v(0, 1, 0), tipEnd.clone().sub(hand).normalize()), v(1, 1, 1)));
    p.push({ g: handle, part: 1 });
    if (pose === 'sledge') {
      const head2 = new BoxGeometry(0.13 * s, 0.13 * s, 0.24 * s);
      head2.translate(tipEnd.x, tipEnd.y, tipEnd.z);
      p.push({ g: head2, part: 1 });
    } else if (pose === 'pick') {
      const pick = new BoxGeometry(0.04 * s, 0.52 * s, 0.05 * s);
      pick.translate(tipEnd.x, tipEnd.y, tipEnd.z);
      p.push({ g: pick, part: 1 });
    }
  }
  return p;
}

/** Merge workers into one geometry with the motion attributes (world space). */
export function workersGeometry(list: WorkerSpec[], heightAt: (x: number, z: number) => number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const piv: number[] = [];
  const axis: number[] = [];
  const motion: number[] = [];
  list.forEach((w, wi) => {
    const H = w.height ?? 1.72;
    const y = w.y ?? heightAt(w.x, w.z);
    const m = new Matrix4().compose(v(w.x, y, w.z), new Quaternion().setFromAxisAngle(v(0, 1, 0), w.yaw), v(1, 1, 1));
    const shoulder = v(0, 1.39 * (H / 1.72), 0).applyMatrix4(m);
    const right = v(1, 0, 0).applyAxisAngle(v(0, 1, 0), w.yaw);
    const kind = ['sledge', 'pick', 'lever', 'carry', 'stand'].indexOf(w.pose);
    const ph = w.phase ?? wi * 0.77;
    for (const pc of pieces(w.pose, H)) {
      const g = pc.g.index ? pc.g.toNonIndexed() : pc.g;
      g.applyMatrix4(m);
      g.computeVertexNormals();
      const P = g.getAttribute('position');
      const N = g.getAttribute('normal');
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        part.push(pc.part);
        piv.push(shoulder.x, shoulder.y, shoulder.z);
        axis.push(right.x, right.z, H, y);
        motion.push(kind, ph, wi * 1.37, 0);
      }
      if (g !== pc.g) g.dispose();
      pc.g.dispose();
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  g.setAttribute('aPivot', new BufferAttribute(new Float32Array(piv), 3));
  g.setAttribute('aAxis', new BufferAttribute(new Float32Array(axis), 4));
  g.setAttribute('aMotion', new BufferAttribute(new Float32Array(motion), 4));
  g.computeBoundingSphere();
  return g;
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 aAxis;    // right.x, right.z, height, ground y
attribute vec4 aMotion;  // pose, phase, seed
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vSeed;

vec3 rotAxis(vec3 p, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c);
}

// 0 = raised, 1 = struck: slow lift, fast fall, a rest on the stone
float strike(float t, float period) {
  float u = fract(t / period);
  if (u < 0.55) return 1.0 - smoothstep(0.0, 0.55, u) ;
  if (u < 0.78) return pow(smoothstep(0.55, 0.78, u), 2.2);
  return 1.0;
}

void main() {
  vec3 p = position;
  vec3 n = normal;
  float pose = aMotion.x;
  float t = uTime * uMotion + aMotion.y;
  vec3 right = normalize(vec3(aAxis.x, 0.0, aAxis.y));
  if (aPart > 0.5 && aPart < 1.5) {
    float period = pose < 0.5 ? 2.6 : pose < 1.5 ? 2.1 : 3.4;
    float k = strike(t, period);
    // tools are modelled raised; bring them down (sledge/pick) or lever them (bar)
    float a = pose < 1.5 ? mix(-1.45, 1.05, k) : mix(0.55, 0.95, 0.5 + 0.5 * sin(t * 1.8));
    p = aPivot + rotAxis(p - aPivot, right, a);
    n = rotAxis(n, right, a);
  }
  // a slow sway like smoke in a draught, stronger higher up
  float h = clamp((p.y - aAxis.w) / aAxis.z, 0.0, 1.0);
  p.x += (0.02 * sin(t * 0.47 + aMotion.z) + 0.01 * sin(t * 1.7 + p.y * 3.0)) * h;
  p.z += 0.014 * sin(t * 0.38 + 1.3 + aMotion.z) * h;
  float foot = 1.0 - smoothstep(0.0, 0.3, h);
  p.x += foot * 0.05 * sin(t * 1.3 + p.z * 9.0);
  p.z += foot * 0.05 * cos(t * 1.1 + p.x * 9.0);
  vWp = p;
  vN = n;
  vY = h;
  vSeed = aMotion.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uTint;
uniform float uAlpha;
uniform float uMotion;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vSeed;
void main() {
  float t = uTime * uMotion;
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(n, v) < 0.0) n = -n;
  float nm = kqFbm(vec2(vWp.x * 3.1 + vWp.z * 2.3, vY * 5.0 - t * 0.6 + vSeed));
  float smoke = smoothstep(0.03, 0.5, vY + (nm - 0.5) * 0.45);
  float holes = kqFbm(vec2(vWp.x * 5.0 - t * 0.21, vWp.y * 4.0 + vWp.z * 3.0 - t * 0.33) + vSeed);
  smoke *= mix(0.55 + 0.6 * holes, 1.0, smoothstep(0.7, 0.9, vY));
  float lamb = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec2 fc = gl_FragCoord.xy;
  float h1 = abs(fract((fc.x + fc.y) * 0.17) - 0.5);
  float h2 = abs(fract((fc.x - fc.y) * 0.17) - 0.5);
  float dark = 1.0 - lamb;
  float hatch = smoothstep(0.32, 0.2, h1) * step(0.35, dark) + smoothstep(0.32, 0.2, h2) * step(0.62, dark);
  float rim = pow(1.0 - abs(dot(n, v)), 1.6);
  float d = length(vWp - uCamPos);
  float keep = exp(-d * (uFogDensity * 1.4 + 0.003));
  float flick = 0.86 + 0.14 * sin(t * 1.9 + vSeed);
  float a = uAlpha * smoke * keep * (0.16 + 0.34 * hatch + 0.32 * rim) * flick;
  if (a < 0.004) discard;
  vec3 ink = vec3(0.07, 0.055, 0.04);
  vec3 col = mix(ink, uTint, clamp(rim * 1.3, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

export function workersMaterial(tint = new Color(0.9, 0.78, 0.6)): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...atmosphere, uTint: { value: tint }, uAlpha: { value: 1 }, uMotion: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
  });
}

export function workersMesh(list: WorkerSpec[], heightAt: (x: number, z: number) => number): Mesh {
  const m = new Mesh(workersGeometry(list, heightAt), workersMaterial());
  m.name = 'scenery-workers';
  m.frustumCulled = false;
  m.renderOrder = 6;
  return m;
}
