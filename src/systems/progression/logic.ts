/**
 * Progression rules (docs/ACTION-RPG.md §6–§7) — PURE: no three.js, no DOM. The system
 * (index.ts) wires this core to the event bus and the UI; tests drive it with a fake emitter.
 *
 * - XP × stats.xp, capped at the last level (12). Several level-ups at once emit one `level:up`
 *   each; every level is one talent point; `flags['rpg.level']` follows via env.setLevelFlag.
 * - Items respect their stack (consumables 5–9, weapons / charms / lore / keys 1, quest items 99).
 *   A stronger weapon equips itself; a charm fills a free charm slot (charmSlots(level)).
 * - Consumables: `use` takes one and emits `item:use` — combat looks up the ItemEffect in
 *   src/rpg/items.ts and applies heal / stamina / Bannlicht / Kalkstaub itself (combat owns
 *   Lebenskraft). Lampenöl also emits `lantern:request {lit: true, refill: true}`.
 * - Loot: seeded per drop (mulberry32 of the enemy id and a drop counter), every entry rolls
 *   independently with chance + stats.loot + bad-luck protection (+6 % per empty roll, ≤ 30 %).
 * - Collections: members are items with `set` (core + quest files); complete → XP once.
 * - Codex: +10 XP the first time each fact unlocks.
 */
import type { GameEvents } from '../../core/events';
import { COLLECTIONS, lootTable } from '../../rpg/items';
import { LEVEL_XP, MAX_LEVEL, type StatOptions, charmSlots, deriveStats, levelForXp, spentPoints, talentBlock, talentDef, weaponPower } from '../../rpg/stats';
import type { CollectionSet, DerivedStats, EnemyDef, ItemDef, LootTable, PlacedPickup, ProgressionSlice } from '../../rpg/types';

export type Emit = <K extends keyof GameEvents>(type: K, payload: GameEvents[K]) => void;

export interface CoreEnv {
  emit: Emit;
  /** Item definition: src/rpg/items.ts or a quest file's `items`. */
  item(id: string): ItemDef | undefined;
  /** Items (core + quest files) that belong to a collection set. */
  setMembers(set: string): string[];
  /** Gentle mode / Rauhnacht. */
  statOptions(): StatOptions;
  /** Mirror the level into `flags['rpg.level']`. */
  setLevelFlag(level: number): void;
  /** A collection was completed (feed line, chime). */
  onCollection?(set: CollectionSet, xp: number): void;
}

/** Total XP at the cap (reaching level 12). */
export const XP_CAP = LEVEL_XP[MAX_LEVEL - 1]!;
/** XP for a codex card the first time it unlocks. */
export const CODEX_XP = 10;
/** Enemy drops kept in the world at most (oldest go first). */
export const MAX_DROPS = 40;
/** Bad-luck protection: + per empty roll, at most. */
export const DRY_STEP = 0.06;
export const DRY_MAX = 0.3;
/** Quick-use default. */
export const DEFAULT_QUICK = 'item.balsam';

export function createProgressionSlice(): ProgressionSlice {
  return { xp: 0, level: 1, points: 0, talents: {}, inventory: {}, equipped: { weapon: null, charms: [] }, quick: null, taken: [], completedSets: [], codexXp: [], placed: {}, drops: 0, dry: 0 };
}

/** Fill fields a saved slice may lack (older saves, hand-made test slices). Mutates and returns it. */
export function normalizeSlice(s: ProgressionSlice): ProgressionSlice {
  s.xp = Math.max(0, Math.min(XP_CAP, Number(s.xp) || 0));
  s.level = Math.max(1, Math.min(MAX_LEVEL, Math.max(Number(s.level) || 1, levelForXp(s.xp))));
  s.points = Math.max(0, Number(s.points) || 0);
  s.talents ??= {};
  s.inventory ??= {};
  s.equipped ??= { weapon: null, charms: [] };
  s.equipped.charms ??= [];
  s.quick ??= null;
  s.taken ??= [];
  s.completedSets ??= [];
  s.codexXp ??= [];
  s.placed ??= {};
  s.drops ??= 0;
  s.dry ??= 0;
  return s;
}

