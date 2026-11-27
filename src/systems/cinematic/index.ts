/**
 * In-game cinematics (contract C1, docs/design/tour/systems.md §2): short camera moves on game time,
 * no video. Request: `cinematic:play` (full spec, src/systems/cinematic/types.ts) or the story cue
 * `story:cue { id: 'cinematic', data: <spec> }` (bridge until the story's own action lands).
 *
 *  - The camera goes through `ctx.cinematic.takeCamera` (boot's override slot, takeover.ts): the shot
 *    runs after the rig every drawn frame, the character stays visible, the player is frozen
 *    (`lockInput`, default) and gets yaw / pitch back; the hand-back eases 0.4 s (a cut with reduced motion).
 *  - The timeline runs on fixed steps: Esc (the pause menu) and any modal stop it.
 *  - Skip (skippable, default): any key / click / touch after a 0.5 s grace. Esc does not skip.
 *  - The HUD steps back (`html[data-kq-cinematic]`), subtitles and story lines stay; centre cards wait.
 *  - No autosave while it plays (`save.hold`); a save that holds a playing cinematic does not replay
 *    it: after the load / at game start the system emits `cinematic:end { skipped: true }`.
 *  - Reduced motion (`settings.reducedMotion`): 'stills' = the first and the last key with a dip
 *    through black, ≤ 3 s; 'skip' = start + end { skipped: true } at once.
 *  - A bad spec never hangs a beat: console.warn + `cinematic:end { skipped: true }`.
 *  - Ends early (skipped: true) on an era change, the player's death, a load, a camera error.
 *
 * Debug: `kq.cinematic` (play / skip / at / list / playing). Pure key maths: keys.ts.
 */
import { Color } from 'three';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { addStrings, t } from '../../i18n';
import { h } from '../../ui/dom';
import type { EraLook } from '../../world/eraPresets';
import './cinematic.css';
import { loadBundledCinematics } from './data';
import { type Env, type Plan, type Pose, type Snapshot, type Vec3, newPose, normalize, poseAt, stillsAt, stillsSeconds } from './keys';
import { registeredTarget } from './targets';
import type { CineTarget, CinematicFile, CinematicPlay } from './types';
import './types';

export type { CineTarget, CinematicFile, CinematicKey, CinematicOrbit, CinematicPlay } from './types';
export { registerTarget } from './targets';

addStrings('de', {
  'cinematic.skip': 'Zum Überspringen tippen oder eine Taste drücken',
});

export interface CinematicSlice {
  /** The cinematic playing when the state was saved (it is not replayed after a load). */
  playing: string | null;
}

declare module '../../core/state' {
  interface SystemStates {
    cinematic: CinematicSlice;
  }
}

/** Seconds after the start before a key / click / touch may skip. */
export const SKIP_GRACE = 0.5;
export const CAMERA_OWNER = 'cinematic';
/** Keys that never skip: Esc pauses (boot opens the menu), P pauses, F-keys are tools (F8 notes, F3 perf). */
const PASS_KEY = /^(Escape|KeyP|F\d+)$/;

const mixHex = (a: string, b: string, k: number) => '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, k))).getHexString();

interface Playing {
  plan: Plan;
  /** Clock (s): the source clock, or the stills clock with reduced motion. */
  t: number;
  /** Length of this play's clock. */
  T: number;
  reduced: boolean;
  snap: Snapshot;
  hold: { yaw: number; pitch: number };
  pose: Pose;
  lastSrc?: number;
  holdAt: number | null;
  era: string;
  look0: EraLook | null;
  fade: number;
}

/** The cinematic player (one at a time). Exported for tests (a fake ctx works: no DOM needed). */
export class CinematicRuntime {
  private cur: Playing | null = null;
  private ui: { root: HTMLElement; fade: HTMLElement; skip: HTMLElement } | null = null;
  private hooked = false;
  private readonly env: Env;

  constructor(
    private readonly ctx: GameContext,
    readonly files: Readonly<Record<string, CinematicFile>> = {},
  ) {
    this.env = {
      ground: (x, z) => {
        const g = ctx.world.heightAt(x, z);
        return Number.isFinite(g) ? g : (this.cur?.snap.y ?? 0);
      },
      target: (id) => this.target(id),
    };
  }

