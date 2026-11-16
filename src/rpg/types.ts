/**
 * Action-RPG data shapes (docs/ACTION-RPG.md): quests, enemies, items, loot, progression, combat.
 *
 * PURE TYPES — no three.js, no DOM, no system imports. Shared by the three RPG systems
 * (src/systems/quests, combat, progression), the story engine (actions `quest`, `enemy`, `loot`,
 * `xp`, `item`; conditions `quest`, `level`), the validators (`pnpm validate`) and the content
 * files (`content/quests/*.quests.json`, schema `content/schema/quests.schema.json`).
 *
 * Ownership: the architect owns this file. Tracks may ADD optional fields (never rename or remove,
 * never make an optional field required) and must mention every addition in docs/ACTION-RPG.md.
 */
import type { Era } from '../core/era';

export type FlagValue = boolean | number | string;

// =============================================================================================
// Quests (content/quests/<nn>-<chapter>.quests.json)
// =============================================================================================

/** Lifecycle of a quest. Mirrored as `flags['quest.<id>']` by the quests system. */
export type QuestState = 'hidden' | 'offered' | 'active' | 'ready' | 'done' | 'failed';
export const QUEST_STATES: readonly QuestState[] = ['hidden', 'offered', 'active', 'ready', 'done', 'failed'];

export type QuestKind = 'main' | 'side';

/** A spoken line inside a quest (offer, progress, turn-in, history). */
export interface QuestLine {
  /** Speaker id from content/packs/speakers.pack.json (hanne, soll, jost, laub, marlene, …). */
  speaker: string;
  text: string;
  /**
   * Sources for this line (required when the speaker is a historical person, and on every
   * history line that states a fact). Same shape as pack dialogue sources.
   */
  sources?: { url: string; label: string; note?: string }[];
}

/** A history line told at turn-in: a fact in the giver's words, linked to its codex card. */
export interface QuestHistoryLine extends QuestLine {
  /** Codex fact id (cx.NN / rm.NN) this line teaches; its card unlocks with the line. */
  fact?: string;
}

/** Who offers a quest: a placed ghost (npc) or a voice (Laub in the compass, Marlene on the radio). */
export type QuestGiver = { npc: string } | { voice: 'laub' | 'marlene' };

/**
 * Who takes the quest back. 'giver' = the giver; 'auto' = completes the moment it is ready (voice
 * quests, chains inside set pieces); `{npc}` / `{voice}` = somebody else (e.g. Soll → Hanne).
 */
export type QuestTurnin = 'giver' | 'auto' | { npc: string } | { voice: 'laub' | 'marlene' };

/** Where something is: a circle in the local frame (x east, z south), optional era / room. */
export interface QuestPlace {
  x: number;
  z: number;
  /** Radius in m (zone / marker tolerance). Default 6. */
  r?: number;
  era?: Era;
  /** Palace room id (catalogue 'B03.1.eg-registratur' or full id). */
  room?: string;
}

/** Spawn of an enemy group bound to an objective (sent as `enemy:spawn` when it becomes active). */
export interface SpawnSpec {
  /** Enemy kind id (src/rpg/enemies.ts ENEMIES). */
  kind: string;
  x: number;
  z: number;
  era: Era;
  count?: number;
  /** Scatter radius around x/z (m). */
  radius?: number;
  /** Group id (default `<quest>.<objective>`). */
  group?: string;
  boss?: boolean;
  /** Difficulty tier 1..4 (default: the chapter's tier, docs §5.4). */
  tier?: number;
  /** Max distance from the spawn point before they give up (m). */
  leash?: number;
  /** Time of day the group shows in ('dusk' / 'night' only — content convention, combat decides). */
  time?: 'any' | 'dusk' | 'night';
}

export type ObjectiveType =
  | 'kill'
  | 'collect'
  | 'reach'
  | 'talk'
  | 'room'
  | 'examine'
  | 'echo'
  | 'calm'
  | 'escort'
  | 'survive'
  | 'use'
  | 'event'
  | 'manual';
export const OBJECTIVE_TYPES: readonly ObjectiveType[] = ['kill', 'collect', 'reach', 'talk', 'room', 'examine', 'echo', 'calm', 'escort', 'survive', 'use', 'event', 'manual'];

export interface QuestObjective {
  /** Unique inside the quest (a-z0-9_-). Mirrored as `flags['quest.<quest>.<id>']` = count. */
  id: string;
  type: ObjectiveType;
  /** Tracker / journal line, e.g. "Irrlichter über den Schwanenweihern bannen". */
  text_de: string;
  /** How many (kill / collect / examine …). Default 1. */
  count?: number;
  /** Bonus objective: not needed for "ready", gives `bonus_xp`. */
  optional?: boolean;
  bonus_xp?: number;
  /** Objective ids that must be complete before this one becomes active (else all run in parallel). */
  after?: string[];
  /** Hide the line until it is active. */
  hidden?: boolean;
  /** Zone / compass marker / world beacon. Required for 'reach'. */
  where?: QuestPlace;
  /** No compass marker (exploration objectives). */
  noMarker?: boolean;

