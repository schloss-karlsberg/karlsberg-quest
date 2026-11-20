/**
 * Dialogue voices. Two sources share one per-speaker character chain:
 * - the procedural "murmur": one tiny formant blip per syllable while a line types (lines without
 *   a recording);
 * - recorded clips (voice/manifest.json, see ./voiceManifest.ts), played whole through the chain.
 *
 * Laub rings like brass, Marlene comes through a band-limited radio with crackle, memories sound
 * from a distant hall. The chain parameters live in RADIO_CHAIN / RING_CHAIN / HALL_CHAIN; the
 * offline casting pipeline approximates the same chain with ffmpeg (filters noted on each
 * constant), so change both together.
 */
import type { AudioManager } from '../../../audio/audio';
import { noiseBurst } from '../../../audio/synth';
import type { VoiceSpec } from './speakers';

/**
 * Radio (Marlene, the colleague): telephone band with a small-speaker presence bump, plus a
 * light crackle bed with sparse pops under clips (blips get a random crackle tick instead).
 *
 * ffmpeg approximation (voice), then mixed with the crackle bed:
 *   highpass=f=300:poles=2,lowpass=f=3400:poles=2,equalizer=f=1800:t=q:w=1:g=4
 *   crackle bed: anoisesrc=color=white:amplitude=1,bandpass=f=3200:width_type=q:w=0.7,volume=0.004
 *   → amix=inputs=2:normalize=0 (pops: optional, ~3/s, 12 ms, peak 0.03 — fine to leave out offline)
 */
export const RADIO_CHAIN = {
  highpassHz: 300,
  lowpassHz: 3400,
  /** Butterworth Q of both band edges. */
  edgeQ: 0.707,
  presenceHz: 1800,
  presenceQ: 1,
  presenceDb: 4,
  crackle: { bandHz: 3200, bandQ: 0.7, bed: 0.004, popsPerS: 3, popGain: 0.03, popS: 0.012, blipChance: 0.25, blipGain: 0.02 },
} as const;

/**
 * Brass ring (Laub, the talking compass): the dry voice, a band-pass "body" blended in, and a
 * short feedback comb (≈ 417 Hz resonance series) for the metallic ring. Subtle enough that the
 * words stay clear. Blips additionally get a ringing sine partial (f × 4.17) at the source.
 *
 * ffmpeg approximation:
 *   asplit=3[d][b][c];
 *   [d]volume=0.8[d1];
 *   [b]bandpass=f=1250:width_type=q:w=1.2,volume=0.35[b1];
 *   [c]lowpass=f=4500,aecho=in_gain=0:out_gain=0.22:delays=2.4|4.8|7.2|9.6:decays=1|0.45|0.2|0.09[c1];
 *   [d1][b1][c1]amix=inputs=3:normalize=0
 */
export const RING_CHAIN = {
  dry: 0.8,
  bandHz: 1250,
  bandQ: 1.2,
  band: 0.35,
  combDelayMs: 2.4,
  combFeedback: 0.45,
  combDampHz: 4500,
  comb: 0.22,
  /** Blip-only source partial. */
  partialRatio: 4.17,
} as const;

/**
 * Distant hall (memories, echoes): the dry voice plus a low-passed feedback delay.
 *
 * ffmpeg approximation:
 *   asplit=2[d][w];
 *   [w]adelay=190:all=1,lowpass=f=1400,aecho=in_gain=1:out_gain=1:delays=190|380|570:decays=0.42|0.18|0.07,volume=0.55[w1];
 *   [d][w1]amix=inputs=2:normalize=0
 */
export const HALL_CHAIN = {
  dry: 1,
  delayS: 0.19,
  feedback: 0.42,
  lowpassHz: 1400,
  wet: 0.55,
} as const;

/** Level of a recorded clip into the chain (the voice bus volume applies after). */
export const CLIP_GAIN = 0.9;

type Fx = Pick<VoiceSpec, 'radio' | 'ring' | 'hall'>;

const fxKey = (s: Fx) => `${s.radio ? 'r' : ''}${s.ring ? 'b' : ''}${s.hall ? 'h' : ''}`;

function radioStage(ctx: BaseAudioContext, input: AudioNode): AudioNode {
  const R = RADIO_CHAIN;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = R.highpassHz;
  hp.Q.value = R.edgeQ;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = R.lowpassHz;
  lp.Q.value = R.edgeQ;
  const pk = ctx.createBiquadFilter();
  pk.type = 'peaking';
  pk.frequency.value = R.presenceHz;
  pk.Q.value = R.presenceQ;
  pk.gain.value = R.presenceDb;
  return input.connect(hp).connect(lp).connect(pk);
}

