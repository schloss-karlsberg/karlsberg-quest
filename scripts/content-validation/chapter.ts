import type { ChronikCase, Clue, DialogueLine } from '../../src/content/types';
import type { Issue } from '../../src/content/validate';
import { valueKey } from '../../src/content/triggers';
import { ERA_INFO, isEra, type Era } from '../../src/core/era';
import { legacyPrologueQuests } from '../../src/core/legacy-prologue-quests';
import { skillMet } from '../../src/systems/chronik/logic';
import { inspectOutcome } from '../../src/systems/court/logic';
import { remaining, upsertGroup, type SpawnRequest } from '../../src/systems/combat/rules';
import { stackLimit } from '../../src/systems/progression/logic';
import { endingScenes } from '../../src/systems/story/endings/scenes';
import { holdSeconds } from '../../src/systems/story/dialogue/presenter';
import { availableTopics, BYE, GREET, talkedFlag, talkLines } from '../../src/systems/npc/logic';
import { levelForXp } from '../../src/rpg/stats';
import { enemyDef } from '../../src/rpg/enemies';
import { canMeasure } from '../../src/systems/skills/logic';
import { LOOT } from '../../src/rpg/items';
import type { EnemyGroupState, FlagValue, ItemDef, QuestObjective } from '../../src/rpg/types';
import { createQuestSlice, itemDeed, killMatches, matches, need, QuestBook, recordItemDeed, turninOf, type QuestDefIn } from '../../src/systems/quests/logic';
import { eventMatches, questHolds, roomIdMatches, runsOnResume } from '../../src/systems/story/engine';
import type { Action, Beat, ChoiceAction, Condition, EventCond, NpcAction, Reaction } from '../../src/systems/story/types';
import type { RuntimeWorld, StoryInput } from './catalog';
import { leaves, presentation, type ScheduledAction } from './timeline';

const legacyFlags = new Set(legacyPrologueQuests.map(q => 'quest.' + q.id));
const runtimeFlags = new Set(['court.admitted', 'interior.room', 'interior.building', 'festsaal.took',
  'story.credits', 'story.party', 'flag.end', 'rpg.level', 'shift.allowed', 'shift.target', 'shift.x', 'shift.z', 'shift.r']);
const endingOptions = Object.values(endingScenes());
const droppedItems = new Set(LOOT.flatMap(t => t.entries.filter(e => e.chance > 0).map(e => e.item)));
// These notifications have a specific authored producer. A listener cannot replay an old one.
const orderedEvents = new Set([
  'story:beat', 'story:chapter', 'story:cue', 'story:choice', 'quest:offered', 'quest:accepted',
  'quest:ready', 'quest:completed', 'quest:failed', 'quest:progress', 'quest:objective',
  'clue:found', 'item:pickup', 'item:grant', 'npc:arrived', 'npc:talk', 'enemy:killed', 'enemy:cleared',
  'chronik:batch', 'chronik:case-complete', 'court:admitted', 'story:ending', 'story:credits',
]);

export interface Catalog {
  quests: Map<string, QuestDefIn>;
  questFiles: Map<string, string>;
  items: Map<string, ItemDef>;
  clues: Map<string, Clue>;
  cases: ChronikCase[];
  dialogue: DialogueLine[];
  world: RuntimeWorld;
  events: ReadonlySet<string>;
  declaredFlags: Set<string>;
}
interface Observation {
  issue: Issue;
  passed: boolean;
  failed: boolean;
  passedPaths: Set<string>;
  failedPaths: Set<string>;
}
export class Findings {
  private readonly checks = new Map<string, Observation>();
  observe(issue: Issue, passed: boolean, path?: string) {
    const key = JSON.stringify(issue);
    const seen = this.checks.get(key) ?? {
      issue, passed: false, failed: false, passedPaths: new Set<string>(), failedPaths: new Set<string>(),
    };
    seen.passed ||= passed;
    seen.failed ||= !passed;
    if (path) (passed ? seen.passedPaths : seen.failedPaths).add(path);
    this.checks.set(key, seen);
  }
  issues(limited: Set<string>): Issue[] {
    const issues: Issue[] = [];
    for (const o of this.checks.values()) {
      const path = [...o.failedPaths].reverse().find(p => !o.passedPaths.has(p));
      if (!o.failed || (o.passed && !path)) continue;
      issues.push({
        ...o.issue, level: o.passed || limited.has(o.issue.file) ? 'warning' : o.issue.level,
        message: o.issue.message + (path ? ` (path: ${path})` : ''),
      });
    }
    return issues;
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
    inventory: new Map<string, number>(), pickups: new Map<string, Pickup>(), taken: new Set<string>(),
    groups: {} as Record<string, EnemyGroupState>, npcs: new Map<string, Npc>(),
    era: undefined as Era | undefined, x: 0, z: 0, xp: 0, courtSets: new Set<string>(),
    offered: new Set<string>(), completed: new Set<string>(),
  };
}
export type Save = ReturnType<typeof freshState>;
type Pickup = { item: string; count: number; era: Era; group?: string; x?: number; z?: number; drop?: boolean };
type Npc = { chapter: string; era: Era; watch?: NpcAction['watch'] };
type Event = { name: string; payload: Record<string, unknown> };
type Choices = Map<string, number>;

