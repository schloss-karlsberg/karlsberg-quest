/**
 * Progression HUD (docs/ACTION-RPG.md §10), all through `hud.dock` — no change to src/ui/hud.ts:
 * - vitals 30: the level medallion + brass XP bar (numbers on it, a "ghost" segment shows the gain
 *   before the fill catches up, a brass ring pulse on level-up — never a white flash),
 * - vitals 40: the quick-use slot (key label, glyph, name, count; greys out at 0),
 * - feed 10: the pickup feed ("+ Kräuterbalsam ×2"), lines slide in and fade,
 * - a layer for floating "+50 EP" numbers anchored at a world point (x/z of the xp:grant).
 * High contrast: solid backings, ≥ 4.5 : 1 text; meaning never by colour alone (text + glyphs).
 */
import { type PerspectiveCamera, Vector3 } from 'three';
import { h, svg } from '../../ui/dom';
import type { Hud } from '../../ui/hud';

export interface FeedEntry {
  text: string;
  kind: 'item' | 'xp' | 'set' | 'full' | 'use';
  t: number;
}

interface Float {
  el: HTMLElement;
  pos: Vector3;
  age: number;
}

const FEED_MS = 4200;

export class ProgressionHud {
  readonly xp: HTMLElement;
  readonly quick: HTMLElement;
  readonly feed: HTMLElement;
  private readonly lvl: HTMLElement;
  private readonly lvlNum: HTMLElement;
  private readonly name: HTMLElement;
  private readonly num: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly plus: HTMLElement;
  private readonly qKey: HTMLElement;
  private readonly qIcon: HTMLElement;
  private readonly qName: HTMLElement;
  private readonly qCount: HTMLElement;
  private readonly floats: Float[] = [];
  private readonly tmp = new Vector3();
  private level = 0;
  private pct = 0;
  private plusTimer: ReturnType<typeof setTimeout> | null = null;
  private plusSum = 0;
  readonly history: FeedEntry[] = [];

