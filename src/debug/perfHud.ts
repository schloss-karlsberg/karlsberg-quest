import type { GameContext } from '../core/context';
import { PERF_BUDGET, type PerfMonitor } from '../render/perf';
import type { QualityManager } from '../render/quality';
import { h } from '../ui/dom';
import type { BenchResult } from './bench';

/**
 * Performance overlay (F3, `?perf`, or settings → „Leistungsanzeige“): frame-time graph of the last
 * 240 frames with 60 / 30 fps lines, fps, frame / CPU / GPU ms, draw calls, triangles,
 * geometries, textures, programs, the preset, terrain / tree counts and the five most expensive
 * systems. Values over the budget (render/perf.ts PERF_BUDGET) turn red. Shift+F3 runs the bench.
 */
export class PerfHud {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly text: HTMLElement;
  private readonly benchEl: HTMLElement;
  private timer = 0;
  private shown = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly perf: PerfMonitor,
    private readonly quality: QualityManager,
  ) {
    this.canvas = h('canvas', { width: 240, height: 56 });
    this.g = this.canvas.getContext('2d');
    this.text = h('div.kq-perf-text');
    this.benchEl = h('div.kq-perf-bench');
    this.el = h('div.kq-perf.kq-hidden', { 'data-testid': 'perf-hud', 'aria-hidden': 'true' }, [this.canvas, this.text, this.benchEl]);
    document.body.append(this.el);
  }

  get visible(): boolean {
    return this.shown;
  }

  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.el.classList.toggle('kq-hidden', !on);
    this.perf.enableGpuTimer(on);
    if (on) {
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 250);
    } else window.clearInterval(this.timer);
  }

  showBench(r: BenchResult | null, running = false): void {
    if (running) {
      this.benchEl.textContent = 'Bench läuft …';
      return;
    }
    if (!r) {
      this.benchEl.textContent = '';
      return;
    }
    const rows = r.scenes.map(
      (s) =>
        `${s.withinBudget ? ' ' : '!'} ${s.id.padEnd(22)} ${(1000 / Math.max(0.01, s.frameMs.avg)).toFixed(0).padStart(4)} fps  p95 ${s.frameMs.p95.toFixed(1).padStart(5)}  cpu ${s.cpuMs.avg.toFixed(1).padStart(4)}  ${String(s.calls.max).padStart(4)} dc  ${(s.triangles.max / 1000).toFixed(0).padStart(5)}k`,
    );
    this.benchEl.textContent = ['bench (scene  fps  p95 ms  cpu ms  calls  tris)', ...rows].join('\n');
  }

  private tick(): void {
    const s = this.perf.summary();
    const c = this.ctx;
    const over = (v: number, b: number) => (v > b ? ' ◀' : '');
    const sys = c.systems
      .stats()
      .filter((x) => !x.failed)
      .sort((a, b) => b.ms + b.frameMs - (a.ms + a.frameMs))
      .slice(0, 5)
      .map((x) => `${x.id} ${(x.ms + x.frameMs).toFixed(2)}`)
      .join('  ');
    const q = this.quality;
    const lines = [
      `${s.fps.toFixed(0)} fps   frame ${s.frameAvg.toFixed(1)} ms (p95 ${s.frameP95.toFixed(1)})${over(s.frameP95, PERF_BUDGET.frameMs * 1.5)}`,
      `cpu ${s.cpuAvg.toFixed(2)} ms (p95 ${s.cpuP95.toFixed(2)})${over(s.cpuAvg, PERF_BUDGET.cpuMs)}   gpu ${s.gpuAvg === null ? '–' : `${s.gpuAvg.toFixed(2)} ms`}`,
      `draw calls ${s.calls} (max ${s.callsMax})${over(s.callsMax, PERF_BUDGET.calls)}`,
      `triangles ${(s.triangles / 1000).toFixed(0)}k (max ${(s.trianglesMax / 1000).toFixed(0)}k)${over(s.trianglesMax, PERF_BUDGET.triangles)}`,
      `geometries ${s.geometries}  textures ${s.textures}  programs ${s.programs}`,
      `preset ${q.level}  px ${c.renderer.getPixelRatio().toFixed(2)}  msaa ${c.post.samples}  ${c.renderer.domElement.width}×${c.renderer.domElement.height}`,
      `terrain ${c.world.terrain.stats.chunks} chunks ${(c.world.terrain.stats.triangles / 1000).toFixed(0)}k  trees ${c.world.forest.stats.near}+${c.world.forest.stats.mid}+${c.world.forest.stats.far} (−${c.world.forest.stats.culled})`,
      `era ${c.era.current}  ${sys}`,
    ];
    this.text.textContent = lines.join('\n');
    this.text.classList.toggle('warn', s.callsMax > PERF_BUDGET.calls || s.trianglesMax > PERF_BUDGET.triangles);
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, W, H);
    const maxMs = 50;
    const y = (ms: number) => H - Math.min(1, ms / maxMs) * H;
    g.strokeStyle = 'rgba(160,220,140,0.5)';
    g.beginPath();
    g.moveTo(0, y(16.7));
    g.lineTo(W, y(16.7));
    g.stroke();
    g.strokeStyle = 'rgba(230,160,60,0.5)';
    g.beginPath();
    g.moveTo(0, y(33.3));
    g.lineTo(W, y(33.3));
    g.stroke();
    const f = this.perf.frameMs;
    const c = this.perf.cpuMs;
    const n = f.length;
    // the ring buffer is drawn in write order (a moving gap marks "now")
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W;
      const ms = f[i]!;
      g.fillStyle = ms > 33.3 ? '#e0603c' : ms > 16.9 ? '#e6b04a' : '#9fd88a';
      g.fillRect(x, y(ms), Math.max(1, W / n), H - y(ms));
      g.fillStyle = 'rgba(120,170,255,0.9)';
      g.fillRect(x, y(c[i]!), Math.max(1, W / n), 1.5);
    }
  }
}
