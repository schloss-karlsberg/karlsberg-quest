import type { GameContext } from '../../core/context';

type CaptureCtx = Pick<GameContext, 'renderer' | 'post' | 'scene' | 'camera' | 'loop'>;

/** A copy of `src` scaled to `width` (aspect kept, never wider than `src`). */
function scaledCopy(src: HTMLCanvasElement, width: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.min(src.width, Math.round(width)));
  c.height = Math.max(1, Math.round((c.width * src.height) / src.width));
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });

export interface CapturedBlobs {
  /** The view as a JPEG, at most `maxWidth` wide (never upscaled). */
  full: Blob;
  /** A small JPEG of the same picture for grids. */
  thumb: Blob;
  width: number;
  height: number;
}

/**
 * The current view as JPEG Blobs for the photo gallery (TASK-006): a full picture (at most
 * `maxWidth`, default 1920 px wide) and a thumbnail (default 320 px). The frame is drawn and copied
 * once, synchronously (no `preserveDrawingBuffer`); the JPEG encoding runs afterwards
 * (`canvas.toBlob`, off the main thread where the browser can). Null when the canvas cannot be read.
 */
export async function captureViewBlobs(
  ctx: CaptureCtx,
  o: { maxWidth?: number; thumbWidth?: number; quality?: number; thumbQuality?: number } = {},
): Promise<CapturedBlobs | null> {
  const { renderer, post, scene, camera, loop } = ctx;
  let full: HTMLCanvasElement | null;
  let thumb: HTMLCanvasElement | null;
  try {
    post.render(renderer, scene, camera, loop.time);
    const src = renderer.domElement;
    if (!src.width || !src.height) return null;
    full = scaledCopy(src, o.maxWidth ?? 1920);
    thumb = full && scaledCopy(full, o.thumbWidth ?? 320);
  } catch (err) {
    console.warn('[capture] screenshot failed', err);
    return null;
  }
  if (!full || !thumb) return null;
  const [a, b] = await Promise.all([toBlob(full, o.quality ?? 0.88), toBlob(thumb, o.thumbQuality ?? 0.75)]);
  if (!a || !b) return null;
  return { full: a, thumb: b, width: full.width, height: full.height };
}

/**
 * Render the current view once more and read it back as a small JPEG data URL (no
 * `preserveDrawingBuffer` needed: the frame is drawn right before it is copied). Shared by the
 * F8 notes and the photo mode's album thumbnails. Null when the canvas cannot be read.
 */
export function captureView(ctx: CaptureCtx, width: number, quality: number): string | null {
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
