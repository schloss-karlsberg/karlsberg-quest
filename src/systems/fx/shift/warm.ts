/**
 * Era-shift warm-up (finding M-17: the first today → 1789 shift stalled 100–180 ms several times:
 * on its first frame, when the veil / fade first drew, and at the midpoint when the 1789 world
 * appeared). On ANGLE Metal a GL program link is not the whole cost: the driver builds a pipeline
 * for each program × blend / depth state × target format at the first DRAW, and the first draw of
 * a mesh also uploads its buffers and textures. So before the first shift, in idle slices of a
 * few ms per frame (fx/shift/slices.ts), the warm-up
 *  1. caches the palace point samples (an area pass over the multi-million-triangle palace);
 *  2. gathers everything that is not drawn now — the hidden palace, the other era's sets, the
 *     shift's own veil / fade / point-cloud / rewind materials (stand-ins, ShiftEffect.warmObjects)
 *     — as one stand-in per distinct material × geometry layout, sharing the source's buffers but
 *     drawing a single triangle / point;
 *  3. compiles them with `compileAsync` (KHR_parallel_shader_compile: links in the background);
 *  4. once linked, draws them into the post target (and the casters into the shadow target), so
 *     pipelines, vertex buffers and textures exist before the shift needs them; both targets are
 *     overwritten by the frame's own passes, nothing on screen changes;
 *  5. uploads the other era's terrain data textures (`initTexture`).
 * After every era change the pass runs again for what is hidden now (the era just left).
 */
import {
  BufferGeometry,
  InstancedBufferGeometry,
  InstancedMesh,
  LineLoop,
  LineSegments,
  Line,
  type Material,
  Mesh,
  type Object3D,
  Points,
  Scene,
  Sphere,
  type Texture,
} from 'three';
import type { LoadedModel } from '../../../assets/loader';
import type { GameContext } from '../../../core/context';
import { type Era, isEra } from '../../../core/era';
import { castsShadow } from '../../../render/shadows';
import { glassLook, isModelGlass } from '../../scenery/models';
import { warmPalaceSamples } from './pointcloud';
import { shouldHold, shouldRelease } from './reveal';
import { NEXT_FRAME, SliceRunner } from './slices';

/** Frame budget of the warm-up while the player plays (ms). */
const BUDGET_MS = 3;
/** Seconds after the palace has loaded before the warm-up starts (the boot work settles first). */
const START_DELAY = 1.5;
/** Stand-ins compiled per step. */
const CHUNK = 8;
const TMP_SPHERE = new Sphere();
/** Frame budget for drawing held-back objects' stand-ins in the shift's void (ms). */
const REVEAL_BUDGET_MS = 6;

/**
 * Whether the warm-up runs: `?nowarm` / `?warm` decide; otherwise not on a software rasteriser
 * (SwiftShader / llvmpipe: e2e, where compiles are serial and slow and timing stays as it was).
 */
export function warmEnabled(params: Pick<URLSearchParams, 'has'>, rendererName: string): boolean {
  if (params.has('nowarm')) return false;
  if (params.has('warm')) return true;
  return !/swiftshader|llvmpipe|software/i.test(rendererName);
}

/** The GL renderer string (unmasked where the browser allows it). */
export function glRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
}

type Drawable = Object3D & { geometry?: BufferGeometry; material?: Material | Material[]; isSkinnedMesh?: boolean; isBatchedMesh?: boolean; isSprite?: boolean };

/** Is `o` drawn this frame as far as visibility goes (it and every ancestor visible)? */
function shown(o: Object3D): boolean {
  for (let a: Object3D | null = o; a; a = a.parent) if (!a.visible) return false;
  return true;
}

/** Program / pipeline-relevant layout of a geometry (attribute formats, index type, instancing). */
function layoutKey(g: BufferGeometry): string {
  const parts: string[] = [];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name]!;
    const arr = (a as { array?: ArrayLike<number> }).array ?? (a as unknown as { data: { array: ArrayLike<number> } }).data.array;
    parts.push(`${name}:${a.itemSize}:${arr.constructor.name}:${a.normalized ? 1 : 0}:${(a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute ? 'i' : ''}`);
  }
  if (g.index) parts.push(`#${g.index.array.constructor.name}`);
  if ((g as InstancedBufferGeometry).isInstancedBufferGeometry) parts.push('inst');
  const morphs = Object.entries(g.morphAttributes as Record<string, unknown[] | undefined>);
  if (morphs.length) parts.push(`m:${morphs.map(([k, v]) => `${k}${v?.length ?? 0}`).join(',')}`);
  return parts.join('|');
}

