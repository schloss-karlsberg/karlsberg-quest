import type { EventBus } from './events';
import { type GameState, type GameStateStore, Store, deserializeState, serializeState } from './state';

/** All localStorage keys of this game start with this prefix (shared origin with the explorer). */
export const STORAGE_PREFIX = 'kq.';
export const SAVE_KEY = (slot: string) => `${STORAGE_PREFIX}save.v1.${slot}`;
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings.v1`;

/** The subset of the Web Storage API we use (lets tests inject a Map-backed fake). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

export function defaultStorage(): KeyValueStorage {
  try {
    const ls = globalThis.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStorage(); // private mode / blocked storage: play without persistence
  }
}

export type GraphicsLevel = 'low' | 'medium' | 'high';

export interface Settings {
  mouseSensitivity: number; // 0.2 .. 3, 1 = default
  invertY: boolean;
  /** Invert horizontal mouse look. */
  invertX: boolean;
  gentleMode: boolean;
  reducedMotion: boolean;
  /**
   * No bright full-screen flashes (era-shift brass flash, fire collapse flashes, flicker). Read by
   * every system that flashes; the post pass also scales `uFlash` down (render/post.ts).
   */
  reducedFlash: boolean;
  /** High-contrast HUD: solid backings, larger crosshair, thicker outlines (CSS `html[data-kq-contrast]`). */
  highContrast: boolean;
  /** Colour-blind safe palettes for the relief scan (blue ↔ orange instead of blue ↔ red). */
  colorblind: boolean;
  subtitleSize: 's' | 'm' | 'l' | 'xl';
  /** Opacity of the subtitle backing 0..1. */
  subtitleBg: number;
  volume: { master: number; music: number; sfx: number; ambience: number; voice: number };
  fov: number;
  /**
   * Camera (docs/ACTION-RPG.md §3): 'third' = over-the-shoulder action camera with the surveyor in
   * view (default since playtest round 8), 'first' = the old first-person view with the staff.
   */
  cameraMode: 'third' | 'first';
  /** Third-person boom length the player zoomed to with the wheel (m). */
  cameraZoom: number;
  /** Graphics preset (render/quality.ts). Unset = 'high' with auto-downgrade. */
  graphics?: GraphicsLevel;
  /** Render resolution scale of the 3D scene, 0.5 .. 1 (UI stays sharp). */
  resolutionScale: number;
  /** „Bildrate“: frames per second at most, 30 / 60 / 0 = unbegrenzt (core/loop.ts `frameCap`). */
  fpsCap: number;
  /** „Energiesparen“: 30 fps, pixel ratio ≤ 1, no AO, no water reflection (render/quality.ts `POWER_SAVE`). */
  powerSave: boolean;
  /** The one-time battery hint („Energiesparen“ toast) was shown. */
  powerHint?: boolean;
  /** Lower the preset by itself when the frame time stays high. */
  autoQuality: boolean;
  /** Show the performance overlay (also F3). */
  perfHud: boolean;
  /** Remapped actions: key codes that replace the default keys of that action (player/input.ts `effectiveBindings`). */
  bindings: Record<string, string[]>;
}

export function defaultSettings(): Settings {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    mouseSensitivity: 1,
    invertY: false,
    gentleMode: false,
    invertX: false,
    reducedMotion: reduced,
    reducedFlash: reduced,
    highContrast: typeof matchMedia === 'function' && matchMedia('(prefers-contrast: more)').matches,
    colorblind: false,
    subtitleSize: 'm',
    subtitleBg: 0.62,
    volume: { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 0.9 },
    fov: 80,
    cameraMode: 'third',
    cameraZoom: 3.6,
    resolutionScale: 1,
    fpsCap: 60,
    powerSave: false,
    autoQuality: true,
    perfHud: false,
    bindings: {},
  };
}

export class SettingsStore extends Store<Settings> {
  constructor(private readonly storage: KeyValueStorage) {
    const base = defaultSettings();
    let loaded: Partial<Settings> = {};
    try {
      const raw = storage.getItem(SETTINGS_KEY);
      if (raw) loaded = JSON.parse(raw) as Partial<Settings>;
    } catch {
      /* ignore corrupt settings */
    }
    super({ ...base, ...loaded, volume: { ...base.volume, ...(loaded.volume ?? {}) }, bindings: { ...(loaded.bindings ?? {}) } });
    this.subscribe((s) => {
      try {
        this.storage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch {
        /* quota */
      }
    });
  }
}

/**
 * Save slots in localStorage. `autosave(reason)` is the API features call at meaningful moments
 * (era shift, clue confirmed); it is throttled so it can be called freely.
 */
export class SaveManager {
  private lastAuto = -Infinity;
  /** Minimum ms between autosaves (forced saves ignore it). */
  minIntervalMs = 5000;
  /** Disable all writes (e.g. e2e screenshots, `?nosave`). */
  enabled = true;
  /** Reasons that hold autosaves back (a cinematic plays); see `hold`. */
  private readonly holds = new Set<string>();
  /** An autosave asked for while held: written when the last hold ends. */
  private heldReason: { reason: string; force: boolean } | null = null;

  constructor(
    private readonly store: GameStateStore,
    private readonly storage: KeyValueStorage,
    private readonly events?: EventBus,
    private readonly now: () => number = () => Date.now(),
  ) {}

  has(slot = 'auto'): boolean {
    return this.storage.getItem(SAVE_KEY(slot)) !== null;
  }

  save(slot = 'auto', reason = 'manual'): boolean {
    if (!this.enabled) return false;
    const s = this.store.mutable;
    s.meta.savedAt = new Date(this.now()).toISOString();
    try {
      this.storage.setItem(SAVE_KEY(slot), serializeState(s));
    } catch (err) {
      console.warn('[save] write failed', err);
      return false;
    }
    this.events?.emit('save:written', { slot, reason });
    return true;
  }

  /**
   * Hold autosaves back while `reason` is on (a cinematic: the save never holds a half-played shot).
   * The last autosave asked for meanwhile is written when the last hold ends. Manual saves still write.
   */
  hold(reason: string, on: boolean): void {
    if (on) {
      this.holds.add(reason);
      return;
    }
    if (!this.holds.delete(reason) || this.holds.size > 0 || !this.heldReason) return;
    const h = this.heldReason;
    this.heldReason = null;
    this.autosave(h.reason, h.force);
  }

  get held(): boolean {
    return this.holds.size > 0;
  }

  /** Throttled save to the 'auto' slot. Returns true if written. */
  autosave(reason: string, force = false): boolean {
    if (this.holds.size > 0) {
      this.heldReason = { reason, force: force || this.heldReason?.force === true };
      return false;
    }
    const t = this.now();
    if (!force && t - this.lastAuto < this.minIntervalMs) return false;
    this.lastAuto = t;
    return this.save('auto', reason);
  }

  /** Load a slot into the store. Returns false when the slot is empty or unreadable. */
  load(slot = 'auto'): boolean {
    const raw = this.storage.getItem(SAVE_KEY(slot));
    if (!raw) return false;
    let s: GameState;
    try {
      s = deserializeState(raw);
    } catch (err) {
      console.warn('[save] unreadable save, ignoring', err);
      return false;
    }
    this.store.replace(s, 'load');
    this.events?.emit('save:loaded', { slot });
    return true;
  }

  /** Read a slot without loading it (null when empty or unreadable). */
  peek(slot = 'auto'): GameState | null {
    const raw = this.storage.getItem(SAVE_KEY(slot));
    if (!raw) return null;
    try {
      return deserializeState(raw);
    } catch {
      return null;
    }
  }

  delete(slot = 'auto'): void {
    this.storage.removeItem(SAVE_KEY(slot));
  }
}
