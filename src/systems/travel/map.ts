/**
 * The field map (M, or the Journal's "Karte" tab): the 1836–41 survey sheet as the paper, the
 * palace footprints inked over it, Laub's survey points (brass tripods; the found ones can be
 * travelled to), the Fundstücke and caches seen so far, the goal (diamond) and you (red arrow).
 * Wheel zooms, dragging pans, a click on a point selects it, Enter / the button travels.
 */
import type { GameContext } from '../../core/context';
import type { Poi } from './pois';
import type { SurveyPoint } from './points';
import { TRAVEL_DE } from './strings';

export interface MapModel {
  known: SurveyPoint[];
  /** Points not found yet (drawn as a faint cross only when `hintUnknown`). */
  unknown: SurveyPoint[];
  pois: (Poi & { state: 'seen' | 'done' })[];
  player: { x: number; z: number; yaw: number };
  goal: { x: number; z: number; text?: string } | null;
  /** Why travel is not possible now (null: it is). */
  block: string | null;
  /** Map overlays the player may lay on the terrain (Kartograf). */
  layers: { id: 0 | 1840 | 1935; label: string; on: boolean }[];
}

export interface MapActions {
  travel(id: string): void;
  layer(id: 0 | 1840 | 1935): void;
}

const LAND = { x0: 150, z0: -2150, x1: 2300, z1: 500 };

let img: HTMLImageElement | null = null;
function mapImage(ctx: GameContext): HTMLImageElement {
  if (img) return img;
  img = new Image();
  img.src = `${ctx.data.baseUrl}${ctx.data.meta.hist1840.path}`;
  return img;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Fit a view (centre, metres per css pixel) round the points of interest. */
function fitView(m: MapModel, W: number, H: number): { cx: number; cz: number; mpp: number } {
  const xs = [m.player.x, ...m.known.map((p) => p.x)];
  const zs = [m.player.z, ...m.known.map((p) => p.z)];
  if (m.goal) {
    xs.push(m.goal.x);
    zs.push(m.goal.z);
  }
  const x0 = Math.min(...xs) - 120;
  const x1 = Math.max(...xs) + 120;
  const z0 = Math.min(...zs) - 120;
  const z1 = Math.max(...zs) + 120;
  const mpp = Math.max((x1 - x0) / W, (z1 - z0) / H, 1.2);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, mpp };
}

