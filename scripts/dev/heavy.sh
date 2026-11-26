#!/bin/bash
# heavy.sh: machine-wide slots for heavy jobs (Playwright e2e, real-GPU screenshots,
# local TTS/model runs) across all sessions on this Mac. Up to KQ_HEAVY_SLOTS (default 3)
# normal jobs run at once; an --exclusive job takes every slot. Waiters queue FIFO by
# ticket, with a priority lane for the merge gate (KQ_HEAVY_OWNER=kq-integrate[-*]).
# Bash 3.2 compatible (macOS /bin/bash).
# Isolated regression test: bash scripts/dev/heavy.test.sh --stress

set -u

LOCK="${KQ_HEAVY_LOCK:-/tmp/kq-heavy.lock}"  # slot 0; slot k >= 1 is $LOCK.slot<k>
QUEUE="$LOCK.queue"         # FIFO tickets: <seq>-<pid>-<owner> (dirs)
GUARD="$LOCK.guard"         # kernel lock for slot 0, shared with older heavy.sh copies; never unlink it
SGUARD="$LOCK.slots.guard"  # kernel lock serialising slot-aware acquisitions; never unlink it
PRIO_STATE="$LOCK.prio"     # consecutive priority holds while others waited (2:1 rule)
PRIO_MAX_HOLD=15            # priority tickets must pass --max-hold <= this (minutes)
PRIO_RUN=2                  # after this many priority holds in a row, a waiting normal ticket goes next
POLL="${KQ_HEAVY_POLL:-2}"  # seconds between acquire attempts
STALE_AGE="${KQ_HEAVY_STALE_AGE:-30}"  # seconds before a lock without PID metadata is stale
MIN_FREE_PCT="${KQ_HEAVY_MIN_FREE_PCT:-20}"  # --check-load: below this % free memory = high pressure
SLOTS_RAW="${KQ_HEAVY_SLOTS:-3}"  # concurrent normal jobs (minimum 1)
ME="heavy.sh"

