/**
 * Procedural one-shots of the set dressing (Web Audio, no samples): the clink of iron on
 * sandstone for the stonebreakers, and the fireworks' thump, whistle, crackle and the distant
 * cannon roll. Every helper no-ops while the audio is locked.
 */
import type { AudioManager } from '../../audio/audio';

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
}

/** A hammer on stone at a 3D position (bright ping + gritty noise). */
export function clink(am: AudioManager, x: number, y: number, z: number, level = 0.5): void {
  const ctx = am.ctx;
  const noise = am.noise();
  if (!ctx || !noise) return;
  const src = am.createSource3D('sfx', { refDistance: 5, rolloff: 1.4 });
  if (!src) return;
  src.setPosition(x, y, z);
  const t = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(2300 + Math.random() * 500, t);
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.15);
  const og = ctx.createGain();
  env(og, t, 0.22 * level, 0.002, 0.16);
  o.connect(og).connect(src.input);
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  env(ng, t, 0.5 * level, 0.001, 0.07);
  n.connect(bp).connect(ng).connect(src.input);
  o.start(t);
  o.stop(t + 0.25);
  n.start(t, Math.random() * 3, 0.15);
  setTimeout(() => src.dispose(), 600);
}

/** Fireworks sounds, positioned; `kind` thump (launch), whistle, burst, crackle, cannon. */
export function fireworkSound(am: AudioManager, kind: 'launch' | 'burst' | 'crackle' | 'cannon', x: number, y: number, z: number, level = 1): void {
  const ctx = am.ctx;
  const noise = am.noise();
  if (!ctx || !noise) return;
  const src = am.createSource3D('sfx', { refDistance: 60, rolloff: 0.6 });
  if (!src) return;
  src.setPosition(x, y, z);
  const t = ctx.currentTime + 0.02;
  let dur = 1;
  if (kind === 'launch') {
    // a dull thump and a rising whistle
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    o.connect(g).connect(src.input);
    o.start(t);
    o.stop(t + 1.3);
    dur = 1.4;
  } else if (kind === 'burst' || kind === 'cannon') {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'cannon' ? 260 : 900;
    const g = ctx.createGain();
    env(g, t, (kind === 'cannon' ? 1.1 : 0.7) * level, 0.004, kind === 'cannon' ? 2.4 : 1.1);
    n.connect(lp).connect(g).connect(src.input);
    n.start(t, Math.random() * 2, 3);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'cannon' ? 55 : 90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const og = ctx.createGain();
    env(og, t, 0.6 * level, 0.003, 0.7);
    o.connect(og).connect(src.input);
    o.start(t);
    o.stop(t + 1);
    dur = kind === 'cannon' ? 3 : 1.6;
  } else {
    // crackle: a burst of tiny clicks
    for (let i = 0; i < 18; i++) {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      const g = ctx.createGain();
      const ti = t + Math.random() * 1.2;
      env(g, ti, 0.25 * level * Math.random(), 0.001, 0.03);
      n.connect(hp).connect(g).connect(src.input);
      n.start(ti, Math.random() * 3, 0.05);
    }
    dur = 1.6;
  }
  setTimeout(() => src.dispose(), (dur + 0.5) * 1000);
}
