/**
 * Survey tools, gated by the skills (rules: ../skills/logic.ts):
 *   R      Messen (Kartograf 3): tape between two clicks, distance + height profile → measure:done
 *   V / 4  Röntgenblick (Röntgenblick 1): 2025 ground points under the canopy around the player
 *   B      Baumeister: off → Planblatt (1) → Konfidenzansicht (2) → off; Raumfolge at 3;
 *          Baumeister 1 also names the room you stand in while in a memory
 *   —      Spurenleser 2: the pack's routes as faint lines (whenever a pack runs)
 * Trees fade inside the Röntgenblick disc (forest shader patch, forestClear.ts).
 *
 * Talks to nobody directly: reads `state.skills`, `systems.story.active` (free survey), and the
 * hunt only through the read-only accessor in tracks.ts (`window.kq.hunt.sim()`).
 * Debug: window.kq.tools (see ToolsHooks).
 */
import './strings';
import './tools.css';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { h } from '../../ui/dom';
import { type PlanView, canMeasure, canXray, gateFrom, nextPlanView, showPackRoutes, showRoomLayout, showRoomNames } from '../skills/logic';
import { ForestClear } from './forestClear';
import type { V3 } from './geom';
import { MeasureTool } from './measure';
import { Picker } from './picker';
import { Plans } from './plans';
import { Tracks, readPack } from './tracks';
import { Xray } from './xray';

export interface ToolsHooks {
  measure: {
    start(): void;
    stop(): void;
    /** Click at the crosshair (pick terrain/palace/objects). */
    click(): void;
    /** Measure between two points (y from the terrain unless given). */
    at(ax: number, az: number, bx: number, bz: number, ay?: number, by?: number): void;
    /** Pick at the crosshair without placing anything. */
    pick(): { point: V3; on: string; building?: string } | null;
    state(): { mode: string; a: V3 | null; b: V3 | null; distance: number | null; building?: string; room?: string };
  };
  xray(on?: boolean): Promise<{ on: boolean; points: number; loaded: boolean }>;
  plans(view: PlanView): void;
  tracks(on?: boolean): { on: boolean; lines: number; pack: ReturnType<typeof readPack> };
  state(): { measure: string; xray: boolean; plans: PlanView; tracks: boolean; room: string | null; clear: number };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    tools?: ToolsHooks;
  }
}

let measure: MeasureTool | null = null;
let xray: Xray | null = null;
let plans: Plans | null = null;
let tracks: Tracks | null = null;
let clear: ForestClear | null = null;
let layer: HTMLElement | null = null;
let xrayBadge: HTMLElement | null = null;
let xrayVignette: HTMLElement | null = null;
let shifting = false;
let tracksForced: boolean | null = null;
/** window.kq is installed after the systems' init: hooks go in on the first frame. */
let toolHooks: ToolsHooks | null = null;

const gate = (ctx: GameContext) => gateFrom(ctx.state.state, ctx.params);

function toggleXray(ctx: GameContext, on: boolean): void {
  if (!xray) return;
  xray.set(on);
  if (on && !ctx.data.meta.pointcloud) ctx.ui.toast(ctx.t('tools.xray.none'));
  else if (on && !xray.loaded) ctx.ui.toast(ctx.t('tools.xray.loading'));
  else ctx.ui.toast(ctx.t(on ? 'tools.xray.on' : 'tools.xray.off'));
}

function setPlans(ctx: GameContext, v: PlanView): void {
  plans?.setView(v, showRoomLayout(gate(ctx)));
}

