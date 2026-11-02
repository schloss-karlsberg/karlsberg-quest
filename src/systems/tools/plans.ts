import { Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { ERA_INFO } from '../../core/era';
import type { Footprint, Room } from '../../data/types';
import { h } from '../../ui/dom';
import type { PlanView } from '../skills/logic';
import { distanceToPolygon, pointInPolygon } from './geom';
import { type RibbonLine, buildRibbons, groundLineMaterial, ribbonGeometry, throughMesh } from './ribbon';

/**
 * Baumeister: the plan sheet (1789 footprints drawn on the ground like ink on a plan, building
 * names), the confidence view (palace vertex colours by `_CONF`, Okabe-Ito, with a legend; in
 * today's forest the palace stands as a dithered ghost) and, at Baumeister 3, the room layout.
 * Baumeister 1 also names the room you stand in while in a memory.
 */

/** Okabe-Ito (colour-blind safe), as in the sister explorer: high #009E73, med #E69F00, low #CC79A7. */
export const CONF_HEX = { high: '#009E73', med: '#E69F00', low: '#CC79A7' } as const;
const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lin = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [srgbToLin(((v >> 16) & 255) / 255), srgbToLin(((v >> 8) & 255) / 255), srgbToLin((v & 255) / 255)];
};
// surveyor's chalk: light lines read on forest floor, snow and grass alike
const INK = lin('#f4e4bc');
const INK_ROOM = lin('#e3b77a');
const CONF_LIN = { high: lin(CONF_HEX.high), med: lin(CONF_HEX.med), low: lin(CONF_HEX.low) };

/**
 * The palace shader carries approximate confidence colours; pin them to exact linear Okabe-Ito
 * (runtime string patch like fx/palacePatch; skipped if the line changed).
 */
function patchConfColours(ctx: GameContext): void {
  const m = ctx.world.palace.material;
  const old = 'vec3 conf = vConf < 0.5 ? vec3(0.62, 0.1, 0.32) : vConf < 1.5 ? vec3(0.79, 0.37, 0.0) : vec3(0.0, 0.37, 0.24);';
  if (!m.fragmentShader.includes(old)) return;
  const v = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;
  m.fragmentShader = m.fragmentShader.replace(old, `vec3 conf = vConf < 0.5 ? ${v(CONF_LIN.low)} : vConf < 1.5 ? ${v(CONF_LIN.med)} : ${v(CONF_LIN.high)};`);
  m.needsUpdate = true;
}

/** Lines for the plan sheet / confidence view (pure; tested). */
export function planLines(footprints: readonly Footprint[], rooms: readonly Room[], view: Exclude<PlanView, 'off'>, withRooms: boolean): RibbonLine[] {
  const out: RibbonLine[] = [];
  for (const f of footprints) {
    if (f.ring.length < 3) continue;
    const conf = view === 'conf';
    out.push({
      pts: f.ring,
      closed: true,
      color: conf ? CONF_LIN[f.confidence] : INK,
      width: conf ? 0.7 : 0.5,
      dash: f.confidence === 'low' ? 2.2 : 0,
      alpha: conf ? 0.95 : 0.85,
    });
  }
  if (withRooms) {
    // one storey per building: the lowest (ground floor plan)
    const lowest = new Map<string, number>();
    for (const r of rooms) lowest.set(r.building, Math.min(lowest.get(r.building) ?? Infinity, r.storey));
    for (const r of rooms) {
      if (r.storey !== lowest.get(r.building) || r.polygon.length < 3) continue;
      out.push({ pts: r.polygon, closed: true, color: INK_ROOM, width: 0.22, dash: 0, alpha: 0.75 });
    }
  }
  return out;
}

/** The room a point stands in (x/z inside the polygon, height within floor − 1 … ceiling + 0.5). */
export function roomAt(rooms: readonly Room[], x: number, y: number, z: number): Room | null {
  let best: Room | null = null;
  for (const r of rooms) {
    if (y < r.floor_h - 1.2 || y > r.ceiling_h + 0.5) continue;
    if (!pointInPolygon(x, z, r.polygon)) continue;
    if (!best || r.floor_h > best.floor_h) best = r;
  }
  return best;
}

/** Footprint containing x/z (or within `tol` m of its outline). */
export function footprintAt(footprints: readonly Footprint[], x: number, z: number, tol = 1.5): Footprint | null {
  let best: Footprint | null = null;
  let bd = tol;
  for (const f of footprints) {
    const d = distanceToPolygon(x, z, f.ring);
    if (d <= bd) {
      bd = d;
      best = f;
      if (d === 0) break;
    }
  }
  return best;
}

