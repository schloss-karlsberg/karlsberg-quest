/**
 * Story schema (content/story/*.story.json). Pure data, validated by `validateStories`
 * (src/systems/story/validate.ts), which `pnpm validate` and the vitest suite run.
 *
 * A story file is one chapter: an ordered list of BEATS. A beat runs its `enter` actions, then
 * waits until its `complete` condition holds, runs `exit`, and moves to `next` (default: the
 * following beat). When the last beat completes, the chapter is complete, `unlocks` chapters are
 * unlocked and `next` chapter starts.
 *
 *   { "chapter": "prolog", "order": 0, "title_de": "Vermessung", "start": "p1",
 *     "beats": [ { "id": "p1", "enter": [ { "do": "say", "speaker": "marlene", "text": "…" } ],
 *                  "complete": { "enter": { "x": 819, "z": -875, "r": 25 } } } ] }
 */
import type { Era } from '../../core/era';
import type { ThreatConfig, ThreatKind } from '../contracts';

export type FlagValue = boolean | number | string;

/** Where the player is put when a chapter starts or a beat is resumed after being caught. */
export interface Checkpoint {
  x: number;
  z: number;
  /** Degrees, 0 = north, 90 = east (like the debug hooks). */
  yaw?: number;
  era?: Era;
}

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

/** Player inside a circle (local frame), optionally only in an era. */
export interface EnterCond {
  enter: { x: number; z: number; r: number; era?: Era };
}
/** Leave a circle (e.g. "walk away from the station"). */
export interface LeaveCond {
  leave: { x: number; z: number; r: number };
}
/**
 * An event fired while the beat is active (latched: once seen it stays true for the beat, also
 * across save/load). `match` = payload fields that must be equal; `gte`/`lte` = numeric bounds
 * (e.g. { "event": "fire:progress", "gte": { "t": 0.5 } }). `times` = how often (default 1).
 */
export interface EventCond {
  event: string;
  match?: Record<string, FlagValue>;
  gte?: Record<string, number>;
  lte?: Record<string, number>;
  times?: number;
}
/** A state flag is set (truthy), or equals `eq`. */
export interface FlagCond {
  flag: string;
  eq?: FlagValue;
}
/** Seconds of simulated time since the beat started. */
export interface TimerCond {
  timer: number;
}
/** Current era. */
export interface EraCond {
  era: Era;
}
/** A clue / noun / item is in the inventory (state based, so it also holds after a reload). */
export interface HaveCond {
  have: { clue?: string; noun?: string; item?: string };
}
/**
 * Confirmed Chronik entries: at least `n` confirmed entries in `case`, or (with `prefix`) across
 * all cases whose entry id starts with the prefix (robust against case id naming).
 */
export interface ConfirmedCond {
  confirmed: { case?: string; prefix?: string; n: number };
}
/** All fact entries of a case confirmed (needs the case in ContentDB) or `chronik:case-complete` seen. */
export interface CaseCompleteCond {
  caseComplete: string;
}
/** Relief scan mode at least `n` (1 hillshade, 2 local relief, 3 VAT). */
export interface ScanCond {
  scan: number;
}
/** 1840 map overlay on. */
export interface MapCond {
  map: true;
}
/** Player stance (e.g. lying flat for the finale). */
export interface StanceCond {
  stance: 'stand' | 'crouch' | 'prone';
}
/** The lantern is lit (player stats). */
export interface LanternCond {
  lantern: boolean;
}
/** A hub item was used (inside the field station overlay) while the beat ran. */
export interface HubCond {
  hub: HubItem;
}
export interface AllCond {
  all: Condition[];
}
export interface AnyCond {
  any: Condition[];
}
export interface NotCond {
  not: Condition;
}
/** Never completes by itself (only via `kq.story.skip()` / a chapter switch). */
export interface ManualCond {
  manual: true;
}
/**
 * The player stands in a walkable palace room (interiors): catalogue id ('B06.1.bildergalerie'),
 * full id ('KB-B06/B06.1.bildergalerie') or building id ('KB-B06'). Reads the flags
 * 'interior.room' / 'interior.building' kept by the interiors system (and `room:enter/leave`).
 * Also true when a matching room was entered while the beat ran (latched).
 */