/** A geometry that shares `src`'s buffers but draws `count` vertices / indices from `start`. */
function shareGeometry(src: BufferGeometry, start: number, count: number): BufferGeometry {
  const g = (src as InstancedBufferGeometry).isInstancedBufferGeometry ? new InstancedBufferGeometry() : new BufferGeometry();
  if ((g as InstancedBufferGeometry).isInstancedBufferGeometry) (g as InstancedBufferGeometry).instanceCount = 1;
  g.index = src.index;
  for (const name in src.attributes) g.setAttribute(name, src.attributes[name]!);
  g.morphAttributes = src.morphAttributes;
  g.morphTargetsRelative = src.morphTargetsRelative;
  g.setDrawRange(start, count);
  return g;
}

/** Release a stand-in's geometry state in the renderer without deleting the shared GPU buffers. */
function releaseGeometry(g: BufferGeometry): void {
  g.index = null;
  g.attributes = {};
  g.morphAttributes = {};
  g.dispose();
}

interface StandIn {
  obj: Object3D;
  casts: boolean;
  /** material × kind × layout */
  key: string;
}

type Kind = 'im' | 'pt' | 'ls' | 'll' | 'ln' | 'me';

function kindOf(src: Drawable, asInstanced: boolean): Kind | null {
  if (!src.geometry || !src.material || src.isSkinnedMesh || src.isBatchedMesh || src.isSprite || !src.geometry.getAttribute('position')) return null;
  if ((src as InstancedMesh).isInstancedMesh || (asInstanced && (src as Mesh).isMesh)) return 'im';
  if ((src as Points).isPoints) return 'pt';
  if ((src as LineSegments).isLineSegments) return 'ls';
  if ((src as LineLoop).isLineLoop) return 'll';
  if ((src as Line).isLine) return 'ln';
  if ((src as Mesh).isMesh) return 'me';
  return null;
}

/** The stand-in keys of an object's materials (empty: not warmable). */
function standInKeys(src: Drawable, asInstanced = false): string[] {
  const kind = kindOf(src, asInstanced);
  if (!kind) return [];
  const layout = layoutKey(src.geometry!);
  const mats = Array.isArray(src.material) ? src.material : [src.material!];
  return mats.filter((m) => m && m.visible !== false).map((m) => `${m.id}|${kind}|${layout}`);
}

/**
 * One stand-in per distinct material × layout × kind among `sources`. `asInstanced`: the sources
 * are model templates that the world draws as InstancedMesh copies (scenery/models.ts).
 */
function standIns(sources: Drawable[], seen: Set<string>, asInstanced = false): StandIn[] {
  const out: StandIn[] = [];
  for (const src of sources) {
    const kind = kindOf(src, asInstanced);
    if (!kind) continue;
    const g = src.geometry!;
    const mat = src.material!;
    const pos = g.getAttribute('position');
    const mats = Array.isArray(mat) ? mat : [mat];
    const layout = layoutKey(g);
    const total = g.index ? g.index.count : pos.count;
    mats.forEach((m, gi) => {
      if (!m || m.visible === false) return;
      const key = `${m.id}|${kind}|${layout}`;
      if (seen.has(key)) return;
      seen.add(key);
      const group = Array.isArray(mat) ? g.groups.find((x) => (x.materialIndex ?? 0) === gi) : undefined;
      const start = group ? group.start : 0;
      const n = Math.min(kind === 'pt' ? 1 : kind === 'ls' || kind === 'ln' || kind === 'll' ? 2 : 3, Math.max(0, total - start));
      if (n <= 0) return;
      const sg = shareGeometry(g, start, n);
      let o: Object3D;
      if (kind === 'im') {
        const im = new InstancedMesh(sg, m, 1);
        const s = src as InstancedMesh;
        if (s.isInstancedMesh) {
          im.instanceMatrix = s.instanceMatrix;
          im.instanceColor = s.instanceColor;
          im.morphTexture = s.morphTexture;
        }
        o = im;
      } else if (kind === 'pt') o = new Points(sg, m);
      else if (kind === 'ls') o = new LineSegments(sg, m);
      else if (kind === 'll') o = new LineLoop(sg, m);
      else if (kind === 'ln') o = new Line(sg, m);
      else o = new Mesh(sg, m);
      src.updateWorldMatrix(true, false);
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
      o.matrix.copy(src.matrixWorld);
      o.matrixWorld.copy(src.matrixWorld);
      o.frustumCulled = false;
      o.castShadow = src.castShadow;
      o.receiveShadow = src.receiveShadow;
      o.renderOrder = src.renderOrder;
      o.userData = src.userData;
      o.name = src.name;
      out.push({ obj: o, casts: castsShadow(src), key });
    });
  }
  return out;
}

