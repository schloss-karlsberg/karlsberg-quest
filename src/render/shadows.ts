import {
  DepthTexture,
  Matrix4,
  NearestFilter,
  type Object3D,
  OrthographicCamera,
  type Scene,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { NO_SHADOW_TEX, atmosphere } from '../world/atmosphere';

/** Objects that never cast sun shadows (by name; anything else can set `userData.noShadow = true`). */
export const NO_SHADOW_NAMES = new Set(['terrain', 'sky', 'scenery-hohenburg', 'combat-viewmodel', 'kq-xray']);

/** Does this object take part in the shadow pass? (pure, tested) */
export function castsShadow(o: Object3D): boolean {
  if (o.userData.noShadow === true || NO_SHADOW_NAMES.has(o.name)) return false;
  const any = o as Object3D & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean; material?: unknown };
  if (any.isPoints || any.isLine || any.isSprite) return false;
  const m = any.material as { transparent?: boolean; depthWrite?: boolean } | { transparent?: boolean; depthWrite?: boolean }[] | undefined;
  if (!m) return true;
  const first = Array.isArray(m) ? m[0] : m;
  if (!first) return true;
  return first.depthWrite !== false && first.transparent !== true;
}

/**
 * Sun (or moon) shadows for every shader that uses `kqLight` (terrain, trees, palace, scenery,
 * characters, patched glTF materials). One fitted orthographic shadow camera follows the player,
 * snapped to whole texels so edges do not crawl. The depth pass renders the scene's own materials
 * (wind, instancing and leaf cut-outs stay correct); the terrain does not cast (it is the
 * receiver; its relief shading comes from the LiDAR normals). Size / range / taps come from the
 * quality tier, the strength from the era look.
 */
export class SunShadows {
  readonly camera = new OrthographicCamera(-50, 50, 50, -50, 1, 900);
  private target: WebGLRenderTarget | null = null;
  private size = 0;
  private range = 60;
  private taps = 8;
  /** Era strength 0..1 (night eras: softer moon shadows). */
  strength = 0.85;
  /** Re-render every n-th frame (1 = every frame). */
  every = 1;
  private frame = 0;
  private skip: Object3D[] = [];
  private skipAge = 1e9;
  private readonly tmpM = new Matrix4();
  private readonly lightRot = new Matrix4();
  private readonly v = new Vector3();
  private readonly origin = new Vector3();
  private vis: boolean[] = [];
  private readonly up = new Vector3(0, 1, 0);

  get enabled(): boolean {
    return this.size > 0;
  }

  /** Quality tier: map size (0 = off), half extent of the box (m), PCF taps. */
  configure(size: number, range: number, taps: number): void {
    this.range = range;
    this.taps = taps;
    if (size !== this.size) {
      this.target?.dispose();
      this.target = null;
      this.size = size;
      if (size > 0) {
        const dt = new DepthTexture(size, size, UnsignedIntType);
        dt.minFilter = NearestFilter;
        dt.magFilter = NearestFilter;
        this.target = new WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture: dt, minFilter: NearestFilter, magFilter: NearestFilter });
      }
    }
    if (!this.enabled) {
      atmosphere.uShadowParams.value.x = 0;
      atmosphere.uShadowMap.value = NO_SHADOW_TEX;
    }
  }

  /** Render the shadow map around `focus` (the player / camera). */
  update(renderer: WebGLRenderer, scene: Scene, focus: Vector3): void {
    const a = atmosphere;
    if (!this.target || this.strength <= 0 || a.uSunDir.value.y < 0.03) {
      a.uShadowParams.value.x = 0;
      return;
    }
    if (this.frame++ % this.every !== 0 && a.uShadowParams.value.x > 0) return;
    const r = this.range;
    const cam = this.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    // texel-snapped centre in light space
    const sun = a.uSunDir.value;
    this.lightRot.lookAt(this.origin, this.v.copy(sun).negate(), this.up);
    const texel = (2 * r) / this.size;
    const c = this.v.copy(focus).applyMatrix4(this.tmpM.copy(this.lightRot).invert());
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(this.lightRot);
    const dist = 450;
    cam.position.copy(c).addScaledVector(sun, dist);
    cam.near = 1;
    cam.far = dist + 250;
    cam.quaternion.setFromRotationMatrix(this.lightRot);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // depth pass with every caster's own material; no material may sample the map it writes
    if (++this.skipAge > 30) this.collectSkips(scene);
    const skip = this.skip;
    this.vis.length = skip.length;
    for (let i = 0; i < skip.length; i++) {
      this.vis[i] = skip[i]!.visible;
      skip[i]!.visible = false;
    }
    a.uShadowParams.value.x = 0;
    a.uShadowMap.value = NO_SHADOW_TEX;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    for (let i = 0; i < skip.length; i++) skip[i]!.visible = this.vis[i]!;

    a.uShadowMap.value = this.target.depthTexture!;
    a.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    a.uShadowParams.value.set(1, 1 / this.size, this.taps, this.strength);
    a.uShadowCenter.value.set(focus.x, focus.y, focus.z, r * 0.98);
  }

  private collectSkips(scene: Scene): void {
    this.skipAge = 0;
    const out: Object3D[] = [];
    scene.traverseVisible((o) => {
      if (o === scene) return;
      if (!castsShadow(o)) out.push(o);
    });
    this.skip = out;
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
  }
}
