import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { FixedStepLoop } from '../src/core/loop';
import { SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import { CAMERA_OWNER, CinematicRuntime, SKIP_GRACE, registerTarget } from '../src/systems/cinematic';
import { loadBundledCinematics } from '../src/systems/cinematic/data';
import { CameraTakeover, HANDBACK_S, OverrideSlot } from '../src/systems/cinematic/takeover';
import { registeredTarget } from '../src/systems/cinematic/targets';
import type { CinematicFile } from '../src/systems/cinematic/types';
import { ERA_LOOKS } from '../src/world/eraPresets';
import '../src/systems/contracts';
import reh from '../content/cinematics/reh.json';
import { stubSetPieceDom } from './set-piece-dom';

const DT = 1 / 60;

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

function setup(opts: {
  reduced?: boolean;
  title?: () => boolean;
  files?: Record<string, CinematicFile>;
  heightAt?: () => number;
  storage?: ReturnType<typeof memStorage>;
} = {}) {
  const events = new EventBus();
  const log: [string, unknown][] = [];
  events.onAny((n, p) => log.push([n, p]));
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, opts.storage ?? memStorage(), events, () => 100_000);
  const camera = new PerspectiveCamera(70, 1, 0.2, 7000);
  const player = { position: new Vector3(100, 10, 200), renderPos: new Vector3(100, 10, 200), yaw: 0.4, pitch: -0.2, eyeHeight: 1.6, frozen: false, lookLocked: false };
  let now = 0;
  const slot = new OverrideSlot((active) => events.emit('camera:override', { active }));
  const settings = { state: { reducedMotion: opts.reduced === true } };
  const takeover = new CameraTakeover({ slot, player, events, reducedMotion: () => settings.state.reducedMotion, now: () => now, titleActive: opts.title });
  const holds = new Set<string>();
  const world = { heightAt: opts.heightAt ?? (() => 10), look: structuredClone(ERA_LOOKS.today), applyLook: vi.fn() };
  const era: { current: GameContext['era']['current'] } = { current: 'today' };
  const pause = { paused: false };
  const modals = { count: 0 };
  const busy = vi.fn();
  const ctx = {
    events,
    state,
    save,
    camera,
    player,
    settings,
    world,
    era,
    ui: { cards: { hold: (r: string, on: boolean) => (on ? holds.add(r) : holds.delete(r)) }, hud: { busy }, modals },
    pause,
    cinematic: takeover,
  } as unknown as GameContext;
  const rt = new CinematicRuntime(ctx, opts.files ?? { reh: reh as CinematicFile });
  rt.init();
  /** One drawn frame: the "rig" puts the camera at a fixed spot, then the slot runs. */
  const rig = new Vector3(100, 12, 204);
  const render = (ms = 16) => {
    now += ms;
    camera.position.copy(rig);
    camera.rotation.set(-0.2, 0.4, 0, 'YXZ');
    slot.fn?.(camera);
  };
  const steps = (n: number) => {
    for (let i = 0; i < n; i++) rt.update(DT);
  };
  const named = (n: string) => log.filter(([k]) => k === n).map(([, p]) => p);
  return { events, log, state, save, camera, player, slot, takeover, rt, render, steps, named, settings, holds, rig, world, era, modals, pause, busy };
}

