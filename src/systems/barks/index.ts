/**
 * Feature "barks": Laub's and Marlene's short remarks (voices pack, lines `*.bark.*` and
 * `marlene.gen.*`), plus the NPCs' near-barks. Rules in ./rules.ts (bible 08-stimmen).
 *
 * Any event can trigger barks: a bark line's trigger is matched when the event fires (era,
 * flags, payload), the request then waits up to REQUEST_TTL seconds for a quiet moment and the
 * global gap (the guide's call-out has its own shorter cooldown). Synthesised events (emitted here, story conditions may listen too):
 *   'bark:idle'        – 60 s of game time without player input (once until the next input)
 *   'bark:enter-fire'  – a fire threat starts, or the player enters a burning room
 *                        (fire:room 'burning' + room:enter {roomId} from the interiors feature)
 * Quiet: echoes, NPC conversations, story lines on screen, modals, the caught curtain, memorial
 * places (built-in Rondell; story `memorial` action → 'memorial:set'), flag `barks.quiet`.
 * Flag `laub.silent`: Laub's barks stay silent (the prologue, before the compass first speaks).
 * Spoken through 'dialogue:say' (the story's presenter shows it; subtitles without a story).
 * Debug/test API: window.kq.barks.
 */
import '../contracts';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { DialogueLine } from '../../content/types';
import { barkGroup, isBarkLine, matchTrigger } from '../../content/triggers';
import { inTourQuelle } from '../quelle/tour';
import {
  type BarkMemory,
  CALLOUT_COOLDOWN,
  BUILTIN_MEMORIALS,
  IDLE_AFTER,
  type MemorialZone,
  REQUEST_TTL,
  calloutGroup,
  chooseBark,
  lineSeconds,
  memorialAt,
  newMemory,
  quietReason,
  record,
  requestReady,
} from './rules';

declare module '../../core/events' {
  interface GameEvents {
    /** 60 s without player input (barks). */
    'bark:idle': Record<string, never>;
    /** The player walks into fire (barks). */
    'bark:enter-fire': { roomId?: string };
  }
}

export interface BarksSlice {
  /** Barks clock (game seconds; cooldowns survive saves). */
  t: number;
  mem: BarkMemory;
  /** Story-defined memorial places. */
  memorials: MemorialZone[];
}

declare module '../../core/state' {
  interface SystemStates {
    barks: BarksSlice;
  }
}

export interface BarksHooks {
  state(): { t: number; last: number; quiet: string | null; pending: string[]; idle: number; memorials: string[]; spoken: { id: string; t: number }[] };
  /** Advance the barks clock (tests: skip the 45 s gap / 10 min cooldown). */
  advance(seconds: number): void;
  /** Forget all cooldowns. */
  reset(): void;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    barks?: BarksHooks;
  }
}

interface Request {
  key: string;
  callout: string | null;
  lines: DialogueLine[];
  until: number;
}

/** Seconds after a chapter / game start without barks (the chapter opens with its own lines). */
const INTRO_QUIET = 12;

/** Events that never trigger barks themselves (noise). */
const NOISE = new Set(['player:step', 'dialogue:say', 'fire:progress', 'oblivion:progress']);

