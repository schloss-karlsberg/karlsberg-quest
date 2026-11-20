/**
 * Fixed-step game loop.
 *  - `update(dt)` runs at a fixed rate (default 60 Hz) — all gameplay logic lives here, which
 *    keeps it deterministic (`step(n)` in tests and the `window.kq.step` hook).
 *  - `render(frameDt, alpha)` runs on the animation frames the render pacing picks (camera
 *    smoothing, visuals, rendering); `frameDt` is the time since the previous rendered frame.
 * The fixed updates follow the wall clock on every animation frame, whatever the render rate; the
 * render pacing (`pace`, `FramePacer`, `renderRate`) only decides which frames are drawn.
 * When paused, fixed updates stop; rendering follows `pace` (menus render slowly or not at all).
 */
export interface LoopCallbacks {
  update(dt: number): void;
  render(frameDt: number, alpha: number): void;
}

/**
 * Render pacing (pure, tested): decides for each animation frame whether to draw it, so that at
 * most `fps` frames per second are drawn with steady spacing. Wall time collects in an
 * accumulator and every drawn frame spends one interval; half a display frame of slack absorbs
 * the jitter of the animation-frame timestamps. So 60 fps on a 120 Hz screen draws exactly every
 * 2nd frame and 30 fps every 4th (60 Hz screen: every frame / every 2nd); on rates that are no
 * multiple (144 Hz) the pattern alternates and averages to the cap. `Infinity` draws every frame,
 * 0 (or less) none.
 */
export class FramePacer {
  private acc = 1;
  private last = Number.NaN;
  /** Smoothed display frame interval (s) from the animation-frame timestamps (first one taken as is). */
  display = 0;

  /** One animation frame at `now` (s): draw it? */
  tick(now: number, fps: number): boolean {
    const dt = Number.isNaN(this.last) ? 0 : Math.max(0, now - this.last);
    this.last = now;
    // stalls, hidden tabs and parked loops say nothing about the display rate
    if (dt > 0 && dt < 0.1) this.display = this.display > 0 ? this.display + (dt - this.display) * 0.2 : dt;
    if (!(fps > 0)) {
      this.restart();
      return false;
    }
    if (!Number.isFinite(fps)) {
      this.restart();
      return true;
    }
    const interval = 1 / fps;
    this.acc += dt;
    const slack = 0.5 * (this.display > 0 ? this.display : 1 / 60);
    if (this.acc + slack < interval) return false;
    this.acc -= interval;
    // behind by more than a whole interval (slow frames, a stall): no burst of catch-up frames
    if (this.acc > interval) this.acc = 0;
    return true;
  }

  /** The next frame with a finite rate is drawn at once (after an idle phase or a forced frame). */
  restart(): void {
    this.acc = 1;
  }

  /** A frame was drawn outside the pacing (a request): the next paced frame is one interval later. */
  drawn(): void {
    this.acc = 0;
  }
}

/** Render rates of the idle states (docs/ARCHITECTURE.md §3, docs/PERFORMANCE.md §5). */
export const IDLE_RENDER = {
  /** Title screen (the drifting forest behind the menu). */
  titleFps: 30,
  /** Menus / modals over a view that still moves (dialogue camera, NPCs), other pause reasons. */
  modalFps: 15,
  /** A live modal renders at the cap this long after the stack changed (the dialogue camera eases in). */
  settleSeconds: 1.5,
} as const;

/** What the render pacing needs to know about the game right now (`renderRate`). */
export interface PaceState {
  /** The player's cap (settings „Bildrate“ / „Energiesparen“, `frameCap`): fps, Infinity = unbegrenzt. */
  cap: number;
  /** The tab is hidden. */
  hidden: boolean;
  /** Bullet time / `?manual`: the simulation only moves through `kq.step` / the pilot. */
  manual: boolean;
  /**
   * Full idle policy: bullet time renders only on request and still menus hold their frame. Off
   * under WebDriver unless `?idle` (e2e keeps rendering bullet time on every frame as before, menus
   * at `modalFps`), so specs that wait for frame-driven fades in `?manual` behave as they did.
   */
  hold: boolean;
  title: boolean;
  /** Open modals: none, only 'still' ones (pause menu, journal, map …: the view cannot change) or any 'live' one. */
  modal: 'none' | 'still' | 'live';
  /** Seconds since the modal stack last changed. */
  modalAge: number;
  /** Any other pause reason (the travel curtain). */
  paused: boolean;
}

/**
 * Renders per second allowed now (pure, tested): Infinity = every animation frame, 0 = only on
 * request (`FixedStepLoop.requestRender`), the last frame stays on screen.
 */
export function renderRate(s: PaceState): number {
  if (s.hidden) return 0;
  if (s.manual && s.hold) return 0;
  const cap = s.cap > 0 ? s.cap : Infinity;
  if (s.modal === 'still' && !s.title) return s.hold ? 0 : Math.min(cap, IDLE_RENDER.modalFps);
  if (s.modal === 'live') return !s.title && s.modalAge < IDLE_RENDER.settleSeconds ? cap : Math.min(cap, IDLE_RENDER.modalFps);
  if (s.modal === 'still') return Math.min(cap, IDLE_RENDER.modalFps);
  if (s.title) return Math.min(cap, IDLE_RENDER.titleFps);
  if (s.paused) return Math.min(cap, IDLE_RENDER.modalFps);
  return cap;
}

