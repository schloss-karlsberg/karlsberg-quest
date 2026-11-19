/**
 * Combat readability for the third-person camera (playtest round 8): soft lock-on.
 *
 * - **Lock** (Tab / middle mouse, `lockOn`): locks the best enemy (near and in front of the view);
 *   pressed again it switches to the next one, with nobody else about it lets go. The lock ends
 *   when the target is undone, leaves, or is more than `LOCK_BREAK` m away. While locked the view
 *   keeps the target inside ±`KEEP_DEG`° (it only turns when the target would slip out, so the
 *   mouse is never fought), and every swing, flare and ability goes at it.
 * - **Soft target** (third person, no lock): the nearest enemy within `SOFT_RANGE` m and
 *   ±`SOFT_DEG`° of the view; swings snap towards it.
 * - **Target ring** under the target (solid brass with four notches when locked, a thin ring when
 *   soft; red-orange and pulsing while it winds up an attack).
 * - **Indicators round the character**: every enemy in the fight that is off-screen gets a chevron
 *   on an ellipse round the character's chest (or round the screen centre in first person),
 *   pointing where it is; red-orange while it winds up.
 *
 * Pure picking (`pickTarget`) is unit-tested in tests/camera.test.ts.
 */
import { AdditiveBlending, Color, Mesh, type PerspectiveCamera, PlaneGeometry, type Scene, ShaderMaterial, Vector3 } from 'three';
import { headingOf, wrapAngle } from './rules';

export interface TargetCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Body radius (m) and height (m above its feet). */
  r: number;
  top: number;
  boss: boolean;
  /** Winding up an attack (telegraph). */
  windup: boolean;
  aggro: boolean;
}

export const LOCK_RANGE = 24;
export const LOCK_BREAK = 30;
export const SOFT_RANGE = 7.5;
export const SOFT_DEG = 70;
export const KEEP_DEG = 26;

/**
 * Best target from (px, pz) looking along `yaw`: near and in front wins (distance plus a penalty
 * for the angle off the view), within `range` and ±`maxDeg`°. `exclude`: skip this id.
 */
