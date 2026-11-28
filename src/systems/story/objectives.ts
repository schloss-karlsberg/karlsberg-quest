/**
 * Objectives: a handwritten field-book line in the HUD, a marker on the compass strip, and the
 * diegetic waypoint: Laub's brass compass ("Bussole") in the corner, whose needle swings towards
 * the target and glows warm when you face it.
 */
import { h, svg } from '../../ui/dom';
import type { Hud } from '../../ui/hud';
import { waymarkDistance } from '../../ui/waymark';
import type { AnimalSave } from '../animals/types';
import { ensurePortraitDefs } from './dialogue/portraits';
import type { ObjectiveState } from './engine';
import type { ObjectiveAction } from './types';

/** The save slice is available even when the animal bodies have yet to be rebuilt on load. */
export function objectivePoint(a: ObjectiveAction, animals?: AnimalSave): { x?: number; z?: number } {
  if (a.animal && animals?.v === 1) {
    const matches = (animal: { id: string; state: string }) => animal.id === a.animal && animal.state !== 'gone';
    const animal = animals.deer?.find(matches) ?? animals.dogs?.find(matches);
    if (animal && Number.isFinite(animal.x) && Number.isFinite(animal.z)) return { x: animal.x, z: animal.z };
  }
  return { x: a.x, z: a.z };
}

