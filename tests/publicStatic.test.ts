import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// DESIGN 2.3: static head files in public/ (copied into dist/ by expo export).

const file = (rel: string) => resolve(process.cwd(), rel);
const read = (rel: string) => readFileSync(file(rel), 'utf8');
const ORIGIN = 'https://app.preppa.live';

const sitemapPaths = () => {
  const xml = read('public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0, 'sitemap.xml lists no URLs');
  return locs.map((loc) => {
    const url = new URL(loc);
    assert.equal(url.origin, ORIGIN, `${loc} must be on ${ORIGIN}`);
    assert.equal(url.search + url.hash, '', `${loc} must have no query or hash`);
    return url.pathname;
  });
};

test('robots.txt and sitemap.xml exist in public/', () => {
  assert.ok(existsSync(file('public/robots.txt')));
  assert.ok(existsSync(file('public/sitemap.xml')));
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/app\.preppa\.live\/sitemap\.xml$/m);
});

test('the sitemap lists only fixed routes that exist, and no per-entity URL', () => {
  const paths = sitemapPaths();
  assert.ok(paths.includes('/'));
  assert.ok(paths.includes('/discover'));
  assert.equal(new Set(paths).size, paths.length, 'duplicate sitemap entry');
  for (const path of paths) {
    assert.doesNotMatch(path, /^\/(meal|store|post|experience|plan|order|review|chat|request|rate-experience)(\/|$)/, `${path} is an entity URL`);
    if (path === '/') {
      assert.ok(existsSync(file('app/index.tsx')));
      continue;
    }
    // One segment, naming a static route file (dynamic routes are [param] files or folders).
    assert.match(path, /^\/[a-z][a-z0-9-]*$/, `${path} must be a single fixed segment`);
    const name = path.slice(1);
    assert.ok(
      existsSync(file(`app/${name}.tsx`)) || existsSync(file(`app/(tabs)/${name}.tsx`)),
      `${path} has no route file in app/ or app/(tabs)/`,
    );
  }
});

test('robots.txt and the noindex meta agree: both block before launch, and launch flips both', () => {
  const robots = read('public/robots.txt');
  const html = read('public/index.html');
  const disallowAll = /^Disallow: \/\s*$/m.test(robots);
  const noindexMeta = /<meta name="robots" content="noindex, nofollow" \/>/.test(html);
  assert.match(robots, /^User-agent: \*$/m);
  assert.equal(disallowAll, noindexMeta, 'robots.txt Disallow: / and the index.html noindex meta must change together');
  // Pre-launch state. Launch updates this line together with both files.
  assert.ok(disallowAll && noindexMeta, 'expected the pre-launch state: Disallow: / and the noindex meta');
});

const pngSize = (rel: string) => {
  const buf = readFileSync(file(rel));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${rel} is not a PNG`);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};

test('the web manifest is linked and lists 192 and 512 PNG icons that exist at those sizes', () => {
  assert.match(read('public/index.html'), /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.orientation, undefined, 'the web app must not be locked to an orientation');
  const sizes = manifest.icons.map((icon: { src: string; sizes: string; type: string }) => {
    assert.equal(icon.type, 'image/png');
    assert.match(icon.src, /^\/[a-z0-9-]+\.png$/);
    assert.equal(pngSize(`public${icon.src}`), icon.sizes, `${icon.src} is not ${icon.sizes}`);
    return icon.sizes;
  });
  assert.deepEqual(sizes.sort(), ['192x192', '512x512']);
});

test('the SPA rewrite serves these files as files, not as the app shell', () => {
  const config = JSON.parse(read('vercel.json'));
  const pattern = new RegExp(`^${config.rewrites[0].source}$`);
  for (const path of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']) {
    assert.ok(!pattern.test(path), `${path} must not rewrite to /`);
  }
});
