/**
 * Dialogue voices. Two sources, one character per speaker:
 * - the procedural "murmur": one tiny formant blip per syllable while a line types (lines without
 *   a recording);
 * - recorded clips (voice/manifest.json, see ./voiceManifest.ts), played whole.
 *
 * Laub rings like brass, Marlene comes through a band-limited radio with crackle, memories sound
 * from a distant hall. Every parameter lives in RADIO_CHAIN / RING_CHAIN / HALL_CHAIN, with a
 * `blip` and a `clip` variant where they differ. The CLIP values match the casting render of the
 * voice pipeline (the owner picks voices by listening to it), so change both together.
 */
import type { AudioManager } from '../../../audio/audio';
import { noiseBurst } from '../../../audio/synth';
import type { VoiceSpec } from './speakers';

/**
 * Radio (Marlene, the colleague).
 *
 * clip (= casting render): 2× highpass 300 Hz + 2× lowpass 3400 Hz (all Q 0.707) → peaking +4 dB
 * @ 1700 Hz Q 0.9 → +6 dB → tanh soft clip → −6 dB; plus pink hiss (amplitude 0.006, band-pass
 * 1800 Hz Q 0.5) and crackle (≈ 9 random impulses/s at ±0.25, band-pass 3200 Hz Q 0.7).
 *   ffmpeg sketch: highpass=f=300:poles=2,highpass=f=300:poles=2,lowpass=f=3400:poles=2,
 *   lowpass=f=3400:poles=2,equalizer=f=1700:t=q:w=0.9:g=4,volume=6dB,asoftclip=type=tanh,volume=-6dB
 *   ⊕ anoisesrc=color=pink:amplitude=0.006,bandpass=f=1800:width_type=q:w=0.5
 * blip: one highpass 300 / lowpass 3400, peaking +4 dB @ 1800 Hz, and a random crackle tick.
 */
export const RADIO_CHAIN = {
  clip: {
    highpassHz: 300,
    lowpassHz: 3400,
    edgeQ: 0.707,
    /** Each band edge filter is applied this many times (12 dB/oct each). */
    edgeStages: 2,
    presenceHz: 1700,
    presenceQ: 0.9,
    presenceDb: 4,
    /** Drive into the tanh shaper and the make-down after it. */
    driveDb: 6,
    trimDb: -6,
    hiss: { amplitude: 0.006, bandHz: 1800, bandQ: 0.5 },
    crackle: { perS: 9, amplitude: 0.25, bandHz: 3200, bandQ: 0.7 },
  },
  blip: {
    highpassHz: 300,
    lowpassHz: 3400,
    edgeQ: 0.707,
    edgeStages: 1,
    presenceHz: 1800,
    presenceQ: 1,
    presenceDb: 4,
    crackle: { chance: 0.25, gain: 0.02, bandHz: 3200, bandQ: 0.7 },
  },
} as const;

/**
 * Brass ring (Laub, the talking compass).
 *
 * clip (= casting render): highpass 110 Hz Q 0.707, then three branches summed — dry 1.0; comb:
 * band-pass 1250 Hz Q 1.6 → delay 1.6 ms with feedback 0.62 → × 0.5; slap: lowpass 3000 Hz →
 * delay 23 ms → × 0.18 — then peaking +2 dB @ 2500 Hz Q 1.
 * blip: dry 0.8, band-pass 1250 Hz Q 1.2 × 0.35, a 2.4 ms comb (feedback 0.45, damped at 4.5 kHz)
 * × 0.22, and a ringing sine partial (f × 4.17) at the source.
 */
export const RING_CHAIN = {
  clip: {
    highpassHz: 110,
    highpassQ: 0.707,
    dry: 1,
    comb: { bandHz: 1250, bandQ: 1.6, delayS: 0.0016, feedback: 0.62, gain: 0.5 },
    slap: { lowpassHz: 3000, delayS: 0.023, gain: 0.18 },
    presenceHz: 2500,
    presenceQ: 1,
    presenceDb: 2,
  },
  blip: {
    dry: 0.8,
    bandHz: 1250,
    bandQ: 1.2,
    band: 0.35,
    combDelayS: 0.0024,
    combFeedback: 0.45,
    combDampHz: 4500,
    comb: 0.22,
    /** Source partial ratio. */
    partialRatio: 4.17,
  },
} as const;

