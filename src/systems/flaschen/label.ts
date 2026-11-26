/**
 * THE label of the Fläschchen: ONE CanvasTexture and ONE material, drawn from
 * content/collectibles/flaschen.json → `label.lines` (the single switch; docs/IDEAS-ROUND11.md §4.1).
 * Plain text in the game's own font on cream paper — no logo artwork, no emblem, no copied layout or
 * colours. Nothing else in the code holds the text: the collection display shows this same canvas.
 */
import { CanvasTexture, type ShaderMaterial, SRGBColorSpace } from 'three';
import { flaschenMaterial } from './shader';
import data from '../../../content/collectibles/flaschen.json';

export interface LabelData {
  lines: string[];
  placeholder?: boolean;
}

/** The label lines from the switch file (any two short lines work). */
export function labelLines(): string[] {
  const l = (data as { label?: LabelData }).label;
  return Array.isArray(l?.lines) ? l.lines.slice(0, 3).map(String) : [];
}

const W = 256;
const H = 128;
let canvas: HTMLCanvasElement | null = null;
let texture: CanvasTexture | null = null;
let material: ShaderMaterial | null = null;

function draw(c: HTMLCanvasElement): void {
  const g = c.getContext('2d');
  if (!g) return;
  // cream paper, a little foxed at the edges
  g.fillStyle = '#efe4c8';
  g.fillRect(0, 0, W, H);
  const grd = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(110,80,40,0.28)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(60,40,20,0.55)';
  g.lineWidth = 2;
  g.strokeRect(6, 6, W - 12, H - 12);
  const lines = labelLines();
  g.fillStyle = '#2a2118';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = Math.max(1, lines.length);
  lines.forEach((line, i) => {
    let size = i === 0 ? 40 : 30;
    g.font = `600 ${size}px "IM Fell English", Georgia, serif`;
    // long lines shrink to fit
    while (size > 12 && g.measureText(line).width > W - 28) {
      size -= 2;
      g.font = `600 ${size}px "IM Fell English", Georgia, serif`;
    }
    g.fillText(line, W / 2, (H * (i + 0.5)) / n + (n === 1 ? 0 : (i === 0 ? 6 : -6)));
  });
}

/** The one label canvas (also used in Sammlungen). */
export function labelCanvas(): HTMLCanvasElement {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  draw(canvas);
  // the game font may still be loading: draw again once it is there
  void document.fonts?.ready.then(() => {
    if (!canvas) return;
    draw(canvas);
    if (texture) texture.needsUpdate = true;
  });
  return canvas;
}

/** The one label material (every bottle shares it). */
export function labelMaterial(): ShaderMaterial {
  if (material) return material;
  texture = new CanvasTexture(labelCanvas());
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  material = flaschenMaterial({ map: texture, self: 0.12 });
  return material;
}

export function disposeLabel(): void {
  material?.dispose();
  texture?.dispose();
  material = null;
  texture = null;
}
