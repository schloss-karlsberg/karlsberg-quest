#!/usr/bin/env bash
# Creates the public GitHub repo, pushes main and turns on Pages (GitHub Actions),
# discussions, topics and private vulnerability reporting.
# Run ONCE, from the main checkout, only AFTER rewrite-history.sh and its verification.
# Flags checked against gh 2.97.0 (gh repo create --help, gh repo edit --help).
set -euo pipefail

REPO="schloss-karlsberg/karlsberg-quest"
HOMEPAGE="https://schloss-karlsberg.github.io/karlsberg-quest/"
DESCRIPTION="Browser action RPG at the lost Schloss Karlsberg (Homburg, Saarland), built on real LiDAR terrain. Three.js + TypeScript."

cd "$(git rev-parse --show-toplevel)"

gh auth status >/dev/null

# Safety: refuse if the old personal email is still in history.
if git log --all --format='%ae%n%ce' | grep -qv '@users.noreply.github.com$'; then
  echo "History still has non-noreply author/committer emails; run rewrite-history.sh first:" >&2
  git log --all --format='%ae%n%ce' | sort -u | grep -v '@users.noreply.github.com$' >&2
  exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo "A remote 'origin' already exists: $(git remote get-url origin)" >&2
  exit 1
fi

# Issues are on by default for gh repo create (only --disable-issues exists there).
gh repo create "$REPO" --public \
  --description "$DESCRIPTION" \
  --homepage "$HOMEPAGE" \
  --source . \
  --remote origin

gh repo edit "$REPO" \
  --enable-issues \
  --enable-discussions \
  --add-topic threejs,webgl,game,action-rpg,saarland,lidar,browser-game,typescript

git push -u origin main

# Pages from a GitHub Actions workflow; PUT updates it if Pages already exists.
if ! gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null
fi
gh api "repos/$REPO/pages" --jq '.html_url + " (build_type: " + .build_type + ")"'

gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null
gh api "repos/$REPO/private-vulnerability-reporting" --jq '"private vulnerability reporting: " + (.enabled|tostring)'

echo "Done: https://github.com/$REPO"
