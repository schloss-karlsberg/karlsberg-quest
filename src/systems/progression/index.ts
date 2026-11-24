/**
 * Feature "progression" — XP and levels (1–12), talents, inventory, equipment (Messstab upgrades,
 * charms), consumables on the quick-use key, loot drops, glowing world pickups, collections, the
 * level-up card, the XP bar, the quick slot and the pickup feed (docs/ACTION-RPG.md §6–§7, §10).
 *
 * Modules: logic.ts (pure rules, tested), pickups.ts (three.js), hud.ts (docks), levelup-card.ts,
 * pages.ts (Ausrüstung / Talente), icons.ts, audio.ts, progression.css.
 *
 * Contract (src/systems/contracts.ts, "progression"): listens to xp:grant, item:grant, loot:place
 * / clear, enemy:killed (loot tables), codex:unlocked (+10 XP once per fact), settings:change
 * (gentle / Rauhnacht), hub:enter / leave (free respec at the home base, the spring); emits xp:gain, level:up,
 * item:pickup / use, loot:drop, loot:place (its own drops), equip:change, talent:learned,
 * stats:changed (at boot, at game:start and on every change), lantern:request (Lampenöl).
 * Mirrors `flags['rpg.level']` (story `level` condition) from boot on.
 *
 * Split with combat: `item:use {item}` is all progression says about a consumable — combat owns
 * Lebenskraft / Atem / Bannlicht and applies the ItemEffect from src/rpg/items.ts (heal ×
 * stats.healing, stamina, bann charges, Kalkstaub burst). Combat reads stats from
 * `stats:changed` (or `deriveStats` with the same slice), never from this system.
 *
 * State: `state.systems.progression` (ProgressionSlice, src/rpg/types.ts), placed pickups included.
 * Debug: `window.kq.progression` (ProgressionHooks).
 */
import '../contracts';
import './progression.css';
import type { GameContext } from '../../core/context';
import type { Era } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { effectiveBindings } from '../../player/input';
import { ENEMIES } from '../../rpg/enemies';
import { ITEMS, itemDef } from '../../rpg/items';
import { LEVEL_XP, MAX_LEVEL } from '../../rpg/stats';
import type { DerivedStats, ItemDef, ItemKind, PlacedPickup, ProgressionSlice } from '../../rpg/types';
import { openPausePage, pausePageHandle } from '../../ui/pause-pages';
import { actionLabel } from '../../ui/actionLabel';
import { loadBundledQuests, questsInPlay } from '../quests/data';
import { collectionSound, levelSound, pickupSound, useSound, xpTick } from './audio';
import { ProgressionHud } from './hud';
import { iconFor } from './icons';
import { installProgressionPages } from './pages';
import { LevelCards, type MergedSkillRow } from './levelup-card';
import { ProgressionCore, createProgressionSlice } from './logic';
import { PickupWorld } from './pickups';

export { createProgressionSlice } from './logic';

declare module '../../core/state' {
  interface SystemStates {
    progression: ProgressionSlice;
  }
}

export interface ProgressionHooks {
  /** The slice (deep copy). */
  state(): ProgressionSlice;
  /** Grant XP as `xp:grant {reason:'debug'}` (not multiplied). */
  xp(n: number, at?: { x: number; z: number }): void;
  /** Jump to a level (down: talents reset). */
  level(n: number): void;
  /** `item:grant`. */
  grant(item: string, n?: number, quiet?: boolean): void;
  equip(item: string): boolean;
  /** Use a consumable (default: the quick item), like H. */
  use(item?: string): boolean;
  learn(talent: string): boolean;
  respec(): number;
  /** `loot:place` (era default: the current one). */
  place(id: string, item: string, x: number, z: number, era?: Era, extra?: Partial<PlacedPickup>): void;
  /** Placed pickups with their on-screen visibility (0..1). */
  pickups(): (PlacedPickup & { vis: number })[];
  /** Pick a pickup up now (as if walked over). */
  take(id: string): number;
  stats(): DerivedStats;
  /** The level card on screen (null if none) and whether it stands aside. */
  card(): { level: number; held: boolean } | null;
  /** Feed lines so far (text). */
  feed(): string[];
}

declare module '../../debug/hooks' {
  interface KqHooks {
    progression?: ProgressionHooks;
  }
}

