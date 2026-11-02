import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { ScanMode } from '../../world/world';

/**
 * Starter system: relief scan modes (keys 0–3) and the 1840 map overlay (M).
 * Later the Relief-Blick / Kartograf skill gating can live here (check ctx.state.skills).
 */
function updateStatus(ctx: GameContext): void {
  const parts: string[] = [];
  if (ctx.world.scanMode > 0) parts.push(ctx.t(`scan.${ctx.world.scanMode}`));
  if (ctx.world.mapMix > 0) parts.push(ctx.t('map.on'));
  ctx.ui.hud.setStatus(parts.join(' · '));
}

export default defineSystem({
  id: 'survey',
  init(ctx) {
    ctx.events.on('era:change', () => updateStatus(ctx));
    ctx.events.on('scan:mode', () => updateStatus(ctx));
    updateStatus(ctx);
  },
  update(_dt, ctx) {
    const inp = ctx.input;
    let mode: ScanMode | null = null;
    if (inp.wasPressed('scan0')) mode = 0;
    if (inp.wasPressed('scan1')) mode = 1;
    if (inp.wasPressed('scan2')) mode = 2;
    if (inp.wasPressed('scan3')) mode = 3;
    if (mode !== null) {
      if (mode === ctx.world.scanMode) mode = 0; // pressing the active mode again turns it off
      ctx.world.setScanMode(mode, ctx.settings.state.reducedMotion);
      ctx.events.emit('scan:mode', { mode });
      ctx.ui.toast(ctx.t(`scan.${mode}`));
    }
    if (inp.wasPressed('map')) {
      const on = ctx.world.mapMix === 0;
      ctx.world.setMapMix(on ? 0.85 : 0, ctx.settings.state.reducedMotion);
      ctx.ui.toast(ctx.t(on ? 'map.on' : 'map.off'));
      updateStatus(ctx);
    }
  },
});
