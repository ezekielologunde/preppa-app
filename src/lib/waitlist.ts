import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from './supabase';

/**
 * Pre-launch waitlist signup. Uses a dedicated anonymous client (no session) so the insert
 * runs under the `anon` role exactly like the public landing page does, whether or not the
 * visitor is signed in. The `waitlist` table permits insert-only access for anon and
 * authenticated callers; this client deliberately always uses anon, with no read-back.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistResult = { ok: true } | { ok: false; reason: 'invalid_email' | 'failed' };

export async function joinWaitlist(email: string, zip?: string): Promise<WaitlistResult> {
  const e = email.trim();
  if (!EMAIL_RE.test(e) || e.length > 320) return { ok: false, reason: 'invalid_email' };
  try {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await anon.from('waitlist').insert({ email: e, zip: zip?.trim() || null, source: 'app' });
    // Email is case-insensitively unique. Rejoining has the same UI outcome, without
    // reading the list or overwriting the original signup's ZIP/source.
    return !error || error.code === '23505' ? { ok: true } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
