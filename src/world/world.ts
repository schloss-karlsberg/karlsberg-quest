import { Color, LinearSRGBColorSpace, type PerspectiveCamera, type Scene, SRGBColorSpace, type Texture, TextureLoader, Vector3, type WebGLRenderer } from 'three';
import { ERA_INFO, type Era } from '../core/era';
import { GROUND_NAMES, type GameData } from '../data/types';
import type { PostFX } from '../render/post';
import { SunShadows } from '../render/shadows';
import { atmosphere } from './atmosphere';
import { FootprintCollider, type Ring } from './collision';
import { ERA_LOOKS, type EraLook, dirFromAzEl } from './eraPresets';
import { Forest, generateTrees } from './forest';
import { Heightfield, classAt } from './heightfield';
import { Palace, RUIN_KEEP } from './palace';
import { buildCover, buildSurface, rasterLines } from './rasters';
import { Sky } from './sky';
import { Terrain, type TerrainDataset, makeDataTexture, makeHeightTexture } from './terrain';
import { Nature } from './vegetation/nature';
import { Water } from './water';
import type { AssetLoader } from '../assets/loader';
import type { GraphicsLevel } from '../core/save';

export type ScanMode = 0 | 1 | 2 | 3;

/**
 * The outdoor world: terrain (2025 / 1789 datasets), sky, forest, 1789 palace, footprint
 * collision and the era look. Owns no gameplay; systems talk to it through this API.
 */
export class World {
  readonly terrain: Terrain;
  readonly sky = new Sky();
  readonly forest = new Forest();
  readonly palace = new Palace();
  /** Sun / moon shadows (render/shadows.ts); boot renders the map each frame before the scene. */
  readonly shadows = new SunShadows();
  /** Nature track: CC0 ground / bark sets, near ground cover, forest props (world/vegetation). */
  readonly nature: Nature;
  /** Lakes and ponds (world/water.ts). */
  readonly water: Water;
  /** Bumped by every `applyLook()` (the environment light rebuilds its sky PMREM on change). */
  lookVersion = 0;
  readonly heightfields: Record<'2025' | '1789', Heightfield>;
  readonly collider: FootprintCollider;
  private readonly ruinKeep: ReadonlySet<number>;
  private readonly datasets: Record<'2025' | '1789', TerrainDataset>;
  private readonly covers: { today: Texture; historic: Texture };
  private readonly trees: { today: Map<string, Float32Array>; historic: Map<string, Float32Array> };
  private readonly coverWeights: { today: Uint8Array; historic: Uint8Array };
  private era: Era = 'today';
  private hf: Heightfield;
  private scanTarget = 0;
  private mapTarget = 0;
  private mapTex: Texture | null = null;
  /** Current look (copy of the era preset; features may tweak it and call `applyLook`). */
  look: EraLook = structuredClone(ERA_LOOKS.today);
  readonly grid: { cols: number; rows: number; cell: number; x0: number; z0: number };

