/**
 * M-11 (phone pass): card, banner and the chapter's first radio line all landed in the first
 * second. A chapter's opening beat timeline now starts counting once the title card has faded
 * (sounds, captions, objectives, quest offers and lines keep their relative timing); lines from
 * other sources (a quest offer's greeting, barks) are held by the presenter meanwhile. The hold
 * runs on game time; a place card does not hold; the curtain / ending table let go.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type StoryEnv, StoryEngine, createStorySlice, waitsForChapterCard } from '../src/systems/story/engine';
import { CARD_FADE_HOLD, CardLineHold, cardClockDt } from '../src/systems/story/overlays';
import type { Action, StoryFile } from '../src/systems/story/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const story = (f: string) => JSON.parse(readFileSync(`${ROOT}content/story/${f}`, 'utf8')) as StoryFile;

/** The opening beat's enter list with each action's time and whether it waits for the card. */
function opening(f: StoryFile): { a: Action; at: number; waits: boolean }[] {
  const b = f.beats.find((x) => x.id === f.start) ?? f.beats[0]!;
  let at = 0;
  return (b.enter ?? []).map((a) => {
    at += a.delay ?? 0;
    return { a, at, waits: waitsForChapterCard(a, at) };
  });
}

describe('chapter card holds the spoken lines', () => {
  it('holds while a chapter card shows and through most of its fade, then lets go', () => {
    const h = new CardLineHold();
    expect(h.holding()).toBe(false);
    h.show(true);
    h.tick(3);
    expect(h.holding()).toBe(true);
    h.hide();
    expect(h.holding()).toBe(true);
    h.tick(CARD_FADE_HOLD / 2);
    expect(h.holding()).toBe(true);
    h.tick(CARD_FADE_HOLD);
    expect(h.holding()).toBe(false);
  });

  it('waits behind the pause menu (no game time, no fade)', () => {
    const h = new CardLineHold();
    h.show(true);
    h.hide();
    for (let i = 0; i < 100; i++) h.tick(0);
    expect(h.holding()).toBe(true);
  });

  it('a place card does not hold', () => {
    const h = new CardLineHold();
    h.show(false);
    expect(h.holding()).toBe(false);
    h.hide();
    expect(h.holding()).toBe(false);
  });

  it('a card taken out of the page (screenshot helpers) holds no longer; drop lets go at once', () => {
    const h = new CardLineHold();
    h.show(true);
    expect(h.holding(false)).toBe(false);
    h.hide();
    h.drop();
    expect(h.holding()).toBe(false);
  });

  it('a new chapter card restarts the hold', () => {
    const h = new CardLineHold();
    h.show(true);
    h.hide();
    h.show(true);
    h.tick(CARD_FADE_HOLD * 2);
    expect(h.holding()).toBe(true);
  });
});

