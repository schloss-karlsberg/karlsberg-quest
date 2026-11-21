import type { GameContext } from '../../core/context';

/**
 * Render the current view once more and read it back as a small JPEG data URL (no
 * `preserveDrawingBuffer` needed: the frame is drawn right before it is copied). Shared by the
 * F8 notes and the photo mode's album thumbnails. Null when the canvas cannot be read.
 */
export function captureView(ctx: Pick<GameContext, 'renderer' | 'post' | 'scene' | 'camera' | 'loop'>, width: number, quality: number): string | null {
  const { renderer, post, scene, camera, loop } = ctx;
  try {
    post.render(renderer, scene, camera, loop.time);
    const src = renderer.domElement;
    if (!src.width || !src.height) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.max(1, Math.round((width * src.height) / src.width));
    const g = c.getContext('2d');
    if (!g) return null;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn('[capture] screenshot failed', err);
    return null;
  }
}
