import {
  type AnimationClip,
  type Group,
  LinearSRGBColorSpace,
  LoadingManager,
  type Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  type WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Era } from '../core/era';
import { kqStandardize } from '../render/standard';
import { ASSETS, ASSET_BY_ID } from './manifest';
import type { AssetArea, AssetEntry, LicencesFile } from './types';

export const ASSETS_URL = `${import.meta.env.BASE_URL}assets/`;

export interface LoadedModel {
  /** The loaded scene. Do not add it to the world directly; use `assets.instance(id)`. */
  scene: Group;
  animations: AnimationClip[];
}

export type AssetProgress = (loadedBytes: number, totalBytes: number) => void;

/**
 * Loads and caches the manifest's assets (src/assets/manifests/*.ts):
 * - models: glTF / GLB, meshopt (EXT_meshopt_compression), Draco and KTX2 textures supported
 *   (decoders bundled by Vite, fetched only when a file needs them); standard materials are
 *   patched to the world light (render/standard.ts) unless the entry says `worldLight: false`,
 * - textures: WebP / PNG / JPG via TextureLoader, `.ktx2` via KTX2Loader (Basis), colour space,
 *   wrapping and anisotropy from the entry,
 * - areas: `loadArea('forest')` fetches every entry of a group (byte progress), `prefetchEra`
 *   fetches the entries that list an era; each file is fetched once (promise cache).
 * Tracks use `await ctx.assets.instance('nature.stump.oak')` (a clone, skinned meshes included)
 * and `await ctx.assets.texture('ground.forest.albedo')`.
 */
export class AssetLoader {
  private readonly gltf: GLTFLoader;
  private readonly tex: TextureLoader;
  private ktx2: KTX2Loader | null = null;
  private draco: DRACOLoader | null = null;
  private readonly models = new Map<string, Promise<LoadedModel>>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly ready = new Map<string, LoadedModel | Texture>();
  private licencesP: Promise<LicencesFile | null> | null = null;
  /** Bytes fetched so far (all areas), for the perf HUD / tests. */
  loadedBytes = 0;

  constructor(
    private readonly renderer: WebGLRenderer | null,
    readonly baseUrl = ASSETS_URL,
    readonly entries: ReadonlyMap<string, AssetEntry> = ASSET_BY_ID,
  ) {
    const manager = new LoadingManager();
    this.gltf = new GLTFLoader(manager);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.tex = new TextureLoader(manager);
  }

