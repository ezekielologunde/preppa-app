// Builds the static web export the suite serves, with fake local-only env values.
// Run from e2e/: `npm run build` (needs the app's node_modules at the repo root).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  CI: '1',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', // nothing listens here; every call is mocked
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  EXPO_PUBLIC_APP_ENV: 'test',
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  EXPO_PUBLIC_CONSENT_CHECKBOX: '0',
};
const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'e2e/.dist-cache'], { cwd: root, env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
