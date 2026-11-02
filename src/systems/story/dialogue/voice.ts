/**
 * Procedural "voice murmur": one tiny formant blip per syllable while a line types (no TTS, no
 * recordings). Laub rings like brass, Marlene comes through a band-limited radio with crackle,
 * memories sound from a distant hall.
 */
import type { AudioManager } from '../../../audio/audio';
import { noiseBurst } from '../../../audio/synth';
import type { VoiceSpec } from './speakers';

export class Voice {
  private hallIn: GainNode | null = null;
  private last = 0;

  constructor(private readonly audio: AudioManager) {}

  private hall(ctx: AudioContext, dest: AudioNode): GainNode {
    if (this.hallIn) return this.hallIn;
    const input = ctx.createGain();
    const d1 = ctx.createDelay(1);
    d1.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    input.connect(dest);
    input.connect(d1).connect(lp).connect(fb).connect(d1);
    lp.connect(wet).connect(dest);
    this.hallIn = input;
    return input;
  }

  /** One syllable. `stress` 0..1 raises pitch/level a little (sentence starts, capitals). */
  blip(spec: VoiceSpec, stress = 0): void {
    const ctx = this.audio.ctx;
    const bus = this.audio.bus('sfx');
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    if (now - this.last < 0.045) return; // never machine-gun
    this.last = now;
    const dest = spec.hall ? this.hall(ctx, bus) : bus;
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
    let chain: AudioNode = osc.connect(f1).connect(g);
    if (spec.radio) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 480;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      chain = chain.connect(hp).connect(lp);
      if (Math.random() < 0.25) noiseBurst(this.audio, dest, { freq: 3200, q: 0.7, duration: 0.03, gain: 0.02 });
    }
    chain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    if (spec.ring) {
      const r = ctx.createOscillator();
      r.type = 'sine';
      r.frequency.value = f * 4.17;
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
