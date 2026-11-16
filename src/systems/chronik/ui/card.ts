/**
 * The field-book card shown when a clue is examined (or an echo has been heard): kind, title,
 * an etched sketch of the real terrain at the spot, the text (or the echo's transcript), the
 * fiction label, and what was newly noted (nouns, codex cards).
 */
import './chronik.css';
import type { ChronikContent, Discovery } from '../logic';
import { isStageDirection } from '../logic';
import type { ChronikClue } from '../types';
import type { ModalHandle, ModalOptions } from '../../../ui/modal';
import { h } from '../../../ui/dom';
import { drawRelief, type HeightFn } from './sketch';
import type { TranscriptLine } from '../echo';

export interface CardDeps {
  t(key: string, params?: Record<string, string | number>): string;
  open(o: ModalOptions): ModalHandle;
  content: ChronikContent;
  heightAt: HeightFn | null;
  reducedMotion: boolean;
  onChronik(): void;
}

export function openClueCard(d: CardDeps, clue: ChronikClue, found: Discovery | null, transcript?: TranscriptLine[]): ModalHandle {
  const t = d.t;
  const canvas = h('canvas', { width: 240, height: 240 });
  // a printout at the station shows the Ehrenhof, not the trailer: `sketch` wins over the find spot
  const at = clue.sketch ?? clue.where;
  const size = clue.sketch?.size ?? 70;
  if (d.heightAt) drawRelief(canvas, d.heightAt, at.x, at.z, { px: 240, size, scaleBar: size > 150 ? 100 : 20, scaleLabel: t(size > 150 ? 'chronik.card.scale100' : 'chronik.card.scale') });
  const textKids: HTMLElement[] = [];
  if (transcript?.length) {
    textKids.push(h('p', { style: 'font-style:italic;color:var(--ink-soft)' }, t('chronik.card.transcript')));
    textKids.push(
      h(
        'ul.ck-transcript',
        transcript.map((l) => (l.speaker && !isStageDirection(l.text) ? h('li', [h('b', `${l.speaker}:`), `„${l.text}“`]) : h('li.stage', l.text))),
      ),
    );
  } else if (clue.text_de) for (const para of clue.text_de.split(/\n\n+/)) textKids.push(h('p', para));
  const facts = (found?.newFacts ?? []).map((id) => d.content.facts.get(id)?.title_de ?? id);
  const body = h('div.ck-card', { dataset: { testid: 'chronik-card', clue: clue.id } }, [
    h('div.ck-card-kind', [h('span', t(`chronik.card.kind.${clue.kind}`)), clue.fiction ? h('span.ck-fic', t('chronik.fiction')) : null]),
    h('div.ck-card-grid', [h('figure', [canvas, h('figcaption', `${t('chronik.card.sketch')} · ${t(clue.sketch ? 'chronik.card.sketchStation' : 'chronik.card.sketchHere')}`)]), h('div.ck-card-text', textKids)]),
    facts.length ? h('div.ck-chips', [h('span', `${t('chronik.card.codex')}:`), ...facts.map((n, i) => chip(n, i, true))]) : null,
  ]);
  return d.open({
    title: clue.title_de,
    body,
    className: `ck-card-modal${d.reducedMotion ? ' ck-reduced' : ''}`,
    actions: [
      { label: t('chronik.card.openChronik'), onClick: () => d.onChronik() },
      { label: t('chronik.card.ok'), primary: true },
    ],
  });
}

function chip(text: string, i: number, cx = false): HTMLElement {
  const el = h(`span.ck-chip${cx ? '.cx' : ''}`, text);
  el.style.animationDelay = `${0.25 + i * 0.12}s`;
  return el;
}
