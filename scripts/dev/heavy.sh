#!/bin/bash
# heavy.sh: machine-wide lock so only one heavy job (Playwright e2e, real-GPU
# screenshots, local TTS/model runs) runs at a time across all sessions on this Mac.
# Waiters queue FIFO by ticket, with a priority lane for the merge gate
# (KQ_HEAVY_OWNER=kq-integrate[-*]). Bash 3.2 compatible (macOS /bin/bash).
# Isolated regression test: bash scripts/dev/heavy.test.sh --stress

set -u

LOCK="${KQ_HEAVY_LOCK:-/tmp/kq-heavy.lock}"
QUEUE="$LOCK.queue"         # FIFO tickets: <seq>-<pid>-<owner> (dirs)
GUARD="$LOCK.guard"         # stable file for the kernel lock; never unlink it
PRIO_STATE="$LOCK.prio"     # consecutive priority holds while others waited (2:1 rule)
PRIO_MAX_HOLD=15            # priority tickets must pass --max-hold <= this (minutes)
PRIO_RUN=2                  # after this many priority holds in a row, a waiting normal ticket goes next
POLL="${KQ_HEAVY_POLL:-2}"  # seconds between acquire attempts
STALE_AGE="${KQ_HEAVY_STALE_AGE:-30}"  # seconds before a lock without PID metadata is stale
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

Priority lane: owners `kq-integrate` and `kq-integrate-*` (the merge-gate e2e) go
ahead of the FIFO order, but after 2 priority holds in a row the oldest waiting
normal ticket gets the next hold (2:1). A priority ticket must pass --max-hold 15
or less, or heavy.sh refuses (exit 2). Everyone is asked to keep --max-hold <= 15;
for normal tickets a larger value only prints a warning.

Hold the lock for ONE spec file or ONE screenshot set, never a whole multi-spec
batch, so short jobs from other sessions can interleave:
  for s in e2e/a.spec.ts e2e/b.spec.ts; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "$s" --workers=1
  done

Options:
  --status         Print the holder (or "free"), the queue (P = priority lane) and who is
                   next, then exit (0 free, 1 held).
  --max-hold <min> Expected hold time in minutes (hint, not enforced). Shown in --status;
                   a warning goes to stderr when it is exceeded. Required (<= 15) for
                   priority owners; above 15 warns for everyone else.
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
  KQ_HEAVY_POLL         Seconds between attempts (default 2).
  KQ_HEAVY_STALE_AGE    Seconds before a lock without PID metadata is stale (default 30).
  KQ_HEAVY_MIN_FREE_PCT Memory threshold for --check-load (default 20).
  KQ_HEAVY_HELD=1       Set for the child; a nested heavy.sh then runs its command directly
                        (no lock, no queue).

Exit codes: the command's own code; 75 = timed out or refused by --strict;
64 = usage error; 2 = priority owner without --max-hold <= 15. Locks with no
surviving holder or child, old locks without PID metadata, and tickets of dead
waiters are cleared automatically.

Isolated stress test: bash scripts/dev/heavy.test.sh --stress
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
mtime() {
  local stamp
  stamp=$(stat -f %m "$1" 2>/dev/null) || stamp=$(stat -c %Y "$1" 2>/dev/null) || return 1
  case "$stamp" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$stamp"
}
fmt_dur() { local s=$1; if [ "$s" -ge 3600 ]; then printf '%dh%02dm' $((s/3600)) $((s%3600/60));
  elif [ "$s" -ge 60 ]; then printf '%dm%02ds' $((s/60)) $((s%60)); else printf '%ds' "$s"; fi; }
pid_alive() {
  local err
  case "$1" in ''|0*|*[!0-9]*) return 1 ;; esac
  kill -0 "$1" 2>/dev/null && return 0
  # Sandboxed peers can get EPERM for live PIDs and may be unable to run ps.
  # Only ESRCH (the C-locale diagnostic from Bash's kill) proves absence.
  err=$(LC_ALL=C kill -0 "$1" 2>&1) && return 0
  case "$err" in *' - No such process') return 1 ;; esac
  return 0
}
read_f() { cat "$LOCK/$1" 2>/dev/null; }
min_to_s() { awk -v m="$1" 'BEGIN { s = m * 60; i = int(s); if (i < s) i++; print i }'; }

