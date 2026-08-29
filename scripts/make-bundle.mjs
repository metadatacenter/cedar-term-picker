/**
 * Build `dist-bundle/cedar-term-picker.js` — the single file an embedder
 * downloads — and a manifest recording what went into it.
 *
 * The manifest exists so the size gate and the packaging step can check the copy
 * they are looking at without re-deriving it, and so a staged package can be
 * verified byte for byte against the bundle that was tested.
 *
 * Usable as a module: `produceBundle()` returns the bytes and the manifest
 * without writing, so the packaging step is testable against a synthetic build.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { DEFAULT_DIST, ROOT, resolveBuildOutput } from './build-output.mjs';

export const OUT_DIR = join(ROOT, 'dist-bundle');
export const OUT = join(OUT_DIR, 'cedar-term-picker.js');
export const MANIFEST = join(OUT_DIR, 'bundle-manifest.json');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Flatten one ES module and its chunks into a classic script.
 *
 * `iife` matters: the file is loaded with a plain `<script>` by embedders who
 * are not obliged to use `type="module"`, and a top-level `import` would fail
 * there.
 */
async function flatten(entry) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    /*
     * Whitespace only. Angular has already minified, downleveled and tree-shaken
     * this; re-mangling names would add risk for nothing. But esbuild re-prints
     * what it parses, and printing minified input with default formatting
     * inflates the result substantially, so this undoes that and touches nothing
     * else.
     */
    minifyWhitespace: true,
    write: false,
    logLevel: 'silent',
    platform: 'browser',
  });
  return Buffer.from(result.outputFiles[0].contents);
}

export async function produceBundle(dist = DEFAULT_DIST) {
  const { inputs } = resolveBuildOutput(dist);

  const parts = [];
  for (const input of inputs) {
    parts.push(await flatten(input.path));
  }
  const bundle = Buffer.concat(parts);

  return {
    bundle,
    /*
     * No timestamp. A build time here would make the manifest differ on every
     * rebuild even when the bundle was byte-identical, so a staged copy could
     * never be verified by comparison. The freshness guard takes its timestamps
     * from the filesystem instead.
     */
    manifest: {
      bytes: bundle.length,
      sha256: sha256(bundle),
      inputs: inputs.map((input) => relative(ROOT, input.path)),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { bundle, manifest } = await produceBundle();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bundle);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  bundle: ${manifest.bytes.toLocaleString('en-US')} bytes (${manifest.sha256.slice(0, 12)}…)`);
}

export const readManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
