/**
 * Feature "quests" — quest givers, objectives, turn-in, the quest and Codex pages and the HUD tracker
 * (docs/ACTION-RPG.md §8–§9; ARCHITECTURE.md §12.1 "quests").
 *
 * Contract (src/systems/contracts.ts, "quests"): listens to quest:command (story), quest:accept /
 * decline / turnin / told (npc), enemy:killed, item:pickup, npc:talk, room:enter, clue:found,
 * echo:end, menagerie:calmed, item:use (and any event an `event` objective names), story:chapter,
 * chronik:open (→ opens Codex); emits quest:offered / accepted / progress / objective /
 * ready / completed / failed, npc:topics, npc:marker, npc:follow, codex:unlocked, and the requests
 * enemy:spawn / despawn, loot:place / clear, xp:grant, item:grant, skill:grant. Mirrors
 * `flags['quest.<id>']` (state) and `flags['quest.<id>.<objective>']` (count) for the story's
 * `quest` condition. The state machine is the pure ./logic.ts (tests/quests.test.ts).
 * State: `state.systems.quests` (QuestSlice, src/rpg/types.ts).
 */
import '../contracts';
import './strings';
import './quests.css';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { t } from '../../i18n';
import { addPausePage, openPausePage, pausePageHandle, refreshPausePage } from '../../ui/pause-pages';
import { itemDef, ITEMS } from '../../rpg/items';
import type { GiverMark, ItemDef, QuestCard, QuestDef, QuestLine, QuestSlice, QuestTopic } from '../../rpg/types';
import { acceptSound, objectiveSound, pageSound, readySound, tickSound, turninSound } from './audio';
import { Beacons, type BeaconSpec } from './beacons';
import { type HintContext, type WayDeps, type WayPoint, StallWatch, distanceText, hintFor, objectiveTarget, storyHint, targetVisible } from './wayfinding';
import { enemyDef } from '../../rpg/enemies';
import { giverPlacedIn, loadBundledQuests, questsInPlay, sideQuestClosed } from './data';
import { loadBundledStories } from '../story/stories';
import { Feed, RewardNotice, showBanner, Tracker, type RewardView, type TrackerQuest } from './hud';
import { Waymark } from '../../ui/waymark';
import { hideWhileQuiet } from '../../core/quiet';
import { renderCodex, renderQuests, renderSets, type PageData } from './pages';
import { type QuestDefIn, type QuestPayout, QuestBook, createQuestSlice, giverId, historyAtTurnin, need, objectiveEvents, normaliseSlice, recordItemDeed, turninOf } from './logic';
import { viaLine } from './stepText';

declare module '../../core/state' {
  interface SystemStates {
    quests: QuestSlice;
  }
}

export interface QuestsHooks {
  /** The quest slice (deep copy). */
  state(): QuestSlice;
  /** Quest ids in play (test files only with ?storytest). */
  ids(): string[];
  offer(id: string): boolean;
  accept(id: string): boolean;
  progress(id: string, objective: string, n?: number): boolean;
  /** Force-complete (story `quest complete`): rewards now, from any state but done. */
  complete(id: string): boolean;
  /** Turn in a ready quest (as the conversation does): grants, history unlocks and payout notice. */
  turnin(id: string): boolean;
  reset(id: string): boolean;
  tracked(): string[];
  /** Quest topics / glyph for an NPC right now. */
  topics(npc: string): QuestTopic[];
  mark(npc: string): GiverMark;
  /** Reward card on screen. */
  reward(): boolean;
  /** Reward cards waiting for the centre slot (src/ui/cards.ts). */
  rewardPending(): number;
  beacons(): { id: string; alpha: number; lead?: boolean }[];
  /** The goal the HUD leads to (compass, waymark, Bussole): quest / objective / place. */
  lead(): { quest: string | null; objective: string | null; x: number | null; z: number | null; label: string } | null;
  /** The stall hint on screen (null: none). */
  hint(): string | null;
  /** Tests: let `seconds` pass without progress; returns the hint, if one came up. */
  stall(seconds: number): string | null;
  markers(): { id: string; kind: string; bearing: number }[];
}

declare module '../../debug/hooks' {
  interface KqHooks {
    quests?: QuestsHooks;
  }
}

export { createQuestSlice };

const OFFER_RANGE = 150;
const BEACON_RANGE = 200;
/** A tracked side goal this close (m) gets its own silver waymark. */
const SIDE_MARK_RANGE = 90;

/** Rough reading time of a spoken line (game seconds). */
const lineSeconds = (s: string) => 1.6 + s.length * 0.055;

const SKILL_NAME: Record<string, string> = { relief: 'Relief-Blick', kartograf: 'Kartograf', baumeister: 'Baumeister', roentgen: 'Röntgenblick', spurenleser: 'Spurenleser' };

type CompassKind = 'obj' | 'offer' | 'offer-main' | 'ready';

/** The goal the HUD leads to (compass, waymark, Bussole, lead beam, stall hints). */
interface Lead {
  quest: QuestDefIn | null;
  obj: QuestDefIn['objectives'][number] | null;
  target: WayPoint | null;
  label: string;
  story?: { x?: number; z?: number };
}

