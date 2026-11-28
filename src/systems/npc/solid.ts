/**
 * A solid NPC: a living person in the scene (./look.ts). The body is the rigged CC0 human in the
 * figure's costume with opaque, world-lit materials (rigged.ts `RiggedNpc`, look 'solid'), on
 * every quality tier. Nothing of the ghost is built: no smoke silhouette, no mist at the feet, no
 * motes.
 *
 * Until the model is in there is nothing to draw and the fade waits at 0; then the body dithers
 * in (`fadeToward`) and stays fully opaque until the placement leaves or its era ends. A model
 * that fails to load is a plain capsule in the costume's main colour, so the person can still be
 * found and spoken to.
 */
import { CapsuleGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { kqStandard } from '../../render/standard';
import { costumeFor } from '../characters/catalog';
import type { FigureFrame, NpcFigure, RiggedBody } from './figure';
import { drawnAt, fadeToward } from './look';
import type { NpcLook } from './roster';

const WHITE = new Color(1, 1, 1);

export class SolidFigure implements NpcFigure {
  readonly kind = 'solid' as const;
  readonly object = new Group();
  alpha = 0;
  target = 1;
  talk = 0;
  /** Solid figures do not kneel (./look.ts `kneels`); kept for the shared surface. */
  kneel = 0;
  private body: RiggedBody | null = null;
  private capsule: Mesh | null = null;
  private talkK = 0;
  private near = true;

  constructor(readonly look: NpcLook) {
    this.object.name = `npc-${look.id}`;
    this.object.visible = false;
  }

  /** A living person takes the era's light from the world: no tint of its own. */
  setEra(): void {}

  get tint(): Color {
    return WHITE;
  }

  setRigged(r: RiggedBody | null): void {
    if (this.body && this.body !== r) this.body.dispose();
    this.body = r;
    if (r) {
      this.dropCapsule();
      this.object.add(r.rig.root);
    }
  }

  get isRigged(): boolean {
    return this.body !== null;
  }

  /** How opaque the body is drawn now (1 = every material fully opaque; 0 before it is in). */
  get opacity(): number {
    if (this.body) return this.body.opacity ?? this.alpha;
    return this.capsule ? (this.capsule.material as MeshStandardMaterial).opacity : 0;
  }

  /** The model failed to load: stand a capsule in (still placed, found and spoken to). */
  fail(): void {
    if (this.body || this.capsule) return;
    const h = this.look.height;
    const r = 0.24 * this.look.build;
    const geo = new CapsuleGeometry(r, Math.max(0.1, h - 2 * r), 4, 10);
    geo.translate(0, h / 2, 0);
    const c = costumeFor(this.look);
    const mat = kqStandard(new MeshStandardMaterial({ color: c.Green ?? c.LimeGreen ?? c.Brown ?? 0x808080, roughness: 0.8 }), { ambient: 1.15 });
    mat.alphaHash = true;
    mat.opacity = 0;
    const m = new Mesh(geo, mat);
    m.name = 'npc-fallback';
    m.castShadow = true;
    this.capsule = m;
    this.object.add(m);
  }

  private dropCapsule(): void {
    const m = this.capsule;
    if (!m) return;
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as MeshStandardMaterial).dispose();
    this.capsule = null;
  }

  frame(dt: number, o: FigureFrame): void {
    const body = this.body;
    const ready = body !== null || this.capsule !== null;
    this.alpha = ready ? fadeToward(this.alpha, this.target, dt) : 0;
    this.near = drawnAt(o.dist ?? 0, this.near);
    this.object.visible = ready && this.alpha > 0.01 && this.near;
    this.talkK += ((this.talk ? 1 : 0) - this.talkK) * Math.min(1, dt * 3);
    if (this.capsule) (this.capsule.material as MeshStandardMaterial).opacity = this.alpha;
    if (body && this.object.visible) {
      const motion = o.reducedMotion ? 0.15 : 1;
      body.frame({ dt, alpha: this.alpha, talk: this.talkK, motion, stutter: 0, reducedMotion: o.reducedMotion, lookAt: o.lookAt ?? null });
    }
  }

  dispose(): void {
    this.body?.dispose();
    this.body = null;
    this.dropCapsule();
    this.object.removeFromParent();
  }
}
