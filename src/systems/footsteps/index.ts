import { footstep } from '../../audio/synth';
import { defineSystem } from '../../core/systems';

/** Starter system: synthesised footsteps per surface (listens to 'player:step'). */
export default defineSystem({
  id: 'footsteps',
  init(ctx) {
    ctx.events.on('player:step', ({ surface, running }) => {
      if (!ctx.audio.unlocked) return;
      const quiet = ctx.player.stance === 'stand' ? 1 : ctx.player.stance === 'crouch' ? 0.5 : 0.3;
      const bus = ctx.audio.bus('sfx');
      if (!bus || !ctx.audio.ctx) return;
      const g = ctx.audio.ctx.createGain();
      g.gain.value = quiet;
      g.connect(bus);
      footstep(ctx.audio, g, surface, running);
      setTimeout(() => g.disconnect(), 800);
    });
  },
});
