import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Texture strips → texture arrays. The asset pipeline (`pnpm assets:strip`) stacks square tiling
 * maps into one tall WebP (layer k = rows k·size … (k+1)·size); the loader fetches it like any
 * texture (byte progress, licence record), and this turns its image into a mipmapped
 * `DataArrayTexture`, so a shader picks a layer by index (terrain splatting, bark sets).
 * The 2D texture the loader made is never uploaded (nothing samples it).
 */
export function stripToArray(tex: Texture, layers: number, colour: 'srgb' | 'linear', anisotropy = 8): DataArrayTexture {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const w = img.width;
  const h = img.height;
  const size = Math.round(h / layers);
  if (size !== w || size * layers !== h) throw new Error(`[strips] ${tex.name}: ${w}×${h} is not ${layers} square layers`);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' } as CanvasRenderingContext2DSettings);
  if (!g) throw new Error('[strips] no 2D canvas');
  g.drawImage(img, 0, 0);
  const data = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
  canvas.width = canvas.height = 1;
  const arr = new DataArrayTexture(data, w, size, layers);
  arr.wrapS = arr.wrapT = RepeatWrapping;
  arr.magFilter = LinearFilter;
  arr.minFilter = LinearMipmapLinearFilter;
  arr.generateMipmaps = true;
  arr.anisotropy = anisotropy;
  arr.colorSpace = colour === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
  arr.flipY = false;
  arr.name = `${tex.name}[array]`;
  arr.needsUpdate = true;
  return arr;
}

/** Ground set layers (public/assets/textures/nature/ground_*.webp), in strip order. */
export const GROUND_LAYERS = ['litter', 'forestfloor', 'grass', 'gravel', 'rock', 'snow', 'mud', 'burnt'] as const;
/** World size (m) of one tile of each ground layer (from the source scans, slightly enlarged). */
export const GROUND_TILE_M = [2.6, 3.2, 2.4, 2.4, 2.4, 3.0, 3.0, 2.0];
/** Bark set layers (bark_*.webp): beech, oak, spruce. */
export const BARK_LAYERS = ['beech', 'oak', 'spruce'] as const;
