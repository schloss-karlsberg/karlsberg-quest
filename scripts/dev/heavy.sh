#!/bin/bash
# heavy.sh: machine-wide lock so only one heavy job (Playwright e2e, real-GPU
# screenshots, local TTS/model runs) runs at a time across all sessions on this Mac.
# bash 3.2 compatible (macOS /bin/bash), no flock. See usage() below.

set -u

LOCK="${KQ_HEAVY_LOCK:-/tmp/kq-heavy.lock}"
BREAKER="$LOCK.breaker"     # short-lived mutex taken only while clearing a stale lock
POLL="${KQ_HEAVY_POLL:-2}"  # seconds between acquire attempts
STALE_AGE=30                # a lock without a pid file older than this is stale
MIN_FREE_PCT="${KQ_HEAVY_MIN_FREE_PCT:-20}"  # --check-load: below this % free memory = high pressure
ME="heavy.sh"

usage() {
  cat <<'EOF'
Usage: scripts/dev/heavy.sh [options] [--] <cmd> [args...]
       scripts/dev/heavy.sh --status

Runs <cmd> while holding a machine-wide lock (/tmp/kq-heavy.lock), so only one
heavy job (e2e, GPU screenshots, model runs) runs at a time on this machine.
Waits (polling every 2 s) while someone else holds it. The command's exit
code is passed through.

Options:
  --status       Print the current holder (or "free") and exit (0 free, 1 held).
  --nice         Run <cmd> under `nice -n 19` and `taskpolicy -b` (macOS background QoS).
                 Good for CPU jobs (TTS); avoid for GPU screenshots/timed e2e (it throttles).
  --check-load   After acquiring, warn if memory pressure is high (free < 20 %, from
                 `memory_pressure -Q`, falling back to vm_stat free+inactive+speculative).
  --strict       With --check-load: refuse (exit 75) instead of warning.
  -h, --help     This text.
  --             End of options.

Environment:
  KQ_HEAVY_OWNER        Label stored in the lock (e.g. your session name).
  KQ_HEAVY_TIMEOUT      Give up after this many seconds of waiting (exit 75).
  KQ_HEAVY_LOCK         Lock directory path (default /tmp/kq-heavy.lock; tests use this).
  KQ_HEAVY_MIN_FREE_PCT Memory threshold for --check-load (default 20).
  KQ_HEAVY_HELD=1       Set for the child; a nested heavy.sh then runs its command directly.

Exit codes: the command's own code; 75 = timed out or refused by --strict;
64 = usage error. A stale lock (holder pid dead, or no pid file and older
than 30 s) is cleared automatically.
EOF
}

die() { echo "$ME: $*" >&2; exit 64; }

# ---------- options ----------
want_status=0; want_nice=0; want_load=0; strict=0
while [ $# -gt 0 ]; do
  case "$1" in
    --status) want_status=1; shift ;;
    --nice) want_nice=1; shift ;;
    --check-load) want_load=1; shift ;;
    --strict) strict=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1 (use -- before a command that starts with -)" ;;
    *) break ;;
  esac
done

now() { date +%s; }
mtime() { stat -f %m "$1" 2>/dev/null || echo 0; }
fmt_dur() { local s=$1; if [ "$s" -ge 3600 ]; then printf '%dh%02dm' $((s/3600)) $((s%3600/60));
  elif [ "$s" -ge 60 ]; then printf '%dm%02ds' $((s/60)) $((s%60)); else printf '%ds' "$s"; fi; }
pid_alive() { [ -n "$1" ] && { kill -0 "$1" 2>/dev/null || ps -p "$1" >/dev/null 2>&1; }; }
read_f() { cat "$LOCK/$1" 2>/dev/null; }

holder_line() {
  local pid owner cmd ep el
  pid=$(read_f pid); owner=$(read_f owner); cmd=$(read_f cmd); ep=$(read_f epoch)
  [ -n "$ep" ] || ep=$(mtime "$LOCK")
  el=$(( $(now) - ep )); [ "$el" -ge 0 ] || el=0
  printf 'held by %s (pid %s) for %s: %s' "${owner:-?}" "${pid:-?}" "$(fmt_dur "$el")" "${cmd:-?}"
}

