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
 *  - skills  : skill:unlocked (story / chronik emit skill:grant)
 *  - tools   : measure:done
 *  - menagerie: menagerie:* (the escaped animals of 1789 / 1793-07; story spawns them)
 *
 * Action-RPG layer (docs/ACTION-RPG.md §9; data shapes in src/rpg/types.ts):
 *  - quests     : quest:offered/accepted/progress/objective/ready/completed/failed, npc:topics,
 *                 npc:marker, codex:unlocked (also), and the requests enemy:spawn/despawn,
 *                 loot:place/clear, xp:grant, item:grant for quest content
 *  - npc        : quest:accept, quest:turnin, quest:told (the player's answers in a conversation)
 *  - story      : quest:command (story action `quest`), and the same requests as quests
 *                 (story actions `enemy`, `loot`, `xp`, `item`)
 *  - combat     : enemy:spawned/killed/cleared/aggro, combat:hit/state/bann, player:damaged/
 *                 healed/died, boss:phase, menagerie:calmed, and player:caught {by:'combat'}
 *  - progression: xp:gain, level:up, item:pickup/use, loot:drop, equip:change, talent:learned,
 *                 stats:changed
 *  Requests are imperative (enemy:spawn, xp:grant), facts are past tense (enemy:killed, xp:gain).
 *
 * Integration rules (see docs/ARCHITECTURE.md §12):
 *  - The Q key belongs to the story (anchor flags shift.allowed/target/x/z/r, hold Q in the past
 *    to return); fx performs the transition. fx reads Q itself only without a story system.
 *  - The caught screen belongs to the story; hunt/fx hand over at player:caught.
 *  - The pack is bound to its era: hunt stops on era:change; the story re-issues threat:configure.
 *  - Dialogue triggered by echo:* events is played by the Chronik, not the story runner.
 */
import type { Era } from '../core/era';
import type { DerivedStats, GiverMark, QuestTopic } from '../rpg/types';

/** 'combat': the player's Lebenskraft ran out (combat emits player:caught {by:'combat'}). */
export type ThreatKind = 'pack' | 'fire' | 'oblivion' | 'combat';

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
    'dialogue:say': {
      speaker: string;
      text: string;
      ms?: number;
      fiction?: boolean;
      id?: string;
      /** 'now': a tutorial for the action at hand cuts in (default: the line queues). */
      priority?: 'now' | 'normal' | 'low';
      /** A story Condition (story/types.ts): once it holds, the line is no longer worth saying. */
      until?: unknown;
      /** Not bound to the current beat (quest turn-ins teach history: a beat change never drops them). */
      keep?: boolean;
      /**
       * History / lore (a turn-in moment, a long remark): held while a fight is on, dropped when it
       * waited too long (story/dialogue/queue.ts). Long lines without it count as lore in a fight.
       */
      lore?: boolean;
    };
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
    /** mode: the pack mode that blew it (patrol / drive / finale / parforce); dialogue triggers may match it. */
    'hunt:horn': { signal: 'search' | 'found' | 'lost' | 'call-off'; x: number; z: number; mode?: string };
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
    'player:caught': { by: ThreatKind; soft?: boolean; family?: string; /** undone by a boss (combat) */ boss?: boolean };

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
    /** A memory's line comes up (subtitle shown): set pieces stage what the line is about. */
    'echo:line': { id: string; line: string; i: number; dur: number };
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
    /**
     * npc/story → chronik: discover a clue as if examined (nouns, facts, flags). No card, unless
     * `card` (story `grant {card: true}`: e.g. the field-station items, the tablet in the prologue).
     */
    'clue:grant': { id: string; card?: boolean };
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

    // ---- skills / survey tools (owner: skills, tools) -------------------------------------
    /**
     * Raise a skill to `level` (never lowers it): story/chronik emit it, the skills system writes
     * `state.skills[skill]` and shows the unlock card (+ a Laub line once Laub talks). Skill ids:
     * relief, kartograf, baumeister, roentgen, spurenleser (see src/systems/skills/logic.ts).
     * `quiet` skips the card (loads, debug).
     */
    'skill:grant': { skill: string; level: number; quiet?: boolean };
    /** The skills system has shown a new level (after state.skills changed, by any writer). */
    'skill:unlocked': { skill: string; level: number };
    /**
     * A measurement (R, Kartograf 3) was completed. a/b in the local frame (y = height), distance
     * = 3D length in m. `building` / `room` are set when both ends lie on/in the same palace
     * footprint / catalogue room (e.g. 'KB-B06', 'B06.1.bildergalerie').
     */
    'measure:done': {
      a: { x: number; y: number; z: number };
      b: { x: number; y: number; z: number };
      distance: number;
      horizontal: number;
      rise: number;
      building?: string;
      room?: string;
    };

    // =====================================================================================
    // Action-RPG layer (docs/ACTION-RPG.md §9). Plain, serialisable payloads only.
    // =====================================================================================

    // ---- quests (owner: quests) -----------------------------------------------------------
    /** A quest became available at its giver (marker "!") — or was spoken by a voice giver. */
    'quest:offered': { id: string; giver: string; main: boolean };
    /** The player took the quest (conversation "annehmen", voice giver, or story `quest start`). */
    'quest:accepted': { id: string };
    /** An objective counter changed. */
    'quest:progress': { id: string; objective: string; count: number; need: number };
    /** An objective is complete (optional ones too). */
    'quest:objective': { id: string; objective: string; optional: boolean };
    /** Every required objective is complete: turn in (marker "?"), or completes at once ('auto'). */
    'quest:ready': { id: string };
    /** Turned in: rewards granted, history told. xp = the quest's XP reward (before multipliers). */
    'quest:completed': { id: string; xp: number; main: boolean };
    'quest:failed': { id: string; reason: string };
    /**
     * quests → npc: the quest topics this NPC offers now (replaces the previous list for that npc;
     * an empty list removes them). The npc system shows them first in the conversation menu.
     */
    'npc:topics': { npc: string; topics: QuestTopic[] };
    /** quests → npc: the glyph over an NPC's head ("!" offer, "!" ringed main offer, "?" ready, grey "?" active). */
    'npc:marker': { npc: string; mark: GiverMark };
    /**
     * quests → npc: an escorted NPC walks after the player (follow) or stays where it is (false).
     * The npc system moves the figure and keeps its placement (slice) up to date. Added by the
     * quests track (escort objectives, docs/ACTION-RPG.md §9.2).
     */
    'npc:follow': { npc: string; follow: boolean };

    // ---- npc → quests: the player's answers in a conversation ------------------------------
    'quest:accept': { id: string; npc: string };
    'quest:decline': { id: string; npc: string };
    'quest:turnin': { id: string; npc: string };
    /** "Erzähl mehr" heard after a turn-in (the rest of the history; the topic goes away). */
    'quest:told': { id: string; npc: string };
    /** quests → anyone: a deed was done (a thing taken in the world set its flag, §8.6). */
    'quest:deed': { flag: string; value: string; item: string };

    // ---- story → quests (story action `quest`) ---------------------------------------------
    /**
     * offer: make it available at its giver · start: accept at once · progress: add `n` to an
     * objective (manual objectives) · complete: grant rewards now (cut-scenes) · fail · reset.
     */
    'quest:command': { op: 'offer' | 'start' | 'progress' | 'complete' | 'fail' | 'reset'; id: string; objective?: string; n?: number };

    // ---- requests to combat (owners: quests, story) ----------------------------------------
    /**
     * Spawn (or re-declare) an enemy group. Idempotent by `group`: the combat system keeps every
     * group in its slice (what is left of it survives saves) and materialises it only in its era,
     * within ~90 m (or in its `room`). Kills of a group never come back unless `respawn` > 0.
     */
    'enemy:spawn': {
      group: string;
      kind: string;
      x: number;
      z: number;
      era: Era;
      count?: number;
      radius?: number;
      boss?: boolean;
      tier?: number;
      leash?: number;
      respawn?: number;
      time?: 'any' | 'dusk' | 'night';
      room?: string;
      quest?: string;
      objective?: string;
      /** Pack overrides (src/rpg/types.ts EnemyGroupState). */
      escorts?: { kind: string; n: number }[];
      wave?: { kind: string; n: number }[];
      aggro?: boolean;
      veiled?: boolean;
    };
    /** Remove a group without a fight ('*' = every group). */
    'enemy:despawn': { group: string };

    // ---- combat (owner: combat) -------------------------------------------------------------
    'enemy:spawned': { id: string; group: string; kind: string; x: number; z: number; era: Era; boss: boolean };
    /**
     * An enemy is undone (dissolved — never "dead" on screen). by: what finished it.
     * quest/objective echo the group's spawn request.
     */
    'enemy:killed': {
      id: string;
      group: string;
      kind: string;
      x: number;
      z: number;
      era: Era;
      boss: boolean;
      by: 'light' | 'heavy' | 'bann' | 'item' | 'env';
      quest?: string;
      objective?: string;
      /** A pack's escort (group `<pack>+escort`): XP, never a quest kill. */
      escort?: boolean;
    };
    /** Every member of a group is undone. */
    'enemy:cleared': { group: string; kind: string };
    /** An enemy noticed / lost the player. */
    'enemy:aggro': { id: string; kind: string; on: boolean };
    /** A boss crossed a phase threshold (phase 1 = start). */
    'boss:phase': { id: string; kind: string; phase: number; hp: number };
    /** Any hit landed (for sound / fx / tutorials). target 'enemy' or 'player'. */
    'combat:hit': { target: 'enemy' | 'player'; id?: string; kind?: string; damage: number; heavy: boolean; x: number; z: number };
    /** In / out of a fight (barks stay quiet, music swells, sprint costs Atem). */
    'combat:state': { inCombat: boolean };
    /** The Bannlicht flared: a cone from x/z along yaw (radians, player convention). hunt / menagerie react. */
    'combat:bann': { x: number; z: number; yaw: number; range: number; angle: number };
    'player:damaged': { amount: number; hp: number; max: number; by: string; x?: number; z?: number };
    'player:healed': { amount: number; hp: number; max: number; by: string };
    /** Lebenskraft at 0: combat then emits player:caught {by:'combat'} (the story's curtain + wake). */
    'player:died': { by: string };
    /** A menagerie animal was calmed / caught (never hurt): the cassowary tired out, the jaguar driven home. */
    'menagerie:calmed': { id: string; animal: MenagerieAnimal };

    // ---- requests to progression (owners: quests, story, combat) ----------------------------
    /** Grant XP (quest rewards, kills, codex cards, bonus objectives). */
    'xp:grant': { amount: number; reason: string; x?: number; z?: number };
    /** Put items into the inventory (quest rewards, story). quiet: no toast. */
    'item:grant': { item: string; count?: number; reason?: string; quiet?: boolean };
    /** Place a glowing pickup in the world (quest collect objectives, lore, story `loot`). Idempotent by id. */
    'loot:place': { id: string; item: string; x: number; z: number; era: Era; count?: number; y?: number; room?: string; quest?: string };
    /** Remove pickups placed by id, or all of a quest. */
    'loot:clear': { id?: string; quest?: string };

    // ---- progression (owner: progression) ---------------------------------------------------
    'xp:gain': { amount: number; total: number; reason: string };
    'level:up': { level: number; points: number };
    /** An item entered the inventory (world pickup, loot, grant). id = the pickup's id, if any. */
    'item:pickup': { item: string; count: number; total: number; id?: string; x?: number; z?: number };
    /** A consumable was used (quick-use H or the inventory). */
    'item:use': { item: string };
    /** Enemy loot dropped on the ground (pickups follow as loot:place). */
    'loot:drop': { x: number; z: number; era: Era; items: { item: string; count: number }[]; from?: string };
    'equip:change': { slot: 'weapon' | 'charm'; item: string | null };
    'talent:learned': { talent: string; rank: number };
    /** Derived stats changed (level, talents, equipment, gentle mode). */
    'stats:changed': { stats: DerivedStats };
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
  /**
   * Inside the palace: a walkable room (catalogue or full id). x/z default to the room's centre
   * and the figure stands on that room's storey (interiors `world.roomAnchor`).
   */
  room?: string;
  /** Storey hint (local height, m): the figure stands on the floor at most a step above it. */
  y?: number;
  /** 'kneel': down on one knee, leaning forward (Jost by his hounds after W8). */
  pose?: 'kneel';
}

export {};
