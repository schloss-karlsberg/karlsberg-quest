/**
 * moss **service mode**: the voice pipeline submits moss lines as jobs to the local standalone
 * moss-service and later collects its results, instead of loading the model in-process (the direct
 * `moss` provider in moss.ts stays the default and the fallback). Nothing here loads a model or takes
 * the heavy lock: the owner starts the service runner (`moss-run`), which does both.
 *
 *   KQ_MOSS_MODE=service  (or --moss-service)     select service mode (default: direct)
 *   KQ_MOSS_SERVICE_CLIENT=<path to moss.mjs>     the service's zero-dependency node client; REQUIRED in
 *                                                  service mode, set in the env or the main checkout's
 *                                                  .env, never committed (the repo holds no machine path)
 *
 * Interface agreed with kq-moss: moss-service docs/client-interface.md. Erasable TypeScript only (Node
 * type stripping), pure apart from the client import, the registry read and file hashing.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOSS_ENGINE, sameEngine, type MossEngine, type MossVoice } from './lib.ts';

/** `project` of every job this repo submits. */
export const SERVICE_PROJECT = 'karlsberg-quest';
/** Default `--wait` timeout in minutes. */
export const DEFAULT_WAIT_MIN = 30;
/** Default raw WAV folder for service output, relative to the repo (gitignored, outside public/). */
export const DEFAULT_RAW_DIR = '.voice-raw/raw-service';

export type MossMode = 'direct' | 'service';

/** `--moss-service` wins; else `KQ_MOSS_MODE` (`direct` | `service`, empty = direct). */
export function mossMode(env: Record<string, string | undefined>, flag = false): MossMode {
  if (flag) return 'service';
  const m = (env.KQ_MOSS_MODE ?? '').trim().toLowerCase();
  if (!m || m === 'direct') return 'direct';
  if (m === 'service') return 'service';
  throw new Error(`KQ_MOSS_MODE must be "direct" or "service" (got "${env.KQ_MOSS_MODE}")`);
}

// ---------------------------------------------------------------------------------------------
// The client module (moss-service clients/node/moss.mjs)

export interface ServiceJob {
  project: string;
  id: string;
  voice: string;
  text: string;
  output: { path: string; format: 'wav' };
}
/** One `submit()` answer per job. `cached`: the runner will answer it from the service cache. */
export interface SubmitRow {
  project?: string;
  id: string;
  status: 'queued' | 'refused' | string;
  key?: string;
  cached?: boolean;
  error?: string;
}
/** A result record (`ok | cached | failed | refused`) or a pending state (`queued | running`). */
export interface ResultRecord {
  status: string;
  key?: string;
  output?: string;
  sha256?: string;
  text_sha256?: string;
  engine?: Record<string, unknown>;
  seed?: number;
  voice?: string;
  project?: string;
  id?: string;
  error?: string;
  [k: string]: unknown;
}
export interface RegistryVoice {
  engine?: string;
  visibility?: string;
  seed?: number;
  ref_sha256?: string;
  ref_source?: string;
  language?: string | null;
  instruction?: string | null;
  params?: Record<string, unknown> | null;
  ok?: boolean;
  error?: string | null;
  engine_identity?: Record<string, unknown> | null;
}
export type Registry = Record<string, RegistryVoice>;

export interface ServiceClient {
  submit(jobs: ServiceJob[]): Promise<SubmitRow[]>;
  result(project: string, id: string): ResultRecord | null | Promise<ResultRecord | null>;
  waitAll?(project: string, ids: string[], o: { timeoutMs: number; pollMs?: number }): Promise<Map<string, ResultRecord | null>>;
  /** optional: the registry as `moss-registry list --json` prints it */
  registry?(): Registry | Promise<Registry>;
  /** path of bin/moss-submit; `moss-registry` is read from the same folder when `registry()` is absent */
  SUBMIT?: string;
}

export const MISSING_CLIENT =
  'moss service mode: set KQ_MOSS_SERVICE_CLIENT to the moss-service node client (clients/node/moss.mjs), in the env or the main checkout\'s .env (never in the repo)';

