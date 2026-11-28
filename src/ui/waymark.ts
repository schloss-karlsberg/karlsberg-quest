/**
 * The world waymark (playtest 2026-11-19, "always know what to do"): a glowing diamond over the
 * tracked objective with its distance, projected onto the screen. Off screen or behind you it
 * rides the screen edge with an arrow that points the way. It fades while you stand in the zone
 * and dims when it sits near the crosshair (the centre stays clear for the fight). The label (the
 * objective in a few words) shows when you look at it.
 *
 * DOM only; the quests system sets the target (`set`) and calls `frame` with the camera.
 */
import { type PerspectiveCamera, Vector3 } from 'three';
import { h, svg } from './dom';

export interface WaymarkSpec {
  x: number;
  /** Ground height at x/z (the mark floats above it). */
  y: number;
  z: number;
  /** Zone radius: inside it the mark fades. */
  r: number;
  label: string;
  /** Icon: objective diamond, a person (talk), a pickup, a clue (magnifier). */
  kind: 'zone' | 'pickup' | 'clue' | 'npc' | 'dest';
  /** Main quest (gold) or side quest (silver). */
  main: boolean;
}

const ICON: Record<WaymarkSpec['kind'], string> = {
  zone: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" class="o"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" class="i"/></svg>',
  dest: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" class="o"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" class="i"/></svg>',
  pickup: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" class="o"/><path d="M12 7v10M7 12h10" class="s"/></svg>',
  clue: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" class="o"/><circle cx="11.2" cy="11.2" r="3" class="s"/><path d="M13.4 13.4 16 16" class="s"/></svg>',
  npc: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" class="o"/><circle cx="12" cy="9.6" r="2.2" class="i"/><path d="M8.2 15.8c.8-2 2.2-3 3.8-3s3 1 3.8 3" class="s"/></svg>',
};

const ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h12M12 6l6 6-6 6" /></svg>';

const _v = new Vector3();
const _f = new Vector3();

/** Metres → "42 m" / "1,2 km". */
export function waymarkDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export class Waymark {
  readonly el: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly distEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly arrow: HTMLElement;
  private spec: WaymarkSpec | null = null;
  private kind = '';
  private alpha = 0;
  private lastText = '';

  constructor() {
    this.icon = h('div.kq-wm-icon');
    this.distEl = h('div.kq-wm-dist');
    this.labelEl = h('div.kq-wm-label');
    this.arrow = h('div.kq-wm-arrow', svg(ARROW));
    this.el = h('div.kq-waymark', { 'data-testid': 'waymark', 'aria-hidden': 'true' }, [this.arrow, this.icon, this.distEl, this.labelEl]);
    this.el.style.opacity = '0';
  }

  private rects: DOMRect[] = [];
  private rectsAt = 0;

  /** HUD panels the mark keeps out of (re-measured twice a second). */
  private safeRects(width: number): DOMRect[] {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - this.rectsAt < 500 || typeof document === 'undefined') return this.rects;
    this.rectsAt = now;
    this.rects = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="quest-tracker"], [data-testid="combat-vitals"], [data-testid="hud-topleft"]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left < width / 2) this.rects.push(r);
    }
    return this.rects;
  }

  set(spec: WaymarkSpec | null): void {
    this.spec = spec;
    if (!spec) return;
    if (spec.kind !== this.kind) {
      this.kind = spec.kind;
      this.icon.replaceChildren(svg(ICON[spec.kind]));
    }
    this.el.classList.toggle('kq-wm-side', !spec.main);
    if (this.labelEl.textContent !== spec.label) this.labelEl.textContent = spec.label;
  }

  get target(): WaymarkSpec | null {
    return this.spec;
  }

  /** Per frame (real seconds). `px/pz`: the player (distance is measured on the ground). */
  frame(dt: number, camera: PerspectiveCamera, px: number, pz: number, width: number, height: number): void {
    const s = this.spec;
    let want = 0;
    if (s && width > 0) {
      const d = Math.hypot(s.x - px, s.z - pz);
      // inside the zone it is gone; close by it fades in again as you leave
      want = Math.max(0, Math.min(1, (d - s.r * 0.7) / Math.max(3, s.r * 0.8)));
      // the mark floats over the place: higher when far, so it clears trees and slopes
      _v.set(s.x, s.y + 2.2 + Math.min(10, d * 0.06), s.z);
      camera.getWorldDirection(_f);
      const toX = _v.x - camera.position.x;
      const toY = _v.y - camera.position.y;
      const toZ = _v.z - camera.position.z;
      const behind = toX * _f.x + toY * _f.y + toZ * _f.z < 0;
      _v.project(camera);
      let sx = (_v.x * 0.5 + 0.5) * width;
      let sy = (-_v.y * 0.5 + 0.5) * height;
      if (behind) {
        // behind you: on the left or right edge at mid height, the arrow pointing round (playtest
        // round 9: clamped to the bottom centre it read as "ahead")
        const right = toX * -_f.z + toZ * _f.x > 0;
        sx = right ? width * 4 : -width * 3;
        sy = height * 0.5;
      }
      const mx = 46;
      const top = 78;
      const bottom = height - 150;
      const onScreen = !behind && sx >= mx && sx <= width - mx && sy >= top && sy <= bottom;
      let ang = 0;
      if (!onScreen) {
        // clamp onto an inset rectangle along the ray from the centre
        const cx = width / 2;
        const cy = height / 2;
        let dx = sx - cx;
        let dy = sy - cy;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
        const kx = dx !== 0 ? (dx > 0 ? width - mx - cx : mx - cx) / dx : Infinity;
        const ky = dy !== 0 ? (dy > 0 ? bottom - cy : top - cy) / dy : Infinity;
        const k = Math.min(kx, ky);
        sx = cx + dx * k;
        sy = cy + dy * k;
        ang = Math.atan2(dy, dx);
        dx = 0;
        dy = 0;
      }
      // never under the HUD panels (playtest round 9: under the quest tracker, „30 m“ over the
      // „Lebenskraft“ label): pushed out sideways past the panel
      for (const r of this.safeRects(width)) {
        if (sx > r.left - 26 && sx < r.right + 26 && sy > r.top - 22 && sy < r.bottom + 22) sx = r.right + 34;
      }
      this.el.classList.toggle('kq-wm-edge', !onScreen);
      if (!onScreen) this.arrow.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      // the centre stays clear: near the crosshair the mark dims (and its label shows: you look at it)
      const cdx = sx - width / 2;
      const cdy = sy - height / 2;
      const nearCentre = Math.hypot(cdx, cdy);
      const looking = onScreen && Math.abs(cdx) < width * 0.12 && Math.abs(cdy) < height * 0.3;
      this.el.classList.toggle('kq-wm-look', looking);
      if (onScreen && nearCentre < 70) want *= 0.35 + 0.65 * (nearCentre / 70);
      this.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      const text = waymarkDistance(d);
      if (text !== this.lastText) {
        this.lastText = text;
        this.distEl.textContent = text;
      }
    }
    this.alpha += (want - this.alpha) * Math.min(1, dt * 6);
    this.el.style.opacity = this.alpha.toFixed(3);
    this.el.style.visibility = this.alpha < 0.01 ? 'hidden' : '';
  }
}
