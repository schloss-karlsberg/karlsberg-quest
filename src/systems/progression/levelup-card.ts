/**
 * The level-up stamp card ("Stufe IV"): a field-book slip, a brass medal whose ring draws itself
 * around the level numeral, the gains in ink and a red "Aufgestiegen" stamp that lands with a
 * chime — no flash. Several level-ups at once become one card (the highest level, the sum of the
 * points). Like the skills' unlock cards (docs/ARCHITECTURE.md §5) it counts game time and steps
 * aside (`kqp-held`, its clock stops) while a story title card, the curtain, a modal or a skill
 * unlock card is on screen.
 */
import { charmSlots } from '../../rpg/stats';
import { h, svg } from '../../ui/dom';
import { roman } from './icons';

export interface LevelCardRequest {
  level: number;
  /** Levels gained with this card. */
  gained: number;
  /** Unspent talent points after it. */
  points: number;
}

const MEDAL = (n: string) => `<svg viewBox="0 0 96 96" aria-hidden="true">
  <defs><radialGradient id="kqp-medal-g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f6e3ad"/><stop offset=".55" stop-color="#c99b44"/><stop offset="1" stop-color="#6e4c1c"/></radialGradient></defs>
  <circle cx="48" cy="48" r="44" fill="url(#kqp-medal-g)"/>
  <circle cx="48" cy="48" r="44" fill="none" stroke="#4e3412" stroke-width="2"/>
  <circle class="kqp-ring" cx="48" cy="48" r="37" fill="none" stroke="#3a2610" stroke-width="1.8" stroke-dasharray="233" stroke-dashoffset="233"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return `<path class="kqp-leaf" style="transition-delay:${(0.35 + i * 0.05).toFixed(2)}s" d="M${(48 + Math.cos(a) * 40.5).toFixed(1)} ${(48 + Math.sin(a) * 40.5).toFixed(1)} l ${(Math.cos(a + 1.9) * 3).toFixed(1)} ${(Math.sin(a + 1.9) * 3).toFixed(1)}" stroke="#3a2610" stroke-width="1.6" stroke-linecap="round"/>`;
  }).join('')}
  <text class="kqp-numeral" x="48" y="${n.length > 3 ? 57 : 60}" text-anchor="middle" font-family="'IM Fell English SC', Georgia, serif" font-size="${n.length > 3 ? 22 : n.length > 2 ? 27 : 33}" fill="#2a1a08">${n}</text>
</svg>`;

export class LevelCards {
  readonly root: HTMLElement;
  private queued: LevelCardRequest | null = null;
  private current: { el: HTMLElement; t: number; req: LevelCardRequest } | null = null;
  private stamped = false;
  static readonly DURATION = 5.6;
  onStamp: ((req: LevelCardRequest) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div.kqp-cards', { 'aria-live': 'polite' });
    parent.append(this.root);
  }

  push(level: number, points: number): void {
    const q = this.queued;
    this.queued = { level: Math.max(level, q?.level ?? 0), gained: (q?.gained ?? 0) + 1, points };
  }

  get showing(): LevelCardRequest | null {
    return this.current?.req ?? null;
  }

  get held(): boolean {
    return !!this.current?.el.classList.contains('kqp-held');
  }

  /** Advance (game seconds). `hold` keeps the card back / makes it step aside. */
  frame(dt: number, reduced: boolean, hold: boolean): void {
    if (!this.current) {
      if (hold || !this.queued) return;
      const req = this.queued;
      this.queued = null;
      this.current = { el: this.build(req, reduced), t: 0, req };
      this.stamped = false;
      this.root.append(this.current.el);
      requestAnimationFrame(() => this.current?.el.classList.add('kqp-in'));
      return;
    }
    const c = this.current;
    c.el.classList.toggle('kqp-held', hold);
    if (hold) return;
    c.t += dt;
    if (!this.stamped && c.t >= 0.9) {
      this.stamped = true;
      c.el.classList.add('kqp-stamped');
      this.onStamp?.(c.req);
    }
    if (c.t >= LevelCards.DURATION - 0.6) c.el.classList.add('kqp-out');
    if (c.t >= LevelCards.DURATION) {
      c.el.remove();
      this.current = null;
    }
  }

  clear(): void {
    this.queued = null;
    this.current?.el.remove();
    this.current = null;
  }

  private build(req: LevelCardRequest, reduced: boolean): HTMLElement {
    const n = req.gained;
    const gains = [`+${12 * n} Lebenskraft`, `+${3 * n} Atem`, `+${4 * n} % Schaden`];
    const extra: string[] = [];
    if (charmSlots(req.level) > charmSlots(req.level - n)) extra.push('Ein zweiter Platz für ein Amulett.');
    const pts = req.points === 1 ? '1 Talentpunkt frei' : `${req.points} Talentpunkte frei`;
    return h(
      `div.kqp-card${reduced ? '.kqp-reduced' : ''}`,
      { 'data-testid': 'level-card', dataset: { level: String(req.level) }, role: 'status', 'aria-label': `Stufe ${req.level} erreicht` },
      [
        h('div.kqp-card-medal', svg(MEDAL(roman(req.level)))),
        h('div.kqp-card-body', [
          h('div.kqp-card-kicker', 'Erfahrung gesammelt'),
          h('div.kqp-card-title', `Stufe ${roman(req.level)}`),
          h('div.kqp-card-gains', gains.map((g) => h('span', g))),
          h('div.kqp-card-points', [h('span.kqp-card-pip', '✦'), ` ${pts} `, h('span.kqp-card-hint', [h('kbd', 'I'), ' Talente'])]),
          ...extra.map((x) => h('div.kqp-card-extra', x)),
        ]),
        h('div.kqp-card-stamp', 'Aufgestiegen'),
      ],
    );
  }
}
