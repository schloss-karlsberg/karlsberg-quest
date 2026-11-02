/**
 * Chronik feature: clues in the world, echoes, the deduction board, codex and hints.
 *
 * Talks to other features only through events (src/systems/contracts.ts + ./types.ts) and
 * ctx.state (inventory, chronik, codex, flags; own slice `systems.chronik`).
 * Debug/test API: window.kq.chronik (see ChronikHooks below).
 */
import '../contracts';
import './strings';
import type { GameContext } from '../../core/context';
import type { CaseProgress } from '../../core/state';
import type { ChronikCase, Hint } from '../../content/types';
import { defineSystem } from '../../core/systems';
import { svg } from '../../ui/dom';
import { clueChime, nearTwinkle, paper, stampThud, wrongKnock } from './audio';
import { EchoDirector, type TranscriptLine } from './echo';
import {
  type BatchResult,
  type ChronikContent,
  type ClueStatus,
  type Discovery,
  applyBatch,
  askHint,
  buildContent,
  caseComplete,
  caseHints,
  caseVisible,
  clueDistance,
  clueEras,
  clueStatus,
  discover,
  dueHint,
  emptyProgress,
  entryComplete,
  evaluateBatch,
  hasRealContent,
  lineMs,
  loseUnconfirmed,
  nounFits,
  setBlank,
} from './logic';
import { type ChronikBlank, type ChronikClue, type ChronikSlice, createSlice } from './types';
import { type BoardApi, ChronikBoard } from './ui/board';
import { openClueCard } from './ui/card';
import { chronikUniforms } from './world/gfx';
import { ClueMarkers } from './world/markers';

/** Seconds E must be held to start listening to an echo. */
export const HOLD_SECONDS = 0.9;
const MARKER_RANGE = 95;

export interface ChronikHooks {
  open(caseId?: string): void;
  close(): void;
  tab(tab: 'board' | 'codex'): void;
  /** Find every clue (no cards): all nouns, codex cards from clues, flags. */
  grantAll(): void;
  fill(caseId: string, entryId: string, blankId: string, nounId: string | null): boolean;
  /** Run the batch check (as the "Prüfen" button). `force` ignores the present-day rule. */
  check(caseId: string, force?: boolean): BatchResult | null;
  /** Fill the correct nouns into the first `n` open fact entries (tests). */
  solve(caseId: string, n?: number): string[];
  examine(clueId: string): boolean;
  listen(clueId: string): boolean;
  skipEcho(): void;
  /** Advance the running echo by `seconds` (deterministic tests; frames may be slow headless). */
  advanceEcho(seconds: number): void;
  echo(): { id: string | null; t: number; total: number; line: number };
  status(clueId: string): ClueStatus | null;
  target(): string | null;
  markers(): { id: string; status: ClueStatus | null; vis: number }[];
  caught(): void;
  stuck(caseId: string, seconds: number): void;
  slice(): ChronikSlice;
  content(): { clues: string[]; cases: string[]; facts: string[]; nouns: string[] };
  isOpen(): boolean;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    chronik?: ChronikHooks;
  }
}

// ---------------------------------------------------------------------------------------------

let ctxRef: GameContext | null = null;
let content: ChronikContent;
let markers: ClueMarkers | null = null;
let director: EchoDirector | null = null;
let board: ChronikBoard | null = null;
let hud: HTMLElement | null = null;
let holdRing: SVGSVGElement | null = null;
let lanternLit = false;
let refreshIn = 0;
/** A measuring clue waiting for its card (game seconds, so the tape shows first). */
let measured: { clue: ChronikClue; t: number } | null = null;
let target: { clue: ChronikClue; status: ClueStatus } | null = null;
let promptKey = '';
let holding: { t: number; clue: ChronikClue | null; tap: ChronikClue | null } | null = null;
let nearId: string | null = null;
const notes = new Map<string, string>();
const offs: (() => void)[] = [];