  // ---- per type --------------------------------------------------------------------------
  /** kill: enemy kind (any group) … */
  enemy?: string;
  /** kill: … or only this group. */
  group?: string;
  /** kill / survive / collect (guards): spawn these when the objective becomes active. */
  spawn?: SpawnSpec[];
  /** collect / use: item id (src/rpg/items.ts or a quest file's `items`). */
  item?: string;
  /** collect: pickups placed in the world while the objective is active (one item each). */
  place?: QuestPlace[];
  /** collect: the item drops from these enemy kinds while the objective is active (chance 0..1). */
  drop?: { enemy: string; chance: number };
  /** talk / escort: npc id; talk may name a topic. */
  npc?: string;
  topic?: string;
  /** room: palace room id. */
  room?: string;
  /** examine: clue id (clue:found / clue:grant) · echo: clue id of the echo (echo:end). */
  clue?: string;
  /** calm: menagerie animal kind or id (menagerie:calmed). */
  animal?: string;
  /** escort: destination. */
  to?: QuestPlace;
  /** survive: seconds to hold out (with `spawn`). */
  seconds?: number;
  /** event: any game event (escape hatch, e.g. 'hunt:goal' with match {mode:'parforce'}). */
  event?: string;
  match?: Record<string, FlagValue>;
}

export interface QuestRewards {
  xp?: number;
  items?: { item: string; count?: number }[];
  /** Codex cards unlocked at turn-in (in addition to the history lines' facts). */
  codex?: string[];
  /** Survey skills (relief, kartograf, baumeister, roentgen, spurenleser) → `skill:grant`. */
  skills?: { id: string; tier: number }[];
  flags?: Record<string, FlagValue>;
  talentPoints?: number;
}

/** Side quests offer themselves while their chapter runs and this holds (main quests: story `quest` action). */
export interface QuestAvailability {
  /** Quests that must be done first. */
  after?: string[];
  /** A story flag that must be truthy. */
  flag?: string;
  /** Only while the player is in this era. */
  era?: Era;
  /** Minimum player level. */
  level?: number;
}

export interface QuestDef {
  /** `q.<chapter>.<name>` (chapter = prolog p | k1 … k4 | end | test). */
  id: string;
  kind: QuestKind;
  title_de: string;
  /** Journal text (1–3 sentences, the giver's request in the player's field-book voice). */
  summary_de: string;
  giver: QuestGiver;
  turnin?: QuestTurnin;
  /** Lines when the player asks the quest topic (npc) / spoken when offered (voice). */
  offer: QuestLine[];
  /** Topic label in the conversation menu (default: title). */
  topic_de?: string;
  /** Accept button label (default "Ich kümmere mich darum."). */
  accept_de?: string;
  /** Side quests: may be declined (default true for side, false for main). */
  declinable?: boolean;
  /** Lines when talking to the giver while active (not ready). */
  progress?: QuestLine[];
  /** Lines at turn-in, before the history. */
  turnin_lines?: QuestLine[];
  /** The history told at turn-in (sourced; unlocks the facts' codex cards). */
  history?: QuestHistoryLine[];
  objectives: QuestObjective[];
  rewards?: QuestRewards;
  available?: QuestAvailability;
  /** Offered automatically when this one is done. */
  next?: string;
  /** Turn-in without fanfare (memorials, grief): no XP stamp, no chime. */
  quiet?: boolean;
  /** Main era (journal label, beacon tint). */
  era?: Era;
}

/** One file per chapter. `items` declares quest / lore items local to the chapter. */
export interface QuestFile {
  $schema?: string;
  /** Story chapter id (prolog, k1 … k4, enden, test). */
  chapter: string;
  /** Test file (99-test): validated, loaded only with `?storytest`. */
  test?: boolean;
  quests: QuestDef[];
  items?: ItemDef[];
}

/** A quest topic the quests system hands to the npc system (`npc:topics`). */
export interface QuestTopic {
  quest: string;
  /**
   * 'offer' (the offer card: accept / later), 'progress', 'turnin' (the turn-in card, then the
   * first history line and the reward), 'more' ("Erzähl mehr": the rest of the history, after
   * turn-in, at the giver's own pace).
   */
  kind: 'offer' | 'progress' | 'turnin' | 'more';
  label: string;
  main: boolean;
  lines: QuestLine[];
  accept?: string;
  declinable?: boolean;
  /** turnin: the history told after `lines` (sourced; each `fact` unlocks its codex card). Added by the quests track. */
  history?: QuestHistoryLine[];
  /** offer / turnin: the quest card (title, giver, pitch, objectives, reward preview). */
  card?: QuestCard;
}

