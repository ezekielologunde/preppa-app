// Vercel build-time environment check (DESIGN 1.8, SECURITY-SPEC T8/S8).
// Runs before `expo export` in vercel.json buildCommand. Expo inlines EXPO_PUBLIC_* at build time
// and never sees VERCEL_ENV on web, so this is the only place the deploy target and the client
// config can be compared. Prints variable names and reasons only, never values.

const PRODUCTION_REF = 'fwidhpzwldneeaphrxgg';
const PRODUCTION_HOST = `${PRODUCTION_REF}.supabase.co`;

const read = (name) => (process.env[name] ?? '').trim();

const target = read('VERCEL_ENV');
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const anon = read('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const stripe = read('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
const appEnv = read('EXPO_PUBLIC_APP_ENV');

if (!target) {
  console.log('check-vercel-env: VERCEL_ENV is not set, treating this as a local build; no checks run');
  process.exit(0);
}

const failures = [];
const fail = (name, reason) => failures.push(`${name}: ${reason}`);
let label = target;

if (target === 'production') {
  // Production relies on the in-code fallbacks in src/lib/supabase.ts, so unset (or empty, which
  // the client treats the same through `||`) passes. Anything that is set must be production config.
  if (stripe.startsWith('pk_test_')) {
    fail('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'production build uses a Stripe test key (pk_test_)');
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
  if (stripe.startsWith('pk_live_')) {
    fail('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', `${target} build uses a live Stripe key (pk_live_)`);
  }
  if (url.toLowerCase().includes(PRODUCTION_REF)) {
    fail('EXPO_PUBLIC_SUPABASE_URL', `${target} build points at the production Supabase project ref`);
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