/** One forward pass for one set of player choices. QuestBook supplies the actual objective and reward semantics. */
export class Chapter {
  private readonly book: QuestBook;
  readonly visited = new Set<string>();
  private readonly walks = new Map<string, { at: string; route: string }>();
  private readonly walkGroups = new Map<string, { leader: string; members: string[] }>();
  private beatId = '';
  private time = 0;
  private beatTime = 0;
  private readonly scheduled: ScheduledAction[] = [];
  private choice?: { action: ChoiceAction; key: string; where: string; at: number; conditional: boolean };
  private nextOccurrence = 0;
  private festsaalRoom?: string;
  private ending?: 'museum' | 'burn' | 'keep';
  private checkingWithoutFlag?: string;
  private readonly meters = new Set<string>();
  private readonly history: Event[] = [];
  private beatStart = 0;
  private changed = false;
  private readonly fired = new Set<Reaction>();
  private readonly laterReads = new Map<Condition, string>();
  private readonly repeatStart = new Map<Reaction, number>();
  private readonly repeatReady = new Map<Reaction, number>();
  private readonly voluntaryOffers = new Set<string>();
  private readonly attempted = new Map<QuestObjective, QuestDefIn>();
  readonly unlocks = new Map<string, Save>();
  private huntMode?: string;

  constructor(
    private readonly input: StoryInput, private readonly catalog: Catalog, readonly save: Save,
    private readonly findings: Findings, private readonly choices: Choices,
    private readonly branch: (options: Choices) => void,
  ) {
    this.book = new QuestBook(catalog.quests, save.quests, {
      flags: save.flags, codex: [], now: () => this.time, rng: () => 0,
      emit: (name, payload) => this.emit(name, payload as Record<string, unknown>),
    });
    this.book.onChange = () => { this.changed = true; };
    save.chapters.add(input.story.chapter);
    save.era = input.story.checkpoint?.era ?? save.era ?? input.story.era ?? 'today';
    if (input.story.checkpoint) ({ x: save.x, z: save.z } = input.story.checkpoint);
    save.flags['rpg.level'] ??= 1;
  }

  private get era(): Era {
    return this.save.era!;
  }

  private get eras(): ReadonlySet<Era> {
    const target = this.save.flags['shift.target'];
    const eras = new Set<Era>([this.era, 'today']);
    if (this.save.flags['shift.allowed'] === true && isEra(target)) eras.add(target);
    return eras;
  }

  private emit(name: string, payload: Record<string, unknown>) {
    this.history.push({ name, payload });
    if (name === 'quest:completed') {
      const id = String(payload.id);
      this.save.completed.add(id);
      for (const key of Object.keys(this.book.def(id)?.rewards?.flags ?? {})) this.save.alternativeFlags.delete(key);
    }
    if (name === 'quest:accepted' || name === 'quest:offered') this.save.offered.add(String(payload.id));
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
    if (name === 'item:grant') this.pickup(String(payload.item), Number(payload.count ?? 1), { reason: payload.reason });
    if (name === 'enemy:spawn' && enemyDef(String(payload.kind))) upsertGroup(this.save.groups, payload as unknown as SpawnRequest);
    if (name === 'xp:grant') this.addXp(Number(payload.amount));
    if (name === 'codex:unlocked' && !payload.noXp) this.addXp(10);
    if (name === 'enemy:despawn') {
      if (payload.group === '*') this.save.groups = {};
      else delete this.save.groups[String(payload.group)];
    }
    if (name === 'skill:grant') {
      const skill = String(payload.skill);
      this.save.skills[skill] = Math.max(this.save.skills[skill] ?? 0, Number(payload.level));
    }
    if (name === 'loot:place') {
      const item = String(payload.item);
      this.save.itemSources.add(item);
      const id = String(payload.id);
      if (!this.save.taken.has(id)) this.save.pickups.set(id, {
        item, count: Number(payload.count ?? 1), group: payload.quest as string | undefined,
        era: isEra(payload.era) ? payload.era : this.era, x: payload.x as number | undefined, z: payload.z as number | undefined, drop: payload.drop === true,
      });
    }
    if (name === 'loot:clear') {
      for (const [id, p] of this.save.pickups) if (id === payload.id || (p.group && p.group === payload.quest)) this.save.pickups.delete(id);
    }
    if (name === 'item:pickup') {
      const item = String(payload.item);
      const deed = recordItemDeed(item, this.catalog.items.get(item), this.save.flags);
      if (deed) {
        this.save.alternativeFlags.delete(deed.flag);
        this.emit('quest:deed', { ...deed, item });
      }
    }
    this.book.handle(name, payload);
    this.changed = true;
  }

  private addXp(amount: number) {
    if (amount <= 0) return;
    const previous = levelForXp(this.save.xp);
    this.save.xp += Math.round(amount);
    const next = levelForXp(this.save.xp);
    if (next > previous) this.writeFlag('rpg.level', next, false);
  }

  private pickupPayload(item: string, want: number, held: number, source: Record<string, unknown>) {
    const count = Math.min(Math.max(1, Math.round(want)), stackLimit(this.catalog.items.get(item)) - held);
    return { item, count, total: held + count, ...source };
  }

  private pickup(item: string, want: number, source: Record<string, unknown>) {
    this.save.itemSources.add(item);
    const payload = this.pickupPayload(item, want, this.save.inventory.get(item) ?? 0, source);
    if (payload.count <= 0) return 0;
    this.save.inventory.set(item, payload.total);
    this.emit('item:pickup', payload);
    return payload.count;
  }

  private pickupSource(id: string, p: Pickup) {
    return { id, x: p.x, z: p.z, reason: 'pickup' };
  }

  private take(id: string, p: Pickup) {
    const count = this.pickup(p.item, p.count, this.pickupSource(id, p));
    if (count <= 0) return;
    if (count < p.count) p.count -= count;
    else {
      this.save.pickups.delete(id);
      if (!p.drop) this.save.taken.add(id);
    }
  }

