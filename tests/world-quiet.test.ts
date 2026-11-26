/**
 * 'world:quiet' (src/core/quiet.ts): the party asks the world to hold still. Marker roots (travel
 * tripods, chronik clue markers, quest beacons) hide and the survey points are not eingemessen
 * while quiet; both come back after, and a held point activates normally then.
 */
import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { QuietGate, hideWhileQuiet } from '../src/core/quiet';
import { mayActivate, pointById } from '../src/systems/travel/points';
import { TF01 } from '../src/systems/party/placements';

describe('world:quiet', () => {
  it('hides the marker roots while quiet and shows them again after', () => {
    const bus = new EventBus();
    const tripods = new Group();
    const clues = new Group();
    const beacons = new Group();
    hideWhileQuiet(bus, tripods);
    hideWhileQuiet(bus, clues, beacons);
    bus.emit('world:quiet', { on: true, reason: 'party' });
    expect([tripods.visible, clues.visible, beacons.visible]).toEqual([false, false, false]);
    bus.emit('world:quiet', { on: false, reason: 'party' });
    expect([tripods.visible, clues.visible, beacons.visible]).toEqual([true, true, true]);
  });

  it('reasons stack: the world wakes when the last one lets go; a repeated on/off is idempotent', () => {
    const bus = new EventBus();
    const changes: boolean[] = [];
    const g = new QuietGate(bus, (q) => changes.push(q));
    bus.emit('world:quiet', { on: true, reason: 'party' });
    bus.emit('world:quiet', { on: true, reason: 'party' });
    bus.emit('world:quiet', { on: true, reason: 'cutscene' });
    bus.emit('world:quiet', { on: false, reason: 'party' });
    expect(g.quiet).toBe(true);
    bus.emit('world:quiet', { on: false, reason: 'cutscene' });
    bus.emit('world:quiet', { on: false, reason: 'cutscene' });
    expect(g.quiet).toBe(false);
    expect(changes).toEqual([true, false]);
    g.dispose();
    bus.emit('world:quiet', { on: true, reason: 'party' });
    expect(g.quiet).toBe(false);
  });

  it('the phone hides gameplay markers until close without holding world triggers', () => {
    const bus = new EventBus();
    const beacon = new Group();
    const gate = hideWhileQuiet(bus, beacon);

    bus.emit('photo:open', {});
    expect(beacon.visible).toBe(false);
    expect(gate.quiet).toBe(false);
    bus.emit('photo:close', {});
    expect(beacon.visible).toBe(true);

    bus.emit('world:quiet', { on: true, reason: 'party' });
    bus.emit('photo:open', {});
    bus.emit('photo:close', {});
    expect(beacon.visible).toBe(false);
    bus.emit('world:quiet', { on: false, reason: 'party' });
    expect(beacon.visible).toBe(true);

    gate.dispose();
    bus.emit('photo:open', {});
    expect(beacon.visible).toBe(true);
  });

  it('holds the Ehrenhof tripod while quiet (the party clearing lies in its radius) and activates it normally after', () => {
    const bus = new EventBus();
    const g = new QuietGate(bus);
    const p = pointById('ehrenhof')!;
    // a guest walking about the clearing next to TF-01 stands inside the tripod's 16 m
    const d = Math.hypot(p.x - (TF01.x + 6), p.z - (TF01.z - 6));
    const activated: string[] = [];
    const step = () => {
      if (mayActivate(p, d, activated, { flying: false, quiet: g.quiet })) activated.push(p.id);
    };
    bus.emit('world:quiet', { on: true, reason: 'party' });
    for (let i = 0; i < 5; i++) step();
    expect(activated).toEqual([]);
    bus.emit('world:quiet', { on: false, reason: 'party' });
    step();
    step();
    expect(activated).toEqual(['ehrenhof']);
    // the usual rules still hold: not while flying, not outside the radius
    expect(mayActivate(p, 1, [], { flying: true, quiet: false })).toBe(false);
    expect(mayActivate(p, 40, [], { flying: false, quiet: false })).toBe(false);
  });
});
