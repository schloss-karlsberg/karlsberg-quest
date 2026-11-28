/**
 * The Karlsbergquelle (NEXT-SESSION §3.6, docs/ACTION-RPG.md §11.0): the spring's living water and
 * the touch that starts the time travel. The stonework is a scenery set
 * (src/systems/scenery/quelle.ts); this system owns what moves — the still water in the trough /
 * basin, the stream from the pipe, the brook down the ravine, the guiding motes, the trickle — and
 * the touch:
 *
 *  - the story sets the flag `quelle.call` (prologue beat p3q): within reach and facing the water,
 *    E "Wasser berühren" (E belongs to the spring then, `e.owner`);
 *  - E starts a short scene on GAME time (deterministic, `kq.step` drives it): the player turns to
 *    the water and dips a hand in (`quelle:dip`, the avatar's interact pose), a ripple runs out, the
 *    moment stands still (the ripple freezes, the stream hangs, the trickle stops, the ambience
 *    drops, a glassy chord), then the brook runs back up the ravine; at 2.7 s `quelle:touch` — the
 *    story answers with the shift to 1789 (fx scan wave). The player stays held until the shift is
 *    done; the new era's water starts frozen and thaws while the magic fades;
 *  - `quelle.guide` (the story, while Laub leads you here): motes drift down the brook and hover
 *    over the water, so the place calls from afar;
 *  - `quelle.find` (the tour's break, t16: something glints in the trough): anywhere before the
 *    trough, whichever way the player looks, E „Untersuchen“ → `quelle:find` (TASK-081);
 *  - under the title the fixed steps stand still: the water is built and runs per frame there, so
 *    the backdrop of a save that rests at the spring shows the spring (TASK-087).
 *
 * Trees, scattered props and today's ground cover keep out of the hollow (forest / nature clearings); loot caches too
 * (travel/pois.ts KEEP_CLEAR).
 */
import { Group, type Material, type Mesh, type Sprite, type SpriteMaterial, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import type { Era } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { cameraHints } from '../../player/camera';
import { addStrings } from '../../i18n';
import { brookLine, canFind, canTouch, clearings, lookFor, outlet, overflow, QUELLE, toWorld, touchLocal, TOUR_REACH, TRAIL, trailLine, waterSpec, yawToWater, type WaterSpec } from './layout';
import { inTourQuelle } from './tour';
import { springSound, type SpringSound } from './sound';
import { applyLook, brookMesh, glowSprite, motes, poolMesh, streamMesh, trailMesh, waterUniforms, type Motes } from './water';

addStrings('de', { 'quelle.touch': 'Wasser berühren', 'quelle.find': 'Untersuchen' });

declare module '../../core/events' {
  interface GameEvents {
    /** The hand goes into the spring's water (the avatar's interact pose, the splash). */
    'quelle:dip': { era: Era };
    /** The touch is done (the moment stood still, the brook ran back): the story shifts. */
    'quelle:touch': { era: Era };
    /** E „Untersuchen“ before the trough while `quelle.find` is set (the tour's find, t16). */
    'quelle:find': { era: Era };
  }
}

export interface QuelleHooks {
  /** What is built and what the touch is doing. */
  info(): {
    built: Era | null;
    visible: boolean;
    water: WaterSpec | null;
    /** E „Wasser berühren“ is up. */
    prompt: boolean;
    /** E „Untersuchen“ is up (the tour's find). */
    find: boolean;
    scene: number | null;
    magic: number;
    freeze: number;
    flow: number;
  };
  /** Tests / screenshots: start the touch here and now (no flag or reach check). */
  touch(): void;
  /** Tests / screenshots: hold the scene's visuals at scene time t (s); null releases. */
  hold(t: number | null): void;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    quelle?: QuelleHooks;
  }
}

/** Build / show the water within this distance (m). */
const RANGE = 150;
export const FLAG_CALL = 'quelle.call';
export const FLAG_GUIDE = 'quelle.guide';
export const FLAG_FIND = 'quelle.find';
const OWNER = 'quelle';

/** The scene's timeline (s, game time). */
export const SCENE = { turn: 0.35, dip: 0.35, ripple: 0.45, freeze: 1.25, reverse: 1.6, touch: 2.7, waitShift: 0.6, maxHold: 9 } as const;

const YAW = Math.PI - (QUELLE.facing * Math.PI) / 180;

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

