import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { DEFAULT_BINDINGS, Input, virtualCode } from '../src/player/input';
import { Player } from '../src/player/player';
import { STANCES } from '../src/player/stance';
import { TOUCH, TOUCH_BUTTON_ACTIONS, crouchButtonMode, diffHeld, isTouchSetting, lookDelta, rotateWanted, stickToMove, touchActive, touchIconFor, touchName, touchPromptIcon } from '../src/player/touchMap';
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
    expect(stickToMove(0, -R * 0.5).actions).toEqual(['forward']);
    expect(stickToMove(0, -R * 0.91).actions).toEqual(['forward']);
    expect(stickToMove(0, -R * 0.92).actions).toEqual(['forward', 'sprint']);
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
    expect(touchIconFor('1')).toBe('fly');
    expect(touchIconFor('Geisterblick')).toBe('fly');
    expect(touchIconFor('2')).toBe('relief');
    expect(touchIconFor('Leertaste')).toBe('dodge');
    expect(touchIconFor('Maus rechts')).toBe('bannlicht');
    expect(touchIconFor('J')).toBe('interact');
    expect(touchIconFor('G / Maus rechts')).toBe('bannlicht');
  });
  it('falls back to the interact button', () => {
    expect(touchIconFor('Ü')).toBe('interact');
  });
  it('maps N to the phone and C to the crouch button', () => {
    expect(touchIconFor('N')).toBe('photo');
    expect(touchIconFor('C')).toBe('crouch');
    expect(touchIconFor('Ducken')).toBe('crouch');
    expect(touchIconFor('Sinken')).toBe('crouch');
  });
  it('maps the finale hints to the prone and lantern controls', () => {
    expect(touchIconFor('X')).toBe('prone');
    expect(touchIconFor('L')).toBe('lantern');
    expect(touchIconFor('Hinlegen')).toBe('prone');
    expect(touchIconFor('Laterne')).toBe('lantern');
  });
  it('gives the mouse (look / aim) the swipe hint, never the interact hand', () => {
    expect(touchIconFor('Maus')).toBe('look');
    expect(touchIconFor('Maus / Pfeiltasten')).toBe('look');
    expect(touchPromptIcon('Maus', 'Umsehen')).toBe('look');
    // the mouse buttons keep their own buttons
    expect(touchIconFor('Maus links')).toBe('attack');
    expect(touchIconFor('Maus rechts')).toBe('bannlicht');
  });
});