const centroid = (ring: readonly (readonly [number, number])[]): [number, number] => {
  let x = 0;
  let z = 0;
  for (const [a, b] of ring) {
    x += a;
    z += b;
  }
  return [x / ring.length, z / ring.length];
};

export class Plans {
  readonly mesh: Mesh;
  private readonly through: Mesh;
  private readonly mat = groundLineMaterial();
  private built: { view: PlanView; era: string; rooms: boolean } | null = null;
  view: PlanView = 'off';
  private target = 0;
  private confMix = 0;
  private ghost = 0;
  private suspended = false;
  private readonly legend: HTMLElement;
  private readonly sheetNote: HTMLElement;
  private readonly labels: HTMLElement;
  private readonly labelEls = new Map<string, HTMLElement>();
  private readonly labelSize = new Map<string, [number, number]>();
  readonly roomTag: HTMLElement;
  private roomT = 0;
  currentRoom: Room | null = null;
  withRooms = false;
  private palaceTouched = false;

  constructor(
    private readonly ctx: GameContext,
    layer: HTMLElement,
  ) {
    this.mesh = new Mesh(undefined, this.mat);
    this.mesh.name = 'kq-plans';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    this.mat.uniforms.uGlow!.value = 0.3;
    this.through = throughMesh(this.mat);
    this.mesh.add(this.through);
    const sw = (k: keyof typeof CONF_HEX) =>
      h('li', [h('span.kqt-sw', { style: { background: CONF_HEX[k] } }), h('b', ctx.t(`tools.conf.${k}`)), h('span', ctx.t(`tools.conf.${k}.note`))]);
    this.legend = h('div.kqt-legend.kqt-sheet', { 'data-testid': 'conf-legend' }, [
      h('div.kqt-sheet-title', ctx.t('tools.conf.title')),
      h('ul', [sw('high'), sw('med'), sw('low')]),
      h('div.kqt-sheet-foot', ctx.t('tools.conf.foot')),
    ]);
    this.sheetNote = h('div.kqt-plan-note', { 'data-testid': 'plan-note' }, [h('span.kqt-plan-kicker', ctx.t('tools.plan.kicker')), ctx.t('tools.plan.note')]);
    this.labels = h('div.kqt-labels');
    this.roomTag = h('div.kqt-room', { 'data-testid': 'room-tag' });
    layer.append(this.labels, this.legend, this.sheetNote);
    // the room name sits in the HUD's top-left column, above the objective (no overlap)
    ctx.ui.hud.stack(this.roomTag, 20);
    patchConfColours(ctx);
  }

  setView(v: PlanView, withRooms: boolean): void {
    this.view = v;
    this.withRooms = withRooms;
    this.target = v === 'off' ? 0 : 1;
    if (v === 'off') return;
    const b = this.built;
    if (!b || b.view !== v || b.era !== this.ctx.era.current || b.rooms !== withRooms) this.rebuild();
  }

  /** fx owns the palace during an era shift: hands off (ghost / confidence colours) until it is done. */
  suspend(on: boolean): void {
    this.suspended = on;
    if (on) this.releasePalace();
  }

  private rebuild(): void {
    if (this.view === 'off') return;
    const hf = this.ctx.world.heightfield;
    const lines = planLines(this.ctx.data.footprints.buildings, this.ctx.data.rooms, this.view, this.withRooms);
    const arrays = buildRibbons(lines, (x, z) => hf.heightAt(x, z), 0.14, 1.5);
    this.mesh.geometry.dispose();
    this.mesh.geometry = ribbonGeometry(arrays);
    this.through.geometry = this.mesh.geometry;
    this.built = { view: this.view, era: this.ctx.era.current, rooms: this.withRooms };
  }

  private releasePalace(): void {
    if (!this.palaceTouched) return;
    const pal = this.ctx.world.palace;
    pal.uniforms.uConfMix!.value = 0;
    pal.uniforms.uOpacity!.value = 1;
    pal.setMode(ERA_INFO[this.ctx.era.current].palace);
    this.palaceTouched = false;
    this.confMix = 0;
    this.ghost = 0;
  }

