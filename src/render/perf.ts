import type { WebGLRenderer } from 'three';

/** Frame budgets (docs/PERFORMANCE.md). Checked by the bench and the perf HUD colours. */
export const PERF_BUDGET = {
  /** Draw calls per frame (all passes). */
  calls: 300,
  /** Triangles per frame (all passes). */
  triangles: 1_500_000,
  /** CPU time of one rendered frame (systems.frame + world.frame + issuing GL calls), ms. */
  cpuMs: 8,
  /** Target frame time on a mid laptop GPU (60 fps). */
  frameMs: 16.7,
} as const;

/** Frames kept in the ring buffer (≈ 4 s at 60 fps). */
const RING = 240;

export interface PerfSummary {
  frames: number;
  fps: number;
  frameAvg: number;
  frameP95: number;
  frameMax: number;
  cpuAvg: number;
  cpuP95: number;
  /** GPU ms per frame when EXT_disjoint_timer_query_webgl2 is available, else null. */
  gpuAvg: number | null;
  calls: number;
  callsMax: number;
  triangles: number;
  trianglesMax: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Percentile of the first n values of a typed array (copy, no allocation per call beyond `scratch`). */
function percentile(src: Float32Array, n: number, p: number, scratch: Float32Array): number {
  if (n === 0) return 0;
  scratch.set(src.subarray(0, n));
  const s = scratch.subarray(0, n).sort();
  return s[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))]!;
}

/**
 * Per-frame performance counters (no allocations per frame). boot.ts calls `begin()` at the start
 * of the render callback and `end()` after post FX; `renderer.info.autoReset` is off so draw calls
 * and triangles add up over every pass of a frame (scene → HDR target, post quad, offscreen
 * passes of features). Read by the perf HUD (F3 / `?perf`), the bench (`kq.bench()`) and the
 * quality manager's auto-downgrade.
 */
export class PerfMonitor {
  readonly frameMs = new Float32Array(RING);
  readonly cpuMs = new Float32Array(RING);
  readonly calls = new Float32Array(RING);
  readonly tris = new Float32Array(RING);
  private readonly scratch = new Float32Array(RING);
  /** Ring write position and fill. */
  private i = 0;
  private n = 0;
  private t0 = 0;
  private lastEnd = -1;
  /** Total frames measured. */
  frames = 0;
  /** Optional recorder (bench): receives every frame. */
  onFrame: ((frameMs: number, cpuMs: number, calls: number, tris: number) => void) | null = null;
  // GPU timer (WebGL2 + EXT_disjoint_timer_query_webgl2, usually desktop Chrome only)
  private gl: WebGL2RenderingContext | null = null;
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private queries: WebGLQuery[] = [];
  private pending: WebGLQuery[] = [];
  private gpuAcc = 0;
  private gpuN = 0;
  gpuMs: number | null = null;
  gpuEnabled = false;

  constructor(private readonly renderer: WebGLRenderer) {
    renderer.info.autoReset = false;
  }

  /** Turn the GPU timer on (perf HUD / bench); no-op without the extension. */
  enableGpuTimer(on: boolean): void {
    this.gpuEnabled = on;
    if (!on || this.gl) return;
    const gl = this.renderer.getContext();
    if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    if (!ext) return;
    this.gl = gl;
    this.timerExt = ext;
  }

  /** Context loss invalidates both the extension and all its outstanding query objects. */
  discardGpuQueries(): void {
    this.gl = this.timerExt = null;
    this.queries.length = this.pending.length = 0;
    this.gpuAcc = this.gpuN = 0;
    this.gpuMs = null;
  }

  begin(): void {
    this.t0 = performance.now();
    this.renderer.info.reset();
    if (this.gpuEnabled && this.gl && this.timerExt) {
      const q = this.queries.pop() ?? this.gl.createQuery();
      if (q) {
        this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
        this.pending.push(q);
      }
    }
  }

  end(): void {
    const now = performance.now();
    const cpu = now - this.t0;
    const frame = this.lastEnd < 0 ? cpu : now - this.lastEnd;
    this.lastEnd = now;
    const r = this.renderer.info.render;
    const k = this.i;
    this.frameMs[k] = frame;
    this.cpuMs[k] = cpu;
    this.calls[k] = r.calls;
    this.tris[k] = r.triangles;
    this.i = (k + 1) % RING;
    if (this.n < RING) this.n++;
    this.frames++;
    this.onFrame?.(frame, cpu, r.calls, r.triangles);
    if (this.gl && this.timerExt && this.pending.length) {
      const gl = this.gl;
      if (this.gpuEnabled) gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      // collect finished queries (results arrive a few frames late)
      while (this.pending.length > (this.gpuEnabled ? 1 : 0)) {
        const q = this.pending[0]!;
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(this.timerExt.GPU_DISJOINT_EXT) as boolean;
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        this.pending.shift();
        this.queries.push(q);
        if (!disjoint) {
          this.gpuAcc += ns / 1e6;
          this.gpuN++;
          if (this.gpuN >= 20) {
            this.gpuMs = this.gpuAcc / this.gpuN;
            this.gpuAcc = 0;
            this.gpuN = 0;
          }
        }
      }
    }
  }

  /** Ignore the wall-clock gap of the next frame (after a stall: tab hidden, shader compile, bench setup). */
  resetClock(): void {
    this.lastEnd = -1;
  }

  /** Average frame time (ms) of the last `n` frames (frame-to-frame wall time). */
  recentFrameMs(n = 60): number {
    const m = Math.min(n, this.n);
    if (!m) return 0;
    let s = 0;
    for (let j = 1; j <= m; j++) s += this.frameMs[(this.i - j + RING) % RING]!;
    return s / m;
  }

  summary(): PerfSummary {
    const n = this.n;
    let fs = 0;
    let fmax = 0;
    let cs = 0;
    let calls = 0;
    let callsMax = 0;
    let tris = 0;
    let trisMax = 0;
    for (let j = 0; j < n; j++) {
      fs += this.frameMs[j]!;
      fmax = Math.max(fmax, this.frameMs[j]!);
      cs += this.cpuMs[j]!;
      calls += this.calls[j]!;
      callsMax = Math.max(callsMax, this.calls[j]!);
      tris += this.tris[j]!;
      trisMax = Math.max(trisMax, this.tris[j]!);
    }
    const d = Math.max(1, n);
    const mem = this.renderer.info.memory;
    return {
      frames: n,
      fps: fs > 0 ? (1000 * n) / fs : 0,
      frameAvg: fs / d,
      frameP95: percentile(this.frameMs, n, 0.95, this.scratch),
      frameMax: fmax,
      cpuAvg: cs / d,
      cpuP95: percentile(this.cpuMs, n, 0.95, this.scratch),
      gpuAvg: this.gpuMs,
      calls: Math.round(calls / d),
      callsMax,
      triangles: Math.round(tris / d),
      trianglesMax: trisMax,
      geometries: mem.geometries,
      textures: mem.textures,
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }
}

/** Frame-time statistics of a recorded series (bench). Pure; exported for tests. */
export function frameStats(ms: number[]): { n: number; avg: number; p50: number; p95: number; p99: number; max: number } {
  const n = ms.length;
  if (!n) return { n: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))]!;
  return { n, avg: s.reduce((a, b) => a + b, 0) / n, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[n - 1]! };
}
