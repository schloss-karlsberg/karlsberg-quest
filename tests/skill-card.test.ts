import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTLE, UnlockCards } from '../src/systems/skills/card';

class CardElement {
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  child?: CardElement;

  append(child: CardElement): void {
    this.child = child;
  }

  remove(): void {}
}

vi.mock('../src/ui/dom', () => ({
  h: () => new CardElement(),
  svg: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

function setup(): UnlockCards {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
  return new UnlockCards(new CardElement() as unknown as HTMLElement);
}

describe('standalone skill card dismissal', () => {
  it('leaves a queued card intact and gives a visible card its full shortened fade', () => {
    const cards = setup();
    const first = { skill: 'relief', level: 2 } as const;
    cards.onStamp = vi.fn();
    cards.push(first);
    cards.dismiss();
    cards.frame(SETTLE, false, false);
    expect(cards.showing).toEqual(first);

    const next = { skill: 'kartograf', level: 3 } as const;
    cards.push(next);
    cards.dismiss();
    cards.frame(0.2, false, false);
    const el = (cards.root as unknown as CardElement).child!;
    expect(el.classes.has('kqk-out')).toBe(true);
    expect(cards.showing).toEqual(first);
    cards.dismiss();
    cards.frame(0.41, false, false);
    expect(cards.showing).toBeNull();
    expect(cards.onStamp).not.toHaveBeenCalled();
    cards.frame(SETTLE, false, false);
    expect(cards.showing).toEqual(next);
  });

  it('dismisses a grouped card in reduced motion within the same fade window', () => {
    const cards = setup();
    cards.onStamp = vi.fn();
    cards.push({ skill: 'relief', level: 2 });
    cards.push({ skill: 'kartograf', level: 3 });
    cards.frame(SETTLE, true, false);
    cards.frame(1.2, true, false);
    expect(cards.onStamp).toHaveBeenCalledTimes(2);
    cards.dismiss();
    cards.frame(UnlockCards.FADE + 0.01, true, false);
    expect(cards.busy).toBe(false);
    expect(cards.onStamp).toHaveBeenCalledTimes(2);
  });
});