/** The era the player most likely shifts to next: the story's target, else today ↔ 1789. */
export function nextEra(current: Era, target: unknown): Era {
  if (isEra(target) && target !== current) return target;
  return current === 'today' ? '1789' : 'today';
}

/** Glass copies made for the warm-up (by source material): never disposed, so their programs stay cached. */
const glassCopies = new WeakMap<Material, Material>();

/**
 * The model templates of the next era (fetched in the background if not yet), plus stand-in meshes
 * with the see-through look `instanceModels` gives glass parts (scenery/models.ts) on material
 * copies: the template's own material only gets that look when the first copy is placed.
 */
export async function nextEraTemplates(ctx: GameContext): Promise<Object3D[]> {
  const era = nextEra(ctx.era.current, ctx.state.state.flags['shift.target']);
  await ctx.assets.prefetchEra(era);
  const out: Object3D[] = [];
  for (const e of ctx.assets.list(undefined, era)) {
    if (e.kind !== 'model') continue;
    const m = ctx.assets.peek<LoadedModel>(e.id);
    if (!m) continue;
    out.push(m.scene);
    m.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !isModelGlass(mesh.material)) return;
      const src = mesh.material;
      let copy = glassCopies.get(src);
      if (!copy) {
        copy = src.clone();
        copy.onBeforeCompile = src.onBeforeCompile;
        copy.customProgramCacheKey = src.customProgramCacheKey;
        glassLook(copy);
        glassCopies.set(src, copy);
      }
      const g = new Mesh(mesh.geometry, copy);
      mesh.updateWorldMatrix(true, false);
      g.matrixAutoUpdate = false;
      g.matrix.copy(mesh.matrixWorld);
      g.matrixWorld.copy(mesh.matrixWorld);
      out.push(g);
    });
  }
  return out;
}

export interface WarmSources {
  /** The shift effect's program stand-ins (ShiftEffect.warmObjects). */
  effect: () => Object3D[];
  /** Textures the scene graph does not reference yet (other eras' terrain data). */
  extraTextures: () => Texture[];
  /**
   * Model templates the other era will instance (fetched now if need be): their materials are
   * shared with every copy, so warming the template warms the copies.
   */
  templates: () => Promise<Object3D[]>;
  /** Samples of the materials the systems build once the next era is active (prewarm.ts). */
  registered: () => Object3D[];
}

export class ShiftWarmer {
  private readonly runner = new SliceRunner();
  private readonly uploaded = new WeakSet<Texture>();
  /** Stand-in keys queued (material × kind × layout). */
  private readonly seen = new Set<string>();
  /** Stand-in keys drawn once. */
  private readonly drawn = new Set<string>();
  /** Programs that have been used by a draw (their first use is the expensive part). */
  private readonly usedPrograms = new WeakSet<object>();
  private readonly scene = new Scene();
  private wait = START_DELAY;
  private started = false;
  /** An era change happened: warm what is hidden now once the current pass is done. */
  private rescan = false;
  /** Reveal window (see `frame`): new objects held back, by their saved layer mask. */
  private revealing = false;
  private holdR = 0;
  private readonly held = new Map<Object3D, { mask: number; keys: string[] }>();
  private readonly revealQueue: StandIn[] = [];
  private readonly toCompile: StandIn[] = [];
  private readonly checked = new WeakSet<Object3D>();
  /** Steps taken / stand-ins drawn / passes done / objects held back at a switch (perf readouts, tests). */
  readonly stats = { steps: 0, drawn: 0, passes: 0, held: 0, forced: 0 };

  constructor(
    private readonly ctx: GameContext,
    private readonly src: WarmSources,
  ) {
    this.scene.matrixWorldAutoUpdate = false;
    ctx.events.on('era:change', () => {
      if (this.started) this.rescan = true;
    });
    // every pass (shadow, reflection, main) starts here: new objects are caught before they draw
    const prev = ctx.scene.onBeforeRender.bind(ctx.scene);
    ctx.scene.onBeforeRender = (...args: Parameters<typeof prev>) => {
      if (this.revealing) this.holdNew();
      prev(...args);
    };
  }