export interface RoomCond {
  room: string;
}
/** An NPC was talked to (flag `talked.<chapter>.<npc>[.<topic>]`, set by the npc system). */
export interface TalkedCond {
  talked: { npc: string; chapter?: string; topic?: string };
}
/**
 * A reading (LESART) was chosen in the Chronik: `reading` = the entry's story flag
 * (CaseEntry.flag, e.g. "flag.k1_lohn") or the entry id; `eq` = noun id / variant ("will_nicht").
 */
export interface ReadingCond {
  reading: string;
  eq?: string;
}
/** A story meter (oil, smoke, vergessen, custom) is at least `gte` / at most `lte` (0..1) or full. */
export interface MeterCond {
  meter: { id: string; gte?: number; lte?: number; full?: boolean };
}
/** A choice was answered (any option, or the option with `option` key / index). */
export interface ChosenCond {
  chosen: string;
  option?: string | number;
}
/** Seconds since the chapter started (game time). */
export interface ChapterTimerCond {
  chapterTimer: number;
}

export type Condition =
  | EnterCond
  | LeaveCond
  | EventCond
  | FlagCond
  | TimerCond
  | EraCond
  | HaveCond
  | ConfirmedCond
  | CaseCompleteCond
  | ScanCond
  | MapCond
  | StanceCond
  | LanternCond
  | HubCond
  | AllCond
  | AnyCond
  | NotCond
  | ManualCond
  | RoomCond
  | TalkedCond
  | ReadingCond
  | MeterCond
  | ChosenCond
  | ChapterTimerCond
  | SpeedCond
  | QuestCond
  | LevelCond;

/**
 * Action-RPG (docs/ACTION-RPG.md §9.3): a quest's state (default 'done'), or an objective's count.
 * Read from the flags the quests system mirrors: `quest.<id>` = state, `quest.<id>.<objective>` = count.
 *   { "quest": { "id": "q.k1.lohn" } }                          → turned in
 *   { "quest": { "id": "q.k1.lohn", "state": "active" } }       → exactly that state ('active' also
 *                                                                  matches 'ready': still running)
 *   { "quest": { "id": "q.k1.lohn", "objective": "zettel", "gte": 1 } }
 */
export interface QuestCond {
  quest: { id: string; state?: 'offered' | 'active' | 'ready' | 'done' | 'failed'; objective?: string; gte?: number };
}
/** The player's level is at least `level` (flag `rpg.level`, mirrored by progression). */
export interface LevelCond {
  level: number;
}

/**
 * The player's horizontal speed (m/s, flying excluded) is at least `gte` / at most `lte`.
 * Walking ≈ 3.2, running (Shift) ≈ 6.2: `{ "speed": { "gte": 4.5 } }` = running.
 */
export interface SpeedCond {
  speed: { gte?: number; lte?: number };
}

export const CONDITION_KEYS = [
  'enter',
  'leave',
  'event',
  'flag',
  'timer',
  'era',
  'have',
  'confirmed',
  'caseComplete',
  'scan',
  'map',
  'stance',
  'lantern',
  'hub',
  'all',
  'any',
  'not',
  'manual',
  'room',
  'talked',
  'reading',
  'meter',
  'chosen',
  'chapterTimer',
  'speed',
  'quest',
  'level',
] as const;

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

export type HubItem = 'chronik' | 'radio' | 'shelf' | 'map' | 'bed' | 'drawer';

interface ActionBase {
  /** Seconds to wait before this action (relative to the previous action of the same list). */
  delay?: number;
  /** Skip when the beat is re-entered after being caught / after loading (default: shift & teleport skip). */
  onResume?: boolean;
}

