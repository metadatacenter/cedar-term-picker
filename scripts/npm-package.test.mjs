/**
 * The publish channel is derived from the version, so it cannot be lost by
 * forgetting a flag at the command line. That derivation is the thing worth a
 * test: getting it wrong publishes a development snapshot to public npmjs, which
 * is not an action anyone can take back.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { packageMetadata } from './npm-package.mjs';

test('a development snapshot goes to Nexus, under the CEDAR scope', () => {
  const metadata = packageMetadata({ version: '0.1.0-dev.20260829.abc1234', description: 'd' });

  assert.equal(metadata.name, '@org.metadatacenter/cedar-term-picker');
  assert.equal(metadata.publishConfig.registry, 'https://nexus.bmir.stanford.edu/repository/npm-cedar/');
  assert.equal(metadata.publishConfig.tag, 'dev');
});

test('a release goes to the default registry, unscoped', () => {
  const metadata = packageMetadata({ version: '0.1.0', description: 'd' });

  assert.equal(metadata.name, 'cedar-term-picker');
  assert.equal(metadata.publishConfig, undefined);
});

test('a release candidate that is not a dev snapshot is still a release', () => {
  assert.equal(packageMetadata({ version: '1.0.0-rc.1', description: 'd' }).name, 'cedar-term-picker');
});

test('the package declares the licence the repository carries', () => {
  assert.equal(packageMetadata({ version: '0.1.0', description: 'd' }).license, 'BSD-2-Clause');
});

test('the declaration is what a host imports types from', () => {
  const metadata = packageMetadata({ version: '0.1.0', description: 'd' });

  assert.equal(metadata.types, 'cedar-term-picker.d.ts');
  assert.ok(metadata.files.includes('cedar-term-picker.d.ts'));
  assert.ok(metadata.files.includes('license.txt'));
});
