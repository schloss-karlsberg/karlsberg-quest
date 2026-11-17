/**
 * K2 "eine einzelne Kerze" (was "[Hinter den Galeriefenstern: eine einzelne Kerze]"): a match
 * flares behind a gallery window, then a single candle burns there, warm in the frost night,
 * and a faint light falls on the frost below the window. Flicker off with reduced flash.
 * Taken down by a shift (the candle is February 1793).
 */
import { Raycaster, Vector3 } from 'three';
import type { GameContext } from '../../../core/context';
import { GlowPoints, type Piece, clamp01, pxScale, smooth } from './common';

export class CandlePiece implements Piece {
  readonly id = 'k2-candle';
  done = false;
  private t = 0;
  private readonly glow: GlowPoints;
  private readonly x: number;
  private readonly y: number;
  private readonly z: number;
  private readonly gy: number;

  constructor(
    private readonly ctx: GameContext,
    x: number,
    z: number,
    y?: number,
  ) {
    // the gallery's ground floor windows sit above a tall plinth: the flame ~3 m above the ground
    let py = y ?? ctx.world.heightAt(x, z) + 3.0;
    // the candle stands inside, behind the glass: seen from where you are, it sits on the facade
    // (the walls are solid to the eye), so put the flame just this side of it
    const pp = ctx.player.position;
    const eye = new Vector3(pp.x, pp.y + 1.6, pp.z);
    const to = new Vector3(x, py, z);
    const d = to.distanceTo(eye);
    const dir = to.clone().sub(eye).normalize();
    const hit = new Raycaster(eye, dir, 0.5, d + 0.5).intersectObject(ctx.world.palace.object, true)[0];
    if (hit && hit.distance < d + 0.5) {
      x = hit.point.x - dir.x * 0.08;
      z = hit.point.z - dir.z * 0.08;
      py = hit.point.y;
    }
    this.x = x;
    this.z = z;
    this.y = py;
    this.gy = ctx.world.heightAt(x, z);
    this.glow = new GlowPoints(4, { additive: true, renderOrder: 64 });
    ctx.scene.add(this.glow.points);
  }

  get lit(): number {
    return clamp01((this.t - 0.6) / 1.2);
  }

  frame(dt: number): void {
    this.t += dt;
    const t = this.t;
    const steady = this.ctx.settings.state.reducedFlash;
    // the match: a short bright flare, then the candle takes the flame
    const match = steady ? 0 : Math.max(0, 1 - Math.abs(t - 0.35) / 0.35) * 1.5;
    const lit = smooth(this.lit);
    const fl = steady ? 1 : 0.82 + 0.18 * Math.sin(t * 13.1) * Math.sin(t * 4.7 + 1);
    const a = lit * fl;
    const { x, y, z, gy } = this;
    this.glow.pos.set([x, y, z, x, y, z, x, y + 0.2, z, x, gy + 0.08, z], 0);
    this.glow.col.set(
      [
        6.0, 3.6, 1.2, Math.max(a, match * 0.9),
        3.0, 1.4, 0.35, a * 0.8 + match * 0.3,
        1.8, 0.8, 0.2, a * 0.5,
        0.9, 0.5, 0.2, a * 0.25,
      ],
      0,
    );
    this.glow.size[0] = 0.2 + match * 0.15;
    this.glow.size[1] = 1.8;
    this.glow.size[2] = 3.4;
    this.glow.size[3] = 5;
    this.glow.commit(pxScale(this.ctx));
  }

  dispose(): void {
    this.glow.dispose();
  }
}
