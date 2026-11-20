# Release scripts

To be folded into `docs/RELEASE.md` (branch `release/pages-prep`) as the section below.

| File | Purpose |
|---|---|
| `rewrite-history.sh` | one-time history rewrite (email + personal strings), with backup bundle and safety checks |
| `private/mailmap.txt` (untracked) | old author email to the GitHub noreply address |
| `private/replace-text.txt` (untracked) | exact rules for the home path and the owner's first name in old blobs and commit messages |
| `setup-github.sh` | `gh repo create`, discussions, topics, push, Pages, private vulnerability reporting |

`private/mailmap.txt` and `private/replace-text.txt` hold the strings they remove, so they are
gitignored; put them into the main checkout's `scripts/release/private/` before the run. One early
commit tracked them under `scripts/release/`; the rewrite drops those paths from every commit
(`--invert-paths`). **Never push before the
rewrite**, or these files publish what they are meant to hide.

## History rewrite and first push

### 1. Quiet window

- All in-flight branches are merged into `main` (or deliberately abandoned and deleted).
- Every worktree (`git worktree list`) is clean and idle: no session is working in it, no
  dev server or build is running from it. The script refuses to run if any worktree has
  uncommitted changes and lists them.
- No remote exists yet (filter-repo removes `origin` anyway).

### 2. Rewrite

```sh
brew install git-filter-repo        # if missing
cd <main checkout>
scripts/release/rewrite-history.sh
```

The script:

1. checks for `git-filter-repo`, the main checkout, and clean worktrees;
2. writes `../karlsberg-quest-pre-rewrite.bundle` (`git bundle create … --all`) and verifies it;
3. runs `git filter-repo --force` over all refs with `--mailmap`, `--replace-text` and
   `--replace-message`, and drops `scripts/release/mailmap.txt` and `replace-text.txt`;
4. prints the emails left in history and any leftover `/Users/`, first-name or old-email hits.

Why `--replace-text` is needed: old versions of `PRD.md` (every version since 0.1),
`docs/ACTION-RPG.md`, `IDEA.md`, `research/02-sister-projects.md` and `docs/NEXT-SESSION.md`
carry the first name and a `/Users/<name>/…` path. They are scrubbed at HEAD, but the old blobs
would still be public. No commit message contains them today; `--replace-message` uses the same
rules in case a branch merged later adds one.

### 3. Worktrees after the rewrite

filter-repo rewrites every branch ref, but each linked worktree keeps its old HEAD commit
checked out (its index and files point at pre-rewrite commits). For each linked worktree:

- **idle and clean, branch still wanted:** `git -C <worktree> reset --hard <branch>`
  (the branch ref already points at the rewritten commit; the reset moves the index and files).
- **branch no longer wanted:** `git worktree remove <worktree>` (add `--force` if needed) and
  `git branch -D <branch>`.
- **anything odd** (detached HEAD, locked agent worktree): remove it with
  `git worktree unlock <worktree>; git worktree remove --force <worktree>` and recreate it
  from the rewritten branch with `git worktree add <path> <branch>`.

Then `git worktree prune`. Never commit from a worktree that was not reset: its commits would
sit on top of the old history and bring the old email back.

### 4. Verify

```sh
git log --all --format='%ae' | sort -u      # only 10562055+huhn511@users.noreply.github.com
git log --all --format='%ce' | sort -u      # same
git grep -I -E '/Users/[a-z]' $(git rev-list --all) | wc -l   # 0 (home paths)
pnpm install && pnpm build && pnpm test     # the gates still pass on the rewritten main
```

The script's own last check also searches every message and blob for the left-hand sides of
`replace-text.txt` and the old email (read from the copied rule files); it must print nothing.
This README and the scripts deliberately name none of those strings.

Keep the bundle offline until the public repo is confirmed good, then delete it (it holds the
old email).

### 5. Create the repo and push

```sh
gh auth status
scripts/release/setup-github.sh
```

It refuses to run while any non-noreply email is in history or an `origin` remote exists, then:

- `gh repo create schloss-karlsberg/karlsberg-quest --public --description … --homepage https://schloss-karlsberg.github.io/karlsberg-quest/ --source . --remote origin` (issues on by default);
- `gh repo edit` with `--enable-issues --enable-discussions` and the topics threejs, webgl, game,
  action-rpg, saarland, lidar, browser-game, typescript;
- `git push -u origin main`;
- Pages with `build_type=workflow` (POST, falling back to PUT if Pages already exists);
- private vulnerability reporting (`PUT repos/…/private-vulnerability-reporting`).

Then check the Pages workflow run in the Actions tab and open the homepage URL.

## Draft: rule G for `docs/NEXT-SESSION.md` §5

Apply only after the first push has succeeded:

> **G. Git:** push to origin (schloss-karlsberg/karlsberg-quest) after the gates pass; never
> force-push main.
