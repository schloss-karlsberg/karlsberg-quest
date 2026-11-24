# Legacy auto slots

Each JSON file is the exact string that the tagged release's `SaveManager.save('auto')` wrote to
`kq.save.v1.auto` in `MemoryStorage`. The generator sets up representative checkpoints with the
release's state constructors and fixes the save timestamp for reproducibility.

| Tag | Commit | Beat | State |
| --- | --- | --- | --- |
| v0.6.0 | `cf51793c5fb412539e67fd3ab8caebb1e3621cbf` | `p1` | Mara at the prologue spawn before the first quest offer |
| v0.7.0 | `e0e413f924abd93a21562d9672aaf97816c50ac2` | `p2` | First quest complete, relief quest in progress, 173 XP, spent talent point, Eschenstab, Bussole and two Codex facts |
| v0.8.0 | `583d8f9bffecb79e68c0c4a3ebdc756c91f667ad` | `p2` | Same mid-prologue character with a live quest enemy group, a dropped Balsam and photo progress |

Run from the worktree root after installing dependencies. Vitest runs the tagged serializer in Node.

```sh
fixture_dir="$PWD/tests/fixtures/saves"
for tag in v0.6.0 v0.7.0 v0.8.0; do
  release_dir="$TMPDIR/kq-$tag"
  mkdir -p "$release_dir"
  git archive "$tag" | tar -x -C "$release_dir"
  mkdir -p "$release_dir/tests/fixtures/saves"
  cp "$fixture_dir/generate.ts" "$release_dir/tests/fixtures/saves/"
  [ -e "$release_dir/node_modules" ] || ln -s "$PWD/node_modules" "$release_dir/node_modules"
  cat > "$release_dir/tests/fixtures/saves/generate.test.ts" <<'TS'
import { test } from 'vitest';
import { generateReleaseSlot } from './generate';
test('capture the release auto slot', () => generateReleaseSlot(process.env.KQ_FIXTURE_TAG!, process.env.KQ_FIXTURE_OUTPUT!));
TS
  (cd "$release_dir" && KQ_FIXTURE_TAG="$tag" KQ_FIXTURE_OUTPUT="$fixture_dir/$tag.json" ./node_modules/.bin/vitest run tests/fixtures/saves/generate.test.ts) || exit
done
```
