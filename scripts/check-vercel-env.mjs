// Vercel build-time environment check (DESIGN 1.8, SECURITY-SPEC T8/S8).
// Runs before `expo export` in vercel.json buildCommand. Expo inlines EXPO_PUBLIC_* at build time
// and never sees VERCEL_ENV on web, so this is the only place the deploy target and the client
// config can be compared. Prints variable names and reasons only, never values.
//
// Vercel project setting: "Automatically expose System Environment Variables" must stay ON.
// It is what sets VERCEL, VERCEL_ENV and VERCEL_URL at build time. With it OFF a real Vercel build
// looks like a local build (CI alone does not count) and this script runs no checks at all.

const PRODUCTION_REF = 'fwidhpzwldneeaphrxgg';
const PRODUCTION_HOST = `${PRODUCTION_REF}.supabase.co`;
const CLIENT_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_APP_ENV',
];
// Any of these marks a Vercel build (Vercel builders set VERCEL=1 and VERCEL_URL, with CI=1).
const VERCEL_SIGNALS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL'];

const raw = (name) => process.env[name] ?? '';
const read = (name) => raw(name).trim();
const isPresent = (name) => raw(name) !== '';

const target = read('VERCEL_ENV');
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const anon = read('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const stripe = read('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
const appEnv = read('EXPO_PUBLIC_APP_ENV');

const failures = [];
const fail = (name, reason) => failures.push(`${name}: ${reason}`);
let label = target;

// Expo inlines the raw value, not the trimmed one this script validates, so any padding on a
// value with real content would reach the client unchecked.
const checkRawValues = () => {
  for (const name of CLIENT_VARS) {
    if (read(name) && raw(name) !== read(name)) {
      fail(name, 'has leading or trailing whitespace or a newline, which the client would inline');
    }
  }
};

// Decodes the payload of a JWT-shaped anon key without any network or library. Returns null when
// the value is not JWT-shaped (new-style publishable keys are left alone), otherwise
// { ok: false } when the payload is not a JSON object, or { ok: true, ref } (ref may be undefined).
const decodeAnonRef = (value) => {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false };
    return { ok: true, ref: payload.ref };
  } catch {
    return { ok: false };
  }
};

