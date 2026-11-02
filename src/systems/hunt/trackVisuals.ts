/**
 * Prints in the snow as decals: one instanced quad per print, laid into the terrain's tangent
 * plane, shaped procedurally in the fragment shader (boot sole, hound paw with four toes and a
 * pad, a horse's hoof), shaded as a depression (blue shadow inside, a bright rim of pushed-up
 * snow) with the shared moon / lantern light and fog. Age fades them in the shader (uNow), so
 * buffers are rebuilt only when prints are added or dropped.
 *
 * Spurenleser 2 (bible: "Fährtenlinien der Meute"): the pack's prints glow faintly like ember
 * ink, fresher ones brighter — reading the pack's routes.
 */
import { DoubleSide, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { TrackField } from './tracks';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iNrm;
attribute vec4 iData;  // heading, kind (0 boot, 1 paw, 2 hoof), side, time
attribute vec2 iExtra; // depth, owner (0 player, 1 pack)
uniform float uNow;
uniform float uLife;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
varying float vKind;
varying float vAge;
varying float vDepth;
varying float vOwner;
void main() {
  float kind = iData.y;
  // half sizes (m): a print in loose snow is a little larger than the sole that made it
  vec2 hs2 = kind < 0.5 ? vec2(0.095, 0.19) : kind < 1.5 ? vec2(0.08, 0.088) : vec2(0.11, 0.115);
  vec2 q = position.xy * hs2;
  q.x *= kind < 0.5 ? iData.z : 1.0; // left / right boot
  float h = iData.x;
  vec3 n = normalize(iNrm);
  vec3 r = vec3(cos(h), 0.0, -sin(h));
  r = normalize(r - n * dot(r, n));
  vec3 f = cross(n, r);
  // lifted off the heightfield: the rendered terrain LOD can lie a few cm above the samples
  vec3 wp = iPos + r * q.x + f * q.y + n * 0.1;
  vUv = position.xy;
  vWorld = wp;
  vN = n;
  vKind = kind;
  vAge = clamp((uNow - iData.w) / uLife, 0.0, 1.0);
  vDepth = iExtra.x;
  vOwner = iExtra.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uVis;
uniform float uHighlight;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
varying float vKind;
varying float vAge;
varying float vDepth;
varying float vOwner;
float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r) - 1.0; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
void main() {
  vec2 p = vUv;
  float d;
  if (vKind < 0.5) {
    // boot sole: forefoot, waist, heel; a few tread bars
    float fore = ell(p, vec2(0.02, 0.38), vec2(0.86, 0.56));
    float heel = ell(p, vec2(-0.04, -0.62), vec2(0.66, 0.36));
    float waist = ell(p, vec2(-0.02, -0.1), vec2(0.5, 0.5));
    d = smin(smin(fore, heel, 0.25), waist, 0.3);
    d += 0.06 * step(0.0, sin(p.y * 26.0)) * step(-0.3, p.y);
  } else if (vKind < 1.5) {
    // paw: pad + four toes (+ claw nicks)
    d = ell(p, vec2(0.0, -0.32), vec2(0.46, 0.36));
    d = min(d, ell(p, vec2(-0.22, 0.42), vec2(0.2, 0.25)));
    d = min(d, ell(p, vec2(0.22, 0.42), vec2(0.2, 0.25)));
    d = min(d, ell(p, vec2(-0.58, 0.1), vec2(0.18, 0.22)));
    d = min(d, ell(p, vec2(0.58, 0.1), vec2(0.18, 0.22)));
    d = min(d, ell(p, vec2(-0.25, 0.82), vec2(0.06, 0.09)));
    d = min(d, ell(p, vec2(0.25, 0.82), vec2(0.06, 0.09)));
  } else {
    // hoof: an open crescent with the frog in the middle
    float outer = ell(p, vec2(0.0, 0.05), vec2(0.86, 0.9));
    float inner = ell(p, vec2(0.0, -0.18), vec2(0.5, 0.62));
    d = max(outer, -inner);
    d = min(d, ell(p, vec2(0.0, -0.32), vec2(0.16, 0.36)));
  }
  float inside = smoothstep(0.06, -0.06, d);
  float rim = smoothstep(0.32, 0.04, d) * (1.0 - inside);
  float life = 1.0 - smoothstep(0.55, 1.0, vAge);
  float a = (inside * (0.8 + 0.2 * vDepth) + rim * 0.5) * life * uVis;
  if (a < 0.01) discard;
  vec3 snow = vec3(0.86, 0.89, 0.95);
  // inside: a hollow in the snow — blue shadow, darker towards the leading wall
  float wall = 0.65 + 0.35 * smoothstep(-0.6, 0.9, p.y);
  vec3 alb = mix(snow, snow * vec3(0.24, 0.3, 0.46) * wall, inside * (0.65 + 0.35 * vDepth));
  alb = mix(alb, snow * 1.12, rim * 0.6);
  vec3 col = kqLight(alb, vN, vWorld, 1.0, 1.0);
  // Spurenleser: the pack's routes glow like ember ink, fresh ones brighter
  float ink = uHighlight * vOwner * (1.0 - vAge) * (inside * 0.55 + rim * 0.9);
  col += vec3(1.0, 0.42, 0.12) * ink * 0.9;
  col = kqFog(col, vWorld);
  gl_FragColor = vec4(col, a);
}
`;

export class TrackVisuals {
  readonly mesh: Mesh;
  private readonly geo = new InstancedBufferGeometry();
  private readonly mat: ShaderMaterial;
  private readonly pos: InstancedBufferAttribute;
  private readonly nrm: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  private readonly extra: InstancedBufferAttribute;
  private version = -1;
  /** Cached ground per print (heights don't change while a print lives). */
  private readonly ground = new WeakMap<object, { y: number; n: [number, number, number] }>();

  constructor(readonly max = 1800) {
    this.geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(max * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.nrm = mk(3);
    this.data = mk(4);
    this.extra = mk(2);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iNrm', this.nrm);
    this.geo.setAttribute('iData', this.data);
    this.geo.setAttribute('iExtra', this.extra);
    this.geo.instanceCount = 0;
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...atmosphere, uNow: { value: 0 }, uLife: { value: 240 }, uVis: { value: 0 }, uHighlight: { value: 0 } },
      transparent: true,
      depthWrite: false,
      // left boots are mirrored (flipped winding)
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.name = 'hunt-tracks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  frame(o: {
    tracks: TrackField;
    /** 0..1 snow on the ground (prints show only in snow). */
    snow: number;
    /** Spurenleser 2: highlight the pack's routes. */
    highlight: number;
    heightAt(x: number, z: number): number;
    normalAt(x: number, z: number): [number, number, number];
  }): void {
    const T = o.tracks;
    this.mat.uniforms.uNow!.value = T.now;
    this.mat.uniforms.uLife!.value = T.life;
    this.mat.uniforms.uVis!.value = o.snow;
    this.mat.uniforms.uHighlight!.value = o.highlight;
    this.mesh.visible = o.snow > 0.01 && T.prints.length > 0;
    if (T.version === this.version) return;
    this.version = T.version;
    const prints = T.prints;
    const n = Math.min(this.max, prints.length);
    const off = prints.length - n;
    const P = this.pos.array as Float32Array;
    const N = this.nrm.array as Float32Array;
    const D = this.data.array as Float32Array;
    const E = this.extra.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const p = prints[off + k]!;
      let g = this.ground.get(p);
      if (!g) {
        g = { y: o.heightAt(p.x, p.z), n: o.normalAt(p.x, p.z) };
        this.ground.set(p, g);
      }
      P[k * 3] = p.x;
      P[k * 3 + 1] = g.y;
      P[k * 3 + 2] = p.z;
      N[k * 3] = g.n[0];
      N[k * 3 + 1] = g.n[1];
      N[k * 3 + 2] = g.n[2];
      D[k * 4] = p.h;
      D[k * 4 + 1] = p.kind === 'boot' ? 0 : p.kind === 'paw' ? 1 : 2;
      D[k * 4 + 2] = p.side;
      D[k * 4 + 3] = p.t;
      E[k * 2] = p.depth;
      E[k * 2 + 1] = p.kind === 'boot' ? 0 : 1;
    }
    for (const a of [this.pos, this.nrm, this.data, this.extra]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
    }
    this.geo.instanceCount = n;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
