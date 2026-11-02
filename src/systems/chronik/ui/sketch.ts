/**
 * Etched field-book sketches drawn on a canvas: the real LiDAR terrain around a find ("Lageskizze")
 * and synthetic relief patterns for the Reliefmuster cards. Hillshade from several directions,
 * local-relief tint and 1 m contours, in ink-on-paper tones.
 */

export type HeightFn = (x: number, z: number) => number;

interface SketchOpts {
  px?: number;
  /** metres per side */
  size?: number;
  cross?: boolean;
  scaleBar?: number;
  north?: boolean;
  contour?: number;
  /** label under the scale bar */
  scaleLabel?: string;
}

const PAPER = [236, 224, 196];
const INK = [52, 38, 24];
const SEPIA = [120, 78, 40];

// Sketches are costly (thousands of height samples + several passes) and the board re-renders
// often, so finished sketches are kept and copied.
const sketches = new WeakMap<HeightFn, Map<string, HTMLCanvasElement>>();
const patterns = new Map<string, HTMLCanvasElement>();
const MAX_CACHED = 64;

function remember(m: Map<string, HTMLCanvasElement>, key: string, canvas: HTMLCanvasElement): void {
  if (m.size >= MAX_CACHED) m.delete(m.keys().next().value!);
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d')?.drawImage(canvas, 0, 0);
  m.set(key, copy);
}

function blit(canvas: HTMLCanvasElement, src: HTMLCanvasElement): void {
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.getContext('2d')?.drawImage(src, 0, 0);
}

/** Etched relief sketch of the terrain around (cx, cz), cached per height function + view. */
export function drawRelief(canvas: HTMLCanvasElement, h: HeightFn, cx: number, cz: number, o: SketchOpts = {}): void {
  let m = sketches.get(h);
  if (!m) sketches.set(h, (m = new Map()));
  const key = `${cx.toFixed(1)},${cz.toFixed(1)},${JSON.stringify(o)}`;
  const hit = m.get(key);
  if (hit) return blit(canvas, hit);
  renderRelief(canvas, h, cx, cz, o);
  remember(m, key, canvas);
}