/** A spoken line. Either inline (`speaker` + `text`) or a ContentDB dialogue line (`line`). */
export interface SayAction extends ActionBase {
  do: 'say';
  /** Stable line id (bible ids, e.g. "laub.p.intro"); lines with an id are spoken only once. */
  id?: string;
  speaker?: string;
  text?: string;
  line?: string;
  /** Display time override (ms). */
  ms?: number;
  /** Label: fiction (default true for fictional speakers) / echo of a memory. */
  echo?: boolean;
  /** Repeat even if already said. */
  repeat?: boolean;
  /** Drop the line (waiting or showing) once this holds: the objective it explains is done. */
  until?: Condition;
  /**
   * Era-dependent text: the entry for the current era wins, else `text`. Placeholders in any text:
   * {Name}/{name} (player name), {jahre:1793} (years since 1793 in words; fallback "über
   * zweihundert" when the clock's year is implausible), {jahr} (current year).
   */
  text_by_era?: Partial<Record<Era, string>>;
  /**
   * A running joke: with an `id`, the n-th time this action runs speaks `variants[n]` (counted per
   * id in the story slice); after the last variant it stays silent, or repeats the last with
   * `repeat`. `text` is not needed.
   */
  variants?: string[];
}
export interface ObjectiveAction extends ActionBase {
  do: 'objective';
  /** null / omitted clears the objective. */
  text?: string | null;
  x?: number;
  z?: number;
  id?: string;
}
/** Extra ThreatConfig fields (declared by the feature systems, e.g. pack mode/target) pass through. */
export interface ThreatAction extends ActionBase, Omit<ThreatConfig, 'kind' | 'active'> {
  do: 'threat';
  kind: ThreatKind;
  active: boolean;
  intensity?: number;
  center?: { x: number; z: number };
  radius?: number;
  seconds?: number;
}
export interface FlagAction extends ActionBase {
  do: 'flag';
  set: Record<string, FlagValue | null>;
}
export interface ShiftAction extends ActionBase {
  do: 'shift';
  to: Era;
  instant?: boolean;
  reason?: string;
}
/** Bind Q to an anchor: sets the shift.* flags the era-shift feature reads. `null` closes it. */
export interface AnchorAction extends ActionBase {
  do: 'anchor';
  to: Era | null;
  x?: number;
  z?: number;
  r?: number;
}
export interface SkillAction extends ActionBase {
  do: 'skill';
  id: string;
  tier: number;
  /** Toast text (German). */
  toast?: string;
}
export interface GiveAction extends ActionBase {
  do: 'give';
  clue?: string;
  noun?: string;
  item?: string;
  /** Clue kind for the clue:found payload (default from ContentDB or 'document'). */
  kind?: string;
  toast?: string;
}
export interface ToastAction extends ActionBase {
  do: 'toast';
  text: string;
  ms?: number;
}
export interface TeleportAction extends ActionBase {
  do: 'teleport';
  x: number;
  z: number;
  yaw?: number;
}
/** Full-screen title card (chapter openings, cliffhangers). */
export interface CardAction extends ActionBase {
  do: 'card';
  title: string;
  sub?: string;
  note?: string;
  seconds?: number;
}
/** A positional / UI sound, always with a caption for players who cannot rely on sound. */
export interface SoundAction extends ActionBase {
  do: 'sound';
  sound: 'howl' | 'horn' | 'radio' | 'beep' | 'compass' | 'frost' | 'match';
  x?: number;
  z?: number;
  caption?: string;
  /** Horn signal: anblasen (one long), fährte (two short), verloren (falling), sammeln (three long). */
  signal?: 'anblasen' | 'faehrte' | 'verloren' | 'sammeln';
}
/** Times of day a `look` action can set (`dawn`: Morgengrauen, chapter 4's end and the endings). */
export type LookTime = 'day' | 'dawn' | 'dusk' | 'night';
/**
 * Time of day for the present-day era (field station evenings). With `era` (a past era) the time
 * of day of that memory instead (e.g. 1789 dusk / night in the Karlslust); `day` restores its preset.
 */
