/**
 * Staged set pieces (playtest round 4: "climaxes are told in captions, not shown"). What a
 * bracketed caption used to tell now happens in the world:
 *
 *  echo.k4.rueckwaerts   carts roll backwards uphill, stones fly back into their wall (k4-rewind)
 *  clue.k4.laub_1840     Laub at his theodolite, twelve pairs of eyes in the fog, he runs (k4-1840)
 *  clue.k2.warnung /     the Kabinett door: you put your eye to the crack and see the room behind
 *  clue.k2.abschied      it — candlelight, the Duke at his desk, the men who come in (k2-door)
 *  clue.k2.fackeln       the wagons roll out north with their torches and go small in the fog (k2-abfahrt)
 *  clue.k2.landremont    the general's riders gallop past you up to the palace (k2-reiter; runs its own course)
 *
 * Story cues (`{"do":"cue","id":…}`):
 *  k2-frost {on}         ice flowers grow over the compass and the edges of the view (k2-frost)
 *  k2-thaw               the frost melts off the compass, a breath of smoke rises
 *  k2-candle {x,z,y?}    a single candle lights up behind a window
 *  k4-quader {x,z}       dressed stones shove themselves on top of each other (the Steinbrecher)
 *  end-prints {x,z,n,r}  paw prints in the hoarfrost, in a ring round a spot
 *  k1-papers {tx,tz}     the reminders whirl up off the desk and stream out towards tx / tz (k1-papers)
 *  frost-breath {s?}     hoarfrost creeps over the compass and the edges of the view, thaws after s (8)
 *  k4-rest {x,z,n}       — handled by hunt ('hunt:tableau' kind 'rest')
 *
 * Debug: window.kq.stage (see StageHooks).
 */
import type { GameContext } from '../../../core/context';
import { stageEcho } from '../../chronik/staging';
import { AbfahrtPiece } from './k2-abfahrt';
import { CandlePiece } from './k2-candle';
import { DoorPiece, kabinettMarks } from './k2-door';
import { ReiterPiece } from './k2-reiter';
import { FrostOverlay } from './k2-frost';
import { Laub1840Piece } from './k4-1840';
import { QuaderPiece } from './k4-quader';
import { REWIND_SECONDS, RewindPiece } from './k4-rewind';
import { PrintsPiece } from './end-prints';
import { PapersPiece } from './k1-papers';
import type { Piece } from './common';
import './stage.css';

export interface StageHooks {
  /** Ids of the running pieces. */
  active(): string[];
  /** State of a running piece (tests). */
  state(id: string): Record<string, unknown> | null;
  /** Hold every piece's clock (screenshots on a slow renderer); null runs again. */
  hold(on: boolean): void;
  /** Start a piece by cue id (debug). */
  cue(id: string, data?: Record<string, unknown>): void;
  /** Run every piece `seconds` ahead in 1/30 s steps (a slow renderer's frames are too coarse). */
  advance(seconds: number): void;
  /** Pass a memory line to the pieces as if it came up (debug). */
  line(id: string, dur?: number): void;
}

declare module '../../../debug/hooks' {
  interface KqHooks {
    stage?: StageHooks;
  }
}

/** Pieces that are a climax (not ambient set dressing like the candle or the prints). */
const MOMENTS = new Set(['k4-rewind', 'k4-1840', 'k2-door', 'k2-abfahrt', 'k2-reiter']);

/** Echoes that are staged, and how the echo director paces them. */
export function registerEchoStagings(): void {
  // the rewind needs its seconds; the one caption is a sound (the compass ticking backwards)
  stageEcho('echo.k4.rueckwaerts', { intro: 0.8, outro: 1.2, minSeconds: REWIND_SECONDS });
  // the voice in the fog has no figure (the eyes are the pack); Laub is drawn by the piece
  stageEcho('clue.k4.laub_1840', { voices: ['stimme'], intro: 1.2, outro: 0.9, leash: 30 });
  // the Kabinett door: the scene plays in the room behind the door, at speaking pace
  stageEcho('clue.k2.warnung', { atClue: true, intro: 0.7, outro: 0.8, pace: 0.75, leash: 14, marks: kabinettMarks('clue.k2.warnung') });
  stageEcho('clue.k2.abschied', { atClue: true, intro: 0.6, outro: 0.8, pace: 0.85, leash: 14, marks: kabinettMarks('clue.k2.abschied') });
}

export class StageDirector {
  private readonly pieces: Piece[] = [];
  private held = false;
  readonly frost: FrostOverlay;
  private hooked = false;
  /** frost-breath: seconds until the passing frost thaws again (−1: none pending). */
  private breath = -1;
  /** A set piece that is a climax holds the card queue and calm toasts (hud action reason 'stage'). */
  private busy = false;
  /** Climax pieces whose memory has ended (they may still fade out; they no longer hold cards). */
  private readonly ended = new WeakSet<Piece>();