usage() {
  cat <<'EOF'
Usage: scripts/dev/heavy.sh [options] [--] <cmd> [args...]
       scripts/dev/heavy.sh --status

Runs <cmd> in one of the machine-wide heavy-job slots, so at most KQ_HEAVY_SLOTS
(default 3) heavy jobs (e2e, GPU screenshots, model runs) run at once on this machine.
Slot 0 is the lock dir /tmp/kq-heavy.lock (the only slot older heavy.sh copies know);
slot k is /tmp/kq-heavy.lock.slot<k>. Waiters line up first come, first served (ticket
queue in /tmp/kq-heavy.lock.queue) and poll every 2 s. The command's exit code is
passed through.

Exclusive lane: --exclusive takes every slot at once, for jobs that need a quiet
machine: the walk / framerate / perf specs, the real-GPU config (playwright.gpu.config.ts),
real-GPU screenshot sets and local model runs (MOSS / TTS). An exclusive ticket waits
until it holds all slots, and tickets queued behind it wait too, so it cannot starve:
  scripts/dev/heavy.sh --exclusive --max-hold 10 -- \
    pnpm exec playwright test -c playwright.gpu.config.ts --workers=1
The real-GPU / fixed-port tools refuse a normal slot (exit 2) and must run exclusive:
scripts/dev/mobile-tour.ts (e2e/mobile/playwright.config.ts, port 5340),
scripts/dev/storyboard.mjs (5370) and scripts/dev/look.mjs (5602). The perf-sensitive
specs (walk "d" perf, framerate, perf, playwright.gpu.config.ts) only warn when they run
in a normal slot while other slots are busy.

Priority lane: owners `kq-integrate` and `kq-integrate-*` (the merge-gate e2e) go
ahead of the FIFO order, but after 2 priority holds in a row the oldest waiting
normal ticket gets the next hold (2:1). A priority ticket must pass --max-hold 15
or less, or heavy.sh refuses (exit 2). Everyone is asked to keep --max-hold <= 15;
for normal tickets a larger value only prints a warning.

Hold a slot for ONE spec file or ONE screenshot set, never a whole multi-spec
batch, so short jobs from other sessions can interleave:
  for s in e2e/a.spec.ts e2e/b.spec.ts; do
    scripts/dev/heavy.sh -- pnpm exec playwright test "$s" --workers=1
  done

Options:
  --exclusive      Take every slot (see above). The same as a normal hold with 1 slot.
  --status         Print every slot's holder (or "free"), the queue (P = priority lane,
                   X = exclusive) and who is next, then exit (0 all free, 1 held).
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
  KQ_HEAVY_SLOTS        Normal jobs that may run at once (default 3, minimum 1; 1 = one
                        heavy job at a time, as before).
  KQ_HEAVY_TIMEOUT      Give up after this many seconds of waiting (exit 75).
  KQ_HEAVY_LOCK         Lock directory path (default /tmp/kq-heavy.lock; tests use this).
  KQ_HEAVY_POLL         Seconds between attempts (default 2).
  KQ_HEAVY_STALE_AGE    Seconds before a lock without PID metadata is stale (default 30).
  KQ_HEAVY_MIN_FREE_PCT Memory threshold for --check-load (default 20).
  KQ_HEAVY_HELD=1       Set for the child; a nested heavy.sh then runs its command directly
                        (no slot, no queue, even with --exclusive).
  KQ_HEAVY_SLOT         Set for the child: its slot (0 for an exclusive job). Without
                        KQ_E2E_PORT, the Playwright configs serve the preview on 5281 + slot,
                        so e2e runs in different slots never share a server; the fixed-port
                        tools above use their base port + slot unless their port env is set
                        (KQ_MOBILE_PORT, KQ_STORYBOARD_PORT, KQ_LOOK_PORT). In slot k >= 1 the
                        Playwright output dirs get a -slot<k> suffix (test-results/artifacts-slot1,
                        test-results/screens-slot1, ...), so two jobs from one checkout never
                        wipe or overwrite each other's files; slot 0 keeps the plain paths.
  KQ_HEAVY_MODE         Set for the child: exclusive or normal (scripts/dev/heavy-env.mjs reads
                        it, plus KQ_HEAVY_LOCK, which is exported to the child too).

Exit codes: the command's own code; 75 = timed out or refused by --strict;
64 = usage error; 2 = priority owner without --max-hold <= 15. Slots with no
surviving holder or child, old locks without PID metadata, and tickets of dead
waiters are cleared automatically.

Isolated stress test: bash scripts/dev/heavy.test.sh --stress
EOF
}

die() { echo "$ME: $*" >&2; exit 64; }

# ---------- options ----------
want_status=0; want_nice=0; want_load=0; want_excl=0; strict=0; max_hold=""
while [ $# -gt 0 ]; do
  case "$1" in
    --status) want_status=1; shift ;;
    --exclusive) want_excl=1; shift ;;
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