export interface LookAction extends ActionBase {
  do: 'look';
  time: LookTime;
  era?: Era;
}
/** Prompt line at the bottom of the HUD (null clears). */
export interface PromptAction extends ActionBase {
  do: 'prompt';
  key?: string | null;
  text?: string | null;
}
/** Generic cue for other features (`story:cue` event): set pieces, camera moves … */
export interface CueAction extends ActionBase {
  do: 'cue';
  id: string;
  data?: Record<string, FlagValue>;
}
/** Open the Chronik board (emits chronik:open). */
export interface ChronikAction extends ActionBase {
  do: 'chronik';
  caseId?: string;
}
export interface UnlockAction extends ActionBase {
  do: 'unlock';
  chapter: string;
}
/** Open the final choice scene (endings). */
export interface EndingAction extends ActionBase {
  do: 'ending';
}
export interface AutosaveAction extends ActionBase {
  do: 'autosave';
}
/**
 * A choice. `modal` (default): a field-book card that pauses the game, picked with a click or
 * keys 1–n. `modal: false`: an inline card in the HUD (the game runs on) resolved by the options'
 * `when` conditions (e.g. the gate in ch. 2: lantern lit = "leuchten", dark = "dunkel").
 * After `seconds` (game time) the `fallback` option is taken. The answer is stored as
 * `choice.<id>` = option key (or index) plus the option's `set` flags; `then` actions run.
 */
export interface ChoiceOption {
  label: string;
  set: Record<string, FlagValue>;
  /** Stable key (stored in `choice.<id>`; default: the index). */
  key?: string;
  /** Inline choices: the option is taken as soon as this holds. */
  when?: Condition;
  /** Actions after this option was chosen. */
  then?: Action[];
}
export interface ChoiceAction extends ActionBase {
  do: 'choice';
  id: string;
  prompt: string;
  options: ChoiceOption[];
  seconds?: number;
  fallback?: number;
  modal?: boolean;
  /** Small handwritten note under the prompt. */
  note?: string;
}
/** Place / remove a ghostly NPC (npc system). */
export interface NpcAction extends ActionBase {
  do: 'npc';
  op: 'spawn' | 'despawn';
  npc: string;
  x?: number;
  z?: number;
  era?: Era;
  yaw?: number;
  /** Chapter of the npc:talk lines (default: the running chapter). */
  chapter?: string;
  topics?: string[];
  mood?: 'warm' | 'eerie' | 'neutral';
  /**
   * A walkable palace room (catalogue id 'B01.2.og-festsaal' or full id): x/z default to its
   * centre and the ghost stands on that room's storey (upper floors too).
   */
  room?: string;
}
/**
 * Chapter meters. `oil`: the lantern burns `seconds` (hunt's lantern: lit + refilled; empty =
 * the memory lets go → back to the station). `smoke`: the fire's smoke meter (fx fire threat).
 * `vergessen`: the Steinfraß / oblivion meter (fx). Any other id: a story gauge that fills over
 * `seconds` of game time (paused during echoes and conversations; `still` fills faster while
 * standing still). Full → `full` (default 'return': curtain with `text`, back to the station).
 * `lossless`: being caught / returned loses nothing (bible 4.6). `active: false` stops it.
 */
