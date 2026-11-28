import { describe, expect, it } from 'vitest';
import { LevelCards, dismissedClock } from '../src/systems/progression/levelup-card';
import { CARD_GAP, CardDirector, SOFT_MAX, subtitlesCoverToast } from '../src/ui/cards';
import type { ModalHandle } from '../src/ui/modal';

/** Card discipline (playtest round 4): one centre card at a time, held in fights and conversations. */
function rig() {
  let toast: string | null = null;
  let toastHeld = false;
  const hud = {
    inAction: false,
    showToast(text: string) { toast = text; toastHeld = false; },
    holdToast(held: boolean) { toastHeld = held; },
    closeToast() { toast = null; },
  };
  const open: ModalHandle[] = [];
  const modals = { get count() { return open.filter((m) => !m.closed).length; } };
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
  return { hud, d, card, top, toast: () => toastHeld ? null : toast };
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

describe('HUD toast slot', () => {
  it('drops interrupted and queued notices and clue requests when replacing the game', () => {
    const { d, toast, hud, card } = rig();
    const opened: string[] = [];
    d.enqueueToast('First'); d.enqueueToast('Waiting'); d.tick(0);
    expect(toast()).toBe('First');
    expect(d.claim('reward')).toBe(true);
    hud.inAction = true;
    d.modal('clue:old', card(opened, 'Old clue'));
    d.clear(); hud.inAction = false; d.tick(5);
    expect(opened).toEqual([]);
    expect(toast()).toBeNull();
    expect(d.dismissNotice()).toBe(false);
    d.enqueueToast('Waiting'); d.tick(0);
    expect(toast()).toBe('Waiting');
  });

  it('deduplicates the active and waiting text, bounds the queue, and observes the gap', () => {
    const { d, toast } = rig();
    d.enqueueToast('First', 2000);
    d.tick(0);
    expect(toast()).toBe('First');
    expect(d.claim('travel:banner')).toBe(false);
    d.enqueueToast('First');
    d.enqueueToast('Old');
    for (let i = 1; i <= 6; i++) d.enqueueToast(`Queued ${i}`);
    d.enqueueToast('Queued 6');
    expect(d.dismissNotice()).toBe(true);
    expect(d.dismissNotice()).toBe(false);
    d.tick(CARD_GAP / 2);
    expect(toast()).toBeNull();
    for (let i = 1; i <= 6; i++) {
      d.tick(CARD_GAP);
      expect(toast()).toBe(`Queued ${i}`);
      d.dismissNotice();
    }
    d.tick(CARD_GAP);
    expect(toast()).toBeNull();
    expect(d.claim('reward')).toBe(true);
  });

  it('holds waiting toasts through fights and talk, and resumes the active one with its time left', () => {
    const { d, hud, card, top, toast } = rig();
    d.enqueueToast('Read this', 2000);
    hud.inAction = true;
    d.tick(4);
    expect(toast()).toBeNull();
    hud.inAction = false;
    d.hold('talk', true);
    d.tick(4);
    expect(toast()).toBeNull();
    d.hold('talk', false);
    d.tick(0);
    d.tick(0.75);
    expect(toast()).toBe('Read this');

    const open = card([], 'Map');
    open(); // a regular modal that does not own the card director's slot
    d.tick(10);
    expect(toast()).toBeNull();
    expect(d.dismissNotice()).toBe(false);
    top().close();
    d.modal('clue:a', card([], 'Clue'));
    expect(d.showing).toBe('clue:a');
    d.tick(10);
    expect(toast()).toBeNull();
    top().close();
    d.tick(1);
    expect(toast()).toBe('Read this');
    d.tick(0.25);
    expect(toast()).toBeNull();
    expect(d.showing).toBeNull();
  });

  it('lets a waiting skill unlock go ahead of room toasts when a long dialogue reaches its limit', () => {
    const { d, toast } = rig();
    d.soft('dialogue', true);
    d.enqueueToast('Durchfahrt zum Küchenhof', 2000);
    d.enqueueToast('Korridor', 2000);
    d.tick(0);
    expect(d.claim('skill')).toBe(false);
    expect(toast()).toBeNull();

    // Past the limit the cards still wait for the break after the line on screen (TASK-085).
    d.tick(SOFT_MAX);
    expect(toast()).toBeNull();
    d.soft('dialogue', false);
    // The director can start a toast before the skills system next tries to claim.
    d.tick(0);
    expect(toast()).toBe('Durchfahrt zum Küchenhof');
    d.tick(0.5);
    expect(d.claim('skill')).toBe(true);
    expect(d.showing).toBe('skill');
    expect(toast()).toBeNull();
    expect(d.dismissNotice()).toBe(false);
    d.tick(6);
    expect(toast()).toBeNull();

    d.release('skill');
    d.tick(CARD_GAP / 2);
    expect(toast()).toBeNull();
    d.tick(CARD_GAP / 2);
    expect(toast()).toBe('Durchfahrt zum Küchenhof');
    d.tick(1.25);
    expect(toast()).toBe('Durchfahrt zum Küchenhof');
    d.tick(0.25);
    expect(toast()).toBeNull();
    d.tick(CARD_GAP);
    expect(toast()).toBe('Korridor');
  });
});

describe('toast vs the subtitle box (TASK-085)', () => {
  it('holds only on a short touch layout with a line in the box', () => {
    expect(subtitlesCoverToast(true, 375, 1)).toBe(true);
    expect(subtitlesCoverToast(true, 375, 0)).toBe(false);
    expect(subtitlesCoverToast(true, 820, 2)).toBe(false);
    expect(subtitlesCoverToast(false, 375, 2)).toBe(false);
  });

  it('a waiting toast waits for the caption, an up one steps aside with its clock stopped', () => {
    const { d, toast } = rig();
    let caption = true;
    d.toastHold = () => caption;
    d.enqueueToast('Laufschritt', 2000);
    d.tick(5);
    expect(toast()).toBeNull();
    expect(d.showing).toBeNull(); // the slot stays free for a level card meanwhile
    caption = false;
    d.tick(0);
    expect(toast()).toBe('Laufschritt');
    d.tick(1);
    caption = true;
    d.tick(10);
    expect(toast()).toBeNull();
    caption = false;
    d.tick(0.5);
    expect(toast()).toBe('Laufschritt');
    d.tick(0.6);
    expect(toast()).toBeNull();
  });

  it('keeps an interrupted toast hidden and the slot free until subtitles clear', () => {
    const { d, toast } = rig();
    let caption = false;
    d.toastHold = () => caption;
    d.enqueueToast('Laufschritt', 2000);
    d.tick(0);
    expect(toast()).toBe('Laufschritt');
    d.tick(0.5);
    expect(d.claim('level')).toBe(true);
    expect(toast()).toBeNull();
    caption = true;
    d.release('level');
    d.tick(5);
    expect(toast()).toBeNull();
    expect(d.showing).toBeNull();
    expect(d.dismissNotice()).toBe(false);
    caption = false;
    d.tick(5);
    expect(toast()).toBe('Laufschritt');
    d.tick(1.25);
    expect(toast()).toBe('Laufschritt');
    d.tick(0.25);
    expect(toast()).toBeNull();
  });
});

describe('CardDirector soft holds (playtest round 5)', () => {
  it('a line being spoken keeps slide-in cards back (with a short linger), but a page asked for still opens', async () => {
    const { SOFT_LINGER } = await import('../src/ui/cards');
    const { d, card, top } = rig();
    d.soft('dialogue', true);
    expect(d.claim('level')).toBe(false);
    expect(d.held).toBe(true);
    expect(d.holdReasons()).toContain('soft:dialogue');
    const log: string[] = [];
    d.modal('clue:a', card(log, 'a'));
    expect(log).toEqual(['a']);
    top().close();
    d.tick(CARD_GAP + 0.01);
    d.soft('dialogue', false);
    d.tick(SOFT_LINGER * 0.5);
    expect(d.claim('reward')).toBe(false);
    d.tick(SOFT_LINGER);
    expect(d.held).toBe(false);
    expect(d.claim('reward')).toBe(true);
    // a card on the slot steps aside while a pack is out
    d.soft('hunt', true);
    expect(d.held).toBe(true);
    expect(d.claim('reward')).toBe(true);
  });

  it('a long spell of talk does not bury a waiting card (SOFT_MAX), which still waits for a break in the lines', () => {
    const { d } = rig();
    d.soft('dialogue', true);
    d.tick(0.1);
    expect(d.claim('reward')).toBe(false);
    for (let t = 0; t < SOFT_MAX; t += 0.5) d.tick(0.5);
    // TASK-085: the line on screen is not covered, the card comes in the break after it
    expect(d.claim('reward')).toBe(false);
    expect(d.held).toBe(true);
    d.soft('dialogue', false);
    d.tick(0.1);
    expect(d.claim('reward')).toBe(true);
    expect(d.held).toBe(false);
    // once through, it stays up over the next line of the same spell (no flicker in and out)
    d.soft('dialogue', true);
    d.tick(0.5);
    expect(d.held).toBe(false);
    expect(d.claim('reward')).toBe(true);
    // after a break in the talk, the next spell holds again
    d.soft('dialogue', false);
    for (let t = 0; t < 2; t += 0.5) d.tick(0.5);
    d.soft('dialogue', true);
    d.tick(0.1);
    expect(d.held).toBe(true);
  });

  it('a card already up steps aside for a long spell of talk and comes back only in a break', () => {
    const { d } = rig();
    expect(d.claim('level')).toBe(true);
    d.soft('dialogue', true);
    d.tick(0.1);
    expect(d.held).toBe(true);
    for (let t = 0; t < SOFT_MAX + 4; t += 0.5) d.tick(0.5);
    expect(d.held).toBe(true);
    d.soft('dialogue', false);
    d.tick(0.1);
    expect(d.held).toBe(false);
  });

  it('past SOFT_MAX the next line taking the place of the one on screen lets a waiting card through', () => {
    const { d } = rig();
    const a = {}, b = {};
    d.soft('dialogue', true, a);
    d.tick(0.1);
    for (let t = 0; t < SOFT_MAX + 2; t += 0.5) {
      d.soft('dialogue', true, a);
      d.tick(0.5);
    }
    expect(d.claim('level')).toBe(false);
    d.soft('dialogue', true, b);
    d.tick(0.05);
    expect(d.claim('level')).toBe(true);
    expect(d.held).toBe(false);
    // before the limit a new line does not release anything
    d.clear();
    d.soft('dialogue', true, a);
    d.tick(1);
    d.soft('dialogue', true, b);
    d.tick(0.05);
    expect(d.held).toBe(true);
  });

  it('the level card waits while any dialogue box is open, past SOFT_MAX too (cardHeld)', () => {
    const { d } = rig();
    let box = true;
    d.dialogueOpen = () => box;
    d.soft('dialogue', true, 'a');
    for (let t = 0; t < SOFT_MAX + 2; t += 0.5) d.tick(0.5);
    d.soft('dialogue', true, 'b');
    d.tick(0.05);
    expect(d.held).toBe(false); // a toast or payout may come now
    expect(d.cardHeld).toBe(true);
    expect(d.holdReasons()).toContain('dialogue-box');
    box = false;
    expect(d.cardHeld).toBe(false);
  });

  it('a pack out (no line) still lets cards through after SOFT_MAX', () => {
    const { d } = rig();
    d.soft('hunt', true);
    d.tick(0.1);
    expect(d.claim('reward')).toBe(false);
    for (let t = 0; t < SOFT_MAX; t += 0.5) d.tick(0.5);
    expect(d.claim('reward')).toBe(true);
  });

  it.each(['level', 'skill'])('dismisses a %s card claimed with a touch callback only while it is visible', (token) => {
    const { d, hud } = rig();
    let dismissed = 0;
    expect(d.claim(token, () => dismissed++)).toBe(true);
    hud.inAction = true;
    expect(d.dismissNotice()).toBe(false);
    hud.inAction = false;
    expect(d.dismissNotice()).toBe(true);
    expect(dismissed).toBe(1);
    // without a dismiss (desktop) the tap / Escape falls through
    d.release(token);
    d.tick(CARD_GAP);
    expect(d.claim(token)).toBe(true);
    expect(d.dismissNotice()).toBe(false);
  });

  it.each(['level', 'skill'])('a %s card already up follows touch mode switching on and off', (token) => {
    const { d } = rig();
    let dismissed = 0;
    // a touch laptop: the card came up before the first touch turned the touch UI on
    expect(d.claim(token)).toBe(true);
    expect(d.dismissNotice()).toBe(false);
    expect(d.claim(token, () => dismissed++)).toBe(true);
    expect(d.dismissNotice()).toBe(true);
    expect(dismissed).toBe(1);
    // touch switched off again: Escape opens the pause menu instead
    expect(d.claim(token)).toBe(true);
    expect(d.dismissNotice()).toBe(false);
    expect(dismissed).toBe(1);
  });
});

describe('level card dismissal', () => {
  it('jumps the clock into the fade-out and never back', () => {
    const end = LevelCards.DURATION - LevelCards.FADE;
    expect(dismissedClock(0.2, LevelCards.DURATION)).toBe(end);
    expect(dismissedClock(end + 0.3, LevelCards.DURATION)).toBe(end + 0.3);
    // a card with a merged skill row runs longer; the fade still starts FADE before its end
    expect(dismissedClock(1, LevelCards.DURATION + 1.6)).toBeCloseTo(end + 1.6);
  });
});
