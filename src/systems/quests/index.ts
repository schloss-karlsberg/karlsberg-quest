/**
 * Feature "quests" — quest givers, objectives, turn-in, the Journal (J / Tab) and the HUD tracker
 * (docs/ACTION-RPG.md §8–§9; ARCHITECTURE.md §12.1 "quests").
 *
 * Contract (src/systems/contracts.ts, "quests"): listens to quest:command (story), quest:accept /
 * decline / turnin / told (npc), enemy:killed, item:pickup, npc:talk, room:enter, clue:found,
 * echo:end, menagerie:calmed, item:use (and any event an `event` objective names), story:chapter,
 * chronik:open (→ opens the Journal); emits quest:offered / accepted / progress / objective /
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
import type { Era } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { t } from '../../i18n';
import { addJournalTab, journalTabs } from '../../ui/journal';
import { itemDef, ITEMS } from '../../rpg/items';
import type { GiverMark, ItemDef, QuestCard, QuestDef, QuestLine, QuestSlice, QuestTopic } from '../../rpg/types';
import { acceptSound, objectiveSound, pageSound, readySound, tickSound, turninSound } from './audio';
import { Beacons, type BeaconSpec } from './beacons';
import { loadBundledQuests, questsInPlay } from './data';
import { Feed, RewardCard, showBanner, Tracker, type RewardView, type TrackerQuest } from './hud';
import { factLabel, JournalModal, renderCodex, renderQuests, renderSets, type JournalData } from './journal';
import { type QuestDefIn, type QuestPayout, HISTORY_AT_TURNIN, QuestBook, createQuestSlice, need, normaliseSlice, turninOf } from './logic';

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
  /** Turn in a ready quest (as the conversation does): rewards, history unlocks, reward card. */
  turnin(id: string): boolean;
  reset(id: string): boolean;
  tracked(): string[];
  /** Quest topics / glyph for an NPC right now. */
  topics(npc: string): QuestTopic[];
  mark(npc: string): GiverMark;
  journal(tab?: string): void;
  closeJournal(): void;
  journalOpen(): { open: boolean; tab: string };
  /** Reward card on screen. */
  reward(): boolean;
  beacons(): { id: string; alpha: number }[];
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

/** Rough reading time of a spoken line (game seconds). */
const lineSeconds = (s: string) => 1.6 + s.length * 0.055;

/**
 * The deed contract for physical choices (docs/ACTION-RPG.md §8.6): taking one of these things in
 * the world (`item:pickup`) sets the flag the epilogue reads. The Festsaal (Ch. 3): whichever of the
 * three objects is carried out first is `flag.k3_objekt`; leaving with none is the story's
 * `nichts`. Quest-file items add theirs with `deed`.
 */
export const DEED_ITEMS: Readonly<Record<string, { flag: string; value: string }>> = {
  'item.charm.tuergriff': { flag: 'flag.k3_objekt', value: 'tuergriff' },
  'item.charm.dukat': { flag: 'flag.k3_objekt', value: 'dukat' },
  'item.charm.uhr': { flag: 'flag.k3_objekt', value: 'uhr' },
};

const SKILL_NAME: Record<string, string> = { relief: 'Relief-Blick', kartograf: 'Kartograf', baumeister: 'Baumeister', roentgen: 'Röntgenblick', spurenleser: 'Spurenleser' };

type CompassKind = 'obj' | 'offer' | 'offer-main' | 'ready';

