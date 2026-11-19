import type { DataArrayTexture, PerspectiveCamera, Scene, Texture } from 'three';
import type { AssetLoader } from '../../assets/loader';
import type { Era } from '../../core/era';
import type { GraphicsLevel } from '../../core/save';
import type { Forest } from '../forest';
import type { Terrain } from '../terrain';
import { GroundCover, type GroundCoverSource } from './groundcover';
import { NatureProps } from './props';
import { stripToArray } from './strips';

/** Asset ids of the nature track's texture strips (src/assets/manifests/nature.ts). */
export const NATURE_TEX = {
  groundAlbedo: 'nature.ground.albedo',
  groundNH: 'nature.ground.nh',
  barkAlbedo: 'nature.bark.albedo',
  barkNH: 'nature.bark.nh',
} as const;

/**
 * Nature track orchestration (docs/ART-DIRECTION.md §5): the CC0 ground set on the terrain, the
 * bark set on the trees, the near ground cover (grass, flowers, reeds) and the scattered CC0
 * props (ferns, rocks, logs, stumps). Everything heavy is tier-gated: on `low` (SwiftShader e2e,
 * weak GPUs) nothing is fetched and the procedural look stays; from `medium` up the textures
 * stream in (≈ 4.5 MB) and the near layers appear.
 */
export class Nature {
  private assets: AssetLoader | null = null;
  private level: GraphicsLevel = 'low';
  private sets: { ground: { albedo: DataArrayTexture; nh: DataArrayTexture }; bark: { albedo: DataArrayTexture; nh: DataArrayTexture } } | null = null;
  private loading: Promise<void> | null = null;
  readonly cover: GroundCover;
  readonly props: NatureProps;
  /** Test / debug status. */
  readonly status = { textures: 'off' as 'off' | 'loading' | 'on' | 'failed', level: 'low' as GraphicsLevel };

  constructor(
    private readonly terrain: Terrain,
    private readonly forest: Forest,
    scene: Scene,
    src: GroundCoverSource,
  ) {
    this.cover = new GroundCover(src);
    this.props = new NatureProps(src);
    scene.add(this.cover.object, this.props.object);
  }

  /** Assets become available (boot, after the loader exists). */
  attach(assets: AssetLoader): void {
    this.assets = assets;
    this.props.attach(assets);
    this.sync();
  }

  /** Quality tier changed (render/quality.ts listener). */
  setLevel(level: GraphicsLevel): void {
    this.level = level;
    this.status.level = level;
    this.cover.setLevel(level);
    this.props.setLevel(level);
    this.sync();
  }

  setEra(era: Era): void {
    this.cover.setEra(era);
    this.props.setEra(era);
  }

  frame(camera: PerspectiveCamera): void {
    this.cover.update(camera);
    this.props.update(camera);
  }

  private sync(): void {
    const want = this.level !== 'low';
    if (!want) {
      this.terrain.setGroundSet(null);
      this.forest.setBark(null);
      if (this.status.textures === 'on') this.status.textures = 'off';
      return;
    }
    if (this.sets) {
      this.apply();
      return;
    }
    if (!this.assets || this.loading) return;
    this.status.textures = 'loading';
    const a = this.assets;
    this.loading = Promise.all([a.texture(NATURE_TEX.groundAlbedo), a.texture(NATURE_TEX.groundNH), a.texture(NATURE_TEX.barkAlbedo), a.texture(NATURE_TEX.barkNH)])
      .then(([ga, gn, ba, bn]: Texture[]) => {
        this.sets = {
          ground: { albedo: stripToArray(ga!, 8, 'srgb'), nh: stripToArray(gn!, 8, 'linear') },
          bark: { albedo: stripToArray(ba!, 3, 'srgb', 4), nh: stripToArray(bn!, 3, 'linear', 4) },
        };
        this.apply();
      })
      .catch((err: unknown) => {
        this.status.textures = 'failed';
        console.warn('[nature] ground / bark textures failed, keeping the procedural look', err);
      });
  }

  private apply(): void {
    if (!this.sets || this.level === 'low') return;
    this.terrain.setGroundSet(this.sets.ground);
    this.forest.setBark(this.sets.bark);
    this.status.textures = 'on';
  }
}
