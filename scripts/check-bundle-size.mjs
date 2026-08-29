/**
 * A ceiling on what an embedder downloads.
 *
 * The gate is on the shipped file rather than on Angular's intermediate output,
 * because the shipped file is what the limit is actually about. Both a raw and a
 * gzip figure, because a CDN serves the compressed one and a file: URL serves the
 * raw one, and the two do not move together.
 *
 * Baseline on 2026-08-29: 395,685 raw and 201,618 gzip-9 bytes, at Angular 22.
 * The limits leave headroom deliberately. Raising one is a decision to be taken
 * on evidence and recorded here, not a step in making a build pass.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { OUT, readManifest } from './make-bundle.mjs';

const RAW_LIMIT = 450_000;
const GZIP_LIMIT = 230_000;

const format = (bytes) => `${bytes.toLocaleString('en-US')} bytes`;

const bundle = readFileSync(OUT);
const manifest = readManifest();

if (bundle.length !== manifest.bytes) {
  console.error(`  bundle is ${format(bundle.length)} but its manifest says ${format(manifest.bytes)}.`);
  console.error('  Run: npm run bundle');
  process.exit(1);
}

const gzip = gzipSync(bundle, { level: 9 }).length;
let failed = false;

for (const [label, actual, limit] of [
  ['raw', bundle.length, RAW_LIMIT],
  ['gzip-9', gzip, GZIP_LIMIT],
]) {
  const headroom = limit - actual;
  if (headroom < 0) {
    console.error(`  ${label}: ${format(actual)} exceeds its ${format(limit)} ceiling by ${format(-headroom)}.`);
    failed = true;
  } else {
    console.log(`  ${label}: ${format(actual)}, ${format(headroom)} under the ceiling.`);
  }
}

process.exit(failed ? 1 : 0);
