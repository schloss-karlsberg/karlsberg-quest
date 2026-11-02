import type { AudioManager } from '../../audio/audio';

/**
 * Procedural unlock sound: a rubber stamp on paper (filtered noise thump) under a small brass
 * chime (two detuned partials, like the Bussole's ring). No-op until audio is unlocked.
 */
export function stampChime(am: AudioManager, tier: number): void {
  const ctx = am.ctx;
  const dest = am.bus('sfx');
  if (!ctx || !dest) return;
  const t0 = ctx.currentTime + 0.01;
  // thump
  const noise = am.noise();
  if (noise) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    src.connect(lp).connect(g).connect(dest);
    src.start(t0);
    src.stop(t0 + 0.2);
  }
  // chime: rises with the tier
  const base = 660 * Math.pow(2, (Math.max(1, tier) - 1) * (4 / 12));
  for (const [mul, gain, dur] of [
    [1, 0.16, 1.6],
    [2.76, 0.06, 0.9],
    [5.4, 0.025, 0.5],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(base * mul, t0 + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05 + dur);
    o.connect(g).connect(dest);
    o.start(t0 + 0.05);
    o.stop(t0 + 0.1 + dur);
  }
}
