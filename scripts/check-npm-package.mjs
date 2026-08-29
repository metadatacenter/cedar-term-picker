/**
 * Verify the staged package against the bundle it claims to carry.
 *
 * Byte for byte, because the failure this guards against is a staged directory
 * left behind by an earlier build: it looks complete, and publishes something
 * nobody tested.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TARGET, expectedFiles } from './npm-package.mjs';

if (!existsSync(TARGET)) {
  console.error('  nothing staged.\n  Run: npm run package:npm');
  process.exit(1);
}

const expected = expectedFiles();
let failed = false;

for (const [name, bytes] of Object.entries(expected)) {
  const staged = join(TARGET, name);
  if (!existsSync(staged)) {
    console.error(`  missing from the staged package: ${name}`);
    failed = true;
    continue;
  }
  if (!readFileSync(staged).equals(bytes)) {
    console.error(`  staged ${name} differs from what this build produces.`);
    failed = true;
  }
}

/** Every file under the staged directory, as the keys `expectedFiles` uses. */
function stagedFiles(dir = TARGET) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? stagedFiles(join(dir, entry.name)) : [relative(TARGET, join(dir, entry.name))],
  );
}

const extra = stagedFiles().filter((name) => !(name.split('\\').join('/') in expected));
if (extra.length > 0) {
  console.error(`  staged package carries files this build does not produce: ${extra.join(', ')}`);
  failed = true;
}

if (failed) {
  console.error('  Run: npm run package:npm');
  process.exit(1);
}
console.log(`  staged package matches this build (${Object.keys(expected).length} files).`);
