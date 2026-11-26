import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { PostFX } from './post';

/** Keep the canvas, offscreen targets and camera in sync, including when the loop is parked. */
export function bindViewport(
  renderer: WebGLRenderer, post: PostFX, camera: PerspectiveCamera,
  pixelRatio: () => number, requestRender: () => void,
): () => void {
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;
    const ratio = pixelRatio();
    if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-3) renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };
  // Moving the window to another display can change density without a CSS resize.
  const watchDensity = () => {
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      watchDensity();
      resize();
    }, { once: true });
  };
  watchDensity();
  window.addEventListener('resize', resize);
  resize();
  return resize;
}
