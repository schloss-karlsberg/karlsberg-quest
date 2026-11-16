/**
 * The choice in the burning Festsaal (K3, W5) as things in the room, not a menu: Hanne holds out
 * the brass door handle, a ducat lies on the window sill, the gilded clock with the alabaster
 * column ticks on a console, and the door stands open (take nothing, out). Walk up to one, look at
 * it and press E: the room sets `festsaal.took` = 'tuergriff' | 'dukat' | 'uhr' | 'nichts' (the
 * story reacts: toast, charm item, `flag.k3_objekt`). Story cues: `festsaal:objects` {room}
 * places them, `festsaal:clear` removes them.
 *
 * Each object carries a small warm glint drawn after the room's smoke (renderOrder above the
 * smoke cards, no depth write), so it reads through the haze; reduced flashing: steady glint.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import type { GameContext } from '../../core/context';
import type { Door, IRoom, Win } from './types';

export type FestsaalKey = 'tuergriff' | 'dukat' | 'uhr' | 'nichts';
export const FESTSAAL_FLAG = 'festsaal.took';
export const FESTSAAL_LABELS: Record<FestsaalKey, string> = {
  tuergriff: 'Den Türgriff aus Hannes Hand nehmen',
  dukat: 'Den Dukaten vom Fensterbrett nehmen',
  uhr: 'Die Uhr mit dem Alabaster nehmen',
  nichts: 'Nichts nehmen. Hinaus.',
};
/** Reach (m, horizontal) and how squarely you must face it (cos of the angle). */
const REACH = 1.9;
const FACE = 0.55;

export interface FestsaalSpot {
  key: FestsaalKey;
  x: number;
  y: number;
  z: number;
  /** Yaw (radians) the object faces (into the room). */
  yaw: number;
}

/**
 * Where the four things are, from the room's plan (pure; tests): the ducat on the sill of the
 * room's first window, the door handle at Hanne's hand by the centre, the clock on a console in
 * the far quarter, the way out at the room's first inner door.
 */
export function festsaalSpots(room: IRoom, doors: Door[], windows: Win[]): FestsaalSpot[] {
  const f = room.frame;
  const at = (u: number, v: number) => ({ x: f.ox + f.ux * u * f.L + f.vx * v * f.W, z: f.oz + f.uz * u * f.L + f.vz * v * f.W });
  const y0 = room.floor;
  const out: FestsaalSpot[] = [];
  // the door: prefer an inner door of this room (the way you came up)
  const door = doors.find((d) => (d.a === room.index || d.b === room.index) && d.kind !== 'outer') ?? doors.find((d) => d.a === room.index || d.b === room.index);
  let doorP = at(0.04, 0.5);
  let doorYaw = Math.atan2(-f.ux, -f.uz);
  if (door) {
    // room a's outward normal: step 0.7 m into the room
    const s = door.a === room.index ? -1 : 1;
    doorP = { x: door.cx + door.nx * s * 0.7, z: door.cz + door.nz * s * 0.7 };
    doorYaw = Math.atan2(-door.nx * s, -door.nz * s);
  }
  out.push({ key: 'nichts', x: doorP.x, y: y0 + 1.1, z: doorP.z, yaw: doorYaw });
  // Hanne stands at the centre: the handle in her outstretched hand, towards the door
  const c = { x: room.cx, z: room.cz };
  const dd = Math.hypot(doorP.x - c.x, doorP.z - c.z) || 1;
  out.push({ key: 'tuergriff', x: c.x + ((doorP.x - c.x) / dd) * 0.55, y: y0 + 1.08, z: c.z + ((doorP.z - c.z) / dd) * 0.55, yaw: Math.atan2(-(doorP.x - c.x), -(doorP.z - c.z)) });
  // the ducat on a window sill (the window nearest the room's middle third)
  const wins = windows.filter((w) => w.room === room.index);
  const win = wins.sort((a, b) => Math.hypot(a.cx - c.x, a.cz - c.z) - Math.hypot(b.cx - c.x, b.cz - c.z))[0];
  if (win) {
    out.push({ key: 'dukat', x: win.cx - win.nx * 0.18, y: win.y0 + 0.02, z: win.cz - win.nz * 0.18, yaw: Math.atan2(win.nx, win.nz) });
  } else {
    const p = at(0.6, 0.06);
    out.push({ key: 'dukat', x: p.x, y: y0 + 0.95, z: p.z, yaw: Math.atan2(f.vx, f.vz) });
  }
  // the clock on a console against the far long wall (away from the door)
  const far = Math.hypot(at(0.85, 0.5).x - doorP.x, at(0.85, 0.5).z - doorP.z) > Math.hypot(at(0.15, 0.5).x - doorP.x, at(0.15, 0.5).z - doorP.z) ? 0.84 : 0.16;
  const side = win && (win.cx - c.x) * f.vx + (win.cz - c.z) * f.vz < 0 ? 0.93 : 0.07;
  const cp = at(far, side);
  out.push({ key: 'uhr', x: cp.x, y: y0 + 0.92, z: cp.z, yaw: Math.atan2(side > 0.5 ? f.vx : -f.vx, side > 0.5 ? f.vz : -f.vz) });
  return out;
}

function glintTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,240,200,1)');
  r.addColorStop(0.25, 'rgba(255,190,110,0.55)');
  r.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  // a four-pointed star (the glint)
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,240,210,0.7)';
  g.fillRect(31, 4, 2, 56);
  g.fillRect(4, 31, 56, 2);
  return new CanvasTexture(c);
}

function buildObject(key: FestsaalKey): Object3D {
  const g = new Group();
  const brass = new MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.32, emissive: 0x7a4a14, emissiveIntensity: 0.9 });
  const gold = new MeshStandardMaterial({ color: 0xe6c25a, metalness: 1, roughness: 0.25, emissive: 0x9a6a1c, emissiveIntensity: 1.0 });
  if (key === 'tuergriff') {
    // a lever handle with its rose
    const lever = new Mesh(new BoxGeometry(0.13, 0.022, 0.026), brass);
    lever.position.x = 0.06;
    const neck = new Mesh(new CylinderGeometry(0.012, 0.012, 0.05, 10), brass);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = -0.025;
    const rose = new Mesh(new CylinderGeometry(0.03, 0.03, 0.008, 18), brass);
    rose.rotation.x = Math.PI / 2;
    rose.position.z = -0.05;
    g.add(lever, neck, rose);
  } else if (key === 'dukat') {
    const coin = new Mesh(new CylinderGeometry(0.022, 0.022, 0.003, 24), gold);
    coin.rotation.z = 0.25;
    g.add(coin);
  } else if (key === 'uhr') {
    // console (dark wood), gilt case, alabaster column, white dial
    const wood = new MeshStandardMaterial({ color: 0x3b2416, roughness: 0.7 });
    const alab = new MeshStandardMaterial({ color: 0xece4d4, roughness: 0.45, emissive: 0x6a6258, emissiveIntensity: 0.7 });
    const top = new Mesh(new BoxGeometry(0.7, 0.04, 0.34), wood);
    top.position.y = -0.02;
    const leg = (x: number) => {
      const l = new Mesh(new BoxGeometry(0.04, 0.9, 0.04), wood);
      l.position.set(x, -0.47, 0);
      return l;
    };
    const base = new Mesh(new BoxGeometry(0.26, 0.05, 0.14), gold);
    base.position.y = 0.025;
    const col1 = new Mesh(new CylinderGeometry(0.022, 0.026, 0.24, 12), alab);
    col1.position.set(-0.08, 0.17, 0);
    const col2 = col1.clone();
    col2.position.x = 0.08;
    const caseM = new Mesh(new BoxGeometry(0.16, 0.16, 0.1), gold);
    caseM.position.y = 0.35;
    const dial = new Mesh(new CylinderGeometry(0.055, 0.055, 0.006, 24), new MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.4, emissive: 0x403a30, emissiveIntensity: 0.5 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.35, 0.052);
    const urn = new Mesh(new SphereGeometry(0.035, 12, 8), gold);
    urn.position.y = 0.46;
    g.add(top, leg(-0.31), leg(0.31), base, col1, col2, caseM, dial, urn);
  } else {
    // the way out: a faint ring of light on the door frame (smoke lit from the stair)
    const ring = new Mesh(new TorusGeometry(0.42, 0.012, 6, 40), new MeshStandardMaterial({ color: 0x000000, emissive: 0xffc890, emissiveIntensity: 0.9, transparent: true, opacity: 0.45 }));
    ring.scale.y = 1.6;
    g.add(ring);
    const haze = new Mesh(new PlaneGeometry(0.9, 1.8), new MeshStandardMaterial({ color: 0x000000, emissive: 0xffd6a0, emissiveIntensity: 0.35, transparent: true, opacity: 0.18, depthWrite: false }));
    g.add(haze);
  }
  return g;
}

