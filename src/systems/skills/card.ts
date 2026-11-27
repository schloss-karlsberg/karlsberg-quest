import { t } from '../../i18n';
import { h, svg } from '../../ui/dom';
import { SKILL_MAX, type SkillId, roman } from './logic';

/** Engraved glyphs (64×64, stroke = currentColor), one per skill. Procedural, no assets. */
const GLYPHS: Record<SkillId, string> = {
  relief: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M8 44c8-10 14-10 20-4s12 6 18-4 10-8 10-8"/><path d="M8 52c8-8 14-8 20-3s12 5 18-3 10-6 10-6" opacity=".6"/>
    <path d="M8 36c8-12 14-12 20-6s12 6 18-6 10-10 10-10" opacity=".85"/>
    <circle cx="16" cy="16" r="5"/><path d="M16 6v3M6 16h3M9 9l2 2M23 9l-2 2" opacity=".8"/></g>`,
  kartograf: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M8 14l14-5 14 5 16-5v40l-16 5-14-5-14 5z"/><path d="M22 9v40M36 14v40" opacity=".55"/>
    <circle cx="36" cy="32" r="9"/><path d="M36 25l3 7-3 7-3-7z" fill="currentColor" opacity=".9"/></g>`,
  baumeister: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 16h44v30H10z"/><path d="M28 16v30M28 30h26M40 30v16" opacity=".75"/>
    <path d="M10 54h44M10 51v6M54 51v6" opacity=".7"/><path d="M18 30h4" opacity=".6"/></g>`,
  roentgen: `<g fill="currentColor"><path d="M32 6l10 16h-6l8 12H20l8-12h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity=".55"/>
    ${Array.from({ length: 34 }, (_, i) => {
      const a = i * 2.39996;
      const r = 3 + Math.sqrt(i) * 3.6;
      const x = 32 + Math.cos(a) * r * 1.45;
      const y = 48 + Math.sin(a) * r * 0.42;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 - i * 0.025).toFixed(2)}"/>`;
    }).join('')}</g>`,
  spurenleser: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 22c10 0 26-2 38-10v20c-12-6-28-6-38-6z"/><path d="M10 20v8" /><path d="M48 12c4 2 6 6 6 10s-2 8-6 10" opacity=".6"/></g>
    <g fill="currentColor"><ellipse cx="34" cy="48" rx="6" ry="5"/><ellipse cx="24" cy="40" rx="2.6" ry="3.4"/><ellipse cx="30" cy="36" rx="2.6" ry="3.4"/>
    <ellipse cx="38" cy="36" rx="2.6" ry="3.4"/><ellipse cx="44" cy="40" rx="2.6" ry="3.4"/></g>`,
};

const MEDAL = (skill: SkillId) => `<svg viewBox="0 0 96 96" aria-hidden="true">
  <defs><radialGradient id="kqk-g-${skill}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f3dfa6"/><stop offset=".55" stop-color="#c79a45"/><stop offset="1" stop-color="#7a5622"/></radialGradient></defs>
  <circle cx="48" cy="48" r="44" fill="url(#kqk-g-${skill})"/>
  <circle cx="48" cy="48" r="44" fill="none" stroke="#5a3c14" stroke-width="2"/>
  <circle class="kqk-ring" cx="48" cy="48" r="38" fill="none" stroke="#3a2610" stroke-width="1.6" stroke-dasharray="240" stroke-dashoffset="240"/>
  ${Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 40.5;
    const r2 = i % 6 === 0 ? 35.5 : 38;
    return `<line class="kqk-tick" x1="${(48 + Math.cos(a) * r1).toFixed(1)}" y1="${(48 + Math.sin(a) * r1).toFixed(1)}" x2="${(48 + Math.cos(a) * r2).toFixed(1)}" y2="${(48 + Math.sin(a) * r2).toFixed(1)}" stroke="#3a2610" stroke-width="1.2"/>`;
  }).join('')}
  <g class="kqk-glyph" transform="translate(16 16)" color="#2a1a08">${GLYPHS[skill]}</g>
</svg>`;

export interface CardRequest {
  skill: SkillId;
  level: number;
}

/**
 * Seconds a fresh unlock waits before its card comes up: a quest reward pays XP and a skill in the
 * same moment, and a level-up then takes the unlock onto its own card (src/ui/cards.ts).
 */
export const SETTLE = 0.45;

/**
 * The unlock card: a field-book slip that slides in under the era label, a brass medal whose
 * engraved ring draws itself, tier pips that get inked and a red "Freigeschaltet" stamp.
 * Queued (one at a time), never pauses the game. Reduced motion: opacity only.
 */
export class UnlockCards {
  readonly root: HTMLElement;
  private readonly queue: CardRequest[] = [];
  /** Seconds the head of the queue has waited (SETTLE). */
  private waited = 0;
  private current: { el: HTMLElement; t: number; req: CardRequest; extra: CardRequest[]; dur: number } | null = null;
  /** Seconds a card stays (enter + read + exit). */
  static readonly DURATION = 6.2;
  static readonly FADE = 0.6;
  onStamp: ((req: CardRequest) => void) | null = null;
  onRemark: ((req: CardRequest) => void) | null = null;
  private announced = false;

