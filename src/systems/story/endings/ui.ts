/**
 * The finale at the field-station table: choose what happens to the Chronik (three objects),
 * confirm, the closing scene, the epilogue page (a museum label / an ash-grey page / a night
 * page) and the scrolling credits with sources and data licences.
 */
import type { AttributionItem } from '../../../data/types';
import { t } from '../../../i18n';
import { h, svg } from '../../../ui/dom';
import type { ModalHandle, ModalManager } from '../../../ui/modal';
import { portraitSvg } from '../dialogue/portraits';
import type { EndingId } from '../types';
import type { Epilogue } from './epilogue';
import { CREDIT_SOURCES, ENDING_BEFORE, endingScenes } from './scenes';

/**
 * The data credits as players read them: one clean label, the holder, the licence once (the
 * prepared attribution.json speaks to developers: generator rules, sub-project names).
 */
const CREDIT_DATA: Record<string, { label: string; text: string; licence: string }> = {
  dgm: { label: 'Gelände (DGM1 2025)', text: 'GeoBasis-DE/LVGL-SL (2026)', licence: 'dl-de/by-2-0' },
  terrain1789: { label: 'Gelände 1789 (Hypothese)', text: 'abgeleitet aus dem DGM1, GeoBasis-DE/LVGL-SL (2026)', licence: 'dl-de/by-2-0' },
  canopy: { label: 'Vegetationshöhe', text: 'GeoBasis-DE/LVGL-SL (2026), Daten bearbeitet (DOM1 − DGM1)', licence: 'dl-de/by-2-0' },
  hist1840: { label: 'Karte 1836–41 (Bayerische Positionsblätter)', text: 'GeoBasis-DE/LVGL-SL (2026), Daten bearbeitet', licence: 'dl-de/by-2-0' },
  hist1935: { label: 'Karte TK25 1935–40', text: 'GeoBasis-DE/LVGL-SL (2026), Daten bearbeitet', licence: 'dl-de/by-2-0' },
  pointcloud: { label: 'Punktwolke (ALS 2025, Bodenpunkte)', text: 'GeoBasis-DE/LVGL-SL (2026), Daten bearbeitet', licence: 'dl-de/by-2-0' },
  recon: { label: 'Rekonstruktion 1789 (Hypothese)', text: 'Grundrisse teils nach dem Lageplan 2006 von schloss-carlsberg.de, Sockeltiefen aus dem DGM1', licence: 'CC BY-SA 2.0 DE' },
  osm: { label: 'Wege & Gewässer', text: '© OpenStreetMap-Mitwirkende', licence: 'ODbL 1.0' },
  pois: { label: 'Orte', text: 'Koordinaten überwiegend © OpenStreetMap-Mitwirkende', licence: 'ODbL 1.0' },
  project: { label: 'Datenaufbereitung', text: 'Saar LiDAR Explorer (Open-Kirrberg)', licence: 'MIT' },
};

export function creditData(items: readonly AttributionItem[]): { label: string; text: string; licence: string }[] {
  return items.map((a) => CREDIT_DATA[a.id] ?? { label: a.label_de, text: a.text, licence: a.licence ?? '' });
}

export interface EndingDeps {
  modals: ModalManager;
  attribution(): AttributionItem[];
  epilogue(ending: EndingId): Epilogue;
  /** The ending is chosen and confirmed (set flags, emit story:ending, autosave). */
  chosen(ending: EndingId): void;
  /** Credits closed. */
  finished(): void;
  sound(kind: 'horn' | 'match' | 'compass'): void;
  reducedMotion(): boolean;
  name(): string;
  /**
   * Stage the ending in the engine (endings/stage.ts): the modal closes, the world plays the
   * picture, `done` opens the text card. Without it the DOM vignette plays over the frame.
   */
  stage?(id: EndingId, done: () => void): void;
}

