import { describe, expect, it, vi } from 'vitest';
import ascent from '../content/routes/p-aufstieg.json';
import tour from '../content/routes/p-fuehrung.json';
import { ERAS } from '../src/core/era';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { t } from '../src/i18n';
import ambience, { AMBIENCE_CAPTION_GAP } from '../src/systems/ambience';
import { ambienceAt } from '../src/systems/ambience/profile';

function atStop(id: string, era: (typeof ERAS)[number] = 'today') {
  const stop = [...tour.stops, ...ascent.stops].find((stop) => stop.id === id)!;
  return ambienceAt(era, stop.x, stop.z);
}

describe('tour ambience profiles', () => {
  it.each(['today', '1789'] as const)('keeps a continuous bed at every stop and waypoint in %s', (era) => {
    for (const route of [tour, ascent]) {
      for (const { id, x, z } of route.stops) {
        expect(ambienceAt(era, x, z).wind, `${route.id}/${id}`).toBeGreaterThan(0);
      }
      for (const [x, z] of route.points) {
        expect(ambienceAt(era, x!, z!).wind, `${route.id} (${x}, ${z})`).toBeGreaterThan(0);
      }
    }
  });

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

describe('campaign birdsong', () => {
  it('returns in 1789 but stays silent in both 1793 eras and the ruins', () => {
    const forest = (era: Era) => ambienceAt(era, 0, 0).birds;
    expect(forest('1789')).toBeGreaterThan(0);
    expect(forest('1789')).toBeLessThan(forest('today'));
    expect((['1793-02', '1793-07', '1796'] as const).map(forest)).toEqual([0, 0, 0]);
  });
});

describe('ambience captions', () => {
  it('announces distinctive water once per visit and removes old captions on leaving or disposal', () => {
    const scene = captionScene();
    try {
      scene.move('weiher');
      scene.tick(5);
      expect(scene.shown).toEqual(['Wasser schwappt ans Ufer.']);
      scene.move('felsen');
      expect(scene.removed).toEqual(['Wasser schwappt ans Ufer.']);
      scene.move('weiher');
      scene.move('quelle');
      expect(scene.shown).toEqual(['Wasser schwappt ans Ufer.', 'Wasser schwappt ans Ufer.', 'Ein Bach plätschert.']);
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
      // The court murmur still plays 9 s later, but its caption waits for the 30 s gap.
      expect(scene.shown).toEqual(['In der Ferne klappern Hufe. (Fiktion)']);
      scene.tick(25);
      expect(scene.shown).toEqual(['In der Ferne klappern Hufe. (Fiktion)', 'In der Ferne klappern Hufe. (Fiktion)']);
      scene.era.current = '1793-02';
      scene.tick(25);
      expect(scene.shown).toHaveLength(2);
      expect(scene.removed).toContain('In der Ferne klappern Hufe. (Fiktion)');
      scene.move('weiher');
      expect(scene.shown).toHaveLength(2);
    } finally {
      ambience.dispose();
    }
  });

  it('announces wind once per era and captions birds, including with audio unavailable', () => {
    const scene = captionScene();
    try {
      scene.move('parkplatz');
      scene.move('felsen');
      expect(scene.outdoor).toEqual(['Wind rauscht.']);
      scene.tick(3);
      expect(scene.outdoor).toEqual(['Wind rauscht.', 'Vögel zwitschern.']);
      scene.era.current = '1789';
      scene.tick(0.2);
      expect(scene.outdoor.at(-1)).toBe('Wind rauscht.');
    } finally {
      ambience.dispose();
    }
  });

  it('captions birdsong when it starts and then at most every 30 s, not on every chirp', () => {
    // Math.random() = 0 gives the shortest chirp interval (2.5 s), the worst case for caption spam.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const scene = captionScene();
    try {
      scene.move('felsen');
      let time = 0.21;
      const birdTimes: number[] = [];
      const run = (seconds: number) => {
        for (const end = time + seconds; time < end - 1e-9; time += 0.2) {
          const before = scene.outdoor.length;
          scene.tick(0.2);
          if (scene.outdoor.slice(before).includes('Vögel zwitschern.')) birdTimes.push(time);
        }
      };
      run(100);
      // About 40 chirps in 100 s, but only the first one and one per 30 s gap are captioned.
      expect(birdTimes).toHaveLength(4);
      expect(birdTimes[0]).toBeLessThan(4);
      for (let i = 1; i < birdTimes.length; i++) {
        expect(birdTimes[i]! - birdTimes[i - 1]!).toBeGreaterThanOrEqual(AMBIENCE_CAPTION_GAP);
        expect(birdTimes[i]! - birdTimes[i - 1]!).toBeLessThan(AMBIENCE_CAPTION_GAP + 3);
      }
      // Birdsong restarting (landing after a flight, or an era change) captions on the first chirp.
      birdTimes.length = 0;
      scene.player.flying = true;
      run(2);
      scene.player.flying = false;
      const landed = time;
      run(3);
      expect(birdTimes).toHaveLength(1);
      expect(birdTimes[0]! - landed).toBeLessThan(3);
      scene.era.current = '1789';
      const eraChange = time;
      run(10);
      expect(birdTimes).toHaveLength(2);
      expect(birdTimes[1]! - eraChange).toBeLessThan(10);
    } finally {
      ambience.dispose();
      random.mockRestore();
    }
  });

  it('hides current captions when disabled and announces the current bed when re-enabled', () => {
    const scene = captionScene();
    try {
      scene.move('weiher');
      scene.settings.state.subtitles = false;
      scene.tick(4);
      expect(scene.removed).toEqual(['Wasser schwappt ans Ufer.']);
      scene.era.current = '1789';
      scene.move('plateau');
      scene.tick(4);
      expect(scene.outdoor).toEqual(['Wind rauscht.']);
      expect(scene.shown).toEqual(['Wasser schwappt ans Ufer.']);
      scene.settings.state.subtitles = true;
      scene.move('quelle');
      expect(scene.shown.at(-1)).toBe('Ein Bach plätschert.');
    } finally {
      ambience.dispose();
    }
  });
});

function captionScene() {
  const shown: string[] = [];
  const outdoor: string[] = [];
  const removed: string[] = [];
  const position = { x: 524, y: 280, z: -770 };
  const player = { position, flying: false };
  const era: { current: Era } = { current: 'today' };
  const settings = { state: { subtitles: true } };
  const ctx = {
    audio: { unlocked: false },
    player,
    era,
    settings,
    world: { heightAt: () => 0 },
    t,
    ui: { hud: { subtitle: (_speaker: null, text: string, _ms: number, fiction?: boolean) => {
      if (text === 'Wind rauscht.' || text === 'Vögel zwitschern.') {
        outdoor.push(text);
        return () => {};
      }
      const caption = text + (fiction ? ' (Fiktion)' : '');
      shown.push(caption);
      return () => removed.push(caption);
    } } },
  } as unknown as GameContext;
  ambience.init(ctx);
  return {
    shown,
    outdoor,
    removed,
    era,
    settings,
    player,
    move(id: string) {
      const stop = [...tour.stops, ...ascent.stops].find((stop) => stop.id === id)!;
      Object.assign(position, { x: stop.x, z: stop.z });
      ambience.update(0.21);
    },
    tick(dt: number) { ambience.update(dt); },
  };
}