const ORBIT = { id: 'ring', orbit: { x: 100, z: 200, r: 8, period: 10, seconds: 3 } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cinematic system', () => {
  it('play → start, the camera moves, the player is frozen; end emitted once with yaw / pitch back', () => {
    const s = setup();
    expect(s.rt.play(ORBIT)).toBe(true);
    expect(s.named('cinematic:start')).toEqual([{ id: 'ring', seconds: 3 }]);
    expect(s.player.frozen).toBe(true);
    expect(s.player.lookLocked).toBe(true);
    expect(s.takeover.cameraOwner).toBe(CAMERA_OWNER);
    expect(s.takeover.showsAvatar(s.slot.fn)).toBe(true);
    s.render();
    const a = s.camera.position.clone();
    s.steps(60);
    s.render();
    expect(a.distanceTo(s.camera.position)).toBeGreaterThan(1);
    // something turned yaw meanwhile (look input): restored at the end
    s.player.yaw = 2;
    s.steps(200);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: false }]);
    s.rt.end(true);
    s.steps(10);
    expect(s.named('cinematic:end')).toHaveLength(1);
    expect(s.player.frozen).toBe(false);
    expect(s.player.yaw).toBeCloseTo(0.4);
    expect(s.player.pitch).toBeCloseTo(-0.2);
    expect(s.rt.playing).toBeNull();
  });

  it('skip only after the 0.5 s grace', () => {
    const s = setup();
    s.rt.play(ORBIT);
    s.steps(Math.floor(SKIP_GRACE * 60) - 3);
    expect(s.rt.userSkip()).toBe(false);
    expect(s.named('cinematic:end')).toHaveLength(0);
    s.steps(6);
    expect(s.rt.userSkip()).toBe(true);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
  });

  it('not skippable: input never skips', () => {
    const s = setup();
    s.rt.play({ ...ORBIT, skippable: false });
    s.steps(60);
    expect(s.rt.userSkip()).toBe(false);
  });

  it("cinematic:stop ends that id at once (no grace, even unskippable), a wrong id does nothing; default plays unchanged", () => {
    const s = setup();
    s.rt.play({ ...ORBIT, skippable: false, lockInput: false });
    expect(s.player.frozen).toBe(false);
    s.events.emit('cinematic:stop', { id: 'other' });
    expect(s.rt.playing).toBe('ring');
    s.steps(2);
    s.events.emit('cinematic:stop', { id: 'ring' });
    expect(s.rt.playing).toBeNull();
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    s.events.emit('cinematic:stop', { id: 'ring' });
    expect(s.named('cinematic:end')).toHaveLength(1);
    // the camera is handed back (released through the takeover's 0.4 s ease)
    s.render(500);
    expect(s.takeover.cameraOwner).toBeNull();
  });

  it('reduced motion stills: ≤ 3 s, first and last key', () => {
    const s = setup({ reduced: true });
    s.rt.play({ id: 'long', keys: [{ t: 0, eye: { x: 0, z: 0 } }, { t: 20, eye: { x: 50, z: 0 } }] });
    expect(s.named('cinematic:start')).toEqual([{ id: 'long', seconds: 3 }]);
    s.render();
    expect(s.camera.position.x).toBeCloseTo(0);
    s.steps(150);
    s.render();
    expect(s.camera.position.x).toBeCloseTo(50);
    s.steps(31);
    expect(s.named('cinematic:end')).toEqual([{ id: 'long', skipped: false }]);
  });

  it('keeps each reduced-motion view fixed even as its subject moves', () => {
    const s = setup({ reduced: true });
    const target = { x: 0, y: 10, z: -5 };
    const unregister = registerTarget('animal:stills-test', () => target);
    try {
      s.rt.play({ id: 'stills-test', keys: [{ t: 0, eye: { x: 0, z: 0 }, look: { target: 'animal:stills-test' } }, { t: 6 }] });
      s.render();
      const first = s.camera.quaternion.clone();
      target.x = 7;
      s.steps(60);
      s.render();
      expect(s.camera.quaternion.angleTo(first)).toBeCloseTo(0, 7);
      s.steps(60);
      s.render();
      expect(s.camera.quaternion.angleTo(first)).toBeGreaterThan(0.5);
    } finally {
      unregister();
    }
  });

  it("reduced motion 'skip' ends at once, skipped", () => {
    const s = setup({ reduced: true });
    s.rt.play({ ...ORBIT, reduced: 'skip' });
    expect(s.named('cinematic:start')).toEqual([{ id: 'ring', seconds: 0 }]);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(s.takeover.cameraOwner).toBeNull();
    expect(s.player.frozen).toBe(false);
  });

  it('a bad spec warns and ends skipped, never hangs', () => {
    const s = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(s.rt.play({ id: 'bad', keys: [{ t: 0 }] })).toBe(false);
    expect(s.rt.play({ id: 'nope', ref: 'missing' })).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(s.named('cinematic:end')).toEqual([
      { id: 'bad', skipped: true },
      { id: 'nope', skipped: true },
    ]);
    expect(s.named('cinematic:start')).toHaveLength(0);
    expect(s.takeover.cameraOwner).toBeNull();
  });

  it('plays a ref, the cinematic:play request and the story:cue bridge', () => {
    const s = setup();
    s.events.emit('story:cue', { id: 'cinematic', data: { id: 'reh', ref: 'reh' } });
    expect(s.rt.playing).toBe('reh');
    expect(s.named('cinematic:start')).toEqual([{ id: 'reh', seconds: 6 }]);
    // animal targets are not registered: the view holds, no NaN
    s.render();
    expect(Number.isFinite(s.camera.position.x) && Number.isFinite(s.camera.quaternion.w)).toBe(true);
    expect(s.camera.fov).toBeCloseTo(40);
    s.events.emit('cinematic:play', ORBIT);
    // a new play ends the old one first
    expect(s.named('cinematic:end')).toEqual([{ id: 'reh', skipped: true }]);
    expect(s.rt.playing).toBe('ring');
  });

  it('single owner: a second take is refused while the camera is owned', () => {
    const s = setup();
    expect(s.takeover.takeCamera('photo', () => {})).toBe(true);
    expect(s.takeover.takeCamera('other', () => {})).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(s.rt.play(ORBIT)).toBe(false);
    warn.mockRestore();
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    s.takeover.releaseCamera('other'); // not the owner: nothing happens
    expect(s.takeover.cameraOwner).toBe('photo');
    s.takeover.releaseCamera('photo');
    expect(s.takeover.cameraOwner).toBeNull();
    expect(s.takeover.takeCamera('other', () => {})).toBe(true);
  });

  it('auto-release on shift:done, era:change and player:died ends the cinematic skipped', () => {
    for (const fire of [
      (e: EventBus) => e.emit('shift:done', { from: 'today', to: '1789' }),
      (e: EventBus) => e.emit('era:change', { from: 'today', to: '1789' }),
      (e: EventBus) => e.emit('player:died', { by: 'test' }),
    ]) {
      const s = setup();
      s.rt.play(ORBIT);
      s.save.autosave('pending', true);
      s.steps(10);
      fire(s.events);
      expect(s.takeover.cameraOwner).toBeNull();
      expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
      expect(s.player).toMatchObject({ frozen: false, lookLocked: false });
      expect(s.holds.size).toBe(0);
      expect(s.save.held).toBe(false);
      expect(s.save.peek()?.systems.cinematic?.playing).toBeNull();
    }
  });

  it('hands back over 0.4 s from the shot to the rig, then frees the slot; camera:override on transitions only', () => {
    const s = setup();
    s.rt.play(ORBIT);
    s.render();
    s.render();
    const shot = s.camera.position.clone();
    s.steps(40);
    s.render();
    const last = s.camera.position.clone();
    expect(last.distanceTo(shot)).toBeGreaterThan(0.1);
    s.rt.end(true);
    // still ours while easing: first frame of the hand-back is close to the shot
    s.render(16);
    expect(s.camera.position.distanceTo(last)).toBeLessThan(s.camera.position.distanceTo(s.rig));
    expect(s.slot.fn).not.toBeNull();
    s.render(HANDBACK_S * 500);
    const mid = s.camera.position.clone();
    expect(mid.distanceTo(s.rig)).toBeGreaterThan(0.01);
    s.render(HANDBACK_S * 1000);
    expect(s.slot.fn).toBeNull();
    expect(s.camera.fov).toBe(70);
    s.render();
    expect(s.camera.position.distanceTo(s.rig)).toBeLessThan(1e-9);
    expect(s.named('camera:override')).toEqual([{ active: true }, { active: false }]);
  });

  it('the override slot emits camera:override only on real changes (debug setCamera path too)', () => {
    const ev: boolean[] = [];
    const slot = new OverrideSlot((a) => ev.push(a));
    const f = () => {};
    slot.set(f);
    slot.set(() => {});
    slot.set(null);
    slot.set(null);
    slot.set(f);
    expect(ev).toEqual([true, false, true]);
  });

  it('reduced motion hand-back is a cut', () => {
    const s = setup({ reduced: true });
    s.rt.play(ORBIT);
    s.render();
    s.rt.end(true);
    s.render();
    expect(s.slot.fn).toBeNull();
    expect(s.camera.position.distanceTo(s.rig)).toBeLessThan(1e-9);
  });

  it('takeCamera is refused (with a warning) while the title screen shows', () => {
    let title = true;
    const s = setup({ title: () => title });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(s.takeover.takeCamera('photo', () => {})).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('title'));
    expect(s.rt.play(ORBIT)).toBe(false);
    warn.mockRestore();
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(s.slot.fn).toBeNull();
    expect(s.player.frozen).toBe(false);
    title = false;
    expect(s.takeover.takeCamera('photo', () => {})).toBe(true);
  });

  it('showAvatar: false hides the character while owned and shows it from the start of the hand-back', () => {
    const s = setup();
    s.takeover.takeCamera('photo', (cam) => cam.position.set(0, 20, 0), { showAvatar: false });
    s.render();
    expect(s.takeover.showsAvatar(s.slot.fn)).toBe(false);
    s.takeover.releaseCamera('photo');
    // the hand-back's first frame: still ours, the character is back
    expect(s.slot.fn).not.toBeNull();
    expect(s.takeover.showsAvatar(s.slot.fn)).toBe(true);
    s.render(16);
    expect(s.slot.fn).not.toBeNull();
    expect(s.takeover.showsAvatar(s.slot.fn)).toBe(true);
    s.render(HANDBACK_S * 1000);
    expect(s.slot.fn).toBeNull();
    expect(s.takeover.showsAvatar(s.slot.fn)).toBe(false);
  });

  it('a NaN from a shot never reaches the camera', () => {
    const s = setup();
    let bad = false;
    s.takeover.takeCamera('x', (cam) => {
      cam.position.set(bad ? NaN : 1, 2, 3);
    });
    s.render();
    bad = true;
    s.render();
    expect(s.camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('no autosave while playing; the held one is written at the end', () => {
    const s = setup();
    s.rt.play(ORBIT);
    expect(s.save.autosave('interval', true)).toBe(false);
    expect(s.named('save:written')).toHaveLength(0);
    expect(s.holds.has('cinematic')).toBe(true);
    s.steps(200);
    expect(s.named('save:written')).toEqual([{ slot: 'auto', reason: 'interval' }]);
    expect(s.holds.has('cinematic')).toBe(false);
    // the save holds no playing cinematic
    expect(s.state.state.systems.cinematic?.playing).toBeNull();
  });

  it('a load does not replay: cinematic:end skipped for what played and what the save held', () => {
    const s = setup();
    s.rt.play(ORBIT);
    s.save.save('auto', 'manual'); // a manual save from the pause menu holds the playing cinematic
    s.steps(200);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: false }]);
    s.save.load('auto');
    expect(s.named('cinematic:end')).toEqual([
      { id: 'ring', skipped: false },
      { id: 'ring', skipped: true },
    ]);
    expect(s.rt.playing).toBeNull();
    expect(s.state.state.systems.cinematic?.playing).toBeNull();
  });

  it('a load while playing ends it once, skipped, and gives the camera back', () => {
    const s = setup();
    s.rt.play(ORBIT);
    s.save.save('auto', 'manual');
    s.save.load('auto');
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(s.takeover.cameraOwner).toBeNull();
  });

  it('resume (game:start on a save holding a cinematic) emits end skipped', () => {
    const s = setup();
    s.state.slice('cinematic', () => ({ playing: null })).playing = 'reh';
    s.events.emit('game:start', { resumed: true });
    expect(s.named('cinematic:end')).toEqual([{ id: 'reh', skipped: true }]);
    expect(s.named('cinematic:start')).toHaveLength(0);
  });

  it('at(id, t) holds the picture', () => {
    const s = setup();
    s.rt.at('reh', 2.5);
    expect(s.rt.playing).toBe('reh');
    s.steps(600);
    expect(s.rt.time).toBe(2.5);
    s.render();
    expect(s.camera.fov).toBeCloseTo(18);
    s.rt.at('reh', -1);
    s.steps(600);
    expect(s.named('cinematic:end')).toEqual([{ id: 'reh', skipped: false }]);
  });

  it('captures fresh keyboard input but leaves pause and tool keys available', () => {
    const dom = stubSetPieceDom();
    const s = setup();
    const key = (code: string, repeat = false) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat });
      dom.window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    s.rt.play(ORBIT);
    expect(dom.root.attributes.has('data-kq-cinematic')).toBe(true);
    expect(key('KeyE')).toBe(true);
    expect(s.rt.playing).toBe('ring');
    s.steps(31);
    expect(key('Escape')).toBe(false);
    expect(key('KeyP')).toBe(false);
    expect(key('F8')).toBe(false);
    expect(key('KeyE', true)).toBe(true);
    expect(s.rt.playing).toBe('ring');
    expect(key('KeyE')).toBe(true);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(key('KeyE')).toBe(false);
    expect(dom.root.attributes.has('data-kq-cinematic')).toBe(false);
    expect(dom.body.children.size).toBe(0);
  });

  it.each(['touch', 'mouse'])('respects grace and modals for %s pointer skips', (pointerType) => {
    const dom = stubSetPieceDom();
    const s = setup();
    const press = () => dom.window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType }));
    s.rt.play(ORBIT);
    press();
    expect(s.rt.playing).toBe('ring');
    s.steps(31);
    s.modals.count = 1;
    press();
    expect(s.rt.playing).toBe('ring');
    s.modals.count = 0;
    press();
    press();
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(s.player.frozen).toBe(false);
    expect(s.player.lookLocked).toBe(false);
  });

  it('dips to black between the reduced-motion stills and clears the overlay on exit', () => {
    const dom = stubSetPieceDom();
    const s = setup({ reduced: true });
    s.rt.play({ id: 'stills', keys: [{ t: 0, fov: 40 }, { t: 8, fov: 18 }], lockInput: false, skippable: false });
    const overlay = [...dom.body.children][0]!;
    const fade = [...overlay.children].find((child) => child.attributes.get('data-testid') === 'cinematic-fade')!;
    s.render();
    s.rt.frame();
    expect(s.camera.fov).toBe(40);
    expect(fade.style.opacity).toBe('0.000');
    s.rt.at('stills', 1.5);
    s.render();
    s.rt.frame();
    expect(s.camera.fov).toBe(18);
    expect(fade.style.opacity).toBe('1.000');
    expect(s.rt.userSkip()).toBe(false);
    expect(s.player).toMatchObject({ frozen: false, lookLocked: false });
    s.rt.at('stills', -1);
    s.steps(100);
    s.render();
    expect(s.camera.fov).toBe(70);
    expect(s.slot.fn).toBeNull();
    expect(dom.body.children.size).toBe(0);
  });

  it('keeps the shot, locks and deferred autosave through paused render frames', () => {
    const s = setup();
    const loop = new FixedStepLoop({ update: (dt) => s.rt.update(dt), render: () => s.render() });
    s.rt.play(ORBIT);
    loop.step(45);
    const time = s.rt.time;
    const eye = s.camera.position.clone();
    expect(s.save.autosave('interval', true)).toBe(false);
    s.pause.paused = loop.paused = true;
    for (let i = 0; i < 210; i++) loop.frame(i * DT);
    expect(s.rt.time).toBe(time);
    expect(s.camera.position.equals(eye)).toBe(true);
    expect(s.rt.userSkip()).toBe(false);
    expect(s.save.held).toBe(true);
    expect(s.save.peek()).toBeNull();
    expect(s.player).toMatchObject({ frozen: true, lookLocked: true });
    s.pause.paused = loop.paused = false;
    loop.frame(212 * DT);
    expect(s.rt.time).toBeGreaterThan(time!);
    expect(s.rt.time! - time!).toBeLessThan(0.1);
    loop.step(140);
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: false }]);
    expect(s.save.peek()?.systems.cinematic?.playing).toBeNull();
  });

  it('skips both the outgoing and saved shots when loading a different cinematic', () => {
    const s = setup();
    s.rt.play({ id: 'reh', ref: 'reh' });
    s.save.save('during-reh');
    s.rt.end(true);
    s.rt.play(ORBIT);
    s.save.autosave('hidden', true);
    expect(s.save.load('during-reh')).toBe(true);
    expect(s.named('cinematic:start').map((p) => (p as { id: string }).id)).toEqual(['reh', 'ring']);
    expect(s.named('cinematic:end')).toEqual([
      { id: 'reh', skipped: true },
      { id: 'ring', skipped: true },
      { id: 'reh', skipped: true },
    ]);
    // loading drops the autosave held during the discarded shot (SaveManager.load clears heldReason)
    expect(s.save.peek()).toBeNull();
    expect(s.save.held).toBe(false);
    expect(s.save.autosave('after-load', true)).toBe(true);
    expect(s.save.peek()?.systems.cinematic?.playing).toBeNull();
    expect(s.player).toMatchObject({ frozen: false, lookLocked: false });
    expect(s.holds.size).toBe(0);
    expect(s.busy).toHaveBeenLastCalledWith('stage-cinematic', false, 0);
  });

  it('restores the gameplay FOV after a second shot interrupts the hand-back', () => {
    const s = setup();
    s.rt.play({ id: 'first', keys: [{ t: 0, fov: 22 }, { t: 1 }] });
    s.render();
    expect(s.camera.fov).toBe(22);
    s.rt.end(true);
    s.render(HANDBACK_S * 500);
    expect(s.camera.fov).toBeCloseTo(46);
    s.rt.play({ id: 'second', keys: [{ t: 0, fov: 37 }, { t: 1 }] });
    s.render();
    expect(s.camera.fov).toBe(37);
    s.rt.end(true);
    s.render(HANDBACK_S * 1000);
    expect(s.slot.fn).toBeNull();
    expect(s.camera.fov).toBe(70);
    expect(s.named('camera:override')).toEqual([{ active: true }, { active: false }]);
  });

  it('tears down on a thrown shot and preserves an existing movement lock', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup({ heightAt: () => { throw new Error('missing terrain'); } });
    s.player.frozen = true;
    s.rt.play(ORBIT);
    s.save.autosave('interval', true);
    s.render();
    expect(error).toHaveBeenCalledOnce();
    expect(s.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(s.camera.position.equals(s.rig)).toBe(true);
    expect(s.player).toMatchObject({ frozen: true, lookLocked: false });
    expect(s.holds.size).toBe(0);
    expect(s.save.peek()?.systems.cinematic?.playing).toBeNull();
    s.render();
    expect(s.slot.fn).toBeNull();
  });

  it('restores the original lighting on stop and keeps the new era lighting on a shift', () => {
    const s = setup();
    const spec = { id: 'look', keys: [{ t: 0, fog: 1, sun: 1, dark: 1 }, { t: 1 }] };
    s.rt.play(spec);
    s.render();
    s.rt.frame();
    expect(s.world.look.fog.density).toBeGreaterThan(ERA_LOOKS.today.fog.density);
    expect(s.world.look.sun.intensity).toBeLessThan(ERA_LOOKS.today.sun.intensity);
    s.events.emit('cinematic:stop', { id: 'look' });
    expect(s.world.look).toEqual(ERA_LOOKS.today);
    s.rt.play(spec);
    s.render();
    s.rt.frame();
    s.world.look = structuredClone(ERA_LOOKS['1789']);
    s.era.current = '1789';
    s.events.emit('era:change', { from: 'today', to: '1789' });
    expect(s.world.look).toEqual(ERA_LOOKS['1789']);
    expect(s.holds.size).toBe(0);
    expect(s.player).toMatchObject({ frozen: false, lookLocked: false });
  });

  it('flushes a held autosave on disposal and completes the interrupted shot once on reload', () => {
    const dom = stubSetPieceDom();
    const storage = memStorage();
    const s = setup({ storage });
    s.rt.play(ORBIT);
    expect(s.save.autosave('hidden', true)).toBe(false);
    expect(s.save.has()).toBe(false);
    s.rt.dispose();
    expect(s.rt.playing).toBeNull();
    expect(s.player).toMatchObject({ frozen: false, lookLocked: false });
    expect(s.takeover.cameraOwner).toBeNull();
    expect(s.save.held).toBe(false);
    expect(s.holds.size).toBe(0);
    expect(dom.root.attributes.has('data-kq-cinematic')).toBe(false);
    expect(s.named('cinematic:end')).toEqual([]);

    const resumed = setup({ storage });
    expect(resumed.save.load()).toBe(true);
    resumed.events.emit('game:start', { resumed: true });
    expect(resumed.named('cinematic:end')).toEqual([{ id: 'ring', skipped: true }]);
    expect(resumed.named('cinematic:start')).toEqual([]);
    expect(resumed.rt.playing).toBeNull();
    expect(resumed.state.state.systems.cinematic?.playing).toBeNull();
  });

  it('plays the bundled deer shot on live targets and holds aim after a lost target', () => {
    const files = loadBundledCinematics();
    const s = setup({ files });
    const kitz = { x: 725.8, y: 11.6, z: -764 };
    const offKitz = registerTarget('animal:kitz', () => kitz);
    const offRicke = registerTarget('animal:ricke', () => ({ x: 750, y: 11.6, z: -753.4 }));
    try {
      expect(s.rt.play({ id: 'reh', ref: 'reh' })).toBe(true);
      s.render();
      expect(s.camera.rotation.y).toBeCloseTo(0);
      expect(s.camera.fov).toBe(40);
      kitz.x += 10;
      s.rt.at('reh', 2.5);
      s.render();
      const aim = s.camera.rotation.y;
      expect(aim).toBeLessThan(-0.5);
      expect(s.camera.fov).toBe(18);
      offKitz();
      s.render();
      expect(s.camera.rotation.y).toBeCloseTo(aim);
      s.rt.at('reh', 6);
      s.render();
      expect(s.camera.rotation.y).toBeCloseTo(-Math.PI / 2);
      expect(s.camera.fov).toBe(18);
    } finally {
      offKitz();
      offRicke();
    }
  });

  it('keeps the newest target when an old registration unmounts, including a failing getter', () => {
    const offOld = registerTarget('animal:test', () => ({ x: 1, z: 2 }));
    const offNew = registerTarget('animal:test', () => ({ x: 3, z: 4 }));
    const offBad = registerTarget('animal:bad', () => { throw new Error('despawned'); });
    try {
      offOld();
      expect(registeredTarget('animal:test')).toEqual({ x: 3, z: 4 });
      expect(registeredTarget('animal:bad')).toBeNull();
      offNew();
      expect(registeredTarget('animal:test')).toBeNull();
    } finally {
      offNew();
      offBad();
    }
  });

  it.todo('decide whether Continue should resume or skip a shot suspended by returning to the title');
});
