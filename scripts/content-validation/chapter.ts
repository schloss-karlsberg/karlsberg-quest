import type { ChronikCase, Clue, DialogueLine } from '../../src/content/types';
import type { Issue } from '../../src/content/validate';
import { valueKey } from '../../src/content/triggers';
import { legacyPrologueQuests } from '../../src/core/legacy-prologue-quests';
import { skillMet } from '../../src/systems/chronik/logic';
import { availableTopics, talkedFlag, talkLines } from '../../src/systems/npc/logic';
import { MAX_LEVEL } from '../../src/rpg/stats';
import { LOOT } from '../../src/rpg/items';
import type { FlagValue, ItemDef, QuestObjective } from '../../src/rpg/types';
import { createQuestSlice, matches, need, QuestBook, turninOf, type QuestDefIn } from '../../src/systems/quests/logic';
import { eventMatches, questHolds, runsOnResume } from '../../src/systems/story/engine';
import type { Action, Beat, Condition, EventCond, Reaction } from '../../src/systems/story/types';
import type { StoryInput } from './catalog';

// Runtime-owned flags with no writer in JSON. Keep the owners beside their exceptions.
const runtimeFlags = new Set([
  'court.admitted',                               // court/index.ts
  'interior.room', 'interior.building', 'festsaal.took', // interiors
  'story.credits', 'story.party', 'flag.end',       // story/index.ts (endings)
  'rpg.level',                                     // progression
  ...legacyPrologueQuests.map(q => 'quest.' + q.id), // existing saves
]);
const runtimeFlag = (key: string) => runtimeFlags.has(key) || /^measured\.KB-B\d+$/.test(key);
const droppedItems = new Set(LOOT.flatMap(t => t.entries.filter(e => e.chance > 0).map(e => e.item)));
// These notifications have a specific authored producer. A listener cannot replay an old one.
const orderedEvents = new Set([
  'story:beat', 'story:chapter', 'story:cue', 'story:choice', 'quest:offered', 'quest:accepted',
  'quest:ready', 'quest:completed', 'quest:failed', 'quest:progress', 'quest:objective',
  'clue:found', 'item:pickup', 'item:grant',
]);

export interface Catalog {
  quests: Map<string, QuestDefIn>;
  questFiles: Map<string, string>;
  items: Map<string, ItemDef>;
  clues: Map<string, Clue>;
  cases: ChronikCase[];
  dialogue: DialogueLine[];
  events: ReadonlySet<string>;
  declaredFlags: Set<string>;
}
interface Observation { issue: Issue; passed: boolean; failed: boolean; path?: string }
export class Findings {
  private readonly checks = new Map<string, Observation>();
  observe(issue: Issue, passed: boolean, path?: string) {
    const key = JSON.stringify(issue);
    const seen = this.checks.get(key) ?? { issue, passed: false, failed: false };
    seen.passed ||= passed;
    seen.failed ||= !passed;
    if (!passed && path) seen.path = path;
    this.checks.set(key, seen);
  }
  issues(limited: Set<string>): Issue[] {
    return [...this.checks.values()].filter(o => o.failed && (!o.passed || o.path)).map(o => ({
      ...o.issue, level: o.passed || limited.has(o.issue.file) ? 'warning' : o.issue.level,
      message: o.issue.message + (o.path ? ` (path: ${o.path})` : ''),
    }));
  }
}

/** A positive leaf that every way through a completion condition must satisfy. */
function requiresLeaf(c: Condition, test: (leaf: Condition) => boolean): boolean {
  if ('all' in c) return c.all.some(sub => requiresLeaf(sub, test));
  if ('any' in c) return c.any.every(sub => requiresLeaf(sub, test));
  return test(c);
}