if [ "$want_status" = 1 ]; then
  if [ -d "$LOCK" ]; then
    pid=$(read_f pid)
    if [ -n "$pid" ] && ! pid_alive "$pid"; then
      echo "stale ($(holder_line); pid dead, will be cleared by the next waiter)"
    else
      holder_line; echo
      cwd=$(read_f cwd); started=$(read_f started)
      echo "  cwd: ${cwd:-?}  started: ${started:-?}"
    fi
    exit 1
  fi
  echo "free"; exit 0
fi

[ $# -gt 0 ] || { usage >&2; exit 64; }

# ---------- command prefix ----------
prefix=()
if [ "$want_nice" = 1 ]; then
  prefix=(nice -n 19)
  if command -v taskpolicy >/dev/null 2>&1; then prefix=("${prefix[@]}" taskpolicy -b); fi
fi

# ---------- memory pressure ----------
# Prints the free-memory percentage. memory_pressure -Q reports
# "System-wide memory free percentage: N%"; else vm_stat (free+inactive+speculative)/total.
free_pct() {
  local p
  if command -v memory_pressure >/dev/null 2>&1; then
    p=$(memory_pressure -Q 2>/dev/null | sed -n 's/.*free percentage: *\([0-9][0-9]*\)%.*/\1/p')
    [ -n "$p" ] && { echo "$p"; return; }
  fi
  vm_stat 2>/dev/null | awk -v total="$(sysctl -n hw.memsize 2>/dev/null)" '
    /page size of/ { for (i = 1; i <= NF; i++) if ($i == "of") ps = $(i + 1) }
    /^Pages free:/ { f = $3 } /^Pages inactive:/ { n = $3 } /^Pages speculative:/ { s = $3 }
    END { if (ps > 0 && total > 0) printf "%d\n", (f + n + s) * ps * 100 / total }'
}

check_load() {
  local p; p=$(free_pct)
  [ -n "$p" ] || { echo "$ME: --check-load: could not read memory pressure" >&2; return 0; }
  if [ "$p" -lt "$MIN_FREE_PCT" ]; then
    if [ "$strict" = 1 ]; then
      echo "$ME: memory pressure high (${p}% free < ${MIN_FREE_PCT}%), refusing (--strict)" >&2
      return 1
    fi
    echo "$ME: warning: memory pressure high (${p}% free < ${MIN_FREE_PCT}%)" >&2
  fi
  return 0
}

# ---------- nested: lock already held by an ancestor ----------
if [ "${KQ_HEAVY_HELD:-}" = 1 ]; then
  exec ${prefix[@]+"${prefix[@]}"} "$@"
fi

# ---------- stale-lock clearing ----------
# Serialised through $BREAKER (mkdir mutex). Under it we re-verify staleness, so
# the dir we rename away is the dead one, never a lock a peer just acquired: only
# the (dead) owner or the breaker holder can remove $LOCK, so it cannot change
# between the re-check and the mv.
is_stale() {
  local pid; pid=$(read_f pid)
  if [ -n "$pid" ]; then
    ! pid_alive "$pid"
  else
    [ -d "$LOCK" ] && [ $(( $(now) - $(mtime "$LOCK") )) -gt "$STALE_AGE" ]
  fi
}

try_clear_stale() {
  is_stale || return 1
  if ! mkdir "$BREAKER" 2>/dev/null; then
    # A breaker holder that died mid-clear leaves the breaker behind; it is held for ms normally.
    if [ $(( $(now) - $(mtime "$BREAKER") )) -gt "$STALE_AGE" ]; then
      local junk="$BREAKER.dead.$$.$RANDOM"
      mv "$BREAKER" "$junk" 2>/dev/null && rm -rf "$junk"
    fi
    return 1
  fi
  local cleared=1
  if [ -d "$LOCK" ] && is_stale; then
    local junk="$LOCK.stale.$$.$RANDOM"
    if mv "$LOCK" "$junk" 2>/dev/null; then
      echo "$ME: cleared stale lock (pid $(cat "$junk/pid" 2>/dev/null || echo none): $(cat "$junk/cmd" 2>/dev/null))" >&2
      rm -rf "$junk"; cleared=0
    fi
  fi
  rmdir "$BREAKER" 2>/dev/null
  return $cleared
}

# ---------- acquire ----------
write_meta() {
  local tmp="$LOCK/.pid.$$"
  printf '%s\n' "$*" >"$LOCK/cmd"
  pwd >"$LOCK/cwd"
  date +%Y-%m-%dT%H:%M:%S%z >"$LOCK/started"
  now >"$LOCK/epoch"
  printf '%s\n' "${KQ_HEAVY_OWNER:-}" >"$LOCK/owner"
  echo $$ >"$tmp" && mv "$tmp" "$LOCK/pid"   # pid appears atomically, last
}

cmdline=$(printf '%q ' "$@"); cmdline=${cmdline% }
waited=0; t0=$(now); last_print=-999; is_tty=0; [ -t 2 ] && is_tty=1
while :; do
  if mkdir "$LOCK" 2>/dev/null; then
    write_meta "$cmdline"
    break
  fi
  try_clear_stale && continue
  el=$(( $(now) - t0 ))
  if [ -n "${KQ_HEAVY_TIMEOUT:-}" ] && [ "$el" -ge "$KQ_HEAVY_TIMEOUT" ]; then
    [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
    echo "$ME: gave up after $(fmt_dur "$el") waiting; lock $(holder_line)" >&2
    exit 75
  fi
  if [ "$is_tty" = 1 ]; then
    printf '\r\033[K%s: waiting %s, lock %s' "$ME" "$(fmt_dur "$el")" "$(holder_line)" >&2
  elif [ $(( el - last_print )) -ge 30 ]; then
    echo "$ME: waiting $(fmt_dur "$el"), lock $(holder_line)" >&2
    last_print=$el
  fi
  waited=1
  sleep "$POLL"
done
[ "$waited" = 1 ] && [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
[ "$waited" = 1 ] && echo "$ME: acquired lock after $(fmt_dur $(( $(now) - t0 )))" >&2

# ---------- release + signal forwarding ----------
child=""
release() {
  if [ "$(read_f pid)" = "$$" ]; then
    local junk="$LOCK.done.$$.$RANDOM"
    mv "$LOCK" "$junk" 2>/dev/null && rm -rf "$junk"
  fi
}
forward() {  # $1 = signal name
  if [ -n "$child" ] && pid_alive "$child"; then
    # child runs in its own process group (set -m): signal the whole group, so
    # grandchildren (pnpm -> node -> browsers) get it too.
    kill -s "$1" -- "-$child" 2>/dev/null || kill -s "$1" "$child" 2>/dev/null
  else
    case "$1" in INT) exit 130 ;; HUP) exit 129 ;; *) exit 143 ;; esac
  fi
}
trap release EXIT
trap 'forward INT' INT
trap 'forward TERM' TERM
trap 'forward HUP' HUP

if [ "$want_load" = 1 ] && ! check_load; then exit 75; fi

export KQ_HEAVY_HELD=1
set -m   # job control: the child gets its own process group and default SIGINT handling
${prefix[@]+"${prefix[@]}"} "$@" &
child=$!
set +m
while :; do
  wait "$child"; rc=$?
  # wait returns early (>128) when one of our traps ran; keep waiting while the child lives.
  pid_alive "$child" && continue
  # If that wait was the interrupted one, the child's real status is still collectable.
  wait "$child" 2>/dev/null; rc2=$?
  [ "$rc2" -ne 127 ] && rc=$rc2
  break
done
exit "$rc"
