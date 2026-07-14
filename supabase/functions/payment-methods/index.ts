// deno-lint-ignore-file no-explicit-any
// Saved-card management for buyers: get/create a Stripe Customer for the signed-in
// user, and setup-intent / list / detach / set-default their cards. Every action is
// scoped to the caller's own Customer (JWT-derived); detach/default verify the PM
// actually belongs to that Customer before mutating.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  const existing = prof?.stripe_customer_id as string | null | undefined;
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

function cardShape(pm: any) {
  return { id: pm.id, brand: pm.card?.brand ?? 'card', last4: pm.card?.last4 ?? '', expMonth: pm.card?.exp_month ?? null, expYear: pm.card?.exp_year ?? null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;
    const email = userData.user.email ?? null;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    const customer = await getOrCreateCustomer(db, uid, email);

    if (action === 'setup-intent') {
      const si = await stripe.setupIntents.create({ customer, usage: 'off_session', automatic_payment_methods: { enabled: true } });
      return json(200, { clientSecret: si.client_secret });
    }

    if (action === 'list') {
      const list = await stripe.paymentMethods.list({ customer, type: 'card' });
      const cust = await stripe.customers.retrieve(customer) as any;
      const defaultId = cust?.invoice_settings?.default_payment_method ?? null;
      return json(200, { methods: list.data.map(cardShape), defaultId });
    }

    if (action === 'detach') {
      const pmId = String(body?.paymentMethodId ?? '');
      if (!pmId) return json(400, { error: 'missing paymentMethodId' });
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if ((pm as any).customer !== customer) return json(403, { error: 'not your card' });
      await stripe.paymentMethods.detach(pmId);
      return json(200, { ok: true });
    }

    if (action === 'default') {
      const pmId = String(body?.paymentMethodId ?? '');
      if (!pmId) return json(400, { error: 'missing paymentMethodId' });
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if ((pm as any).customer !== customer) return json(403, { error: 'not your card' });
      await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pmId } });
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown action' });
  } catch (_e) {
    return json(500, { error: 'Payment methods are temporarily unavailable. Please try again.' });
  }
});
