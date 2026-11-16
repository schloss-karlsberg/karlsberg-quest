/**
 * Combat HUD (docs/ACTION-RPG.md §10), field-book look with high-contrast rules:
 *  - dock 'vitals' 10: Lebenskraft (red-orange with a notch pattern) and Atem (pale blue, plain) —
 *    never red vs green alone; a pale "ghost" shows the damage just taken;
 *  - dock 'vitals' 20: Bannlicht charges (flame pips that refill);
 *  - dock 'boss': the boss bar (name, phase marks, phase line, the weak point);
 *  - layer 'combat': telegraph captions, floating damage numbers ("Schadenszahlen"), HP pips over
 *    enemies with a "gebannt" tag, screen-edge arrows for off-screen attackers
 *    (settings.soundIndicators), the frost vignette when hit (≤ 25 % with reduced flash).
 */
import { Vector3, type PerspectiveCamera } from 'three';

const CSS = `
.kqc-vitals { display: flex; flex-direction: column; gap: 5px; padding: 7px 10px 8px; border-radius: 3px;
  background: linear-gradient(180deg, rgba(20,16,11,0.72), rgba(20,16,11,0.55)); box-shadow: 0 1px 3px rgba(0,0,0,0.5);
  transition: opacity 0.6s; font-family: var(--serif); color: #efe4cb; }
.kqc-vitals.calm { opacity: 0.55; }
/* the vitals dock is 168 px wide (progression.css): label + number on one line, the bar full width below */
.kqc-row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'lbl num' 'bar bar'; align-items: end; column-gap: 6px; row-gap: 2px; }
.kqc-row .lbl { grid-area: lbl; }
.kqc-row .num { grid-area: num; }
.kqc-row .kqc-track { grid-area: bar; }
.kqc-row .lbl { font-family: var(--sc); font-size: 12.5px; letter-spacing: 0.04em; color: #e6d8b8; text-shadow: 0 1px 1px #000; }
.kqc-row .num { font-family: var(--serif); font-size: 13px; text-align: right; color: #f3e9d3; text-shadow: 0 1px 1px #000; }
.kqc-track { position: relative; height: 11px; border: 1px solid rgba(233,220,192,0.55); background: rgba(8,6,4,0.75); overflow: hidden; border-radius: 1px; }
.kqc-track .fill, .kqc-track .ghost { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; }
.kqc-track .ghost { background: rgba(255,236,200,0.75); transition: transform 0.5s ease-in 0.35s; }
.kqc-hp .fill { background:
  repeating-linear-gradient(90deg, transparent 0 9.2%, rgba(20,8,2,0.85) 9.2% 10%),
  linear-gradient(180deg, #f08a3c, #c9461c 60%, #8f2c10); }
.kqc-hp.low .fill { animation: kqc-pulse 0.9s ease-in-out infinite; }
.kqc-st .fill { background: linear-gradient(180deg, #d9ecf7, #9cc5de 60%, #6f9fbd); }
.kqc-st.out .kqc-track { border-color: #e9c48c; }
.kqc-st.out .fill { background: repeating-linear-gradient(135deg, #9cc5de 0 4px, #4d6a7d 4px 8px); }
.kqc-st.denied .kqc-track { border-color: #ffd9a0; box-shadow: 0 0 0 1px #ffd9a0; }
@keyframes kqc-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.45); } }
html[data-kq-reduced-motion] .kqc-hp.low .fill, html[data-kq-reduced-flash] .kqc-hp.low .fill { animation: none; }
.kqc-bann { display: flex; align-items: center; gap: 7px; padding: 5px 10px; border-radius: 3px;
  background: linear-gradient(180deg, rgba(20,16,11,0.7), rgba(20,16,11,0.5)); transition: opacity 0.6s; }
.kqc-bann.calm { opacity: 0.55; }
.kqc-bann .lbl { font-family: var(--sc); font-size: 12.5px; letter-spacing: 0.04em; color: #e6d8b8; text-shadow: 0 1px 1px #000; }
.kqc-pip { position: relative; width: 14px; height: 18px; border: 1.5px solid #e9c77a; border-radius: 50% 50% 46% 46% / 62% 62% 38% 38%;
  background: rgba(10,7,4,0.8); overflow: hidden; }
.kqc-pip i { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(0deg, #ff9a3a, #ffe2a0); }
.kqc-pip.full { box-shadow: 0 0 6px rgba(255,190,90,0.55); }
.kqc-bann .key { margin-left: auto; font-family: var(--serif); font-size: 11px; line-height: 1.1; text-align: right; color: #d6c7a6; }
.kqc-boss { width: 100%; text-align: center; padding: 6px 12px 7px; border-radius: 3px;
  background: linear-gradient(180deg, rgba(14,10,7,0.82), rgba(14,10,7,0.6)); box-shadow: 0 1px 4px rgba(0,0,0,0.6); }
.kqc-boss .name { font-family: var(--sc); font-size: 19px; color: #f1e3c2; letter-spacing: 0.06em; text-shadow: 0 1px 2px #000; }
.kqc-boss .kqc-track { height: 13px; margin: 4px 0 3px; border-color: rgba(233,200,140,0.75); }
.kqc-boss .fill { background:
  repeating-linear-gradient(90deg, transparent 0 4.8%, rgba(30,10,2,0.6) 4.8% 5%),
  linear-gradient(180deg, #e8a050, #b9481c 60%, #7d260c); }
.kqc-boss .mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #f6e6c0; box-shadow: 0 0 0 1px rgba(0,0,0,0.7); }
.kqc-boss .sub { font-family: var(--hand); font-size: 18px; color: #e9d7ad; text-shadow: 0 1px 2px #000; min-height: 20px; }
.kqc-boss.weak .sub { color: #ffe08a; }
.kqc-layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.kqc-vignette { position: absolute; inset: -2%; opacity: 0; will-change: opacity;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(190,215,235,0.35) 80%, rgba(225,238,250,0.75) 100%); }
.kqc-low { position: absolute; inset: -2%; opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(60,14,4,0.55) 85%, rgba(20,4,0,0.85) 100%); }
.kqc-tell { position: absolute; left: 50%; bottom: 212px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; }
.kqc-tell span { font-family: var(--serif); font-size: calc(19px * var(--sub-scale, 1)); color: #fff2d6; padding: 2px 12px; border-radius: 2px;
  background: rgba(22,12,6,0.78); border-left: 3px solid #f0a040; text-shadow: 0 1px 1px #000; opacity: 1; transition: opacity 0.3s; white-space: nowrap; }
.kqc-tell span.boss { border-left-color: #ffd36a; font-size: calc(21px * var(--sub-scale, 1)); }
.kqc-tell span.info { border-left-color: #a9d2ee; }
.kqc-tell span.gone { opacity: 0; }
.kqc-num { position: absolute; font-family: var(--hand); font-size: 26px; font-weight: 700; color: #fff0d0; transform: translate(-50%, -50%);
  text-shadow: 0 0 3px #000, 0 1px 2px #000, 0 0 8px rgba(0,0,0,0.6); white-space: nowrap; }
.kqc-num.heavy { font-size: 34px; color: #ffd27a; }
.kqc-num.weak { color: #ffe58a; }
.kqc-num.armored { color: #c9c2b4; font-size: 21px; }
.kqc-num.player { color: #ffb08a; font-size: 24px; }
.kqc-num.heal { color: #cfe9ff; font-size: 22px; }
.kqc-num.immune { font-size: 20px; color: #bfe6ff; }
.kqc-pips { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kqc-pips .bar { width: 46px; height: 6px; border: 1px solid rgba(0,0,0,0.85); background: rgba(10,8,6,0.75); box-shadow: 0 0 0 1px rgba(240,226,196,0.45); position: relative; }
.kqc-pips .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, #f08a3c 0 7px, #8f2c10 7px 8px); }
.kqc-pips .tag { font-family: var(--sc); font-size: 12px; color: #d8efff; background: rgba(10,18,28,0.8); padding: 0 5px; border: 1px solid rgba(190,225,250,0.7); border-radius: 2px; }
.kqc-pips .tag.immune { color: #e9e2d0; border-color: rgba(233,226,208,0.6); background: rgba(20,16,10,0.8); }
.kqc-arrow { position: absolute; width: 0; height: 0; }
.kqc-arrow svg { position: absolute; left: -20px; top: -20px; width: 40px; height: 40px; overflow: visible; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); }
html[data-kq-contrast] .kqc-vitals, html[data-kq-contrast] .kqc-bann, html[data-kq-contrast] .kqc-boss { background: #0d0a07; opacity: 1; border: 1px solid #f3e6c8; }
html[data-kq-contrast] .kqc-track { border-color: #fff; background: #000; }
html[data-kq-contrast] .kqc-tell span { background: #000; border: 1px solid #fff; border-left-width: 4px; }
html[data-kq-contrast] .kqc-pips .bar { box-shadow: 0 0 0 1px #fff; }
`;

