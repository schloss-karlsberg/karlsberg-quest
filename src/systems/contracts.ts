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
 *  - interiors: room:enter, room:leave
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

    /** Any threat got the player. story handles the return to the field station. */
    'player:caught': { by: ThreatKind };

    // ---- chronik (owner: chronik) ---------------------------------------------------------
    'clue:found': { id: string; kind: string };
    'noun:learned': { id: string };
    'echo:start': { id: string };
    'echo:end': { id: string };
    'chronik:batch': { caseId: string; correct: boolean; confirmed: string[] };
    'chronik:case-complete': { caseId: string };
    'codex:unlocked': { factId: string };

    // ---- round 2: NPCs, barks, story meters (owners noted per event) ------------------------
    /** story → npc: place a ghostly NPC (era: only visible in that era; chapter: whose lines). */
    'npc:spawn': NpcPlacement;
    /** story → npc: remove an NPC ('*' = all). */
    'npc:despawn': { npc: string };
    /**
     * npc: the player asked an NPC about a topic (greet / <topic> / bye). The npc system plays the
     * dialogue lines with trigger { event: 'npc:talk', npc, chapter, topic, step? } itself.
     */
    'npc:talk': { npc: string; chapter: string; topic: string };
    /** npc: a conversation opened / closed (barks stay quiet meanwhile). */
    'npc:conversation': { npc: string; open: boolean };
    /** npc → barks: the player lingers near an NPC (bark:npc-near lines). */
    'bark:npc-near': { npc: string; era: string };
    /** npc/story → chronik: discover a clue as if examined (nouns, facts, flags; no card). */
    'clue:grant': { id: string };
    /** story → barks: a memorial place where nobody jokes (bible: Rondell 1785, Festsaal W5). */
    'memorial:set': { id: string; active: boolean; x?: number; z?: number; r?: number; era?: string; room?: string };
    /** story → hunt: light / douse the lantern (oil timer meters), optionally refilled first. */
    'lantern:request': { lit: boolean; refill?: boolean };

    // ---- interiors (owner: interiors) -----------------------------------------------------
    /**
     * The player stepped into / out of a walkable palace room. roomId = catalogue id
     * ('B06.1.bildergalerie'), id = full id ('KB-B06/B06.1.bildergalerie'), building = 'KB-B06'.
     * Mirrored in the flags 'interior.room' / 'interior.building' ('' outside).
     */
    'room:enter': { roomId: string; building: string; id: string; name: string };
    'room:leave': { roomId: string; building: string; id: string };
  }
}

/** A ghostly NPC placed by the story (`npc` action). */
export interface NpcPlacement {
  npc: string;
  x: number;
  z: number;
  /** Visible only in this era (default: the era when spawned). */
  era?: string;
  /** Degrees, 0 = north, 90 = east. */
  yaw?: number;
  /** Chapter whose npc:talk lines apply (default: the running story chapter). */
  chapter?: string;
  /** Optional explicit topic order (default: every topic of the chapter's npc:talk lines). */
  topics?: string[];
  /** Override the roster mood: warm (Hanne) / eerie / neutral. */
  mood?: 'warm' | 'eerie' | 'neutral';
}

export {};