export default defineSystem({
  id: 'tools',
  after: ['survey'],
  init(ctx) {
    layer = ctx.ui.layer('tools');
    layer.classList.remove('kq-hidden');
    xrayVignette = h('div.kqt-xray-vignette');
    xrayBadge = h('div.kqt-xray-badge', { 'data-testid': 'xray-badge' }, [ctx.t('tools.xray.badge'), h('small', ctx.t('tools.xray.paws'))]);
    layer.append(xrayVignette, xrayBadge);
    const picker = new Picker(ctx);
    measure = new MeasureTool(ctx, picker, layer);
    xray = new Xray(ctx);
    plans = new Plans(ctx, layer);
    tracks = new Tracks(ctx);
    clear = new ForestClear(ctx.world.forest.material);
    ctx.scene.add(measure.group, xray.points, plans.mesh, tracks.mesh);

    ctx.events.on('shift:begin', () => {
      shifting = true;
      plans?.suspend(true);
    });
    ctx.events.on('shift:done', () => {
      shifting = false;
      plans?.suspend(false);
    });
    // a tape belongs to the era it was laid in (another era has other walls)
    ctx.events.on('era:change', () => measure?.stop());
    ctx.events.on('game:start', () => {
      measure?.stop();
      xray?.set(false);
      plans?.setView('off', false);
    });

    const hooks: ToolsHooks = {
      measure: {
        start: () => measure!.start(),
        stop: () => measure!.stop(),
        click: () => measure!.click(),
        at: (ax, az, bx, bz, ay, by) => measure!.at({ x: ax, z: az, y: ay }, { x: bx, z: bz, y: by }),
        pick: () => {
          const p = measure!.pickCentre();
          return p ? { point: p.point, on: p.on, building: p.building } : null;
        },
        state: () => {
          const m = measure!;
          return {
            mode: m.mode,
            a: m.a?.point ?? null,
            b: m.b?.point ?? null,
            distance: m.result?.distance ?? null,
            building: m.result?.building,
            room: m.result?.room,
          };
        },
      },
      xray: async (on = true) => {
        toggleXray(ctx, on);
        await xray!.load();
        xray!.frame(0, ctx.settings.state.graphics !== 'low');
        return { on: xray!.active, points: xray!.count, loaded: xray!.loaded };
      },
      plans: (v) => setPlans(ctx, v),
      tracks: (on) => {
        if (on !== undefined) tracksForced = on;
        return { on: tracksForced ?? showPackRoutes(gate(ctx)), lines: tracks!.lines, pack: readPack() };
      },
      state: () => ({
        measure: measure!.mode,
        xray: xray!.active,
        plans: plans!.view,
        tracks: tracksForced ?? showPackRoutes(gate(ctx)),
        room: plans!.currentRoom?.roomId ?? null,
        clear: clear!.value,
      }),
    };
    toolHooks = hooks;
  },
  update(_dt, ctx) {
    const inp = ctx.input;
    const g = gate(ctx);
    if (inp.wasPressed('measure')) {
      if (measure!.active) {
        measure!.stop();
        ctx.ui.toast(ctx.t('tools.measure.off.toast'));
      } else if (!canMeasure(g)) {
        ctx.ui.toast(ctx.t('skills.locked.measure'));
      } else {
        measure!.start();
        ctx.ui.toast(ctx.t('tools.measure.on.toast'));
      }
    }
    if (measure!.active && inp.wasPressed('interact')) measure!.click();
    if (inp.wasPressed('xray')) {
      if (xray!.active) toggleXray(ctx, false);
      else if (!canXray(g)) ctx.ui.toast(ctx.t('skills.locked.xray'));
      else toggleXray(ctx, true);
    }
    if (inp.wasPressed('plans')) {
      const next = nextPlanView(plans!.view, g);
      if (next === null) ctx.ui.toast(ctx.t('skills.locked.plans'));
      else {
        setPlans(ctx, next);
        ctx.ui.toast(ctx.t(next === 'off' ? 'tools.plan.off' : next === 'conf' ? 'tools.conf.on' : 'tools.plan.on'));
      }
    }
    // skills can drop (debug reset / load): close what is no longer allowed
    if (xray!.active && !canXray(g)) xray!.set(false);
    if (measure!.active && !canMeasure(g)) measure!.stop();
  },
  frame(dt, ctx) {
    if (toolHooks && typeof window !== 'undefined' && window.kq && window.kq.tools !== toolHooks) window.kq.tools = toolHooks;
    if (!measure || !xray || !plans || !tracks || !clear) return;
    const g = gate(ctx);
    const dense = ctx.settings.state.graphics !== 'low';
    const p = ctx.player.position;
    measure.frame(dt);
    xray.radius = dense ? 70 : 52;
    xray.frame(dt, dense);
    plans.frame(dt, showRoomNames(g));
    tracks.set(tracksForced ?? showPackRoutes(g));
    tracks.frame(dt);
    clear.set(xray.active && !shifting ? 1 : 0, p.x, p.z, xray.radius * 0.95);
    clear.frame(dt, ctx.settings.state.reducedMotion);
    xrayBadge?.classList.toggle('kqt-show', xray.active);
    xrayVignette?.classList.toggle('kqt-show', xray.active);
    layer?.classList.toggle('kqt-measuring', measure.active);
  },
  dispose() {
    measure?.dispose();
    xray?.dispose();
    plans?.dispose();
    tracks?.dispose();
    measure = xray = null;
    plans = null;
    tracks = null;
  },
});
