"""MOSS-TTS-v1.5 batch runner for the Karlsberg Quest voice pipeline (`moss` provider).

usage:  <venv>/bin/python -I scripts/voice/moss/runner.py <job.json | ->

Run it only through scripts/dev/heavy.sh (the `moss` provider in providers.ts / moss.ts does this):
the model needs 25-37 GB peak. One process = one model load = one batch (at most 6 clips), then exit.

Job: either a list of clips, or {"outDir": "...", "clips": [...]}; `--out <dir>` overrides outDir.
Clip: {"id", "text", "reference", "seed", "language", "instruction"?, "params"?}
  reference: a WAV inside the allowed reference dir (KQ_MOSS_VOICES, default ~/kq-models/voices),
             absolute or relative to that dir; never under any /casting/clips/ path (ElevenLabs).
Clips run in job order (generate.mjs keeps the --ids order). After every model load, warm-up v1 runs
first (WARMUP below), so a clip's take does not depend on its position in the batch.
stdout: one JSON line per clip {"id", "wav", "seconds", "rtf"} (nothing else); logs go to stderr.
exit: 0 ok, 2 bad job, 3 reference refused, 4 model snapshot missing, 76 quiet window active.

Env: KQ_MOSS_HOME (default ~/kq-models; HF cache in <home>/hf), KQ_MOSS_VOICES. Offline only
(HF_HUB_OFFLINE=1), local snapshot paths, no trust_remote_code. Imports: stdlib, numpy, mlx-audio
(and mlx, which mlx-audio is built on).
"""
import json
import os
import random
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

MODEL = "OpenMOSS-Team/MOSS-TTS-v1.5"
REV = "cdd3b911b1585e3f2dbc7775ef10f9926f58850a"
TOK = "OpenMOSS-Team/MOSS-Audio-Tokenizer"
TOK_REV = "3cd226ba2947efa357ef453bcad111b6eafba782"
FORBIDDEN = "/casting/clips/"
QUIET_WINDOW = "/tmp/kq-quiet-window"
MAX_CLIPS = 6
ALLOWED_PARAMS = {"max_tokens", "temperature", "top_p", "top_k", "repetition_penalty"}
# Warm-up v1 (agreed with moss-service, 2026-11-21; spec in docs/ARCHITECTURE.md "warmup v1"; must stay
# identical in both paths, any change is v2 and changes the manifest `engine.warmup`). Without it the
# first clip after a lazy load came out as a different take than the same clip later in a batch.
WARMUP = {"version": "v1", "text": "Hallo.", "seed": 0, "max_tokens": 50}


def log(msg):
    print(f"moss-runner: {msg}", file=sys.stderr, flush=True)


def die(code, msg):
    log(msg)
    sys.exit(code)


def home_dir():
    return os.path.expanduser(os.environ.get("KQ_MOSS_HOME") or "~/kq-models")


def voices_dir():
    return os.path.realpath(os.path.expanduser(os.environ.get("KQ_MOSS_VOICES") or os.path.join(home_dir(), "voices")))


def check_ref(path, allowed):
    """Owner guard: references are our own synthetic clips inside the allowed dir, never ElevenLabs clips."""
    if not isinstance(path, str) or not path:
        raise ValueError("reference missing")
    raw = path if os.path.isabs(path) else os.path.join(allowed, path)
    real = os.path.realpath(raw)
    if FORBIDDEN in raw or FORBIDDEN in real:
        raise ValueError(f"forbidden reference (ElevenLabs clip): {path}")
    if not real.startswith(allowed + os.sep):
        raise ValueError(f"reference outside {allowed}: {path}")
    if not os.path.isfile(real):
        raise ValueError(f"reference missing: {path}")
    return real


def read_job(argv):
    args = list(argv)
    out = None
    if "--out" in args:
        i = args.index("--out")
        if i + 1 >= len(args):
            die(2, "--out needs a directory")
        out = args[i + 1]
        del args[i : i + 2]
    if len(args) != 1:
        die(2, "usage: runner.py <job.json | -> [--out dir]")
    try:
        job = json.load(sys.stdin) if args[0] == "-" else json.load(open(args[0], encoding="utf-8"))
    except (OSError, ValueError) as e:
        die(2, f"cannot read job: {e}")
    clips = job if isinstance(job, list) else job.get("clips") if isinstance(job, dict) else None
    out = out or (job.get("outDir") if isinstance(job, dict) else None)
    if not isinstance(clips, list) or not clips:
        die(2, "job has no clips")
    if len(clips) > MAX_CLIPS:
        die(2, f"{len(clips)} clips in one job; at most {MAX_CLIPS} per model load")
    if not out:
        die(2, "no out dir (job.outDir or --out)")
    return clips, out


