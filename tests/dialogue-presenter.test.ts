import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialoguePresenter, MAX_QUEUE, type DialogueItem } from '../src/systems/story/dialogue/presenter';
import { speakerMeta } from '../src/systems/story/dialogue/speakers';
import '../src/systems/story/strings';

class ElementStub {
  classList = { add() {}, remove() {}, toggle() {} };
  dataset = {};
  style = {};
  content = { firstElementChild: null };
  append() {}
  appendChild() {}
  setAttribute() {}
  addEventListener() {}
  replaceChildren() {}
}

beforeEach(() => {
  vi.stubGlobal('Node', ElementStub);
  const createElement = () => new ElementStub();
  vi.stubGlobal('document', { body: createElement(), createElement, createTextNode: createElement });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const shown: Array<string | undefined> = [];
  const presenter = new DialoguePresenter({
    layer: new ElementStub() as unknown as HTMLElement,
    meta: speakerMeta,
    voice: null,
    reducedMotion: () => true,
    name: () => '',
    onShow: (item) => shown.push(item.id),
  });
  return { presenter, shown };
}

const line = (id: string, extra: Partial<DialogueItem> = {}): DialogueItem => ({
  id, speaker: 'laub', text: 'Weiter geht es.', ...extra,
});

describe('urgent dialogue presentation', () => {
  it('shows the dodge tutorial immediately with all waiting slots holding active continuations', () => {
    const { presenter, shown } = setup();
    const continuations = Array.from({ length: MAX_QUEUE }, (_, i) => `continuation-${i + 1}`);
    presenter.enqueue(line('opening', { group: 1 }));
    for (const id of continuations.slice(0, -1)) presenter.enqueue(line(id, { group: 1 }));
    presenter.enqueue(line(continuations.at(-1)!, { group: 1, priority: 'low' }));
    expect(presenter.pending).toBe(MAX_QUEUE);

    presenter.enqueue(line('laub.tut.dodge', { priority: 'now', text: 'Weich zur Seite aus!' }));

    expect(shown).toEqual(['opening', 'laub.tut.dodge']);
    expect(presenter.current?.id).toBe('laub.tut.dodge');
    expect(presenter.pending).toBe(MAX_QUEUE);
    expect(presenter.dropped).toBe(0);
    presenter.enqueue(line('competing-story-line'));
    expect(presenter.pending).toBe(MAX_QUEUE);
    expect(presenter.dropped).toBe(1);
    for (const id of continuations) {
      presenter.skip();
      expect(presenter.current?.id).toBe(id);
    }
    presenter.skip();
    expect(presenter.busy).toBe(false);
  });

  it('keeps a queued dodge tutorial ahead of ordinary dialogue at capacity', () => {
    const { presenter, shown } = setup();
    presenter.enqueue(line('oil-warning', { priority: 'now' }));
    const story = Array.from({ length: MAX_QUEUE }, (_, i) => `story-${i + 1}`);
    for (const id of story.slice(0, -1)) presenter.enqueue(line(id));
    presenter.enqueue(line('laub.tut.dodge', { priority: 'now' }));
    presenter.enqueue(line(story.at(-1)!));

    expect(presenter.pending).toBe(MAX_QUEUE);
    expect(presenter.dropped).toBe(1);
    for (let i = 0; i <= MAX_QUEUE; i++) presenter.skip();
    expect(shown).toEqual(['oil-warning', 'laub.tut.dodge', ...story.slice(1)]);
  });

  it('drops waiting barks on interruption and lets later urgent lines wait their turn', () => {
    const { presenter, shown } = setup();
    presenter.enqueue(line('opening'));
    presenter.enqueue(line('bark', { priority: 'low' }));
    presenter.enqueue(line('story'));
    presenter.enqueue(line('first-tip', { priority: 'now' }));
    presenter.enqueue(line('second-tip', { priority: 'now' }));
    expect(shown).toEqual(['opening', 'first-tip']);
    expect(presenter.dropped).toBe(1);
    presenter.skip();
    presenter.skip();
    expect(shown).toEqual(['opening', 'first-tip', 'second-tip', 'story']);
  });

  it('leaves the current line playing when an urgent line has expired', () => {
    const { presenter, shown } = setup();
    presenter.enqueue(line('opening'));
    presenter.enqueue(line('story'));

    presenter.enqueue(line('expired-tip', { priority: 'now', expired: () => true }));

    expect(shown).toEqual(['opening']);
    expect(presenter.pending).toBe(1);
    expect(presenter.dropped).toBe(1);
  });
});
