/**
 * Local MOSS-TTS-v1.5 (mlx-audio) behind the voice pipeline: config, reference guard, job building,
 * batching, the heavy-lock command line and the quiet window. The model itself runs only in
 * `scripts/voice/moss/runner.py`, one process per batch of ≤ 6 clips, always inside
 * `scripts/dev/heavy.sh` (machine-wide lock). Erasable TypeScript only (Node type stripping).
 *
 * Setup lives outside the repo (default `~/kq-models`, see docs/ARCHITECTURE.md "moss provider"):
 *   KQ_MOSS_VENV   venv with mlx-audio 0.6.7          (default ~/kq-models/venv-moss)
 *   KQ_MOSS_HOME   HF cache in <home>/hf               (default ~/kq-models)
 *   KQ_MOSS_VOICES fixed synthetic reference WAVs      (default ~/kq-models/voices)
 *   KQ_HEAVY_OWNER heavy-lock owner label              (default kq-voice-moss; e.g. kq-voice-gate)
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { CHARS_PER_SECOND, type MossVoice } from './lib.ts';

export const MOSS_BATCH_MAX = 6;
/** realtime factor measured in casting (median 1.06, rounded up) */
export const MOSS_RTF = 1.1;
/** model load per process, cold (casting: 9.5 s cold, 1.2 s warm) */
export const MOSS_LOAD_S = 10;
export const QUIET_WINDOW = '/tmp/kq-quiet-window';
export const HEAVY_OWNER = 'kq-voice-moss';
export const HEAVY_SH = 'scripts/dev/heavy.sh';
export const RUNNER = 'scripts/voice/moss/runner.py';
export const HEAVY_MAX_HOLD_MIN = 10;
/** ElevenLabs casting clips: listening comparison only, never a reference */
export const FORBIDDEN_REF = '/casting/clips/';
/** runner exit codes */
export const EXIT_QUIET = 76;
export const EXIT_REFUSED = 75;

export interface MossConfig {
  venv: string;
  home: string;
  voices: string;
  python: string;
  /** heavy-lock owner label (KQ_HEAVY_OWNER), default HEAVY_OWNER */
  owner?: string;
}

const expand = (p: string, home: string) => (p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p);

/** Config from env (process env after `.env` is loaded), defaults under `<homedir>/kq-models`. */
export function mossConfig(env: Record<string, string | undefined> = process.env, home: string = homedir()): MossConfig {
  const get = (k: string) => {
    const v = env[k]?.trim();
    return v ? resolve(expand(v, home)) : undefined;
  };
  const base = get('KQ_MOSS_HOME') ?? join(home, 'kq-models');
  const venv = get('KQ_MOSS_VENV') ?? join(base, 'venv-moss');
  const voices = get('KQ_MOSS_VOICES') ?? join(base, 'voices');
  const owner = env.KQ_HEAVY_OWNER?.trim() || HEAVY_OWNER;
  return { venv, home: base, voices, python: join(venv, 'bin', 'python'), owner };
}

/** realpath; for a path that does not exist, the realpath of its nearest existing parent + the rest. */
const real = (p: string): string => {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(real(parent), basename(abs));
  }
};

/**
 * The runner's guard, mirrored so a bad reference fails before a lock is even requested: the path
 * (absolute, or relative to the voices dir) must resolve inside the voices dir and never touch
 * `/casting/clips/`. Returns the resolved path.
 */
export function checkReference(path: string, voicesDir: string, o: { mustExist?: boolean } = {}): string {
  if (!path) throw new Error('moss: reference missing');
  const raw = isAbsolute(path) ? path : join(voicesDir, path);
  const r = real(raw);
  if (raw.includes(FORBIDDEN_REF) || r.includes(FORBIDDEN_REF) || path.includes(FORBIDDEN_REF)) throw new Error(`moss: forbidden reference (ElevenLabs clip): ${path}`);
  const dir = real(voicesDir);
  if (!r.startsWith(dir + sep)) throw new Error(`moss: reference outside ${voicesDir}: ${path}`);
  if (o.mustExist && !existsSync(r)) throw new Error(`moss: reference missing: ${path}`);
  return r;
}