  constructor(parent: HTMLElement) {
    this.root = h('div.kqk-cards', { 'aria-live': 'polite' });
    parent.append(this.root);
  }

  push(req: CardRequest): void {
    // a later tier of the same skill replaces a queued earlier one
    if (!this.queue.length) this.waited = 0;
    const i = this.queue.findIndex((q) => q.skill === req.skill);
    if (i >= 0) this.queue[i] = { skill: req.skill, level: Math.max(req.level, this.queue[i]!.level) };
    else this.queue.push(req);
  }

  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  /** On screen, or the head of the queue has settled and wants to come up (asks the director). */
  get wants(): boolean {
    return !!this.current || (this.queue.length > 0 && this.waited >= SETTLE);
  }

  /** Take every waiting unlock (the level card shows them instead). */
  drain(): CardRequest[] {
    this.waited = 0;
    return this.queue.splice(0);
  }

  get showing(): CardRequest | null {
    return this.current?.req ?? null;
  }

  /** Advance (game seconds). `hold` keeps the queue waiting (modal open, story card on screen). */
  frame(dt: number, reduced: boolean, hold: boolean): void {
    if (!this.current) {
      if (!this.queue.length) {
        this.waited = 0;
        return;
      }
      if (this.waited < SETTLE) {
        this.waited += dt;
        return; // claim the shared slot on the first tick after settling
      }
      if (hold) return;
      const req = this.queue.shift()!;
      // unlocks that came together share one card (playtest round 4: two cards in a row for one reward)
      const extra = this.queue.splice(0);
      this.current = { el: this.build(req, reduced, extra), t: 0, req, extra, dur: UnlockCards.DURATION + extra.length * 1.6 };
      this.announced = false;
      this.root.append(this.current.el);
      // next frame: start the CSS transitions
      requestAnimationFrame(() => this.current?.el.classList.add('kqk-in'));
      return;
    }
    const c = this.current;
    // A title card, modal or phone stick can cover this notice. Step aside and wait.
    c.el.classList.toggle('kqk-held', hold);
    if (hold) return;
    c.t += dt;
    if (c.t >= 1.15) this.announce(true);
    if (c.t >= c.dur - UnlockCards.FADE && !c.el.classList.contains('kqk-out')) c.el.classList.add('kqk-out');
    if (c.t >= c.dur) {
      c.el.remove();
      this.current = null;
    }
  }

  /** A touch tap skips any pending stamp and starts the fade-out. */
  dismiss(): void {
    const c = this.current;
    if (!c) return;
    c.t = Math.max(c.t, c.dur - UnlockCards.FADE);
    this.announce(false);
  }

  private announce(stamp: boolean): void {
    const c = this.current;
    if (!c || this.announced) return;
    this.announced = true;
    for (const req of [c.req, ...c.extra]) {
      if (stamp) this.onStamp?.(req);
      this.onRemark?.(req);
    }
  }

  /** Remove everything (new game / load). */
  clear(): void {
    this.queue.length = 0;
    this.current?.el.remove();
    this.current = null;
  }

  private build(req: CardRequest, reduced: boolean, extra: CardRequest[] = []): HTMLElement {
    const { skill, level } = req;
    const max = SKILL_MAX[skill];
    const pips = h(
      'div.kqk-pips',
      Array.from({ length: max }, (_, i) => h(`span.kqk-pip${i + 1 < level ? '.on' : i + 1 === level ? '.new' : ''}`, roman(i + 1))),
    );
    const key = t(`skills.key.${skill}.${level}`);
    const name = t(`skills.name.${skill}`);
    const tier = t(`skills.tier.${skill}.${level}`);
    return h(
      `div.kqk-card${reduced ? '.kqk-reduced' : ''}`,
      { dataset: { skill, level: String(level) }, 'data-testid': 'skill-card', role: 'status', 'aria-label': t('skills.card.aria', { Name: name, Stufe: roman(level) }) },
      [
        h('div.kqk-medal', svg(MEDAL(skill))),
        h('div.kqk-body', [
          h('div.kqk-kicker', t('skills.card.kicker')),
          h('div.kqk-name', [name, pips]),
          h('div.kqk-tier', [h('span.kqk-tiernum', t('skills.card.tier', { n: roman(level) })), ' · ', tier]),
          h('div.kqk-desc', [key ? h('kbd', key) : null, t(`skills.desc.${skill}.${level}`)]),
          h('div.kqk-rule'),
          ...extra.map((x) =>
            h('div.kqk-also', { 'data-testid': 'skill-card-also', dataset: { skill: x.skill, level: String(x.level) } }, [
              h('span.kqk-also-name', `${t(`skills.name.${x.skill}`)} ${roman(x.level)}`),
              h('span.kqk-also-desc', [t(`skills.key.${x.skill}.${x.level}`) ? h('kbd', t(`skills.key.${x.skill}.${x.level}`)) : null, t(`skills.desc.${x.skill}.${x.level}`)]),
            ]),
          ),
        ]),
        h('div.kqk-stamp', t('skills.card.stamp')),
        h('div.kqk-shine'),
      ],
    );
  }
}
