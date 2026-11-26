/**
 * Story sound cues, all synthesised (Web Audio): a distant howl, horn signals of the hunt, the radio
 * crackle, the brass ring of the compass, and the tour's dogs and deer.
 * Scripted cues can also present a German sound caption through the HUD.
 */
import type { AudioManager } from '../../audio/audio';
import { hornCall, noiseBurst, windLoop } from '../../audio/synth';
import type { GameContext } from '../../core/context';
import { bearingDeg } from './objectives';
import type { SoundAction } from './types';

export const STORY_SOUNDS = ['howl', 'horn', 'radio', 'beep', 'compass', 'frost', 'match', 'crowbar', 'wind', 'bark', 'deer-rustle'] as const;
export type StorySound = (typeof STORY_SOUNDS)[number];
export type HornSignal = 'anblasen' | 'faehrte' | 'verloren' | 'sammeln';

/** Play a scripted cue and present its caption even when the audio is muted or unavailable. */
export function playStorySoundAction(ctx: GameContext, { sound, x, z, caption, signal }: SoundAction): void {
  const source = x !== undefined && z !== undefined
    ? ctx.audio.createSource3D('sfx', { refDistance: 90, maxDistance: 4000, rolloff: 0.5 })
    : null;
  if (x !== undefined && z !== undefined) {
    if (source) source.setPosition(x, ctx.world.heightAt(x, z) + 3, z);
    if (sound === 'howl' || sound === 'horn') {
      const p = ctx.player.position;
      ctx.ui.hud.setMarker('story-sound', bearingDeg(p.x, p.z, x, z), '#b0402a');
      window.setTimeout(() => ctx.ui.hud.setMarker('story-sound', null), 6000);
    }
  }
  const duration = playStorySound(ctx.audio, sound, source?.input ?? null, signal);
  if (source) window.setTimeout(() => source.dispose(), (duration + 6) * 1000);
  if (caption && ctx.settings.state.subtitles !== false) ctx.ui.hud.subtitle(null, caption, Math.max(3500, duration * 1000 + 1500));
}

/** Horn signals as harmonic numbers of a natural D horn (bible 05-jagd: four signals). */
export const HORN_SIGNALS: Record<HornSignal, { notes: number[]; durations: number[] }> = {
  anblasen: { notes: [4], durations: [3.2] },
  faehrte: { notes: [4, 6, 4, 6, 8], durations: [0.3, 0.3, 0.3, 0.3, 1.1] },
  verloren: { notes: [8, 6, 5, 4], durations: [0.45, 0.45, 0.45, 1.6] },
  sammeln: { notes: [4, 5, 6, 8, 6, 8], durations: [0.32, 0.32, 0.32, 0.32, 0.32, 1.2] },
};