let cssInstalled = false;
function installCss(): void {
  if (cssInstalled || typeof document === 'undefined') return;
  cssInstalled = true;
  const s = document.createElement('style');
  s.id = 'kq-combat-css';
  s.textContent = CSS;
  document.head.append(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface FloatNum {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  dx: number;
}

export interface PipTarget {
  id: string;
  x: number;
  y: number;
  z: number;
  frac: number;
  gebannt: boolean;
  immune: boolean;
  show: boolean;
}

export interface Docker {
  dock(area: 'vitals' | 'boss' | 'feed', el: HTMLElement, order?: number): void;
}

const _v = new Vector3();

export class CombatHud {
  readonly vitals: HTMLElement;
  readonly bannEl: HTMLElement;
  readonly bossEl: HTMLElement;
  readonly layer: HTMLElement;
  private readonly hp: { row: HTMLElement; fill: HTMLElement; ghost: HTMLElement; num: HTMLElement };
  private readonly st: { row: HTMLElement; fill: HTMLElement; ghost: HTMLElement; num: HTMLElement };
  private readonly pips: HTMLElement[] = [];
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossGhost: HTMLElement;
  private readonly bossSub: HTMLElement;
  private readonly bossTrack: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly low: HTMLElement;
  private readonly tell: HTMLElement;
  private readonly nums: FloatNum[] = [];
  private readonly pipEls = new Map<string, { root: HTMLElement; fill: HTMLElement; tag: HTMLElement }>();
  private readonly arrows = new Map<string, { el: HTMLElement; life: number }>();
  private vig = 0;
  private bossKey = '';
  private deniedT = 0;

  constructor(docker: Docker, layer: HTMLElement) {
    installCss();
    this.layer = layer;
    layer.classList.remove('kq-hidden');
    layer.classList.add('kqc-layer');
    // under the story layer: damage numbers never print over the dialogue text
    layer.style.zIndex = '14';
    const bar = (cls: string, label: string) => {
      const row = el('div', `kqc-row ${cls}`);
      row.setAttribute('role', 'meter');
      row.setAttribute('aria-label', label);
      row.setAttribute('aria-valuemin', '0');
      const track = el('div', 'kqc-track');
      const ghost = el('div', 'ghost');
      const fill = el('div', 'fill');
      track.append(ghost, fill);
      const num = el('span', 'num', '100');
      row.append(el('span', 'lbl', label), track, num);
      return { row, fill, ghost, num };
    };
    this.vitals = el('div', 'kqc-vitals');
    this.vitals.dataset.testid = 'combat-vitals';
    this.hp = bar('kqc-hp', 'Lebenskraft');
    this.st = bar('kqc-st', 'Atem');
    this.vitals.append(this.hp.row, this.st.row);
    this.bannEl = el('div', 'kqc-bann');
    this.bannEl.dataset.testid = 'combat-bann';
    this.bannEl.append(el('span', 'lbl', 'Bannlicht'));
    this.bannEl.setAttribute('role', 'meter');
    this.bannEl.setAttribute('aria-label', 'Bannlicht-Ladungen');
    this.bossEl = el('div', 'kqc-boss');
    this.bossEl.dataset.testid = 'combat-boss';
    this.bossEl.style.display = 'none';
    this.bossName = el('div', 'name');
    this.bossTrack = el('div', 'kqc-track');
    this.bossGhost = el('div', 'ghost');
    this.bossFill = el('div', 'fill');
    this.bossTrack.append(this.bossGhost, this.bossFill);
    this.bossSub = el('div', 'sub');
    this.bossEl.append(this.bossName, this.bossTrack, this.bossSub);
    docker.dock('vitals', this.vitals, 10);
    docker.dock('vitals', this.bannEl, 20);
    docker.dock('boss', this.bossEl, 0);
    this.vignette = el('div', 'kqc-vignette');
    this.low = el('div', 'kqc-low');
    this.tell = el('div', 'kqc-tell');
    this.tell.setAttribute('aria-live', 'polite');
    layer.append(this.low, this.vignette, this.tell);
  }

  setVitals(o: { hp: number; max: number; st: number; stMax: number; exhausted: boolean; bann: number; bannMax: number; bannFrac: number; calm: boolean; key: string }): void {
    const hpF = Math.max(0, Math.min(1, o.hp / Math.max(1, o.max)));
    const stF = Math.max(0, Math.min(1, o.st / Math.max(1, o.stMax)));
    this.hp.fill.style.transform = `scaleX(${hpF})`;
    this.hp.ghost.style.transform = `scaleX(${hpF})`;
    this.hp.num.textContent = String(Math.ceil(o.hp));
    this.hp.row.setAttribute('aria-valuenow', String(Math.ceil(o.hp)));
    this.hp.row.setAttribute('aria-valuemax', String(Math.round(o.max)));
    this.hp.row.classList.toggle('low', hpF < 0.3);
    this.st.fill.style.transform = `scaleX(${stF})`;
    this.st.ghost.style.transform = `scaleX(${stF})`;
    this.st.num.textContent = String(Math.floor(o.st));
    this.st.row.setAttribute('aria-valuenow', String(Math.floor(o.st)));
    this.st.row.classList.toggle('out', o.exhausted);
    this.deniedT = Math.max(0, this.deniedT - 1 / 60);
    this.st.row.classList.toggle('denied', this.deniedT > 0);
    this.vitals.classList.toggle('calm', o.calm && hpF >= 0.999 && stF >= 0.999);
    this.bannEl.classList.toggle('calm', o.calm && o.bann >= o.bannMax);
    while (this.pips.length < o.bannMax) {
      const p = el('span', 'kqc-pip');
      p.append(el('i'));
      this.bannEl.append(p);
      this.pips.push(p);
    }
    while (this.pips.length > o.bannMax) this.pips.pop()?.remove();
    this.pips.forEach((p, i) => {
      const full = i < o.bann;
      const f = full ? 1 : i === o.bann ? o.bannFrac : 0;
      p.classList.toggle('full', full);
      (p.firstChild as HTMLElement).style.height = `${Math.round(f * 100)}%`;
    });
    this.bannEl.setAttribute('aria-valuenow', String(o.bann));
    let key = this.bannEl.querySelector('.key');
    if (!key) {
      key = el('span', 'key');
      this.bannEl.append(key);
    }
    if (key.textContent !== o.key) key.textContent = o.key;
  }

  /** Flash the Atem bar (not enough breath / no charge). */
  denied(): void {
    this.deniedT = 0.4;
  }

  setBoss(b: { name: string; frac: number; phase: number; phases: number; marks: readonly number[]; sub: string; weak: boolean } | null): void {
    if (!b) {
      this.bossEl.style.display = 'none';
      this.bossKey = '';
      return;
    }
    this.bossEl.style.display = '';
    const key = `${b.name}|${b.marks.join(',')}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      this.bossName.textContent = b.name;
      this.bossTrack.querySelectorAll('.mark').forEach((m) => m.remove());
      for (const m of b.marks) {
        const i = el('i', 'mark');
        i.style.left = `${m * 100}%`;
        this.bossTrack.append(i);
      }
    }
    const f = Math.max(0, Math.min(1, b.frac));
    this.bossFill.style.transform = `scaleX(${f})`;
    this.bossGhost.style.transform = `scaleX(${f})`;
    const sub = b.sub || `Phase ${b.phase} von ${b.phases}`;
    if (this.bossSub.textContent !== sub) this.bossSub.textContent = sub;
    this.bossEl.classList.toggle('weak', b.weak);
  }

  /** A short caption for a telegraph (or info line); `cls` boss / info. */
  caption(text: string, cls = '', ms = 1400): void {
    const s = el('span', cls, text);
    this.tell.append(s);
    while (this.tell.childElementCount > 3) this.tell.firstElementChild?.remove();
    setTimeout(() => s.classList.add('gone'), ms);
    setTimeout(() => s.remove(), ms + 400);
  }

  /** A floating number at a world point. */
  number(text: string, x: number, y: number, z: number, cls = ''): void {
    const e = el('div', `kqc-num ${cls}`, text);
    this.layer.append(e);
    this.nums.push({ el: e, x, y, z, age: 0, life: cls.includes('heavy') ? 1.1 : 0.85, dx: (Math.random() - 0.5) * 30 });
    while (this.nums.length > 24) this.nums.shift()?.el.remove();
  }

  /** The player was hit (0..1 strength). */
  hurt(k: number): void {
    this.vig = Math.max(this.vig, Math.min(1, k));
  }

  /** Off-screen attacker arrow at the screen edge (bearing relative to the view, radians, + = right). */
  arrow(id: string, rel: number): void {
    let a = this.arrows.get(id);
    if (!a) {
      const e = el('div', 'kqc-arrow');
      e.innerHTML = `<svg viewBox="-20 -20 40 40"><path d="M-10 6 L0 -11 L10 6" fill="none" stroke="#ffb35a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M-5.5 12 L0 3 L5.5 12" fill="none" stroke="#ffe2b0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      this.layer.append(e);
      a = { el: e, life: 0 };
      this.arrows.set(id, a);
    }
    a.life = 0.6;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = W / 2;
    const cy = H / 2;
    const rx = W / 2 - 46;
    const ry = H / 2 - 46;
    const x = cx + Math.sin(rel) * rx;
    const y = cy - Math.cos(rel) * ry;
    a.el.style.left = `${x}px`;
    a.el.style.top = `${y}px`;
    a.el.style.transform = `rotate(${rel}rad)`;
  }

  frame(o: { dt: number; camera: PerspectiveCamera; reducedFlash: boolean; reducedMotion: boolean; lowHp: number; pips: PipTarget[] }): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cam = o.camera;
    const project = (x: number, y: number, z: number): { x: number; y: number; ok: boolean } => {
      _v.set(x, y, z).project(cam);
      return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, ok: _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2 };
    };
    // damage numbers rise and fade
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.age += o.dt;
      const t = n.age / n.life;
      if (t >= 1) {
        n.el.remove();
        this.nums.splice(i, 1);
        continue;
      }
      const p = project(n.x, n.y, n.z);
      n.el.style.display = p.ok ? '' : 'none';
      const lift = o.reducedMotion ? 0 : 40 * t;
      n.el.style.left = `${p.x + n.dx * t}px`;
      n.el.style.top = `${p.y - lift}px`;
      n.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
    // hp pips over enemies
    const seen = new Set<string>();
    for (const t of o.pips) {
      if (!t.show) continue;
      const p = project(t.x, t.y, t.z);
      if (!p.ok) continue;
      seen.add(t.id);
      let e = this.pipEls.get(t.id);
      if (!e) {
        const root = el('div', 'kqc-pips');
        const bar = el('div', 'bar');
        const fill = el('i');
        bar.append(fill);
        const tag = el('span', 'tag');
        root.append(tag, bar);
        this.layer.append(root);
        e = { root, fill, tag };
        this.pipEls.set(t.id, e);
      }
      e.root.style.left = `${p.x}px`;
      e.root.style.top = `${p.y}px`;
      e.fill.style.width = `${Math.round(Math.max(0, Math.min(1, t.frac)) * 100)}%`;
      const tag = t.gebannt ? 'gebannt' : t.immune ? 'ungreifbar' : '';
      if (e.tag.textContent !== tag) e.tag.textContent = tag;
      e.tag.style.display = tag ? '' : 'none';
      e.tag.classList.toggle('immune', !t.gebannt && t.immune);
    }
    for (const [id, e] of this.pipEls)
      if (!seen.has(id)) {
        e.root.remove();
        this.pipEls.delete(id);
      }
    // arrows fade
    for (const [id, a] of this.arrows) {
      a.life -= o.dt;
      a.el.style.opacity = String(Math.max(0, Math.min(1, a.life / 0.3)));
      if (a.life <= 0) {
        a.el.remove();
        this.arrows.delete(id);
      }
    }
    // frost vignette when hit; low Lebenskraft darkens the edges (≤ 25 % with reduced flash)
    this.vig = Math.max(0, this.vig - o.dt * 2.2);
    const cap = o.reducedFlash ? 0.25 : 1;
    this.vignette.style.opacity = String(Math.min(cap, this.vig));
    const pulse = o.reducedMotion || o.reducedFlash ? 1 : 0.8 + 0.2 * Math.sin(performance.now() / 160);
    this.low.style.opacity = String(Math.min(cap, o.lowHp * 0.9 * pulse));
  }

  clearWorld(): void {
    for (const n of this.nums) n.el.remove();
    this.nums.length = 0;
    for (const e of this.pipEls.values()) e.root.remove();
    this.pipEls.clear();
  }
}
