#!/bin/bash
# Tests for scripts/dev/heavy.sh. Run: bash scripts/dev/heavy.test.sh [--stress].
# Uses a private lock path (KQ_HEAVY_LOCK) in a temp dir, so it never touches
# /tmp/kq-heavy.lock (or its slots) and is safe while real heavy jobs hold the real lock.
# Sections 1-15 run with KQ_HEAVY_SLOTS=1 (the single-lock behaviour); 16-25 with 3 slots.

set -u
HEAVY="$(cd "$(dirname "$0")" && pwd)/heavy.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/kq-heavy-test.XXXXXX")
export KQ_HEAVY_LOCK="$T/lock"
unset KQ_HEAVY_HELD KQ_HEAVY_TIMEOUT KQ_HEAVY_OWNER KQ_HEAVY_SLOTS KQ_HEAVY_POLL KQ_HEAVY_STALE_AGE
# Existence checks only: the real lock may be held by live jobs right now.
real_before=""
for f in /tmp/kq-heavy.lock /tmp/kq-heavy.lock.slot1 /tmp/kq-heavy.lock.slot2 /tmp/kq-heavy.lock.slots.guard; do
  [ -e "$f" ] || real_before="$real_before $f"
done
bgpids=""
L=$KQ_HEAVY_LOCK

# Reproduce restricted visibility across agent sessions: kill -0 $STRESS_HOLDER reports
# EPERM (even for a dead pid), ps is unavailable. All other PID probes are real.
shim="$T/sandbox.bash"
cat >"$shim" <<'EOF'
kill() {
  if [ "$#" = 2 ] && [ "$1" = -0 ] && [ "$2" = "$STRESS_HOLDER" ]; then
    printf 'kill: (%s) - Operation not permitted\n' "$2" >&2
    return 1
  fi
  builtin kill "$@"
}
ps() { return 126; }
sleep() {
  if [ -n "${STRESS_READY:-}" ] && [ "$1" = "$KQ_HEAVY_POLL" ]; then : >"$STRESS_READY"; fi
  command sleep "$@"
}
EOF

cleanup() {
  for p in $bgpids; do kill "$p" 2>/dev/null; done
  rm -rf "$T"
}
trap cleanup EXIT