interface Scene {
  t: number;
  era: Era;
  yaw0: number;
  yaw1: number;
  dipped: boolean;
  rippled: boolean;
  stilled: boolean;
  rewound: boolean;
  touched: boolean;
  touchedAt: number;
  shifting: boolean;
}

let group: Group | null = null;
let built: Era | null = null;
let spec: WaterSpec | null = null;
let out: { x: number; y: number; z: number } | null = null;
let mot: Motes | null = null;
let glow: Sprite | null = null;
let path: Vector3[] = [];
const U = waterUniforms();
let poolT = 0;
let phase = 0;
let flow = 1;
let moteT = 0;
let moteOff = 0;
let guide = 0;
let freeze = 0;
let magic = 0;
let scene: Scene | null = null;
/** Seconds since the moment was let go (the new era's water thaws, the magic fades), or null. */
let after: number | null = null;
let held: number | null = null;
let promptOn: 'touch' | 'find' | null = null;
let focusSet = false;
let sound: SpringSound | null = null;
const offs: (() => void)[] = [];
let hooked = false;

function disposeGroup(): void {
  if (!group) return;
  group.removeFromParent();
  group.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else {
      (mat as { map?: { dispose(): void } | null } | undefined)?.map?.dispose();
      mat?.dispose();
    }
  });
  group = null;
  mot = null;
  glow = null;
  built = null;
  spec = null;
  out = null;
}

function build(ctx: GameContext, era: Era): void {
  disposeGroup();
  const h = (x: number, z: number) => ctx.world.heightfield.heightAt(x, z);
  const g = new Group();
  g.name = 'karlsbergquelle-water';
  spec = waterSpec(h, era);
  applyLook(U, lookFor(era));
  g.add(poolMesh(spec, YAW, U));
  const o = outlet(h, era);
  out = o;
  if (o) {
    // aim the jet at the middle of the water (the pipe's reach and the drop decide the speed)
    const [, tw] = touchLocal(era);
    const drop = o.y - spec.y;
    const tLand = Math.sqrt((2 * Math.max(0.02, drop)) / 9.81);
    const wTarget = tw - 0.05;
    const speed = Math.min(2, Math.max(0.25, (wTarget - o.w) / tLand));
    // +w in world (towards the viewer)
    const dx = Math.sin(YAW);
    const dz = Math.cos(YAW);
    const s = streamMesh(new Vector3(o.x, o.y, o.z), dx, dz, spec.y, U, speed, 0.02);
    if (s) g.add(s);
  }
  // today the trough runs over at its low end: a second, broader fall you see from the path
  const ov = overflow(h, era);
  if (ov) {
    const s = streamMesh(new Vector3(ov.x, ov.y, ov.z), Math.cos(YAW), -Math.sin(YAW), ov.toY, U, 0.3, 0.028);
    if (s) g.add(s);
  }
  const line = brookLine(h, era);
  const b = brookMesh(line, h, U);
  if (b) g.add(b);
  // the red sandy trail up to the front (a ground decal in the era's look)
  const tr = trailMesh(TRAIL.map((s) => trailLine(s)), h, lookFor(era));
  if (tr) g.add(tr);
  path = line.map(([x, z]) => new Vector3(x, h(x, z) + 0.08, z));
  mot = motes(new Vector3(spec.x, spec.y, spec.z), path, U);
  g.add(mot.points);
  glow = glowSprite();
  glow.position.set(spec.x, spec.y + 0.9, spec.z);
  glow.scale.set(1.6, 3.2, 1);
  g.add(glow);
  ctx.scene.add(g);
  group = g;
  built = era;
}

/** Build the era's water when the player is near, and show it only then. */
function showWater(ctx: GameContext): void {
  const p = ctx.player.position;
  const era = ctx.era.current;
  const near = Math.hypot(p.x - QUELLE.x, p.z - QUELLE.z) < RANGE;
  if (near && built !== era) build(ctx, era);
  if (group) group.visible = near;
}

function setPrompt(ctx: GameContext, on: 'touch' | 'find' | null): void {
  const flags = ctx.state.mutable.flags;
  if (on !== promptOn) {
    promptOn = on;
    ctx.ui.hud.prompt(on ? 'E' : null, on ? ctx.t(`quelle.${on}`) : undefined, OWNER);
    if (on) flags['e.owner'] = OWNER;
  }
  // A save from the water can carry an interaction claim even when its prompt is no longer up.
  if (!on && flags['e.owner'] === OWNER) delete flags['e.owner'];
}

