/**
 * Cross-feature contract: events that more than one feature system emits or listens to.
 *
 * Feature systems (hunt, fx, chronik, story) are built in parallel; they talk ONLY through these
 * events and `ctx.state`. Add feature-private events in your own folder via declaration merging;
 * add an event here only if another feature needs it (and keep payloads plain/serialisable).
 *
 * Ownership (who EMITS; anyone may listen):
 *  - story   : objective:set, threat:configure, shift:request, dialogue:say, story:*, hub:*, chronik:open
 *  - fx      : shift:begin, shift:midpoint, shift:done, fire:*, oblivion:*
 *  - hunt    : hunt:*, lantern:*, player:caught (by 'pack')
 *  - chronik : clue:found, noun:learned, chronik:batch, chronik:case-complete, codex:unlocked, echo:*
 *  - fx also emits player:caught (by 'fire' | 'oblivion')
 *  - menagerie: menagerie:* (the escaped animals of 1789 / 1793-07; story spawns them)
 *
 * Integration rules (see docs/ARCHITECTURE.md §12):
 *  - The Q key belongs to the story (anchor flags shift.allowed/target/x/z/r, hold Q in the past
 *    to return); fx performs the transition. fx reads Q itself only without a story system.
 *  - The caught screen belongs to the story; hunt/fx hand over at player:caught.
 *  - The pack is bound to its era: hunt stops on era:change; the story re-issues threat:configure.
 *  - Dialogue triggered by echo:* events is played by the Chronik, not the story runner.
 */
import type { Era } from '../core/era';

export type ThreatKind = 'pack' | 'fire' | 'oblivion';

/** The escaped animals of the Karlsberg menagerie (codex cx.12). */
export type MenagerieAnimal = 'cassowary' | 'dromedary' | 'jaguar';

export interface ThreatConfig {
  kind: ThreatKind;
  active: boolean;
  /** 0..1 difficulty within the current beat (gentle mode / Rauhnacht scale this further). */
  intensity?: number;
  /** Optional area the threat is bound to (local frame). */
  center?: { x: number; z: number };
  radius?: number;
  /** Seconds until the threat peaks (fire collapse, oil / oblivion timer). */
  seconds?: number;
}

declare module '../core/events' {
  interface GameEvents {
    // ---- story / hub (owner: story) -------------------------------------------------------
    /** Current objective; x/z adds a compass marker. null text clears it. */
    'objective:set': { text: string | null; x?: number; z?: number; id?: string };
    /** Turn a threat on/off for the current beat. */
    'threat:configure': ThreatConfig;
    /** Ask the fx system to perform an era shift with the transition effect. */
    'shift:request': { to: Era; reason?: string; instant?: boolean };
    /** Show a spoken line (subtitle + portrait). speaker = content speaker id. */
    'dialogue:say': { speaker: string; text: string; ms?: number; fiction?: boolean; id?: string };
    'story:chapter': { id: string };
    'story:beat': { chapter: string; beat: string };
    'story:ending': { id: 'museum' | 'burn' | 'keep' };
    'hub:enter': Record<string, never>;
    'hub:leave': Record<string, never>;
    /** Open the Chronik board (optionally on a case). */
    'chronik:open': { caseId?: string };

    // ---- fx (owner: fx) -------------------------------------------------------------------
    'shift:begin': { from: Era; to: Era };
    /** Era has just been switched under cover of the effect. */
    'shift:midpoint': { from: Era; to: Era };
    'shift:done': { from: Era; to: Era };
    'fire:room': { roomId: string; state: 'smoke' | 'burning' | 'collapsed' };
    'fire:progress': { t: number };
    'oblivion:progress': { t: number };

    // ---- hunt (owner: hunt) ---------------------------------------------------------------
    /** 0 calm … 1 hunting you. */
    'hunt:alert': { level: number; state: 'calm' | 'suspicious' | 'searching' | 'chasing' };
    'hunt:horn': { signal: 'search' | 'found' | 'lost' | 'call-off'; x: number; z: number };
    'lantern:toggle': { lit: boolean };
    'lantern:oil': { oil: number };
    'lantern:empty': Record<string, never>;

    /**
     * W8 finale at the kennel (pack mode 'finale'): 'gathered' (circle closed), 'returned' (ran
     * off, faded back into the circle), 'calmed' (lay flat with the light: hounds lie down),
     * 'faded' (the last eyes went out, the horn is silent — the beat may end).
     */
    'hunt:finale': { outcome: 'gathered' | 'returned' | 'calmed' | 'faded' };

    /**
     * Any threat got the player. story handles the return to the field station.
     * soft: brought home without loss (Ch. 4 drive: "Die Meute hat dich heimgebracht").
     */
    'player:caught': { by: ThreatKind; soft?: boolean };

    // ---- menagerie (owner: menagerie; story emits spawn / clear) ---------------------------
    /**
     * Put an escaped animal into the current era at x/z (local frame). heading in radians
     * (player-yaw convention), count for a group (dromedaries), id to address / clear it later.
     * Also accepted as story action `{"do":"cue","id":"menagerie:spawn","data":{animal,x,z,…}}`.
     */
    'menagerie:spawn': { animal: MenagerieAnimal; x: number; z: number; id?: string; heading?: number; count?: number };
    /** Remove one animal (id) or all of them. */
    'menagerie:clear': { id?: string };

    // ---- chronik (owner: chronik) ---------------------------------------------------------
    'clue:found': { id: string; kind: string };
    'noun:learned': { id: string };
    'echo:start': { id: string };
    'echo:end': { id: string };
    'chronik:batch': { caseId: string; correct: boolean; confirmed: string[] };
    'chronik:case-complete': { caseId: string };
    'codex:unlocked': { factId: string };
  }
}

export {};
