/**
 * The era shift (W1 "Das Schloss steigt aus dem Boden"): a LiDAR scan wave leaves the player and
 * turns the world into a glowing point cloud, time runs backwards around the player, the brass
 * compass whirls, the era switches under cover at the midpoint, and the new era reassembles from
 * the ground up — the palace rises out of the LiDAR ground. Reduced motion: a plain crossfade.
 */
import {
  AdditiveBlending,
  AlwaysDepth,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  GreaterDepth,
  LessEqualDepth,
  LineSegments,
  Mesh,
  type Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { GameContext } from '../../../core/context';
import { ERA_INFO, type Era } from '../../../core/era';
import { shiftSweep } from '../audio';
import { makeScreenPass, pointScale } from '../gl';
import { rng } from '../geom';
import type { ShiftReason } from '../../contracts';
import type { Quality } from '../quality';
import type { FxUI } from '../ui';
import { TerrainCloudJob, buildTreeCloud, palaceCloudGeometry, palaceSamples } from './pointcloud';
import { holdRadius } from './reveal';
import { CLOUD_FRAG, CLOUD_VERT, FADE_FRAG, REWIND_FRAG, REWIND_VERT, VEIL_FRAG, VEIL_VERT } from './shaders';
import {
  SHIFT_DURATION,
  SHIFT_DURATION_REDUCED,
  SHIFT_MID,
  SHIFT_MID_REDUCED,
  type ShiftCurves,
  reducedCurves,
  ruinForCut,
  shiftCurves,
} from './timeline';

const VOID = new Color(0.004, 0.008, 0.02);
/** Frame budget for writing terrain cloud rings (ms). */
const TERRAIN_BUDGET_MS = 3;
/** Rings are kept built this far (m) beyond the scan-wave front (its glow fades within ~8 m). */
const WAVE_AHEAD = 12;
const BRASS = new Color(1.0, 0.62, 0.22);

function cloudMaterial(kind: 0 | 1 | 2, size: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    defines: { KIND: kind },
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uWaveR: { value: 0 },
      uInR: { value: 0 },
      uMorph: { value: 0 },
      uPalCut: { value: 40 },
      uPalLine: { value: -10 },
      uPalSolid: { value: -10 },
      uTreeCut: { value: 0 },
      uTreeNew: { value: 0 },
      uScale: { value: 500 },
      uSize: { value: size },
      uCenter: { value: new Vector3() },
      uFlash: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function rewindMaterial(center: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: REWIND_VERT,
    fragmentShader: REWIND_FRAG,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uCenter: { value: center } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** One-point geometry with the attributes a cloud layer of `kind` reads (warm-up stand-ins). */
function stubCloudGeometry(kind: 0 | 1 | 2): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
  g.setAttribute('aRand', new BufferAttribute(new Float32Array(1), 1));
  if (kind === 0) {
    g.setAttribute('aH2', new BufferAttribute(new Float32Array(1), 1));
    g.setAttribute('aShade', new BufferAttribute(new Float32Array(1), 1));
  } else g.setAttribute('aBase', new BufferAttribute(new Float32Array(1), 1));
  if (kind === 1) g.setAttribute('aConf', new BufferAttribute(new Float32Array(1), 1));
  if (kind === 2) g.setAttribute('aRel', new BufferAttribute(new Float32Array(1), 1));
  return g;
}

export interface ShiftOptions {
  reduced: boolean;
  /** The 'shift:request' reason, passed through to 'shift:done'. */
  reason?: ShiftReason;
}

export class ShiftEffect {
  active = false;
  /** Debug: stop the effect clock (scrub with setTime). */
  frozen = false;
  t = 0;
  from: Era = 'today';
  to: Era = 'today';
  private reduced = false;
  private reason: ShiftReason | undefined;
  private midDone = false;
  private pendingNewTrees = -1;
  private readonly center = new Vector3();
  private readonly veil: Mesh;
  private readonly veilMat: ShaderMaterial;
  private readonly fade: Mesh;
  private readonly skyCover: Mesh;
  private readonly layers: Points[] = [];
  private treesOld: Points | null = null;
  private treesNew: Points | null = null;
  private rewind: LineSegments | null = null;
  private palaceGeo: BufferGeometry | null = null;
  private terrainJob: TerrainCloudJob | null = null;
  private savedVol: { ambience: number; music: number } | null = null;
  private wasFrozen = false;
  private onDone: (() => void)[] = [];
  private warmSet: Object3D[] | null = null;
  private veilMode: ShiftCurves['veil'] = 'none';
  private veilR = 0;
  private veilAlpha = 1;

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: FxUI,
    private readonly quality: Quality,
  ) {
    this.veilMat = new ShaderMaterial({
      vertexShader: VEIL_VERT,
      fragmentShader: VEIL_FRAG,
      uniforms: { uColor: { value: VOID.clone() }, uAlpha: { value: 1 } },
      side: BackSide,
      transparent: true,
      depthWrite: false,
    });
    this.veil = new Mesh(new SphereGeometry(1, 48, 24), this.veilMat);
    this.veil.frustumCulled = false;
    this.veil.renderOrder = 900;
    this.veil.visible = false;
    this.fade = makeScreenPass(FADE_FRAG, { uColor: { value: VOID.clone() }, uAlpha: { value: 0 } }, 901);
    this.skyCover = makeScreenPass(FADE_FRAG, { uColor: { value: VOID.clone() }, uAlpha: { value: 0 } }, 899, true);
    ctx.scene.add(this.veil, this.fade, this.skyCover);
  }

  /**
   * Stand-ins for the effect's own shader programs (point-cloud kinds, rewind streaks) plus the
   * hidden veil / fade / sky cover, for the warm-up (fx/shift/warm.ts) to compile before the first
   * shift. The stand-ins are never added to the scene nor disposed: while they live, three keeps
   * the programs cached and each shift's fresh layer materials reuse them instead of compiling on
   * the shift's first frame (M-17). Same shaders, defines and flags as the real layers.
   */
  warmObjects(): Object3D[] {
    if (!this.warmSet) {
      const kinds = [0, 1, 2] as const;
      const set: Object3D[] = kinds.map((k) => new Points(stubCloudGeometry(k), cloudMaterial(k, 0.22)));
      const lg = new BufferGeometry();
      lg.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
      lg.setAttribute('aSeed', new BufferAttribute(new Float32Array(8), 4));
      lg.setAttribute('aTail', new BufferAttribute(new Float32Array(2), 1));
      set.push(new LineSegments(lg, rewindMaterial(new Vector3())));
      for (const o of set) o.frustumCulled = false;
      this.warmSet = set;
    }
    return [...this.warmSet, this.veil, this.fade, this.skyCover];
  }

  /** How far from the camera the veil still hides the new era (fx/shift/reveal.ts; 0: nothing). */
  get holdRadius(): number {
    return holdRadius({ active: this.active, reduced: this.reduced, switched: this.midDone, veil: this.veilMode, veilR: this.veilR, veilAlpha: this.veilAlpha });
  }

  /** Begin a shift to `to`. Resolves when the effect is done. */
  start(to: Era, opts: ShiftOptions): Promise<void> {
    const ctx = this.ctx;
    if (this.active) this.finish();
    this.from = ctx.era.current;
    this.to = to;
    this.reduced = opts.reduced;
    this.reason = opts.reason;
    this.active = true;
    this.t = 0;
    this.midDone = false;
    this.veilMode = 'none';
    // Interrupted set pieces can give up their movement lock before the shift takes over.
    ctx.events.emit('shift:begin', { from: this.from, to });
    this.center.copy(ctx.player.position);
    this.wasFrozen = ctx.player.frozen;
    ctx.player.frozen = true;
    if (!this.reduced) this.buildScene();
    // sound: the world drops away, the compass sings
    const am = ctx.audio;
    if (am.ctx) {
      this.savedVol = { ambience: am.volumes.ambience, music: am.volumes.music };
      const t = am.ctx.currentTime;
      am.bus('ambience')?.gain.setTargetAtTime(am.volumes.ambience * 0.12, t, 0.25);
      am.bus('music')?.gain.setTargetAtTime(am.volumes.music * 0.2, t, 0.25);
      const dur = this.reduced ? SHIFT_DURATION_REDUCED : SHIFT_DURATION;
      shiftSweep(am, am.bus('sfx'), dur, this.reduced ? SHIFT_MID_REDUCED : SHIFT_MID);
    }
    this.ui.caption('fx.cap.shift', 3, 3000);
    return new Promise((res) => this.onDone.push(res));
  }

  private buildScene(): void {
    const ctx = this.ctx;
    const hi = this.quality.high;
    const w = ctx.world;
    const fromI = ERA_INFO[this.from];
    const toI = ERA_INFO[this.to];
    const cx = this.center.x;
    const cz = this.center.z;
    // terrain with both reliefs (2025 ↔ 1789 morph at the midpoint)
    // built ring by ring ahead of the scan wave (apply), not all on the shift's first frame (M-17)
    this.terrainJob = new TerrainCloudJob(w.heightfields[fromI.terrain], w.heightfields[toI.terrain], cx, cz, 360, hi ? 900 : 500, hi ? 1.03 : 1.05);
    this.terrainJob.step(TERRAIN_BUDGET_MS, WAVE_AHEAD);
    this.addLayer(new Points(this.terrainJob.geometry, cloudMaterial(0, 0.22)));
    // palace surface points (only if either era shows the palace)
    if (fromI.palace !== 'hidden' || toI.palace !== 'hidden') {
      const s = palaceSamples(w.palace.object);
      if (s) {
        this.palaceGeo = palaceCloudGeometry(s);
        if (!hi) this.palaceGeo.setDrawRange(0, Math.floor(s.count * 0.45));
        this.addLayer(new Points(this.palaceGeo, cloudMaterial(1, 0.3)));
      }
    }
    // trees of the old era (the new ones are sampled once the forest has switched)
    const trees = buildTreeCloud(w.forest.object, cx, cz, 300, hi ? 2600 : 1000, hi ? 30 : 18);
    this.treesOld = new Points(trees, cloudMaterial(2, 0.22));
    this.addLayer(this.treesOld);
    // time-rewind streaks
    const n = hi ? 500 : 260;
    const r = rng(99);
    const seed = new Float32Array(n * 2 * 4);
    const tail = new Float32Array(n * 2);
    const pos = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const s = [r() * Math.PI * 2, 6 + Math.pow(r(), 1.5) * 50, -1 + r() * 9, 0.6 + r() * 1.2];
      for (let k = 0; k < 2; k++) {
        seed.set(s, (i * 2 + k) * 4);
        tail[i * 2 + k] = k;
      }
    }
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(pos, 3));
    lg.setAttribute('aSeed', new BufferAttribute(seed, 4));
    lg.setAttribute('aTail', new BufferAttribute(tail, 1));
    this.rewind = new LineSegments(lg, rewindMaterial(this.center));
    this.rewind.frustumCulled = false;
    this.rewind.renderOrder = 1001;
    ctx.scene.add(this.rewind);
  }

  private addLayer(p: Points): void {
    p.frustumCulled = false;
    p.renderOrder = 1000;
    (p.material as ShaderMaterial).uniforms.uCenter!.value = this.center;
    this.layers.push(p);
    this.ctx.scene.add(p);
  }

  /** Advance the effect clock (real frame time). */
  advance(dt: number): void {
    if (!this.active) return;
    if (!this.frozen) this.setTime(this.t + dt);
    else this.apply();
  }

  /** Jump to an effect time (debug scrubbing; crossing the midpoint switches the era). */
  setTime(t: number): void {
    if (!this.active) return;
    this.t = Math.max(0, t);
    const mid = this.reduced ? SHIFT_MID_REDUCED : SHIFT_MID;
    const dur = this.reduced ? SHIFT_DURATION_REDUCED : SHIFT_DURATION;
    if (!this.midDone && this.t >= mid) this.midpoint();
    if (this.t >= dur) {
      this.finish();
      return;
    }
    this.apply();
  }

  private midpoint(): void {
    const ctx = this.ctx;
    this.midDone = true;
    ctx.era.set(this.to);
    ctx.player.frozen = true; // era.set re-grounds the player; keep them still
    this.pendingNewTrees = 1;
    ctx.events.emit('shift:midpoint', { from: this.from, to: this.to });
  }

  private apply(): void {
    const ctx = this.ctx;
    const pu = ctx.post.uniforms;
    if (this.reduced) {
      const c = reducedCurves(this.t);
      this.fade.visible = c.alpha > 0.001;
      (this.fade.material as ShaderMaterial).uniforms.uAlpha!.value = c.alpha;
      return;
    }
    // sample the new era's trees once the forest has rebuilt its instances (one frame later)
    if (this.pendingNewTrees >= 0 && this.pendingNewTrees-- === 0) {
      const hi = this.quality.high;
      const g = buildTreeCloud(ctx.world.forest.object, this.center.x, this.center.z, 300, hi ? 2600 : 1000, hi ? 30 : 18, 4);
      this.treesNew = new Points(g, cloudMaterial(2, 0.22));
      (this.treesNew.material as ShaderMaterial).uniforms.uTreeNew!.value = 1;
      this.addLayer(this.treesNew);
    }
    const fromLook = ERA_INFO[this.from].palace;
    const toLook = ERA_INFO[this.to].palace;
    const c: ShiftCurves = shiftCurves(this.t, fromLook, toLook);
    // terrain rings: always built out past the wave front (a ring only shows behind the wave)
    const tj = this.terrainJob;
    if (tj && !tj.done) tj.step(TERRAIN_BUDGET_MS, c.waveR + WAVE_AHEAD);
    this.veilMode = c.veil;
    this.veilR = c.veilR;
    this.veilAlpha = c.veilAlpha;
    // veil: hides the solid world behind / in front of the waves
    const vm = this.veilMat;
    this.veil.visible = c.veil !== 'none';
    this.veil.position.copy(ctx.camera.position);
    if (c.veil === 'out') {
      vm.depthFunc = GreaterDepth;
      vm.depthWrite = true;
      this.veil.scale.setScalar(Math.max(0.6, c.veilR));
    } else if (c.veil === 'full') {
      vm.depthFunc = AlwaysDepth;
      vm.depthWrite = true;
      this.veil.scale.setScalar(5000);
    } else if (c.veil === 'in') {
      vm.depthFunc = LessEqualDepth;
      vm.depthWrite = false;
      this.veil.scale.setScalar(Math.max(0.6, c.veilR));
    }
    vm.uniforms.uAlpha!.value = c.veilAlpha;
    // the sky is not in the depth buffer: cover it before the veil goes 'full'
    // the sky dims into the void as the wave runs out, and comes back with the reassembly
    const skyA = Math.min(1, Math.max(0, (this.t - 0.1) / 0.8)) * (1 - Math.min(1, Math.max(0, (this.t - 2.6) / 0.8)));
    this.skyCover.visible = skyA > 0.001;
    (this.skyCover.material as ShaderMaterial).uniforms.uAlpha!.value = skyA;
    const fadeA = c.veil === 'out' ? Math.min(1, Math.max(0, (this.t - 1.15) / 0.3)) : 0;
    this.fade.visible = fadeA > 0.001;
    (this.fade.material as ShaderMaterial).uniforms.uAlpha!.value = fadeA;
    // point cloud
    const scale = pointScale(ctx.camera, ctx.renderer);
    for (const p of this.layers) {
      const u = (p.material as ShaderMaterial).uniforms;
      u.uTime!.value = this.t;
      u.uAlpha!.value = c.points;
      u.uWaveR!.value = c.waveR;
      u.uInR!.value = c.inR;
      u.uMorph!.value = c.morph;
      u.uPalCut!.value = c.palCut;
      u.uPalLine!.value = c.palLine;
      u.uPalSolid!.value = c.palSolid;
      u.uScale!.value = scale;
      u.uFlash!.value = c.flash * (ctx.settings.state.reducedFlash ? 0.08 : 0.6);
      u.uTreeCut!.value = p === this.treesNew ? c.treesIn : c.treesOut;
    }
    if (this.treesOld) this.treesOld.visible = !this.midDone || c.treesOut < 1;
    // the solid palace follows its point line
    const visibleLook = this.midDone ? toLook : fromLook;
    if (visibleLook !== 'hidden') ctx.world.palace.uniforms.uRuin!.value = ruinForCut(c.palSolid);
    // rewind streaks
    if (this.rewind) {
      const u = (this.rewind.material as ShaderMaterial).uniforms;
      u.uTime!.value = this.t;
      u.uAlpha!.value = c.rewind * 0.35;
    }
    // post: warp, brass flash, a touch of desaturation in the void
    pu.uShift!.value = c.warp;
    (pu.uFlash!.value as Color).copy(BRASS).multiplyScalar(c.flash * 0.28);
    pu.uDesaturate!.value = 0.35 * c.warp;
    this.ui.setCompass(c.whirl, c.needle, -c.needle * 0.12);
  }

  /** End the effect, restore everything and emit 'shift:done'. */
  finish(): void {
    if (!this.active) return;
    const ctx = this.ctx;
    if (!this.midDone) this.midpoint();
    this.active = false;
    this.frozen = false;
    this.veil.visible = false;
    this.fade.visible = false;
    this.skyCover.visible = false;
    for (const p of this.layers) {
      ctx.scene.remove(p);
      if (p.geometry !== this.palaceGeo) p.geometry.dispose();
      (p.material as ShaderMaterial).dispose();
    }
    this.palaceGeo?.dispose();
    this.palaceGeo = null;
    this.terrainJob = null;
    this.layers.length = 0;
    this.treesOld = this.treesNew = null;
    if (this.rewind) {
      ctx.scene.remove(this.rewind);
      this.rewind.geometry.dispose();
      (this.rewind.material as ShaderMaterial).dispose();
      this.rewind = null;
    }
    ctx.world.palace.setMode(ERA_INFO[ctx.era.current].palace);
    const pu = ctx.post.uniforms;
    pu.uShift!.value = 0;
    (pu.uFlash!.value as Color).setRGB(0, 0, 0);
    pu.uDesaturate!.value = 0;
    this.ui.setCompass(0, 0, 0);
    ctx.player.frozen = this.wasFrozen;
    const am = ctx.audio;
    if (am.ctx && this.savedVol) {
      const t = am.ctx.currentTime;
      am.bus('ambience')?.gain.setTargetAtTime(am.volumes.ambience, t, 0.6);
      am.bus('music')?.gain.setTargetAtTime(am.volumes.music, t, 0.6);
      this.savedVol = null;
    }
    if (this.reason !== 'caught') ctx.state.mutable.meta.shifts++;
    ctx.events.emit('shift:done', { from: this.from, to: this.to, reason: this.reason });
    for (const fn of this.onDone.splice(0)) fn();
  }

  dispose(): void {
    this.finish();
    this.ctx.scene.remove(this.veil, this.fade, this.skyCover);
    this.veil.geometry.dispose();
    this.veilMat.dispose();
  }
}
