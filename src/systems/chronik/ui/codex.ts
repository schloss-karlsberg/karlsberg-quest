/**
 * Codex tab of the Chronik board: index cards per fact with confidence label (D/I/N/U), fiction
 * stamp and sources; a Reliefmuster section with procedural relief sketches; a legend.
 */
import type { Fact } from '../../../content/types';
import { h } from '../../../ui/dom';
import type { BoardApi } from './board';
import { drawPattern } from './sketch';

export function isReliefPattern(f: Fact): boolean {
  return (f.tags ?? []).some((t) => /relief/i.test(t)) || /(^|\.)rm\.\d+/.test(f.id);
}

interface CodexView {
  api: BoardApi;
  section: 'cards' | 'relief';
  detail: string | null;
  fresh: Set<string>;
  setSection(s: 'cards' | 'relief'): void;
  setDetail(id: string | null): void;
}

function conf(c: Fact['confidence'], t: BoardApi['t']): HTMLElement {
  return h('span.ck-conf', { dataset: { c }, title: t(`chronik.codex.${c}`), 'aria-label': `${c}: ${t(`chronik.codex.${c}`)}` }, c);
}

export function renderCodex(v: CodexView): HTMLElement {
  const { api } = v;
  const t = api.t;
  const all = [...api.content.facts.values()];
  const have = new Set(api.codexFacts());
  const cards = all.filter((f) => !isReliefPattern(f));
  const relief = all.filter(isReliefPattern);
  const list = v.section === 'relief' ? relief : cards;
  const count = (l: Fact[]) => t('chronik.codex.count', { n: l.filter((f) => have.has(f.id)).length, total: l.length });

  const legend = h('aside.ck-legend.kq-paper', [
    h('span.ck-pin.tl', { style: 'top:8px;left:12px' }),
    h('h4', t('chronik.codex.legend')),
    h('dl', [
      ...(['D', 'I', 'N', 'U'] as const).flatMap((c) => [h('dt', conf(c, t)), h('dd', t(`chronik.codex.${c}`))]),
      h('dt', h('span.ck-fic', '!')),
      h('dd', t('chronik.codex.fiction')),
    ]),
    h('div.switch', [
      h('button.kq-btn', { type: 'button', 'aria-pressed': String(v.section === 'cards'), dataset: { testid: 'codex-cards' }, onclick: () => v.setSection('cards') }, `${t('chronik.codex.cards')} · ${count(cards)}`),
      h('button.kq-btn', { type: 'button', 'aria-pressed': String(v.section === 'relief'), dataset: { testid: 'codex-relief' }, onclick: () => v.setSection('relief') }, `${t('chronik.codex.relief')} · ${count(relief)}`),
    ]),
  ]);

  const grid = h('div.ck-grid', { dataset: { testid: 'codex-grid' } });
  // unlocked first (in content order), then the locked backs
  const sorted = [...list.filter((f) => have.has(f.id)), ...list.filter((f) => !have.has(f.id))];
  for (const f of sorted) {
    if (!have.has(f.id)) {
      grid.append(h('div.ck-cx.locked', { dataset: { fact: f.id }, 'aria-label': t('chronik.codex.locked') }, [h('span.qm', '?'), h('span.t', t('chronik.codex.locked'))]));
      continue;
    }
    const kids: (HTMLElement | null)[] = [h('span.t', f.title_de), conf(f.confidence, t)];
    if (v.section === 'relief') {
      const c = h('canvas', { width: 220, height: 220 });
      drawPattern(c, `${f.title_de} ${f.id}`, 220);
      kids.push(c);
    } else kids.push(h('span.x', f.text_de.replace(/^PLATZHALTER(?: \([^)]*\))?\.?\s*/, '')));
    if (f.fiction) kids.push(h('span.ck-fic', t('chronik.fiction')));
    grid.append(h(`button.ck-cx${v.fresh.has(f.id) ? '.fresh' : ''}`, { type: 'button', dataset: { fact: f.id }, onclick: () => v.setDetail(f.id) }, kids));
  }
  const wrap = h('div.ck-grid-wrap', [h('h4', `${v.section === 'relief' ? t('chronik.codex.relief') : t('chronik.codex.cards')} · ${count(list)}`), grid]);
  const root = h('div.ck-codex', [legend, wrap]);

  const f = v.detail ? api.content.facts.get(v.detail) : undefined;
  if (f && have.has(f.id)) {
    const canvas = isReliefPattern(f) ? h('canvas', { width: 240, height: 240 }) : null;
    if (canvas) drawPattern(canvas, `${f.title_de} ${f.id}`, 240);
    const detail = h('div.ck-detail.kq-paper', { role: 'dialog', 'aria-label': f.title_de, dataset: { testid: 'codex-detail' } }, [
      h('button.close', { type: 'button', 'aria-label': t('chronik.codex.back'), onclick: () => v.setDetail(null) }, '×'),
      h('h3', f.title_de),
      h('div.meta', [conf(f.confidence, t), h('span', t(`chronik.codex.${f.confidence}`)), f.fiction ? h('span.ck-fic', t('chronik.fiction')) : null]),
      canvas,
      h('p', f.text_de.replace(/^PLATZHALTER(?: \([^)]*\))?\.?\s*/, '')),
      f.contested_de ? h('p.contested', [h('b', `${t('chronik.codex.contested')}: `), f.contested_de]) : null,
      f.sources.length
        ? h('div', [
            h('b', { style: 'font-family:var(--sc);font-weight:400' }, t('chronik.codex.sources')),
            h(
              'ul',
              f.sources.map((s) => h('li', [h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.label ?? s.url), s.note ? ` – ${s.note}` : ''])),
            ),
          ])
        : null,
      f.licence ? h('p', { style: 'font-size:14px;color:var(--ink-soft)' }, `${t('chronik.codex.licence')}: ${f.licence}`) : null,
    ]);
    root.append(h('div.ck-detail-layer', { onclick: (e: MouseEvent) => e.target === e.currentTarget && v.setDetail(null) }, detail));
  }
  return root;
}