export function pickTarget(c: readonly TargetCandidate[], px: number, pz: number, yaw: number, range: number, maxDeg: number, exclude: string | null = null): TargetCandidate | null {
  let best: TargetCandidate | null = null;
  let bs = Infinity;
  for (const e of c) {
    if (e.id === exclude) continue;
    const dx = e.x - px;
    const dz = e.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > range + e.r) continue;
    const ang = Math.abs(wrapAngle(headingOf(dx, dz) - yaw));
    if (ang > (maxDeg * Math.PI) / 180) continue;
    // a metre of distance weighs like ~10° off the view; aggro enemies first, bosses a bit forward
    const s = d + ang * 6 - (e.aggro ? 1.5 : 0) - (e.boss ? 1 : 0);
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  return best;
}

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uLock;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = atan(vUv.y, vUv.x);
  // the ring: a soft band with a dark under-edge (reads on sand, snow and at night)
  float band = smoothstep(0.80, 0.86, r) * (1.0 - smoothstep(0.93, 0.99, r));
  float under = smoothstep(0.70, 0.80, r) * (1.0 - smoothstep(0.86, 0.9, r));
  // locked: four notches pointing in, turning slowly
  float q = fract((a + uTime * 0.6) / 1.5707963);
  float notch = uLock * (1.0 - smoothstep(0.0, 0.06, abs(q - 0.5))) * smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.8, 0.86, r));
  float thin = mix(0.55, 1.0, uLock);
  vec3 col = uCol * (band * thin + notch * 1.2);
  float alpha = (band * thin + notch) * uAlpha;
  // the dark under-edge (normal blending would need a second pass: darken by drawing less light)
  gl_FragColor = vec4(col * (1.0 - under * 0.3), alpha);
}
`;

const _v = new Vector3();
const _n = new Vector3();

export class Targeting {
  /** Locked enemy id (null = none). */
  locked: string | null = null;
  /** Soft target id (third person, no lock). */
  soft: string | null = null;
  private readonly ring: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly el: HTMLElement;
  private readonly chevrons = new Map<string, HTMLElement>();
  private pulse = 0;

  constructor(scene: Scene, layer: HTMLElement) {
    this.mat = new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { uCol: { value: new Color(1, 0.8, 0.45) }, uLock: { value: 1 }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const g = new PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    this.ring = new Mesh(g, this.mat);
    this.ring.name = 'combat-target-ring';
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    this.ring.frustumCulled = false;
    this.ring.userData.noShadow = true;
    scene.add(this.ring);
    this.el = document.createElement('div');
    this.el.className = 'kqc-around';
    this.el.dataset.testid = 'combat-around';
    layer.append(this.el);
    installCss();
  }

  /** The current target's id: locked, else soft. */
  get current(): string | null {
    return this.locked ?? this.soft;
  }

  /** `lockOn` pressed (fixed step). */
  press(c: readonly TargetCandidate[], px: number, pz: number, yaw: number): void {
    if (!this.locked) {
      this.locked = pickTarget(c, px, pz, yaw, LOCK_RANGE, 120)?.id ?? pickTarget(c, px, pz, yaw, LOCK_RANGE, 180)?.id ?? null;
      return;
    }
    // switch: the best one that is not the current; nobody else → let go
    this.locked = pickTarget(c, px, pz, yaw, LOCK_RANGE, 180, this.locked)?.id ?? null;
  }

  /** Every fixed step: keep the lock valid, pick the soft target. */
  update(c: readonly TargetCandidate[], px: number, pz: number, yaw: number, soft: boolean): void {
    if (this.locked) {
      const e = c.find((x) => x.id === this.locked);
      if (!e || Math.hypot(e.x - px, e.z - pz) > LOCK_BREAK) this.locked = null;
    }
    this.soft = soft && !this.locked ? pickTarget(c, px, pz, yaw, SOFT_RANGE, SOFT_DEG)?.id ?? null : null;
  }

  /** The yaw a swing / flare / ability should go along (towards the target), or null. */
  aimYaw(c: readonly TargetCandidate[], px: number, pz: number): number | null {
    const id = this.current;
    if (!id) return null;
    const e = c.find((x) => x.id === id);
    if (!e) return null;
    return headingOf(e.x - px, e.z - pz);
  }

  /** While locked: the view turns only as far as needed to keep the target within ±KEEP_DEG. */
  keepInView(c: readonly TargetCandidate[], px: number, pz: number, yaw: number, dt: number): number {
    if (!this.locked) return yaw;
    const e = c.find((x) => x.id === this.locked);
    if (!e) return yaw;
    const want = headingOf(e.x - px, e.z - pz);
    const d = wrapAngle(want - yaw);
    const keep = (KEEP_DEG * Math.PI) / 180;
    if (Math.abs(d) <= keep) return yaw;
    const over = d - Math.sign(d) * keep;
    return yaw + over * Math.min(1, dt * 5);
  }

  frame(o: { dt: number; time: number; camera: PerspectiveCamera; c: readonly TargetCandidate[]; player: { x: number; y: number; z: number }; third: boolean; heightAt: (x: number, z: number) => number; viewYaw: number; inCombat: boolean; staged: boolean; reducedMotion: boolean; viewportW: number; viewportH: number }): void {
    // ---- the ring
    const id = this.current;
    const e = id ? o.c.find((x) => x.id === id) : undefined;
    this.pulse += o.dt;
    if (e) {
      const r = Math.max(0.6, e.r + 0.35);
      const y = o.heightAt(e.x, e.z);
      this.ring.position.set(e.x, y + 0.06, e.z);
      this.ring.scale.set(r, 1, r);
      // lie on the slope: the normal from four height samples
      const hx = o.heightAt(e.x + r, e.z) - o.heightAt(e.x - r, e.z);
      const hz = o.heightAt(e.x, e.z + r) - o.heightAt(e.x, e.z - r);
      _n.set(-hx, 2 * r, -hz).normalize();
      this.ring.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _n);
      const lock = this.locked === e.id ? 1 : 0;
      this.mat.uniforms.uLock!.value = lock;
      this.mat.uniforms.uTime!.value = o.reducedMotion ? 0 : o.time;
      const warn = e.windup ? 0.6 + 0.4 * Math.abs(Math.sin(this.pulse * (o.reducedMotion ? 3 : 9))) : 0;
      (this.mat.uniforms.uCol!.value as Color).setRGB(1, 0.8 - 0.45 * (warn > 0 ? 1 : 0), 0.45 - 0.3 * (warn > 0 ? 1 : 0)).multiplyScalar(warn > 0 ? 0.6 + warn : 1);
      this.mat.uniforms.uAlpha!.value = lock ? 0.95 : 0.55;
      this.ring.visible = !o.staged;
    } else this.ring.visible = false;
    // ---- indicators round the character for enemies out of the picture
    const seen = new Set<string>();
    if (o.inCombat && !o.staged) {
      const W = o.viewportW;
      const H = o.viewportH;
      const s = H / 900;
      let cx = W / 2;
      let cy = H / 2;
      let rx = W * 0.3;
      let ry = H * 0.3;
      if (o.third) {
        _v.set(o.player.x, o.player.y + 1.1, o.player.z).project(o.camera);
        if (_v.z < 1) {
          cx = (_v.x * 0.5 + 0.5) * W;
          cy = (-_v.y * 0.5 + 0.5) * H;
        }
        rx = 150 * s;
        ry = 115 * s;
      }
      for (const en of o.c) {
        if (!en.aggro) continue;
        const d = Math.hypot(en.x - o.player.x, en.z - o.player.z);
        if (d > 22) continue;
        _v.set(en.x, en.y + en.top * 0.5, en.z).project(o.camera);
        const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.86;
        if (onScreen) continue;
        const rel = wrapAngle(o.viewYaw - headingOf(en.x - o.player.x, en.z - o.player.z));
        let ch = this.chevrons.get(en.id);
        if (!ch) {
          ch = document.createElement('div');
          ch.className = 'kqc-around-c';
          ch.innerHTML = `<svg viewBox="-20 -20 40 40"><path d="M-11 7 L0 -11 L11 7 L0 1 Z"/></svg>`;
          this.el.append(ch);
          this.chevrons.set(en.id, ch);
        }
        seen.add(en.id);
        const near = Math.max(0.45, 1 - d / 22);
        ch.style.left = `${cx + Math.sin(rel) * rx}px`;
        ch.style.top = `${cy - Math.cos(rel) * ry}px`;
        ch.style.transform = `rotate(${rel}rad) scale(${(0.7 + 0.5 * near).toFixed(2)})`;
        ch.style.opacity = near.toFixed(2);
        ch.classList.toggle('warn', en.windup);
      }
    }
    for (const [k, ch] of this.chevrons) {
      if (seen.has(k)) continue;
      ch.remove();
      this.chevrons.delete(k);
    }
  }

  dispose(): void {
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    this.mat.dispose();
    this.el.remove();
  }
}

let cssInstalled = false;
function installCss(): void {
  if (cssInstalled || typeof document === 'undefined') return;
  cssInstalled = true;
  const st = document.createElement('style');
  st.textContent = `
.kqc-around { position: absolute; inset: 0; pointer-events: none; }
.kqc-around-c { position: absolute; width: 0; height: 0; transition: opacity 0.15s; }
.kqc-around-c svg { position: absolute; left: -15px; top: -15px; width: 30px; height: 30px; overflow: visible; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.95)); }
.kqc-around-c path { fill: #f1c27a; stroke: #2a1a0c; stroke-width: 2.4; stroke-linejoin: round; }
.kqc-around-c.warn path { fill: #ff6a3a; stroke: #fff2dc; }
.kqc-around-c.warn svg { animation: kqc-around-p 0.32s ease-in-out infinite alternate; }
@keyframes kqc-around-p { from { transform: scale(1); } to { transform: scale(1.25); } }
html[data-kq-reduced-motion] .kqc-around-c.warn svg { animation: none; }
html[data-kq-contrast] .kqc-around-c path { fill: #fff; stroke: #000; }
html[data-kq-contrast] .kqc-around-c.warn path { fill: #ff8a00; stroke: #000; }
`;
  document.head.append(st);
}
