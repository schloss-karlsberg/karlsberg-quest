import './touch.css';
import type { EventBus } from '../core/events';
import type { SettingsStore } from '../core/save';
import { addStrings, t } from '../i18n';
import type { Action, Input } from '../player/input';
import { TOUCH, TOUCH_SETTINGS, type TouchSetting, diffHeld, isTouchSetting, lookDelta, crouchButtonMode, rotateWanted, stickToMove, touchActive, touchIconFor, touchPromptIcon } from '../player/touchMap';
import { h, svg } from './dom';
import type { Hud } from './hud';
import { addSettingsRows } from './settings';
import { TOUCH_ICONS } from './touchIcons';

declare module '../core/save' {
  interface Settings {
    /** "Touch-Steuerung": Auto (coarse pointer or a touch seen), An, Aus (src/ui/touch.ts). */
    touchControls?: TouchSetting;
  }
}

addStrings('de', {
  'touch.setting': 'Touch-Steuerung',
  'touch.setting.auto': 'Auto',
  'touch.setting.on': 'An',
  'touch.setting.off': 'Aus',
  'touch.setting.help': 'Stick, Wischen zum Umsehen und Knöpfe auf dem Bildschirm. Auto: an auf Telefon und Tablet oder sobald der Bildschirm berührt wird.',
  'touch.attack': 'Hieb (halten: Wuchthieb)',
  'touch.dodge': 'Ausweichen',
  'touch.up': 'Steigen',
  'touch.down': 'Sinken',
  'touch.crouch': 'Ducken (Schleichen)',
  'touch.bannlicht': 'Bannlicht',
  'touch.lock': 'Ziel fassen',
  'touch.balm': 'Balsam',
  'touch.interact': 'Interagieren (halten: Lauschen)',
  'touch.interact.short': 'Aktion',
  'touch.shift': 'Epochenwechsel (halten: zurück)',
  'touch.fly': 'Geisterblick: Fliegen',
  'touch.journal': 'Feldbuch',
  'touch.map': 'Karte',
  'touch.pause': 'Pause',
  'touch.photo': 'Handy-Kamera',
  'touch.shutter': 'Auslöser: Foto machen',
  'touch.relief': 'Reliefansicht',
  'touch.relief.0': 'Aus',
  'touch.skill1': 'Ausfall',
  'touch.skill2': 'Erdstoß',
  'touch.skill3': 'Wirbel',
  'touch.stick': 'Bewegen',
  'touch.look': 'Umsehen',
  'touch.rotate': 'Bitte das Gerät quer halten.',
  'touch.rotate.sub': 'Karlsberg Quest spielt sich im Querformat.',
});

/** A phone turning from upright to sideways, with a curved arrow (drawn for this project). */
const ROTATE_SVG = `<svg viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<g class="kq-rotate-phone"><rect x="34" y="18" width="28" height="50" rx="5"/><path d="M44 23h8"/><circle cx="48" cy="61" r="2"/></g>
<path class="kq-rotate-arrow" d="M18 46a30 30 0 0 1 24-29"/><path class="kq-rotate-arrow" d="M36 12l6 5-5 6"/>
<path class="kq-rotate-arrow" d="M78 50a30 30 0 0 1-24 29"/><path class="kq-rotate-arrow" d="M60 84l-6-5 5-6"/>
</svg>`;

/**
 * After a touch button's pointerup the browser still sends a click to whatever lies under the
 * finger by then. A button that opens a page (Pause, Feldbuch, Karte) put that page's × or a menu
 * entry under the finger, and the click closed it again at once. Swallow that one click.
 */
