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
  /** Keyboard look (play without a mouse): ← / → turn, Bild↑ / Bild↓ tilt (src/player/keyTurn.ts). */
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown'
  // ---- Action-RPG (docs/ACTION-RPG.md §3): read by combat / progression / quests ----
  /** Hieb (tap) / Wuchthieb (hold ≥ 0.45 s, release). Shares LMB with `interact` (measuring wins). */
  | 'attack'
  /** Bannlicht: the lantern flares in a cone. */
  | 'bannlicht'
  /** Ausweichrolle. Shares Space with `up` (up only matters while flying / to stand up). */
  | 'dodge'
  /** Quick-use item (Kräuterbalsam …). */
  | 'quickUse'
  /** Journal on the Ausrüstung tab. */
  | 'inventory'
  /** Abilities (combat variety pass, §4.2): Ausfall (level 2), Erdstoß (4), Wirbel (6). T / Z(Y) / U: one row, free keys. */
  | 'skill1'
  | 'skill2'
  | 'skill3'
  /** Third-person action camera: soft lock-on (Tab / middle mouse): lock the best target, cycle, release. */
  | 'lockOn'
  /** Switch between the over-the-shoulder camera and first person (V is taken: Röntgenblick). */
  | 'cameraMode';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
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
  journal: ['KeyJ'],
  pause: ['Escape', 'KeyP'],
  xray: ['KeyV', 'Digit4'],
  plans: ['KeyB'],
  // ← / → turn the view (§3.4: a fallback to mouse look for automation and accessibility); A / D strafe
  lookLeft: ['ArrowLeft', 'Comma', 'Numpad4'],
  lookRight: ['ArrowRight', 'Period', 'Numpad6'],
  lookUp: ['PageUp', 'Numpad8'],
  lookDown: ['PageDown', 'Numpad2'],
  attack: ['Mouse0', 'KeyK'],
  bannlicht: ['Mouse2', 'KeyG'],
  dodge: ['Space'],
  quickUse: ['KeyH'],
  inventory: ['KeyI'],
  skill1: ['KeyT'],
  skill2: ['KeyY'],
  skill3: ['KeyU'],
  lockOn: ['Tab', 'Mouse1'],
  cameraMode: ['F5'],
};

/**
 * Actions that may share a key: C (crouch on foot, down while flying), LMB (measure click while
 * measuring, else attack), Space (dodge on foot, up while flying / to stand up from crouch, prone).
 */
export const SHARED_KEYS: [Action, Action][] = [
  ['crouch', 'down'],
  ['interact', 'attack'],
  ['up', 'dodge'],
];

/** Actions the player can rebind in the settings, in display order. */
export const REBINDABLE: Action[] = [
  'forward', 'back', 'left', 'right', 'sprint', 'crouch', 'prone', 'fly', 'up', 'down',
  'listen', 'lantern', 'shift', 'map', 'measure', 'xray', 'plans', 'journal',
  'attack', 'bannlicht', 'dodge', 'quickUse', 'inventory', 'skill1', 'skill2', 'skill3', 'lockOn', 'cameraMode',
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
  /** Accumulated wheel notches since the last `takeWheel()` (+ = towards you / zoom out). */
  private wheel = 0;
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
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'F5'].includes(ev.code) && this.enabled) ev.preventDefault();
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
      // the middle button is the lock-on: no auto-scroll cursor over the game
      if ((e as MouseEvent).button === 1) e.preventDefault();
    });
    // the wheel zooms the third-person camera
    on(
      canvas,
      'wheel',
      (e) => {
        if (!this.enabled) return;
        const ev = e as WheelEvent;
        const px = ev.deltaMode === 1 ? ev.deltaY * 40 : ev.deltaMode === 2 ? ev.deltaY * 800 : ev.deltaY;
        this.wheel += Math.max(-3, Math.min(3, px / 100));
        ev.preventDefault();
      },
      { passive: false },
    );
    on(window, 'mouseup', (e) => this.down.delete(`Mouse${(e as MouseEvent).button}`));
    // the right button is the Bannlicht: no context menu over the game
    on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** A lock request is in flight (a second one in the same moment makes the first one fail). */
  private lockPending = false;

  requestLock(): void {
    if (this.locked || this.lockPending) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.then === 'function') {
        this.lockPending = true;
        p.then(
          () => (this.lockPending = false),
          () => (this.lockPending = false),
        );
      }
    } catch {
      /* not allowed (headless, iframe) */
      this.lockPending = false;
    }
  }

  /**
   * True from a game-side `releaseLock()` until the next pointer-lock change has been read with
   * `takeSelfRelease()`: the unlock that follows is the game's own (a modal opened), not the player's
   * Escape, so it must not open the pause menu once that modal has closed again.
   */
  private selfRelease = false;

  releaseLock(): void {
    if (!this.locked) return;
    this.selfRelease = true;
    document.exitPointerLock();
  }

  /** Read (and clear) whether the last unlock came from `releaseLock()`. */
  takeSelfRelease(): boolean {
    const r = this.selfRelease;
    this.selfRelease = false;
    return r;
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

  /** Wheel notches since the last call (+ = scrolled towards you: zoom out). */
  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
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
