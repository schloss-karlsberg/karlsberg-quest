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

# never leave the real lock behind
if [ "$real_lock_before" = 0 ]; then check "real /tmp/kq-heavy.lock untouched" [ ! -e /tmp/kq-heavy.lock ]; fi

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
