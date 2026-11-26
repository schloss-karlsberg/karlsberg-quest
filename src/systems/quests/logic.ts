/**
 * The quest state machine (pure: no DOM, no three.js, no ctx). Unit-tested headless in
 * tests/quests.test.ts; the quests system (./index.ts) wires it to the game's events, HUD and
 * conversations.
 *
 *   hidden → offered → active → ready → done      (or failed; reset → hidden)
 *
 * Every change is mirrored into the story flags (`quest.<id>` = state, `quest.<id>.<objective>` =
 * count; the story's `quest` condition reads them, story/engine.ts questHolds) and announced with
 * the events of src/systems/contracts.ts (quest:offered / accepted / progress / objective / ready /
 * completed / failed) plus the requests enemy:spawn / despawn, loot:place / clear, xp:grant,
 * item:grant, skill:grant and codex:unlocked.
 *
 * Objectives run in parallel unless `after` names others that must be complete first; an objective
 * becomes "active" the moment its `after` list is complete, and only then does it spawn its enemies
 * (`spawn` → enemy:spawn with group / quest / objective) and place its pickups (`place` →
 * loot:place). `optional` objectives are not needed for "ready" and pay `bonus_xp`.
 */
import { allOf, isOneOf, numberRecord } from '../../core/saved';
import type { Era } from '../../core/era';
import type { GameEvents } from '../../core/events';
import type { CombatSlice, EnemyGroupState, FlagValue, ItemDef, QuestDef, QuestObjective, QuestPlace, QuestProgress, QuestRewards, QuestSlice, QuestState, QuestTopic, GiverMark, ProgressionSlice, SpawnSpec } from '../../rpg/types';
import { isCleared } from '../../rpg/enemy-groups';
import '../contracts';
import type { MenagerieSlice } from '../menagerie';

export type QuestDefIn = QuestDef & { chapter: string };

/** Story-spawned menagerie animals by calm ID, for saves whose spawn record was cleared. */
const STORY_ANIMALS: Readonly<Record<string, string>> = { kasuar: 'cassowary', 'k3.jaguar': 'jaguar' };

export interface QuestEnv {
  /** The story flags (mutable: the book writes its mirror here). */
  flags: Record<string, FlagValue>;
  /** state.codex.facts (mutable: turn-ins push the facts they unlock). */
  codex: string[];
  /** The current save's menagerie, including animals calmed before a quest opens. */
  readonly menagerie?: MenagerieSlice;
  emit<K extends keyof GameEvents>(name: K, payload: GameEvents[K]): void;
  /** Game seconds (meta.playSeconds) for QuestProgress.t. */
  now(): number;
  /** 0..1, deterministic in tests (drop rolls). */
  rng(): number;
}

/** Where the player is (reach / escort / survive objectives). */
export interface QuestWhere {
  x: number;
  z: number;
  era: Era;
  /** Palace room (catalogue id or full id), '' outside. */
  room?: string;
}

/** Actual payout for the HUD notice. */
export interface QuestPayout {
  id: string;
  title: string;
  xp: number;
  items: { item: string; count: number }[];
  /** Codex facts unlocked by this turn-in (new ones only). */
  codex: string[];
  skills: { id: string; tier: number }[];
  quiet: boolean;
  main: boolean;
}

/**
 * Difficulty tier of a chapter's ordinary enemies when a spawn names none (docs/ACTION-RPG.md §5.4).
 * Bosses keep tier 1 (their HP is tuned per boss).
 */
export const CHAPTER_TIER: Readonly<Record<string, number>> = { k1: 1, k2: 2, k3: 3, k4: 4 };
const BOSS_KINDS = new Set(['schuldbuch', 'pikeur', 'strohmann', 'steinbrecher']);

export const QUEST_FLAG = (id: string) => `quest.${id}`;
export const OBJ_FLAG = (id: string, obj: string) => `quest.${id}.${obj}`;
const MAX_TRACKED = 3;

const QUEST_STATES = allOf<QuestState>()(['hidden', 'offered', 'active', 'ready', 'done', 'failed']);

export function createQuestSlice(): QuestSlice {
  return { quests: {}, tracked: [], unseen: [] };
}

/** Fill the fields of an older / partial slice (old saves). */
export function normaliseSlice(s: Partial<QuestSlice> | undefined | null): QuestSlice {
  const out = (s ?? {}) as QuestSlice;
  if (!out.quests || typeof out.quests !== 'object' || Array.isArray(out.quests)) out.quests = {};
  if (!Array.isArray(out.tracked)) out.tracked = [];
  if (!Array.isArray(out.unseen)) out.unseen = [];
  if (out.bestiary !== undefined) out.bestiary = numberRecord(out.bestiary);
  for (const [id, p] of Object.entries(out.quests)) {
    // A corrupt entry restores as never seen (the story re-offers what it needs).
    if (!p || typeof p !== 'object' || Array.isArray(p) || !isOneOf(QUEST_STATES, p.state)) {
      delete out.quests[id];
      continue;
    }
    p.counts = numberRecord(p.counts);
    if (typeof p.t !== 'number') p.t = 0;
  }
  return out;
}

