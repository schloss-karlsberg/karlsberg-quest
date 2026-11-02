/**
 * Keyboard + mouse input with named actions (remappable). Edge-triggered presses are queued
 * and consumed by fixed-step updates (`wasPressed`), held keys are polled (`isDown`).
 */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'prone'
  | 'fly'
  | 'up'
  | 'down'
  | 'interact'
  | 'listen'
  | 'lantern'
  | 'map'
  | 'measure'
  | 'shift'
  | 'scan0'
  | 'scan1'
  | 'scan2'
  | 'scan3'
  | 'journal'
  | 'pause'
  /** Röntgenblick (point cloud under the canopy), tools system. */
  | 'xray'
  /** Baumeister: plan sheet / confidence view, tools system. */
  | 'plans'
  /** Keyboard look (play without a mouse). */
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC'],
  prone: ['KeyX'],
  fly: ['KeyF'],
  up: ['Space'],
  down: ['KeyC', 'ControlLeft'],
  interact: ['Mouse0'],
  listen: ['KeyE'],
  lantern: ['KeyL'],
  map: ['KeyM'],
  measure: ['KeyR'],
  shift: ['KeyQ'],
  scan0: ['Digit0', 'Backquote'],
  scan1: ['Digit1'],
  scan2: ['Digit2'],
  scan3: ['Digit3'],
  journal: ['KeyJ', 'Tab'],
  pause: ['Escape', 'KeyP'],
  xray: ['KeyV', 'Digit4'],
  plans: ['KeyB'],
  lookLeft: ['Comma', 'Numpad4'],
  lookRight: ['Period', 'Numpad6'],
  lookUp: ['PageUp', 'Numpad8'],
  lookDown: ['PageDown', 'Numpad2'],
};

/** Actions that may share a key (C: crouch on foot, down while flying). */
export const SHARED_KEYS: [Action, Action][] = [['crouch', 'down']];

/** Actions the player can rebind in the settings, in display order. */
export const REBINDABLE: Action[] = [
  'forward', 'back', 'left', 'right', 'sprint', 'crouch', 'prone', 'fly', 'up', 'down',
  'listen', 'lantern', 'shift', 'map', 'measure', 'xray', 'plans', 'journal',
  'lookLeft', 'lookRight', 'lookUp', 'lookDown',
];

/**
 * Effective bindings: defaults with the player's per-action overrides (`settings.bindings`, full
 * code lists). Pure; tested.
 */
export function effectiveBindings(overrides: Partial<Record<string, string[]>> = {}): Record<Action, string[]> {
  const out = structuredClone(DEFAULT_BINDINGS);
  for (const a of Object.keys(out) as Action[]) {
    const o = overrides[a];
    if (Array.isArray(o)) out[a] = o.filter((c) => typeof c === 'string');
  }
  return out;
}

/**
 * Add `code` to `action` and take it away from every other action (except the allowed shared
 * pairs). Returns the new override map (only the actions that differ from the defaults).
 */
export function bindKey(overrides: Partial<Record<string, string[]>>, action: Action, code: string): Record<string, string[]> {
  const eff = effectiveBindings(overrides);
  const shared = (a: Action, b: Action) => SHARED_KEYS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const a of Object.keys(eff) as Action[]) {
    if (a !== action && !shared(a, action)) eff[a] = eff[a].filter((c) => c !== code);
  }
  if (!eff[action].includes(code)) eff[action] = [...eff[action], code];
  return diffBindings(eff);
}

/** Only the actions whose codes differ from the defaults. */
export function diffBindings(eff: Record<Action, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of Object.keys(eff) as Action[]) {
    const d = DEFAULT_BINDINGS[a];
    const e = eff[a];
    if (e.length !== d.length || e.some((c, i) => c !== d[i])) out[a] = [...e];
  }
  return out;
}

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  private readonly down = new Set<string>();
  private readonly pressedCodes = new Set<string>();
  private mdx = 0;
  private mdy = 0;
  /** False while a menu/modal has focus: gameplay input is ignored. */
  enabled = true;
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  constructor(private readonly canvas: HTMLElement) {
    const on = (t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.listeners.push([t, type, fn]);
    };
    on(window, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (isTyping(ev.target)) return;
      if (!this.enabled && ev.code !== 'Escape') return;
      if (!ev.repeat) this.pressedCodes.add(ev.code);
      this.down.add(ev.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(ev.code) && this.enabled) ev.preventDefault();
    });
    on(window, 'keyup', (e) => this.down.delete((e as KeyboardEvent).code));
    on(window, 'blur', () => this.down.clear());
    on(document, 'mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      const ev = e as MouseEvent;
      this.mdx += ev.movementX;
      this.mdy += ev.movementY;
    });
    on(canvas, 'mousedown', (e) => {
      if (!this.enabled) return;
      const code = `Mouse${(e as MouseEvent).button}`;
      this.pressedCodes.add(code);
      this.down.add(code);
    });
    on(window, 'mouseup', (e) => this.down.delete(`Mouse${(e as MouseEvent).button}`));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* not allowed (headless, iframe) */
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Apply the player's overrides (settings.bindings) on top of the defaults. */
  setBindings(overrides: Partial<Record<string, string[]>>): void {
    this.bindings = effectiveBindings(overrides);
  }

  isDown(a: Action): boolean {
    if (!this.enabled) return false;
    return this.bindings[a].some((c) => this.down.has(c));
  }

  /** True if the action was pressed since the last `endStep()`. */
  wasPressed(a: Action): boolean {
    if (!this.enabled && a !== 'pause') return false;
    return this.bindings[a].some((c) => this.pressedCodes.has(c));
  }

  /** Accumulated mouse movement since the last call (pixels). */
  takeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mdx, dy: this.mdy };
    this.mdx = this.mdy = 0;
    return r;
  }

  /** Called by the loop after every fixed update: forget edge presses. */
  endStep(): void {
    this.pressedCodes.clear();
  }

  /** Simulate input (tests, debug hooks). */
  simulate(code: string, down: boolean): void {
    if (down) {
      this.pressedCodes.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
  }
}

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
