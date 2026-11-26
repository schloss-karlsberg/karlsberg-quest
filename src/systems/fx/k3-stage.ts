/**
 * K3 "Die Nacht" staged in the engine (playtest round 4: climaxes shown, not captioned). Owned by
 * fx; it draws, it does not decide the story:
 *
 *  - the Ehrenhof crowd (k3-crowd: unloading in the afternoon, the crowd at dusk, the plunderers in
 *    the fire), chosen from the story's chapter / beat (no story: afternoon, or `kq.fx.k3.phase`);
 *  - the Strohmann's cart bursting when the boss spawns (`enemy:spawned {kind:'strohmann'}`);
 *  - the torch (k3-torch) synced to the `clue.k3.fackel` echo: the commissioner raises it while
 *    he speaks and the crowd chants, throws it on the echo's third cue, the view turns to the
 *    window (reduced motion: a cut), a flash (reduced flash: dimmed), then the ground floor round
 *    the court catches window by window; the Mannlich line comes last (content);
 *  - the fire seen from outside (k3-blaze) while the fire threat runs;
 *  - story cues `k3:jost-run {x, z, toX, toZ}` (Jost runs off with his horn and lantern) and
 *    `k3:wisp` (a thread of cold smoke rising from the Bussole in the field station).
 */
import { Color, Group, InstancedBufferAttribute, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { extractOpenings } from '../interiors/shell';
import type { FireController } from './fire/fire';
import { quadInstanced } from './gl';
import { Blaze, type BlazeSource, pickColumns } from './k3-blaze';
import { court, Crowd, type ScenePhase, type XZ } from './k3-crowd';
import { FLIGHT, TorchStage, courtWindows, ringsOf } from './k3-torch';
import type { Quality } from './quality';

export const FACKEL_ECHO = 'clue.k3.fackel';
const COURT_CENTER = { x: 1222, z: -1118 };
const WINGS = ['KB-B01', 'KB-B02', 'KB-B03'];
/** The torch goes in right of the vestibule door (court u 61.5, w 4.6). */
const TORCH_TARGET = court(61.5, 4.6);
/** Echo cue index of the throw (0: "Im Namen der Nation!", 1: "Ça ira", 2: the throw). */
const THROW_CUE = 2;

type EchoProbe = () => { id: string | null; t: number; total: number; line: number };

function echoProbe(): EchoProbe | null {
  const c = (window.kq as unknown as { chronik?: { echo?: EchoProbe } } | undefined)?.chronik;
  return typeof c?.echo === 'function' ? c.echo : null;
}

const WISP_VERT = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uFrom;
uniform float uT;
attribute float aPuff;
varying vec2 vUv;
varying float vA;
varying float vSeed;
void main() {
  float k = fract(aPuff * 7.31);
  float age = uT - aPuff * 2.6;
  float a = smoothstep(0.0, 0.5, age) * (1.0 - smoothstep(1.8, 3.2, age));
  vec3 c = uFrom + vec3(sin(age * 1.7 + k * 9.0) * 0.05 * age, age * 0.16, cos(age * 1.3 + k * 5.0) * 0.04 * age);
  float size = 0.05 + 0.1 * age;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy - 0.5;
  vec3 p = c + right * q.x * size + up * q.y * size * 1.8;
  vUv = position.xy;
  vA = a;
  vSeed = k;
  gl_Position = a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const WISP_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying float vA;
varying float vSeed;
void main() {
  vec2 q = vUv - 0.5;
  float n = kqFbm(vec2(vUv.x * 3.0 + vSeed * 9.0, vUv.y * 2.0 - uTime * 0.6));
  float thread = 1.0 - smoothstep(0.04, 0.2, abs(q.x + (n - 0.5) * 0.35));
  float a = thread * smoothstep(0.5, 0.2, abs(q.y)) * vA * 0.42;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.62, 0.6, 0.58), a);
}
`;

export interface K3StageState {
  phase: ScenePhase;
  crowd: Record<string, number>;
  windows: number;
  torch: number;
  lit: number;
  commissioner: boolean;
  strohmann: number;
  blaze: number;
  columns: number;
  run: number;
  wisp: number;
}

export class K3Stage {
  readonly object = new Group();
  private readonly crowd = new Crowd();
  private readonly torch = new TorchStage();
  private readonly blaze = new Blaze();
  private readonly wisp: Mesh;
  /** Scene clock (game time). */
  private T = 0;
  private phase: ScenePhase = 'off';
  private override: ScenePhase | null = null;
  /** Torch: seconds since the throw (driven by the echo or `torchManual`). */
  private torchT = -100;
  private torchManual: number | null = null;
  private throwAt = -1;
  private raise = 0;
  private chant = 0;
  private echoOn = false;
  /** The torch flew and the echo finished: the windows stay alight until the fire takes over. */
  private thrown = false;
  private lookT = 0;
  private climax = false;
  private strohAt = -1;
  private runAt = -1;
  private run: XZ[] | null = null;
  private wispAt = -1;
  private litFrac = 0;
  private glowOwned = false;
  /** 0..1 flash on impact (composed into post.uFlash by fx). */
  flash = 0;
  private blazeTimer = 0;
  private sources: BlazeSource[] = [];
  private builtWindows = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly fire: FireController,
    private readonly quality: Quality,
  ) {
    this.object.name = 'k3-stage';
    this.object.add(this.crowd.object, this.torch.object, this.blaze.object);
    const wg = quadInstanced();
    const pf = new Float32Array(9);
    for (let i = 0; i < 9; i++) pf[i] = i / 9;
    wg.setAttribute('aPuff', new InstancedBufferAttribute(pf, 1));
    wg.instanceCount = 9;
    this.wisp = new Mesh(
      wg,
      new ShaderMaterial({
        vertexShader: WISP_VERT,
        fragmentShader: WISP_FRAG,
        uniforms: { ...atmosphere, uFrom: { value: new Vector3() }, uT: { value: -1 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.wisp.frustumCulled = false;
    this.wisp.renderOrder = 12;
    this.wisp.visible = false;
    this.object.add(this.wisp);
    ctx.scene.add(this.object);

    const ev = ctx.events;
    ev.on('echo:start', ({ id }) => {
      if (id !== FACKEL_ECHO) return;
      this.echoOn = true;
      this.throwAt = -1;
      this.lookT = 0;
      this.thrown = false;
    });
    ev.on('echo:end', ({ id }) => {
      if (id !== FACKEL_ECHO) return;
      this.echoOn = false;
      // heard to the end: the windows keep burning until the fire runs; walked away: they go out
      const found = ctx.state.state.inventory.clues.includes(FACKEL_ECHO);
      this.thrown = found || this.torchT >= FLIGHT;
      if (!this.thrown) this.torchT = -100;
    });
    ev.on('enemy:spawned', ({ kind }) => {
      if (kind === 'strohmann' && this.strohAt < 0) this.strohAt = this.T;
    });
    ev.on('era:change', () => {
      this.run = null;
      this.runAt = -1;
      if (!this.echoOn) this.thrown = false;
    });
    ev.on('story:cue', ({ id, data }) => {
      if (id === 'k3:jost-run') {
        const d = (data ?? {}) as Record<string, unknown>;
        const n = (k: string, f: number) => (typeof d[k] === 'number' ? (d[k] as number) : f);
        const jost = (window.kq as unknown as { npc?: { list?: () => { npc: string; x: number; z: number }[] } } | undefined)?.npc?.list?.().find((f) => f.npc === 'jost');
        const from = { x: n('x', jost?.x ?? 1250), z: n('z', jost?.z ?? -1568) };
        const to = { x: n('toX', 1150), z: n('toZ', -1700) };
        // round the east corner of the kennel wall, then off into the dark
        this.run = [from, { x: from.x + 7, z: from.z - 34 }, to];
        this.runAt = this.T;
      } else if (id === 'k3:wisp') {
        const cam = ctx.camera;
        const f = new Vector3();
        cam.getWorldDirection(f);
        const u = this.wisp.material as ShaderMaterial;
        (u.uniforms.uFrom!.value as Vector3).copy(cam.position).addScaledVector(f, 0.85).add(new Vector3(0, -0.32, 0));
        this.wispAt = this.T;
      }
    });
  }

  /** Fixed step: the scene clock. */
  update(dt: number): void {
    this.T += dt;
  }

  private storyState(): { chapter: string | null; beat: string | null } {
    const s = (this.ctx.state.state.systems as Record<string, unknown>)['story'] as { active?: boolean; chapter?: string | null; beat?: string | null } | undefined;
    return { chapter: s?.chapter ?? null, beat: s?.beat ?? null };
  }

  private flag(k: string): unknown {
    return this.ctx.state.state.flags[k];
  }

  private computePhase(): ScenePhase {
    if (this.ctx.era.current !== '1793-07') return 'off';
    if (this.override) return this.override;
    const { chapter, beat } = this.storyState();
    const fackel = this.ctx.state.state.inventory.clues.includes(FACKEL_ECHO);
    if (this.fire.active || (chapter === 'k3' && fackel && !this.echoOn)) return 'fire';
    if (this.echoOn || this.thrown) return 'dusk';
    if (chapter === 'k3' && beat === 'k3_2') return 'dusk';
    return 'afternoon';
  }

  private ensureWindows(): void {
    if (this.builtWindows) return;
    const mesh = (this.ctx.world.palace.object.getObjectByName('palace-merged') as Mesh | undefined) ?? null;
    if (!mesh) return;
    this.builtWindows = true;
    const byIndex = new Map<number, string>();
    for (const b of this.ctx.world.palace.buildings) if (WINGS.includes(b.id)) byIndex.set(b.index, b.id);
    const openings = extractOpenings(mesh.geometry, byIndex);
    const wins = courtWindows(openings, ringsOf(this.ctx.data.footprints.buildings, WINGS));
    this.torch.build(wins, TORCH_TARGET.x, TORCH_TARGET.z);
  }

  /** Per rendered frame. */
  frame(dt: number, pointScale: number): void {
    const ctx = this.ctx;
    const st = ctx.settings.state;
    const era1793 = ctx.era.current === '1793-07';
    this.phase = this.computePhase();
    const cam = ctx.camera.position;
    const near = Math.hypot(cam.x - COURT_CENTER.x, cam.z - COURT_CENTER.z);
    if (era1793 && near < 700) this.ensureWindows();

    // ---- the torch, synced to the echo ------------------------------------------------------
    const probe = echoProbe();
    const e = this.echoOn ? probe?.() : null;
    if (this.torchManual !== null) {
      this.torchT = this.torchManual;
    } else if (e && e.id === FACKEL_ECHO) {
      if (this.throwAt < 0 && e.line >= THROW_CUE) this.throwAt = e.line > THROW_CUE ? e.t - 6 : e.t;
      this.torchT = this.throwAt >= 0 ? e.t - this.throwAt : -100;
      // he lifts the torch while he speaks, holds it up while they sing
      this.raise = this.throwAt >= 0 ? -1 : Math.min(1, Math.max(0, (e.t - 1.6) / 1.8));
      this.chant = Math.min(1, Math.max(this.chant, e.line >= 1 ? 1 : e.line >= 0 ? 0.4 : 0));
    } else if (this.thrown) {
      this.torchT += dt;
      this.raise = -1;
    } else {
      this.raise = 0;
    }
    if (!this.echoOn) this.chant = Math.max(0, this.chant - dt * 0.4);
    if (!era1793) {
      this.torchT = -100;
      this.thrown = false;
    }
    const fireAll = era1793 && this.fire.active ? 1 : 0;
    const showTorch = era1793 && (this.echoOn || this.thrown || this.torchManual !== null || fireAll > 0);
    const t = showTorch ? this.torchT : -100;
    this.torch.object.visible = showTorch;
    if (this.torch.ready) {
      const hand = this.crowd.hand.ok ? this.crowd.hand : { ...court(36, -4), y: ctx.world.heightfield.heightAt(court(36, -4).x, court(36, -4).z) + 3.2 };
      this.torch.update(t, fireAll, hand, pointScale, st.reducedFlash || st.reducedMotion, st.reducedMotion);
    }
    // impact: a flash, then the court lit by the windows (before the fire controller takes over)
    if (st.reducedMotion) this.flash = 0;
    else {
      if (t >= FLIGHT && t < FLIGHT + dt + 0.05 && showTorch && !fireAll) this.flash = Math.max(this.flash, st.reducedFlash ? 0.2 : 0.85);
      this.flash = Math.max(0, this.flash - dt * 2.2);
    }
    this.litFrac = showTorch ? Math.min(1, Math.max(0, (t - FLIGHT) / (Math.max(1, this.torch.wins.length) * 0.16 + 0.5))) : 0;
    this.frameGlow(fireAll > 0, st.reducedFlash || st.reducedMotion);
    // the view turns to the window as the torch leaves the hand (a look-at cue, not a lock)
    if (this.echoOn && this.torchManual === null && t > -0.5 && t < FLIGHT + 1.6) this.turnView(dt, t);
    // the torch is the chapter's climax: no card or toast slides over it (hud action reason 'stage')
    const climax = this.echoOn && showTorch;
    if (climax !== this.climax) {
      this.climax = climax;
      ctx.ui.hud.busy('stage-k3', climax, 0);
    }

    // ---- the crowd -------------------------------------------------------------------------
    const showCrowd = era1793 && near < 260 && this.phase !== 'off';
    this.crowd.object.visible = showCrowd || this.runAt >= 0;
    const hf = ctx.world.heightfield;
    const strohDown = (Number(this.flag('quest.q.k3.strohmann.strohmann')) || 0) >= 1;
    const { chapter } = this.storyState();
    const commissioner = this.phase === 'dusk' && (strohDown || this.echoOn || this.thrown || chapter !== 'k3' || this.override === 'dusk');
    if (this.runAt >= 0 && this.T - this.runAt > 70) {
      this.runAt = -1;
      this.run = null;
    }
    if (this.crowd.object.visible) {
      this.crowd.update(
        {
          phase: showCrowd ? this.phase : 'off',
          T: this.T,
          heightAt: (x, z) => hf.heightAt(x, z),
          chant: this.chant,
          strohBurst: this.strohAt >= 0 || strohDown ? 1 : 0,
          strohT: this.strohAt >= 0 ? this.T - this.strohAt : -1,
          commissioner,
          torchRaise: this.raise,
          runT: this.runAt >= 0 && era1793 ? this.T - this.runAt : -1,
          run: this.run,
          warm: this.phase === 'fire' ? 1 : this.litFrac,
          reducedMotion: st.reducedMotion,
        },
        pointScale,
      );
    }

    // ---- the fire from outside ---------------------------------------------------------------
    this.blazeTimer -= dt;
    if (this.blazeTimer <= 0) {
      this.blazeTimer = 0.25;
      this.sources = this.fire.active && era1793 ? this.collectSources() : [];
    }
    this.blaze.object.visible = this.sources.length > 0;
    this.blaze.update(this.sources, { high: this.quality.high, reducedFlash: st.reducedFlash, pointScale });

    // ---- the Bussole's cold smoke ------------------------------------------------------------
    const wt = this.wispAt >= 0 ? this.T - this.wispAt : -1;
    this.wisp.visible = !st.reducedMotion && wt >= 0 && wt < 9;
    (this.wisp.material as ShaderMaterial).uniforms.uT!.value = wt;
    if (wt > 9) this.wispAt = -1;
  }

  /** Before the fire runs, the burning windows light the court themselves. */
  private frameGlow(fireOn: boolean, steady: boolean): void {
    if (fireOn) {
      this.glowOwned = false;
      return;
    }
    const tgt = this.torch.target();
    if (this.litFrac > 0.001 && tgt) {
      const flick = steady ? 0.85 : 0.85 + 0.1 * Math.sin(atmosphere.uTime.value * 7.1) + 0.05 * Math.sin(atmosphere.uTime.value * 17.3);
      atmosphere.uGlowPos.value.set(COURT_CENTER.x + 18, tgt.y + 4, COURT_CENTER.z);
      atmosphere.uGlowColor.value.set('#ff5a14').multiplyScalar((0.3 + 1.0 * this.litFrac) * flick + this.flash * 2);
      this.glowOwned = true;
    } else if (this.glowOwned) {
      this.glowOwned = false;
      const L = this.ctx.world.look.glow;
      atmosphere.uGlowColor.value.set(L.color).multiplyScalar(L.intensity);
      atmosphere.uGlowPos.value.set(1262, 360, -1126);
    }
  }

  private turnView(dt: number, t: number): void {
    const tgt = this.torch.target();
    if (!tgt) return;
    const pl = this.ctx.player;
    const h = this.crowd.hand.ok ? this.crowd.hand : tgt;
    // follow the arc: between hand and window early, the window once it is in
    const k = Math.max(0, Math.min(1, (t + 0.3) / (FLIGHT + 0.3)));
    const fx = h.x + (tgt.x - h.x) * (0.45 + 0.55 * k);
    const fz = h.z + (tgt.z - h.z) * (0.45 + 0.55 * k);
    const fy = h.y + (tgt.y - h.y) * (0.45 + 0.55 * k) + 1.5 * (1 - k);
    const dx = fx - pl.position.x;
    const dz = fz - pl.position.z;
    const want = Math.atan2(-dx, -dz);
    let d = want - pl.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const reduced = this.ctx.settings.state.reducedMotion;
    const s = reduced ? 1 : Math.min(1, dt * 3.2);
    if (reduced && this.lookT > 0) return;
    this.lookT = 1;
    pl.yaw += d * s;
    const pitch = Math.max(-0.3, Math.min(0.5, Math.atan2(fy - (pl.position.y + 1.6), Math.hypot(dx, dz))));
    pl.pitch += (pitch - pl.pitch) * s;
  }

  private collectSources(): BlazeSource[] {
    const sim = this.fire.sim;
    if (!sim) return [];
    const by = new Map<string, { x: number; z: number; y: number; sum: number; n: number; w: number }>();
    this.fire.units.forEach((u, i) => {
      const I = sim.intensity(i);
      let b = by.get(u.building);
      if (!b) by.set(u.building, (b = { x: 0, z: 0, y: 0, sum: 0, n: 0, w: 0 }));
      b.n++;
      b.y = Math.max(b.y, u.ridge);
      const w = u.polygon.length ? 1 : 0;
      b.x = (b.x * b.w + u.cx * w) / Math.max(1e-6, b.w + w);
      b.z = (b.z * b.w + u.cz * w) / Math.max(1e-6, b.w + w);
      b.w += w;
      b.sum += I;
    });
    return pickColumns(by);
  }

  /** Debug / tests. */
  hooks() {
    return {
      state: (): K3StageState => ({
        phase: this.phase,
        crowd: { ...this.crowd.counts },
        windows: this.torch.wins.length,
        torch: this.torchT,
        lit: this.litFrac,
        commissioner: this.crowd.hand.ok,
        strohmann: this.strohAt >= 0 ? this.T - this.strohAt : -1,
        blaze: this.blaze.active,
        columns: this.sources.length,
        run: this.runAt >= 0 ? this.T - this.runAt : -1,
        wisp: this.wispAt >= 0 ? this.T - this.wispAt : -1,
      }),
      /** Force a phase (null = from the story). */
      phase: (p: ScenePhase | null) => {
        this.override = p;
      },
      /** Hold the torch sequence at t s after the throw (null = back to the echo). */
      torch: (t: number | null, raise = 1) => {
        this.torchManual = t;
        this.raise = t !== null && t < 0 ? raise : -1;
        if (t !== null) this.chant = 1;
      },
      clock: (T?: number) => {
        if (typeof T === 'number') this.T = T;
        return this.T;
      },
      strohmann: () => {
        this.strohAt = this.T;
      },
    };
  }

  dispose(): void {
    this.ctx.scene.remove(this.object);
    this.crowd.dispose();
    this.torch.dispose();
    this.blaze.dispose();
    this.wisp.geometry.dispose();
    (this.wisp.material as ShaderMaterial).dispose();
  }
}

export const K3_FLASH = new Color(0.12, 0.05, 0.015);
