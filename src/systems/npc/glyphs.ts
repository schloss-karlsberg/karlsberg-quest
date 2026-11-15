/**
 * Quest glyphs over the ghosts' heads (quests → npc:marker). Shape-coded, never colour alone:
 *   offer       "!"            (gold)
 *   offer-main  "!" in a ring  (gold, brass ring) — a main-story task
 *   ready       "?"            (bright gold, a soft halo that breathes) — turn in here
 *   active      "?" grey       (dashed outline) — the task runs, come back later
 * DOM overlay projected from the head (crisp at any distance, readable in fog), sized by
 * distance, bobbing gently (still with reduced motion). Hidden behind the camera, beyond 70 m and
 * while that NPC's conversation is open.
 */
import { type Camera, Vector3 } from 'three';
import { h } from '../../ui/dom';
import type { GiverMark } from '../../rpg/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_D = 70;

function glyphSvg(mark: Exclude<GiverMark, null>): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 48 64');
  s.setAttribute('aria-hidden', 'true');
  const ch = mark === 'ready' || mark === 'active' ? '?' : '!';
  const ring = mark === 'offer-main' ? '<circle class="ring" cx="24" cy="30" r="21"/><circle class="ring2" cx="24" cy="30" r="16.5"/>' : '';
  const halo = mark === 'ready' ? '<circle class="halo" cx="24" cy="30" r="20"/>' : '';
  s.innerHTML = `${halo}${ring}<text class="ch" x="24" y="44" text-anchor="middle">${ch}</text>`;
  return s;
}

interface Glyph {
  el: HTMLElement;
  mark: GiverMark;
  t: number;
  shown: boolean;
}

export class GiverGlyphs {
  private readonly list = new Map<string, Glyph>();
  private readonly v = new Vector3();
  private time = 0;

  constructor(private readonly layer: HTMLElement) {
    layer.classList.remove('kq-hidden');
    layer.classList.add('kqn-glyphs');
    layer.style.pointerEvents = 'none';
  }

  set(npc: string, mark: GiverMark): void {
    let g = this.list.get(npc);
    if (!mark) {
      if (g) {
        g.el.remove();
        this.list.delete(npc);
      }
      return;
    }
    if (g && g.mark === mark) return;
    const el = h(`div.kqn-glyph.kqn-glyph-${mark}`, { dataset: { npc, mark, testid: `npc-glyph-${npc}` } }, [glyphSvg(mark)]);
    el.style.display = 'none';
    if (g) {
      g.el.replaceWith(el);
      g.el = el;
      g.mark = mark;
      g.shown = false;
      // a change of state pops (scale-in) once
      el.classList.add('kqn-pop');
    } else {
      this.layer.append(el);
      g = { el, mark, t: Math.random() * 6, shown: false };
      this.list.set(npc, g);
    }
  }

  shown(npc: string): boolean {
    return !!this.list.get(npc)?.shown;
  }

  frame(dt: number, cam: Camera, figs: { npc: string; x: number; y: number; z: number; visible: boolean }[], p: { x: number; y: number; z: number }, reducedMotion: boolean): void {
    this.time += dt;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    for (const [npc, g] of this.list) {
      const f = figs.find((x) => x.npc === npc);
      const d = f ? Math.hypot(f.x - p.x, f.z - p.z, f.y - p.y) : Infinity;
      let show = !!f && f.visible && d < MAX_D;
      if (show && f) {
        g.t += dt;
        const bob = reducedMotion ? 0 : Math.sin(g.t * 2.1) * 0.06;
        this.v.set(f.x, f.y + 2.3 + bob, f.z).project(cam);
        if (this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) show = false;
        else {
          const sx = (this.v.x * 0.5 + 0.5) * w;
          const sy = (-this.v.y * 0.5 + 0.5) * hgt;
          // ~56 px at 6 m, never smaller than 26 px, never larger than 72 px
          const size = Math.max(26, Math.min(72, (6 / Math.max(1, d)) * 50 + 20));
          const fade = d > MAX_D - 15 ? (MAX_D - d) / 15 : 1;
          g.el.style.transform = `translate(${sx - size / 2}px, ${sy - size * 1.33}px)`;
          g.el.style.width = `${size}px`;
          g.el.style.height = `${size * 1.33}px`;
          g.el.style.opacity = String(Math.max(0, Math.min(1, fade)));
        }
      }
      if (show !== g.shown) {
        g.shown = show;
        g.el.style.display = show ? '' : 'none';
      }
    }
  }

  dispose(): void {
    for (const g of this.list.values()) g.el.remove();
    this.list.clear();
  }
}