case "$SLOTS_RAW" in ''|*[!0-9]*) die "KQ_HEAVY_SLOTS must be a whole number >= 1 (got '$SLOTS_RAW')" ;; esac
SLOTS=$((10#$SLOTS_RAW)); [ "$SLOTS" -ge 1 ] || SLOTS=1
my_mode=S; [ "$want_excl" = 1 ] && my_mode=X

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
rf() { cat "$1/$2" 2>/dev/null; }   # rf <slot dir> <metadata file>
min_to_s() { awk -v m="$1" 'BEGIN { s = m * 60; i = int(s); if (i < s) i++; print i }'; }

# ---------- slots ----------
# Slot 0 is $LOCK, slot k >= 1 is $LOCK.slot<k>; every slot is a dir with the same
# metadata (pid, child_pid, owner, cmd, cwd, epoch, lane, max_hold, started, and
# `mode`: S normal, X exclusive). A holder without `mode` is an older heavy.sh, which
# only knows $LOCK. An exclusive job holds slots 0..SLOTS-1 with one pid.
sdir() { if [ "$1" = 0 ]; then SD=$LOCK; else SD="$LOCK.slot$1"; fi; }

is_stale() {  # is_stale <slot dir>
  local d=$1 pid child_pid stamp
  [ -d "$d" ] || return 1
  pid=$(rf "$d" pid) || [ ! -e "$d/pid" ] || return 1
  pid_alive "$pid" && return 1
  child_pid=$(rf "$d" child_pid) || [ ! -e "$d/child_pid" ] || return 1
  pid_alive "$child_pid" && return 1
  [ -n "$pid$child_pid" ] && return 0
  stamp=$(mtime "$d") || return 1
  [ $(( $(now) - stamp )) -gt "$STALE_AGE" ]
}

# scan_slots: NSCAN = slots to look at (SLOTS, more if a run with a larger KQ_HEAVY_SLOTS
# left higher slot dirs); S_ST[k] = free | held | stale; S_X[k] = 1 if a live exclusive
# job holds slot k.
scan_slots() {
  local d s k m
  NSCAN=$SLOTS
  for d in "$LOCK".slot*; do
    s=${d#"$LOCK".slot}
    case "$s" in ''|0*|*[!0-9]*) continue ;; esac
    [ -d "$d" ] && [ "$s" -ge "$NSCAN" ] && NSCAN=$((s + 1))
  done
  S_ST=(); S_X=()
  for ((k = 0; k < NSCAN; k++)); do
    sdir "$k"; S_X[k]=0
    if [ ! -d "$SD" ]; then S_ST[k]=free
    elif is_stale "$SD"; then S_ST[k]=stale
    else
      S_ST[k]=held; m=""
      [ -f "$SD/mode" ] && read -r m <"$SD/mode"
      [ "$m" = X ] && S_X[k]=1
    fi
  done
}

slot_label() { if [ "$NSCAN" = 1 ]; then echo lock; else echo "lock slot $1"; fi; }

holder_line() {  # holder_line <slot dir>
  local d=$1 pid owner cmd ep el mh mhs extra=""
  pid=$(rf "$d" pid); owner=$(rf "$d" owner); cmd=$(rf "$d" cmd); ep=$(rf "$d" epoch); mh=$(rf "$d" max_hold)
  [ -n "$ep" ] || ep=$(mtime "$d")
  el=0
  if [ -n "$ep" ]; then el=$(( $(now) - ep )); [ "$el" -ge 0 ] || el=0; fi
  if [ -n "$mh" ]; then
    mhs=$(min_to_s "$mh")
    if [ "$el" -gt "$mhs" ]; then extra=" [max-hold ${mh}m EXCEEDED by $(fmt_dur $((el - mhs)))]"
    else extra=" [max-hold ${mh}m]"; fi
  fi
  [ "$(rf "$d" lane)" = P ] && extra=" [priority]$extra"
  [ "$(rf "$d" mode)" = X ] && extra=" [exclusive]$extra"
  [ "${NSCAN:-1}" -gt 1 ] && [ -e "$d/pid" ] && [ ! -e "$d/mode" ] && extra="$extra [old heavy.sh]"
  printf 'held by %s (pid %s) for %s%s: %s' "${owner:-?}" "${pid:-?}" "$(fmt_dur "$el")" "$extra" "${cmd:-?}"
}

# Priority lane: decided from the raw owner label.
is_prio_owner() { case "${KQ_HEAVY_OWNER:-}" in kq-integrate|kq-integrate-*) return 0 ;; esac; return 1; }
my_lane=N; is_prio_owner && my_lane=P
num_gt() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 > b + 0) }'; }

