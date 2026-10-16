import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from './supabase';

/**
 * Pre-launch waitlist signup. Uses a dedicated anonymous client (no session) so the insert
 * runs under the `anon` role exactly like the public landing page does, whether or not the
 * visitor is signed in. The `waitlist` table accepts anonymous INSERT only (no read-back).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistResult = { ok: true } | { ok: false; reason: 'invalid_email' | 'failed' };

export async function joinWaitlist(email: string, zip?: string): Promise<WaitlistResult> {
  const e = email.trim();
  if (!EMAIL_RE.test(e) || e.length > 320) return { ok: false, reason: 'invalid_email' };
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await anon.from('waitlist').insert({ email: e, zip: zip?.trim() || null, source: 'app' });
  return error ? { ok: false, reason: 'failed' } : { ok: true };
}