const slice = (ctx: GameContext): ChronikSlice => {
  const s = ctx.state.slice('chronik', createSlice);
  // older/partial slices (merge on load keeps unknown shapes): fill missing fields
  const d = createSlice();
  for (const k of Object.keys(d) as (keyof ChronikSlice)[]) if (s[k] === undefined) (s as unknown as Record<string, unknown>)[k] = d[k];
  return s;
};

function progress(ctx: GameContext, caseId: string): CaseProgress {
  const ch = ctx.state.mutable.chronik;
  if (!ch[caseId]) ch[caseId] = emptyProgress();
  const p = ch[caseId];
  p.filled ??= {};
  p.readings ??= {};
  p.confirmed ??= [];
  return p;
}

/** Story chapter ids → the `Clue.chapter` ids of the packs ('prolog' → 'p'). */
/**
 * While the story plays the prologue, only the prologue's clues are in the world: the later
 * chapters' notes at the field station (Marlene's letters, Laub's tins …) would otherwise show
 * their markers and take E before the story has introduced the Chronik. null = no gating (any
 * other chapter, sandbox, `?notitle` tests): every clue is in the world as before.
 */
function reachedChapters(ctx: GameContext): Set<string> | null {
  const story = (ctx.state.state.systems as Record<string, unknown>).story as { active?: boolean; chapter?: string | null } | undefined;
  return story?.active && story.chapter === 'prolog' ? new Set(['p', 'prolog']) : null;
}

function env(ctx: GameContext) {
  const s = ctx.state.state;
  return {
    found: new Set(s.inventory.clues),
    flags: s.flags,
    skills: s.skills,
    scanMode: ctx.world.scanMode,
    lanternLit: lanternLit || ctx.player.stats.lanternLit,
    chapters: reachedChapters(ctx),
  };
}

function statusOf(ctx: GameContext, c: ChronikClue): ClueStatus {
  return clueStatus(c, env(ctx));
}

function visibleCases(ctx: GameContext): ChronikCase[] {
  const s = ctx.state.state;
  // the prologue: a later chapter's page ('case.k4' shares nouns like n.eiskeller) stays closed
  const ch = reachedChapters(ctx);
  const later = (cs: ChronikCase) => {
    const m = /^case\.(.+)$/.exec(cs.id);
    return !!ch && !!m && !ch.has(m[1]!) && !s.chronik[cs.id];
  };
  return [...content.cases.values()].filter((cs) => !later(cs) && caseVisible(cs, s.chronik, s.inventory.nouns));
}

function speakerName(ctx: GameContext, id: string, fallback: string): string {
  return ctx.content.speakers.get(id)?.name_de ?? fallback;
}

/** A line from the compass voice: via the dialogue system if one exists, else as a subtitle. */
function sayLaub(ctx: GameContext, text: string, id?: string): void {
  ctx.events.emit('dialogue:say', { speaker: 'laub', text, id, ms: lineMs(text) });
  const hasRunner = ctx.systems.ids().some((s) => s === 'story' || s === 'dialogue');
  if (!hasRunner) ctx.ui.hud.subtitle(speakerName(ctx, 'laub', 'Quirin Laub'), text, lineMs(text), true);
}

// ---------------------------------------------------------------------------------------------
// discovery

function announcePages(ctx: GameContext): void {
  const sl = slice(ctx);
  for (const cs of visibleCases(ctx)) {
    if (sl.seen.includes(cs.id)) continue;
    sl.seen.push(cs.id);
    ctx.ui.toast(ctx.t('chronik.newPage', { title: cs.title_de }), 3600);
  }
}

function doDiscover(ctx: GameContext, clue: ChronikClue, quiet = false): Discovery | null {
  let d: Discovery | null = null;
  ctx.state.update((s) => {
    d = discover(clue, s, slice(ctx));
  }, 'clue');
  if (!d) return null;
  const found = d as Discovery;
  ctx.events.emit('clue:found', { id: clue.id, kind: clue.kind });
  for (const n of found.newNouns) ctx.events.emit('noun:learned', { id: n });
  for (const f of found.newFacts) ctx.events.emit('codex:unlocked', { factId: f });
  if (!quiet) clueChime(ctx.audio);
  announcePages(ctx);
  refreshIn = 0;
  ctx.save.autosave('clue');
  board?.render();
  return found;
}