  init(): void {
    const ev = this.ctx.events;
    ev.on('cinematic:play', (p) => void this.play(p));
    // bridge until the story's own `cinematic` action dispatches cinematic:play
    ev.on('story:cue', ({ id, data }) => {
      if (id === 'cinematic') void this.play(data);
    });
    ev.on('cinematic:stop', (p) => {
      if (p && this.cur && this.cur.plan.id === p.id) this.end(true);
    });
    ev.on('save:loaded', () => this.afterLoad());
    // the game started on a save that held a playing cinematic (a cinematic started by a
    // game:start handler before this one keeps playing)
    ev.on('game:start', () => {
      const s = this.slice();
      if (this.cur || !s.playing) return;
      const id = s.playing;
      s.playing = null;
      this.ctx.events.emit('cinematic:end', { id, skipped: true });
    });
    ev.on('shift:done', () => this.end(true));
    ev.on('era:change', () => this.end(true));
    ev.on('player:died', () => this.end(true));
  }

  get playing(): string | null {
    return this.cur?.plan.id ?? null;
  }

  /** Seconds into the playing cinematic (its own clock), null when none plays. */
  get time(): number | null {
    return this.cur?.t ?? null;
  }

  private slice(): CinematicSlice {
    return this.ctx.state.slice('cinematic', () => ({ playing: null }));
  }