/** Grid bearing (deg, 0 = north/−z, 90 = east/+x) from a to b. */
export function bearingDeg(ax: number, az: number, bx: number, bz: number): number {
  return ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest angle a − b in degrees (−180..180). */
export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * The goal line for the phone dialogue card's footer (TASK-085): the story's own objective while it
 * leads, else the quest tracker's current goal; null when there is none.
 */
export function dialogueGoal(story: string | null, quest: string | null): string | null {
  const line = (story ?? '').trim() || (quest ?? '').replace(/\s+/g, ' ').trim();
  return line ? `◆ ${line}` : null;
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
  /** A story cue on the Bussole (`bussole:jolt` / `bussole:tick` / `bussole:open`): seconds left. */
  private cueLeft = 0;
  private cueGoal: { x: number; z: number } | null = null;
  private cueBearing: number | null = null;
  private cueTick = 0;
  private tickAcc = 0;
  private flare = 0;

  constructor(
    parent: HTMLElement,
    private readonly hud: Hud,
  ) {
    ensurePortraitDefs();
    this.textEl = h('span.kqs-obj-text');
    this.distEl = h('span.kqs-obj-dist');
    this.el = h('div.kqs-objective', { 'data-testid': 'objective' }, [h('span.kqs-obj-mark', { 'aria-hidden': 'true' }, '◆'), h('span.kqs-obj-copy', [this.textEl, this.distEl])]);
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
      this.hud.storyTarget = null;
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

  /**
   * What the old captions told ("[Die Nadel der Bussole schwingt herum und bleibt auf dem Ehrenhof
   * stehen]", "[Die Bussole ruckt]", "[Der Deckel springt auf …]") happens on the brass compass:
   *  bussole:jolt {x?,z?,hold?}  the needle is flung round, the case jumps, it glows; with x/z the
   *                              needle settles on that place for `hold` s (default 5)
   *  bussole:tick {hold?}        the needle ticks backwards, step by step
   *  bussole:open                the lid springs open and a page rises out of it
   * The Bussole shows for the cue even before the story turned it on. Reduced motion: no jump.
   */
  cue(id: string, d: Record<string, unknown>, reducedMotion: boolean): void {
    const num = (k: string, def: number) => (typeof d[k] === 'number' ? (d[k] as number) : def);
    if (id === 'bussole:jolt') {
      this.cueLeft = num('hold', 5);
      this.cueGoal = typeof d['x'] === 'number' && typeof d['z'] === 'number' ? { x: d['x'] as number, z: d['z'] as number } : null;
      this.cueBearing = typeof d['bearing'] === 'number' ? (d['bearing'] as number) : null;
      this.cueTick = 0;
      if (!reducedMotion) this.needleVel += 900;
      this.flare = 1;
      this.retrigger('kqs-jolt');
    } else if (id === 'bussole:tick') {
      this.cueLeft = num('hold', 4);
      this.cueGoal = null;
      this.cueBearing = null;
      this.cueTick = 1;
      this.tickAcc = 0;
      this.flare = 0.6;
    } else if (id === 'bussole:open') {
      this.cueLeft = Math.max(this.cueLeft, 4.5);
      this.flare = 1;
      let lid = this.bussole.querySelector<HTMLElement>('.kqs-b-lid');
      if (!lid) {
        lid = h('div.kqs-b-lid', { 'data-testid': 'bussole-lid' });
        const page = h('div.kqs-b-page', { 'data-testid': 'bussole-page' });
        this.bussole.append(page, lid);
      }
      this.retrigger('kqs-open');
    }
  }

  private retrigger(cls: string): void {
    this.bussole.classList.remove(cls);
    void this.bussole.offsetWidth;
    this.bussole.classList.add(cls);
  }

  get current(): ObjectiveState | null {
    return this.obj;
  }

  /** The objective line as the HUD shows it (text and distance), or null while it is hidden or steps back. */
  get line(): string | null {
    if (!this.obj || this.el.style.display === 'none' || this.el.classList.contains('kqs-dup')) return null;
    return `${this.obj.text}${this.distEl.textContent ?? ''}`;
  }

  /** Per frame. heading = view heading (deg, clockwise from north). */
  frame(dt: number, px: number, pz: number, heading: number, opts: { compass: boolean; visible: boolean; reducedMotion: boolean; questLed?: boolean; questTarget?: { x: number; z: number } | null }): void {
    this.el.style.display = opts.visible ? '' : 'none';
    const cueing = this.cueLeft > 0;
    if (cueing) this.cueLeft -= dt;
    else if (this.bussole.classList.contains('kqs-open') || this.bussole.classList.contains('kqs-jolt')) this.bussole.classList.remove('kqs-open', 'kqs-jolt');
    this.bussole.classList.toggle('kqs-show', (opts.compass || cueing) && opts.visible);
    const o = this.obj;
    // one "what to do" line: while the quest tracker leads with a main quest, the story's own line
    // (and its compass mark) steps back, unless it tells the way through time (Q)
    const dup = !!opts.questLed && !!o && !/\bQ\b/.test(o.text);
    this.el.classList.toggle('kqs-dup', dup);
    this.hud.storyTarget = opts.visible && !dup ? o : null;
    let target: number | null = null;
    if (opts.questLed && opts.questTarget && (dup || !o)) {
      // the story line stepped back for the quest tracker: the needle follows the tracked goal
      this.hud.setMarker('objective', null);
      this.distEl.textContent = '';
      target = angleDiff(bearingDeg(px, pz, opts.questTarget.x, opts.questTarget.z), heading);
    } else if (o && o.x !== undefined && o.z !== undefined) {
      const waymark = this.hud.questLead?.story === o ? this.hud.waymark.target : null;
      const x = waymark?.x ?? o.x;
      const z = waymark?.z ?? o.z;
      const b = bearingDeg(px, pz, x, z);
      const d = Math.hypot(x - px, z - pz);
      this.hud.setMarker('objective', dup || waymark ? null : b, '#e9c46a', { kind: 'obj' });
      if (waymark && (waymark.x !== o.x || waymark.z !== o.z)) {
        // The tour's moving lead can be close. Use the world marker's range and rounding.
        this.distEl.textContent = d <= waymark.r * 0.7 ? '' : ` · ${waymarkDistance(d)}`;
      } else {
        this.distEl.textContent = d < 8 ? '' : ` · ${d < 1000 ? `${Math.round(d / 5) * 5} m` : waymarkDistance(d)}`;
      }
      target = angleDiff(b, heading);
    } else this.distEl.textContent = '';
    if (!opts.compass && !cueing) return;
    // a cue's place leads the needle while it lasts
    if (cueing && this.cueGoal) target = angleDiff(bearingDeg(px, pz, this.cueGoal.x, this.cueGoal.z), heading);
    else if (cueing && this.cueBearing !== null) target = angleDiff(this.cueBearing, heading);
    // the needle: a damped spring towards the target (idle: restless drift, it never points north)
    this.wobbleT += dt;
    const goal = target ?? Math.sin(this.wobbleT * 0.37) * 70 + Math.sin(this.wobbleT * 1.3) * 12;
    const err = angleDiff(goal, this.needleAngle);
    this.flare = Math.max(0, this.flare - dt * 0.6);
    if (cueing && this.cueTick) {
      // ticking backwards: a jump of 7.5° every quarter second, no spring
      this.tickAcc += dt;
      while (this.tickAcc >= 0.25) {
        this.tickAcc -= 0.25;
        this.needleAngle -= 7.5;
      }
      this.needleVel = 0;
    } else if (opts.reducedMotion) {
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
    this.bussole.style.setProperty('--glow', Math.max(this.glow, this.flare).toFixed(3));
  }
}