/** First 8 hex of sha256 of a file, null when it cannot be read. */
export function sha8File(path: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
  } catch {
    return null;
  }
}

/** `refSha8` for `resolveVoice`: guarded path inside the voices dir, null when missing or refused. */
export function refSha8For(cfg: Pick<MossConfig, 'voices'>): (reference: string) => string | null {
  const cache = new Map<string, string | null>();
  return (reference) => {
    if (!cache.has(reference)) {
      let sha: string | null = null;
      try {
        sha = sha8File(checkReference(reference, cfg.voices));
      } catch {
        sha = null;
      }
      cache.set(reference, sha);
    }
    return cache.get(reference)!;
  };
}

export interface MossClip {
  id: string;
  text: string;
  /** absolute, guarded */
  reference: string;
  seed: number;
  language: string;
  instruction?: string;
  params: Record<string, unknown>;
}

export interface MossItem {
  id: string;
  text: string;
  moss: MossVoice;
}

/** One runner clip per line: the speaker's fixed reference + seed (direct clone mode, as in the casting consistency batch). */
export function buildClips(items: MossItem[], cfg: Pick<MossConfig, 'voices'>): MossClip[] {
  return items.map(({ id, text, moss }) => {
    const c: MossClip = { id, text, reference: checkReference(moss.reference, cfg.voices), seed: moss.seed, language: moss.language, params: { ...moss.params } };
    if (moss.instruction) c.instruction = moss.instruction;
    return c;
  });
}

export function batches<T>(xs: readonly T[], n: number = MOSS_BATCH_MAX): T[][] {
  if (!(n >= 1)) throw new Error('batch size must be ≥ 1');
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface Command {
  cmd: string;
  args: string[];
  /** added to the inherited env */
  env: Record<string, string>;
}

/** `scripts/dev/heavy.sh --check-load --strict --max-hold 10 -- <venv python> -I scripts/voice/moss/runner.py <job>` (cwd = repo). */
export function heavyCommand(cfg: MossConfig, jobPath: string): Command {
  return {
    cmd: HEAVY_SH,
    args: ['--check-load', '--strict', '--max-hold', String(HEAVY_MAX_HOLD_MIN), '--', cfg.python, '-I', RUNNER, jobPath],
    env: { KQ_HEAVY_OWNER: cfg.owner || HEAVY_OWNER, KQ_MOSS_HOME: cfg.home, KQ_MOSS_VOICES: cfg.voices, HF_HUB_OFFLINE: '1' },
  };
}

export interface RunnerClip {
  id: string;
  wav: string;
  seconds: number;
  rtf: number;
}

/** The runner's stdout: one JSON object per clip; anything else is ignored. */
export function parseRunnerOutput(stdout: string): RunnerClip[] {
  const out: RunnerClip[] = [];
  for (const l of stdout.split('\n')) {
    const t = l.trim();
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t) as Partial<RunnerClip>;
      if (typeof o.id === 'string' && typeof o.wav === 'string') out.push({ id: o.id, wav: o.wav, seconds: Number(o.seconds) || 0, rtf: Number(o.rtf) || 0 });
    } catch {
      /* not ours */
    }
  }
  return out;
}

export interface MossEstimate {
  lines: number;
  chars: number;
  /** speech seconds (chars / CHARS_PER_SECOND) × RTF + one model load per batch */
  minutes: number;
  batches: number;
}

export function mossEstimate(rows: { chars: number }[], rtf: number = MOSS_RTF): MossEstimate {
  const chars = rows.reduce((s, r) => s + r.chars, 0);
  const n = Math.ceil(rows.length / MOSS_BATCH_MAX);
  const seconds = (chars / CHARS_PER_SECOND) * rtf + n * MOSS_LOAD_S;
  return { lines: rows.length, chars, minutes: seconds / 60, batches: n };
}

export interface WaitDeps {
  exists?: (p: string) => boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: (s: string) => void;
  pollMs?: number;
}

