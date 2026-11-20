/**
 * The Fläschchen's sound (Web Audio, no samples; a no-op while audio is locked): a soft glass
 * clink, panned towards the bottle (pan −1 left … 1 right), quieter with distance.
 */
import type { AudioManager } from '../../audio/audio';

export function clink(am: AudioManager, pan = 0, level = 1): void {
  const ctx = am.ctx;
  const out = am.bus('sfx');
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + 0.02;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(out);
  // two light taps of glass on glass / stone: high partials, very short
  [0, 0.11].forEach((dt, k) => {
    for (const [f, lv] of [[2350, 1], [3720, 0.5], [5480, 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (k ? 1.035 : 1);
      const g = ctx.createGain();
      const t = t0 + dt;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 * level * lv * (k ? 0.6 : 1), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 0.35);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.4);
    }
  });
}
