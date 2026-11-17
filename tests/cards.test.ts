import { describe, expect, it } from 'vitest';
import { CARD_GAP, CardDirector } from '../src/ui/cards';
import type { Hud } from '../src/ui/hud';
import type { ModalHandle, ModalManager } from '../src/ui/modal';

/** Card discipline (playtest round 4): one centre card at a time, held in fights and conversations. */
function rig() {
  const hud = { inAction: false } as unknown as Hud & { inAction: boolean };
  const open: ModalHandle[] = [];
  const modals = { get count() { return open.filter((m) => !m.closed).length; } } as unknown as ModalManager;
  const d = new CardDirector(hud, modals);
  const card = (log: string[], name: string) => () => {
    let closed = false;
    const m: ModalHandle = {
      el: null as unknown as HTMLElement,
      setBody() {},
      close() { closed = true; },
      get closed() { return closed; },
    };
    open.push(m);
    log.push(name);
    return m;
  };
  const top = () => open.filter((m) => !m.closed).at(-1)!;
  return { hud, d, card, top, open };
}

describe('CardDirector', () => {
  it('opens modal cards one after the other, never two at once', () => {
    const { d, card, top } = rig();
    const log: string[] = [];
    d.modal('clue:a', card(log, 'a'));
    d.modal('clue:b', card(log, 'b'));
    expect(log).toEqual(['a']);
    expect(d.showing).toBe('clue:a');
    expect(d.pending).toBe(1);
    top().close();
    d.tick(0.1);
    expect(log).toEqual(['a']); // a short beat between two cards
    d.tick(CARD_GAP);
    expect(log).toEqual(['a', 'b']);
    top().close();
    d.tick(1);
    expect(d.showing).toBeNull();
  });

  it('holds cards during a fight and a conversation', () => {
    const { hud, d, card } = rig();
    const log: string[] = [];
    hud.inAction = true;
    d.modal('clue:a', card(log, 'a'));
    expect(log).toEqual([]);
    expect(d.claim('level')).toBe(false);
    hud.inAction = false;
    d.hold('talk', true);
    d.tick(1);
    expect(log).toEqual([]);
    d.hold('talk', false);
    d.tick(1);
    expect(log).toEqual(['a']);
  });

  it('a slide-in card owns the slot until it releases it; a page the player asked for goes in front', () => {
    const { d, card, top } = rig();
    const log: string[] = [];
    expect(d.claim('level')).toBe(true);
    expect(d.claim('skill')).toBe(false);
    expect(d.claim('level')).toBe(true);
    expect(d.held).toBe(false);
    d.modal('clue:a', card(log, 'a'));
    // E on a clue: the page opens at once, the level card steps aside (held) and keeps its slot
    expect(log).toEqual(['a']);
    expect(d.showing).toBe('clue:a');
    expect(d.held).toBe(true);
    expect(d.claim('level')).toBe(true);
    top().close();
    d.tick(0.01);
    expect(d.held).toBe(false);
    expect(d.showing).toBe('level');
    d.release('level');
    expect(d.claim('reward')).toBe(false); // the beat between two cards
    d.tick(CARD_GAP + 0.01);
    expect(d.claim('reward')).toBe(true);
  });

  it('skill unlocks ride along on the level card (drain)', () => {
    const { d } = rig();
    let waiting = ['relief 2', 'kartograf 1'];
    d.source('skill', () => waiting.splice(0));
    expect(d.drain<string>('skill')).toEqual(['relief 2', 'kartograf 1']);
    expect(d.drain<string>('skill')).toEqual([]);
    waiting = [];
    expect(d.drain<string>('nothing')).toEqual([]);
  });
});
