/**
 * In-page UI measurements for the mobile tour (docs/MOBILE-UI-PASS.md §Rubric). `measureUi` is
 * passed to `page.evaluate`, so it must stay self-contained: no imports, no outer variables.
 *
 * It reports, for the current screen state:
 *  - taps: every visible interactive element with its box; `small` when under 44×44 CSS px
 *  - overlaps: intersections between visible HUD / overlay regions and interactive elements
 *  - text: visible text under 12 CSS px; low contrast against the nearest opaque background
 *  - clipped: text cut by overflow (ellipsis or hidden overflow)
 *  - offscreen: interactive elements partly outside the viewport
 *  - safeArea: visible UI inside the emulated inset zones (notch, home indicator)
 *  - scroll: scroll containers in the top modal (nested ones = double scrollbars)
 * Each issue carries a severity hint (S1 blocks, S2 hurts, S3 polish); the playtester curates.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Issue {
  sev: 'S1' | 'S2' | 'S3';
  kind: string;
  what: string;
  box?: Box;
  detail?: string;
}
export interface UiMeasure {
  viewport: { w: number; h: number };
  taps: { what: string; box: Box; small: boolean }[];
  issues: Issue[];
}

export function measureUi(insets: { top: number; right: number; bottom: number; left: number }): UiMeasure {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const issues: Issue[] = [];
  const r2 = (n: number) => Math.round(n * 10) / 10;
  const box = (r: DOMRect): Box => ({ x: r2(r.x), y: r2(r.y), w: r2(r.width), h: r2(r.height) });
  const name = (el: Element): string => {
    const tid = (el as HTMLElement).dataset?.testid;
    const cls = [...el.classList].slice(0, 3).join('.');
    const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    return `${tid ? `[${tid}]` : `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`}${label ? ` "${label.slice(0, 40)}"` : ''}`;
  };
  const shown = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
    const he = el as HTMLElement;
    if (typeof he.checkVisibility === 'function' && !he.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    return true;
  };
  const inter = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? { w, h, area: w * h } : null;
  };
  /** Is the element hidden behind something else at its centre (a modal over the HUD)? */
  const covered = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    // the touch surface (.kq-touch, a transparent full-screen layer above the HUD) and the stick do not hide anything
    const top = [...document.elementsFromPoint(x, y)].find((e) => !e.matches('.kq-touch, .kq-t-stick, .kq-t-stick *'));
    return !!top && top !== el && !el.contains(top) && !top.contains(el);
  };

  // ---- tap targets -----------------------------------------------------------------------------
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=slider], [role=link], [tabindex]:not([tabindex="-1"])';
  const seen = new Set<Element>();
  const taps: UiMeasure['taps'] = [];
  for (const raw of document.querySelectorAll(INTERACTIVE)) {
    // a radio / checkbox inside its label: the label is what the finger hits
    const el = raw.matches('input[type=radio], input[type=checkbox]') && raw.closest('label') ? raw.closest('label')! : raw;
    if (seen.has(el) || !shown(el) || covered(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const small = r.width < 44 || r.height < 44;
    taps.push({ what: name(el), box: box(r), small });
    if (small) issues.push({ sev: r.width < 24 || r.height < 24 ? 'S1' : 'S2', kind: 'tap-small', what: name(el), box: box(r), detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) issues.push({ sev: 'S2', kind: 'offscreen', what: name(el), box: box(r) });
  }

  // ---- overlaps between visible regions --------------------------------------------------------
  const REGIONS =
    '.kq-compass, .kq-tl, .kq-dock, .kq-toast, .kq-prompt, .kq-subtitles, .kq-stance, .kq-oil, .kq-crosshair, [data-testid=quest-tracker], [data-testid=dialogue], [data-testid=story-card], [data-testid=hud-xp], [data-testid=hud-quick], [data-testid=quest-banner], [data-testid=quest-reward], [data-testid=level-card], [data-testid=skill-card], [data-testid=npc-talk], [data-testid=objective], .kqt-card, .kq-t-btn, .kq-t-stick, .kq-t-pop, .kq-modal, .kq-rotate';
  const regions = [...new Set([...document.querySelectorAll(REGIONS), ...seen])].filter((el) => shown(el));
  const interactive = (el: Element) => seen.has(el) || el.matches('.kq-t-btn, .kq-t-stick');
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i]!;
      const b = regions[j]!;
      if (a.contains(b) || b.contains(a)) continue;
      // full-screen layers (rotate overlay, modal backdrop) cover everything by design: reported once as a state, not as pairs
      if (a.matches('.kq-rotate') || b.matches('.kq-rotate')) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x = inter(ra, rb);
      if (!x || x.area < 24) continue;
      // a modal covers the HUD on purpose; only what lies on top of a modal counts
      if (a.matches('.kq-modal') !== b.matches('.kq-modal') && covered(a.matches('.kq-modal') ? b : a)) continue;
      const both = interactive(a) && interactive(b);
      const text = (el: Element) => el.matches('.kq-subtitles, [data-testid=dialogue], [data-testid=quest-tracker], .kq-prompt, [data-testid=npc-talk], .kq-modal, .kqt-card');
      const sev: Issue['sev'] = both ? 'S1' : (interactive(a) && text(b)) || (interactive(b) && text(a)) ? 'S2' : 'S3';
      issues.push({ sev, kind: 'overlap', what: `${name(a)} ∩ ${name(b)}`, box: { x: r2(Math.max(ra.left, rb.left)), y: r2(Math.max(ra.top, rb.top)), w: r2(x.w), h: r2(x.h) } });
    }
  }

  // ---- text size, contrast, clipping -----------------------------------------------------------
  const parseRgb = (c: string): [number, number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  };
  const lum = ([r, g, b]: [number, number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el: Element): [number, number, number, number] | null => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parseRgb(getComputedStyle(e).backgroundColor);
      if (c && c[3] >= 0.85) return c;
      if (getComputedStyle(e).backgroundImage !== 'none') return null; // gradient / paper texture: unknown
    }
    return null; // over the 3D canvas
  };
  const textEls = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.textContent ?? '').trim().length < 2) continue;
    const el = n.parentElement;
    if (el && !textEls.has(el) && !el.closest('script, style, .kq-debug, .kq-perf, [data-testid=perf-hud], [data-testid=debug-panel]')) textEls.add(el);
  }
  let smallCount = 0;
  for (const el of textEls) {
    if (!shown(el) || covered(el)) continue;
    const cs = getComputedStyle(el);
    // effective size: CSS `zoom` (the phone HUD is zoomed 0.78) is not in the computed font-size
    const px = Math.round(parseFloat(cs.fontSize) * ((el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1) * 10) / 10;
    if (px < 12 && smallCount++ < 60) issues.push({ sev: px < 10 ? 'S2' : 'S3', kind: 'text-small', what: name(el), box: box(el.getBoundingClientRect()), detail: `${px}px` });
    const fg = parseRgb(cs.color);
    const bg = bgOf(el);
    if (fg && bg) {
      const a = lum(fg);
      const b = lum(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = px >= 18.66 || (px >= 14 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) issues.push({ sev: ratio < 2.5 ? 'S2' : 'S3', kind: 'contrast', what: name(el), box: box(el.getBoundingClientRect()), detail: `${ratio.toFixed(2)}:1 (need ${need})` });
    }
    const h = el as HTMLElement;
    const cut = (h.scrollWidth > h.clientWidth + 1 && cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') || cs.textOverflow === 'ellipsis' && h.scrollWidth > h.clientWidth;
    const lineCut = h.scrollHeight > h.clientHeight + 2 && cs.overflowY === 'hidden' && (parseInt(cs.webkitLineClamp || '0') > 0 || h.clientHeight > 0);
    if (cut || (lineCut && parseInt(cs.webkitLineClamp || '0') > 0)) issues.push({ sev: 'S2', kind: 'text-clipped', what: name(el), box: box(el.getBoundingClientRect()), detail: (el.textContent ?? '').trim().slice(0, 80) });
  }

  // ---- safe areas --------------------------------------------------------------------------------
  const zones: [string, DOMRect][] = [];
  if (insets.top) zones.push(['top', new DOMRect(0, 0, vw, insets.top)]);
  if (insets.bottom) zones.push(['bottom', new DOMRect(0, vh - insets.bottom, vw, insets.bottom)]);
  if (insets.left) zones.push(['left', new DOMRect(0, 0, insets.left, vh)]);
  if (insets.right) zones.push(['right', new DOMRect(vw - insets.right, 0, insets.right, vh)]);
  for (const el of regions) {
    if (el.matches('.kq-rotate, .kq-modal-layer')) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= vw * 0.98 && r.height >= vh * 0.98) continue;
    for (const [z, zr] of zones) {
      const x = inter(r, zr);
      if (x && x.area > 16) issues.push({ sev: interactive(el) ? 'S2' : 'S3', kind: 'safe-area', what: name(el), box: box(r), detail: `${z} inset, ${Math.round(x.w)}×${Math.round(x.h)} px inside` });
    }
  }

  // ---- scroll containers in the top modal --------------------------------------------------------
  const layers = [...document.querySelectorAll('.kq-modal-layer')].filter((l) => shown(l));
  const top = layers.at(-1);
  if (top) {
    const scrollers = [...top.querySelectorAll('*')].filter((e) => {
      const cs = getComputedStyle(e);
      return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2;
    });
    const nested = scrollers.filter((s) => scrollers.some((o) => o !== s && o.contains(s)));
    if (nested.length) issues.push({ sev: 'S2', kind: 'double-scroll', what: nested.map(name).join(' | ') });
    const modal = top.querySelector('.kq-modal');
    if (modal) {
      const r = modal.getBoundingClientRect();
      if (r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1) issues.push({ sev: 'S1', kind: 'modal-cut', what: name(modal), box: box(r) });
      if (!scrollers.length && modal.scrollHeight > modal.clientHeight + 2 && getComputedStyle(modal).overflowY === 'hidden') issues.push({ sev: 'S1', kind: 'scroll-trap', what: name(modal) });
    }
  }
  return { viewport: { w: vw, h: vh }, taps, issues };
}

/** Frame times over `ms` of real time (rAF deltas): menus must not stutter either. */
export async function sampleFrames(ms: number): Promise<{ frames: number; p50: number; p95: number; max: number; over50: number }> {
  const d: number[] = [];
  await new Promise<void>((done) => {
    let last = performance.now();
    const t0 = last;
    const tick = (now: number) => {
      d.push(now - last);
      last = now;
      if (now - t0 < ms) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const s = [...d].sort((a, b) => a - b);
  const q = (p: number) => Math.round((s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? 0) * 10) / 10;
  return { frames: d.length, p50: q(0.5), p95: q(0.95), max: q(1), over50: d.filter((x) => x > 50).length };
}

/** Scroll every scroll container of the top modal to its end (for the "-bottom" shot); returns how many moved. */
export function scrollModalToBottom(): number {
  const layers = [...document.querySelectorAll('.kq-modal-layer')];
  const top = layers.at(-1);
  if (!top) return 0;
  let n = 0;
  for (const e of [top, ...top.querySelectorAll('*')]) {
    if (e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) {
      e.scrollTop = e.scrollHeight;
      n++;
    }
  }
  return n;
}