  private flag(key: string, eq?: FlagValue, negated = false) {
    if (this.checkingWithoutFlag === key) return negated;
    const values = (!this.concreteFlags && !this.checkingInline ? this.save.alternativeFlags.get(key) : undefined) ?? [this.save.flags[key], ...this.worldFlagValues(key, eq)];
    return [...values].some(v => (eq === undefined ? !!v : v === eq) !== negated);
  }

  private worldFlagValues(key: string, eq?: FlagValue): FlagValue[] {
    // Exploration can enter a known room in an intact era (interiors/index.ts).
    if ((key === 'interior.room' || key === 'interior.building') && [...this.eras].some(era => ERA_INFO[era].palace === 'intact')) {
      return ['', ...this.catalog.world.rooms.map(room => key === 'interior.room' ? room.roomId : room.building)];
    }
    // The tape measure writes rounded, nonnegative metres on a known building footprint.
    if (key.startsWith('measured.') && canMeasure({ skills: this.save.skills, free: false }) &&
        this.catalog.world.buildings.has(key.slice('measured.'.length))) {
      if (eq === undefined) return [1];
      if (typeof eq === 'number' && eq >= 0 && Math.round(eq * 10) / 10 === eq) return [eq];
    }
    return [];
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

  private eventFloor = 0;
  private checkingInline = false;
  private concreteFlags = false;

  private eventCount(c: EventCond, chapter: boolean) {
    return this.history.slice(Math.max(this.eventFloor, chapter ? 0 : this.beatStart))
      .filter(e => eventMatches(c, e.name, e.payload)).length;
  }

  private eventPossible(c: EventCond, chapter: boolean) {
    if (this.checkingInline || !this.catalog.events.has(c.event)) return false;
    if (this.eventFloor || orderedEvents.has(c.event)) return this.eventCount(c, chapter) >= (c.times ?? 1);
    if (c.event === 'hunt:goal') return !!this.huntMode && ['kennel', 'parforce', 'drive'].includes(this.huntMode) &&
      (!c.match?.mode || c.match.mode === this.huntMode);
    if (c.event === 'hunt:finale') return this.huntMode === 'finale';
    if (c.event === 'quelle:touch') return this.flag('quelle.call');
    if (c.event === 'quelle:find') return this.flag('quelle.find');
    return true;
  }

  private produceEvents(c: Condition, chapter = false) {
    if ('all' in c || 'any' in c) {
      for (const child of 'all' in c ? c.all : c.any) {
        if ('any' in c && this.possible(c, chapter)) break;
        this.produceEvents(child, chapter);
      }
      return;
    }
    if (!('event' in c) || !this.catalog.events.has(c.event) || this.eventPossible(c, chapter)) return;
    const needed = Math.max(0, (c.times ?? 1) - this.eventCount(c, chapter));
    if (c.event === 'item:pickup') {
      this.pickupForEvent(c, needed);
    } else if (c.event === 'npc:arrived' && this.eras.has('today')) {
      const arrivals = [...this.walks].flatMap(([npc, walk]) => {
        const payload = [false, true].map(skipped => ({ npc, ...walk, skipped })).find(p => eventMatches(c, 'npc:arrived', p));
        return payload ? [payload] : [];
      });
      if (arrivals.length < needed) return;
      for (const payload of arrivals.slice(0, needed)) {
        this.walks.delete(payload.npc);
        this.emit('npc:arrived', payload);
      }
    } else if (c.event === 'npc:talk') {
      const talk = [...this.talks()].find(payload => eventMatches(c, 'npc:talk', payload));
      if (talk) for (let i = 0; i < needed; i++) this.talk(talk);
    } else if (c.event === 'enemy:killed' || c.event === 'enemy:cleared') {
      if (this.save.flags['combat.disabled'] === true) return;
      for (const g of Object.values(this.save.groups)) {
        if (!this.eras.has(g.era)) continue;
        while (this.save.groups[g.group] === g && remaining(g) > 0 && !this.eventPossible(c, chapter) &&
          eventMatches(c, c.event, c.event === 'enemy:cleared' ? { group: g.group, kind: g.kind } : this.enemyPayload(g))) this.kill(g);
      }
    }
  }

  // Preview the actual stack-limited payloads so an impossible alternative does not take its loot.
  private pickupForEvent(c: EventCond, needed: number) {
    const held = new Map(this.save.inventory);
    const picks: [string, Pickup][] = [];
    for (const [id, p] of this.save.pickups) {
      if (!this.eras.has(p.era)) continue;
      const payload = this.pickupPayload(p.item, p.count, held.get(p.item) ?? 0, this.pickupSource(id, p));
      if (payload.count <= 0 || !eventMatches(c, 'item:pickup', payload)) continue;
      held.set(p.item, payload.total);
      picks.push([id, p]);
      if (picks.length >= needed) break;
    }
    if (picks.length < needed) return;
    for (const [id, p] of picks) if (this.save.pickups.get(id) === p) this.take(id, p);
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
      if (negated && !this.checkingInline && !orderedEvents.has(c.event)) return true; // before the player acts
      yes = this.eventPossible(c, chapter);
    } else if ('reading' in c) {
      const entry = this.catalog.cases.flatMap(cs => cs.entries).find(e => e.kind === 'reading' && (e.id === c.reading || e.flag === c.reading));
      const v = this.save.flags[entry?.flag ?? c.reading];
      yes = typeof v === 'string' && !!v && (c.eq === undefined || valueKey(c.eq) === valueKey(v));
    } else if ('meter' in c) yes = this.meters.has(c.meter.id);
    else if ('caseComplete' in c) yes = false; // Confirmation is restricted to old saves and debug helpers.
    else if ('confirmed' in c) yes = c.confirmed.n <= 0;
    else if ('timer' in c) yes = (this.checkingInline ? 0 : this.time - (chapter ? 0 : this.beatTime)) >= c.timer;
    else if ('chapterTimer' in c) yes = this.time >= c.chapterTimer;
    else if ('era' in c) return [...this.eras].some(era => (era === c.era) !== negated);
    else if ('enter' in c && c.enter.era) return negated || this.eras.has(c.enter.era);
    else if ('room' in c) {
      const { flags } = this.save;
      yes = roomIdMatches(c.room, String(flags['interior.room'] ?? ''), String(flags['interior.building'] ?? '')) ||
        (this.catalog.world.rooms.some(room => roomIdMatches(c.room, room.roomId, room.building)) &&
          [...this.eras].some(era => ERA_INFO[era].palace === 'intact'));
    }
    else if ('level' in c) yes = Number(this.save.flags['rpg.level'] ?? 1) >= c.level;
    else if ('manual' in c) yes = false;
    else return true; // Movement, time, conversations and player-controlled world state.
    return negated ? !yes : yes;
  }