/** Resolves once `/tmp/kq-quiet-window` is gone (polls); logs once while waiting. */
export async function waitQuietWindow(d: WaitDeps = {}): Promise<number> {
  const exists = d.exists ?? existsSync;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let waited = 0;
  while (exists(QUIET_WINDOW)) {
    if (waited === 0) d.log?.(`moss: ${QUIET_WINDOW} exists, waiting before the next batch …`);
    const ms = d.pollMs ?? 5000;
    await sleep(ms);
    waited += ms;
  }
  return waited;
}

export interface RunResult {
  code: number;
  stdout: string;
}
export type RunFn = (cmd: string, args: string[], o: { cwd: string; env: Record<string, string | undefined> }) => Promise<RunResult>;

/** spawn with stdout collected and stderr passed through (runner + heavy.sh logs). */
export const defaultRun: RunFn = (cmd, args, o) =>
  new Promise((res, rej) => {
    const ch = spawn(cmd, args, { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    ch.stdout.setEncoding('utf8');
    ch.stdout.on('data', (s: string) => (stdout += s));
    ch.on('error', rej);
    ch.on('close', (code) => res({ code: code ?? 1, stdout }));
  });

export interface BatchResult {
  index: number;
  clips: RunnerClip[];
  /** line ids of this batch without a WAV */
  failed: string[];
  code: number;
}

export interface MossDeps extends WaitDeps {
  run?: RunFn;
  env?: Record<string, string | undefined>;
  writeFile?: (p: string, s: string) => void;
  mkdir?: (p: string) => void;
  /** for the venv python check (the quiet window uses `exists`) */
  fileExists?: (p: string) => boolean;
}

/**
 * Generate WAVs for `items`, ≤ 6 per runner process, each process inside the heavy lock. Waits for
 * the quiet window before every batch; a runner that hits the window inside the lock (exit 76) is
 * retried after it closes (3 tries). heavy.sh --strict refusing (exit 75, memory pressure) stops all
 * batches. Yields after each batch so post-processing runs outside the lock.
 */
export async function* mossBatches(items: MossItem[], o: { cfg: MossConfig; repo: string; workDir: string; log?: (s: string) => void }, d: MossDeps = {}): AsyncGenerator<BatchResult> {
  const run = d.run ?? defaultRun;
  const write = d.writeFile ?? ((p: string, s: string) => writeFileSync(p, s));
  const mkdir = d.mkdir ?? ((p: string) => void mkdirSync(p, { recursive: true }));
  const log = o.log ?? d.log;
  if (!(d.fileExists ?? existsSync)(o.cfg.python)) throw new Error(`moss: no python at ${o.cfg.python} (set KQ_MOSS_VENV)`);
  const groups = batches(items);
  for (const [index, group] of groups.entries()) {
    const clips = buildClips(group, o.cfg); // guard before the lock
    const outDir = join(o.workDir, `moss-${index}`);
    const jobPath = join(o.workDir, `moss-job-${index}.json`);
    mkdir(outDir);
    write(jobPath, JSON.stringify({ outDir, clips }, null, 1));
    const c = heavyCommand(o.cfg, jobPath);
    let res: RunResult = { code: 1, stdout: '' };
    for (let attempt = 0; attempt < 3; attempt++) {
      await waitQuietWindow({ ...d, log });
      log?.(`moss: batch ${index + 1}/${groups.length} (${group.length} lines) → heavy.sh`);
      res = await run(c.cmd, c.args, { cwd: o.repo, env: { ...(d.env ?? process.env), ...c.env } });
      if (res.code !== EXIT_QUIET) break;
    }
    if (res.code === EXIT_REFUSED) throw new Error('moss: heavy.sh refused (memory pressure or lock timeout, exit 75); stopping');
    const got = parseRunnerOutput(res.stdout).filter((r) => group.some((g) => g.id === r.id));
    const failed = group.filter((g) => !got.some((r) => r.id === g.id)).map((g) => g.id);
    if (res.code !== 0) log?.(`moss: batch ${index + 1} exited ${res.code}; ${failed.length} lines without audio`);
    yield { index, clips: got, failed, code: res.code };
  }
}

