import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { PostFX } from './post';

/** Keep the canvas, offscreen targets and camera in sync, including when the loop is parked. */
export function bindViewport(
  renderer: WebGLRenderer, post: PostFX, camera: PerspectiveCamera,
  pixelRatio: () => number, requestRender: () => void,
): () => void {
  let width = 0;
  let height = 0;
  let ratio = 0;
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = pixelRatio();
    if (w === width && h === height && dpr === ratio) return;
    renderer.setDrawingBufferSize(w, h, dpr);
    post.setSize(w, h, dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    width = w;
    height = h;
    ratio = dpr;
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