# ---------- queue ----------
# A ticket is a directory $QUEUE/<seq>-<pid>-<owner>, seq zero-padded to 6 digits,
# holding `mode` (S normal, X exclusive), `lane` (P = priority, N = normal), both
# written right after the mkdir, and `cmd`. seq = highest ticket + 1; creating the dir is atomic (mkdir), and a
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
    echo "$my_mode" >"$QUEUE/$name/mode"
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

# load_queue [prune]: the live tickets in seq order: Q_T (name), Q_L (lane: P, N, or ""
# for a pre-priority heavy.sh), Q_M (mode: S, X, or "" for a heavy.sh without slots,
# which can only take slot 0). With prune, tickets of dead waiters are removed.
load_queue() {
  local t r p l m n=0
  Q_T=(); Q_L=(); Q_M=()
  for t in $(ticket_list); do
    r=${t#*-}; p=${r%%-*}
    if ! pid_alive "$p"; then
      [ "${1:-}" = prune ] && rm -rf "${QUEUE:?}/$t"
      continue
    fi
    l=""; m=""
    [ -f "$QUEUE/$t/lane" ] && read -r l <"$QUEUE/$t/lane"
    [ -f "$QUEUE/$t/mode" ] && read -r m <"$QUEUE/$t/mode"
    Q_T[n]=$t; Q_L[n]=$l; Q_M[n]=$m; n=$((n + 1))
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

# service_order: ORDER = indices into Q_* in the order the tickets would be served:
# the single-lock "next ticket" rule above, applied hold by hold (the 2:1 counter
# advanced as record_hold would). Its first entry is what an older heavy.sh with the
# priority lane computes as next.
service_order() {
  local n=${#Q_T[@]} c k i head first_p first_n others pick used=" "
  ORDER=()
  c=$(prio_count)
  for ((k = 0; k < n; k++)); do
    head=""; first_p=""; first_n=""; others=0
    for ((i = 0; i < n; i++)); do
      case "$used" in *" $i "*) continue ;; esac
      [ -n "$head" ] || head=$i
      case "${Q_L[i]:-}" in
        P) [ -n "$first_p" ] || first_p=$i ;;
        N) [ -n "$first_n" ] || first_n=$i; others=1 ;;
        *) others=1 ;;
      esac
    done
    # Old ticket at the head, or no priority ticket waiting: plain FIFO.
    if [ -z "${Q_L[head]:-}" ] || [ -z "$first_p" ]; then pick=$head
    # Fairness turn: the oldest new normal ticket; if only old tickets are waiting
    # (all behind the head), the head, which moves them up.
    elif [ "$others" = 1 ] && [ "$c" -ge "$PRIO_RUN" ]; then pick=${first_n:-$head}
    else pick=$first_p; fi
    case "${Q_L[pick]:-}" in
      P) if [ "$others" = 1 ]; then c=$((c + 1)); else c=0; fi ;;
      N) c=0 ;;
    esac
    ORDER[k]=$pick; used="$used$pick "
  done
}