  /** Record each positive read separately, including unused alternatives. */
  private audit(c: Condition, where: string, chapter = false, negated = false): void {
    if ('not' in c) return this.audit(c.not, where, chapter, !negated);
    if ('all' in c || 'any' in c) {
      for (const sub of 'all' in c ? c.all : c.any) this.audit(sub, where, chapter, negated);
    } else if (negated && 'flag' in c && !this.catalog.declaredFlags.has(c.flag) && !runtimeFlags.has(c.flag) && !legacyFlags.has(c.flag) && !c.flag.startsWith('measured.')) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `negated flag '${c.flag}' has no known writer` }, this.save.flags[c.flag] !== undefined);
    } else if ('event' in c && !this.catalog.events.has(c.event)) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `no known runtime emitter for '${c.event}'` }, false);
    } else if (!negated && 'event' in c && c.event === 'npc:arrived') {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `no reachable walk arrival matches ${JSON.stringify(c)} in this scope` }, this.possible(c, chapter));
    } else if (!negated && ('confirmed' in c || 'caseComplete' in c ||
        ('event' in c && ['chronik:case-complete', 'chronik:batch'].includes(c.event)) || ('flag' in c && legacyFlags.has(c.flag)))) {
      this.findings.observe({ level: 'warning', file: this.input.file, id: where,
        message: `${JSON.stringify(c)} requires legacy-save or debug progress; fresh play has no such writer` }, this.possible(c, chapter));
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
      for (const key of clue?.reveals.flags ?? []) this.writeFlag(key, true, false);
      for (const noun of clue?.reveals.nouns ?? []) this.save.nouns.add(noun);
    }
    this.emit('clue:found', { id, kind: clue?.kind });
    this.changed = true;
  }

  private choose(key: string, indices: number[]): number {
    const existing = this.choices.get(key);
    if (!indices.length) return -1;
    if (existing !== undefined && indices.includes(existing)) return existing;
    for (const i of indices.slice(1)) this.branch(new Map(this.choices).set(key, i));
    this.choices.set(key, indices[0]);
    return indices[0];
  }

  private applyChoice(a: ChoiceAction, i: number, where: string, conditional: boolean) {
    const option = a.options[i];
    if (!option) return;
    this.choice = undefined;
    this.save.path.push(a.id + '=' + (option.key ?? i));
    for (const [key, value] of Object.entries(option.set)) this.writeFlag(key, value, false);
    this.writeFlag('choice.' + a.id, option.key ?? i, false);
    this.emit('story:choice', { id: a.id, option: option.key ?? String(i) });
    this.actions(option.then, where, conditional);
  }

  private inlineChoice() {
    const pending = this.choice;
    if (!pending) return;
    const { action, key, at, where, conditional } = pending;
    if ((action.seconds ?? 0) > 0 && this.time >= at) {
      this.applyChoice(action, action.fallback ?? 0, where, conditional);
      return;
    }
    this.checkingInline = true;
    const options: number[] = [];
    let mayWait = (action.seconds ?? 0) > 0;
    for (const [i, o] of action.options.entries()) {
      if (!o.when) continue;
      this.audit(o.when, where + '/' + action.id);
      if (!this.possible(o.when)) continue;
      options.push(i);
      // The runtime picks the first match. A player-controlled condition can also be false.
      if (!this.possible(o.when, false, true)) {
        mayWait = false;
        break;
      }
    }
    this.checkingInline = false;
    if (options.length) {
      if (mayWait && !options.includes(action.fallback ?? 0)) options.push(-1);
      const i = this.choose(key, options);
      if (i >= 0) this.applyChoice(action, i, where, conditional);
    }
  }

  private actions(list: Action[] | undefined, where: string, conditional = false, scope: string | null = this.beatId) {
    let at = this.time;
    for (const action of list ?? []) {
      at += action.delay ?? 0;
      const entry = { action, at, where, conditional, scope };
      if (at <= this.time) this.execute(entry);
      else this.scheduled.push(entry);
      if (action.do === 'say') {
        const text = action.text ?? (action.line && this.catalog.dialogue.find(line => line.id === action.line)?.text_de);
        if (text) at += text.length / 42 + holdSeconds(text, action.ms) + 0.4;
      }
    }
  }

  private execute({ action: a, where, conditional }: ScheduledAction) {
    switch (a.do) {
      case 'flag':
        for (const [k, v] of Object.entries(a.set)) {
          if (conditional && !this.flag(k) && v) this.save.optionalFlags.set(k, where);
          this.writeFlag(k, v, conditional);
        }
        break;
      case 'choice': {
        const key = 'choice:' + this.nextOccurrence++;
        if (a.modal === false) this.choice = { action: a, key, where, at: this.time + (a.seconds ?? 0), conditional };
        else this.applyChoice(a, this.choose(key, a.options.map((_, i) => i)), where, conditional);
        break;
      }
      case 'say': if (a.until) this.laterReads.set(a.until, where); break;
      case 'skill': this.save.skills[a.id] = Math.max(this.save.skills[a.id] ?? 0, a.tier); break;
      case 'anchor':
        for (const [key, value] of Object.entries({
          allowed: a.to === null ? null : true, target: a.to, x: a.to === null ? null : a.x ?? this.save.x,
          z: a.to === null ? null : a.z ?? this.save.z, r: a.to === null ? null : a.r ?? 30,
        })) this.writeFlag('shift.' + key, value, false);
        break;
      case 'shift': this.moveToEra(a.to); break;
      case 'teleport': this.save.x = a.x; this.save.z = a.z; break;
      case 'xp': this.emit('xp:grant', { amount: a.amount, reason: a.reason }); break;
      case 'unlock': if (!this.unlocks.has(a.chapter)) this.unlocks.set(a.chapter, structuredClone(this.save)); break;
      case 'readings':
        for (const cs of this.catalog.cases) {
          if (a.cases && !a.cases.includes(cs.id)) continue;
          for (const e of cs.entries) if (e.kind === 'reading' && e.flag) this.save.flags[e.flag] ??= 'offen';
        }
        break;
      case 'meter': if (a.active) this.meters.add(a.id); else this.meters.delete(a.id); break;
      case 'give':
        if (a.noun) this.save.nouns.add(a.noun);
        if (a.item) this.save.storyItems.add(a.item);
        if (a.clue) this.discover(a.clue, false, true);
        break;
      case 'grant': this.discover(a.clue, true, true); break;
      case 'cue':
        this.emit('story:cue', { id: a.id, data: a.data });
        if (a.id === 'festsaal:objects') this.festsaalRoom = typeof a.data?.room === 'string' ? a.data.room : 'B01.2.og-festsaal';
        if (a.id === 'festsaal:clear') this.festsaalRoom = undefined;
        if (a.id === 'party:credits' && this.ending && !this.save.flags['story.credits']) {
          this.writeFlag('story.credits', true, false);
          this.emit('story:credits', {});
        }
        if (a.id === 'court:on') this.save.courtSets.add(typeof a.data?.set === 'string' ? a.data.set : '*');
        if (a.id === 'court:off') {
          if (typeof a.data?.set === 'string' && a.data.set !== '*') this.save.courtSets.delete(a.data.set);
          else this.save.courtSets.clear();
        }
        break;
      case 'ending': {
        const option = endingOptions[this.choose('ending:' + this.nextOccurrence++, endingOptions.map((_, i) => i))];
        this.ending = option.id;
        this.writeFlag('flag.end', option.flag, false);
        this.emit('story:ending', { id: option.id });
        break;
      }
      case 'item': this.emit('item:grant', { item: a.item, count: a.count ?? 1 }); break;
      case 'loot':
        if (a.clear) this.emit('loot:clear', { id: a.id, quest: a.group });
        else this.emit('loot:place', { id: a.id, item: a.item, quest: a.group, count: a.count, era: a.era, x: a.x ?? this.save.x, z: a.z ?? this.save.z });
        break;
      case 'npc': this.npcAction(a); break;
      case 'threat':
        if (a.kind === 'pack') this.huntMode = a.active ? a.mode : undefined;
        break;
      case 'enemy':
        if (a.op === 'spawn' && a.kind) this.emit('enemy:spawn', { ...a, x: a.x ?? this.save.x, z: a.z ?? this.save.z, era: a.era ?? this.era });
        if (a.op === 'despawn') this.emit('enemy:despawn', { group: a.group });
        break;
      case 'quest':
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

  private npcAction(a: Extract<Action, { do: 'npc' }>) {
    if (a.op === 'spawn') {
      this.save.npcs.set(a.npc, { chapter: a.chapter ?? this.input.story.chapter, era: a.era ?? this.era, watch: a.watch });
    } else if (a.op === 'despawn') {
      if ('npc' in a) {
        if (a.npc === '*') this.save.npcs.clear();
        else this.save.npcs.delete(a.npc);
      } else {
        const group = this.walkGroups.get(a.group);
        if (group) for (const npc of [group.leader, ...group.members]) this.walks.delete(npc);
        this.walkGroups.delete(a.group);
      }
    } else if (a.op === 'group') {
      this.walkGroups.set(a.group, { leader: a.leader, members: a.members });
    } else if (a.op === 'walk') {
      const route = a.route && this.catalog.world.routes.get(a.route);
      if (route) {
        const at = a.to ?? route.stops.at(-1)?.id ?? 'end';
        if (at === 'end' || route.stops.some(stop => stop.id === at)) this.walks.set(a.npc, { at, route: route.id });
      } else if (!a.route && (a.path?.length ?? 0) >= 2) this.walks.set(a.npc, { at: 'end', route: '' });
    } else if (a.op === 'warp') {
      const leader = this.walkGroups.get(a.group)?.leader;
      if (!leader) return;
      const walk = this.walks.get(leader);
      const route = this.catalog.world.routes.get(a.route ?? walk?.route ?? '');
      if (!route?.stops.some(stop => stop.id === a.to)) return;
      if (walk && walk.route === route.id && route.stops.findIndex(s => s.id === a.to) >= route.stops.findIndex(s => s.id === walk.at)) {
        this.walks.delete(leader);
      }
      this.emit('npc:arrived', { npc: leader, route: route.id, at: a.to, skipped: true });
    }
  }

  private availableNpc(npc: string) {
    const placed = this.save.npcs.get(npc);
    if (this.save.flags['npc.hush'] === npc || !placed || !this.eras.has(placed.era)) return;
    return placed;
  }

  private *talks() {
    for (const [npc] of this.save.npcs) {
      const placed = this.availableNpc(npc);
      if (!placed) continue;
      const context = { era: placed.era, flags: this.save.flags, chapter: this.input.story.chapter, beat: this.beatId, clues: [...this.save.clues] };
      const lines = talkLines(this.catalog.dialogue, npc, placed.chapter);
      const topics = availableTopics(lines, npc, placed.chapter, context);
      for (const topic of [GREET, ...topics.filter(t => t !== GREET), BYE]) {
        yield { npc, chapter: placed.chapter, topic };
      }
    }
  }

  private talk(payload: { npc: string; chapter: string; topic: string }) {
    this.writeFlag(talkedFlag(payload.chapter, payload.npc), true, false);
    if (payload.topic !== GREET) this.writeFlag(talkedFlag(payload.chapter, payload.npc, payload.topic), true, false);
    this.emit('npc:talk', payload);
  }

  private enemyPayload(g: EnemyGroupState) {
    const { group, kind, era, x, z, boss, quest, objective } = g;
    return { id: group + '#' + (g.killed + 1), group, kind, era, x, z, boss: !!boss, quest, objective, by: 'light' };
  }

  private kill(g: EnemyGroupState) {
    const payload = this.enemyPayload(g);
    g.killed++;
    this.emit('enemy:killed', payload);
    this.addXp(enemyDef(g.kind)?.xp ?? 0);
    if (!remaining(g)) this.emit('enemy:cleared', { group: g.group, kind: g.kind });
  }

  /** A placed pickup stays available until taken. Direct grants already fired when emitted. */
  private collect(q: QuestDefIn, o: QuestObjective, item: string) {
    const before = this.book.count(q.id, o.id);
    for (const [id, p] of this.save.pickups) {
      if (p.item !== item || !this.eras.has(p.era) || this.book.objectiveDone(q, o)) continue;
      this.take(id, p);
    }
    // Free-roaming enemies and positive-chance loot remain an exploration approximation.
    if (this.book.count(q.id, o.id) === before && (o.type === 'use' ? !this.save.inventory.get(item) : !this.book.objectiveDone(q, o)) &&
        ((o.drop && o.drop.chance > 0) || droppedItems.has(item))) {
      this.pickup(item, need(o), { id: q.id + '.' + o.id + '.drop', reason: 'pickup' });
    }
  }

  private tryObjective(q: QuestDefIn, o: QuestObjective) {
    this.attempted.set(o, q);
    const item = o.item;
    switch (o.type) {
      case 'manual': return;
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
        if (!o.event) return;
        if (orderedEvents.has(o.event)) {
          this.produceEvents({ event: o.event, match: o.match, times: this.eventCount({ event: o.event, match: o.match }, false) + need(o) - this.book.count(q.id, o.id) });
          return;
        }
        if (!this.eventPossible({ event: o.event, match: o.match }, false)) return;
        break;
      case 'use': {
        if (!item || this.catalog.items.get(item)?.kind !== 'consumable') return;
        const held = this.save.inventory.get(item) ?? 0;
        if (!held) {
          this.collect(q, o, item);
          return;
        }
        const used = Math.min(held, need(o) - this.book.count(q.id, o.id));
        this.save.inventory.set(item, held - used);
        for (let i = 0; i < used; i++) this.emit('item:use', { item });
        return;
      }
      case 'collect': if (item) this.collect(q, o, item); return;
      case 'examine': case 'echo': if (!o.clue || !this.save.clues.has(o.clue)) return; break;
      case 'talk': {
        const talk = [...this.talks()].find(p => p.npc === o.npc && (!o.topic || p.topic === o.topic));
        if (!talk) return;
        while (this.book.openObjectives(q).includes(o)) this.talk(talk);
        return;
      }
      case 'escort': if (!o.npc || !this.availableNpc(o.npc)) return; break;
      case 'kill':
        if (this.save.flags['combat.disabled'] === true) return;
        for (const g of Object.values(this.save.groups)) {
          if (!this.eras.has(g.era) || !killMatches(q, o, this.enemyPayload(g))) continue;
          while (this.save.groups[g.group] === g && remaining(g) && this.book.openObjectives(q).includes(o)) this.kill(g);
        }
        return;
      case 'reach': case 'survive':
        if (o.where?.era && !this.eras.has(o.where.era)) return;
        break;
    }
    this.book.progress(q.id, o.id, need(o));
  }

  private runtimeActivities() {
    if (this.ending && this.input.story.chapter === 'enden' && !this.save.flags['story.party']) {
      this.writeFlag('story.party', this.ending, false);
      this.changed = true;
    }
    if (!this.save.flags['court.admitted'] && inspectOutcome({ coat: this.flag('disguise.coat'), letter: this.flag('disguise.letter') }) === 'ring') {
      for (const [npc, placed] of this.save.npcs) {
        const w = placed.watch;
        if (!w?.inspector || !this.eras.has(placed.era) || (w.set && !this.save.courtSets.has(w.set) && !this.save.courtSets.has('*'))) continue;
        this.writeFlag('court.admitted', true, false);
        this.emit('story:cue', { id: 'scenery:gate', data: { open: true } });
        this.emit('court:admitted', { watcher: npc });
        break;
      }
    }
    if (this.festsaalRoom && !this.save.flags['festsaal.took'] &&
        this.catalog.world.rooms.some(r => r.id === this.festsaalRoom || r.roomId === this.festsaalRoom) &&
        [...this.eras].some(era => ERA_INFO[era].palace === 'intact')) {
      const options = ['tuergriff', 'dukat', 'uhr', 'nichts'];
      const i = this.choose('festsaal:' + this.beatId, options.map((_, i) => i));
      this.writeFlag('festsaal.took', options[i], false);
      this.changed = true;
    }
  }

  private activities(beat: Beat) {
    const { story } = this.input;
    this.runtimeActivities();
    for (const payload of this.talks()) {
      const { npc, chapter, topic } = payload;
      if (topic !== BYE && !this.save.flags[talkedFlag(chapter, npc, topic === GREET ? undefined : topic)]) this.talk(payload);
    }
    for (const c of this.catalog.clues.values()) {
      if (c.chapter && !this.save.chapters.has(c.chapter) && !story.test) continue;
      if (!skillMet(c.requires?.skill, this.save.skills)) continue;
      if (![c.where.era].flat().some(era => this.eras.has(era))) continue;
      if (c.requires?.clues?.some(id => !this.save.clues.has(id)) || c.requires?.flags?.some(f => !this.flag(f))) continue;
      this.discover(c.id, true);
    }
    for (const q of this.book.defs.values()) {
      if (q.kind === 'side' && q.chapter === story.chapter && this.book.state(q.id) === 'hidden') {
        const a = q.available;
        const flag = !a?.flag || this.flag(a.flag);
        if (a?.flag) this.findings.observe({ level: 'warning', file: this.catalog.questFiles.get(q.id)!, id: q.id,
          message: `available.flag '${a.flag}' has no reachable truthy writer` }, flag);
        if (flag && (!a?.era || this.eras.has(a.era)) && (a?.level ?? 1) <= Number(this.save.flags['rpg.level'] ?? 1) &&
            (a?.after ?? []).every(id => this.book.state(id) === 'done')) this.book.offer(q.id);
      }
      if (this.book.state(q.id) === 'offered' && 'npc' in q.giver && this.availableNpc(q.giver.npc)) {
        const waitsForOffer = [...leaves(beat.complete)].some(({ leaf, negated }) => !negated &&
          (('quest' in leaf && leaf.quest.id === q.id && leaf.quest.state === 'offered') ||
           ('flag' in leaf && leaf.flag === 'quest.' + q.id && leaf.eq === 'offered')));
        if (!waitsForOffer || !this.possible(beat.complete)) this.book.accept(q.id);
      }
      for (const o of this.book.openObjectives(q)) {
        if (this.book.openObjectives(q).includes(o)) this.tryObjective(q, o);
      }
    }
    for (const [id, p] of this.save.pickups) {
      const deed = itemDeed(p.item, this.catalog.items.get(p.item));
      const value = deed && this.save.flags[deed.flag];
      if (deed && (value === undefined || value === '' || value === 'nichts') && this.eras.has(p.era)) this.take(id, p);
    }
  }

  private turnins(beat: Beat) {
    // A ready quest can remain in the book. Explore withholding turn-in where a gate can read
    // that state, and always apply its state and payout as a single QuestBook transition.
    for (const q of this.book.defs.values()) {
      if (this.book.state(q.id) !== 'ready') continue;
      const t = turninOf(q);
      if (t === 'auto' || !('npc' in t) || !this.availableNpc(t.npc)) continue;
      const readsReady = this.input.story.beats.filter(b => !this.visited.has(b.id) || b === beat).some(b =>
        [...leaves(b.complete)].some(({ leaf, negated }) =>
          ('quest' in leaf && leaf.quest.id === q.id && !leaf.quest.objective &&
            (negated ? (leaf.quest.state ?? 'done') === 'done' : ['ready', 'active'].includes(leaf.quest.state ?? ''))) ||
          ('flag' in leaf && leaf.flag === 'quest.' + q.id && (negated ? leaf.eq === 'done' : leaf.eq === 'ready'))));
      if (!readsReady || this.choose(`turnin:${this.beatId}:${q.id}`, [1, 0])) this.book.complete(q.id);
    }
  }

  /** Timers are lower bounds. A timer alone can also force an upper bound on time in the beat. */
  private nextTime(beat: Beat, reactions: Reaction[]) {
    const times = this.scheduled.map(a => a.at);
    const choice = this.choice;
    if (choice && (choice.action.seconds ?? 0) > 0) times.push(choice.at);
    for (const r of reactions) if (this.repeatReady.has(r)) times.push(this.repeatReady.get(r)!);
    function addTimers(c: Condition, start?: number) {
      for (const { leaf } of leaves(c)) {
        if ('timer' in leaf && start !== undefined) times.push(start + leaf.timer);
        if ('chapterTimer' in leaf) times.push(leaf.chapterTimer);
      }
    }
    addTimers(beat.complete, this.beatTime);
    for (const r of reactions) addTimers(r.when, this.input.story.on?.includes(r) ? 0 : this.beatTime);
    for (const option of choice?.action.options ?? []) if (option.when) addTimers(option.when);
    return Math.min(...times.filter(t => t > this.time));
  }

  /** Movement predicates can require the player to use a reachable era before an action runs. */
  private enterRequiredEra(c: Condition) {
    for (const era of this.eras) {
      if (era === this.era) continue;
      if (requiresLeaf(c, leaf => ('era' in leaf && leaf.era === era) || ('enter' in leaf && leaf.enter.era === era))) {
        this.moveToEra(era);
        return;
      }
    }
  }

  private moveToEra(to: Era) {
    const from = this.era;
    this.save.era = to;
    if (from !== to) this.emit('era:change', { from, to });
  }

  private runScheduled() {
    this.scheduled.sort((a, b) => a.at - b.at);
    while (this.scheduled[0]?.at <= this.time) this.execute(this.scheduled.shift()!);
  }

  private settleBeat(beat: Beat, where: string): boolean {
    const { file, story } = this.input;
    const reactions = [...story.on ?? [], ...beat.on ?? []];
    const repeatCounts = new Map<Reaction, number>();
    const rearm = new Set<Reaction>();
    for (;;) {
      this.runScheduled();
      let canLeave = false;
      do {
        this.changed = false;
        this.inlineChoice();
        for (const r of reactions) {
          const chapter = !!story.on?.includes(r);
          const at = (chapter ? story.chapter : where) + '/' + r.id;
          const events = [...leaves(r.when)].some(({ leaf }) => 'event' in leaf);
          this.eventFloor = this.repeatStart.get(r) ?? 0;
          const cooled = this.time >= (this.repeatReady.get(r) ?? 0);
          if (!this.fired.has(r) && cooled && (!this.repeatStart.has(r) || rearm.has(r))) this.produceEvents(r.when, chapter);
          this.audit(r.when, at, chapter);
          this.concreteFlags = !!r.repeat;
          const enabled = !this.fired.has(r) && this.possible(r.when, chapter);
          this.concreteFlags = false;
          this.eventFloor = 0;
          if (!enabled) continue;
          const start = this.history.length;
          if (!cooled) {
            // A fresh edge during cooldown clears this reaction's latches without executing actions.
            this.repeatStart.set(r, start);
            continue;
          }
          this.fired.add(r);
          this.enterRequiredEra(r.when);
          this.actions(r.do, at, true, chapter ? null : beat.id);
          this.changed = true;
          if (!r.repeat) continue;

          const count = (repeatCounts.get(r) ?? 0) + 1;
          repeatCounts.set(r, count);
          const progress = this.history.slice(start).some(e =>
            e.name === 'quest:progress' && Number(e.payload.count) < Number(e.payload.need));
          if (count >= 64) {
            this.findings.observe({ level: 'warning', file, id: at, message: 'check repeat timing in play after 64 firings' }, false);
          } else if (events) {
            // A repeatable reaction clears its own event latches. Only a fresh emission can rearm it.
            this.repeatStart.set(r, start);
            this.repeatReady.set(r, this.time + (r.cooldown ?? 0));
            if (progress) rearm.add(r);
            else rearm.delete(r);
            this.fired.delete(r);
          } else if (progress && this.possible(r.when, chapter, true)) {
            this.fired.delete(r);
          }
        }
        for (const [c, at] of this.laterReads) this.audit(c, at);
        this.produceEvents(beat.complete);
        this.audit(beat.complete, where);
        canLeave = this.possible(beat.complete);
        this.activities(beat);
        if (!this.changed) this.turnins(beat);
      } while (this.changed);
      if (canLeave) return true;
      const next = this.nextTime(beat, reactions);
      if (!Number.isFinite(next)) return false;
      this.time = next;
    }
  }

  /** Passing a gate constrains what the player must already have accepted, found or turned in. */
  private afterGate(condition: Condition, where: string) {
    const { file, story } = this.input;
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
    this.book.dropEarlier(story.chapter);
    this.emit('story:chapter', { id: story.chapter });
    let beat: Beat | undefined = story.beats.find(b => b.id === story.start);
    let resume = false;
    while (beat && !this.visited.has(beat.id)) {
      const where = story.chapter + '/' + beat.id;
      this.visited.add(beat.id);
      this.beatId = beat.id;
      this.beatStart = this.history.length;
      this.beatTime = this.time;
      const stale = this.scheduled.filter(a => a.scope !== null && a.scope !== beat!.id);
      this.scheduled.splice(0, this.scheduled.length, ...this.scheduled.filter(a => !stale.includes(a)));
      for (const action of stale.sort((a, b) => a.at - b.at)) if (!presentation.has(action.action.do)) this.execute(action);
      this.emit('story:beat', { chapter: story.chapter, beat: beat.id });
      this.laterReads.clear();
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
      this.enterRequiredEra(beat.complete);
      this.afterGate(beat.complete, where);
      const next = beat.next ?? story.beats[story.beats.indexOf(beat) + 1]?.id;
      this.actions(beat.exit, where, false, next ?? null);
      beat = story.beats.find(b => b.id === next);
    }
    if (beat) {
      this.findings.observe({ level: 'warning', file, id: story.chapter + '/' + beat.id,
        message: 'next transitions form a cycle; chapter completion may be unreachable' }, false);
      return false;
    }
    this.actions(story.leave, story.chapter + '/leave', false, null);
    return true;
  }

  checkObjectives() {
    for (const q of this.catalog.quests.values()) {
      if (q.chapter !== this.input.story.chapter) continue;
      if (q.kind === 'main') {
        const level = this.input.story.test ? 'warning' : 'error';
        const file = this.catalog.questFiles.get(q.id)!;
        const offered = this.save.offered.has(q.id);
        this.findings.observe({ level, file, id: q.id, message: 'main quest has no reachable offer or start' }, offered);
        if (offered || this.save.completed.has(q.id)) this.findings.observe({
          level, file, id: q.id, message: 'main quest has no reachable completion or turn-in',
        }, this.save.completed.has(q.id));
      }

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
