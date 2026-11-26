import type { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { ReflectionSchedule } from '../world/water';
import type { World } from '../world/world';
import type { PerfMonitor } from './perf';
import type { ShadowReuse } from './shadows';
import type { EnvLight } from './standard';

/** The renderer recreates its GL objects. Images drawn into them have to be rendered again. */
export function bindRenderContext(canvas: EventTarget, state: {
  env: EnvLight;
  shadows: ShadowReuse;
  reflections: ReflectionSchedule;
  perf: PerfMonitor;
  redraw: () => void;
}): void {
  canvas.addEventListener('webglcontextlost', () => state.perf.discardGpuQueries());
  canvas.addEventListener('webglcontextrestored', () => {
    state.env.invalidate();
    state.shadows.invalidate();
    state.reflections.invalidate();
    state.perf.enableGpuTimer(state.perf.gpuEnabled);
    state.perf.resetClock();
    state.redraw();
  });
}

export function renderWorldMaps(
  renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera,
  world: Pick<World, 'nature' | 'shadows' | 'water' | 'lookVersion'>, env: EnvLight,
  shadowFocus: Vector3, shadowDt: number,
): void {
  const shadowsDrawn = world.shadows.stats.drawn;
  world.shadows.update(renderer, scene, shadowFocus, shadowDt);
  world.water.renderReflection(renderer, scene, camera, world.shadows.stats.drawn !== shadowsDrawn);
  env.update(renderer, world.lookVersion);
}
