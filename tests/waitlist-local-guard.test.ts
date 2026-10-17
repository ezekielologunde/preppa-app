import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';

function run(fixture?: string) {
  const env = { ...process.env };
  delete env.PREPPA_WAITLIST_FIXTURE;
  if (fixture) env.PREPPA_WAITLIST_FIXTURE = fixture;
  return spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tests/waitlist-local.integration.ts'], { env, encoding: 'utf8', timeout: 10000 });
}

test('opt-in integration runner refuses to run without a disposable fixture', () => {
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set PREPPA_WAITLIST_FIXTURE/);
});

test('opt-in integration runner rejects a non-local URL before accessing Docker or the network', () => {
  const directory = mkdtempSync(join(tmpdir(), 'preppa-waitlist-supabase-guard-'));
  try {
    writeFileSync(join(directory, 'baseline-resources.json'), '{}');
    writeFileSync(join(directory, 'local-status.json'), JSON.stringify({ API_URL: 'https://not-local.example.invalid' }));
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Only the approved loopback API endpoint is permitted/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true });
  }
});
