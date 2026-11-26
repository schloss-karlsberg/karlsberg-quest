// Types for scripts/dev/heavy-env.mjs (used from the TypeScript Playwright configs and specs).
type Env = Record<string, string | undefined>;
export function heavySlot(env?: Env): number;
export function heavyMode(env?: Env): 'exclusive' | 'normal' | undefined;
export function slotPort(base: number, name: string, env?: Env): number;
export function slotDir(dir: string, env?: Env): string;
export function otherBusySlots(env?: Env): number[];
export function warnIfShared(what: string, env?: Env): string;
export function requireExclusive(what: string, how: string, env?: Env): void;
