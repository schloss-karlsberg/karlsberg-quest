/**
 * Relief scan pulse: when a scan mode (1–3) is switched on, a sonar-like ring runs out over the
 * terrain to the edge of the scan bubble; behind it the relief shimmers and banks, ditches and
 * mounds flash up briefly (local relief computed from the heightfield).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { Heightfield } from '../../../world/heightfield';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';

export const PULSE_RADIUS = 172;
export const PULSE_LIFE = 2.4;

const VERT = /* glsl */ `
attribute float aRelief;
varying vec3 vWorld;
varying float vRelief;
void main() {
  vWorld = position;
  vRelief = aRelief;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uCenter;
uniform float uR;
uniform float uFade;
uniform int uMode;
uniform float uReduced;
varying vec3 vWorld;
varying float vRelief;
void main() {
  float d = length(vWorld.xz - uCenter.xz);
  if (d > ${PULSE_RADIUS.toFixed(1)}) discard;
  float edge = 1.0 - smoothstep(${(PULSE_RADIUS - 12).toFixed(1)}, ${PULSE_RADIUS.toFixed(1)}, d);
  float ring = exp(-pow((d - uR) / 1.6, 2.0)) + 0.35 * exp(-pow((d - uR + 7.0) / 1.0, 2.0));
  float behind = step(d, uR) * exp(-(uR - d) / 28.0);
  if (uReduced > 0.5) { ring = 0.0; behind = step(d, uR); }
  // shimmering survey grain behind the ring
  float sparkle = uReduced > 0.5 ? 0.0 : smoothstep(0.82, 1.0, kqNoise(vWorld.xz * 2.3 + uTime * 6.0)) * behind;
  float rel = clamp(vRelief / 0.9, -1.0, 1.0);
  vec3 col;
  if (uMode == 2) col = rel > 0.0 ? vec3(1.6, 0.35, 0.25) : vec3(0.3, 0.6, 1.7);
  else if (uMode == 3) col = vec3(1.4, 1.25, 0.95);
  else col = vec3(1.7, 1.35, 0.8);
  vec3 ringCol = vec3(1.8, 1.35, 0.7);
  float feat = smoothstep(0.12, 0.7, abs(rel)) * behind;
  // contour flicker every 1 m in the wake: the relief "draws itself"
  float c1 = 1.0 - smoothstep(0.0, 0.08, abs(fract(vWorld.y) - 0.5) - 0.42);
  vec3 outc = ringCol * ring * 1.4 + col * feat * 0.9 + vec3(1.2, 1.1, 0.9) * sparkle * 0.5 + col * c1 * behind * 0.12;
  float a = uFade * edge;
  gl_FragColor = vec4(outc * a, 1.0);
}
`;

/** Local relief (h − mean of a 6 m ring) and heights for a draped grid around (cx, cz). */
export function drapeGrid(hf: Heightfield, cx: number, cz: number, radius: number, cell: number): { pos: Float32Array; relief: Float32Array; index: Uint32Array; n: number } {
  const n = Math.ceil((radius * 2) / cell) + 1;
  const x0 = Math.round((cx - radius) / cell) * cell;
  const z0 = Math.round((cz - radius) / cell) * cell;
  const pos = new Float32Array(n * n * 3);
  const relief = new Float32Array(n * n);
  const k = 3 * cell;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      const h = hf.heightAt(x, z);
      const v = j * n + i;
      pos[v * 3] = x;
      pos[v * 3 + 1] = h + 0.12;
      pos[v * 3 + 2] = z;
      const m = (hf.heightAt(x + k, z) + hf.heightAt(x - k, z) + hf.heightAt(x, z + k) + hf.heightAt(x, z - k)) / 4;
      relief[v] = h - m;
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      index[q++] = a;
      index[q++] = a + n;
      index[q++] = a + 1;
      index[q++] = a + 1;
      index[q++] = a + n;
      index[q++] = a + n + 1;
    }
  }
  return { pos, relief, index, n };
}

export class ScanPulse {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private t = PULSE_LIFE;
  private reduced = false;

  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...atmosphere,
        uCenter: { value: new Vector3() },
        uR: { value: 0 },
        uFade: { value: 0 },
        uMode: { value: 1 },
        uReduced: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  get running(): boolean {
    return this.t < PULSE_LIFE;
  }

  trigger(hf: Heightfield, x: number, z: number, mode: number, reduced: boolean, hiQuality: boolean): void {
    const g = drapeGrid(hf, x, z, PULSE_RADIUS, hiQuality ? 2 : 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.pos, 3));
    geo.setAttribute('aRelief', new BufferAttribute(g.relief, 1));
    geo.setIndex(new BufferAttribute(g.index, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    (this.mat.uniforms.uCenter!.value as Vector3).set(x, 0, z);
    this.mat.uniforms.uMode!.value = mode;
    this.mat.uniforms.uReduced!.value = reduced ? 1 : 0;
    this.reduced = reduced;
    this.t = 0;
    this.mesh.visible = true;
  }

  /** Debug: hold the pulse at a time (s). */
  setTime(t: number): void {
    this.t = t;
    this.apply();
  }

  frame(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt;
    this.apply();
  }

  private apply(): void {
    if (this.t >= PULSE_LIFE) {
      this.mesh.visible = false;
      return;
    }
    const x = Math.min(1, this.t / 1.7);
    const r = this.reduced ? PULSE_RADIUS : PULSE_RADIUS * (1 - Math.pow(1 - x, 2.4));
    const fade = this.reduced ? Math.sin((Math.PI * this.t) / PULSE_LIFE) * 0.6 : Math.min(1, this.t / 0.08) * (1 - Math.max(0, (this.t - 1.5) / (PULSE_LIFE - 1.5)));
    this.mat.uniforms.uR!.value = r;
    this.mat.uniforms.uFade!.value = fade;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