function startScene(ctx: GameContext): void {
  if (scene) return;
  const pl = ctx.player;
  const era = ctx.era.current;
  scene = {
    t: 0,
    era,
    yaw0: pl.yaw,
    yaw1: yawToWater(pl.position.x, pl.position.z, era),
    dipped: false,
    rippled: false,
    stilled: false,
    rewound: false,
    touched: false,
    touchedAt: 0,
    shifting: false,
  };
  after = null;
  pl.frozen = true;
  pl.lookLocked = true;
  setPrompt(ctx, null);
  ctx.ui.hud.blockPrompts(OWNER, true);
}

function endScene(ctx: GameContext): void {
  if (!scene) return;
  scene = null;
  after = 0;
  ctx.player.frozen = false;
  ctx.player.lookLocked = false;
  sound?.release();
  ctx.ui.hud.blockPrompts(OWNER, false);
}

export function springSceneYaw(from: number, to: number, time: number, reducedMotion: boolean): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * (reducedMotion ? 1 : smooth(0, SCENE.turn, time));
}

function updateScene(dt: number, ctx: GameContext): void {
  const s = scene;
  if (!s) return;
  s.t += dt;
  const pl = ctx.player;
  pl.yaw = springSceneYaw(s.yaw0, s.yaw1, s.t, ctx.settings.state.reducedMotion);
  if (!s.dipped && s.t >= SCENE.dip) {
    s.dipped = true;
    ctx.events.emit('quelle:dip', { era: s.era });
    sound?.splash();
  }
  if (!s.rippled && s.t >= SCENE.ripple && spec) {
    s.rippled = true;
    const [tu, tw] = touchLocal(s.era);
    // the hand goes in a little towards the player
    const [x, z] = toWorld(tu, tw + 0.08);
    U.uRipple.value.set(x, z, poolT, ctx.settings.state.reducedMotion ? 0 : 1);
  }
  if (!s.stilled && s.t >= SCENE.freeze) {
    s.stilled = true;
    sound?.stillness();
  }
  if (!s.rewound && s.t >= SCENE.reverse) {
    s.rewound = true;
    sound?.rewind();
  }
  if (!s.touched && s.t >= SCENE.touch) {
    s.touched = true;
    s.touchedAt = s.t;
    ctx.events.emit('quelle:touch', { era: s.era });
  }
  // nobody shifted (no story beat listening): let the moment go
  if (s.touched && !s.shifting && s.t - s.touchedAt > SCENE.waitShift) endScene(ctx);
  else if (s.t > SCENE.touch + SCENE.maxHold) endScene(ctx);
}

/** The visuals' targets from the scene / the afterglow. */
function targets(): { magic: number; freeze: number; flow: number } {
  const t = held ?? scene?.t ?? null;
  if (t !== null) {
    const shifted = scene?.shifting && after !== null;
    if (!shifted) {
      return {
        magic: smooth(SCENE.ripple, SCENE.freeze, t),
        freeze: smooth(SCENE.freeze - 0.1, SCENE.freeze + 0.3, t),
        flow: t < SCENE.freeze ? 1 : t < SCENE.reverse ? 0 : -1.8,
      };
    }
  }
  if (after !== null) {
    return { magic: 1 - smooth(0.3, 3, after), freeze: 1 - smooth(0.2, 1.1, after), flow: after < 0.6 ? 0 : 1 };
  }
  return { magic: 0, freeze: 0, flow: 1 };
}

/** The water's clocks and the scene's look, on game time (fixed step). */
function stepVisuals(dt: number, guided: boolean): void {
  guide += ((guided ? 1 : 0) - guide) * Math.min(1, dt * 1.5);
  if (after !== null) {
    after += dt;
    if (!scene && after > 3.5) after = null;
  }
  const tg = targets();
  magic += (tg.magic - magic) * Math.min(1, dt * 6);
  freeze += (tg.freeze - freeze) * Math.min(1, dt * 8);
  flow += (tg.flow - flow) * Math.min(1, dt * (tg.flow < flow ? 7 : 2.5));
  poolT += dt * (1 - freeze);
  phase += dt * flow;
  moteT += dt * (1 - freeze * 0.97);
  moteOff += dt * flow * 0.9;
}

function installHooks(ctx: GameContext): void {
  if (hooked || !window.kq) return;
  hooked = true;
  window.kq.quelle = {
    info: () => ({
      built,
      visible: !!group?.visible,
      water: spec ? { ...spec } : null,
      prompt: promptOn === 'touch',
      find: promptOn === 'find',
      scene: scene ? scene.t : null,
      magic,
      freeze,
      flow,
    }),
    touch: () => startScene(ctx),
    hold: (t) => {
      held = t;
    },
  };
}