const OBJECT_SVG: Record<EndingId, string> = {
  museum: `<svg viewBox="0 0 120 90"><path d="M14 34L60 20L106 34V78L60 88L14 78Z" fill="#9a9a92" stroke="#1d1a16" stroke-width="2"/><path d="M14 34L60 46L106 34M60 46V88" fill="none" stroke="#1d1a16" stroke-width="1.6"/><path d="M14 34L60 46V88L14 78Z" fill="url(#kqs-h2)" opacity=".45"/><path d="M68 56l26-7v12l-26 7z" fill="#efe6d0" stroke="#1d1a16"/><path d="M71 60l19-5M71 64l14-4" stroke="#1d1a16" stroke-width=".8"/><path d="M70 63l18-5" stroke="#a33a24" stroke-width="1.2"/></svg>`,
  burn: `<svg viewBox="0 0 120 90"><rect x="30" y="10" width="14" height="22" fill="#2b2622" stroke="#1d1a16" stroke-width="1.6"/><rect x="22" y="30" width="76" height="52" rx="5" fill="#3b3430" stroke="#1d1a16" stroke-width="2"/><rect x="22" y="30" width="76" height="52" rx="5" fill="url(#kqs-h1)" opacity=".4"/><rect x="38" y="44" width="44" height="26" rx="3" fill="#120c08" stroke="#8a7a62" stroke-width="1.6"/><g class="kqs-end-fire"><path d="M44 70c4-10 8-10 9-18 4 7 6 9 7 18z" fill="#e2702a"/><path d="M58 70c3-8 7-9 8-15 3 6 5 8 5 15z" fill="#f2b24a"/><path d="M50 70c2-5 4-6 5-9 2 4 3 5 3 9z" fill="#fff0c0"/></g><path d="M30 86h60" stroke="#1d1a16" stroke-width="2"/></svg>`,
  keep: `<svg viewBox="0 0 120 90"><path d="M12 30h96v52H12z" fill="#7a5634" stroke="#1d1a16" stroke-width="2"/><path d="M12 30h96v52H12z" fill="url(#kqs-h1)" opacity=".35"/><path d="M18 40h84v36H18z" fill="#6a4a2c" stroke="#1d1a16"/><path d="M26 44h40v14H26z" fill="#efe6d0" stroke="#1d1a16" transform="rotate(-3 46 51)"/><circle cx="82" cy="52" r="10" fill="url(#kqs-brass)" stroke="#1d1a16" stroke-width="1.4"/><path d="M82 45l2 7-2 2-2-2z" fill="#8c2f1f"/><rect x="52" y="62" width="16" height="5" rx="2.5" fill="url(#kqs-brass)" stroke="#1d1a16"/><path d="M96 12c6 0 8 6 4 10" fill="none" stroke="#1d1a16" stroke-width="2"/><path d="M86 22c8 4 18 2 18-6" fill="none" stroke="#b58b3d" stroke-width="4" stroke-linecap="round"/></svg>`,
};

export class EndingScreen {
  private m: ModalHandle | null = null;
  private ending: EndingId | null = null;

  constructor(private readonly d: EndingDeps) {}

  get open(): boolean {
    return !!this.m && !this.m.closed;
  }

  get stage(): string {
    return this.m?.el.dataset.stage ?? 'closed';
  }

  /** Opens the choice (or `ending` directly at the scene, for debugging). */
  show(ending?: EndingId, vignette = false): void {
    if (!this.open) {
      this.m = this.d.modals.open({ closable: false, className: 'kqs-ending', wide: true });
      this.m.el.dataset.testid = 'ending';
    }
    if (ending) {
      this.ending = ending;
      if (vignette) this.play();
      else this.scene();
    } else this.choose();
  }

  close(): void {
    this.dropCreditKeys();
    window.clearTimeout(this.vigTimer);
    this.m?.close();
    this.m = null;
  }

  private page(stage: string, cls: string, body: HTMLElement[]): void {
    const m = this.m!;
    m.el.dataset.stage = stage;
    m.el.classList.remove('kqs-end-museum', 'kqs-end-burn', 'kqs-end-keep', 'kqs-end-credits', 'kqs-end-vig-museum', 'kqs-end-vig-burn', 'kqs-end-vig-keep');
    if (cls) m.el.classList.add(cls);
    m.setBody(body, '');
    m.el.scrollTop = 0;
  }

  private choose(): void {
    const ids: EndingId[] = ['museum', 'burn', 'keep'];
    const pick = async (id: EndingId) => {
      const ok = await this.d.modals.confirm(t('story.end.confirm'), t('common.yes'), t('story.warning.back'));
      if (!ok || !this.open) return;
      this.ending = id;
      this.d.chosen(id);
      this.d.sound(id === 'museum' ? 'horn' : id === 'burn' ? 'match' : 'compass');
      this.play();
    };
    this.page('choose', '', [
      h('div.kqs-end-head', [h('div.kqs-end-kicker', t('story.end.epilogue')), h('h2.kqs-end-title', t('story.end.title'))]),
      h('p.kqs-end-intro', t('story.end.intro')),
      h('div.kqs-end-laub', [h('div.kqs-end-portrait', svg(portraitSvg('compass'))), h('p', [h('span.kqs-end-who', 'Laub'), `„${ENDING_BEFORE}“`])]),
      h(
        'div.kqs-end-choices',
        ids.map((id) =>
          h('button.kqs-end-choice', { 'data-testid': `ending-${id}`, onclick: () => void pick(id) }, [
            h('div.kqs-end-obj', svg(OBJECT_SVG[id])),
            h('div.kqs-end-label', t(`story.end.${id}`)),
            h('div.kqs-end-what', t(`story.end.${id}.obj`)),
            h('div.kqs-end-hint', t(`story.end.${id}.hint`)),
          ]),
        ),
      ),
      h('p.kqs-fic-note', t('story.tag.fiction')),
    ]);
  }

