import { BufferAttribute, Color, PerspectiveCamera, Points } from 'three';
import { expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { fireworkSound } from '../src/systems/scenery/audio';
import { Fireworks, LAUNCH } from '../src/systems/scenery/fireworks';
import { atmosphere } from '../src/world/atmosphere';
import { ERA_LOOKS } from '../src/world/eraPresets';

vi.mock('../src/systems/scenery/audio', () => ({ fireworkSound: vi.fn() }));

it('skips rockets’ decorative particles in reduced motion while keeping the audio and final light', () => {
  vi.useFakeTimers();
  const play = (reducedMotion: boolean) => {
    vi.mocked(fireworkSound).mockClear();
    const heightAt = () => 42;
    const flash = new Color();
    const world = { look: structuredClone(ERA_LOOKS['1789']), heightAt, heightfields: { '1789': { heightAt } }, applyLook: () => {} };
    const show = new Fireworks({ world, camera: new PerspectiveCamera(), renderer: { domElement: { height: 600 } },
      player: { position: { x: 1815, y: 42, z: 348 }, yaw: 0, pitch: 0 },
      settings: { state: { reducedMotion, reducedFlash: false, graphics: 'low' } },
      era: { current: '1789' }, t: (s: string) => s, ui: { hud: { setEraLabel: () => {} } },
      audio: { ctx: null, noise: () => null, createSource3D: () => null }, post: { uniforms: { uFlash: { value: flash } } },
    } as unknown as GameContext);
    const step = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        show.frame(0.1);
        vi.advanceTimersByTime(100);
      }
    };
    const cloud = show.group.children.find((child) => child instanceof Points && child.geometry.getAttribute('position').count === 9000) as Points;
    const data = cloud.geometry.getAttribute('position') as BufferAttribute;
    const star = show.group.getObjectByName('scenery-fireworks-final-light') as Points;
    const start = Date.now();
    const sounds: unknown[][] = [];
    vi.mocked(fireworkSound).mockImplementation((_audio, kind, x, y, z, level) => {
      // Check the shell and cannon cues, including the crackle scheduled with each burst.
      if (kind !== 'crackle' || level === 0.6) sounds.push([Date.now() - start, kind, x, y, z, level]);
    });

    show.start();
    step(50);
    expect(show.phase).toBe('festive');
    show.setPhase('climax');
    step(20);
    expect(star.visible).toBe(false);
    if (reducedMotion) {
      expect(show.liveSparks).toBe(0);
      expect(data.version).toBe(0);
      expect(cloud.visible).toBe(false);
      expect(flash.toArray()).toEqual([0, 0, 0]);
      expect(atmosphere.uGlowColor.value.toArray()).toEqual([0, 0, 0]);
    } else {
      expect(show.liveSparks).toBeGreaterThan(0);
      expect(data.version).toBeGreaterThan(0);
    }
    step(46);
    expect(show.phase).toBe('dark');
    expect(star.visible).toBe(reducedMotion);
    const point = star.geometry.getAttribute('position');
    expect(point.count).toBe(1);
    for (let i = 0; i < 3; i++) {
      step(5);
      expect([point.getX(0), point.getY(0), point.getZ(0)]).toEqual([LAUNCH.x - 20, 162, LAUNCH.z]);
      expect(star.visible).toBe(reducedMotion);
    }
    show.setPhase('return');
    step(1);
    expect(star.visible).toBe(false);
    show.dispose();
    vi.runAllTimers();
    return sounds;
  };
  const previousGlow = atmosphere.uGlowColor.value.clone();
  const previousGlowPos = atmosphere.uGlowPos.value.clone();
  try {
    const animated = play(false);
    const reduced = play(true);
    expect(reduced.map((sound) => sound[1])).toEqual(expect.arrayContaining(['launch', 'burst', 'crackle', 'cannon']));
    expect(reduced).toEqual(animated);
  } finally {
    atmosphere.uGlowColor.value.copy(previousGlow);
    atmosphere.uGlowPos.value.copy(previousGlowPos);
    vi.useRealTimers();
  }
});
