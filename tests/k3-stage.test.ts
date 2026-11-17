import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickColumns } from '../src/systems/fx/k3-blaze';
import { AFTERNOON, COURT, DUSK, FIRE, cartAt, court, pathLength, walkerAt } from '../src/systems/fx/k3-crowd';
import { FLIGHT, courtWindows, igniteOrder, nearestWindow, toCourt, torchArc } from '../src/systems/fx/k3-torch';
import { gateFrame, leafAngle } from '../src/systems/hunt/kennelGate';
import { KENNEL_DOOR_S, KENNEL_PASS, type KennelMode, kennelRoute, makeMode } from '../src/systems/hunt/modes';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { type PackOptions, PackSim, type SimWorld } from '../src/systems/hunt/sim';
import type { ShellOpening } from '../src/systems/interiors/types';

/**
 * K3 staged in the engine (docs/ACTION-RPG.md §14, playtest round 4): the living Ehrenhof, the
 * torch, the fire seen from outside, the Zwinger breakout. Pure parts; the pictures are in
 * e2e/k3-stage.spec.ts.
 */

describe('Ehrenhof crowd (k3-crowd)', () => {
  it('court frame round-trips', () => {
    for (const [u, w] of [[0, 0], [30, 5], [62, -20]] as const) {
      const p = court(u, w);
      const [u2, w2] = toCourt(p.x, p.z);
      expect(Math.abs(u2 - u)).toBeLessThan(0.05);
      expect(Math.abs(w2 - w)).toBeLessThan(0.05);
    }
    expect(Math.hypot(COURT.e.x, COURT.e.z)).toBeCloseTo(1, 2);
  });

  it('walkers walk their way, fade at the ends and rest', () => {
    for (const w of AFTERNOON.walkers) {
      const len = pathLength(w.path);
      const mid = walkerAt(w, len / w.speed / 2 - w.offset);
      expect(mid.moving).toBe(true);
      expect(mid.fade).toBe(1);
      const rest = walkerAt(w, len / w.speed + w.rest / 2 - w.offset);
      expect(rest.fade).toBe(0);
    }
  });

  it('every scene stays inside the court (between the wings, gate to Corps de logis)', () => {
    for (const sc of [AFTERNOON, DUSK, FIRE]) {
      for (const w of sc.walkers) for (let T = 0; T < 120; T += 0.7) {
        const p = walkerAt(w, T);
        if (!p.fade) continue;
        expect(Math.abs(p.w)).toBeLessThan(21);
        expect(p.u).toBeLessThan(62);
      }
      for (const st of sc.standers) expect(Math.abs(st.at[1])).toBeLessThan(21);
    }
  });

  it('the rolling straw cart comes in, stops to unload (load shrinks) and leaves', () => {
    const cart = AFTERNOON.carts.find((c) => c.pathIn);
    expect(cart).toBeTruthy();
    const loads: number[] = [];
    let moved = false;
    let stopped = false;
    for (let T = 0; T < 200; T += 0.5) {
      const c = cartAt(cart!, T);
      if (c.fade > 0) loads.push(c.load);
      if (c.moving) moved = true;
      else if (c.fade > 0) stopped = true;
    }
    expect(moved && stopped).toBe(true);
    expect(Math.min(...loads)).toBeLessThan(Math.max(...loads));
  });
});

describe('the torch (k3-torch)', () => {
  it('arcs from the hand to the window, apex above both', () => {
    const a = { x: 0, y: 2, z: 0 };
    const b = { x: 20, y: 1.5, z: 0 };
    expect(torchArc(a, b, 0)).toEqual(a);
    const end = torchArc(a, b, FLIGHT);
    expect(end.x).toBeCloseTo(20);
    expect(end.y).toBeCloseTo(1.5);
    expect(torchArc(a, b, FLIGHT / 2, 5).y).toBeGreaterThan(6);
  });

  it('court windows: ground floor, facing the court, one per opening; ignite outward from the hit', () => {
    // a box building on the court's east side (u 62…70), windows on its court face (u = 62)
    const corners = [court(62, -20), court(70, -20), court(70, 20), court(62, 20)];
    const ring: [number, number][] = corners.map((p) => [p.x, p.z]);
    const rings = new Map([['B01', ring]]);
    const op = (w0: number, w1: number, y0: number, dz = 0): ShellOpening => {
      const a = court(62, w0);
      const b = court(62, w1);
      return { building: 'B01', kind: 'window', ax: a.x + dz, az: a.z, bx: b.x + dz, bz: b.z, y0, y1: y0 + 1.8 } as ShellOpening;
    };
    const ops = [op(-10, -9, 346), op(-10, -9, 346, 0.2), op(-4, -3, 346), op(2, 3, 346), op(8, 9, 346), op(2, 3, 352)];
    const wins = courtWindows(ops, rings);
    expect(wins.length).toBe(4); // the upper floor is out, the double glass is one window
    for (const w of wins) {
      // the normal points into the court (towards smaller u)
      const [u1] = toCourt(w.x + w.nx, w.z + w.nz);
      expect(u1).toBeLessThan(62);
    }
    const first = nearestWindow(wins, court(62, 2.5).x, court(62, 2.5).z);
    const order = igniteOrder(wins, first);
    expect(order[0]).toBe(first);
    expect(new Set(order).size).toBe(wins.length);
  });
});