/**
 * The quest log's „Laufend“ list: every quest that runs (active / ready) and every main quest on
 * offer — the next main step waits at its giver and belongs in the log as soon as the story gave it
 * (playtest round 10, F-41: „Der Bauplatz …: Hanne“ led the HUD while the log listed side quests
 * only). Main first, then the latest change first.
 */
export function journalRunning<Q extends QuestDef>(all: readonly Q[], progress: (id: string) => QuestProgress | undefined): Q[] {
  const st = (q: Q) => progress(q.id)?.state ?? 'hidden';
  return all
    .filter((q) => st(q) === 'active' || st(q) === 'ready' || (q.kind === 'main' && st(q) === 'offered'))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1) || (st(a) === 'offered' ? 1 : 0) - (st(b) === 'offered' ? 1 : 0) || (progress(b.id)?.t ?? 0) - (progress(a.id)?.t ?? 0));
}

/** The bus events a running objective subscribes to. Reach, escort and survive are polled. */
const objectiveEvent: Partial<Record<QuestObjective['type'], string>> = {
  kill: 'enemy:killed', collect: 'item:pickup', use: 'item:use', talk: 'npc:talk',
  room: 'room:enter', examine: 'clue:found', echo: 'echo:end', calm: 'menagerie:calmed', photo: 'photo:good',
};
export function objectiveEvents(o: QuestObjective): string[] {
  const name = o.type === 'event' ? o.event : objectiveEvent[o.type];
  if (o.type === 'collect' && o.drop) return ['item:pickup', 'enemy:killed'];
  return name ? [name] : [];
}

export function need(o: QuestObjective): number {
  if (o.type === 'survive') return Math.max(1, Math.round(o.seconds ?? o.count ?? 1));
  return Math.max(1, Math.round(o.count ?? 1));
}

/** The npc a quest is turned in at, the voice that takes it back, or 'auto'. */
export function turninOf(q: QuestDef): { npc: string } | { voice: string } | 'auto' {
  const t = q.turnin ?? 'giver';
  if (t === 'auto') return 'auto';
  if (t === 'giver') return 'npc' in q.giver ? { npc: q.giver.npc } : { voice: q.giver.voice };
  return 'npc' in t ? { npc: t.npc } : { voice: t.voice };
}

/**
 * The deed contract for physical choices (docs/ACTION-RPG.md §8.6): taking one of these things in
 * the world (`item:pickup`) sets the flag the epilogue reads. The Festsaal (Ch. 3): whichever of the
 * three objects is carried out first is `flag.k3_objekt`; leaving with none is the story's
 * `nichts`. Quest-file items add theirs with `deed`.
 */
const DEED_ITEMS: Readonly<Record<string, { flag: string; value: string }>> = {
  'item.charm.tuergriff': { flag: 'flag.k3_objekt', value: 'tuergriff' },
  'item.charm.dukat': { flag: 'flag.k3_objekt', value: 'dukat' },
  'item.charm.uhr': { flag: 'flag.k3_objekt', value: 'uhr' },
};

export function itemDeed(item: string, def: ItemDef | undefined) {
  return DEED_ITEMS[item] ?? def?.deed;
}

export function recordItemDeed(item: string, def: ItemDef | undefined, flags: Record<string, FlagValue>) {
  const deed = itemDeed(item, def);
  if (!deed) return;
  const current = flags[deed.flag];
  if (current !== undefined && current !== '' && current !== 'nichts') return;
  flags[deed.flag] = deed.value;
  return deed;
}

export function giverId(q: QuestDef): string {
  return 'npc' in q.giver ? q.giver.npc : q.giver.voice;
}

export function isVoice(q: QuestDef): boolean {
  return 'voice' in q.giver;
}

/** Spawn group of the i-th spawn of an objective (default `<quest>.<objective>[.<i>]`). */
export function spawnGroup(q: QuestDef, o: QuestObjective, s: SpawnSpec, i: number): string {
  return s.group ?? (i === 0 ? `${q.id}.${o.id}` : `${q.id}.${o.id}.${i}`);
}

/** Era of a place: its own, the objective's zone, the quest's. */
function placeEra(q: QuestDef, o: QuestObjective, p: QuestPlace | undefined): Era {
  return (p?.era ?? o.where?.era ?? q.era ?? 'today') as Era;
}