/** Pick-up radius when walking over a pickup (m); drops a little more generous. */
const WALK_R = 1.3;
const WALK_R_DROP = 1.9;
/** E reaches this far. */
const REACH = 2.7;
/** Same storey: |Δy| (m). */
const STOREY = 2.4;

/** window.kq is installed after the systems' init: the hooks go in on the first frame. */
let hooks: ProgressionHooks | null = null;
let disposeFns: (() => void)[] = [];

class Progression {
  readonly core: ProgressionCore;
  readonly hud: ProgressionHud;
  readonly cards: LevelCards;
  readonly world: PickupWorld;
  private readonly pages: { refresh(): void };
  private readonly questItems: Map<string, ItemDef>;
  private atHome = false;
  private promptFor: string | null = null;
  private promptText = '';
  private lastRefuse = 0;
  private time = 0;
  private started = false;
  private xpDirty = false;

  constructor(private readonly ctx: GameContext) {
    this.questItems = questsInPlay(loadBundledQuests(), ctx.params.has('storytest')).items;
    const slice = () => ctx.state.slice('progression', createProgressionSlice);
    slice();
    this.core = new ProgressionCore(slice, {
      emit: (type, payload) => ctx.events.emit(type, payload),
      item: (id) => this.item(id),
      setMembers: (set) => [...ITEMS, ...this.questItems.values()].filter((i) => i.set === set).map((i) => i.id),
      statOptions: () => ({ gentle: ctx.settings.state.gentleMode, rauhnacht: (ctx.settings.state as { rauhnacht?: boolean }).rauhnacht === true || ctx.state.state.flags['rauhnacht'] === true }),
      setLevelFlag: (level) => this.setLevelFlag(level),
      onCollection: (set, xp) => {
        this.hud.line('set', `Sammlung vollständig: ${set.name_de}`, undefined, xp ? `+${xp} EP` : undefined);
        collectionSound(ctx.audio);
      },
    });

    const layer = ctx.ui.layer('progression');
    layer.classList.remove('kq-hidden');
    layer.style.pointerEvents = 'none';
    layer.classList.add('kqp-layer');
    this.hud = new ProgressionHud(ctx.ui.hud, layer);
    this.cards = new LevelCards(layer);
    this.cards.onStamp = (req) => levelSound(ctx.audio, req.level);
    this.cards.levelNow = () => this.core.slice().level;
    // skill unlocks waiting as the level card comes up ride along on it (src/systems/skills)
    this.cards.absorb = () => [...ctx.ui.cards.drain<MergedSkillRow>('skill'), ...ctx.ui.cards.drain<MergedSkillRow>('ability')];
    this.world = new PickupWorld(
      (x, z, y) => ctx.world.heightAt(x, z, y),
      (id) => (this.item(id)?.kind ?? 'opaque') as ItemKind | 'opaque',
    );
    ctx.scene.add(this.world.group);
    this.pages = installProgressionPages({
      core: this.core,
      item: (id) => this.item(id),
      name: (id) => this.name(id),
      atHome: () => this.atHome,
      quickKey: () => this.key('quickUse'),
      changed: (reason) => this.changed(reason),
    });
    this.wire();
    this.restore(false);
  }

  // ---- lookups -------------------------------------------------------------------------------

  item(id: string): ItemDef | undefined {
    return itemDef(id) ?? this.questItems.get(id);
  }