if (!target) {
  const signals = VERCEL_SIGNALS.filter(isPresent);
  if (signals.length === 0) {
    console.log('check-vercel-env: VERCEL, VERCEL_ENV and VERCEL_URL are not set, treating this as a local build; no checks run');
    process.exit(0);
  }
  // Fail closed: a Vercel builder without a usable VERCEL_ENV must not skip the checks.
  label = 'unknown Vercel';
  fail('VERCEL_ENV', `missing or blank while ${signals.join(', ')} ${signals.length === 1 ? 'is' : 'are'} set; cannot tell which environment this Vercel build targets`);
} else if (target === 'production') {
  // Production relies on the in-code fallbacks in src/lib/supabase.ts, so unset or empty passes
  // (`||` falls back on ''). A whitespace-only value does not fall back: the client would use it.
  for (const name of CLIENT_VARS) {
    if (isPresent(name) && !read(name)) {
      fail(name, 'production build has a whitespace-only value, which the client would use instead of the production fallback');
    }
  }
  checkRawValues();
  if (anon) {
    const decoded = decodeAnonRef(anon);
    if (decoded && !decoded.ok) {
      fail('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'production build has a JWT-shaped anon key whose payload does not decode to JSON');
    } else if (decoded && decoded.ref !== undefined && decoded.ref !== PRODUCTION_REF) {
      fail('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'production build has an anon key for a different Supabase project ref');
    }
  }
  if (stripe && !stripe.startsWith('pk_live_')) {
    fail('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'production build requires a live publishable key (pk_live_)');
  }
  if (url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { /* not a URL: host stays empty */ }
    if (host !== PRODUCTION_HOST) {
      fail('EXPO_PUBLIC_SUPABASE_URL', 'production build does not point at the production Supabase project ref');
    }
  }
  if (appEnv === 'preview') {
    fail('EXPO_PUBLIC_APP_ENV', 'production build is marked as preview');
  }
} else if (target === 'preview' || target === 'development') {
  // Non-production builds have no fallbacks: missing config throws at load or silently misbehaves,
  // and any production value would let a test client touch live data or live money.
  for (const [name, value] of [
    ['EXPO_PUBLIC_SUPABASE_URL', url],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', anon],
    ['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', stripe],
  ]) {
    if (!value) fail(name, `${target} build requires an isolated value and it is missing or empty`);
  }
  checkRawValues();
  if (anon && decodeAnonRef(anon)?.ref === PRODUCTION_REF) {
    fail('EXPO_PUBLIC_SUPABASE_ANON_KEY', `${target} build has an anon key for the production Supabase project ref`);
  }
  if (stripe && !stripe.startsWith('pk_test_')) {
    fail('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', `${target} build requires a test publishable key (pk_test_)`);
  }
  if (url) {
    // The client hands the URL to `new URL`, which percent-decodes and IDNA-maps the host, so the
    // decoded host is checked as well as the raw string.
    let host = null;
    try { host = new URL(url).hostname.toLowerCase(); } catch { /* not a URL: host stays null */ }
    if (url.toLowerCase().includes(PRODUCTION_REF)
      || (host !== null && (host === PRODUCTION_HOST || host.includes(PRODUCTION_REF)))) {
      fail('EXPO_PUBLIC_SUPABASE_URL', `${target} build points at the production Supabase project ref`);
    } else if (host === null) {
      fail('EXPO_PUBLIC_SUPABASE_URL', `${target} build has a Supabase URL that does not parse as a URL`);
    }
  }
  if (appEnv === 'production') {
    fail('EXPO_PUBLIC_APP_ENV', `${target} build is marked as production`);
  }
} else {
  label = 'unrecognised';
  fail('VERCEL_ENV', 'unrecognised value; expected production, preview or development');
}

// EXPO_PUBLIC_SITE_URL (DESIGN 2.12) is the origin share links use. The client falls back to
// production for any value src/lib/siteOrigin.ts rejects, so a set but rejected value would quietly
// send every share from this build to production; fail the build instead. Unset or empty passes
// (the fallback is intended there). SITE_HOSTS and siteOrigin() are a copy of SITE_HOSTS and
// parseSiteOrigin() in src/lib/siteOrigin.ts; tests/shareSite.test.ts fails if they drift.
const SITE_VAR = 'EXPO_PUBLIC_SITE_URL';
const SITE_HOSTS = ['app.preppa.live', 'staging.preppa.live', 'localhost', '127.0.0.1'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
const siteOrigin = (value) => {
  if (value === '' || value !== value.trim()) return null;
  let site;
  try { site = new URL(value); } catch { return null; }
  const local = LOCAL_HOSTS.includes(site.hostname);
  if (!SITE_HOSTS.includes(site.hostname)) return null;
  if (site.protocol !== 'https:' && !(site.protocol === 'http:' && local)) return null;
  if (site.username !== '' || site.password !== '') return null;
  if (site.pathname !== '/' || site.search !== '' || site.hash !== '') return null;
  if (site.port !== '' && !local) return null;
  return site.origin;
};
if (isPresent(SITE_VAR) && siteOrigin(raw(SITE_VAR)) === null) {
  fail(SITE_VAR, 'is set but is not an allowed share origin (https on app.preppa.live or staging.preppa.live, '
    + 'or http or https on localhost or 127.0.0.1, with no path, query, credentials, padding or other port); '
    + 'the client would fall back to production');
}

if (failures.length) {
  console.error(`check-vercel-env: FAIL (${label} build)`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-vercel-env: PASS (${label} build)`);
