/**
 * Locate the built element in `dist/` and say how to turn it into one file.
 *
 * The single place that knows anything about builder output. The bundle step,
 * the size gate and the freshness guard all read it from here, so a change in
 * what Angular emits is a change in one file rather than in three.
 *
 * Angular's `application` builder emits an ES module graph: the entry and the
 * polyfills are separate modules whose top-level declarations are module-scoped
 * and are meant to stay that way. Concatenating them produces a file that loads
 * and then fails inside Angular, because two modules that never shared a scope
 * are suddenly sharing one. Each is flattened to its own IIFE instead.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_DIST = join(ROOT, 'dist/cedar-term-picker');

/**
 * Load order matters: the polyfills install globals the entry expects.
 *
 * The picker is zoneless and declares none, so there is normally one file here.
 * The role is still recognised, and still first, so adding polyfills to the build
 * is a change in `angular.json` rather than a change in two places.
 */
const ROLES = [
  { role: 'polyfills', pattern: /^polyfills(-[0-9A-Z]+)?\.js$/ },
  { role: 'entry', pattern: /^main(-[0-9A-Z]+)?\.js$/ },
];

/**
 * The builder nests output under `browser/`. Preferred when present, so a
 * half-cleaned `dist` cannot shadow the current build with an older flat one.
 */
function findOutputDir(dist) {
  if (!existsSync(dist)) {
    return null;
  }
  const nested = join(dist, 'browser');
  if (existsSync(nested) && readdirSync(nested).some((file) => file.endsWith('.js'))) {
    return nested;
  }
  return readdirSync(dist).some((file) => file.endsWith('.js')) ? dist : null;
}

export function resolveBuildOutput(dist = DEFAULT_DIST) {
  const dir = findOutputDir(dist);
  if (dir === null) {
    throw new Error(`no build output in ${dist}.\n  Run: npm run build`);
  }

  const files = readdirSync(dir);
  const inputs = [];
  for (const { role, pattern } of ROLES) {
    const match = files.find((file) => pattern.test(file));
    if (role === 'entry' && match === undefined) {
      throw new Error(`no entry point among ${files.join(', ')} in ${dir}.`);
    }
    if (match !== undefined) {
      inputs.push({ role, path: join(dir, match) });
    }
  }

  return { dir, inputs, entry: inputs.find((input) => input.role === 'entry').path };
}

/** The most recent modification time across the build's inputs. */
export function newestInput(dist = DEFAULT_DIST) {
  const { inputs } = resolveBuildOutput(dist);
  return Math.max(...inputs.map((input) => statSync(input.path).mtimeMs));
}
