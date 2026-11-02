import type { GameContext } from '../core/context';
import { h } from '../ui/dom';

/** ?debug stats overlay: fps, draw calls, triangles, position, era, terrain/forest stats, systems. */
export class DebugPanel {
  private readonly el: HTMLElement;
  private last = performance.now();
  private lastFrames = 0;
  private fps = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly frames: () => number,
  ) {
    this.el = h('div.kq-debug', { 'data-testid': 'debug-panel' });
    document.body.append(this.el);
    setInterval(() => this.tick(), 500);
  }

  private tick(): void {
    const now = performance.now();
    const f = this.frames();
    this.fps = ((f - this.lastFrames) * 1000) / Math.max(1, now - this.last);
    this.last = now;
    this.lastFrames = f;
    const c = this.ctx;
    const r = c.renderer.info.render;
    const p = c.player.position;
    const st = c.player.stats;
    const sys = c.systems
      .stats()
      .map((s) => `${s.failed ? '✗' : ' '}${s.id} ${s.ms.toFixed(2)}ms`)
      .join('\n  ');
    this.el.textContent = [
      `fps ${this.fps.toFixed(0)}  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k`,
      `era ${c.era.current}  scan ${c.world.scanMode}  map ${c.world.mapMix}`,
      `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  yaw ${((-c.player.yaw * 180) / Math.PI).toFixed(0)}°`,
      `E ${(p.x + 381000).toFixed(0)} N ${(5465000 - p.z).toFixed(0)}  ${c.world.surfaceAt(p.x, p.z)}`,
      `stance ${c.player.stance}${c.player.flying ? ' (fly)' : ''}  noise ${st.noise.toFixed(2)} vis ${st.visibility.toFixed(2)}`,
      `terrain ${c.world.terrain.stats.chunks} chunks ${(c.world.terrain.stats.triangles / 1000).toFixed(0)}k`,
      `trees near ${c.world.forest.stats.near} far ${c.world.forest.stats.far} / ${c.world.forest.stats.total}`,
      `palace ${(c.world.palace.triangles / 1000).toFixed(0)}k tris`,
      `tick ${c.loop.tick}${c.loop.paused ? ' paused' : ''}${c.loop.manual ? ' manual' : ''}`,
      `systems:\n  ${sys}`,
    ].join('\n');
  }
}