def validate(clips, allowed):
    seen = set()
    for c in clips:
        if not isinstance(c, dict):
            die(2, "clip is not an object")
        cid = c.get("id")
        if not isinstance(cid, str) or not cid or "/" in cid or "\\" in cid or cid.startswith(".") or cid in seen:
            die(2, f"bad or duplicate clip id: {cid!r}")
        seen.add(cid)
        if not isinstance(c.get("text"), str) or not c["text"].strip():
            die(2, f"{cid}: empty text")
        if not isinstance(c.get("seed"), int):
            die(2, f"{cid}: seed must be an integer")
        params = c.get("params") or {}
        if not isinstance(params, dict) or set(params) - ALLOWED_PARAMS:
            die(2, f"{cid}: unsupported params {sorted(set(params) - ALLOWED_PARAMS) if isinstance(params, dict) else params}")
        try:
            c["reference"] = check_ref(c.get("reference"), allowed)
        except ValueError as e:
            die(3, f"{cid}: {e}")


def main():
    clips, out = read_job(sys.argv[1:])
    allowed = voices_dir()
    validate(clips, allowed)  # every reference is checked before the model loads
    if os.path.exists(QUIET_WINDOW):
        die(76, "quiet window active")
    hub = os.path.join(home_dir(), "hf", "hub")
    model_dir = os.path.join(hub, "models--OpenMOSS-Team--MOSS-TTS-v1.5", "snapshots", REV)
    tok_dir = os.path.join(hub, "models--OpenMOSS-Team--MOSS-Audio-Tokenizer", "snapshots", TOK_REV)
    for d in (model_dir, tok_dir):
        if not os.path.isdir(d):
            die(4, f"snapshot missing: {d}")
    os.makedirs(out, exist_ok=True)

    import numpy as np
    import mlx.core as mx
    from mlx_audio.tts import load
    from mlx_audio.audio_io import write as audio_write

    t0 = time.perf_counter()
    model = load(model_dir, lazy=True)
    log(f"model loaded in {time.perf_counter() - t0:.1f}s")
    run_batch(model, clips, tok_dir, out, mx, np, audio_write)
    log(f"done: {len(clips)} clips, peak {mx.get_peak_memory() / 1e9:.1f} GB")


def seed_all(seed, mx, np):
    mx.random.seed(seed)
    np.random.seed(seed)
    random.seed(seed)


def warmup_v1(model, first, tok_dir, mx, np):
    """Warm-up v1 (WARMUP above), right after the model load and before the first real clip:
    1. mx.eval(model.parameters()); 2. seed 0 (mx, np, random), one throw-away generate with the first
    real clip's reference and language, max_tokens 50, no instruction, no other params; mx.eval(audio).
    Nothing is written. Order and arguments match moss-service (moss_host.py); any change is v2."""
    t = time.perf_counter()
    mx.eval(model.parameters())
    seed_all(WARMUP["seed"], mx, np)
    kw = {"audio_tokenizer_source": tok_dir, "ref_audio": first["reference"], "max_tokens": WARMUP["max_tokens"]}
    if first.get("language"):
        kw["language"] = first["language"]
    res = next(model.generate(text=WARMUP["text"], **kw))
    mx.eval(res.audio)
    log(f"warmup {WARMUP['version']} done in {time.perf_counter() - t:.1f} s")


def run_batch(model, clips, tok_dir, out, mx, np, audio_write):
    """Everything after `load(lazy=True)`: warm-up v1, then the clips in job order, reseeded per clip."""
    warmup_v1(model, clips[0], tok_dir, mx, np)
    for c in clips:
        seed_all(int(c["seed"]), mx, np)
        kw = dict(c.get("params") or {})
        kw["audio_tokenizer_source"] = tok_dir
        kw["ref_audio"] = c["reference"]
        if c.get("language"):
            kw["language"] = c["language"]
        if c.get("instruction"):
            kw["instruction"] = c["instruction"]
        t = time.perf_counter()
        res = next(model.generate(text=c["text"], **kw))
        mx.eval(res.audio)
        gen_s = time.perf_counter() - t
        audio = np.array(res.audio, dtype=np.float32)
        path = os.path.join(out, c["id"] + ".wav")
        audio_write(path, audio, res.sample_rate)
        dur = len(audio) / res.sample_rate
        print(json.dumps({"id": c["id"], "wav": path, "seconds": round(dur, 3), "rtf": round(gen_s / max(dur, 1e-6), 3)}), flush=True)


if __name__ == "__main__":
    main()