export class FestsaalObjects {
  readonly group = new Group();
  private items: { spot: FestsaalSpot; obj: Object3D; glint: Sprite | null }[] = [];
  private tex: CanvasTexture | null = null;
  private promptOn: FestsaalKey | null = null;
  private time = 0;
  taken: FestsaalKey | null = null;

  constructor(private readonly ctx: GameContext) {
    this.group.name = 'festsaal-objects';
  }

  get active(): boolean {
    return this.items.length > 0;
  }

  spots(): FestsaalSpot[] {
    return this.items.map((i) => i.spot);
  }

  show(spots: FestsaalSpot[]): void {
    this.clear();
    this.taken = null;
    this.tex ??= glintTexture();
    for (const spot of spots) {
      const obj = buildObject(spot.key);
      obj.position.set(spot.x, spot.y, spot.z);
      obj.rotation.y = spot.yaw;
      let glint: Sprite | null = null;
      if (this.tex && spot.key !== 'nichts') {
        // drawn after the smoke cards (renderOrder 4/5 in flames.ts), no depth write
        glint = new Sprite(new SpriteMaterial({ map: this.tex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
        glint.renderOrder = 12;
        glint.scale.setScalar(0.32);
        glint.position.set(spot.x, spot.y + (spot.key === 'uhr' ? 0.38 : 0.05), spot.z);
        this.group.add(glint);
      }
      this.group.add(obj);
      this.items.push({ spot, obj, glint });
    }
    if (!this.group.parent) this.ctx.scene.add(this.group);
  }

  clear(): void {
    for (const i of this.items) {
      i.obj.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      i.obj.removeFromParent();
      i.glint?.material.dispose();
      i.glint?.removeFromParent();
    }
    this.items = [];
    this.setPrompt(null);
  }

  /** The player took `key` (E, or the story's 40 s fallback sets the flag itself). */
  take(key: FestsaalKey): boolean {
    if (this.taken || !this.items.some((i) => i.spot.key === key)) return false;
    this.taken = key;
    const it = this.items.find((i) => i.spot.key === key)!;
    if (key !== 'nichts') {
      it.obj.visible = false;
      if (it.glint) it.glint.visible = false;
    }
    this.ctx.state.update((st) => {
      st.flags[FESTSAAL_FLAG] = key;
    }, 'interiors');
    this.setPrompt(null);
    return true;
  }

  private setPrompt(k: FestsaalKey | null): void {
    if (k === this.promptOn) return;
    this.promptOn = k;
    this.ctx.ui.hud.prompt(k ? 'E' : null, k ? FESTSAAL_LABELS[k] : undefined, 'festsaal');
    // while a thing is in front of you, E is ours (the Chronik leaves the clue under it alone)
    const flags = this.ctx.state.mutable.flags;
    if (k) flags['e.owner'] = 'festsaal';
    else if (flags['e.owner'] === 'festsaal') delete flags['e.owner'];
  }

  /** Fixed step: what you face within reach gets the E prompt; E takes it. */
  update(): void {
    if (!this.items.length) return;
    const flag = this.ctx.state.state.flags[FESTSAAL_FLAG];
    if (!this.taken && typeof flag === 'string' && flag in FESTSAAL_LABELS) this.taken = flag as FestsaalKey;
    if (this.taken) return this.setPrompt(null);
    const pl = this.ctx.player;
    const p = pl.position;
    const fx = -Math.sin(pl.yaw);
    const fz = -Math.cos(pl.yaw);
    let best: FestsaalKey | null = null;
    let bestS = -1;
    for (const { spot } of this.items) {
      const dx = spot.x - p.x;
      const dz = spot.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > REACH || Math.abs(spot.y - (p.y + 1.1)) > 1.6) continue;
      const face = d < 0.4 ? 1 : (dx * fx + dz * fz) / d;
      if (face < FACE) continue;
      const s = face - d * 0.2;
      if (s > bestS) {
        bestS = s;
        best = spot.key;
      }
    }
    this.setPrompt(best);
    if (best && this.ctx.input.wasPressed('listen')) this.take(best);
  }

  frame(dt: number): void {
    if (!this.items.length) return;
    this.time += dt;
    const steady = this.ctx.settings.state.reducedFlash;
    for (const [n, i] of this.items.entries()) {
      if (!i.glint || !i.glint.visible) continue;
      const k = steady ? 0.7 : 0.55 + 0.35 * Math.max(0, Math.sin(this.time * 2.1 + n * 1.7)) ** 3;
      i.glint.material.opacity = k * (this.promptOn === i.spot.key ? 1.3 : 1);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.tex?.dispose();
  }
}