  /**
   * Call once per frame, before the frame renders. `busy`: an effect runs, the idle warm-up waits.
   * `holdR`: how far from the camera the shift's veil still hides the new era (reveal.ts; 0 =
   * nothing). The systems build the new era's objects at the switch (markers, sets, particles that
   * did not exist before), so their programs cannot be warmed ahead. While the veil hides them,
   * each new object whose material never drew is held back (layer mask 0: no pass draws it) while
   * its program compiles in parallel; it comes back once a stand-in of it has drawn (at most one
   * first program use per frame), or as soon as the reassembly wave reaches it. Nothing on screen
   * changes, and the first uses spread over the frames of the wave instead of one frame.
   */
  frame(dt: number, busy: boolean, holdR = 0): void {
    this.holdR = holdR;
    if (holdR > 0) {
      this.revealing = true;
      this.holdNew();
      this.reveal();
      return;
    }
    if (this.revealing) {
      this.revealing = false;
      this.releaseAll();
    }
    if (!this.started) {
      // the palace streams in after boot; its samples and programs are the biggest piece
      if (this.ctx.world.palace.triangles <= 0) return;
      this.wait -= dt;
      if (this.wait > 0) return;
      this.started = true;
      this.runner.add(warmPalaceSamples(this.ctx.world.palace.object));
      this.runner.add(this.pass(true));
    }
    if (busy) return;
    if (this.runner.pending === 0) {
      if (!this.rescan) return;
      this.rescan = false;
      this.runner.add(this.pass(false));
    }
    this.stats.steps += this.runner.run(BUDGET_MS);
  }

  /** Camera distance to the object's bounding-sphere centre and its radius (NaN: no sphere). */
  private sphereOf(o: Object3D): [number, number] {
    const d = o as Drawable & { boundingSphere?: Sphere | null };
    // a small geometry gets its sphere now (three would compute it for culling anyway)
    const g = d.geometry;
    if (!(d as InstancedMesh).isInstancedMesh && g && !g.boundingSphere && (g.getAttribute('position')?.count ?? Infinity) < 50_000) g.computeBoundingSphere();
    const sp = (d as InstancedMesh).isInstancedMesh ? d.boundingSphere ?? null : g?.boundingSphere ?? null;
    if (!sp) return [Number.NaN, Number.NaN];
    o.updateWorldMatrix(true, false);
    TMP_SPHERE.copy(sp).applyMatrix4(o.matrixWorld);
    return [TMP_SPHERE.center.distanceTo(this.ctx.camera.position), TMP_SPHERE.radius];
  }

  /** Hold back renderables whose material never drew and that the veil hides (reveal window). */
  private holdNew(): void {
    const props = this.ctx.renderer.properties;
    const cam = this.ctx.camera;
    this.ctx.scene.traverse((o) => {
      if (this.checked.has(o)) return;
      this.checked.add(o);
      const d = o as Drawable;
      if (!d.geometry || !d.material || this.held.has(o) || !o.layers.test(cam.layers)) return;
      const mats = Array.isArray(d.material) ? d.material : [d.material];
      if (mats.every((m) => props.has(m))) return;
      const keys = standInKeys(d);
      if (!keys.length || keys.every((k) => this.drawn.has(k))) return;
      const [dist, radius] = this.sphereOf(o);
      if (!shouldHold(this.holdR, dist, radius)) return;
      const ins = standIns([d], this.seen);
      this.revealQueue.push(...ins);
      this.toCompile.push(...ins);
      this.held.set(o, { mask: o.layers.mask, keys });
      o.layers.mask = 0;
      this.stats.held++;
    });
  }

  /**
   * Start the held stand-ins' programs compiling in parallel (KHR_parallel_shader_compile), draw
   * those whose program is linked (cheap then; at most one first use per frame), release the
   * objects whose stand-ins all drew.
   */
  private reveal(): void {
    const r = this.ctx.renderer;
    if (this.toCompile.length) {
      this.scene.add(...this.toCompile.map((s) => s.obj));
      this.withTarget(() => r.compile(this.scene, this.ctx.camera));
      this.scene.clear();
      this.toCompile.length = 0;
    }
    const t0 = performance.now();
    for (let i = 0; i < this.revealQueue.length && performance.now() - t0 < REVEAL_BUDGET_MS; ) {
      const s = this.revealQueue[i]!;
      const prog = (r.properties.get((s.obj as Mesh).material) as { currentProgram?: { isReady?: () => boolean } }).currentProgram;
      if (prog?.isReady && !prog.isReady()) {
        i++;
        continue;
      }
      this.revealQueue.splice(i, 1);
      const first = this.draw(s);
      releaseGeometry((s.obj as Mesh).geometry);
      if (first) break;
    }
    for (const [o, h] of this.held) {
      const warm = h.keys.every((k) => this.drawn.has(k) || !this.seen.has(k));
      const [dist, radius] = this.sphereOf(o);
      if (!shouldRelease(warm, this.holdR, dist, radius)) continue;
      o.layers.mask = h.mask;
      this.held.delete(o);
      if (!warm) this.stats.forced++;
    }
  }

