// DESIGN 1.5: supabase/config.toml versions the verify_jwt = false deployment setting and carries no
// production project ref.
//
// The verify_jwt column of supabase/functions/MANIFEST.md is the documented source: every function it marks
// **false** must have a [functions.<slug>] block with verify_jwt = false, no block may disable JWT checks for
// a function the manifest marks true, and every block must name an existing function directory. The
// production ref is read from an applied migration so this file never spells it out.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const CONFIG = join(ROOT, 'supabase', 'config.toml');
const MANIFEST = join(ROOT, 'supabase', 'functions', 'MANIFEST.md');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const ORIGINAL_MIGRATION = join(ROOT, 'supabase', 'migrations', '20260714065911_critical_fix_post_media_url_allowlist.sql');

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const prodMatch = read(ORIGINAL_MIGRATION).match(/https:\/\/([a-z0-9]{20})\.supabase\.co\//);
assert.ok(prodMatch, 'could not read the production ref from the applied allowlist migration');
const PROD_REF = prodMatch[1];

type Section = { name: string; keys: Map<string, string> };
function parseToml(text: string): { top: Map<string, string>; sections: Section[] } {
  const top = new Map<string, string>();
  const sections: Section[] = [];
  let current: Map<string, string> = top;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      const section: Section = { name: header[1].trim(), keys: new Map() };
      sections.push(section);
      current = section.keys;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    assert.ok(kv, `unparsed config.toml line: ${raw}`);
    assert.equal(current.has(kv[1]), false, `duplicate key ${kv[1]}`);
    current.set(kv[1], kv[2].trim());
  }
  return { top, sections };
}

function manifestRows(): Map<string, boolean> {
  const rows = new Map<string, boolean>();
  for (const line of read(MANIFEST).split('\n')) {
    const m = line.match(/^\|\s*([a-z0-9-]+)\s*\|\s*(\*\*false\*\*|true|false)\s*\|/);
    if (!m) continue;
    rows.set(m[1], m[2] === 'true');
  }
  return rows;
}

const config = () => parseToml(read(CONFIG));
const functionBlocks = () =>
  config().sections.filter((s) => s.name.startsWith('functions.')).map((s) => ({ slug: s.name.slice('functions.'.length), keys: s.keys }));

test('config.toml carries no production ref, and project_id is not a hosted project ref', () => {
  const text = read(CONFIG);
  assert.equal(text.includes(PROD_REF), false, 'production ref in supabase/config.toml');
  const projectId = config().top.get('project_id');
  if (projectId !== undefined) {
    assert.doesNotMatch(projectId, /^"[a-z0-9]{20}"$/, 'project_id looks like a hosted project ref');
  }
});

test('the manifest lists the verify_jwt=false functions', () => {
  const off = [...manifestRows()].filter(([, jwt]) => !jwt).map(([slug]) => slug);
  assert.ok(off.length > 0, 'no verify_jwt=false rows parsed from MANIFEST.md');
  assert.ok(off.includes('stripe-webhook'), 'MANIFEST.md parse lost stripe-webhook');
});

test('every verify_jwt=false function in MANIFEST.md has a [functions.*] block with verify_jwt = false', () => {
  const blocks = new Map(functionBlocks().map((b) => [b.slug, b.keys]));
  for (const [slug, jwt] of manifestRows()) {
    if (jwt) continue;
    const keys = blocks.get(slug);
    assert.ok(keys, `missing [functions.${slug}] in supabase/config.toml`);
    assert.equal(keys.get('verify_jwt'), 'false', `[functions.${slug}] must set verify_jwt = false`);
  }
});

test('no [functions.*] block disables JWT verification for a function MANIFEST.md marks true', () => {
  const rows = manifestRows();
  for (const { slug, keys } of functionBlocks()) {
    if (keys.get('verify_jwt') !== 'false') continue;
    assert.equal(rows.get(slug), false, `[functions.${slug}] sets verify_jwt = false but MANIFEST.md does not`);
  }
});

test('every [functions.*] block names an existing function directory', () => {
  const blocks = functionBlocks();
  assert.ok(blocks.length > 0, 'no [functions.*] blocks in supabase/config.toml');
  for (const { slug } of blocks) {
    const dir = join(FUNCTIONS_DIR, slug);
    assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `[functions.${slug}] has no supabase/functions/${slug}/`);
    assert.ok(existsSync(join(dir, 'index.ts')), `supabase/functions/${slug}/index.ts missing`);
  }
});
