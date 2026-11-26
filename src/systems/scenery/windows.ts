/**
 * Lit windows (bible 2.3: "In Mannlichs Fenstern brennt Licht"): warm panes over the palace
 * model's own glass (found with the interiors' pure `extractOpenings`), a soft halo at each and
 * light pools spilling onto the ground in front. One mesh per building and era; a story cue turns
 * them on (`story:cue {id:'scenery:windows', data:{building, era?, on?, share?}}`).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, InstancedBufferAttribute, Mesh, ShaderMaterial } from 'three';
import type { Footprint } from '../../data/types';
import { pointInRing } from '../../world/collision';
import { atmosphere } from '../../world/atmosphere';
import { extractOpenings } from '../interiors/shell';
import { glowMaterial, poolMaterial } from './material';
import { instancedQuad } from './smoke';

const PANE_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = aUv;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const PANE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOn;
uniform vec3 uColor;
varying vec2 vUv;
varying float vSeed;
void main() {
  // glazing bars: two columns, four rows of panes
  vec2 g = vec2(vUv.x * 2.0, vUv.y * 4.0);
  vec2 f = abs(fract(g) - 0.5);
  float bar = step(0.44, max(f.x, f.y));
  // drawn curtains on some, a lamp low in the room: brighter at the bottom middle
  float lamp = exp(-pow((vUv.x - 0.5 + 0.2 * sin(vSeed * 9.0)) * 2.2, 2.0)) * mix(1.0, 0.45, vUv.y);
  float curtain = step(0.6, fract(vSeed * 7.13)) * smoothstep(0.35, 0.0, min(vUv.x, 1.0 - vUv.x));
  float flick = 0.88 + 0.12 * sin(uTime * (3.0 + vSeed * 2.0) + vSeed * 30.0) * sin(uTime * 1.7 + vSeed * 11.0);
  vec3 col = uColor * (0.35 + 0.9 * lamp) * flick * (1.0 - 0.55 * curtain);
  col *= 1.0 - bar * 0.85;
  gl_FragColor = vec4(col * uOn, 1.0);
}
`;

export interface LitWindows {
  group: Group;
  count: number;
  setOn(v: number): void;
  dispose(): void;
}

/** Build the lit windows of one building (palace merged mesh + its footprint). */
export function buildLitWindows(
  paletteGeo: BufferGeometry,
  index: number,
  fp: Footprint,
  heightAt: (x: number, z: number) => number,
  share = 0.7,
): LitWindows | null {
  if (share <= 0) return null;
  const openings = extractOpenings(paletteGeo, new Map([[index, fp.id]])).filter((o) => o.kind === 'window');
  if (!openings.length) return null;
  const ring = fp.ring as [number, number][];
  const pos: number[] = [];
  const uv: number[] = [];
  const seeds: number[] = [];
  const sprites: number[] = [];
  const tints: number[] = [];
  const pools: number[] = [];
  const poolUv: number[] = [];
  const poolA: number[] = [];
  const warm = new Color(3.0, 1.75, 0.75);
  let n = 0;
  openings.forEach((o, i) => {
    const h = Math.sin((i + 1) * 78.233 + o.ax * 0.13) * 43758.5453;
    const seed = h - Math.floor(h);
    if (seed > share) return;
    const len = Math.hypot(o.bx - o.ax, o.bz - o.az);
    if (len < 0.4) return;
    const tx = (o.bx - o.ax) / len;
    const tz = (o.bz - o.az) / len;
    let nx = -tz;
    let nz = tx;
    const mx = (o.ax + o.bx) / 2;
    const mz = (o.az + o.bz) / 2;
    if (pointInRing(mx + nx * 0.8, mz + nz * 0.8, ring)) {
      nx = -nx;
      nz = -nz;
    }
    const off = 0.05;
    const ax = o.ax + nx * off;
    const az = o.az + nz * off;
    const bx = o.bx + nx * off;
    const bz = o.bz + nz * off;
    // quad facing outwards (counter-clockwise seen from outside)
    const quad = [
      [ax, o.y0, az, 0, 0],
      [bx, o.y0, bz, 1, 0],
      [bx, o.y1, bz, 1, 1],
      [ax, o.y1, az, 0, 1],
    ] as const;
    const outward = (bx - ax) * nz - (bz - az) * nx; // sign of the winding seen from outside
    const idx = outward > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of idx) {
      const q = quad[k]!;
      pos.push(q[0], q[1], q[2]);
      uv.push(q[3], q[4]);
      seeds.push(seed);
    }
    // halo just outside the pane
    const cy = (o.y0 + o.y1) / 2;
    sprites.push(mx + nx * 0.5, cy, mz + nz * 0.5, Math.max(1.6, (o.y1 - o.y0) * 1.5));
    tints.push(warm.r * 0.16, warm.g * 0.16, warm.b * 0.16, seed * 10);
    // the spill on the ground: a quad from the wall outwards, draped on 2 × 5 samples
    const ground = heightAt(mx + nx * 1.5, mz + nz * 1.5);
    const above = o.y0 - ground;
    if (above < 12) {
      const reach = 3.2 + above * 0.55;
      const w = len * (1.4 + above * 0.08);
      const strength = Math.max(0.12, 0.55 - above * 0.04);
      const rows = 5;
      const pt = (s: number, t: number): [number, number, number] => {
        const x = mx + tx * s * w * 0.5 + nx * (0.4 + t * reach);
        const z = mz + tz * s * w * 0.5 + nz * (0.4 + t * reach);
        return [x, heightAt(x, z) + 0.06, z];
      };
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        const c = [pt(-1, t0), pt(1, t0), pt(1, t1), pt(-1, t1)];
        const uvs = [[0, t0], [1, t0], [1, t1], [0, t1]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pools.push(...c[k]!);
          poolUv.push(uvs[k]![0]!, uvs[k]![1]!);
          poolA.push(strength);
        }
      }
    }
    n++;
  });
  if (!n) return null;
  const group = new Group();
  group.name = `scenery-windows-${fp.id}`;
  const pg = new BufferGeometry();
  pg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  pg.setAttribute('aUv', new BufferAttribute(new Float32Array(uv), 2));
  pg.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 1));
  const pm = new ShaderMaterial({ vertexShader: PANE_VERT, fragmentShader: PANE_FRAG, uniforms: { uTime: atmosphere.uTime, uOn: { value: 1 }, uColor: { value: warm.clone().multiplyScalar(0.9) } } });
  pm.polygonOffset = true;
  pm.polygonOffsetFactor = -1;
  pm.polygonOffsetUnits = -1;
  const panes = new Mesh(pg, pm);
  panes.name = 'scenery-windows-panes';
  group.add(panes);
  const sg = instancedQuad();
  sg.setAttribute('aSprite', new InstancedBufferAttribute(new Float32Array(sprites), 4));
  sg.setAttribute('aTint', new InstancedBufferAttribute(new Float32Array(tints), 4));
  sg.instanceCount = sprites.length / 4;
  const sm = glowMaterial(0.5);
  const halos = new Mesh(sg, sm);
  halos.frustumCulled = false;
  halos.renderOrder = 9;
  group.add(halos);
  let poolMat: ShaderMaterial | null = null;
  if (pools.length) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pools), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(poolUv), 2));
    g.setAttribute('aPool', new BufferAttribute(new Float32Array(poolA), 1));
    poolMat = poolMaterial(new Color(1.0, 0.62, 0.3));
    poolMat.blending = AdditiveBlending;
    const pm2 = new Mesh(g, poolMat);
    pm2.renderOrder = 7;
    pm2.name = 'scenery-windows-spill';
    group.add(pm2);
  }
  return {
    group,
    count: n,
    setOn(v) {
      pm.uniforms.uOn!.value = v;
      sm.uniforms.uAlpha!.value = v;
      if (poolMat) poolMat.uniforms.uAlpha!.value = v;
      group.visible = v > 0.001;
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as ShaderMaterial).dispose();
        }
      });
    },
  };
}
