/**
 * Feature "combat" — the player's Lebenskraft / Atem / Bannlicht, the Messstab (Hieb combo,
 * Wuchthieb), the dodge roll, spectral enemies with telegraphed attacks, four bosses, hit-stop,
 * screen shake and particles (docs/ACTION-RPG.md §4–§5, ARCHITECTURE §12.1 "combat").
 *
 * Modules: rules.ts (pure numbers, unit-tested), sim.ts (the deterministic simulation), bosses.ts,
 * bodies.ts + visuals.ts (instanced spectral bodies, rings, particles), viewmodel.ts (the staff),
 * audio.ts (procedural sfx), hud.ts (vitals, Bannlicht pips, boss bar, captions, numbers).
 *
 * Contract (src/systems/contracts.ts): listens to enemy:spawn / despawn (quests, story),
 * stats:changed / equip:change / item:use (progression), era:change, hub:enter / leave,
 * memorial:set, npc:spawn / despawn / conversation, game:start, save:loaded, settings:change;
 * emits enemy:spawned / killed / cleared / aggro, boss:phase, combat:hit / state / bann,
 * player:damaged / healed / died, xp:grant (kills) and player:caught {by:'combat'}.
 * Input actions: attack (LMB / K; hold = Wuchthieb), bannlicht (RMB / G), dodge (Space), the
 * abilities skill1–3 (T / Z(Y) / U: Ausfall from level 2, Erdstoß from 4, Wirbel from 6).
 * Respects flags['combat.disabled'], flags['tools.measuring'], modals, conversations, memorials,
 * the field station and the 6 m around a placed NPC (safe zones).
 * State: `state.systems.combat` (CombatSlice, src/rpg/types.ts).
 */
import '../contracts';
import './strings';
import type { GameContext } from '../../core/context';
import type { Settings, SettingsStore } from '../../core/save';
import { defineSystem } from '../../core/systems';
import { t } from '../../i18n';
import { enemyDef } from '../../rpg/enemies';
import { itemDef } from '../../rpg/items';
import { deriveStats } from '../../rpg/stats';
import type { CombatSlice, DerivedStats, EnemyGroupState } from '../../rpg/types';
import { h } from '../../ui/dom';
import { type SettingsRow, addSettingsRows } from '../../ui/settings';
import { keyLabel } from '../../ui/settings';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { atmosphere } from '../../world/atmosphere';
import { lanternPose } from '../hunt/lantern';
import { CombatAudio } from './audio';
import { CombatHud, type PipTarget, type SkillSlot } from './hud';
import { DODGE, SHAKE, SKILLS, SKILL_IDS, type SafeReason, type SkillId, forwardOf, groupsToReset, safeReason, skillCooldown, skillsForLevel, upsertGroup, wrapAngle, headingOf } from './rules';
import { CombatSim, type Enemy, KINDS, type SimEvent, type SimInput, type TimeOfDay, touchable } from './sim';
import { BOSS_HINT, BOSS_TITLE, TELL } from './strings';
import { CombatVisuals, type DissolveKind, hullDistance } from './visuals';
import { Viewmodel, stageOf } from './viewmodel';
import { type TargetCandidate, Targeting } from './targeting';
import { cameraHints } from '../../player/camera';

declare module '../../core/state' {
  interface SystemStates {
    combat: CombatSlice;
  }
}

declare module '../../core/save' {
  interface Settings {
    /** Floating damage numbers ("Schadenszahlen", default on). */
    damageNumbers?: boolean;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** combat → hunt: a staff swing (the hunt shows a line when it passes through a hound). */
    'combat:swing': { x: number; z: number; yaw: number; reach: number };
  }
}

export interface SpawnOpts {
  x?: number;
  z?: number;
  /** Metres in front of the view (default 6) and degrees to the right. */
  dist?: number;
  angle?: number;
  count?: number;
  boss?: boolean;
  tier?: number;
  group?: string;
  era?: string;
  radius?: number;
  time?: 'any' | 'dusk' | 'night';
}

export interface CombatHooks {
  state(): CombatSlice & { inCombat: boolean; exhausted: boolean; dead: boolean; god: boolean; boss: { kind: string; hp: number; max: number; phase: number } | null };
  /** Spawn a group as content would (default 6 m in front of the view, current era). Returns the group id. */
  spawn(kind: string, opts?: SpawnOpts): string;
  /** Undo enemies: a group, an enemy id, a kind — or all. Returns how many. */
  kill(groupOrId?: string): number;
  /** Swing n light hits (as if K was tapped n times; steps the loop). */
  hit(n?: number): void;
  bann(): void;
  dodge(): void;
  god(on?: boolean): boolean;
  groups(): Record<string, EnemyGroupState>;
  /** Live enemies (copy). */
  enemies(): { id: string; group: string; kind: string; x: number; y: number; z: number; hp: number; max: number; state: string; stun: number; phase: number; heading: number }[];
  /** Place an enemy (or every member of a group) at x/z; `facePlayer` turns it to the player. */
  place(idOrGroup: string, x: number, z: number, facePlayer?: boolean): void;
  /** Force an enemy into its wind-up (screenshots): attack id optional. */
  windup(idOrGroup: string, attack?: string, progress?: number): void;
  /** Freeze the enemies' AI (perception and visuals keep running). */
  freeze(on?: boolean): void;
  /** Use an ability (as if its key was pressed; steps the loop once). Returns why not, or 'ok'. */
  skill(id: SkillId): string;
  /** Damage the player (tests). */
  hurt(amount: number): void;
  heal(amount?: number): void;
  /** Contract events seen so far (name, payload, tick). */
  events(): { name: string; payload: unknown; tick: number }[];
  /** Camera shake trauma (0 = still). */
  shake(): number;
  sim(): CombatSim | null;
  /** Readability (round 6): how far the camera is pulled out of a big body (m), each enemy's dither (1 = solid). */
  view(): { pull: number; vis: Record<string, number> };
  /** Lock-on (third-person camera): lock / switch like Tab (no id), lock an id, or null to release. Returns the lock. */
  lock(id?: string | null): string | null;
  /** The locked and the soft target. */
  target(): { locked: string | null; soft: string | null };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    combat?: CombatHooks;
  }
}

export function createCombatSlice(): CombatSlice {
  return { hp: 100, stamina: 100, bann: 2, groups: {}, deaths: 0 };
}

const DISSOLVE_STYLES: readonly DissolveKind[] = ['mist', 'sparks', 'smoke', 'ash', 'paper', 'grit-rising', 'fade'];

/** Seconds of calm after which an ability unlock no level card took is told by a toast. */
const ABILITY_TOAST_AFTER = 10;

class Combat {
  readonly sim: CombatSim;
  readonly visuals = new CombatVisuals();
  readonly viewmodel = new Viewmodel();
  readonly audio: CombatAudio;
  readonly hud: CombatHud;
  /** Lock-on / soft target, the ring under it, indicators round the character (targeting.ts). */
  readonly targeting: Targeting;
  private cands: TargetCandidate[] = [];
  private statsFromProgression: DerivedStats | null = null;
  private readonly memorials = new Map<string, { x?: number; z?: number; r?: number; era?: string; room?: string; active: boolean }>();
  private readonly npcs = new Map<string, { x: number; z: number; era?: string }>();
  private talking = false;
  private inHub = false;
  private safe: SafeReason = null;
  private deadT = -1;
  private caughtSent = false;
  private trauma = 0;
  private shakeNow = 0;
  private bannFx: { t: number; x: number; z: number; yaw: number; range: number; angle: number } | null = null;
  private readonly log: { name: string; payload: unknown; tick: number }[] = [];
  private frozenAI = false;
  private mouseTick = -10;
  /** The pack chases you (running costs Atem). */
  private hunted = false;
  /** Caught (by anything): the next teleport is the wake. */
  private wakePending = false;
  private anchorHealed = false;
  private hooksInstalled = false;
  private lastCaption = new Map<string, number>();
  private moving = 0;
  /** Abilities known (level) — null before the first stats pass (no unlock toast on load). */
  private skillsKnown: SkillId[] | null = null;
  /** A newly unlocked ability waiting for the level card (or, failing that, a toast). */
  private pendingAbility: SkillId | null = null;
  private pendingAbilityT = 0;
  /** Ausfall streak start (visuals). */
  private lungeFrom: { x: number; z: number } | null = null;
  /** A boss's reveal: the camera turns to it for a moment (off with reduced motion). */
  private introCam: { e: Enemy; t: number; dur: number } | null = null;
  /** A boss undone: the fight runs slow for a moment (s left; off with reduced motion). */
  private deathSlow = 0;
  /** Seconds of game time the boss's title card stays up. */
  private titleLeft = 0;
  /** A boss whose way in is said right after its title card (playtest round 9: twelve blows into the front at 420/420). */
  private hintAfterTitle: string | null = null;
  /** Seconds (game time) the boss reveal still holds the dialogue. */
  private revealLeft = 0;
  /** Smoothed camera pull-back out of a big body (m, visual only). */
  private clearPull = 0;
  private readonly clearDir = new Vector3();