/** How many of an item fit in the pack. */
export function stackLimit(def: ItemDef | undefined): number {
  if (!def) return 99; // an opaque quest item (named by its quest file only)
  switch (def.kind) {
    case 'consumable':
      return def.stack ?? 9;
    case 'quest':
      return def.stack ?? 99;
    default:
      return def.stack ?? 1;
  }
}

/** Small, fast, seedable PRNG (0..1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Roll a loot table: each entry independently with min(1, chance + bonus); counts min..max. */
export function rollLoot(table: LootTable, rng: () => number, bonus = 0): { item: string; count: number }[] {
  const out: { item: string; count: number }[] = [];
  for (const e of table.entries) {
    const r = rng();
    if (r >= Math.min(1, e.chance + bonus)) continue;
    const lo = Math.max(1, e.min ?? 1);
    const hi = Math.max(lo, e.max ?? lo);
    out.push({ item: e.item, count: lo + Math.floor(rng() * (hi - lo + 1)) });
  }
  return out;
}

/** Where the n-th of several drops lands around x/z (golden angle, a step apart). */
export function dropSpot(x: number, z: number, i: number, seed = 0): { x: number; z: number } {
  const a = i * 2.39996 + (seed % 628) / 100;
  const r = 0.9 + 0.45 * i;
  return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
}

export interface GrantOptions {
  reason?: string;
  quiet?: boolean;
  pickup?: PlacedPickup;
}

export class ProgressionCore {
  private lastStats = '';
  /** True while a quiet grant emits its events (the feed stays silent). */
  quietNow = false;

  constructor(
    readonly slice: () => ProgressionSlice,
    readonly env: CoreEnv,
  ) {}

  private get s(): ProgressionSlice {
    return this.slice();
  }

  // ---- stats -------------------------------------------------------------------------------

  stats(): DerivedStats {
    return deriveStats(this.s, this.env.statOptions());
  }

  /** Emit `stats:changed` if the derived stats changed (or always with force). */
  refreshStats(force = false): boolean {
    const st = this.stats();
    const key = JSON.stringify(st);
    if (!force && key === this.lastStats) return false;
    this.lastStats = key;
    this.env.emit('stats:changed', { stats: st });
    return true;
  }

  /** After a load / new game: fill the slice, mirror the level, announce the stats. */
  restore(): void {
    normalizeSlice(this.s);
    this.env.setLevelFlag(this.s.level);
    this.refreshStats(true);
  }

  // ---- XP and levels -------------------------------------------------------------------------

  /** Grant XP (× stats.xp unless raw). Returns the XP actually gained. */
  grantXp(amount: number, reason: string, raw = false): number {
    if (!(amount > 0)) return 0;
    const s = this.s;
    const gain = Math.min(Math.round(amount * (raw ? 1 : this.stats().xp)), XP_CAP - s.xp);
    if (gain <= 0) return 0;
    s.xp += gain;
    this.env.emit('xp:gain', { amount: gain, total: s.xp, reason });
    this.syncLevel();
    return gain;
  }

  /** Raise the level to what the XP says; one `level:up` and one point per level. */
  private syncLevel(): number[] {
    const s = this.s;
    const target = levelForXp(s.xp);
    const ups: number[] = [];
    while (s.level < target) {
      s.level++;
      s.points++;
      ups.push(s.level);
      this.env.emit('level:up', { level: s.level, points: s.points });
    }
    if (ups.length) {
      this.env.setLevelFlag(s.level);
      this.refreshStats();
    }
    return ups;
  }