is_stale() {
  [ -d "$LOCK" ] || return 1
  local pid child_pid stamp
  pid=$(read_f pid) || [ ! -e "$LOCK/pid" ] || return 1
  pid_alive "$pid" && return 1
  child_pid=$(read_f child_pid) || [ ! -e "$LOCK/child_pid" ] || return 1
  pid_alive "$child_pid" && return 1
  [ -n "$pid$child_pid" ] && return 0
  stamp=$(mtime "$LOCK") || return 1
  [ $(( $(now) - stamp )) -gt "$STALE_AGE" ]
}

holder_line() {
  local pid owner cmd ep el mh mhs extra=""
  pid=$(read_f pid); owner=$(read_f owner); cmd=$(read_f cmd); ep=$(read_f epoch); mh=$(read_f max_hold)
  [ -n "$ep" ] || ep=$(mtime "$LOCK")
  el=0
  if [ -n "$ep" ]; then el=$(( $(now) - ep )); [ "$el" -ge 0 ] || el=0; fi
  if [ -n "$mh" ]; then
    mhs=$(min_to_s "$mh")
    if [ "$el" -gt "$mhs" ]; then extra=" [max-hold ${mh}m EXCEEDED by $(fmt_dur $((el - mhs)))]"
    else extra=" [max-hold ${mh}m]"; fi
  fi
  [ "$(read_f lane)" = P ] && extra=" [priority]$extra"
  printf 'held by %s (pid %s) for %s%s: %s' "${owner:-?}" "${pid:-?}" "$(fmt_dur "$el")" "$extra" "${cmd:-?}"
}

# Priority lane: decided from the raw owner label.
is_prio_owner() { case "${KQ_HEAVY_OWNER:-}" in kq-integrate|kq-integrate-*) return 0 ;; esac; return 1; }
my_lane=N; is_prio_owner && my_lane=P
num_gt() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 > b + 0) }'; }

# ---------- queue ----------
# A ticket is a directory $QUEUE/<seq>-<pid>-<owner>, seq zero-padded to 6 digits,
# holding `lane` (P = priority, N = normal; written right after the mkdir) and `cmd`. seq = highest ticket + 1; creating the dir is atomic (mkdir), and a
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
    echo "$my_lane" >"$QUEUE/$name/lane"
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

# ---------- who goes next: priority lane + 2:1 anti-starvation ----------
# Lane of a ticket: P, N, or "" for a ticket drawn by an OLD heavy.sh (before the
# priority lane: no `lane` file).
#
# Old and new heavy.sh share one queue and one lock. How they interact:
# * An old waiter takes the lock only when its ticket is the FIFO head (lowest live
#   seq) and the lock dir is free; it knows nothing about lanes.
# * New code therefore never hands the lock to an old ticket unless that ticket is
#   the FIFO head, and when the FIFO head IS an old ticket, new code yields to it
#   (next = head). So old and new waiters never both think they are next: no mkdir
#   race between them, and no deadlock (if new code picked an old ticket behind the
#   head, the old one would wait for the head while the head waited for it).
# * An old ticket keeps its FIFO place: it is served as soon as everything drawn
#   before it is served. Priority tickets may overtake it while it is not the head,
#   but the 2:1 rule still serves the oldest new normal ticket (or, if there is none,
#   the head) after every 2 priority holds, so the queue in front of it keeps
#   shrinking and it cannot starve. An old ticket from a kq-integrate owner gets no
#   priority (it is served in FIFO order); for the 2:1 count it is a normal ticket.
# * Old holders do not update the 2:1 counter; the next new holder does.
# A brand-new ticket whose `lane` file is not written yet looks old for a few ms; it
# has the highest seq, so it is only picked when it is also the head (correct anyway).
lane_of() { cat "$QUEUE/$1/lane" 2>/dev/null; }
prio_count() { local c; c=$(cat "$PRIO_STATE" 2>/dev/null); case "$c" in ''|*[!0-9]*) c=0 ;; esac; echo "$c"; }

