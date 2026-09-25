import fs from 'node:fs';

const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const production = eas.build?.production?.env ?? {};
const failures = [];

for (const profile of ['development', 'preview']) {
  const env = eas.build?.[profile]?.env ?? {};
  if (env.EXPO_PUBLIC_APP_ENV !== profile) failures.push(`${profile} must set EXPO_PUBLIC_APP_ENV=${profile}`);
  if (env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_URL === production.EXPO_PUBLIC_SUPABASE_URL) {
    failures.push(`${profile} points at the production Supabase project`);
  }
  if (env.EXPO_PUBLIC_SUPABASE_ANON_KEY && env.EXPO_PUBLIC_SUPABASE_ANON_KEY === production.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    failures.push(`${profile} contains the production Supabase anon key`);
  }
  if ((env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_live_')) {
    failures.push(`${profile} contains a live Stripe publishable key`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Environment separation check passed');