  private vigTimer = 0;

  /** The picture before the card: staged in the engine when the story offers it, else the vignette. */
  private play(): void {
    const id = this.ending!;
    if (!this.d.stage) return this.vignette();
    this.dropCreditKeys();
    this.m?.close();
    this.m = null;
    this.d.stage(id, () => {
      if (!this.open) this.show(id);
    });
  }

  /**
   * A short picture over the live world before the text card (playtest round 2: the ending was
   * only text): museum, the fog lifts and the hounds lie down; burn, the eras flash through the
   * fire; keep, eyes open in the dark behind you. Six seconds, a click skips it.
   */
  private vignette(): void {
    const id = this.ending!;
    if (this.d.reducedMotion()) return this.scene();
    const m = this.m!;
    m.el.closest('.kq-modal-layer')?.classList.add('kqs-vig-layer');
    const layers: HTMLElement[] = [];
    if (id === 'museum') {
      layers.push(h('div.kqs-vig-fog'), h('div.kqs-vig-fog.b'));
      const hounds = h('div.kqs-vig-hounds');
      hounds.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const x = 8 + i * 19;
        return `<svg class="kqs-vig-hound" style="left:${x}%;animation-delay:${1.6 + i * 0.35}s" viewBox="0 0 120 60"><path d="M8 44c6-14 22-20 40-20h34c8 0 12-10 20-12l6 4-4 6c4 2 8 6 8 10l-6 2-10-4c-6 6-10 12-18 14H40c-8 0-14 4-20 6z" fill="#0b0907"/></svg>`;
      }).join('');
      layers.push(hounds);
    } else if (id === 'burn') {
      layers.push(h('div.kqs-vig-fire'));
      const eras = ['1785', '1789', '1793', '1796', '1840', '1935', 'heute'];
      layers.push(h('div.kqs-vig-eras', eras.map((e, i) => h('span', { style: `animation-delay:${0.5 + i * 0.62}s` }, e))));
      layers.push(h('div.kqs-vig-flash'));
    } else {
      layers.push(h('div.kqs-vig-dark'));
      const eyes = h('div.kqs-vig-eyes');
      const spots: [number, number, number][] = [[12, 58, 0.8], [26, 70, 1.6], [78, 62, 1.1], [88, 48, 2.2], [64, 76, 2.8], [40, 52, 3.4], [6, 40, 3.9]];
      eyes.innerHTML = spots.map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}s"><b></b><b></b></i>`).join('');
      layers.push(eyes);
    }
    const next = () => {
      window.clearTimeout(this.vigTimer);
      if (!this.open || this.m!.el.dataset.stage !== 'vignette') return;
      this.m!.el.closest('.kq-modal-layer')?.classList.remove('kqs-vig-layer');
      this.scene();
    };
    this.page('vignette', `kqs-end-vig-${id}`, [
      h('div.kqs-vig', { 'data-testid': 'ending-vignette', onclick: next }, [...layers, h('button.kqs-vig-skip', { onclick: next }, t('story.end.next'))]),
    ]);
    this.vigTimer = window.setTimeout(next, 6200);
  }

  private scene(): void {
    const id = this.ending!;
    const s = endingScenes()[id];
    const line = (who: string, kind: 'compass' | 'radio', texts: string[]) =>
      h('div.kqs-end-line', [
        h('div.kqs-end-portrait', svg(portraitSvg(kind))),
        h('div.kqs-end-says', [h('span.kqs-end-who', who), ...texts.map((x) => h('p', `„${x}“`))]),
      ]);
    this.page('scene', `kqs-end-${id}`, [
      h('div.kqs-end-head', [h('div.kqs-end-kicker', t(`story.end.${id}.obj`)), h('h2.kqs-end-title', t(`story.end.${id}`))]),
      h('p.kqs-end-scene', s.scene),
      line('Laub', 'compass', s.laub),
      line('Marlene', 'radio', [s.marlene.replace('{Name}', this.d.name())]),
      h('p.kqs-end-picture', s.picture),
      h('p.kqs-fic-note', t('story.tag.fiction')),
      h('div.actions', [h('button.kq-btn.primary', { 'data-testid': 'ending-next', onclick: () => this.epilogue() }, t('story.end.next'))]),
    ]);
  }

  private epilogue(): void {
    const id = this.ending!;
    const e = this.d.epilogue(id);
    this.page('epilogue', `kqs-end-${id}`, [
      h('div.kqs-epilogue', { 'data-testid': 'epilogue' }, [
        h('div.kqs-epi-plate', [
          h('div.kqs-end-kicker', t('story.end.epilogue')),
          h('p.kqs-epi-intro', e.intro),
          ...e.lines.map((l) => h('p.kqs-epi-line', l)),
          e.object ? h('p.kqs-epi-object', e.object) : null,
          h('p.kqs-epi-outro', e.outro),
          e.coda ? h('p.kqs-epi-coda', e.coda) : null,
        ]),
      ]),
      h('div.actions', [h('button.kq-btn.primary', { 'data-testid': 'ending-credits', onclick: () => this.credits() }, t('story.end.credits'))]),
    ]);
  }

  private creditKeys: ((e: KeyboardEvent) => void) | null = null;

  private dropCreditKeys(): void {
    if (this.creditKeys) document.removeEventListener('keydown', this.creditKeys);
    this.creditKeys = null;
  }

  /** The credits roll (also reachable directly for tests). */
  credits(): void {
    if (!this.open) this.show();
    const sec = (title: string, ...kids: (HTMLElement | string | null)[]) => h('section.kqs-cr-sec', [h('h3', title), ...kids]);
    const attrib = this.d.attribution();
    const roll = h('div.kqs-cr-roll', [
      h('div.kqs-cr-title', t('story.credits.title')),
      h('div.kqs-cr-sub', t('story.credits.sub')),
      h('p.kqs-cr-made', 'Ein Spiel über einen Ort, den es nicht mehr gibt.'),
      sec(t('story.credits.idea'), h('p', t('story.credits.made'))),
      sec('In Erinnerung an', h('p', 'die Arbeiter am Karlsberg, deren Namen nicht überliefert sind, und an Major Magnier und seine Leute, Dezember 1785.')),
      sec(t('story.credits.sources'), h('ul', CREDIT_SOURCES.map((s) => h('li', [s.label, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, new URL(s.url).hostname.replace(/^www\./, ''))])))),
      sec(
        t('story.credits.data'),
        // player-facing: one clean label, one holder, the licence once (CREDIT_DATA)
        h('ul', creditData(attrib).map((a) => h('li', [h('b', `${a.label}: `), a.text, ` — ${a.licence}`]))),
      ),
      sec(t('story.credits.fiction'), h('p', t('story.credits.fictionText'))),
      sec('Bild und Klang', h('p', t('story.credits.sound')), h('p', t('story.credits.fonts'))),
      h('p.kqs-cr-motto', t('story.credits.motto')),
      h('p.kqs-cr-note', 'Der Karlsberg ist ein Bodendenkmal. Funde gehören gemeldet, nicht mitgenommen.'),
      h('p.kqs-cr-thanks', t('story.credits.thanks')),
      h('p.kqs-cr-thanks', 'Danke an alle, die den Karlsberg pflegen, erforschen und erklären.'),
      h('p.kqs-cr-end', `${this.d.name() || t('story.name.default')} · Feldbuch geschlossen`),
    ]);
    const viewport = h('div.kqs-cr-view', { 'data-testid': 'credits' }, roll);
    if (this.d.reducedMotion()) viewport.classList.add('kqs-static');
    else {
      // the roll keeps running (a resting cursor no longer freezes it); wheel and arrow keys scrub
      const scrub = (s: number) => {
        const a = roll.getAnimations?.()[0];
        if (!a) return;
        const now = Number(a.currentTime ?? 0);
        a.currentTime = Math.max(0, Math.min(95_000, now + s * 1000));
      };
      viewport.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          scrub(Math.sign(e.deltaY) * Math.min(6, Math.abs(e.deltaY) / 25));
        },
        { passive: false },
      );
      this.creditKeys = (e: KeyboardEvent) => {
        if (e.code === 'ArrowDown' || e.code === 'PageDown') scrub(e.code === 'PageDown' ? 10 : 3);
        else if (e.code === 'ArrowUp' || e.code === 'PageUp') scrub(e.code === 'PageUp' ? -10 : -3);
      };
      document.addEventListener('keydown', this.creditKeys);
    }
    this.page('credits', 'kqs-end-credits', [
      viewport,
      h('div.actions', [
        h('button.kq-btn.primary', { 'data-testid': 'credits-back', onclick: () => (this.dropCreditKeys(), this.close(), this.d.finished()) }, t('story.end.back')),
      ]),
    ]);
  }
}
