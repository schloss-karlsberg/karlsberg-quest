import { type BufferGeometry, type Camera, type Matrix4, type Object3D, type Scene, type SkinnedMesh, Sphere, Vector3 } from 'three';

/**
 * Exploded-geometry watchdog (`kq.nanWatch`, playtest round 10 F-15: a huge flat black wedge over
 * the screen, the player gone; suspected one exploded triangle on something tied to the player or
 * the camera). Dev only: active with `?debug`, under WebDriver or after `kq.nanWatch.enabled(true)`;
 * otherwise nothing runs per frame (the render hook is not even installed).
 *
 * Every N frames (default 30, or every frame) it walks the visible scene:
 * - every node: a non-finite world matrix is flagged (its descendants are then not reported again:
 *   one finding per root cause);
 * - meshes / lines / points within ≈ 60 m of the camera: the world bounding sphere (geometry sphere,
 *   computed lazily, recomputed when the position attribute changes, times `matrixWorld` incl. its
 *   scale) must be finite, radius ≤ 5000 m, centre ≤ 10 km from the camera;
 * - always, whatever the distance (and for the roots, the visibility): the camera (position,
 *   quaternion, world / inverse / projection matrices) and everything under it, the extra roots
 *   (avatar, combat viewmodel) and every drawn skinned mesh with its bones
 *   (`skeleton.boneMatrices`, each bone's world matrix, the bind matrix).
 * A finding is logged once per object (`console.warn('[nan-watch] …')` with the parent chain, the
 * values, era, player / camera position and a stack); the last 20 are kept.
 */

export type NanReason = 'matrix' | 'sphere' | 'radius' | 'centre' | 'bones' | 'camera';

export interface NanFinding {
  reason: NanReason;
  name: string;
  type: string;
  uuid: string;
  /** Names from the object up to the scene (unnamed nodes as their type). */
  path: string[];
  /** The offending numbers (matrix elements, sphere, bone index / name …). */
  values: Record<string, unknown>;
  era: string;
  player: [number, number, number] | null;
  camera: [number, number, number];
  /** Frame counter at detection (the host's, else the scan count). */
  frame: number;
  /** Where the scan ran (render hook, `kq.nanWatch.scan()` …). */
  stack: string;
  /** One line: reason, name, path. */
  summary: string;
}

export interface NanWatchOptions {
  scene: Scene;
  camera: Camera;
  /** Objects always checked in full (avatar, viewmodel …); looked up per scan, may return null entries. */
  roots?: () => readonly (Object3D | null | undefined)[];
  era?: () => string;
  player?: () => { x: number; y: number; z: number } | null;
  frame?: () => number;
  /** Logger (default `console.warn`). */
  warn?: (msg: string, f: NanFinding) => void;
  near?: number;
  maxRadius?: number;
  maxCentre?: number;
  ring?: number;
}

const NEAR = 60;
const MAX_RADIUS = 5000;
const MAX_CENTRE = 10_000;
const RING = 20;

const finiteArr = (a: ArrayLike<number>, n = a.length): boolean => {
  for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) return false;
  return true;
};
const finiteM = (m: Matrix4): boolean => finiteArr(m.elements, 16);
const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
const els = (m: Matrix4) => Array.from(m.elements, round);

interface Drawable extends Object3D {
  geometry?: BufferGeometry;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSkinnedMesh?: boolean;
  isBone?: boolean;
}

export class NanWatch {
  private readonly o: NanWatchOptions;
  private readonly seen = new Set<string>();
  private readonly ring: NanFinding[] = [];
  private readonly sphere = new Sphere();
  private readonly camPos = new Vector3();
  /** Position attribute and its version when the geometry's sphere was last computed. */
  private readonly sphereAttr = new WeakMap<BufferGeometry, object>();
  private readonly sphereVer = new WeakMap<BufferGeometry, number>();
  private readonly near: number;
  private readonly maxRadius: number;
  private readonly maxCentre: number;
  private readonly ringSize: number;
  private extra: readonly (Object3D | null | undefined)[] = [];
  /** Findings of the scan in progress (reset per scan; the array is reused). */
  private current: NanFinding[] = [];
  private scans = 0;
  private stack = '';

  constructor(o: NanWatchOptions) {
    this.o = o;
    this.near = o.near ?? NEAR;
    this.maxRadius = o.maxRadius ?? MAX_RADIUS;
    this.maxCentre = o.maxCentre ?? MAX_CENTRE;
    this.ringSize = o.ring ?? RING;
  }

  /** The last findings (once per object, newest last). */
  findings(): NanFinding[] {
    return this.ring.slice();
  }

  /** Forget the findings and which objects were reported (they are reported again). */
  clear(): void {
    this.ring.length = 0;
    this.seen.clear();
  }