  constructor(readonly ctx: GameContext) {
    this.audio = new CombatAudio(ctx.audio);
    this.sim = new CombatSim(
      {
        heightAt: (x, z) => ctx.world.heightAt(x, z),
        isWater: (x, z) => ctx.world.surfaceAt(x, z) === 'water',
        waterDepth: (x, z) => ctx.world.water?.depthInside(x, z) ?? -Infinity,
        walkable: (x, z) => {
          const w = ctx.world;
          if (w.collider.enabled && w.collider.footprintAt(x, z) >= 0 && !ctx.state.state.flags['interior.room']) return false;
          return w.heightfield.slopeDeg(x, z) < 50;
        },
      },
      this.slice().groups,
      { gentle: ctx.settings.state.gentleMode, reducedMotion: ctx.settings.state.reducedMotion, stats: this.computeStats(), sweep: false, konter: false, waerme: false, dritter: false },
    );
    this.applyStats();
    // restore the saved resources
    const s = this.slice();
    if (s.hp > 0) this.sim.p.hp = Math.min(this.sim.p.max, s.hp);
    this.sim.p.st.stamina = Math.min(this.sim.p.st.max, s.stamina);
    this.sim.p.bann = Math.min(this.sim.p.bannMax, s.bann);
    ctx.scene.add(this.visuals.object);
    ctx.scene.add(this.viewmodel.root);
    this.visuals.setQuality(ctx.quality.level);
    this.visuals.setAssets(ctx.quality.level === 'low' ? null : ctx.assets);
    ctx.quality.listeners.push((_p, level) => this.visuals.setAssets(level === 'low' ? null : ctx.assets));
    this.hud = new CombatHud(ctx.ui.hud, ctx.ui.layer('combat'));
    this.targeting = new Targeting(ctx.scene, ctx.ui.layer('combat'));
    this.viewmodel.setStage(stageOf(ctx.state.state.systems.progression?.equipped?.weapon));
    this.wire();
    ctx.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseTick = ctx.loop.tick;
    });
  }

  slice(): CombatSlice {
    const s = this.ctx.state.slice('combat', createCombatSlice);
    if (!s.groups || typeof s.groups !== 'object') s.groups = {};
    if (typeof s.deaths !== 'number') s.deaths = 0;
    return s;
  }

  private computeStats(): DerivedStats {
    if (this.statsFromProgression) return this.statsFromProgression;
    const st = this.ctx.settings.state;
    return deriveStats(this.ctx.state.state.systems.progression ?? null, { gentle: st.gentleMode, rauhnacht: st.rauhnacht === true || this.ctx.state.state.flags['rauhnacht'] === true });
  }

  private applyStats(): void {
    const prog = this.ctx.state.state.systems.progression;
    const talents = prog?.talents ?? {};
    const weapon = prog?.equipped?.weapon;
    this.sim.setStats(this.computeStats());
    this.sim.setGentle(this.ctx.settings.state.gentleMode);
    this.sim.setNovice((prog?.level ?? 1) <= 2);
    this.sim.opt.reducedMotion = this.ctx.settings.state.reducedMotion;
    this.sim.opt.sweep = itemDef(weapon ?? '')?.effect?.sweep === true;
    this.sim.opt.konter = (talents['stab.konter'] ?? 0) > 0;
    this.sim.opt.waerme = (talents['laterne.waerme'] ?? 0) > 0;
    this.sim.opt.dritter = (talents['stab.dritter'] ?? 0) > 0;
    // abilities by level (combat variety pass); a new one is announced once
    const skills = skillsForLevel(prog?.level ?? 1);
    const before = this.skillsKnown;
    this.sim.opt.skills = skills;
    this.skillsKnown = skills;
    // one toast even when several unlock at once (a level jump): the newest, with its key
    const fresh = before ? skills.filter((id) => !before.includes(id)) : [];
    if (fresh.length) this.announceSkill(fresh[fresh.length - 1]!);
  }

  private skillKey(id: SkillId): string {
    const action = (['skill1', 'skill2', 'skill3'] as const)[SKILL_IDS.indexOf(id)]!;
    return keyLabel(this.ctx.input.bindings[action]?.[0] ?? '');
  }

  /**
   * A new ability rides on the level card that comes with it (one card, not a card and a toast);
   * if no level card takes it within `ABILITY_TOAST_AFTER` s of calm, a toast says it instead.
   */
  private announceSkill(id: SkillId): void {
    this.pendingAbility = id;
    this.pendingAbilityT = 0;
  }

  private abilityRow(id: SkillId): { name: string; tier: string; key: string; desc: string } {
    return { name: t(`combat.skill.${id}`), tier: '', key: this.skillKey(id), desc: t(`combat.skill.${id}.desc`) };
  }

  private framePendingAbility(dt: number): void {
    const id = this.pendingAbility;
    if (!id) return;
    if (!this.ctx.ui.cards.held) this.pendingAbilityT += dt;
    if (this.pendingAbilityT < ABILITY_TOAST_AFTER) return;
    this.pendingAbility = null;
    const r = this.abilityRow(id);
    this.ctx.ui.toast(t('combat.skill.unlock', { name: r.name, key: r.key, desc: r.desc }), 6500);
  }

  private emit<K extends keyof import('../../core/events').GameEvents>(name: K, payload: import('../../core/events').GameEvents[K]): void {
    this.ctx.events.emit(name, payload);
  }

  private wire(): void {
    const ev = this.ctx.events;
    const ctx = this.ctx;
    // the level card takes a waiting ability unlock along (src/ui/cards.ts sources)
    ctx.ui.cards.source('ability', () => {
      const id = this.pendingAbility;
      this.pendingAbility = null;
      return id ? [this.abilityRow(id)] : [];
    });
    ev.onAny((name, payload) => {
      if (/^(enemy:|boss:|combat:(hit|state|bann)|player:(damaged|healed|died|caught)|menagerie:calmed|xp:grant)/.test(name)) {
        this.log.push({ name, payload, tick: ctx.loop.tick });
        if (this.log.length > 400) this.log.shift();
      }
    });
    ev.on('enemy:spawn', (r) => {
      if (!enemyDef(r.kind)) {
        console.warn(`[combat] enemy:spawn with unknown kind '${r.kind}'`);
        return;
      }
      upsertGroup(this.slice().groups, { ...r });
    });
    ev.on('enemy:despawn', ({ group }) => this.sim.despawn(group));
    ev.on('stats:changed', ({ stats }) => {
      this.statsFromProgression = stats;
      this.applyStats();
    });
    ev.on('equip:change', ({ slot, item }) => {
      if (slot === 'weapon') this.viewmodel.setStage(stageOf(item));
      this.applyStats();
    });
    ev.on('talent:learned', () => this.applyStats());
    ev.on('item:use', ({ item }) => this.useItem(item));
    ev.on('settings:change', ({ key }) => {
      if (key === 'gentleMode' || key === 'rauhnacht' || key === 'reducedMotion') this.applyStats();
      if (key === 'graphics') this.visuals.setQuality(ctx.quality.level);
    });
    ev.on('era:change', ({ from, to }) => {
      // a shift into the past is a fresh start: Lebenskraft and Bannlicht full (playtest round 4:
      // the third try at the Pikeur began at 61/172)
      if (from === 'today' && to !== 'today' && !this.sim.p.dead) this.restore('shift');
      this.sim.dematerialise();
      this.hud.clearWorld();
      this.visuals.clearParticles();
      this.hud.hideTitle(true);
      this.titleLeft = 0;
      this.ctx.ui.hud.busy('reveal', false, 0);
      this.revealLeft = 0;
      this.introCam = null;
      this.deathSlow = 0;
    });
    ev.on('hub:enter', () => {
      this.inHub = true;
      this.restore('station');
    });
    ev.on('hub:leave', () => (this.inHub = false));
    ev.on('memorial:set', (m) => {
      if (m.active) this.memorials.set(m.id, { x: m.x, z: m.z, r: m.r, era: m.era, room: m.room, active: true });
      else this.memorials.delete(m.id);
    });
    ev.on('npc:spawn', (n) => {
      if (n.x !== undefined && n.z !== undefined) this.npcs.set(n.npc, { x: n.x, z: n.z, era: n.era ?? ctx.era.current });
    });
    ev.on('npc:despawn', ({ npc }) => {
      if (npc === '*') this.npcs.clear();
      else this.npcs.delete(npc);
    });
    ev.on('npc:conversation', ({ open }) => (this.talking = open));
    ev.on('save:loaded', () => {
      this.statsFromProgression = null;
      this.sim.groups = this.slice().groups;
      this.sim.dematerialise();
      this.applyStats();
      const s = this.slice();
      this.sim.p.hp = s.hp > 0 ? Math.min(this.sim.p.max, s.hp) : this.sim.p.max;
      this.sim.p.dead = false;
      this.deadT = -1;
      this.hud.clearWorld();
    });
    ev.on('game:start', ({ resumed }) => {
      if (!resumed) {
        this.sim.groups = this.slice().groups;
        this.sim.dematerialise();
        this.sim.restore();
      }
    });
    // a player who wakes up after being undone gets everything back
    ev.on('player:caught', () => {
      this.wakePending = true;
      // no damage tally left floating over the curtain into the wake (playtest round 5: "−117")
      this.hud.clearWorld();
    });
    ev.on('hunt:alert', ({ state }) => (this.hunted = state === 'chasing'));
    ev.on('hunt:end', () => (this.hunted = false));
    ev.on('player:teleport', () => {
      if (this.wakePending || this.sim.p.dead) this.hud.clearWorld();
      if (this.sim.p.dead && this.caughtSent) this.revive();
      // caught by a story threat (fire, pack, oblivion) and woken: whole again too
      else if (this.wakePending) this.restore('wake');
      this.wakePending = false;
    });
    addSettingsRows(damageRows);
  }

  /** Full heal: the field station, anchors, waking up. */
  restore(by: string): void {
    const p = this.sim.p;
    const before = p.hp;
    this.sim.restore();
    const amt = p.hp - before;
    if (amt > 0) this.emit('player:healed', { amount: amt, hp: p.hp, max: p.max, by });
  }

  private revive(): void {
    this.deadT = -1;
    this.caughtSent = false;
    this.restore('wake');
    this.viewmodel.jolt();
  }

  private useItem(item: string): void {
    const e = itemDef(item)?.effect;
    if (!e) return;
    const s = this.sim.opt.stats;
    if (e.heal || e.stamina || e.bann || e.burst) this.sim.drink();
    if (e.heal) {
      const a = this.sim.heal(e.heal * s.healing, item);
      if (a > 0) this.emit('player:healed', { amount: a, hp: this.sim.p.hp, max: this.sim.p.max, by: item });
    }
    if (e.stamina) {
      const st = this.sim.p.st;
      st.stamina = Math.min(st.max, st.stamina + e.stamina);
      st.exhausted = false;
    }
    if (e.bann) this.sim.p.bann = Math.min(this.sim.p.bannMax, this.sim.p.bann + e.bann);
    if (e.burst) {
      const n = this.sim.burst(e.burst);
      if (n) this.hud.caption(t('combat.burst'), 'info');
    }
  }

  // ---- input ----------------------------------------------------------------------------------

  private timeOfDay(): TimeOfDay {
    const ctx = this.ctx;
    const L = ctx.world.look;
    if (ctx.era.info.night || L.disc === 'moon' || L.sky.stars >= 0.6) return 'night';
    if (L.sun.elevation < 7) return 'dusk';
    return 'day';
  }

  /** An interact target (E prompt from npc / chronik / story) takes the left mouse button. */
  private interactTarget(): boolean {
    // in a fight the left button always swings (the prompt is hidden then)
    if (this.sim.p.inCombat) return false;
    return !!this.ctx.ui.hud.el.querySelector('.kq-prompt.show');
  }

  private safeNow(): SafeReason {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const f = ctx.state.state.flags;
    const room = typeof f['interior.room'] === 'string' ? (f['interior.room'] as string) : '';
    return safeReason({
      x: p.x,
      z: p.z,
      era: ctx.era.current,
      disabled: f['combat.disabled'] === true,
      hub: this.inHub,
      talking: this.talking,
      modal: ctx.ui.modals.count > 0,
      memorials: [...this.memorials.values()],
      room: room || undefined,
      npcs: [...this.npcs.values()],
      engaged: this.sim.p.inCombat,
    });
  }

  private input(): SimInput {
    const ctx = this.ctx;
    const inp = ctx.input;
    const pl = ctx.player;
    const f = ctx.state.state.flags;
    let fx = 0;
    let fz = 0;
    if (!pl.frozen) {
      if (inp.isDown('forward')) fz -= 1;
      if (inp.isDown('back')) fz += 1;
      if (inp.isDown('left')) fx -= 1;
      if (inp.isDown('right')) fx += 1;
    }
    const c = Math.cos(pl.yaw);
    const s = Math.sin(pl.yaw);
    const moveX = fx * c + fz * s;
    const moveZ = -fx * s + fz * c;
    this.moving = Math.min(1, pl.stats.speed / 4);
    const disabled = f['combat.disabled'] === true;
    const blocked = !inp.enabled || ctx.ui.modals.count > 0 || pl.flying || pl.frozen || f['tools.measuring'] === true || disabled || this.talking;
    let attackPressed = inp.wasPressed('attack');
    // LMB belongs to the interact target (examine, talk) when there is one
    if (attackPressed && this.mouseTick >= ctx.loop.tick - 1 && this.interactTarget()) attackPressed = false;
    if ((attackPressed || inp.wasPressed('bannlicht')) && disabled) this.captionOnce('lowered', t('combat.lowered'), 'info', 6);
    const skill: SkillId | null = inp.wasPressed('skill1') ? 'ausfall' : inp.wasPressed('skill2') ? 'erdstoss' : inp.wasPressed('skill3') ? 'wirbel' : null;
    // targeting (third-person camera): Tab / middle mouse locks; swings go at the lock or the soft target
    this.cands = this.candidates();
    if (inp.wasPressed('lockOn') && !blocked) this.targeting.press(this.cands, pl.position.x, pl.position.z, pl.yaw);
    this.targeting.update(this.cands, pl.position.x, pl.position.z, pl.yaw, pl.thirdPerson && !blocked);
    const aim = blocked ? null : this.targeting.aimYaw(this.cands, pl.position.x, pl.position.z);
    return {
      x: pl.position.x,
      y: pl.position.y,
      z: pl.position.z,
      yaw: aim ?? pl.yaw,
      moveX,
      moveZ,
      attackDown: inp.isDown('attack'),
      attackPressed,
      bannPressed: inp.wasPressed('bannlicht'),
      dodgePressed: inp.wasPressed('dodge'),
      skill,
      running: inp.isDown('sprint') && (fx !== 0 || fz !== 0) && pl.stance === 'stand',
      hunted: this.hunted,
      blocked,
      noDodge: pl.flying || pl.stance !== 'stand',
      safe: this.safe,
      era: ctx.era.current,
      time: this.timeOfDay(),
    };
  }

  /** Enemies the player can target (alive, here, not leaving). */
  private candidates(): TargetCandidate[] {
    const out: TargetCandidate[] = [];
    for (const e of this.sim.enemies) {
      if (e.state === 'dissolve' || e.state === 'leave' || e.state === 'intro') continue;
      const hull = this.visuals.hullOf(e);
      out.push({ id: e.id, x: e.x, y: e.y, z: e.z, r: Math.max(e.radius, Math.min(hull.r, hull.f + 0.4)), top: this.visuals.topOf(e), boss: e.boss, windup: e.state === 'windup', aggro: e.aggro, open: touchable(e), pinned: e.stun > 0 && !e.boss });
    }
    return out;
  }

  /** Blows in a row a boss's armour threw back (the way in is said after four). */
  private bounces = 0;
  private bounceAt = -99;

  private captionOnce(key: string, text: string, cls = '', every = 4, ms = 1600): void {
    const now = this.ctx.loop.time;
    const last = this.lastCaption.get(key);
    if (last !== undefined && now - last < every) return;
    this.lastCaption.set(key, now);
    if (this.ctx.settings.state.subtitles === false && cls !== 'boss') return;
    this.hud.caption(text, cls, ms);
  }

  // ---- update ---------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    this.installHooks();
    this.safe = this.safeNow();
    const inp = this.input();
    // a boss undone: the world of the fight slows for a breath
    const slowK = this.deathSlow > 0 ? 0.3 : 1;
    this.deathSlow = Math.max(0, this.deathSlow - dt);
    if (this.revealLeft > 0) {
      this.revealLeft -= dt;
      if (this.revealLeft <= 0) ctx.ui.hud.busy('reveal', false, 0);
    }
    const evs = this.frozenAI ? this.stepFrozen(dt * slowK, inp) : this.sim.step(dt * slowK, inp);
    for (const e of evs) this.onEvent(e, inp);
    // the player's movement hooks
    const pl = ctx.player;
    // a lock keeps its target in the picture (the view turns only when it would slip out)
    if (this.targeting.locked && !pl.lookLocked && !pl.frozen && ctx.ui.modals.count === 0 && !this.introCam) pl.yaw = this.targeting.keepInView(this.cands, pl.position.x, pl.position.z, pl.yaw, dt);
    pl.moveScale = this.sim.moveScale;
    pl.canSprint = this.sim.canSprint;
    // anchors heal (the story's shift anchor: shift.allowed and within its radius)
    const f = ctx.state.state.flags;
    const atAnchor = f['shift.allowed'] === true && typeof f['shift.x'] === 'number' && typeof f['shift.z'] === 'number' && Math.hypot(pl.position.x - (f['shift.x'] as number), pl.position.z - (f['shift.z'] as number)) <= ((f['shift.r'] as number) || 8);
    if (atAnchor && !this.sim.p.inCombat && !this.anchorHealed) {
      this.anchorHealed = true;
      this.restore('anchor');
    } else if (!atAnchor) this.anchorHealed = false;
    // death → the story's curtain
    if (this.deadT >= 0) {
      this.deadT += dt;
      if (this.deadT > 0.9 && !this.caughtSent) {
        this.caughtSent = true;
        this.slice().deaths++;
        // nothing is lost: unfinished groups come back whole, bosses at phase 1
        for (const g of groupsToReset(this.slice().groups)) this.sim.dematerialise(g);
        this.sim.dematerialise();
        // the curtain names what threw you down (by family: mist, paper, stone ...)
        const def = enemyDef(this.sim.lastHitBy);
        const fam = def?.family;
        const boss = def?.boss === true || this.sim.live().some((e) => e.boss && e.aggro);
        this.emit('player:caught', { by: 'combat', ...(fam ? { family: fam } : {}), ...(boss ? { boss: true } : {}) });
      }
      // no story to wake us (or it never teleports): get up after a while
      if (this.caughtSent && this.deadT > 8 && !pl.frozen) this.revive();
    }
    // mirror the resources into the slice (saved)
    const s = this.slice();
    s.hp = Math.round(this.sim.p.hp * 10) / 10;
    s.stamina = Math.round(this.sim.p.st.stamina);
    s.bann = this.sim.p.bann;
  }

  /** Debug freeze: the enemies hold still, the player's side still runs. */
  private stepFrozen(dt: number, inp: SimInput): SimEvent[] {
    const saved = this.sim.enemies.map((e) => ({ e, x: e.x, z: e.z, t: e.t, state: e.state, h: e.heading }));
    const out = this.sim.step(dt, inp);
    for (const s of saved) {
      if (s.e.state === 'dissolve' || s.state === 'dissolve') continue;
      if (s.e.hp <= 0) continue;
      s.e.x = s.x;
      s.e.z = s.z;
      s.e.heading = s.h;
      if (s.e.state !== 'gebannt' && s.e.state !== 'stagger' && s.e.state !== 'leave') {
        s.e.state = s.state;
        s.e.t = s.t;
      }
    }
    return out;
  }

  private posOf(e: Enemy, up = 0.8): { x: number; y: number; z: number } {
    return { x: e.x, y: e.y + up, z: e.z };
  }

  private onEvent(ev: SimEvent, inp: SimInput): void {
    const ctx = this.ctx;
    const st = ctx.settings.state;
    const rm = st.reducedMotion;
    switch (ev.type) {
      case 'spawned': {
        const e = ev.e;
        if (!e.add) this.emit('enemy:spawned', { id: e.id, group: e.group, kind: e.kind, x: e.x, z: e.z, era: ctx.era.current, boss: e.boss });
        break;
      }
      case 'aggro':
        this.emit('enemy:aggro', { id: ev.e.id, kind: ev.e.kind, on: ev.on });
        break;
      case 'telegraph': {
        const e = ev.e;
        const key = `${e.kind}.${ev.attack.id}`;
        const text = TELL[key];
        if (text) {
          if (e.boss) this.captionOnce(`tell:${key}`, text, 'boss', 0.5, Math.max(1200, ev.dur * 1000 + 300));
          else this.captionOnce(`tell:${key}`, text, '', 2.5, Math.max(900, ev.dur * 1000 + 200));
        }
        this.audio.telegraph(this.posOf(e), e.def.family, e.boss, ev.dur);
        // the first wind-up the player could dodge teaches the dodge (once per save): it cuts into
        // the dialogue queue; before Laub has spoken it is a HUD hint, not his voice (his reveal)
        if (!e.boss && ev.attack.damage > 0 && ctx.state.state.flags['tut.dodge'] !== true && Math.hypot(e.x - inp.x, e.z - inp.z) <= ev.attack.range + 2.5) {
          ctx.state.update((s) => (s.flags['tut.dodge'] = true), 'combat');
          if (ctx.state.state.flags['story.laub'] === true) this.emit('dialogue:say', { speaker: 'laub', text: t('combat.tut.dodge'), id: 'laub.tut.dodge', ms: 2600, priority: 'now' });
          else this.hud.caption(t('combat.tut.dodge.hint'), 'boss', Math.max(2200, ev.dur * 1000 + 900));
        }
        if (e.kind === 'pikeur' && ev.attack.kind === 'charge') this.audio.horn(this.posOf(e, 2.4));
        // off-screen attacker → arrow at the screen edge (settings.soundIndicators)
        this.arrowFor(e);
        break;
      }
      case 'strike': {
        const e = ev.e;
        if (ev.attack.kind === 'area') {
          this.audio.slam(this.posOf(e, 0.2), e.boss);
          if (e.kind !== 'glutling') this.visuals.dust(e.x, ctx.world.heightAt(e.x, e.z), e.z, Math.min(6, ev.attack.range));
          const d = Math.hypot(e.x - inp.x, e.z - inp.z);
          if (d < ev.attack.range + 6) this.addShake(e.boss ? 0.1 : 0.05);
        }
        if (ev.attack.kind === 'summon') this.audio.roar(this.posOf(e, 1.5));
        break;
      }
      case 'swing': {
        this.audio.swing(ev.kind === 'heavy', ev.combo);
        this.emit('combat:swing', { x: inp.x, z: inp.z, yaw: inp.yaw, reach: ev.kind === 'heavy' ? 3 : 2.6 });
        break;
      }
      case 'whiff':
        this.audio.whiff();
        break;
      case 'hit': {
        const e = ev.e;
        const top = this.visuals.topOf(e);
        const y = e.y + Math.max(0.4, Math.min(top * 0.55, 1.6));
        this.visuals.hit(e.def.family, e.x - ev.dirX * e.radius * 0.6, y, e.z - ev.dirZ * e.radius * 0.6, ev.dirX, ev.dirZ, ev.heavy || ev.finisher, st.reducedFlash);
        this.audio.hit(this.posOf(e, 1), e.def.family, ev.heavy, ev.finisher);
        if (ev.armored) this.audio.clank(this.posOf(e, 1));
        this.addShake(ev.heavy ? SHAKE.heavy : ev.finisher ? SHAKE.heavy * 0.6 : SHAKE.light);
        // at the body (not above the head: at melee range a boss's head projects onto the boss bar)
        if (st.damageNumbers !== false) this.hud.number(String(ev.damage), e.x, e.y + Math.min(top * 0.6, 1.5), e.z, `${ev.heavy || ev.finisher ? 'heavy' : ''} ${ev.weak ? 'weak' : ''} ${ev.armored ? 'armored' : ''}`, e.id, this.numberSpan(e));
        if (ev.weak && e.kind === 'strohmann') this.captionOnce('back', t('combat.back'), 'info', 12);
        // a blow a boss's armour throws back: loud and visible, and after four of them in a row the
        // way in is said out loud (playtest round 5: a masher hit the Steinbrecher's front for 52 s)
        if (e.boss && ev.armored) {
          this.visuals.glance(e.x - ev.dirX * e.radius * 0.7, y, e.z - ev.dirZ * e.radius * 0.7);
          const now = ctx.loop.time;
          this.bounces = now - this.bounceAt < 12 ? this.bounces + 1 : 1;
          this.bounceAt = now;
          this.captionOnce('bounce', t('combat.bounce'), 'info', 3, 900);
          if (this.bounces >= 4 && BOSS_HINT[e.kind]) {
            this.bounces = 0;
            this.captionOnce('bossWay', t('combat.bossWay', { hint: BOSS_HINT[e.kind]! }), 'boss', 14, 3600);
          }
        } else if (e.boss && ev.weak) this.bounces = 0;
        this.emit('combat:hit', { target: 'enemy', id: e.id, kind: e.kind, damage: ev.damage, heavy: ev.heavy, x: e.x, z: e.z });
        break;
      }
      case 'immune': {
        const e = ev.e;
        this.visuals.glance(e.x, e.y + 0.5, e.z);
        this.audio.immune(this.posOf(e, 0.5));
        if (this.safe) this.captionOnce('safe', t('combat.safe'), 'info', 8);
        else this.captionOnce('immune', t('combat.immune', { key: keyLabel(ctx.input.bindings.bannlicht[1] ?? 'KeyG') }), 'info', 6, 2600);
        if (st.damageNumbers !== false) this.hud.number('–', e.x, e.y + 0.8, e.z, 'immune', undefined, this.numberSpan(e));
        break;
      }
      case 'immuneHint':
        this.audio.whiff();
        ctx.ui.toast(t('combat.immuneHint', { key: keyLabel(ctx.input.bindings.bannlicht[1] ?? 'KeyG') }) + (ev.refilled ? ` ${t('combat.immuneRefill')}` : ''), 3200);
        break;
      case 'reform': {
        const e = ev.e;
        this.visuals.hit(e.def.family, e.x, e.y + 0.6, e.z, 0, 0, false, st.reducedFlash);
        this.audio.whiff();
        this.captionOnce('reform', t('combat.reform'), 'info', 10, 2200);
        break;
      }
      case 'resist': {
        const e = ev.e;
        this.visuals.glance(e.x, e.y + 0.8, e.z);
        this.audio.immune(this.posOf(e, 0.8));
        this.captionOnce('resist', t('combat.resist', { name: e.title ?? e.def.name_de }), 'info', 6, 2000);
        break;
      }
      case 'killed': {
        const e = ev.e;
        const style = (DISSOLVE_STYLES as readonly string[]).includes(e.def.dissolve) ? (e.def.dissolve as DissolveKind) : 'mist';
        const gy = ctx.world.heightAt(e.x, e.z);
        if (ev.by !== 'env' || e.boss) this.visuals.pop(e, gy, st.reducedFlash);
        this.visuals.dissolve(e, style, st.reducedFlash);
        this.audio.dissolve(this.posOf(e, 1), style, e.boss);
        this.addShake(e.boss ? SHAKE.heavy * 1.5 : e.elite ? SHAKE.heavy : SHAKE.light * 1.5);
        if (e.boss) {
          // the wow: slow motion, a burst of its own matter, a column of light, a fountain of loot
          this.visuals.bossBurst(e, gy, st.reducedFlash);
          this.visuals.lootFountain(e.x, gy, e.z, st.reducedFlash);
          this.audio.bossDown();
          this.hud.hideTitle();
          this.titleLeft = 0;
          ctx.ui.hud.busy('reveal', false, 0);
          this.revealLeft = 0;
          if (!rm) this.deathSlow = 1.4;
          this.addShake(0.35);
          if (e.kind !== 'pikeur') this.captionOnce(`down:${e.id}`, t('combat.bossDown', { name: e.def.name_de }), 'boss', 0, 3200);
          // the blast throws you back a few steps, so its end is seen, not lived between its legs
          const pp = ctx.player.position;
          const dx = pp.x - e.x;
          const dz = pp.z - e.z;
          const dd = Math.hypot(dx, dz) || 1;
          const want = e.radius + 5;
          if (dd < want) {
            const sec = 0.55;
            const v = ((want - dd) * 2) / sec;
            ctx.player.impulse((dx / dd) * v, (dz / dd) * v, sec);
          }
        }
        const g = this.slice().groups[e.group];
        // an escort that drifted off after its pack was not undone by anyone: no fact to report
        if (e.escort && ev.by === 'env') break;
        this.emit('enemy:killed', { id: e.id, group: e.group, kind: e.kind, x: e.x, z: e.z, era: ctx.era.current, boss: e.boss, by: ev.by === 'skill' || ev.by === 'hazard' ? 'heavy' : ev.by, ...(g?.quest ? { quest: g.quest } : {}), ...(g?.objective ? { objective: g.objective } : {}), ...(e.escort ? { escort: true } : {}) });
        // escorts give XP too; nothing for what drifted off or burst by itself
        // …but nothing for what a Rufer called out of the fog (no farming a caller)
        if ((!e.add || e.escort) && !e.called && ev.by !== 'env' && e.def.xp > 0) this.emit('xp:grant', { amount: Math.round(e.def.xp), reason: `enemy:${e.kind}`, x: e.x, z: e.z });
        break;
      }
      case 'cleared':
        this.emit('enemy:cleared', { group: ev.group, kind: ev.kind });
        break;
      case 'bump':
        ctx.player.impulse(ev.vx, ev.vz, 0.12);
        break;
      case 'playerHit': {
        const p = this.sim.p;
        this.emit('player:damaged', { amount: ev.damage, hp: p.hp, max: p.max, by: ev.by, x: ev.x, z: ev.z });
        this.emit('combat:hit', { target: 'player', kind: ev.by, damage: ev.damage, heavy: ev.heavy, x: ev.x, z: ev.z });
        this.audio.hurt(ev.heavy);
        this.hud.hurt(0.45 + Math.min(0.55, ev.damage / 30));
        this.viewmodel.jolt();
        this.addShake(SHAKE.player);
        // pushed 1.2 m away from the blow (a dodge roll keeps its own push)
        if (!this.sim.p.dodge) ctx.player.impulse(ev.pushX, ev.pushZ, 0.25);
        if (st.damageNumbers !== false) this.hud.vitalNumber(ev.damage, 'in');
        // where it came from, if off screen
        this.arrowAt(ev.x, ev.z, `hit:${ev.by}`);
        break;
      }
      case 'evade':
        this.audio.evade();
        break;
      case 'died':
        this.deadT = 0;
        this.emit('player:died', { by: ev.by });
        break;
      case 'dodge':
        ctx.player.impulse(ev.vx, ev.vz, DODGE.dur);
        this.audio.dodge(ev.perfect);
        if (ev.perfect) this.captionOnce('perfect', t('combat.perfect'), 'info', 1.5, 900);
        break;
      case 'bann': {
        this.bannFx = { t: 1, x: ev.x, z: ev.z, yaw: ev.yaw, range: ev.range, angle: ev.angle };
        this.audio.bann();
        this.visuals.bannMotes(ev.x, ctx.player.position.y, ev.z, ev.yaw, ev.range, ev.angle);
        // the flare lights the lantern if it was dark (the pack will see you)
        if (!ctx.player.stats.lanternLit) this.emit('lantern:request', { lit: true });
        this.emit('combat:bann', { x: ev.x, z: ev.z, yaw: ev.yaw, range: ev.range, angle: ev.angle });
        break;
      }
      case 'stun': {
        const e = ev.e;
        this.audio.stun(this.posOf(e));
        if (e.kind === 'schuldbuch') this.captionOnce('seal', t('combat.seal'), 'boss', 2);
        break;
      }
      case 'heal':
        this.emit('player:healed', { amount: ev.amount, hp: this.sim.p.hp, max: this.sim.p.max, by: ev.by });
        if (st.damageNumbers !== false) this.hud.vitalNumber(ev.amount, 'heal');
        break;
      case 'phase': {
        const e = ev.e;
        this.emit('boss:phase', { id: e.id, kind: e.kind, phase: ev.phase, hp: e.hp });
        this.audio.roar(this.posOf(e, 1.5));
        this.captionOnce(`phase:${e.id}:${ev.phase}`, t('combat.phase', { name: e.def.name_de, n: ev.phase }), 'boss', 0, 2200);
        this.addShake(SHAKE.heavy);
        break;
      }
      case 'summon':
        break;
      case 'shot':
        this.audio.shot({ x: ev.p.x, y: ev.p.y, z: ev.p.z }, ev.p.kind.startsWith('irrlicht'));
        break;
      case 'impact':
        if (ev.p.lob) {
          this.audio.slam({ x: ev.p.tx, y: ctx.world.heightAt(ev.p.tx, ev.p.tz), z: ev.p.tz }, true);
          this.visuals.dust(ev.p.tx, ctx.world.heightAt(ev.p.tx, ev.p.tz), ev.p.tz, 2);
          if (Math.hypot(ev.p.tx - inp.x, ev.p.tz - inp.z) < 8) this.addShake(0.08);
        }
        break;
      case 'balk':
        this.audio.balk(this.posOf(ev.e, 1.5));
        this.captionOnce('balk', t('combat.balk'), 'boss', 3, 2400);
        break;
      case 'block':
        this.visuals.block(ev.x, ev.y, ev.z);
        this.captionOnce('block', t('combat.block'), 'info', 20, 2200);
        break;
      case 'leave':
        this.audio.verloren(this.posOf(ev.e, 2.4));
        this.captionOnce('leave', t('combat.leave'), 'boss', 5, 3600);
        break;
      case 'burst':
        this.visuals.burst(ev.e.x, ctx.world.heightAt(ev.e.x, ev.e.z), ev.e.z, st.reducedFlash);
        this.audio.burst(this.posOf(ev.e, 0.4));
        break;
      case 'blink':
        this.visuals.glance(ev.fromX, ev.e.y, ev.fromZ);
        break;
      case 'tired':
        this.hud.denied();
        this.audio.denied();
        this.captionOnce('tired', t('combat.tired'), 'info', 4, 900);
        break;
      case 'noBann':
        this.hud.denied();
        this.audio.denied();
        this.captionOnce('noBann', t('combat.noBann'), 'info', 4, 1200);
        break;
      case 'charge':
        break;
      case 'chargeFull':
        this.audio.chargeFull();
        break;
      case 'combat':
        this.emit('combat:state', { inCombat: ev.on });
        // the dialogue card shrinks to a subtitle strip while fighting (story.css)
        if (typeof document !== 'undefined') document.body.classList.toggle('kq-in-combat', ev.on);
        // level / skill cards and tips wait until about 3 s after the fight
        ctx.ui.hud.busy('combat', ev.on, 3);
        break;
      case 'resetGroup':
        break;
      case 'intro': {
        const e = ev.e;
        const [name, epithet] = BOSS_TITLE[e.kind] ?? [e.def.name_de, ''];
        this.hud.title(name, epithet);
        this.titleLeft = ev.dur - 0.3;
        this.hintAfterTitle = BOSS_HINT[e.kind] ? e.kind : null;
        // the reveal is the boss's moment: the story's dialogue waits it out (story held()); counted
        // in game time (update), so it ends with ?manual stepping too
        ctx.ui.hud.busy('reveal', true);
        this.revealLeft = ev.dur;
        this.audio.sting(e.kind);
        this.audio.roar(this.posOf(e, 1.5));
        if (!rm) this.introCam = { e, t: 0, dur: ev.dur };
        this.addShake(0.12);
        break;
      }
      case 'finishable':
        this.captionOnce(`finishable:${ev.e.id}`, t('combat.finishable', { name: ev.e.title ?? ev.e.def.name_de }), 'boss', 0, 2200);
        break;
      case 'finisher': {
        const e = ev.e;
        this.audio.finisher(this.posOf(e, 1));
        this.captionOnce('finisher', t('combat.finisher'), 'boss', 0.5, 1200);
        this.addShake(0.3);
        this.viewmodel.jolt();
        break;
      }
      case 'enrage':
        this.captionOnce(`enrage:${ev.e.id}`, t('combat.enrage', { name: ev.e.title ?? ev.e.def.name_de }), 'boss', 0, 1600);
        this.audio.eliteCall(this.posOf(ev.e, 1), ev.e.def.family);
        break;
      case 'packAlert': {
        const lead = this.sim.enemies.find((x) => x.elite && (x.group === ev.e.group || `${x.group}+escort` === ev.e.group) && x.state !== 'dissolve');
        if (lead) {
          this.captionOnce(`elite:${lead.id}`, t('combat.elite', { name: lead.title ?? lead.def.name_de }), 'boss', 0, 1800);
          this.audio.eliteCall(this.posOf(lead, 1), lead.def.family);
        }
        break;
      }
      case 'drift':
        break;
      // ---- combat variety pass ----
      case 'blocked': {
        const e = ev.e;
        const dx = e.x - inp.x;
        const dz = e.z - inp.z;
        const dd = Math.hypot(dx, dz) || 1;
        this.visuals.guardSpark(e.x - (dx / dd) * e.radius, e.y + 1, e.z - (dz / dd) * e.radius, dx / dd, dz / dd, st.reducedFlash);
        this.audio.blocked(this.posOf(e, 1));
        this.viewmodel.jolt();
        this.addShake(SHAKE.light);
        if (st.damageNumbers !== false) this.hud.number('–', e.x, e.y + 1.2, e.z, 'armored', e.id, this.numberSpan(e));
        this.captionOnce('blocked', t('combat.blocked'), 'info', 8, 2400);
        break;
      }
      case 'guardBreak':
        this.visuals.guardBreak(ev.e.x, ev.e.y + 1, ev.e.z);
        this.audio.guardBreak(this.posOf(ev.e, 1));
        this.addShake(SHAKE.heavy * 0.6);
        this.captionOnce('guardBreak', t('combat.guardBreak'), 'boss', 3, 1300);
        break;
      case 'flank':
        this.captionOnce('flank', t('combat.flank'), 'info', 10, 1000);
        break;
      case 'ward': {
        for (const o of ev.targets) this.visuals.shatter(o.x, o.y + 0.8, o.z, false, st.reducedFlash);
        this.audio.veil(this.posOf(ev.e, 1.5), false);
        this.captionOnce('ward', t('combat.ward', { key: keyLabel(ctx.input.bindings.bannlicht[1] ?? 'KeyG') }), 'info', 12, 2600);
        break;
      }
      case 'wardBreak':
        this.visuals.shatter(ev.e.x, ev.e.y + 0.8, ev.e.z, false, st.reducedFlash);
        this.audio.veil(this.posOf(ev.e, 1), true);
        this.captionOnce('wardBreak', t('combat.wardBreak'), 'info', 4, 1200);
        break;
      case 'warded':
        this.visuals.glance(ev.e.x, ev.e.y + 0.8, ev.e.z);
        this.captionOnce('warded', t('combat.warded'), 'info', 10, 1800);
        break;
      case 'reflect': {
        const e = ev.e;
        this.visuals.reflectBeam(e.x, e.y, e.z, inp.x, inp.y + 1.4, inp.z, st.reducedFlash);
        this.audio.reflect(this.posOf(e, 0), false);
        this.captionOnce('reflect', t('combat.reflect'), 'boss', 6, 2800);
        break;
      }
      case 'crack':
        this.visuals.shatter(ev.e.x, ev.e.y, ev.e.z, true, st.reducedFlash);
        this.audio.reflect(this.posOf(ev.e, 0), true);
        this.captionOnce('crack', t('combat.crack'), 'info', 4, 1200);
        break;
      case 'dazzled':
        this.hud.denied();
        this.audio.denied();
        this.captionOnce('dazzled', t('combat.dazzled'), 'info', 3, 1200);
        break;
      case 'call':
        this.audio.call(this.posOf(ev.e, 2));
        this.captionOnce('call', t('combat.call', { n: ev.n }), 'boss', 4, 2000);
        break;
      case 'callBroken':
        this.audio.callBroken(this.posOf(ev.e, 2));
        this.captionOnce('callBroken', t('combat.callBroken'), 'info', 2, 1100);
        break;
      case 'emerge': {
        const e = ev.e;
        this.visuals.emerge(e.x, ctx.world.heightAt(e.x, e.z), e.z);
        this.audio.emerge(this.posOf(e, 0.5));
        this.arrowFor(e);
        break;
      }
      case 'waveIncoming': {
        const gy = ctx.world.heightAt(ev.x, ev.z);
        this.visuals.emerge(ev.x, gy, ev.z);
        this.audio.waveIncoming({ x: ev.x, y: gy + 1, z: ev.z });
        const rel = wrapAngle(ctx.player.yaw - headingOf(ev.x - inp.x, ev.z - inp.z));
        this.captionOnce('wave', t(Math.abs(rel) > 2.1 ? 'combat.wave' : 'combat.wave.side'), 'boss', 6, 2400);
        // the wave always gets its arrow when off screen (that is the point: turn round)
        if (st.soundIndicators !== false && !ctx.ui.hud.staged && Math.abs(rel) > (35 * Math.PI) / 180) this.hud.arrow(`wave:${ev.group}`, rel);
        break;
      }
      case 'hazard': {
        const d = Math.hypot(ev.x - inp.x, ev.z - inp.z);
        if (d < 18) this.audio.hazardWarn({ x: ev.x, y: ctx.world.heightAt(ev.x, ev.z) + 2, z: ev.z }, ev.kind);
        if (d < ev.r + 4) this.captionOnce(`hazard.${ev.kind}`, t(`combat.hazard.${ev.kind}`), 'info', 10, 1800);
        break;
      }
      case 'hazardHit': {
        const gy = ctx.world.heightAt(ev.x, ev.z);
        this.visuals.hazardLand(ev.kind, ev.x, gy, ev.z, ev.r, st.reducedFlash);
        this.audio.hazardLand({ x: ev.x, y: gy, z: ev.z }, ev.kind);
        if (Math.hypot(ev.x - inp.x, ev.z - inp.z) < ev.r + 5) this.addShake(ev.kind === 'stone' ? 0.1 : 0.04);
        break;
      }
      case 'skill': {
        const pp = ctx.player.position;
        if (ev.id === 'ausfall') {
          ctx.player.impulse(ev.vx, ev.vz, ev.dur);
          this.lungeFrom = { x: pp.x, z: pp.z };
          this.audio.lunge();
        } else if (ev.id === 'erdstoss') this.audio.slamRaise();
        else this.audio.whirl();
        break;
      }
      case 'skillImpact': {
        if (ev.id === 'erdstoss') {
          this.visuals.groundSlam(ev.x, ctx.world.heightAt(ev.x, ev.z), ev.z, ev.r, st.reducedFlash);
          this.audio.groundSlam();
          this.addShake(0.22);
          this.viewmodel.jolt();
        }
        break;
      }
      case 'skillDenied': {
        if (ev.why === 'locked') break;
        const name = t(`combat.skill.${ev.id}`);
        this.hud.denied();
        this.audio.denied();
        if (ev.why === 'cooldown') this.captionOnce(`cd:${ev.id}`, t('combat.skill.cooldown', { name, s: Math.ceil(this.sim.p.cds[ev.id]) }), 'info', 1.5, 900);
        else if (ev.why === 'tired') this.captionOnce('skill.tired', t('combat.skill.tired', { name }), 'info', 3, 1000);
        break;
      }
      case 'deflect':
        this.visuals.glance(ev.p.x, ev.p.y, ev.p.z);
        this.audio.evade();
        break;
    }
    void rm;
  }

  /** The body a damage number must keep clear of: half its width and its height (m). */
  private numberSpan(e: Enemy): { r: number; top: number; base: number } {
    const hull = this.visuals.hullOf(e);
    return { r: Math.max(e.radius, Math.min(hull.r, hull.f + 0.5)), top: e.y + this.visuals.topOf(e), base: e.y };
  }

  private arrowFor(e: Enemy): void {
    this.arrowAt(e.x, e.z, e.id);
  }

  private arrowAt(x: number, z: number, id: string): void {
    if (this.ctx.settings.state.soundIndicators === false) return;
    // a boss reveal or a staged climax: no markers round the edge of the picture
    if (this.ctx.ui.hud.staged) return;
    const pl = this.ctx.player;
    // third person: the chevrons round the character show every enemy out of the picture
    if (pl.thirdPerson) return;
    const rel = wrapAngle(pl.yaw - headingOf(x - pl.position.x, z - pl.position.z));
    // within the view (±35°): no arrow needed
    if (Math.abs(rel) < (35 * Math.PI) / 180) return;
    this.hud.arrow(id, rel);
  }

  /**
   * A boss's reveal: the view turns to it and pulls back a little, then hands back (the player's
   * own yaw is untouched; reduced motion skips it). It eases in and out over the intro.
   */
  private revealCamera(dt: number): void {
    const c = this.introCam;
    if (!c) return;
    c.t += dt;
    const e = c.e;
    if (c.t >= c.dur || e.state === 'dissolve' || this.ctx.settings.state.reducedMotion || !this.sim.enemies.includes(e)) {
      this.introCam = null;
      return;
    }
    const k = c.t / c.dur;
    const w = k < 0.22 ? smooth(k / 0.22) : k > 0.78 ? smooth((1 - k) / 0.22) : 1;
    const cam = this.ctx.camera;
    const top = this.visuals.topOf(e);
    _target.set(e.x, e.y + top * 0.62, e.z);
    // frame it: dolly along the line to a distance where the boss fills the view (playtest round 4:
    // the Schuldbuch was 60 px tall at a 23 m reveal), or pull back a little when it is too close
    _back.set(cam.position.x - e.x, 0, cam.position.z - e.z);
    const d = _back.length() || 1;
    _back.multiplyScalar(1 / d);
    const want = Math.max(6.5, top * 1.9);
    const move = Math.max(-16, Math.min(1.6, want - d));
    cam.position.addScaledVector(_back, move * w);
    const ground = this.ctx.world.heightAt(cam.position.x, cam.position.z) + 1.3;
    cam.position.y = Math.max(ground, cam.position.y + 0.45 * w);
    _look.lookAt(cam.position, _target, _up);
    _qLook.setFromRotationMatrix(_look);
    cam.quaternion.slerp(_qLook, w * 0.92);
    cam.updateMatrixWorld();
  }

  /**
   * Camera clearance (round 6): a big body — a boss, a Steinfresser, an elite — never wedges the
   * lens. When the camera ends up inside a body's hull (shoved by a charge, a dodge into it, an arm
   * swung over you) the view eases back out along the line from its axis, a little up, until it
   * sits just outside; the player's own position (and the fight) is untouched. What still overlaps
   * dithers (visuals.occlusionVis). A bump, never a jolt: it eases in and out.
   */
  private cameraClearance(dt: number): void {
    const cam = this.ctx.camera;
    let need = 0;
    let dx = 0;
    let dz = 0;
    for (const e of this.sim.enemies) {
      if (e.state === 'dissolve' || e.state === 'leave') continue;
      const hull = this.visuals.hullOf(e);
      const reach = Math.max(e.radius, hull.r, hull.f);
      // only bodies big enough to swallow the view (a Nebelling's puff is dithered, not pushed)
      if (reach < 0.9 && !e.boss) continue;
      const top = this.visuals.topOf(e);
      if (cam.position.y < e.y - 0.5 || cam.position.y > e.y + top + 0.5) continue;
      const ox = cam.position.x - e.x;
      const oz = cam.position.z - e.z;
      const d = Math.hypot(ox, oz);
      if (d > reach + 1 || d < 1e-3) continue;
      const q = hullDistance(e, hull, cam.position.x, cam.position.z);
      // a boss is kept a step further off: outside its hull is not yet seeing it
      const want = e.boss ? 1.3 : 1.08;
      if (q >= want) continue;
      // how far out along the radial line until the hull is cleared (the ellipse scales with d)
      const out = Math.min(e.boss ? 3 : 1.2, d * (want / Math.max(q, 0.2) - 1));
      if (out > need) {
        need = out;
        dx = ox / d;
        dz = oz / d;
      }
    }
    const k = Math.min(1, dt * (need > this.clearPull ? 9 : 3));
    this.clearPull += (need - this.clearPull) * k;
    if (need > 0) this.clearDir.set(dx, 0, dz);
    if (this.clearPull < 0.005) {
      this.clearPull = 0;
      return;
    }
    cam.position.addScaledVector(this.clearDir, this.clearPull);
    cam.position.y += this.clearPull * 0.25;
    // never into the ground (a slope behind you)
    const ground = this.ctx.world.heightAt(cam.position.x, cam.position.z) + 0.6;
    if (cam.position.y < ground) cam.position.y = ground;
    cam.updateMatrixWorld();
  }

  /** Where the current (locked or soft) target stands, for the avatar to face. */
  private targetPos(): { x: number; z: number } | null {
    const id = this.targeting.current;
    const e = id ? this.cands.find((c) => c.id === id) : undefined;
    return e ? { x: e.x, z: e.z } : null;
  }

  /** How far the camera is pulled back out of a body right now (m; debug / tests). */
  get cameraPull(): number {
    return this.clearPull;
  }

  private addShake(a: number): void {
    if (this.ctx.settings.state.reducedMotion) return;
    this.trauma = Math.min(0.6, this.trauma + a);
  }

  // ---- frame ------------------------------------------------------------------------------------

  frame(frameDt: number): void {
    const ctx = this.ctx;
    this.installHooks();
    // with ?manual (tests) a render frame does not advance the simulation: keep the visuals in step
    const dt = ctx.loop.manual ? Math.min(frameDt, 1 / 60) : frameDt;
    const st = ctx.settings.state;
    this.framePendingAbility(frameDt);
    const cam = ctx.camera;
    const pl = ctx.player;
    const p = this.sim.p;
    const frozen = this.sim.freeze > 0;
    // camera shake (off with reduced motion): trauma² of small rotations and offsets
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (!st.reducedMotion && this.trauma > 0.001) {
      const k = this.trauma * this.trauma;
      const tt = ctx.loop.time * 38;
      cam.rotation.x += Math.sin(tt * 1.3) * k * 0.35;
      cam.rotation.y += Math.sin(tt * 1.7 + 1) * k * 0.35;
      cam.position.y += Math.sin(tt * 2.1 + 2) * k * 0.25;
      cam.updateMatrixWorld();
      this.shakeNow = k;
    } else this.shakeNow = 0;
    this.revealCamera(dt);
    this.cameraClearance(dt);
    if (this.titleLeft > 0) {
      this.titleLeft -= dt;
      if (this.titleLeft <= 0) {
        this.hud.hideTitle();
        const k = this.hintAfterTitle;
        this.hintAfterTitle = null;
        if (k) this.captionOnce(`bossWayFirst:${k}`, t('combat.bossWayFirst', { hint: BOSS_HINT[k]! }), 'boss', 60, 4200);
      }
    }
    // the Bannlicht flare: the lantern blazes for a moment (local, never a full-screen flash)
    if (this.bannFx) {
      this.bannFx.t = Math.max(0, this.bannFx.t - dt / 0.55);
      const f = this.bannFx.t;
      // (round 9: ×4 lantern light under bloom blew the frame to white; now a firm, tonemapped pulse)
      const boost = st.reducedFlash ? 0.8 : 1.5;
      const L = atmosphere.uLantern.value;
      if (L.lengthSq() < 0.01) L.set(1, 0.58, 0.24).multiplyScalar(2.7 * f);
      else L.multiplyScalar(1 + boost * f);
      atmosphere.uLanternRadius.value = (atmosphere.uLanternRadius.value as number) * (1 + 0.5 * f);
      if (f <= 0) this.bannFx = null;
    }
    lanternPose.side = -1;
    lanternPose.lift = this.bannFx ? this.bannFx.t : 0;
    // world visuals
    this.visuals.frame({
      enemies: this.sim.enemies,
      projectiles: this.sim.projectiles,
      rings: this.sim.rings,
      camera: cam,
      viewportH: ctx.renderer.domElement.clientHeight || window.innerHeight,
      time: ctx.loop.time,
      dt: this.deathSlow > 0 ? dt * 0.3 : dt,
      frozen,
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      reducedFlash: st.reducedFlash,
      bann: this.bannFx,
      // the reveal camera looks at the boss: nothing may stand in the way of it
      focus: this.introCam ? [{ x: this.introCam.e.x, y: this.introCam.e.y + this.visuals.topOf(this.introCam.e) * 0.5, z: this.introCam.e.z, id: this.introCam.e.id }] : undefined,
    });
    // an ability under way: the Wirbel's ring of motes, the Ausfall's streak
    if (p.skill && !frozen) {
      const gy = ctx.world.heightAt(pl.position.x, pl.position.z);
      if (p.skill.id === 'wirbel') this.visuals.whirl(pl.position.x, gy + 0.2, pl.position.z, SKILLS.wirbel.radius * 0.7, ctx.loop.time, st.reducedFlash);
      if (p.skill.id === 'ausfall' && this.lungeFrom) {
        this.visuals.lungeStreak(this.lungeFrom.x, gy + 1.1, this.lungeFrom.z, pl.position.x, pl.position.z, st.reducedFlash);
        this.lungeFrom = { x: pl.position.x, z: pl.position.z };
      }
    } else this.lungeFrom = null;
    // the staff
    const f = ctx.state.state.flags;
    const sw = p.swing;
    this.viewmodel.frame({
      camera: cam,
      dt,
      time: ctx.loop.time,
      frozen,
      swing: sw ? { kind: sw.kind, combo: sw.combo, t: sw.t, dur: sw.dur } : null,
      skill: p.skill ? { id: p.skill.id, t: p.skill.t, dur: p.skill.dur } : null,
      charge: p.charging ? Math.min(1, Math.max(0, (p.hold - 0.18) / (1.0 - 0.18))) : null,
      dodge: p.dodge ? p.dodge.t / DODGE.dur : null,
      drink: p.drink,
      flare: this.bannFx?.t ?? 0,
      hurt: 0,
      moving: this.moving,
      // no staff in hand before the Messstab is picked up at the trailer, none over the title
      hidden: pl.flying || ctx.ui.modals.count > 0 || (this.deadT >= 0 && this.caughtSent) || !ctx.state.state.systems.progression?.equipped?.weapon || ctx.pause.reasons.has('title'),
      lowered: f['combat.disabled'] === true || pl.stance === 'prone',
      reducedMotion: st.reducedMotion,
      reducedFlash: st.reducedFlash,
      thirdPerson: pl.thirdPerson,
      swingYaw: sw?.yaw ?? pl.yaw,
      inCombat: p.inCombat,
      dead: this.deadT >= 0,
      armed: !!ctx.state.state.systems.progression?.equipped?.weapon,
      target: this.targetPos(),
    });
    // the third-person camera frames the fight (pull back so every enemy near you fits)
    this.cands = this.candidates();
    const fight: typeof cameraHints.fight = [];
    let bossR = 0;
    if (p.inCombat) {
      for (const c of this.cands) {
        if (!c.aggro || Math.hypot(c.x - pl.position.x, c.z - pl.position.z) > 16) continue;
        fight.push({ x: c.x, z: c.z, r: c.r, top: c.top });
        if (c.boss) bossR = Math.max(bossR, c.r);
      }
    }
    cameraHints.fight = fight;
    cameraHints.boss = bossR;
    cameraHints.bodies = this.cands.filter((c) => c.boss && Math.hypot(c.x - pl.position.x, c.z - pl.position.z) < 14).map((c) => ({ x: c.x, z: c.z, r: c.r, top: c.top }));
    this.targeting.frame({
      dt,
      time: ctx.loop.time,
      camera: cam,
      c: this.cands,
      player: pl.renderPos,
      third: pl.thirdPerson,
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      viewYaw: pl.yaw,
      inCombat: p.inCombat && !p.dead,
      staged: ctx.ui.hud.staged,
      reducedMotion: st.reducedMotion,
      viewportW: ctx.renderer.domElement.clientWidth || window.innerWidth,
      viewportH: ctx.renderer.domElement.clientHeight || window.innerHeight,
    });
    // HUD
    const bannFrac = p.bann < p.bannMax ? Math.min(1, p.bannT / Math.max(0.1, this.sim.opt.stats.bannRecharge)) : 1;
    this.hud.setVitals({ hp: p.hp, max: p.max, st: p.st.stamina, stMax: p.st.max, exhausted: p.st.exhausted, bann: p.bann, bannMax: p.bannMax, bannFrac, calm: !p.inCombat, key: keyLabel(ctx.input.bindings.bannlicht[0] ?? 'Mouse2') });
    // the abilities row (dock 'vitals' 25)
    const slots: SkillSlot[] = (this.sim.opt.skills ?? []).map((id) => {
      const cd = skillCooldown(id, this.sim.opt.gentle);
      const left = Math.max(0, p.cds[id]);
      return { id, name: t(`combat.skill.${id}`), key: this.skillKey(id), frac: left <= 0 ? 1 : Math.max(0, Math.min(0.999, 1 - left / cd)), left, tired: p.st.exhausted || p.st.stamina < SKILLS[id].cost * this.sim.opt.stats.staminaCost };
    });
    this.hud.setSkills(slots, !p.inCombat);
    const b = this.sim.boss();
    if (b) {
      const marks = b.def.phases ?? [];
      const hint = b.kind === 'schuldbuch' && b.sealOpen > 0 ? t('combat.seal.sub') : BOSS_HINT[b.kind] ?? '';
      this.hud.setBoss({ name: b.def.name_de, frac: b.hp / b.maxHp, phase: b.phase, phases: marks.length + 1, marks, sub: `Phase ${b.phase} von ${marks.length + 1} · ${hint}`, weak: b.sealOpen > 0 });
    } else this.hud.setBoss(null);
    const pips: PipTarget[] = [];
    for (const e of this.sim.enemies) {
      if (e.boss || e.state === 'dissolve') continue;
      const d = Math.hypot(e.x - pl.position.x, e.z - pl.position.z);
      const show = d < 32 && (e.aggro || e.hp < e.maxHp || e.stun > 0);
      // over the body's crown (not floating above it): the bar sits on the silhouette
      pips.push({ id: e.id, x: e.x, y: e.y + this.visuals.topOf(e) + 0.05, z: e.z, frac: e.hp / e.maxHp, gebannt: e.stun > 0, immune: e.def.needsBann === true && e.stun <= 0, show: show || e.elite, dist: Math.hypot(e.x - cam.position.x, e.z - cam.position.z), title: e.title, finish: e.finishable, trait: traitOf(e) });
    }
    const lowHp = p.dead ? 0 : Math.max(0, (0.3 - p.hp / p.max) / 0.3);
    this.hud.frame({ dt, camera: cam, reducedFlash: st.reducedFlash, reducedMotion: st.reducedMotion, lowHp, pips, dazzle: p.dazzle, staged: ctx.ui.hud.staged });
    this.audio.heartbeat(dt, lowHp);
  }

  // ---- debug hooks --------------------------------------------------------------------------------

  private installHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined' || !window.kq) return;
    this.hooksInstalled = true;
    const self = this;
    const ctx = this.ctx;
    const find = (idOrGroup: string) => self.sim.enemies.filter((e) => e.id === idOrGroup || e.group === idOrGroup || e.kind === idOrGroup);
    let n = 0;
    const hooks: CombatHooks = {
      state() {
        const s = structuredClone(self.slice());
        const b = self.sim.boss();
        return { ...s, inCombat: self.sim.p.inCombat, exhausted: self.sim.p.st.exhausted, dead: self.sim.p.dead, god: self.sim.p.god, boss: b ? { kind: b.kind, hp: b.hp, max: b.maxHp, phase: b.phase } : null };
      },
      spawn(kind, o = {}) {
        if (!KINDS.includes(kind)) throw new Error(`unknown enemy kind '${kind}'`);
        const pl = ctx.player;
        const dist = o.dist ?? 6;
        const yaw = pl.yaw - ((o.angle ?? 0) * Math.PI) / 180;
        const fw = forwardOf(yaw);
        const x = o.x ?? pl.position.x + fw.x * dist;
        const z = o.z ?? pl.position.z + fw.z * dist;
        const group = o.group ?? `debug.${kind}.${++n}`;
        const def = enemyDef(kind)!;
        ctx.events.emit('enemy:spawn', { group, kind, x, z, era: (o.era ?? ctx.era.current) as never, count: o.count ?? 1, radius: o.radius ?? 2.5, boss: o.boss ?? def.boss === true, tier: o.tier ?? 1, ...(o.time ? { time: o.time } : {}) });
        // materialise now (manual stepping)
        self.sim.sync(ctx.era.current, self.timeOfDay(), pl.position.x, pl.position.z);
        for (const e of self.sim.enemies) if (e.group === group) e.heading = headingOf(pl.position.x - e.x, pl.position.z - e.z);
        return group;
      },
      kill(target) {
        return self.sim.killNow(target);
      },
      hit(count = 1) {
        for (let i = 0; i < count; i++) {
          ctx.input.simulate('KeyK', true);
          ctx.loop.step(1);
          ctx.input.simulate('KeyK', false);
          ctx.loop.step(Math.ceil(0.4 * 60));
        }
      },
      bann() {
        ctx.input.simulate('KeyG', true);
        ctx.loop.step(1);
        ctx.input.simulate('KeyG', false);
      },
      dodge() {
        ctx.input.simulate('Space', true);
        ctx.loop.step(1);
        ctx.input.simulate('Space', false);
      },
      god(on) {
        self.sim.p.god = on ?? !self.sim.p.god;
        return self.sim.p.god;
      },
      groups() {
        return structuredClone(self.slice().groups);
      },
      enemies() {
        return self.sim.enemies.map((e) => ({ id: e.id, group: e.group, kind: e.kind, x: e.x, y: e.y, z: e.z, hp: e.hp, max: e.maxHp, state: e.state, stun: e.stun, phase: e.phase, heading: e.heading }));
      },
      place(id, x, z, facePlayer = true) {
        const pl = ctx.player.position;
        for (const e of find(id)) {
          e.x = x;
          e.z = z;
          e.y = ctx.world.heightAt(x, z) + e.hover;
          e.home = { x, z };
          if (facePlayer) e.heading = headingOf(pl.x - x, pl.z - z);
        }
      },
      windup(id, attack, progress = 0.6) {
        const pl = ctx.player.position;
        for (const e of find(id)) {
          const a = e.def.attacks.find((x) => x.id === attack) ?? e.def.attacks.find((x) => x.kind === 'area') ?? e.def.attacks[0];
          if (!a) continue;
          e.aggro = true;
          e.engaged = true;
          e.heading = headingOf(pl.x - e.x, pl.z - e.z);
          (self.sim as unknown as { beginWindup(e: Enemy, a: unknown, inp: SimInput): void }).beginWindup(e, a, self.input());
          e.t = e.windup * progress;
          for (const r of self.sim.rings) if (r.owner === e.id) r.t = r.dur * progress;
        }
      },
      freeze(on) {
        self.frozenAI = on ?? !self.frozenAI;
      },
      skill(id) {
        const why = self.sim.skillReady(id);
        const code = ({ ausfall: 'KeyT', erdstoss: 'KeyY', wirbel: 'KeyU' } as const)[id];
        ctx.input.simulate(code, true);
        ctx.loop.step(1);
        ctx.input.simulate(code, false);
        return why;
      },
      hurt(amount) {
        self.sim.hurtPlayer(amount, 'debug', { x: ctx.player.position.x + 1, z: ctx.player.position.z });
      },
      heal(amount) {
        if (amount === undefined) self.restore('debug');
        else self.sim.heal(amount, 'debug');
      },
      events() {
        return self.log.slice();
      },
      shake() {
        return self.shakeNow;
      },
      sim() {
        return self.sim;
      },
      view() {
        const vis: Record<string, number> = {};
        for (const e of self.sim.enemies) vis[e.id] = self.visuals.visOf(e.id);
        return { pull: self.clearPull, vis };
      },
      lock(id) {
        const pl = self.ctx.player;
        self.cands = self.candidates();
        if (id === undefined) self.targeting.press(self.cands, pl.position.x, pl.position.z, pl.yaw);
        else self.targeting.locked = id;
        return self.targeting.locked;
      },
      target() {
        return { locked: self.targeting.locked, soft: self.targeting.soft };
      },
    };
    window.kq.combat = hooks;
  }
}

