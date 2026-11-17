/**
 * Echo director: stages a memory where the player listens. Smoke silhouettes materialise, walk a
 * few steps, gesture while their line is subtitled (dialogue lines with trigger
 * { event: 'echo:start', id }), whisper and breathe in 3D, then dissolve. The picture drains of
 * colour while the memory plays. Emits echo:start / echo:end.
 */
import { Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import type { DialogueLine } from '../../content/types';
import { type BreathLoop, breathing, echoSwell, whisper } from './audio';
import { figureSpeakers, isStageDirection, lineMs } from './logic';
import type { ChronikClue } from './types';
import { GhostFigure } from './world/ghosts';
import { disposeTree, drapedDisc, lin, mistMaterial } from './world/gfx';

export interface TranscriptLine {
  speaker: string | null;
  text: string;
}

interface Cue {
  start: number;
  dur: number;
  figure: number;
  speaker: string | null;
  text: string;
  shown: boolean;
}

interface Figure {
  ghost: GhostFigure;
  from: Vector3;
  to: Vector3;
  pos: Vector3;
  facing: number;
}

const INTRO = 1.9;
const GAP = 0.45;
const OUTRO = 2.4;

export class EchoDirector {
  clue: ChronikClue | null = null;
  private t = 0;
  private cues: Cue[] = [];
  private figures: Figure[] = [];
  private total = 0;
  private stage = new Group();
  private center = new Vector3();
  private breath: BreathLoop | null = null;
  /** The player walked on: the stage fades, the lines go on as subtitles (seconds into the echo). */
  private detached = false;
  private detachAt = 0;
  private desat0 = 0;
  private mist: Mesh | null = null;
  private readonly label: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly lines: (id: string) => DialogueLine[],
    hudLayer: HTMLElement,
    private readonly onDone: (clue: ChronikClue, transcript: TranscriptLine[], walked: boolean) => void,
  ) {
    this.label = document.createElement('div');
    this.label.className = 'ck-memory-label';
    hudLayer.append(this.label);
    this.stage.name = 'chronik-echo';
  }

  get active(): boolean {
    return this.clue !== null;
  }

  /** Seconds into the current echo and its total length (debug / tests). */
  get progress(): { t: number; total: number; line: number; walking: boolean } {
    return { t: this.t, total: this.total, line: this.cues.findIndex((c) => this.t >= c.start && this.t < c.start + c.dur), walking: this.detached };
  }

  /** The player walked on while it played (the card waits; a feed line says it was noted). */
  get walking(): boolean {
    return this.detached;
  }

  start(clue: ChronikClue): void {
    // a memory still whispering as you walk on counts as heard when the next one begins
    if (this.clue) this.finish(!this.detached);
    const ctx = this.ctx;
    this.clue = clue;
    this.t = 0;
    this.detached = false;
    this.detachAt = 0;
    const lines = this.lines(clue.id);
    const speakers = figureSpeakers(lines);
    const figCount = Math.max(1, speakers.length);

    // stage: in front of the player, towards the clue
    const p = ctx.player.position;
    const dir = new Vector3(clue.where.x - p.x, 0, clue.where.z - p.z);
    if (dir.length() < 1.5) dir.set(-Math.sin(ctx.player.yaw), 0, -Math.cos(ctx.player.yaw));
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const side = new Vector3(-dir.z, 0, dir.x);
    this.center.set(p.x + dir.x * 5, 0, p.z + dir.z * 5);
    const night = ctx.era.info.night;
    this.figures = [];
    for (let i = 0; i < figCount; i++) {
      const seed = [...(speakers[i] ?? clue.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 17 + i);
      const ghost = new GhostFigure(seed, { hat: seed % 3 !== 0, dress: seed % 4 === 1, night });
      const off = (i - (figCount - 1) / 2) * 2.1;
      const from = this.center.clone().addScaledVector(side, off - 0.8).addScaledVector(dir, (i % 2) * 0.9);
      const to = this.center.clone().addScaledVector(side, off + 0.8).addScaledVector(dir, (i % 2) * 0.9 - 0.4);
      const fig: Figure = { ghost, from, to, pos: from.clone(), facing: Math.atan2(to.x - from.x, to.z - from.z) };
      this.stage.add(ghost.object);
      this.figures.push(fig);
    }
    // ground mist under the scene
    const mm = mistMaterial(lin(0xdfe9f2, 1.0));
    this.mist = new Mesh(drapedDisc((x, z) => ctx.world.heightAt(x, z), this.center.x, this.center.z, 6.5, 10, 48, 0.25), mm);
    this.mist.position.set(this.center.x, 0, this.center.z);
    this.mist.renderOrder = 4;
    this.stage.add(this.mist);
    ctx.scene.add(this.stage);

    // cues
    this.cues = [];
    let t = INTRO;
    const list = lines.length ? lines.map((l) => ({ speaker: l.speaker, text: l.text_de })) : [{ speaker: '', text: `(${clue.text_de ?? clue.title_de})` }];
    for (const l of list) {
      const stage = isStageDirection(l.text) || !l.speaker;
      const figure = stage ? -1 : speakers.indexOf(l.speaker);
      const dur = lineMs(l.text) / 1000;
      this.cues.push({ start: t, dur, figure, speaker: stage ? null : l.speaker, text: l.text, shown: false });
      t += dur + GAP;
    }
    this.total = t + OUTRO;

    // look & sound
    this.desat0 = ctx.post.uniforms.uDesaturate!.value as number;
    const fiction = clue.fiction ?? true;
    this.label.textContent = ctx.t(fiction ? 'chronik.memory' : 'chronik.memory.real');
    this.label.classList.toggle('real', !fiction);
    this.label.classList.add('show');
    ctx.ui.hud.subtitle(null, ctx.t('chronik.echo.caption'), 2600);
    echoSwell(ctx.audio);
    const src = ctx.audio.createSource3D('sfx', { refDistance: 3 });
    if (src) {
      src.setPosition(this.center.x, ctx.world.heightAt(this.center.x, this.center.z) + 1.5, this.center.z);
      this.breath = breathing(ctx.audio, src.input);
      this.breath.setLevel(1);
      const b = this.breath;
      this.breath = {
        setLevel: (v) => b.setLevel(v),
        stop: () => {
          b.stop();
          setTimeout(() => src.dispose(), 2500);
        },
      };
    }
    ctx.events.emit('echo:start', { id: clue.id });
  }

  /** Per rendered frame (dt real seconds; not called while paused). */
  update(dt: number): void {
    const clue = this.clue;
    if (!clue) return;
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    // walked on (playtest round 4: nobody should have to stand through a memory): the figures
    // stay behind and fade, the colour comes back, but the voices go with you as subtitles and the
    // memory still counts when its last line has been said
    const p = ctx.player.position;
    if (!this.detached && Math.hypot(p.x - this.center.x, p.z - this.center.z) > Math.max(16, clue.where.radius + 10)) {
      this.detached = true;
      this.detachAt = t;
      ctx.ui.hud.subtitle(null, ctx.t('chronik.echo.walk'), 2000);
    }
    const linesEnd = this.total - OUTRO;
    // figures
    const fadeIn = Math.min(1, t / INTRO);
    const away = this.detached ? Math.max(0, 1 - (t - this.detachAt) / 1.6) : 1;
    const fadeOut = Math.min(away, 1 - Math.min(1, Math.max(0, (t - linesEnd) / OUTRO)));
    const reduced = ctx.settings.state.reducedMotion;
    this.figures.forEach((f, i) => {
      const cue = this.cues.find((c) => c.figure === i && t >= c.start && t < c.start + c.dur);
      const speaking = !!cue;
      const k = Math.min(1, dt * 3);
      f.ghost.talk += ((speaking ? 1 : 0) - f.ghost.talk) * k;
      f.ghost.gesture += ((speaking && i % 2 === 0 ? 1 : speaking ? 0.4 : 0) - f.ghost.gesture) * k * 0.7;
      // walk the path slowly during the scene; stop to speak
      const prog = Math.min(1, Math.max(0, (t - INTRO * 0.5) / Math.max(4, linesEnd)));
      const target = f.from.clone().lerp(f.to, reduced ? 0.5 : prog);
      const moving = !speaking && !reduced && prog < 1 && t < linesEnd;
      f.pos.lerp(target, Math.min(1, dt * (moving ? 1.2 : 0.4)));
      f.ghost.walkAmt += ((moving ? 1 : 0) - f.ghost.walkAmt) * k;
      f.ghost.walk += dt * 5.2 * f.ghost.walkAmt;
      // face the walk direction, or the listener while speaking
      const look = speaking ? Math.atan2(p.x - f.pos.x, p.z - f.pos.z) : Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
      let d = look - f.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.facing += d * Math.min(1, dt * 2.5);
      f.ghost.object.position.set(f.pos.x, ctx.world.heightAt(f.pos.x, f.pos.z), f.pos.z);
      f.ghost.object.rotation.y = f.facing;
      f.ghost.fade = Math.min(fadeIn * 1.05, fadeOut);
      f.ghost.alpha = 0.8 + 0.2 * Math.sin(t * 0.9 + i);
      f.ghost.apply();
    });
    if (this.mist) (this.mist.material as ShaderMaterial).uniforms.uAlpha!.value = 0.6 * Math.min(fadeIn, fadeOut);
    // colour drains from the world while the memory plays
    const desat = 0.55 * Math.min(fadeIn, fadeOut);
    ctx.post.uniforms.uDesaturate!.value = Math.max(this.desat0, desat);
    this.breath?.setLevel(Math.min(fadeIn, fadeOut));
    // cues → subtitles + whispers
    for (const c of this.cues) {
      if (c.shown || t < c.start) continue;
      c.shown = true;
      const name = c.speaker ? (ctx.content.speakers.get(c.speaker)?.name_de ?? c.speaker) : null;
      ctx.ui.hud.subtitle(name, c.text, c.dur * 1000, !!c.speaker && (clue.fiction ?? true));
      const fig = this.figures[c.figure];
      if (fig && c.speaker) {
        const src = ctx.audio.createSource3D('voice', { refDistance: 2.5 });
        if (src) {
          // walked on: the whisper comes along, at your shoulder
          const w = this.detached ? p : fig.pos;
          src.setPosition(w.x, ctx.world.heightAt(w.x, w.z) + 1.6, w.z);
          whisper(ctx.audio, src.input, c.dur * 0.75, c.start * 13 + c.figure, 0.2);
          setTimeout(() => src.dispose(), (c.dur + 1) * 1000);
        }
      }
    }
    if (t >= this.total || (this.detached && t >= linesEnd)) this.finish(false);
  }

  /** Jump to the end (debug). */
  skip(): void {
    if (!this.clue) return;
    for (const c of this.cues) c.shown = true;
    this.t = this.total;
    this.update(0);
  }

  /** Stop now; `aborted` skips the discovery. */
  finish(aborted = true): void {
    const clue = this.clue;
    if (!clue) return;
    this.clue = null;
    for (const f of this.figures) f.ghost.dispose();
    this.figures = [];
    if (this.mist) disposeTree(this.mist);
    this.mist = null;
    this.stage.removeFromParent();
    this.stage = new Group();
    this.stage.name = 'chronik-echo';
    this.ctx.post.uniforms.uDesaturate!.value = this.desat0;
    this.breath?.stop();
    this.breath = null;
    this.label.classList.remove('show');
    const walked = this.detached;
    this.detached = false;
    this.ctx.events.emit('echo:end', { id: clue.id });
    if (!aborted) {
      const transcript = this.cues.map((c) => ({ speaker: c.speaker ? (this.ctx.content.speakers.get(c.speaker)?.name_de ?? c.speaker) : null, text: c.text }));
      this.onDone(clue, transcript, walked);
    }
  }

  dispose(): void {
    this.finish(true);
    this.label.remove();
  }
}