function showCard(ctx: GameContext, clue: ChronikClue, d: Discovery | null, transcript?: TranscriptLine[]): void {
  openClueCard(
    {
      t: ctx.t,
      open: (o) => ctx.ui.modals.open(o),
      content,
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      reducedMotion: ctx.settings.state.reducedMotion,
      onChronik: () => queueMicrotask(() => openBoard(ctx)),
    },
    clue,
    d,
    transcript,
  );
}

function examine(ctx: GameContext, clue: ChronikClue): boolean {
  const st = statusOf(ctx, clue);
  if (st === 'needs-lantern') {
    ctx.ui.toast(ctx.t('chronik.prompt.dark'));
    return false;
  }
  if (st !== 'available') return false;
  if (clue.kind === 'echo') return startEcho(ctx, clue);
  const d = doDiscover(ctx, clue);
  showCard(ctx, clue, d);
  return true;
}

/**
 * A measuring clue (requires the Messen tool, `skill: 'kartograf:3'`) is found by measuring at its
 * place: a `measure:done` on its anchor room / building, or with the tape's middle inside its radius.
 */
function onMeasured(ctx: GameContext, m: { a: { x: number; z: number }; b: { x: number; z: number }; building?: string; room?: string }): void {
  const era = ctx.era.current;
  const mx = (m.a.x + m.b.x) / 2;
  const mz = (m.a.z + m.b.z) / 2;
  for (const c of content.clues.values()) {
    const req = c.requires?.skill;
    if (!req || !/^kartograf:3$/.test(req)) continue;
    const w = c.where;
    const eras = Array.isArray(w.era) ? w.era : [w.era];
    if (!eras.includes(era)) continue;
    const anchor = w.anchor ?? '';
    const anchorBuilding = anchor ? `KB-${anchor.split('/').pop()!.split('.')[0]}` : '';
    const onSpot =
      (!!m.room && (anchor === m.room || anchor.endsWith(`/${m.room}`))) ||
      (!!m.building && anchorBuilding === m.building) ||
      Math.hypot(mx - w.x, mz - w.z) <= (w.radius ?? 20);
    if (!onSpot || statusOf(ctx, c) !== 'available') continue;
    // let the field-book sheet with the figure show for a moment (game time), then the card
    measured = { clue: c, t: 1.2 };
    return;
  }
}

function startEcho(ctx: GameContext, clue: ChronikClue): boolean {
  if (!director || director.active) return false;
  ctx.ui.hud.prompt(null, undefined, 'chronik');
  promptKey = '';
  director.start(clue);
  return true;
}

function echoDone(ctx: GameContext, clue: ChronikClue, transcript: TranscriptLine[]): void {
  const sl = slice(ctx);
  if (!sl.echoes.includes(clue.id)) sl.echoes.push(clue.id);
  const d = doDiscover(ctx, clue);
  showCard(ctx, clue, d, transcript);
}

// ---------------------------------------------------------------------------------------------
// board API

function fill(ctx: GameContext, caseId: string, entryId: string, blankId: string, nounId: string | null): boolean {
  const cs = content.cases.get(caseId);
  const e = cs?.entries.find((x) => x.id === entryId);
  const b = e?.blanks.find((x) => x.id === blankId) as ChronikBlank | undefined;
  if (!cs || !e || !b) return false;
  if (nounId !== null) {
    const n = content.nouns.get(nounId);
    if (!n || !ctx.state.state.inventory.nouns.includes(nounId) || !nounFits(b, n)) return false;
  }
  let changed = false;
  ctx.state.update((s) => {
    const p = progress(ctx, caseId);
    changed = setBlank(p, e, blankId, nounId);
    if (!changed) return;
    // gentle marks belong to the last check
    const sl = slice(ctx);
    if (sl.marks[caseId]) sl.marks[caseId] = sl.marks[caseId].filter((id) => id !== entryId);
    if (e.kind === 'reading') {
      const key = `reading.${caseId}.${entryId}`;
      const vals = p.readings[entryId] ?? {};
      if (entryComplete(p, e)) s.flags[key] = e.blanks.map((x) => vals[x.id]).join('+');
      else delete s.flags[key];
    }
  }, 'chronik');
  if (changed) {
    ctx.events.emit('chronik:fill', { caseId, entryId, blankId, nounId });
    ctx.save.autosave('chronik');
  }
  return changed;
}