  /** Debug: jump to a level (up: level-ups as usual; down: talents reset, points = level − 1). */
  setLevel(n: number): void {
    const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.round(n)));
    const s = this.s;
    if (lvl >= s.level) {
      s.xp = Math.max(s.xp, LEVEL_XP[lvl - 1]!);
      this.syncLevel();
      return;
    }
    s.xp = LEVEL_XP[lvl - 1]!;
    s.level = lvl;
    s.talents = {};
    s.points = lvl - 1;
    s.equipped.charms = s.equipped.charms.slice(0, charmSlots(lvl));
    this.env.setLevelFlag(lvl);
    this.refreshStats();
  }

  /** +10 XP the first time a codex fact unlocks. */
  codex(factId: string): number {
    const list = (this.s.codexXp ??= []);
    if (!factId || list.includes(factId)) return 0;
    list.push(factId);
    return this.grantXp(CODEX_XP, 'codex');
  }

  // ---- items -------------------------------------------------------------------------------

  count(id: string): number {
    return this.s.inventory[id] ?? 0;
  }

  /** How many more of an item fit. */
  room(id: string): number {
    return Math.max(0, stackLimit(this.env.item(id)) - this.count(id));
  }

  /** Put items into the pack (stack-limited). Returns how many went in. */
  grantItem(id: string, count = 1, o: GrantOptions = {}): number {
    const def = this.env.item(id);
    const add = Math.min(Math.max(1, Math.round(count)), this.room(id));
    if (add <= 0) return 0;
    const s = this.s;
    s.inventory[id] = this.count(id) + add;
    this.quietNow = !!o.quiet;
    try {
      this.env.emit('item:pickup', { item: id, count: add, total: s.inventory[id]!, id: o.pickup?.id, x: o.pickup?.x, z: o.pickup?.z });
      if (def?.kind === 'weapon' && weaponPower(id) > weaponPower(s.equipped.weapon)) this.equip(id);
      else if (def?.kind === 'charm' && !s.equipped.charms.includes(id) && s.equipped.charms.length < charmSlots(s.level)) this.equip(id);
    } finally {
      this.quietNow = false;
    }
    if (def?.set) this.checkCollections();
    return add;
  }

  /** Equip a weapon or a charm the player owns. A charm with all slots full replaces the last one. */
  equip(id: string): boolean {
    const def = this.env.item(id);
    const s = this.s;
    if (!def || this.count(id) < 1) return false;
    if (def.kind === 'weapon') {
      if (s.equipped.weapon === id) return true;
      s.equipped.weapon = id;
      this.env.emit('equip:change', { slot: 'weapon', item: id });
    } else if (def.kind === 'charm') {
      if (s.equipped.charms.includes(id)) return true;
      const slots = charmSlots(s.level);
      if (s.equipped.charms.length >= slots) s.equipped.charms.splice(slots - 1);
      s.equipped.charms.push(id);
      this.env.emit('equip:change', { slot: 'charm', item: id });
    } else return false;
    this.refreshStats();
    return true;
  }

  /** Take a charm off ("or nothing, by choice"). */
  unequip(id: string): boolean {
    const s = this.s;
    const i = s.equipped.charms.indexOf(id);
    if (i < 0) return false;
    s.equipped.charms.splice(i, 1);
    this.env.emit('equip:change', { slot: 'charm', item: null });
    this.refreshStats();
    return true;
  }

  quickItem(): string {
    return this.s.quick ?? DEFAULT_QUICK;
  }

  /** Put a consumable on the quick-use key. */
  setQuick(id: string): boolean {
    if (this.env.item(id)?.kind !== 'consumable') return false;
    this.s.quick = id;
    return true;
  }

  /** Use a consumable (default: the quick item). Combat applies its effect on `item:use`. */
  use(id?: string): boolean {
    const item = id ?? this.quickItem();
    const def = this.env.item(item);
    if (def?.kind !== 'consumable' || this.count(item) < 1) return false;
    const s = this.s;
    s.inventory[item] = this.count(item) - 1;
    if (s.inventory[item]! <= 0) delete s.inventory[item];
    this.env.emit('item:use', { item });
    if (def.effect?.oil || def.effect?.bann) this.env.emit('lantern:request', { lit: true, refill: true });
    return true;
  }

  // ---- talents -----------------------------------------------------------------------------

  learn(id: string): boolean {
    const s = this.s;
    if (talentBlock(s, id) !== null) return false;
    s.talents[id] = (s.talents[id] ?? 0) + 1;
    s.points--;
    this.env.emit('talent:learned', { talent: id, rank: s.talents[id]! });
    this.refreshStats();
    return true;
  }

  /** Give every spent point back (free at the field station). Returns the points refunded. */
  respec(): number {
    const s = this.s;
    const back = spentPoints(s.talents);
    if (!back) return 0;
    s.talents = {};
    s.points += back;
    this.refreshStats();
    return back;
  }

  talentRank(id: string): number {
    return Math.min(talentDef(id)?.maxRank ?? 0, this.s.talents[id] ?? 0);
  }

  // ---- collections -------------------------------------------------------------------------

  members(set: string): string[] {
    const c = COLLECTIONS.find((x) => x.id === set);
    return [...new Set([...(c?.items ?? []), ...this.env.setMembers(set)])];
  }

  /** Reward every collection that just became complete (once each). */
  checkCollections(): string[] {
    const s = this.s;
    const done: string[] = [];
    for (const c of COLLECTIONS) {
      if (s.completedSets.includes(c.id)) continue;
      const m = this.members(c.id);
      if (!m.length || !m.every((id) => this.count(id) > 0)) continue;
      s.completedSets.push(c.id);
      done.push(c.id);
      const xp = this.grantXp(c.reward?.xp ?? 0, 'collection');
      for (const it of c.reward?.items ?? []) this.grantItem(it.item, it.count ?? 1, { reason: 'collection' });
      this.env.onCollection?.(c, xp);
    }
    return done;
  }

  // ---- loot and world pickups ----------------------------------------------------------------

  /** Roll an undone enemy's loot (seeded), emit `loot:drop` and place the pickups (`loot:place`). */
  enemyKilled(e: GameEvents['enemy:killed'], def: EnemyDef | undefined): PlacedPickup[] {
    const table = def?.loot ? lootTable(def.loot) : undefined;
    if (!table) return [];
    const s = this.s;
    const n = s.drops ?? 0;
    const dry = s.dry ?? 0;
    const rng = mulberry32(hashString(e.id || e.kind) ^ Math.imul(n + 1, 0x9e3779b1));
    const items = rollLoot(table, rng, this.stats().loot + Math.min(DRY_MAX, dry * DRY_STEP));
    s.drops = n + 1;
    if (!items.length) {
      s.dry = dry + 1;
      return [];
    }
    s.dry = 0;
    this.env.emit('loot:drop', { x: e.x, z: e.z, era: e.era, items, from: e.kind });
    const out: PlacedPickup[] = [];
    items.forEach((it, i) => {
      const at = dropSpot(e.x, e.z, i, n);
      const p: PlacedPickup = { id: `drop.${n}.${i}`, item: it.item, count: it.count, x: at.x, z: at.z, era: e.era, drop: true };
      this.place(p);
      out.push(p);
      this.env.emit('loot:place', { id: p.id, item: p.item, x: p.x, z: p.z, era: p.era, count: p.count });
    });
    return out;
  }

  /** Put a pickup into the world (idempotent by id; ids already taken never come back). */
  place(p: PlacedPickup): boolean {
    const s = this.s;
    if (s.taken.includes(p.id)) return false;
    const placed = (s.placed ??= {});
    placed[p.id] = { ...placed[p.id], ...p, drop: p.drop ?? placed[p.id]?.drop };
    const drops = Object.values(placed).filter((x) => x.drop);
    for (let i = 0; i < drops.length - MAX_DROPS; i++) delete placed[drops[i]!.id];
    return true;
  }

  /** Remove pickups by id or by quest. Returns the ids removed. */
  clear(o: { id?: string; quest?: string }): string[] {
    const placed = (this.s.placed ??= {});
    const out: string[] = [];
    for (const p of Object.values(placed)) {
      if ((o.id && p.id === o.id) || (o.quest && p.quest === o.quest)) {
        delete placed[p.id];
        out.push(p.id);
      }
    }
    return out;
  }

  pickups(): PlacedPickup[] {
    return Object.values(this.s.placed ?? {});
  }

  /** Pick a pickup up. Returns how many went into the pack (0: unknown, or the stack is full). */
  take(id: string): number {
    const s = this.s;
    const p = s.placed?.[id];
    if (!p) return 0;
    const want = Math.max(1, p.count ?? 1);
    const got = this.grantItem(p.item, want, { pickup: p, reason: 'pickup' });
    if (got <= 0) return 0;
    if (got < want) {
      p.count = want - got;
      return got;
    }
    delete s.placed![id];
    if (!p.drop && !s.taken.includes(id)) s.taken.push(id);
    return got;
  }
}
