/**
 * The lantern in the world: the shared `atmosphere.uLantern*` point light (terrain, trees,
 * palace and the smoke of the pack all react to it) and a small first-person lantern prop that
 * is raised when lit. Visual only; oil bookkeeping lives in lanternLogic.ts.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { atmosphere } from '../../world/atmosphere';

const WARM = new Vector3(1.0, 0.58, 0.24);
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float wob = sin(uTime * 13.0 + p.y * 4.0) * 0.06 + sin(uTime * 7.3) * 0.04;
  p.x += wob * (p.y + 1.0) * 0.5;
  // teardrop: narrow at the top
  float w = mix(0.55, 0.12, clamp((p.y + 0.6) / 1.6, 0.0, 1.0));
  float d = length(vec2(p.x / w, (p.y + 0.35) * 0.9));
  float core = smoothstep(1.0, 0.2, d);
  float glow = exp(-dot(p, p) * 2.2) * 0.35;
  vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.9, 0.62), core) * (core * 2.4 + glow);
  gl_FragColor = vec4(col * uLevel, 1.0);
}
`;
const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export class LanternView {
  private readonly prop = new Group();
  private readonly ironMat = new MeshBasicMaterial({ color: 0x16110b, depthTest: false, depthWrite: false, transparent: true });
  private readonly glassMat = new MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthTest: false, depthWrite: false });
  private readonly flameMat: ShaderMaterial;
  private raise = 0;
  private level = 0;
  private readonly off = new Vector3();
  private sway = 0;

  constructor(scene: Scene) {
    this.prop.name = 'lantern-prop';
    this.flameMat = new ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
      transparent: true,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const iron = (g: import('three').BufferGeometry, x: number, y: number, z: number) => {
      const m = new Mesh(g, this.ironMat);
      m.position.set(x, y, z);
      m.renderOrder = 100;
      this.prop.add(m);
      return m;
    };
    iron(new CylinderGeometry(0.058, 0.064, 0.022, 16), 0, -0.065, 0);
    iron(new ConeGeometry(0.066, 0.055, 16), 0, 0.083, 0);
    iron(new CylinderGeometry(0.012, 0.016, 0.03, 8), 0, 0.122, 0);
    const handle = iron(new TorusGeometry(0.034, 0.004, 6, 20), 0, 0.16, 0);
    handle.rotation.y = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      iron(new BoxGeometry(0.007, 0.13, 0.007), Math.cos(a) * 0.05, 0.0, Math.sin(a) * 0.05);
    }
    const glass = new Mesh(new CylinderGeometry(0.047, 0.047, 0.12, 20, 1, true), this.glassMat);
    glass.renderOrder = 101;
    this.prop.add(glass);
    const flame = new Mesh(new PlaneGeometry(0.05, 0.075), this.flameMat);
    flame.position.set(0, -0.012, 0);
    flame.renderOrder = 102;
    this.prop.add(flame);
    this.prop.visible = false;
    this.prop.frustumCulled = false;
    this.prop.traverse((o) => (o.frustumCulled = false));
    scene.add(this.prop);
  }

  /**
   * Per frame. `lit`/`oil` from the state slice; `fog` shrinks the light radius (frost fog eats
   * light, bible ch. 2: a 7 m light cone).
   */
  frame(o: { dt: number; time: number; camera: PerspectiveCamera; lit: boolean; oil: number; fog: boolean; prone: boolean; moving: number; reducedMotion: boolean; snap: boolean }): void {
    const dt = Math.min(0.1, o.dt);
    const target = o.lit ? 1 : 0;
    this.raise += (target - this.raise) * (o.snap ? 1 : Math.min(1, dt * 6));
    if (Math.abs(this.raise - target) < 0.002) this.raise = target;
    const low = o.oil < 0.15 ? 0.55 + 0.45 * (o.oil / 0.15) : 1;
    // flicker: two incommensurate sines + a little stutter when the oil runs low
    const t = o.time;
    let flick = 0.92 + 0.05 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 23.7 + 1.3);
    if (o.oil < 0.15) flick *= 0.85 + 0.15 * Math.max(0, Math.sin(t * 31.0) * Math.sin(t * 4.3));
    this.level = this.raise * flick * low;
    const cam = o.camera;
    // light: held at hip height, a bit right and ahead
    const L = atmosphere;
    L.uLantern.value.copy(WARM).multiplyScalar(2.7 * this.level);
    L.uLanternRadius.value = (o.fog ? 9 : 14) * (0.85 + 0.15 * low);
    this.off.set(0.28, o.prone ? -0.15 : -0.5, -0.35).applyQuaternion(cam.quaternion);
    L.uLanternPos.value.copy(cam.position).add(this.off);
    // prop: first-person, lower right of the view; rises into view when lit
    this.prop.visible = this.raise > 0.01;
    if (!this.prop.visible) return;
    if (!o.reducedMotion) this.sway += dt * (1.2 + o.moving * 5);
    const sw = o.reducedMotion ? 0 : Math.sin(this.sway) * (0.006 + o.moving * 0.01);
    const y = -0.6 + 0.29 * easeOut(this.raise);
    this.off.set(0.27 + sw, y + Math.abs(Math.cos(this.sway)) * o.moving * 0.008, -0.58).applyQuaternion(cam.quaternion);
    this.prop.position.copy(cam.position).add(this.off);
    this.prop.quaternion.copy(cam.quaternion);
    this.prop.rotateZ(sw * 2);
    this.flameMat.uniforms.uTime!.value = t;
    this.flameMat.uniforms.uLevel!.value = this.level;
    this.glassMat.opacity = 0.05 + 0.22 * this.level;
    // the iron frame catches a bit of its own light
    this.ironMat.color.setRGB(0.012 + 0.05 * this.level, 0.009 + 0.025 * this.level, 0.006 + 0.008 * this.level);
  }

  /** Current light level 0..1 (for tests). */
  get light(): number {
    return this.level;
  }

  dispose(): void {
    this.prop.removeFromParent();
    this.prop.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.ironMat.dispose();
    this.glassMat.dispose();
    this.flameMat.dispose();
    atmosphere.uLantern.value.set(0, 0, 0);
  }
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}