  private releaseAll(): void {
    for (const [o, h] of this.held) o.layers.mask = h.mask;
    this.held.clear();
    for (const s of this.revealQueue) releaseGeometry((s.obj as Mesh).geometry);
    this.revealQueue.length = 0;
    this.toCompile.length = 0;
  }

  /** What is not drawn now (+ the effect's stand-ins, + the other era's models), warmed. */
  private *pass(withEffect: boolean): Generator<unknown, void> {
    const ctx = this.ctx;
    const sources: Drawable[] = withEffect ? (this.src.effect() as Drawable[]) : [];
    const cam = ctx.camera;
    ctx.scene.traverse((o) => {
      const d = o as Drawable;
      if (d.geometry && d.material && o.layers.test(cam.layers) && !shown(o)) sources.push(d);
    });
    yield;
    yield* this.warm(standIns(sources, this.seen));
    // the other era's models: fetched in the background, then warmed like the rest
    let roots: Object3D[] = [];
    yield this.src.templates().then(
      (r) => (roots = r),
      () => (roots = []),
    );
    const meshes: Drawable[] = [];
    for (const root of roots) root.traverse((o) => void ((o as Mesh).isMesh && meshes.push(o as Drawable)));
    yield* this.warm(standIns(meshes, this.seen, true));
    // what the systems build only once the next era is active (prewarm.ts registry)
    const samples: Drawable[] = [];
    for (const root of this.src.registered()) root.traverse((o) => void ((o as Drawable).geometry && (o as Drawable).material && samples.push(o as Drawable)));
    yield;
    yield* this.warm(standIns(samples, this.seen));
    // the other era's terrain data (not referenced by any material until the era switches)
    const r = ctx.renderer;
    for (const t of this.src.extraTextures()) {
      if (this.uploaded.has(t)) continue;
      this.uploaded.add(t);
      r.initTexture(t);
      yield;
    }
    this.stats.passes++;
  }

  /** Bind the post target around `fn` (where the scene passes draw: linear output, the program key depends on it). */
  private withTarget<T>(fn: () => T): T {
    const r = this.ctx.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.ctx.post.target);
    try {
      return fn();
    } finally {
      r.setRenderTarget(prev);
    }
  }

  /**
   * Draw one stand-in into the post target (and a caster into the shadow target): builds its
   * pipelines and uploads the shared buffers and the material's textures. True when the draw was
   * a program's first use.
   */
  private draw(s: StandIn): boolean {
    const ctx = this.ctx;
    const r = ctx.renderer;
    const scene = this.scene;
    scene.add(s.obj);
    this.withTarget(() => r.render(scene, ctx.camera));
    if (s.casts && ctx.world.shadows.enabled) ctx.world.shadows.warm(r, scene);
    scene.clear();
    this.drawn.add(s.key);
    this.stats.drawn++;
    const mat = (s.obj as Mesh).material as Material;
    const prog = (r.properties.get(mat) as { currentProgram?: object }).currentProgram;
    if (!prog || this.usedPrograms.has(prog)) return false;
    this.usedPrograms.add(prog);
    return true;
  }

  /** Compile the stand-ins (in parallel), then draw them, at most one first program use per frame. */
  private *warm(list: StandIn[]): Generator<unknown, void> {
    if (!list.length) return;
    const r = this.ctx.renderer;
    const scene = this.scene;
    const pending: Promise<unknown>[] = [];
    for (let i = 0; i < list.length; i += CHUNK) {
      scene.add(...list.slice(i, i + CHUNK).map((s) => s.obj));
      pending.push(this.withTarget(() => r.compileAsync(scene, this.ctx.camera)));
      scene.clear();
      yield;
    }
    yield Promise.all(pending);
    // a program's first use still costs the GPU process 10–110 ms (ANGLE Metal finishes the
    // program and builds the pipeline then, the next synchronous GL call waits for it): each such
    // draw ends the frame's warm-up work, so it lands alone in an idle frame
    for (const s of list) {
      const first = this.draw(s);
      yield first ? NEXT_FRAME : undefined;
    }
    for (const s of list) releaseGeometry((s.obj as Mesh).geometry);
  }
}
