#!/bin/bash
# Tests for scripts/dev/heavy.sh. Run: bash scripts/dev/heavy.test.sh (~20 s).
# Uses a private lock path (KQ_HEAVY_LOCK) in a temp dir, so it never touches
# /tmp/kq-heavy.lock and is safe while a real heavy job holds the real lock.

set -u
HEAVY="$(cd "$(dirname "$0")" && pwd)/heavy.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/kq-heavy-test.XXXXXX")
export KQ_HEAVY_LOCK="$T/lock"
unset KQ_HEAVY_HELD KQ_HEAVY_TIMEOUT KQ_HEAVY_OWNER
real_lock_before=0; [ -e /tmp/kq-heavy.lock ] && real_lock_before=1
bgpids=""

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

# never leave the real lock behind
if [ "$real_lock_before" = 0 ]; then check "real /tmp/kq-heavy.lock untouched" [ ! -e /tmp/kq-heavy.lock ]; fi

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
