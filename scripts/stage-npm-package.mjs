/**
 * Copy the tested bytes into `dist-npm/`, ready for `npm pack` or `npm publish`.
 *
 * Nothing here builds anything. The bundle it stages is the one the size gate
 * measured and, in CI, the one the browser check loaded — staging a freshly built
 * copy instead would publish bytes nothing had exercised.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TARGET, assertSourceBundle, expectedFiles } from './npm-package.mjs';

const { manifest } = assertSourceBundle();
mkdirSync(TARGET, { recursive: true });
for (const [name, bytes] of Object.entries(expectedFiles())) {
  const file = join(TARGET, name);
  // `search/search-types.d.ts` sits in a subdirectory the public API re-exports from.
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

console.log(`  staged ${manifest.bytes.toLocaleString('en-US')} bytes to dist-npm/ (${manifest.sha256.slice(0, 12)}…)`);
