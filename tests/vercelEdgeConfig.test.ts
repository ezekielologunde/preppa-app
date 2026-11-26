import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

// DESIGN 1.9, SECURITY-SPEC section 3: the Vercel edge config and the post-export bundle scan.

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[]; has?: unknown[]; missing?: { type: string; value: string }[] };
type VercelConfig = {
  buildCommand: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: HeaderRule[];
};

const PRODUCTION_REF = 'fwidhpzwldneeaphrxgg';
const config: VercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
const rule = (source: string, filter: (r: HeaderRule) => boolean = (r) => !r.missing && !r.has) =>
  config.headers.find((r) => r.source === source && filter(r));
const header = (r: HeaderRule | undefined, key: string) =>
  r?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
const allHeaders = () => config.headers.flatMap((r) => r.headers);

test('buildCommand checks the env, exports, then scans the bundle, in that order', () => {
  assert.equal(
    config.buildCommand,
    'node scripts/check-vercel-env.mjs && expo export -p web && node scripts/scan-build-secrets.mjs',
  );
  assert.equal(config.outputDirectory, 'dist');
});

test('enforced non-CSP security headers apply to every path with the spec values', () => {
  const all = rule('/(.*)');
  assert.ok(all, 'expected a /(.*) header rule');
  assert.equal(header(all, 'Strict-Transport-Security'), 'max-age=63072000; includeSubDomains');
  assert.equal(header(all, 'X-Content-Type-Options'), 'nosniff');
  assert.equal(header(all, 'X-Frame-Options'), 'DENY');
  assert.equal(header(all, 'Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(header(all, 'Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert.equal(
    header(all, 'Permissions-Policy'),
    'camera=(self), microphone=(self), geolocation=(self), payment=(self "https://js.stripe.com"), usb=(), browsing-topics=()',
  );
});

test('CSP ships in Report-Only mode only; no rule enforces it', () => {
  assert.ok(header(rule('/(.*)'), 'Content-Security-Policy-Report-Only'));
  assert.deepEqual(allHeaders().filter((h) => h.key.toLowerCase() === 'content-security-policy'), []);
});

test('CSP carries the spec directives and no inline or eval script', () => {
  const csp = header(rule('/(.*)'), 'Content-Security-Policy-Report-Only') ?? '';
  const directives = new Map(
    csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const [name, ...values] = d.split(/\s+/);
      return [name, values] as const;
    }),
  );
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('script-src'), ["'self'", 'https://js.stripe.com', 'https://*.js.stripe.com']);
  assert.deepEqual(directives.get('style-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('base-uri'), ["'self'"]);
  assert.deepEqual(directives.get('form-action'), ["'self'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('frame-src'), ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com']);
  assert.deepEqual(directives.get('worker-src'), ["'self'", 'blob:']);
  assert.deepEqual(directives.get('font-src'), ["'self'", 'data:']);
  assert.ok(directives.has('upgrade-insecure-requests'));
  for (const host of ['https://api.stripe.com', 'https://stream.mux.com', 'https://*.mux.com',
    'https://nominatim.openstreetmap.org', 'https://api.bigdatacloud.net']) {
    assert.ok(directives.get('connect-src')?.includes(host), `connect-src must allow ${host}`);
  }
  assert.ok(directives.get('img-src')?.includes('https://image.mux.com'));
  assert.ok(directives.get('media-src')?.includes('https://stream.mux.com'));
  for (const name of ['img-src', 'media-src', 'connect-src']) {
    assert.ok(directives.get(name)?.some((v) => v.endsWith('.supabase.co')), `${name} must allow the Supabase project`);
  }
  assert.ok(directives.get('connect-src')?.some((v) => v.startsWith('wss://') && v.endsWith('.supabase.co')));
  assert.ok(!csp.includes('<ref>'), 'the spec placeholder must be replaced');
  assert.ok(!/'unsafe-eval'/.test(csp));
  assert.ok(!directives.get('script-src')?.includes("'unsafe-inline'"));
});

test('vercel.json carries no production project ref', () => {
  assert.ok(!readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8').includes(PRODUCTION_REF));
});

test('hosts other than app.preppa.live send X-Robots-Tag: noindex', () => {
  const robots = config.headers.find((r) => header(r, 'X-Robots-Tag'));
  assert.ok(robots, 'expected an X-Robots-Tag rule');
  assert.equal(header(robots, 'X-Robots-Tag'), 'noindex');
  assert.equal(robots.source, '/(.*)');
  assert.deepEqual(robots.missing, [{ type: 'host', value: 'app.preppa.live' }]);
  assert.equal(rule('/(.*)')?.headers.some((h) => h.key === 'X-Robots-Tag'), false);
});

test('cache headers: hashed Expo static assets are immutable, the HTML shell is not cached', () => {
  assert.equal(header(rule('/_expo/static/(.*)'), 'Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(header(rule('/'), 'Cache-Control'), 'no-cache');
});

test('the SPA rewrite is scoped: app routes go to /, assets and file paths do not', () => {
  assert.equal(config.rewrites.length, 1);
  const [rewrite] = config.rewrites;
  assert.equal(rewrite.destination, '/');
  assert.notEqual(rewrite.source, '/(.*)', 'must not be a catch-all');
  const pattern = new RegExp(`^${rewrite.source}$`);
  for (const path of ['/', '/meals', '/meals/123', '/kitchen/abc-def/edit', '/sign-in', '/v1.2/route/']) {
    assert.ok(pattern.test(path), `expected ${path} to rewrite to /`);
  }
  for (const path of ['/_expo/static/js/web/entry-abc123.js', '/_expo/missing', '/assets/logo.png',
    '/assets/anything', '/favicon.ico', '/missing.js', '/robots.txt', '/a/b/c.webp']) {
    assert.ok(!pattern.test(path), `expected ${path} to be served as a file or 404, not rewritten`);
  }
});

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'preppa-scan-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(resolve(process.cwd(), 'scripts/scan-build-secrets.mjs'), join(root, 'scripts', 'scan-build-secrets.mjs'));
    for (const [name, body] of Object.entries(files)) {
      const path = join(root, 'dist', name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, body);
    }
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'scan-build-secrets.mjs')], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('bundle scan: a clean export passes', () => {
  const result = scan({ 'index.html': '<html></html>', '_expo/static/js/web/entry.js': 'console.log(1)' });
  assert.equal(result.status, 0, result.output);
});

test('bundle scan: a shipped source map fails and names the file', () => {
  const result = scan({ 'index.html': '<html></html>', '_expo/static/js/web/entry.js.map': '{"version":3}' });
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /source map/);
  assert.match(result.output, /entry\.js\.map/);
});

test('bundle scan: a Stripe secret key fails without printing it', () => {
  const secret = ['sk', 'live', 'scanmarker123'].join('_');
  const result = scan({ '_expo/static/js/web/entry.js': `const k = "${secret}";` });
  assert.notEqual(result.status, 0, result.output);
  assert.ok(!result.output.includes(secret), result.output);
});