  constructor(private readonly ctx: GameContext) {
    registerEchoStagings();
    this.frost = new FrostOverlay(ctx);
    const ev = ctx.events;
    ev.on('echo:start', ({ id }) => {
      if (id === 'echo.k4.rueckwaerts') {
        this.add(new RewindPiece(ctx));
        // the caption "[Die Bussole tickt rückwärts]" is on the Bussole too: its needle ticks back
        ev.emit('story:cue', { id: 'bussole:tick', data: { hold: REWIND_SECONDS } });
      }
      else if (id === 'clue.k4.laub_1840') this.add(new Laub1840Piece(ctx));
      else if (id === 'clue.k2.warnung' || id === 'clue.k2.abschied') this.add(new DoorPiece(ctx, id));
      else if (id === 'clue.k2.fackeln') this.add(new AbfahrtPiece(ctx));
      else if (id === 'clue.k2.landremont') this.add(new ReiterPiece(ctx));
    });
    ev.on('echo:line', ({ line, dur }) => {
      for (const p of this.pieces) p.line?.(line, dur);
    });
    ev.on('echo:end', ({ id }) => {
      const want = id === 'echo.k4.rueckwaerts' ? 'k4-rewind' : id === 'clue.k4.laub_1840' ? 'k4-1840' : id === 'clue.k2.fackeln' ? 'k2-abfahrt' : id.startsWith('clue.k2.') ? 'k2-door' : null;
      for (const p of this.pieces) if (p.id === want) p.end?.();
      // the memory is over: its page may come (what still fades or rides off is no climax)
      for (const p of this.pieces) if (MOMENTS.has(p.id)) this.ended.add(p);
    });
    ev.on('story:cue', ({ id, data }) => this.cue(id, data ?? {}));
    // a shift or a load takes the stage down (the frost stays: it is on the compass)
    ev.on('shift:begin', () => this.clear(['k2-candle', 'k4-quader', 'end-prints']));
    ev.on('save:loaded', () => this.clear());
    // the frost belongs to chapter 2 (k2_0 … k2_12; k2_13 thaws it): a load or a jump puts it back
    ev.on('story:beat', ({ chapter, beat }) => {
      if (chapter === 'k2' && beat !== 'k2_13' && beat !== 'k2_0') this.frost.set(true);
      else if (chapter !== 'k2' && this.frost.on) this.frost.set(false);
    });
  }

  private cue(id: string, d: Record<string, unknown>): void {
    const num = (k: string, def: number) => (typeof d[k] === 'number' ? (d[k] as number) : def);
    const p = this.ctx.player.position;
    if (id === 'k2-frost') this.frost.set(d['on'] !== false);
    else if (id === 'k2-thaw') this.frost.thaw();
    else if (id === 'k2-candle') this.add(new CandlePiece(this.ctx, num('x', p.x), num('z', p.z), typeof d['y'] === 'number' ? (d['y'] as number) : undefined));
    else if (id === 'k4-quader') this.add(new QuaderPiece(this.ctx, num('x', p.x), num('z', p.z)));
    else if (id === 'end-prints') this.add(new PrintsPiece(this.ctx, num('x', p.x), num('z', p.z), num('n', 5), num('r', 1.6), d['ring'] !== false));
    else if (id === 'k1-papers') this.add(new PapersPiece(this.ctx, num('tx', p.x), num('tz', p.z)));
    else if (id === 'frost-breath') {
      this.frost.set(true);
      this.breath = num('s', 8);
    } else if (id === 'stage-off') this.clear(typeof d['id'] === 'string' ? [d['id'] as string] : undefined);
  }

  private add(p: Piece): void {
    for (const q of this.pieces) if (q.id === p.id) q.done = true;
    this.pieces.push(p);
  }

  private clear(ids?: string[]): void {
    for (const p of this.pieces) if (!ids || ids.includes(p.id)) p.done = true;
  }

  frame(dt: number): void {
    this.installHooks();
    if (this.breath >= 0 && (this.breath -= dt) < 0) this.frost.thaw();
    this.frost.frame(dt);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (!p.done) p.frame(this.held ? 0 : Math.min(dt, 0.1));
      if (!p.done) p.camera?.();
      if (p.done) {
        p.dispose();
        this.pieces.splice(i, 1);
      }
    }
    // nothing slides over a staged climax while its memory plays: cards and toasts wait for its end
    // (the memory's own page comes right after it)
    const busy = this.pieces.some((p) => !p.done && MOMENTS.has(p.id) && !this.ended.has(p));
    if (busy !== this.busy) {
      this.busy = busy;
      this.ctx.ui.hud.busy('stage', busy, 0);
    }
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq || this.hooked) return;
    this.hooked = true;
    const self = this;
    kq.stage = {
      active: () => self.pieces.map((p) => p.id),
      state(id) {
        const p = self.pieces.find((x) => x.id === id) as unknown as Record<string, unknown> | undefined;
        if (!p) return id === 'k2-frost' ? { on: self.frost.on } : null;
        const out: Record<string, unknown> = { id };
        for (const k of ['time', 'built', 'open', 'running', 'peeking', 'lit']) {
          const v = (p as Record<string, unknown>)[k];
          if (v !== undefined) out[k] = v;
        }
        return out;
      },
      hold(on) {
        self.held = on;
      },
      cue(id, data) {
        self.cue(id, data ?? {});
      },
      advance(seconds) {
        for (let t = 0; t < seconds; t += 1 / 30) {
          const dt = Math.min(1 / 30, seconds - t);
          for (const p of self.pieces) if (!p.done) p.frame(dt);
          if (self.breath >= 0 && (self.breath -= dt) < 0) self.frost.thaw();
          self.frost.frame(dt);
        }
      },
      line(id, dur = 3) {
        for (const p of self.pieces) p.line?.(id, dur);
      },
    };
  }

  dispose(): void {
    this.clear();
    for (const p of this.pieces) p.dispose();
    this.pieces.length = 0;
    this.frost.dispose();
  }
}