/**
 * The RPG quest card shown in the conversation (offer: Accept / Later; turn-in: "Übergeben"):
 * built by the quests system (it knows item names), drawn by the npc system.
 */
export interface QuestCard {
  title: string;
  giver: string;
  /** Short pitch (the journal summary). */
  pitch: string;
  main: boolean;
  objectives: { text: string; optional: boolean; need: number; done?: boolean }[];
  xp: number;
  items: string[];
  skills: string[];
  /** Codex cards the turn-in tells. */
  codex: number;
}

/** Marker over a giver's head / on the compass. Shape AND colour differ (colour-blind safe). */
export type GiverMark = 'offer' | 'offer-main' | 'active' | 'ready' | null;

// =============================================================================================
// Enemies (src/rpg/enemies.ts — data owned by the combat track)
// =============================================================================================

export type EnemyFamily = 'mist' | 'light' | 'hound' | 'paper' | 'shade' | 'ember' | 'stone';

/** How an enemy is undone. Never blood: everything spectral dissolves (docs §5.3). */
export type DissolveStyle = 'mist' | 'sparks' | 'smoke' | 'ash' | 'paper' | 'grit-rising' | 'fade';

export interface EnemyAttackDef {
  id: string;
  /** Wind-up (s) the player can read: pose + sound + glow (+ ground decal for area attacks). */
  telegraph: number;
  damage: number;
  /** Reach (m) for melee / radius for area / range for ranged. */
  range: number;
  kind: 'melee' | 'lunge' | 'area' | 'ranged' | 'charge' | 'summon';
  cooldown: number;
}

export interface EnemyDef {
  /** Stable id (lowercase, German): 'irrlicht', 'streuner', … Content refers to it. */
  id: string;
  name_de: string;
  plural_de: string;
  family: EnemyFamily;
  /** Eras it belongs to (content may still spawn it elsewhere; the validator warns). */
  eras: Era[];
  hp: number;
  /** Walk / run speed (m/s). */
  speed: number;
  /** Damage taken from light hits ×armor (front only for 'frontal' armor). */
  armor?: number;
  armorFrontal?: boolean;
  /** Immune to staff hits until struck by the Bannlicht (Irrlicht). */
  needsBann?: boolean;
  /** Seconds stunned by the Bannlicht (0 = immune). */
  bannStun: number;
  attacks: EnemyAttackDef[];
  xp: number;
  /** Loot table id (src/rpg/items.ts LOOT). */
  loot?: string;
  dissolve: DissolveStyle;
  boss?: boolean;
  /** Boss phases at these HP fractions (e.g. [0.66, 0.33]). */
  phases?: number[];
  /** Short field-book note (journal bestiary): fiction label always. */
  note_de: string;
}

// =============================================================================================
// Items, loot, collections (src/rpg/items.ts — data owned by the progression track)
// =============================================================================================

export type ItemKind = 'weapon' | 'charm' | 'consumable' | 'quest' | 'lore' | 'key';

export interface ItemDef {
  /** 'item.<name>' (core) or 'item.<chapter>.<name>' (declared in a quest file). */
  id: string;
  kind: ItemKind;
  name_de: string;
  /** Field-book description; lore items carry their whole text here. */
  text_de: string;
  /** Stack limit (consumables), default 1. */
  stack?: number;
  /** Collection set id (lore): 'hundemarken', 'steinzeichen', 'chronikseiten', … */
  set?: string;
  /** Effect for weapons / charms / consumables (interpreted by progression + combat). */
  effect?: ItemEffect;
  /** Fiction label for lore (true unless it states a sourced fact with `fact`). */
  fiction?: boolean;
  /** Codex fact this lore item points to. */
  fact?: string;
  /**
   * A deed (docs/ACTION-RPG.md §8.6): picking this item up in the world sets `flag` = `value`
   * (the first taken of a group wins: an already set flag stays). The epilogue reads it.
   */
  deed?: { flag: string; value: string };
}

export interface ItemEffect {
  /** weapon: base damage of a light hit. */
  damage?: number;
  /** weapon: × damage against spectral enemies (all enemies are spectral; tuning knob). */
  spectral?: number;
  /** weapon: heavy attack becomes a sweeping arc (Laubs Lot). */
  sweep?: boolean;
  /** consumable: heal HP. */
  heal?: number;
  /** consumable: restore stamina. */
  stamina?: number;
  /** consumable: Bannlicht charges / lantern oil (0..1). */
  bann?: number;
  oil?: number;
  /** consumable: thrown — stun spectral enemies in this radius (Kalkstaub). */
  burst?: number;
  /** charm / talent style modifiers: multiplicative, keyed by stat (see DerivedStats). */
  mods?: Partial<Record<keyof DerivedStats, number>>;
}