class BarksRuntime {
  private requests: Request[] = [];
  private idleT = 0;
  private idleFired = false;
  private echo = false;
  private conversation = false;
  private dialogueUntil = 0;
  private curtainUntil = 0;
  /** Ids of the room the player is in (catalogue id, full id, building), null outside. */
  private room: string[] | null = null;
  private readonly burning = new Set<string>();
  private lastInput = { x: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly spoken: { id: string; t: number }[] = [];
  private readonly mutedLines: Set<string>;
  private readonly unwatchState: () => void;
  private hooks = false;
  private introUntil = 0;

  constructor(private readonly ctx: GameContext) {
    const placeholder = ctx.params.has('placeholder');
    this.mutedLines = new Set(
      ctx.content.packs.filter((p) => p.file.includes('/examples/') || (p.pack.placeholder && !placeholder)).flatMap((p) => (p.pack.dialogue ?? []).map((d) => d.id)),
    );
    // Reset the old session's timers before save:loaded can resume dialogue.
    this.unwatchState = ctx.state.subscribe((_state, reason) => {
      if (reason !== 'load' && reason !== 'new') return;
      this.requests = [];
      this.dialogueUntil = this.curtainUntil = this.introUntil = 0;
      this.onInput();
    });
    const ev = ctx.events;
    ev.onAny((name, payload) => this.onEvent(name, payload));
    ev.on('echo:start', () => (this.echo = true));
    ev.on('echo:end', () => (this.echo = false));
    ev.on('npc:conversation', ({ open }) => (this.conversation = open));
    ev.on('dialogue:say', ({ text, ms, id }) => {
      // our own barks count as dialogue as well (nothing talks over them)
      this.dialogueUntil = Math.max(this.dialogueUntil, this.now + lineSeconds(text, ms) + (id && isBarkLine(id) ? 0 : 0.5));
    });
    ev.on('player:caught', () => (this.curtainUntil = this.now + 3.2));
    // a new chapter / game starts with its own lines: no barks for its first seconds
    const intro = () => {
      this.requests = [];
      this.introUntil = this.now + INTRO_QUIET;
    };
    ev.on('story:chapter', intro);
    ev.on('game:start', intro);
    ev.on('memorial:set', (m) => {
      const s = this.slice;
      s.memorials = s.memorials.filter((z) => z.id !== m.id);
      if (m.active) {
        const z: MemorialZone = { id: m.id };
        if (m.x !== undefined) z.x = m.x;
        if (m.z !== undefined) z.z = m.z;
        if (m.r !== undefined) z.r = m.r;
        if (m.era) z.era = m.era;
        if (m.room) z.room = m.room;
        s.memorials.push(z);
      }
    });
    ev.on('fire:room', ({ roomId, state }) => {
      if (state === 'burning') this.burning.add(roomId);
      else this.burning.delete(roomId);
    });
    ev.on('threat:configure', (c) => {
      if (c.kind === 'fire' && c.active) ev.emit('bark:enter-fire', {});
      if (c.kind === 'fire' && !c.active) this.burning.clear();
    });
    ev.on('era:change', () => this.burning.clear());
    window.addEventListener('keydown', this.onInput, true);
    window.addEventListener('mousedown', this.onInput, true);
  }

  get slice(): BarksSlice {
    const s = this.ctx.state.slice('barks', () => ({ t: 0, mem: newMemory(), memorials: [] }));
    if (typeof s.t !== 'number') s.t = 0;
    if (!s.mem) s.mem = newMemory();
    if (!Array.isArray(s.memorials)) s.memorials = [];
    return s;
  }

  get now(): number {
    return this.slice.t;
  }

  private readonly onInput = (): void => {
    this.idleT = 0;
    this.idleFired = false;
  };

  private onEvent(name: string, payload: unknown): void {
    if (NOISE.has(name)) return;
    if (name === 'room:enter' || name === 'room:leave') {
      // fx names burning rooms by full id ('KB-B01/B01.2.og-festsaal') or building; interiors by catalogue id
      const p = (payload ?? {}) as { roomId?: unknown; id?: unknown; building?: unknown };
      const id = typeof p.roomId === 'string' ? p.roomId : null;
      const ids = [p.roomId, p.id, p.building].filter((v): v is string => typeof v === 'string' && v !== '');
      if (name === 'room:enter') {
        this.room = ids.length ? ids : null;
        if (id && ids.some((v) => this.burning.has(v))) this.ctx.events.emit('bark:enter-fire', { roomId: id });
      } else if (id && this.room?.[0] === id) this.room = null;
    }
    if (this.now < this.introUntil) return;
    const lines = this.ctx.content.dialogueFor(name).filter((l) => isBarkLine(l.id) && !this.mutedLines.has(l.id));
    if (!lines.length) return;
    const st = this.ctx.state.state;
    const story = st.systems.story;
    const c = { era: this.ctx.era.current, flags: st.flags, chapter: story?.chapter ?? null, beat: story?.beat ?? null, clues: st.inventory.clues };
    // flag `laub.silent`: the compass does not talk yet (the prologue, before Laub introduces himself)
    const noLaub = st.flags['laub.silent'] === true;
    const matching = lines.filter((l) => matchTrigger(l, name, payload, c) && !(noLaub && l.speaker === 'laub') && this.allowedAtQuelle(l));
    if (!matching.length) return;
    const callout = calloutGroup(matching[0]!);
    // The guide's waiting bark and call-out share an event, but can both be pending.
    const key = callout ?? name;
    this.requests = this.requests.filter((r) => r.key !== key);
    this.requests.push({ key, callout, lines: matching, until: this.now + REQUEST_TTL });
    if (this.requests.length > 4) {
      const ordinary = this.requests.findIndex((r) => r.callout === null);
      this.requests.splice(Math.max(0, ordinary), 1);
    }
  }

  private allowedAtQuelle(line: DialogueLine): boolean {
    return barkGroup(line.id) !== 'marlene.gen' || !inTourQuelle(this.ctx.state.state.systems.story);
  }

  quiet(): string | null {
    const ctx = this.ctx;
    const p = ctx.player.position;
    return quietReason({
      echo: this.echo,
      conversation: this.conversation,
      dialogue: this.now < this.dialogueUntil,
      modal: ctx.ui.modals.count > 0,
      curtain: this.now < this.curtainUntil,
      memorial: memorialAt([...BUILTIN_MEMORIALS, ...this.slice.memorials], p.x, p.z, ctx.era.current, this.room),
      flag: ctx.state.state.flags['barks.quiet'] === true,
    });
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    const s = this.slice;
    s.t += dt;
    // idle: no movement, no look, no key / click
    const pl = ctx.player;
    const moved = Math.hypot(pl.position.x - this.lastInput.x, pl.position.z - this.lastInput.z) > 0.05 || Math.abs(pl.yaw - this.lastInput.yaw) > 0.01 || Math.abs(pl.pitch - this.lastInput.pitch) > 0.01;
    if (moved) {
      this.lastInput = { x: pl.position.x, z: pl.position.z, yaw: pl.yaw, pitch: pl.pitch };
      this.onInput();
    } else if (ctx.ui.modals.count === 0) {
      this.idleT += dt;
      if (this.idleT >= IDLE_AFTER && !this.idleFired) {
        this.idleFired = true;
        ctx.events.emit('bark:idle', {});
      }
    }
    if (!this.requests.length) return;
    for (let i = this.requests.length - 1; i >= 0; i--) {
      if (this.requests[i]!.until < s.t) this.requests.splice(i, 1);
    }
    let i = this.nextRequest(s);
    if (i < 0 || this.quiet()) return;
    for (; i >= 0; i = this.nextRequest(s)) {
      const r = this.requests[i]!;
      this.requests.splice(i, 1);
      const lines = r.lines.filter((l) => this.allowedAtQuelle(l));
      const line = chooseBark(lines, s.mem, s.t, Math.random, r.callout ? CALLOUT_COOLDOWN : undefined);
      if (!line) continue;
      this.say(line);
      return;
    }
  }

  /** Newest eligible call-out first, then newest ordinary request if the global gap allows it. */
  private nextRequest(s: BarksSlice): number {
    const ordinaryReady = requestReady(s.mem, s.t, null);
    let ordinary = -1;
    for (let i = this.requests.length - 1; i >= 0; i--) {
      const callout = this.requests[i]!.callout;
      if (callout !== null) {
        if (requestReady(s.mem, s.t, callout)) return i;
      } else if (ordinaryReady && ordinary < 0) ordinary = i;
    }
    return ordinary;
  }

  /** window.kq appears after every system's init: install the hooks on the first frame. */
  frame(): void {
    if (!this.hooks && window.kq) this.installHooks();
  }

  private say(line: DialogueLine): void {
    const ctx = this.ctx;
    record(this.slice.mem, line, this.now);
    this.spoken.push({ id: line.id, t: this.now });
    if (this.spoken.length > 50) this.spoken.shift();
    ctx.events.emit('dialogue:say', { speaker: line.speaker, text: line.text_de, id: line.id });
    if (!ctx.systems.get('story')) {
      const name = ctx.content.speakers.get(line.speaker)?.name_de ?? line.speaker;
      ctx.ui.hud.subtitle(name, line.text_de, lineSeconds(line.text_de) * 1000, true);
    }
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    kq.barks = {
      state: () => ({
        t: this.now,
        last: this.slice.mem.last,
        quiet: this.quiet(),
        pending: this.requests.map((r) => r.callout ? 'walk:bark' : r.key),
        idle: this.idleT,
        memorials: this.slice.memorials.map((m) => m.id),
        spoken: [...this.spoken],
      }),
      advance: (sec) => {
        this.slice.t += sec;
        this.introUntil = 0;
        // waiting requests keep their remaining patience
        for (const r of this.requests) r.until += sec;
        this.dialogueUntil = 0;
        this.curtainUntil = 0;
      },
      reset: () => {
        this.slice.mem = newMemory();
        this.requests = [];
      },
    };
  }

  dispose(): void {
    this.unwatchState();
    window.removeEventListener('keydown', this.onInput, true);
    window.removeEventListener('mousedown', this.onInput, true);
  }
}

let rt: BarksRuntime | null = null;

export default defineSystem({
  id: 'barks',
  init(ctx) {
    rt = new BarksRuntime(ctx);
  },
  update(dt) {
    rt?.update(dt);
  },
  frame() {
    rt?.frame();
  },
  dispose() {
    rt?.dispose();
    rt = null;
  },
});