  name(id: string): string {
    const def = this.item(id);
    if (def) return def.name_de;
    // an opaque quest item: "item.k1.lohn_zettel" → "Lohn Zettel"
    const tail = id.split('.').pop() ?? id;
    return tail.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** "nehmen" for a weapon or a quest thing (the Messstab, a Festplan), "aufheben" for the rest. */
  private verb(id: string): string {
    const k = this.item(id)?.kind;
    return k === 'weapon' || k === 'quest' || k === 'lore' ? 'nehmen' : 'aufheben';
  }

  private key(action: 'quickUse' | 'listen' | 'inventory'): string {
    return actionLabel({ touchMode: this.ctx.input.touchMode, bindings: effectiveBindings(this.ctx.settings.state.bindings) }, action);
  }

  private setLevelFlag(level: number): void {
    const flags = this.ctx.state.state.flags;
    if (flags['rpg.level'] === level) return;
    if (this.started) this.ctx.state.update((s) => (s.flags['rpg.level'] = level), 'rpg-level');
    else this.ctx.state.mutable.flags['rpg.level'] = level;
  }

  // ---- wiring --------------------------------------------------------------------------------

  private wire(): void {
    const { ctx } = this;
    const on: typeof ctx.events.on = (name, fn) => {
      const off = ctx.events.on(name, fn);
      disposeFns.push(off);
      return off;
    };
    on('xp:grant', ({ amount, reason, x, z, receipt }) => {
      const gained = this.core.grantXp(amount, reason, reason === 'debug');
      if (receipt) receipt.amount = gained;
      if (gained <= 0) return;
      if (x !== undefined && z !== undefined && Number.isFinite(x) && Number.isFinite(z)) this.hud.float(`+${gained} EP`, x, ctx.world.heightAt(x, z) + 1.9, z);
      else if (reason !== 'debug') this.hud.line('xp', `+${gained} Erfahrung`);
      this.changed('xp');
    });
    on('xp:gain', ({ amount }) => {
      this.hud.gain(amount);
      this.xpDirty = true; // redrawn once per frame, after any level-ups of the same grant
      xpTick(ctx.audio);
    });
    on('level:up', ({ level, points }) => {
      this.cards.push(level, points);
      this.pages.refresh();
    });
    on('item:grant', ({ item, count, reason, quiet, receipt }) => {
      const want = Math.max(1, count ?? 1);
      const got = this.core.grantItem(item, want, { reason, quiet });
      if (receipt) receipt.amount = got;
      if (got < want && !quiet) this.refuse(`Kein Platz mehr: ${this.name(item)} (${this.core.count(item)})`);
      this.changed('item');
    });
    on('item:pickup', ({ item, count, total, reason }) => {
      if (!this.core.quietNow) {
        const def = this.item(item);
        if (!reason?.startsWith('quest:')) {
          this.hud.line('item', `+ ${this.name(item)}`, iconFor(item, def), count > 1 || (def?.kind === 'consumable' && total > 1) ? `×${count}${total > count ? ` (${total})` : ''}` : undefined);
        }
        pickupSound(ctx.audio, def?.kind ?? 'quest');
      }
      this.updateQuick();
      this.pages.refresh();
    });
    on('equip:change', ({ slot, item }) => {
      if (item && !this.core.quietNow && slot === 'weapon') this.hud.line('item', `In der Hand: ${this.name(item)}`, iconFor(item, this.item(item)));
      this.pages.refresh();
    });
    on('item:use', ({ item }) => {
      useSound(ctx.audio, item);
      this.hud.quickPulse(true);
      this.updateQuick();
      this.pages.refresh();
    });
    on('talent:learned', () => this.pages.refresh());
    on('stats:changed', () => this.pages.refresh());
    on('codex:unlocked', ({ factId, noXp }) => {
      // a photo's codex card gives no XP (owner decision 2026-11-20, src/systems/photo)
      if (noXp) return;
      const got = this.core.codex(factId);
      if (got > 0) {
        this.hud.line('xp', `+${got} Erfahrung · Codex`);
        this.changed('codex');
      }
    });
    on('enemy:killed', (e) => {
      const def = ENEMIES.find((x) => x.id === e.kind);
      if (this.core.enemyKilled(e, def).length) this.syncWorld(true);
      this.changed('loot');
    });
    on('loot:place', (p) => {
      if (this.core.place({ ...p })) this.syncWorld(this.started);
      this.changed('loot');
    });
    on('loot:clear', (o) => {
      if (this.core.clear(o).length) this.syncWorld(false);
      this.changed('loot');
    });
    on('settings:change', ({ key }) => {
      if (key === 'gentleMode' || key === 'rauhnacht') this.core.refreshStats();
      if (key === 'bindings') this.updateQuick();
    });
    on('hub:enter', () => {
      this.atHome = true;
      this.pages.refresh();
    });
    on('hub:leave', () => {
      this.atHome = false;
      this.pages.refresh();
    });
    on('game:start', () => {
      this.started = true;
      this.core.refreshStats(true);
    });
    disposeFns.push(
      ctx.state.subscribe((_s, reason) => {
        if (reason === 'new' || reason === 'load' || reason === 'replace') this.restore(true);
      }),
    );
  }

  /** After boot / load / new game: rebuild everything from the slice, no cards, no sounds. */
  restore(clearCards: boolean): void {
    const wasStarted = this.started;
    this.started = false;
    this.core.restore();
    this.started = wasStarted;
    if (clearCards) this.cards.clear();
    this.hud.clearFloats();
    this.world.clear();
    this.syncWorld(false);
    this.updateXp(false);
    this.updateQuick();
    this.pages.refresh();
  }

  private syncWorld(animate: boolean): void {
    this.world.sync(this.core.pickups(), animate);
  }

  private changed(reason: string): void {
    this.updateQuick();
    this.pages.refresh();
    if (this.started) this.ctx.save.autosave(`progression-${reason}`);
  }

  private updateXp(animate: boolean): void {
    const s = this.core.slice();
    const lvl = s.level;
    const base = LEVEL_XP[lvl - 1] ?? 0;
    const next = lvl >= MAX_LEVEL ? 0 : LEVEL_XP[lvl]! - base;
    this.hud.setXp(lvl, s.xp - base, next, s.xp, animate);
  }

  private updateQuick(): void {
    const id = this.core.quickItem();
    this.hud.setQuick(this.key('quickUse'), id, this.name(id), this.core.count(id), iconFor(id, this.item(id)));
  }

  private refuse(text: string): void {
    const now = this.time;
    if (now - this.lastRefuse < 1.5) return;
    this.lastRefuse = now;
    this.hud.line('full', text);
  }

  quickUse(item?: string): boolean {
    const id = item ?? this.core.quickItem();
    if (this.core.use(id)) {
      this.changed('use');
      return true;
    }
    this.hud.quickPulse(false);
    this.refuse(this.item(id)?.kind === 'consumable' ? `Kein ${this.name(id)} mehr.` : `${this.name(id)} kann man nicht benutzen.`);
    return false;
  }

  // ---- pickups in the world ---------------------------------------------------------------------

  /** Is the pickup in what the player sees now (era, storey)? */
  private shown = (p: PlacedPickup): boolean => {
    if (p.era !== this.ctx.era.current) return false;
    if (p.y === undefined && !p.room) return true;
    const ground = this.ctx.world.heightAt(p.x, p.z, p.y);
    return Math.abs(this.ctx.player.position.y - ground) < STOREY;
  };

  take(id: string): number {
    const p = this.core.slice().placed?.[id];
    if (!p) return 0;
    const got = this.core.take(id);
    if (got > 0) {
      this.world.collect(id);
      // the first Messstab comes with two Kräuterbalsam in the bag (Marlene's radio line says
      // so; playtest: "Der Balsam ist in der Tasche" while the HUD showed ×0) — granted before the
      // save, which is forced (round 9: a reload right after the pickup lost the two Balsam, the
      // throttled autosave had run between the staff and the grant)
      const flags = this.ctx.state.state.flags;
      const starter = p.item === 'item.stab.esche' && !flags['progression.starterBalsam'];
      if (starter) {
        flags['progression.starterBalsam'] = true;
        this.ctx.events.emit('item:grant', { item: 'item.balsam', count: 2 });
      }
      this.changed('pickup');
      if (starter && this.started) this.ctx.save.autosave('progression-starter', true);
    } else this.refuse(`Kein Platz mehr: ${this.name(p.item)} (${this.core.count(p.item)})`);
    return got;
  }

  private pickupTick(): void {
    const { ctx } = this;
    const hud = ctx.ui.hud;
    const pl = ctx.player.position;
    let near: { p: PlacedPickup; d: number } | null = null;
    if (!ctx.player.flying) {
      for (const p of this.core.pickups()) {
        if (!this.shown(p)) continue;
        const d = Math.hypot(pl.x - p.x, pl.z - p.z);
        if (d < (p.drop ? WALK_R_DROP : WALK_R) && this.core.room(p.item) > 0) {
          this.take(p.id);
          continue;
        }
        if (d < REACH && (!near || d < near.d)) near = { p, d };
      }
    }
    // E: only while our prompt is the one on screen (an NPC's or a clue's E wins)
    const promptEl = typeof document !== 'undefined' ? document.querySelector('.kq-prompt') : null;
    // a low prompt (the home's rest prompt) gives way: the pickup's E comes first
    const shownText = promptEl?.classList.contains('show') && !hud.promptFree() ? (promptEl.textContent ?? '') : '';
    const ours = !!this.promptFor && hud.promptOwner() === 'progression';
    if (near && ours && ctx.input.wasPressed('listen')) {
      this.take(near.p.id);
      near = null;
    }
    const want = near?.p.id ?? null;
    if (want !== this.promptFor) {
      if (want && (!shownText || ours)) {
        // a full stack cannot take more: say so instead of offering E
        const full = this.core.room(near!.p.item) <= 0;
        // the prompt names the action (playtest 2026-11-19): "E  Messstab nehmen"
        this.promptText = full ? `${this.name(near!.p.item)}: voll` : `${this.name(near!.p.item)} ${this.verb(near!.p.item)}`;
        hud.prompt(full ? null : this.key('listen'), this.promptText, 'progression');
        this.promptFor = want;
      } else if (!want) {
        hud.prompt(null, undefined, 'progression');
        this.promptFor = null;
      }
    }
  }

  // ---- loop ---------------------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    if (this.ctx.input.wasPressed('quickUse')) this.quickUse();
    if (this.ctx.input.wasPressed('inventory') && this.ctx.ui.modals.count === 0) {
      openPausePage(this.ctx.ui.modals, 'gear');
    }
    this.pickupTick();
  }