  constructor(
    readonly data: GameData,
    scene: Scene,
    private readonly post: PostFX,
  ) {
    const m = data.meta;
    this.grid = { cols: m.cols, rows: m.rows, cell: m.cell, x0: m.origin.x, z0: m.origin.z };
    this.heightfields = {
      '2025': new Heightfield(this.grid, data.heights['2025']),
      '1789': new Heightfield(this.grid, data.heights['1789']),
    };
    this.hf = this.heightfields['2025'];
    this.terrain = new Terrain(m.cols, m.rows, m.cell, m.origin.x, m.origin.z);
    // trees vanish inside the relief-scan / map-lens radius (bare ground): share the uniforms
    for (const k of ['uScanMix', 'uMapMix', 'uScanCenter', 'uScanRadius'] as const) this.forest.material.uniforms[k] = this.terrain.uniforms[k]!;
    const ds = (key: '2025' | '1789'): TerrainDataset => {
      const hf = this.heightfields[key];
      return {
        key,
        hf,
        heightTex: makeHeightTexture(hf),
        surfTex: makeDataTexture(buildSurface(hf.data, this.grid), m.cols, m.rows, true),
        coverTex: null as unknown as TerrainDataset['coverTex'],
        bounds: this.terrain.computeBounds(hf),
      };
    };
    this.datasets = { '2025': ds('2025'), '1789': ds('1789') };

    // paths raster (today) from the OSM walk graph
    const paths = new Float32Array(m.cols * m.rows);
    const P = data.paths;
    const halfW = [0.9, 1.4, 2.4]; // path, track, road
    for (let k = 0; k < P.edges.length; k += 4) {
      const a = P.edges[k]!;
      const b = P.edges[k + 1]!;
      const kind = P.edges[k + 2]!;
      rasterLines(paths, this.grid, [P.nodes[a * 3]!, P.nodes[a * 3 + 2]!, P.nodes[b * 3]!, P.nodes[b * 3 + 2]!], halfW[kind] ?? 1, kind === 0 ? 0.6 : 0.85);
    }
    const coverToday = buildCover(this.grid, { ground: data.ground, canopy: data.canopy, paths });
    const coverHist = buildCover(this.grid, { ground: data.ground, canopy: null, paths: null });
    this.coverWeights = { today: coverToday, historic: coverHist };
    this.covers = {
      today: makeDataTexture(coverToday, m.cols, m.rows, true),
      historic: makeDataTexture(coverHist, m.cols, m.rows, true),
    };
    this.trees = {
      today: generateTrees({ hf: this.heightfields['2025'], canopy: data.canopy, paths, noTreesOnWater: data.ground, spacing: 8.5, seed: 1 }).tiles,
      historic: generateTrees({ hf: this.heightfields['1789'], ground: data.ground, spacing: 7.5, seed: 2 }).tiles,
    };
    this.collider = new FootprintCollider(data.footprints.buildings.map((b) => b.ring as Ring));
    this.ruinKeep = new Set(RUIN_KEEP.map((id) => data.footprints.buildings.findIndex((b) => b.id === id)).filter((i) => i >= 0));

    scene.add(this.sky.mesh, this.terrain.object, this.forest.object, this.palace.object);

    const src = {
      height: (x: number, z: number) => this.hf.heightAt(x, z),
      cover: (x: number, z: number, out: Float32Array) => this.coverSample(x, z, out),
      inside: (x: number, z: number) => this.hf.inBounds(x, z, 4),
    };
    this.nature = new Nature(this.terrain, this.forest, scene, src);
    this.water = new Water(data.ground, this.grid, this.heightfields, this.sky);
    scene.add(this.water.object);
    // the near layers are not worth their cost in the half-resolution lake reflection
    this.water.reflectionSkip = [this.nature.cover.object, this.nature.props.object];
  }

  /** CC0 assets for the nature layers (boot, once the loader exists); the renderer bakes tree impostors. */
  attachAssets(assets: AssetLoader, renderer?: WebGLRenderer): void {
    this.nature.attach(assets, renderer);
  }

  /** Quality tier (render/quality.ts listener): nature layers and water detail. */
  setDetail(level: GraphicsLevel): void {
    this.forest.setAlphaToCoverage(level !== 'low');
    this.nature.setLevel(level);
    this.water.setLevel(level);
  }

  /** Land cover [forest, water, bare, lawn] 0..1 at x/z in the current era. */
  private coverSample(x: number, z: number, out: Float32Array): void {
    const w = this.era === 'today' ? this.coverWeights.today : this.coverWeights.historic;
    const c = Math.round((x - this.grid.x0) / this.grid.cell);
    const r = Math.round((z - this.grid.z0) / this.grid.cell);
    if (c < 0 || r < 0 || c >= this.grid.cols || r >= this.grid.rows) {
      out.fill(0);
      return;
    }
    const o = (r * this.grid.cols + c) * 4;
    for (let k = 0; k < 4; k++) out[k] = w[o + k]! / 255;
  }

  async loadPalace(): Promise<void> {
    await this.palace.load(`${this.data.baseUrl}palace/buildings.glb`, this.data.footprints.buildings);
    this.palace.setMode(ERA_INFO[this.era].palace);
  }

  get currentEra(): Era {
    return this.era;
  }

  /** Current terrain heightfield. */
  get heightfield(): Heightfield {
    return this.hf;
  }

  /**
   * Optional ground override (interiors system): floor height at x/z (storeys, stairs, door
   * steps) or null for the terrain. Additive hook; null = plain terrain.
   */
  groundOverride: ((x: number, z: number, terrain: number, yHint?: number) => number | null) | null = null;
  /**
   * Optional room lookup (interiors system): centre and floor height of a walkable palace room by
   * catalogue id ('B01.2.og-festsaal') or full id, null when unknown. Used to place things (NPCs)
   * on the right storey.
   */
  roomAnchor: ((id: string) => { x: number; z: number; y: number; roomId: string; building: string } | null) | null = null;
  /**
   * The way into a building for a goal inside it (interiors feature): the point in front of the
   * best outer door, seen from (fromX, fromZ); null when (x, z) is not inside a walkable building.
   */
  entranceFor: ((x: number, z: number, fromX: number, fromZ: number) => { x: number; z: number } | null) | null = null;
  /**
   * The next door on the walk to a goal inside a building (interiors feature): from outside the
   * outer door, inside the next door through the rooms; null when there is no door to go through
   * (the goal is in this room, outside every building, or no way is known).
   */
  routeTo: ((x: number, z: number, fromX: number, fromZ: number, fromY: number) => { x: number; z: number; door: boolean; mark?: { x: number; y: number; z: number } } | null) | null = null;
  /**
   * Optional ceiling lookup (interiors system): the ceiling height of the room whose floor holds
   * (x, z) at about height y, null outdoors. The third-person camera stays under it.
   */
  ceilingAt: ((x: number, z: number, y: number) => number | null) | null = null;
  /** Optional surface override (interiors: parquet / stone floors), null = land cover. */
  surfaceOverride: ((x: number, z: number) => string | null) | null = null;

