import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import '../src/systems/contracts';
import { Hud } from '../src/ui/hud';
import { blockPromptsDuringScenes } from '../src/ui/promptBlocks';

/** A DOM stub that keeps real parent/child links, so `remove()` takes a line out of the subtitle box. */
class El {
  className = '';
  id = '';
  parent: El | null = null;
  readonly children: El[] = [];
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  constructor(readonly text = '') {}

  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  get childElementCount(): number { return this.children.length; }
  get firstElementChild(): El | null { return this.children[0] ?? null; }
  get firstChild(): El | null { return this.children[0] ?? null; }
  append(...kids: (El | string)[]): void { for (const k of kids) this.appendChild(typeof k === 'string' ? new El(k) : k); }
  appendChild(kid: El): El {
    kid.remove();
    kid.parent = this;
    this.children.push(kid);
    return kid;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...kids: El[]): void {
    for (const k of [...this.children]) k.remove();
    this.append(...kids);
  }
  setAttribute(): void {}
  removeAttribute(): void {}
  toggleAttribute(): void {}
  hasAttribute(): boolean { return false; }
  addEventListener(): void {}
  querySelector(): null { return null; }
  querySelectorAll(): El[] { return []; }
  find(test: (el: El) => boolean): El | undefined {
    if (test(this)) return this;
    for (const c of this.children) {
      const hit = c.find(test);
      if (hit) return hit;
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Node', El);
  vi.stubGlobal('document', {
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: new El(),
    createElement: (tag: string) => (tag === 'template' ? { content: { firstElementChild: new El() } } : new El()),
    createTextNode: (text: string) => new El(text),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function subtitleBox(hud: Hud) {
  const box = (hud.el as unknown as El).find((el) => el.className === 'kq-subtitles')!;
  return () => box.children.map((line) => line.textContent);
}

describe('Hud subtitles', () => {
  it('counts only sound captions (no speaker) as caption lines, so a conversation does not hold a card (TASK-074)', () => {
    const hud = new Hud();
    hud.subtitle('Imhoff', 'Hier stand das Schloss.', 4000);
    expect(hud.captionLines).toBe(0);
    const off = hud.subtitle(null, '[Diane und Bijou bellen]', 20_000);
    expect(hud.captionLines).toBe(1);
    off();
    expect(hud.captionLines).toBe(0);
    hud.subtitle('Jost', 'Diane! Bijou!', 4000);
    expect(hud.captionLines).toBe(0);
  });

  it('keeps a sound caption up for a minimum time when a burst of dialogue lines follows it', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    hud.subtitle('Jost', 'Hier lang.', 4000);
    hud.subtitle('Imhoff', 'Gleich sind wir da.', 4000);
    vi.advanceTimersByTime(2000);
    hud.subtitle(null, '[Diane und Bijou bellen]', 3500);
    hud.subtitle('Du', 'Was war das denn?', 4000);
    hud.subtitle('Jost', 'Diane! Bijou!', 4000);
    hud.subtitle('Jost', 'Da ist doch nix.', 4000);

    // The two older dialogue lines have had their minimum time and make room; the caption stays and
    // the last line waits for a free slot.
    expect(shown()).toEqual(['[Diane und Bijou bellen]', 'DuWas war das denn?', 'JostDiane! Bijou!']);
    vi.advanceTimersByTime(1499);
    expect(shown()).toEqual(['[Diane und Bijou bellen]', 'DuWas war das denn?', 'JostDiane! Bijou!']);
    // After 1.5 s the caption yields to the queued line, which is shown in order, not lost.
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual(['DuWas war das denn?', 'JostDiane! Bijou!', 'JostDa ist doch nix.']);
  });

  it('queues lines in order while every visible line is still inside its minimum time', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    for (const n of [1, 2, 3, 4, 5]) hud.subtitle('A', `${n}`, 4000);
    expect(shown()).toEqual(['A1', 'A2', 'A3']);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['A3', 'A4', 'A5']);
    vi.advanceTimersByTime(4000);
    expect(shown()).toEqual([]);
  });

  it('shows a repeated line once and extends its time instead of stacking it (TASK-093)', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    hud.subtitle(null, '[Glas klirrt leise, vorn]', 2200);
    vi.advanceTimersByTime(1000);
    const cancel = hud.subtitle(null, '[Glas klirrt leise, vorn]', 2200);
    expect(shown()).toEqual(['[Glas klirrt leise, vorn]']);
    // the repeat's own 2.2 s count from its call, not from the first line
    vi.advanceTimersByTime(2000);
    expect(shown()).toEqual(['[Glas klirrt leise, vorn]']);
    vi.advanceTimersByTime(200);
    expect(shown()).toEqual([]);

    // a shorter repeat does not cut the first line short; cancelling it removes the one line
    hud.subtitle(null, '[Messing klirrt auf Stein]', 5000);
    const short = hud.subtitle(null, '[Messing klirrt auf Stein]', 1000);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['[Messing klirrt auf Stein]']);
    short();
    expect(shown()).toEqual([]);
    cancel();
  });

  it('keeps the same text from different speakers, and does not queue a waiting line twice', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    hud.subtitle('Laub', 'Ja.', 4000);
    hud.subtitle('Du', 'Ja.', 4000);
    hud.subtitle(null, '[1]', 4000);
    hud.subtitle(null, '[2]', 4000);
    hud.subtitle(null, '[2]', 4000);
    expect(shown()).toEqual(['LaubJa.', 'DuJa.', '[1]']);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['DuJa.', '[1]', '[2]']);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['DuJa.', '[1]', '[2]']);
  });

  it('hides prompts during a conversation and brings the story prompt back afterwards (TASK-093)', () => {
    const hud = new Hud();
    const events = new EventBus();
    blockPromptsDuringScenes(events, hud);
    hud.prompt('E', 'bei Gerold: zuhören', 'story');
    events.emit('npc:conversation', { npc: 'imhoff', open: true });
    expect(hud.promptShown()).toBeNull();
    // a prompt set while talking waits too
    hud.prompt('E', 'Untersuchen', 'chronik');
    expect(hud.promptShown()).toBeNull();
    events.emit('npc:conversation', { npc: 'imhoff', open: false });
    expect(hud.promptShown()).toEqual({ owner: 'chronik', key: 'E', text: 'Untersuchen' });
    hud.prompt(null, undefined, 'chronik');
    expect(hud.promptShown()?.text).toBe('bei Gerold: zuhören');
    // a cinematic still blocks as before
    events.emit('cinematic:start', { id: 'x' } as never);
    expect(hud.promptShown()).toBeNull();
    events.emit('cinematic:end', { id: 'x' } as never);
    expect(hud.promptShown()?.owner).toBe('story');
  });

  it('shows at most two sound captions at once; a third waits its turn (TASK-085)', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    hud.subtitle(null, 'Wind rauscht.', 4000);
    hud.subtitle(null, 'Ein Bach plätschert.', 4000);
    hud.subtitle(null, 'Vögel zwitschern.', 4000);
    expect(shown()).toEqual(['Wind rauscht.', 'Ein Bach plätschert.']);
    // a spoken line still finds the free third slot
    hud.subtitle('Laub', 'Willkommen.', 4000);
    expect(shown()).toEqual(['Wind rauscht.', 'Ein Bach plätschert.']);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['Ein Bach plätschert.', 'Vögel zwitschern.', 'LaubWillkommen.']);
    expect(hud.captionLines).toBe(2);
  });

  it('removes a queued line when its owner cancels it, and lets a freed slot take the next line', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    const cancel1 = hud.subtitle('A', '[1]', 4000);
    hud.subtitle('A', '[2]', 4000);
    hud.subtitle('A', '[3]', 4000);
    const cancel4 = hud.subtitle('A', '[4]', 4000);
    hud.subtitle('A', '[5]', 4000);
    cancel4();
    cancel1();
    expect(shown()).toEqual(['A[2]', 'A[3]', 'A[5]']);
    vi.advanceTimersByTime(4000);
    expect(shown()).toEqual([]);
  });
});
