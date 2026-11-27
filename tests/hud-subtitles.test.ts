import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hud } from '../src/ui/hud';

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
  append(...kids: El[]): void { for (const k of kids) this.appendChild(k); }
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
    for (const n of [1, 2, 3, 4, 5]) hud.subtitle(null, `[${n}]`, 4000);
    expect(shown()).toEqual(['[1]', '[2]', '[3]']);
    vi.advanceTimersByTime(1500);
    expect(shown()).toEqual(['[3]', '[4]', '[5]']);
    vi.advanceTimersByTime(4000);
    expect(shown()).toEqual([]);
  });

  it('removes a queued line when its owner cancels it, and lets a freed slot take the next line', () => {
    const hud = new Hud();
    const shown = subtitleBox(hud);
    const cancel1 = hud.subtitle(null, '[1]', 4000);
    hud.subtitle(null, '[2]', 4000);
    hud.subtitle(null, '[3]', 4000);
    const cancel4 = hud.subtitle(null, '[4]', 4000);
    hud.subtitle(null, '[5]', 4000);
    cancel4();
    cancel1();
    expect(shown()).toEqual(['[2]', '[3]', '[5]']);
    vi.advanceTimersByTime(4000);
    expect(shown()).toEqual([]);
  });
});