/**
 * Distant hall (memories, echoes), the same for blips and clips: the dry voice plus a low-passed
 * feedback delay.
 *   ffmpeg sketch: asplit=2[d][w];[w]adelay=190:all=1,lowpass=f=1400,
 *   aecho=1:1:190|380|570:0.42|0.18|0.07,volume=0.55[w1];[d][w1]amix=inputs=2:normalize=0
 */
export const HALL_CHAIN = {
  dry: 1,
  delayS: 0.19,
  feedback: 0.42,
  lowpassHz: 1400,
  wet: 0.55,
} as const;

/**
 * Level of a recorded clip into its chain (the voice bus volume, the master and its compressor
 * apply after). Clips arrive at −18 LUFS, the usual game-dialogue reference: the music (drones,
 * score) and ambience beds sit well below that and the SFX are short peaks, so unity gain keeps
 * speech on top without pumping the master compressor (threshold −12 dB). The chains add a
 * little (radio presence + soft clip, the ring's comb), which the Stimmen slider balances.
 */
export const CLIP_GAIN = 1;

type Fx = Pick<VoiceSpec, 'radio' | 'ring' | 'hall'>;
export type ChainMode = 'blip' | 'clip';

/** A speaker chain: `input` takes the voice, `post` (after every stage) takes noise beds. */
export interface VoiceChain {
  input: GainNode;
  post: GainNode;
}

const fxKey = (s: Fx, mode: ChainMode) => `${mode}:${s.radio ? 'r' : ''}${s.ring ? 'b' : ''}${s.hall ? 'h' : ''}`;
const db = (d: number) => Math.pow(10, d / 20);

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q: number, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  if (gainDb) f.gain.value = gainDb;
  return f;
}

function gain(ctx: BaseAudioContext, v: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** tanh soft clip; the curve spans tanh(K·x) so drive above 0 dBFS still bends instead of clamping. */
const SHAPER_K = 3;
let tanhCurve: Float32Array<ArrayBuffer> | null = null;
function softClip(ctx: BaseAudioContext): WaveShaperNode {
  if (!tanhCurve) {
    const n = 2048;
    tanhCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) tanhCurve[i] = Math.tanh(SHAPER_K * ((i / (n - 1)) * 2 - 1));
  }
  const ws = ctx.createWaveShaper();
  ws.curve = tanhCurve;
  ws.oversample = '2x';
  return ws;
}

function radioStage(ctx: BaseAudioContext, input: AudioNode, mode: ChainMode): AudioNode {
  const R = mode === 'clip' ? RADIO_CHAIN.clip : RADIO_CHAIN.blip;
  let node = input;
  for (let i = 0; i < R.edgeStages; i++) node = node.connect(biquad(ctx, 'highpass', R.highpassHz, R.edgeQ));
  for (let i = 0; i < R.edgeStages; i++) node = node.connect(biquad(ctx, 'lowpass', R.lowpassHz, R.edgeQ));
  node = node.connect(biquad(ctx, 'peaking', R.presenceHz, R.presenceQ, R.presenceDb));
  if (mode === 'clip') {
    const C = RADIO_CHAIN.clip;
    // +6 dB into tanh: the shaper's input range is ±1 ↔ ±K, so scale the drive by 1/K
    node = node.connect(gain(ctx, db(C.driveDb) / SHAPER_K)).connect(softClip(ctx)).connect(gain(ctx, db(C.trimDb)));
  }
  return node;
}