function ringStage(ctx: BaseAudioContext, input: AudioNode): AudioNode {
  const R = RING_CHAIN;
  const out = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = R.dry;
  input.connect(dry).connect(out);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = R.bandHz;
  bp.Q.value = R.bandQ;
  const band = ctx.createGain();
  band.gain.value = R.band;
  input.connect(bp).connect(band).connect(out);
  // feedback comb: x → [delay → damp → fb] loop, tapped after the delay
  const d = ctx.createDelay(0.05);
  d.delayTime.value = R.combDelayMs / 1000;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = R.combDampHz;
  const fb = ctx.createGain();
  fb.gain.value = R.combFeedback;
  const wet = ctx.createGain();
  wet.gain.value = R.comb;
  input.connect(d).connect(damp).connect(fb).connect(d);
  damp.connect(wet).connect(out);
  return out;
}

function hallStage(ctx: BaseAudioContext, input: AudioNode): AudioNode {
  const H = HALL_CHAIN;
  const out = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = H.dry;
  input.connect(dry).connect(out);
  const d = ctx.createDelay(1);
  d.delayTime.value = H.delayS;
  const fb = ctx.createGain();
  fb.gain.value = H.feedback;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = H.lowpassHz;
  const wet = ctx.createGain();
  wet.gain.value = H.wet;
  input.connect(d).connect(lp).connect(fb).connect(d);
  lp.connect(wet).connect(out);
  return out;
}

/**
 * The per-speaker character chain: input → [radio] → [brass ring] → [hall] → dest. Returns the
 * input node; blips and clips both connect to it. Long-lived (build once per speaker kind).
 */
export function buildVoiceChain(ctx: BaseAudioContext, dest: AudioNode, fx: Fx): GainNode {
  const input = ctx.createGain();
  let node: AudioNode = input;
  if (fx.radio) node = radioStage(ctx, node);
  if (fx.ring) node = ringStage(ctx, node);
  if (fx.hall) node = hallStage(ctx, node);
  node.connect(dest);
  return input;
}

/**
 * Radio crackle under a clip: a quiet band-passed noise bed with sparse pops, scheduled on the
 * context clock for `seconds` (a suspended context freezes it with the clip). Returns the source.
 */
function radioCrackle(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode, seconds: number): AudioBufferSourceNode {
  const C = RADIO_CHAIN.crackle;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = C.bandHz;
  bp.Q.value = C.bandQ;
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(C.bed, t0);
  let t = t0 + Math.random() / C.popsPerS;
  while (t < t0 + seconds) {
    g.gain.setValueAtTime(C.bed, t);
    g.gain.linearRampToValueAtTime(C.popGain * (0.4 + Math.random() * 0.6), t + 0.002);
    g.gain.linearRampToValueAtTime(C.bed, t + C.popS);
    t += (0.3 + Math.random() * 1.4) / C.popsPerS;
  }
  src.connect(bp).connect(g).connect(dest);
  src.start(t0, Math.random() * 3);
  src.stop(t0 + seconds + 0.05);
  return src;
}

/**
 * One recorded clip playing through a speaker chain. Pausing remembers the position (a new
 * source resumes from it); a suspended context simply freezes it. `stop()` fades out briefly.
 */
export class VoiceClip {
  private src: AudioBufferSourceNode | null = null;
  private crackle: AudioBufferSourceNode | null = null;
  private out: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  state: 'playing' | 'paused' | 'ended' | 'stopped' = 'paused';

  constructor(
    private readonly ctx: AudioContext,
    readonly buffer: AudioBuffer,
    private readonly dest: AudioNode,
    private readonly noise: AudioBuffer | null,
  ) {}

  get playing(): boolean {
    return this.state === 'playing';
  }

  get done(): boolean {
    return this.state === 'ended' || this.state === 'stopped';
  }

