import { describe, expect, it } from 'vitest';
import ascent from '../content/routes/p-aufstieg.json';
import tour from '../content/routes/p-fuehrung.json';
import { ERAS } from '../src/core/era';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import ambience from '../src/systems/ambience';
import { ambienceAt } from '../src/systems/ambience/profile';

function atStop(id: string, era: (typeof ERAS)[number] = 'today') {
  const stop = [...tour.stops, ...ascent.stops].find((stop) => stop.id === id)!;
  return ambienceAt(era, stop.x, stop.z);
}

describe('tour ambience profiles', () => {
  it('covers the forest stops, the dam and pond, the spring and the plateau', () => {
    for (const stop of tour.stops.slice(0, 6)) {
      const mix = atStop(stop.id);
      expect(mix).toMatchObject({ birds: 1, pond: 0, brook: 0 });
    }
    expect(atStop('damm').pond).toBeGreaterThan(0.5);
    expect(atStop('weiher')).toMatchObject({ pond: 0.64, brook: 0 });
    expect(atStop('quelle')).toMatchObject({ pond: 0, brook: 0.58 });
    expect(atStop('plateau').wind).toBeGreaterThan(atStop('felsen').wind);
    expect(atStop('plateau').birds).toBeLessThan(atStop('felsen').birds);
  });

  it('crossfades away from the pond and into the spring ravine on the walking path', () => {
    const xz = [[897.2, -845.3], [926.4, -850.9], [955.6, -856.4], [984.7, -862], [1013.9, -867.5], [1062, -836.7]];
    const mixes = xz.map(([x, z]) => ambienceAt('today', x, z));
    expect(mixes[2]!.pond).toBeGreaterThan(0);
    expect(mixes[2]!.pond).toBeLessThan(mixes[0]!.pond);
    expect(mixes[3]!.pond).toBe(0);
    expect(mixes[4]!.brook).toBeGreaterThan(0);
    expect(mixes[4]!.brook).toBeLessThan(mixes[5]!.brook);
  });

  it('reserves court sounds for the 1789 plateau and accounts for frozen water and night', () => {
    for (const era of ERAS) {
      expect(atStop('plateau', era).court).toBe(era === '1789' ? 1 : 0);
      expect(atStop('quelle', era).court).toBe(0);
    }
    expect(atStop('weiher', '1793-02')).toMatchObject({ pond: 0, birds: 0, dread: 0.7 });
    expect(atStop('quelle', '1793-02').brook).toBe(0);
    expect(atStop('quelle', '1796')).toMatchObject({ brook: 0, birds: 0, dread: 0.3 });
    expect(atStop('weiher', '1789').pond).toBeGreaterThan(0);
  });
});

describe('ambience captions', () => {
  it('announces distinctive water once per visit and removes old captions on leaving or disposal', () => {
    const scene = captionScene();
    try {
      scene.move('weiher');
      scene.tick(5);
      expect(scene.shown).toEqual(['ambience.pond']);
      scene.move('felsen');
      expect(scene.removed).toEqual(['ambience.pond']);
      scene.move('weiher');
      scene.move('quelle');
      expect(scene.shown).toEqual(['ambience.pond', 'ambience.pond', 'ambience.brook']);
      ambience.dispose();
      expect(scene.removed).toEqual(scene.shown);
    } finally {
      ambience.dispose();
    }
  });

  it('schedules fictional hooves and court activity only in 1789, including with audio unavailable', () => {
    const scene = captionScene();
    try {
      scene.move('plateau');
      scene.tick(15);
      expect(scene.shown).toEqual([]);
      scene.era.current = '1789';
      scene.tick(3.3);
      scene.tick(9.3);
      expect(scene.shown).toEqual(['ambience.hooves (Fiktion)', 'ambience.court (Fiktion)']);
      scene.era.current = '1793-02';
      scene.tick(25);
      expect(scene.shown).toHaveLength(2);
      expect(scene.removed).toContain('ambience.court (Fiktion)');
      scene.move('weiher');
      expect(scene.shown).toHaveLength(2);
    } finally {
      ambience.dispose();
    }
  });
});

function captionScene() {
  const shown: string[] = [];
  const removed: string[] = [];
  const position = { x: 524, y: 280, z: -770 };
  const era: { current: Era } = { current: 'today' };
  const ctx = {
    audio: { unlocked: false },
    player: { position, flying: false },
    era,
    world: {},
    t: (key: string) => key,
    ui: { hud: { subtitle: (_speaker: null, key: string, _ms: number, fiction?: boolean) => {
      const caption = key + (fiction ? ' (Fiktion)' : '');
      shown.push(caption);
      return () => removed.push(caption);
    } } },
  } as unknown as GameContext;
  ambience.init(ctx);
  return {
    shown,
    removed,
    era,
    move(id: string) {
      const stop = [...tour.stops, ...ascent.stops].find((stop) => stop.id === id)!;
      Object.assign(position, { x: stop.x, z: stop.z });
      ambience.update(0.21);
    },
    tick(dt: number) { ambience.update(dt); },
  };
}
