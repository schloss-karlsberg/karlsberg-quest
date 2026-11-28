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
 * When may the shadow map of an earlier frame stand for this one (pure, tested)? At most
 * `every - 1` frames in a row, only while it is still exact: the focus moved less than
 * `maxDriftTexels` of a map texel, the sun did not turn, and the map is at most `maxAge` seconds old,
 * so moving casters lag one 60 fps frame at most (no swimming shadow under a walking or sprinting
 * character; at 30 fps or in bullet time every frame re-renders).
 */
export class ShadowReuse {
  /** Re-render at least every n-th frame (1 = every frame; the tier's `shadowEvery`). */
  every = 1;
  /** 0.75 texel: walking (5.3 cm a 60 fps frame) re-uses on Hoch (7.3 cm texels) and Mittel (10.7 cm), sprinting (10.3 cm) does not. */
  maxDriftTexels = 0.75;
  maxAge = 0.025;
  private reused = 0;
  private age = 0;
  private readonly focus = new Vector3(Infinity, 0, 0);
  private readonly sun = new Vector3();

  /**
   * One frame: true = keep the last map; false = re-render now (this focus and sun become the
   * reference). `dt` = seconds since the previous frame, `texel` = map texel size (m).
   */
  reuse(focus: Vector3, sun: Vector3, dt: number, texel: number): boolean {
    const drift = this.maxDriftTexels * texel;
    const keep =
      this.every > 1 &&
      this.reused < this.every - 1 &&
      this.age + dt <= this.maxAge &&
      this.focus.distanceToSquared(focus) <= drift * drift &&
      this.sun.dot(sun) > 0.999999;
    if (keep) {
      this.reused++;
      this.age += dt;
      return true;
    }
    this.reused = 0;
    this.age = 0;
    this.focus.copy(focus);
    this.sun.copy(sun);
    return false;
  }

  /** The last map is gone or stale (new size, shadows off): the next frame re-renders. */
  invalidate(): void {
    this.focus.set(Infinity, 0, 0);
  }
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
  /** Re-use of the last map on the next frame (`ShadowReuse`; `every` comes from the tier). */
  readonly reuse = new ShadowReuse();
  /** Re-render at least every n-th frame (1 = every frame). */
  get every(): number {
    return this.reuse.every;
  }
  set every(n: number) {
    this.reuse.every = Math.max(1, Math.round(n));
  }
  /** Shadow passes drawn / re-used since start (perf readouts). */
  readonly stats = { drawn: 0, reused: 0 };
  /**
   * Called right before (true) and after (false) the depth pass with the focus and the box's half
   * extent: layers that draw their casters differently (the model trees: lod1 geometry, CPU
   * distance cut) swap their meshes here.
   */
  readonly onPass = new Set<(on: boolean, focus: Vector3, range: number) => void>();
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
    this.reuse.invalidate();
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

  /** Render the shadow map around `focus` (the player / camera); `dt` = seconds since the previous frame. */
  update(renderer: WebGLRenderer, scene: Scene, focus: Vector3, dt = 0): void {
    const a = atmosphere;
    if (!this.target || this.strength <= 0 || a.uSunDir.value.y < 0.03) {
      a.uShadowParams.value.x = 0;
      this.reuse.invalidate();
      return;
    }
    const r = this.range;
    if (a.uShadowParams.value.x <= 0) this.reuse.invalidate();
    if (this.reuse.reuse(focus, a.uSunDir.value, dt, (2 * r) / this.size)) {
      this.stats.reused++;
      a.uShadowParams.value.w = this.strength;
      return;
    }
    this.stats.drawn++;
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
    // the box of this pass, before it: casters cut themselves to it (trees.ts `kqCastGap`)
    a.uShadowCenter.value.set(focus.x, focus.y, focus.z, r * 0.98);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear(true, true, false);
    a.uShadowPass.value = 1;
    for (const f of this.onPass) f(true, focus, r);
    renderer.render(scene, cam);
    for (const f of this.onPass) f(false, focus, r);
    a.uShadowPass.value = 0;
    renderer.setRenderTarget(prev);
    for (let i = 0; i < skip.length; i++) skip[i]!.visible = this.vis[i]!;

    a.uShadowMap.value = this.target.depthTexture!;
    a.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    a.uShadowParams.value.set(1, 1 / this.size, this.taps, this.strength);
  }

  /**
   * Draw `scene` once into the shadow target the way the depth pass does (the era-shift warm-up's
   * stand-ins, fx/shift/warm.ts), so the driver builds those pipelines before the casters first
   * show. The map is overwritten: the next `update` renders it again.
   */
  warm(renderer: WebGLRenderer, scene: Scene): void {
    if (!this.target) return;
    const a = atmosphere;
    const params = a.uShadowParams.value.x;
    const map = a.uShadowMap.value;
    a.uShadowParams.value.x = 0;
    a.uShadowMap.value = NO_SHADOW_TEX;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    a.uShadowPass.value = 1;
    try {
      renderer.render(scene, this.camera);
    } finally {
      a.uShadowPass.value = 0;
      renderer.setRenderTarget(prev);
      a.uShadowParams.value.x = params;
      a.uShadowMap.value = map;
      this.reuse.invalidate();
    }
  }

  private collectSkips(scene: Scene): void {
    this.skipAge = 0;
    const out: Object3D[] = [];
    // every object, hidden ones too: a non-caster shown between two scans (interior smoke when a
    // room ignites) must not draw into the depth target until the next scan
    scene.traverse((o) => {
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
