#!/usr/bin/env bash
# One-time history rewrite before the first public push.
# - rewrites the author/committer email via mailmap.txt (all refs)
# - scrubs personal strings (absolute home paths, the owner's first name)
#   from every old blob version and every commit message via replace-text.txt
# Run from the MAIN checkout during the quiet window (see README.md).
# Do not run it twice: after the rewrite the old commits are gone except in the bundle.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
cd "$root"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install it with: brew install git-filter-repo" >&2
  exit 1
fi

# Must be the main worktree, not a linked one.
if [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]; then
  echo "Run this from the main checkout, not from a linked worktree." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes in the main checkout; commit or discard them first:" >&2
  git status --short >&2
  exit 1
fi

# Every linked worktree must be clean too (its changes would be stranded on old commits).
dirty=()
main_wt="$(pwd -P)"
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      wt="${line#worktree }"
      [ "$(cd "$wt" 2>/dev/null && pwd -P)" = "$main_wt" ] && continue
      if [ ! -d "$wt" ]; then
        echo "note: worktree $wt is missing on disk (run 'git worktree prune')" >&2
        continue
      fi
      if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
        dirty+=("$wt")
      fi
      ;;
  esac
done < <(git worktree list --porcelain)

if [ "${#dirty[@]}" -gt 0 ]; then
  echo "These worktrees have uncommitted changes; commit/merge or discard them first:" >&2
  printf '  %s\n' "${dirty[@]}" >&2
  exit 1
fi

bundle="$(cd .. && pwd)/karlsberg-quest-pre-rewrite.bundle"
if [ -e "$bundle" ]; then
  echo "Backup bundle $bundle already exists; move it away first (was the rewrite already run?)." >&2
  exit 1
fi
echo "Backing up all refs to $bundle ..."
git bundle create "$bundle" --all
git bundle verify "$bundle" >/dev/null

echo "Worktrees before the rewrite (each must be reset or recreated afterwards):"
git worktree list

# mailmap.txt and replace-text.txt themselves contain the old email, the home path and
# the first name, so they are copied out and then dropped from every commit (--invert-paths).
tmp="$(mktemp -d)"
cp "$here/mailmap.txt" "$here/replace-text.txt" "$tmp/"
echo "Rule files copied to $tmp (kept after the run; delete them by hand when done)."

git filter-repo --force \
  --mailmap "$tmp/mailmap.txt" \
  --replace-text "$tmp/replace-text.txt" \
  --replace-message "$tmp/replace-text.txt" \
  --invert-paths \
  --path scripts/release/mailmap.txt \
  --path scripts/release/replace-text.txt

echo
echo "Author/committer emails now in history:"
git log --all --format='%ae%n%ce' | sort -u
echo
# Search patterns come from the rule files, so this script names no personal string itself.
sed 's/==>.*//' "$tmp/replace-text.txt" > "$tmp/patterns.txt"
sed -n 's/.*<\([^>]*\)>[[:space:]]*$/\1/p' "$tmp/mailmap.txt" >> "$tmp/patterns.txt"
echo "Leftover personal strings in commit messages (expect nothing):"
git log --all --format='%B' | grep -n -F -f "$tmp/patterns.txt" || true
echo "Leftover personal strings in any blob of any commit (expect nothing):"
git grep -n -I -F -f "$tmp/patterns.txt" $(git rev-list --all) | head -20 || true
echo
echo "Done. Next: reset or recreate every linked worktree (scripts/release/README.md), then setup-github.sh."
