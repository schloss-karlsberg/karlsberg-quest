import { SRGBColorSpace, type Texture, TextureLoader } from 'three';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { ScanMode } from '../../world/world';
import { type MapLayer, gateFrom, mapLayers, nextMap, scanAllowed } from '../skills/logic';

/**
 * Survey: relief scan modes (keys 0–3) and the historic map overlay (M), gated by the skills
 * (rules in ../skills/logic.ts):
 *   Relief-Blick n opens scan mode n; Kartograf 1 the 1836–41 map, Kartograf 2 the 1935–40
 *   Messtischblatt (M cycles off → 1840 → 1935 → off). Without a running story everything is open
 *   (free survey, see logic.ts). Locked keys leave a short field-book note instead.
 * Debug: window.kq.survey.map(0|1840|1935), .state().
 */
/** Radius (m) of the relief scan around the player; trees inside it are hidden (ground points only). */
export const SCAN_RADIUS = 160;

export interface SurveyHooks {
  /** Show a map layer (no gating): 0 off, 1840, 1935. */
  map(layer: MapLayer, instant?: boolean): void;
  state(): { scan: number; map: MapLayer; mix: number };
}
declare module '../../debug/hooks' {
  interface KqHooks {
    survey?: SurveyHooks;
  }
}

let mapLayer: MapLayer = 0;
let surveyHooks: SurveyHooks | null = null;
const textures: Partial<Record<1840 | 1935, Texture>> = {};

function updateStatus(ctx: GameContext): void {
  const parts: string[] = [];
  if (ctx.world.scanMode > 0) parts.push(ctx.t(`scan.${ctx.world.scanMode}`));
  if (ctx.world.mapMix > 0) parts.push(mapLayer === 1935 ? ctx.t('map.status.1935') : ctx.t('map.status.1840'));
  ctx.ui.hud.setStatus(parts.join(' · '));
}

/** Put a map layer on the terrain: 1840 is the world's own texture, 1935 is loaded here once. */
function showMap(ctx: GameContext, layer: MapLayer, instant: boolean): void {
  const u = ctx.world.terrain.uniforms;
  if (layer === 0) {
    ctx.world.setMapMix(0, instant);
  } else {
    // first use: the world loads its 1840 texture into uMap; remember it before swapping
    ctx.world.setMapMix(0.85, instant);
    if (!textures[1840] && u.uMap!.value && mapLayer !== 1935) textures[1840] = u.uMap!.value as Texture;
    if (layer === 1935) {
      const meta = ctx.data.meta.hist1935;
      if (!textures[1935] && meta) {
        const tex = new TextureLoader().load(`${ctx.data.baseUrl}${meta.path}`);
        tex.colorSpace = SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 4;
        textures[1935] = tex;
      }
      if (textures[1935]) u.uMap!.value = textures[1935];
    } else if (textures[1840]) {
      u.uMap!.value = textures[1840];
    }
  }
  mapLayer = layer;
  updateStatus(ctx);
}

/** Is this map layer open by the skills (Kartograf 1 → 1840, 2 → 1935)? */
function scanMapAllowed(ctx: GameContext, layer: 1840 | 1935): boolean {
  return mapLayers(gateFrom(ctx.state.state, ctx.params)).includes(layer);
}

export default defineSystem({
  id: 'survey',
  init(ctx) {
    mapLayer = 0;
    ctx.events.on('era:change', () => updateStatus(ctx));
    ctx.events.on('scan:mode', () => updateStatus(ctx));
    ctx.events.on('survey:show-map', ({ layer }) => {
      const next: MapLayer = layer;
      if (next !== 0 && !scanMapAllowed(ctx, next)) {
        ctx.ui.toast(ctx.t('skills.locked.map'));
        return;
      }
      showMap(ctx, next, ctx.settings.state.reducedMotion);
      ctx.ui.toast(ctx.t(next === 0 ? 'map.off' : `map.${next}`));
    });
    updateStatus(ctx);
    surveyHooks = {
      map: (layer, instant = true) => showMap(ctx, layer, instant),
      state: () => ({ scan: ctx.world.scanMode, map: ctx.world.mapMix > 0 ? mapLayer : 0, mix: ctx.world.mapMix }),
    };
  },
  update(_dt, ctx) {
    const inp = ctx.input;
    let mode: ScanMode | null = null;
    if (inp.wasPressed('scan0')) mode = 0;
    if (inp.wasPressed('scan1')) mode = 1;
    if (inp.wasPressed('scan2')) mode = 2;
    if (inp.wasPressed('scan3')) mode = 3;
    if (mode !== null) {
      const gate = gateFrom(ctx.state.state, ctx.params);
      if (!scanAllowed(mode, gate)) {
        ctx.ui.toast(ctx.t('skills.locked.scan', { n: mode }));
      } else {
        if (mode === ctx.world.scanMode) mode = 0; // pressing the active mode again turns it off
        ctx.world.setScanMode(mode, ctx.settings.state.reducedMotion);
        ctx.events.emit('scan:mode', { mode });
        ctx.ui.toast(ctx.t(`scan.${mode}`));
      }
    }
    // with the travel system M opens its map page; the overlays are buttons there (`survey:show-map`)
    if (inp.wasPressed('map') && !ctx.systems.get('travel')) {
      const current: MapLayer = ctx.world.mapMix > 0 ? mapLayer || 1840 : 0;
      const next = nextMap(current, gateFrom(ctx.state.state, ctx.params));
      if (next === null) {
        ctx.ui.toast(ctx.t('skills.locked.map'));
      } else {
        showMap(ctx, next, ctx.settings.state.reducedMotion);
        ctx.ui.toast(ctx.t(next === 0 ? 'map.off' : `map.${next}`));
      }
    }
  },
  frame(_dt, ctx) {
    // window.kq exists only after every system's init
    if (surveyHooks && typeof window !== 'undefined' && window.kq && window.kq.survey !== surveyHooks) window.kq.survey = surveyHooks;
    // the scan bubble follows the player (debug flag ?scanall shows the whole map)
    const p = ctx.player.position;
    ctx.world.setScanArea(p.x, p.z, ctx.params.has('scanall') ? 1e6 : SCAN_RADIUS);
  },
});
