import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureUi } from '../e2e/mobile/measure';

class Rect {
  constructor(readonly x: number, readonly y: number, readonly width: number, readonly height: number) {}
  get left() { return this.x; }
  get top() { return this.y; }
  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }

  contains(x: number, y: number): boolean {
    return x >= this.left && x < this.right && y >= this.top && y < this.bottom;
  }
}

class Region {
  readonly classList: string[] = [];
  readonly dataset: { testid: string };
  readonly parentElement: Region | null;

  constructor(
    testid: string,
    readonly bounds: Rect,
    readonly selector: string,
    readonly tagName = 'DIV',
    readonly modal: Region | null = null,
  ) {
    this.dataset = { testid };
    this.parentElement = modal;
  }

  getAttribute() { return null; }
  getBoundingClientRect() { return this.bounds; }
  matches(selectors: string) { return selectors.split(', ').includes(this.selector); }
  contains(other: Region) { return other === this || other.parentElement === this; }
  closest(selector: string) {
    if (this.matches(selector)) return this;
    return this.modal?.matches(selector) ? this.modal : null;
  }
}

afterEach(() => vi.unstubAllGlobals());

function measurePause(dialogueAbove: boolean) {
  const dialogue = new Region('dialogue', new Rect(10, 8, 190, 105), '[data-testid=dialogue]');
  const paper = new Region('pause-menu', new Rect(150, 20, 405, 325), '.kq-modal');
  const button = new Region('resume', new Rect(175, 48, 100, 44), 'button', 'BUTTON', paper);
  // The paper intersects the dialogue's right edge. The dialogue's centre stays visible.
  const stack = dialogueAbove ? [dialogue, button, paper] : [button, paper, dialogue];
  const elementsFromPoint = (x: number, y: number) => stack.filter((el) => el.bounds.contains(x, y));

  vi.stubGlobal('window', { innerWidth: 667, innerHeight: 375 });
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible' }));
  vi.stubGlobal('document', {
    body: {},
    createTreeWalker: () => ({ nextNode: () => null }),
    elementFromPoint: (x: number, y: number) => elementsFromPoint(x, y)[0] ?? null,
    elementsFromPoint,
    querySelectorAll: (selector: string) => {
      if (selector === '.kq-modal-layer') return [];
      return selector.startsWith('button,') ? [button] : [dialogue, paper];
    },
  });

  return measureUi({ top: 0, right: 0, bottom: 0, left: 0 });
}

describe('mobile pause overlap measurement', () => {
  it('ignores dialogue behind the paper and its button even when the dialogue centre is exposed', () => {
    const result = measurePause(false);
    expect(result.taps.map((tap) => tap.what)).toContain('[resume]');
    expect(result.issues.filter((issue) => issue.kind === 'overlap')).toEqual([]);
  });

  it('reports dialogue above the modal if it covers part of a button', () => {
    const result = measurePause(true);
    expect(result.issues).toContainEqual(expect.objectContaining({
      kind: 'overlap',
      sev: 'S2',
      what: '[dialogue] ∩ [resume]',
    }));
  });
});