export interface MeterAction extends ActionBase {
  do: 'meter';
  id: string;
  active: boolean;
  seconds?: number;
  label?: string;
  full?: 'return' | 'caught' | 'none';
  /** Curtain line when full ('return'). */
  text?: string;
  lossless?: boolean;
  /** Custom gauges: fill this much faster while the player stands still. */
  still?: number;
  /** fx threats (smoke, vergessen): forwarded intensity / center / radius. */
  intensity?: number;
  center?: { x: number; z: number };
  radius?: number;
}
/** Play a Chronik echo (emits echo:play; its lines are the pack's echo:start lines). */
export interface EchoAction extends ActionBase {
  do: 'echo';
  id: string;
}
/** A memorial place: no barks, no jokes (circle and/or room). `active: false` lifts it. */
export interface MemorialAction extends ActionBase {
  do: 'memorial';
  id: string;
  active?: boolean;
  x?: number;
  z?: number;
  r?: number;
  era?: Era;
  room?: string;
}
/** Readings: fill every unset reading flag (of `cases`, default all) with 'offen' ("Leer lassen"). */
export interface ReadingsAction extends ActionBase {
  do: 'readings';
  fill: 'offen';
  cases?: string[];
}
/** Grant a clue the Chronik way (nouns, codex, flags) — e.g. a talk outside the npc system. */
export interface GrantAction extends ActionBase {
  do: 'grant';
  clue: string;
  /** Show the Chronik's field-book card (as if examined), e.g. for the field-station items. */
  card?: boolean;
}

// ---- Action-RPG (docs/ACTION-RPG.md §9.3): requests to the quests / combat / progression systems ----

/** Quest control (`quest:command`): offer at its giver, start (accept now), progress a manual objective, complete, fail, reset. */
export interface QuestAction extends ActionBase {
  do: 'quest';
  op: 'offer' | 'start' | 'progress' | 'complete' | 'fail' | 'reset';
  id: string;
  objective?: string;
  n?: number;
}
/**
 * Spawn / remove an enemy group (`enemy:spawn` / `enemy:despawn`). kind = src/rpg/enemies.ts id.
 * x/z default to the player, era to the current one. Idempotent by `group`.
 */
export interface EnemyAction extends ActionBase {
  do: 'enemy';
  op: 'spawn' | 'despawn';
  group: string;
  kind?: string;
  x?: number;
  z?: number;
  era?: Era;
  count?: number;
  radius?: number;
  boss?: boolean;
  tier?: number;
  leash?: number;
  /** Seconds after a full clear until the group returns (ambient packs). */
  respawn?: number;
  time?: 'any' | 'dusk' | 'night';
  room?: string;
}
/** Place a glowing pickup (`loot:place`); `clear: true` removes it (`loot:clear`). */
export interface LootAction extends ActionBase {
  do: 'loot';
  id: string;
  item?: string;
  x?: number;
  z?: number;
  era?: Era;
  count?: number;
  room?: string;
  clear?: boolean;
}
/** Grant XP (`xp:grant`). */
export interface XpAction extends ActionBase {
  do: 'xp';
  amount: number;
  reason?: string;
}
/** Put an RPG item into the inventory (`item:grant`), e.g. the Messstab in the prologue. */
export interface ItemAction extends ActionBase {
  do: 'item';
  item: string;
  count?: number;
  quiet?: boolean;
}

export type Action =
  | QuestAction
  | EnemyAction
  | LootAction
  | XpAction
  | ItemAction
  | SayAction
  | ObjectiveAction
  | ThreatAction
  | FlagAction
  | ShiftAction
  | AnchorAction
  | SkillAction
  | GiveAction
  | ToastAction
  | TeleportAction
  | CardAction
  | SoundAction
  | LookAction
  | PromptAction
  | CueAction
  | ChronikAction
  | UnlockAction
  | EndingAction
  | AutosaveAction
  | ChoiceAction
  | NpcAction
  | MeterAction
  | EchoAction
  | MemorialAction
  | ReadingsAction
  | GrantAction;

export const ACTION_KINDS = [
  'say',
  'objective',
  'threat',
  'flag',
  'shift',
  'anchor',
  'skill',
  'give',
  'toast',
  'teleport',
  'card',
  'sound',
  'look',
  'prompt',
  'cue',
  'chronik',
  'unlock',
  'ending',
  'autosave',
  'choice',
  'npc',
  'meter',
  'echo',
  'memorial',
  'readings',
  'grant',
  'quest',
  'enemy',
  'loot',
  'xp',
  'item',
] as const;