  /** Manifest entry (throws on an unknown id: a typo should fail loudly in dev and tests). */
  entry(id: string): AssetEntry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`[assets] unknown asset '${id}'`);
    return e;
  }

  /** Entries of an area (and optionally only those listing an era). */
  list(area?: AssetArea, era?: Era): AssetEntry[] {
    return [...this.entries.values()].filter((e) => (area === undefined || e.area === area) && (era === undefined || e.eras?.includes(era) === true));
  }

  /** Already loaded (sync access after `loadArea`), else null. */
  peek<T extends LoadedModel | Texture>(id: string): T | null {
    return (this.ready.get(id) as T | undefined) ?? null;
  }

  // decoders: three's DRACOLoader / KTX2Loader resolve their wasm next to the bundle (Vite emits
  // them as hashed files); they are fetched only when a file actually uses Draco / Basis
  private ensureDecoders(url: string): void {
    if (!this.ktx2 && this.renderer) {
      this.ktx2 = new KTX2Loader().detectSupport(this.renderer);
      this.gltf.setKTX2Loader(this.ktx2);
    }
    if (/\.glb$|\.gltf$/i.test(url) && !this.draco) {
      this.draco = new DRACOLoader();
      this.gltf.setDRACOLoader(this.draco);
    }
  }

  /** Load (once) a model; resolves with the shared original. */
  model(id: string, onBytes?: (n: number) => void): Promise<LoadedModel> {
    let p = this.models.get(id);
    if (p) return p;
    const e = this.entry(id);
    if (e.kind !== 'model') throw new Error(`[assets] '${id}' is a ${e.kind}, not a model`);
    this.ensureDecoders(e.url);
    let last = 0;
    p = this.gltf
      .loadAsync(this.baseUrl + e.url, (ev) => {
        const d = ev.loaded - last;
        last = ev.loaded;
        onBytes?.(d);
      })
      .then((g: GLTF) => {
        this.loadedBytes += e.bytes;
        onBytes?.(Math.max(0, e.bytes - last));
        const m: LoadedModel = { scene: g.scene, animations: g.animations };
        if (e.worldLight !== false) kqStandardize(m.scene);
        m.scene.name = `asset:${id}`;
        this.ready.set(id, m);
        return m;
      });
    p.catch(() => this.models.delete(id));
    this.models.set(id, p);
    return p;
  }

  /** A fresh copy of a model's scene (shares geometry, materials and textures; skinning-safe). */
  async instance(id: string): Promise<Object3D> {
    const m = await this.model(id);
    return cloneSkinned(m.scene);
  }

  /** Load (once) a texture with the entry's colour space / wrapping / anisotropy. */
  texture(id: string, onBytes?: (n: number) => void): Promise<Texture> {
    let p = this.textures.get(id);
    if (p) return p;
    const e = this.entry(id);
    if (e.kind === 'model') throw new Error(`[assets] '${id}' is a model, not a texture`);
    const o = e.texture ?? { colorSpace: 'srgb' };
    const url = this.baseUrl + e.url;
    let load: Promise<Texture>;
    if (/\.ktx2$/i.test(e.url)) {
      this.ensureDecoders(e.url);
      if (!this.ktx2) throw new Error('[assets] KTX2 needs a renderer');
      load = this.ktx2.loadAsync(url);
    } else {
      load = this.tex.loadAsync(url);
    }
    p = load.then((t) => {
      t.colorSpace = o.colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
      if (o.repeat) t.wrapS = t.wrapT = RepeatWrapping;
      const maxAniso = this.renderer?.capabilities.getMaxAnisotropy() ?? 1;
      t.anisotropy = Math.min(maxAniso, o.anisotropy ?? 8);
      if (!/\.ktx2$/i.test(e.url)) t.flipY = o.flipY === true;
      t.name = id;
      t.needsUpdate = true;
      this.loadedBytes += e.bytes;
      onBytes?.(e.bytes);
      this.ready.set(id, t);
      return t;
    });
    p.catch(() => this.textures.delete(id));
    this.textures.set(id, p);
    return p;
  }

  /** Load one entry of any kind. */
  load(id: string, onBytes?: (n: number) => void): Promise<unknown> {
    return this.entry(id).kind === 'model' ? this.model(id, onBytes) : this.texture(id, onBytes);
  }

  /**
   * Fetch a set of entries with byte progress. Failures are logged, not thrown (a missing prop
   * must not stop the game); resolves with the ids that failed.
   */
  async loadMany(entries: AssetEntry[], onProgress?: AssetProgress): Promise<string[]> {
    const total = entries.reduce((s, e) => s + e.bytes, 0);
    let done = 0;
    onProgress?.(0, total);
    const failed: string[] = [];
    await Promise.all(
      entries.map((e) =>
        this.load(e.id, (n) => {
          done = Math.min(total, done + n);
          onProgress?.(done, total);
        }).catch((err: unknown) => {
          failed.push(e.id);
          console.warn(`[assets] ${e.id} failed`, err);
        }),
      ),
    );
    onProgress?.(total, total);
    return failed;
  }

  /** Everything of an area (e.g. 'core' behind the title, 'palace' when the past opens). */
  loadArea(area: AssetArea, onProgress?: AssetProgress): Promise<string[]> {
    return this.loadMany(this.list(area), onProgress);
  }

  /** Background prefetch of the entries that list this era. */
  prefetchEra(era: Era): Promise<string[]> {
    return this.loadMany(this.list(undefined, era));
  }

  /** public/assets/LICENSES.json (for the "Lizenzen & Quellen" screen), null when missing. */
  licences(): Promise<LicencesFile | null> {
    this.licencesP ??= fetch(`${this.baseUrl}LICENSES.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LicencesFile>) : null))
      .catch(() => null);
    return this.licencesP;
  }
}

/** All manifest entries (for tools / tests). */
export { ASSETS };