# ---------- slot assignment ----------
# assign <ticket> <stale_free>: GOT = the slot <ticket> may take now ("all" for an
# exclusive ticket, "" = keep waiting). Walks the tickets in service order and hands
# out the free slots (stale ones count as free when <stale_free> is 1):
# * nobody gets a slot while a live exclusive job holds one;
# * an exclusive ticket gets every slot when it is first in line and every slot is
#   free. Either way nobody behind it gets one (head-of-line rule), so slots that free
#   up wait for it instead of going to later normal tickets;
# * a ticket of an older heavy.sh (no `mode`) can only take slot 0. The first such
#   ticket reserves slot 0, so new tickets behind it never take that slot. It does not
#   block the other slots: those are invisible to the old copy;
# * a new normal ticket takes the lowest free slot >= 1 and slot 0 only when no other
#   is free (slot 0 is the one older copies wait for). When none is left for it, none
#   is left for anyone behind it (FIFO).
# With 1 slot this is the single-lock rule: the next ticket takes the lock when free.
assign() {
  local me=$1 sf=$2 k idx t st free="" rest pick res0=0 first=1 allfree=1
  GOT=""
  for ((k = 0; k < NSCAN; k++)); do
    st=${S_ST[k]}
    case "$st" in
      free) ;;
      stale) [ "$sf" = 1 ] || allfree=0 ;;
      *) allfree=0; [ "${S_X[k]:-0}" = 1 ] && return 0 ;;
    esac
    if [ "$k" -lt "$SLOTS" ] && { [ "$st" = free ] || { [ "$st" = stale ] && [ "$sf" = 1 ]; }; }; then
      [ "$k" = 0 ] || free="$free $k"
    fi
  done
  case "${S_ST[0]}" in free) free="$free 0" ;; stale) [ "$sf" = 1 ] && free="$free 0" ;; esac
  for idx in ${ORDER[@]+"${ORDER[@]}"}; do
    t=${Q_T[idx]}
    case "${Q_M[idx]:-}" in
      X)
        [ "$first" = 1 ] && [ "$allfree" = 1 ] && [ "$t" = "$me" ] && GOT=all
        return 0 ;;
      S)
        pick=""
        for k in $free; do
          if [ "$k" != 0 ] || [ "$res0" = 0 ]; then pick=$k; break; fi
        done
        [ -n "$pick" ] || return 0
        [ "$t" = "$me" ] && { GOT=$pick; return 0; } ;;
      *)
        pick=""
        if [ "$res0" = 0 ]; then
          res0=1
          case " $free " in *" 0 "*) pick=0 ;; esac
        fi ;;
    esac
    first=0
    [ -n "$pick" ] || continue
    rest=""; for k in $free; do [ "$k" = "$pick" ] || rest="$rest $k"; done; free=$rest
  done
}

# Called right after acquiring (we hold the slots guard, so updates by new code are serialised).
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
  # status_holder <slot dir> <prefix> <indent>: the holder line plus cwd/started.
  status_holder() {
    if [ -n "$(rf "$1" pid)" ] && is_stale "$1"; then
      echo "$2stale ($(holder_line "$1"); pid dead, will be cleared by the next waiter)"
    else
      echo "$2$(holder_line "$1")"
      cwd=$(rf "$1" cwd); started=$(rf "$1" started)
      echo "$3  cwd: ${cwd:-?}  started: ${started:-?}"
    fi
  }
  scan_slots
  rc=0
  if [ "$NSCAN" = 1 ]; then
    if [ -d "$LOCK" ]; then status_holder "$LOCK" "" ""; rc=1; else echo "free"; fi
  else
    busy=0
    for ((k = 0; k < NSCAN; k++)); do sdir "$k"; [ -d "$SD" ] && busy=$((busy + 1)); done
    if [ "$busy" -gt 0 ]; then echo "held: $busy of $NSCAN slots busy"; rc=1
    else echo "free: all $NSCAN slots"; fi
    for ((k = 0; k < NSCAN; k++)); do
      sdir "$k"
      if [ -d "$SD" ]; then status_holder "$SD" "slot $k: " "      "
      else echo "slot $k: free"; fi
    done
  fi
  tl=$(ticket_list)
  if [ -n "$tl" ]; then
    echo "queue:"
    i=0
    for t in $tl; do
      tp=$(t_pid "$t"); w=0
      if stamp=$(mtime "$QUEUE/$t"); then w=$(( $(now) - stamp )); fi
      if pid_alive "$tp"; then i=$((i + 1)); pos="$i."; else pos="stale"; fi
      mark=""; [ "$(lane_of "$t")" = P ] && mark=P
      tm=$(cat "$QUEUE/$t/mode" 2>/dev/null)
      [ "$tm" = X ] && mark="${mark}X"
      if [ -n "$mark" ]; then mark="$mark "; else mark="  "; fi
      note=""; [ "$NSCAN" -gt 1 ] && [ -z "$tm" ] && note=" [old heavy.sh: slot 0 only]"
      printf '  %-6s %s%s (pid %s) waiting %s%s: %s\n' "$pos" "$mark" "$(t_owner "$t")" "$tp" "$(fmt_dur "$w")" \
        "$note" "$(cat "$QUEUE/$t/cmd" 2>/dev/null)"
    done
    load_queue; service_order
    if [ -n "${ORDER[0]:-}" ]; then
      nt=${Q_T[ORDER[0]]}; note=""; [ "${Q_M[ORDER[0]]:-}" = X ] && note=" [exclusive]"
      echo "next: $(t_owner "$nt") (pid $(t_pid "$nt"))$note"
    fi
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