/** Whether a real kill event credits a kill objective. */
export function killMatches(q: QuestDef, o: QuestObjective, p: Record<string, unknown>): boolean {
  // undone by nobody (a Glutling bursting by itself, a boss's adds fading with it)
  if (p.by === 'env') return false;
  // a pack's escort gives XP, never a quest kill (combat packs.ts)
  if (p.escort === true || (typeof p.group === 'string' && p.group.endsWith('+escort'))) return false;
  if (p.quest === q.id && p.objective === o.id) return true;
  if (o.group && p.group === o.group) return true;
  if (!o.enemy || p.kind !== o.enemy || o.group) return false;
  // A kill of the right kind that is not one of the objective's own spawns (quest /
  // objective / group above) counts only at the objective's place, in its era: an Irrlicht
  // banned in 1789 at the Schwanenweiher is not one over the dam today.
  const spawn = o.spawn?.[0];
  const place = o.where ?? (spawn && { x: spawn.x, z: spawn.z, r: spawn.radius ?? 6, era: spawn.era });
  if (!place) return true;
  const era = placeEra(q, o, place);
  if (typeof p.era === 'string' && p.era !== era) return false;
  const x = Number(p.x), z = Number(p.z);
  return !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - place.x, z - place.z) <= Math.max(30, (place.r ?? 6) * 2);
}

function inPlace(p: QuestPlace, w: QuestWhere, scale = 1): boolean {
  if (p.era && p.era !== w.era) return false;
  if (p.room) {
    const r = w.room ?? '';
    if (!r || !(r === p.room || r.endsWith(`/${p.room}`) || p.room.endsWith(`/${r}`))) return false;
  }
  return Math.hypot(w.x - p.x, w.z - p.z) <= (p.r ?? 6) * scale;
}

/** Shallow match of an event payload against `match` (string compare, so 1 ≡ "1"). */
export function matches(payload: unknown, match: Record<string, FlagValue> | undefined): boolean {
  if (!match) return true;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return Object.entries(match).every(([k, v]) => String(p[k]) === String(v));
}

/** Does a story-flag `available` block hold? (side quests) */
export function availableHolds(q: QuestDef, st: (id: string) => QuestState, flags: Readonly<Record<string, FlagValue>>, era: Era | null): boolean {
  const a = q.available;
  if (!a) return true;
  if (a.after?.some((id) => st(id) !== 'done')) return false;
  if (a.flag && !flags[a.flag]) return false;
  if (a.era && era !== a.era) return false;
  if (a.level && Number(flags['rpg.level'] ?? 1) < a.level) return false;
  return true;
}

const DEFAULT_ACCEPT = 'Ich kümmere mich darum.';

/**
 * History lines told at a turn-in itself (playtest round 3: four-line lectures). The rest waits
 * for "Erzähl mehr" (npc givers) or the quest log (voices); every line's codex card unlocks at once.
 */
export const HISTORY_AT_TURNIN = 1;

/** History lines the turn-in of `q` tells (its `history_at_turnin`, else HISTORY_AT_TURNIN). */
export function historyAtTurnin(q: { history_at_turnin?: number }): number {
  return Math.max(0, q.history_at_turnin ?? HISTORY_AT_TURNIN);
}

export class QuestBook {
  /** Called after any change (UI refresh, autosave). */
  onChange: (reason: string) => void = () => {};
  /** Called on every turn-in with what it paid. */
  onPayout: (p: QuestPayout) => void = () => {};
  private readonly drops = new Map<string, number>();
  /** The story chapter now ("Erzähl mehr" topics stay in their chapter); null = any. */
  chapter: string | null = null;

  constructor(
    readonly defs: ReadonlyMap<string, QuestDefIn>,
    public slice: QuestSlice,
    readonly env: QuestEnv,
  ) {}

  // ---- queries --------------------------------------------------------------------------------

  def(id: string): QuestDefIn | undefined {
    return this.defs.get(id);
  }

  state(id: string): QuestState {
    return this.slice.quests[id]?.state ?? 'hidden';
  }

  progressOf(id: string): QuestProgress | undefined {
    return this.slice.quests[id];
  }

  count(id: string, obj: string): number {
    return this.slice.quests[id]?.counts[obj] ?? 0;
  }

  objectiveDone(q: QuestDef, o: QuestObjective): boolean {
    return this.count(q.id, o.id) >= need(o);
  }

  /** Active = its `after` objectives are complete (and the quest runs). */
  objectiveActive(q: QuestDef, o: QuestObjective): boolean {
    const st = this.state(q.id);
    if (st !== 'active' && st !== 'ready') return false;
    return (o.after ?? []).every((a) => {
      const pre = q.objectives.find((x) => x.id === a);
      return !pre || this.objectiveDone(q, pre);
    });
  }

  /** Objectives that count now: active and not complete. */
  openObjectives(q: QuestDef): QuestObjective[] {
    return q.objectives.filter((o) => this.objectiveActive(q, o) && !this.objectiveDone(q, o));
  }

  /** Every required objective is complete. */
  requiredDone(q: QuestDef): boolean {
    return q.objectives.every((o) => o.optional || this.objectiveDone(q, o));
  }

  running(): QuestDefIn[] {
    return [...this.defs.values()].filter((q) => {
      const s = this.state(q.id);
      return s === 'active' || s === 'ready';
    });
  }

