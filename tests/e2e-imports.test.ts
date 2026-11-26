import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/**
 * Playwright loads e2e specs in Node's ESM loader, which refuses a JSON module imported without
 * `with { type: 'json' }`: one such import anywhere below a spec's `src/` imports unloads the
 * spec (and a whole-suite run lists no tests). Vite and Vitest accept the import, so only this
 * walk over the value imports catches it before a browser run.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALUE_IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const path of [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  throw new Error(`${relative(root, from)}: cannot resolve '${spec}'`);
}

function imports(file: string): string[] {
  const out: string[] = [];
  for (const m of readFileSync(file, 'utf8').matchAll(VALUE_IMPORT)) {
    const path = resolveImport(file, m[1] ?? m[2]!);
    if (path) out.push(path);
  }
  return out;
}

it('keeps JSON modules out of the src imports that e2e specs load in Node', () => {
  const src = join(root, 'src');
  const seen = new Set<string>();
  const json: string[] = [];
  const queue = files(join(root, 'e2e')).flatMap((spec) => imports(spec).filter((path) => path.startsWith(src)).map((path) => [path, relative(root, spec)] as const));
  expect(queue.length).toBeGreaterThan(0);
  while (queue.length) {
    const [file, via] = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.json')) {
      json.push(`${relative(root, file)} (via ${via})`);
      continue;
    }
    for (const next of imports(file)) queue.push([next, relative(root, file)]);
  }
  expect(json).toEqual([]);
});