# ---------- guards and stale-slot clearing ----------
# Two kernel locks, both taken without waiting:
# * $SGUARD (fd 9) serialises every slot-aware acquisition: stale re-check, the slot
#   choice, mkdir and the 2:1 counter. The winner keeps it until its child has
#   published child_pid, so a wrapper that dies in between cannot leave an untracked
#   live job behind; then it is released, so the other slots stay acquirable.
# * $GUARD (fd 8) is the lock older heavy.sh copies take around clearing and creating
#   $LOCK (they keep it for their whole hold). New code takes it too whenever it
#   clears or creates slot 0, and keeps it through child start the same way; when it
#   is busy, slot 0 counts as busy for that attempt.
# Closing the last descriptor releases a guard automatically, even after SIGKILL.
if command -v lockf >/dev/null 2>&1; then
  guard_cmd=(lockf -s -t 0)
elif command -v flock >/dev/null 2>&1; then
  guard_cmd=(flock -n -E 75)
else
  echo "$ME: lockf or flock is required" >&2
  exit 75
fi

take_guard() {  # take_guard <fd 8|9> <file>
  case "$1" in
    8) exec 8>>"$2" || exit 75 ;;
    9) exec 9>>"$2" || exit 75 ;;
  esac
  "${guard_cmd[@]}" "$1"
  case $? in
    0) return 0 ;;
    75) case "$1" in 8) exec 8>&- ;; 9) exec 9>&- ;; esac; return 1 ;;
    *) echo "$ME: could not lock $2" >&2; exit 75 ;;
  esac
}

try_clear_stale() {  # try_clear_stale <slot>
  local junk
  sdir "$1"
  is_stale "$SD" || return 1
  junk="$SD.stale.$$.$RANDOM"
  mv "$SD" "$junk" 2>/dev/null || return 1
  echo "$ME: cleared stale $(slot_label "$1") (pid $(cat "$junk/pid" 2>/dev/null || echo none): $(cat "$junk/cmd" 2>/dev/null))" >&2
  rm -rf "$junk"
}

# clear_stale <have GUARD>: under $SGUARD, clear every stale slot; slot 0 only with $GUARD.
clear_stale() {
  local k
  for ((k = 0; k < NSCAN; k++)); do
    [ "${S_ST[k]}" = stale ] || continue
    [ "$k" = 0 ] && [ "$1" != 1 ] && continue
    try_clear_stale "$k"
  done
}

# claim <GOT>: mkdir the slot dir(s), all or nothing. OWNED = the slots, slot 0 last;
# it grows with each mkdir, so a signal mid-claim still releases what was made.
OWNED=""
claim() {
  local k list
  if [ "$1" = all ]; then
    list=0; for ((k = 1; k < SLOTS; k++)); do list="$list $k"; done
  else
    list=$1
  fi
  for k in $list; do
    sdir "$k"
    if ! mkdir "$SD" 2>/dev/null; then
      for k in $OWNED; do sdir "$k"; rmdir "$SD" 2>/dev/null; done
      OWNED=""
      return 1
    fi
    OWNED="$k $OWNED"
  done
}