function ringStage(ctx: BaseAudioContext, input: AudioNode, mode: ChainMode): AudioNode {
  const out = ctx.createGain();
  if (mode === 'clip') {
    const R = RING_CHAIN.clip;
    const hp = input.connect(biquad(ctx, 'highpass', R.highpassHz, R.highpassQ));
    hp.connect(gain(ctx, R.dry)).connect(out);
    // comb: band-pass → delay with a feedback loop → branch gain
    const d = ctx.createDelay(0.05);
    d.delayTime.value = R.comb.delayS;
    hp.connect(biquad(ctx, 'bandpass', R.comb.bandHz, R.comb.bandQ)).connect(d);
    d.connect(gain(ctx, R.comb.feedback)).connect(d);
    d.connect(gain(ctx, R.comb.gain)).connect(out);
    // slap: a short low-passed reflection
    const s = ctx.createDelay(0.1);
    s.delayTime.value = R.slap.delayS;
    hp.connect(biquad(ctx, 'lowpass', R.slap.lowpassHz, 0.707)).connect(s).connect(gain(ctx, R.slap.gain)).connect(out);
    return out.connect(biquad(ctx, 'peaking', R.presenceHz, R.presenceQ, R.presenceDb));
  }
  const R = RING_CHAIN.blip;
  input.connect(gain(ctx, R.dry)).connect(out);
  input.connect(biquad(ctx, 'bandpass', R.bandHz, R.bandQ)).connect(gain(ctx, R.band)).connect(out);
  const d = ctx.createDelay(0.05);
  d.delayTime.value = R.combDelayS;
  const damp = biquad(ctx, 'lowpass', R.combDampHz, 0.707);
  input.connect(d).connect(damp).connect(gain(ctx, R.combFeedback)).connect(d);
  damp.connect(gain(ctx, R.comb)).connect(out);
  return out;
}

function hallStage(ctx: BaseAudioContext, input: AudioNode): AudioNode {
  const H = HALL_CHAIN;
  const out = ctx.createGain();
  input.connect(gain(ctx, H.dry)).connect(out);
  const d = ctx.createDelay(1);
  d.delayTime.value = H.delayS;
  const lp = biquad(ctx, 'lowpass', H.lowpassHz, 0.707);
  input.connect(d).connect(lp).connect(gain(ctx, H.feedback)).connect(d);
  lp.connect(gain(ctx, H.wet)).connect(out);
  return out;
}

/**
 * The per-speaker character chain: input → [radio] → [brass ring] → [hall] → post → dest, in its
 * blip or clip variant. Long-lived (build once per speaker kind and mode).
 */
export function buildVoiceChain(ctx: BaseAudioContext, dest: AudioNode, fx: Fx, mode: ChainMode = 'blip'): VoiceChain {
  const input = ctx.createGain();
  let node: AudioNode = input;
  if (fx.radio) node = radioStage(ctx, node, mode);
  if (fx.ring) node = ringStage(ctx, node, mode);
  if (fx.hall) node = hallStage(ctx, node);
  const post = ctx.createGain();
  node.connect(post).connect(dest);
  return { input, post };
}

/** Loopable noise beds of the radio clip chain (4 s, seeded). */
export interface RadioBeds {
  /** Pink noise, peak-normalised to 1. */
  pink: AudioBuffer;
  /** Single-sample impulses of ±amplitude, ≈ perS per second. */
  crackle: AudioBuffer;
}

export function makeRadioBeds(ctx: BaseAudioContext): RadioBeds {
  const len = ctx.sampleRate * 4;
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const p = pink.getChannelData(0);
  // Paul Kellet's economy pink filter
  let b0 = 0, b1 = 0, b2 = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    const v = b0 + b1 + b2 + w * 0.1848;
    p[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < len; i++) p[i]! /= peak || 1;
  const C = RADIO_CHAIN.clip.crackle;
  const crackle = ctx.createBuffer(1, len, ctx.sampleRate);
  const c = crackle.getChannelData(0);
  const chance = C.perS / ctx.sampleRate;
  for (let i = 0; i < len; i++) if (rnd() < chance) c[i] = (rnd() < 0.5 ? -1 : 1) * C.amplitude;
  return { pink, crackle };
}

/** Hiss + crackle under a radio clip, into `dest` (the clip's noise gain). Returns the sources. */
function radioNoise(ctx: AudioContext, beds: RadioBeds, dest: AudioNode, seconds: number): AudioBufferSourceNode[] {
  const C = RADIO_CHAIN.clip;
  const t0 = ctx.currentTime;
  const hiss = ctx.createBufferSource();
  hiss.buffer = beds.pink;
  hiss.loop = true;
  hiss.connect(biquad(ctx, 'bandpass', C.hiss.bandHz, C.hiss.bandQ)).connect(gain(ctx, C.hiss.amplitude)).connect(dest);
  const crk = ctx.createBufferSource();
  crk.buffer = beds.crackle;
  crk.loop = true;
  crk.connect(biquad(ctx, 'bandpass', C.crackle.bandHz, C.crackle.bandQ)).connect(dest);
  for (const s of [hiss, crk]) {
    s.start(t0, Math.random() * 3);
    s.stop(t0 + seconds + 0.05);
  }
  return [hiss, crk];
}

