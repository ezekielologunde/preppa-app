// Vercel build-time environment check (DESIGN 1.8, SECURITY-SPEC T8/S8).
// Runs before `expo export` in vercel.json buildCommand. Expo inlines EXPO_PUBLIC_* at build time
// and never sees VERCEL_ENV on web, so this is the only place the deploy target and the client
// config can be compared. Prints variable names and reasons only, never values.

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

if (failures.length) {
  console.error(`check-vercel-env: FAIL (${label} build)`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-vercel-env: PASS (${label} build)`);