  constructor(
    hud: Hud,
    private readonly layer: HTMLElement,
  ) {
    this.lvlNum = h('span.kqp-lvl-num', '1');
    this.lvl = h('div.kqp-lvl', { 'aria-hidden': 'true' }, [this.lvlNum]);
    this.name = h('span.kqp-xp-name', 'Stufe 1');
    this.num = h('span.kqp-xp-num', '0 / 150 EP');
    this.ghost = h('div.kqp-bar-ghost');
    this.fill = h('div.kqp-bar-fill');
    this.bar = h('div.kqp-bar', { role: 'progressbar', 'aria-label': 'Erfahrung', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [this.ghost, this.fill, h('div.kqp-bar-ticks')]);
    this.plus = h('span.kqp-xp-plus', { 'data-testid': 'hud-xp-plus' });
    this.xp = h('div.kqp-xp', { 'data-testid': 'hud-xp' }, [this.lvl, h('div.kqp-xp-main', [h('div.kqp-xp-top', [this.name, this.num]), this.bar]), this.plus]);

    this.qKey = h('kbd.kqp-q-key', 'H');
    this.qIcon = h('span.kqp-q-icon');
    this.qName = h('span.kqp-q-name');
    this.qCount = h('span.kqp-q-count');
    this.quick = h('div.kqp-quick', { 'data-testid': 'hud-quick' }, [this.qKey, this.qIcon, h('span.kqp-q-text', [this.qName, this.qCount])]);

    this.feed = h('div.kqp-feed', { 'data-testid': 'hud-feed-lines', 'aria-live': 'polite' });
    hud.dock('vitals', this.xp, 30);
    hud.dock('vitals', this.quick, 40);
    hud.dock('feed', this.feed, 10);
  }

  /** Level, XP in the level (cur / need), total; animate: ghost first, fill follows. */
  setXp(level: number, cur: number, need: number, total: number, animate: boolean): void {
    const pct = need > 0 ? Math.max(0, Math.min(1, cur / need)) * 100 : 100;
    this.xp.dataset.level = String(level);
    this.xp.dataset.xp = String(total);
    this.name.textContent = `Stufe ${level}`;
    this.num.textContent = need > 0 ? `${cur} / ${need} EP` : `${total} EP`;
    this.xp.title = `Stufe ${level}${need > 0 ? `: ${cur} von ${need} Erfahrungspunkten bis Stufe ${level + 1}` : ' (Höchststufe)'}`;
    this.lvlNum.textContent = String(level);
    this.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    const levelled = this.level !== 0 && level > this.level;
    this.level = level;
    if (!animate) {
      this.fill.style.transition = this.ghost.style.transition = 'none';
      this.fill.style.width = this.ghost.style.width = `${pct}%`;
      this.pct = pct;
      return;
    }
    if (levelled) {
      // fill to the end first, then start the new level from its left edge
      this.ghost.style.transition = 'none';
      this.ghost.style.width = '100%';
      this.fill.style.transition = 'width .35s cubic-bezier(.3,.8,.4,1)';
      this.fill.style.width = '100%';
      setTimeout(() => {
        this.fill.style.transition = this.ghost.style.transition = 'none';
        this.fill.style.width = '0%';
        this.ghost.style.width = `${pct}%`;
        void this.fill.offsetWidth;
        this.fill.style.transition = 'width .6s cubic-bezier(.3,.8,.4,1) .25s';
        this.fill.style.width = `${pct}%`;
      }, 420);
      this.pulse('kqp-levelled', 1600);
    } else {
      this.ghost.style.transition = 'none';
      this.ghost.style.width = `${pct}%`;
      this.fill.style.transition = 'width .55s cubic-bezier(.3,.8,.4,1) .45s';
      this.fill.style.width = `${pct}%`;
      this.pulse('kqp-gained', 900);
    }
    this.pct = pct;
  }

  get percent(): number {
    return this.pct;
  }

  /** "+50" on the bar (gains within a moment add up). */
  gain(amount: number): void {
    this.plusSum += amount;
    this.plus.textContent = `+${this.plusSum}`;
    this.plus.classList.remove('show');
    void this.plus.offsetWidth;
    this.plus.classList.add('show');
    if (this.plusTimer) clearTimeout(this.plusTimer);
    this.plusTimer = setTimeout(() => {
      this.plus.classList.remove('show');
      this.plusSum = 0;
    }, 1600);
  }

  private pulse(cls: string, ms: number): void {
    this.xp.classList.remove(cls);
    void this.xp.offsetWidth;
    this.xp.classList.add(cls);
    setTimeout(() => this.xp.classList.remove(cls), ms);
  }

  setQuick(key: string, item: string, name: string, count: number, icon: string): void {
    this.qKey.textContent = key;
    if (this.qIcon.dataset.item !== item) {
      this.qIcon.replaceChildren(svg(icon));
      this.qIcon.dataset.item = item;
    }
    this.qName.textContent = name;
    this.qCount.textContent = `×${count}`;
    this.quick.dataset.item = item;
    this.quick.dataset.count = String(count);
    this.quick.classList.toggle('kqp-empty', count <= 0);
  }

  /** The quick slot reacts (used / refused). */
  quickPulse(ok: boolean): void {
    const cls = ok ? 'kqp-used' : 'kqp-refused';
    this.quick.classList.remove('kqp-used', 'kqp-refused');
    void this.quick.offsetWidth;
    this.quick.classList.add(cls);
    setTimeout(() => this.quick.classList.remove(cls), 600);
  }

  /** A line in the feed: glyph, text, optional count. */
  line(kind: FeedEntry['kind'], text: string, icon?: string, count?: string): void {
    this.history.push({ text: count ? `${text} ${count}` : text, kind, t: Date.now() });
    if (this.history.length > 40) this.history.shift();
    const el = h(`div.kqp-line.kqp-line-${kind}`, { 'data-testid': 'feed-line' }, [icon ? h('span.kqp-line-icon', svg(icon)) : null, h('span.kqp-line-text', text), count ? h('span.kqp-line-count', count) : null]);
    this.feed.append(el);
    while (this.feed.childElementCount > 3) this.feed.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.add('out'), FEED_MS - 600);
    setTimeout(() => el.remove(), FEED_MS);
  }

  /** A floating "+50 EP" over a world point. */
  float(text: string, x: number, y: number, z: number, cls = ''): void {
    const el = h(`div.kqp-float${cls ? `.${cls}` : ''}`, { 'data-testid': 'xp-float' }, text);
    this.layer.append(el);
    this.floats.push({ el, pos: new Vector3(x, y, z), age: 0 });
    while (this.floats.length > 8) this.floats.shift()!.el.remove();
  }

  frame(dt: number, camera: PerspectiveCamera, w: number, hgt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.age += dt;
      if (f.age > 1.6) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      this.tmp.copy(f.pos).project(camera);
      const behind = this.tmp.z > 1;
      const sx = (this.tmp.x * 0.5 + 0.5) * w;
      const sy = (-this.tmp.y * 0.5 + 0.5) * hgt - f.age * 46;
      f.el.style.display = behind ? 'none' : '';
      f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      f.el.style.opacity = String(f.age < 0.15 ? f.age / 0.15 : Math.max(0, 1 - (f.age - 0.9) / 0.7));
    }
  }

  clearFloats(): void {
    for (const f of this.floats) f.el.remove();
    this.floats.length = 0;
  }
}
