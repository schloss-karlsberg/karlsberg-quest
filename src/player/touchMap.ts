import type { Action } from './input';

/**
 * Pure touch input mapping (phase 1 of docs/PERF-MOBILE-RESEARCH.md §B), tested in
 * tests/touchMap.test.ts. The DOM side lives in src/ui/touch.ts; it feeds `Input.press()` and
 * `Input.addLook()` with what these functions decide, so no feature system knows about touch.
 */

/** "Touch-Steuerung" setting: Auto follows the device, An / Aus force it. */
export type TouchSetting = 'auto' | 'on' | 'off';
export const TOUCH_SETTINGS: readonly TouchSetting[] = ['auto', 'on', 'off'];

export const TOUCH = {
  /** Stick radius in CSS px (the knob's travel). */
  stickRadius: 56,
  /** Below this share of the radius the stick does nothing. */
  deadZone: 0.22,
  /** A direction counts once its axis passes this share (8-way with diagonals). */
  axis: 0.38,
  /** Pushed to the rim: sprint. */
  sprintAt: 0.92,
  /** Drag-look: CSS px of finger travel → mouse-look px (then the mouse sensitivity applies). */
  lookScale: 1.8,
  /** Longer than this is a hold (Wuchthieb charge, Lauschen, Epoche zurück). Matches combat's 0.45 s. */
  holdMs: 450,
} as const;

export interface StickResult {
  /** Movement actions to hold. */
  actions: Action[];
  /** 0..1 of the radius (after clamping). */
  magnitude: number;
  /** Knob offset in px, clamped to the radius. */
  knobX: number;
  knobY: number;
}

/** Stick offset (finger − origin, screen px, y down) → held movement actions. */
export function stickToMove(dx: number, dy: number, radius: number = TOUCH.stickRadius): StickResult {
  const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1;
  const knobX = dx * k;
  const knobY = dy * k;
  const magnitude = radius > 0 ? Math.min(1, len / radius) : 0;
  const actions: Action[] = [];
  if (magnitude >= TOUCH.deadZone && len > 0) {
    const nx = dx / len;
    const ny = dy / len;
    if (ny < -TOUCH.axis) actions.push('forward');
    if (ny > TOUCH.axis) actions.push('back');
    if (nx < -TOUCH.axis) actions.push('left');
    if (nx > TOUCH.axis) actions.push('right');
    // sprint only while going forward-ish (running backwards is not a thing)
    if (magnitude >= TOUCH.sprintAt && ny < -TOUCH.axis) actions.push('sprint');
  }
  return { actions, magnitude, knobX, knobY };
}

/** Which actions to press and release to get from `prev` to `next` held sets. */
export function diffHeld(prev: readonly Action[], next: readonly Action[]): { press: Action[]; release: Action[] } {
  return { press: next.filter((a) => !prev.includes(a)), release: prev.filter((a) => !next.includes(a)) };
}

/** Finger travel → look px for `Input.addLook` (the player's mouse sensitivity / invert apply after). */
export function lookDelta(dx: number, dy: number, scale: number = TOUCH.lookScale): { dx: number; dy: number } {
  return { dx: dx * scale, dy: dy * scale };
}

/** Is the touch UI on? Auto: a coarse primary pointer, or a touch seen this session. */
export function touchActive(setting: TouchSetting | undefined, coarse: boolean, touchSeen: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return coarse || touchSeen;
}

export function isTouchSetting(v: unknown): v is TouchSetting {
  return v === 'auto' || v === 'on' || v === 'off';
}

/**
 * The touch button that stands for a prompt's key label (what the HUD shows instead of the key
 * cap): 'E' → interact … Unknown labels fall back to the interact button (every in-world prompt
 * is answered with it).
 */
export type TouchIcon = 'interact' | 'attack' | 'dodge' | 'bannlicht' | 'shift' | 'fly' | 'journal' | 'map' | 'balm' | 'lock' | 'down' | 'relief' | 'pause';
const KEY_ICON: Record<string, TouchIcon> = {
  E: 'interact',
  F: 'fly',
  Q: 'shift',
  G: 'bannlicht',
  'MAUS RECHTS': 'bannlicht',
  RMB: 'bannlicht',
  'MAUS LINKS': 'attack',
  LMB: 'attack',
  KLICK: 'attack',
  K: 'attack',
  LEERTASTE: 'dodge',
  SPACE: 'dodge',
  J: 'journal',
  M: 'map',
  H: 'balm',
  TAB: 'lock',
  C: 'down',
  X: 'down',
  '1': 'relief',
  '2': 'relief',
  '3': 'relief',
  ESC: 'pause',
  P: 'pause',
};

export function touchIconFor(key: string): TouchIcon {
  const k = key.trim().toUpperCase();
  return KEY_ICON[k] ?? KEY_ICON[k.split(/\s*[/·]\s*/)[0] ?? ''] ?? 'interact';
}