  /** Start a cinematic from a request (any JSON); false when rejected (cinematic:end skipped already emitted). */
  play(raw: unknown): boolean {
    const ctx = this.ctx;
    const n = normalize(raw, this.files);
    if (!n.ok) {
      console.warn(`[cinematic] '${n.id}' rejected: ${n.error}`);
      ctx.events.emit('cinematic:end', { id: n.id, skipped: true });
      return false;
    }
    const plan = n.plan;
    if (this.cur) this.end(true);
    const reduced = ctx.settings.state.reducedMotion === true;
    if (reduced && plan.reduced === 'skip') {
      ctx.events.emit('cinematic:start', { id: plan.id, seconds: 0 });
      ctx.events.emit('cinematic:end', { id: plan.id, skipped: true });
      return true;
    }
    const pl = ctx.player;
    const cam = ctx.camera;
    const snap: Snapshot = {
      x: pl.position.x,
      y: pl.position.y,
      z: pl.position.z,
      yaw: pl.yaw,
      pitch: pl.pitch,
      eye: pl.eyeHeight > 0.3 ? pl.eyeHeight : 1.62,
      cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.fov },
    };
    const T = reduced ? stillsSeconds(plan) : plan.seconds;
    const cur: Playing = { plan, t: 0, T, reduced, snap, hold: { yaw: pl.yaw, pitch: pl.pitch }, pose: newPose(), holdAt: null, era: ctx.era.current, look0: null, fade: 0 };
    const took = ctx.cinematic.takeCamera(CAMERA_OWNER, (c) => this.shoot(c), {
      showAvatar: true,
      freeze: plan.lockInput,
      // the takeover let go on its own (era change, death, a load, an error in the shot)
      onRelease: (reason) => {
        if (reason !== 'release' && reason !== 'load' && this.cur === cur) this.end(true);
      },
    });
    if (!took) {
      console.warn(`[cinematic] '${plan.id}': the camera is held by '${ctx.cinematic.cameraOwner ?? 'another override'}'`);
      ctx.events.emit('cinematic:end', { id: plan.id, skipped: true });
      return false;
    }
    this.cur = cur;
    if (plan.keys?.some((k) => k.fog > 0 || k.sun > 0 || k.dark > 0)) cur.look0 = structuredClone(ctx.world.look);
    this.slice().playing = plan.id;
    ctx.save.hold('cinematic', true);
    ctx.ui.cards.hold('cinematic', true);
    ctx.ui.hud.busy('stage-cinematic', true);
    this.showUi(true);
    ctx.events.emit('cinematic:start', { id: plan.id, seconds: T });
    return true;
  }

  /** End the playing cinematic (once): give the camera and the look back, emit cinematic:end. */
  end(skipped: boolean): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.teardown(c);
    this.slice().playing = null;
    this.ctx.save.hold('cinematic', false);
    this.ctx.events.emit('cinematic:end', { id: c.plan.id, skipped });
  }

  private teardown(c: Playing): void {
    const ctx = this.ctx;
    ctx.cinematic.releaseCamera(CAMERA_OWNER);
    // the look back, unless the era changed under the shot (the new era set its own)
    if (c.look0 && ctx.era.current === c.era) {
      ctx.world.look = c.look0;
      ctx.world.applyLook();
    }
    ctx.ui.cards.hold('cinematic', false);
    ctx.ui.hud.busy('stage-cinematic', false, 0);
    this.showUi(false);
  }

  /** A load (or the game's start on a save): never replay; end what played, and what the save held. */
  private afterLoad(): void {
    const ids = new Set<string>();
    const c = this.cur;
    if (c) {
      this.cur = null;
      this.teardown(c);
      ids.add(c.plan.id);
    }
    const s = this.slice();
    if (s.playing) ids.add(s.playing);
    s.playing = null;
    this.ctx.save.hold('cinematic', false);
    for (const id of ids) this.ctx.events.emit('cinematic:end', { id, skipped: true });
  }

  /** A player's key / click / touch: skips after the grace (if skippable). */
  userSkip(): boolean {
    const c = this.cur;
    if (!c || !c.plan.skippable || c.t < SKIP_GRACE) return false;
    if (this.ctx.ui.modals.count > 0 || this.ctx.pause.paused) return false;
    this.end(true);
    return true;
  }

  /** Hold the picture of `id` at t (starting it from content/cinematics when another / none plays); t < 0 runs on. */
  at(id: string, t: number): void {
    if (this.cur?.plan.id !== id && !this.play({ id, ref: id })) return;
    const c = this.cur!;
    if (!Number.isFinite(t) || t < 0) {
      c.holdAt = null;
      return;
    }
    c.holdAt = Math.min(c.T, t);
    c.t = c.holdAt;
  }

  update(dt: number): void {
    this.installHooks();
    const c = this.cur;
    if (!c) return;
    if (c.holdAt !== null) {
      c.t = c.holdAt;
      return;
    }
    c.t += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    if (c.t >= c.T) this.end(false);
  }

  /** The source time shown now. */
  private srcTime(c: Playing): number {
    return c.reduced ? stillsAt(c.plan, c.t).src : c.t;
  }

  /** The camera shot (the takeover calls it every drawn frame after the rig). */
  private shoot(cam: GameContext['camera']): void {
    const c = this.cur;
    if (!c) return;
    const src = this.srcTime(c);
    const p = c.pose;
    if (!c.reduced || src !== c.lastSrc) {
      poseAt(c.plan, src, c.snap, this.env, c.hold, p);
      c.lastSrc = src;
    }
    c.hold.yaw = p.yaw;
    c.hold.pitch = p.pitch;
    cam.position.set(p.x, p.y, p.z);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (Math.abs(cam.fov - p.fov) > 1e-4) {
      cam.fov = p.fov;
      cam.updateProjectionMatrix();
    }
    c.fade = Math.max(p.fade, c.reduced ? stillsAt(c.plan, c.t).dip : 0);
  }

  frame(): void {
    this.installHooks();
    const c = this.cur;
    if (!c) return;
    if (this.ui) {
      this.ui.fade.style.opacity = c.fade.toFixed(3);
      this.ui.skip.classList.toggle('on', c.plan.skippable && c.t >= SKIP_GRACE);
    }
    if (c.look0) this.applyLook(c, c.look0);
  }

  /** The look keys (fog thicker, a low warm sun, night) over the look the cinematic started in. */
  private applyLook(c: Playing, L0: EraLook): void {
    const { fog, sun, dark } = c.pose;
    const L = structuredClone(L0);
    const f = 1 + 2.2 * fog;
    L.fog.density = L0.fog.density * f;
    L.fog.ground = L0.fog.ground * f;
    L.fog.heightDensity = L0.fog.heightDensity * f;
    if (sun > 0) {
      L.sun.elevation = L0.sun.elevation + (14 - L0.sun.elevation) * sun;
      L.sun.color = mixHex(L0.sun.color, '#ffd9a8', sun);
      L.sky.horizon = mixHex(L0.sky.horizon, '#f0c7a0', sun * 0.6);
      L.grade.exposure *= 1 + 0.12 * sun;
    }
    if (dark > 0) {
      L.fog.color = mixHex(L.fog.color, '#0b0e16', dark);
      L.fog.sunColor = mixHex(L.fog.sunColor, '#05060a', dark);
      L.sky.zenith = mixHex(L.sky.zenith, '#010204', dark);
      L.sky.horizon = mixHex(L.sky.horizon, '#10131c', dark);
      L.sun.intensity *= 1 - 0.6 * dark;
      L.ambient.intensity *= 1 - 0.5 * dark;
      L.grade.vignette = Math.min(0.9, L.grade.vignette + 0.35 * dark);
    }
    this.ctx.world.look = L;
    this.ctx.world.applyLook();
  }

  /** A look target's world point now (null: unknown, the view holds). */
  private target(id: CineTarget): Vec3 | null {
    const ctx = this.ctx;
    if (id === 'player') {
      const p = ctx.player.renderPos ?? ctx.player.position;
      return { x: p.x, y: p.y + (ctx.player.eyeHeight > 0.3 ? ctx.player.eyeHeight : 1.62) * 0.92, z: p.z };
    }
    const reg = registeredTarget(id);
    if (reg && Number.isFinite(reg.x) && Number.isFinite(reg.z)) return { x: reg.x, z: reg.z, y: reg.y ?? this.env.ground(reg.x, reg.z) + 0.6 };
    if (id.startsWith('npc:')) {
      const npc = id.slice(4);
      const live = typeof window !== 'undefined' ? window.kq?.npc?.list().find((n) => n.npc === npc) : undefined;
      if (live) return { x: live.x, y: live.y + 1.5, z: live.z };
      const placed = (ctx.state.state.systems as { npc?: { placed?: Record<string, { x?: number; z?: number; y?: number }> } }).npc?.placed?.[npc];
      if (placed && Number.isFinite(placed.x) && Number.isFinite(placed.z)) return { x: placed.x!, z: placed.z!, y: (placed.y ?? this.env.ground(placed.x!, placed.z!)) + 1.5 };
    }
    return null;
  }

  // ---- DOM (letterbox, fade, skip hint, input) — absent in the node tests

  private readonly onKey = (e: KeyboardEvent): void => {
    const c = this.cur;
    if (!c || PASS_KEY.test(e.code) || this.ctx.ui.modals.count > 0) return;
    // input frozen: the key does not reach the game (E, attack, jump …)
    if (c.plan.lockInput) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (!e.repeat) this.userSkip();
  };

  private readonly onPointer = (): void => {
    this.userSkip();
  };

  private showUi(on: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.toggleAttribute('data-kq-cinematic', on);
    if (on) {
      if (!this.ui) {
        const fade = h('div.kq-cine-fade', { 'data-testid': 'cinematic-fade' });
        const skip = h('div.kq-cine-skip', { 'data-testid': 'cinematic-skip' }, t('cinematic.skip'));
        const root = h('div.kq-cine', { 'data-testid': 'cinematic' }, [h('div.kq-cine-bar.top'), h('div.kq-cine-bar.bottom'), fade, skip]);
        this.ui = { root, fade, skip };
      }
      this.ui.root.dataset.id = this.cur?.plan.id ?? '';
      this.ui.fade.style.opacity = '0';
      this.ui.skip.classList.remove('on');
      document.body.appendChild(this.ui.root);
      void this.ui.root.offsetWidth;
      this.ui.root.classList.add('on');
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('pointerdown', this.onPointer, true);
    } else {
      this.ui?.root.classList.remove('on');
      this.ui?.root.remove();
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('pointerdown', this.onPointer, true);
    }
  }

  private installHooks(): void {
    if (this.hooked || typeof window === 'undefined' || !window.kq) return;
    this.hooked = true;
    window.kq.cinematic = {
      play: (spec) => {
        if (typeof spec === 'string') {
          if (!Object.prototype.hasOwnProperty.call(this.files, spec)) {
            console.warn(`[cinematic] no content/cinematics/${spec}.json`);
            return false;
          }
          return this.play({ id: spec, ref: spec } satisfies CinematicPlay);
        }
        return this.play(spec);
      },
      skip: () => this.end(true),
      at: (id, t) => this.at(id, t),
      list: () => Object.keys(this.files).sort(),
      playing: () => this.playing,
    };
  }

  dispose(): void {
    const c = this.cur;
    if (c) {
      this.cur = null;
      this.teardown(c);
      // Keep the interrupted shot ID in the flushed save so a loaded story can receive its end.
      this.ctx.save.hold('cinematic', false);
    }
  }
}

let runtime: CinematicRuntime | null = null;

export default defineSystem({
  id: 'cinematic',
  init(ctx) {
    runtime = new CinematicRuntime(ctx, loadBundledCinematics());
    runtime.init();
  },
  update(dt) {
    runtime?.update(dt);
  },
  frame() {
    runtime?.frame();
  },
  dispose() {
    runtime?.dispose();
    runtime = null;
  },
});