function osc(ctx: AudioContext, dest: AudioNode, type: OscillatorType, f: number, t: number, dur: number, gain: number, attack = 0.005): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** Play a cue. `dest` = a 3D source input for positional sounds, else the sfx bus. */
export function playStorySound(am: AudioManager, kind: StorySound, dest: AudioNode | null, signal: HornSignal = 'anblasen'): number {
  const ctx = am.ctx;
  const out = dest ?? am.bus('sfx');
  if (!ctx || !out) return 0;
  const t = ctx.currentTime + 0.02;
  switch (kind) {
    case 'howl': {
      // a single dog, far away: a sliding saw through a vowel formant, with a hall tail
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(330, t);
      o.frequency.linearRampToValueAtTime(560, t + 0.7);
      o.frequency.linearRampToValueAtTime(520, t + 2.2);
      o.frequency.exponentialRampToValueAtTime(300, t + 3.4);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.value = 7;
      vib.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.5);
      g.gain.setValueAtTime(0.2, t + 2.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      const d = ctx.createDelay(1.5);
      d.delayTime.value = 0.41;
      const fb = ctx.createGain();
      fb.gain.value = 0.45;
      o.connect(f).connect(g).connect(out);
      g.connect(d).connect(fb).connect(d);
      fb.connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 3.8);
      vib.stop(t + 3.8);
      setTimeout(() => {
        fb.disconnect();
        d.disconnect();
      }, 9000);
      return 4;
    }
    case 'horn': {
      const s = HORN_SIGNALS[signal];
      hornCall(am, out, { notes: s.notes, durations: s.durations, gain: 0.3 });
      return s.durations.reduce((a, b) => a + b, 0) + 0.6;
    }
    case 'radio': {
      // squelch + crackle
      noiseBurst(am, out, { duration: 0.22, freq: 1800, q: 0.7, gain: 0.16, type: 'bandpass' });
      for (let i = 0; i < 9; i++) noiseBurst(am, out, { duration: 0.03 + Math.random() * 0.05, freq: 1200 + Math.random() * 2400, q: 3, gain: 0.08 + Math.random() * 0.06, when: 0.2 + Math.random() * 0.8 });
      osc(ctx, out, 'square', 1750, t + 0.02, 0.12, 0.025);
      return 1.1;
    }
    case 'beep': {
      osc(ctx, out, 'sine', 1320, t, 0.12, 0.08);
      osc(ctx, out, 'sine', 1760, t + 0.16, 0.18, 0.07);
      return 0.4;
    }
    case 'compass': {
      // a brass lid ticking, then ringing partials (inharmonic, like a small bell)
      noiseBurst(am, out, { duration: 0.05, freq: 4200, q: 4, gain: 0.25 });
      noiseBurst(am, out, { duration: 0.04, freq: 3600, q: 4, gain: 0.18, when: 0.09 });
      for (const [f, g, d] of [
        [1180, 0.05, 1.8],
        [2950, 0.03, 1.2],
        [4630, 0.018, 0.8],
        [6720, 0.01, 0.5],
      ] as const)
        osc(ctx, out, 'sine', f, t + 0.1, d, g, 0.002);
      return 1.6;
    }
    case 'frost': {
      for (let i = 0; i < 26; i++) noiseBurst(am, out, { duration: 0.01 + Math.random() * 0.02, freq: 5000 + Math.random() * 5000, q: 6, gain: 0.04 + Math.random() * 0.05, when: Math.random() * 1.6 });
      return 1.8;
    }
    case 'crowbar': {
      // an iron bar driven under a sandstone block: a grinding scrape, a crack, the bar dropped on stone
      noiseBurst(am, out, { duration: 0.5, freq: 1400, q: 2.5, gain: 0.22, attack: 0.05 });
      noiseBurst(am, out, { duration: 0.08, freq: 900, q: 1, gain: 0.4, when: 0.55 });
      for (const [f, g, d, w] of [
        [820, 0.07, 0.9, 1.0],
        [2210, 0.04, 0.6, 1.0],
        [3960, 0.02, 0.4, 1.0],
        [760, 0.04, 0.5, 1.22],
        [2050, 0.025, 0.35, 1.22],
      ] as const)
        osc(ctx, out, 'triangle', f, t + w, d, g, 0.002);
      return 1.8;
    }
    case 'wind': {
      // the tour's gust (t5): the crowns roar for a few seconds, then it drops away
      const w = windLoop(am, out, 1);
      w.setIntensity(1, 1.2);
      window.setTimeout(() => w.setIntensity(0.35, 2), 5500);
      window.setTimeout(() => w.stop(2.5), 8000);
      return 9;
    }
    case 'bark': {
      // Bijou yaps first, then Diane answers from the trail with a lower bark.
      for (const [when, pitch] of [[0.02, 420], [0.24, 390], [0.82, 255], [1.16, 240], [1.51, 225]] as const) {
        noiseBurst(am, out, { duration: 0.12, freq: pitch * 2.6, q: 2.4, gain: 0.23, when });
        const voice = osc(ctx, out, 'sawtooth', pitch, t + when, 0.14, 0.07);
        voice.frequency.exponentialRampToValueAtTime(pitch * 0.72, t + when + 0.12);
      }
      return 1.7;
    }
    case 'deer-rustle': {
      // Light footfalls and a short shuffle through the leaf litter below the path.
      for (const [when, freq, gain] of [[0, 1900, 0.11], [0.16, 2800, 0.13], [0.39, 2200, 0.08]] as const) {
        noiseBurst(am, out, { when, duration: 0.19, freq, q: 0.9, gain });
        noiseBurst(am, out, { when, duration: 0.07, freq: 530, gain: gain * 0.6 });
      }
      return 0.58;
    }
    case 'match': {
      noiseBurst(am, out, { duration: 0.18, freq: 2600, q: 0.8, gain: 0.35, type: 'highpass' });
      noiseBurst(am, out, { duration: 0.9, freq: 600, q: 0.6, gain: 0.18, attack: 0.08, when: 0.12 });
      return 1;
    }
  }
}
