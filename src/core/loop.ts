/**
 * Fixed-step game loop.
 *  - `update(dt)` runs at a fixed rate (default 60 Hz) — all gameplay logic lives here, which
 *    keeps it deterministic (`step(n)` in tests and the `window.kq.step` hook).
 *  - `render(frameDt, alpha)` runs once per animation frame (camera smoothing, visuals, rendering).
 * When paused, fixed updates stop but rendering continues.
 */
export interface LoopCallbacks {
  update(dt: number): void;
  render(frameDt: number, alpha: number): void;
}

export class FixedStepLoop {
  readonly dt: number;
  /** Fixed steps executed since start. */
  tick = 0;
  /** Simulated seconds (tick · dt). */
  get time(): number {
    return this.tick * this.dt;
  }
  paused = false;
  /** When true the rAF loop doesn't advance simulation; only `step(n)` does (deterministic tests). */
  manual = false;
  private acc = 0;
  private last = -1;
  private raf = 0;
  private running = false;
  /** Upper bound of catch-up steps per frame (avoids the spiral of death after a stall). */
  maxStepsPerFrame = 8;

  constructor(
    private readonly cb: LoopCallbacks,
    hz = 60,
    private readonly raf_: (fn: FrameRequestCallback) => number = (fn) => requestAnimationFrame(fn),
    private readonly caf_: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {
    this.dt = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    const frame = (t: number) => {
      if (!this.running) return;
      this.raf = this.raf_(frame);
      this.frame(t / 1000);
    };
    this.raf = this.raf_(frame);
  }

  stop(): void {
    this.running = false;
    this.caf_(this.raf);
  }

  /** Advance one animation frame at wall-clock time `now` (seconds). Public for tests. */
  frame(now: number): void {
    const frameDt = this.last < 0 ? this.dt : Math.min(0.25, Math.max(0, now - this.last));
    this.last = now;
    if (!this.paused && !this.manual) {
      this.acc += frameDt;
      let n = 0;
      while (this.acc >= this.dt && n < this.maxStepsPerFrame) {
        this.cb.update(this.dt);
        this.tick++;
        this.acc -= this.dt;
        n++;
      }
      if (n === this.maxStepsPerFrame) this.acc = 0;
    }
    this.cb.render(frameDt, this.paused || this.manual ? 1 : this.acc / this.dt);
  }

  /** Run exactly `n` fixed updates now (ignores pause), then render once. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.cb.update(this.dt);
      this.tick++;
    }
    this.cb.render(this.dt, 1);
  }
}
