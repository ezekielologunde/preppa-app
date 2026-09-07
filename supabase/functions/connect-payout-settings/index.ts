// deno-lint-ignore-file no-explicit-any
// connect-payout-settings: lets a cook choose how often Stripe deposits their connected-
// account balance to their bank (Stripe's own payout leg — separate from and downstream of
// the platform's transfer into that balance via connect-payout/auto-payouts). 'manual' means
// the cook (or their bank's own timing) controls it entirely from the Stripe side; 'daily'/
// 'weekly' set an automatic schedule.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

const INTERVALS = new Set(['daily', 'weekly', 'manual']);
const WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'connect_payout_settings', p_max_count: 10, p_window: '10 minutes', p_subject: userId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    const interval = body?.interval;
    const weeklyAnchor = body?.weeklyAnchor;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });
    if (typeof interval !== 'string' || !INTERVALS.has(interval)) return json(400, { error: 'interval must be daily, weekly, or manual' });
    if (interval === 'weekly' && weeklyAnchor !== undefined && !WEEKDAYS.has(weeklyAnchor)) {
      return json(400, { error: 'invalid weeklyAnchor' });
    }

    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', kitchenId).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your kitchen' });

    const { data: acct } = await db.from('stripe_accounts').select('stripe_account_id').eq('kitchen_id', kitchenId).maybeSingle();
    if (!acct) return json(400, { error: 'Finish payout setup first.' });

    const schedule: any = interval === 'manual'
      ? { interval: 'manual' }
      : interval === 'daily'
        ? { interval: 'daily', delay_days: 2 }
        : { interval: 'weekly', delay_days: 2, weekly_anchor: weeklyAnchor ?? 'friday' };

    await stripe.accounts.update(acct.stripe_account_id, { settings: { payouts: { schedule } } });
    await db.from('stripe_accounts').update({ payout_interval: interval, updated_at: new Date().toISOString() }).eq('kitchen_id', kitchenId);

    return json(200, { ok: true, interval });
  } catch (e: any) {
    const isStripeError = typeof e?.type === 'string' && e.type.startsWith('Stripe');
    return json(500, { error: (isStripeError && e?.message) || 'Could not update payout schedule. Please try again.' });
  }
});