# Echoes the ticket that gets the lock next (empty if the queue is empty).
next_ticket() {
  local t head="" first_p="" first_n="" others=0
  for t in $(ticket_list); do
    pid_alive "$(t_pid "$t")" || continue
    [ -n "$head" ] || head=$t
    case "$(lane_of "$t")" in
      P) [ -n "$first_p" ] || first_p=$t ;;
      N) [ -n "$first_n" ] || first_n=$t; others=1 ;;
      *) others=1 ;;
    esac
  done
  [ -n "$head" ] || return 0
  # Old ticket at the head, or no priority ticket waiting: plain FIFO.
  if [ -z "$(lane_of "$head")" ] || [ -z "$first_p" ]; then echo "$head"; return; fi
  if [ "$others" = 1 ] && [ "$(prio_count)" -ge "$PRIO_RUN" ]; then
    # Fairness turn: the oldest new normal ticket; if only old tickets are waiting
    # (all behind the head), the head, which moves them up.
    echo "${first_n:-$head}"; return
  fi
  echo "$first_p"
}

# Called right after acquiring (we hold the lock, so updates are serialised).
record_hold() {
  local t c=0 others=0 tmp="$PRIO_STATE.$$"
  if [ "$my_lane" = P ]; then
    for t in $(ticket_list); do
      [ "$t" = "$ticket" ] && continue
      pid_alive "$(t_pid "$t")" || continue
      [ "$(lane_of "$t")" = P ] || { others=1; break; }
    done
    [ "$others" = 1 ] && c=$(( $(prio_count) + 1 ))
  fi
  echo "$c" >"$tmp" && mv "$tmp" "$PRIO_STATE"
}

if [ "$want_status" = 1 ]; then
  rc=0
  if [ -d "$LOCK" ]; then
    pid=$(read_f pid)
    if [ -n "$pid" ] && is_stale; then
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
      tp=$(t_pid "$t"); w=0
      if stamp=$(mtime "$QUEUE/$t"); then w=$(( $(now) - stamp )); fi
      if pid_alive "$tp"; then i=$((i + 1)); pos="$i."; else pos="stale"; fi
      if [ "$(lane_of "$t")" = P ]; then mark="P "; else mark="  "; fi
      printf '  %-6s %s%s (pid %s) waiting %s: %s\n' "$pos" "$mark" "$(t_owner "$t")" "$tp" "$(fmt_dur "$w")" \
        "$(cat "$QUEUE/$t/cmd" 2>/dev/null)"
    done
    nt=$(next_ticket)
    [ -n "$nt" ] && echo "next: $(t_owner "$nt") (pid $(t_pid "$nt"))"
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

# ---------- max-hold cap ----------
if [ "$my_lane" = P ]; then
  if [ -z "$max_hold" ] || num_gt "$max_hold" "$PRIO_MAX_HOLD"; then
    echo "$ME: refusing: owner '${KQ_HEAVY_OWNER}' uses the priority lane, which needs --max-hold <= ${PRIO_MAX_HOLD} (got ${max_hold:-none}). Split the job (one spec per hold) and pass e.g. --max-hold ${PRIO_MAX_HOLD}." >&2
    exit 2
  fi
elif [ -n "$max_hold" ] && num_gt "$max_hold" "$PRIO_MAX_HOLD"; then
  echo "$ME: warning: --max-hold ${max_hold} is above the agreed ${PRIO_MAX_HOLD} min; hold the lock for one spec or one screenshot set at a time" >&2
fi

# ---------- guard and stale-lock clearing ----------
# Hold the same kernel lock from stale re-check and mkdir through release.
# Closing the last descriptor releases it automatically, even after SIGKILL.
if command -v lockf >/dev/null 2>&1; then
  guard_cmd=(lockf -s -t 0)
elif command -v flock >/dev/null 2>&1; then
  guard_cmd=(flock -n -E 75)
else
  echo "$ME: lockf or flock is required" >&2
  exit 75
fi

take_guard() {
  exec 9>>"$GUARD" || exit 75
  "${guard_cmd[@]}" 9
  case $? in
    0) return 0 ;;
    75) exec 9>&-; return 1 ;;
    *) echo "$ME: could not lock $GUARD" >&2; exit 75 ;;
  esac
}