function canConfirm(ctx: GameContext): boolean {
  return ctx.era.current === 'today' || !!ctx.state.state.flags['chronik.confirmAnywhere'];
}

function check(ctx: GameContext, caseId: string, force = false): (BatchResult & { blocked?: boolean }) | null {
  const cs = content.cases.get(caseId);
  if (!cs) return null;
  const p = progress(ctx, caseId);
  const r = evaluateBatch(cs, p);
  if (!force && !canConfirm(ctx)) return { ...r, correct: false, confirmed: [], blocked: true };
  if (!r.ready) return r;
  const sl = slice(ctx);
  const gentle = ctx.settings.state.gentleMode;
  if (r.correct) {
    let facts: string[] = [];
    ctx.state.update((s) => {
      facts = applyBatch(cs, p, r).filter((f) => !s.codex.facts.includes(f));
      for (const f of facts) s.codex.facts.push(f);
      sl.since = { clues: [], nouns: [], facts: [] };
      (sl.hints[caseId] ??= { stuck: 0, given: [] }).stuck = 0;
      delete sl.marks[caseId];
    }, 'chronik');
    board?.stamp(r.confirmed, facts);
    board?.setMessage(ctx.t('chronik.check.ok', { n: r.confirmed.length }), true);
    r.confirmed.forEach((_, i) => stampThud(ctx.audio, 0.18 + i * 0.32));
    ctx.events.emit('chronik:batch', { caseId, correct: true, confirmed: [...r.confirmed] });
    for (const f of facts) {
      ctx.events.emit('codex:unlocked', { factId: f });
      const title = content.facts.get(f)?.title_de;
      if (title) setTimeout(() => ctx.ui.toast(ctx.t('chronik.codex.toast', { title })), 900);
    }
    if (caseComplete(cs, p)) {
      ctx.events.emit('chronik:case-complete', { caseId });
      ctx.ui.toast(ctx.t('chronik.complete.toast', { title: cs.title_de }), 4200);
    }
    ctx.save.autosave('chronik:batch', true);
  } else {
    ctx.state.update(() => {
      if (gentle) sl.marks[caseId] = [...r.rightOnes];
    }, 'chronik');
    board?.setMessage(ctx.t(gentle ? 'chronik.check.wrongGentle' : 'chronik.check.wrong'));
    wrongKnock(ctx.audio);
    ctx.events.emit('chronik:batch', { caseId, correct: false, confirmed: [] });
  }
  board?.render();
  return r;
}

function hintsFor(ctx: GameContext, caseId: string): Hint[] {
  return caseHints(content.hints.values(), caseId, ctx.state.state.chronik[caseId]);
}

function askLaub(ctx: GameContext, caseId: string): string {
  const cs = content.cases.get(caseId);
  const sl = slice(ctx);
  const hs = (sl.hints[caseId] ??= { stuck: 0, given: [] });
  let text: string;
  let id: string | undefined;
  if (cs && caseComplete(cs, ctx.state.state.chronik[caseId])) text = ctx.t('chronik.laub.done');
  else {
    const a = askHint(hintsFor(ctx, caseId), hs.stuck, hs.given, ctx.settings.state.gentleMode);
    if (a) {
      if (a.fresh) hs.given.push(a.hint.id);
      text = a.hint.text_de;
      id = a.hint.id;
    } else text = ctx.t('chronik.laub.notYet');
  }
  notes.set(caseId, text);
  sayLaub(ctx, text, id);
  return text;
}