/** Import the client from `KQ_MOSS_SERVICE_CLIENT` (the only place its path comes from). */
export async function loadServiceClient(
  env: Record<string, string | undefined>,
  importer: (url: string) => Promise<unknown> = (u) => import(u),
): Promise<ServiceClient> {
  const p = env.KQ_MOSS_SERVICE_CLIENT?.trim();
  if (!p) throw new Error(MISSING_CLIENT);
  const abs = resolve(p);
  if (!existsSync(abs)) throw new Error(`moss service mode: KQ_MOSS_SERVICE_CLIENT points at a missing file (${abs})`);
  const mod = (await importer(pathToFileURL(abs).href)) as Partial<ServiceClient>;
  if (typeof mod.submit !== 'function' || typeof mod.result !== 'function')
    throw new Error(`moss service mode: ${abs} does not export submit() and result()`);
  return mod as ServiceClient;
}

/** stdout of a program (read-only helpers only). */
export type ExecFn = (cmd: string, args: string[]) => Promise<string>;
const defaultExec: ExecFn = (cmd, args) =>
  new Promise((res, rej) =>
    execFile(cmd, args, { encoding: 'utf8', maxBuffer: 8 << 20 }, (err, stdout) => (err ? rej(new Error(`${basename(cmd)} ${args.join(' ')}: ${err.message}`)) : res(stdout))),
  );

/**
 * The service registry with its live checks: `client.registry()` when the client has it, else
 * `moss-registry list --json` next to the client's `SUBMIT` (read-only: no model, no lock, no job).
 */
export async function readRegistry(client: ServiceClient, exec: ExecFn = defaultExec): Promise<Registry> {
  let raw: unknown;
  if (typeof client.registry === 'function') raw = await client.registry();
  else if (typeof client.SUBMIT === 'string' && client.SUBMIT) raw = JSON.parse(await exec(join(dirname(client.SUBMIT), 'moss-registry'), ['list', '--json']));
  else throw new Error('moss service mode: the client exports neither registry() nor SUBMIT; cannot read the voice registry');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('moss service mode: the registry is not an object');
  const o = raw as Record<string, unknown>;
  // registry.json shape ({voices: {...}}) as well as the list --json shape (id -> voice)
  const v = o.voices;
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => x && typeof x === 'object' && 'seed' in (x as object))) return v as Registry;
  return o as Registry;
}

// ---------------------------------------------------------------------------------------------
// Jobs

/** sha256 hex of the exact UTF-8 text (the service's `text_sha256`). */
export const textSha256 = (text: string): string => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

export const rawPath = (rawDir: string, id: string): string => join(resolve(rawDir), `${id}.wav`);

/**
 * One job per line. `text` is the prepared speech text the pipeline hashes into `speechHash`
 * (speech.json override or auto-prep), never the raw display text. No seed or params: those come
 * from the service registry, so the service keys stay stable (and the consistency guard checks them).
 */
export function serviceJob(l: Pick<ServiceLine, 'id' | 'speaker' | 'serviceVoice' | 'text'>, rawDir: string): ServiceJob {
  return { project: SERVICE_PROJECT, id: l.id, voice: l.serviceVoice ?? l.speaker, text: l.text, output: { path: rawPath(rawDir, l.id), format: 'wav' } };
}

/** realpath, or the realpath of the nearest existing parent + the rest. */
const realish = (p: string): string => {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(realish(parent), basename(abs));
  }
};

/** Client-side mirror of the service's output guard: no `public/` folder component. Error message or null. */
export function checkRawDir(rawDir: string): string | null {
  for (const p of new Set([resolve(rawDir), realish(rawDir)]))
    if (p.split(sep).includes('public')) return `--raw-dir ${rawDir} is inside a public/ folder; raw service WAVs never go there (use a gitignored dir or one outside the repo)`;
  return null;
}

