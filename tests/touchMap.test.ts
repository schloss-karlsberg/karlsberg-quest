import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, Input, virtualCode } from '../src/player/input';
import { TOUCH, diffHeld, isTouchSetting, lookDelta, stickToMove, touchActive, touchIconFor, touchName } from '../src/player/touchMap';
import { actionLabel } from '../src/ui/actionLabel';
import { mobileLevel } from '../src/render/mobileDefaults';

describe('stickToMove', () => {
  const R = TOUCH.stickRadius;
  it('does nothing inside the dead zone', () => {
    expect(stickToMove(R * 0.1, 0).actions).toEqual([]);
    expect(stickToMove(0, 0).actions).toEqual([]);
  });
  it('maps the four directions (screen y down = back)', () => {
    expect(stickToMove(0, -R * 0.6).actions).toEqual(['forward']);
    expect(stickToMove(0, R * 0.6).actions).toEqual(['back']);
    expect(stickToMove(-R * 0.6, 0).actions).toEqual(['left']);
    expect(stickToMove(R * 0.6, 0).actions).toEqual(['right']);
  });
  it('gives diagonals', () => {
    expect(stickToMove(R * 0.5, -R * 0.5).actions.sort()).toEqual(['forward', 'right']);
    expect(stickToMove(-R * 0.5, R * 0.5).actions.sort()).toEqual(['back', 'left']);
  });
  it('sprints at the rim, only forwards', () => {
    expect(stickToMove(0, -R * 2).actions).toEqual(['forward', 'sprint']);
    expect(stickToMove(0, R * 2).actions).toEqual(['back']);
    expect(stickToMove(0, -R * 0.7).actions).not.toContain('sprint');
  });
  it('clamps the knob to the radius', () => {
    const r = stickToMove(R * 3, R * 4);
    expect(Math.hypot(r.knobX, r.knobY)).toBeCloseTo(R);
    expect(r.magnitude).toBe(1);
  });
});

describe('diffHeld / lookDelta', () => {
  it('presses the new and releases the old', () => {
    expect(diffHeld(['forward', 'left'], ['forward', 'right'])).toEqual({ press: ['right'], release: ['left'] });
    expect(diffHeld([], [])).toEqual({ press: [], release: [] });
  });
  it('scales finger travel', () => {
    expect(lookDelta(10, -5, 2)).toEqual({ dx: 20, dy: -10 });
    expect(lookDelta(10, 0).dx).toBeCloseTo(10 * TOUCH.lookScale);
  });
});

describe('touch mode decision', () => {
  it('Auto follows the device and the first touch', () => {
    expect(touchActive('auto', false, false)).toBe(false);
    expect(touchActive('auto', true, false)).toBe(true);
    expect(touchActive('auto', false, true)).toBe(true);
    expect(touchActive(undefined, true, false)).toBe(true);
  });
  it('An / Aus win', () => {
    expect(touchActive('on', false, false)).toBe(true);
    expect(touchActive('off', true, true)).toBe(false);
  });
  it('validates the setting', () => {
    expect(isTouchSetting('auto')).toBe(true);
    expect(isTouchSetting('yes')).toBe(false);
  });
});

describe('prompt key → touch icon', () => {
  it('maps the known keys', () => {
    expect(touchIconFor('E')).toBe('interact');
    expect(touchIconFor('q')).toBe('shift');
    expect(touchIconFor('F')).toBe('fly');
    expect(touchIconFor('Leertaste')).toBe('dodge');
    expect(touchIconFor('Maus rechts')).toBe('bannlicht');
    expect(touchIconFor('J')).toBe('journal');
    expect(touchIconFor('G / Maus rechts')).toBe('bannlicht');
  });
  it('falls back to the interact button', () => {
    expect(touchIconFor('Ü')).toBe('interact');
  });
});

describe('mobile first-run level', () => {
  it('phones and mobile GPUs → Niedrig, big tablets → Mittel', () => {
    expect(mobileLevel('Apple GPU', 390, 6)).toBe('low');
    expect(mobileLevel('Adreno (TM) 740', 900, 8)).toBe('low');
    expect(mobileLevel('Apple GPU', 820, 8)).toBe('medium');
    expect(mobileLevel('Apple GPU', 820, 4)).toBe('low');
  });
});