/** Reaction inside a beat or chapter: when `when` becomes true, run `do` once. */
export interface Reaction {
  id: string;
  when: Condition;
  do: Action[];
  /** Fires on every rising edge of `when` (default: once per beat / chapter run). */
  repeat?: boolean;
  /** With `repeat`: not again within this many seconds (game time) of the last firing. */
  cooldown?: number;
}

export interface Beat {
  id: string;
  title_de?: string;
  /** Placeholder beat (skeleton chapters): shown with a "Platzhalter" label. */
  placeholder?: boolean;
  enter?: Action[];
  complete: Condition;
  exit?: Action[];
  /** Next beat id (default: the following beat in the list; none = chapter complete). */
  next?: string;
  /** After being caught, resume at this beat (default: this beat). */
  checkpoint?: string;
  /**
   * Where the player comes to after being caught / a meter returning them while this beat runs
   * (the resumed beat's `wake` wins, else this one's, else the chapter checkpoint). `text` replaces
   * the curtain's "Du wachst in der Feldstation auf" line.
   */
  wake?: Checkpoint & { text?: string };
  on?: Reaction[];
}

export interface StoryFile {
  $schema?: string;
  chapter: string;
  order: number;
  title_de: string;
  /** Small handwritten line on the title card, e.g. "heute · ein Novembernachmittag". */
  sub_de?: string;
  era?: Era;
  /** Placeholder/skeleton chapter. */
  placeholder?: boolean;
  /** Test chapter (e2e / examples): not loaded unless the URL has `?storytest`. */
  test?: boolean;
  start: string;
  /** Where the chapter starts (teleport + era) when chosen at the map table. */
  checkpoint?: Checkpoint;
  /** Chapter that starts automatically when this one completes. */
  next?: string;
  /** Chapters unlocked when this one completes (next is unlocked implicitly). */
  unlocks?: string[];
  beats: Beat[];
  /** Reactions active during the whole chapter. */
  on?: Reaction[];
  /** Endings data (only in the endings file). */
  epilogue?: EpilogueData;
}

// ---------------------------------------------------------------------------------------------
// Endings / epilogue
// ---------------------------------------------------------------------------------------------

export type EndingId = 'museum' | 'burn' | 'keep';

/** A reading (LESART) sentence slot of the epilogue. */
export interface EpilogueReading {
  id: string;
  /** Chronik entry id holding the reading (any case). */
  entry?: string;
  /** Fallback flag names (e.g. "flag.k1_lohn", "k1_lohn"). */
  flags?: string[];
  /** Noun id → variant key (e.g. "n.r_will_nicht" → "will_nicht"). Unmapped ids: strip "n.r_"/"n.". */
  nouns?: Record<string, string>;
  /** Variant key → sentence. Must contain "offen" (no reading chosen). */
  text: Record<string, string>;
  /** A sentence always appended after this slot. */
  always?: string;
  /**
   * Deeds (docs/ACTION-RPG.md §8.6): the first whose flag holds (equals `eq` when given) tells this
   * slot's sentence; none → the variant / "offen" logic above. Quest deeds read the mirrored quest
   * state (`quest.<id>` = "done").
   */
  deeds?: { flag: string; eq?: string | number | boolean; text: string }[];
}

export interface EpilogueData {
  intro: Record<EndingId, string>;
  readings: EpilogueReading[];
  /** Saved object (flag.k3_objekt) per ending. */
  object: { flags: string[]; text: Record<string, Record<EndingId, string>> };
  outro: Record<EndingId, string>;
  /** Small handwritten coda per ending (may be empty). */
  coda?: Partial<Record<EndingId, string>>;
}