/** Settings → frame cap (pure, tested): „Bildrate“ 30 / 60 / 0 = unbegrenzt; „Energiesparen“ caps at 30. */
export function frameCap(fpsCap: number | undefined, powerSave: boolean | undefined): number {
  const c = typeof fpsCap === 'number' && Number.isFinite(fpsCap) ? fpsCap : 60;
  const base = c > 0 ? Math.max(15, c) : Infinity;
  return powerSave ? Math.min(base, 30) : base;
}

export class FixedStepLoop {
  readonly dt: number;
  /** Fixed steps executed since start. */
  tick = 0;
  /** Simulated seconds (tick · dt). */
  get time(): number {
    return this.tick * this.dt;
  }
  private paused_ = false;
  private manual_ = false;
  /** Fixed updates stop (menus, title); the render pacing decides what is still drawn. */
  get paused(): boolean {
    return this.paused_;
  }
  set paused(v: boolean) {
    if (v === this.paused_) return;
    this.paused_ = v;
    this.wake();
  }
  /** When true the rAF loop doesn't advance simulation; only `step(n)` does (deterministic tests, bullet time). */
  get manual(): boolean {
    return this.manual_;
  }
  set manual(v: boolean) {
    if (v === this.manual_) return;
    this.manual_ = v;
    this.wake();
  }
  /**
   * Render pacing: renders per second allowed right now (Infinity = every animation frame, 0 =
   * only on request). boot installs `renderRate(...)` with the game's state; the default draws every frame.
   */
  pace: () => number = () => Infinity;
  readonly pacer = new FramePacer();
  /** The frame being rendered ends an idle phase (pacing drew nothing, or the loop was parked): perf clocks restart. */
  resumed = false;
  private held = false;
  /** Animation frames drawn / skipped by the pacing (rAF only; `step` / `renderOnce` not counted). */
  drawn = 0;
  skipped = 0;
  private acc = 0;
  private last = -1;
  private lastRender = -1;
  private requests = 0;
  private raf = 0;
  private running = false;
  /** The rAF loop is parked: nothing to simulate, nothing to draw until `wake()` / `requestRender()`. */
  private parked = false;
  private frameFn: FrameRequestCallback | null = null;
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
    this.parked = false;
    this.last = -1;
    const frame = (t: number) => {
      if (!this.running) return;
      this.raf = this.raf_(frame);
      this.frame(t / 1000);
      // nothing moves and nothing is asked for: stop waking up at the display rate
      if (this.idle()) {
        this.caf_(this.raf);
        this.raf = 0;
        this.parked = true;
        this.held = true;
      }
    };
    this.frameFn = frame;
    this.raf = this.raf_(frame);
  }

  stop(): void {
    this.running = false;
    this.parked = false;
    this.caf_(this.raf);
  }

  /** Something the pacing depends on changed (modal, pause, settings, visibility): resume a parked loop. */
  wake(): void {
    if (!this.running || !this.parked || !this.frameFn) return;
    this.parked = false;
    // the parked time is no wall time the simulation owes (it was paused or manual anyway)
    this.last = -1;
    this.raf = this.raf_(this.frameFn);
  }

  /** Draw at least the next `frames` animation frames, whatever the pacing says (screenshots, bench, hooks). */
  requestRender(frames = 1): void {
    this.requests = Math.max(this.requests, frames);
    this.wake();
  }

  /** Parked state allowed: no simulation runs on its own and the pacing draws nothing. */
  private idle(): boolean {
    return (this.paused_ || this.manual_) && this.requests === 0 && !(this.pace() > 0);
  }

  /** Advance one animation frame at wall-clock time `now` (seconds). Public for tests. */
  frame(now: number): void {
    const frameDt = this.last < 0 ? this.dt : Math.min(0.25, Math.max(0, now - this.last));
    this.last = now;
    if (!this.paused_ && !this.manual_) {
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
    const fps = this.pace();
    let draw = this.pacer.tick(now, fps);
    if (!draw && this.requests > 0) {
      draw = true;
      this.pacer.drawn();
    }
    if (!draw) {
      this.skipped++;
      if (!(fps > 0)) this.held = true;
      return;
    }
    if (this.requests > 0) this.requests--;
    const first = this.lastRender < 0;
    const gap = first ? 0 : now - this.lastRender;
    this.lastRender = now;
    // after an idle phase (menu held, bullet time) the visuals go on where they stopped
    this.resumed = this.held;
    this.held = false;
    const renderDt = first || this.resumed ? this.dt : Math.min(0.25, Math.max(0, gap));
    this.drawn++;
    this.cb.render(renderDt, this.paused_ || this.manual_ ? 1 : this.acc / this.dt);
    this.resumed = false;
  }

  /** Run exactly `n` fixed updates now (ignores pause), then render once. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.cb.update(this.dt);
      this.tick++;
    }
    this.cb.render(this.dt, 1);
  }

  /** Run exactly `n` fixed updates without rendering (the bullet-time pilot renders only the frames it captures). */
  advance(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.cb.update(this.dt);
      this.tick++;
    }
  }

  /** Render once now; `frameDt` (s) is the time the visuals advance by (capped like a real frame). */
  renderOnce(frameDt = this.dt): void {
    this.cb.render(Math.min(0.25, Math.max(0, frameDt)), 1);
  }
}