/** Refuse non-public voices and require a successful live registry check for real-person voices. */
export function clientRefusals(lines: Pick<ServiceLine, 'id' | 'speaker' | 'serviceVoice'>[], registry: Registry): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const voice = l.serviceVoice ?? l.speaker;
    const r = registry[voice];
    if (voice === 'guest-test' && l.speaker !== 'player')
      out.push(`${l.id}: voice guest-test is reserved for the player mapping`);
    else if (r && r.visibility !== 'public')
      out.push(`${l.id}: registry voice ${voice} has visibility "${String(r.visibility)}"; the game uses public voices only`);
    else if (l.serviceVoice) {
      // The live service check validates written public consent for a public real-person recording.
      if (r?.ref_source !== 'real-person-recording' || r.ok !== true)
        out.push(`${l.id}: registry voice ${voice} must pass the public real-person consent check${r?.error ? `: ${r.error}` : ''}`);
    } else if (r?.ref_source === 'real-person-recording')
      out.push(`${l.id}: real-person registry voice ${voice} requires an explicit serviceVoice mapping`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Consistency guard: voices.json vs the service registry

/** The service's engine identity → our manifest `engine` shape (`OpenMOSS-Team/` prefix dropped). */
export function mapEngineIdentity(id: unknown): Partial<MossEngine> | null {
  if (!id || typeof id !== 'object') return null;
  const o = id as Record<string, unknown>;
  if (o.engine !== 'moss-tts') return null;
  const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/^OpenMOSS-Team\//, '') : undefined);
  return { model: strip(o.model), tokenizer: strip(o.tokenizer), warmup: typeof o.warmup === 'string' ? o.warmup : undefined };
}

/** JSON with sorted keys, for comparing params. */
const canon = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v as object)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
        .join(',')}}`
    : JSON.stringify(v);
const show = (v: unknown) => (v === undefined ? '(none)' : JSON.stringify(v));

/**
 * Every difference between the moss speakers we are about to submit and the registry. The service
 * generates with its registry settings, so any difference would make our `voiceId` lie: fail on any.
 */
export function registryDiffs(speakers: MossVoice[], registry: Registry, engine: MossEngine = MOSS_ENGINE): string[] {
  const out: string[] = [];
  for (const s of speakers) {
    const serviceVoice = s.serviceVoice ?? s.speaker;
    const r = registry[serviceVoice];
    const d = (field: string, ours: unknown, theirs: unknown) => out.push(`${s.speaker}.${field}: voices.json ${show(ours)} != registry ${show(theirs)}`);
    if (!r) {
      out.push(`${s.speaker}: voice ${serviceVoice} is missing from the moss-service registry`);
      continue;
    }
    if (r.ok === false) out.push(`${s.speaker}: the registry's own check fails: ${r.error ?? 'unknown error'}`);
    if (r.engine !== 'moss-tts') d('engine', 'moss-tts', r.engine);
    if (r.seed !== s.seed) d('seed', s.seed, r.seed);
    const theirSha8 = typeof r.ref_sha256 === 'string' ? r.ref_sha256.slice(0, 8) : undefined;
    if (s.refSha256) {
      if (r.ref_sha256 !== s.refSha256) d('ref_sha256', s.refSha256, r.ref_sha256);
    } else if (!s.refSha8) out.push(`${s.speaker}.ref_sha256: the local reference ${s.reference} is missing, cannot compare (registry ${show(theirSha8)})`);
    else if (theirSha8 !== s.refSha8) d('ref_sha256[0:8]', s.refSha8, theirSha8);
    if ((r.language ?? undefined) !== s.language) d('language', s.language, r.language ?? undefined);
    if ((r.instruction || undefined) !== (s.instruction || undefined)) d('instruction', s.instruction || undefined, r.instruction || undefined);
    if (canon(r.params ?? {}) !== canon(s.params ?? {})) d('params', s.params ?? {}, r.params ?? {});
    const e = mapEngineIdentity(r.engine_identity);
    if (!e) d('engine_identity', engine, r.engine_identity ?? undefined);
    else for (const k of ['model', 'tokenizer', 'warmup'] as const) if (e[k] !== engine[k]) d(`engine_identity.${k}`, engine[k], e[k]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Collect

export interface ServiceLine {
  id: string;
  speaker: string;
  serviceVoice?: string;
  /** the exact text submitted */
  text: string;
  seed: number;
}

export type Assessment =
  | { kind: 'none' }
  | { kind: 'queued'; status: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'ready'; wav: string; engine: MossEngine; serviceKey: string; sha256Raw: string; cached: boolean };

const FINAL = ['ok', 'cached', 'failed', 'refused'];

/** A final result whose text is not the one we would submit now (an older text): to be resubmitted, not collected. */
export const isStaleResult = (rec: ResultRecord | null, text: string): boolean =>
  !!rec && FINAL.includes(rec.status) && typeof rec.text_sha256 === 'string' && rec.text_sha256 !== textSha256(text);

/**
 * What a result record means for one line. ok/cached are checked before anything is post-processed:
 * the spoken text (text_sha256), the WAV bytes (sha256), voice and seed, and the engine identity
 * (mapped to our `engine` shape, must equal MOSS_ENGINE). A `cached` record carries no `engine`; its
 * key was made with the same identity, so the registry's `engine_identity` for the voice is used.
 */
export function assessResult(
  l: ServiceLine,
  rec: ResultRecord | null,
  o: { registry?: Registry; hashFile?: (p: string) => string; exists?: (p: string) => boolean; engine?: MossEngine } = {},
): Assessment {
  if (!rec) return { kind: 'none' };
  const engine = o.engine ?? MOSS_ENGINE;
  if (rec.status === 'queued' || rec.status === 'running') return { kind: 'queued', status: rec.status };
  if (rec.status === 'failed' || rec.status === 'refused') return { kind: 'failed', reason: `${rec.status}: ${rec.error ?? 'no error given'}` };
  if (rec.status !== 'ok' && rec.status !== 'cached') return { kind: 'failed', reason: `unknown status "${rec.status}"` };
  const want = textSha256(l.text);
  if (rec.text_sha256 !== want) return { kind: 'failed', reason: `text_sha256 ${show(rec.text_sha256)} != sha256 of the submitted text ${want}` };
  const voice = l.serviceVoice ?? l.speaker;
  if ((l.serviceVoice || rec.voice !== undefined) && rec.voice !== voice) return { kind: 'failed', reason: `voice ${rec.voice} != ${voice}` };
  if ((rec.seed !== undefined || (l.serviceVoice && rec.status === 'ok')) && rec.seed !== l.seed)
    return { kind: 'failed', reason: `seed ${rec.seed} != voices.json seed ${l.seed}` };
  if (typeof rec.key !== 'string' || !/^[0-9a-f]{64}$/.test(rec.key)) return { kind: 'failed', reason: `no valid key (${show(rec.key)})` };
  if (typeof rec.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(rec.sha256)) return { kind: 'failed', reason: `no valid sha256 (${show(rec.sha256)})` };
  if (typeof rec.output !== 'string' || !(o.exists ?? existsSync)(rec.output)) return { kind: 'failed', reason: `WAV missing: ${show(rec.output)}` };
  const got = (o.hashFile ?? sha256File)(rec.output);
  if (got !== rec.sha256) return { kind: 'failed', reason: `WAV sha256 ${got} != recorded ${rec.sha256}` };
  const idSrc = rec.engine ?? (rec.status === 'cached' ? o.registry?.[voice]?.engine_identity : undefined);
  const e = mapEngineIdentity(idSrc);
  if (!e || !sameEngine(e, engine)) return { kind: 'failed', reason: `engine ${show(e ?? idSrc)} != ${show(engine)}` };
  return { kind: 'ready', wav: rec.output, engine: { model: e.model!, tokenizer: e.tokenizer!, warmup: e.warmup! }, serviceKey: rec.key, sha256Raw: rec.sha256, cached: rec.status === 'cached' };
}

/** `--wait [min]` has an optional value: insert the default when none follows. */
export function normalizeWaitArg(argv: string[], def: number = DEFAULT_WAIT_MIN): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    out.push(a);
    if (a === '--wait' && (i + 1 >= argv.length || !/^\d+(\.\d+)?$/.test(argv[i + 1]!))) out.push(String(def));
  }
  return out;
}

/** Summary of submit answers. */
export function submitSummary(rows: SubmitRow[]): { queued: number; cached: number; refused: SubmitRow[] } {
  const refused = rows.filter((r) => r.status !== 'queued');
  const ok = rows.filter((r) => r.status === 'queued');
  return { queued: ok.length, cached: ok.filter((r) => r.cached).length, refused };
}