# ---------- release + signal forwarding (installed before queueing) ----------
child=""; watcher=""; starting_child=0; pending_signal=""
release() {
  local k junk
  drop_ticket
  [ -n "$watcher" ] && kill "$watcher" 2>/dev/null
  for k in $OWNED; do   # slot 0 last: older copies wait only for $LOCK
    sdir "$k"
    if [ "$(rf "$SD" pid)" = "$$" ] || [ ! -e "$SD/pid" ]; then
      junk="$SD.done.$$.$RANDOM"
      mv "$SD" "$junk" 2>/dev/null && rm -rf "$junk"
    fi
  done
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

# ---------- acquire: queue, then mkdir slot(s) when our turn has a free slot ----------
write_meta() {  # write_meta <slot dir> <cmdline>
  local d=$1 tmp="$1/.pid.$$"
  echo "$my_mode" >"$d/mode"
  printf '%s\n' "$2" >"$d/cmd"
  pwd >"$d/cwd"
  date +%Y-%m-%dT%H:%M:%S%z >"$d/started"
  now >"$d/epoch"
  printf '%s\n' "${KQ_HEAVY_OWNER:-}" >"$d/owner"
  echo "$my_lane" >"$d/lane"
  [ -n "$max_hold" ] && printf '%s\n' "$max_hold" >"$d/max_hold"
  echo $$ >"$tmp" && mv "$tmp" "$d/pid"   # publish the wrapper's PID atomically
}

# One line on the slots for the waiting and timeout messages.
slots_summary() {
  local k busy=0 nt="" note=""
  if [ -n "${ORDER[0]:-}" ]; then
    nt=$(t_owner "${Q_T[ORDER[0]]}"); [ "${Q_M[ORDER[0]]:-}" = X ] && note=" (exclusive)"
  fi
  if [ "$NSCAN" = 1 ]; then
    if [ -d "$LOCK" ]; then echo "lock $(holder_line "$LOCK")"; else echo "lock free, next is ${nt:-?}$note"; fi
    return
  fi
  for ((k = 0; k < NSCAN; k++)); do sdir "$k"; [ -d "$SD" ] && busy=$((busy + 1)); done
  echo "$busy of $NSCAN slots busy, next is ${nt:-?}$note"
}

cmdline=$(printf '%q ' "$@"); cmdline=${cmdline% }
take_ticket "$cmdline"
waited=0; t0=$(now); last_print=-999; is_tty=0; [ -t 2 ] && is_tty=1
while :; do
  load_queue prune
  if [ "${#Q_T[@]}" = 0 ] || [ ! -d "$QUEUE/$ticket" ]; then
    # Our ticket vanished (someone cleared the queue dir): draw a new one.
    take_ticket "$cmdline"; continue
  fi
  service_order; scan_slots
  stale_any=0
  for ((k = 0; k < NSCAN; k++)); do [ "${S_ST[k]}" = stale ] && stale_any=1; done
  assign "$ticket" 1
  if { [ -n "$GOT" ] || [ "$stale_any" = 1 ]; } && take_guard 9 "$SGUARD"; then
    have0=0
    if [ "${S_ST[0]}" = stale ] || [ "$GOT" = 0 ] || [ "$GOT" = all ]; then
      take_guard 8 "$GUARD" && have0=1
    fi
    clear_stale "$have0"
    # Decide again from the current state; we hold $SGUARD, so only holders releasing
    # and older copies (slot 0 only) can still change it.
    load_queue; service_order; scan_slots
    if [ "$have0" = 0 ] && [ "${S_ST[0]}" = free ]; then
      assign "$ticket" 0
      case "$GOT" in 0|all) take_guard 8 "$GUARD" && have0=1 ;; esac
      [ "$have0" = 1 ] || S_ST[0]=busy
    fi
    assign "$ticket" 0
    if [ -n "$GOT" ] && claim "$GOT"; then
      for k in $OWNED; do sdir "$k"; write_meta "$SD" "$cmdline" || exit 75; done
      record_hold
      drop_ticket
      case " $OWNED " in *" 0 "*) ;; *) exec 8>&- ;; esac
      break
    fi
    exec 8>&- 9>&-
  fi
  el=$(( $(now) - t0 ))
  if [ -n "${KQ_HEAVY_TIMEOUT:-}" ] && [ "$el" -ge "$KQ_HEAVY_TIMEOUT" ]; then
    [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
    echo "$ME: gave up after $(fmt_dur "$el") waiting; $(slots_summary)" >&2
    exit 75
  fi
  pos="?"
  for ((k = 0; k < ${#Q_T[@]}; k++)); do [ "${Q_T[k]}" = "$ticket" ] && pos=$((k + 1)); done
  note=""; [ "$my_mode" = X ] && [ "$SLOTS" -gt 1 ] && note=", exclusive: needs all $SLOTS slots"
  msg="waiting $(fmt_dur "$el") (queue #$pos$note), $(slots_summary)"
  if [ "$is_tty" = 1 ]; then
    printf '\r\033[K%s: %s' "$ME" "$msg" >&2
  elif [ $(( el - last_print )) -ge 30 ]; then
    echo "$ME: $msg" >&2
    last_print=$el
  fi
  waited=1
  sleep "$POLL"
done
if [ "$waited" = 1 ]; then
  [ "$is_tty" = 1 ] && printf '\r\033[K' >&2
  if [ "$NSCAN" = 1 ]; then got_what="lock"
  elif [ "$GOT" = all ]; then got_what="all $SLOTS slots (exclusive)"
  else got_what="slot $GOT"; fi
  echo "$ME: acquired $got_what after $(fmt_dur $(( $(now) - t0 )))" >&2
fi

if [ "$want_load" = 1 ] && ! check_load; then exit 75; fi

# --max-hold: a background watcher prints a warning once the hint is exceeded.
if [ -n "$max_hold" ]; then
  mhs=$(min_to_s "$max_hold")
  ( exec 8>&- 9>&-
    trap 'kill $sp 2>/dev/null; exit 0' TERM
    sleep "$mhs" & sp=$!; wait "$sp"
    echo "$ME: warning: still holding the lock after ${max_hold} min (--max-hold); others are waiting: $cmdline" >&2
  ) &
  watcher=$!
fi

export KQ_HEAVY_HELD=1
if [ "$GOT" = all ]; then KQ_HEAVY_SLOT=0; else KQ_HEAVY_SLOT=$GOT; fi
if [ "$my_mode" = X ]; then KQ_HEAVY_MODE=exclusive; else KQ_HEAVY_MODE=normal; fi
KQ_HEAVY_LOCK=$LOCK   # so the child can see which other slots are busy (scripts/dev/heavy-env.mjs)
export KQ_HEAVY_SLOT KQ_HEAVY_MODE KQ_HEAVY_LOCK
dirs=()
for k in $OWNED; do sdir "$k"; dirs=(${dirs[@]+"${dirs[@]}"} "$SD"); done
set -m   # job control: the child gets its own process group and default SIGINT handling
starting_child=1
# Publish the child's real PID in every slot it holds before running the command.
# Until publication it inherits the guards, so a dying wrapper cannot leave an
# untracked live job; the wrapper closes its own copies right after the fork.
/bin/bash -c '
  n=$1; shift
  while [ "$n" -gt 0 ]; do
    tmp="$1/.child_pid.$$"
    printf "%s\n" "$$" >"$tmp" && mv "$tmp" "$1/child_pid" || exit 75
    shift; n=$((n - 1))
  done
  exec 8>&- 9>&-
  case "$(type -t -- "$1")" in
    builtin|function) "$@" ;;
    *) exec -- "$@" ;;
  esac
' "$ME" "${#dirs[@]}" "${dirs[@]}" ${prefix[@]+"${prefix[@]}"} "$@" &
child=$!
exec 8>&- 9>&-
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
