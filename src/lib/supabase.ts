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

// ---- Real email-OTP auth (Phase 1) --------------------------------------
// Passwordless: request a 6-digit code, then verify it. `shouldCreateUser`
// unifies sign-in and sign-up (the `handle_new_user` trigger auto-creates the
// profile on first sign-in). NB: the Supabase project's email template must
// include `{{ .Token }}` so the user actually receives the numeric code.

/** Send a 6-digit login code to the email. Throws on failure (e.g. rate limit). */
export async function sendEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verify the emailed 6-digit code; establishes a real session on success. */
export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}

/** Sign the current user out of Supabase (clears the persisted session). */
export async function signOutUser() {
  try {
    await supabase.auth.signOut();
  } catch {
    // best-effort; local state is cleared by the caller regardless
  }
}

/** Currently signed-in Supabase user, or null. */
export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
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
