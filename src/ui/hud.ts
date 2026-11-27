import { t } from '../i18n';
import { EYE_SVG, h, svg } from './dom';
import { Waymark } from './waymark';

const PX_PER_DEG = 3.2;
/** Pixels kept free between the top-left column and the bottom-left zone (vitals). */
const ZONE_GAP = 18;

const MOUSE_SVG = `<svg viewBox="0 0 24 32" class="kq-ctp-mouse" aria-hidden="true"><rect x="3" y="2" width="18" height="28" rx="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v10M3 12h18" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 11V11a8 8 0 0 1 8-8v9z" fill="currentColor" opacity="0.85"/></svg>`;

export type HudDockArea = 'vitals' | 'boss' | 'feed';

type MapTarget = Readonly<{ x?: number; z?: number }>;

/** Retire a status immediately for reduced motion, or give it a short opacity fade. */
export function retireNotice(el: HTMLElement): void {
  if (el.hidden || document.documentElement.hasAttribute('data-kq-reduced-motion')) {
    el.remove();
    return;
  }
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('kq-notice-out');
  // A modal can hide the dock during dismissal, which cancels the animation.
  window.setTimeout(() => el.remove(), 200);
}

/**
 * HUD slots. Each is a tiny API so feature systems never touch the DOM structure:
 *   compass (heading + markers), prompt, subtitles, threat, lantern oil, era label, stance, toasts.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly markers = new Map<string, HTMLElement>();
  private readonly promptEl: HTMLElement;
  private readonly subsEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly threatEdge: HTMLElement;
  private readonly oilEl: HTMLElement;
  private readonly oilFill: HTMLElement;
  private readonly eraEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly stanceEl: HTMLElement;
  readonly noticeDock: HTMLElement;
  private toastEl: HTMLElement | null = null;
  private readonly clickEl: HTMLElement;
  /** "⏸ Bullet-Time" chip while the simulation only advances by `kq.step` / `kq.pilot` (?manual). */
  private readonly bulletEl = h('div.kq-bullet-time.kq-hidden', { 'data-testid': 'bullet-time', title: 'Bullet-Time: das Spiel läuft nur über kq.pilot / kq.step weiter' }, '⏸ Bullet-Time');
  private bulletTime = false;
  /** The world waymark over the tracked objective (./waymark.ts; the quests system drives it). */
  readonly waymark = new Waymark();
  /** World coordinates behind the story and quest compass markers, for the minimap. */
  storyTarget: MapTarget | null = null;
  questLead: { target: Readonly<{ x: number; z: number }> | null; story?: MapTarget } | null = null;

  get objectiveTarget() {
    const story = this.storyTarget;
    const lead = this.questLead;
    // A lead derived from this story objective may have been routed through a door.
    if (story?.x !== undefined && story.z !== undefined && lead?.story !== story) return story;
    return lead?.target ?? null;
  }

  /** Top-left column: era label, status, then feature lines (room, objective, gauges) — never overlapping. */
  private readonly tl: HTMLElement;
  /** Action-RPG docks (docs/ACTION-RPG.md §10): features put their own elements here. */
  private readonly docks: Record<HudDockArea, HTMLElement>;
  private heading = 0;
  /**
   * Reasons the screen is busy with action (a fight, a chase, being knocked down): centre cards
   * (level, skill unlock), tips and prompts wait until it calms down. Features set them.
   */
  private readonly action = new Map<string, number>();
  private calmClock = 0;

  /** Mark (or clear) an action reason; cleared ones keep the screen busy for `linger` seconds. */
  busy(reason: string, on: boolean, linger = 3): void {
    if (on) this.action.set(reason, Infinity);
    else if (this.action.get(reason) === Infinity) this.action.set(reason, this.calmClock + linger);
  }

  /** Advance the linger clock (seconds). */
  tickCalm(dt: number): void {
    this.calmClock += dt;
    for (const [k, v] of this.action) if (v !== Infinity && v <= this.calmClock) this.action.delete(k);
    this.applyMode();
  }

  /** Re-fit the zones (set once the observers exist). */
  private fit: (() => void) | null = null;
  private mode = '';

  /**
   * The HUD's mode for the zone CSS (`data-kq-mode` on `.kq-hud`): 'combat' while a fight is on
   * (or just ended) — the tracker shows only the tracked quest and its next goal; 'staged' while a
   * boss reveal or a climax plays — the tracker and the feed step back, edge markers go.
   */
  private applyMode(): void {
    const m = this.staged ? 'staged' : this.acting('combat') ? 'combat' : '';
    if (m === this.mode) return;
    this.mode = m;
    if (m) this.el.dataset.kqMode = m;
    else delete this.el.dataset.kqMode;
    this.fit?.();
  }

  /** Top edge (px) of the bottom-left zone: the vitals dock, or the oil gauge / stance below it. */
  private bottomLeftTop(): number {
    const H = window.innerHeight;
    let top = H - 122;
    const v = this.docks.vitals;
    if (v.childElementCount > 0) {
      const r = v.getBoundingClientRect();
      if (r.height > 0) top = Math.min(top, r.top);
    }
    if (!this.oilEl.classList.contains('kq-hidden')) {
      const r = this.oilEl.getBoundingClientRect();
      if (r.height > 0) top = Math.min(top, r.top);
    }
    return top;
  }

  /** One reason is on (or lingering): e.g. 'combat' while a fight is engaged. */
  acting(reason: string): boolean {
    const v = this.action.get(reason);
    // a reason released without linger is off at once (tickCalm only prunes the map)
    return v !== undefined && (v === Infinity || v > this.calmClock);
  }

  /** Something action-heavy is on (or just ended): keep the centre of the screen clear. */
  get inAction(): boolean {
    return this.action.size > 0;
  }

  /**
   * A boss reveal or a staged climax holds the screen (reasons 'reveal', 'stage', 'stage-…'):
   * edge markers (attacker arrows, sound arrows) keep out of the picture while it plays.
   */
  get staged(): boolean {
    for (const k of this.action.keys()) if ((k === 'reveal' || k === 'stage' || k.startsWith('stage-')) && this.acting(k)) return true;
    return false;
  }

  constructor() {
    this.strip = h('div.kq-compass-strip');
    // labels every 45°, ticks every 15°, three turns so the strip can scroll seamlessly
    const names = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const label = (k: string) => (k.length === 1 ? t(`hud.compass.${k}`) : k.split('').map((c) => t(`hud.compass.${c}`)).join(''));
    for (let deg = -360; deg <= 720; deg += 15) {
      const x = deg * PX_PER_DEG;
      const norm = ((deg % 360) + 360) % 360;
      if (norm % 45 === 0) {
        const k = names[norm / 45]!;
        const s = h('span', label(k));
        s.style.left = `${x}px`;
        if (k.length > 1) s.style.fontSize = '13px';
        this.strip.append(s);
      } else {
        const i = h('i.minor');
        i.style.left = `${x}px`;
        this.strip.append(i);
      }
    }
    // the strip scrolls inside a clip (the markers and their distance labels may hang below it)
    this.compass = h('div.kq-compass', [h('div.kq-compass-clip', this.strip), h('div.kq-compass-needle')]);
    this.promptEl = h('div.kq-prompt');
    this.subsEl = h('div.kq-subtitles', { 'aria-live': 'polite' });
    this.threatEl = h('div.kq-threat', { title: t('hud.threat') }, svg(EYE_SVG));
    this.threatEdge = h('div.kq-threat-edge');
    this.oilFill = h('div.kq-oil-fill');
    this.oilEl = h('div.kq-oil.kq-hidden', [h('div.kq-oil-gauge', this.oilFill), h('div.kq-oil-label', t('hud.oil'))]);
    this.eraEl = h('div.kq-era-label');
    this.statusEl = h('div.kq-status');
    this.stanceEl = h('div.kq-stance');
    this.noticeDock = h('div.kq-toasts');
    this.clickEl = h('div.kq-click-to-play.kq-hidden', { 'data-testid': 'click-to-look' }, [
      svg(MOUSE_SVG),
      h('div.kq-ctp-text', [h('b', t('hud.clickToPlay')), h('span', t('hud.clickToPlaySub'))]),
    ]);
    this.eraEl.style.order = '0';
    this.statusEl.style.order = '10';
    this.tl = h('div.kq-tl', { 'data-testid': 'hud-topleft' }, [this.eraEl, this.statusEl]);
    // features' panels below the column (skill cards) read its bottom edge from --kq-tl-bottom
    if (typeof ResizeObserver === 'function' && typeof document !== 'undefined') {
      new ResizeObserver(() => {
        const r = this.tl.getBoundingClientRect();
        if (r.height > 0) document.documentElement.style.setProperty('--kq-tl-bottom', `${Math.round(r.bottom)}px`);
      }).observe(this.tl);
    }
    this.docks = {
      vitals: h('div.kq-dock.kq-dock-vitals', { 'data-testid': 'hud-vitals' }),
      boss: h('div.kq-dock.kq-dock-boss', { 'data-testid': 'hud-boss' }),
      feed: h('div.kq-dock.kq-dock-feed', { 'data-testid': 'hud-feed' }),
    };
    // the top-left column (era, objective, quest tracker) must end above the vitals dock: its
    // limit follows the dock's top edge, and a clipped column fades out at the bottom
    if (typeof ResizeObserver === 'function' && typeof window !== 'undefined') {
      let queued = false;
      const fit = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          fitNow();
        });
      };
      const fitNow = () => {
        // zones (round 6, docs/ACTION-RPG.md §10): the top-left column ends a gap above the
        // bottom-left zone (vitals, Bannlicht, abilities, level, quick slot — and the oil gauge
        // under them); too little room → the tracker goes compact (titles and the next goal),
        // only then is the column cut, with a fade
        const top = this.bottomLeftTop();
        // the phone dialogue card ends above this zone too (touch.css reads --kq-bl-top)
        document.documentElement.style.setProperty('--kq-bl-top', `${Math.round(top)}px`);
        const tlTop = this.tl.getBoundingClientRect().top || 12;
        this.tl.style.maxHeight = `${Math.max(80, Math.round(top - ZONE_GAP - tlTop))}px`;
        this.tl.classList.remove('kq-tl-tight');
        if (this.tl.scrollHeight > this.tl.clientHeight + 1) this.tl.classList.add('kq-tl-tight');
        this.tl.classList.toggle('kq-tl-clipped', this.tl.scrollHeight > this.tl.clientHeight + 1);
      };
      this.fit = fit;
      const ro = new ResizeObserver(fit);
      ro.observe(this.docks.vitals);
      ro.observe(this.tl);
      new MutationObserver(fit).observe(this.tl, { childList: true, subtree: true });
      window.addEventListener('resize', fit);
    }
    this.el = h('div.kq-hud.kq-hidden', [
      this.threatEdge,
      this.waymark.el,
      this.docks.vitals,
      this.docks.boss,
      this.docks.feed,
      this.compass,
      this.threatEl,
      this.tl,
      h('div.kq-crosshair'),
      this.subsEl,
      this.promptEl,
      this.oilEl,
      this.stanceEl,
      this.noticeDock,
      this.clickEl,
      this.bulletEl,
    ]);
  }

  show(on: boolean): void {
    this.el.classList.toggle('kq-hidden', !on);
  }

  /** Heading in degrees clockwise from grid north. */
  setHeading(deg: number): void {
    this.heading = ((deg % 360) + 360) % 360;
    const w = this.compass.clientWidth || 460;
    this.strip.style.transform = `translateX(${w / 2 - this.heading * PX_PER_DEG}px)`;
    for (const [, m] of this.markers) this.placeMarker(m);
  }

  /**
   * A marker on the compass at a grid bearing (deg). Pass null to remove. `opts.dist` (metres)
   * prints the distance under it; `opts.edge` keeps it on the strip's edge (with an arrow) when it
   * is behind you, so the way to the tracked goal is always on screen. `opts.label` names it in
   * front of the distance („Gruppe · 45 m“). `opts.labelRow` gives it a second distance row.
   */
  setMarker(id: string, bearingDeg: number | null, color = '#e9c46a', opts: { dist?: number | null; edge?: boolean; label?: string; kind?: 'obj' | 'offer' | 'offer-main' | 'ready'; labelRow?: 2 } = {}): void {
    let m = this.markers.get(id);
    if (bearingDeg === null) {
      m?.remove();
      this.markers.delete(id);
      return;
    }
    const kind = opts.kind ? ` kqq-cm kqq-cm-${opts.kind}` : '';
    const row = opts.labelRow === 2 ? ' kq-compass-label-second' : '';
    const classes = `kq-compass-marker${kind}${row}`;
    if (!m) {
      m = h('div', { className: classes, dataset: { marker: id } });
      this.compass.append(m);
      this.markers.set(id, m);
    } else if (m.className !== classes) m.className = classes;
    m.style.borderColor = color;
    m.dataset.bearing = String(bearingDeg);
    if (opts.edge) m.dataset.edge = '1';
    else delete m.dataset.edge;
    const dt = typeof opts.dist === 'number' && opts.dist >= 6 ? (opts.dist < 1000 ? `${Math.round(opts.dist / (opts.dist < 100 ? 1 : 10)) * (opts.dist < 100 ? 1 : 10)} m` : `${(opts.dist / 1000).toFixed(1).replace('.', ',')} km`) : '';
    const text = opts.label ? (dt ? `${opts.label} · ${dt}` : opts.label) : dt;
    if (text) m.dataset.dist = text;
    else delete m.dataset.dist;
    this.placeMarker(m);
  }

  private placeMarker(m: HTMLElement): void {
    const b = Number(m.dataset.bearing);
    let d = b - this.heading;
    d = ((d + 540) % 360) - 180;
    const w = this.compass.clientWidth || 460;
    const half = w / 2 / PX_PER_DEG - 6;
    if (m.dataset.edge && Math.abs(d) > half) {
      // behind or beside you: it waits on the strip's edge and points the way round
      m.style.left = `${w / 2 + Math.sign(d) * half * PX_PER_DEG}px`;
      m.style.display = '';
      m.dataset.side = d < 0 ? 'l' : 'r';
      return;
    }
    delete m.dataset.side;
    m.style.left = `${w / 2 + d * PX_PER_DEG}px`;
    m.style.display = Math.abs(d) > 70 ? 'none' : '';
  }

  /**
   * Bottom prompt, e.g. prompt('E', 'Lauschen'). Null hides it. Several features can hold a prompt
   * at once (`owner`, e.g. the story's "Q – Zeitwechsel" and the Chronik's "E – Untersuchen"): the
   * most recently set one is shown, and clearing yours reveals the one below instead of hiding all.
   */
  prompt(key: string | null, text?: string, owner = '_', opts: { low?: boolean } = {}): void {
    this.prompts.delete(owner);
    if (key || text) this.prompts.set(owner, { key, text: text ?? '', low: !!opts.low });
    this.renderPrompt();
  }

  /** Scene owners can hide all prompts while their input takes precedence. */
  blockPrompts(reason: string, blocked: boolean): void {
    if (blocked) this.promptBlocks.add(reason);
    else this.promptBlocks.delete(reason);
    this.renderPrompt();
  }

  private renderPrompt(): void {
    // A low-priority prompt such as opening the spring hub yields to a nearby interaction.
    const all = this.promptBlocks.size ? [] : [...this.prompts.entries()];
    const topEntry = all.filter(([, p]) => !p.low).pop() ?? all.pop();
    this.promptTop = topEntry?.[0] ?? null;
    const top = topEntry?.[1];
    this.onPrompt?.(top?.key ?? null, top ? top.text || null : null);
    if (!top) {
      if (this.promptBlocks.size) this.promptEl.replaceChildren();
      this.promptEl.classList.remove('show');
      return;
    }
    // touch mode: the key cap becomes the icon of the touch button that answers it (src/ui/touch.ts)
    const icon = top.key && this.touchIcon?.(top.key);
    const cap = this.touchIcon
      ? (icon ? h('kbd.kq-touch-key', { 'data-key': top.key }, svg(icon)) : null)
      : (top.key ? h('kbd', top.key) : null);
    this.promptEl.replaceChildren(...(cap ? [cap] : []), top.text);
    this.promptEl.classList.add('show');
  }

  /** Touch mode: prompt keys as touch icons (null: key caps); also hides the pointer-lock chip. */
  setTouchIcons(fn: ((key: string) => string | null) | null): void {
    this.touchIcon = fn;
    if (fn) this.clickEl.classList.add('kq-hidden');
    this.renderPrompt();
  }
  private touchIcon: ((key: string) => string | null) | null = null;
  /** Called with the shown prompt's key and text (null: none) whenever it changes (touch buttons). */
  onPrompt: ((key: string | null, text: string | null) => void) | null = null;
  private readonly promptBlocks = new Set<string>();
  private readonly prompts = new Map<string, { key: string | null; text: string; low: boolean }>();
  private promptTop: string | null = null;

  /** Owner of the prompt on screen (null: none): E belongs to it. */
  promptOwner(): string | null {
    return this.promptTop;
  }

  /**
   * The prompt on screen now (null: none), from the prompt state: the element keeps its last text
   * after it hides, so reading the DOM reports a stale prompt (bullet-time pilot, playtest round 10).
   */
  promptShown(): { owner: string; key: string | null; text: string } | null {
    const top = this.promptTop ? this.prompts.get(this.promptTop) : undefined;
    return top && this.promptTop ? { owner: this.promptTop, key: top.key, text: top.text } : null;
  }

  /** Is only a low prompt (or none) on screen? A feature may then show its own. */
  promptFree(): boolean {
    const top = this.promptTop ? this.prompts.get(this.promptTop) : undefined;
    return !top || top.low;
  }

  /** Show a subtitle line; returns a function that removes it early. */
  subtitle(speaker: string | null, text: string, ms = 4000, fiction = false): () => void {
    const line = h('div', h('span.line', [speaker ? h('span.who', speaker) : null, text, fiction ? h('span.fiction', '(Fiktion)') : null]));
    this.subsEl.append(line);
    while (this.subsEl.childElementCount > 3) this.subsEl.firstElementChild?.remove();
    const timer = setTimeout(() => line.remove(), ms);
    return () => {
      clearTimeout(timer);
      line.remove();
    };
  }

  setSubtitleSize(size: 's' | 'm' | 'l' | 'xl'): void {
    const px = { s: 18, m: 22, l: 28, xl: 36 }[size] ?? 22;
    document.documentElement.style.setProperty('--sub-size', `${px}px`);
    document.documentElement.style.setProperty('--sub-scale', String(px / 22));
  }

  /** 0..1 threat; the eye opens, the screen edge reddens above 0.6. */
  setThreat(level: number): void {
    const v = Math.max(0, Math.min(1, level));
    this.threatEl.style.opacity = v < 0.02 ? '0' : String(0.35 + 0.65 * v);
    const pupil = this.threatEl.querySelector('.pupil') as SVGCircleElement | null;
    pupil?.setAttribute('r', String(2 + 5 * v));
    this.threatEdge.style.opacity = String(Math.max(0, (v - 0.6) / 0.4));
  }

  /** Lantern oil gauge; `oil` null hides it. */
  setLantern(oil: number | null, lit = false): void {
    if (oil === null) {
      this.oilEl.classList.add('kq-hidden');
      return;
    }
    this.oilEl.classList.remove('kq-hidden');
    this.oilEl.classList.toggle('unlit', !lit);
    this.oilFill.style.height = `${Math.round(Math.max(0, Math.min(1, oil)) * 100)}%`;
  }

  /**
   * Put a feature's element into the top-left column (below the era label and the status line).
   * `order`: 20 room name, 30 objective, 40 story gauges; elements that should take no room while
   * hidden collapse via CSS (`display: none`).
   */
  stack(el: HTMLElement, order: number): void {
    el.style.order = String(order);
    this.tl.append(el);
  }

  /**
   * Put a feature's element into a dock (docs/ACTION-RPG.md §10). Elements stack by `order` and
   * never overlap; a hidden element (`display: none`) takes no room.
   * - `vitals` (bottom-left, above the lantern oil): combat's Lebenskraft / Atem (10), Bannlicht
   *   charges (20), progression's level + XP bar (30) and quick-use slot (40).
   * - `boss` (top centre, under the threat eye): combat's boss bar.
   * - `feed` (right edge, under the toasts): progression's pickup feed ("+ Kräuterbalsam"), quests'
   *   objective ticks.
   */
  dock(area: HudDockArea, el: HTMLElement, order = 0): void {
    el.style.order = String(order);
    this.docks[area].append(el);
  }

  setEraLabel(text: string): void {
    this.eraEl.textContent = text;
  }

  /** Small italic status line under the era label (scan mode, map). */
  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setStance(text: string): void {
    this.stanceEl.textContent = text;
  }

  /** Render the toast that owns the card director's slot. */
  showToast(text: string): void {
    this.toastEl = h('div.kq-toast.kq-notice', { role: 'status' }, text);
    this.noticeDock.append(this.toastEl);
  }

  holdToast(held: boolean): void {
    if (this.toastEl) this.toastEl.hidden = held;
  }

  closeToast(): void {
    if (this.toastEl) retireNotice(this.toastEl);
    this.toastEl = null;
  }

  showClickToPlay(on: boolean): void {
    // in bullet time the pilot looks without pointer lock: no "click into the picture" chip
    this.clickEl.classList.toggle('kq-hidden', !on || this.bulletTime || this.touchIcon !== null);
  }

  /** Show the bullet-time chip (?manual / `kq.pilot.bulletTime()`); it takes the pointer-lock chip's place. */
  setBulletTime(on: boolean): void {
    this.bulletTime = on;
    this.bulletEl.classList.toggle('kq-hidden', !on);
    if (on) this.clickEl.classList.add('kq-hidden');
  }
}
