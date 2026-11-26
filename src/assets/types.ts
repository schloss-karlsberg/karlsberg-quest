import type { Era } from '../core/era';

/**
 * Asset manifest (docs/ART-DIRECTION.md §8, docs/ARCHITECTURE.md "Assets"). Pure data, no three.js.
 * Every file under public/assets/ that the game loads has one entry here, and every entry names
 * its licence record in public/assets/LICENSES.json (CC0 only, checked by tests/assets.test.ts).
 */
export type AssetKind = 'model' | 'texture' | 'hdri';

/**
 * Load groups. `core` is fetched behind the title screen (counts towards the first playable
 * load, keep it small); every other area is fetched on demand (`assets.loadArea`) or when one of
 * the entry's `eras` becomes active.
 */
export type AssetArea = 'core' | 'forest' | 'damm' | 'palace' | 'interiors' | 'characters' | 'fx' | 'ui' | 'dev';

export interface TextureOptions {
  /** 'srgb' for colour (albedo, emissive, UI), 'linear' for data (normal, roughness, AO, masks). */
  colorSpace: 'srgb' | 'linear';
  /** RepeatWrapping on both axes (tiling ground / wall textures). */
  repeat?: boolean;
  /** Anisotropic filtering (default 8, clamped to the GPU maximum). */
  anisotropy?: number;
  /** Flip vertically on upload (default false: glTF convention). */
  flipY?: boolean;
}

export interface AssetEntry {
  /** Stable id, dotted: '<track>.<thing>[.<variant>]', e.g. 'nature.stump.oak'. */
  id: string;
  kind: AssetKind;
  /** Path below public/assets/ (forward slashes): 'models/nature/tree_stump_01.glb'. */
  url: string;
  area: AssetArea;
  /** Also prefetch when one of these eras becomes active. */
  eras?: Era[];
  /** File size in bytes (progress bar weight; tests check it against the file). */
  bytes: number;
  /** Id of the record in public/assets/LICENSES.json. */
  licence: string;
  /** Texture / HDRI options (required for kind 'texture' and 'hdri'). */
  texture?: TextureOptions;
  /**
   * Models: patch standard / physical materials to the world light (sun shadows, era ambient,
   * fog; render/standard.ts). Default true. Turn off only for self-lit or custom-shaded models.
   */
  worldLight?: boolean;
  /**
   * Models with world light: how an authored character is shaded. 'standard' (default) is the
   * plain bridge; 'toon' is the opt-in soft toon variant (systems/characters/toon.ts: banded sun,
   * warm shadow, rim), still lit by the sun, era light and lantern. World assets never set it.
   */
  shading?: 'standard' | 'toon';
  /** Free notes for the tracks (scale, pivot, LODs …). */
  note?: string;
}

/** One record of public/assets/LICENSES.json. */
export interface LicenceRecord {
  id: string;
  /** Asset name as on the source site. */
  name: string;
  author: string;
  /** Page of the asset on the official site (polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, poly.pizza, MakeHuman / MPFB2). */
  source: string;
  /** SPDX id: always 'CC0-1.0' for art assets. */
  licence: string;
  /** Files below public/assets/ made from it. */
  files: string[];
  /** What we changed (resize, recompression, merge …). */
  modified?: string;
  /** Download date (YYYY-MM-DD). */
  retrieved: string;
}

export interface LicencesFile {
  policy: string;
  assets: LicenceRecord[];
  /** Own-work runtime geometry, with the repo-relative source in place of an asset download. */
  procedural?: { name: string; author: string; licence: 'CC0-1.0'; source: string }[];
  /** Decoder libraries shipped with the assets (not art; three.js examples, own licences). */
  libraries?: { name: string; licence: string; files: string[]; source: string }[];
  /** Voices whose clips may sit in public/voice/ (rules: scripts/voice/assetRules.ts). */
  voices?: VoiceCredit[];
}

/** One MOSS voice (LICENSES.json `voices`), credited under "Lizenzen & Quellen". */
export interface VoiceCredit {
  /** speaker key in content and scripts/voice/voices.json */
  speaker: string;
  /** display name in the credits screen */
  name: string;
  provider: 'moss';
  tool: string;
  toolLicence: string;
  outputLicence: string;
  realPerson?: boolean;
  /** Public use in Karlsberg Quest is authorized. The service verifies written consent separately. */
  consent?: 'public';
  seed: number;
  /** sha256 of the local or service reference WAV, which stays outside the repo */
  referenceSha256: string;
  generatedLocally: true;
  note: string;
}

/** Sources the art pipeline may download from (docs/ART-DIRECTION.md §8). */
export const ALLOWED_SOURCES = [
  'https://polyhaven.com/',
  'https://ambientcg.com/',
  'https://kenney.nl/',
  'https://quaternius.com/',
  'https://poly.pizza/',
  // MakeHuman / MPFB2 core assets (CC0; the MPFB extension itself is GPL code, used only at build time)
  'https://static.makehumancommunity.org/',
  'https://extensions.blender.org/add-ons/mpfb/',
];

/** Budgets (bytes): whole asset folder, and the core (first playable) group. */
export const ASSET_BUDGET = { total: 150 * 1024 * 1024, core: 40 * 1024 * 1024 };

/** Pure checks shared by the unit test and the loader (dev warning): returns problems. */
export function checkManifest(entries: AssetEntry[], licences: LicencesFile): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const recs = new Map(licences.assets.map((r) => [r.id, r]));
  for (const e of entries) {
    if (ids.has(e.id)) out.push(`duplicate asset id ${e.id}`);
    ids.add(e.id);
    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(e.id)) out.push(`${e.id}: id must be dotted lower-case`);
    if (e.url.startsWith('/') || e.url.includes('..')) out.push(`${e.id}: url must be relative below public/assets`);
    if ((e.kind === 'texture' || e.kind === 'hdri') && !e.texture) out.push(`${e.id}: texture options missing`);
    const r = recs.get(e.licence);
    if (!r) out.push(`${e.id}: licence record '${e.licence}' missing in LICENSES.json`);
    else {
      if (r.licence !== 'CC0-1.0') out.push(`${e.id}: licence ${r.licence} is not CC0-1.0`);
      if (!r.files.includes(e.url)) out.push(`${e.id}: ${e.url} not listed in licence record ${r.id}`);
    }
  }
  for (const r of licences.assets) {
    if (!ALLOWED_SOURCES.some((s) => r.source.startsWith(s))) out.push(`${r.id}: source ${r.source} is not an allowed site`);
    if (r.licence !== 'CC0-1.0') out.push(`${r.id}: licence ${r.licence} is not CC0-1.0`);
  }
  return out;
}
