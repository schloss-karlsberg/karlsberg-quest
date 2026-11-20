#!/usr/bin/env bash
# Publish local main to the public repo (schloss-karlsberg/karlsberg-quest) until the one-time
# in-place rewrite of the local repo has been done.
#
# The public history is a rewritten copy of local main (noreply emails, personal strings scrubbed).
# rewrite-history.sh is deterministic, so rewriting a fresh clone of main again yields the same
# public SHAs for the old commits plus the new ones on top: the push is a plain fast-forward.
#
#   fresh --no-local clone of main → copy the untracked rule files → rewrite-history.sh →
#   verify (emails, .env, personal strings) → fetch origin/main → require a fast-forward → push
#
# Never force-pushes. Options:
#   --dry-run   do everything up to and including the fast-forward check, but do not push
#   --keep      keep the temp dir afterwards (it holds the backup bundle and the rule files)
# Run it from any checkout of this repo (main checkout or a worktree), after the gates passed.
set -euo pipefail

REMOTE_URL="https://github.com/schloss-karlsberg/karlsberg-quest.git"
NOREPLY_RE='^[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com$|^noreply@github\.com$|^[0-9]+\+[A-Za-z0-9-]+\[bot\]@users\.noreply\.github\.com$'

dry_run=0
keep=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --keep) keep=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "publish: $*" >&2; exit 1; }

command -v git-filter-repo >/dev/null 2>&1 || die "git-filter-repo not found (brew install git-filter-repo)"

src="$(git rev-parse --show-toplevel)"
# Rule files live untracked in the MAIN checkout (a worktree's toplevel has none): fall back to it.
private="$src/scripts/release/private"
if [ ! -f "$private/mailmap.txt" ]; then
  common="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
  private="$(dirname "$common")/scripts/release/private"
fi
for f in mailmap.txt replace-text.txt; do
  [ -f "$private/$f" ] || die "missing $private/$f (untracked rule file, see scripts/release/README.md)"
done

work="$(mktemp -d "${TMPDIR:-/tmp}/kq-publish.XXXXXX")"
cleanup() {
  if [ "$keep" = 1 ]; then echo "publish: temp dir kept: $work"; else rm -rf "$work"; fi
}
trap cleanup EXIT

clone="$work/karlsberg-quest"
echo "== clone main (--no-local) into $clone"
git clone --quiet --no-local --single-branch --branch main "$src" "$clone"
cd "$clone"
local_head="$(git rev-parse --short HEAD)"

echo "== copy the rule files"
mkdir -p scripts/release/private
cp "$private/mailmap.txt" "$private/replace-text.txt" scripts/release/private/

echo "== rewrite (backup bundle lands in $work)"
# TMPDIR: the rewrite script's own copy of the rule files lands in $work too and is removed with it
TMPDIR="$work" bash scripts/release/rewrite-history.sh

echo "== verify"
# 1. only noreply author / committer emails
bad_emails="$(git log --all --format='%ae%n%ce' | sort -u | grep -v -E "$NOREPLY_RE" || true)"
[ -z "$bad_emails" ] || die "non-noreply emails left in history: $(echo "$bad_emails" | wc -l | tr -d ' ') address(es); not pushing"
# 2. no .env tracked in any commit (.env.example is fine)
env_hits="$(git log --all --name-only --format= | grep -E '(^|/)\.env($|\.)' | grep -v -E '(^|/)\.env\.example$' | sort -u || true)"
[ -z "$env_hits" ] || die "a .env file is tracked in history: $env_hits"
# 3. no hit for any replace-text pattern (or the old email) in any message or blob
patterns="$work/patterns.txt"
sed -e 's/==>.*//' -e 's/^literal://' scripts/release/private/replace-text.txt | grep -v '^[[:space:]]*$' > "$patterns" || true
sed -n 's/.*<\([^>]*\)>[[:space:]]*$/\1/p' scripts/release/private/mailmap.txt >> "$patterns"
[ -s "$patterns" ] || die "no search patterns read from the rule files"
if git log --all --format='%B' | grep -q -F -f "$patterns"; then
  die "a personal string is left in a commit message; not pushing"
fi
blob_hit="$(git rev-list --all | xargs git grep -l -I -F -f "$patterns" 2>/dev/null | head -1 || true)"
if [ -n "$blob_hit" ]; then
  die "a personal string is left in a blob; not pushing"
fi
echo "   emails, .env and personal strings: clean"

echo "== fetch origin/main"
git remote add origin "$REMOTE_URL"
git fetch --quiet origin main
new_head="$(git rev-parse HEAD)"
pub_head="$(git rev-parse origin/main)"

if [ "$new_head" = "$pub_head" ]; then
  echo "publish: nothing to push; origin/main is already at $new_head (local $local_head)."
  exit 0
fi
if ! git merge-base --is-ancestor origin/main HEAD; then
  cat >&2 <<EOF
publish: ABORT: origin/main ($pub_head) is not an ancestor of the rewritten main ($new_head).
  The public repo has commits the local history does not (e.g. a release PR merged on GitHub),
  or the rewrite rules changed. Nothing was pushed. Never force-push main; see docs/RELEASE.md.
EOF
  exit 1
fi
echo "   fast-forward: $(git rev-list --count origin/main..HEAD) new commit(s), origin/main ${pub_head:0:7} → ${new_head:0:7} (local $local_head)"

if [ "$dry_run" = 1 ]; then
  echo "publish: --dry-run, not pushing."
  exit 0
fi

echo "== push"
git push origin main
echo "publish: done. Watch the Pages and Release workflows in the Actions tab."