try_clear_stale() {
  is_stale || return 1
  local junk="$LOCK.stale.$$.$RANDOM"
  mv "$LOCK" "$junk" 2>/dev/null || return 1
  echo "$ME: cleared stale lock (pid $(cat "$junk/pid" 2>/dev/null || echo none): $(cat "$junk/cmd" 2>/dev/null))" >&2
  rm -rf "$junk"
}

# ---------- release + signal forwarding (installed before queueing) ----------
child=""; watcher=""; owns_lock=0; starting_child=0; pending_signal=""
release() {
  drop_ticket
  [ -n "$watcher" ] && kill "$watcher" 2>/dev/null
  if [ "$owns_lock" = 1 ] && { [ "$(read_f pid)" = "$$" ] || [ ! -e "$LOCK/pid" ]; }; then
    local junk="$LOCK.done.$$.$RANDOM"
    mv "$LOCK" "$junk" 2>/dev/null && rm -rf "$junk"
  fi
}
forward() {  # $1 = signal name
  if [ "$starting_child" = 1 ]; then pending_signal=$1; return; fi
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
  echo "$my_lane" >"$LOCK/lane"
  [ -n "$max_hold" ] && printf '%s\n' "$max_hold" >"$LOCK/max_hold"
  echo $$ >"$tmp" && mv "$tmp" "$LOCK/pid"   # publish the wrapper's PID atomically
}

cmdline=$(printf '%q ' "$@"); cmdline=${cmdline% }
take_ticket "$cmdline"
waited=0; t0=$(now); last_print=-999; is_tty=0; [ -t 2 ] && is_tty=1
while :; do
  head=$(queue_head)
  nxt=$(next_ticket)
  if [ -z "$head" ] || [ ! -d "$QUEUE/$ticket" ]; then
    # Our ticket vanished (someone cleared the queue dir): draw a new one.
    take_ticket "$cmdline"; continue
  fi
  if { [ "$nxt" = "$ticket" ] || is_stale; } && take_guard; then
    try_clear_stale
    if [ "$(next_ticket)" = "$ticket" ] && mkdir "$LOCK" 2>/dev/null; then
      owns_lock=1
      write_meta "$cmdline" || exit 75
      record_hold
      drop_ticket
      break
    fi
    exec 9>&-
  fi
  el=$(( $(now) - t0 ))
  if [ -n "${KQ_HEAVY_TIMEOUT:-}" ] && [ "$el" -ge "$KQ_HEAVY_TIMEOUT" ]; then
    [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
    echo "$ME: gave up after $(fmt_dur "$el") waiting; lock $(holder_line)" >&2
    exit 75
  fi
  pos=$(ticket_list | grep -n -x "$ticket" | cut -d: -f1)
  msg="waiting $(fmt_dur "$el") (queue #${pos:-?}), lock $(holder_line)"
  [ -d "$LOCK" ] || msg="waiting $(fmt_dur "$el") (queue #${pos:-?}), lock free, next is $(t_owner "${nxt:-$head}")"
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
  ( exec 9>&-
    trap 'kill $sp 2>/dev/null; exit 0' TERM
    sleep "$mhs" & sp=$!; wait "$sp"
    echo "$ME: warning: still holding the lock after ${max_hold} min (--max-hold); others are waiting: $cmdline" >&2
  ) &
  watcher=$!
fi

export KQ_HEAVY_HELD=1
set -m   # job control: the child gets its own process group and default SIGINT handling
starting_child=1
# Publish the child's real PID before running the command. Until publication it
# inherits the guard, so a dying wrapper cannot leave an untracked live job.
/bin/bash -c '
  lock=$1; shift
  tmp="$lock/.child_pid.$$"
  printf "%s\n" "$$" >"$tmp" && mv "$tmp" "$lock/child_pid" || exit 75
  exec 9>&-
  case "$(type -t -- "$1")" in
    builtin|function) "$@" ;;
    *) exec -- "$@" ;;
  esac
' "$ME" "$LOCK" ${prefix[@]+"${prefix[@]}"} "$@" &
child=$!
starting_child=0
[ -z "$pending_signal" ] || forward "$pending_signal"
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