describe('Input.press (virtual touch actions)', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  beforeAll(() => {
    g.window = new EventTarget();
    g.document = Object.assign(new EventTarget(), { pointerLockElement: null });
  });
  afterAll(() => {
    g.window = saved.window;
    g.document = saved.document;
  });
  const make = () => new Input(new EventTarget() as unknown as HTMLElement);

  it('holds and edges an action without touching the bindings', () => {
    const inp = make();
    inp.press('attack', true);
    expect(inp.wasPressed('attack')).toBe(true);
    expect(inp.isDown('attack')).toBe(true);
    // a virtual press is per action: the shared LMB partner is not pressed with it
    expect(inp.isDown('interact')).toBe(false);
    inp.endStep();
    expect(inp.wasPressed('attack')).toBe(false);
    expect(inp.isDown('attack')).toBe(true);
    inp.press('attack', false);
    expect(inp.isDown('attack')).toBe(false);
  });
  it('a tap inside one step still counts as a press', () => {
    const inp = make();
    inp.press('dodge', true);
    inp.press('dodge', false);
    expect(inp.wasPressed('dodge')).toBe(true);
    expect(inp.isDown('dodge')).toBe(false);
  });
  it('works after the player remapped the key', () => {
    const inp = make();
    inp.setBindings({ attack: ['KeyZ'] });
    inp.press('attack', true);
    expect(inp.isDown('attack')).toBe(true);
  });
  it('releaseVirtual lets go of every touch hold, not of real keys', () => {
    const inp = make();
    inp.press('forward', true);
    inp.simulate('KeyD', true);
    inp.releaseVirtual();
    expect(inp.isDown('forward')).toBe(false);
    expect(inp.isDown('right')).toBe(true);
    expect(virtualCode('map')).toBe('@map');
  });
  it('touch mode never requests pointer lock', () => {
    let asked = 0;
    const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => void asked++ }) as unknown as HTMLElement;
    const inp = new Input(canvas);
    inp.touchMode = true;
    inp.requestLock();
    expect(asked).toBe(0);
    inp.touchMode = false;
    inp.requestLock();
    expect(asked).toBe(1);
  });
});

describe('touch names in text (actionLabel)', () => {
  const desk = { touchMode: false, bindings: structuredClone(DEFAULT_BINDINGS) };
  const touch = { ...desk, touchMode: true };
  it('names the key on desktop', () => {
    expect(actionLabel(desk, 'dodge')).toBe('Leertaste');
    expect(actionLabel(desk, 'bannlicht', 1, 'KeyG')).toBe('G');
    expect(actionLabel(desk, 'bannlicht', 0)).toBe('Maus rechts');
    expect(actionLabel({ ...desk, bindings: { ...desk.bindings, bannlicht: [] } }, 'bannlicht', 1, 'KeyG')).toBe('G');
  });
  it('names the touch button on touch', () => {
    expect(actionLabel(touch, 'bannlicht', 1, 'KeyG')).toBe('Bannlicht');
    expect(actionLabel(touch, 'attack')).toBe('Hieb');
    expect(actionLabel(touch, 'dodge')).toBe('Ausweichen');
    expect(actionLabel(touch, 'lockOn')).toBe('Ziel');
    expect(actionLabel(touch, 'quickUse')).toBe('Balsam');
    expect(actionLabel(touch, 'listen')).toBe('Aktion');
    expect(actionLabel(touch, 'interact')).toBe('Aktion');
    expect(actionLabel(touch, 'shift')).toBe('Epoche');
    expect(actionLabel(touch, 'journal')).toBe('Feldbuch');
    expect(actionLabel(touch, 'map')).toBe('Karte');
    expect(actionLabel(touch, 'skill2')).toBe('2');
  });
  it('keeps the key for actions without a button', () => {
    expect(touchName('inventory')).toBeNull();
    expect(actionLabel(touch, 'inventory')).toBe(actionLabel(desk, 'inventory'));
  });
  it('maps touch names in prompts back to their button', () => {
    expect(touchIconFor('Aktion')).toBe('interact');
    expect(touchIconFor('Bannlicht')).toBe('bannlicht');
    expect(touchIconFor('Balsam')).toBe('balm');
    expect(touchIconFor('Ziel')).toBe('lock');
  });
});
