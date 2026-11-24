#!/usr/bin/env node
/**
 * Voice clips for dialogue lines via a TTS provider (ElevenLabs, a Hugging Face Gradio Space, or
 * local MOSS-TTS-v1.5 via mlx-audio: batches of ≤ 6 lines inside scripts/dev/heavy.sh).
 *
 *   pnpm voice:plan                       dry run: the plan, no network spend
 *   pnpm voice:gen                        generate within budget
 *   node scripts/voice/generate.mjs --help
 *
 * Reads ELEVENLABS_API_KEY and HF_TOKEN from the main checkout's .env (override: --env <path>).
 * Secrets are sent only as auth headers and never printed. Output (Opus/WebM + AAC/m4a) and the
 * manifest go to public/voice/, which is COMMITTED and takes credited MOSS clips only (rules:
 * scripts/voice/assetRules.ts, tests/voice-assets.test.ts). A real run that would write elevenlabs or
 * hf-space clips there is refused unless --allow-noncommittable is given; use --out <scratch dir>
 * for those. ElevenLabs output must never be committed. Contract: scripts/voice/lib.ts.
 *
 * moss lines run in-process by default (direct mode: runner.py inside heavy.sh). Service mode
 * (KQ_MOSS_MODE=service or --moss-service; client from KQ_MOSS_SERVICE_CLIENT) submits them to the local
 * moss-service instead and collects its results later; the owner runs `moss-run` in between
 * (scripts/voice/mossService.ts, docs/ARCHITECTURE.md "moss service mode").
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CREDITS_PER_CHAR,
  DIST_WARN_MB,
  buildPlan,
  collectLines,
  contentFile,
  entryFiles,
  estimateMB,
  loadContent,
  readManifest,
  redact,
  resolveVoice,
  selectLines,
  spendCap,
  textHash,
  writeManifest,
  MOSS_ATTRIBUTION,
} from './lib.ts';
import { isCommittableVoiceDir, nonCommittableGuard, voiceCreditErrors } from './assetRules.ts';
import { MOSS_BATCH_MAX, MOSS_RTF, QUIET_WINDOW, mossConfig, mossEstimate, refSha8For } from './moss.ts';
import {
  DEFAULT_RAW_DIR,
  DEFAULT_WAIT_MIN,
  SERVICE_PROJECT,
  assessResult,
  checkRawDir,
  clientRefusals,
  isStaleResult,
  loadServiceClient,
  mossMode,
  normalizeWaitArg,
  readRegistry,
  registryDiffs,
  serviceJob,
  submitSummary,
} from './mossService.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** The main checkout's .env (worktrees share its git dir; they have no .env of their own). */
const MAIN_ENV = (() => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return join(dirname(common), '.env');
  } catch {
    return join(REPO, '.env');
  }
})();