export function freshState() {
  return {
    flags: {} as Record<string, FlagValue>, alternativeFlags: new Map<string, Set<FlagValue | null>>(),
    quests: createQuestSlice(), chapters: new Set<string>(),
    forcedClues: new Set<string>(), clues: new Set<string>(), nouns: new Set<string>(), storyItems: new Set<string>(),
    skills: {} as Record<string, number>, path: [] as string[],
    optionalFlags: new Map<string, string>(), itemSources: new Set<string>(),
    inventory: new Map<string, number>(), pickups: new Map<string, { item: string; count: number; group?: string }>(),
  };
}
export type Save = ReturnType<typeof freshState>;
type Event = { name: string; payload: Record<string, unknown> };
type Choices = Map<string, number>;

/** One forward pass for one set of player choices. QuestBook supplies the actual objective and reward semantics. */
export class Chapter {
  private readonly book: QuestBook;
  readonly visited = new Set<string>();
  private readonly npcs = new Map<string, string>();
  private beatId = '';
  private readonly eras = new Set<string>();
  private checkingWithoutFlag?: string;
  private readonly meters = new Set<string>();
  private readonly history: Event[] = [];
  private beatStart = 0;
  private changed = false;
  private readonly fired = new Set<Reaction>();
  private readonly laterReads = new Map<Condition, string>();
  private readonly deferredTurnins = new Set<string>();
  private readonly voluntaryOffers = new Set<string>();
  private readonly attempted = new Map<QuestObjective, QuestDefIn>();
  readonly unlocks = new Map<string, Save>();
  private readonly groups = new Set<string>();
  private huntMode?: string;

  constructor(
    private readonly input: StoryInput, private readonly catalog: Catalog, readonly save: Save,
    private readonly findings: Findings, private readonly choices: Choices,
    private readonly branch: (options: Choices) => void,
  ) {
    this.book = new QuestBook(catalog.quests, save.quests, {
      flags: save.flags, codex: [], now: () => 0, rng: () => 0,
      emit: (name, payload) => this.emit(name, payload as Record<string, unknown>),
    });
    this.book.onChange = () => { this.changed = true; };
    save.chapters.add(input.story.chapter);
    this.eras.add(input.story.checkpoint?.era ?? input.story.era ?? 'today');
  }