  frame(dt: number, roomNames: boolean): void {
    const ctx = this.ctx;
    const reduced = ctx.settings.state.reducedMotion;
    const k = reduced ? 1 : Math.min(1, dt * 3.5);
    const u = this.mat.uniforms;
    u.uOpacity!.value += (this.target - u.uOpacity!.value) * k;
    if (Math.abs(u.uOpacity!.value - this.target) < 0.004) u.uOpacity!.value = this.target;
    this.mesh.visible = u.uOpacity!.value > 0.004;
    const p = ctx.player.position;
    (u.uCenter!.value as Vector3).set(p.x, 0, p.z);
    u.uRadius!.value = ctx.player.flying ? 900 : 260;
    if (this.mesh.visible && this.built && this.built.era !== ctx.era.current) this.rebuild();

    // confidence view: palace colours, ghost palace where the era has none
    const conf = this.view === 'conf' && !this.suspended;
    const pal = ctx.world.palace;
    const eraPal = ERA_INFO[ctx.era.current].palace;
    if (conf || this.palaceTouched) {
      this.confMix += ((conf ? 1 : 0) - this.confMix) * k;
      const wantGhost = conf && eraPal === 'hidden' ? 1 : 0;
      this.ghost += (wantGhost - this.ghost) * k;
      if (!this.suspended) {
        this.palaceTouched = true;
        pal.uniforms.uConfMix!.value = this.confMix;
        if (eraPal === 'hidden') {
          pal.object.visible = this.ghost > 0.01;
          pal.uniforms.uOpacity!.value = 0.55 * this.ghost;
        }
        if (!conf && this.confMix < 0.01 && this.ghost < 0.01) this.releasePalace();
      }
    }
    this.legend.classList.toggle('kqt-show', this.view === 'conf');
    this.sheetNote.classList.toggle('kqt-show', this.view === 'plan');
    this.updateLabels();

    // Baumeister 1: room names in memories (past eras, intact palace)
    this.roomT -= dt;
    if (this.roomT <= 0) {
      this.roomT = 0.3;
      const inPast = eraPal !== 'hidden';
      const r = roomNames && inPast ? roomAt(ctx.data.rooms, p.x, p.y, p.z) : null;
      if (r !== this.currentRoom) {
        this.currentRoom = r;
        if (r) this.roomTag.textContent = `${r.name_de}${r.storey_de ? ` · ${r.storey_de}` : ''}`;
        this.roomTag.classList.toggle('kqt-show', !!r);
      }
    }
  }

  /** Building names over the plan sheet: the nearest few in front of the camera. */
  private updateLabels(): void {
    const ctx = this.ctx;
    const show = this.view !== 'off' && this.mesh.visible;
    if (!show) {
      for (const el of this.labelEls.values()) el.classList.remove('kqt-show');
      return;
    }
    const p = ctx.player.position;
    const cam = ctx.camera;
    const w = ctx.renderer.domElement.clientWidth;
    const hh = ctx.renderer.domElement.clientHeight;
    const cand = ctx.data.footprints.buildings
      .map((f) => {
        const [cx, cz] = centroid(f.ring);
        return { f, cx, cz, d: Math.hypot(cx - p.x, cz - p.z) };
      })
      .filter((c) => c.d < (ctx.player.flying ? 700 : 170))
      .sort((a, b) => a.d - b.d)
      .slice(0, 9);
    const keep = new Set<string>();
    const v = new Vector3();
    // declutter: nearer labels first, a label that would overlap one already placed waits
    const placed: [number, number, number, number][] = [];
    for (const c of cand) {
      v.set(c.cx, ctx.world.heightAt(c.cx, c.cz) + 1.2, c.cz).project(cam);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      let el = this.labelEls.get(c.f.id);
      if (!el) {
        el = h('div.kqt-label', [h('b', c.f.name_de), h('span', c.f.id)]);
        this.labels.append(el);
        this.labelEls.set(c.f.id, el);
        this.labelSize.set(c.f.id, [el.offsetWidth || 220, el.offsetHeight || 34]);
      }
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * hh;
      const [lw, lh] = this.labelSize.get(c.f.id) ?? [220, 34];
      const r: [number, number, number, number] = [sx - lw / 2 - 4, sy - lh - 4, sx + lw / 2 + 4, sy + 4];
      if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      placed.push(r);
      keep.add(c.f.id);
      el.dataset.conf = c.f.confidence;
      el.classList.toggle('kqt-conf', this.view === 'conf');
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      el.style.opacity = String(Math.max(0, Math.min(1, 1.4 - c.d / (ctx.player.flying ? 700 : 170))) * this.mat.uniforms.uOpacity!.value);
      el.classList.add('kqt-show');
    }
    for (const [id, el] of this.labelEls) if (!keep.has(id)) el.classList.remove('kqt-show');
  }

  dispose(): void {
    this.releasePalace();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    (this.through.material as ShaderMaterial).dispose();
  }
}