  /**
   * Ground height (m) at local x/z in the current era. `yHint` (optional) picks the storey inside
   * a walkable building (the highest floor at most a step above it); without it the interiors
   * decide (the player's storey near the player, else clue rooms / the ground floor).
   */
  heightAt(x: number, z: number, yHint?: number): number {
    const h = this.hf.heightAt(x, z);
    return this.groundOverride?.(x, z, h, yHint) ?? h;
  }

  /** Land-cover class name at x/z ('forest', 'water', …) in the current era. */
  surfaceAt(x: number, z: number): string {
    const o = this.surfaceOverride?.(x, z);
    if (o) return o;
    if (this.era === 'today') {
      const c = this.coverAt(x, z);
      if (classAt(this.grid, this.data.ground, x, z) === 5) return 'water';
      return c > 0.5 ? 'forest' : 'meadow';
    }
    return GROUND_NAMES[classAt(this.grid, this.data.ground, x, z)] ?? 'meadow';
  }

  /** 0..1 tree cover at x/z in the current era. */
  coverAt(x: number, z: number): number {
    const w = this.era === 'today' ? this.coverWeights.today : this.coverWeights.historic;
    const c = Math.round((x - this.grid.x0) / this.grid.cell);
    const r = Math.round((z - this.grid.z0) / this.grid.cell);
    if (c < 0 || r < 0 || c >= this.grid.cols || r >= this.grid.rows) return 0;
    return w[(r * this.grid.cols + c) * 4]! / 255;
  }

  /** Walkable area (inside the data extent with a margin). */
  bounds() {
    const b = this.hf.bounds;
    const m = 6;
    return { x0: b.x0 + m, z0: b.z0 + m, x1: b.x1 - m, z1: b.z1 - m };
  }

  setEra(era: Era): void {
    this.era = era;
    const info = ERA_INFO[era];
    const ds = this.datasets[info.terrain];
    this.hf = ds.hf;
    ds.coverTex = (era === 'today' ? this.covers.today : this.covers.historic) as TerrainDataset['coverTex'];
    this.terrain.setDataset(ds);
    this.terrain.uniforms.uHistoric!.value = era === 'today' ? 0 : 1;
    this.forest.setTrees(era === 'today' ? this.trees.today : this.trees.historic);
    this.palace.setMode(info.palace);
    this.collider.enabled = info.palace === 'intact';
    // the buildings that survive the ruin (Baumagazin, the guard houses) stay solid in 1796
    this.collider.keep = info.palace === 'ruin' ? this.ruinKeep : new Set();
    this.terrain.uniforms.uRuin!.value = info.palace === 'ruin' ? 1 : 0;
    this.nature.setEra(era);
    this.water.setEra(era, info.terrain);
    this.look = structuredClone(ERA_LOOKS[era]);
    this.applyLook();
  }

