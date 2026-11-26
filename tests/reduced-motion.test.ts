import { Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, ShaderMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { creditsReducedMotion, motionTime, screenFlashScale, storyFadeSeconds } from '../src/core/motion';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { CombatVisuals, mirrorCoreGlow } from '../src/systems/combat/visuals';
import { FLIGHT, TorchStage } from '../src/systems/fx/k3-torch';
import { LanternView } from '../src/systems/hunt/lantern';
import { PickupWorld } from '../src/systems/progression/pickups';
import { SCENE, springSceneYaw } from '../src/systems/quelle';
import { CardLineHold } from '../src/systems/story/overlays';
import { animatePoi, animateTripod, buildLetter, buildTripod, cacheLidStep, disposeGroup } from '../src/systems/travel/visuals';
import { atmosphere } from '../src/world/atmosphere';

describe('presentation motion', () => {
  it('uses either the OS preference or the saved game setting for static credits', () => {
    let osReduced = true;
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ reducedMotion: false }));
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && osReduced }));
    try {
      const { reducedMotion } = new SettingsStore(storage).state;
      expect(reducedMotion).toBe(false);
      expect(creditsReducedMotion(reducedMotion)).toBe(true);
      osReduced = false;
      expect(creditsReducedMotion(reducedMotion)).toBe(false);
      expect(creditsReducedMotion(true)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('holds decorative clocks at rest and keeps the normal clock advancing', () => {
    expect(motionTime(17, false)).toBe(17);
    expect(motionTime(500, true)).toBe(motionTime(17, true));
  });

  it('suppresses full-screen flashes in reduced motion and keeps the separate flash setting', () => {
    expect(screenFlashScale(true, false)).toBe(0);
    expect(screenFlashScale(true, true)).toBe(0);
    expect(screenFlashScale(false, true)).toBe(0.2);
    expect(screenFlashScale(false, false)).toBe(1);
  });

  it('shortens fades and the chapter card hold while respecting deliberate cuts', () => {
    expect(storyFadeSeconds(1.4, false)).toBe(1.4);
    expect(storyFadeSeconds(1.4, true)).toBe(0.2);
    expect(storyFadeSeconds(0.1, true)).toBe(0.1);
    expect(storyFadeSeconds(0, true)).toBe(0);
    const card = new CardLineHold();
    card.show(true, 1);
    expect(card.tick(1, true)).toBe(true);
    expect(card.holding()).toBe(true);
    card.tick(0.2, true);
    expect(card.holding()).toBe(false);
  });

  it('cuts the spring camera along the shortest angle in reduced motion', () => {
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    expect(springSceneYaw(from, to, 0, true)).toBeCloseTo(Math.PI + 0.1);
    expect(springSceneYaw(from, to, 0, false)).toBeCloseTo(from);
    expect(springSceneYaw(from, to, SCENE.turn / 2, false)).toBeCloseTo(Math.PI);
  });

  it('keeps the lantern steady at low oil and lowers it immediately when switched off', () => {
    const lantern = new LanternView(new Scene());
    const frame = { dt: 1 / 60, camera: new PerspectiveCamera(), lit: true, oil: 0.08, fog: false,
      prone: false, moving: 1, reducedMotion: true, reducedFlash: false, snap: false };
    lantern.frame({ ...frame, time: 1 });
    const steady = lantern.light;
    expect(steady).toBeGreaterThan(0);
    lantern.frame({ ...frame, time: 2 });
    expect(lantern.light).toBe(steady);
    lantern.frame({ ...frame, time: 2, reducedMotion: false, reducedFlash: true });
    expect(lantern.light).toBe(steady);
    lantern.frame({ ...frame, time: 2, reducedMotion: false });
    expect(lantern.light).not.toBe(steady);
    lantern.frame({ ...frame, time: 3, lit: false });
    expect(lantern.light).toBe(0);
    lantern.dispose();
  });

  it('keeps survey markers readable without bobbing, expanding rings or activation bursts', () => {
    const tripod = buildTripod(0, 0, 0, 1);
    animateTripod(tripod, 0.15, 1, false, 0, true);
    expect(tripod.beam.scale.y).toBe(5);
    animateTripod(tripod, 0.15, 2, false);
    expect(tripod.beam.scale.y).not.toBe(5);
    tripod.lit = 1;
    tripod.burst = 0;
    animateTripod(tripod, 0.15, 2, false);
    expect(tripod.beam.scale.y).toBeGreaterThan(46);
    expect(tripod.ring.visible).toBe(true);
    const beamTime = (tripod.beam.material as ShaderMaterial).uniforms.uTime!;
    const previousTime = atmosphere.uTime.value;
    try {
      atmosphere.uTime.value = 7;
      animateTripod(tripod, 0.15, 2, false);
      expect(beamTime.value).toBe(7);
      animateTripod(tripod, 0.15, 2, false, 0, true);
      expect(tripod.beam.scale.y).toBe(46);
      expect(tripod.ring.visible).toBe(false);
      expect((tripod.glow.material as ShaderMaterial).uniforms.uAlpha!.value).toBe(1);
      expect(beamTime.value).toBe(0);
      atmosphere.uTime.value = 11;
      animateTripod(tripod, 2, 5, false, 0, true);
      expect(beamTime.value).toBe(0);
      expect(tripod.burst).toBe(-1);
    } finally {
      atmosphere.uTime.value = previousTime;
    }
    const letter = buildLetter(0, 0, 0, 'lore', 'today', 1);
    const rotation = letter.bob!.rotation.y;
    animatePoi(letter, 0.1, 2, true);
    expect(letter.bob!.rotation.y).toBe(rotation);
    expect(letter.bob!.position.y).toBe(0.75);
    animatePoi(letter, 0.1, 2, false);
    expect(letter.bob!.rotation.y).not.toBe(rotation);
    disposeGroup(tripod.group);
    disposeGroup(letter.group);
  });

  it('keeps dropped loot steady while the collection fade still completes', () => {
    const world = new PickupWorld(() => 0, () => 'weapon');
    const camera = new PerspectiveCamera();
    const player = new Vector3();
    const frame = (dt: number, time: number, reduced: boolean) => world.frame(dt, time, camera, 600, player, () => true, reduced);
    world.sync([{ id: 'test', item: 'stab', era: 'today', x: 1, z: 2, drop: true }], true);
    const pickup = world.group.getObjectByName('pickup:test')!;
    const token = pickup.children.find((child) => child instanceof Mesh && child.material instanceof MeshBasicMaterial) as Mesh<never, MeshBasicMaterial>;
    const clock = (pickup.children[0] as Mesh<never, ShaderMaterial>).material.uniforms.uTime!;
    frame(0.4, 7, false);
    const spinning = token.rotation.y;
    expect(clock.value).toBe(7);
    frame(0.4, 11, false);
    expect(token.rotation.y).not.toBe(spinning);
    frame(0.4, 15, true);
    const still = token.rotation.y;
    frame(0.4, 21, true);
    expect(token.rotation.y).toBe(still);
    expect(clock.value).toBe(0);
    world.collect('test');
    frame(0.21, 23, true);
    expect(token.rotation.y).toBe(still);
    expect(token.material.opacity).toBeCloseTo(0.7);
    frame(0.21, 25, true);
    expect(pickup.parent).toBeNull();
    world.dispose();
  });

  it('opens a completed cache at once in reduced motion', () => {
    expect(cacheLidStep(0.2, 1 / 60, true)).toBe(1);
    expect(cacheLidStep(0.2, 1 / 60, false)).toBeCloseTo(0.2 + 1.6 / 60);
    expect(cacheLidStep(0.95, 1, false)).toBe(1);
  });

  it('keeps the cracked mirror recognizably dim with a steady light', () => {
    expect(mirrorCoreGlow(1, true, true)).toBe(mirrorCoreGlow(2, true, true));
    expect(mirrorCoreGlow(1, true, true)).toBeLessThan(mirrorCoreGlow(1, false, true));
    expect(mirrorCoreGlow(0, true, false)).toBeLessThan(mirrorCoreGlow(Math.PI / 32, true, false));
  });

  it('holds the reflected beam between the mirror and player while motion is reduced', () => {
    const visuals = new CombatVisuals();
    const beam = visuals.object.getObjectByName('combat-reflection')!;
    const f = { enemies: [], projectiles: [], rings: [], camera: new PerspectiveCamera(), viewportH: 600,
      time: 0, dt: 0.1, frozen: false, heightAt: () => 0, reducedFlash: false, reducedMotion: true, bann: null };
    visuals.reflectBeam(1, 2, 3, -3, 1.4, 0, false, true);
    for (let i = 0; i < 4; i++) {
      visuals.frame({ ...f, time: i * f.dt });
      expect(beam.visible).toBe(true);
      expect(visuals.particleCount).toBe(0);
      expect(beam.localToWorld(new Vector3(0, -0.5, 0)).distanceTo(new Vector3(1, 2, 3))).toBeLessThan(1e-6);
      expect(beam.localToWorld(new Vector3(0, 0.5, 0)).distanceTo(new Vector3(-3, 1.4, 0))).toBeLessThan(1e-6);
    }
    visuals.frame(f);
    visuals.frame(f);
    expect(beam.visible).toBe(false);
    visuals.reflectBeam(1, 2, 3, -3, 1.4, 0, false, false);
    visuals.frame({ ...f, reducedMotion: false });
    expect(beam.visible).toBe(false);
    expect(visuals.particleCount).toBeGreaterThan(0);
    visuals.dispose();
  });

  it('hides the thrown torch and moving sparks while keeping the window cue', () => {
    const torch = new TorchStage();
    torch.build([{ building: 'KB-B01', x: 10, y: 2, z: 0, nx: -1, nz: 0, w: 1, h: 2 }], 10, 0);
    const hand = { x: 0, y: 2, z: 0 };
    torch.update(FLIGHT / 2, 0, hand, 500, false);
    const ordinary = torch.object.children.filter((child) => child.visible);
    torch.update(FLIGHT / 2, 0, hand, 500, true, true);
    const reduced = torch.object.children.filter((child) => child.visible);
    expect(ordinary.length).toBeGreaterThan(reduced.length);
    expect(reduced).toHaveLength(1);
    torch.update(FLIGHT + 0.5, 0, hand, 500, true, true);
    expect(torch.uT.value).toBe(FLIGHT + 0.5);
    expect(reduced[0]!.visible).toBe(true);
    const pane = (reduced[0] as Mesh<never, ShaderMaterial>).material;
    const previousTime = atmosphere.uTime.value;
    try {
      for (const time of [7, 11]) {
        atmosphere.uTime.value = time;
        torch.update(FLIGHT + time / 40, 0, hand, 500, false);
        expect(pane.uniforms.uPaneTime!.value).toBe(time);
        expect(pane.uniforms.uIgnitionFlash!.value).toBe(1);
        torch.update(FLIGHT + time / 40, 0, hand, 500, false, true);
        expect(pane.uniforms.uT!.value).toBe(FLIGHT + time / 40);
        expect(pane.uniforms.uPaneTime!.value).toBe(0);
        expect(pane.uniforms.uIgnitionFlash!.value).toBe(0);
      }
    } finally {
      atmosphere.uTime.value = previousTime;
    }
    torch.dispose();
  });
});
