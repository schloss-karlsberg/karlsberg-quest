import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureUi } from '../e2e/mobile/measure';
import { clippedSkillCardContent, pauseDialogueHit } from '../e2e/mobile/probes';

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
  checkVisibility() { return true; }
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

describe('small-landscape Pause regression probe', () => {
  it('requires visible dialogue and an intersection owned by the paper', () => {
    const paper = new Region('pause-menu', new Rect(150, 20, 405, 325), '.kq-modal');
    const button = new Region('resume', new Rect(175, 48, 100, 44), 'button', 'BUTTON', paper);
    const dialogueBody = (x: number) => new Region('dialogue', new Rect(x, 26, 175, 100), '.kqs-dlg-body');
    let dialogue: Region | null = null;
    const elementFromPoint = vi.fn(() => dialogue ?? button);
    vi.stubGlobal('window', { innerWidth: 667, innerHeight: 375 });
    vi.stubGlobal('document', { querySelector: () => dialogue, elementFromPoint });
    const probe = () => pauseDialogueHit(button as unknown as HTMLElement);

    expect(probe()).toBe('no-dialogue');
    dialogue = dialogueBody(0);
    vi.spyOn(dialogue, 'checkVisibility').mockReturnValueOnce(false);
    expect(probe()).toBe('no-dialogue');
    dialogue = dialogueBody(-30);
    expect(probe()).toBe('no-intersection');
    expect(elementFromPoint).not.toHaveBeenCalled();
    dialogue = dialogueBody(0);
    expect(probe()).toBe('obstructed');
    elementFromPoint.mockReturnValueOnce(button);
    expect(probe()).toBe('paper');
    expect(elementFromPoint).toHaveBeenLastCalledWith(162.5, 76);
  });
});

describe('settled skill card clipping probe', () => {
  it('ignores decorative overflow and reports both clipped text fragments and the stamp', () => {
    const card = new Region('skill-card', new Rect(40, 146, 210, 115), '.kqk-card');
    const body = new Region('body', new Rect(102, 150, 134, 80), '.kqk-body');
    const stampBounds = vi.fn(() => new Rect(142, 229, 96, 30));
    const stamp = { checkVisibility: () => true, getBoundingClientRect: stampBounds };
    const querySelector = vi.fn((selector: string) => selector === '.kqk-stamp' ? stamp : body);
    const text = { textContent: 'Einen Bauplan öffnen' };
    const getClientRects = vi.fn(() => [new Rect(102, 188, 125, 15), new Rect(102, 207, 48, 15)]);
    vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 });
    vi.stubGlobal('getComputedStyle', () => ({ borderLeftWidth: '3px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px' }));
    vi.stubGlobal('document', {
      createTreeWalker: () => ({ nextNode: vi.fn().mockReturnValueOnce(text).mockReturnValue(null) }),
      createRange: () => ({ selectNodeContents: vi.fn(), getClientRects }),
    });
    const el = Object.assign(card, { querySelector, scrollHeight: 180, clientHeight: 115 }) as unknown as HTMLElement;

    expect(clippedSkillCardContent(el)).toEqual([]);
    stampBounds.mockReturnValueOnce(new Rect(142, 241, 96, 30));
    getClientRects.mockReturnValueOnce([new Rect(102, 188, 125, 15), new Rect(102, 254, 48, 15)]);
    expect(clippedSkillCardContent(el)).toEqual(['clipped stamp', 'clipped text: Einen Bauplan öffnen']);
  });
});