function swallowNextClick(from: HTMLElement): void {
  const stop = (e: MouseEvent) => {
    window.removeEventListener('click', stop, true);
    clearTimeout(timer);
    if (from.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const timer = window.setTimeout(() => window.removeEventListener('click', stop, true), 600);
  window.addEventListener('click', stop, true);
}

let touchForms = 0;
addSettingsRows((settings) => {
  const cur = isTouchSetting(settings.state.touchControls) ? settings.state.touchControls : 'auto';
  const group = h('div.radios', { role: 'radiogroup', 'aria-label': t('touch.setting'), 'data-testid': 'set-touch' });
  const name = `kq-touch-${++touchForms}`;
  for (const v of TOUCH_SETTINGS) {
    group.append(
      h('label', [
        h('input', { type: 'radio', name, value: v, checked: cur === v, onchange: () => settings.update((d) => (d.touchControls = v), 'touchControls') }),
        ` ${t(`touch.setting.${v}`)}`,
      ]),
    );
  }
  return [[t('touch.setting'), group, 'controls', t('touch.setting.help')]];
});

export interface TouchDeps {
  input: Input;
  settings: SettingsStore;
  hud: Hud;
  events: EventBus;
  /** Where the overlay goes (ui.root). */
  root: HTMLElement;
  openPause(): void;
  canFly(): boolean;
  flying(): boolean;
  /** Ability n (1 Ausfall, 2 Erdstoß, 3 Wirbel) learnt? Its button hides until then. Absent: always shown. */
  skillUnlocked?(n: 1 | 2 | 3): boolean;
  /** The player's stance ('stand' | 'crouch' | 'prone'): the crouch button's state after a load. */
  stance?(): string;
}

interface Btn {
  el: HTMLButtonElement;
  actions: Action[];
}

/**
 * On-screen touch controls (phase 1, docs/PERF-MOBILE-RESEARCH.md §B):
 *  - left part: a floating stick (W/A/S/D, push to the rim to sprint)
 *  - right part: drag to look (`Input.addLook`)
 *  - thumb arc: Hieb (hold = Wuchthieb), Ausweichen, Bannlicht, Ziel, Balsam, abilities
 *  - context: Interagieren with the prompt's text (hold = Lauschen), Epoche (hold = zurück)
 *  - top: Relief, Feldbuch, Karte, Pause (and Fliegen in the spirit view)
 * Buttons press binding-independent virtual actions (`Input.press`), so features read them like keys.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly interactBtn: Btn;
  private readonly interactText: HTMLElement;
  private readonly flyBtn: Btn;
  /** Crouch toggle on foot, hold to sink while flying (C on the keyboard). */
  private readonly crouchBtn: Btn;
  private stance = 'stand';
  private readonly dodgeBtn: Btn;
  private readonly scanPop: HTMLElement;
  private readonly skillBtns: HTMLButtonElement[];
  private readonly attackBtn: HTMLButtonElement;
  private readonly rotateEl: HTMLElement;
  private titleEl: HTMLElement | null = null;
  /** Touch UI wanted (setting / device). */
  private wanted = false;
  /** Gameplay running without a modal (boot decides). */
  private playing = false;
  private touchSeen = false;
  private readonly coarse: boolean;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private held: Action[] = [];
  private readonly looks = new Map<number, { x: number; y: number }>();
  /** pointerId → actions that button holds. */
  private readonly btnHeld = new Map<number, Action[]>();
  /** Called whenever the active state flips (boot: pointer lock, click-to-play chip). */
  onActiveChange: ((on: boolean) => void) | null = null;

  constructor(private readonly deps: TouchDeps) {
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const btn = (cls: string, icon: string, label: string, actions: Action[], text?: HTMLElement): Btn => {
      const el = h(`button.kq-t-btn.${cls}` as `button.${string}`, { type: 'button', 'aria-label': label, 'data-testid': `touch-${cls}` }, svg(icon), text ?? null);
      const b = { el, actions };
      this.wire(b);
      return b;
    };
    const I = TOUCH_ICONS;
    this.stick = h('div.kq-t-stick.kq-hidden', { 'aria-hidden': 'true' }, (this.knob = h('div.kq-t-knob')));
    this.interactText = h('span.kq-t-label', t('touch.interact.short'));
    this.interactBtn = btn('interact', I.interact, t('touch.interact'), ['listen'], this.interactText);
    this.dodgeBtn = btn('dodge', I.dodge, t('touch.dodge'), ['dodge', 'up']);
    this.flyBtn = btn('fly', I.fly, t('touch.fly'), ['fly']);
    // 'crouch' toggles the stance on foot (the player ignores it while flying), 'down' sinks while
    // flying (nothing reads it on foot): the same pair as C
    this.crouchBtn = btn('crouch', I.crouch, t('touch.crouch'), ['crouch', 'down']);
    const shift = btn('shift', I.shift, t('touch.shift'), ['shift']);
    shift.el.append(h('i.kq-t-ring'));
    const attack = btn('attack', I.attack, t('touch.attack'), ['attack', 'interact']);
    attack.el.append(h('i.kq-t-ring'));
    this.attackBtn = attack.el;
    const scanBtn = h('button.kq-t-btn.relief', { type: 'button', 'aria-label': t('touch.relief'), 'data-testid': 'touch-relief' }, svg(I.relief));
    this.scanPop = h('div.kq-t-pop.kq-hidden', { 'data-testid': 'touch-relief-pop' });
    for (const n of [1, 2, 3, 0] as const) {
      const chip = h('button.kq-t-chip', { type: 'button', 'data-testid': `touch-scan${n}` }, n === 0 ? t('touch.relief.0') : String(n));
      this.wire({ el: chip, actions: [`scan${n}` as Action] }, () => this.scanPop.classList.add('kq-hidden'));
      this.scanPop.append(chip);
    }
    this.tap(scanBtn, () => this.scanPop.classList.toggle('kq-hidden'));
    const pause = h('button.kq-t-btn.pause', { type: 'button', 'aria-label': t('touch.pause'), 'data-testid': 'touch-pause' }, svg(I.pause));
    this.tap(pause, () => {
      this.releaseAll();
      this.deps.openPause();
    });
    // the phone (photo mode): toggles like N; while it is up, the attack button is the shutter
    const photo = btn('photo', I.photo, t('touch.photo'), ['photo']);
    const top = h('div.kq-t-top', [this.flyBtn.el, scanBtn, photo.el, btn('journal', I.journal, t('touch.journal'), ['journal']).el, btn('map', I.map, t('touch.map'), ['map']).el, pause]);
    deps.events.on('photo:open', () => this.setPhoto(true, photo.el));
    deps.events.on('photo:close', () => this.setPhoto(false, photo.el));
    this.skillBtns = ([1, 2, 3] as const).map((n) => btn(`skill${n}`, I.skill, t(`touch.skill${n}`), [`skill${n}`], h('span.kq-t-num', String(n))).el);
    const skills = h('div.kq-t-skills', this.skillBtns);
    const arc = h('div.kq-t-arc', [
      attack.el,
      this.dodgeBtn.el,
      btn('bannlicht', I.bannlicht, t('touch.bannlicht'), ['bannlicht']).el,
      btn('lock', I.lock, t('touch.lock'), ['lockOn']).el,
      btn('balm', I.balm, t('touch.balm'), ['quickUse']).el,
      shift.el,
      this.crouchBtn.el,
      this.interactBtn.el,
    ]);
    this.el = h('div.kq-touch.kq-hidden', { 'data-testid': 'touch' }, [this.stick, skills, arc, top, this.scanPop]);
    this.el.addEventListener('pointerdown', (e) => this.surfaceDown(e));
    this.el.addEventListener('pointermove', (e) => this.surfaceMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.el.addEventListener(ev, (e) => this.surfaceUp(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.rotateEl = h('div.kq-rotate', { 'data-testid': 'rotate', role: 'alert' }, [
      h('div.kq-rotate-card', [
        h('div.kq-rotate-title', t('game.title')),
        h('div.kq-rotate-icon', svg(ROTATE_SVG)),
        h('p.kq-rotate-line', t('touch.rotate')),
        h('p.kq-rotate-sub', t('touch.rotate.sub')),
      ]),
    ]);
    deps.root.append(this.el, this.rotateEl);
    // the title (and the new-game flow inside it) is not gameplay: no rotate overlay over it
    const watchTitle = () => {
      const title = deps.root.querySelector<HTMLElement>(':scope > .kq-title');
      if (title && title !== this.titleEl) {
        this.titleEl = title;
        new MutationObserver(() => this.syncRotate()).observe(title, { attributes: true, attributeFilter: ['class'] });
      }
      this.syncRotate();
    };
    new MutationObserver(watchTitle).observe(deps.root, { childList: true });
    watchTitle();
    window.addEventListener('resize', () => this.syncRotate());
    window.addEventListener('orientationchange', () => this.syncRotate());

    // auto mode: the first real touch anywhere turns the touch UI on (touch laptops)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchSeen) {
          this.touchSeen = true;
          this.refresh();
        }
      },
      { capture: true },
    );
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll());
    deps.settings.subscribe((_, key) => key === 'touchControls' && this.refresh());
    deps.hud.onPrompt = (key, text) => this.setPrompt(key, text);
    deps.events.on('player:fly', () => this.syncFly());
    deps.events.on('era:change', () => this.syncFly());
    deps.events.on('player:stance', ({ stance }) => {
      this.stance = stance;
      this.syncFly();
    });
    // abilities unlock by level (combat: skillsForLevel); a fresh game or a loaded save may change them
    for (const ev of ['level:up', 'stats:changed', 'game:start', 'save:loaded'] as const) deps.events.on(ev, () => this.syncSkills());
    // a load sets the stance without a player:stance event: read it back
    for (const ev of ['game:start', 'save:loaded'] as const) deps.events.on(ev, () => this.syncFly());
    this.refresh();
  }

  /** Touch UI on (setting + device)? */
  get active(): boolean {
    return this.wanted;
  }

  /** Boot: gameplay running and no modal on top. */
  setPlaying(on: boolean): void {
    if (this.playing === on) return;
    this.playing = on;
    if (!on) this.releaseAll();
    this.syncVisible();
  }

  private refresh(): void {
    const was = this.wanted;
    this.wanted = touchActive(this.deps.settings.state.touchControls, this.coarse, this.touchSeen);
    this.deps.input.touchMode = this.wanted;
    document.documentElement.toggleAttribute('data-kq-touch', this.wanted);
    this.deps.hud.setTouchIcons(this.wanted ? (key) => TOUCH_ICONS[touchIconFor(key)] : null);
    if (!this.wanted) this.releaseAll();
    this.syncVisible();
    this.syncFly();
    this.syncSkills();
    if (was !== this.wanted) this.onActiveChange?.(this.wanted);
  }

  /** The title screen (or its new-game flow) is up. */
  private titleUp(): boolean {
    const el = this.titleEl;
    return !!el && el.isConnected && !el.classList.contains('kq-hidden') && !el.classList.contains('fade-out');
  }

  /** Portrait phone in gameplay: the rotate overlay (M-02). */
  private syncRotate(): void {
    const on = rotateWanted({ touch: this.wanted, width: window.innerWidth, height: window.innerHeight, inGame: !this.titleUp() });
    document.documentElement.toggleAttribute('data-kq-rotate', on);
    this.rotateEl?.setAttribute('aria-hidden', String(!on));
  }

  private syncVisible(): void {
    this.syncRotate();
    this.el.classList.toggle('kq-hidden', !(this.wanted && this.playing));
    if (!(this.wanted && this.playing)) this.scanPop.classList.add('kq-hidden');
  }

  /** Photo mode: the attack button becomes the shutter, the camera button lights up. */
  private setPhoto(on: boolean, photoBtn: HTMLElement): void {
    photoBtn.classList.toggle('on', on);
    this.attackBtn.classList.toggle('shutter', on);
    this.attackBtn.replaceChildren(svg(on ? TOUCH_ICONS.shutter : TOUCH_ICONS.attack), h('i.kq-t-ring'));
    this.attackBtn.setAttribute('aria-label', t(on ? 'touch.shutter' : 'touch.attack'));
  }

  /** Hide the ability buttons not learnt yet. */
  syncSkills(): void {
    const ok = this.deps.skillUnlocked;
    this.skillBtns.forEach((el, i) => el.classList.toggle('kq-hidden', ok ? !ok((i + 1) as 1 | 2 | 3) : false));
  }

  private syncFly(): void {
    const can = this.deps.canFly();
    const fl = this.deps.flying();
    this.flyBtn.el.classList.toggle('kq-hidden', !can && !fl);
    this.flyBtn.el.classList.toggle('on', fl);
    const cr = crouchButtonMode(fl, this.deps.stance?.() ?? this.stance);
    this.crouchBtn.el.replaceChildren(svg(TOUCH_ICONS[cr.icon]));
    this.crouchBtn.el.classList.toggle('on', cr.on);
    this.crouchBtn.el.setAttribute('aria-label', t(cr.label));
    this.crouchBtn.el.setAttribute('aria-pressed', String(cr.on));
    this.dodgeBtn.el.replaceChildren(svg(fl ? TOUCH_ICONS.up : TOUCH_ICONS.dodge));
    this.dodgeBtn.el.setAttribute('aria-label', t(fl ? 'touch.up' : 'touch.dodge'));
  }

  /**
   * The HUD's prompt changed: the button that answers it lights up, and the interact button carries
   * an interact prompt's text ("Lauschen", "Untersuchen" …).
   */
  setPrompt(key: string | null, text: string | null): void {
    const icon = touchPromptIcon(key, text);
    const mine = icon === 'interact' && !!text?.trim();
    this.interactText.textContent = mine ? text! : t('touch.interact.short');
    this.interactBtn.el.classList.toggle('lit', mine);
    for (const b of this.el.querySelectorAll('.kq-t-btn.cue')) b.classList.remove('cue');
    if (icon && icon !== 'interact') this.el.querySelector(`[data-testid="touch-${icon}"]`)?.classList.add('cue');
  }

  /** A pressable button: holds its actions while the finger is down. */
  private wire(b: Btn, after?: () => void): void {
    b.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        b.el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      for (const a of b.actions) this.deps.input.press(a, true);
      this.btnHeld.set(e.pointerId, b.actions);
      b.el.classList.add('down');
    });
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      const acts = this.btnHeld.get(e.pointerId);
      if (!acts) return;
      this.btnHeld.delete(e.pointerId);
      for (const a of acts) this.deps.input.press(a, false);
      b.el.classList.remove('down');
      if (e.type === 'pointerup') swallowNextClick(b.el);
      after?.();
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.el.addEventListener(ev, up);
    b.el.addEventListener('pointermove', (e) => e.stopPropagation());
    // keyboard / screen-reader activation still works as a tap
    b.el.addEventListener('click', (e) => {
      if ((e as PointerEvent).pointerType || e.detail > 0) return;
      for (const a of b.actions) this.deps.input.press(a, true);
      setTimeout(() => b.actions.forEach((a) => this.deps.input.press(a, false)), 60);
    });
  }

  /** A button with a plain action on release. */
  private tap(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      swallowNextClick(el);
      fn();
    });
    el.addEventListener('click', (e) => {
      if (e.detail === 0) fn();
    });
  }

  private surfaceDown(e: PointerEvent): void {
    e.preventDefault();
    this.scanPop.classList.add('kq-hidden');
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    const leftZone = e.clientX < window.innerWidth * 0.42;
    if (leftZone && this.stickId === null) {
      this.stickId = e.pointerId;
      // keep the base on screen (safe areas and edges)
      const r = TOUCH.stickRadius;
      this.stickOrigin = { x: Math.max(r + 12, e.clientX), y: Math.min(window.innerHeight - r - 12, Math.max(r + 70, e.clientY)) };
      this.stick.style.left = `${this.stickOrigin.x}px`;
      this.stick.style.top = `${this.stickOrigin.y}px`;
      this.stick.classList.remove('kq-hidden');
      this.moveStick(e.clientX, e.clientY);
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  private surfaceMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.moveStick(e.clientX, e.clientY);
      return;
    }
    const last = this.looks.get(e.pointerId);
    if (!last) return;
    const d = lookDelta(e.clientX - last.x, e.clientY - last.y);
    last.x = e.clientX;
    last.y = e.clientY;
    this.deps.input.addLook(d.dx, d.dy);
  }

  private surfaceUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stick.classList.add('kq-hidden');
      this.setHeld([]);
    }
    this.looks.delete(e.pointerId);
  }

  private moveStick(x: number, y: number): void {
    const r = stickToMove(x - this.stickOrigin.x, y - this.stickOrigin.y);
    this.knob.style.transform = `translate(${r.knobX}px, ${r.knobY}px)`;
    this.stick.classList.toggle('sprint', r.actions.includes('sprint'));
    this.setHeld(r.actions);
  }

  private setHeld(next: Action[]): void {
    const { press, release } = diffHeld(this.held, next);
    for (const a of release) this.deps.input.press(a, false);
    for (const a of press) this.deps.input.press(a, true);
    this.held = next;
  }

  /** Let go of everything (modal, pause, blur, touch off). */
  releaseAll(): void {
    this.setHeld([]);
    this.stickId = null;
    this.stick.classList.add('kq-hidden');
    this.looks.clear();
    this.btnHeld.clear();
    for (const b of this.el.querySelectorAll('.down')) b.classList.remove('down');
    this.deps.input.releaseVirtual();
  }
}
