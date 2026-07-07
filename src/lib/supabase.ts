import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase + Stripe connection for real (test-mode) card payments.
 * URL + anon key + Stripe publishable key are all PUBLIC by design.
 * The Stripe SECRET key lives only as a Supabase Edge Function secret — never here.
 */
export const SUPABASE_URL = 'https://fwidhpzwldneeaphrxgg.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3aWRocHp3bGRuZWVhcGhyeGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTk2ODMsImV4cCI6MjA5ODc5NTY4M30.KH8x-bMEq__ADEv47lqeqDM12B4hu6CkVhZQzbqsh2E';

export const STRIPE_PK =
  'pk_test_51TbwCHJP8OvIS2L3l7DC5FGiyKJ4AdivhkShTMqO71jQ7r1DHYRGa2bEFvEnxAiufrnqSdrsMoB1QfPYs0bXqjHd00lw0UZ41x';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { storage: AsyncStorage as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Seeded test customer (email+password so we get a real JWT without the anon-auth toggle).
const TEST_EMAIL = 'test-customer@preppa.local';
const TEST_PW = 'preppa-test-1234';

/** Ensure there's a signed-in Supabase user; sign in the seeded test customer if not. */
export async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PW });
  if (error) throw error;
  return signIn.session;
}

/** mock cook id -> seeded kitchen UUID */
export const KITCHEN_ID: Record<string, string> = {
  maria: 'bbbbbbbb-0000-4000-8000-000000000001',
  david: 'bbbbbbbb-0000-4000-8000-000000000002',
  amara: 'bbbbbbbb-0000-4000-8000-000000000003',
  denise: 'bbbbbbbb-0000-4000-8000-000000000004',
  lucia: 'bbbbbbbb-0000-4000-8000-000000000005',
  sana: 'bbbbbbbb-0000-4000-8000-000000000006',
};

/** mock meal / add-on key -> seeded meal UUID */
export const MEAL_ID: Record<string, string> = {
  lasagna: 'cccccccc-0000-4000-8000-000000000001',
  salmon: 'cccccccc-0000-4000-8000-000000000002',
  jollof: 'cccccccc-0000-4000-8000-000000000003',
  shortrib: 'cccccccc-0000-4000-8000-000000000004',
  tacos: 'cccccccc-0000-4000-8000-000000000005',
  biryani: 'cccccccc-0000-4000-8000-000000000006',
  poke: 'cccccccc-0000-4000-8000-000000000007',
  cornbread: 'cccccccc-0000-4000-8000-000000000008',
  lemonade: 'cccccccc-0000-4000-8000-000000000009',
};