  private emit(name: string, payload: Record<string, unknown>) {
    this.history.push({ name, payload });
    if (name === 'quest:offered') {
      const q = this.catalog.quests.get(String(payload.id));
      if (q && 'npc' in q.giver) this.voluntaryOffers.add(q.id);
    }
    if (orderedEvents.has(name)) for (const id of this.voluntaryOffers) {
      const q = this.book.def(id)!;
      if (payload.id === id || payload.reason === 'quest:' + id) continue;
      for (const o of this.book.openObjectives(q)) {
        const raw = o.type === 'event' && o.event === name && matches(payload, o.match);
        const grant = o.type === 'collect' && name === 'item:pickup' && payload.item === o.item && !payload.id;
        if (raw || grant) this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(id)!, id: id + '/' + o.id,
          message: `'${name}' can fire before the player accepts the NPC's offer` }, false);
      }
    }
    if (name === 'item:grant') this.pickup(String(payload.item), Number(payload.count ?? 1), payload);
    if (name === 'skill:grant') this.save.skills[String(payload.skill)] = Number(payload.level);
    if (name === 'loot:place') {
      const item = String(payload.item);
      this.save.itemSources.add(item);
      this.save.pickups.set(String(payload.id), { item, count: Number(payload.count ?? 1), group: payload.quest as string | undefined });
    }
    if (name === 'loot:clear') {
      for (const [id, p] of this.save.pickups) if (id === payload.id || (p.group && p.group === payload.quest)) this.save.pickups.delete(id);
    }
    this.book.handle(name, payload);
  }

  private pickup(item: string, count: number, source: Record<string, unknown> = {}) {
    this.save.itemSources.add(item);
    const total = (this.save.inventory.get(item) ?? 0) + count;
    this.save.inventory.set(item, total);
    const deed = this.catalog.items.get(item)?.deed;
    if (deed && this.save.flags[deed.flag] === undefined) this.save.flags[deed.flag] = deed.value;
    this.emit('item:pickup', { item, count, total, id: source.id, reason: source.reason });
  }

  private flag(key: string, eq?: FlagValue, negated = false) {
    if (this.checkingWithoutFlag === key) return negated;
    if (runtimeFlag(key)) return true;
    const values = this.save.alternativeFlags.get(key) ?? [this.save.flags[key]];
    return [...values].some(v => (eq === undefined ? !!v : v === eq) !== negated);
  }

  private writeFlag(key: string, value: FlagValue | null, conditional: boolean) {
    if (conditional) {
      // Optional reactions can run in a different order, or be skipped before the player leaves.
      const values = this.save.alternativeFlags.get(key) ?? new Set([this.save.flags[key] ?? null]);
      values.add(value);
      this.save.alternativeFlags.set(key, values);
    } else {
      this.save.alternativeFlags.delete(key);
      this.save.optionalFlags.delete(key);
    }
    if (value === null) delete this.save.flags[key];
    else this.save.flags[key] = value;
  }

  private eventPossible(c: EventCond, chapter: boolean) {
    if (!this.catalog.events.has(c.event)) return false;
    if (c.event === 'hunt:goal') return !!this.huntMode && ['kennel', 'parforce', 'drive'].includes(this.huntMode) &&
      (!c.match?.mode || c.match.mode === this.huntMode);
    if (c.event === 'hunt:finale') return this.huntMode === 'finale';
    if (c.event === 'quelle:touch') return this.flag('quelle.call');
    if (!orderedEvents.has(c.event)) return true;
    if (c.event === 'item:pickup' && typeof c.match?.item === 'string' && this.canPickUp(c.match.item)) return true;
    return this.history.slice(chapter ? 0 : this.beatStart)
      .filter(e => eventMatches(c, e.name, e.payload)).length >= (c.times ?? 1);
  }

  private canPickUp(item: string) {
    return droppedItems.has(item) || [...this.save.pickups.values()].some(p => p.item === item);
  }

  private possible(c: Condition, chapter = false, negated = false): boolean {
    if ('not' in c) return this.possible(c.not, chapter, !negated);
    if ('all' in c || 'any' in c) {
      const children = 'all' in c ? c.all : c.any;
      const test = (v: Condition) => this.possible(v, chapter, negated);
      return ('all' in c) !== negated ? children.every(test) : children.some(test);
    }
    let yes: boolean;
    if ('flag' in c) {
      return this.flag(c.flag, c.eq, negated);
    } else if ('quest' in c) {
      if (!c.quest.objective && ['active', 'ready'].includes(c.quest.state ?? '') && this.deferredTurnins.has(c.quest.id)) return true;
      yes = questHolds(c.quest, this.save.flags);
    }
    else if ('chosen' in c) {
      const v = this.save.flags['choice.' + c.chosen];
      yes = v !== undefined && (c.option === undefined || String(v) === String(c.option));
    } else if ('talked' in c) {
      const { npc, topic, chapter } = c.talked;
      return this.flag(talkedFlag(chapter ?? this.input.story.chapter, npc, topic), undefined, negated);
    } else if ('have' in c) {
      const { clue, noun, item } = c.have;
      yes = (!clue || this.save.clues.has(clue)) && (!noun || this.save.nouns.has(noun)) && (!item || this.save.storyItems.has(item));
    } else if ('event' in c) {
      if (negated && !orderedEvents.has(c.event)) return true; // before the player acts
      yes = this.eventPossible(c, chapter);
    } else if ('reading' in c) {
      const entry = this.catalog.cases.flatMap(cs => cs.entries).find(e => e.kind === 'reading' && (e.id === c.reading || e.flag === c.reading));
      const v = this.save.flags[entry?.flag ?? c.reading];
      yes = (!!v && (c.eq === undefined || valueKey(c.eq) === valueKey(v))) ||
        (!!entry && (c.eq === undefined || c.eq === 'offen' || [...this.save.nouns].some(n => valueKey(n) === valueKey(c.eq))));
    } else if ('meter' in c) yes = this.meters.has(c.meter.id);
    else if ('caseComplete' in c) yes = this.catalog.cases.some(cs => cs.id === c.caseComplete && cs.entries.some(e => e.kind === 'fact'));
    else if ('confirmed' in c) {
      const { prefix, n } = c.confirmed;
      yes = this.catalog.cases.filter(cs => !c.confirmed.case || cs.id === c.confirmed.case)
        .flatMap(cs => cs.entries).filter(e => e.kind === 'fact' && (!prefix || e.id.startsWith(prefix))).length >= n;
    } else if ('era' in c) yes = this.eras.has(c.era);
    else if ('enter' in c && c.enter.era) return negated || this.eras.has(c.enter.era);
    else if ('level' in c) return negated || c.level <= MAX_LEVEL;
    else if ('manual' in c) yes = false;
    else return true; // Movement, time, conversations and player-controlled world state.
    return negated ? !yes : yes;
  }

  /** Record each positive read separately, including unused alternatives. */
  private audit(c: Condition, where: string, chapter = false, negated = false): void {
    if ('not' in c) return this.audit(c.not, where, chapter, !negated);
    if ('all' in c || 'any' in c) {
      for (const sub of 'all' in c ? c.all : c.any) this.audit(sub, where, chapter, negated);
    } else if (negated && 'flag' in c && !this.catalog.declaredFlags.has(c.flag) && !runtimeFlag(c.flag)) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `negated flag '${c.flag}' has no known writer` }, this.save.flags[c.flag] !== undefined);
    } else if ('event' in c && !this.catalog.events.has(c.event)) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `no known runtime emitter for '${c.event}'` }, false);
    } else if (!negated && 'quest' in c) {
      const { id, objective, gte } = c.quest;
      const q = this.book.def(id);
      const o = q?.objectives.find(o => o.id === objective);
      const seen = objective ? this.book.count(id, objective) >= (gte ?? 1) && !!o && (gte ?? 1) <= need(o)
        : this.possible(c) || (this.book.state(id) === 'done' && c.quest.state === 'active');
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `no reachable quest state for ${JSON.stringify(c.quest)} in this scope` }, seen);
    } else if (!negated && ('flag' in c || 'chosen' in c || 'reading' in c || 'meter' in c || 'have' in c || 'talked' in c)) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `no reachable producer for ${JSON.stringify(c)} while this condition is in scope` }, this.possible(c, chapter));
    }
  }

  private discover(id: string, reveals: boolean, forced = false) {
    if (forced) this.save.forcedClues.add(id);
    if (this.save.clues.has(id)) return;
    this.save.clues.add(id);
    const clue = this.catalog.clues.get(id);
    if (reveals) {
      for (const key of clue?.reveals.flags ?? []) this.save.flags[key] = true;
      for (const noun of clue?.reveals.nouns ?? []) this.save.nouns.add(noun);
    }
    this.emit('clue:found', { id, kind: clue?.kind });
    this.changed = true;
  }

  private actions(list: Action[] | undefined, where: string, conditional = false) {
    for (const a of list ?? []) {
      switch (a.do) {
        case 'flag':
          for (const [k, v] of Object.entries(a.set)) {
            if (conditional && !this.flag(k) && v) this.save.optionalFlags.set(k, where);
            this.writeFlag(k, v, conditional);
          }
          break;
        case 'choice': {
          if (!this.choices.has(a.id)) {
            for (let i = 1; i < a.options.length; i++) this.branch(new Map(this.choices).set(a.id, i));
            this.choices.set(a.id, 0);
          }
          const i = this.choices.get(a.id)!;
          const o = a.options[i];
          if (o.when) this.laterReads.set(o.when, where + '/' + a.id);
          this.save.path.push(a.id + '=' + (o.key ?? i));
          for (const [k, v] of Object.entries(o.set)) this.writeFlag(k, v, false);
          this.save.flags['choice.' + a.id] = o.key ?? i;
          this.emit('story:choice', { id: a.id, option: o.key ?? String(i) });
          this.actions(o.then, where, conditional);
          break;
        }
        case 'say': if (a.until) this.laterReads.set(a.until, where); break;
        case 'skill': this.save.skills[a.id] = Math.max(this.save.skills[a.id] ?? 0, a.tier); break;
        case 'anchor': if (a.to) { this.eras.add(a.to); this.eras.add('today'); } break;
        case 'shift': this.eras.add(a.to); break;
        case 'unlock': if (!this.unlocks.has(a.chapter)) this.unlocks.set(a.chapter, structuredClone(this.save)); break;
        case 'readings':
          for (const cs of this.catalog.cases) {
            if (a.cases && !a.cases.includes(cs.id)) continue;
            for (const e of cs.entries) if (e.kind === 'reading' && e.flag) this.save.flags[e.flag] ??= a.fill;
          }
          break;
        case 'meter': if (a.active) this.meters.add(a.id); else this.meters.delete(a.id); break;
        case 'give':
          if (a.noun) this.save.nouns.add(a.noun);
          if (a.item) this.save.storyItems.add(a.item);
          if (a.clue) this.discover(a.clue, false, true);
          break;
        case 'grant': this.discover(a.clue, true, true); break;
        case 'cue': this.emit('story:cue', { id: a.id, data: a.data }); break;
        case 'item': this.emit('item:grant', { item: a.item, count: a.count ?? 1 }); break;
        case 'loot':
          if (a.clear) this.emit('loot:clear', { id: a.id, quest: a.group });
          else this.emit('loot:place', { id: a.id, item: a.item, quest: a.group, count: a.count });
          break;
        case 'npc':
          if (a.op === 'spawn') this.npcs.set(a.npc, a.chapter ?? this.input.story.chapter);
          else if (a.op === 'despawn' && 'npc' in a && a.npc === '*') this.npcs.clear();
          else if (a.op === 'despawn' && 'npc' in a && a.npc) this.npcs.delete(a.npc);
          break;
        case 'threat':
          if (a.kind === 'pack') this.huntMode = a.active ? a.mode : undefined;
          break;
        case 'enemy':
          if (a.op === 'spawn') this.groups.add(a.group);
          else if (a.group === '*') this.groups.clear();
          else this.groups.delete(a.group);
          break;
        case 'quest':
          if (['fail', 'reset', 'complete'].includes(a.op)) this.deferredTurnins.delete(a.id);
          switch (a.op) {
            case 'offer': this.book.offer(a.id); break;
            case 'start': this.voluntaryOffers.delete(a.id); this.book.accept(a.id); break;
            case 'complete': this.book.complete(a.id, true); break;
            case 'progress': if (a.objective) this.book.progress(a.id, a.objective, a.n ?? 1, true); break;
            case 'reset': this.book.reset(a.id); break;
            case 'fail':
              if (this.book.state(a.id) === 'ready') this.book.complete(a.id);
              else if (['hidden', 'offered'].includes(this.book.state(a.id))) this.book.reset(a.id);
              else this.book.fail(a.id);
              break;
          }
          break;
      }
    }
  }

  /** World loot may be left on the ground until acceptance. Direct grants are consumed in emit(). */
  private collect(q: QuestDefIn, o: QuestObjective, item: string) {
    if ((o.drop && o.drop.chance > 0) || droppedItems.has(item)) {
      this.pickup(item, need(o), { id: q.id + '.' + o.id + '.drop' });
      return;
    }
    for (const [id, p] of this.save.pickups) {
      if (p.item !== item || this.book.objectiveDone(q, o)) continue;
      this.save.pickups.delete(id);
      this.pickup(item, p.count, { id });
    }
  }

  private tryObjective(q: QuestDefIn, o: QuestObjective) {
    this.attempted.set(o, q);
    const item = o.item;
    switch (o.type) {
      case 'manual': return; // Only a reachable progress command can advance it.
      case 'event':
        if (o.event === 'clue:found') {
          // A world clue can be left until acceptance unless a prior action or gate required it.
          for (const clue of this.catalog.clues.values()) {
            if (!this.save.clues.has(clue.id) || this.save.forcedClues.has(clue.id) || !matches({ id: clue.id, kind: clue.kind }, o.match)) continue;
            this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id + '/' + o.id,
              message: `clue '${clue.id}' can be found before this event objective opens; an examine objective credits an earlier discovery` }, false);
            this.save.forcedClues.add(clue.id);
            this.book.progress(q.id, o.id, 1);
            if (this.book.objectiveDone(q, o)) return;
          }
          return;
        }
        if (o.event === 'item:pickup' && typeof o.match?.item === 'string') {
          this.collect(q, o, o.match.item);
          return;
        }
        if (!o.event || orderedEvents.has(o.event) || !this.eventPossible({ event: o.event, match: o.match }, false)) return;
        break;
      case 'use': {
        if (!item || this.catalog.items.get(item)?.kind !== 'consumable') return;
        if (this.canPickUp(item)) this.collect(q, o, item);
        const remaining = need(o) - this.book.count(q.id, o.id);
        const held = this.save.inventory.get(item) ?? 0;
        const used = Math.min(held, remaining);
        this.save.inventory.set(item, held - used);
        this.book.progress(q.id, o.id, used);
        return;
      }
      case 'collect': if (item) this.collect(q, o, item); return;
      case 'examine': case 'echo': if (!o.clue || !this.save.clues.has(o.clue)) return; break;
      case 'talk': case 'escort': {
        const chapter = o.npc && this.npcs.get(o.npc);
        if (!o.npc || !chapter || (o.topic && !this.topics(o.npc, chapter).has(o.topic))) return;
        break;
      }
      case 'kill': if (o.group && !o.spawn?.length && !this.groups.has(o.group)) return; break;
    }
    this.book.progress(q.id, o.id, need(o));
  }

  private topics(npc: string, chapter: string): Set<string> {
    const lines = talkLines(this.catalog.dialogue, npc, chapter);
    const topics = new Set(['greet']);
    for (const era of this.eras) {
      const context = { era, flags: this.save.flags, chapter: this.input.story.chapter, beat: this.beatId, clues: [...this.save.clues] };
      for (const topic of availableTopics(lines, npc, chapter, context)) topics.add(topic);
    }
    return topics;
  }

  private activities() {
    const { story } = this.input;
    for (const [npc, chapter] of this.npcs) {
      for (const topic of [undefined, ...this.topics(npc, chapter)]) {
        const key = talkedFlag(chapter, npc, topic);
        if (this.flag(key)) continue;
        this.writeFlag(key, true, true);
        this.changed = true;
      }
    }
    for (const c of this.catalog.clues.values()) {
      if (c.chapter && !this.save.chapters.has(c.chapter) && !story.test) continue;
      if (!skillMet(c.requires?.skill, this.save.skills)) continue;
      if (!this.input.story.test && ![c.where.era].flat().some(era => this.eras.has(era))) continue;
      if (c.requires?.clues?.some(id => !this.save.clues.has(id)) || c.requires?.flags?.some(f => !this.flag(f))) continue;
      this.discover(c.id, true);
    }
    for (const q of this.book.defs.values()) {
      if (q.chapter !== story.chapter) continue;
      if (q.kind === 'side' && this.book.state(q.id) === 'hidden') {
        const a = q.available;
        const flag = !a?.flag || this.flag(a.flag);
        if (a?.flag) this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id,
          message: `available.flag '${a.flag}' has no reachable truthy writer` }, flag);
        if (flag && (!a?.era || this.eras.has(a.era)) && (a?.level ?? 1) <= MAX_LEVEL &&
            (a?.after ?? []).every(id => this.book.state(id) === 'done')) this.book.offer(q.id);
      }
      if (this.book.state(q.id) === 'offered' && 'npc' in q.giver && this.npcs.has(q.giver.npc)) this.book.accept(q.id);
      // Visit newly opened successors as well. A player may finish this route before
      // picking up an alternative story clue (e.g. asking Liese for the coat).
      const tried = new Set<QuestObjective>();
      for (let open = this.book.openObjectives(q); open.length; open = this.book.openObjectives(q).filter(o => !tried.has(o))) {
        for (const o of open) {
          tried.add(o);
          this.tryObjective(q, o);
        }
      }
      const t = turninOf(q);
      if (this.book.state(q.id) === 'ready' && (t === 'auto' || 'voice' in t || this.npcs.has(t.npc))) {
        if (t !== 'auto') this.deferredTurnins.add(q.id);
        this.book.complete(q.id);
      }
    }
  }

  /** Follow enabled reactions and world interactions until this beat has no new producers. */
  private settleBeat(beat: Beat, where: string): boolean {
    const { file, story } = this.input;
    let canLeave = false;
    const repeatCounts = new Map<Reaction, number>();
    do {
      this.changed = false;
      for (const r of [...story.on ?? [], ...beat.on ?? []]) {
        const chapter = !!story.on?.includes(r);
        const at = (chapter ? story.chapter : where) + '/' + r.id;
        this.audit(r.when, at, chapter);
        if (this.fired.has(r) || !this.possible(r.when, chapter)) continue;
        const start = this.history.length;
        this.fired.add(r);
        this.actions(r.do, at, true);
        // A repeatable interaction can supply several ticks to the same open objective.
        if (r.repeat && !('timer' in r.when || 'chapterTimer' in r.when || 'event' in r.when) &&
            this.possible(r.when, chapter, true) && this.history.slice(start).some(e =>
              e.name === 'quest:progress' && Number(e.payload.count) < Number(e.payload.need))) {
          const times = (repeatCounts.get(r) ?? 0) + 1;
          repeatCounts.set(r, times);
          if (times < 64) this.fired.delete(r);
          else this.findings.observe({ level: 'warning', file, id: at, message: 'check repeat timing in play after 64 firings' }, false);
        }
        this.changed = true;
      }
      for (const [c, at] of this.laterReads) this.audit(c, at);
      this.audit(beat.complete, where);
      canLeave ||= this.possible(beat.complete);
      this.activities();
    } while (this.changed);
    return canLeave;
  }

  /** Passing a gate constrains what the player must already have accepted, found or turned in. */
  private afterGate(condition: Condition, where: string) {
    const { file, story } = this.input;
    for (const id of this.deferredTurnins) {
      if (requiresLeaf(condition, c => 'quest' in c && c.quest.id === id && !c.quest.objective && (c.quest.state ?? 'done') === 'done')) this.deferredTurnins.delete(id);
    }
    for (const id of this.voluntaryOffers) {
      if (requiresLeaf(condition, c => 'quest' in c && c.quest.id === id && c.quest.state !== 'offered')) this.voluntaryOffers.delete(id);
    }
    for (const id of this.save.clues) {
      if (requiresLeaf(condition, c => 'have' in c && c.have.clue === id)) this.save.forcedClues.add(id);
    }
    for (const [flag, source] of this.save.optionalFlags) {
      if (!this.possible(condition)) break;
      this.checkingWithoutFlag = flag;
      const required = !this.possible(condition);
      this.checkingWithoutFlag = undefined;
      if (!required) continue;
      if (!source.startsWith(where + '/') && !story.on?.some(r => story.chapter + '/' + r.id === source)) {
        this.findings.observe({ level: 'warning', file, id: where,
          message: `flag '${flag}' depends on optional reaction ${source} in an earlier beat` }, false);
      }
      this.save.optionalFlags.delete(flag); // A player who passes this gate has the flag.
    }
  }

  run(): boolean {
    const { file, story } = this.input;
    this.emit('story:chapter', { id: story.chapter });
    let beat: Beat | undefined = story.beats.find(b => b.id === story.start);
    let resume = false;
    while (beat && !this.visited.has(beat.id)) {
      const where = story.chapter + '/' + beat.id;
      this.visited.add(beat.id);
      this.beatId = beat.id;
      this.beatStart = this.history.length;
      this.emit('story:beat', { chapter: story.chapter, beat: beat.id });
      this.laterReads.clear();
      for (const r of story.on ?? []) if (r.repeat) this.fired.delete(r);
      this.actions(resume ? beat.enter?.filter(runsOnResume) : beat.enter, where);
      resume = false;
      if (beat.checkpoint && !this.visited.has(beat.checkpoint)) {
        const key = 'checkpoint:' + where;
        if (!this.choices.has(key)) {
          this.branch(new Map(this.choices).set(key, 1));
          this.choices.set(key, 0);
        }
        if (this.choices.get(key)) {
          const target = beat.checkpoint;
          beat = story.beats.find(b => b.id === target);
          this.save.path.push(key);
          resume = true;
          continue;
        }
      }
      const canLeave = this.settleBeat(beat, where);
      if (!('manual' in beat.complete && story.test)) {
        const path = this.save.path.join(', ');
        this.findings.observe({ level: 'error', file, id: where,
          message: `beat cannot complete from its start state: ${JSON.stringify(beat.complete)}` }, canLeave, path || undefined);
      }
      if (!canLeave) {
        this.explainQuests(beat.complete, where);
        return false;
      }
      this.afterGate(beat.complete, where);
      this.actions(beat.exit, where);
      const next = beat.next ?? story.beats[story.beats.indexOf(beat) + 1]?.id;
      beat = story.beats.find(b => b.id === next);
    }
    if (beat) {
      this.findings.observe({ level: 'warning', file, id: story.chapter + '/' + beat.id,
        message: 'next transitions form a cycle; chapter completion may be unreachable' }, false);
      return false;
    }
    this.actions(story.leave, story.chapter + '/leave');
    return true;
  }

  checkObjectives() {
    for (const q of this.catalog.quests.values()) {
      if (q.chapter !== this.input.story.chapter) continue;
      if (q.kind === 'side') for (const id of q.available?.after ?? []) {
        this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id,
          message: `available.after requires '${id}' to finish in time` }, this.book.state(id) === 'done');
      }
      for (const o of q.objectives) {
        if (!o.item || o.place?.length || o.drop || this.attempted.has(o)) continue;
        this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id + '/' + o.id,
          message: `no reachable source of required item '${o.item}'` }, this.save.itemSources.has(o.item) || droppedItems.has(o.item));
      }
    }
    for (const [o, q] of this.attempted) {
      if (o.type !== 'event' && o.type !== 'collect' && o.type !== 'use') continue;
      const done = this.book.objectiveDone(q, o);
      const required = o.event ?? o.item;
      const earlier = this.history.some(e => e.name === (o.event ?? 'item:pickup') && matches(e.payload, o.event ? o.match : { item: o.item! }));
      const detail = o.event ? `no sufficient matching '${required}' events while the objective is open`
        : `no sufficient reachable ${o.type === 'use' ? 'usable supply' : 'pickups'} of '${required}' while the objective is open`;
      this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id + '/' + o.id,
        message: detail + (earlier && !done ? '; check emission order against acceptance and after' : '') }, done);
    }
  }

  private explainQuests(c: Condition, gate: string) {
    if ('all' in c || 'any' in c) {
      for (const sub of 'all' in c ? c.all : c.any) if (!this.possible(sub)) this.explainQuests(sub, gate);
    } else if ('quest' in c) {
      const q = this.book.def(c.quest.id);
      if (!q) return;
      const state = this.book.state(q.id);
      const open = q.objectives.filter(o => !o.optional && !this.book.objectiveDone(q, o));
      const reason = state === 'hidden' ? 'no reachable offer or start' : state === 'offered' ? 'giver unavailable'
        : state === 'ready' ? 'turn-in unavailable' : open.map(o => `${o.id} (${o.event ?? o.item ?? o.type})`).join(', ');
      this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id,
        message: `${gate} needs this quest; state '${state}', ${reason}` }, false);
    }
  }
}
