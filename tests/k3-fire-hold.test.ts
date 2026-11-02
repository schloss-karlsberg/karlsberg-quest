import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Footprint, Room } from '../src/data/types';
import { FIRE_BASE_SECONDS, createFireSchedule } from '../src/systems/fx/fire/schedule';
import { FireSim, SMOKE_RATES } from '../src/systems/fx/fire/sim';

/**
 * Chapter 3, W5 (bible 04-kapitel-3 §9): while the Festsaal choice runs the fire's timeline stands
 * still, "so kann niemand durch die Wahl im Feuer festsitzen". The story holds the fire with the
 * flag `fire.hold`; held, the smoke meter does not fill (not even from the burning rooms below the
 * Festsaal, the "near" rule) and the player gets their breath back.
 */
const rooms = (JSON.parse(readFileSync('public/data/palace/rooms.json', 'utf8')) as { rooms: Room[] }).rooms;
const footprints = (JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as { buildings: Footprint[] }).buildings;
const units = createFireSchedule(rooms, footprints);

describe('fire hold (chapter 3, W5)', () => {
  it('a burning room fills the meter, but not while the story holds the fire', () => {
    const u = units.find((x) => x.ignite === 0 && x.kind === 'room')!;
    const sim = new FireSim(units, FIRE_BASE_SECONDS);
    sim.setClock(5);
    const e = sim.exposure(u.cx, u.floor + 0.1, u.cz);
    expect(e.state).toBe('burning');
    sim.breathe(1, e, false, false);
    expect(sim.smoke).toBeCloseTo(SMOKE_RATES.burning);
    sim.hold = true;
    sim.smoke = 0.6;
    for (let i = 0; i < 60; i++) expect(sim.breathe(1, e, false, false)).toBe(false);
    expect(sim.smoke).toBe(0);
    sim.hold = false;
    sim.breathe(1, e, false, false);
    expect(sim.smoke).toBeCloseTo(SMOKE_RATES.burning);
  });

  it('the Festsaal sits above burning rooms: held, standing there costs no breath', () => {
    const fest = units.find((x) => x.id === 'KB-B01/B01.2.og-festsaal')!;
    const sim = new FireSim(units, FIRE_BASE_SECONDS);
    sim.setClock(12);
    const e = sim.exposure(fest.cx, fest.floor + 0.1, fest.cz);
    // not inside a burning room, but next to the burning ground floor (the "near" rule)
    expect(e.nearest).toBeLessThan(6);
    sim.breathe(10, e, false, false);
    expect(sim.smoke).toBeGreaterThan(0);
    sim.hold = true;
    sim.breathe(10, e, false, false);
    expect(sim.smoke).toBe(0);
  });
});