  /**
   * The tracker's quests, main first. A running main quest is always among them (playtest round 10,
   * F-30 / F-41: the main quest vanished from the tracker): one missing from the list (an old save,
   * an entry lost on the way) is put back at the front before the list is read.
   */
  tracked(): string[] {
    if (this.running().some((q) => q.kind === 'main' && !this.slice.tracked.includes(q.id))) this.track('', true);
    return this.slice.tracked.filter((id) => this.defs.has(id));
  }

  /**
   * The next main step when no main quest runs: the main quest on offer at its giver (the story
   * offered it, nobody took it yet), the current chapter's first in content order. Null while a
   * main quest runs or none is on offer (between chapters the story's own line leads).
   */
  mainOffer(chapter: string | null = this.chapter): QuestDefIn | null {
    const offered: QuestDefIn[] = [];
    for (const q of this.defs.values()) {
      if (q.kind !== 'main') continue;
      const st = this.state(q.id);
      if (st === 'active' || st === 'ready') return null;
      if (st === 'offered') offered.push(q);
    }
    return offered.find((q) => !chapter || q.chapter === chapter) ?? offered[0] ?? null;
  }

  // ---- lifecycle ------------------------------------------------------------------------------

  private prog(id: string): QuestProgress {
    const p = (this.slice.quests[id] ??= { state: 'hidden', counts: {}, t: this.env.now() });
    p.counts ??= {};
    return p;
  }

  private setState(id: string, st: QuestState): void {
    const p = this.prog(id);
    p.state = st;
    p.t = this.env.now();
    this.env.flags[QUEST_FLAG(id)] = st;
  }