function renderRelief(canvas: HTMLCanvasElement, h: HeightFn, cx: number, cz: number, o: SketchOpts = {}): void {
  const px = o.px ?? 240;
  const size = o.size ?? 70;
  canvas.width = px;
  canvas.height = px;
  const g = canvas.getContext('2d');
  if (!g) return;
  const n = Math.min(px, 160);
  const step = size / n;
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) H[j * n + i] = h(cx - size / 2 + (i + 0.5) * step, cz - size / 2 + (j + 0.5) * step);
  // local relief: height minus a blurred copy (≈ 9 m kernel)
  const blur = boxBlur(H, n, Math.max(2, Math.round(9 / step)));
  const img = g.createImageData(n, n);
  const lights = [
    [315, 45],
    [45, 35],
    [225, 30],
  ];
  const at = (i: number, j: number) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
  const zf = 2.2;
  const cont = o.contour ?? 1;
  const S = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const dzdx = ((at(i + 1, j) - at(i - 1, j)) / (2 * step)) * zf;
      const dzdy = ((at(i, j + 1) - at(i, j - 1)) / (2 * step)) * zf;
      let shade = 0;
      for (const [az, el] of lights) {
        const a = (az! * Math.PI) / 180;
        const e = (el! * Math.PI) / 180;
        const lx = Math.sin(a) * Math.cos(e);
        const ly = -Math.cos(a) * Math.cos(e);
        const lz = Math.sin(e);
        const len = Math.hypot(dzdx, dzdy, 1);
        shade += Math.max(0, (-dzdx * lx - dzdy * ly + lz) / len);
      }
      S[j * n + i] = shade / lights.length;
    }
  // stretch the contrast (flat sites would otherwise be a blank page)
  const sorted = Float32Array.from(S).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)]!;
  const hi = sorted[Math.floor(sorted.length * 0.98)]!;
  const span = Math.max(0.04, hi - lo);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = H[j * n + i]!;
      const lr = Math.max(-1, Math.min(1, (v - blur[j * n + i]!) / 0.6));
      const c0 = Math.floor(v / cont);
      const cr = Math.floor(at(i + 1, j) / cont) !== c0 || Math.floor(at(i, j + 1) / cont) !== c0;
      const major = cr && Math.floor(v / (cont * 5)) !== Math.floor(at(i + 1, j) / (cont * 5));
      const sv = 0.18 + 0.82 * Math.max(0, Math.min(1, (S[j * n + i]! - lo) / span));
      const k = Math.pow(sv, 1.25);
      let r = INK[0]! + (PAPER[0]! - INK[0]!) * k;
      let gg = INK[1]! + (PAPER[1]! - INK[1]!) * k;
      let b = INK[2]! + (PAPER[2]! - INK[2]!) * k;
      // highs warm, lows cool-dark (a whisper of the scan's local relief)
      r += lr * 16;
      gg += lr * 4;
      b -= lr * 14;
      if (cr) {
        const m = major ? 0.5 : 0.75;
        r = r * m + SEPIA[0]! * (1 - m);
        gg = gg * m + SEPIA[1]! * (1 - m);
        b = b * m + SEPIA[2]! * (1 - m);
      }
      const p = (j * n + i) * 4;
      img.data[p] = r;
      img.data[p + 1] = gg;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  // scale the n×n image up to the canvas
  const tmp = document.createElement('canvas');
  tmp.width = n;
  tmp.height = n;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, px, px);
  // engraving hatch + vignette
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = 'rgba(80,60,35,0.08)';
  g.lineWidth = 1;
  for (let d = -px; d < px * 2; d += 4) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d - px, px);
    g.stroke();
  }
  const vg = g.createRadialGradient(px / 2, px / 2, px * 0.3, px / 2, px / 2, px * 0.75);
  vg.addColorStop(0, 'rgba(255,255,255,0)');
  vg.addColorStop(1, 'rgba(110,80,40,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'source-over';
  // red cross at the find
  if (o.cross !== false) {
    g.strokeStyle = 'rgba(150,40,25,0.95)';
    g.lineWidth = 2.2;
    const c = px / 2;
    g.beginPath();
    g.moveTo(c - 9, c - 9);
    g.lineTo(c + 9, c + 9);
    g.moveTo(c + 9, c - 9);
    g.lineTo(c - 9, c + 9);
    g.stroke();
    g.beginPath();
    g.arc(c, c, 15, 0, Math.PI * 2);
    g.lineWidth = 1;
    g.stroke();
  }
  g.fillStyle = 'rgba(42,33,24,0.9)';
  g.strokeStyle = 'rgba(42,33,24,0.9)';
  if (o.north !== false) {
    g.beginPath();
    g.moveTo(px - 18, 12);
    g.lineTo(px - 24, 30);
    g.lineTo(px - 18, 26);
    g.lineTo(px - 12, 30);
    g.closePath();
    g.fill();
    g.font = '13px "IM Fell English SC", serif';
    g.textAlign = 'center';
    g.fillText('N', px - 18, 44);
  }
  if (o.scaleBar) {
    const len = (o.scaleBar / size) * px;
    const y = px - 14;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(12, y);
    g.lineTo(12 + len, y);
    g.moveTo(12, y - 4);
    g.lineTo(12, y + 4);
    g.moveTo(12 + len, y - 4);
    g.lineTo(12 + len, y + 4);
    g.stroke();
    g.fillRect(12, y - 2, len / 2, 4);
    g.font = '12px "IM Fell English", serif';
    g.textAlign = 'left';
    g.fillText(o.scaleLabel ?? `${o.scaleBar} m`, 12, y - 7);
  }
}

function boxBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let j = 0; j < n; j++) {
    let acc = 0;
    let cnt = 0;
    for (let i = -r; i < n + r; i++) {
      if (i + r < n && i + r >= 0) {
        acc += src[j * n + Math.min(n - 1, i + r)]!;
        cnt++;
      }
      if (i - r - 1 >= 0) {
        acc -= src[j * n + i - r - 1]!;
        cnt--;
      }
      if (i >= 0 && i < n) tmp[j * n + i] = acc / Math.max(1, cnt);
    }
  }
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let cnt = 0;
    for (let j = -r; j < n + r; j++) {
      if (j + r < n && j + r >= 0) {
        acc += tmp[Math.min(n - 1, j + r) * n + i]!;
        cnt++;
      }
      if (j - r - 1 >= 0) {
        acc -= tmp[(j - r - 1) * n + i]!;
        cnt--;
      }
      if (j >= 0 && j < n) out[j * n + i] = acc / Math.max(1, cnt);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// synthetic relief patterns (Reliefmuster cards)

const noise = (x: number, z: number) => 0.12 * Math.sin(x * 0.7 + Math.sin(z * 0.31) * 2) * Math.cos(z * 0.53 + x * 0.11) + 0.06 * Math.sin(x * 1.9 + z * 1.3);

/** Height function for a relief pattern, chosen by keywords in the card title / id. */
export function patternHeight(key: string): HeightFn {
  const k = key.toLowerCase();
  const slope = (x: number, z: number) => 0.18 * x + 0.05 * z + noise(x, z);
  if (/eiskeller|ringwall|grube/.test(k))
    return (x, z) => {
      const r = Math.hypot(x, z);
      return slope(x, z) * 0.4 - 1.8 * Math.exp(-((r / 4.2) ** 2)) + 0.55 * Math.exp(-(((r - 6.8) / 1.6) ** 2));
    };
  if (/meiler|kohl/.test(k))
    return (x, z) => {
      const r = Math.hypot(x, z);
      const base = slope(x, z) * 1.6;
      const w = 1 / (1 + Math.exp((r - 6) * 1.6));
      return base * (1 - w) + w * (0.4 + noise(x, z) * 0.2);
    };
  if (/hohlweg/.test(k))
    return (x, z) => {
      let h = slope(x, z) * 0.8;
      for (const [o, d] of [
        [0, 2.6],
        [4.5, 1.2],
      ] as const)
        h -= d * Math.exp(-(((x - o - 2.2 * Math.sin(z / 9)) / 1.8) ** 2));
      return h;
    };
  if (/ausbruch/.test(k))
    return (x, z) => {
      const dx = Math.abs(x) - 11;
      const dz = Math.abs(z) - 5.5;
      const d = Math.abs(Math.max(dx, dz));
      return noise(x, z) * 0.6 - 0.9 * Math.exp(-((d / 0.8) ** 2)) + (dx < 0 && dz < 0 ? 0.15 : 0);
    };
  if (/bomb|trichter/.test(k))
    return (x, z) => {
      let h = slope(x, z) * 0.5;
      for (const [cx, cz, s] of [
        [-8, -6, 1],
        [3, -9, 0.8],
        [6, 4, 1.15],
        [-4, 9, 0.7],
        [12, -2, 0.6],
      ] as const) {
        const r = Math.hypot(x - cx, z - cz) / s + 0.4 * Math.sin(Math.atan2(z - cz, x - cx) * 3 + cx);
        h += s * (-1.5 * Math.exp(-((r / 2.4) ** 2)) + 0.5 * Math.exp(-(((r - 3.6) / 1.1) ** 2)));
      }
      return h;
    };
  if (/fundament|mauer/.test(k))
    return (x, z) => {
      const ring = (w: number, d: number, cx: number, cz: number) => {
        const dx = Math.abs(x - cx) - w;
        const dz = Math.abs(z - cz) - d;
        return Math.exp(-((Math.abs(Math.max(dx, dz)) / 0.55) ** 2));
      };
      return slope(x, z) * 0.3 + 0.45 * Math.max(ring(8, 5, -3, -2), ring(4, 4, 9, 7));
    };
  if (/weiher|damm/.test(k))
    return (x, z) => {
      const valley = 0.035 * x * x + 0.12 * (z + 15) + (z < 4.5 ? 0 : noise(x, z));
      const level = 2.2;
      const filled = z < 4.5 ? Math.max(valley, level) : valley;
      return filled + 2.0 * Math.exp(-(((z - 5) / 1.3) ** 2)) * (Math.abs(x) < 15 ? 1 : 0.3);
    };
  if (/terrasse|planie|ehrenhof/.test(k))
    return (x, z) => {
      const soft = 1 / (1 + Math.exp(Math.max(Math.abs(x) - 12, Math.abs(z) - 8) * 2.2));
      return slope(x, z) * 1.8 * (1 - soft) + soft * 0.5;
    };
  return (x, z) => slope(x, z) + 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.25);
}

export function drawPattern(canvas: HTMLCanvasElement, key: string, px = 200): void {
  const k = `${key}|${px}`;
  const hit = patterns.get(k);
  if (hit) return blit(canvas, hit);
  renderRelief(canvas, patternHeight(key), 0, 0, { px, size: 40, cross: false, north: false, contour: 0.5, scaleBar: 10 });
  remember(patterns, k, canvas);
}