  /** Push `this.look` into the shared uniforms, sky and post-processing. */
  applyLook(): void {
    const L = this.look;
    const a = atmosphere;
    const [sx, sy, sz] = dirFromAzEl(L.sun.azimuth, L.sun.elevation);
    a.uSunDir.value.set(sx, sy, sz).normalize();
    a.uSunColor.value.set(L.sun.color).multiplyScalar(L.sun.intensity);
    a.uSkyAmbient.value.set(L.ambient.sky).multiplyScalar(L.ambient.intensity);
    a.uGroundAmbient.value.set(L.ambient.ground).multiplyScalar(L.ambient.intensity);
    a.uFogColor.value.set(L.fog.color);
    a.uFogSunColor.value.set(L.fog.sunColor);
    a.uFogDensity.value = L.fog.density;
    a.uFogHeightDensity.value = L.fog.heightDensity;
    a.uFogBase.value = L.fog.base;
    a.uFogFalloff.value = L.fog.falloff;
    a.uForestFog.value = L.fog.ground;
    a.uGlowColor.value.set(L.glow.color).multiplyScalar(L.glow.intensity);
    a.uSnow.value = L.snow;
    a.uSeason.value = L.season;
    const su = this.sky.uniforms;
    (su.uZenith!.value as Color).set(L.sky.zenith);
    (su.uHorizon!.value as Color).set(L.sky.horizon);
    (su.uBelow!.value as Color).set(L.sky.below);
    (su.uCloudColor!.value as Color).set(L.sky.cloudColor);
    su.uClouds!.value = L.sky.clouds;
    su.uStars!.value = L.sky.stars;
    su.uDisc!.value = L.disc === 'sun' ? 1 : L.disc === 'moon' ? 2 : 0;
    const pu = this.post.uniforms;
    pu.uExposure!.value = L.grade.exposure;
    pu.uSaturation!.value = L.grade.saturation;
    pu.uContrast!.value = L.grade.contrast;
    (pu.uLift!.value as Color).setStyle(L.grade.lift, LinearSRGBColorSpace);
    (pu.uGain!.value as Color).setStyle(L.grade.gain, LinearSRGBColorSpace);
    pu.uVignette!.value = L.grade.vignette;
    pu.uGrain!.value = L.grade.grain;
    const P = L.post;
    this.post.bloomStrength = P.bloom;
    this.post.bloomThreshold = P.bloomThreshold;
    this.post.aoStrength = P.ao;
    (pu.uWhite!.value as Color).setStyle(P.white, LinearSRGBColorSpace);
    (pu.uShadowTint!.value as Color).setStyle(P.shadowTint, LinearSRGBColorSpace);
    (pu.uHighTint!.value as Color).setStyle(P.highTint, LinearSRGBColorSpace);
    this.shadows.strength = P.shadow;
    this.lookVersion++;
  }

  /** Relief scan mode: 0 normal, 1 hillshade, 2 local relief, 3 VAT-like. `instant` skips the fade. */
  setScanMode(mode: ScanMode, instant = false): void {
    const u = this.terrain.uniforms;
    if (mode > 0) u.uScanMode!.value = mode;
    this.scanTarget = mode > 0 ? 1 : 0;
    if (instant) u.uScanMix!.value = this.scanTarget;
  }

  get scanMode(): ScanMode {
    return (this.scanTarget > 0 ? this.terrain.uniforms.uScanMode!.value : 0) as ScanMode;
  }

  /** Limit the scan to a disc (Relief-Blick reveal); radius ≥ 1e5 = everywhere. */
  setScanArea(x: number, z: number, radius: number): void {
    const u = this.terrain.uniforms;
    (u.uScanCenter!.value as Vector3).set(x, 0, z);
    u.uScanRadius!.value = radius;
  }

  /** Blend the 1840 map over the terrain (0..1). Loads the texture on first use. */
  setMapMix(v: number, instant = false): void {
    this.mapTarget = v;
    if (v > 0 && !this.mapTex) {
      const tex = new TextureLoader().load(`${this.data.baseUrl}${this.data.meta.hist1840.path}`);
      tex.colorSpace = SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = 4;
      this.mapTex = tex;
      this.terrain.uniforms.uMap!.value = tex;
    }
    if (instant) this.terrain.uniforms.uMapMix!.value = v;
  }

  get mapMix(): number {
    return this.mapTarget;
  }

  /** Per-frame visual update (LOD, trees, transitions, shared uniforms). */
  frame(camera: PerspectiveCamera, dt: number, time: number): void {
    atmosphere.uCamPos.value.copy(camera.position);
    const agl = camera.position.y - this.heightAt(camera.position.x, camera.position.z);
    const under = (0.45 + 0.55 * this.coverAt(camera.position.x, camera.position.z)) * (1 - Math.min(1, Math.max(0, (agl - 8) / 14)));
    atmosphere.uUnderCanopy.value += (under - atmosphere.uUnderCanopy.value) * Math.min(1, dt * 2);
    atmosphere.uTime.value = time;
    const u = this.terrain.uniforms;
    const k = Math.min(1, dt * 4);
    u.uScanMix!.value += (this.scanTarget - u.uScanMix!.value) * k;
    if (Math.abs(this.scanTarget - u.uScanMix!.value) < 0.002) u.uScanMix!.value = this.scanTarget;
    u.uMapMix!.value += (this.mapTarget - u.uMapMix!.value) * k;
    if (Math.abs(this.mapTarget - u.uMapMix!.value) < 0.002) u.uMapMix!.value = this.mapTarget;
    this.sky.follow(camera.position);
    const g = atmosphere.uGlowPos.value;
    (this.sky.uniforms.uGlowDir!.value as Vector3).set(g.x - camera.position.x, 0, g.z - camera.position.z).normalize();
    this.terrain.update(camera);
    this.forest.update(camera);
    this.nature.frame(camera);
    this.water.frame(camera, dt);
  }
}