/**
 * One recorded clip playing through a speaker chain. Pausing remembers the position (a new
 * source resumes from it); a suspended context simply freezes it. `stop()` fades out briefly.
 */
export class VoiceClip {
  private src: AudioBufferSourceNode | null = null;
  private noise: AudioBufferSourceNode[] = [];
  private out: GainNode | null = null;
  private noiseOut: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  state: 'playing' | 'paused' | 'ended' | 'stopped' = 'paused';

  constructor(
    private readonly ctx: AudioContext,
    readonly buffer: AudioBuffer,
    private readonly chain: VoiceChain,
    private readonly beds: RadioBeds | null,
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
    const out = gain(ctx, CLIP_GAIN);
    out.connect(this.chain.input);
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
    if (this.beds) {
      this.noiseOut = gain(ctx, CLIP_GAIN);
      this.noiseOut.connect(this.chain.post);
      this.noise = radioNoise(ctx, this.beds, this.noiseOut, this.buffer.duration - offset);
    }
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
    const src = this.src, noise = this.noise, out = this.out, noiseOut = this.noiseOut;
    this.src = this.out = this.noiseOut = null;
    this.noise = [];
    const t = this.ctx.currentTime;
    try {
      for (const g of [out, noiseOut]) {
        if (g && fade > 0) {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + fade);
        }
      }
      if (!ended) src?.stop(t + fade);
      for (const n of noise) n.stop(t + fade);
    } catch {
      /* already stopped */
    }
    const disconnect = () => {
      out?.disconnect();
      noiseOut?.disconnect();
    };
    if (src && !ended) src.addEventListener('ended', disconnect, { once: true });
    else disconnect();
  }
}

export class Voice {
  private readonly chains = new Map<string, VoiceChain>();
  private chainCtx: BaseAudioContext | null = null;
  private beds: RadioBeds | null = null;
  private last = 0;

  constructor(private readonly audio: AudioManager) {}

  /** The speaker's long-lived chain on the voice bus (null while audio is locked). */
  private chain(spec: Fx, mode: ChainMode): VoiceChain | null {
    const ctx = this.audio.ctx;
    const bus = this.audio.bus('voice') ?? this.audio.bus('sfx');
    if (!ctx || !bus) return null;
    if (this.chainCtx !== ctx) {
      this.chains.clear();
      this.beds = null;
      this.chainCtx = ctx;
    }
    const key = fxKey(spec, mode);
    let c = this.chains.get(key);
    if (!c) {
      c = buildVoiceChain(ctx, bus, spec, mode);
      this.chains.set(key, c);
    }
    return c;
  }

  /**
   * Start a recorded clip through the speaker's clip chain. Null when it cannot start now (audio
   * locked or the context suspended): the caller murmurs instead.
   */
  playClip(buffer: AudioBuffer, spec: VoiceSpec): VoiceClip | null {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const chain = this.chain(spec, 'clip');
    if (!chain) return null;
    if (spec.radio && !this.beds) this.beds = makeRadioBeds(ctx);
    const clip = new VoiceClip(ctx, buffer, chain, spec.radio ? this.beds : null);
    return clip.start() ? clip : null;
  }

  /** One syllable. `stress` 0..1 raises pitch/level a little (sentence starts, capitals). */
  blip(spec: VoiceSpec, stress = 0): void {
    const ctx = this.audio.ctx;
    const dest = this.chain(spec, 'blip')?.input;
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
    const crackle = RADIO_CHAIN.blip.crackle;
    if (spec.radio && Math.random() < crackle.chance) noiseBurst(this.audio, dest, { freq: crackle.bandHz, q: crackle.bandQ, duration: 0.03, gain: crackle.gain });
    if (spec.ring) {
      const r = ctx.createOscillator();
      r.type = 'sine';
      r.frequency.value = f * RING_CHAIN.blip.partialRatio;
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
