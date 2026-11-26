// What scripts/dev/heavy.sh tells the job it runs, for Playwright configs, specs and dev tools.
// heavy.sh exports KQ_HEAVY_HELD=1, KQ_HEAVY_SLOT (0 for an exclusive job), KQ_HEAVY_MODE
// (exclusive | normal) and KQ_HEAVY_LOCK (slot 0's lock dir; slot k is <lock>.slot<k>).
// Older heavy.sh copies set only KQ_HEAVY_HELD and, with slots, KQ_HEAVY_SLOT: the mode is then
// unknown and nothing here warns or refuses.
import { existsSync } from 'node:fs';

/** The heavy.sh slot this process runs in (0 outside heavy.sh and for an exclusive job). */
export function heavySlot(env = process.env) {
  const n = Number.parseInt(env.KQ_HEAVY_SLOT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'exclusive' | 'normal' inside a slot-aware heavy.sh, else undefined. */
export function heavyMode(env = process.env) {
  const m = env.KQ_HEAVY_MODE;
  return m === 'exclusive' || m === 'normal' ? m : undefined;
}

/** The explicit port in env[name] if set, else base + slot, so jobs in different slots never collide. */
export function slotPort(base, name, env = process.env) {
  const explicit = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : base + heavySlot(env);
}

/** `dir` in slot 0 (today's paths), `dir-slot<k>` in slot k, so two jobs from one checkout never share it. */
export function slotDir(dir, env = process.env) {
  const k = heavySlot(env);
  return k > 0 ? `${dir}-slot${k}` : dir;
}

/** Slots held by someone else right now (the lock dirs of slot 0..N other than ours). */
export function otherBusySlots(env = process.env) {
  const lock = env.KQ_HEAVY_LOCK || '/tmp/kq-heavy.lock';
  const mine = heavySlot(env);
  const busy = [];
  for (let k = 0; k < 16; k++) {
    if (k !== mine && existsSync(k === 0 ? lock : `${lock}.slot${k}`)) busy.push(k);
  }
  return busy;
}

/**
 * Perf-sensitive runs: a warning (never a failure) when heavy.sh runs this in a normal slot while
 * other slots are busy, so its timings are not comparable. Returns the warning or ''.
 */
export function warnIfShared(what, env = process.env) {
  if (heavyMode(env) !== 'normal') return '';
  const busy = otherBusySlots(env);
  if (busy.length === 0) return '';
  const msg =
    `heavy.sh: warning: ${what} is perf-sensitive but runs in normal slot ${heavySlot(env)} while ` +
    `slot(s) ${busy.join(', ')} are busy; its timings are not comparable. ` +
    `Run it with scripts/dev/heavy.sh --exclusive.`;
  console.warn(msg);
  return msg;
}

/**
 * Real-GPU / fixed-port tools: refuse (exit 2) when heavy.sh runs them in a normal slot, and warn
 * when they run outside heavy.sh. `how` is the command to suggest.
 */
export function requireExclusive(what, how, env = process.env) {
  const mode = heavyMode(env);
  if (mode === 'normal') {
    console.error(`${what}: needs a quiet machine (GPU screenshots on a fixed port); run it as\n  ${how}`);
    process.exit(2);
  }
  if (env.KQ_HEAVY_HELD !== '1') {
    console.warn(`${what}: warning: not run through heavy.sh; on a shared machine use\n  ${how}`);
  }
}
