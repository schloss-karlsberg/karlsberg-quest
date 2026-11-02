/**
 * Smoke columns (fire pits, a smouldering heap) and the glow sprites around them: GPU billboards
 * whose age loops on the shared clock, drifting with a slow wind, growing and thinning as they
 * rise. Plus `instancedQuad` (a unit quad for instanced sprites) used by the other effects.
 */
import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

/** A quad (corners in uv 0..1) as the base of an instanced billboard geometry. */
export function instancedQuad(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec4 aSrc;    // x, y, z, column height
attribute vec4 aSeed;   // phase, side, size, life
uniform vec3 uWind;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying vec3 vWp;
void main() {
  float life = aSeed.w;
  float age = fract(uTime / life + aSeed.x);
  vec3 c = aSrc.xyz;
  c.y += age * aSrc.w;
  c += uWind * age * age * aSrc.w * 0.6;
  c.x += sin(uTime * 0.7 + aSeed.x * 20.0) * age * 0.8 + (aSeed.y - 0.5) * 0.6 * age;
  c.z += cos(uTime * 0.6 + aSeed.x * 13.0) * age * 0.8;
  float size = aSeed.z * (0.6 + age * 3.2);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float rot = aSeed.x * 6.28 + uTime * 0.2 * (aSeed.y - 0.5);
  vec2 q = position.xy - 0.5;
  q = vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
  mv.xy += q * size;
  vUv = position.xy;
  vAge = age;
  vSeed = aSeed.x;
  vWp = c;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uAlpha;
uniform vec3 uTint;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying vec3 vWp;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float n = kqFbm(vUv * 2.5 + vec2(vSeed * 9.0, vAge * 2.0 - uTime * 0.05));
  float a = (1.0 - smoothstep(0.3, 1.0, r + (n - 0.5) * 0.6));
  a *= smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge)) * uAlpha;
  if (a < 0.003) discard;
  // grey smoke lit by the sky, a warm underside near the embers
  vec3 col = (uSkyAmbient * 0.9 + uSunColor * 0.18) * uTint;
  col += vec3(1.4, 0.55, 0.15) * (1.0 - smoothstep(0.0, 0.18, vAge)) * 0.6;
  col = kqFog(col, vWp);
  gl_FragColor = vec4(col, a * 0.55);
}
`;

export interface SmokeSource {
  x: number;
  y: number;
  z: number;
  /** Column height (m). */
  height?: number;
  /** Puffs. */
  count?: number;
  /** Puff size (m). */
  size?: number;
}

/** One mesh for all smoke columns of a set. */
export function smokeMesh(sources: SmokeSource[]): Mesh {
  const g = instancedQuad();
  const src: number[] = [];
  const seed: number[] = [];
  let k = 0;
  for (const s of sources) {
    const n = s.count ?? 36;
    for (let i = 0; i < n; i++) {
      const h = Math.sin((k + 1) * 12.9898) * 43758.5453;
      const f = h - Math.floor(h);
      src.push(s.x, s.y, s.z, s.height ?? 9);
      seed.push(i / n + f * 0.03, f, (s.size ?? 0.9) * (0.7 + f * 0.6), 7 + f * 3);
      k++;
    }
  }
  g.setAttribute('aSrc', new InstancedBufferAttribute(new Float32Array(src), 4));
  g.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(seed), 4));
  g.instanceCount = k;
  const m = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...atmosphere, uWind: { value: new Vector3(0.5, 0, 0.2) }, uAlpha: { value: 1 }, uTint: { value: new Vector3(0.62, 0.6, 0.58) } },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.name = 'scenery-smoke';
  return mesh;
}