function laubNote(ctx: GameContext, caseId: string): string | null {
  const n = notes.get(caseId);
  if (n) return n;
  const given = slice(ctx).hints[caseId]?.given ?? [];
  const last = given.length ? content.hints.get(given[given.length - 1]!) : undefined;
  return last?.text_de ?? null;
}

function makeBoard(ctx: GameContext): ChronikBoard {
  const api: BoardApi = {
    t: ctx.t,
    content,
    modals: ctx.ui.modals,
    visibleCases: () => visibleCases(ctx),
    progress: (id) => progress(ctx, id),
    knownNouns: () => ctx.state.state.inventory.nouns,
    foundClues: () => ctx.state.state.inventory.clues,
    codexFacts: () => ctx.state.state.codex.facts,
    fill: (c, e, b, n) => fill(ctx, c, e, b, n),
    check: (c) => check(ctx, c),
    canConfirm: () => canConfirm(ctx),
    askLaub: (c) => askLaub(ctx, c),
    laubNote: (c) => laubNote(ctx, c),
    marks: (c) => slice(ctx).marks[c] ?? [],
    gentle: () => ctx.settings.state.gentleMode,
    reducedMotion: () => ctx.settings.state.reducedMotion,
    heightAt: (x, z) => ctx.world.heightAt(x, z),
    sound: (k, when) => (k === 'paper' ? paper(ctx.audio, when === 0 ? 0.6 : 1) : k === 'stamp' ? stampThud(ctx.audio, when) : wrongKnock(ctx.audio)),
    onOpen: (caseId) => {
      const sl = slice(ctx);
      sl.lastCase = caseId;
      for (const cs of visibleCases(ctx)) if (!sl.seen.includes(cs.id)) sl.seen.push(cs.id);
      ctx.events.emit('chronik:opened', { caseId });
    },
    onClose: () => ctx.events.emit('chronik:closed', {}),
  };
  return new ChronikBoard(api);
}

function openBoard(ctx: GameContext, caseId?: string | null, tab: 'board' | 'codex' = 'board'): void {
  if (!board) return;
  if (!board.isOpen && ctx.ui.modals.count > 0) ctx.ui.modals.closeAll();
  board.open(caseId ?? slice(ctx).lastCase, tab);
}

// ---------------------------------------------------------------------------------------------
// world: markers, target, prompt

/**
 * Round 2: a dialogue clue whose NPC stands in the world (npc feature, flag `npc.owns.<clueId>`)
 * is granted in the conversation ('clue:grant'): no marker, no E here.
 */
function npcOwnsTalk(ctx: GameContext, c: ChronikClue): boolean {
  return c.kind === 'dialogue' && ctx.state.state.flags[`npc.owns.${c.id}`] === true;
}

function refreshMarkers(ctx: GameContext): void {
  if (!markers) return;
  const era = ctx.era.current;
  const p = ctx.player.position;
  const e = env(ctx);
  const list: { clue: ChronikClue; status: ClueStatus }[] = [];
  for (const c of content.clues.values()) {
    if (!clueEras(c).includes(era) || npcOwnsTalk(ctx, c)) continue;
    if (clueDistance(c, p.x, p.z) > MARKER_RANGE + c.where.radius) continue;
    list.push({ clue: c, status: clueStatus(c, e) });
  }
  markers.sync(list);
  // interaction target: the nearest usable clue whose radius contains the player
  // (ctx.content.cluesAt is the shared spatial query; our content view filters placeholder packs)
  target = null;
  let best = Infinity;
  for (const raw of ctx.content.cluesAt(p.x, p.z, era)) {
    const c = content.clues.get(raw.id);
    if (!c || npcOwnsTalk(ctx, c)) continue;
    const st = clueStatus(c, e);
    if (st !== 'available' && st !== 'needs-lantern') continue;
    const d = clueDistance(c, p.x, p.z) / c.where.radius;
    if (d < best) {
      best = d;
      target = { clue: c, status: st };
    }
  }
  const id = target?.clue.id ?? null;
  if (id !== nearId) {
    nearId = id;
    markers.setNear(id);
    if (id) nearTwinkle(ctx.audio);
  }
  // auto echoes start by themselves
  if (target?.clue.kind === 'echo' && target.clue.auto && target.status === 'available' && !director?.active && ctx.ui.modals.count === 0) startEcho(ctx, target.clue);
}