/** What the HP pip should say about an enemy (combat variety pass). */
function traitOf(e: Enemy): PipTarget['trait'] {
  if (e.ward > 0) return 'veil';
  if (e.def.guard && e.guardBroken <= 0) return 'guard';
  if (e.def.reflectsBann && !e.cracked) return 'mirror';
  if (e.kind === 'rufer') return 'caller';
  return undefined;
}

function damageRows(settings: SettingsStore): SettingsRow[] {
  const s = settings.state;
  const set = (fn: (d: Settings) => void, key: string) => settings.update(fn, key);
  const box = h('input', {
    type: 'checkbox',
    id: 'set-damage-numbers',
    checked: s.damageNumbers !== false,
    'aria-label': t('settings.damageNumbers'),
    'data-testid': 'set-damage-numbers',
    onchange: (e: Event) => set((d) => (d.damageNumbers = (e.target as HTMLInputElement).checked), 'damageNumbers'),
  });
  return [[t('settings.damageNumbers'), box, 'game', t('settings.damageNumbers.help')]];
}

const _target = new Vector3();
const _back = new Vector3();
const _up = new Vector3(0, 1, 0);
const _look = new Matrix4();
const _qLook = new Quaternion();
const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

let sys: Combat | null = null;

export default defineSystem({
  id: 'combat',
  after: ['hunt', 'menagerie', 'progression'],
  init(ctx: GameContext) {
    sys = new Combat(ctx);
  },
  update(dt) {
    sys?.update(dt);
  },
  frame(dt) {
    sys?.frame(dt);
  },
  dispose() {
    sys?.visuals.dispose();
    sys?.viewmodel.dispose();
    sys?.targeting.dispose();
    sys = null;
  },
});
