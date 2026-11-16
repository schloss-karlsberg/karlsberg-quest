/**
 * Objectives: a handwritten field-book line in the HUD, a marker on the compass strip, and the
 * diegetic waypoint: Laub's brass compass ("Bussole") in the corner, whose needle swings towards
 * the target and glows warm when you face it.
 */
import { h, svg } from '../../ui/dom';
import type { Hud } from '../../ui/hud';
import { ensurePortraitDefs } from './dialogue/portraits';
import type { ObjectiveState } from './engine';

/** Grid bearing (deg, 0 = north/−z, 90 = east/+x) from a to b. */
export function bearingDeg(ax: number, az: number, bx: number, bz: number): number {
  return ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest angle a − b in degrees (−180..180). */
export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

const BUSSOLE = `<svg viewBox="0 0 100 100" class="kqs-bussole-svg" aria-hidden="true">
  <circle class="kqs-b-glow" cx="50" cy="50" r="49" fill="url(#kqs-glow)"/>
  <circle cx="50" cy="50" r="40" fill="url(#kqs-brass)" stroke="#2a2118" stroke-width="2"/>
  <circle cx="50" cy="50" r="40" fill="url(#kqs-hb)" opacity="0.45"/>
  <circle cx="50" cy="50" r="33" fill="url(#kqs-dial)" stroke="#2a2118" stroke-width="1.2"/>
  <g stroke="#2a2118" stroke-width="0.8">${Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const r0 = i % 9 === 0 ? 26 : 30;
    return `<line x1="${(50 + Math.sin(a) * r0).toFixed(1)}" y1="${(50 - Math.cos(a) * r0).toFixed(1)}" x2="${(50 + Math.sin(a) * 33).toFixed(1)}" y2="${(50 - Math.cos(a) * 33).toFixed(1)}"/>`;
  }).join('')}</g>
  <g class="kqs-b-needle">
    <path d="M50 20L54.5 50L50 54L45.5 50Z" fill="#8c2f1f" stroke="#2a2118" stroke-width="0.7"/>
    <path d="M50 80L53.5 50L50 46L46.5 50Z" fill="url(#kqs-h3)" stroke="#2a2118" stroke-width="0.7"/>
  </g>
  <circle cx="50" cy="50" r="3" fill="url(#kqs-brass)" stroke="#2a2118" stroke-width="0.8"/>
  <path d="M24 38A28 28 0 0 1 46 22" stroke="#fff8e6" stroke-width="2.6" fill="none" opacity="0.4" stroke-linecap="round"/>
</svg>`;

export class ObjectiveView {
  readonly el: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly distEl: HTMLElement;
  readonly bussole: HTMLElement;
  private readonly needle: SVGGElement;
  private obj: ObjectiveState | null = null;
  private needleAngle = 0;
  private needleVel = 0;
  private glow = 0;
  private wobbleT = 0;

  constructor(
    parent: HTMLElement,
    private readonly hud: Hud,
  ) {
    ensurePortraitDefs();
    this.textEl = h('span.kqs-obj-text');
    this.distEl = h('span.kqs-obj-dist');
    this.el = h('div.kqs-objective', { 'data-testid': 'objective' }, [h('span.kqs-obj-mark', '◆'), this.textEl, this.distEl]);
    this.bussole = h('div.kqs-bussole', { 'data-testid': 'bussole' }, svg(BUSSOLE));
    this.needle = this.bussole.querySelector('.kqs-b-needle') as SVGGElement;
    // the objective line lives in the HUD's top-left column (under era, status and room name)
    hud.stack(this.el, 30);
    parent.append(this.bussole);
  }

  set(o: ObjectiveState | null): void {
    const changed = (o?.text ?? null) !== (this.obj?.text ?? null);
    this.obj = o;
    if (!o) {
      this.el.classList.remove('kqs-show');
      this.hud.setMarker('objective', null);
      return;
    }
    this.textEl.textContent = o.text;
    this.el.classList.add('kqs-show');
    if (changed) {
      this.el.classList.remove('kqs-new');
      void this.el.offsetWidth;
      this.el.classList.add('kqs-new');
    }
    if (o.x === undefined) this.hud.setMarker('objective', null);
  }

  get current(): ObjectiveState | null {
    return this.obj;
  }

  /** Per frame. heading = view heading (deg, clockwise from north). */
  frame(dt: number, px: number, pz: number, heading: number, opts: { compass: boolean; visible: boolean; reducedMotion: boolean; questLed?: boolean }): void {
    this.el.style.display = opts.visible ? '' : 'none';
    this.bussole.classList.toggle('kqs-show', opts.compass && opts.visible);
    const o = this.obj;
    // one "what to do" line: while the quest tracker leads with a main quest, the story's own line
    // (and its compass mark) steps back, unless it tells the way through time (Q)
    const dup = !!opts.questLed && !!o && !/\bQ\b/.test(o.text);
    this.el.classList.toggle('kqs-dup', dup);
    let target: number | null = null;
    if (dup) this.hud.setMarker('objective', null);
    else if (o && o.x !== undefined && o.z !== undefined) {
      const b = bearingDeg(px, pz, o.x, o.z);
      const d = Math.hypot(o.x - px, o.z - pz);
      this.hud.setMarker('objective', b, '#e9c46a');
      this.distEl.textContent = d < 8 ? '' : ` · ${d < 1000 ? `${Math.round(d / 5) * 5} m` : `${(d / 1000).toFixed(1).replace('.', ',')} km`}`;
      target = angleDiff(b, heading);
    } else this.distEl.textContent = '';
    if (!opts.compass) return;
    // the needle: a damped spring towards the target (idle: restless drift, it never points north)
    this.wobbleT += dt;
    const goal = target ?? Math.sin(this.wobbleT * 0.37) * 70 + Math.sin(this.wobbleT * 1.3) * 12;
    const err = angleDiff(goal, this.needleAngle);
    if (opts.reducedMotion) {
      this.needleAngle = goal;
      this.needleVel = 0;
    } else {
      // slightly under-damped spring: the needle overshoots once, like a real one
      const k = 38;
      const c = 2 * Math.sqrt(k) * 0.55;
      const step = Math.min(dt, 0.05);
      this.needleVel += (k * err - c * this.needleVel) * step;
      this.needleAngle += this.needleVel * step;
      this.needleAngle += Math.sin(this.wobbleT * 9) * 0.25; // the tremble of a live compass
    }
    this.needle.setAttribute('transform', `rotate(${this.needleAngle.toFixed(2)} 50 50)`);
    const aligned = target === null ? 0 : Math.max(0, 1 - Math.abs(target) / 25);
    this.glow += (aligned - this.glow) * Math.min(1, dt * 4);
    this.bussole.style.setProperty('--glow', this.glow.toFixed(3));
  }
}
