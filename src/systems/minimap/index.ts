import './minimap.css';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { h } from '../../ui/dom';
import { drawMapFootprints, drawMapGoal, drawMapPaper, drawMapPlayer, mapImage, type MapView } from '../travel/map-art';
import { visitTourMembers } from '../walk';
import { drawModernPaths } from './paths';
import { MAP_MPP, MAP_SIZE, mapStyle, playerHeading, projectMarker } from './projection';

const PERIOD = 0.1;
const CENTER = MAP_SIZE / 2;
const MARKER_INSET = 9;

class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly north: string;
  private readonly view: MapView = { cx: 0, cz: 0, width: MAP_SIZE, height: MAP_SIZE, mpp: MAP_MPP };
  private readonly pixel = { x: 0, y: 0 };
  private readonly offs: (() => void)[];
  private sheet: HTMLImageElement | null = null;
  private elapsed = PERIOD;
  private cameraTaken = false;

  constructor(private readonly ctx: GameContext) {
    this.north = ctx.t('hud.compass.n');
    this.canvas = h('canvas.kq-minimap', {
      width: MAP_SIZE, height: MAP_SIZE, hidden: true,
      role: 'img', 'aria-label': ctx.t('settings.minimap'), 'data-testid': 'minimap',
    });
    this.g = this.canvas.getContext('2d', { alpha: false });
    ctx.ui.add(this.canvas);
    this.offs = [
      ctx.events.on('game:pause', this.syncVisibility),
      ctx.events.on('photo:open', this.syncVisibility),
      ctx.events.on('photo:close', this.syncVisibility),
      ctx.events.on('camera:override', ({ active }) => {
        this.cameraTaken = active;
        this.syncVisibility();
      }),
      ctx.events.on('era:change', this.refresh),
      ctx.events.on('player:teleport', this.refresh),
      ctx.settings.subscribe((_, key) => {
        this.syncVisibility();
        if (key === 'reducedMotion') this.refresh();
      }),
    ];
    this.syncVisibility();
  }

  private readonly syncVisibility = (): void => {
    const hidden = !this.g || !this.ctx.settings.state.minimap || this.ctx.pause.paused || this.cameraTaken ||
      document.documentElement.hasAttribute('data-kq-photo');
    if (this.canvas.hidden === hidden) return;
    this.canvas.hidden = hidden;
    if (!hidden) this.refresh();
  };

  private readonly refresh = (): void => {
    this.elapsed = PERIOD;
    if (!this.canvas.hidden) this.ctx.loop.requestRender();
  };

  private readonly drawMember = (x: number, z: number, guide: boolean): void => {
    const g = this.g!;
    projectMarker(this.pixel, this.view, x, z, MARKER_INSET);
    g.beginPath();
    g.arc(this.pixel.x, this.pixel.y, guide ? 4.8 : 2.5, 0, 2 * Math.PI);
    g.fillStyle = guide ? '#f4a259' : '#366c68';
    g.strokeStyle = guide ? '#2a2118' : '#f3ead6';
    g.lineWidth = guide ? 1.5 : 1;
    g.fill();
    g.stroke();
  };

  frame(dt: number): void {
    if (this.canvas.hidden || (this.elapsed += dt) < PERIOD - 1e-6) return;
    this.elapsed = Math.max(0, this.elapsed - PERIOD) % PERIOD;
    const root = document.documentElement;
    if (this.ctx.ui.hud.el.classList.contains('kq-hidden') ||
        root.hasAttribute('data-kq-cinematic') || root.hasAttribute('data-kq-credits') || root.hasAttribute('data-kq-rotate')) return;

    if (!this.sheet) {
      this.sheet = mapImage(this.ctx.data);
      if (!this.sheet.complete) this.sheet.addEventListener('load', this.refresh, { once: true });
    }
    const { data, player, era, ui, settings } = this.ctx;
    const g = this.g!;
    this.view.cx = player.position.x;
    this.view.cz = player.position.z;
    const style = mapStyle(era.current);
    drawMapPaper(g, this.sheet, this.view, style.sheetAlpha);
    if (style.modernPaths) drawModernPaths(g, data.paths, this.view);
    drawMapFootprints(g, data.footprints.buildings, this.view, style.footprintAlpha);
    visitTourMembers(this.drawMember);
    const goal = ui.hud.objectiveTarget;
    if (goal?.x !== undefined && goal.z !== undefined) {
      projectMarker(this.pixel, this.view, goal.x, goal.z, MARKER_INSET);
      drawMapGoal(g, this.pixel.x, this.pixel.y, 9);
    }
    drawMapPlayer(g, CENTER, CENTER, playerHeading(player.yaw, settings.state.reducedMotion));
    g.font = 'bold 12px Georgia, serif';
    g.lineWidth = 3;
    g.strokeStyle = '#f3ead6';
    g.strokeText(this.north, 8, 17);
    g.fillStyle = '#2a2118';
    g.fillText(this.north, 8, 17);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.sheet?.removeEventListener('load', this.refresh);
    this.canvas.remove();
  }
}

let minimap: Minimap | null = null;

export default defineSystem({
  id: 'minimap',
  after: ['story', 'quests', 'walk', 'photo'],
  init(ctx) {
    minimap = new Minimap(ctx);
  },
  frame(dt) {
    minimap?.frame(dt);
  },
  dispose() {
    minimap?.dispose();
    minimap = null;
  },
});