pass=0; fail=0
ok()  { echo "ok   $*"; pass=$((pass + 1)); }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }
check() { local name=$1; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
no_lock() { [ ! -e "$KQ_HEAVY_LOCK" ]; }
wait_for_lock() { local i=0; while [ ! -f "$KQ_HEAVY_LOCK/pid" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done; }
dead_pid() { sh -c 'echo $$' ; }   # a pid that has already exited

wait_for_file() {
  local i=0
  until [ -f "$1" ]; do
    [ "$i" -lt 100 ] || return 1
    sleep 0.02
    i=$((i + 1))
  done
}

stress() {
  local log="$T/stress.log" gate="$T/stress.gate"
  local holder p i pids="" failures=0 order status stress_job ready
  # The restricted-visibility shim applies to the contenders, even when the test's
  # wrapper processes actually share a sandbox.
  export KQ_HEAVY_SLOTS=1 KQ_HEAVY_STALE_AGE=1 KQ_HEAVY_POLL=0.05 KQ_HEAVY_TIMEOUT=15
  stress_job='
    printf "S\n" >>"$1"
    [ "${KQ_HEAVY_HELD:-}" = 1 ] || exit 1
    [ -z "$2" ] || : >"$2"
    sleep 1.25
    if [ -n "$3" ]; then
      while [ ! -f "$3" ]; do sleep 0.02; done
    fi
    printf "E\n" >>"$1"
  '
  "$HEAVY" -- /bin/sh -c "$stress_job" stress "$log" "$T/stress.started" "$gate" 2>"$T/stress-holder.err" &
  holder=$!; bgpids="$bgpids $holder"
  # Keep the first child alive until the first contender is polling or has
  # incorrectly started. The overlap assertion does not depend on launch speed.
  check "stress: first child started" wait_for_file "$T/stress.started"
  status=$(BASH_ENV="$shim" STRESS_HOLDER="$holder" "$HEAVY" --status)
  check "stress: restricted PID is reported as held" test "${status%% *}" = held
  for i in 1 2 3; do
    ready="$T/stress-$i.ready"
    BASH_ENV="$shim" STRESS_HOLDER="$holder" STRESS_READY="$ready" \
      "$HEAVY" -- /bin/sh -c "$stress_job" stress "$log" "$ready" "" 2>"$T/stress-$i.err" &
    pids="$pids $!"
    if [ "$i" = 1 ]; then check "stress: contender reached the lock" wait_for_file "$ready"; fi
  done
  bgpids="$bgpids $pids"
  : >"$gate"
  for p in "$holder" $pids; do wait "$p" || failures=$((failures + 1)); done
  order=$(tr -d '\n' <"$log")
  check "stress: 4 children finished with KQ_HEAVY_HELD=1" test "$failures" = 0
  check "stress: at most one child running ($order)" test "$order" = SESESESE
  check "stress: lock released" no_lock
  unset KQ_HEAVY_STALE_AGE KQ_HEAVY_POLL KQ_HEAVY_TIMEOUT
}

orphaned_child() {
  local wrapper child rc status
  export KQ_HEAVY_SLOTS=1
  "$HEAVY" -- /bin/sh -c '
    echo $$ >"$1"
    while [ ! -f "$2" ]; do sleep 0.02; done
    : >"$3"
  ' orphan "$T/orphan.started" "$T/orphan.gate" "$T/orphan.done" &
  wrapper=$!; bgpids="$bgpids $wrapper"
  check "orphan: child started" wait_for_file "$T/orphan.started"
  child=$(cat "$T/orphan.started")
  if [ -z "$child" ]; then return; fi
  bgpids="$bgpids $child"
  kill -KILL "$wrapper"
  wait "$wrapper" 2>/dev/null
  status=$("$HEAVY" --status)
  check "orphan: status is held while the child lives" test "${status%% *}" = held
  KQ_HEAVY_TIMEOUT=0 "$HEAVY" true 2>"$T/orphan-wait.err"; rc=$?
  check "orphan: contender times out while the child lives (rc=$rc)" test "$rc" = 75
  : >"$T/orphan.gate"
  check "orphan: child finished" wait_for_file "$T/orphan.done"
  KQ_HEAVY_POLL=0.05 KQ_HEAVY_TIMEOUT=3 "$HEAVY" true 2>"$T/orphan-recover.err"; rc=$?
  check "orphan: next job recovers the lock after the child exits (rc=$rc)" test "$rc" = 0
  check "orphan: lock released" no_lock
}

slot_dirs() { ls -d "$KQ_HEAVY_LOCK" "$KQ_HEAVY_LOCK".slot[0-9]* 2>/dev/null; }
no_slots() { [ -z "$(slot_dirs)" ]; }
# Jobs log "S"/"XS" when they start and "E"/"XE" before they end (an exclusive job: X).
max_running() { awk '$1 == "S" || $1 == "XS" { n++; if (n > m) m = n } $1 == "E" || $1 == "XE" { n-- } END { print m + 0 }' "$1"; }
# Fails if anything else runs while an exclusive job runs.
alone_exclusive() {
  awk '$1 == "XS" { if (n) bad = 1; x = 1 } $1 == "S" { if (x) bad = 1; n++ } $1 == "E" { n-- } $1 == "XE" { x = 0 }
       END { exit bad }' "$1"
}

starts() { grep -c '^S$' "$1"; }
wait_starts() {  # wait_starts <log> <n>: until n normal jobs have started (10 s at most)
  local i=0
  until [ "$(starts "$1")" -ge "$2" ]; do [ "$i" -lt 200 ] || return 1; sleep 0.05; i=$((i + 1)); done
}

# 3 slots: a holder visible to the others only as EPERM, 4 normal jobs racing for the
# other 2 slots, then an exclusive job and 4 more normal jobs queued behind it. Normal
# jobs block on a gate once started, so exactly 3 run until it opens.
slot_stress() {
  local log="$T/sstress.log" gate="$T/sstress.gate" job holder p i pids="" failures=0 m after
  export KQ_HEAVY_SLOTS=3 KQ_HEAVY_STALE_AGE=1 KQ_HEAVY_POLL=0.05 KQ_HEAVY_TIMEOUT=40
  : >"$log"
  # sh -c "$job" s <start mark> <log> <seconds> <gate or ""> <end mark> <started file or "">
  job='[ -z "$6" ] || : >"$6"
    printf "%s\n" "$1" >>"$2"
    [ "${KQ_HEAVY_HELD:-}" = 1 ] || exit 1
    if [ -n "$4" ]; then while [ ! -f "$4" ]; do sleep 0.02; done; fi
    sleep "$3"; printf "%s\n" "$5" >>"$2"'
  sjob() {  # sjob [heavy.sh options] -- <job args>; STRESS_READY marks its first poll
    BASH_ENV="$shim" STRESS_HOLDER="$holder" "$HEAVY" "$@" 2>>"$T/sstress.err" &
    pids="$pids $!"; bgpids="$bgpids $!"
  }
  polling() {  # polling <ready file>: the waiter holds its final ticket and polls (10 s at most)
    local n=0
    until [ -f "$1" ]; do [ "$n" -lt 200 ] || return 1; sleep 0.05; n=$((n + 1)); done
  }
  "$HEAVY" -- /bin/sh -c "$job" s S "$log" 0.1 "$gate" E "" 2>"$T/sstress-holder.err" &
  holder=$!; bgpids="$bgpids $holder"
  check "slot stress: holder started" wait_starts "$log" 1
  for i in 1 2 3 4; do
    STRESS_READY="$T/ss-ready-$i" sjob -- /bin/sh -c "$job" s S "$log" 0.1 "$gate" E "$T/ss-started-$i"
  done
  check "slot stress: 2 racing jobs started beside the EPERM holder" wait_starts "$log" 3
  check "slot stress: EPERM holder reported in its slot" sh -c "BASH_ENV='$shim' STRESS_HOLDER=$holder '$HEAVY' --status | grep -q '^slot 1: held by .*(pid $holder)'"
  # Arrivals at the same instant re-draw clashing tickets after a random pause: wait until
  # the 2 racers without a slot poll with their final tickets, so the exclusive one is later.
  m=0
  for i in 1 2 3 4; do [ -f "$T/ss-started-$i" ] || { polling "$T/ss-ready-$i" && m=$((m + 1)); }; done
  check "slot stress: the other 2 racers are queued ($m)" test "$m" = 2
  KQ_HEAVY_OWNER=sx STRESS_READY="$T/ss-ready-x" sjob --exclusive -- /bin/sh -c "$job" s XS "$log" 0.2 "" XE ""
  check "slot stress: exclusive job queued" polling "$T/ss-ready-x"
  for i in 5 6 7 8; do sjob -- /bin/sh -c "$job" s S "$log" 0.1 "$gate" E ""; done
  sleep 0.6
  check "slot stress: no 4th job while 3 slots are busy ($(starts "$log") started)" test "$(starts "$log")" = 3
  : >"$gate"
  for p in "$holder" $pids; do wait "$p" || failures=$((failures + 1)); done
  m=$(max_running "$log")
  after=$(awk '$1 == "XE" { x = 1 } x && $1 == "S" { n++ } END { print n + 0 }' "$log")
  check "slot stress: 10 jobs finished with KQ_HEAVY_HELD=1" test "$failures" = 0
  check "slot stress: 10 jobs logged a start and an end" test "$(grep -c . "$log")" = 20
  check "slot stress: at most 3 at once (max $m)" test "$m" = 3
  check "slot stress: the exclusive job ran alone ($(tr '\n' ' ' <"$log"))" alone_exclusive "$log"
  check "slot stress: the 4 jobs queued behind it started after it ($after)" test "$after" = 4
  check "slot stress: slots released, queue empty" sh -c "[ -z \"\$(ls -d '$L' '$L'.slot[0-9]* 2>/dev/null)\" ] && [ -z \"\$(ls -A '$L.queue')\" ]"
  unset KQ_HEAVY_STALE_AGE KQ_HEAVY_POLL KQ_HEAVY_TIMEOUT
}

if [ "${1:-}" = --stress ]; then
  stress
  orphaned_child
  slot_stress
  echo "$pass passed, $fail failed"
  [ "$fail" = 0 ]
  exit $?
fi

# Sections 1-15: one slot. KQ_HEAVY_SLOTS=1 must keep the behaviour from before slots.
export KQ_HEAVY_SLOTS=1

# 1. two concurrent `heavy.sh sleep 3` serialise
log="$T/serial.log"
job() { "$HEAVY" -- sh -c "echo S$1 >>'$log'; sleep 3; echo E$1 >>'$log'" 2>/dev/null; }
start=$(date +%s)
job 1 & a=$!; bgpids="$bgpids $a"
sleep 0.3
job 2 & b=$!; bgpids="$bgpids $b"
wait $a; wait $b
took=$(( $(date +%s) - start ))
order=$(tr '\n' ' ' <"$log")
check "serialise: no overlap ($order)" [ "$order" = "S1 E1 S2 E2 " ]
check "serialise: took >= 6 s (${took}s)" [ "$took" -ge 6 ]
check "serialise: lock released" no_lock

# 2a. stale lock with a dead pid is cleared
mkdir "$KQ_HEAVY_LOCK"; dead_pid >"$KQ_HEAVY_LOCK/pid"; echo "ghost job" >"$KQ_HEAVY_LOCK/cmd"
out=$(KQ_HEAVY_TIMEOUT=10 "$HEAVY" echo ran 2>"$T/err"); rc=$?
check "stale dead pid: command ran (rc=$rc)" [ "$rc:$out" = "0:ran" ]
check "stale dead pid: reported" grep -q "cleared stale lock" "$T/err"
check "stale dead pid: lock released" no_lock

# 2b. stale lock without a pid file, older than 30 s
mkdir "$KQ_HEAVY_LOCK"; touch -t "$(date -v-2M +%Y%m%d%H%M.%S)" "$KQ_HEAVY_LOCK"
KQ_HEAVY_TIMEOUT=10 "$HEAVY" true 2>/dev/null; rc=$?
check "stale no-pid old dir: cleared (rc=$rc)" [ "$rc" = 0 ]
check "stale no-pid: lock released" no_lock

# 2c. a fresh lock without a pid file (holder still writing) is NOT cleared
mkdir "$KQ_HEAVY_LOCK"
KQ_HEAVY_TIMEOUT=3 "$HEAVY" true 2>/dev/null; rc=$?
check "fresh no-pid lock respected: timeout 75 (rc=$rc)" [ "$rc" = 75 ]
check "fresh no-pid lock left in place" [ -d "$KQ_HEAVY_LOCK" ]
rm -rf "$KQ_HEAVY_LOCK"

# 2d. several waiters racing to clear one stale lock: still strictly one at a time
mkdir "$KQ_HEAVY_LOCK"; dead_pid >"$KQ_HEAVY_LOCK/pid"
rlog="$T/race.log"; rp=""
for i in 1 2 3 4 5; do
  KQ_HEAVY_TIMEOUT=30 "$HEAVY" -- sh -c "echo S >>'$rlog'; sleep 0.5; echo E >>'$rlog'" 2>/dev/null & rp="$rp $!"
done
bgpids="$bgpids $rp"
for p in $rp; do wait "$p"; done
check "stale race: 5 runs, never overlapping ($(tr -d '\n' <"$rlog"))" [ "$(tr -d '\n' <"$rlog")" = SESESESESE ]
check "stale race: lock released" no_lock

# 3. exit-code passthrough
"$HEAVY" -- sh -c 'exit 42'; rc=$?
check "exit code 42 passed through (rc=$rc)" [ "$rc" = 42 ]
"$HEAVY" false; rc=$?
check "exit code 1 passed through (rc=$rc)" [ "$rc" = 1 ]
check "exit code: lock released" no_lock

# 4. SIGTERM: forwarded to the child, lock released
"$HEAVY" sh -c "echo \$\$ >'$T/child'; exec sleep 60" & w=$!; bgpids="$bgpids $w"
wait_for_lock; sleep 0.3
kill -TERM $w; wait $w; rc=$?
child=$(cat "$T/child")
check "SIGTERM: wrapper exit 143 (rc=$rc)" [ "$rc" = 143 ]
check "SIGTERM: child killed" sh -c "! kill -0 $child 2>/dev/null"
check "SIGTERM: lock released" no_lock

# 5. nesting: the inner heavy.sh runs directly instead of deadlocking
out=$(KQ_HEAVY_TIMEOUT=5 "$HEAVY" -- "$HEAVY" -- sh -c 'echo nested:$KQ_HEAVY_HELD' 2>/dev/null); rc=$?
check "nesting: inner ran (rc=$rc, out=$out)" [ "$rc:$out" = "0:nested:1" ]
check "nesting: lock released" no_lock

# 6. live holder + KQ_HEAVY_TIMEOUT gives up with 75; --status reports holder
mkdir "$KQ_HEAVY_LOCK"; echo $$ >"$KQ_HEAVY_LOCK/pid"; echo "test holder" >"$KQ_HEAVY_LOCK/cmd"; echo tester >"$KQ_HEAVY_LOCK/owner"
st=$("$HEAVY" --status); src=$?
check "status: held (rc=$src)" [ "$src" = 1 ]
check "status: names owner and cmd" sh -c "echo '$st' | grep -q 'tester' && echo '$st' | grep -q 'test holder'"
KQ_HEAVY_TIMEOUT=2 "$HEAVY" true 2>/dev/null; rc=$?
check "timeout: exit 75 (rc=$rc)" [ "$rc" = 75 ]
check "timeout: foreign lock untouched" [ "$(cat "$KQ_HEAVY_LOCK/pid")" = $$ ]
rm -rf "$KQ_HEAVY_LOCK"
check "status: free" [ "$("$HEAVY" --status)" = free ]

# 7. release only if still ours: a lock whose pid was replaced is left alone
"$HEAVY" sh -c "echo 1 >'$KQ_HEAVY_LOCK/pid'" ; rc=$?
check "foreign pid at exit: lock not removed" [ -d "$KQ_HEAVY_LOCK" ]
rm -rf "$KQ_HEAVY_LOCK"

Q="$KQ_HEAVY_LOCK.queue"
no_tickets() { [ -z "$(ls -A "$Q" 2>/dev/null)" ]; }
check "queue: no tickets left after the runs above (timeouts included)" no_tickets

# 8. FIFO: A, B, C queue in that order behind a holder; C polls 10x faster but still goes last
sleep 60 & hp=$!; bgpids="$bgpids $hp"
mkdir "$KQ_HEAVY_LOCK"; echo $hp >"$KQ_HEAVY_LOCK/pid"; echo "blocker" >"$KQ_HEAVY_LOCK/cmd"
flog="$T/fifo.log"; fp=""
fjob() { KQ_HEAVY_OWNER=$1 KQ_HEAVY_POLL=$2 KQ_HEAVY_TIMEOUT=60 "$HEAVY" -- sh -c "echo $1 >>'$flog'; sleep 0.3" 2>/dev/null; }
fjob A 2 & fp="$fp $!"; sleep 0.4
fjob B 2 & fp="$fp $!"; sleep 0.4
fjob C 0.2 & fp="$fp $!"; sleep 0.4
bgpids="$bgpids $fp"
st=$("$HEAVY" --status)
check "status queue: 3 tickets in order A, B, C with cmd" sh -c "printf '%s\n' \"\$1\" | grep -A3 '^queue:' | grep -Eq '^ +3\. +C \(pid [0-9]+\) waiting [0-9]+s: sh -c'" _ "$st"
check "status queue: A is #1, B is #2" sh -c "printf '%s\n' \"\$1\" | grep -Eq '^ +1\. +A ' && printf '%s\n' \"\$1\" | grep -Eq '^ +2\. +B '" _ "$st"
kill $hp; wait $hp 2>/dev/null   # holder dies: lock goes stale; C (fast poller) sees it first
for p in $fp; do wait "$p"; done
check "FIFO: acquired in order A B C ($(tr '\n' ' ' <"$flog"))" [ "$(tr -d '\n' <"$flog")" = ABC ]
check "FIFO: lock released, queue empty" sh -c "[ ! -e '$KQ_HEAVY_LOCK' ] && [ -z \"\$(ls -A '$Q')\" ]"

# 9. stale ticket (dead waiter) is shown as stale and cleared by the next waiter
gt="$Q/000001-$(dead_pid)-ghost"; mkdir -p "$gt"; echo "ghost cmd" >"$gt/cmd"
check "status: dead ticket shown as stale" sh -c "'$HEAVY' --status | grep -Eq '^ +stale +ghost .*ghost cmd'"
KQ_HEAVY_TIMEOUT=5 "$HEAVY" true 2>/dev/null; rc=$?
check "stale ticket: not blocking (rc=$rc)" [ "$rc" = 0 ]
check "stale ticket: removed" no_tickets

# 10. --max-hold: stored, shown in --status, warns when exceeded (not enforced)
mkdir "$KQ_HEAVY_LOCK"; echo $$ >"$KQ_HEAVY_LOCK/pid"; echo 5 >"$KQ_HEAVY_LOCK/max_hold"
echo $(( $(date +%s) - 120 )) >"$KQ_HEAVY_LOCK/epoch"; echo "long job" >"$KQ_HEAVY_LOCK/cmd"
check "max-hold: status shows hint" sh -c "'$HEAVY' --status | grep -q '\[max-hold 5m\]'"
echo 1 >"$KQ_HEAVY_LOCK/max_hold"
check "max-hold: status shows EXCEEDED" sh -c "'$HEAVY' --status | grep -q 'max-hold 1m EXCEEDED by 1m'"
rm -rf "$KQ_HEAVY_LOCK"
"$HEAVY" --max-hold 0.02 -- sleep 3.5 2>"$T/mh.err" & w=$!; bgpids="$bgpids $w"
sleep 2.6   # 0.02 min = 1.2 s, rounded up to 2 s
check "max-hold: stored in the lock" [ "$(cat "$KQ_HEAVY_LOCK/max_hold" 2>/dev/null)" = 0.02 ]
check "max-hold: warning on stderr once exceeded" grep -q "still holding the lock after 0.02 min" "$T/mh.err"
check "max-hold: not enforced (lock still held, job running)" [ -d "$KQ_HEAVY_LOCK" ]
wait $w; rc=$?
check "max-hold: job finished normally (rc=$rc)" [ "$rc" = 0 ]
check "max-hold: lock released" no_lock
"$HEAVY" --max-hold soon true 2>/dev/null; rc=$?
check "max-hold: non-number rejected (rc=$rc)" [ "$rc" = 64 ]

# ---------- priority lane ----------
PS="$KQ_HEAVY_LOCK.prio"
# Both run in this shell (not in $(...)) so `wait` works: they set $bp / append to $pp.
blocker() {  # a live fake holder
  sleep 60 & bp=$!; bgpids="$bgpids $bp"
  mkdir "$KQ_HEAVY_LOCK"; echo $bp >"$KQ_HEAVY_LOCK/pid"; echo "blocker" >"$KQ_HEAVY_LOCK/cmd"
}
# pjob <owner> <log> [heavy.sh]: queue a short job that logs its owner.
pjob() {
  local mh=""; case "$1" in kq-integrate*) mh="--max-hold 5" ;; esac
  KQ_HEAVY_OWNER=$1 KQ_HEAVY_POLL=0.2 KQ_HEAVY_TIMEOUT=60 "${3:-$HEAVY}" $mh -- sh -c "echo $1 >>'$2'; sleep 0.3" 2>/dev/null &
  pp="$pp $!"; bgpids="$bgpids $!"
}
run_order() { tr '\n' ' ' <"$1" | sed 's/ $//'; }

# 11. priority order: kq-integrate queued last still goes first
rm -f "$PS"; plog="$T/prio.log"; blocker; pp=""
for o in A B kq-integrate; do pjob $o "$plog"; sleep 0.4; done
kill $bp; wait $bp 2>/dev/null
for p in $pp; do wait "$p"; done
check "priority: kq-integrate overtakes FIFO ($(run_order "$plog"))" [ "$(run_order "$plog")" = "kq-integrate A B" ]
check "priority: lock released, queue empty" sh -c "[ ! -e '$KQ_HEAVY_LOCK' ] && [ -z \"\$(ls -A '$Q')\" ]"

# 12. 2:1 anti-starvation + --status (P marker, next line)
rm -f "$PS"; flog2="$T/fair.log"; blocker; pp=""
for o in A kq-integrate-1 kq-integrate-2 kq-integrate-3; do pjob $o "$flog2"; sleep 0.4; done
st=$("$HEAVY" --status)
printf '%s\n' "$st" >"$T/status.txt"
check "status: priority tickets marked P" sh -c "grep -Eq '^ +2\. +P kq-integrate-1 \(pid [0-9]+\)' '$T/status.txt' && grep -Eq '^ +4\. +P kq-integrate-3 ' '$T/status.txt'"
check "status: normal ticket has no P" grep -Eq '^ +1\. +A \(pid [0-9]+\)' "$T/status.txt"
check "status: next is the oldest priority ticket" grep -Eq '^next: kq-integrate-1 \(pid [0-9]+\)$' "$T/status.txt"
echo 2 >"$PS"
check "status: after 2 priority holds, next is the waiting normal ticket" sh -c "'$HEAVY' --status | grep -Eq '^next: A \(pid [0-9]+\)$'"
rm -f "$PS"
kill $bp; wait $bp 2>/dev/null
for p in $pp; do wait "$p"; done
check "2:1: P P N P ($(run_order "$flog2"))" [ "$(run_order "$flog2")" = "kq-integrate-1 kq-integrate-2 A kq-integrate-3" ]
check "2:1: counter reset when no normal ticket waits ($(cat "$PS"))" [ "$(cat "$PS")" = 0 ]

# 13. max-hold cap: priority needs --max-hold <= 15 (exit 2); others only get a warning
KQ_HEAVY_OWNER=kq-integrate "$HEAVY" true 2>"$T/cap.err"; rc=$?
check "cap: priority without --max-hold refused (rc=$rc)" [ "$rc" = 2 ]
check "cap: clear message" grep -q "priority lane, which needs --max-hold <= 15" "$T/cap.err"
KQ_HEAVY_OWNER=kq-integrate-gate "$HEAVY" --max-hold 15.5 true 2>/dev/null; rc=$?
check "cap: priority --max-hold 15.5 refused (rc=$rc)" [ "$rc" = 2 ]
out=$(KQ_HEAVY_OWNER=kq-integrate-gate "$HEAVY" --max-hold 15 echo ran 2>/dev/null); rc=$?
check "cap: priority --max-hold 15 runs (rc=$rc)" [ "$rc:$out" = "0:ran" ]
out=$(KQ_HEAVY_OWNER=kq-integrated "$HEAVY" echo ran 2>/dev/null); rc=$?
check "cap: kq-integrated is not the priority lane (rc=$rc)" [ "$rc:$out" = "0:ran" ]
out=$(KQ_HEAVY_OWNER=voice "$HEAVY" --max-hold 30 echo ran 2>"$T/warn.err"); rc=$?
check "cap: normal --max-hold 30 runs (rc=$rc)" [ "$rc:$out" = "0:ran" ]
check "cap: normal --max-hold 30 warns" grep -q "above the agreed 15 min" "$T/warn.err"
check "cap: no lock or tickets left" sh -c "[ ! -e '$KQ_HEAVY_LOCK' ] && [ -z \"\$(ls -A '$Q')\" ]"

# 14. mixed with an OLD heavy.sh (the real pre-priority script from git history)
OLD="$T/heavy-old.sh"
if git -C "$(dirname "$HEAVY")" show 1472fa4:scripts/dev/heavy.sh >"$OLD" 2>/dev/null && [ -s "$OLD" ]; then
  chmod +x "$OLD"
  # 14a. old ticket in the middle: priority overtakes it, but it never deadlocks
  rm -f "$PS"; olog="$T/old.log"; blocker; pp=""
  pjob A "$olog"; sleep 0.4
  pjob kq-integrate-old "$olog" "$OLD"; sleep 0.4   # old code: no lane, no priority
  pjob kq-integrate "$olog"; sleep 0.4
  check "old mix: old ticket shown without P" sh -c "'$HEAVY' --status | grep -Eq '^ +2\. +kq-integrate-old '"
  kill $bp; wait $bp 2>/dev/null
  for p in $pp; do wait "$p"; done
  check "old mix: P, then FIFO A, then old ($(run_order "$olog"))" [ "$(run_order "$olog")" = "kq-integrate A kq-integrate-old" ]
  # 14b. old ticket at the head: new priority code yields to it
  rm -f "$PS"; olog2="$T/old2.log"; blocker; pp=""
  pjob O "$olog2" "$OLD"; sleep 0.4
  pjob kq-integrate "$olog2"; sleep 0.4
  check "old mix: next is the old head" sh -c "'$HEAVY' --status | grep -Eq '^next: O \(pid [0-9]+\)$'"
  kill $bp; wait $bp 2>/dev/null
  for p in $pp; do wait "$p"; done
  check "old mix: old head served first ($(run_order "$olog2"))" [ "$(run_order "$olog2")" = "O kq-integrate" ]
  check "old mix: lock released, queue empty" sh -c "[ ! -e '$KQ_HEAVY_LOCK' ] && [ -z \"\$(ls -A '$Q')\" ]"
else
  echo "skip old mix: git history not available"
fi

# 15. TERM on a priority ticket: waiting -> ticket gone; holding -> lock released
blocker
KQ_HEAVY_OWNER=kq-integrate KQ_HEAVY_POLL=0.2 "$HEAVY" --max-hold 5 true 2>/dev/null & w=$!; bgpids="$bgpids $w"
sleep 0.6
check "TERM: priority ticket queued" sh -c "ls '$Q' | grep -q kq-integrate"
kill -TERM $w; wait $w; rc=$?
check "TERM while waiting: exit 143 (rc=$rc), ticket removed" sh -c "[ $rc = 143 ] && [ -z \"\$(ls -A '$Q')\" ]"
kill $bp; wait $bp 2>/dev/null; rm -rf "$KQ_HEAVY_LOCK"
KQ_HEAVY_OWNER=kq-integrate "$HEAVY" --max-hold 5 sh -c "exec sleep 60" & w=$!; bgpids="$bgpids $w"
wait_for_lock; sleep 0.3
check "TERM: priority holder marked in status" sh -c "'$HEAVY' --status | grep -q '\[priority\] \[max-hold 5m\]'"
kill -TERM $w; wait $w; rc=$?
check "TERM while holding: exit 143 (rc=$rc), lock released" sh -c "[ $rc = 143 ] && [ ! -e '$KQ_HEAVY_LOCK' ]"

# 15b. one slot: --exclusive is an ordinary hold, bad slot counts
out=$("$HEAVY" --exclusive echo ran 2>/dev/null); rc=$?
check "1 slot: --exclusive runs like a normal hold (rc=$rc)" [ "$rc:$out" = "0:ran" ]
check "1 slot: no slot dirs besides the lock were left" sh -c "[ -z \"\$(ls -d '$L'.slot[0-9]* 2>/dev/null)\" ]"
KQ_HEAVY_SLOTS=two "$HEAVY" true 2>"$T/slots.err"; rc=$?
check "KQ_HEAVY_SLOTS=two: usage error (rc=$rc)" sh -c "[ $rc = 64 ] && grep -q 'KQ_HEAVY_SLOTS must be a whole number' '$T/slots.err'"
out=$(KQ_HEAVY_SLOTS=0 "$HEAVY" echo ran 2>/dev/null); rc=$?
check "KQ_HEAVY_SLOTS=0: treated as 1 (rc=$rc)" [ "$rc:$out" = "0:ran" ]

# ---------- slots: KQ_HEAVY_SLOTS=3 ----------
export KQ_HEAVY_SLOTS=3 KQ_HEAVY_POLL=0.1
glog="$T/slots.log"
# gjob <owner> <gate> [heavy.sh options]: logs "S <owner>", touches $T/<owner>.started, waits
# for <gate>, logs "E <owner>". GJ_HEAVY picks another heavy.sh copy. Appends its pid to $gp.
gjob() {
  local o=$1 g=$2; shift 2
  KQ_HEAVY_OWNER=$o KQ_HEAVY_TIMEOUT=60 "${GJ_HEAVY:-$HEAVY}" "$@" -- sh -c '
    echo "S $1" >>"$2"; : >"$3"
    while [ ! -f "$4" ]; do sleep 0.05; done
    echo "E $1" >>"$2"' gjob "$o" "$glog" "$T/$o.started" "$g" 2>"$T/$o.err" &
  gp="$gp $!"; bgpids="$bgpids $!"
}
started() { [ -f "$T/$1.started" ]; }
not_started() { [ ! -f "$T/$1.started" ]; }
wait_started() { wait_for_file "$T/$1.started"; }
wait_all() { local p f=0; for p in $gp; do wait "$p" || f=$((f + 1)); done; gp=""; return "$f"; }
log_line() { tr '\n' ' ' <"$glog" | sed 's/ $//'; }
fake_holder() {  # fake_holder <dir> <pid> <cmd> [mode]: a holder's metadata (no mode = older heavy.sh)
  mkdir "$1"; echo "$3" >"$1/cmd"; echo tester >"$1/owner"; date +%s >"$1/epoch"
  [ -z "${4:-}" ] || echo "$4" >"$1/mode"
  echo "$2" >"$1/pid"
}

# 16. three normal jobs run at once, the fourth waits for a free slot
: >"$glog"; gp=""
gjob a16 "$T/g16"; wait_started a16
gjob b16 "$T/g16"; wait_started b16
gjob c16 "$T/g16"; wait_started c16
gjob d16 "$T/g16"; sleep 0.8
check "slots: 3 jobs run at once" sh -c "[ -f '$T/a16.started' ] && [ -f '$T/b16.started' ] && [ -f '$T/c16.started' ]"
check "slots: the 4th waits while 3 run" not_started d16
check "slots: slots 1 and 2 first, slot 0 last" test "$(cat "$L.slot1/owner")$(cat "$L.slot2/owner")$(cat "$L/owner")" = a16b16c16
"$HEAVY" --status >"$T/st16"; src=$?
check "status: held, 3 of 3 slots busy (rc=$src)" sh -c "[ $src = 1 ] && grep -q '^held: 3 of 3 slots busy$' '$T/st16'"
check "status: one holder line per slot" sh -c "grep -q '^slot 0: held by c16 ' '$T/st16' && grep -q '^slot 1: held by a16 ' '$T/st16' && grep -q '^slot 2: held by b16 ' '$T/st16'"
check "status: the 4th is queued and next" sh -c "grep -Eq '^ +1\. +d16 \(pid [0-9]+\)' '$T/st16' && grep -Eq '^next: d16 \(pid [0-9]+\)$' '$T/st16'"
: >"$T/g16"
wait_all; rc=$?
check "slots: all 4 finished (failures=$rc)" test "$rc" = 0
check "slots: the 4th ran once a slot was free" started d16
check "slots: at most 3 at once ($(max_running "$glog"))" test "$(max_running "$glog")" = 3
check "slots: all released" no_slots
check "status: free, all 3 slots" sh -c "[ \"\$('$HEAVY' --status | head -1)\" = 'free: all 3 slots' ]"

# 17. an exclusive job waits for every slot and holds back normal jobs queued after it
: >"$glog"; gp=""
gjob a17 "$T/g17a"; wait_started a17
gjob b17 "$T/g17b"; wait_started b17
gjob x17 "$T/g17x" --exclusive; sleep 0.4
gjob c17 "$T/g17c"; sleep 0.8
check "exclusive: waits while 2 of 3 slots are busy" not_started x17
check "exclusive: a normal job behind it leaves the free slot alone" sh -c "[ ! -f '$T/c17.started' ] && [ ! -e '$L' ]"
"$HEAVY" --status >"$T/st17"
check "status: exclusive ticket marked X and next" sh -c "grep -Eq '^ +1\. +X x17 \(pid [0-9]+\)' '$T/st17' && grep -Eq '^next: x17 \(pid [0-9]+\) \[exclusive\]$' '$T/st17'"
check "status: normal ticket behind it unmarked" grep -Eq '^ +2\. +c17 \(pid [0-9]+\)' "$T/st17"
: >"$T/g17a"; sleep 0.6
check "exclusive: still waits while one slot is busy" sh -c "[ ! -f '$T/x17.started' ] && [ ! -f '$T/c17.started' ]"
: >"$T/g17b"
check "exclusive: starts once every slot is free" wait_started x17
check "exclusive: holds all 3 slots with one pid" sh -c "[ \"\$(cat '$L/mode' '$L.slot1/mode' '$L.slot2/mode' | tr -d '\n')\" = XXX ] && [ \"\$(cat '$L/pid')\" = \"\$(cat '$L.slot2/pid')\" ]"
"$HEAVY" --status >"$T/st17b"
check "status: exclusive holder marked in every slot" test "$(grep -c '^slot [0-2]: held by x17 .*\[exclusive\]' "$T/st17b")" = 3
sleep 0.4
check "exclusive: normal job waits while it runs" not_started c17
: >"$T/g17x"
check "exclusive: the normal job runs after it" wait_started c17
: >"$T/g17c"
wait_all; rc=$?
check "exclusive: all finished (failures=$rc)" test "$rc" = 0
check "exclusive: order ($(log_line))" test "$(log_line)" = "S a17 S b17 E a17 E b17 S x17 E x17 S c17 E c17"
check "exclusive: all slots released" no_slots

# 18. an old-format holder in $LOCK (metadata of a heavy.sh without slots): slots 1-2 stay
#     usable, an exclusive job waits
sleep 60 & op=$!; sleep 60 & oc=$!; bgpids="$bgpids $op $oc"
fake_holder "$L" "$op" "old job"; echo "$oc" >"$L/child_pid"; echo N >"$L/lane"; pwd >"$L/cwd"
KQ_HEAVY_TIMEOUT=1 "$HEAVY" --exclusive true 2>/dev/null; rc=$?
check "old holder: exclusive job times out (rc=$rc)" [ "$rc" = 75 ]
: >"$glog"; gp=""
gjob a18 "$T/g18"; gjob b18 "$T/g18"
check "old holder: slot 1 usable" wait_started a18
check "old holder: slot 2 usable" wait_started b18
KQ_HEAVY_TIMEOUT=1 "$HEAVY" true 2>/dev/null; rc=$?
check "old holder: a 4th job waits (rc=$rc)" [ "$rc" = 75 ]
check "old holder: status marks it" sh -c "'$HEAVY' --status | grep -Eq '^slot 0: held by tester \(pid $op\) .*\[old heavy.sh\]: old job'"
check "old holder: left untouched" [ "$(cat "$L/pid")" = "$op" ]
: >"$T/g18"
wait_all; rc=$?
check "old holder: slot jobs finished (failures=$rc)" test "$rc" = 0
kill "$op" "$oc"; wait "$op" "$oc" 2>/dev/null
out=$(KQ_HEAVY_TIMEOUT=10 "$HEAVY" --exclusive echo ran 2>"$T/err18"); rc=$?
check "old holder gone: exclusive job clears slot 0 and runs (rc=$rc)" sh -c "[ '$rc:$out' = 0:ran ] && grep -q 'cleared stale lock slot 0 (pid $op: old job)' '$T/err18'"
check "old holder gone: all released" no_slots

# 19. mixed with the real heavy.sh from before slots (#68): it holds slot 0 and its guard
OLD68="$T/heavy-68.sh"
if git -C "$(dirname "$HEAVY")" show 3dafa0e:scripts/dev/heavy.sh >"$OLD68" 2>/dev/null && [ -s "$OLD68" ]; then
  chmod +x "$OLD68"
  : >"$glog"; gp=""
  GJ_HEAVY=$OLD68 gjob o19 "$T/g19o"
  check "#68 holder: started in slot 0" sh -c "i=0; until [ -f '$T/o19.started' ] && [ -f '$L/pid' ]; do [ \$i -lt 100 ] || exit 1; sleep 0.05; i=\$((i+1)); done; [ ! -e '$L/mode' ]"
  gjob a19 "$T/g19"; gjob b19 "$T/g19"
  check "#68 holder: new jobs use slot 1" wait_started a19
  check "#68 holder: and slot 2" wait_started b19
  KQ_HEAVY_TIMEOUT=1 "$HEAVY" --exclusive true 2>/dev/null; rc=$?
  check "#68 holder: exclusive job waits (rc=$rc)" [ "$rc" = 75 ]
  : >"$T/g19"; sleep 0.3
  # A #68 waiter at the head keeps its claim on slot 0; new tickets behind it use slots 1-2 only.
  GJ_HEAVY=$OLD68 gjob p19 "$T/g19p"; sleep 0.5
  gjob c19 "$T/g19c"; gjob d19 "$T/g19c"
  check "#68 waiter: new jobs behind it take slot 1" wait_started c19
  check "#68 waiter: and slot 2" wait_started d19
  gjob e19 "$T/g19c"; sleep 0.5
  "$HEAVY" --status >"$T/st19"
  check "status: #68 ticket shown as slot 0 only" grep -Eq '^ +1\. +p19 \(pid [0-9]+\) waiting [0-9]+s \[old heavy.sh: slot 0 only\]' "$T/st19"
  : >"$T/g19o"
  check "#68 waiter: takes slot 0 when the #68 holder leaves" wait_started p19
  check "#68 waiter: the new job behind it did not take slot 0" not_started e19
  : >"$T/g19c"; : >"$T/g19p"
  wait_all; rc=$?
  check "#68 mix: all finished (failures=$rc)" test "$rc" = 0
  check "#68 mix: the last new job ran" started e19
  check "#68 mix: all released, queue empty" sh -c "[ -z \"\$(ls -d '$L' '$L'.slot[0-9]* 2>/dev/null)\" ] && [ -z \"\$(ls -A '$Q')\" ]"
else
  echo "skip #68 mix: git history not available"
fi

# 20. stale slots are cleared one by one; a slot whose wrapper died but whose child lives is kept
sleep 60 & lp=$!; bgpids="$bgpids $lp"
fake_holder "$L" "$lp" live0 S
fake_holder "$L.slot1" "$(dead_pid)" ghost1 S
fake_holder "$L.slot2" "$(dead_pid)" orphan2 S; echo "$lp" >"$L.slot2/child_pid"
"$HEAVY" --status >"$T/st20"
check "status: dead slot shown stale, orphan's slot held" sh -c "grep -q '^slot 1: stale (held by' '$T/st20' && grep -q '^slot 2: held by' '$T/st20'"
out=$(KQ_HEAVY_TIMEOUT=10 "$HEAVY" echo ran 2>"$T/err20"); rc=$?
check "stale slot: cleared and used (rc=$rc)" sh -c "[ '$rc:$out' = 0:ran ] && grep -q 'cleared stale lock slot 1 (pid [0-9]*: ghost1)' '$T/err20'"
check "stale slot: the live slots are untouched" sh -c "[ \"\$(cat '$L/cmd')\" = live0 ] && [ \"\$(cat '$L.slot2/cmd')\" = orphan2 ] && [ ! -e '$L.slot1' ]"
kill "$lp"; wait "$lp" 2>/dev/null
out=$(KQ_HEAVY_TIMEOUT=10 "$HEAVY" echo ran 2>"$T/err20b"); rc=$?
check "stale slots: both cleared once the pids are gone (rc=$rc)" sh -c "[ '$rc:$out' = 0:ran ] && grep -q 'cleared stale lock slot 0 ' '$T/err20b' && grep -q 'cleared stale lock slot 2 ' '$T/err20b'"
check "stale slots: all released" no_slots

# 21. EPERM means alive, per slot: a sandboxed peer that cannot probe a holder keeps out
sleep 60 & lp=$!; bgpids="$bgpids $lp"; dp=$(dead_pid)
fake_holder "$L" "$lp" live0 S; fake_holder "$L.slot1" "$lp" live1 S; fake_holder "$L.slot2" "$dp" eperm2 S
BASH_ENV="$shim" STRESS_HOLDER=$dp KQ_HEAVY_TIMEOUT=1 "$HEAVY" true 2>/dev/null; rc=$?
check "EPERM slot: contender times out (rc=$rc)" [ "$rc" = 75 ]
check "EPERM slot: not cleared" [ "$(cat "$L.slot2/pid" 2>/dev/null)" = "$dp" ]
check "EPERM slot: status says held" sh -c "BASH_ENV='$shim' STRESS_HOLDER=$dp '$HEAVY' --status | grep -q '^slot 2: held by tester (pid $dp)'"
out=$(KQ_HEAVY_TIMEOUT=10 "$HEAVY" echo ran 2>"$T/err21"); rc=$?
check "ESRCH slot: cleared and used without the sandbox (rc=$rc)" sh -c "[ '$rc:$out' = 0:ran ] && grep -q 'cleared stale lock slot 2 ' '$T/err21'"
kill "$lp"; wait "$lp" 2>/dev/null; rm -rf "$L" "$L.slot1"

# 22. a live exclusive holder blocks new jobs; slots above KQ_HEAVY_SLOTS count for --exclusive
sleep 60 & lp=$!; bgpids="$bgpids $lp"
fake_holder "$L.slot1" "$lp" excl X
KQ_HEAVY_TIMEOUT=1 "$HEAVY" true 2>/dev/null; rc=$?
check "exclusive holder: blocks a normal job although slots are free (rc=$rc)" [ "$rc" = 75 ]
rm -rf "$L.slot1"
fake_holder "$L.slot4" "$lp" wide S   # a run with KQ_HEAVY_SLOTS=5
KQ_HEAVY_TIMEOUT=1 "$HEAVY" --exclusive true 2>/dev/null; rc=$?
check "extra slot: exclusive job waits for slot 4 (rc=$rc)" [ "$rc" = 75 ]
check "extra slot: listed in status" sh -c "'$HEAVY' --status | grep -q '^slot 4: held by tester'"
out=$(KQ_HEAVY_TIMEOUT=5 "$HEAVY" echo ran 2>/dev/null); rc=$?
check "extra slot: normal job runs (rc=$rc)" [ "$rc:$out" = "0:ran" ]
kill "$lp"; wait "$lp" 2>/dev/null; rm -rf "$L.slot4"

# 23. the priority lane still decides each acquisition: the first freed slot goes to kq-integrate
sleep 60 & b0=$!; sleep 60 & b1=$!; sleep 60 & b2=$!; bgpids="$bgpids $b0 $b1 $b2"
fake_holder "$L" "$b0" blocker0 S; fake_holder "$L.slot1" "$b1" blocker1 S; fake_holder "$L.slot2" "$b2" blocker2 S
rm -f "$PS"; plog="$T/prio-slots.log"; pp=""
for o in A B kq-integrate; do pjob $o "$plog"; sleep 0.4; done
kill "$b1"; wait "$b1" 2>/dev/null
wait_for_file "$plog"; sleep 0.1
check "priority: the freed slot went to kq-integrate ($(run_order "$plog"))" [ "$(head -1 "$plog")" = kq-integrate ]
kill "$b0" "$b2"; wait "$b0" "$b2" 2>/dev/null
for p in $pp; do wait "$p"; done
check "priority: A and B ran after ($(run_order "$plog"))" sh -c "case '$(run_order "$plog")' in 'kq-integrate A B'|'kq-integrate B A') exit 0 ;; esac; exit 1"
check "priority: all released" no_slots

# 24. SIGTERM on an exclusive holder: forwarded to the child, every slot released
"$HEAVY" --exclusive sh -c "echo \$\$ >'$T/xchild'; exec sleep 60" & w=$!; bgpids="$bgpids $w"
wait_for_file "$L.slot2/child_pid"; wait_for_file "$L/child_pid"; sleep 0.2
kill -TERM $w; wait $w; rc=$?
check "TERM exclusive: wrapper exit 143 (rc=$rc)" [ "$rc" = 143 ]
check "TERM exclusive: child killed" sh -c "! kill -0 $(cat "$T/xchild") 2>/dev/null"
check "TERM exclusive: all slots released" no_slots

# 25. nesting: an inner --exclusive heavy.sh runs directly
out=$(KQ_HEAVY_TIMEOUT=5 "$HEAVY" -- "$HEAVY" --exclusive -- sh -c 'echo nested:$KQ_HEAVY_HELD' 2>/dev/null); rc=$?
check "nesting: inner --exclusive ran (rc=$rc, out=$out)" [ "$rc:$out" = "0:nested:1" ]
out=$("$HEAVY" sh -c 'echo $KQ_HEAVY_SLOT' 2>/dev/null; "$HEAVY" --exclusive sh -c 'echo $KQ_HEAVY_SLOT' 2>/dev/null; KQ_HEAVY_SLOTS=1 "$HEAVY" sh -c 'echo $KQ_HEAVY_SLOT' 2>/dev/null)
check "KQ_HEAVY_SLOT: 1 for the first normal job, 0 when exclusive or with 1 slot ($(echo $out))" [ "$(echo $out)" = "1 0 0" ]
check "slots: no tickets left" no_tickets
unset KQ_HEAVY_POLL

# never leave the real lock behind
stress
orphaned_child
slot_stress
for f in $real_before; do check "real $f untouched" [ ! -e "$f" ]; done

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