export default defineSystem({
  id: 'quelle',
  after: ['scenery', 'story', 'npc'],

  init(ctx) {
    for (const [x, z, r] of clearings()) {
      ctx.world.forest.addClearing(x, z, r);
      ctx.world.nature.props.addClearing(x, z, r);
      ctx.world.nature.cover.addClearing(x, z, r, 0, ['today']);
    }
    offs.push(
      ctx.events.on('era:change', () => {
        // the heights differ between the 2025 and the 1789 terrain: build again where needed
        if (group) disposeGroup();
      }),
      ctx.events.on('shift:begin', () => {
        if (scene?.touched) scene.shifting = true;
      }),
      ctx.events.on('shift:midpoint', () => {
        // the new era: its water starts still and thaws (the story keeps the player held until done)
        if (scene?.shifting) after = 0;
      }),
      ctx.events.on('shift:done', () => {
        if (scene?.shifting) {
          const a = after;
          endScene(ctx);
          after = a ?? 0;
        }
      }),
      ctx.events.on('game:start', () => {
        sound?.dispose();
        sound = springSound(ctx.audio);
      }),
    );
  },

  update(dt, ctx) {
    const pl = ctx.player;
    const p = pl.position;
    const era = ctx.era.current;
    showWater(ctx);
    updateScene(dt, ctx);
    const { flags, systems } = ctx.state.state;
    const tour = inTourQuelle(systems.story);
    const tourTouch = tour && systems.story?.beat === 't17' && era === 'today';
    const free = !scene && !!spec && !pl.flying && !pl.frozen && ctx.input.enabled && ctx.ui.modals.count === 0 && Math.abs(p.y - spec.y) < 2.5;
    const can = free && flags[FLAG_CALL] === true && (!tour || tourTouch) && canTouch(p.x, p.z, pl.yaw, era, tourTouch ? TOUR_REACH : undefined);
    // the tour's find: no facing asked (the player may stand at the trough looking after the group)
    const find = free && !can && tour && era === 'today' && flags[FLAG_FIND] === true && canFind(p.x, p.z, era);
    setPrompt(ctx, can ? 'touch' : find ? 'find' : null);
    if (can && ctx.input.wasPressed('listen')) startScene(ctx);
    else if (find && ctx.input.wasPressed('listen')) ctx.events.emit('quelle:find', { era });
    stepVisuals(dt, flags[FLAG_GUIDE] === true);
  },

  frame(dt, ctx) {
    installHooks(ctx);
    const title = ctx.pause.reasons.has('title');
    if (title) {
      // the fixed steps stand still under the title: build and run the water here
      showWater(ctx);
      stepVisuals(Math.min(dt, 0.1), false);
    }
    U.uPoolTime.value = poolT;
    U.uPhase.value = phase;
    U.uFreeze.value = freeze;
    U.uMagic.value = magic;
    U.uGuide.value = guide;
    U.uReverse.value = Math.max(0, -flow / 1.8);
    if (glow) (glow.material as SpriteMaterial).opacity = Math.min(1, magic * 0.75 + guide * 0.12);
    if (mot && group?.visible) {
      const cam = ctx.camera;
      mot.material.uniforms.uMoteTime!.value = moteT;
      mot.material.uniforms.uPx!.value = ctx.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
      if (guide > 0.01 || magic > 0.01) mot.flow(path, moteOff);
    }
    // the trickle: on while the stream runs (not frozen, not iced, not in 1796)
    if (sound && out && group?.visible && !title) {
      const look = built ? lookFor(built) : 'today';
      const v = look === 'winter' ? 0 : (1 - freeze) * Math.max(0, flow);
      sound.trickle(v, out.x, out.y, out.z);
    } else sound?.trickle(0, QUELLE.x, 0, QUELLE.z);
    // the camera leans in over the shoulder while the hand is in the water
    if (scene && spec && ctx.player.thirdPerson) {
      cameraHints.focus = { x: spec.x, y: spec.y + 0.35, z: spec.z };
      focusSet = true;
    } else if (focusSet) {
      cameraHints.focus = null;
      focusSet = false;
    }
  },

  dispose() {
    for (const off of offs.splice(0)) off();
    disposeGroup();
    sound?.dispose();
    sound = null;
    if (hooked && window.kq) delete window.kq.quelle;
    hooked = false;
  },
});
