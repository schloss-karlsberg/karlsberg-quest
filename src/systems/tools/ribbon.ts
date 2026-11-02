import { BufferAttribute, BufferGeometry, GreaterDepth, Mesh, ShaderMaterial, Vector3 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { HeightFn } from './geom';

/**
 * Ground lines (plan sheet outlines, pack routes): flat ribbons draped on the terrain. The
 * builder is pure (typed arrays) so it can be unit-tested; `groundLineMaterial` draws them with
 * soft edges, optional dashes, a radius fade around a centre and the shared fog.
 */
export interface RibbonLine {
  /** Polyline of local [x, z]. */
  pts: readonly (readonly [number, number])[];
  closed?: boolean;
  /** Linear rgb 0..1. */
  color: readonly [number, number, number];
  /** Width in m. */
  width: number;
  /** Dash period in m (0 = solid). */
  dash?: number;
  /** Alpha multiplier. */
  alpha?: number;
  /** Fixed height (m) instead of the terrain (e.g. a floor level). */
  y?: number;
}

export interface RibbonArrays {
  position: Float32Array;
  color: Float32Array;
  /** along (m), side (−1..1), dash period, alpha */
  extra: Float32Array;
  index: Uint32Array;
}

/** Build all lines into one set of arrays. Segments are subdivided every `step` m so they follow the ground. */
export function buildRibbons(lines: readonly RibbonLine[], heightAt: HeightFn, lift = 0.12, step = 1.5): RibbonArrays {
  const pos: number[] = [];
  const col: number[] = [];
  const ext: number[] = [];
  const idx: number[] = [];
  for (const L of lines) {
    const pts = L.pts;
    const n = pts.length;
    if (n < 2) continue;
    const segs = L.closed ? n : n - 1;
    let along = 0;
    const hw = L.width / 2;
    for (let s = 0; s < segs; s++) {
      const [ax, az] = pts[s]!;
      const [bx, bz] = pts[(s + 1) % n]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const px = -(bz - az) / len;
      const pz = (bx - ax) / len;
      const k = Math.max(1, Math.ceil(len / step));
      // extend each segment by half a width at both ends so corners close
      const ex = ((bx - ax) / len) * hw;
      const ez = ((bz - az) / len) * hw;
      const base = pos.length / 3;
      for (let i = 0; i <= k; i++) {
        const f = i / k;
        const cx = ax + (bx - ax) * f + (i === 0 ? -ex : i === k ? ex : 0);
        const cz = az + (bz - az) * f + (i === 0 ? -ez : i === k ? ez : 0);
        for (const side of [-1, 1]) {
          const x = cx + px * hw * side;
          const z = cz + pz * hw * side;
          const y = (L.y ?? heightAt(x, z)) + lift;
          pos.push(x, y, z);
          col.push(L.color[0], L.color[1], L.color[2]);
          ext.push(along + f * len, side, L.dash ?? 0, L.alpha ?? 1);
        }
        if (i > 0) {
          const a = base + (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      along += len;
    }
  }
  return { position: new Float32Array(pos), color: new Float32Array(col), extra: new Float32Array(ext), index: new Uint32Array(idx) };
}

export function ribbonGeometry(a: RibbonArrays, geo = new BufferGeometry()): BufferGeometry {
  geo.setAttribute('position', new BufferAttribute(a.position, 3));
  geo.setAttribute('color', new BufferAttribute(a.color, 3));
  geo.setAttribute('aExtra', new BufferAttribute(a.extra, 4));
  geo.setIndex(new BufferAttribute(a.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

const VERT = /* glsl */ `
attribute vec3 color;
attribute vec4 aExtra;
varying vec3 vColor;
varying vec4 vExtra;
varying vec3 vWorld;
void main() {
  vColor = color;
  vExtra = aExtra;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform vec3 uCenter;
uniform float uRadius;
uniform float uOpacity;
uniform float uFlow;      // dash flow speed (m/s), 0 = still
uniform float uGlow;      // 0 ink on paper .. 1 emissive
varying vec3 vColor;
varying vec4 vExtra;
varying vec3 vWorld;
void main() {
  float along = vExtra.x;
  float side = vExtra.y;
  float dash = vExtra.z;
  float a = uOpacity * vExtra.w;
  a *= 1.0 - smoothstep(0.55, 1.0, abs(side));
  if (dash > 0.0) {
    float ph = fract((along - uTime * uFlow) / dash);
    a *= smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.55, 0.63, ph));
  }
  float r = length(vWorld.xz - uCenter.xz);
  a *= 1.0 - smoothstep(uRadius * 0.75, uRadius, r);
#ifdef KQ_THROUGH
  a *= 0.4;
#endif
  if (a < 0.01) discard;
  // a little paper-ink unevenness
  float ink = 0.85 + 0.15 * kqNoise(vWorld.xz * 1.7);
  vec3 col = vColor * mix(ink, 1.6, uGlow);
  col = mix(kqFog(col, vWorld), col, uGlow * 0.6);
  gl_FragColor = vec4(col, a);
}
`;

export function groundLineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...atmosphere,
      uCenter: { value: new Vector3() },
      uRadius: { value: 220 },
      uOpacity: { value: 0 },
      uFlow: { value: 0 },
      uGlow: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/**
 * The hidden part of the same lines: a second pass that draws only where something (canopy,
 * a roof) stands in front, faintly, so outlines under the forest still read from the air.
 * Shares the uniforms of `base`; add the returned mesh as a child and keep `geometry` in sync.
 */
export function throughMesh(base: ShaderMaterial): Mesh {
  const m = new ShaderMaterial({
    vertexShader: base.vertexShader,
    fragmentShader: base.fragmentShader,
    uniforms: base.uniforms,
    defines: { KQ_THROUGH: 1 },
    transparent: true,
    depthWrite: false,
    depthFunc: GreaterDepth,
  });
  const mesh = new Mesh(undefined, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'kq-lines-through';
  return mesh;
}
