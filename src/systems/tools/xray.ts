import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { inflate } from '../../data/decode';
import { atmosphere } from '../../world/atmosphere';
import { type GroundPoints, cellsInRadius, decodeGroundPoints } from './xrayData';

/**
 * Röntgenblick: the 2025 ground points under the canopy, glowing, coloured by height, in a
 * disc around the player. Trees in the disc fade (ForestClear, driven by the tools system).
 * Points are re-placed on the current era's terrain (y = heightAt + residual), so the cloud also
 * works in memory eras. A reveal ring sweeps outward when it switches on (fade in reduced motion).
 *
 * Fiction layer (bible prolog P7/P11, labelled FIKTION): a trail of paw prints "in a point cloud
 * recorded in an empty forest" runs from the Ehrenhof towards the Zwinger. They are generated
 * here, never written into the LiDAR data file.
 */
const VERT = /* glsl */ `
attribute float aRes;
attribute float aKind;
attribute float aRand;
uniform float uSize;
uniform float uScale;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uReveal;     // radius of the reveal ring (m)
uniform float uRefH;       // player ground height
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;

vec3 ramp(float t) {
  // deep violet → blue → teal → green → amber (height)
  vec3 c0 = vec3(0.27, 0.12, 0.62);
  vec3 c1 = vec3(0.13, 0.42, 0.95);
  vec3 c2 = vec3(0.10, 0.86, 0.80);
  vec3 c3 = vec3(0.55, 0.95, 0.35);
  vec3 c4 = vec3(1.00, 0.72, 0.22);
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  return mix(c3, c4, t - 3.0);
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float r = length(wp.xz - uCenter.xz);
  vec3 toCam = cameraPosition - wp.xyz;
  float dc = length(toCam);
  // pull the point slightly toward the camera so it sits on (not under) the 2 m terrain mesh
  wp.xyz += toCam / max(dc, 1e-3) * min(0.35, 0.04 + dc * 0.004);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float edge = 1.0 - smoothstep(uRadius * 0.72, uRadius, r);
  float reveal = 1.0 - smoothstep(uReveal - 6.0, uReveal, r);
  float ring = (1.0 - smoothstep(0.0, 4.0, abs(r - uReveal))) * step(uReveal, uRadius * 1.2);
  // height colour: absolute height around the player, micro relief (residual) brightens edges
  float t = 0.5 + (wp.y - uRefH) / 14.0;
  vec3 col = ramp(t);
  float relief = clamp(abs(aRes) / 0.35, 0.0, 1.0);
  col = mix(col, vec3(1.0, 0.97, 0.86), relief * 0.35);
  if (aKind > 0.5 && aKind < 1.5) col = vec3(1.0, 0.55, 0.25);        // cellar / building points
  if (aKind > 1.5) {                                                    // paw prints (FIKTION)
    float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + aRand * 6.28);
    col = vec3(1.0, 0.86, 0.45) * (1.2 + pulse);
  }
  col += vec3(0.9, 0.95, 1.0) * ring * 1.4;
  vColor = col;
  vAlpha = edge * reveal * (0.55 + 0.45 * aRand) + ring * 0.6;
  float size = uSize * (aKind > 1.5 ? 1.8 : 1.0) * (1.0 + ring * 0.8);
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.5), 1.4, 9.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float core = 1.0 - smoothstep(0.0, 0.25, d);
  gl_FragColor = vec4(vColor * (0.55 + 0.9 * core), vAlpha * core);
}
`;

