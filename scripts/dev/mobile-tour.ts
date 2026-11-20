// Mobile UI tour, one unit per run (docs/MOBILE-UI-PASS.md):
//
//   pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape [--states hud,combat] [--build] [--headed] [--mask]
//   pnpm exec tsx scripts/dev/mobile-tour.ts --list
//
// Runs e2e/mobile/tour.pw.ts with e2e/mobile/playwright.config.ts (real GPU, ANGLE Metal; preview
// server on port 5340, or KQ_MOBILE_PORT). Builds dist/ first when it is missing (or with --build).
// Output: test-results/mobile-tour/<device>/<NN>-<state>[-<sub>].png + findings.json.
// Heavy: always wrap it in scripts/dev/heavy.sh (one device per lock hold, ≤ 15 min).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_UNITS, findUnit } from '../../e2e/mobile/devices';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes('--list') || argv.includes('-h') || argv.includes('--help')) {
  console.log('units (--device):');
  for (const u of MOBILE_UNITS) console.log(`  ${u.id.padEnd(18)} ${u.label}${u.phonePortrait ? ' (title, menus, rotate overlay only)' : ''}`);
  console.log('\n--states: comma list of state ids or prefixes (see STATES in e2e/mobile/tour.pw.ts)');
  process.exit(0);
}

const device = opt('device') ?? process.env.KQ_MOBILE_UNIT;
if (!device) {
  console.error('mobile-tour: --device <unit> is required (--list shows them)');
  process.exit(64);
}
findUnit(device); // throws on a typo, with the list

if (argv.includes('--build') || !existsSync(resolve(ROOT, 'dist/index.html'))) {
  const b = spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const env: NodeJS.ProcessEnv = { ...process.env, KQ_MOBILE_UNIT: device };
const states = opt('states');
if (states) env.KQ_MOBILE_STATES = states;
if (argv.includes('--headed')) env.KQ_MOBILE_HEADED = '1';
if (argv.includes('--mask')) env.KQ_MOBILE_MASK = '1';

const r = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', 'e2e/mobile/playwright.config.ts', '--workers=1'], { cwd: ROOT, stdio: 'inherit', env });
process.exit(r.status ?? 1);