/** Builds the map page into `root` (modal body or journal tab); returns a cleanup. */
export function renderMap(ctx: GameContext, root: HTMLElement, model: () => MapModel, act: MapActions, compact = false): () => void {
  root.classList.add('kqt-map');
  if (compact) root.classList.add('kqt-map-compact');
  const wrap = el('div', 'kqt-map-wrap');
  const canvas = el('canvas', 'kqt-map-canvas');
  canvas.dataset.testid = 'travel-map-canvas';
  canvas.setAttribute('aria-label', TRAVEL_DE.mapAria);
  const side = el('div', 'kqt-map-side');
  wrap.append(canvas, side);
  root.append(wrap);
  const W = compact ? 520 : 640;
  const H = compact ? 420 : 520;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const g = canvas.getContext('2d');
  let m = model();
  let view = fitView(m, W, H);
  let selected: string | null = null;
  let raf = 0;
  let alive = true;

  const toPx = (x: number, z: number): [number, number] => [(x - view.cx) / view.mpp + W / 2, (z - view.cz) / view.mpp + H / 2];
  const toWorld = (px: number, py: number): [number, number] => [(px - W / 2) * view.mpp + view.cx, (py - H / 2) * view.mpp + view.cz];

  function draw(time: number): void {
    if (!g || !alive) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, 0, W, H);
    const im = mapImage(ctx);
    if (im.complete && im.naturalWidth) {
      // image px = (x − 150) / 2, (z + 2150) / 2 (2 m per pixel, aligned to the grid)
      const [ax, az] = toWorld(0, 0);
      const [bx, bz] = toWorld(W, H);
      const sx = (ax - LAND.x0) / 2;
      const sy = (az - LAND.z0) / 2;
      const sw = (bx - ax) / 2;
      const sh = (bz - az) / 2;
      g.globalAlpha = 0.92;
      g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    // paper wash and a vignette
    g.fillStyle = 'rgba(232, 214, 176, 0.22)';
    g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(60, 40, 20, 0)');
    vg.addColorStop(1, 'rgba(60, 40, 20, 0.35)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // the palace and its buildings, inked
    g.lineWidth = 1;
    for (const b of ctx.data.footprints.buildings) {
      const r = b.ring;
      if (!r.length) continue;
      g.beginPath();
      r.forEach(([x, z], i) => {
        const [px, py] = toPx(x, z);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.closePath();
      g.fillStyle = 'rgba(140, 47, 31, 0.16)';
      g.fill();
      g.strokeStyle = 'rgba(42, 33, 24, 0.7)';
      g.stroke();
    }
    // POIs seen
    for (const p of m.pois) {
      const [px, py] = toPx(p.x, p.z);
      if (px < -10 || py < -10 || px > W + 10 || py > H + 10) continue;
      g.save();
      g.translate(px, py);
      g.globalAlpha = p.state === 'done' ? 0.45 : 0.95;
      if (p.kind === 'shrine') {
        g.fillStyle = '#2f6f9a';
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(5, 4);
        g.lineTo(-5, 4);
        g.closePath();
        g.fill();
      } else if (p.kind === 'cache') {
        g.fillStyle = p.state === 'done' ? '#6b5a44' : '#b58b3d';
        g.fillRect(-5, -3, 10, 7);
        g.strokeStyle = '#2a2118';
        g.strokeRect(-5, -3, 10, 7);
      } else {
        g.strokeStyle = '#2a2118';
        g.fillStyle = '#f3ead6';
        g.fillRect(-4, -3, 8, 6);
        g.strokeRect(-4, -3, 8, 6);
      }
      g.restore();
    }
    // the goal
    if (m.goal) {
      const [px, py] = toPx(m.goal.x, m.goal.z);
      const s = 7 + Math.sin(time / 300) * 1.5;
      g.save();
      g.translate(Math.max(8, Math.min(W - 8, px)), Math.max(8, Math.min(H - 8, py)));
      g.rotate(Math.PI / 4);
      g.fillStyle = 'rgba(181, 139, 61, 0.9)';
      g.strokeStyle = '#2a2118';
      g.lineWidth = 1.5;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.strokeRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
    // unknown points: a faint survey cross
    g.strokeStyle = 'rgba(42, 33, 24, 0.35)';
    g.lineWidth = 1;
    for (const p of m.unknown) {
      const [px, py] = toPx(p.x, p.z);
      g.beginPath();
      g.moveTo(px - 4, py);
      g.lineTo(px + 4, py);
      g.moveTo(px, py - 4);
      g.lineTo(px, py + 4);
      g.stroke();
    }
    // the known survey points
    g.font = '600 13px "IM Fell English", Georgia, serif';
    g.textBaseline = 'middle';
    for (const p of m.known) {
      const [px, py] = toPx(p.x, p.z);
      const sel = p.id === selected;
      g.save();
      g.translate(px, py);
      if (sel) {
        g.strokeStyle = 'rgba(140, 47, 31, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, 13 + Math.sin(time / 200) * 1.5, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#b58b3d';
      g.strokeStyle = '#2a2118';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // tripod
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(-3.5, 4);
      g.moveTo(0, -4);
      g.lineTo(3.5, 4);
      g.moveTo(0, -4);
      g.lineTo(0, 4);
      g.stroke();
      const label = p.name;
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(243, 234, 214, 0.86)';
      g.fillRect(10, -9, tw + 8, 18);
      g.fillStyle = '#2a2118';
      g.fillText(label, 14, 0);
      g.restore();
    }
    // you
    const [ppx, ppy] = toPx(m.player.x, m.player.z);
    g.save();
    g.translate(Math.max(8, Math.min(W - 8, ppx)), Math.max(8, Math.min(H - 8, ppy)));
    // yaw 0 = north (−z = up on the map), clockwise
    g.rotate(m.player.yaw);
    g.fillStyle = '#8c2f1f';
    g.strokeStyle = '#f3ead6';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // a scale bar
    const bar = niceBar(view.mpp * 120);
    const bw = bar / view.mpp;
    g.fillStyle = 'rgba(243, 234, 214, 0.85)';
    g.fillRect(10, H - 30, bw + 60, 22);
    g.fillStyle = '#2a2118';
    g.fillRect(16, H - 18, bw, 3);
    g.font = '12px Georgia, serif';
    g.fillText(`${bar} m`, 22 + bw, H - 17);
    g.font = 'italic 12px Georgia, serif';
    g.fillText('N ↑', W - 34, 16);
  }

  // ≤ 30 redraws per second: the pulsing marks and panning need no more (120 Hz screens)
  let drawnAt = -1e9;
  function frame(t: number): void {
    if (t - drawnAt >= 1000 / 30 - 4) {
      drawnAt = t;
      draw(t);
    }
    raf = requestAnimationFrame(frame);
  }

  function renderSide(): void {
    side.textContent = '';
    side.append(el('p', 'kqt-map-hint', TRAVEL_DE.mapHint));
    if (m.block) {
      const b = el('p', 'kqt-map-block', m.block);
      b.dataset.testid = 'travel-block';
      side.append(b);
    }
    const list = el('ol', 'kqt-map-list');
    const byDist = [...m.known].sort((a, b) => Math.hypot(a.x - m.player.x, a.z - m.player.z) - Math.hypot(b.x - m.player.x, b.z - m.player.z));
    byDist.forEach((p, i) => {
      const li = el('li', p.id === selected ? 'sel' : undefined);
      const d = Math.hypot(p.x - m.player.x, p.z - m.player.z);
      const head = el('button', 'kqt-map-pick');
      head.type = 'button';
      head.append(el('b', undefined, `${i < 9 ? `${i + 1} · ` : ''}${p.name}`), el('span', undefined, d < 25 ? TRAVEL_DE.here : TRAVEL_DE.walk(d)));
      head.onclick = () => {
        selected = p.id;
        view = { ...view, cx: p.x, cz: p.z };
        renderSide();
      };
      li.append(head, el('small', undefined, p.note));
      const go = el('button', 'kq-btn kqt-map-go', TRAVEL_DE.go);
      go.type = 'button';
      go.dataset.testid = `travel-go-${p.id}`;
      go.disabled = !!m.block || d < 25;
      go.onclick = () => act.travel(p.id);
      li.append(go);
      list.append(li);
    });
    side.append(list);
    if (m.unknown.length) side.append(el('p', 'kqt-map-more', TRAVEL_DE.unknown(m.unknown.length)));
    if (m.layers.length > 1) {
      const row = el('div', 'kqt-map-layers');
      row.append(el('span', undefined, TRAVEL_DE.layers));
      for (const l of m.layers) {
        const b = el('button', `kq-btn kqt-layer${l.on ? ' on' : ''}`, l.label);
        b.type = 'button';
        b.dataset.testid = `travel-layer-${l.id}`;
        b.onclick = () => {
          act.layer(l.id);
          m = model();
          renderSide();
        };
        row.append(b);
      }
      side.append(row);
    }
  }

  // interaction: wheel zoom, drag pan, click select
  let drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const [wx, wz] = toWorld(px, py);
    const k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    const mpp = Math.max(0.6, Math.min(5, view.mpp * k));
    view = { mpp, cx: wx - (px - W / 2) * mpp, cz: wz - (py - H / 2) * mpp };
  });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - drag.x) / r.width) * W;
    const dy = ((e.clientY - drag.y) / r.height) * H;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view = { ...view, cx: drag.cx - dx * view.mpp, cz: drag.cz - dy * view.mpp };
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best: string | null = null;
    let bd = 16;
    for (const p of m.known) {
      const [qx, qy] = toPx(p.x, p.z);
      const dd = Math.hypot(qx - px, qy - py);
      if (dd < bd) {
        bd = dd;
        best = p.id;
      }
    }
    if (best) {
      selected = best;
      renderSide();
    }
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) return;
    const n = Number(e.key);
    const byDist = [...m.known].sort((a, b) => Math.hypot(a.x - m.player.x, a.z - m.player.z) - Math.hypot(b.x - m.player.x, b.z - m.player.z));
    if (n >= 1 && n <= 9 && byDist[n - 1]) {
      e.preventDefault();
      e.stopPropagation();
      selected = byDist[n - 1]!.id;
      renderSide();
    } else if (e.key === 'Enter' && selected && !m.block) {
      e.preventDefault();
      e.stopPropagation();
      act.travel(selected);
    } else if (e.key === '+' || e.key === '-') {
      view = { ...view, mpp: Math.max(0.6, Math.min(5, view.mpp * (e.key === '+' ? 1 / 1.25 : 1.25))) };
    }
  };
  window.addEventListener('keydown', onKey, true);
  renderSide();
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
  };
}