  frame(dt: number): void {
    const { ctx } = this;
    const reduced = ctx.settings.state.reducedMotion;
    const t = ctx.loop.time;
    const canvas = ctx.renderer.domElement;
    this.world.frame(dt, t, ctx.camera, canvas.clientHeight || window.innerHeight, ctx.player.position, this.shown, reduced);
    if (this.xpDirty) {
      this.xpDirty = false;
      this.updateXp(true);
    }
    this.hud.frame(dt, ctx.camera, window.innerWidth, window.innerHeight);
    const skillCard = !!document.querySelector('.kqk-card.kqk-in:not(.kqk-out):not(.kqk-held)');
    let hold = ctx.pause.reasons.has('title') || skillCard || ctx.ui.cards.held;
    if (this.cards.wants && !hold && !ctx.ui.cards.claim('level')) hold = true;
    this.cards.frame(ctx.pause.paused ? 0 : Math.min(dt, 0.1), reduced, hold);
    if (!this.cards.wants) ctx.ui.cards.release('level');
  }

  dispose(): void {
    pausePageHandle('gear')?.close();
    pausePageHandle('talents')?.close();
    this.cards.clear();
    this.world.clear();
    this.ctx.scene.remove(this.world.group);
  }
}

let sys: Progression | null = null;

export default defineSystem({
  id: 'progression',
  init(ctx: GameContext) {
    const p = new Progression(ctx);
    sys = p;
    hooks = {
      state: () => structuredClone(p.core.slice()),
      xp: (n, at) => ctx.events.emit('xp:grant', { amount: n, reason: 'debug', x: at?.x, z: at?.z }),
      level: (n) => p.core.setLevel(n),
      grant: (item, n = 1, quiet) => ctx.events.emit('item:grant', { item, count: n, quiet }),
      equip: (item) => p.core.equip(item),
      use: (item) => p.quickUse(item),
      learn: (talent) => p.core.learn(talent),
      respec: () => p.core.respec(),
      place: (id, item, x, z, era, extra) => ctx.events.emit('loot:place', { ...extra, id, item, x, z, era: era ?? ctx.era.current }),
      pickups: () => p.core.pickups().map((x) => ({ ...x, vis: p.world.visibility(x.id) })),
      take: (id) => p.take(id),
      stats: () => p.core.stats(),
      card: () => {
        const c = p.cards.showing;
        return c ? { level: c.level, held: p.cards.held } : null;
      },
      feed: () => p.hud.history.map((x) => x.text),
    };
  },
  update(dt) {
    sys?.update(dt);
  },
  frame(dt) {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.progression !== hooks) window.kq.progression = hooks;
    sys?.frame(dt);
  },
  dispose() {
    for (const f of disposeFns) f();
    disposeFns = [];
    sys?.dispose();
    sys = null;
  },
});