describe('the opening beat timeline waits for the chapter card', () => {
  it('silent setup at time 0 runs under the card; what the player sees or hears waits', () => {
    expect(waitsForChapterCard({ do: 'look', time: 'day' } as Action, 0)).toBe(false);
    expect(waitsForChapterCard({ do: 'flag', set: { a: 1 } } as Action, 0)).toBe(false);
    for (const a of [{ do: 'objective', text: 'x' }, { do: 'prompt', text: 'x' }, { do: 'quest', op: 'offer', id: 'q' }, { do: 'say', speaker: 'laub', text: 'x' }, { do: 'sound', sound: 'radio' }])
      expect(waitsForChapterCard(a as Action, 0)).toBe(true);
    // anything later in the timeline keeps its distance to what came before
    expect(waitsForChapterCard({ do: 'flag', set: { a: 1 } } as Action, 0.5)).toBe(true);
  });

  it('tour t1: movement prompt precedes the waypoint and both wait for the card', () => {
    const first = opening(story('00-tour.story.json')).filter((x) => x.a.do === 'prompt' || x.a.do === 'objective');
    expect(first.map((x) => x.a.do)).toEqual(['prompt', 'objective']);
    expect(first.every((x) => x.waits)).toBe(true);
    expect(first[0]!.at).toBeLessThan(first[1]!.at);
  });

  it('kapitel 4: jumping to k4_13, the resting pack round Jost waits for the card', () => {
    // e2e/stage-k2k4.spec.ts stepped 208 updates (3.5 s) after goto('k4', 'k4_13') and found no
    // tableau: the cue waits for the chapter card (5.5 s + 0.8 s), so the spec flushes the timeline
    const b = story('04-kapitel-4.story.json').beats.find((x) => x.id === 'k4_13')!;
    const cue = (b.enter ?? []).find((a) => a.do === 'cue' && a.id === 'hunt:tableau')!;
    expect(waitsForChapterCard(cue, cue.delay ?? 0)).toBe(true);
    const h = new CardLineHold();
    h.show(true);
    for (const n of [4, 4, 200]) {
      for (let i = 0; i < n; i++) h.tick(cardClockDt('update', true, false, 1 / 60));
      h.tick(cardClockDt('frame', true, false, 1 / 60));
    }
    expect(h.holding()).toBe(true);
  });

  it('kapitel 1: the arrival beat sets the world up under the card; only the court’s watch waits for it', () => {
    // „Der Hof“ opens in 1789 where the tour's touch left the player: the people stand at once,
    // nothing is said, offered or pointed at in the beat's own list. Laub's arrival lines come from
    // its 1789 reaction (held by the presenter until the card has faded) and end the beat, so the
    // quests of k1_0b never land on the card.
    const file = story('01-kapitel-1.story.json');
    const k1 = opening(file);
    expect(k1.length).toBeGreaterThan(10);
    expect(k1.filter((x) => x.waits).map((x) => x.a.do)).toEqual(['cue']);
    expect(k1.some((x) => ['say', 'sound', 'objective', 'quest', 'toast', 'prompt'].includes(x.a.do))).toBe(false);
    const arrival = file.beats[0]!.on!.find((r) => r.id === 'k1_0.damals')!;
    expect(arrival.when).toEqual({ era: '1789' });
    expect(arrival.do.map((a) => (a.do === 'say' ? a.id : a.do))).toEqual(['laub.k1.brunnenstube', 'laub.k1.fremde', 'flag']);
    expect(arrival.do.filter((a) => a.do === 'say').every((a) => a.wait === true)).toBe(true);
    expect(file.beats[0]!.complete).toEqual({ all: [{ era: '1789' }, { flag: 'k1.angekommen' }] });
  });
});

describe('the opening beat clocks restart when the chapter card lets go', () => {
  const env: StoryEnv = {
    era: 'today',
    x: 529,
    z: -795,
    // the greeting has played: t1 also waits for its say chain, which sets this flag in the game
    flags: { 'tour.welcome': true },
    inventory: { clues: [], nouns: [], items: [] },
    chronik: {},
    scan: 0,
    map: false,
    stance: 'stand',
    lantern: false,
    caseFacts: () => null,
  };
  const tourStart = () => {
    const slice = createStorySlice();
    const engine = new StoryEngine([story('00-tour.story.json')], () => slice, {
      run: () => undefined,
      chapterEntered: () => undefined,
      beatEntered: () => undefined,
      chapterCompleted: () => undefined,
    });
    engine.goto('tour');
    const step = (s: number) => {
      for (let i = 0; i < Math.round(s * 10); i++) engine.tick(0.1, env);
    };
    const finished = () => slice.beat === 't2';
    return { engine, slice, step, finished };
  };

  it('tour t1: the 25 s arrival fallback counts from the release', () => {
    const t = tourStart();
    // under the chapter card (5.5 s + 0.8 s of the fade)
    t.step(6.3);
    expect(t.finished()).toBe(false);
    t.engine.restartClock('tour', 't1');
    expect(t.slice.beatTime).toBe(0);
    t.step(24.8);
    expect(t.finished()).toBe(false);
    t.step(0.4);
    expect(t.finished()).toBe(true);
  });

  it('without a card (or for another beat) the clock is left alone', () => {
    const t = tourStart();
    t.step(6.3);
    t.engine.restartClock('tour', 't2');
    t.engine.restartClock('k1', 't1');
    t.step(19);
    expect(t.finished()).toBe(true);
  });
});

