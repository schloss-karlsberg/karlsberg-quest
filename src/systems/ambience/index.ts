import { type Loop, chirp, drone, windLoop } from '../../audio/synth';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';

/**
 * Starter system: era ambience. Wind everywhere (stronger on hill tops and in spirit view),
 * birds by day, a low dread drone at night. Reference for audio + era events.
 */
let wind: Loop | null = null;
let dread: Loop | null = null;
let birdTimer = 3;

function target(ctx: GameContext) {
  const night = ctx.era.info.night;
  const p = ctx.player.position;
  const agl = p.y - ctx.world.heightAt(p.x, p.z);
  const hill = Math.min(1, Math.max(0, (p.y - 300) / 60));
  return {
    wind: Math.min(1, 0.28 + hill * 0.25 + (ctx.player.flying ? Math.min(0.5, agl / 200) : 0) + (night ? 0.1 : 0)),
    dread: night ? 0.7 : ctx.era.current === '1796' ? 0.3 : 0,
  };
}

export default defineSystem({
  id: 'ambience',
  init(ctx) {
    ctx.audio.onUnlock(() => {
      wind = windLoop(ctx.audio, ctx.audio.bus('ambience'), 0.3);
      dread = drone(ctx.audio, ctx.audio.bus('ambience'), 49);
      const tg = target(ctx);
      wind.setIntensity(tg.wind, 3);
      dread.setIntensity(tg.dread, 3);
    });
  },
  update(dt, ctx) {
    if (!ctx.audio.unlocked) return;
    const tg = target(ctx);
    wind?.setIntensity(tg.wind);
    dread?.setIntensity(tg.dread);
    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 2 + Math.random() * 7;
      const day = !ctx.era.info.night && ctx.era.current !== '1796';
      if (day && !ctx.player.flying) {
        const src = ctx.audio.createSource3D('ambience', { refDistance: 8 });
        if (src) {
          const a = Math.random() * Math.PI * 2;
          const p = ctx.player.position;
          src.setPosition(p.x + Math.cos(a) * 25, p.y + 8, p.z + Math.sin(a) * 25);
          chirp(ctx.audio, src.input, { base: 2600 + Math.random() * 2200, count: 2 + Math.floor(Math.random() * 4), gain: 0.04 });
          setTimeout(() => src.dispose(), 2000);
        }
      }
    }
  },
  dispose() {
    wind?.stop();
    dread?.stop();
  },
});
