import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'));
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const fingerprintRequire = createRequire(projectRequire.resolve('@expo/fingerprint/package.json'));

// npm ci can preserve a stale nested lockfile entry even when an override exists.
// Assert the dependency actually used by fingerprint, not just the hoisted copy.
for (const [dependency, expectedVersion] of Object.entries(manifest.overrides['@expo/fingerprint'])) {
  test(`fingerprint resolves the declared ${dependency} security override`, () => {
    const installed = fingerprintRequire(`${dependency}/package.json`);
    assert.equal(installed.version, expectedVersion);
  });
}

test('the web renderer matches the pinned Expo React runtime', () => {
  const react = projectRequire('react');
  const reactDom = projectRequire('react-dom');
  assert.equal(manifest.dependencies['react-dom'], manifest.dependencies.react);
  assert.equal(reactDom.version, react.version);
  const server = projectRequire('react-dom/server');
  assert.equal(server.renderToString(react.createElement('div', null, 'Preppa')), '<div>Preppa</div>');
});
