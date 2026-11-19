import type { AssetEntry } from './types';

/**
 * All asset entries: every `src/assets/manifests/*.ts` exports `default: AssetEntry[]`. One file
 * per art track (nature.ts, palace.ts, characters.ts, fx.ts …) so tracks never edit the same list.
 */
const modules = import.meta.glob<{ default: AssetEntry[] }>('./manifests/*.ts', { eager: true });

export const ASSETS: AssetEntry[] = Object.keys(modules)
  .sort()
  .flatMap((k) => modules[k]!.default);

export const ASSET_BY_ID: ReadonlyMap<string, AssetEntry> = new Map(ASSETS.map((e) => [e.id, e]));