describe('crouchButtonMode', () => {
  it('toggles crouching on foot and is active while crouched', () => {
    expect(crouchButtonMode(false, 'stand')).toEqual({ icon: 'crouch', on: false, label: 'touch.crouch' });
    expect(crouchButtonMode(false, 'crouch')).toEqual({ icon: 'crouch', on: true, label: 'touch.crouch' });
    expect(crouchButtonMode(false, 'prone').on).toBe(false);
  });
  it('sinks while flying', () => {
    expect(crouchButtonMode(true, 'stand')).toEqual({ icon: 'down', on: false, label: 'touch.down' });
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
  it('uses the same control to crouch on foot and descend in flight', () => {
    const input = make();
    const player = new Player({
      heightAt: () => 0,
      collide: (x, z) => ({ x, z, hit: false }),
      bounds: () => ({ x0: -10, z0: -10, x1: 10, z1: 10 }),
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      canFly: () => true,
    }, input, new EventBus());
    const hold = (down: boolean) => TOUCH_BUTTON_ACTIONS.crouch.forEach((action) => input.press(action, down));
    hold(true);
    hold(false);
    player.update(1 / 60);
    input.endStep();
    expect(player.stance).toBe('crouch');

    player.setFlying(true);
    for (let i = 0; i < 180; i++) player.update(1 / 60);
    const altitude = player.position.y;
    hold(true);
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    hold(false);
    expect(player.position.y).toBeLessThan(altitude);
    expect(player.stance).toBe('stand');
  });
  it('notifies touch controls after restoring the grounded player and saved stance', () => {
    const events = new EventBus();
    const player = new Player({
      heightAt: () => 2,
      collide: (x, z) => ({ x, z, hit: false }),
      bounds: () => ({ x0: -10, z0: -10, x1: 10, z1: 10 }),
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      canFly: () => true,
    }, make(), events);
    player.setFlying(true);
    const observed: unknown[] = [];
    events.on('player:restored', () => observed.push({
      flying: player.flying,
      stance: player.stance,
      y: player.position.y,
      eye: player.eyeHeight,
    }));
    player.readState({ x: 3, y: 30, z: 4, yaw: 0, pitch: 0, flying: true, stance: 'prone' });
    expect(observed).toEqual([{ flying: false, stance: 'prone', y: 2, eye: STANCES.prone.eye }]);
  });
  it('reads the Shift modifier at the relief key press', () => {
    const inp = make();
    inp.simulate('ShiftLeft', true);
    inp.simulate('Digit2', true);
    inp.simulate('Digit2', false);
    inp.simulate('ShiftLeft', false);
    expect(inp.wasPressedWithShift('scan')).toBe(true);
    inp.endStep();
    inp.press('scan', true);
    expect(inp.wasPressed('scan')).toBe(true);
    expect(inp.wasPressedWithShift('scan')).toBe(false);
  });
  it('works after the player remapped the key', () => {
    const inp = make();
    inp.setBindings({ attack: ['KeyZ'] });
    inp.simulate('KeyK', true);
    expect(inp.wasPressed('attack')).toBe(false);
    inp.simulate('KeyZ', true);
    inp.muted.add('attack');
    expect(inp.isDown('attack')).toBe(false);
    expect(inp.wasPressed('attack', true)).toBe(true);
    inp.muted.delete('attack');
    inp.simulate('KeyZ', false);
    expect(inp.isDown('attack')).toBe(false);
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
    expect(actionLabel(touch, 'map')).toBe('Karte');
    expect(actionLabel(touch, 'prone')).toBe('Hinlegen');
    expect(actionLabel(touch, 'lantern')).toBe('Laterne');
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

describe('rotateWanted (M-02)', () => {
  const q = { touch: true, width: 375, height: 667, inGame: true };
  it('asks a portrait phone in gameplay to turn', () => {
    expect(rotateWanted(q)).toBe(true);
    expect(rotateWanted({ ...q, width: 430, height: 932 })).toBe(true);
  });
  it('leaves the title and the new-game screens alone', () => {
    expect(rotateWanted({ ...q, inGame: false })).toBe(false);
  });
  it('never shows in landscape, without touch, or on a tablet', () => {
    expect(rotateWanted({ ...q, width: 667, height: 375 })).toBe(false);
    expect(rotateWanted({ ...q, touch: false })).toBe(false);
    expect(rotateWanted({ ...q, width: 820, height: 1180 })).toBe(false);
    expect(rotateWanted({ ...q, width: 600, height: 960 })).toBe(false);
  });
  it('asks the tour phone to rotate in Auto before the first touch, and unblocks it in landscape', () => {
    const portrait = { ...q, width: 390, height: 844 };
    const touch = touchActive('auto', true, false);
    expect(rotateWanted({ ...portrait, touch })).toBe(true);
    expect(rotateWanted({ ...portrait, touch, width: 844, height: 390 })).toBe(false);
    expect(rotateWanted({ ...portrait, touch: touchActive('auto', false, false) })).toBe(false);
  });
});

describe('touchPromptIcon (M-05)', () => {
  it('leaves a movement prompt to the stick', () => {
    expect(touchPromptIcon('W A S D', 'Gehen · ins Bild klicken, dann Maus: Schauen')).toBeNull();
    expect(touchPromptIcon('WASD', 'Gehen')).toBeNull();
    expect(touchPromptIcon('Umschalt', 'Zum Rennen ganz vor')).toBeNull();
  });
  it('maps keys and key-less interact prompts as before', () => {
    expect(touchPromptIcon('E', 'Untersuchen')).toBe('interact');
    expect(touchPromptIcon('Q', 'Epoche wechseln')).toBe('shift');
    expect(touchPromptIcon(null, 'Lauschen')).toBe('interact');
    expect(touchPromptIcon(null, '')).toBeNull();
  });
});