/** The waymark's label: the objective in a few words (up to the first colon or 46 characters). */
function shortLabel(s: string): string {
  const cut = s.split(/[:(·–]/)[0]!.trim() || s;
  return cut.length > 46 ? `${cut.slice(0, 44).trimEnd()} …` : cut;
}

/** Seconds without progress before a hint (docs/ACTION-RPG.md §8.3). */
export const STALL_SECONDS = 60;

class QuestRuntime {
  readonly book: QuestBook;
  readonly defs: Map<string, QuestDefIn>;
  private readonly retired: Map<string, QuestDefIn>;
  readonly items: Map<string, ItemDef>;
  private readonly tracker = new Tracker();
  private readonly feed = new Feed();
  private readonly layer: HTMLElement;
  private readonly reward: RewardNotice;
  private readonly restoredPayouts: QuestPayout[] = [];
  private restoring = false;
  private bannerQ: (() => void)[] = [];
  private readonly beacons: Beacons;
  private readonly sentTopics = new Map<string, string>();
  private readonly sentMarks = new Map<string, GiverMark>();
  private readonly compass = new Map<string, { kind: CompassKind; bearing: number }>();
  private readonly following = new Set<string>();
  private lead: Lead | null = null;
  /** The door the marker leads to first (a goal inside a building, the player outside). */
  private leadDoor: { x: number; z: number } | null = null;
  private readonly stall = new StallWatch(STALL_SECONDS);
  private hintKey = '';
  private hint: { quest: string; obj: string; text: string } | null = null;
  private leadDist = '';
  /** What the tracker's lead line was last rendered from (quest / objective / label). */
  private leadKey = '';
  /**
   * A second, silver waymark over the nearest tracked side goal that is not the lead (playtest:
   * „Lichter am Weiher“ had a compass mark only; at night nobody found the Irrlichter).
   */
  private readonly sideMark = new Waymark();
  /** The tracked quest whose open goal zone the player stands in (it heads the tracker in a fight). */
  private here: string | null = null;
  private interest = new Set<string>();
  private dirty = true;
  /** Set when a quest was accepted or an objective closed: saved actions settle next tick (Q-15). */
  private settle = false;
  private availIn = 0;
  private markIn = 0;
  private pending: { at: number; run: () => void }[] = [];
  private gameTime = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    const { quests, items, retired } = questsInPlay(loadBundledQuests(), ctx.params.has('storytest'));
    this.sideMark.el.dataset.testid = 'waymark-side';
    this.sideMark.el.classList.add('kq-wm-near');
    this.defs = quests;
    this.retired = retired;
    this.items = items;
    const self = this;
    const stories = new Map(loadBundledStories().map(({ story }) => [story.chapter, story]));
    this.book = new QuestBook(this.defs, this.slice(), {
      get flags() {
        return ctx.state.mutable.flags;
      },
      get codex() {
        return ctx.state.mutable.codex.facts;
      },
      get menagerie() {
        return ctx.state.state.systems.menagerie;
      },
      emit: (n, p) => ctx.events.emit(n, p),
      now: () => ctx.state.state.meta.playSeconds,
      rng: Math.random,
      hasCalmed: (animal) => animal === 'cassowary' && ctx.state.state.systems.menagerie?.calmed?.includes('kasuar') === true,
      takenPickups: () => ctx.state.state.systems.progression?.taken ?? [],
      sideClosed: (id) => {
        const story = ctx.state.state.systems.story;
        return sideQuestClosed(stories.get(story?.chapter ?? ''), story?.beat ?? null, id);
      },
      canOfferAtNpc: (npc, chapter) => {
        return giverPlacedIn(ctx.state.state.systems.npc?.placed?.[npc], chapter);
      },
    });
    this.book.onChange = (why) => self.changed(why);

    // ---- DOM ------------------------------------------------------------------------------
    ctx.ui.hud.stack(this.tracker.el, 35);
    ctx.ui.hud.dock('feed', this.feed.el, 20);
    this.layer = ctx.ui.layer('quests');
    this.layer.classList.remove('kq-hidden');
    this.layer.classList.add('kqq-layer');
    // above the HUD, below modals (pause menu, clue cards: playtest z-order)
    this.layer.style.zIndex = '17';
    this.layer.style.pointerEvents = 'none';
    this.reward = new RewardNotice(ctx.ui.hud.noticeDock, ctx.ui.cards);
    this.beacons = new Beacons((x, z) => ctx.world.heightAt(x, z));
    ctx.scene.add(this.beacons.group);
    // 'world:quiet' (the party): the objective beacons hide, the tracker and compass stay
    const quiet = hideWhileQuiet(ctx.events, this.beacons.group);
    this.offs.push(() => quiet.dispose());
    this.registerPages();

    // ---- events ---------------------------------------------------------------------------
    const ev = ctx.events;
    this.offs.push(
      ev.on('quest:command', ({ op, id, objective, n }) => {
        if (op === 'offer') this.book.offer(id);
        else if (op === 'start') this.book.accept(id);
        else if (op === 'progress' && objective) this.book.progress(id, objective, n ?? 1, true);
        else if (op === 'complete') this.book.complete(id, true);
        else if (op === 'fail') this.book.close(id);
        else if (op === 'reset') this.book.reset(id);
      }),
      ev.on('quest:accept', ({ id }) => this.book.accept(id)),
      ev.on('quest:decline', () => (this.dirty = true)),
      ev.on('quest:told', ({ id }) => this.book.told(id)),
      ev.on('quest:turnin', ({ id }) => this.book.complete(id)),
      ev.on('story:chapter', ({ id, replay }) => {
        this.availIn = 0;
        this.book.startChapter(id, replay);
        this.book.dropEarlier(id);
        // the main quest on offer is the chapter's (renderTracker)
        this.dirty = true;
      }),
      ev.on('objective:set', () => { this.markIn = 0; }),
      ev.on('era:change', () => {
        this.availIn = 0;
        this.markIn = 0;
        this.dirty = true;
      }),
      ev.on('story:beat', () => (this.availIn = 0)),
      ev.on('level:up', () => (this.availIn = 0)),
      ev.on('chronik:open', () => openPausePage(ctx.ui.modals, 'codex')),
      ev.on('game:start', ({ resumed }) => {
        if (resumed) this.presentRestoredPayouts();
        else this.restoredPayouts.length = 0;
      }),
      ev.on('save:loaded', () => {
        this.restore();
        this.presentRestoredPayouts();
      }),
      // a new game replaces the whole state: the book must follow the new slice, or it keeps
      // writing into the old one and nothing it records is saved any more
      // (a load too, at once: save:loaded reaches the story first, whose resume runs quest
      // commands that must land in the loaded slice, not in the one being replaced)
      ctx.state.subscribe((_s, reason) => {
        if (reason !== 'new' && reason !== 'replace' && reason !== 'load') return;
        // „Weiter“ reloads the slot that boot already recovered (and autosaved): keep its payouts.
        if (reason !== 'load' || !this.ctx.pause.reasons.has('title')) {
          this.restoredPayouts.length = 0;
          this.reward.clear();
        }
        this.restore();
        if (reason !== 'load') this.presentRestoredPayouts();
      }),
      ev.on('codex:unlocked', ({ factId }) => {
        const s = this.book.slice;
        if (!s.unseen.includes(factId)) s.unseen.push(factId);
        refreshPausePage('codex');
      }),
      ev.on('discovery:found', ({ title }) => this.feed.push(t('quest.discovery.feed', { title }), 'done')),
      // deeds: a thing taken in the world sets its flag (first taken wins)
      ev.on('item:pickup', ({ item }) => {
        const d = recordItemDeed(item, this.items.get(item), ctx.state.mutable.flags);
        if (!d) return;
        ctx.events.emit('quest:deed', { flag: d.flag, value: d.value, item });
      }),
      ev.on('enemy:killed', ({ kind }) => {
        const b = (this.book.slice.bestiary ??= {});
        b[kind] = (b[kind] ?? 0) + 1;
      }),
      // own facts → HUD
      ev.on('quest:accepted', ({ id }) => {
        this.settle = true;
        this.onAccepted(id);
      }),
      ev.on('quest:progress', ({ id, objective, count, need: n }) => this.onProgress(id, objective, count, n)),
      ev.on('quest:objective', ({ id, objective }) => this.onObjective(id, objective)),
      ev.on('quest:ready', ({ id }) => this.onReady(id)),
      ev.on('quest:failed', ({ id }) => {
        const q = this.defs.get(id);
        if (q) this.feed.push(`${t('quest.failed')}: ${q.title_de}`, 'tick');
      }),
      ev.onAny((name, payload) => {
        if (!this.interest.has(name)) return;
        this.book.handle(name, payload);
      }),
    );
    this.book.onPayout = (p) => {
      if (this.restoring) {
        // a title reload can recover the same payout again: present it once
        const i = this.restoredPayouts.findIndex((q) => q.id === p.id);
        if (i >= 0) this.restoredPayouts.splice(i, 1);
        this.restoredPayouts.push(p);
      }
      else this.presentPayout(p);
    };
    this.restore();
  }

  /** A good photo of this target exists (the photo system's save slice `systems.photo.good`). */
  private hasPhoto(id: string): boolean {
    const p = (this.ctx.state.state.systems as Record<string, unknown>).photo as { good?: unknown } | undefined;
    return Array.isArray(p?.good) && p.good.includes(id);
  }

  private settleKnown(): void {
    const { era, inventory, systems } = this.ctx.state.state;
    const group = systems.combat?.groups?.['k2.pikeur'];
    this.book.settleKnown((c) => inventory.clues.includes(c), (id) => this.hasPhoto(id), group && { group, era });
  }

  slice(): QuestSlice {
    return normaliseSlice(this.ctx.state.slice('quests', createQuestSlice));
  }

  /** Load / init: slice → book, flag mirror, spawns and pickups re-declared, npc topics re-sent. */
  restore(): void {
    this.book.slice = this.slice();
    this.book.mirror();
    const { combat, progression } = this.ctx.state.state.systems;
    this.book.reassert(combat, progression);
    this.restoring = true;
    try {
      this.settleKnown();
      this.book.reconcileDeadlines(this.chapter());
    } finally {
      this.restoring = false;
    }
    this.sentTopics.clear();
    this.sentMarks.clear();
    for (const npc of [...this.following]) this.ctx.events.emit('npc:follow', { npc, follow: false });
    this.following.clear();
    this.availIn = 0;
    this.changed('restore');
  }

  private changed(why: string): void {
    this.dirty = true;
    // conversations read their topics at once (accept → progress topic in the same menu)
    this.syncNpcs();
    this.interest = this.computeInterest();
    this.syncFollow();
    // Save only on quest changes so a fresh boot leaves the save slot empty.
    // taking, finishing and failing a quest are milestones: forced saves
    if (why !== 'restore') this.ctx.save.autosave(`quest-${why}`, why === 'accept' || why === 'complete' || why === 'fail');
  }

  private computeInterest(): Set<string> {
    const s = new Set<string>();
    for (const q of this.book.running())
      for (const o of this.book.openObjectives(q)) for (const name of objectiveEvents(o)) s.add(name);
    return s;
  }

  private syncNpcs(): void {
    for (const npc of this.book.npcs()) {
      const topics = this.book.topicsFor(npc).map((tp) => (tp.kind === 'offer' || tp.kind === 'turnin' ? { ...tp, card: this.card(tp.quest, tp.kind === 'turnin') } : tp));
      // the card's ticks are part of the key: a bonus done after the quest became ready shows on it
      const key = JSON.stringify(topics.map((x) => [x.quest, x.kind, x.card?.objectives.map((o) => (o.done ? 1 : 0)).join('') ?? '', x.card?.codex ?? 0]));
      if (this.sentTopics.get(npc) !== key) {
        this.sentTopics.set(npc, key);
        this.ctx.events.emit('npc:topics', { npc, topics });
      }
      const mark = this.book.markFor(npc);
      if (this.sentMarks.get(npc) !== mark) {
        this.sentMarks.set(npc, mark);
        this.ctx.events.emit('npc:marker', { npc, mark });
      }
    }
  }

  private syncFollow(): void {
    const want = new Set<string>();
    for (const q of this.book.running()) for (const o of this.book.openObjectives(q)) if (o.type === 'escort' && o.npc) want.add(o.npc);
    for (const npc of want) if (!this.following.has(npc)) this.ctx.events.emit('npc:follow', { npc, follow: true });
    for (const npc of this.following) if (!want.has(npc)) this.ctx.events.emit('npc:follow', { npc, follow: false });
    this.following.clear();
    for (const n of want) this.following.add(n);
  }

  // ---- reactions (juice) --------------------------------------------------------------------

  private onAccepted(id: string): void {
    const q = this.defs.get(id);
    if (!q) return;
    acceptSound(this.ctx.audio);
    // The banner waits until the payout notice is gone.
    const first = q.objectives.find((o) => !o.optional && !o.hidden && !(o.after ?? []).length);
    const xp = this.book.slice.replay?.quests[id] ? 0 : q.rewards?.xp ?? 0;
    const sub = [first?.text_de, xp > 0 ? t('quest.xp', { n: xp }) : ''].filter(Boolean).join(' · ');
    this.bannerQ.push(() => {
      // A saved calm can finish the quest on acceptance: no "Nebenaufgabe" banner after its payout.
      const st = this.book.state(q.id);
      if (st === 'active' || st === 'ready') showBanner(this.layer, q.kind === 'main' ? t('quest.new') : t('quest.newSide'), q.title_de, q.kind === 'main', sub);
    });
    // voice givers speak their request (the dialogue presenter queues it)
    // (they lose their point once the first step is done: "Geh zum Damm" while you stand on it)
    const until = first ? { quest: { id: q.id, objective: first.id, gte: first.count ?? 1 } } : undefined;
    if ('voice' in q.giver) for (const l of q.offer) this.say(l, until);
    this.dirty = true;
  }

  private onProgress(id: string, obj: string, count: number, n: number): void {
    const q = this.defs.get(id);
    const o = q?.objectives.find((x) => x.id === obj);
    if (!q || !o) return;
    // the step shows in the tracker line (counter + pulse), not as a toast each (playtest round 2:
    // four stacked toasts at a fight's end)
    if (count < n) tickSound(this.ctx.audio);
    this.dirty = true;
    // pulse after the tracker re-rendered
    queueMicrotask(() => {
      this.renderTracker();
      this.tracker.pulse(id, obj);
    });
  }

  private onObjective(id: string, obj: string): void {
    this.settle = true;
    const q = this.defs.get(id);
    const o = q?.objectives.find((x) => x.id === obj);
    if (!q || !o) return;
    objectiveSound(this.ctx.audio);
    this.feed.push(o.optional && o.bonus_xp ? `${o.text_de} · +${o.bonus_xp} EP` : o.text_de, 'done');
  }

  private onReady(id: string): void {
    const q = this.defs.get(id);
    if (!q) return;
    if (turninOf(q) === 'auto') return;
    readySound(this.ctx.audio);
    this.feed.push(t('quest.turnin.feed', { title: q.title_de }), 'ready', 4200);
  }

  /** Story clears its dialogue queue on start and load. Present recovered payouts after that. */
  private presentRestoredPayouts(): void {
    if (this.ctx.pause.reasons.has('title')) return;
    for (const p of this.restoredPayouts.splice(0)) this.presentPayout(p);
  }

  /** Queue the payout notice; voice or auto turn-ins also give a short spoken line. */
  private presentPayout(p: QuestPayout): void {
    const q = this.defs.get(p.id);
    if (!q) return;
    turninSound(this.ctx.audio, p.quiet);
    const ti = turninOf(q);
    const hist = q.history ?? [];
    const view: RewardView = {
      title: p.title,
      xp: p.quiet ? 0 : p.xp,
      items: p.items.map((i) => ({ name: this.itemName(i.item), count: i.count })),
      codex: p.codex.length,
      skills: p.skills.map((s) => `${SKILL_NAME[s.id] ?? s.id} ${s.tier}`),
      // voices tell one line; the rest is in the quest log (an npc offers "Erzähl mehr")
      more: p.codex.length > 0 || ((ti === 'auto' || 'voice' in ti) && hist.length > historyAtTurnin(q)),
    };
    this.reward.push(view);
    if (ti === 'auto' || 'voice' in ti) {
      // a turn-in moment, not a lecture (playtest round 3): the thanks (one line) and one history
      // line, held back while a fight is on (the presenter's lore rule)
      const lines = [...(q.turnin_lines ?? []).slice(0, 1), ...hist.slice(0, historyAtTurnin(q))];
      for (const l of lines) this.say(l, undefined, true);
    }
    this.dirty = true;
    refreshPausePage('quests');
    refreshPausePage('codex');
    refreshPausePage('sets');
  }

  /** The RPG quest card (offer / turn-in) the conversation draws. */
  card(id: string, turnin = false): QuestCard | undefined {
    const q = this.defs.get(id);
    if (!q) return undefined;
    const r = this.book.slice.replay?.quests[id] ? {} : q.rewards ?? {};
    const facts = new Set([...(q.history ?? []).map((l) => l.fact).filter((f): f is string => !!f), ...(r.codex ?? [])]);
    const g = giverOf(q);
    return {
      title: q.title_de,
      giver: this.ctx.content.speakers.get(g)?.name_de ?? t('common.unknownPerson'),
      pitch: q.summary_de,
      main: q.kind === 'main',
      objectives: q.objectives
        .filter((o) => !o.hidden)
        .map((o) => ({ text: o.text_de, optional: !!o.optional, need: need(o), done: turnin ? this.book.objectiveDone(q, o) : undefined })),
      xp: r.xp ?? 0,
      items: (r.items ?? []).map((i) => `${(i.count ?? 1) > 1 ? `${i.count}× ` : ''}${this.itemName(i.item)}`),
      skills: (r.skills ?? []).map((s) => `${SKILL_NAME[s.id] ?? s.id} ${s.tier}`),
      codex: [...facts].filter((f) => !this.ctx.state.state.codex.facts.includes(f)).length,
    };
  }

  private say(l: QuestLine, until?: unknown, lore = false): void {
    this.ctx.events.emit('dialogue:say', { speaker: l.speaker, text: l.text, ms: Math.round(lineSeconds(l.text) * 1000), until, keep: true, lore: lore || undefined });
  }

  itemName(id: string): string {
    return this.items.get(id)?.name_de ?? itemDef(id)?.name_de ?? t('common.unknownItem');
  }

  // ---- per tick -----------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    this.gameTime += dt;
    if (this.pending.length && ctx.ui.modals.count === 0) {
      const due = this.pending.filter((p) => p.at <= this.gameTime);
      this.pending = this.pending.filter((p) => p.at > this.gameTime);
      for (const p of due) p.run();
    }
    const p = ctx.player.position;
    const room = String(ctx.state.state.flags['interior.room'] ?? '');
    if (this.settle) {
      this.settle = false;
      this.settleKnown();
    }
    this.book.tick(dt, { x: p.x, z: p.z, era: ctx.era.current, room }, (npc) => this.npcDistance(npc));
    this.book.chapter = this.chapter();
    if ((this.availIn -= dt) <= 0) {
      this.availIn = 1;
      this.book.offerAvailable(this.chapter(), ctx.era.current);
    }
  }

  private chapter(): string | null {
    const s = (this.ctx.state.state.systems as Record<string, unknown>).story as { active?: boolean; chapter?: string | null } | undefined;
    return s?.chapter ?? null;
  }

  private npcPlaced(npc: string): { x: number; z: number; era: string } | null {
    const s = (this.ctx.state.state.systems as Record<string, unknown>).npc as { placed?: Record<string, { x: number; z: number; era: string }> } | undefined;
    return s?.placed?.[npc] ?? null;
  }

  private npcDistance(npc: string): number {
    const n = this.npcPlaced(npc);
    if (!n || n.era !== this.ctx.era.current) return Infinity;
    const p = this.ctx.player.position;
    return Math.hypot(p.x - n.x, p.z - n.z);
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    // The payout uses the UI clock. The director holds it during a conversation.
    this.reward.tick(Math.min(dt, 0.1), ctx.player.position);
    // The "Neue Aufgabe" stamp waits for the payout and the chapter title.
    if (this.bannerQ.length && !this.reward.open && !this.reward.pending && !document.querySelector('.kqs-card.kqs-show')) this.bannerQ.shift()?.();
    const p = ctx.player.position;
    const refreshMarkers = (this.markIn -= dt) <= 0;
    if (refreshMarkers) {
      this.markIn = 0.1;
      this.syncCompass();
      this.stallTick(0.1);
      // the lead line's distance, refreshed with the markers (the tracker re-renders on change only)
      const tg = this.lead?.target ?? null;
      const ld = tg ? Math.hypot(tg.x - p.x, tg.z - p.z) : null;
      const dtxt = tg && ld !== null && ld >= Math.max(8, tg.r) ? distanceText(ld) : '';
      if (dtxt !== this.leadDist) {
        this.leadDist = dtxt;
        this.dirty = true;
      }
    }
    if (refreshMarkers || this.dirty) this.syncBeacons();
    if (this.dirty) {
      this.dirty = false;
      this.renderTracker();
    }
    this.tracker.tick();
    this.beacons.frame(dt, p.x, p.z, ctx.settings.state.reducedMotion, ctx.camera.position.y);
    const canvas = ctx.renderer?.domElement;
    const cw = canvas?.clientWidth || window.innerWidth;
    const ch = canvas?.clientHeight || window.innerHeight;
    ctx.ui.hud.waymark.frame(Math.min(dt, 0.1), ctx.camera, p.x, p.z, cw, ch);
    this.sideMark.frame(Math.min(dt, 0.1), ctx.camera, p.x, p.z, cw, ch);
  }

  // ---- HUD ----------------------------------------------------------------------------------

  private renderTracker(): void {
    const list: TrackerQuest[] = [];
    let first = true;
    // no main quest runs: the main quest on offer heads the tracker (playtest round 10, F-30 /
    // F-41: between two main quests the tracker showed side quests only). Not `main` on purpose:
    // the story's own line (above the tracker) still leads the way to its giver.
    const offer = this.book.mainOffer(this.chapter());
    if (offer) {
      const g = giverId(offer);
      const name = this.ctx.content.speakers.get(g)?.name_de ?? t('common.unknownPerson');
      list.push({ id: offer.id, title: offer.title_de, main: false, offer: true, ready: false, objectives: [{ id: 'offer', text: t('quest.offerAt', { name }), count: 0, need: 1, done: false, optional: false }] });
      first = false;
    }
    for (const id of this.book.tracked()) {
      const q = this.defs.get(id);
      if (!q) continue;
      const st = this.book.state(id);
      const ready = st === 'ready';
      const ti = turninOf(q);
      const who = typeof ti === 'object' ? this.ctx.content.speakers.get('npc' in ti ? ti.npc : ti.voice)?.name_de ?? t('common.unknownPerson') : null;
      list.push({
        id,
        title: q.title_de,
        main: q.kind === 'main',
        ready,
        readyText: ready && who ? t('quest.readyAt', { name: who }) : undefined,
        // the running objectives (done ones keep their tick); once ready only the open bonus ones
        objectives: q.objectives
          .filter((o) => this.book.objectiveActive(q, o) && !(o.hidden && this.book.objectiveDone(q, o)))
          .filter((o) => !ready || (o.optional && !this.book.objectiveDone(q, o)))
          .map((o) => {
            const lead = this.lead?.quest === q && this.lead.obj === o;
            return { id: o.id, text: o.text_de, count: this.book.count(id, o.id), need: need(o), done: this.book.objectiveDone(q, o), optional: !!o.optional, lead, dist: lead ? this.leadDist : undefined };
          })
          // the focused (first) quest lists its objectives; the others only their next open one
          // (playtest: three quests ran 9+ lines into the vitals)
          .filter((o, _i, all) => first || (!o.done && o === all.find((x) => !x.done))),
        hint: this.hint?.quest === id ? this.hint.text : undefined,
        here: this.here === id,
        // the story's own step leads (its place, its words): say it under the quest's goal, unless
        // it only rewords that goal (a „Q …“ line the story shows above the tracker itself: story/objectives.ts)
        via: this.lead?.quest === q ? viaLine(this.lead.label, this.lead.obj?.text_de) : undefined,
      });
      first = false;
    }
    // at most three blocks (the offer takes the place of the last side quest)
    this.tracker.render(list.slice(0, 3));
  }

  private bearing(x: number, z: number): number {
    const p = this.ctx.player.position;
    return ((Math.atan2(x - p.x, -(z - p.z)) * 180) / Math.PI + 360) % 360;
  }

  // ---- wayfinding (playtest 2026-11-19: "got stuck at the lake") ----------------------------

  private wayDeps(): WayDeps {
    const ctx = this.ctx;
    const p = ctx.player.position;
    return {
      era: ctx.era.current,
      player: { x: p.x, z: p.z },
      clue: (id) => {
        const c = ctx.content.clues.get(id);
        if (!c) return null;
        return { x: c.where.x, z: c.where.z, r: c.where.radius, eras: Array.isArray(c.where.era) ? c.where.era : [c.where.era], scan: c.requires?.scanMode, anchor: c.where.anchor };
      },
      npc: (id) => this.npcPlaced(id),
      pickups: (quest, obj) => {
        const pr = (ctx.state.state.systems as Record<string, unknown>).progression as { placed?: Record<string, { x: number; z: number; era?: string }> } | undefined;
        const pre = `${quest}.${obj}.`;
        return Object.entries(pr?.placed ?? {})
          .filter(([id]) => id.startsWith(pre))
          .map(([, v]) => v);
      },
    };
  }

  /** Where an objective is now (null: nowhere to point, or not in this era / inside a room). */
  private targetOf(q: QuestDefIn, o: QuestDefIn['objectives'][number], deps = this.wayDeps()): WayPoint | null {
    const tg = objectiveTarget(q, o, deps);
    return targetVisible(tg, deps.era, q.era) ? tg : null;
  }

  /**
   * The goal the HUD leads to: the first tracked quest (main first) with an open objective that has
   * a place in this era; a ready quest leads to its turn-in npc. When the leading main quest has no
   * place to point at right now (a "Q halten" step), the story's own objective leads instead — never
   * a side quest over the main one (before, the compass pointed at the Kohlplatten).
   */
  private computeLead(): Lead | null {
    const deps = this.wayDeps();
    const era = deps.era;
    const tracked = this.book.tracked().map((id) => this.defs.get(id)).filter((q): q is QuestDefIn => !!q);
    const so = this.ctx.state.state.systems.story?.objective;
    // „Der Gruppe folgen“: the tour walk leads to the group along its route, not to the next stop
    // (playtest 2026-11-28: walking at the stop's marker got the player stuck on a bank)
    const groupAt = so && typeof so.x === 'number' && typeof so.z === 'number' ? this.ctx.tourCrowd?.lead?.(so.x, so.z) ?? null : null;
    const storyLead = (q: QuestDefIn | null, obj: Lead['obj']): Lead | null =>
      so && typeof so.x === 'number' && typeof so.z === 'number' && so.text ? { quest: q, obj, target: { x: groupAt?.x ?? so.x, z: groupAt?.z ?? so.z, r: groupAt ? 3 : 6, kind: 'zone' }, label: so.text, story: so } : null;
    for (const q of tracked) {
      // the story's own line (the main path between two main quests: „VAT (3): die Kante im Wald
      // ansehen“) comes before any side quest
      if (q.kind !== 'main') {
        const sl = storyLead(null, null);
        if (sl) return sl;
      }
      const st = this.book.state(q.id);
      if (st === 'ready') {
        const ti = turninOf(q);
        if (typeof ti === 'object' && 'npc' in ti) {
          const n = this.npcPlaced(ti.npc);
          if (n && n.era === era) {
            const name = this.ctx.content.speakers.get(ti.npc)?.name_de ?? t('common.unknownPerson');
            return { quest: q, obj: null, target: { x: n.x, z: n.z, r: 2.5, era: n.era, kind: 'npc' }, label: t('quest.readyAt', { name }) };
          }
        }
        continue;
      }
      if (st !== 'active') continue;
      const open = this.book.openObjectives(q).filter((o) => !o.optional);
      for (const o of open) {
        const tg = this.targetOf(q, o, deps);
        if (tg) return { quest: q, obj: o, target: tg, label: o.text_de };
      }
      if (q.kind === 'main') {
        // the main quest's step has no place now: the story's line (if it has one) leads
        return storyLead(q, open[0] ?? null) ?? { quest: q, obj: open[0] ?? null, target: null, label: open[0]?.text_de ?? q.title_de };
      }
    }
    return storyLead(null, null);
  }

  /**
   * A goal inside a building while the player is outside: the marker leads to the door first
   * (playtest: the Registratur marker pointed straight through the north wing's facade, four
   * runs into the wall). Inside, or once at the door, the room itself leads again.
   */
  private viaEntrance(lead: Lead | null): Lead | null {
    const w = this.ctx.world;
    const tg = lead?.target;
    if (!lead || !tg || !w.collider.enabled) return lead;
    const p = this.ctx.player.position;
    // through the rooms door by door (playtest round 7: past the Durchfahrt's mouth the marker
    // still pointed back at it; inside it pointed through the wall at the Registratur)
    if (w.routeTo) {
      const step = w.routeTo(tg.x, tg.z, p.x, p.z, p.y);
      if (!step) return lead;
      const inside = !!this.ctx.state.state.flags['interior.room'];
      return { ...lead, target: { ...tg, x: step.x, z: step.z, r: 1.5, kind: 'zone', ...(step.mark ? { mark: step.mark } : {}) }, label: t(inside ? 'quest.viaInner' : 'quest.viaDoor', { label: lead.label }) };
    }
    if (!w.entranceFor) return lead;
    if (this.ctx.state.state.flags['interior.room'] || w.collider.footprintAt(p.x, p.z) >= 0) return lead;
    if (w.collider.footprintAt(tg.x, tg.z) < 0) return lead;
    const door = w.entranceFor(tg.x, tg.z, p.x, p.z);
    if (!door || Math.hypot(door.x - p.x, door.z - p.z) < 2.5) return lead;
    return { ...lead, target: { ...tg, x: door.x, z: door.z, r: 2, kind: 'zone' }, label: t('quest.viaDoor', { label: lead.label }) };
  }

  private syncCompass(): void {
    const ctx = this.ctx;
    const want = new Map<string, { kind: CompassKind; x: number; z: number; dist?: number; edge?: boolean }>();
    const era = ctx.era.current;
    const p = ctx.player.position;
    const lead0 = this.computeLead();
    this.lead = lead0;
    // the tracker's „→“ line reads the lead, which can change without a quest event
    const leadKey = lead0 ? `${lead0.quest?.id ?? ''}/${lead0.obj?.id ?? ''}/${lead0.label}` : '';
    if (leadKey !== this.leadKey) {
      this.leadKey = leadKey;
      this.dirty = true;
    }
    const lead = this.viaEntrance(lead0);
    this.leadDoor = lead !== lead0 && lead?.target ? { x: lead.target.x, z: lead.target.z } : null;
    if (lead?.target) want.set('kqq:obj', { kind: 'obj', x: lead.target.x, z: lead.target.z, dist: Math.hypot(lead.target.x - p.x, lead.target.z - p.z), edge: true });
    // the headline follows the tracker (playtest round 3): the lead goal is where the Bussole
    // points (story reads it from the tracker's data-tx / data-tz)
    const tx = lead?.target ?? null;
    ctx.ui.hud.questLead = lead;
    const tel = this.tracker.el;
    if (tx) {
      tel.dataset.tx = String(Math.round(tx.x * 10) / 10);
      tel.dataset.tz = String(Math.round(tx.z * 10) / 10);
    } else {
      delete tel.dataset.tx;
      delete tel.dataset.tz;
    }
    // the world waymark: a glowing diamond with the distance over the lead goal
    // also in the air: the Geisterblick is for finding the way (playtest: flying, only the compass
    // said where to go)
    if (lead?.target) {
      const mk = lead.target.mark;
      ctx.ui.hud.waymark.set({ x: mk?.x ?? lead.target.x, y: mk?.y ?? ctx.world.heightAt(lead.target.x, lead.target.z), z: mk?.z ?? lead.target.z, r: lead.target.r, label: shortLabel(lead.label), kind: lead.target.kind, main: lead.quest?.kind !== 'side' });
    } else ctx.ui.hud.waymark.set(null);
    // every other tracked quest keeps a (non-edge) compass mark too: a tracked side quest with no
    // marker at all read as "Wird verfolgt" and nowhere to go (playtest: the Irrlichter at the lake)
    const deps = this.wayDeps();
    let side: { x: number; z: number; r: number; d: number; label: string; kind: WayPoint['kind'] } | null = null;
    let here: string | null = null;
    for (const id of this.book.tracked()) {
      const q = this.defs.get(id);
      if (!q || this.book.state(q.id) !== 'active') continue;
      for (const o of this.book.openObjectives(q).filter((x) => !x.optional)) {
        const tg = this.targetOf(q, o, deps);
        if (!tg) continue;
        const d = Math.hypot(tg.x - p.x, tg.z - p.z);
        if (!here && d <= Math.max(tg.r, 12) + 6) here = q.id;
        if (q === lead?.quest) break;
        want.set(`kqq:trk:${q.id}`, { kind: 'obj', x: tg.x, z: tg.z, dist: d });
        if (d < SIDE_MARK_RANGE && (!side || d < side.d) && !(lead?.target && Math.hypot(lead.target.x - tg.x, lead.target.z - tg.z) < 4)) side = { x: tg.x, z: tg.z, r: tg.r, d, label: o.text_de, kind: tg.kind };
        break;
      }
    }
    if (here !== this.here) {
      this.here = here;
      this.dirty = true;
    }
    this.sideMark.set(side ? { x: side.x, y: ctx.world.heightAt(side.x, side.z), z: side.z, r: side.r, label: shortLabel(side.label), kind: side.kind, main: false } : null);
    if (!this.sideMark.el.isConnected) ctx.ui.hud.waymark.el.parentElement?.append(this.sideMark.el);
    for (const npc of this.book.npcs()) {
      const mark = this.book.markFor(npc);
      if (mark !== 'offer' && mark !== 'offer-main' && mark !== 'ready') continue;
      const n = this.npcPlaced(npc);
      if (!n || n.era !== era) continue;
      if (mark !== 'ready' && Math.hypot(p.x - n.x, p.z - n.z) > OFFER_RANGE) continue;
      want.set(`kqq:npc:${npc}`, { kind: mark, x: n.x, z: n.z });
    }
    for (const id of [...this.compass.keys()])
      if (!want.has(id)) {
        ctx.ui.hud.setMarker(id, null);
        this.compass.delete(id);
      }
    const colour: Record<CompassKind, string> = { obj: '#f2d58a', offer: '#f2c14e', 'offer-main': '#ffd66b', ready: '#ffe08a' };
    for (const [id, w] of want) {
      const b = this.bearing(w.x, w.z);
      ctx.ui.hud.setMarker(id, b, colour[w.kind], { dist: w.dist, edge: w.edge, kind: w.kind });
      this.compass.set(id, { kind: w.kind, bearing: b });
    }
  }

  private syncBeacons(): void {
    const ctx = this.ctx;
    const era = ctx.era.current;
    const p = ctx.player.position;
    const deps = this.wayDeps();
    const lead = this.lead;
    const specs: BeaconSpec[] = [];
    for (const q of this.book.running()) {
      if (this.book.state(q.id) !== 'active') continue;
      for (const o of this.book.openObjectives(q)) {
        const tg = this.targetOf(q, o, deps);
        if (!tg) continue;
        const isLead = lead?.obj === o && lead.quest === q && lead.target?.x === tg.x && lead.target?.z === tg.z;
        if (!isLead && Math.hypot(p.x - tg.x, p.z - tg.z) > BEACON_RANGE + 30) continue;
        specs.push({ id: `${q.id}.${o.id}`, x: tg.x, z: tg.z, r: tg.r, era, lead: isLead });
      }
    }
    // a lead that is no quest objective's own place (the story's line) gets its beam too
    if (lead?.target && lead.target.kind !== 'npc' && !specs.some((x) => x.lead)) specs.push({ id: 'kqq:lead', x: lead.target.x, z: lead.target.z, r: lead.target.r, era, lead: true });
    if (this.leadDoor) specs.push({ id: 'kqq:door', x: this.leadDoor.x, z: this.leadDoor.z, r: 2, era, lead: true });
    this.beacons.sync(specs);
  }

  /**
   * No progress for a minute (no count change, not getting closer to the marker; fights,
   * conversations and modals stop the clock): a concrete hint under the lead objective in the
   * tracker, and a short toast.
   */
  private stallTick(dt: number): void {
    const ctx = this.ctx;
    const lead = this.lead;
    const o = lead?.obj ?? null;
    const q = lead?.quest ?? null;
    // a quest step, or (no quest objective leads) the story's own line
    const key = q && o ? `${q.id}/${o.id}/${this.book.count(q.id, o.id)}/${ctx.era.current}` : lead?.target ? `story/${lead.label}` : '';
    const p = ctx.player.position;
    const d = lead?.target ? Math.hypot(lead.target.x - p.x, lead.target.z - p.z) : null;
    const held = ctx.ui.modals.count > 0 || ctx.ui.hud.acting('combat') || (typeof document !== 'undefined' && !!document.querySelector('.kqs-dlg.kqs-show'));
    if (key !== this.hintKey) {
      this.hintKey = key;
      if (this.hint) {
        this.hint = null;
        this.dirty = true;
      }
    }
    if (!this.stall.tick(held ? 0 : dt, key, d) || !lead) return;
    const text = q && o ? hintFor(o, this.hintContext(q, o, lead.target)) : storyHint(lead.label, lead.target, { x: p.x, z: p.z });
    this.hint = { quest: q?.id ?? '', obj: o?.id ?? '', text };
    this.dirty = true;
    ctx.ui.toast(`${t('quest.hint')} ${text}`, 7000);
    ctx.events.emit('quest:hint', { id: q?.id ?? '', objective: o?.id ?? '', text });
  }

  private hintContext(q: QuestDefIn, o: QuestDefIn['objectives'][number], target: WayPoint | null): HintContext {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const clue = o.clue ? ctx.content.clues.get(o.clue) : undefined;
    // the place lies in another era (a goal in 1789 seen from today): say "Q"
    const tg = objectiveTarget(q, o, this.wayDeps());
    const otherEra = (!target || target.anyEra) && tg?.era && tg.era !== ctx.era.current && !tg.room ? tg.era : null;
    return {
      target,
      otherEra,
      player: { x: p.x, z: p.z },
      scan: clue?.requires?.scanMode,
      npcName: o.npc ? (ctx.content.speakers.get(o.npc)?.name_de ?? t('common.unknownPerson')) : undefined,
      itemName: o.item ? this.itemName(o.item) : undefined,
      needsBann: !!(o.enemy && enemyDef(o.enemy)?.needsBann),
    };
  }

  /** The current hint (tests): null until the player stalled. */
  hintNow(): string | null {
    return this.hint?.text ?? null;
  }

  // ---- pause pages ------------------------------------------------------------------------------

  private registerPages(): void {
    const ctx = this.ctx;
    const book = this.book;
    const logQuests = () => [...this.defs.values(), ...[...this.retired.values()].filter((q) => {
      const status = book.state(q.id);
      return status === 'done' || status === 'failed';
    })];
    const data: PageData = {
      ctx,
      quests: logQuests,
      progress: (id) => book.progressOf(id),
      count: (id, o) => book.count(id, o),
      objectiveVisible: (q, o) => {
        const ob = q.objectives.find((x) => x.id === o);
        return !!ob && book.objectiveActive(q, ob);
      },
      tracked: () => book.tracked(),
      track: (id, on) => {
        book.track(id, on);
        this.dirty = true;
      },
      item: (id) => this.items.get(id) ?? itemDef(id),
      questItems: () => [...ITEMS.filter((i) => !!i.set), ...this.items.values()],
      owned: (id) => {
        const pr = (ctx.state.state.systems as Record<string, unknown>).progression as { inventory?: Record<string, number> } | undefined;
        return pr?.inventory?.[id] ?? 0;
      },
      unseen: () => book.slice.unseen,
      seen: (id) => {
        const s = book.slice;
        const i = s.unseen.indexOf(id);
        if (i >= 0) s.unseen.splice(i, 1);
      },
      bestiary: () => book.slice.bestiary ?? {},
      speaker: (id) => ctx.content.speakers.get(id)?.name_de ?? t('common.unknownPerson'),
      storyStep: () => {
        const so = (ctx.state.state.systems as Record<string, unknown>).story as { objective?: { text?: string | null } | null } | undefined;
        return so?.objective?.text || null;
      },
    };
    const opened = () => pageSound(ctx.audio);
    const codexUnseen = () => book.slice.unseen.filter((x) => !x.startsWith('q:') && ctx.state.state.codex.facts.includes(x)).length;
    addPausePage({ id: 'quests', label: t('page.quests'), order: 10, opened, hide: () => { this.dirty = true; }, render: (el) => renderQuests(el, data), badge: () => logQuests().filter((q) => book.slice.unseen.includes(`q:${q.id}`)).length });
    addPausePage({
      id: 'codex', label: t('page.codex'), order: 20, render: (el) => renderCodex(el, data), badge: codexUnseen,
      opened: () => {
        opened();
        ctx.events.emit('chronik:opened', { caseId: null });
      },
      hide: () => ctx.events.emit('chronik:closed', {}),
    });
    addPausePage({ id: 'sets', label: t('page.sets'), order: 30, opened, render: (el) => renderSets(el, data) });
  }

  hooks(): QuestsHooks {
    const b = this.book;
    return {
      state: () => structuredClone(b.slice),
      ids: () => [...this.defs.keys()],
      offer: (id) => b.offer(id),
      accept: (id) => b.accept(id),
      progress: (id, o, n) => b.progress(id, o, n ?? 1, true),
      complete: (id) => !!b.complete(id, true),
      turnin: (id) => !!b.complete(id),
      reset: (id) => b.reset(id),
      tracked: () => b.tracked(),
      topics: (npc) => b.topicsFor(npc),
      mark: (npc) => b.markFor(npc),
      reward: () => this.reward.open,
      rewardPending: () => this.reward.pending,
      beacons: () => this.beacons.state(),
      lead: () => {
        const l = this.lead;
        return l ? { quest: l.quest?.id ?? null, objective: l.obj?.id ?? null, x: l.target?.x ?? null, z: l.target?.z ?? null, label: l.label } : null;
      },
      hint: () => this.hintNow(),
      stall: (seconds) => {
        // tests: pretend the player stood still for `seconds`
        this.stallTick(seconds);
        this.renderTracker();
        return this.hintNow();
      },
      markers: () => [...this.compass.entries()].map(([id, m]) => ({ id, kind: m.kind, bearing: Math.round(m.bearing) })),
    };
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const id of ['quests', 'codex', 'sets']) pausePageHandle(id)?.close();
    this.reward.clear();
    this.beacons.dispose();
    this.sideMark.el.remove();
    this.tracker.el.remove();
    this.feed.el.remove();
    for (const id of this.compass.keys()) this.ctx.ui.hud.setMarker(id, null);
  }
}

function giverOf(q: QuestDef): string {
  return 'npc' in q.giver ? q.giver.npc : q.giver.voice;
}

let rt: QuestRuntime | null = null;
/** window.kq is installed after the systems' init: the hooks go in on the first frame. */
let hooks: QuestsHooks | null = null;

export default defineSystem({
  id: 'quests',
  after: ['story', 'npc', 'chronik'],
  init(ctx: GameContext) {
    rt = new QuestRuntime(ctx);
    hooks = rt.hooks();
  },
  update(dt) {
    rt?.update(dt);
  },
  frame(dt) {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.quests !== hooks) window.kq.quests = hooks;
    rt?.frame(dt);
  },
  dispose() {
    rt?.dispose();
    rt = null;
    hooks = null;
  },
});