const { values: a } = parseArgs({
  args: normalizeWaitArg(process.argv.slice(2)),
  options: {
    'dry-run': { type: 'boolean', default: false },
    env: { type: 'string', default: MAIN_ENV },
    model: { type: 'string' },
    budget: { type: 'string', default: '8000' },
    reserve: { type: 'string', default: '1400' },
    ids: { type: 'string' },
    speakers: { type: 'string' },
    out: { type: 'string', default: join(REPO, 'public/voice') },
    content: { type: 'string', default: join(REPO, 'content') },
    voices: { type: 'string', default: join(HERE, 'voices.json') },
    priority: { type: 'string', default: join(HERE, 'priority.json') },
    speech: { type: 'string', default: join(HERE, 'speech.json') },
    limit: { type: 'string' },
    'max-lines': { type: 'string', default: '40' },
    force: { type: 'boolean', default: false },
    prune: { type: 'boolean', default: false },
    'keep-raw': { type: 'string' },
    offline: { type: 'boolean', default: false },
    'allow-noncommittable': { type: 'boolean', default: false },
    'moss-service': { type: 'boolean', default: false },
    submit: { type: 'boolean', default: false },
    collect: { type: 'boolean', default: false },
    wait: { type: 'string' },
    'raw-dir': { type: 'string', default: join(REPO, DEFAULT_RAW_DIR) },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (a.help) {
  console.log(`Usage: node scripts/voice/generate.mjs [options]
  --dry-run            print the plan; no TTS calls, nothing written
  --env <path>         .env holding ELEVENLABS_API_KEY / HF_TOKEN (default: main checkout .env)
  --model <id>         ElevenLabs run model (default: providers.elevenlabs.defaultModel); a speaker's own model wins
  --budget <credits>   credits this run may use (default 8000)
  --reserve <credits>  credits kept unspent (default 1400): spend <= min(budget, account remaining) - reserve
  --ids <a,b,glob*>    explicit line ids / globs instead of the priority tiers; generated in exactly this
                       order (globs expand in content order), also inside each moss batch
  --speakers <a,b>     only these speakers
  --limit <n>          at most n new clips overall
  --max-lines <n>      at most n new hf-space clips and n new moss clips per run (default 40; quota / machine-time guard)
  --force              regenerate even up-to-date lines
  --prune              (real run) remove manifest entries and clips of lines no longer in content
  --offline            do not ask the account for remaining credits
  --out <dir>          output dir (default public/voice: committed, credited MOSS clips only)
  --keep-raw <dir>     (real run) also keep each provider's raw audio there (e.g. moss WAVs, for pause metrics)
  --allow-noncommittable  let elevenlabs / hf-space clips land in public/voice anyway (local test only; never commit them)
  --content, --voices, --priority, --speech <path>   (speech.json: spoken text overrides per line id)
moss service mode (KQ_MOSS_MODE=service; client module path from KQ_MOSS_SERVICE_CLIENT; default mode: direct):
  --moss-service       same as KQ_MOSS_MODE=service: moss lines go to the local moss-service, no model here.
                       Without --submit / --collect: lines with a result are collected, the rest submitted
  --submit             only submit (re)generation jobs, then print "N queued (M cached) — owner runs: moss-run"
  --collect            only collect results (after the owner ran moss-run); still-queued lines are skipped
  --wait [min]         after submitting, wait for the results (default ${DEFAULT_WAIT_MIN} min), then collect
  --raw-dir <dir>      where the service writes raw WAVs (default ${DEFAULT_RAW_DIR}, gitignored; never under public/)
  -v, --verbose        list every selected line, also those past the budget`);
  process.exit(0);
}

const dry = a['dry-run'];
const num = (s, name) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a non-negative number`);
  return n;
};
const budget = num(a.budget, 'budget');
const reserve = num(a.reserve, 'reserve');
const limit = a.limit === undefined ? Infinity : num(a.limit, 'limit');
const maxLines = num(a['max-lines'], 'max-lines');
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

let KEY = '';
let HF = '';
function fail(msg) {
  console.error(`voice: ${redact(String(msg), KEY, HF)}`);
  process.exit(1);
}

// --- secrets (never printed) --------------------------------------------------------------
let envNote = '';
try {
  process.loadEnvFile(a.env);
} catch (e) {
  envNote = e && e.code === 'ENOENT' ? `no .env at ${a.env}` : `could not read ${a.env}`;
}
KEY = (process.env.ELEVENLABS_API_KEY ?? '').trim();
HF = (process.env.HF_TOKEN ?? '').trim();
const keyNote = KEY ? 'present' : `no key: ${envNote || `ELEVENLABS_API_KEY is empty in ${a.env}`}`;
const hfNote = HF ? 'present' : `no token: ${envNote || `HF_TOKEN is empty in ${a.env}`}`;
// keep the secrets out of anything spawned later (ffmpeg, heavy.sh + the moss runner)
delete process.env.ELEVENLABS_API_KEY;
delete process.env.HF_TOKEN;
// local MOSS: KQ_MOSS_VENV / KQ_MOSS_HOME / KQ_MOSS_VOICES from env or .env, defaults under ~/kq-models
const mossCfg = mossConfig(process.env);
const ro = { refSha8: refSha8For(mossCfg) };
let mode = 'direct';
try {
  mode = mossMode(process.env, a['moss-service']);
} catch (e) {
  fail(e.message);
}
if (mode !== 'service' && (a.submit || a.collect || a.wait !== undefined)) fail('--submit / --collect / --wait need moss service mode (KQ_MOSS_MODE=service or --moss-service)');
if (a.submit && a.collect) fail('--submit and --collect exclude each other (without either, results are collected and the rest submitted)');
const waitMin = a.wait === undefined ? null : num(a.wait, 'wait');
const rawDir = resolve(a['raw-dir']);
if (mode === 'service') {
  const rawErr = checkRawDir(rawDir);
  if (rawErr) fail(rawErr);
}

if (a.model && !(a.model in CREDITS_PER_CHAR)) fail(`unknown ElevenLabs model "${a.model}" (known: ${Object.keys(CREDITS_PER_CHAR).join(', ')})`);

// --- inputs -------------------------------------------------------------------------------
const voices = JSON.parse(readFileSync(a.voices, 'utf8'));
const priority = JSON.parse(readFileSync(a.priority, 'utf8'));
const speech = existsSync(a.speech) ? JSON.parse(readFileSync(a.speech, 'utf8')) : {};
const lines = collectLines(loadContent(a.content));
const manifestPath = join(a.out, 'manifest.json');
const manifest = readManifest(manifestPath);
const fileExists = (f) => existsSync(join(a.out, f));

// Real runs skip placeholders and leave service-only voices to moss-service.
const runVoices = dry
  ? voices
  : { ...voices, speakers: Object.fromEntries(Object.entries(voices.speakers).filter(([k, v]) => (mode === 'service' || !v.serviceVoice) && !resolveVoice(k, voices, undefined, ro)?.placeholder)) };
const usedProviders = new Set(Object.keys(runVoices.speakers).map((k) => resolveVoice(k, runVoices, undefined, ro)?.provider).filter(Boolean));

const selected = selectLines(lines, priority, { ids: list(a.ids), speakers: list(a.speakers) });

// --- account (ElevenLabs only; free call) -------------------------------------------------
let remaining = null;
let accountNote = 'not checked';
if (KEY && !a.offline && usedProviders.has('elevenlabs')) {
  const { getSubscription } = await import('./api.ts');
  try {
    const s = await getSubscription(KEY);
    remaining = s.remaining;
    accountNote = `${s.remaining} of ${s.characterLimit} credits left (tier ${s.tier}${s.nextReset ? `, resets ${s.nextReset}` : ''})`;
  } catch (e) {
    if (!dry) fail(`could not read the subscription: ${e.message}`);
    accountNote = `could not read: ${redact(e.message, KEY, HF)}`;
  }
}

const cap = spendCap({ budget, reserve, remaining });
const plan = buildPlan(selected, {
  voices: runVoices,
  runModel: a.model,
  manifest,
  cap,
  fileExists,
  force: a.force,
  speech,
  limit,
  maxLines: { 'hf-space': maxLines, moss: maxLines },
  resolve: ro,
});
const todo = plan.rows.filter((r) => r.take);
const serviceOnly = todo.filter((r) => r.voice.moss?.serviceVoice);
const providerGuard = nonCommittableGuard({ out: a.out, repo: REPO, providers: todo.map((r) => r.voice.provider), allow: a['allow-noncommittable'] });
const creditGuard = serviceOnly.length && isCommittableVoiceDir(a.out, REPO) ? serviceCreditGuard(serviceOnly) : null;
const guardMsg = providerGuard || creditGuard;
if (a['keep-raw'] && isCommittableVoiceDir(a['keep-raw'], REPO)) fail('--keep-raw must point outside public/voice/ (raw renders never go into the committed folder)');
if (guardMsg) {
  if (!dry) fail(`${guardMsg} Nothing generated.`);
  console.warn(`WARNING (a real run would stop here): ${guardMsg}`);
}
if (!dry) {
  if (todo.some((r) => r.voice.provider === 'elevenlabs') && !KEY)
    fail(`${keyNote}. Put ELEVENLABS_API_KEY into that .env (never into the repo) or pass --env <path>. Nothing generated (try --dry-run).`);
  if (todo.some((r) => r.voice.provider === 'hf-space') && !HF) fail(`hf-space: ${hfNote}. Put HF_TOKEN into that .env (never into the repo). Nothing generated.`);
}

printPlan(plan);
if (dry && mode === 'service') await servicePlan(todo.filter((r) => r.voice.provider === 'moss'));
if (dry) process.exit(0);

// --- real run -----------------------------------------------------------------------------
if (!todo.length) {
  console.log('\nNothing to generate.');
  if (a.prune) prune();
  process.exit(0);
}
const { elevenLabsProvider, hfSpaceProvider } = await import('./providers.ts');
const providers = {};
const providerFor = (name) =>
  (providers[name] ??=
    name === 'elevenlabs'
      ? elevenLabsProvider(KEY, voices.providers?.elevenlabs, (s) => console.log(s))
      : hfSpaceProvider(HF, voices.providers?.['hf-space'] ?? {}));

const tmpDir = join(a.out, '.tmp');
/** ffmpeg + output folders, only once something is really post-processed (a service submit needs neither) */
let processClip = null;
async function prepareOutput() {
  if (processClip) return;
  const au = await import('./audio.ts');
  if (!au.ffmpegAvailable()) fail('ffmpeg/ffprobe not found (set FFMPEG / FFPROBE)');
  processClip = au.processClip;
  mkdirSync(a.out, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
}
const sha8 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
let spent = 0;
let done = 0;
let stopped = false;
const total = todo.length;
let n = 0;

/** post-process one raw clip (any format ffmpeg reads) into the two encodings + manifest entry.
 * `o.keepRaw`: leave the raw file (service WAVs stay: its cache needs them); `o.extra`: more manifest fields. */
function finish(r, raw, credits, o = {}) {
  const id = r.line.id;
  const opusTmp = join(tmpDir, `${id}.webm.part`);
  const aacTmp = join(tmpDir, `${id}.m4a.part`);
  if (a['keep-raw']) {
    mkdirSync(a['keep-raw'], { recursive: true });
    copyFileSync(raw, join(a['keep-raw'], `${id}${extname(raw) || '.raw'}`));
  }
  let durationMs;
  try {
    durationMs = processClip(raw, opusTmp, aacTmp, { maxPauseSec: r.voice.postprocess?.maxPauseSec });
  } catch (e) {
    console.log('ffmpeg failed');
    console.error(`  ${String(e.message).slice(0, 300)} – raw kept at ${raw}`);
    return false;
  }
  const files = { opus: contentFile(id, sha8(opusTmp), 'webm'), aac: contentFile(id, sha8(aacTmp), 'm4a') };
  renameSync(opusTmp, join(a.out, files.opus));
  renameSync(aacTmp, join(a.out, files.aac));
  if (!o.keepRaw) unlinkSync(raw);
  const old = manifest.lines[id];
  manifest.lines[id] = {
    files,
    textHash: r.hash,
    speechHash: r.speechHash,
    speaker: r.line.speaker,
    provider: r.voice.provider,
    voiceId: r.voice.voiceId,
    model: r.voice.model,
    licence: r.voice.licence,
    date: new Date().toISOString(),
    chars: r.chars,
    credits,
    durationMs,
    // moss: engine marker (model + tokenizer revision, warm-up version); missing / different → stale-engine
    ...(r.voice.provider === 'moss' ? { attribution: MOSS_ATTRIBUTION, engine: r.voice.engine } : {}),
    ...o.extra,
  };
  writeManifest(manifestPath, manifest);
  // old clips go only after the manifest no longer points at them
  if (old) for (const f of entryFiles(old)) if (f !== files.opus && f !== files.aac && existsSync(join(a.out, f))) unlinkSync(join(a.out, f));
  spent += credits;
  done++;
  console.log(`${durationMs} ms`);
  return true;
}

const otherTodo = todo.filter((x) => x.voice.provider !== 'moss');
if (otherTodo.length) await prepareOutput();
for (const r of otherTodo) {
  const id = r.line.id;
  // The subscription counter lags 20-60 s: cap on the start-of-run remaining count (in `cap`) minus
  // the running sum of billed `character-cost`, never on re-polling.
  if (r.credits > 0 && spent + r.credits > cap) {
    console.log(`Stopping before ${id}: ${spent} credits billed so far + ~${r.credits} would pass the cap of ${cap}.`);
    stopped = true;
    break;
  }
  process.stdout.write(`[${++n}/${total}] ${id} (${r.voice.provider}, ${r.chars} chars, ~${r.credits} cr) … `);
  let res;
  try {
    res = await providerFor(r.voice.provider).synthesize({ text: r.tts, voice: r.voice, model: r.voice.model, lang: 'de' });
  } catch (e) {
    console.log('failed');
    if (e.status === 401 || e.status === 402 || e.status === 403) fail(`${e.message} – stopping`);
    console.error(`  ${redact(String(e.message), KEY, HF)} – skipped`);
    continue;
  }
  const raw = join(tmpDir, `${id}.raw`);
  writeFileSync(raw, res.audio);
  finish(r, raw, res.billedCredits ?? r.credits);
}

// local MOSS: ≤ 6 lines per runner process, each inside scripts/dev/heavy.sh; post-processing after the lock is released
const mossTodo = todo.filter((x) => x.voice.provider === 'moss');
let exitCode = 0;
if (mossTodo.length && mode === 'service') {
  exitCode = await runService(mossTodo);
} else if (mossTodo.length) {
  await prepareOutput();
  const { mossProvider } = await import('./providers.ts');
  const byId = new Map(mossTodo.map((r) => [r.line.id, r]));
  const moss = mossProvider({ cfg: mossCfg, repo: REPO, workDir: tmpDir, log: (s) => console.log(s) });
  try {
    for await (const b of moss.batches(mossTodo.map((r) => ({ id: r.line.id, text: r.tts, voice: r.voice, model: r.voice.model, lang: 'de' })))) {
      for (const c of b.clips) {
        const r = byId.get(c.id);
        process.stdout.write(`[${++n}/${total}] ${c.id} (moss, ${r.chars} chars, ${c.seconds} s raw, rtf ${c.rtf}) … `);
        finish(r, c.wav, 0);
      }
      for (const id of b.failed) console.error(`[${++n}/${total}] ${id} (moss) failed – skipped`);
    }
  } catch (e) {
    console.error(`  ${redact(String(e.message), KEY, HF)}`);
    stopped = true;
  }
}
rmSync(tmpDir, { recursive: true, force: true });
if (a.prune) prune();
if (mode !== 'service' || otherTodo.length)
  console.log(`\nGenerated ${done}/${todo.length} clips, ~${spent} credits${stopped ? ' (stopped early)' : ''}. Manifest: ${manifestPath}`);
process.exit(exitCode);

// ------------------------------------------------------------------------------------------
// moss service mode (scripts/voice/mossService.ts): submit / collect, never a model in this process

function serviceLines(rows) {
  return rows.map((r) => ({ r, id: r.line.id, speaker: r.line.speaker, serviceVoice: r.voice.moss.serviceVoice, text: r.tts, seed: r.voice.moss.seed }));
}

function serviceCreditGuard(rows) {
  const { voices: credits } = JSON.parse(readFileSync(join(REPO, 'public/assets/LICENSES.json'), 'utf8'));
  const speakers = new Map(rows.map(({ line, voice }) => [line.speaker, voice]));
  for (const [speaker, voice] of speakers) {
    const credit = credits?.find((c) => c.speaker === speaker);
    const errors = voiceCreditErrors({ speaker, licence: voice.licence, voiceId: voice.voiceId }, credit);
    if (credit && credit.referenceSha256 !== voice.moss.refSha256) errors.push('full reference hash differs from the voice credit');
    if (errors.length) return `speaker ${speaker}: ${errors.join('. ')}`;
  }
  return null;
}

function registryGuard(lines, registry) {
  const refusals = clientRefusals(lines, registry);
  if (refusals.length) return refusals.join('\n  ');
  const speakers = [...new Map(lines.map((l) => [l.speaker, l.r.voice.moss])).values()];
  const diffs = registryDiffs(speakers, registry);
  if (diffs.length)
    return `moss-service registry differs from voices.json:\n  ${diffs.join('\n  ')}`;
  return null;
}

async function runService(rows) {
  let client;
  try {
    client = await loadServiceClient(process.env);
  } catch (e) {
    fail(e.message);
  }
  const lines = serviceLines(rows);
  let registry = null;
  const reg = async () => (registry ??= await readRegistry(client));
  const toSubmit = [];
  const recs = new Map();
  for (const l of lines) {
    if (a.submit) {
      toSubmit.push(l);
      continue;
    }
    const rec = await client.result(SERVICE_PROJECT, l.id);
    // default: no result yet, or a result for an older text → submit; anything else → collect
    if (!a.collect && (rec === null || isStaleResult(rec, l.text))) toSubmit.push(l);
    else recs.set(l.id, rec);
  }
  let code = 0;
  const submitted = [];
  if (toSubmit.length) {
    let msg;
    try {
      msg = registryGuard(toSubmit, await reg());
    } catch (e) {
      fail(`could not read the moss-service registry: ${e.message}. Nothing submitted.`);
    }
    if (msg) fail(`refusing to submit:\n  ${msg}\nNothing submitted.`);
    const jobs = toSubmit.map((l) => serviceJob(l, rawDir));
    mkdirSync(rawDir, { recursive: true });
    const answers = await client.submit(jobs);
    const s = submitSummary(answers);
    for (const r of s.refused) console.error(`refused by moss-service: ${r.id}: ${r.error ?? r.status}`);
    for (const r of answers) if (r.status === 'queued') submitted.push(r.id);
    console.log(`\nmoss-service: ${s.queued} queued (${s.cached} cached) — owner runs: moss-run`);
    if (s.refused.length) {
      console.error(`${s.refused.length} jobs refused by moss-service (see above).`);
      code = 1;
    }
  }
  // --wait: poll the client until the submitted / pending lines are final, or the timeout
  const pending = [...submitted, ...[...recs].filter(([, r]) => r && (r.status === 'queued' || r.status === 'running')).map(([id]) => id)];
  if (waitMin !== null && pending.length) {
    console.log(`waiting up to ${waitMin} min for ${pending.length} moss-service results …`);
    const got =
      typeof client.waitAll === 'function'
        ? await client.waitAll(SERVICE_PROJECT, pending, { timeoutMs: Math.round(waitMin * 60_000) })
        : new Map(await Promise.all(pending.map(async (id) => [id, await client.result(SERVICE_PROJECT, id)])));
    for (const id of pending) recs.set(id, got.get(id) ?? null);
  }
  if (!recs.size) return code;
  const realResults = lines.filter((l) => l.serviceVoice && ['ok', 'cached'].includes(recs.get(l.id)?.status));
  if (realResults.length) {
    let msg;
    try {
      msg = registryGuard(realResults, await reg());
    } catch (e) {
      fail(`could not read the moss-service registry: ${e.message}. Nothing collected.`);
    }
    if (msg) fail(`refusing to collect:\n  ${msg}\nNothing collected.`);
  }
  if ([...recs.values()].some((r) => r && r.status === 'cached' && !r.engine)) {
    try {
      await reg();
    } catch (e) {
      console.error(`could not read the moss-service registry (needed to check cached results): ${e.message}`);
    }
  }
  const tally = { collected: 0, queued: 0, failed: 0, none: 0 };
  for (const l of lines) {
    if (!recs.has(l.id)) continue;
    const as = assessResult(l, recs.get(l.id), { registry: registry ?? undefined });
    if (as.kind === 'none') {
      tally.none++;
      console.log(`${l.id}: not submitted yet (run without --collect to submit)`);
    } else if (as.kind === 'queued') {
      tally.queued++;
      console.log(`${l.id}: still queued (${as.status})`);
    } else if (as.kind === 'failed') {
      tally.failed++;
      console.error(`${l.id}: ${as.reason} – manifest unchanged`);
    } else {
      await prepareOutput();
      process.stdout.write(`[${++n}/${total}] ${l.id} (moss-service${as.cached ? ', cached' : ''}, ${l.r.chars} chars) … `);
      if (finish(l.r, as.wav, 0, { keepRaw: true, extra: { engine: as.engine, serviceKey: as.serviceKey, sha256Raw: as.sha256Raw } })) tally.collected++;
      else tally.failed++;
    }
  }
  console.log(`\nmoss-service collect: ${tally.collected} collected, ${tally.queued} still queued, ${tally.failed} failed, ${tally.none} not submitted. Manifest: ${manifestPath}`);
  if (tally.failed) code = 1;
  return code;
}

/** --dry-run in service mode: what would be submitted / collected. Reads result files and the registry; submits nothing. */
async function servicePlan(rows) {
  console.log(`\nmoss service mode (dry run, nothing submitted): raw WAVs → ${rawDir}`);
  if (!rows.length) return void console.log('No moss lines to submit or collect.');
  let client = null;
  try {
    client = await loadServiceClient(process.env);
  } catch (e) {
    console.log(`${e.message}. Without it the plan cannot show result states or check the registry.`);
  }
  const lines = serviceLines(rows);
  const states = {};
  for (const l of lines) {
    let state = a.collect ? 'collect' : 'submit';
    if (client && !a.submit) {
      const rec = await client.result(SERVICE_PROJECT, l.id);
      if (!rec) state = a.collect ? 'not submitted' : 'submit';
      else if (!a.collect && isStaleResult(rec, l.text)) state = `submit (old ${rec.status} result for another text)`;
      else state = rec.status === 'queued' || rec.status === 'running' ? `still ${rec.status}` : `collect ${rec.status}`;
    }
    states[state] = (states[state] ?? 0) + 1;
    if (a.verbose) console.log(`  ${l.id.padEnd(40)} ${l.speaker.padEnd(9)} ${state}`);
  }
  console.log(`moss-service plan: ${Object.entries(states).map(([k, v]) => `${v} ${k}`).join(' · ')}${a.verbose ? '' : ' (-v lists each line)'}`);
  console.log('Whether the service answers a job from its cache shows when it is submitted ("N queued (M cached)").');
  if (!client) return;
  try {
    const registry = await readRegistry(client);
    const msg = registryGuard(lines, registry);
    console.log(msg ? `WARNING (a real submit would stop here): ${msg}` : 'Registry check: voices.json and the moss-service registry agree.');
  } catch (e) {
    console.log(`WARNING: could not read the moss-service registry: ${e.message}`);
  }
}

// ------------------------------------------------------------------------------------------
function prune() {
  const ids = new Set(lines.map((l) => l.id));
  let n = 0;
  for (const [id, e] of Object.entries(manifest.lines)) {
    if (ids.has(id)) continue;
    delete manifest.lines[id];
    writeManifest(manifestPath, manifest);
    for (const f of entryFiles(e)) if (existsSync(join(a.out, f))) unlinkSync(join(a.out, f));
    n++;
  }
  console.log(`Pruned ${n} orphaned entries.`);
}

function printPlan(p) {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  const models = [...new Set(p.rows.map((r) => `${r.voice.provider}/${r.voice.model} (${r.voice.licence})`))];
  console.log(`Voice plan${dry ? ' (dry run)' : ''} · ${lines.length} lines in content, ${selected.length} selected`);
  console.log(`ElevenLabs key: ${keyNote} · account: ${accountNote} · HF token: ${hfNote}`);
  console.log(`Voices: ${models.join(', ') || '-'}`);
  console.log(`Credits: budget ${budget} − reserve ${reserve}${remaining != null ? ` (account ${remaining})` : ''} → cap ${p.cap} credits`);
  const placeholders = Object.keys(voices.speakers).filter((k) => resolveVoice(k, voices, undefined, ro)?.placeholder);
  if (placeholders.length) console.log(`Placeholder voices (${dry ? 'planned, but a real run skips them' : 'skipped'}; moss: reference file missing in KQ_MOSS_VOICES): ${placeholders.join(', ')}`);
  const serviceSpeakers = [...new Set(selected.filter(({ line }) => voices.speakers[line.speaker]?.serviceVoice).map(({ line }) => line.speaker))];
  if (mode === 'direct' && serviceSpeakers.length)
    console.log(`MOSS voices requiring service mode (${dry ? 'included in this plan' : 'skipped'}): ${serviceSpeakers.join(', ')}. Set KQ_MOSS_MODE=service to use them.`);
  console.log('');
  const w = Math.max(28, ...p.rows.map((r) => r.line.id.length)) + 3;
  console.log(`${lpad('#', 4)}  ${pad('line id', w)}${pad('speaker', 9)}${pad('provider', 11)}${pad('tier', 16)}${pad('status', 13)}${lpad('chars', 6)}${lpad('credits', 8)}${lpad('cum.', 7)}`);
  let shown = 0;
  let hidden = 0;
  p.rows.forEach((r, i) => {
    const past = !r.take && r.status !== 'up-to-date';
    if (past && !a.verbose) return void hidden++;
    shown++;
    const sid = r.speechSource === 'override' ? `${r.line.id} *` : r.line.id;
    const st = r.take ? r.status : r.status === 'up-to-date' ? 'up-to-date' : `(${r.status})`;
    const cum = r.take ? r.cumulative : '';
    console.log(`${lpad(i + 1, 4)}  ${pad(sid, w)}${pad(r.line.speaker, 9)}${pad(r.voice.provider, 11)}${pad(r.tier, 16)}${pad(st, 13)}${lpad(r.chars, 6)}${lpad(r.status === 'up-to-date' ? 0 : r.credits, 8)}${lpad(cum, 7)}`);
  });
  const taken = p.rows.filter((r) => r.take);
  const upToDate = p.rows.filter((r) => r.status === 'up-to-date');
  const stale = p.rows.filter((r) => r.status.startsWith('stale') || r.status === 'missing-file');
  const rest = p.rows.filter((r) => !r.take && r.status !== 'up-to-date');
  if (hidden) console.log(`   … ${hidden} more selected lines past the budget (-v lists them)`);
  if (p.rows.some((r) => r.speechSource === 'override')) console.log('   * spoken text from speech.json');
  console.log('');
  console.log(`To generate: ${taken.length} lines · ${p.chars} chars · ${p.spend} credits (cap ${p.cap}; reserve ${reserve} kept, ${p.cap - p.spend} of the cap unused)`);
  console.log(`Up to date: ${upToDate.length} · stale (text/voice/model/engine/file changed): ${stale.length} · lines covered after run: ${upToDate.length + taken.length}/${p.rows.length}`);
  if (p.limited.length) console.log(`--max-lines reached for: ${p.limited.join(', ')} (max ${maxLines} new clips per run)`);
  const mbRun = estimateMB(taken);
  const mbAll = estimateMB([...upToDate.map((r) => ({ chars: r.chars, durationMs: manifest.lines[r.line.id]?.durationMs })), ...taken]);
  console.log(`Dist size (Opus 24k + AAC 48k, est. ${dry ? 'from chars' : 'from chars / durations'}): this run ~${mbRun.toFixed(1)} MB · all voiced after run ~${mbAll.toFixed(1)} MB${mbAll > DIST_WARN_MB ? `  WARNING: over the ${DIST_WARN_MB} MB voice budget` : ''}`);
  const mossRows = taken.filter((r) => r.voice.provider === 'moss');
  if (p.rows.some((r) => r.voice.provider === 'moss')) {
    const e = mossEstimate(mossRows);
    const mossMB = estimateMB(mossRows);
    const allMoss = p.rows.filter((r) => r.voice.provider === 'moss' && r.status !== 'up-to-date');
    const ea = mossEstimate(allMoss);
    const sp = [...new Set(p.rows.filter((r) => r.voice.moss).map((r) => `${r.line.speaker} ${r.voice.voiceId}`))];
    console.log(
      `moss (local, 0 credits): ${e.lines} lines · ${e.chars} chars · ~${e.minutes.toFixed(1)} min at RTF ${MOSS_RTF} incl. one model load per batch · ` +
        `${e.batches} heavy-lock batches of ≤ ${MOSS_BATCH_MAX} · ~${mossMB.toFixed(1)} MB dist · voices ${sp.join(', ')}`,
    );
    if (allMoss.length > mossRows.length)
      console.log(`moss, all ${ea.lines} selected lines not yet voiced: ${ea.chars} chars · ~${ea.minutes.toFixed(0)} min · ${ea.batches} batches · ~${estimateMB(allMoss).toFixed(1)} MB (raise --max-lines / --limit, or run again)`);
    console.log(`moss setup: python ${existsSync(mossCfg.python) ? 'found' : 'MISSING'} (KQ_MOSS_VENV) · references in KQ_MOSS_VOICES · quiet window ${existsSync(QUIET_WINDOW) ? 'ACTIVE (batches wait)' : 'off'} · the dry run never loads the model`);
  }
  if (rest.length) console.log(`Past the budget: ${rest.length} lines · ${rest.reduce((s, r) => s + r.chars, 0)} chars · ${rest.reduce((s, r) => s + r.credits, 0)} credits${p.stoppedAt ? ` (stopped at ${p.stoppedAt.line.id})` : ''}`);
  const byReason = {};
  for (const s of p.skipped) (byReason[s.reason] ??= {})[s.line.speaker] = (byReason[s.reason]?.[s.line.speaker] ?? 0) + 1;
  for (const [reason, sp] of Object.entries(byReason))
    console.log(`Skipped (${reason}): ${Object.entries(sp).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  // what all selected lines would cost per model
  const allChars = p.rows.reduce((s, r) => s + r.chars, 0);
  const tChars = taken.reduce((s, r) => s + r.chars, 0);
  console.log(
    `All ${p.rows.length} selected lines: ${allChars} chars → ` +
      Object.entries(CREDITS_PER_CHAR)
        .map(([m, rate]) => `${m} ${Math.ceil(allChars * rate)}`)
        .join(' · ') +
      ` credits (this run's ${taken.length} lines: ${tChars} chars)`,
  );
  for (const l of p.staleOverrides)
    console.warn(`WARNING: speech.json override for ${l.id} was written for another text (forText != ${textHash(l.text)}); ignored, auto-prep used. Rewrite it.`);
  const nameAuto = p.rows.filter((r) => r.speechSource === 'auto' && /\{[Nn]ame\}/.test(r.line.text)).map((r) => r.line.id);
  if (nameAuto.length) console.warn(`WARNING: lines with {Name} and no current speech.json entry (name just dropped): ${nameAuto.join(', ')}`);
  const noVoice = {};
  for (const l of lines) if (!voices.speakers[l.speaker]?.serviceVoice && !resolveVoice(l.speaker, runVoices, undefined, ro)) noVoice[l.speaker] = (noVoice[l.speaker] ?? 0) + 1;
  const nv = Object.entries(noVoice).sort((x, y) => y[1] - x[1]);
  if (nv.length) console.log(`Speakers without a voice id in voices.json (never generated): ${nv.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const orphans = Object.keys(manifest.lines).filter((id) => !lines.some((l) => l.id === id));
  if (orphans.length) console.log(`Orphaned manifest entries (line gone from content; --prune removes): ${orphans.join(', ')}`);
}