class QuestRuntime {
  readonly book: QuestBook;
  readonly defs: Map<string, QuestDefIn>;
  readonly items: Map<string, ItemDef>;
  private readonly tracker = new Tracker();
  private readonly feed = new Feed();
  private readonly layer: HTMLElement;
  private readonly reward: RewardCard;
  private bannerQ: (() => void)[] = [];
  readonly journal: JournalModal;
  private readonly beacons: Beacons;
  private readonly sentTopics = new Map<string, string>();
  private readonly sentMarks = new Map<string, GiverMark>();
  private readonly compass = new Map<string, { el: HTMLElement | null; kind: CompassKind; bearing: number }>();
  private readonly following = new Set<string>();
  private interest = new Set<string>();
  private dirty = true;
  /** Set when a quest was accepted or an objective closed: clues found earlier settle next tick (Q-15). */
  private settle = false;
  private availIn = 0;
  private markIn = 0;
  private pending: { at: number; run: () => void }[] = [];
  private gameTime = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ctx: GameContext) {
    const { quests, items } = questsInPlay(loadBundledQuests(), ctx.params.has('storytest'));
    this.defs = quests;
    this.items = items;
    const self = this;
    this.book = new QuestBook(this.defs, this.slice(), {
      get flags() {
        return ctx.state.mutable.flags;
      },
      get codex() {
        return ctx.state.mutable.codex.facts;
      },
      emit: (n, p) => ctx.events.emit(n, p),
      now: () => ctx.state.state.meta.playSeconds,
      rng: Math.random,
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
    this.reward = new RewardCard(this.layer);
    this.journal = new JournalModal(ctx, {
      opened: () => {
        pageSound(ctx.audio);
        ctx.events.emit('chronik:opened', { caseId: null });
      },
      closed: () => {
        ctx.events.emit('chronik:closed', {});
        this.dirty = true;
      },
      page: () => pageSound(ctx.audio),
    });
    this.beacons = new Beacons((x, z) => ctx.world.heightAt(x, z));
    ctx.scene.add(this.beacons.group);
    this.registerTabs();

    // ---- events ---------------------------------------------------------------------------
    const ev = ctx.events;
    this.offs.push(
      ev.on('quest:command', ({ op, id, objective, n }) => {
        if (op === 'offer') this.book.offer(id);
        else if (op === 'start') this.book.accept(id);
        else if (op === 'progress' && objective) this.book.progress(id, objective, n ?? 1, true);
        else if (op === 'complete') this.book.complete(id, true);
        else if (op === 'fail') {
          // the story moves on: an offer nobody took is simply withdrawn, a finished quest pays
          // out, only an accepted, unfinished one is missed (playtest: offers failed with an ×)
          const st = this.book.state(id);
          if (st === 'offered' || st === 'hidden') this.book.reset(id);
          else if (st === 'ready') this.book.complete(id, true);
          else this.book.fail(id);
        }
        else if (op === 'reset') this.book.reset(id);
      }),
      ev.on('quest:accept', ({ id }) => this.book.accept(id)),
      ev.on('quest:decline', () => (this.dirty = true)),
      ev.on('quest:told', ({ id }) => this.book.told(id)),
      ev.on('quest:turnin', ({ id }) => this.book.complete(id)),
      ev.on('story:chapter', ({ id }) => {
        this.availIn = 0;
        this.dropEarlier(id);
      }),
      ev.on('era:change', () => {
        this.availIn = 0;
        this.dirty = true;
      }),
      ev.on('level:up', () => (this.availIn = 0)),
      ev.on('chronik:open', () => this.journal.show()),
      ev.on('save:loaded', () => this.restore()),
      // a new game replaces the whole state: the book must follow the new slice, or it keeps
      // writing into the old one and nothing it records is saved any more
      ctx.state.subscribe((_s, reason) => {
        if (reason === 'new' || reason === 'replace') this.restore();
      }),
      ev.on('codex:unlocked', ({ factId }) => {
        const s = this.book.slice;
        if (!s.unseen.includes(factId)) s.unseen.push(factId);
        this.journal.refresh();
      }),
      // deeds: a thing taken in the world sets its flag (first taken wins)
      ev.on('item:pickup', ({ item }) => {
        const d = DEED_ITEMS[item] ?? this.items.get(item)?.deed;
        if (!d) return;
        const flags = ctx.state.mutable.flags;
        if (flags[d.flag] !== undefined && flags[d.flag] !== '' && flags[d.flag] !== 'nichts') return;
        flags[d.flag] = d.value;
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
    this.book.onPayout = (p) => this.onPayout(p);
    this.restore();
  }

  /**
   * A new chapter: main quests of earlier chapters still running and unaccepted offers leave the
   * log (a chapter select or story jump skipped them; in a straight run they are all done); side
   * quests of a past era of an earlier chapter end (ready → paid, active → failed).
   */
  private dropEarlier(chapter: string): void {
    const order = ['prolog', 'k1', 'k2', 'k3', 'k4', 'enden'];
    // a chapter outside the campaign (the e2e `test` chapter) comes after all of it
    const at = order.includes(chapter) ? order.indexOf(chapter) : order.length;
    for (const q of this.defs.values()) {
      const i = order.indexOf(q.chapter ?? '');
      if (i < 0 || i >= at) continue;
      const st = this.book.state(q.id);
      // main quests of a skipped chapter, and offers whose (chapter-bound) giver is gone
      if (st === 'offered' || (q.kind === 'main' && (st === 'active' || st === 'ready'))) this.book.reset(q.id);
      // side quests bound to a past era of that chapter cannot be finished any more: a finished one
      // pays out (its giver is gone), an open one fails. Present-day side quests (the prologue's)
      // keep running — the station is visited in every chapter.
      else if (q.kind === 'side' && q.era && q.era !== 'today') {
        if (st === 'ready') this.book.complete(q.id, true);
        else if (st === 'active') this.book.fail(q.id, 'chapter');
      }
      // … but not for ever: two chapters on, a present-day side quest ends too (playtest round 4:
      // the prologue's Irrlichter rose again at the dam on every retry of the K2 Pikeur, and
      // „Nicht anfassen“ / „Lichter am Weiher“ sat in the tracker through K3)
      else if (q.kind === 'side' && at - i >= 2) {
        if (st === 'ready') this.book.complete(q.id, true);
        else if (st === 'active') this.book.fail(q.id, 'chapter');
      }
    }
  }

  slice(): QuestSlice {
    return normaliseSlice(this.ctx.state.slice('quests', createQuestSlice));
  }

  /** Load / init: slice → book, flag mirror, spawns and pickups re-declared, npc topics re-sent. */
  restore(): void {
    this.book.slice = this.slice();
    this.book.mirror();
    this.book.reassert();
    this.book.settleKnown((c) => this.ctx.state.state.inventory.clues.includes(c));
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
    // a restore (boot, save:loaded) changes nothing worth saving — and at boot it would write an
    // empty save before the title, which then offers "Fortsetzen" on a fresh start
    // taking, finishing and failing a quest are milestones: forced saves
    if (why !== 'restore') this.ctx.save.autosave(`quest-${why}`, why === 'accept' || why === 'complete' || why === 'fail');
  }

  private computeInterest(): Set<string> {
    const s = new Set<string>();
    for (const q of this.book.running())
      for (const o of this.book.openObjectives(q)) {
        const ev: Record<string, string> = { kill: 'enemy:killed', collect: 'item:pickup', use: 'item:use', talk: 'npc:talk', room: 'room:enter', examine: 'clue:found', echo: 'echo:end', calm: 'menagerie:calmed' };
        if (ev[o.type]) s.add(ev[o.type]!);
        if (o.type === 'event' && o.event) s.add(o.event);
        if (o.type === 'collect' && o.drop) s.add('enemy:killed');
      }
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
    // a banner never stamps over the reward card: it waits until the card is gone
    const first = q.objectives.find((o) => !o.optional && !o.hidden && !(o.after ?? []).length);
    const xp = q.rewards?.xp ?? 0;
    const sub = [first?.text_de, xp > 0 ? t('quest.xp', { n: xp }) : ''].filter(Boolean).join(' · ');
    this.bannerQ.push(() => showBanner(this.layer, q.kind === 'main' ? t('quest.new') : t('quest.newSide'), q.title_de, q.kind === 'main', sub));
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

  /** A turn-in paid out: the reward card; voice / auto turn-ins also speak a short turn-in moment. */
  private onPayout(p: QuestPayout): void {
    const q = this.defs.get(p.id);
    if (!q) return;
    turninSound(this.ctx.audio, p.quiet);
    const ti = turninOf(q);
    const talking = this.ctx.ui.modals.count > 0;
    const hist = q.history ?? [];
    const view: RewardView = {
      title: p.title,
      xp: p.xp,
      quiet: p.quiet,
      items: p.items.map((i) => ({ name: this.itemName(i.item), count: i.count })),
      codex: p.codex.map((f) => {
        const fact = this.ctx.content.facts.get(f);
        return { id: f, title: fact?.title_de ?? f, confidence: fact?.confidence ?? 'U', label: fact ? factLabel(fact) : 'FAKT' };
      }),
      skills: p.skills.map((s) => `${SKILL_NAME[s.id] ?? s.id} ${s.tier}`),
      // voices tell one line; the rest is in the journal (an npc offers "Erzähl mehr")
      more: (ti === 'auto' || 'voice' in ti) && hist.length > HISTORY_AT_TURNIN ? t('quest.moreJournal', { n: hist.length - HISTORY_AT_TURNIN }) : undefined,
    };
    this.reward.show(view, talking);
    if (ti === 'auto' || 'voice' in ti) {
      // a turn-in moment, not a lecture (playtest round 3): the thanks (one line) and one history
      // line, held back while a fight is on (the presenter's lore rule)
      const lines = [...(q.turnin_lines ?? []).slice(0, 1), ...hist.slice(0, HISTORY_AT_TURNIN)];
      for (const l of lines) this.say(l, undefined, true);
    }
    this.dirty = true;
    this.journal.refresh();
  }

  /** The RPG quest card (offer / turn-in) the conversation draws. */
  card(id: string, turnin = false): QuestCard | undefined {
    const q = this.defs.get(id);
    if (!q) return undefined;
    const r = q.rewards ?? {};
    const facts = new Set([...(q.history ?? []).map((l) => l.fact).filter((f): f is string => !!f), ...(r.codex ?? [])]);
    const g = giverOf(q);
    return {
      title: q.title_de,
      giver: this.ctx.content.speakers.get(g)?.name_de ?? g,
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
    return this.items.get(id)?.name_de ?? itemDef(id)?.name_de ?? id;
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
    if (ctx.input.wasPressed('journal')) this.journal.show();
    else if (ctx.input.wasPressed('inventory') && journalTabs().some((x) => x.id === 'gear')) this.journal.show('gear');
    const p = ctx.player.position;
    const room = String(ctx.state.state.flags['interior.room'] ?? '');
    if (this.settle) {
      // examine / echo objectives that open after their clue was found count at once
      this.settle = false;
      this.book.settleKnown((c) => ctx.state.state.inventory.clues.includes(c));
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
    // reward card on the UI clock (the conversation pauses the game)
    this.reward.tick(Math.min(dt, 0.1));
    if (this.bannerQ.length && !this.reward.open) this.bannerQ.shift()?.();
    if (this.dirty) {
      this.dirty = false;
      this.renderTracker();
      this.syncBeacons();
    }
    const p = ctx.player.position;
    this.beacons.frame(dt, p.x, p.z, ctx.settings.state.reducedMotion);
    if ((this.markIn -= dt) <= 0) {
      this.markIn = 0.1;
      this.syncCompass();
      this.syncBeacons();
    }
  }

  // ---- HUD ----------------------------------------------------------------------------------

  private renderTracker(): void {
    const list: TrackerQuest[] = [];
    let first = true;
    for (const id of this.book.tracked()) {
      const q = this.defs.get(id);
      if (!q) continue;
      const st = this.book.state(id);
      const ready = st === 'ready';
      const ti = turninOf(q);
      const who = typeof ti === 'object' ? this.ctx.content.speakers.get('npc' in ti ? ti.npc : ti.voice)?.name_de ?? ('npc' in ti ? ti.npc : ti.voice) : null;
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
          .map((o) => ({ id: o.id, text: o.text_de, count: this.book.count(id, o.id), need: need(o), done: this.book.objectiveDone(q, o), optional: !!o.optional }))
          // the focused (first) quest lists its objectives; the others only their next open one
          // (playtest: three quests ran 9+ lines into the vitals)
          .filter((o, _i, all) => first || (!o.done && o === all.find((x) => !x.done))),
      });
      first = false;
    }
    this.tracker.render(list);
  }

  private bearing(x: number, z: number): number {
    const p = this.ctx.player.position;
    return ((Math.atan2(x - p.x, -(z - p.z)) * 180) / Math.PI + 360) % 360;
  }

  private syncCompass(): void {
    const ctx = this.ctx;
    const want = new Map<string, { kind: CompassKind; x: number; z: number }>();
    const era = ctx.era.current;
    // the tracked objective: first open objective with a place of the first tracked quest
    for (const id of this.book.tracked()) {
      const q = this.defs.get(id);
      if (!q || this.book.state(id) !== 'active') continue;
      const o = this.book.openObjectives(q).find((x) => !x.noMarker && (x.where || x.to || x.place?.length));
      const at = o ? (o.type === 'escort' && o.to ? o.to : (o.where ?? o.place?.[0] ?? o.to)) : null;
      if (at && (!at.era || at.era === era)) {
        want.set('kqq:obj', { kind: 'obj', x: at.x, z: at.z });
        break;
      }
    }
    // the headline follows the tracker (playtest round 3): the leading main quest's goal — its
    // objective, or its turn-in npc once ready — is where the Bussole points (story reads it)
    const lead = this.book.tracked().map((id) => this.defs.get(id)).find((q) => q?.kind === 'main');
    let tx: { x: number; z: number } | null = null;
    if (lead) {
      const st = this.book.state(lead.id);
      if (st === 'active') {
        const o = this.book.openObjectives(lead).find((x) => !x.noMarker && (x.where || x.to || x.place?.length));
        const at = o ? (o.type === 'escort' && o.to ? o.to : (o.where ?? o.place?.[0] ?? o.to)) : null;
        if (at && (!at.era || at.era === era)) tx = at;
      } else if (st === 'ready') {
        const ti = turninOf(lead);
        const n = typeof ti === 'object' && 'npc' in ti ? this.npcPlaced(ti.npc) : null;
        if (n && n.era === era) tx = n;
      }
    }
    const tel = this.tracker.el;
    if (tx) {
      tel.dataset.tx = String(Math.round(tx.x * 10) / 10);
      tel.dataset.tz = String(Math.round(tx.z * 10) / 10);
    } else {
      delete tel.dataset.tx;
      delete tel.dataset.tz;
    }
    const p = ctx.player.position;
    for (const npc of this.book.npcs()) {
      const mark = this.book.markFor(npc);
      if (mark !== 'offer' && mark !== 'offer-main' && mark !== 'ready') continue;
      const n = this.npcPlaced(npc);
      if (!n || n.era !== era) continue;
      if (mark !== 'ready' && Math.hypot(p.x - n.x, p.z - n.z) > OFFER_RANGE) continue;
      want.set(`kqq:npc:${npc}`, { kind: mark, x: n.x, z: n.z });
    }
    const compassEl = ctx.ui.hud.el.querySelector<HTMLElement>('.kq-compass');
    for (const id of [...this.compass.keys()])
      if (!want.has(id)) {
        ctx.ui.hud.setMarker(id, null);
        this.compass.delete(id);
      }
    const colour: Record<CompassKind, string> = { obj: '#f2d58a', offer: '#f2c14e', 'offer-main': '#ffd66b', ready: '#ffe08a' };
    for (const [id, w] of want) {
      const b = this.bearing(w.x, w.z);
      let cur = this.compass.get(id);
      if (cur && cur.kind !== w.kind) {
        ctx.ui.hud.setMarker(id, null);
        this.compass.delete(id);
        cur = undefined;
      }
      ctx.ui.hud.setMarker(id, b, colour[w.kind]);
      if (!cur) {
        // shape-coded (colour-blind safe): diamond (objective), "!" (offer), "!" ringed (main), "?" (turn-in)
        const el = (compassEl?.lastElementChild as HTMLElement | null) ?? null;
        if (el?.classList.contains('kq-compass-marker')) {
          el.classList.add('kqq-cm', `kqq-cm-${w.kind}`);
          el.dataset.kqq = id;
        }
        this.compass.set(id, { el, kind: w.kind, bearing: b });
      } else cur.bearing = b;
    }
  }

  private syncBeacons(): void {
    const ctx = this.ctx;
    const era = ctx.era.current;
    const p = ctx.player.position;
    const specs: BeaconSpec[] = [];
    for (const q of this.book.running()) {
      if (this.book.state(q.id) !== 'active') continue;
      for (const o of this.book.openObjectives(q)) {
        if (o.noMarker) continue;
        const at = o.type === 'escort' ? o.to : o.where;
        if (!at) continue;
        const e = (at.era ?? q.era ?? era) as Era;
        if (e !== era || at.room) continue;
        if (Math.hypot(p.x - at.x, p.z - at.z) > BEACON_RANGE + 30) continue;
        specs.push({ id: `${q.id}.${o.id}`, x: at.x, z: at.z, r: at.r ?? 6, era });
      }
    }
    this.beacons.sync(specs);
  }

  // ---- journal ------------------------------------------------------------------------------

  private registerTabs(): void {
    const ctx = this.ctx;
    const book = this.book;
    const data: JournalData = {
      ctx,
      quests: () => [...this.defs.values()],
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
      questItems: () => [...this.items.values(), ...ITEMS.filter((i) => !!i.set)],
      owned: (id) => {
        const pr = (ctx.state.state.systems as Record<string, unknown>).progression as { inventory?: Record<string, number> } | undefined;
        return pr?.inventory?.[id] ?? 0;
      },
      unseen: () => book.slice.unseen,
      seen: (id) => {
        const s = book.slice;
        const i = s.unseen.indexOf(id);
        if (i >= 0) {
          s.unseen.splice(i, 1);
          queueMicrotask(() => this.journal.refreshTabs());
        }
      },
      bestiary: () => book.slice.bestiary ?? {},
      speaker: (id) => ctx.content.speakers.get(id)?.name_de ?? id,
    };
    const codexUnseen = () => book.slice.unseen.filter((x) => !x.startsWith('q:') && ctx.state.state.codex.facts.includes(x)).length;
    addJournalTab({ id: 'quests', label: t('journal.tab.quests'), order: 10, render: (el) => renderQuests(el, data), badge: () => book.slice.unseen.filter((x) => x.startsWith('q:')).length });
    addJournalTab({ id: 'codex', label: t('journal.tab.codex'), order: 20, render: (el) => renderCodex(el, data), badge: codexUnseen });
    addJournalTab({ id: 'sets', label: t('journal.tab.sets'), order: 30, render: (el) => renderSets(el, data) });
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
      journal: (tab) => this.journal.show(tab),
      closeJournal: () => this.journal.close(),
      journalOpen: () => ({ open: this.journal.open, tab: this.journal.tab }),
      reward: () => this.reward.open,
      beacons: () => this.beacons.state(),
      markers: () => [...this.compass.entries()].map(([id, m]) => ({ id, kind: m.kind, bearing: Math.round(m.bearing) })),
    };
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.journal.close();
    this.reward.close();
    this.beacons.dispose();
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
