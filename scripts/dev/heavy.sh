#!/bin/bash
# heavy.sh: machine-wide lock so only one heavy job (Playwright e2e, real-GPU
# screenshots, local TTS/model runs) runs at a time across all sessions on this Mac.
# Waiters queue FIFO by ticket. bash 3.2 compatible (macOS /bin/bash), no flock.
# See usage() below.

set -u

LOCK="${KQ_HEAVY_LOCK:-/tmp/kq-heavy.lock}"
QUEUE="$LOCK.queue"         # FIFO tickets: <seq>-<pid>-<owner> (dirs)
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
Waiters line up first come, first served (ticket queue in /tmp/kq-heavy.lock.queue)
and poll every 2 s. The command's exit code is passed through.

Hold the lock for ONE spec file or ONE screenshot set, never a whole multi-spec
batch, so short jobs from other sessions can interleave:
  for s in e2e/a.spec.ts e2e/b.spec.ts; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "$s" --workers=1
  done

Options:
  --status         Print the holder (or "free") and the queue, then exit (0 free, 1 held).
  --max-hold <min> Expected hold time in minutes (hint, not enforced). Shown in --status;
                   a warning goes to stderr when it is exceeded.
  --nice           Run <cmd> under `nice -n 19` and `taskpolicy -b` (macOS background QoS).
                   Good for CPU jobs (TTS); avoid for GPU screenshots/timed e2e (it throttles).
  --check-load     After acquiring, warn if memory pressure is high (free < 20 %, from
                   `memory_pressure -Q`, falling back to vm_stat free+inactive+speculative).
  --strict         With --check-load: refuse (exit 75) instead of warning.
  -h, --help       This text.
  --               End of options.

Environment:
  KQ_HEAVY_OWNER        Label stored in the lock and ticket (e.g. your session name).
  KQ_HEAVY_TIMEOUT      Give up after this many seconds of waiting (exit 75).
  KQ_HEAVY_LOCK         Lock directory path (default /tmp/kq-heavy.lock; tests use this).
  KQ_HEAVY_MIN_FREE_PCT Memory threshold for --check-load (default 20).
  KQ_HEAVY_HELD=1       Set for the child; a nested heavy.sh then runs its command directly
                        (no lock, no queue).

Exit codes: the command's own code; 75 = timed out or refused by --strict;
64 = usage error. A stale lock (holder pid dead, or no pid file and older
than 30 s) and tickets of dead waiters are cleared automatically.
EOF
}

die() { echo "$ME: $*" >&2; exit 64; }