describe('the fire from outside (k3-blaze)', () => {
  it('picks the strongest burning buildings, at most MAX_COLUMNS', () => {
    const m = new Map<string, { x: number; z: number; y: number; sum: number; n: number }>();
    for (let i = 0; i < 9; i++) m.set(`B${i}`, { x: i, z: 0, y: 360, sum: i * 0.5, n: 4 });
    const cols = pickColumns(m);
    expect(cols.length).toBe(6);
    expect(cols[0]!.I).toBeGreaterThanOrEqual(cols[5]!.I);
    expect(cols.every((c) => c.I > 0 && c.I <= 1)).toBe(true);
    expect(pickColumns(new Map([['x', { x: 0, z: 0, y: 0, sum: 0, n: 1 }]])).length).toBe(0);
  });
});

describe('the Zwinger breakout (hunt kennel)', () => {
  const yard: [number, number][] = [
    [1182.54, -1594.5],
    [1250.46, -1594.5],
    [1250.46, -1548.1],
    [1182.54, -1548.1],
  ];

  it('the gate sits in the east wall, opening outward', () => {
    const f = gateFrame(yard, { x: 1252, z: -1579 })!;
    expect(f.x).toBeCloseTo(1250.46);
    expect(f.z).toBeCloseTo(-1579);
    expect(f.nx).toBeCloseTo(1);
    expect(Math.abs(f.nz)).toBeLessThan(1e-6);
  });

  it('the leaves swing past and settle open (and simply open in reduced motion)', () => {
    expect(leafAngle(0)).toBe(0);
    const max = Math.max(...Array.from({ length: 60 }, (_, i) => leafAngle(i * 0.02)));
    const open = leafAngle(5);
    expect(max).toBeGreaterThan(open);
    expect(open).toBeCloseTo((105 * Math.PI) / 180, 2);
    expect(leafAngle(5, true)).toBeCloseTo(open, 5);
  });

  it('the route bends KENNEL_PASS m beside a player near the gate, and not for one far off', () => {
    const via = [{ x: 1252, z: -1579 }, { x: 1272, z: -1604 }, { x: 1300, z: -1650 }];
    const far = kennelRoute(via, { x: 1200, z: -1450 });
    expect(far).toEqual(via);
    const p = { x: 1257, z: -1576 };
    const r = kennelRoute(via, p);
    expect(r[0]).toEqual(via[0]);
    expect(r.length).toBe(via.length + 2);
    for (const q of [r[1]!, r[2]!]) {
      // on the pass line: KENNEL_PASS m from the player's line of travel
      const hx = via[1]!.x - p.x;
      const hz = via[1]!.z - p.z;
      const hl = Math.hypot(hx, hz);
      const lateral = Math.abs(((q.x - p.x) * hz - (q.z - p.z) * hx) / hl);
      expect(lateral).toBeCloseTo(KENNEL_PASS, 3);
    }
    // never back into the yard
    expect(r[1]!.x).toBeGreaterThan(1250.46);
  });

  it('seven released hounds run past the player within 3–6 m, none closer', () => {
    const world: SimWorld = {
      heightAt: () => 300,
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      bounds: () => ({ x0: -3000, z0: -3000, x1: 3000, z1: 3000 }),
      trailBreakAt: () => null,
    } as SimWorld;
    const via = [{ x: 1252, z: -1579 }, { x: 1272, z: -1604 }, { x: 1300, z: -1650 }];
    const opts: PackOptions = {
      x: 1222, z: -1572, radius: 12, intensity: 0.4, hounds: 7, pikeur: false, seed: 53, sight: 14, beacon: 65,
      gentle: false, rauhnacht: false, mode: 'kennel', target: { x: 1220, z: -1572 }, via,
    } as PackOptions;
    for (const p of [{ x: 1257, z: -1577 }, { x: 1256, z: -1584 }, { x: 1258, z: -1572 }]) {
      const sim = new PackSim(world, null, { ...opts }, p, null, makeMode);
      const ps: PlayerSense = { x: p.x, y: 300, z: p.z, stance: 'stand', noise: 0, visibility: 1, lanternLit: false, speed: 0, flying: false };
      const ctl = sim.ctl as KennelMode;
      for (let i = 0; i < 120; i++) sim.update(1 / 60, ps);
      // hounds are pacing at the far side of the pen, then the doors open
      ctl.release(p);
      let min = Infinity;
      for (let i = 0; i < 60 * 25 && ctl.phase !== 'gone'; i++) {
        sim.update(1 / 60, ps);
        if (ctl.t < KENNEL_DOOR_S) continue;
        for (const h of sim.hounds) if (h.gone < 0.5) min = Math.min(min, Math.hypot(h.x - p.x, h.z - p.z));
      }
      expect(ctl.phase).toBe('gone');
      expect(sim.caught).toBeNull();
      expect(min).toBeGreaterThanOrEqual(2.8);
      expect(min).toBeLessThanOrEqual(6);
    }
  });
});

describe('K3 content: no stage direction left as a caption only', () => {
  it('bracketed captions in chapter 3 are short SFX next to a visible event', () => {
    const story = readFileSync('content/story/03-kapitel-3.story.json', 'utf8');
    const caps = [...story.matchAll(/"caption": "(\[[^"]*\])"/g)].map((m) => m[1]!);
    for (const c of caps) expect(c.length).toBeLessThanOrEqual(30);
    expect(story).not.toContain('Jost zieht die Riegel');
    const pack = readFileSync('content/packs/kapitel-3.pack.json', 'utf8');
    expect(pack).not.toMatch(/"text_de": "\[/);
  });
});