  /** Start / resume. False (and nothing plays) while the context is not running. */
  start(): boolean {
    if (this.done || this.state === 'playing' || this.ctx.state !== 'running') return false;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = CLIP_GAIN;
    out.connect(this.dest);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(out);
    src.onended = () => {
      if (this.src === src && this.state === 'playing') {
        this.state = 'ended';
        this.release(0, true);
      }
    };
    const offset = Math.min(this.offset, this.buffer.duration);
    src.start(ctx.currentTime, offset);
    this.startedAt = ctx.currentTime - offset;
    this.src = src;
    this.out = out;
    if (this.noise) this.crackle = radioCrackle(ctx, this.noise, out, this.buffer.duration - offset);
    this.state = 'playing';
    return true;
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.offset = this.ctx.currentTime - this.startedAt;
    this.state = 'paused';
    this.release();
  }

  stop(): void {
    if (this.done) return;
    this.state = 'stopped';
    this.release(0.04);
  }

  private release(fade = 0, ended = false): void {
    const src = this.src, crackle = this.crackle, out = this.out;
    this.src = this.crackle = this.out = null;
    const t = this.ctx.currentTime;
    try {
      if (out && fade > 0) {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
      }
      if (!ended) src?.stop(t + fade);
      crackle?.stop(t + fade);
    } catch {
      /* already stopped */
    }
    if (out) {
      const o = out;
      if (src && !ended) src.addEventListener('ended', () => o.disconnect(), { once: true });
      else o.disconnect();
    }
  }
}

export class Voice {
  private readonly chains = new Map<string, GainNode>();
  private chainCtx: BaseAudioContext | null = null;
  private last = 0;

  constructor(private readonly audio: AudioManager) {}

  /** The speaker's long-lived chain input on the voice bus (null while audio is locked). */
  private chain(spec: Fx): GainNode | null {
    const ctx = this.audio.ctx;
    const bus = this.audio.bus('voice') ?? this.audio.bus('sfx');
    if (!ctx || !bus) return null;
    if (this.chainCtx !== ctx) {
      this.chains.clear();
      this.chainCtx = ctx;
    }
    const key = fxKey(spec);
    let input = this.chains.get(key);
    if (!input) {
      input = buildVoiceChain(ctx, bus, spec);
      this.chains.set(key, input);
    }
    return input;
  }

  /**
   * Start a recorded clip through the speaker's chain. Null when it cannot start now (audio
   * locked or the context suspended): the caller murmurs instead.
   */
  playClip(buffer: AudioBuffer, spec: VoiceSpec): VoiceClip | null {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const dest = this.chain(spec);
    if (!dest) return null;
    const clip = new VoiceClip(ctx, buffer, dest, spec.radio ? this.audio.noise() : null);
    return clip.start() ? clip : null;
  }

  /** One syllable. `stress` 0..1 raises pitch/level a little (sentence starts, capitals). */
  blip(spec: VoiceSpec, stress = 0): void {
    const ctx = this.audio.ctx;
    const dest = this.chain(spec);
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    if (now - this.last < 0.045) return; // never machine-gun
    this.last = now;
    const f = spec.base * (1 + (Math.random() - 0.5) * spec.spread) * (1 + stress * 0.12);
    const dur = 0.055 + Math.random() * 0.05;
    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(f * 1.04, now);
    osc.frequency.exponentialRampToValueAtTime(f * (0.9 + Math.random() * 0.08), now + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = spec.formant * (0.85 + Math.random() * 0.3);
    f1.Q.value = spec.q;
    const g = ctx.createGain();
    const level = spec.gain * (0.75 + stress * 0.4);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(level, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(f1).connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    if (spec.radio && Math.random() < RADIO_CHAIN.crackle.blipChance) {
      noiseBurst(this.audio, dest, { freq: RADIO_CHAIN.crackle.bandHz, q: RADIO_CHAIN.crackle.bandQ, duration: 0.03, gain: RADIO_CHAIN.crackle.blipGain });
    }
    if (spec.ring) {
      const r = ctx.createOscillator();
      r.type = 'sine';
      r.frequency.value = f * RING_CHAIN.partialRatio;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, now);
      rg.gain.exponentialRampToValueAtTime(spec.gain * 0.25, now + 0.006);
      rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      r.connect(rg).connect(dest);
      r.start(now);
      r.stop(now + 0.4);
    }
  }
}

/** Indices in `text` where a syllable starts (vowel after a non-vowel). Pure; used for blips. */
export function syllableStarts(text: string): Set<number> {
  const out = new Set<number>();
  const vowel = /[aeiouäöüyAEIOUÄÖÜY]/;
  let prevVowel = false;
  for (let i = 0; i < text.length; i++) {
    const v = vowel.test(text[i]!);
    if (v && !prevVowel) out.add(i);
    prevVowel = v;
  }
  return out;
}