# ---------- options ----------
want_status=0; want_nice=0; want_load=0; strict=0; max_hold=""
while [ $# -gt 0 ]; do
  case "$1" in
    --status) want_status=1; shift ;;
    --nice) want_nice=1; shift ;;
    --check-load) want_load=1; shift ;;
    --strict) strict=1; shift ;;
    --max-hold)
      [ $# -ge 2 ] || die "--max-hold needs minutes"
      echo "$2" | grep -Eq '^[0-9]+([.][0-9]+)?$' || die "--max-hold: not a number of minutes: $2"
      max_hold=$2; shift 2 ;;
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
min_to_s() { awk -v m="$1" 'BEGIN { s = m * 60; i = int(s); if (i < s) i++; print i }'; }

holder_line() {
  local pid owner cmd ep el mh mhs extra=""
  pid=$(read_f pid); owner=$(read_f owner); cmd=$(read_f cmd); ep=$(read_f epoch); mh=$(read_f max_hold)
  [ -n "$ep" ] || ep=$(mtime "$LOCK")
  el=$(( $(now) - ep )); [ "$el" -ge 0 ] || el=0
  if [ -n "$mh" ]; then
    mhs=$(min_to_s "$mh")
    if [ "$el" -gt "$mhs" ]; then extra=" [max-hold ${mh}m EXCEEDED by $(fmt_dur $((el - mhs)))]"
    else extra=" [max-hold ${mh}m]"; fi
  fi
  printf 'held by %s (pid %s) for %s%s: %s' "${owner:-?}" "${pid:-?}" "$(fmt_dur "$el")" "$extra" "${cmd:-?}"
}

# ---------- queue ----------
# A ticket is a directory $QUEUE/<seq>-<pid>-<owner>, seq zero-padded to 6 digits,
# holding `cmd`. seq = highest ticket + 1; creating the dir is atomic (mkdir), and a
# seq clash between two concurrent arrivals makes the one(s) that see it re-draw,
# so every live ticket has a unique seq and the queue order is the seq order.
ticket=""
ticket_list() { ls -1 "$QUEUE" 2>/dev/null | grep -E '^[0-9]{6}-[0-9]+-' | sort; }
t_pid() { local r=${1#*-}; echo "${r%%-*}"; }
t_owner() { local r=${1#*-}; r=${r#*-}; echo "$r"; }
drop_ticket() { [ -n "$ticket" ] && rm -rf "${QUEUE:?}/$ticket"; ticket=""; }

take_ticket() {
  local owner seq last name
  owner=$(printf '%s' "${KQ_HEAVY_OWNER:-anon}" | tr -c 'A-Za-z0-9_.-' '_'); [ -n "$owner" ] || owner=anon
  mkdir -p "$QUEUE" 2>/dev/null
  while :; do
    last=$(ticket_list | tail -1); last=${last%%-*}
    seq=$(( 10#${last:-0} + 1 ))
    name=$(printf '%06d-%s-%s' "$seq" $$ "$owner")
    mkdir "$QUEUE/$name" 2>/dev/null || { sleep 0.1; continue; }
    printf '%s\n' "$1" >"$QUEUE/$name/cmd"
    # Seq clash: whoever sees it yields and re-draws. The later mkdir always sees the
    # earlier ticket, so two tickets can never both keep one seq.
    if [ "$(ticket_list | grep -c -E "^$(printf %06d "$seq")-")" -gt 1 ]; then
      rm -rf "${QUEUE:?}/$name"; sleep "0.$((RANDOM % 9 + 1))"; continue
    fi
    ticket=$name; return 0
  done
}

# Echoes the first live ticket; removes tickets of dead waiters on the way.
queue_head() {
  local t
  for t in $(ticket_list); do
    if pid_alive "$(t_pid "$t")"; then echo "$t"; return; fi
    rm -rf "${QUEUE:?}/$t"
  done
}

if [ "$want_status" = 1 ]; then
  rc=0
  if [ -d "$LOCK" ]; then
    pid=$(read_f pid)
    if [ -n "$pid" ] && ! pid_alive "$pid"; then
      echo "stale ($(holder_line); pid dead, will be cleared by the next waiter)"
    else
      holder_line; echo
      cwd=$(read_f cwd); started=$(read_f started)
      echo "  cwd: ${cwd:-?}  started: ${started:-?}"
    fi
    rc=1
  else
    echo "free"
  fi
  tl=$(ticket_list)
  if [ -n "$tl" ]; then
    echo "queue:"
    i=0
    for t in $tl; do
      tp=$(t_pid "$t"); w=$(( $(now) - $(mtime "$QUEUE/$t") ))
      if pid_alive "$tp"; then i=$((i + 1)); pos="$i."; else pos="stale"; fi
      printf '  %-6s %s (pid %s) waiting %s: %s\n' "$pos" "$(t_owner "$t")" "$tp" "$(fmt_dur "$w")" \
        "$(cat "$QUEUE/$t/cmd" 2>/dev/null)"
    done
  fi
  exit $rc
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

# ---------- release + signal forwarding (installed before queueing) ----------
child=""; watcher=""
release() {
  drop_ticket
  [ -n "$watcher" ] && kill "$watcher" 2>/dev/null
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

# ---------- acquire: queue, then mkdir lock when we are at the head ----------
write_meta() {
  local tmp="$LOCK/.pid.$$"
  printf '%s\n' "$*" >"$LOCK/cmd"
  pwd >"$LOCK/cwd"
  date +%Y-%m-%dT%H:%M:%S%z >"$LOCK/started"
  now >"$LOCK/epoch"
  printf '%s\n' "${KQ_HEAVY_OWNER:-}" >"$LOCK/owner"
  [ -n "$max_hold" ] && printf '%s\n' "$max_hold" >"$LOCK/max_hold"
  echo $$ >"$tmp" && mv "$tmp" "$LOCK/pid"   # pid appears atomically, last
}

cmdline=$(printf '%q ' "$@"); cmdline=${cmdline% }
take_ticket "$cmdline"
waited=0; t0=$(now); last_print=-999; is_tty=0; [ -t 2 ] && is_tty=1
while :; do
  head=$(queue_head)
  if [ "$head" = "$ticket" ] && mkdir "$LOCK" 2>/dev/null; then
    write_meta "$cmdline"
    drop_ticket
    break
  fi
  if [ -z "$head" ] || [ ! -d "$QUEUE/$ticket" ]; then
    # Our ticket vanished (someone cleared the queue dir): draw a new one.
    take_ticket "$cmdline"; continue
  fi
  try_clear_stale && continue
  el=$(( $(now) - t0 ))
  if [ -n "${KQ_HEAVY_TIMEOUT:-}" ] && [ "$el" -ge "$KQ_HEAVY_TIMEOUT" ]; then
    [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
    echo "$ME: gave up after $(fmt_dur "$el") waiting; lock $(holder_line)" >&2
    exit 75
  fi
  pos=$(ticket_list | grep -n -x "$ticket" | cut -d: -f1)
  msg="waiting $(fmt_dur "$el") (queue #${pos:-?}), lock $(holder_line)"
  [ -d "$LOCK" ] || msg="waiting $(fmt_dur "$el") (queue #${pos:-?}), lock free, next is $(t_owner "$head")"
  if [ "$is_tty" = 1 ]; then
    printf '\r\033[K%s: %s' "$ME" "$msg" >&2
  elif [ $(( el - last_print )) -ge 30 ]; then
    echo "$ME: $msg" >&2
    last_print=$el
  fi
  waited=1
  sleep "$POLL"
done
[ "$waited" = 1 ] && [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
[ "$waited" = 1 ] && echo "$ME: acquired lock after $(fmt_dur $(( $(now) - t0 )))" >&2

if [ "$want_load" = 1 ] && ! check_load; then exit 75; fi

# --max-hold: a background watcher prints a warning once the hint is exceeded.
if [ -n "$max_hold" ]; then
  mhs=$(min_to_s "$max_hold")
  ( trap 'kill $sp 2>/dev/null; exit 0' TERM
    sleep "$mhs" & sp=$!; wait "$sp"
    echo "$ME: warning: still holding the lock after ${max_hold} min (--max-hold); others are waiting: $cmdline" >&2
  ) &
  watcher=$!
fi

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
