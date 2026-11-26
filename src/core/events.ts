import type { Era } from './era';
import type { Stance } from '../player/stance';

/**
 * Typed event map. Feature systems ADD their own events by declaration merging, in their own
 * folder (no edit here needed):
 *
 *   declare module '../../core/events' {
 *     interface GameEvents { 'hunt:spotted': { by: string; x: number; z: number } }
 *   }
 *
 * Naming: '<domain>:<what>' in lower case. Payloads are plain serialisable objects.
 */
export interface GameEvents {
  /** Title screen dismissed, audio unlocked, player has control. */
  'game:start': { resumed: boolean };
  /** Returning to the title screen, before the session autosave. */
  'game:title': {};
  /** Pause menu opened/closed (also when pointer lock is lost). */
  'game:pause': { paused: boolean };
  /** Era switched (terrain, sky, buildings already updated when this fires). */
  'era:change': { from: Era; to: Era };
  /** Terrain relief scan mode changed: 0 normal, 1 hillshade, 2 local relief, 3 VAT-like. */
  'scan:mode': { mode: number };
  'player:stance': { stance: Stance; previous: Stance };
  'player:fly': { flying: boolean };
  /** Player position, view and stance have been restored on the ground. */
  'player:restored': {};
  /** Fired once per footstep (fixed-step driven). `surface` = ground class name. */
  'player:step': { x: number; z: number; surface: string; running: boolean };
  /** Player teleported (debug hook or a feature moving the player). */
  'player:teleport': { x: number; z: number };
  /** A save was written to localStorage. */
  'save:written': { slot: string; reason: string };
  /** A save was loaded into the state store. */
  'save:loaded': { slot: string };
  'settings:change': { key: string };
  /** The camera was taken over (a cinematic, kq.setCamera) or given back to the rig. */
  'camera:override': { active: boolean };
  /**
   * A scene asks the world to hold still (the party, later other set pieces): beam / ring world
   * markers hide and survey points do not get eingemessen while any reason is on (src/core/quiet.ts).
   * Every `on: true` is paired with an `on: false` of the same reason.
   */
  'world:quiet': { on: boolean; reason: string };
  /** Free-form UI notification (toast). */
  'ui:toast': { text: string; ms?: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private readonly handlers = new Map<EventName, Set<Handler<any>>>();
  private readonly anyHandlers = new Set<(name: EventName, payload: unknown) => void>();

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => this.off(name, fn);
  }

  once<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends EventName>(name: K, fn: Handler<K>): void {
    this.handlers.get(name)?.delete(fn);
  }

  /** Listen to every event (debug log, replay recorder). */
  onAny(fn: (name: EventName, payload: unknown) => void): () => void {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (set) {
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[events] handler for '${name}' threw`, err);
        }
      }
    }
    for (const fn of this.anyHandlers) fn(name, payload);
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