function updatePrompt(ctx: GameContext): void {
  let key = '';
  let text = '';
  if (target && !director?.active && ctx.ui.modals.count === 0) {
    key = 'E';
    if (target.status === 'needs-lantern') text = ctx.t('chronik.prompt.dark');
    else if (target.clue.kind === 'echo') text = ctx.t('chronik.prompt.listen');
    else {
      // an echo close by as well → offer both
      const p = ctx.player.position;
      const echoNear = ctx.content.cluesAt(p.x, p.z, ctx.era.current).some((c) => c.kind === 'echo' && content.clues.has(c.id) && statusOf(ctx, c as ChronikClue) === 'available');
      text = ctx.t(echoNear ? 'chronik.prompt.both' : 'chronik.prompt.examine');
    }
  }
  const k = `${key}|${text}`;
  if (k === promptKey) return;
  if (key) ctx.ui.hud.prompt(key, text, 'chronik');
  else if (promptKey) ctx.ui.hud.prompt(null, undefined, 'chronik');
  promptKey = key ? k : '';
}

function echoTargetNear(ctx: GameContext): ChronikClue | null {
  if (target?.clue.kind === 'echo' && target.status === 'available') return target.clue;
  const p = ctx.player.position;
  for (const raw of ctx.content.cluesAt(p.x, p.z, ctx.era.current)) {
    const c = content.clues.get(raw.id);
    if (c?.kind === 'echo' && statusOf(ctx, c) === 'available') return c;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------

function tickHints(ctx: GameContext, dt: number): void {
  // flag `laub.silent` (the prologue before the compass first speaks): no hints, the clock waits
  if (ctx.state.state.flags['laub.silent'] === true) return;
  const sl = slice(ctx);
  const gentle = ctx.settings.state.gentleMode;
  for (const cs of visibleCases(ctx)) {
    if (!sl.seen.includes(cs.id) || caseComplete(cs, ctx.state.state.chronik[cs.id])) continue;
    const hs = (sl.hints[cs.id] ??= { stuck: 0, given: [] });
    hs.stuck += dt;
    if (director?.active) continue;
    const due = dueHint(hintsFor(ctx, cs.id), hs.stuck, hs.given, gentle);
    if (due) {
      hs.given.push(due.id);
      notes.set(cs.id, due.text_de);
      sayLaub(ctx, due.text_de, due.id);
      board?.render();
    }
  }
}

function onCaught(ctx: GameContext): void {
  // flag chronik.noLoss: the story's lossless meters (bible 4.6: "nothing is lost any more")
  if (ctx.settings.state.gentleMode || ctx.state.state.flags['chronik.noLoss'] === true) {
    ctx.ui.toast(ctx.t('chronik.lost.none'));
    return;
  }
  let lost = { clues: [] as string[], nouns: [] as string[], facts: [] as string[] };
  ctx.state.update((s) => {
    lost = loseUnconfirmed(s, slice(ctx), content);
  }, 'chronik:lost');
  director?.finish(true);
  ctx.events.emit('chronik:lost', { clues: lost.clues, nouns: lost.nouns });
  ctx.ui.toast(lost.clues.length ? ctx.t('chronik.lost.toast', { n: lost.clues.length }) : ctx.t('chronik.lost.none'), 3600);
  refreshIn = 0;
  board?.render();
}

function installHooks(ctx: GameContext): void {
  const kq = window.kq;
  if (!kq || kq.chronik) return;
  const getClue = (id: string) => content.clues.get(id);
  kq.chronik = {
    open: (caseId) => openBoard(ctx, caseId ?? null),
    close: () => board?.close(),
    tab: (tab) => openBoard(ctx, null, tab),
    grantAll: () => {
      for (const c of content.clues.values()) doDiscover(ctx, c, true);
    },
    fill: (c, e, b, n) => {
      const ok = fill(ctx, c, e, b, n);
      board?.render();
      return ok;
    },
    check: (c, force) => check(ctx, c, force),
    solve: (caseId, n = Infinity) => {
      const cs = content.cases.get(caseId);
      const done: string[] = [];
      if (!cs) return done;
      for (const e of cs.entries) {
        if (done.length >= n) break;
        if (e.kind !== 'fact' || progress(ctx, caseId).confirmed.includes(e.id)) continue;
        for (const b of e.blanks) if (b.correct) fill(ctx, caseId, e.id, b.id, b.correct);
        done.push(e.id);
      }
      board?.render();
      return done;
    },
    examine: (id) => {
      const c = getClue(id);
      if (!c) return false;
      if (c.kind === 'echo') return startEcho(ctx, c);
      const d = doDiscover(ctx, c);
      showCard(ctx, c, d);
      return true;
    },
    listen: (id) => {
      const c = getClue(id);
      return !!c && startEcho(ctx, c);
    },
    skipEcho: () => director?.skip(),
    advanceEcho: (seconds) => {
      for (let t = 0; t < seconds && director?.active; t += 1 / 30) director.update(Math.min(1 / 30, seconds - t));
    },
    echo: () => ({ id: director?.clue?.id ?? null, ...(director?.progress ?? { t: 0, total: 0, line: -1 }) }),
    status: (id) => {
      const c = getClue(id);
      return c ? statusOf(ctx, c) : null;
    },
    target: () => target?.clue.id ?? null,
    markers: () => (markers ? markers.ids().map((id) => ({ id, status: markers!.statusOf(id), vis: markers!.visibility(id) })) : []),
    caught: () => ctx.events.emit('player:caught', { by: 'pack' }),
    stuck: (caseId, seconds) => {
      (slice(ctx).hints[caseId] ??= { stuck: 0, given: [] }).stuck = seconds;
      const sl = slice(ctx);
      if (!sl.seen.includes(caseId)) sl.seen.push(caseId);
    },
    slice: () => structuredClone(slice(ctx)),
    content: () => ({ clues: [...content.clues.keys()], cases: [...content.cases.keys()], facts: [...content.facts.keys()], nouns: [...content.nouns.keys()] }),
    isOpen: () => !!board?.isOpen,
  };
}

export default defineSystem({
  id: 'chronik',
  after: ['survey'],
  init(ctx) {
    ctxRef = ctx;
    measured = null;
    const include = !hasRealContent(ctx.content.packs) || ctx.params.has('placeholder');
    content = buildContent(ctx.content.packs, include);
    slice(ctx);
    markers = new ClueMarkers((x, z) => ctx.world.heightAt(x, z));
    ctx.scene.add(markers.group);
    hud = ctx.ui.layer('chronik-hud');
    hud.classList.remove('kq-hidden');
    hud.classList.add('ck-hud');
    hud.style.pointerEvents = 'none';
    holdRing = svg(`<svg class="ck-hold" viewBox="0 0 54 54" aria-hidden="true"><circle class="bg" cx="27" cy="27" r="22"/><circle class="fg" cx="27" cy="27" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2" transform="rotate(-90 27 27)"/></svg>`);
    hud.append(holdRing);
    director = new EchoDirector(ctx, (id) => content.echoLines.get(id) ?? [], hud, (clue, tr) => echoDone(ctx, clue, tr));
    board = makeBoard(ctx);

    const ev = ctx.events;
    offs.push(
      ev.on('lantern:toggle', ({ lit }) => {
        lanternLit = lit;
        refreshIn = 0;
      }),
      ev.on('era:change', () => {
        director?.finish(true);
        markers?.clear();
        refreshIn = 0;
      }),
      ev.on('shift:begin', () => director?.finish(true)),
      ev.on('scan:mode', () => (refreshIn = 0)),
      ev.on('save:loaded', () => {
        markers?.clear();
        notes.clear();
        refreshIn = 0;
      }),
      ev.on('chronik:open', ({ caseId }) => openBoard(ctx, caseId)),
      ev.on('echo:play', ({ id }) => {
        const c = content.clues.get(id);
        if (c) startEcho(ctx, c);
      }),
      // soft (brought home by the driving pack, Ch. 4): nothing is lost (onCaught also honours chronik.noLoss)
      ev.on('player:caught', ({ soft }) => {
        if (!soft) onCaught(ctx);
      }),
      // round 2: measuring clues (clue.k3.messen) are found with the tape
      ev.on('measure:done', (m) => onMeasured(ctx, m)),
      // round 2: npc conversations / story `grant` discover a clue without the card
      ev.on('clue:grant', ({ id, card }) => {
        const c = content.clues.get(id);
        if (!c) return;
        const d = doDiscover(ctx, c, !card);
        // story grant {card: true}: show the field-book card like an examined clue (newly found only)
        if (card && d) showCard(ctx, c, d);
      }),
      ev.on('settings:change', () => board?.render()),
    );
    announcePages(ctx);
  },

  update(dt, ctx) {
    const inp = ctx.input;
    if (measured && (measured.t -= dt) <= 0 && ctx.ui.modals.count === 0) {
      const c = measured.clue;
      measured = null;
      if (statusOf(ctx, c) === 'available') examine(ctx, c);
    }
    if (inp.wasPressed('journal') && !director?.active) {
      openBoard(ctx);
      return;
    }
    // E: tap = examine, hold = listen (when both are near, the tap waits for the release)
    const pressE = inp.wasPressed('listen');
    if ((pressE || (inp.wasPressed('interact') && inp.locked)) && !director?.active) {
      const echo = echoTargetNear(ctx);
      const tap = target && target.clue.kind !== 'echo' ? target.clue : null;
      if (pressE && echo) holding = { t: 0, clue: echo, tap };
      else if (tap) examine(ctx, tap);
    }
    if (holding) {
      if (inp.isDown('listen')) {
        holding.t += dt;
        if (holding.clue && holding.t >= HOLD_SECONDS) {
          startEcho(ctx, holding.clue);
          holding = null;
        }
      } else {
        if (holding.t < HOLD_SECONDS) {
          if (holding.tap) examine(ctx, holding.tap);
          else ctx.ui.toast(ctx.t('chronik.listen.tap'));
        }
        holding = null;
      }
    }
  },

  frame(dt, ctx) {
    installHooks(ctx);
    const cam = ctx.camera;
    chronikUniforms.uPix.value = ctx.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    chronikUniforms.uMotion.value = ctx.settings.state.reducedMotion ? 0.35 : 1;
    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = 0.2;
      refreshMarkers(ctx);
    }
    markers?.frame(dt);
    if (!ctx.pause.paused) director?.update(dt);
    updatePrompt(ctx);
    // hold-to-listen ring
    if (holdRing) {
      const show = !!holding?.clue && holding.t > 0.08;
      holdRing.classList.toggle('show', show);
      const fg = holdRing.querySelector('.fg') as SVGCircleElement | null;
      fg?.setAttribute('stroke-dashoffset', String(138.2 * (1 - Math.min(1, (holding?.t ?? 0) / HOLD_SECONDS))));
    }
    // hint ladder runs while playing and while the board is open (not on the title / in menus)
    const r = ctx.pause.reasons;
    if (!r.has('title') && (!ctx.pause.paused || board?.isOpen)) tickHints(ctx, Math.min(dt, 0.25));
  },

  dispose() {
    for (const off of offs.splice(0)) off();
    director?.dispose();
    markers?.dispose();
    board?.close();
    hud?.remove();
    if (ctxRef && window.kq) delete window.kq.chronik;
    ctxRef = null;
  },
});