  /** Walk the scene now; returns what is broken right now (also objects reported before). */
  scan(): NanFinding[] {
    this.scans++;
    this.current = [];
    this.stack = '';
    const { scene, camera } = this.o;
    this.extra = this.o.roots?.() ?? [];
    const cm = camera.matrixWorld.elements;
    this.camPos.set(cm[12], cm[13], cm[14]);
    // the camera itself
    const p = camera.position;
    const q = camera.quaternion;
    const projInv = (camera as Camera & { projectionMatrixInverse?: Matrix4 }).projectionMatrixInverse;
    if (!finiteM(camera.matrixWorld) || !finiteM(camera.matrixWorldInverse) || !finiteM(camera.projectionMatrix) || (projInv && !finiteM(projInv)) || !Number.isFinite(p.x + p.y + p.z) || !Number.isFinite(q.x + q.y + q.z + q.w)) {
      this.flag(camera, 'camera', {
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
        matrixWorld: els(camera.matrixWorld),
        projectionMatrix: els(camera.projectionMatrix),
      });
    }
    const camOk = Number.isFinite(this.camPos.x + this.camPos.y + this.camPos.z);
    // under the camera (always in full; when the camera is in the scene the walk below gets there)
    const camInScene = this.inTree(camera, scene);
    if (!camInScene) for (let i = 0; i < camera.children.length; i++) this.visit(camera.children[i] as Drawable, true, false, camOk);
    this.visit(scene as Drawable, false, false, camOk);
    // extra roots outside the scene graph (detached avatar parts …)
    const ex = this.extra;
    for (let i = 0; i < ex.length; i++) {
      const r = ex[i];
      if (r && !this.inTree(r, scene) && !this.inTree(r, camera)) this.visit(r as Drawable, true, false, camOk);
    }
    return this.current;
  }

  private inTree(o: Object3D, root: Object3D): boolean {
    for (let n: Object3D | null = o; n; n = n.parent) if (n === root) return true;
    return false;
  }

  private isRoot(o: Object3D): boolean {
    const e = this.extra;
    for (let i = 0; i < e.length; i++) if (e[i] === o) return true;
    return false;
  }