  /** Make a quest available at its giver. Voice givers speak and it is accepted at once. */
  offer(id: string): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    const st = this.state(id);
    if (st !== 'hidden' && st !== 'failed') return false;
    this.setState(id, 'offered');
    this.env.emit('quest:offered', { id, giver: giverId(q), main: q.kind === 'main' });
    if (isVoice(q)) return this.accept(id) || true;
    this.onChange('offer');
    return true;
  }

  /** Take the quest (conversation, voice giver, story `start`). */
  accept(id: string): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    const st = this.state(id);
    if (st !== 'hidden' && st !== 'offered' && st !== 'failed') return false;
    const p = this.prog(id);
    p.counts = {};
    for (const o of q.objectives) this.env.flags[OBJ_FLAG(id, o.id)] = 0;
    this.setState(id, 'active');
    this.track(id);
    this.env.emit('quest:accepted', { id });
    this.activate(q, new Set());
    // A conversation pauses fixed updates, so credit saved calms before saving acceptance.
    for (const o of this.openObjectives(q)) this.settleCalm(q, o);
    this.checkReady(q);
    this.onChange('accept');
    return true;
  }

  /**
   * Put a quest into the tracker (main quests first, at most three). A running main quest cannot
   * be taken out (the quest log's toggle, `kq.quests.track(id, false)`), and every running main quest
   * missing from the list comes back with any call.
   */
  track(id: string, on = true): void {
    const q = this.defs.get(id);
    const isMain = (x: string) => this.defs.get(x)?.kind === 'main';
    const runningMain = (x: string) => isMain(x) && (this.state(x) === 'active' || this.state(x) === 'ready');
    if (!on && runningMain(id)) on = true;
    let t = this.slice.tracked.filter((x) => x !== id && this.defs.has(x));
    if (on && q) t = q.kind === 'main' ? [id, ...t] : [...t, id];
    for (const m of this.running()) if (m.kind === 'main' && !t.includes(m.id)) t.unshift(m.id);
    // main first; over three, the oldest side quests drop out (never the one just added)
    const list = [...t.filter(isMain), ...t.filter((x) => !isMain(x))];
    // a voice's side quest (Laub, Marlene) never pushes out one the player accepted from a person
    const isVoice = (x: string) => {
      const g = this.defs.get(x)?.giver;
      return !!g && 'voice' in g;
    };
    // a main quest that is not running (done, failed, reset) never holds a place
    for (let i = list.length - 1; i >= 0; i--) if (isMain(list[i]!) && !runningMain(list[i]!) && list[i] !== id) list.splice(i, 1);
    while (list.length > MAX_TRACKED) {
      let i = list.findIndex((x) => !isMain(x) && x !== id && isVoice(x));
      if (i < 0 && isVoice(id) && !isMain(id)) i = list.indexOf(id);
      if (i < 0) i = list.findIndex((x) => !isMain(x) && x !== id);
      if (i < 0) break;
      list.splice(i, 1);
    }
    this.slice.tracked = list.slice(0, MAX_TRACKED);
  }

  /**
   * Add `n` to an objective (default 1). Ignored unless the objective is active and open.
   * `force` (story `quest progress`): also counts an objective whose `after` is not met yet.
   */
  progress(id: string, obj: string, n = 1, force = false): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    const o = q.objectives.find((x) => x.id === obj);
    if (!o) return false;
    const st = this.state(id);
    if (st !== 'active' && st !== 'ready') return false;
    if (!force && !this.objectiveActive(q, o)) return false;
    const goal = need(o);
    const before = this.count(id, obj);
    if (before >= goal || n <= 0) return false;
    const activeBefore = new Set(q.objectives.filter((x) => this.objectiveActive(q, x)).map((x) => x.id));
    const now = Math.min(goal, before + n);
    this.prog(id).counts[obj] = now;
    this.env.flags[OBJ_FLAG(id, obj)] = now;
    this.env.emit('quest:progress', { id, objective: obj, count: now, need: goal });
    if (now >= goal) {
      this.env.emit('quest:objective', { id, objective: obj, optional: !!o.optional });
      if (o.optional && o.bonus_xp) this.env.emit('xp:grant', { amount: o.bonus_xp, reason: `quest:${id}:${obj}` });
      this.activate(q, activeBefore);
    }
    this.checkReady(q);
    this.onChange('progress');
    return true;
  }

  /** Spawn enemies and place pickups of objectives that just became active. */
  private activate(q: QuestDef, before: Set<string>): void {
    for (const o of q.objectives) {
      if (before.has(o.id) || !this.objectiveActive(q, o) || this.objectiveDone(q, o)) continue;
      this.requestWorld(q, o);
    }
  }

  private isBossKind(kind: string): boolean {
    return BOSS_KINDS.has(kind);
  }

  /** enemy:spawn / loot:place for one active objective (idempotent by group / pickup id). */
  private requestWorld(q: QuestDef, o: QuestObjective): void {
    (o.spawn ?? []).forEach((s, i) => {
      const group = spawnGroup(q, o, s, i);
      this.env.emit('enemy:spawn', {
        group,
        kind: s.kind,
        x: s.x,
        z: s.z,
        era: s.era,
        count: s.count,
        radius: s.radius,
        boss: s.boss,
        tier: s.tier ?? (s.boss || this.isBossKind(s.kind) ? undefined : CHAPTER_TIER[(q as QuestDefIn).chapter]),
        leash: s.leash,
        time: s.time,
        quest: q.id,
        objective: o.id,
        ...(s.escorts ? { escorts: s.escorts } : {}),
        ...(s.wave ? { wave: s.wave } : {}),
        ...(s.aggro ? { aggro: true } : {}),
        ...(s.veiled ? { veiled: true } : {}),
      });
    });
    if (o.type === 'collect' && o.item)
      (o.place ?? []).forEach((p, i) => {
        this.env.emit('loot:place', { id: `${q.id}.${o.id}.${i}`, item: o.item!, x: p.x, z: p.z, era: placeEra(q, o, p), room: p.room, quest: q.id });
      });
  }

  /** After a load: re-declare the spawns and pickups of every running objective. */
  reassert(combat?: CombatSlice, progression?: ProgressionSlice): void {
    if (combat?.groups) this.recoverChapterOneCombat(combat.groups, progression);
    for (const q of this.running()) for (const o of this.openObjectives(q)) this.requestWorld(q, o);
  }

  private recoverChapterOneCombat(groups: CombatSlice['groups'], progression?: ProgressionSlice): void {
    for (const quest of this.running()) {
      if (quest.chapter !== 'k1') continue;
      for (const objective of this.openObjectives(quest)) {
        if (objective.type !== 'kill') continue;
        const killed = (objective.spawn ?? []).reduce((total, spawn, index) => {
          const group = groups[spawnGroup(quest, objective, spawn, index)];
          if (group?.quest !== quest.id || group.objective !== objective.id) return total;
          return total + Math.min(group.killed, group.count);
        }, 0);
        const missing = killed - this.count(quest.id, objective.id);
        if (missing > 0) this.progress(quest.id, objective.id, missing);
      }
    }

    const quest = this.def('q.k1.lohn');
    const boss = groups['q.k1.lohn.buch'];
    if (!quest || boss?.quest !== quest.id || boss.objective !== 'buch' || boss.killed < 1 || this.count(quest.id, 'buch') < 1) return;
    const slip = this.openObjectives(quest).find((objective) => objective.id === 'zettel')?.item;
    if (!slip) return;
    if ((progression?.inventory?.[slip] ?? 0) > 0) this.progress(quest.id, 'zettel');
    else if (!Object.values(progression?.placed ?? {}).some((pickup) => pickup.item === slip)) {
      this.env.emit('loot:place', { id: `${quest.id}.zettel.recovered`, item: slip, x: boss.x, z: boss.z, era: boss.era, quest: quest.id });
    }
  }

  /** Re-write the whole flag mirror from the slice (load, old saves). */
  mirror(): void {
    for (const [id, p] of Object.entries(this.slice.quests)) {
      if (!this.defs.has(id)) continue;
      this.env.flags[QUEST_FLAG(id)] = p.state;
      for (const [o, n] of Object.entries(p.counts)) this.env.flags[OBJ_FLAG(id, o)] = n;
    }
  }

  private checkReady(q: QuestDefIn): void {
    if (this.state(q.id) !== 'active' || !this.requiredDone(q)) return;
    this.setState(q.id, 'ready');
    this.env.emit('quest:ready', { id: q.id });
    if (turninOf(q) === 'auto') this.complete(q.id);
  }

  /** The groups this quest's objectives spawned. */
  groups(q: QuestDef): string[] {
    const out: string[] = [];
    for (const o of q.objectives) (o.spawn ?? []).forEach((s, i) => out.push(spawnGroup(q, o, s, i)));
    return out;
  }

  /**
   * Turn in: rewards, codex, state done, next quest. Only from 'ready' unless `force` (story
   * `quest complete`: cut-scenes grant the rewards at once from any state but done).
   */
  complete(id: string, force = false): QuestPayout | null {
    const q = this.defs.get(id);
    if (!q) return null;
    const st = this.state(id);
    if (st === 'done' || (!force && st !== 'ready')) return null;
    const r: QuestRewards = q.rewards ?? {};
    const xp = r.xp ?? 0;
    const reason = `quest:${id}`;
    const xpReceipt = { amount: 0 };
    if (xp > 0) this.env.emit('xp:grant', { amount: xp, reason, receipt: xpReceipt });
    const items: QuestPayout['items'] = [];
    for (const i of r.items ?? []) {
      const receipt = { amount: 0 };
      this.env.emit('item:grant', { item: i.item, count: i.count ?? 1, reason, receipt });
      if (receipt.amount > 0) items.push({ item: i.item, count: receipt.amount });
    }
    const facts = [...(q.history ?? []).map((l) => l.fact).filter((f): f is string => !!f), ...(r.codex ?? [])];
    const fresh: string[] = [];
    for (const f of facts) {
      if (this.env.codex.includes(f) || fresh.includes(f)) continue;
      this.env.codex.push(f);
      fresh.push(f);
      if (!this.slice.unseen.includes(f)) this.slice.unseen.push(f);
    }
    for (const s of r.skills ?? []) this.env.emit('skill:grant', { skill: s.id, level: s.tier });
    for (const [k, v] of Object.entries(r.flags ?? {})) this.env.flags[k] = v;
    this.setState(id, 'done');
    for (const f of fresh) this.env.emit('codex:unlocked', { factId: f });
    this.env.emit('quest:completed', { id, xp, main: q.kind === 'main' });
    this.cleanup(q);
    this.track(id, false);
    if (!this.slice.unseen.includes(`q:${id}`)) this.slice.unseen.push(`q:${id}`);
    const pay: QuestPayout = { id, title: q.title_de, xp: xpReceipt.amount, items, codex: fresh, skills: [...(r.skills ?? [])], quiet: !!q.quiet, main: q.kind === 'main' };
    this.onPayout(pay);
    if (q.next) this.offer(q.next);
    this.onChange('complete');
    return pay;
  }

  private cleanup(q: QuestDef): void {
    for (const g of this.groups(q)) this.env.emit('enemy:despawn', { group: g });
    this.env.emit('loot:clear', { quest: q.id });
  }

  fail(id: string, reason = 'story'): boolean {
    const q = this.defs.get(id);
    if (!q || this.state(id) === 'done') return false;
    this.setState(id, 'failed');
    this.prog(id).reason = reason;
    this.cleanup(q);
    this.track(id, false);
    this.env.emit('quest:failed', { id, reason });
    this.onChange('fail');
    return true;
  }

  /**
   * A new chapter: main quests of earlier chapters still running and unaccepted offers leave the
   * log (a chapter select or story jump skipped them; in a straight run they are all done); side
   * quests of a past era of an earlier chapter end (ready → paid, active → failed).
   */
  dropEarlier(chapter: string): void {
    const order = ['tour', 'k1', 'k2', 'k3', 'k4', 'enden'];
    // a chapter outside the campaign (the e2e `test` chapter) comes after all of it
    const at = order.includes(chapter) ? order.indexOf(chapter) : order.length;
    for (const q of this.defs.values()) {
      const i = order.indexOf(q.chapter ?? '');
      if (i < 0 || i >= at) continue;
      const st = this.state(q.id);
      // main quests of a skipped chapter, and offers whose (chapter-bound) giver is gone
      if (st === 'offered' || (q.kind === 'main' && (st === 'active' || st === 'ready'))) this.reset(q.id);
      // Past-era side quests expire at the next chapter, present-day ones two chapters on.
      // A ready quest still pays out, an active one fails.
      else if (q.kind === 'side' && ((q.era && q.era !== 'today') || at - i >= 2)) {
        if (st === 'ready') this.complete(q.id, true);
        else if (st === 'active') this.fail(q.id, 'chapter');
      }
    }
  }

  /** Back to hidden: counts cleared, spawns and pickups withdrawn. */
  reset(id: string): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    this.cleanup(q);
    delete this.slice.quests[id];
    delete this.env.flags[QUEST_FLAG(id)];
    for (const o of q.objectives) delete this.env.flags[OBJ_FLAG(id, o.id)];
    this.track(id, false);
    this.onChange('reset');
    return true;
  }

  /** "Erzähl mehr" heard: the rest of a quest's history is told (the topic goes away). */
  told(id: string): boolean {
    const p = this.slice.quests[id];
    if (!p || p.state !== 'done' || p.told) return false;
    p.told = true;
    this.onChange('told');
    return true;
  }

  // ---- objective tracking ---------------------------------------------------------------------

  /**
   * A game event: count every open objective it satisfies. Returns true when something counted.
   * (kill · collect / drop · talk · room · examine · echo · calm · use · event · photo)
   */
  handle(name: string, payload: unknown): boolean {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (name === 'echo:end' && p.aborted === true) return false;
    let hit = false;
    for (const q of this.running()) {
      for (const o of this.openObjectives(q)) {
        const n = this.counts(q, o, name, p);
        if (n > 0 && this.progress(q.id, o.id, n)) hit = true;
      }
      // drops: roll while a collect objective with `drop` is open
      if (name === 'enemy:killed')
        for (const o of this.openObjectives(q)) {
          if (o.type !== 'collect' || !o.drop || !o.item || o.drop.enemy !== p.kind) continue;
          if (this.env.rng() >= o.drop.chance) continue;
          const k = `${q.id}.${o.id}`;
          const i = (this.drops.get(k) ?? 0) + 1;
          this.drops.set(k, i);
          this.env.emit('loot:place', {
            id: `${k}.drop.${String(p.id ?? i)}`,
            item: o.item,
            x: Number(p.x ?? 0),
            z: Number(p.z ?? 0),
            era: (p.era as Era) ?? placeEra(q, o, undefined),
            quest: q.id,
          });
        }
    }
    return hit;
  }

  /** How much `name` counts towards `o` (0 = not at all). */
  private counts(q: QuestDef, o: QuestObjective, name: string, p: Record<string, unknown>): number {
    switch (o.type) {
      case 'kill':
        return name === 'enemy:killed' && killMatches(q, o, p) ? 1 : 0;
      case 'collect':
        return name === 'item:pickup' && p.item === o.item ? Math.max(1, Number(p.count ?? 1)) : 0;
      case 'use':
        return name === 'item:use' && p.item === o.item ? 1 : 0;
      case 'talk':
        return name === 'npc:talk' && p.npc === o.npc && (!o.topic || p.topic === o.topic) ? 1 : 0;
      case 'room': {
        if (name !== 'room:enter' || !o.room) return 0;
        const r = o.room;
        return p.roomId === r || p.id === r || String(p.id ?? '').endsWith(`/${r}`) ? 1 : 0;
      }
      case 'examine':
        return name === 'clue:found' && p.id === o.clue ? 1 : 0;
      case 'echo':
        return name === 'echo:end' && p.id === o.clue ? 1 : 0;
      case 'calm':
        return name === 'menagerie:calmed' && (p.animal === o.animal || p.id === o.animal) ? 1 : 0;
      case 'event':
        return !!o.event && name === o.event && matches(p, o.match) ? 1 : 0;
      case 'photo':
        return name === 'photo:good' && !!o.target && p.id === o.target ? 1 : 0;
      default:
        return 0;
    }
  }

  /**
   * Credit clues, good photos and calmed animals from the save when an objective opens or on load.
   */
  settleKnown(
    found: (clue: string) => boolean,
    hasPhoto: (target: string) => boolean = () => false,
    pikeur?: { group: EnemyGroupState; era: Era },
  ): void {
    for (const q of this.running())
      for (const o of this.openObjectives(q)) {
        if ((o.type === 'examine' || o.type === 'echo') && o.clue && found(o.clue)) this.progress(q.id, o.id, need(o));
        else if (o.type === 'photo' && o.target && hasPhoto(o.target)) this.progress(q.id, o.id, need(o));
        else this.settleCalm(q, o);
      }

    // The story can spawn the Pikeur before the Landremont echo opens his objective.
    // Settle from the saved clear without replaying the kill event or its rewards.
    if (!pikeur || pikeur.group.group !== 'k2.pikeur' || pikeur.group.kind !== 'pikeur' || !isCleared(pikeur.group)) return;
    this.progress('q.k2.parforce', 'pikeur');
    // A stalled save may already be in the present. The normal prerequisite still applies.
    if (pikeur.era === 'today') this.progress('q.k2.parforce', 'heim');
  }

  private settleCalm(q: QuestDefIn, o: QuestObjective): void {
    const menagerie = this.env.menagerie;
    if (o.type !== 'calm' || !o.animal || !Array.isArray(menagerie?.calmed)) return;
    const animals = Array.isArray(menagerie.animals) ? menagerie.animals : [];
    const count = menagerie.calmed.filter((id) => {
      const animal = animals.find((spawn) => spawn.id === id)?.animal;
      // The calm ID outlives the spawn record once the story clears it (K1 ends, older garden saves).
      const kind = animal ?? STORY_ANIMALS[id];
      return id === o.animal || kind === o.animal;
    }).length;
    this.progress(q.id, o.id, count - this.count(q.id, o.id));
  }

  /**
   * Per tick: reach (inside `where`), escort (the player — with the follower — inside `to`),
   * survive (seconds inside the zone while the objective runs). `follower` = distance of the
   * escorted npc to the player (m), Infinity when it is not with them.
   */
  tick(dt: number, w: QuestWhere, follower: (npc: string) => number = () => 0): void {
    for (const q of this.running()) {
      for (const o of this.openObjectives(q)) {
        if (o.type === 'reach' && o.where && inPlace(o.where, w)) this.progress(q.id, o.id, need(o));
        else if (o.type === 'escort' && o.to && inPlace(o.to, w) && (!o.npc || follower(o.npc) < 10)) this.progress(q.id, o.id, need(o));
        else if (o.type === 'survive') {
          if (o.where && !inPlace(o.where, w, 1.6)) continue;
          const k = `${q.id}.${o.id}`;
          const acc = (this.survive.get(k) ?? 0) + dt;
          const whole = Math.floor(acc);
          this.survive.set(k, acc - whole);
          if (whole > 0) this.progress(q.id, o.id, whole);
        }
      }
    }
  }
  private readonly survive = new Map<string, number>();

  /** Offer the side quests of `chapter` whose `available` holds now. Returns the ids offered. */
  offerAvailable(chapter: string | null, era: Era | null): string[] {
    if (!chapter) return [];
    const out: string[] = [];
    for (const q of this.defs.values()) {
      if (q.kind !== 'side' || q.chapter !== chapter || this.state(q.id) !== 'hidden') continue;
      if (!availableHolds(q, (id) => this.state(id), this.env.flags, era)) continue;
      if (this.offer(q.id)) out.push(q.id);
    }
    return out;
  }

  // ---- conversations --------------------------------------------------------------------------

  /** The quest topics an NPC offers now: ready turn-ins, main offers, offers, then progress. */
  topicsFor(npc: string): QuestTopic[] {
    const out: { rank: number; t: QuestTopic }[] = [];
    for (const q of this.defs.values()) {
      const st = this.state(q.id);
      const main = q.kind === 'main';
      const label = q.topic_de ?? q.title_de;
      const ti = turninOf(q);
      const atTurnin = typeof ti === 'object' && 'npc' in ti && ti.npc === npc;
      if (st === 'offered' && 'npc' in q.giver && q.giver.npc === npc)
        out.push({
          rank: main ? 1 : 2,
          t: { quest: q.id, kind: 'offer', label, main, lines: q.offer, accept: q.accept_de ?? DEFAULT_ACCEPT, declinable: q.declinable ?? !main },
        });
      else if (st === 'ready' && atTurnin)
        out.push({ rank: 0, t: { quest: q.id, kind: 'turnin', label, main, lines: q.turnin_lines ?? [], history: (q.history ?? []).slice(0, historyAtTurnin(q)) } });
      else if (st === 'active' && atTurnin && q.progress?.length) out.push({ rank: 3, t: { quest: q.id, kind: 'progress', label, main, lines: q.progress } });
      // after a turn-in at this npc: the rest of the history, when the player wants it (§8.5.7)
      else if (st === 'done' && atTurnin && (q.history?.length ?? 0) > historyAtTurnin(q) && !this.slice.quests[q.id]?.told && (!this.chapter || q.chapter === this.chapter))
        out.push({ rank: 4, t: { quest: q.id, kind: 'more', label: `Erzähl mehr: ${label}`, main, lines: (q.history ?? []).slice(historyAtTurnin(q)) } });
    }
    return out.sort((a, b) => a.rank - b.rank).map((x) => x.t);
  }

  /** The glyph over an NPC's head. Shape-coded: ? (ready) · ! ringed (main offer) · ! · grey ? (active). */
  markFor(npc: string): GiverMark {
    let best: GiverMark = null;
    const rank = (m: GiverMark) => (m === 'ready' ? 4 : m === 'offer-main' ? 3 : m === 'offer' ? 2 : m === 'active' ? 1 : 0);
    for (const q of this.defs.values()) {
      const st = this.state(q.id);
      const ti = turninOf(q);
      const atTurnin = typeof ti === 'object' && 'npc' in ti && ti.npc === npc;
      let m: GiverMark = null;
      if (st === 'offered' && 'npc' in q.giver && q.giver.npc === npc) m = q.kind === 'main' ? 'offer-main' : 'offer';
      else if (st === 'ready' && atTurnin) m = 'ready';
      else if (st === 'active' && atTurnin) m = 'active';
      if (rank(m) > rank(best)) best = m;
    }
    return best;
  }

  /** Every NPC that gives or takes back a quest in play (for the topic / marker sync). */
  npcs(): string[] {
    const s = new Set<string>();
    for (const q of this.defs.values()) {
      if ('npc' in q.giver) s.add(q.giver.npc);
      const ti = turninOf(q);
      if (typeof ti === 'object' && 'npc' in ti) s.add(ti.npc);
    }
    return [...s];
  }
}

/** Small seeded generator (mulberry32) for deterministic drop rolls. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