function niceBar(m: number): number {
  for (const s of [25, 50, 100, 200, 250, 500, 1000]) if (s >= m * 0.6) return s;
  return 1000;
}

const CSS = `
.kq-modal.kqt-map-modal { width: min(1080px, 97vw); padding: 22px 26px 18px 58px; }
.kq-modal.kqt-map-modal h2 { font-size: 30px; margin-bottom: 8px; }
.kqt-map-wrap { display: flex; gap: 18px; align-items: flex-start; }
.kqt-map-canvas { flex: 0 1 auto; max-width: min(640px, 62vw); height: auto; border: 1.5px solid var(--ink); box-shadow: 0 2px 10px rgba(0,0,0,0.25); cursor: grab; touch-action: none; background: #e8dcc0; }
.kqt-map-compact .kqt-map-canvas { max-width: min(520px, 56vw); }
.kqt-map-side { flex: 1 1 220px; min-width: 200px; max-height: 520px; overflow: auto; font-size: 15px; }
.kqt-map-hint { font-style: italic; color: var(--ink-soft); margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
.kqt-map-block { margin: 0 0 10px; padding: 6px 10px; border-left: 3px solid var(--accent); background: rgba(140,47,31,0.08); font-size: 15px; }
.kqt-map-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.kqt-map-list li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--ink-faint); border-radius: 3px; background: rgba(243,234,214,0.5); }
.kqt-map-list li.sel { border-color: var(--accent); background: rgba(181,139,61,0.18); }
.kqt-map-list small { grid-column: 1 / 2; color: var(--ink-soft); font-size: 13px; line-height: 1.25; }
.kqt-map-pick { grid-column: 1 / 2; display: flex; justify-content: space-between; gap: 8px; border: none; background: none; padding: 0; font: inherit; color: var(--ink); cursor: pointer; text-align: left; }
.kqt-map-pick span { color: var(--ink-soft); font-size: 13px; white-space: nowrap; }
.kqt-map-go { grid-column: 2 / 3; grid-row: 1 / 3; padding: 4px 10px; font-size: 14px; }
.kqt-map-go:disabled { opacity: 0.4; cursor: default; }
.kqt-map-more { font-size: 13px; color: var(--ink-soft); font-style: italic; }
.kqt-map-layers { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; font-size: 14px; }
.kqt-layer.on { background: var(--ink); color: var(--paper); }
@media (max-width: 760px) { .kqt-map-wrap { flex-direction: column; } .kqt-map-canvas { max-width: 100%; } }
html[data-kq-contrast] .kqt-map-list li { background: #f3ead6; border-color: #000; }
html[data-kq-contrast] .kqt-map-block { background: #fff; color: #000; }
.kqt-travel-curtain { position: fixed; inset: 0; z-index: 40; pointer-events: none; opacity: 0; transition: opacity 0.42s ease; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px;
  background: radial-gradient(ellipse at center, rgba(70, 56, 38, 0.88) 0%, rgba(14, 10, 6, 0.97) 70%); color: #efe2c4; font-family: var(--sc, Georgia), serif; }
.kqt-travel-curtain.on { opacity: 1; }
.kqt-travel-curtain .kqt-cross { width: 140px; height: 140px; border: 1.5px solid rgba(239,226,196,0.55); border-radius: 50%; position: relative; animation: kqt-spin 1.4s linear infinite; }
.kqt-travel-curtain .kqt-cross::before, .kqt-travel-curtain .kqt-cross::after { content: ''; position: absolute; background: rgba(239,226,196,0.7); }
.kqt-travel-curtain .kqt-cross::before { left: 50%; top: -12px; bottom: -12px; width: 1px; }
.kqt-travel-curtain .kqt-cross::after { top: 50%; left: -12px; right: -12px; height: 1px; }
.kqt-travel-curtain .kqt-to { font-size: 28px; letter-spacing: 0.04em; }
.kqt-travel-curtain .kqt-sub { font-family: var(--serif, Georgia); font-style: italic; font-size: 16px; opacity: 0.8; }
html[data-kq-reduced-motion] .kqt-travel-curtain .kqt-cross { animation: none; }
@keyframes kqt-spin { to { transform: rotate(360deg); } }
.kqt-card { position: fixed; left: 50%; top: max(150px, 22vh); transform: translateX(-50%); z-index: 22; width: min(460px, 88vw); padding: 16px 22px 14px; pointer-events: auto;
  background: #efe4c9; color: #2a2118; border: 1px solid #b9a57c; box-shadow: 0 6px 24px rgba(0,0,0,0.35); font-family: var(--serif, Georgia), serif; animation: kq-in 0.25s ease-out; }
.kqt-card.kqt-banner { top: 64px; width: min(420px, 70vw); padding: 10px 18px; text-align: center; background: rgba(239, 228, 201, 0.94); }
.kqt-card.kqt-banner h3 { font-size: 19px; }
.kqt-card.kqt-banner p { font-size: 14px; font-style: italic; }
.kqt-card h3 { margin: 0 0 2px; font-family: var(--sc, Georgia), serif; font-weight: 400; font-size: 22px; }
.kqt-card .kqt-from { font-style: italic; font-size: 13px; color: #5a4a37; margin: 0 0 8px; }
.kqt-card p { margin: 0; font-size: 16px; line-height: 1.45; }
.kqt-card .kqt-tag { display: inline-block; margin-top: 10px; font-size: 12px; padding: 1px 6px; border: 1px solid #8c2f1f; color: #8c2f1f; border-radius: 2px; }
.kqt-card .kqt-close { float: right; font-size: 12px; color: #5a4a37; }
.kqt-fund-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.kqt-fund-list li { padding: 8px 10px; border-left: 3px solid var(--brass); background: rgba(243,234,214,0.5); }
.kqt-fund-list b { font-family: var(--sc, Georgia), serif; font-weight: 400; font-size: 18px; }
.kqt-fund-list i { display: block; font-size: 13px; color: var(--ink-soft); }
`;

let styled = false;
export function injectTravelCss(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.dataset.kq = 'travel';
  s.textContent = CSS;
  document.head.append(s);
}