  /** forced: inside an always-checked root (no distance / visibility gate). poisoned: an ancestor's matrix is already reported. */
  private visit(o: Drawable, forced: boolean, poisoned: boolean, camOk: boolean): void {
    const f = forced || this.isRoot(o);
    // an invisible subtree is not drawn (and cannot cover the screen) unless it is an always-checked root
    if (!f && !o.visible) return;
    let bad = poisoned;
    if (!bad && !finiteM(o.matrixWorld)) {
      bad = true;
      // a broken bone is reported by its skinned mesh (with the bone named)
      if (!o.isBone) this.flag(o, 'matrix', { matrixWorld: els(o.matrixWorld), position: [o.position.x, o.position.y, o.position.z], scale: [o.scale.x, o.scale.y, o.scale.z] });
    }
    if (!bad && o.geometry && (o.isMesh || o.isLine || o.isPoints)) this.checkDrawable(o, f, camOk);
    if (o.isSkinnedMesh) this.checkBones(o as unknown as SkinnedMesh);
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) this.visit(ch[i] as Drawable, f, bad, camOk);
  }

  private checkDrawable(o: Drawable, forced: boolean, camOk: boolean): void {
    const g = o.geometry!;
    const m = o.matrixWorld.elements;
    // distance gate on the origin (plus the cached radius when known): far props are not sphere-tested
    if (!forced && camOk) {
      const dx = m[12] - this.camPos.x;
      const dy = m[13] - this.camPos.y;
      const dz = m[14] - this.camPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > this.maxCentre) {
        this.flag(o, 'centre', { origin: [m[12], m[13], m[14]], distance: round(d) });
        return;
      }
      const r0 = g.boundingSphere ? g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() : 0;
      if (d - (Number.isFinite(r0) ? r0 : 0) > this.near) return;
    }
    const pos = g.getAttribute('position');
    if (!pos) return;
    // lazily computed once, again only when the positions changed (version / attribute swap)
    const ver = (pos as { version?: number }).version ?? 0;
    if (!g.boundingSphere || this.sphereAttr.get(g) !== pos || this.sphereVer.get(g) !== ver) {
      g.computeBoundingSphere();
      this.sphereAttr.set(g, pos);
      this.sphereVer.set(g, ver);
    }
    const bs = g.boundingSphere;
    if (!bs) return;
    const s = this.sphere.copy(bs).applyMatrix4(o.matrixWorld);
    const c = s.center;
    if (!Number.isFinite(s.radius) || !Number.isFinite(c.x + c.y + c.z)) {
      this.flag(o, 'sphere', { local: [bs.center.x, bs.center.y, bs.center.z, bs.radius], world: [c.x, c.y, c.z, s.radius], vertices: pos.count });
      return;
    }
    if (s.radius > this.maxRadius) {
      this.flag(o, 'radius', { radius: round(s.radius), localRadius: round(bs.radius), maxScale: round(o.matrixWorld.getMaxScaleOnAxis()), centre: [round(c.x), round(c.y), round(c.z)] });
      return;
    }
    if (camOk && c.distanceTo(this.camPos) > this.maxCentre) this.flag(o, 'centre', { centre: [round(c.x), round(c.y), round(c.z)], distance: round(c.distanceTo(this.camPos)) });
  }

  private checkBones(sk: SkinnedMesh): void {
    const skel = sk.skeleton;
    if (!skel) return;
    const bones = skel.bones;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      if (b && !finiteM(b.matrixWorld)) {
        this.flag(sk, 'bones', { bone: i, boneName: b.name || '(unnamed)', boneMatrixWorld: els(b.matrixWorld), bonePosition: [b.position.x, b.position.y, b.position.z] });
        return;
      }
    }
    const bm = skel.boneMatrices;
    if (bm && !finiteArr(bm)) {
      let i = 0;
      while (i < bm.length && Number.isFinite(bm[i])) i++;
      const bone = Math.floor(i / 16);
      this.flag(sk, 'bones', { bone, boneName: bones[bone]?.name || '(unnamed)', boneMatrices: Array.from(bm.subarray(bone * 16, bone * 16 + 16), round) });
      return;
    }
    if (!finiteM(sk.bindMatrix)) this.flag(sk, 'bones', { bindMatrix: els(sk.bindMatrix) });
  }

  private flag(o: Object3D, reason: NanReason, values: Record<string, unknown>): void {
    const path: string[] = [];
    for (let n: Object3D | null = o; n; n = n.parent) path.push(n.name || n.type);
    const pl = this.o.player?.() ?? null;
    if (!this.stack) this.stack = new Error('nan-watch').stack ?? '';
    const name = o.name || o.type;
    const f: NanFinding = {
      reason,
      name,
      type: o.type,
      uuid: o.uuid,
      path,
      values,
      era: this.o.era?.() ?? '',
      player: pl ? [round(pl.x), round(pl.y), round(pl.z)] : null,
      camera: [round(this.camPos.x), round(this.camPos.y), round(this.camPos.z)],
      frame: this.o.frame?.() ?? this.scans,
      stack: this.stack,
      summary: `${reason} ${name} (${path.join(' < ')})`,
    };
    this.current.push(f);
    if (this.seen.has(o.uuid)) return;
    this.seen.add(o.uuid);
    this.ring.push(f);
    if (this.ring.length > this.ringSize) this.ring.splice(0, this.ring.length - this.ringSize);
    const warn = this.o.warn ?? ((msg: string, x: NanFinding) => console.warn(msg, x));
    warn(`[nan-watch] ${f.summary} type=${f.type} uuid=${f.uuid} era=${f.era} player=${JSON.stringify(f.player)} camera=${JSON.stringify(f.camera)} values=${JSON.stringify(values)}\n${f.stack}`, f);
  }
}

/** Whether the watchdog starts switched on: `?debug` or WebDriver (e2e). */
export function nanWatchDefaultOn(debug: boolean, nav: { webdriver?: boolean } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return debug || nav?.webdriver === true;
}

export interface NanWatchApi {
  /** Switch on / off (no argument: just report). Off = no per-frame work. */
  enabled(on?: boolean): boolean;
  /** Scan every n rendered frames (1 = every frame); no argument: just report. */
  every(n?: number): number;
  /** Scan now; what is broken right now. */
  scan(): NanFinding[];
  /** The last ≈ 20 findings, once per object. */
  findings(): NanFinding[];
  clear(): void;
}

/**
 * Browser wiring: the scan runs from `scene.onAfterRender` (the world matrices and bone matrices of
 * that render are fresh), at most once per host frame and every `every` frames. The hook is
 * installed only while enabled.
 */
export function installNanWatch(o: NanWatchOptions & { frame: () => number; on: boolean }): NanWatchApi {
  const w = new NanWatch(o);
  const { scene } = o;
  let on = false;
  let every = 30;
  let lastFrame = -1;
  let lastScan = -Infinity;
  const prev = scene.onAfterRender;
  const hook: Scene['onAfterRender'] = function (this: Scene, ...args) {
    prev.apply(this, args);
    const f = o.frame();
    if (f === lastFrame) return;
    lastFrame = f;
    if (f - lastScan < every) return;
    lastScan = f;
    w.scan();
  };
  const api: NanWatchApi = {
    enabled(v) {
      if (v !== undefined && v !== on) {
        on = v;
        scene.onAfterRender = on ? hook : prev;
        lastScan = -Infinity;
      }
      return on;
    },
    every(n) {
      if (n !== undefined && Number.isFinite(n)) every = Math.max(1, Math.round(n));
      return every;
    },
    scan: () => w.scan(),
    findings: () => w.findings(),
    clear: () => w.clear(),
  };
  api.enabled(o.on);
  return api;
}
