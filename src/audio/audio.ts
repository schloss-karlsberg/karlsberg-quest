import type { Camera } from 'three';
import { Vector3 } from 'three';

export type Bus = 'music' | 'sfx' | 'ambience' | 'voice';

export interface Source3D {
  /** Connect your synth output here. */
  readonly input: GainNode;
  readonly panner: PannerNode;
  setPosition(x: number, y: number, z: number): void;
  dispose(): void;
}

/**
 * Web Audio manager: master → {music, sfx, ambience, voice} buses, 3D sources (PannerNode, HRTF),
 * listener bound to the camera. The AudioContext is created on `unlock()`, which must run
 * inside a user gesture (the "Laterne entzünden" click). Before that, `ctx` is null and helpers
 * no-op, so systems can call them freely.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly unlockHandlers: ((ctx: AudioContext) => void)[] = [];
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  volumes = { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 0.9 };
  private noiseBuf: AudioBuffer | null = null;

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Create/resume the context. Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.ratio.value = 3;
        this.master.connect(comp).connect(ctx.destination);
        for (const b of ['music', 'sfx', 'ambience', 'voice'] as Bus[]) {
          const g = ctx.createGain();
          g.connect(this.master);
          this.buses.set(b, g);
        }
        this.applyVolumes();
        for (const fn of this.unlockHandlers.splice(0)) fn(ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
  }

  /** Run `fn` as soon as audio is available (immediately if it already is). */
  onUnlock(fn: (ctx: AudioContext) => void): void {
    if (this.ctx) fn(this.ctx);
    else this.unlockHandlers.push(fn);
  }

  setVolumes(v: Partial<AudioManager['volumes']>): void {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    for (const [b, g] of this.buses) g.gain.setTargetAtTime(this.volumes[b], t, 0.05);
  }

  bus(b: Bus): GainNode | null {
    return this.buses.get(b) ?? null;
  }

  private hiddenSuspend = false;

  /**
   * Hidden tab: suspend the context (HRTF panners, wind and drones stop costing CPU), resume when
   * the tab is visible again (only what this call suspended).
   */
  setHidden(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (hidden && ctx.state === 'running') {
        this.hiddenSuspend = true;
        void ctx.suspend().catch(() => {});
      } else if (!hidden && this.hiddenSuspend) {
        this.hiddenSuspend = false;
        void ctx.resume().catch(() => {});
      }
    } catch {
      /* closed context */
    }
  }

  /** Duck/fade all sound (pause menu). */
  setPaused(paused: boolean): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(paused ? this.volumes.master * 0.25 : this.volumes.master, this.ctx.currentTime, 0.15);
  }

  /** A positional source on a bus. Returns null while locked. */
  createSource3D(bus: Bus, opts: { refDistance?: number; maxDistance?: number; rolloff?: number } = {}): Source3D | null {
    const ctx = this.ctx;
    const dest = this.bus(bus);
    if (!ctx || !dest) return null;
    const input = ctx.createGain();
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: opts.refDistance ?? 4,
      maxDistance: opts.maxDistance ?? 2000,
      rolloffFactor: opts.rolloff ?? 1,
    });
    input.connect(panner).connect(dest);
    return {
      input,
      panner,
      setPosition(x, y, z) {
        const t = ctx.currentTime;
        panner.positionX.setTargetAtTime(x, t, 0.02);
        panner.positionY.setTargetAtTime(y, t, 0.02);
        panner.positionZ.setTargetAtTime(z, t, 0.02);
      },
      dispose() {
        input.disconnect();
        panner.disconnect();
      },
    };
  }

  /** Shared 4 s white-noise buffer (loopable) for synth helpers. */
  noise(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = (seed / 4294967296) * 2 - 1;
      }
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** Keep the listener on the camera. Call once per frame. */
  updateListener(camera: Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    camera.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(this.fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(this.fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(this.fwd.z, t, 0.02);
      l.upX.setTargetAtTime(this.up.x, t, 0.02);
      l.upY.setTargetAtTime(this.up.y, t, 0.02);
      l.upZ.setTargetAtTime(this.up.z, t, 0.02);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
    }
  }
}