/** Fictional paw trail Ehrenhof → Zwinger (bible: "Die Spuren zeigen auf den Ort, an dem das Spiel endet"). */
export function pawTrail(heightAt: (x: number, z: number) => number): { x: number; y: number; z: number }[] {
  const route: [number, number][] = [
    [1222, -1102],
    [1214, -1150],
    [1196, -1200],
    [1180, -1236],
    [1172, -1290],
    [1188, -1380],
    [1204, -1470],
    [1216, -1560],
  ];
  const out: { x: number; y: number; z: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let s = 0; s + 1 < route.length; s++) {
    const [ax, az] = route[s]!;
    const [bx, bz] = route[s + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    // trot: a print pair every ~0.7 m, alternating sides
    for (let d = 0; d < len; d += 0.72) {
      const side = Math.round(d / 0.72) % 2 === 0 ? 1 : -1;
      const px = ax + ux * d - uz * 0.12 * side;
      const pz = az + uz * d + ux * 0.12 * side;
      // each print = pad + four toes
      const pts: [number, number][] = [
        [0, 0],
        [-0.035, 0.06],
        [-0.012, 0.075],
        [0.012, 0.075],
        [0.035, 0.06],
      ];
      for (const [r, f] of pts) {
        const x = px + ux * f - uz * r + (rnd() - 0.5) * 0.01;
        const z = pz + uz * f + ux * r + (rnd() - 0.5) * 0.01;
        out.push({ x, y: heightAt(x, z) + 0.02, z });
      }
    }
  }
  return out;
}

export class Xray {
  readonly points: Points;
  readonly material: ShaderMaterial;
  private readonly geo = new BufferGeometry();
  private data: GroundPoints | null = null;
  private loading: Promise<void> | null = null;
  private built: { x: number; z: number; era: string; r: number; dense: boolean } | null = null;
  private target = 0;
  mix = 0;
  /** Radius of the disc (m). */
  radius = 70;
  error: string | null = null;
  private trail: { x: number; y: number; z: number }[] | null = null;
  private trailEra = '';
  count = 0;

  constructor(private readonly ctx: GameContext) {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: atmosphere.uTime,
        uSize: { value: 0.11 },
        uScale: { value: 600 },
        uCenter: { value: new Vector3() },
        uRadius: { value: this.radius },
        uReveal: { value: 0 },
        uRefH: { value: 300 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(this.geo, this.material);
    this.points.name = 'kq-xray';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 5;
  }

  get loaded(): boolean {
    return !!this.data;
  }

  /** Load + decode the cloud once (resolves immediately when there is no cloud in the data). */
  load(): Promise<void> {
    if (this.data || !this.ctx.data.meta.pointcloud) return Promise.resolve();
    this.loading ??= (async () => {
      const meta = this.ctx.data.meta.pointcloud!;
      try {
        const res = await fetch(`${this.ctx.data.baseUrl}${meta.path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await inflate(await res.arrayBuffer());
        this.data = decodeGroundPoints(bytes, meta);
      } catch (err) {
        this.error = String(err);
        console.warn('[tools] point cloud failed to load', err);
      }
    })();
    return this.loading;
  }

  set(on: boolean): void {
    this.target = on ? 1 : 0;
    if (on) {
      this.material.uniforms.uReveal!.value = this.ctx.settings.state.reducedMotion ? this.radius * 1.3 : 0;
      this.built = null;
      void this.load();
    }
  }

  get active(): boolean {
    return this.target > 0;
  }

  private rebuild(px: number, pz: number, dense: boolean): void {
    const d = this.data;
    const hf = this.ctx.world.heightfield;
    const era = this.ctx.era.current;
    const R = this.radius * 1.15;
    const pos: number[] = [];
    const resA: number[] = [];
    const kind: number[] = [];
    const rand: number[] = [];
    if (d) {
      const stride = dense ? 1 : 2;
      for (const c of cellsInRadius(d.meta, px, pz, R)) {
        for (let i = d.offsets[c]!; i < d.offsets[c + 1]!; i += stride) {
          const x = d.xs[i]!;
          const z = d.zs[i]!;
          if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
          pos.push(x, hf.heightAt(x, z) + d.res[i]!, z);
          resA.push(d.res[i]!);
          const cl = d.cls[i]!;
          kind.push(cl === 6 || cl === 24 ? 1 : 0);
          rand.push(((i * 2654435761) >>> 0) / 4294967296);
        }
      }
    }
    if (!this.trail || this.trailEra !== era) {
      this.trail = pawTrail((x, z) => hf.heightAt(x, z));
      this.trailEra = era;
    }
    for (const p of this.trail) {
      if ((p.x - px) ** 2 + (p.z - pz) ** 2 > R * R) continue;
      pos.push(p.x, p.y, p.z);
      resA.push(0);
      kind.push(2);
      rand.push((Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) * 43758.5453) % 1);
    }
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    this.geo.setAttribute('aRes', new BufferAttribute(new Float32Array(resA), 1));
    this.geo.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1));
    this.geo.setAttribute('aRand', new BufferAttribute(new Float32Array(rand), 1));
    this.count = pos.length / 3;
    this.built = { x: px, z: pz, era, r: this.radius, dense };
  }

  frame(dt: number, dense: boolean): void {
    const reduced = this.ctx.settings.state.reducedMotion;
    this.mix = reduced ? this.target : this.mix + (this.target - this.mix) * Math.min(1, dt * 4);
    if (Math.abs(this.mix - this.target) < 0.003) this.mix = this.target;
    this.points.visible = this.mix > 0.003 && (!!this.data || !this.ctx.data.meta.pointcloud);
    if (!this.points.visible) return;
    const p = this.ctx.player.position;
    const b = this.built;
    if (!b || Math.hypot(b.x - p.x, b.z - p.z) > 10 || b.era !== this.ctx.era.current || b.dense !== dense || b.r !== this.radius) this.rebuild(p.x, p.z, dense);
    const u = this.material.uniforms;
    (u.uCenter!.value as Vector3).set(p.x, 0, p.z);
    u.uRadius!.value = this.radius * Math.max(0.05, this.mix);
    u.uRefH!.value = this.ctx.world.heightAt(p.x, p.z);
    u.uScale!.value = this.ctx.renderer.domElement.height / (2 * Math.tan((this.ctx.camera.fov * Math.PI) / 360));
    if (this.target > 0 && u.uReveal!.value < this.radius * 1.3) u.uReveal!.value += dt * (reduced ? 1e4 : 75);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