describe('the title card clock under kq.step (many fixed updates, one render)', () => {
  const DT = 1 / 60;
  /** `kq.step(n)`: n fixed updates, then one render frame (the story ticks the card from both). */
  const step = (h: CardLineHold, n: number, manual = true, paused = false) => {
    let went = false;
    for (let i = 0; i < n; i++) went = h.tick(cardClockDt('update', manual, paused, DT)) || went;
    return h.tick(cardClockDt('frame', manual, paused, DT)) || went;
  };

  it('a chapter card goes after 5.5 s of steps and lets the opening beat go 0.8 s later', () => {
    const h = new CardLineHold();
    h.show(true);
    // step(15) ×21 ≈ 5.6 s (+ 21 one-tick renders): the card goes on the step that crosses 5.5 s
    let wentAt = -1;
    for (let i = 0; i < 40 && wentAt < 0; i++) if (step(h, 15)) wentAt = i;
    expect(wentAt).toBe(20);
    expect(h.holding()).toBe(true);
    step(h, 15);
    step(h, 15);
    step(h, 15);
    expect(h.holding()).toBe(false);
  });

  it('one step(400) carries the card off and through its fade (no render frames needed)', () => {
    const h = new CardLineHold();
    h.show(true);
    expect(step(h, 400)).toBe(true);
    expect(h.holding()).toBe(false);
  });

  it('caps a chapter card on a slow frame and suspends its deadline while paused', () => {
    const h = new CardLineHold();
    h.show(true, 5.5, 100);
    h.tick(DT);
    h.setPaused(true, false, 1100);
    expect(h.tick(0, 20100)).toBe(false);
    h.setPaused(false, false, 21100);
    expect(h.tick(0, 25599)).toBe(false);
    expect(h.tick(0, 25600)).toBe(true);
    expect(h.holding()).toBe(true);
    h.tick(0, 26400);
    expect(h.holding()).toBe(false);
  });

  it.each([true, false])('holds the card when the tab or game is still paused (tab returns first: %s)', (tabFirst) => {
    const h = new CardLineHold();
    h.show(true, 5.5, 100);
    h.setPaused(false, true, 1100);
    h.setPaused(true, true, 1500);
    h.setPaused(tabFirst, !tabFirst, 21000);
    expect(h.tick(10, 22000)).toBe(false);
    h.setPaused(false, false, 23100);
    expect(h.tick(0, 27599)).toBe(false);
    expect(h.tick(0, 27600)).toBe(true);
  });

  it('a place card (the card action) goes on the same clock, holding nothing', () => {
    const h = new CardLineHold();
    h.show(false, 3.5);
    expect(h.holding()).toBe(false);
    expect(step(h, 200)).toBe(false);
    expect(step(h, 20)).toBe(true);
  });

  it('render frames move a card only in ?manual and not while paused; real play counts game time once', () => {
    expect(cardClockDt('frame', false, false, 0.016)).toBe(0);
    expect(cardClockDt('frame', true, true, 0.016)).toBe(0);
    expect(cardClockDt('frame', true, false, 0.5)).toBe(0.1);
    expect(cardClockDt('update', false, false, DT)).toBe(DT);
    // ?manual without stepping (a spec waiting in real time): frames alone carry the card off
    const h = new CardLineHold();
    h.show(true);
    let went = false;
    for (let i = 0; i < 6.3 * 60 && !went; i++) went = h.tick(cardClockDt('frame', true, false, DT));
    expect(went).toBe(true);
  });
});