export interface LootTable {
  id: string;
  /** Rolls: each entry independently with its chance. */
  entries: { item: string; chance: number; min?: number; max?: number }[];
}

export interface CollectionSet {
  id: string;
  name_de: string;
  /** Member item ids in display order. */
  items: string[];
  /** Reward when complete. */
  reward?: QuestRewards;
}

// =============================================================================================
// Progression and combat state (system slices, see docs §6)
// =============================================================================================

export interface DerivedStats {
  maxHp: number;
  maxStamina: number;
  /** Light hit damage. */
  damage: number;
  /** Heavy (charged) multiplier. */
  heavy: number;
  /** Bannlicht: charges, cone (deg), range (m), stun multiplier. */
  bannCharges: number;
  bannAngle: number;
  bannRange: number;
  bannStun: number;
  /** Seconds per Bannlicht charge. */
  bannRecharge: number;
  /** × incoming damage (gentle / Rauhnacht / talents). */
  damageTaken: number;
  /** × stamina costs. */
  staminaCost: number;
  /** × enemy stagger (poise damage). */
  stagger: number;
  /** × healing from items. */
  healing: number;
  /** × XP gained. */
  xp: number;
  /** Extra loot chance (added). */
  loot: number;
  /** Radius (m) in which collectibles / pickups show on the compass (0 = off). */
  sense: number;
}

/** `state.systems.progression` (owner: progression). */
export interface ProgressionSlice {
  xp: number;
  level: number;
  /** Unspent talent points. */
  points: number;
  talents: Record<string, number>;
  /** item id → count (weapons and charms: 1). */
  inventory: Record<string, number>;
  equipped: { weapon: string | null; charms: string[] };
  /** Item on the quick-use key (H). */
  quick: string | null;
  /** World pickups already taken (ids), so they never come back. */
  taken: string[];
  /** Collections already rewarded. */
  completedSets: string[];
  /** (progression, additive) Codex facts that already paid their +10 XP. */
  codexXp?: string[];
  /** (progression, additive) Glowing world pickups that are out there now, by id (survive saves). */
  placed?: Record<string, PlacedPickup>;
  /** (progression, additive) Enemy drops rolled so far (seeds the next loot roll). */
  drops?: number;
  /** (progression, additive) Empty loot rolls in a row (bad-luck protection raises the next chance). */
  dry?: number;
}

/** (progression, additive) A glowing pickup in the world: the `loot:place` payload, persisted. */
export interface PlacedPickup {
  id: string;
  item: string;
  x: number;
  z: number;
  era: Era;
  count?: number;
  /** Storey hint (local height) inside the palace. */
  y?: number;
  room?: string;
  quest?: string;
  /** Rolled from an enemy's loot table (drifts towards the player, may be pruned when there are many). */
  drop?: boolean;
}

/** `state.systems.combat` (owner: combat). */
export interface CombatSlice {
  hp: number;
  stamina: number;
  bann: number;
  /** Enemy groups by id (persisted: what is left of every spawned group). */
  groups: Record<string, EnemyGroupState>;
  deaths: number;
}

export interface EnemyGroupState {
  group: string;
  kind: string;
  era: Era;
  x: number;
  z: number;
  count: number;
  /** Members already undone (never respawn unless `respawn`). */
  killed: number;
  radius?: number;
  boss?: boolean;
  tier?: number;
  leash?: number;
  quest?: string;
  objective?: string;
  /** Seconds after a full clear until the group returns (ambient packs), 0 = never. */
  respawn?: number;
  time?: 'any' | 'dusk' | 'night';
  room?: string;
  /** The pack's elite has been undone (it does not come back when the group is rebuilt). */
  eliteDown?: boolean;
}

/** `state.systems.quests` (owner: quests). */
export interface QuestSlice {
  quests: Record<string, QuestProgress>;
  /** Quest ids shown in the HUD tracker (main first; at most 3). */
  tracked: string[];
  /** Codex / journal entries the player has not opened yet ("neu" stamp). */
  unseen: string[];
  /** Enemy kinds undone so far (journal bestiary page), kind → count. Added by the quests track. */
  bestiary?: Record<string, number>;
}

export interface QuestProgress {
  state: QuestState;
  /** objective id → count. */
  counts: Record<string, number>;
  /** Game seconds (meta.playSeconds) when the state last changed. */
  t: number;
  /** The rest of the history ("Erzähl mehr") has been heard. */
  told?: boolean;
  /** Why a failed quest ended ('story' = the story moved on, 'chapter' = its chapter ended). */
  reason?: string;
}
